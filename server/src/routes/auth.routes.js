const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const db = require("../services/db");

const router = express.Router();

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "412651468180-r122p7emhutv56hm7bi12dd194qf7nrd.apps.googleusercontent.com";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function norm(s) { return String(s || "").trim(); }

/* REGISTER */
router.post("/api/register", async (req, res) => {
  try {
    const username = norm(req.body?.username);
    const email = norm(req.body?.email);
    const password = String(req.body?.password || "");
    if (!username || !email || password.length < 6) {
      return res.json({ success: false, message: "Invalid input." });
    }
    const hashed = await bcrypt.hash(password, 12);
    db.run(
      `INSERT INTO user (username, email, password) VALUES (?, ?, ?)`,
      [username, email, hashed],
      function (err) {
        if (err) {
          if (/UNIQUE/i.test(err.message || "")) {
            return res.json({
              success: false,
              message: /username/i.test(err.message) ? "Username already taken." : "Email already in use.",
            });
          }
          return res.json({ success: false, message: err.message });
        }
        req.session.userId = this.lastID;
        res.json({ success: true, userId: this.lastID });
      }
    );
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* LOGIN */
router.post("/api/login", (req, res) => {
  const id = norm(req.body?.username || req.body?.email);
  const password = String(req.body?.password || "");
  if (!id || !password) return res.json({ success: false, message: "Missing credentials." });

  db.get(
    `SELECT id, username, email, password FROM user WHERE username = ? OR email = ?`,
    [id, id],
    async (err, row) => {
      if (err) return res.json({ success: false, message: err.message });
      if (!row) return res.json({ success: false, message: "User not found." });

      const ok = await bcrypt.compare(password, row.password);
      if (!ok) return res.json({ success: false, message: "Wrong password." });

      req.session.userId = row.id;
      res.json({ success: true, userId: row.id });
    }
  );
});

/* LOGOUT */
router.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

/* 🔑 UNIFIED SESSION CHECK: /api/me */
router.get("/api/me", (req, res) => {
  if (!req.session?.userId) return res.status(200).json({ ok: false }); // keep 200 for easy checks
  db.get(
    `SELECT id, username, email, bio, avatar_file FROM user WHERE id = ?`,
    [req.session.userId],
    (err, row) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      if (!row) return res.status(200).json({ ok: false });
      res.json({ ok: true, user: row });
    }
  );
});

/* Back-compat endpoint (returns same truth, different keys) */
router.get("/api/check-session", (req, res) => {
  if (!req.session?.userId) return res.json({ isLoggedIn: false });
  db.get(
    `SELECT id, username, email FROM user WHERE id = ?`,
    [req.session.userId],
    (err, row) => {
      if (err || !row) return res.json({ isLoggedIn: true, userId: req.session.userId });
      res.json({ isLoggedIn: true, userId: row.id, user: row });
    }
  );
});

/* GOOGLE SIGN-IN */
router.post("/api/auth/google", async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ success: false, message: "Missing credential" });

    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = norm(payload.email);
    const name = norm(payload.name || email.split("@")[0]);

    db.get(`SELECT id FROM user WHERE email = ?`, [email], (err, row) => {
      if (err) return res.status(500).json({ success: false, message: err.message });

      const finish = (userId) => { req.session.userId = userId; res.json({ success: true, userId }); };

      if (row) return finish(row.id);

      const randomPassword = crypto.randomBytes(32).toString("hex");
      bcrypt.hash(randomPassword, 12).then((hashed) => {
        db.run(
          `INSERT INTO user (username, email, password) VALUES (?, ?, ?)`,
          [name, email, hashed],
          function (err2) {
            if (err2) return res.status(500).json({ success: false, message: err2.message });
            finish(this.lastID);
          }
        );
      });
    });
  } catch {
    res.status(401).json({ success: false, message: "Invalid Google token" });
  }
});

module.exports = router;
