import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Navbar.css";
import "./ProfilePage.css";
import "./User.css";
import Navbar from "./components/Navbar";

import ProfileBorder from "./assets/images/profile-border.svg";
import EditProfileBtn from "./assets/images/edit-profile-button.svg";
import LineSep from "./assets/images/line-seperator-account.svg";
import DefaultAvatar from "./assets/images/taedal-logo-name.svg";

import ArtworkModal from "./components/ArtworkModal";

// Resolve API base without import.meta (CRA-safe)
const API =
  (window.__CONFIG__ && window.__CONFIG__.API_BASE) ||
  process.env.REACT_APP_API_BASE ||
  "http://localhost:5000";

/* ---------------- helpers: normalize URLs + cache-bust ---------------- */
function joinUrl(base, path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return `${b}/${p}`;
}
function getAvatarSrc(apiBase, user, cacheKey = "") {
  const direct = user?.avatar_url ? joinUrl(apiBase, user.avatar_url) : "";
  const legacy = user?.avatar_file ? `${apiBase}/avatars/${user.avatar_file}` : "";
  const fallback = DefaultAvatar;
  const url = direct || legacy || fallback;
  return cacheKey ? `${url}${url.includes("?") ? "&" : "?"}v=${cacheKey}` : url;
}

export default function Profile() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ followers: 0, following: 0 });
  const [artworks, setArtworks] = useState([]);
  const [selected, setSelected] = useState(null);

  // IG-style list modal
  const [listOpen, setListOpen] = useState(null); // 'followers' | 'following' | null
  const [followers, setFollowers] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [listLoading, setListLoading] = useState(false);

  // initial load (session → profile)
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const s = await fetch(`${API}/api/check-session`, {
          credentials: "include",
          signal: ac.signal,
        }).then((r) => r.json());

        if (!s.isLoggedIn) {
          setLoading(false);
          navigate("/account", { replace: true });
          return;
        }

        const j = await fetch(`${API}/api/user/${s.userId}`, {
          credentials: "include",
          signal: ac.signal,
        }).then((r) => r.json());

        setUser(j.user);
        setStats(j.stats || { followers: 0, following: 0 });
        setArtworks(j.artworks || []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [navigate]);

  const postsCount = useMemo(() => artworks.length, [artworks]);
  // use updated_at (or any timestamp) to break browser cache after changes
  const avatarUrl = useMemo(
    () => getAvatarSrc(API, user, user?.updated_at || user?.avatar_updated_at || ""),
    [user]
  );

  // lazy-load followers/following lists
  useEffect(() => {
    if (!user?.id || !listOpen) return;
    const ac = new AbortController();
    (async () => {
      setListLoading(true);
      try {
        if (listOpen === "followers") {
          const j = await fetch(`${API}/api/user/${user.id}/followers`, {
            credentials: "include",
            signal: ac.signal,
          }).then((r) => r.json());
          if (j.ok) setFollowers(j.users || []);
        } else if (listOpen === "following") {
          const j = await fetch(`${API}/api/user/${user.id}/following`, {
            credentials: "include",
            signal: ac.signal,
          }).then((r) => r.json());
          if (j.ok) setFollowingList(j.users || []);
        }
      } finally {
        setListLoading(false);
      }
    })();
    return () => ac.abort();
  }, [listOpen, user?.id]);

  const handleDeleted = (id) => {
    setArtworks((prev) => prev.filter((a) => a.id !== id));
    setSelected(null);
  };
  const handleUpdated = (u) => {
    setArtworks((prev) => prev.map((a) => (a.id === u.id ? { ...a, description: u.description } : a)));
  };

  // remove follower (owner)
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
      if (!j.ok) throw new Error(j.error || "Failed to remove follower");

      setFollowers((list) => list.filter((u) => u.id !== followerId));
      setStats((s) => ({ ...s, followers: Math.max(0, (s.followers || 0) - 1) }));

      if (user?.id) {
        const j2 = await fetch(`${API}/api/user/${user.id}/followers`, {
          credentials: "include",
        }).then((r) => r.json());
        if (j2.ok) setFollowers(j2.users || []);
      }
    } catch (e) {
      alert(e.message || "Remove failed");
    }
  };

  if (loading) {
    return (
      <div className="profile-page">
        <Navbar />
        <section className="profile-header" style={{ opacity: 0.5 }}>
          <div className="pfp-wrap">
            <div className="pfp-img" style={{ background: "#111", borderRadius: "50%" }} />
            <img className="pfp-border" src={ProfileBorder} alt="" />
          </div>
          <div className="profile-meta">
            <div className="profile-username">loading…</div>
            <div className="profile-stats">loading…</div>
          </div>
        </section>
        <img src={LineSep} alt="" className="profile-sep" />
        <div className="user-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="user-card skeleton" key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <Navbar />

      <section className="profile-header">
        <div className="pfp-wrap" aria-label="profile picture">
          <img className="pfp-img" src={avatarUrl} alt={user?.username || "avatar"} />
          <img className="pfp-border" src={ProfileBorder} alt="" />
        </div>

        <div className="profile-meta">
          <div className="profile-username">{user?.username || "username_here"}</div>

          <div className="profile-stats">
            <span className="stat">
              <b>{postsCount}</b>&nbsp;post{postsCount === 1 ? "" : "s"}
            </span>
            <span className="dot">•</span>
            <button
              type="button"
              className="stat linky"
              onClick={() => setListOpen("followers")}
              title="View followers"
              style={{ background: "transparent", border: "none", padding: 0, fontWeight: 900, cursor: "pointer" }}
            >
              <b>{stats.followers || 0}</b>&nbsp;followers
            </button>
            <span className="dot">•</span>
            <button
              type="button"
              className="stat linky"
              onClick={() => setListOpen("following")}
              title="View following"
              style={{ background: "transparent", border: "none", padding: 0, fontWeight: 900, cursor: "pointer" }}
            >
              <b>{stats.following || 0}</b>&nbsp;followings
            </button>
          </div>

          {/* go to settings */}
          <Link to="/settings" className="edit-btn">
            <img src={EditProfileBtn} alt="edit profile" />
          </Link>
        </div>
      </section>

      <img src={LineSep} alt="" className="profile-sep" />

      <section className="user-grid">
        {artworks.length === 0 ? (
          <div className="empty-note">
            you haven’t uploaded anything yet. try the{" "}
            <Link to="/mint" className="mint-inline">
              mint page
            </Link>{" "}
            ✨
          </div>
        ) : (
          artworks.map((a) => {
            const src = `${API}/uploads/${a.image_file}`;
            return (
              <button key={a.id} className="user-card" onClick={() => setSelected(a)} title={a.title}>
                <img src={src} alt={a.title} loading="lazy" />
              </button>
            );
          })
        )}
      </section>

      {/* followers/following modal */}
      {listOpen && (
        <div className="modal-backdrop" onClick={() => setListOpen(null)} role="dialog" aria-modal="true">
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520, width: "92%", gridTemplateColumns: "1fr" }}
          >
            <div className="modal-right" style={{ paddingTop: 14 }}>
              <button className="md-close" onClick={() => setListOpen(null)}>
                ✕
              </button>
              <h3 className="md-title" style={{ marginBottom: 12 }}>
                {listOpen === "followers" ? "Followers" : "Following"}
              </h3>

              {listLoading ? (
                <div className="empty">loading…</div>
              ) : listOpen === "followers" ? (
                followers.length === 0 ? (
                  <div className="empty">no followers yet.</div>
                ) : (
                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      maxHeight: 360,
                      overflow: "auto",
                    }}
                  >
                    {followers.map((u) => (
                      <li
                        key={u.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          border: "1px solid #222",
                          borderRadius: 12,
                          padding: "10px 12px",
                          background: "#0f0f0f",
                        }}
                      >
                        <Link to={`/user/${u.id}`} style={{ color: "#9cf", fontWeight: 800 }}>
                          @{u.username}
                        </Link>
                        <button
                          className="ipfs-pill"
                          style={{ background: "#200", color: "#ff8a8a", borderColor: "#b00" }}
                          onClick={() => removeFollower(u.id)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : followingList.length === 0 ? (
                <div className="empty">you are not following anyone yet.</div>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    maxHeight: 360,
                    overflow: "auto",
                  }}
                >
                  {followingList.map((u) => (
                    <li
                      key={u.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        border: "1px solid #222",
                        borderRadius: 12,
                        padding: "10px 12px",
                        background: "#0f0f0f",
                      }}
                    >
                      <Link to={`/user/${u.id}`} style={{ color: "#9cf", fontWeight: 800 }}>
                        @{u.username}
                      </Link>
                      <span style={{ opacity: 0.7, fontSize: 12 }}>following</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* artwork detail modal */}
      {selected && (
        <ArtworkModal
          artworkId={selected.id}
          onClose={() => setSelected(null)}
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
