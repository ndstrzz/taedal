import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./ArtworkModal.css";

const API = "http://localhost:5000";

export default function ArtworkModal({
  artwork,            // minimal artwork object from grid (must contain id)
  artworkId,          // or pass an id directly
  onClose,
  onDeleted,          // optional callback(id) -> parent can remove from grid
  onUpdated           // optional callback(updatedArtwork) -> parent can update
}) {
  // ---------------- core state ----------------
  const id = artwork?.id ?? artworkId;
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");
  const [data, setData]     = useState(null); // { artwork, user_flags, comments }

  // actions state
  const [comment, setComment] = useState("");
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  // edit mode for owner
  const [editing, setEditing]   = useState(false);
  const [editText, setEditText] = useState("");

  // auth / follow
  const [me, setMe] = useState(null);
  const [following, setFollowing] = useState(false);
  const [busyFollow, setBusyFollow] = useState(false);

  // toast
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  };

  // ---------------- derived ----------------
  const imgSrc = useMemo(() => {
    const file = data?.artwork?.image_file || artwork?.image_file;
    return file ? `${API}/uploads/${file}` : "";
  }, [data?.artwork?.image_file, artwork?.image_file]);

  const createdAt = useMemo(() => {
    const ts = data?.artwork?.date_created || artwork?.date_created;
    if (!ts) return "";
    try { return new Date(ts).toLocaleString(); } catch { return ""; }
  }, [data?.artwork?.date_created, artwork?.date_created]);

  // ---------------- auth: who am I ----------------
  useEffect(() => {
    fetch(`${API}/api/check-session`, { credentials: "include" })
      .then(r => r.json())
      .then(j => setMe(j.isLoggedIn ? j.userId : null))
      .catch(() => setMe(null));
  }, []);

  // ---------------- fetch on open ----------------
  useEffect(() => {
    let alive = true;
    if (!id) return;

    setLoading(true);
    setError("");
    fetch(`${API}/api/artwork/${id}/full`, { credentials: "include" })
      .then(r => r.json())
      .then(j => {
        if (!alive) return;
        if (!j.ok) throw new Error(j.error || "Failed to load");
        setData(j);
        setEditText(j.artwork?.description || "");
      })
      .catch(e => {
        if (!alive) return;
        setError(e.message || "Failed to load");
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  // fetch follow status for the artwork's author
  useEffect(() => {
    const authorId = data?.artwork?.user_id || artwork?.user_id;
    if (!authorId) return;

    if (me && Number(me) === Number(authorId)) {
      setFollowing(false);
      return;
    }
    fetch(`${API}/api/follow/status/${authorId}`, { credentials: "include" })
      .then(r => r.json())
      .then(j => {
        if (typeof j.following === "boolean") setFollowing(j.following);
      })
      .catch(() => {});
  }, [data?.artwork?.user_id, artwork?.user_id, me]);

  // tiny helper to patch local state optimistically
  const optimistic = (patch) =>
    setData(prev => prev ? ({ ...prev, ...patch(prev) }) : prev);

  // ---------------- like / bookmark ----------------
  const onLike = async () => {
    if (!id) return;
    optimistic(prev => {
      const liked = !prev.user_flags.liked;
      const delta = liked ? 1 : -1;
      return {
        user_flags: { ...prev.user_flags, liked },
        artwork: { ...prev.artwork, likes_count: Math.max(0, (prev.artwork.likes_count || 0) + delta) }
      };
    });

    const r = await fetch(`${API}/api/artwork/${id}/like`, {
      method: "POST",
      credentials: "include"
    });
    const j = await r.json();
    if (!j.ok) {
      // revert on failure
      optimistic(prev => {
        const liked = !prev.user_flags.liked;
        const delta = liked ? 1 : -1;
        return {
          user_flags: { ...prev.user_flags, liked },
          artwork: { ...prev.artwork, likes_count: Math.max(0, (prev.artwork.likes_count || 0) + delta) }
        };
      });
      if (r.status === 401) alert("Please log in to like.");
    }
  };

  const onBookmark = async () => {
    if (!id) return;
    optimistic(prev => ({
      user_flags: { ...prev.user_flags, bookmarked: !prev.user_flags.bookmarked }
    }));

    const r = await fetch(`${API}/api/artwork/${id}/bookmark`, {
      method: "POST",
      credentials: "include"
    });
    const j = await r.json();
    if (!j.ok && r.status === 401) {
      optimistic(prev => ({
        user_flags: { ...prev.user_flags, bookmarked: !prev.user_flags.bookmarked }
      }));
      alert("Please log in to save.");
    }
  };

  // ---------------- comments ----------------
  const onAddComment = async (e) => {
    e.preventDefault();
    const body = comment.trim();
    if (!body || !id) return;

    // optimistic append (temporary id)
    const temp = {
      id: `tmp-${Date.now()}`,
      body,
      created_at: new Date().toISOString(),
      user_id: 0,
      username: "you"
    };
    optimistic(prev => ({ comments: [...(prev.comments || []), temp] }));
    setComment("");

    const r = await fetch(`${API}/api/artwork/${id}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ body })
    });
    const j = await r.json();

    if (!j.ok) {
      // remove temp comment
      optimistic(prev => ({ comments: (prev.comments || []).filter(c => c.id !== temp.id) }));
      if (r.status === 401) return alert("Please log in to comment.");
      return alert(j.error || "Failed to comment.");
    }

    // replace temp with server row
    optimistic(prev => ({
      comments: (prev.comments || []).map(c => c.id === temp.id ? j.comment : c)
    }));
  };

  // ---------------- owner: edit / delete ----------------
  const onEnterEdit = () => {
    setEditText(data?.artwork?.description || "");
    setEditing(true);
  };

  const onCancelEdit = () => {
    setEditText(data?.artwork?.description || "");
    setEditing(false);
  };

  const onSaveEdit = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/artwork/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description: editText })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to update");

      // patch locally
      optimistic(prev => ({
        artwork: { ...prev.artwork, description: editText }
      }));
      setEditing(false);
      if (typeof onUpdated === "function") {
        onUpdated({ ...data.artwork, description: editText, id });
      }
      showToast("Description updated ✓");
    } catch (e) {
      alert(e.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!id) return;
    if (!window.confirm("Delete this artwork? This cannot be undone.")) return;

    setDeleting(true);
    try {
      const r = await fetch(`${API}/api/artwork/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to delete");

      if (typeof onDeleted === "function") onDeleted(id);
      onClose?.();
      if (typeof onDeleted !== "function") {
        window.location.reload();
      }
    } catch (e) {
      alert(e.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  // ---------------- follow / unfollow author ----------------
  const toggleFollow = async () => {
    const authorId = data?.artwork?.user_id || artwork?.user_id;
    const authorName = data?.artwork?.username || artwork?.username || "user";
    if (!authorId) return;
    if (!me) return alert("Please log in first.");
    if (busyFollow) return;

    setBusyFollow(true);
    try {
      const endpoint = following ? "/api/unfollow" : "/api/follow";
      const r = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ following_id: authorId }),
      });

      if (r.status === 401) throw new Error("Please log in to follow/unfollow.");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Action failed");

      const becameFollowing = j.followed === true || (j.unfollowed ? false : !following);
      setFollowing(becameFollowing);

      // toast
      showToast(
        becameFollowing ? `Followed @${authorName} ✓` : `Unfollowed @${authorName}`
      );

      // notify the app so Following tab can refresh
      try {
        window.dispatchEvent(
          new CustomEvent("taedal:follow-updated", { detail: { authorId, following: becameFollowing } })
        );
      } catch {}
    } catch (e) {
      alert(e.message || "Follow action failed");
    } finally {
      setBusyFollow(false);
    }
  };

  // ---------------- render ----------------
  if (!id) return null;
  if (loading) {
    return (
      <div className="artm-backdrop" onClick={onClose}>
        <div className="artm-card" onClick={(e) => e.stopPropagation()}>
          <div className="artm-media skeleton" />
          <div className="artm-side">
            <div className="artm-head">
              <div className="artm-meta"><div className="artm-title">Loading…</div></div>
              <button className="artm-close" onClick={onClose}>✕</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (error || !data?.artwork) {
    return (
      <div className="artm-backdrop" onClick={onClose}>
        <div className="artm-card" onClick={(e) => e.stopPropagation()}>
          <div className="artm-side" style={{ padding: 24 }}>
            <p style={{ opacity: .8 }}>{error || "Not found."}</p>
            <button className="artm-close" onClick={onClose} style={{ marginTop: 12 }}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const art = data.artwork;
  const flags = data.user_flags || {};
  const comments = data.comments || [];
  const isOwner = !!flags.is_owner;

  return (
    <div className="artm-backdrop" onClick={onClose}>
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
            border: "none",
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

      <div className="artm-card" onClick={(e) => e.stopPropagation()}>
        {/* media */}
        <div className="artm-media">
          <img src={imgSrc} alt={art.title} />
          {art.ipfs_cid ? <span className="artm-badge">minted</span> : null}
        </div>

        {/* side */}
        <div className="artm-side">
          {/* header */}
          <div className="artm-head">
            <div className="artm-meta">
              <div className="artm-title">{art.title}</div>
              <div className="artm-by">
                by{" "}
                <Link to={`/user/${art.user_id}`} className="artm-author">
                  {art.username}
                </Link>
                <span className="artm-dot">•</span>
                <span className="artm-date">{createdAt}</span>
              </div>
            </div>

            {/* owner controls OR follow button */}
            {isOwner ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {!editing ? (
                  <>
                    <button
                      onClick={onEnterEdit}
                      disabled={deleting}
                      style={{
                        background: "transparent",
                        color: "#fff",
                        border: "2px solid #555",
                        borderRadius: 10,
                        padding: "6px 10px",
                        fontWeight: 800,
                        cursor: "pointer"
                      }}
                      title="Edit description"
                    >
                      Edit
                    </button>
                    <button
                      onClick={onDelete}
                      disabled={deleting}
                      style={{
                        background: "#a11",
                        color: "#fff",
                        border: "2px solid #000",
                        borderRadius: 10,
                        padding: "6px 10px",
                        fontWeight: 800,
                        cursor: "pointer",
                        opacity: deleting ? .7 : 1
                      }}
                      title="Delete artwork"
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </button>
                  </>
                ) : (
                  <button
                    className="artm-close"
                    onClick={onCancelEdit}
                    title="Cancel edit"
                  >
                    ✕
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={toggleFollow}
                disabled={busyFollow}
                aria-pressed={following}
                aria-label={following ? "Unfollow this user" : "Follow this user"}
                style={{
                  background: "#fff",
                  color: "#000",
                  border: "none",
                  borderRadius: 999,
                  padding: "6px 12px",
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 2px 0 #000, 0 8px 24px rgba(0,0,0,.3)",
                  marginRight: 8,
                  opacity: busyFollow ? 0.85 : 1
                }}
                title={following ? "Unfollow" : "Follow"}
              >
                {following ? (busyFollow ? "Unfollowing…" : "Unfollow") : (busyFollow ? "Following…" : "Follow")}
              </button>
            )}

            <button className="artm-close" onClick={onClose} aria-label="close">
              ✕
            </button>
          </div>

          {/* description / edit area */}
          {!editing ? (
            art.description ? <p className="artm-desc">{art.description}</p> : null
          ) : (
            <div style={{ margin: "8px 0 12px" }}>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  background: "#111",
                  color: "#fff",
                  border: "2px solid #555",
                  borderRadius: 10,
                  padding: 10,
                  resize: "vertical"
                }}
                placeholder="Update description"
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={onSaveEdit}
                  disabled={saving}
                  style={{
                    background: "#fff",
                    color: "#000",
                    border: "none",
                    borderRadius: 10,
                    padding: "8px 14px",
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 2px 0 #000, 0 8px 24px rgba(0,0,0,.3)"
                  }}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={onCancelEdit}
                  disabled={saving}
                  style={{
                    background: "transparent",
                    color: "#fff",
                    border: "2px solid #555",
                    borderRadius: 10,
                    padding: "8px 14px",
                    fontWeight: 800,
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* actions */}
          <div className="artm-actions">
            <button
              className={`artm-btn ${flags.liked ? "on" : ""}`}
              onClick={onLike}
              aria-label="like"
              title="Like"
            >
              ❤️
            </button>

            <a
              className="artm-btn"
              href={art.ipfs_cid ? `https://gateway.pinata.cloud/ipfs/${art.ipfs_cid}` : undefined}
              target="_blank"
              rel="noreferrer"
              aria-label="view on ipfs"
              title="View on IPFS"
            >
              🔗
            </a>

            <button
              className={`artm-btn ${flags.bookmarked ? "on" : ""}`}
              onClick={onBookmark}
              aria-label="save"
              title="Save"
            >
              🔖
            </button>

            <div className="artm-spacer" />
            <div className="artm-likes">
              {(art.likes_count || 0)} like{(art.likes_count || 0) === 1 ? "" : "s"}
            </div>
          </div>

          {/* comments */}
          <div className="artm-comments">
            {comments.length === 0 ? (
              <div className="artm-empty">No comments yet.</div>
            ) : (
              comments.map((c) => (
                <div className="artm-comment" key={c.id}>
                  <span className="who">{c.username}</span>
                  <span className="body">{c.body}</span>
                </div>
              ))
            )}
          </div>

          {/* add comment */}
          <form className="artm-add" onSubmit={onAddComment}>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment…"
              aria-label="Add a comment"
            />
            <button type="submit" className="artm-post">Post</button>
          </form>
        </div>
      </div>
    </div>
  );
}
