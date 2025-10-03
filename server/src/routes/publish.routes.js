// server/src/routes/publish.routes.js
const express = require("express");
const db = require("../services/db");

const router = express.Router();

/**
 * PATCH /api/artwork/:id/publish
 * - Requires a logged-in session
 * - Only the owner of the artwork can publish
 * - Sets published = 1 and published_at = now
 */
router.patch("/api/artwork/:id/publish", (req, res) => {
  const userId = req.session?.userId;
  const id = Number(req.params.id);

  if (!userId) return res.status(401).json({ ok: false, error: "Not logged in" });
  if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

  db.get(`SELECT id, user_id, published FROM artwork WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: "DB error" });
    if (!row) return res.status(404).json({ ok: false, error: "Artwork not found" });
    if (row.user_id !== userId) {
      return res.status(403).json({ ok: false, error: "Not your artwork" });
    }

    const now = new Date().toISOString();
    db.run(
      `UPDATE artwork SET published = 1, published_at = ? WHERE id = ?`,
      [now, id],
      (uErr) => {
        if (uErr) return res.status(500).json({ ok: false, error: "DB update failed" });
        res.json({ ok: true, id, published: 1, published_at: now });
      }
    );
  });
});

/**
 * Optional: unpublish
 * PATCH /api/artwork/:id/unpublish
 */
router.patch("/api/artwork/:id/unpublish", (req, res) => {
  const userId = req.session?.userId;
  const id = Number(req.params.id);

  if (!userId) return res.status(401).json({ ok: false, error: "Not logged in" });
  if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

  db.get(`SELECT id, user_id FROM artwork WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: "DB error" });
    if (!row) return res.status(404).json({ ok: false, error: "Artwork not found" });
    if (row.user_id !== userId) {
      return res.status(403).json({ ok: false, error: "Not your artwork" });
    }

    db.run(
      `UPDATE artwork SET published = 0, published_at = NULL WHERE id = ?`,
      [id],
      (uErr) => {
        if (uErr) return res.status(500).json({ ok: false, error: "DB update failed" });
        res.json({ ok: true, id, published: 0, published_at: null });
      }
    );
  });
});

module.exports = router;
