// server/src/routes/artworks.routes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

const db = require("../services/db");
const { uploadToIPFS } = require("../services/ipfs");
const { uploadDir } = require("../middleware/upload");

const router = express.Router();

/* ------------------------------------------------------------------ */
/* Ensure upload directory exists + multer setup                       */
/* ------------------------------------------------------------------ */
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
    const base = `art_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, base);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    if ((file.mimetype || "").toLowerCase().startsWith("image/")) return cb(null, true);
    cb(new Error("Only image uploads are allowed"));
  },
});

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
function parseJsonArray(s) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function mapArtworkRow(row) {
  if (!row) return null;
  return {
    ...row,
    image_url: row.image_file ? `/uploads/${row.image_file}` : null,
    // parsed arrays (if they were selected in the query)
    tags: row.tags_json ? parseJsonArray(row.tags_json) : undefined,
    materials: row.materials_json ? parseJsonArray(row.materials_json) : undefined,
    techniques: row.techniques_json ? parseJsonArray(row.techniques_json) : undefined,
    physical: typeof row.physical === "number" ? !!row.physical : row.physical,
  };
}

function toGateway(cid) {
  if (!cid) return null;
  const c = String(cid).replace(/^ipfs:\/\//i, "");
  return `https://gateway.pinata.cloud/ipfs/${c}`;
}

/* ------------------------------------------------------------------ */
/* NEW: Safe “similarity” check (exact duplicate by hash)             */
/* ------------------------------------------------------------------ */
/**
 * POST /api/similar
 * form-data: artwork: <image>
 * Returns { ok:true, results:[{ id,title,user_id,username,image_url,ipfs_cid }] }
 * Never throws to the client — on any failure returns ok:true, results:[]
 */
router.post("/api/similar", upload.single("artwork"), async (req, res) => {
  try {
    if (!req.file) return res.json({ ok: true, results: [] });

    const buf = await fs.promises.readFile(req.file.path);
    const digest = sha256(buf);

    db.all(
      `SELECT a.id, a.title, a.user_id, a.image_file, a.ipfs_cid, u.username
         FROM artwork a JOIN user u ON u.id = a.user_id
        WHERE a.content_hash = ?
        ORDER BY a.id DESC
        LIMIT 12`,
      [digest],
      (_e, rows) => {
        // Even if db errors, we keep UX smooth with an empty result set
        const base = `${req.protocol}://${req.get("host")}`;
        const results = (rows || []).map((r) => ({
          id: r.id,
          title: r.title,
          user_id: r.user_id,
          username: r.username,
          ipfs_cid: r.ipfs_cid || null,
          image_url: r.image_file ? `${base}/uploads/${r.image_file}` : null,
        }));
        res.json({ ok: true, results });
      }
    );
  } catch {
    // Never 5xx here — the client UI prefers “no matches yet” over an error
    res.json({ ok: true, results: [] });
  } finally {
    // best-effort: remove the temp file we just wrote for hashing
    if (req?.file?.path) fs.unlink(req.file.path, () => {});
  }
});

/* ------------------------------------------------------------------ */
/* NEW: Upload (Step-1 “continue”)                                    */
/* ------------------------------------------------------------------ */
/**
 * POST /upload   (note: no /api prefix — matches your client code)
 * form-data: artwork: <image>, title?: string, description?: string
 * Requires session. Saves image, hashes content, inserts DB row, tries IPFS.
 */
router.post("/upload", upload.single("artwork"), async (req, res) => {
  try {
    const me = req.session?.userId;
    if (!me) {
      // Client explicitly checks for 401 to show “log in”
      if (req?.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(401).json({ ok: false, error: "Not logged in" });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const fileName = path.basename(filePath);

    const buf = await fs.promises.readFile(filePath);
    const digest = sha256(buf);

    const title = String(req.body?.title || "Untitled").trim().slice(0, 200);
    const description = String(req.body?.description || "").trim();

    // Insert row
    db.run(
      `INSERT INTO artwork
        (user_id, title, description, image_file, content_hash, published)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [me, title, description, fileName, digest],
      async function (err) {
        if (err) {
          // Most common: NOT NULL constraint on user_id when session missing.
          // Clean up the saved file to avoid orphans.
          fs.unlink(filePath, () => {});
          // Surface a clearer error for your UI
          const msg = /NOT NULL.*user_id/i.test(err.message)
            ? "Not logged in"
            : err.message || "DB insert failed";
          const code = /Not logged in/i.test(msg) ? 401 : 500;
          return res.status(code).json({ ok: false, error: msg });
        }

        const id = this.lastID;
        let ipfs_cid = null;

        // Best-effort IPFS upload; failure should not block the UX
        try {
          const { cid } = await uploadToIPFS(buf, fileName, undefined);
          if (cid) {
            ipfs_cid = cid;
            db.run(`UPDATE artwork SET ipfs_cid = ? WHERE id = ?`, [cid, id], () => {});
          }
        } catch {
          // ignore — user can retry pinning later
        }

        const base = `${req.protocol}://${req.get("host")}`;
        res.json({
          ok: true,
          id,
          image_file: fileName,
          image_url: `${base}/uploads/${fileName}`,
          sha256: digest,
          ipfs_cid,
        });
      }
    );
  } catch (e) {
    // If something blew up after multer wrote a file, try to remove it
    if (req?.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ ok: false, error: e.message || "server_error" });
  }
});

/* ------------------------------------------------------------------ */
/* Search (basic)                                                     */
/* ------------------------------------------------------------------ */
router.get("/api/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  let limit = Math.max(1, Math.min(30, parseInt(req.query.limit || "12", 10) || 12));
  if (q.length < 2) return res.json({ ok: true, users: [], artworks: [] });

  const like = `%${q}%`;
  const out = { users: [], artworks: [] };

  db.all(
    `SELECT id, username FROM user
     WHERE username LIKE ?
     ORDER BY username COLLATE NOCASE ASC
     LIMIT ?`,
    [like, limit],
    (e1, users) => {
      if (e1) return res.status(500).json({ ok: false, error: e1.message });
      out.users = users || [];

      db.all(
        `SELECT a.id, a.title, a.image_file, a.user_id, u.username
           FROM artwork a
           JOIN user u ON u.id = a.user_id
          WHERE a.title LIKE ? OR (a.description IS NOT NULL AND a.description LIKE ?)
          ORDER BY a.id DESC
          LIMIT ?`,
        [like, like, limit],
        (e2, arts) => {
          if (e2) return res.status(500).json({ ok: false, error: e2.message });
          out.artworks = arts || [];
          res.json({ ok: true, ...out });
        }
      );
    }
  );
});

/* ------------------------------------------------------------------ */
/* Retry IPFS                                                         */
/* ------------------------------------------------------------------ */
router.post("/api/retry-ipfs/:id", async (req, res) => {
  const { id } = req.params;
  db.get(`SELECT id, image_file FROM artwork WHERE id = ?`, [id], async (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (!row) return res.status(404).json({ ok: false, error: "Artwork not found" });

    try {
      const filePath = path.join(uploadDir, row.image_file);
      const data = await fs.promises.readFile(filePath);
      const { cid, provider } = await uploadToIPFS(data, row.image_file, undefined);
      if (!cid) return res.status(502).json({ ok: false, error: "All IPFS providers failed" });

      db.run(`UPDATE artwork SET ipfs_cid = ? WHERE id = ?`, [cid, id], function (err2) {
        if (err2) return res.status(500).json({ ok: false, error: err2.message });
        res.json({ ok: true, id, ipfs_cid: cid, ipfs_provider: provider });
      });
    } catch (e2) {
      res.status(500).json({ ok: false, error: e2.message });
    }
  });
});

/* ------------------------------------------------------------------ */
/* Artworks list                                                      */
/* ------------------------------------------------------------------ */
router.get("/api/artworks", (_req, res) => {
  db.all(
    `SELECT a.*, u.username
       FROM artwork a
       JOIN user u ON a.user_id = u.id
      ORDER BY a.date_created DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ artworks: rows.map(mapArtworkRow) });
    }
  );
});

/* ------------------------------------------------------------------ */
/* Single artwork (light, includes Step-2 fields)                     */
/* ------------------------------------------------------------------ */
router.get("/api/artwork/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "invalid id" });

  db.get(
    `SELECT a.id, a.title, a.description, a.image_file, a.ipfs_cid, a.metadata_cid,
            a.token_id, a.tx_hash, a.published, a.published_at, a.user_id,
            a.price, a.currency, a.edition, a.edition_size,
            -- step-2 fields:
            a.category, a.medium, a.dimensions, a.year, a.series, a.physical,
            a.location, a.weight, a.inspiration, a.tags_json, a.materials_json, a.techniques_json,
            u.username
       FROM artwork a
       JOIN user u ON u.id = a.user_id
      WHERE a.id = ?`,
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      if (!row) return res.status(404).json({ ok: false, error: "Not found" });
      res.json({ ok: true, artwork: mapArtworkRow(row) });
    }
  );
});

/* ------------------------------------------------------------------ */
/* Full details + user flags                                          */
/* ------------------------------------------------------------------ */
router.get("/api/artwork/:id/full", (req, res) => {
  const { id } = req.params;
  const me = req.session?.userId || 0;

  db.get(
    `SELECT a.*, u.username
       FROM artwork a JOIN user u ON a.user_id = u.id
      WHERE a.id = ?`,
    [id],
    (err, art) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      if (!art) return res.status(404).json({ ok: false, error: "Not found" });

      const out = {
        artwork: mapArtworkRow(art),
        user_flags: {
          liked: false,
          bookmarked: false,
          is_owner: Number(art.user_id) === Number(me),
        },
      };

      db.get(`SELECT COUNT(*) AS c FROM art_like WHERE artwork_id = ?`, [id], (e1, r1) => {
        out.artwork.likes_count = r1 ? r1.c : 0;

        db.get(`SELECT COUNT(*) AS c FROM art_bookmark WHERE artwork_id = ?`, [id], (e2, r2) => {
          out.artwork.bookmarks_count = r2 ? r2.c : 0;

          const loadComments = () => {
            db.all(
              `SELECT c.id, c.body, c.created_at, c.user_id, u.username
                 FROM art_comment c JOIN user u ON c.user_id = u.id
                WHERE c.artwork_id = ?
                ORDER BY c.created_at ASC`,
              [id],
              (e5, comments) => {
                if (e5) return res.status(500).json({ ok: false, error: e5.message });
                out.comments = comments || [];
                res.json({ ok: true, ...out });
              }
            );
          };

          if (me) {
            db.get(
              `SELECT 1 AS yes FROM art_like WHERE artwork_id = ? AND user_id = ?`,
              [id, me],
              (e3, r3) => {
                out.user_flags.liked = !!r3;
                db.get(
                  `SELECT 1 AS yes FROM art_bookmark WHERE artwork_id = ? AND user_id = ?`,
                  [id, me],
                  (e4, r4) => {
                    out.user_flags.bookmarked = !!r4;
                    loadComments();
                  }
                );
              }
            );
          } else {
            loadComments();
          }
        });
      });
    }
  );
});

/* ------------------------------------------------------------------ */
/* User + followers lists                                             */
/* ------------------------------------------------------------------ */
router.get("/api/user/:id", (req, res) => {
  const { id } = req.params;

  const sendUserAndArtworks = (userRow) => {
    db.all(
      `SELECT id, title, image_file, date_created, content_hash, description, ipfs_cid, metadata_cid,
              price, currency, edition, edition_size, published, published_at
         FROM artwork WHERE user_id = ?
         ORDER BY date_created DESC`,
      [id],
      (err2, artworks) => {
        if (err2) return res.status(500).json({ error: err2.message });

        db.get(
          `SELECT
             (SELECT COUNT(*) FROM follower WHERE following_id = ?) AS followers,
             (SELECT COUNT(*) FROM follower WHERE follower_id = ?) AS following`,
          [id, id],
          (err3, stats) => {
            if (err3) return res.status(500).json({ error: err3.message });

            const viewer = req.session?.userId;
            if (viewer && Number(viewer) !== Number(id)) {
              db.get(
                `SELECT 1 FROM follower WHERE follower_id = ? AND following_id = ?`,
                [viewer, id],
                (e4, row4) => {
                  if (e4) return res.status(500).json({ error: e4.message });
                  res.json({ user: userRow, artworks, stats, is_following: !!row4 });
                }
              );
            } else {
              res.json({ user: userRow, artworks, stats, is_following: false });
            }
          }
        );
      }
    );
  };

  db.get(
    `SELECT id, username, email, bio, avatar_file FROM user WHERE id = ?`,
    [id],
    (err, userRow) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!userRow) return res.status(404).json({ error: "User not found" });
      sendUserAndArtworks(userRow);
    }
  );
});

router.get("/api/user/:id/followers", (req, res) => {
  const { id } = req.params;
  db.all(
    `SELECT u.id, u.username, u.avatar_file
       FROM follower f
       JOIN user u ON u.id = f.follower_id
      WHERE f.following_id = ?
      ORDER BY u.username COLLATE NOCASE ASC`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, users: rows || [] });
    }
  );
});

router.get("/api/user/:id/following", (req, res) => {
  const { id } = req.params;
  db.all(
    `SELECT u.id, u.username, u.avatar_file
       FROM follower f
       JOIN user u ON u.id = f.following_id
      WHERE f.follower_id = ?
      ORDER BY u.username COLLATE NOCASE ASC`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, users: rows || [] });
    }
  );
});

/* ------------------------------------------------------------------ */
/* Feed (cursor + legacy offset)                                      */
/* ------------------------------------------------------------------ */
router.get("/api/feed", (req, res) => {
  let limit = parseInt(req.query.limit, 10);
  if (Number.isNaN(limit)) limit = 12;
  limit = Math.max(1, Math.min(100, limit));

  const cursor = parseInt(req.query.cursor, 10);
  const hasCursor = !Number.isNaN(cursor);
  const followingOnly = req.query.following === "1";

  const useLegacy = typeof req.query.offset !== "undefined" || typeof req.query.includeMe !== "undefined";
  const offset = Math.max(0, parseInt(req.query.offset || "0", 10) || 0);
  const includeMe = String(req.query.includeMe || "0") === "1";

  const params = [];
  const where = [];

  let sql = `
    SELECT a.id, a.user_id, a.title, a.description, a.image_file, a.ipfs_cid, a.date_created,
           a.price, a.currency, a.edition, a.edition_size, a.published, a.published_at,
           u.username
      FROM artwork a
      JOIN user u ON u.id = a.user_id
  `;

  if (followingOnly || useLegacy) {
    const me = req.session?.userId;
    if (!me) return res.status(401).json({ ok: false, error: "Not logged in" });
    sql += ` LEFT JOIN follower f ON f.following_id = a.user_id `;
    let cond = `(f.follower_id = ?)`;
    params.push(me);
    if (useLegacy && includeMe) {
      cond = `(${cond} OR a.user_id = ?)`;
      params.push(me);
    }
    where.push(cond);
  } else if (useLegacy && includeMe) {
    const me = req.session?.userId;
    if (!me) return res.status(401).json({ ok: false, error: "Not logged in" });
    where.push(`a.user_id = ?`);
    params.push(me);
  }

  if (hasCursor) {
    where.push(`a.id < ?`);
    params.push(cursor);
  }

  if (where.length) {
    sql += ` WHERE ${where.join(" AND ")} `;
  }

  sql += ` ORDER BY a.id DESC `;

  if (useLegacy) {
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
  } else {
    sql += ` LIMIT ?`;
    params.push(limit);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    const items = (rows || []).map(mapArtworkRow);
    const nextCursor = (!useLegacy && items.length === limit) ? items[items.length - 1].id : null;
    res.json({ ok: true, items, artworks: items, nextCursor });
  });
});

/* ------------------------------------------------------------------ */
/* Like / bookmark / comment                                          */
/* ------------------------------------------------------------------ */
router.post("/api/artwork/:id/like", (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ ok: false, error: "Not logged in" });
  const { id } = req.params;
  const me = req.session.userId;
  const now = new Date().toISOString();

  db.get(`SELECT 1 AS yes FROM art_like WHERE artwork_id = ? AND user_id = ?`, [id, me], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });

    const finish = () => {
      db.get(`SELECT COUNT(*) AS c FROM art_like WHERE artwork_id = ?`, [id], (e2, r2) => {
        res.json({ ok: true, liked: !row, likes_count: r2 ? r2.c : 0 });
      });
    };

    if (row) {
      db.run(`DELETE FROM art_like WHERE artwork_id = ? AND user_id = ?`, [id, me], (e) => {
        if (e) return res.status(500).json({ ok: false, error: e.message });
        finish();
      });
    } else {
      db.run(`INSERT INTO art_like(artwork_id, user_id, created_at) VALUES(?,?,?)`, [id, me, now], (e) => {
        if (e) return res.status(500).json({ ok: false, error: e.message });
        finish();
      });
    }
  });
});

router.post("/api/artwork/:id/bookmark", (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ ok: false, error: "Not logged in" });
  const { id } = req.params;
  const me = req.session.userId;
  const now = new Date().toISOString();

  db.get(`SELECT 1 AS yes FROM art_bookmark WHERE artwork_id = ? AND user_id = ?`, [id, me], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    const finish = (bookmarked) => res.json({ ok: true, bookmarked });

    if (row) {
      db.run(`DELETE FROM art_bookmark WHERE artwork_id = ? AND user_id = ?`, [id, me], (e) => {
        if (e) return res.status(500).json({ ok: false, error: e.message });
        finish(false);
      });
    } else {
      db.run(`INSERT INTO art_bookmark(artwork_id, user_id, created_at) VALUES(?,?,?)`, [id, me, now], (e) => {
        if (e) return res.status(500).json({ ok: false, error: e.message });
        finish(true);
      });
    }
  });
});

router.post("/api/artwork/:id/comment", (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ ok: false, error: "Not logged in" });
  const { id } = req.params;
  let { body } = req.body || {};
  body = String(body || "").trim();
  if (!body) return res.status(400).json({ ok: false, error: "Empty comment" });
  if (body.length > 500) return res.status(400).json({ ok: false, error: "Max 500 chars" });

  const now = new Date().toISOString();
  const me = req.session.userId;

  db.run(
    `INSERT INTO art_comment(artwork_id, user_id, body, created_at) VALUES(?,?,?,?)`,
    [id, me, body, now],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      db.get(
        `SELECT c.id, c.body, c.created_at, c.user_id, u.username
           FROM art_comment c JOIN user u ON c.user_id = u.id
          WHERE c.id = ?`,
        [this.lastID],
        (e2, row) => {
          if (e2) return res.status(500).json({ ok: false, error: e2.message });
          res.json({ ok: true, comment: row });
        }
      );
    }
  );
});

/* ------------------------------------------------------------------ */
/* Owner edits (Step-2 fields) & delete                               */
/* ------------------------------------------------------------------ */
router.patch("/api/artwork/:id", (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ ok: false, error: "Not logged in" });
  const { id } = req.params;

  db.get(`SELECT user_id FROM artwork WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (!row) return res.status(404).json({ ok: false, error: "Not found" });
    if (Number(row.user_id) !== Number(req.session.userId)) {
      return res.status(403).json({ ok: false, error: "Not owner" });
    }

    // sanitize inputs
    const cleanStr = (v) => {
      if (v === null) return null;
      if (typeof v === "undefined") return undefined;
      const s = String(v).trim();
      return s.length ? s : null;
    };
    const cleanInt = (v) => {
      if (v === null || typeof v === "undefined" || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    };
    const cleanBool = (v) => (v ? 1 : 0);
    const cleanArr = (arr) => {
      if (!Array.isArray(arr)) return undefined;
      const out = Array.from(
        new Set(
          arr
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .slice(0, 100)
        )
      );
      return JSON.stringify(out);
    };

    // Accept both legacy (title/description) and Step-2 fields
    const {
      title,
      description,
      category,
      medium,
      dimensions,
      year,
      series,
      physical,
      location,
      weight,
      inspiration,
      tags,
      materials,
      techniques,
    } = req.body || {};

    const updates = [];
    const params = [];

    const set = (col, val) => {
      if (typeof val === "undefined") return; // skip if not provided
      updates.push(`${col} = ?`);
      params.push(val);
    };

    // strings
    set("title", cleanStr(title));
    set("description", cleanStr(description));
    set("category", cleanStr(category));
    set("medium", cleanStr(medium));
    set("dimensions", cleanStr(dimensions));
    set("series", cleanStr(series));
    set("location", cleanStr(location));
    set("weight", cleanStr(weight));
    set("inspiration", cleanStr(inspiration));

    // numbers / flags
    set("year", cleanInt(year));
    if (typeof physical !== "undefined") set("physical", cleanBool(!!physical));

    // arrays -> JSON
    const tagsJson = cleanArr(tags);
    if (typeof tagsJson !== "undefined") set("tags_json", tagsJson);
    const matsJson = cleanArr(materials);
    if (typeof matsJson !== "undefined") set("materials_json", matsJson);
    const techsJson = cleanArr(techniques);
    if (typeof techsJson !== "undefined") set("techniques_json", techsJson);

    if (updates.length === 0) {
      return res.json({ ok: true, changed: 0 });
    }

    db.run(
      `UPDATE artwork SET ${updates.join(", ")} WHERE id = ?`,
      [...params, id],
      (e2) => {
        if (e2) return res.status(500).json({ ok: false, error: e2.message });
        res.json({ ok: true, changed: updates.length });
      }
    );
  });
});

router.delete("/api/artwork/:id", (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ ok: false, error: "Not logged in" });
  const { id } = req.params;

  db.get(`SELECT user_id, image_file FROM artwork WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (!row) return res.status(404).json({ ok: false, error: "Not found" });
    if (Number(row.user_id) !== Number(req.session.userId)) return res.status(403).json({ ok: false, error: "Not owner" });

    const filePath = path.join(uploadDir, row.image_file);

    db.run(`DELETE FROM art_like WHERE artwork_id = ?`, [id], () => {
      db.run(`DELETE FROM art_bookmark WHERE artwork_id = ?`, [id], () => {
        db.run(`DELETE FROM art_comment WHERE artwork_id = ?`, [id], () => {
          db.run(`DELETE FROM artwork WHERE id = ?`, [id], (e4) => {
            if (e4) return res.status(500).json({ ok: false, error: e4.message });
            fs.unlink(filePath, () => {}); // best-effort
            res.json({ ok: true });
          });
        });
      });
    });
  });
});

/* ------------------------------------------------------------------ */
/* On-chain link                                                      */
/* ------------------------------------------------------------------ */
router.post("/api/artwork/:id/onchain", (req, res) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ error: "not_authenticated" });

    const artworkId = Number(req.params.id);
    const { tokenId, txHash } = req.body || {};
    if (!Number.isFinite(artworkId) || !txHash) return res.status(400).json({ error: "bad_input" });

    db.get("SELECT user_id FROM artwork WHERE id = ?", [artworkId], (err, row) => {
      if (err) return res.status(500).json({ error: "db_error" });
      if (!row) return res.status(404).json({ error: "not_found" });

      const me = Number(req.session.userId);
      if (Number(row.user_id) !== me) return res.status(403).json({ error: "forbidden" });

      db.run(
        "UPDATE artwork SET token_id = ?, tx_hash = ? WHERE id = ?",
        [tokenId || null, String(txHash), artworkId],
        (e2) => {
          if (e2) return res.status(500).json({ error: "db_error" });
          res.json({ ok: true, token_id: tokenId || null, tx_hash: String(txHash) });
        }
      );
    });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

/* ------------------------------------------------------------------ */
/* Pricing (owner only)                                               */
/* ------------------------------------------------------------------ */
router.patch("/api/artwork/:id/pricing", (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ ok:false, error:"Not logged in" });

  const { id } = req.params;
  let { price, currency, edition, editionSize } = req.body || {};
  const me = Number(req.session.userId);

  price = (price === null || price === undefined) ? null : Number(price);
  if (price !== null && !Number.isFinite(price)) return res.status(400).json({ ok:false, error:"Invalid price" });

  currency = (currency || "USD").toUpperCase();
  edition = (edition || "single").toLowerCase();            // 'single' | 'limited' | 'open'
  const edition_size = edition === "limited" ? Number(editionSize || 1) : null;
  if (edition === "limited" && (!Number.isFinite(edition_size) || edition_size < 1)) {
    return res.status(400).json({ ok:false, error:"Invalid edition size" });
  }

  db.get(`SELECT user_id FROM artwork WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ ok:false, error: err.message });
    if (!row) return res.status(404).json({ ok:false, error:"Not found" });
    if (Number(row.user_id) !== me) return res.status(403).json({ ok:false, error:"Not owner" });

    db.run(
      `UPDATE artwork
          SET price = ?, currency = ?, edition = ?, edition_size = ?
        WHERE id = ?`,
      [price, currency, edition, edition_size, id],
      (e2) => {
        if (e2) return res.status(500).json({ ok:false, error: e2.message });
        res.json({ ok:true, price, currency, edition, edition_size });
      }
    );
  });
});

/* ------------------------------------------------------------------ */
/* Publish toggle                                                     */
/* ------------------------------------------------------------------ */
router.patch("/api/artwork/:id/publish", (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ ok: false, error: "Not logged in" });
  const { id } = req.params;

  db.get(`SELECT user_id, published, published_at FROM artwork WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (!row) return res.status(404).json({ ok: false, error: "Not found" });
    if (Number(row.user_id) !== Number(req.session.userId)) {
      return res.status(403).json({ ok: false, error: "Not owner" });
    }
    if (row.published) return res.json({ ok: true, published: 1, published_at: row.published_at || null });

    const now = new Date().toISOString();
    db.run(
      `UPDATE artwork SET published = 1, published_at = ? WHERE id = ?`,
      [now, id],
      (e2) => {
        if (e2) return res.status(500).json({ ok: false, error: e2.message });
        res.json({ ok: true, published: 1, published_at: now });
      }
    );
  });
});

/* ------------------------------------------------------------------ */
/* Public listing payload (ABS URL + comments)                        */
/* ------------------------------------------------------------------ */
router.get("/api/listing/:id", (req, res) => {
  const { id } = req.params;
  const me = req.session?.userId || 0;
  const base = `${req.protocol}://${req.get("host")}`;

  db.get(
    `SELECT a.*, u.username, u.avatar_file
       FROM artwork a
       JOIN user u ON u.id = a.user_id
      WHERE a.id = ?`,
    [id],
    (err, art) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      if (!art) return res.status(404).json({ ok: false, error: "Not found" });

      const isOwner = Number(art.user_id) === Number(me);
      if (!isOwner && Number(art.published) !== 1) {
        return res.status(404).json({ ok: false, error: "Not found" });
      }

      const image_url = art.image_file ? `${base}/uploads/${art.image_file}` : null;

      db.get(`SELECT COUNT(*) AS c FROM art_like WHERE artwork_id = ?`, [id], (e1, r1) => {
        const likes_count = r1 ? r1.c : 0;
        db.get(`SELECT COUNT(*) AS c FROM art_bookmark WHERE artwork_id = ?`, [id], (e2, r2) => {
          const bookmarks_count = r2 ? r2.c : 0;

          db.all(
            `SELECT c.id, c.body, c.created_at, c.user_id, u.username
               FROM art_comment c JOIN user u ON c.user_id = u.id
              WHERE c.artwork_id = ?
              ORDER BY c.created_at ASC`,
            [id],
            (e3, comments) => {
              if (e3) return res.status(500).json({ ok: false, error: e3.message });

              res.json({
                ok: true,
                listing: {
                  id: art.id,
                  title: art.title,
                  description: art.description,
                  image_url,
                  ipfs_cid: art.ipfs_cid,
                  metadata_cid: art.metadata_cid,
                  token_id: art.token_id,
                  tx_hash: art.tx_hash,
                  user_id: art.user_id,
                  date_created: art.date_created,
                  published: !!art.published,
                  published_at: art.published_at || null,
                  likes_count,
                  bookmarks_count,
                  price: art.price ?? null,
                  currency: art.currency || "USD",
                  edition: art.edition || "single",
                  edition_size: art.edition_size || 1,
                },
                creator: {
                  id: art.user_id,
                  username: art.username,
                  avatar_file: art.avatar_file || null,
                  avatar_url: art.avatar_file ? `${base}/avatars/${art.avatar_file}` : null,
                },
                counts: { likes: likes_count, bookmarks: bookmarks_count },
                activity: [],
                comments: comments || [],
                is_owner: isOwner,
              });
            }
          );
        });
      });
    }
  );
});

/* ------------------------------------------------------------------ */
/* Public verify endpoint (QR/NFC)                                    */
/* ------------------------------------------------------------------ */
router.get("/api/verify/:ref", (req, res) => {
  const ref = String(req.params.ref || "").trim();

  const isNumericId = /^\d+$/.test(ref);
  const selectById = `
    SELECT a.id, a.title, a.description, a.image_file, a.ipfs_cid, a.metadata_cid,
           a.token_id, a.tx_hash, a.user_id, a.published, a.published_at,
           u.username
      FROM artwork a JOIN user u ON u.id = a.user_id
     WHERE a.id = ?`;
  const selectByCid = `
    SELECT a.id, a.title, a.description, a.image_file, a.ipfs_cid, a.metadata_cid,
           a.token_id, a.tx_hash, a.user_id, a.published, a.published_at,
           u.username
      FROM artwork a JOIN user u ON u.id = a.user_id
     WHERE a.metadata_cid = ? OR a.ipfs_cid = ?`;

  const done = (err, art) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (!art) return res.status(404).json({ ok: false, error: "Not found" });

    const me = req.session?.userId || 0;
    const isOwner = Number(art.user_id) === Number(me);
    if (!isOwner && Number(art.published) !== 1) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    const base = `${req.protocol}://${req.get("host")}`;
    const image_url = art.image_file ? `${base}/uploads/${art.image_file}` : null;
    res.json({
      ok: true,
      verify: {
        artwork: {
          id: art.id,
          title: art.title,
          image_url,
          description: art.description || "",
          creator: { id: art.user_id, username: art.username },
          published: !!art.published,
          published_at: art.published_at || null,
        },
        storage: {
          ipfs_cid: art.ipfs_cid || null,
          metadata_cid: art.metadata_cid || null,
          ipfs_gateway_url: toGateway(art.ipfs_cid) || null,
          metadata_gateway_url: toGateway(art.metadata_cid) || null,
        },
        token: {
          token_id: art.token_id || null,
          tx_hash: art.tx_hash || null,
          contract_address: null,
          chain_id: null,
        },
        activity: [],
      },
    });
  };

  if (isNumericId) {
    db.get(selectById, [Number(ref)], done);
  } else {
    db.get(selectByCid, [ref, ref], done);
  }
});

module.exports = router;
