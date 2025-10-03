const express = require("express");
const { db } = require("../services/db");

const router = express.Router();

router.post("/api/follow", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok:false, error:"Not logged in" });
  const follower = Number(req.session.userId);
  const following = Number(req.body?.following_id);
  if (!following || follower === following) return res.status(400).json({ ok:false, error:"Invalid user" });

  db.run(`INSERT OR IGNORE INTO follower(follower_id, following_id) VALUES(?, ?)`, [follower, following], function (err) {
    if (err) return res.status(500).json({ ok:false, error: err.message });
    res.json({ ok:true, followed: this.changes > 0 });
  });
});

router.post("/api/unfollow", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok:false, error:"Not logged in" });
  const follower = Number(req.session.userId);
  const following = Number(req.body?.following_id);
  if (!following || follower === following) return res.status(400).json({ ok:false, error:"Invalid user" });

  db.run(`DELETE FROM follower WHERE follower_id = ? AND following_id = ?`, [follower, following], function (err) {
    if (err) return res.status(500).json({ ok:false, error: err.message });
    res.json({ ok:true, unfollowed: this.changes > 0 });
  });
});

router.get("/api/follow/status/:id", (req, res) => {
  if (!req.session.userId) return res.json({ ok:true, following:false });
  const me = req.session.userId; const target = Number(req.params.id);
  if (!target || target === me) return res.json({ ok:true, following:false });

  db.get(`SELECT 1 AS yes FROM follower WHERE follower_id = ? AND following_id = ?`, [me, target], (err, row) => {
    if (err) return res.status(500).json({ ok:false, error: err.message });
    res.json({ ok:true, following: !!row });
  });
});

router.patch("/api/account/profile", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok:false, error:"Not logged in" });
  let { bio } = req.body || {}; bio = String(bio || "").trim(); if (bio.length > 1000) bio = bio.slice(0, 1000);
  db.run(`UPDATE user SET bio = ? WHERE id = ?`, [bio, req.session.userId], function (err) {
    if (err) return res.status(500).json({ ok:false, error: err.message });
    res.json({ ok:true });
  });
});

module.exports = router;
