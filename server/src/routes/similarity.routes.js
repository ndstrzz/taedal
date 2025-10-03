const express = require("express");
const multer = require("multer");
const db = require("../services/db");
const { dhash64, hammingHex } = require("../utils/similarity");

const router = express.Router();

// Use memory storage—we don't need to save the probe file to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// POST /api/similar  (field: "artwork")
// Optional query params: ?limit=50&maxDist=10
router.post("/similar", upload.single("artwork"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "no_file" });

    const buf = req.file.buffer;

    // Perceptual hash of uploaded image
    let phash;
    try {
      phash = await dhash64(buf);
    } catch (e) {
      console.error("dhash64 error:", e);
      return res.status(500).json({ ok: false, error: "hash_failed" });
    }

    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "8", 10) || 8, 50));
    const MAX_DIST = Math.max(0, Math.min(parseInt(req.query.maxDist || "10", 10) || 10, 64));

    db.all(
      `SELECT a.id, a.title, a.image_file, a.user_id, a.phash, u.username
         FROM artwork a
         JOIN user u ON u.id = a.user_id
        WHERE a.phash IS NOT NULL`,
      [],
      (err, rows) => {
        if (err) {
          console.error("db error:", err.message);
          return res.status(500).json({ ok: false, error: "db_error" });
        }

        const allMatches = (rows || [])
          .map((r) => ({
            id: r.id,
            title: r.title,
            user_id: r.user_id,
            username: r.username,
            image_url: `/uploads/${r.image_file}`,
            distance: hammingHex(phash, r.phash),
          }))
          .filter((x) => x.distance <= MAX_DIST)
          .sort((a, b) => a.distance - b.distance);

        const has_more = allMatches.length > limit;
        const results = allMatches.slice(0, limit);

        res.json({
          ok: true,
          results,
          total: allMatches.length,
          has_more,
          probe_phash: phash,
          max_dist: MAX_DIST,
        });
      }
    );
  } catch (e) {
    console.error("similarity route error:", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
