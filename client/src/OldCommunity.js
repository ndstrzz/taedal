import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./Navbar.css";
import "./Community.css";
import Navbar from "./components/Navbar";

function imageUrl(row) {
  if (row.ipfs_cid) return `https://gateway.pinata.cloud/ipfs/${row.ipfs_cid}`;
  return `http://localhost:5000/uploads/${row.image_file}`;
}

function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso || ""; }
}

export default function Community() {
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState({ isLoggedIn: false, userId: null });

  const [selected, setSelected] = useState(null); // base artwork row
  const [details, setDetails] = useState(null);   // full details { artwork, user_flags, comments }
  const [busy, setBusy] = useState(false);

  // comment compose
  const [commentText, setCommentText] = useState("");

  // owner edit mode (description only)
  const [editMode, setEditMode] = useState(false);
  const [descDraft, setDescDraft] = useState("");

  // copy toast
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("http://localhost:5000/api/artworks");
        const data = await r.json();
        setArtworks(Array.isArray(data.artworks) ? data.artworks : []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();

    (async () => {
      try {
        const r = await fetch("http://localhost:5000/api/check-session", { credentials: "include" });
        const s = await r.json();
        setSession(s || { isLoggedIn: false });
      } catch {}
    })();
  }, []);

  // load full details when a card is opened
  useEffect(() => {
    if (!selected) { setDetails(null); return; }
    (async () => {
      try {
        const r = await fetch(`http://localhost:5000/api/artwork/${selected.id}/full`, { credentials: "include" });
        const j = await r.json();
        if (j.ok) {
          setDetails(j);
          setDescDraft(j.artwork.description || "");
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [selected]);

  const sorted = useMemo(() => {
    return [...artworks].sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
  }, [artworks]);

  const copy = async (text) => {
    try { setCopying(true); await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea"); ta.value = text;
      document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    } finally { setTimeout(() => setCopying(false), 900); }
  };

  // like / bookmark
  const toggleLike = async () => {
    if (!session.isLoggedIn) return alert("Please login to like.");
    if (!details) return;
    setBusy(true);
    try {
      const r = await fetch(`http://localhost:5000/api/artwork/${details.artwork.id}/like`, {
        method: "POST", credentials: "include"
      });
      const j = await r.json();
      if (j.ok) {
        setDetails(d => ({
          ...d,
          artwork: { ...d.artwork, likes_count: j.likes_count },
          user_flags: { ...d.user_flags, liked: j.liked }
        }));
      } else { alert(j.error || "Like failed"); }
    } catch (e) { alert(e.message || "Like failed"); }
    finally { setBusy(false); }
  };

  const toggleBookmark = async () => {
    if (!session.isLoggedIn) return alert("Please login to bookmark.");
    if (!details) return;
    setBusy(true);
    try {
      const r = await fetch(`http://localhost:5000/api/artwork/${details.artwork.id}/bookmark`, {
        method: "POST", credentials: "include"
      });
      const j = await r.json();
      if (j.ok) {
        setDetails(d => ({
          ...d,
          artwork: { ...d.artwork, bookmarks_count: j.bookmarked ? (d.artwork.bookmarks_count + 1) : Math.max(0, d.artwork.bookmarks_count - 1) },
          user_flags: { ...d.user_flags, bookmarked: j.bookmarked }
        }));
      } else { alert(j.error || "Bookmark failed"); }
    } catch (e) { alert(e.message || "Bookmark failed"); }
    finally { setBusy(false); }
  };

  // comments
  const postComment = async (e) => {
    e.preventDefault();
    if (!session.isLoggedIn) return alert("Please login to comment.");
    const body = commentText.trim();
    if (!body) return;
    if (!details) return;
    setBusy(true);
    try {
      const r = await fetch(`http://localhost:5000/api/artwork/${details.artwork.id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body })
      });
      const j = await r.json();
      if (j.ok) {
        setDetails(d => ({ ...d, comments: [...(d.comments || []), j.comment] }));
        setCommentText("");
      } else { alert(j.error || "Comment failed"); }
    } catch (e) { alert(e.message || "Comment failed"); }
    finally { setBusy(false); }
  };

  // owner actions
  const saveDescription = async () => {
    if (!details?.user_flags?.is_owner) return;
    setBusy(true);
    try {
      const r = await fetch(`http://localhost:5000/api/artwork/${details.artwork.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description: descDraft })
      });
      const j = await r.json();
      if (j.ok) {
        // update local state + grid list
        setDetails(d => ({ ...d, artwork: { ...d.artwork, description: descDraft }}));
        setArtworks(list => list.map(a => a.id === details.artwork.id ? { ...a, description: descDraft } : a));
        setEditMode(false);
      } else { alert(j.error || "Update failed"); }
    } catch (e) { alert(e.message || "Update failed"); }
    finally { setBusy(false); }
  };

  const deleteArtwork = async () => {
    if (!details?.user_flags?.is_owner) return;
    if (!window.confirm("Delete this artwork? This cannot be undone.")) return;
    setBusy(true);
    try {
      const r = await fetch(`http://localhost:5000/api/artwork/${details.artwork.id}`, {
        method: "DELETE", credentials: "include"
      });
      const j = await r.json();
      if (j.ok) {
        setArtworks(list => list.filter(a => a.id !== details.artwork.id));
        setSelected(null);
      } else { alert(j.error || "Delete failed"); }
    } catch (e) { alert(e.message || "Delete failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="community-page">
      {/* top nav */}
      <Navbar />

      <section className="community-hero">
        <h2>discover new art</h2>
        <p>fresh uploads from independent artists, pinned on IPFS.</p>
      </section>

      {loading ? (
        <div className="community-loading">loading…</div>
      ) : (
        <div className="art-grid">
          {sorted.map((a) => (
            <button
              key={a.id}
              className="art-card"
              onClick={() => setSelected(a)}
              title="view details"
            >
              <div className="art-thumb">
                <img src={imageUrl(a)} alt={a.title} loading="lazy" />
                {a.metadata_cid && <span className="badge minted">minted</span>}
              </div>

              <div className="art-info">
                <div className="art-title" title={a.title}>{a.title}</div>
                <div className="art-meta">
                  <span className="art-artist">@{a.username}</span>
                  <span className="art-date">{fmtDate(a.date_created)}</span>
                </div>
              </div>
            </button>
          ))}

          {!sorted.length && (
            <div className="empty">
              no artworks yet — try <Link to="/mint">minting your first piece</Link>.
            </div>
          )}
        </div>
      )}

      {/* detail modal */}
      {selected && details && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-left">
              <img src={imageUrl(details.artwork)} alt={details.artwork.title} />
            </div>
            <div className="modal-right">
              <button className="md-close" onClick={() => setSelected(null)} aria-label="Close">✕</button>

              <h3 className="md-title">{details.artwork.title}</h3>
              <div className="md-byline">
                by <Link to={`/user/${details.artwork.user_id}`}>@{details.artwork.username}</Link>
              </div>
              <div className="md-date">{fmtDate(details.artwork.date_created)}</div>

              {/* description (owner can edit; title stays immutable) */}
              {!editMode ? (
                <p className="md-desc">{details.artwork.description || <i>No description yet.</i>}</p>
              ) : (
                <div className="edit-box">
                  <textarea
                    value={descDraft}
                    onChange={(e)=>setDescDraft(e.target.value)}
                    maxLength={2000}
                    placeholder="Describe your piece…"
                  />
                  <div className="edit-actions">
                    <button className="btn" onClick={()=>setEditMode(false)} disabled={busy}>Cancel</button>
                    <button className="btn primary" onClick={saveDescription} disabled={busy}>Save</button>
                  </div>
                </div>
              )}

              {/* quick links */}
              <div className="md-links">
                {details.artwork.ipfs_cid && (
                  <a className="chip" href={`https://gateway.pinata.cloud/ipfs/${details.artwork.ipfs_cid}`} target="_blank" rel="noreferrer">IPFS</a>
                )}
                {details.artwork.metadata_cid && (
                  <a className="chip" href={`https://gateway.pinata.cloud/ipfs/${details.artwork.metadata_cid}`} target="_blank" rel="noreferrer">metadata</a>
                )}
                <button className="chip" onClick={() => copy(details.artwork.content_hash)}>
                  {copying ? "copied!" : "copy hash"}
                </button>
              </div>

              {/* IG-style actions */}
              <div className="ig-actions">
                <button
                  className={`icon-btn ${details.user_flags.liked ? "active" : ""}`}
                  onClick={toggleLike}
                  disabled={busy}
                  title="like"
                >❤️</button>

                <button
                  className="icon-btn"
                  onClick={() => document.getElementById("cm-input")?.focus()}
                  title="comment"
                >💬</button>

                <button
                  className={`icon-btn ${details.user_flags.bookmarked ? "active" : ""}`}
                  onClick={toggleBookmark}
                  disabled={busy}
                  title="bookmark"
                >🔖</button>

                <div className="counts">
                  {details.artwork.likes_count || 0} likes · {details.artwork.bookmarks_count || 0} saves
                </div>
              </div>

              {/* comments */}
              <div className="comments">
                {(details.comments || []).map((c) => (
                  <div key={c.id} className="comment">
                    <span className="author">@{c.username}</span>
                    <span className="body">{c.body}</span>
                    <span className="time">{fmtDate(c.created_at)}</span>
                  </div>
                ))}
              </div>

              {/* comment box */}
              <form className="comment-form" onSubmit={postComment}>
                <input
                  id="cm-input"
                  type="text"
                  placeholder={session.isLoggedIn ? "Add a comment…" : "Login to comment"}
                  value={commentText}
                  onChange={(e)=>setCommentText(e.target.value)}
                  disabled={!session.isLoggedIn || busy}
                  maxLength={500}
                />
                <button className="btn primary" disabled={!session.isLoggedIn || !commentText.trim() || busy}>Post</button>
              </form>

              {/* owner tools */}
              {details.user_flags.is_owner && !editMode && (
                <div className="owner-tools">
                  <button className="btn" onClick={()=>setEditMode(true)} disabled={busy}>Edit description</button>
                  <button className="btn danger" onClick={deleteArtwork} disabled={busy}>Delete artwork</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
