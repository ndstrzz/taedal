// server/src/routes/account.routes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const sharp = require("sharp");
const db = require("../services/db"); // instance export
const router = express.Router();

/**
 * Avatar handling:
 * - Require login
 * - Accept <= 4MB image (png/jpg/webp/gif)
 * - Convert to square 512x512 WEBP (quality ~90)
 * - Save to server/public/avatars
 * - Update user.avatar_file
 *
 * Profile:
 * - PATCH /api/account/profile { bio }
 */

const AVATAR_MAX_BYTES = 4 * 1024 * 1024;
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES },
});

function requireLogin(req, res, next) {
  if (req.session?.userId) return next();
  return res.status(401).json({ ok: false, error: "not_authenticated" });
}

// POST /api/account/avatar
router.post(
  "/api/account/avatar",
  requireLogin,
  memoryUpload.single("avatar"),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ ok: false, error: "no_file" });
      }

      // basic mime guard
      const type = req.file.mimetype || "";
      if (!/^image\/(png|jpe?g|webp|gif)$/i.test(type)) {
        return res.status(400).json({ ok: false, error: "bad_type" });
      }

      // Center-crop to square, then resize to 512
      const img = sharp(req.file.buffer).rotate(); // auto-orient
      const meta = await img.metadata();
      const side = Math.min(meta.width || 0, meta.height || 0) || 512;

      const processed = await img
        .extract({
          left: Math.max(0, Math.floor(((meta.width || side) - side) / 2)),
          top: Math.max(0, Math.floor(((meta.height || side) - side) / 2)),
          width: side,
          height: side,
        })
        .resize(512, 512)
        .webp({ quality: 90 })
        .toBuffer();

      // Write to avatars dir with unique name
      const avatarDir = path.join(__dirname, "..", "public", "avatars");
      await fs.promises.mkdir(avatarDir, { recursive: true });
      const filename = `u${req.session.userId}-${Date.now()}.webp`;
      const filePath = path.join(avatarDir, filename);
      await fs.promises.writeFile(filePath, processed);

      // Update DB
      db.run(
        `UPDATE user SET avatar_file = ? WHERE id = ?`,
        [filename, req.session.userId],
        (err) => {
          if (err) return res.status(500).json({ ok: false, error: "db_error" });
          res.json({ ok: true, avatar_file: filename, url: `/avatars/${filename}` });
        }
      );
    } catch (e) {
      console.error("avatar error:", e);
      const code = e?.message?.includes("File too large") ? 413 : 500;
      res.status(code).json({ ok: false, error: "server_error" });
    }
  }
);

// PATCH /api/account/profile
router.patch("/api/account/profile", requireLogin, express.json(), (req, res) => {
  let { bio } = req.body || {};
  bio = typeof bio === "string" ? bio.trim() : "";
  if (bio.length > 1000) return res.status(400).json({ ok: false, error: "bio_too_long" });

  db.run(`UPDATE user SET bio = ? WHERE id = ?`, [bio, req.session.userId], (err) => {
    if (err) return res.status(500).json({ ok: false, error: "db_error" });
    res.json({ ok: true });
  });
});

module.exports = router;
