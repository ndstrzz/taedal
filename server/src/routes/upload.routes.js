// server/src/routes/upload.routes.js
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const db = require("../services/db"); // direct instance
const { upload, uploadMem, uploadDir } = require("../middleware/upload");
const { dhash64, hammingHex } = require("../utils/similarity");
const { uploadToIPFS } = require("../services/ipfs");

const router = express.Router();

// Build a forward-slash web path for files served from /uploads
function toWebUploadPath(file) {
  if (!file) return null;
  const name = file.filename || path.basename(file.path || "");
  return `/uploads/${name}`.replace(/\\/g, "/");
}

/* 1) Upload artwork (disk), compute hashes, find similar, best-effort IPFS, insert row */
router.post("/upload", upload.single("artwork"), async (req, res) => {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ ok: false, error: "Not logged in" });
    }

    const { title, description } = req.body || {};
    if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded" });

    const name = (title || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "Title required" });

    const user_id = req.session.userId;
    const image_file = req.file.filename; // actual filename on disk
    const filePath = path.join(uploadDir, image_file);

    // read file as Buffer
    const data = await fs.promises.readFile(filePath);

    // content hash (exact duplicate)
    const content_hash = crypto.createHash("sha256").update(data).digest("hex");

    // perceptual hash (dHash) for similarity
    let phash = null;
    try {
      phash = await dhash64(data);
    } catch {
      // leave null if hashing fails
    }

    // Find visually similar rows by Hamming distance
    const MAX_DIST = 10;
    const similar = await new Promise((resolve) => {
      db.all(
        `SELECT a.id, a.title, a.image_file, a.user_id, u.username, a.phash
           FROM artwork a
           JOIN user u ON u.id = a.user_id
          WHERE a.phash IS NOT NULL`,
        [],
        (err, rows) => {
          if (err || !phash) return resolve([]);
          resolve(
            (rows || [])
              .map((r) => ({
                id: r.id,
                title: r.title,
                username: r.username,
                user_id: r.user_id,
                image_url: `/uploads/${r.image_file}`,
                distance: hammingHex(phash, r.phash),
              }))
              .filter((x) => x.distance <= MAX_DIST)
              .sort((a, b) => a.distance - b.distance)
              .slice(0, 8)
          );
        }
      );
    });

    // Best-effort IPFS upload of the original
    const { cid: ipfs_cid, provider } = await uploadToIPFS(
      data,
      req.file.originalname || image_file,
      req.file.mimetype || "application/octet-stream"
    );

    // Insert DB row
    db.run(
      `INSERT INTO artwork
         (title, image_file, content_hash, user_id, date_created, description, ipfs_cid, metadata_cid, phash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        image_file,
        content_hash,
        user_id,
        new Date().toISOString(),
        description || null,
        ipfs_cid || null,
        null,
        phash,
      ],
      function (err) {
        if (err) {
          console.error("DB insert failed:", err);
          return res.status(500).json({ ok: false, error: "DB insert failed" });
        }

        // ✅ Always return a forward-slash web path under /uploads
        const image_url = toWebUploadPath(req.file);

        res.json({
          ok: true,
          id: this.lastID,
          image_url,
          sha256: content_hash,
          ipfs_cid: ipfs_cid || null,
          ipfs_provider: provider || null,
          similar,
        });
      }
    );
  } catch (e) {
    console.error("Upload error:", e);
    res.status(500).json({ ok: false, error: "Upload failed" });
  }
});

/* 2) Exact-duplicate verify (hash in memory — no temp file) */
router.post("/api/verify", uploadMem.single("artwork"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    const content_hash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

    db.get(
      `SELECT a.id, a.title, a.date_created, a.description, a.ipfs_cid, a.image_file,
              u.username, a.user_id
         FROM artwork a JOIN user u ON u.id = a.user_id
        WHERE a.content_hash = ?`,
      [content_hash],
      (err, row) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (!row) return res.json({ success: true, match: false, content_hash });

        // include a normalized web URL for convenience
        const image_url = row.image_file ? `/uploads/${row.image_file}` : null;
        res.json({ success: true, match: true, content_hash, record: { ...row, image_url } });
      }
    );
  } catch (e) {
    console.error("verify error:", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* 3) Create metadata JSON on IPFS */
router.post("/api/metadata", async (req, res) => {
  try {
    const { name, description, imageCid, attributes, artworkId } = req.body || {};
    if (!name || !imageCid) {
      return res.status(400).json({ ok: false, error: "name and imageCid are required" });
    }

    const metadata = {
      name: String(name),
      description: description ? String(description) : "",
      image: `ipfs://${imageCid}`,
      attributes: Array.isArray(attributes) ? attributes : [],
    };

    const buf = Buffer.from(JSON.stringify(metadata), "utf8");
    const { cid, provider, url } = await uploadToIPFS(
      buf,
      "metadata.json",
      "application/json"
    );
    if (!cid) return res.status(502).json({ ok: false, error: "IPFS providers failed" });

    if (artworkId) {
      db.run(
        `UPDATE artwork SET metadata_cid = ? WHERE id = ?`,
        [cid, Number(artworkId)],
        () => {}
      );
    }

    res.json({
      ok: true,
      metadata_cid: cid,
      tokenURI: `ipfs://${cid}`,
      ipfs_provider: provider,
      gateway_url: url,
    });
  } catch (e) {
    console.error("metadata error:", e);
    res.status(500).json({ ok: false, error: "Failed to create metadata" });
  }
});

module.exports = router;
