// client/src/components/FollowersModal.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const API = "http://localhost:5000";

export default function FollowersModal({
  userId,
  mode = "followers",     // "followers" or "following"
  isOwner = false,        // whether the viewer owns this profile
  onClose,
}) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  // fetch
  useEffect(() => {
    let alive = true;
    const run = async () => {
      setLoading(true);
      try {
        const url =
          mode === "followers"
            ? `${API}/api/user/${userId}/followers`
            : `${API}/api/user/${userId}/following`;
        const r = await fetch(url, { credentials: "include" });
        const j = await r.json();
        if (!alive) return;
        setList(j.ok ? j.users || [] : []);
      } finally {
        alive && setLoading(false);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [userId, mode]);

  const removeFollower = async (followerId) => {
    if (!window.confirm("Remove this follower?")) return;
    try {
      const r = await fetch(`${API}/api/follow/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ follower_id: followerId }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed");
      setList((arr) => arr.filter((u) => u.id !== followerId));
    } catch (e) {
      alert(e.message || "Remove failed");
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: "92%" }}>
        <div className="modal-right" style={{ paddingTop: 14 }}>
          <button className="md-close" onClick={onClose}>✕</button>
          <h3 className="md-title" style={{ marginBottom: 12 }}>
            {mode === "followers" ? "Followers" : "Following"}
          </h3>

          {loading ? (
            <div className="empty">loading…</div>
          ) : list.length === 0 ? (
            <div className="empty">no users.</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto" }}>
              {list.map((u) => (
                <li key={u.id}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #222", borderRadius: 12, padding: "10px 12px", background: "#0f0f0f" }}>
                  <Link to={`/user/${u.id}`} style={{ color: "#9cf", fontWeight: 800 }}>@{u.username}</Link>
                  {mode === "followers" && isOwner ? (
                    <button className="ipfs-pill" style={{ background: "#200", color: "#ff8a8a", borderColor: "#b00" }} onClick={() => removeFollower(u.id)}>
                      Remove
                    </button>
                  ) : (
                    <span style={{ opacity: .7, fontSize: 12 }}>{mode === "followers" ? "follower" : "following"}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
