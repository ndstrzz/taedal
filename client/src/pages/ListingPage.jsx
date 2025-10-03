import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import "./ListingPage.css";
import QRDownloadButton from "../components/QRDownloadButton";
import { API_BASE, FRONTEND_BASE, apiFetch } from "../lib/config";

const API = API_BASE;

function PrettyDate({ iso }) {
  if (!iso) return <span>—</span>;
  try {
    const d = new Date(iso);
    return <time dateTime={iso}>{d.toLocaleString()}</time>;
  } catch {
    return <span>{iso}</span>;
  }
}

const isHttp = (u) => /^https?:\/\//i.test(u);
const looksLikeCid = (s) =>
  !!s && (/^ipfs:\/\//i.test(s) || /^[a-z0-9]{46,}$/i.test(s));

function toGatewayUrl(cidOrUri) {
  if (!cidOrUri) return null;
  const cid = cidOrUri.startsWith("ipfs://") ? cidOrUri.slice(7) : cidOrUri;
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}

/** Turn server image paths, CIDs, etc. into a proper http URL */
function resolveServerImageURL(image_url) {
  if (!image_url) return null;
  if (image_url.startsWith("blob:")) return image_url;
  if (isHttp(image_url)) return image_url;
  if (looksLikeCid(image_url)) return toGatewayUrl(image_url);

  // Normalize relative /uploads paths
  let u = String(image_url).replace(/\\/g, "/").replace(/^\.(\/|\\)/, "");
  const idx = u.toLowerCase().lastIndexOf("/uploads/");
  if (idx !== -1) u = u.slice(idx + 1);

  if (u.startsWith("/uploads/")) return `${API}${u}`;
  if (u.startsWith("uploads/")) return `${API}/${u}`;
  if (!u.includes("/")) return `${API}/uploads/${u}`;
  return `${API}/${u.replace(/^\/+/, "")}`;
}

export default function ListingPage() {
  const { id } = useParams();

  const [data, setData] = useState(null); // { ok, listing, creator, comments, is_owner }
  const [tab, setTab] = useState("details");

  // interactions state
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [bookmarks, setBookmarks] = useState(0);
  const [liking, setLiking] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);

  // comments
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);

  const fetchListing = async () => {
    try {
      const r = await apiFetch(`/api/listing/${id}`);
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) {
        setData({ ok: false, error: j?.error || "load_failed" });
      } else {
        setData(j);
        const lc = Number(j.listing?.likes_count || 0);
        const bc = Number(j.listing?.bookmarks_count || 0);
        setLikes(lc);
        setBookmarks(bc);
        setLiked(false);
        setBookmarked(false);
      }
    } catch (e) {
      setData({ ok: false, error: e.message || "load_failed" });
    }
  };

  useEffect(() => {
    (async () => {
      await fetchListing();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const listing = data?.listing || null;
  const creator = data?.creator || null;

  const priceLine = useMemo(() => {
    if (!listing) return "—";
    const cur = listing.currency || "USD";
    if (listing.price == null) return `${cur} —`;
    const v = Number(listing.price);
    return `${cur} ${v.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [listing]);

  const editionLine = useMemo(() => {
    if (!listing) return "—";
    const ed = (listing.edition || "single").toLowerCase();
    if (ed === "open") return "open";
    if (ed === "limited") return `${listing.edition_size || 1} total`;
    return "1 / 1";
  }, [listing]);

  const imageSrc = useMemo(() => {
    if (!listing?.image_url) return null;
    return resolveServerImageURL(listing.image_url);
  }, [listing?.image_url]);

  // verify link (prefer metadata_cid > ipfs_cid > numeric id)
  const verifyHref = useMemo(() => {
    if (!listing) return "#";
    const ref = listing.metadata_cid || listing.ipfs_cid || listing.id;
    return `/verify/${ref}`;
  }, [listing]);

  // absolute URL for QR (uses FRONTEND_BASE)
  const absoluteVerifyUrl = useMemo(
    () => `${FRONTEND_BASE}${verifyHref}`,
    [verifyHref]
  );

  // --- actions ---
  const onToggleLike = async () => {
    if (liking) return;
    setLiking(true);
    const prevLiked = liked;
    setLiked(!prevLiked);
    setLikes((n) => Math.max(0, n + (prevLiked ? -1 : 1)));
    try {
      const r = await apiFetch(`/api/artwork/${id}/like`, { method: "POST" });
      if (r.status === 401) {
        setLiked(prevLiked);
        setLikes((n) => Math.max(0, n + (prevLiked ? 1 : -1)));
        alert("Please log in to like artworks.");
        return;
      }
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) throw new Error(j?.error || "Toggle failed");
      if (typeof j.liked === "boolean") setLiked(j.liked);
      if (typeof j.likes_count === "number") setLikes(j.likes_count);
    } catch (e) {
      setLiked(prevLiked);
      setLikes((n) => Math.max(0, n + (prevLiked ? 1 : -1)));
      alert(e.message || "Like failed");
    } finally {
      setLiking(false);
    }
  };

  const onToggleBookmark = async () => {
    if (bookmarking) return;
    setBookmarking(true);
    const prev = bookmarked;
    setBookmarked(!prev);
    setBookmarks((n) => Math.max(0, n + (prev ? -1 : 1)));
    try {
      const r = await apiFetch(`/api/artwork/${id}/bookmark`, { method: "POST" });
      if (r.status === 401) {
        setBookmarked(prev);
        setBookmarks((n) => Math.max(0, n + (prev ? 1 : -1)));
        alert("Please log in to bookmark artworks.");
        return;
      }
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) throw new Error(j?.error || "Toggle failed");
      if (typeof j.bookmarked === "boolean") setBookmarked(j.bookmarked);
    } catch (e) {
      setBookmarked(prev);
      setBookmarks((n) => Math.max(0, n + (prev ? 1 : -1)));
      alert(e.message || "Bookmark failed");
    } finally {
      setBookmarking(false);
    }
  };

  const onPost = async () => {
    if (!comment.trim()) return;
    setPosting(true);
    try {
      const r = await apiFetch(`/api/artwork/${id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment.trim() }),
      });
      if (r.status === 401) {
        alert("Please log in to comment.");
        setPosting(false);
        return;
      }
      const j = await r.json().catch(() => ({}));
      if (j?.ok) {
        await fetchListing();
        setComment("");
      } else {
        alert(j?.error || "Post failed");
      }
    } catch (e) {
      alert(e.message || "Post failed");
    } finally {
      setPosting(false);
    }
  };

  const onShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  if (!data) {
    return (
      <div className="listing-stage">
        <div className="listing-frame">
          <div className="loading">Loading…</div>
        </div>
      </div>
    );
  }
  if (!data.ok || !listing) {
    return (
      <div className="listing-stage">
        <div className="listing-frame">
          <div className="error">Failed to load listing.</div>
        </div>
      </div>
    );
  }

  return (
    <main className="listing-stage">
      <div className="listing-frame">
        {/* header */}
        <div className="head-row">
          <div className="title">{listing.title || "Untitled"}</div>
          <div className="by">by</div>
          {creator ? (
            <Link className="creator-link" to={`/user/${creator.id}`}>@{creator.username}</Link>
          ) : (
            <span>—</span>
          )}
        </div>

        {/* main grid */}
        <div className="grid">
          {/* left: image */}
          <section className="card preview-col">
            {imageSrc ? (
              <img
                className="listing-img"
                src={imageSrc}
                alt={listing.title || "artwork"}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget.nextElementSibling;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
            ) : null}
            <div className="img-fallback">No image</div>
          </section>

          {/* right: info */}
          <aside className="card info-col">
            <div className="price-row">
              <div className="price-k">Price</div>
              <div className="price-v">{priceLine}</div>
            </div>
            <div className="ed-row">
              <div className="ed-k">Edition</div>
              <div className="ed-v">{editionLine}</div>
            </div>

            <div className="cta-row">
              <button
                className={["btn", liked ? "is-on" : ""].join(" ")}
                onClick={onToggleLike}
                disabled={liking}
                title={liked ? "Unlike" : "Like"}
              >
                {liked ? "♥ Liked" : "❤ Like"} ({likes})
              </button>

              <button
                className={["btn", bookmarked ? "is-on" : ""].join(" ")}
                onClick={onToggleBookmark}
                disabled={bookmarking}
                title={bookmarked ? "Remove bookmark" : "Bookmark"}
              >
                {bookmarked ? "★ Bookmarked" : "✭ Bookmark"} ({bookmarks})
              </button>

              {data.is_owner ? (
                <Link className="btn is-alt" to={`/upload/review`}>
                  Manage
                </Link>
              ) : null}

              <button className="btn ghost" onClick={onShare} title="Copy link">
                Share
              </button>

              {/* quick link to verify page */}
              <Link className="btn ghost" to={verifyHref} title="Verify record" target="_blank" rel="noreferrer">
                Verify
              </Link>

              {/* QR download button (generates PNG) */}
              <QRDownloadButton
                value={absoluteVerifyUrl}
                filename={`taedal-art-${listing.id}-qr.png`}
                size={768}
              />
            </div>

            <div className="meta">
              <div className="kv two-col">
                <div className="k">Published</div>
                <div className="v"><PrettyDate iso={listing.published_at} /></div>
              </div>
              <div className="kv two-col">
                <div className="k">Token</div>
                <div className="v mono">{listing.token_id ? `#${listing.token_id}` : "—"}</div>
              </div>
              <div className="kv two-col">
                <div className="k">IPFS</div>
                <div className="v mono">{listing.ipfs_cid || "—"}</div>
              </div>
              <div className="kv two-col">
                <div className="k">TX</div>
                <div className="v mono">{listing.tx_hash || "—"}</div>
              </div>
            </div>
          </aside>
        </div>

        {/* tabs */}
        <div className="tabs">
          {["details","orders","activity"].map((t) => (
            <button
              key={t}
              className={["tab", tab === t ? "is-active" : ""].join(" ")}
              onClick={() => setTab(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* panels */}
        <section className="card panel">
          {tab === "details" && (
            <div className="details-panel">
              <h3 className="details-title">{listing.title || "Untitled"}</h3>
              <div className={["desc", (listing.description || "").trim() ? "" : "empty"].join(" ")}>
                {(listing.description || "").trim() || "No description yet."}
              </div>
            </div>
          )}

          {tab === "orders" && <div className="empty-panel">No orders yet.</div>}
          {tab === "activity" && <div className="empty-panel">No activity yet.</div>}
        </section>

        {/* comments */}
        <section className="card comments">
          <div className="c-head">Comments ({(data.comments || []).length || 0})</div>

          {(data.comments || []).length === 0 ? (
            <div className="c-none">No comments yet.</div>
          ) : (
            <div>
              {(data.comments || []).map((c) => (
                <div key={c.id} className="c-item">
                  <div className="c-user">@{c.username}</div>
                  <div className="c-date"><PrettyDate iso={c.created_at} /></div>
                  <div className="c-body">{c.body}</div>
                </div>
              ))}
            </div>
          )}

          <div className="c-form">
            <input
              className="c-input"
              placeholder="Add a comment…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onPost();
                }
              }}
            />
            <button className="btn" onClick={onPost} disabled={posting || !comment.trim()}>
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
