import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";

import Navbar from "./components/Navbar";
import "./ProfilePage.css";
import "./User.css";

import ProfileBorder from "./assets/images/profile-border.svg";
import EditProfileBtn from "./assets/images/edit-profile-button.svg";
import LineSep from "./assets/images/line-seperator-account.svg";
import DefaultAvatar from "./assets/images/taedal-logo-name.svg";

const API = "http://localhost:5000";

export default function UserProfile() {
  const { id } = useParams();

  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState(null);

  // follow state for the profile owner
  const [following, setFollowing] = useState(false);
  const [busyFollow, setBusyFollow] = useState(false);

  // followers/following modal
  const [listOpen, setListOpen] = useState(null); // 'followers' | 'following' | null
  const [followers, setFollowers] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [listLoading, setListLoading] = useState(false);

  // viewer graph helpers
  const [followMap, setFollowMap] = useState({});
  const [viewerFollowersSet, setViewerFollowersSet] = useState(null);

  // toast
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  };

  // who am I?
  useEffect(() => {
    fetch(`${API}/api/check-session`, { credentials: "include" })
      .then((r) => r.json())
      .then((res) => setMe(res?.isLoggedIn ? res.userId : null))
      .catch(() => {});
  }, []);

  // load profile
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    fetch(`${API}/api/user/${id}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!alive) return;
        setData(j);
        setFollowing(!!j.is_following);
      })
      .catch(() => {
        if (!alive) return;
        setErr("User not found or server error.");
      })
      .finally(() => alive && setLoading(false));

    return () => { alive = false; };
  }, [id]);

  const user = data?.user;
  const artworks = data?.artworks || [];
  const stats = data?.stats || { followers: 0, following: 0 };

  const isMe = useMemo(() => me && user?.id === me, [me, user]);
  const postsCount = useMemo(() => artworks.length || 0, [artworks]);
  const avatarUrl = user?.avatar_file ? `${API}/avatars/${user.avatar_file}` : DefaultAvatar;

  // Follow / Unfollow the profile owner
  const toggleFollow = async () => {
    if (!me) return alert("Please log in first.");
    if (!user?.id) return;
    if (busyFollow) return;
    setBusyFollow(true);

    try {
      const endpoint = following ? "/api/unfollow" : "/api/follow";
      const r = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ following_id: user.id }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Action failed");

      const became = !following;

      setFollowing(became);
      setData((d) =>
        d
          ? { ...d, stats: { ...d.stats, followers: Math.max(0, (d.stats?.followers || 0) + (became ? 1 : -1)) } }
          : d
      );

      showToast(became ? `Followed @${user.username} ✓` : `Unfollowed @${user.username}`);

      window.dispatchEvent(new CustomEvent("follow-changed", {
        detail: { userId: user.id, following: became }
      }));
    } catch (e) {
      alert(e.message || "Follow action failed");
    } finally {
      setBusyFollow(false);
    }
  };

  // modal loader + viewer followers set
  useEffect(() => {
    const run = async () => {
      if (!user?.id || !listOpen) return;
      setListLoading(true);
      try {
        if (listOpen === "followers") {
          const j = await fetch(`${API}/api/user/${user.id}/followers`, { credentials: "include" }).then(r => r.json());
          if (j.ok) setFollowers(j.users || []);
          const next = {};
          await Promise.all((j.users || []).map(async (u) => {
            try {
              const s = await fetch(`${API}/api/follow/status/${u.id}`, { credentials: "include" }).then(r => r.json());
              next[u.id] = !!s.following;
            } catch { next[u.id] = false; }
          }));
          setFollowMap((m) => ({ ...m, ...next }));
        } else if (listOpen === "following") {
          const j = await fetch(`${API}/api/user/${user.id}/following`, { credentials: "include" }).then(r => r.json());
          if (j.ok) setFollowingList(j.users || []);
          const next = {};
          await Promise.all((j.users || []).map(async (u) => {
            try {
              const s = await fetch(`${API}/api/follow/status/${u.id}`, { credentials: "include" }).then(r => r.json());
              next[u.id] = !!s.following;
            } catch { next[u.id] = false; }
          }));
          setFollowMap((m) => ({ ...m, ...next }));
        }

        if (me && viewerFollowersSet === null) {
          try {
            const vf = await fetch(`${API}/api/user/${me}/followers`, { credentials: "include" }).then(r => r.json());
            setViewerFollowersSet(new Set((vf.users || []).map(u => u.id)));
          } catch { setViewerFollowersSet(new Set()); }
        }
      } finally {
        setListLoading(false);
      }
    };
    run();
  }, [listOpen, user?.id, me, viewerFollowersSet]);

  const toggleFollowUser = async (targetId) => {
    if (!me) { alert("Please log in first."); return; }
    if (targetId === me) return;
    const current = !!followMap[targetId];
    const endpoint = current ? "/api/unfollow" : "/api/follow";

    setFollowMap((m) => ({ ...m, [targetId]: !current }));

    try {
      const r = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ following_id: targetId }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Action failed");

      window.dispatchEvent(new CustomEvent("follow-changed", {
        detail: { userId: targetId, following: !current }
      }));
    } catch (e) {
      setFollowMap((m) => ({ ...m, [targetId]: current }));
      alert(e.message || "Follow action failed");
    }
  };

  const tinyTag = (text, variant) => (
    <span className={`u-tag ${variant ? `u-tag--${variant}` : ""}`}>{text}</span>
  );

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

  if (err || !user) {
    return (
      <div className="profile-page">
        <Navbar />
        <section className="profile-header">
          <div className="profile-username">User</div>
        </section>
        <p style={{ opacity: 0.85, padding: "0 20px" }}>
          {err || "No such user."}
        </p>
        <p style={{ marginTop: 12, padding: "0 20px" }}>
          <Link to="/community" className="ipfs-pill">
            ← back to community
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <Navbar />

      {/* toast */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            top: 18,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#fff",
            color: "#000",
            borderRadius: 999,
            padding: "8px 12px",
            fontWeight: 800,
            boxShadow: "0 2px 0 #000, 0 8px 24px rgba(0,0,0,.35)",
            zIndex: 9999
          }}
        >
          {toast}
        </div>
      ) : null}

      {/* header */}
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
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                fontFamily: '"Breakfast Club","THICCBOI",system-ui,-apple-system,Segoe UI,Roboto,Arial',
                fontWeight: 900,
                color: "inherit",
                cursor: "pointer"
              }}
            >
              <b>{stats?.followers || 0}</b>&nbsp;followers
            </button>
            <span className="dot">•</span>
            <button
              type="button"
              className="stat linky"
              onClick={() => setListOpen("following")}
              title="View following"
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                fontFamily: '"Breakfast Club","THICCBOI",system-ui,-apple-system,Segoe UI,Roboto,Arial',
                fontWeight: 900,
                color: "inherit",
                cursor: "pointer"
              }}
            >
              <b>{stats?.following || 0}</b>&nbsp;followings
            </button>
          </div>

          {isMe ? (
            <Link to="/account" className="edit-btn" aria-label="Edit profile">
              <img src={EditProfileBtn} alt="edit profile" />
            </Link>
          ) : (
            <button
              className="ipfs-pill"
              onClick={toggleFollow}
              disabled={busyFollow}
              style={{ marginTop: 8 }}
            >
              {following ? (busyFollow ? "Unfollowing…" : "Unfollow") : (busyFollow ? "Following…" : "Follow")}
            </button>
          )}
        </div>
      </section>

      <img src={LineSep} alt="" className="profile-sep" />

      {/* grid */}
      <div className="user-grid">
        {artworks.map((a) => {
          const src = `${API}/uploads/${a.image_file}`;
          return (
            <button
              key={a.id}
              className="user-card"
              onClick={() => setSelected(a)}
              title={a.title}
            >
              <img src={src} alt={a.title} loading="lazy" />
            </button>
          );
        })}
        {artworks.length === 0 && <div className="empty">No artworks yet.</div>}
      </div>

      {/* Followers/Following modal */}
      {listOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setListOpen(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520, width: "92%", gridTemplateColumns: "1fr" }}
          >
            <div className="modal-right" style={{ paddingTop: 14 }}>
              <button className="md-close" onClick={() => setListOpen(null)}>✕</button>
              <h3 className="md-title" style={{ marginBottom: 12 }}>
                {listOpen === "followers" ? "Followers" : "Following"}
              </h3>

              {listLoading ? (
                <div className="empty">loading…</div>
              ) : listOpen === "followers" ? (
                (followers || []).length === 0 ? (
                  <div className="empty">no followers yet.</div>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto" }}>
                    {followers.map((u) => {
                      const avatarSrc = u.avatar_file ? `${API}/avatars/${u.avatar_file}` : DefaultAvatar;
                      const iFollow = !!followMap[u.id];
                      const followsMe = viewerFollowersSet?.has(u.id);
                      const mutual = iFollow && followsMe;
                      return (
                        <li key={u.id}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #222", borderRadius: 12, padding: "10px 12px", background: "#0f0f0f" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <img
                              src={avatarSrc}
                              alt={u.username}
                              style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #222", objectFit: "cover", background: "#111" }}
                              loading="lazy"
                            />
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <Link to={`/user/${u.id}`} style={{ color: "#9cf", fontWeight: 800 }}>@{u.username}</Link>
                              {mutual ? tinyTag("mutual","mutual") : tinyTag("follows you","fy")}
                            </div>
                          </div>
                          {u.id !== me && (
                            <button
                              className="ipfs-pill"
                              onClick={() => toggleFollowUser(u.id)}
                              style={{
                                minWidth: 90,
                                background: iFollow ? "#200" : "#fff",
                                color: iFollow ? "#ff8a8a" : "#000",
                                borderColor: iFollow ? "#b00" : "#000",
                                boxShadow: iFollow ? "none" : "0 2px 0 #000"
                              }}
                            >
                              {iFollow ? "Unfollow" : "Follow"}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : (
                (followingList || []).length === 0 ? (
                  <div className="empty">no followings yet.</div>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto" }}>
                    {followingList.map((u) => {
                      const avatarSrc = u.avatar_file ? `${API}/avatars/${u.avatar_file}` : DefaultAvatar;
                      const iFollow = !!followMap[u.id];
                      const followsMe = viewerFollowersSet?.has(u.id);
                      const mutual = iFollow && followsMe;
                      return (
                        <li key={u.id}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #222", borderRadius: 12, padding: "10px 12px", background: "#0f0f0f" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <img
                              src={avatarSrc}
                              alt={u.username}
                              style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #222", objectFit: "cover", background: "#111" }}
                              loading="lazy"
                            />
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <Link to={`/user/${u.id}`} style={{ color: "#9cf", fontWeight: 800 }}>@{u.username}</Link>
                              {mutual ? tinyTag("mutual","mutual") : (followsMe ? tinyTag("follows you","fy") : null)}
                            </div>
                          </div>
                          {u.id !== me && (
                            <button
                              className="ipfs-pill"
                              onClick={() => toggleFollowUser(u.id)}
                              style={{
                                minWidth: 90,
                                background: iFollow ? "#200" : "#fff",
                                color: iFollow ? "#ff8a8a" : "#000",
                                borderColor: iFollow ? "#b00" : "#000",
                                boxShadow: iFollow ? "none" : "0 2px 0 #000"
                              }}
                            >
                              {iFollow ? "Unfollow" : "Follow"}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* simple lightbox (kept) */}
      {selected && (
        <div className="lightbox" onClick={() => setSelected(null)}>
          <div className="lightbox-card" onClick={(e) => e.stopPropagation()}>
            <img
              src={`${API}/uploads/${selected.image_file}`}
              alt={selected.title}
              className="lightbox-img"
            />
            <div className="lightbox-meta">
              <h3>{selected.title}</h3>
              {selected.description ? <p className="desc">{selected.description}</p> : null}
              <div className="row">
                <span>by&nbsp;</span>
                <Link className="author" to={`/user/${user.id}`}>
                  {user.username}
                </Link>
              </div>
              {selected.ipfs_cid && (
                <a
                  className="ipfs-pill"
                  href={`https://gateway.pinata.cloud/ipfs/${selected.ipfs_cid}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  view on ipfs
                </a>
              )}
            </div>
            <button className="close" onClick={() => setSelected(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
