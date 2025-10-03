// C:\Users\User\Downloads\taedal-project\client\src\Community.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./User.css";
import "./Community.css";
import Navbar from "./components/Navbar";
import ArtworkModal from "./components/ArtworkModal";
import { API_BASE, apiFetch } from "./lib/config";

const API = API_BASE;

const isHttp = (u) => /^https?:\/\//i.test(u);
const looksLikeCid = (s) =>
  !!s && (/^ipfs:\/\//i.test(s) || /^[a-z0-9]{46,}$/i.test(s));

const toGateway = (cidOrUri) => {
  if (!cidOrUri) return null;
  const cid = cidOrUri.startsWith("ipfs://") ? cidOrUri.slice(7) : cidOrUri;
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
};

function resolveImagePath(image) {
  if (!image) return null;

  // Already a full URL or blob
  if (typeof image === "string" && (isHttp(image) || image.startsWith("blob:"))) {
    return image;
  }

  // If it's a CID or ipfs://
  if (typeof image === "string" && looksLikeCid(image)) {
    return toGateway(image);
  }

  // Normalize server-side upload paths / filenames
  let u = String(image).replace(/\\/g, "/").replace(/^\.(\/|\\)/, "");
  const idx = u.toLowerCase().lastIndexOf("/uploads/");
  if (idx !== -1) u = u.slice(idx + 1);

  if (u.startsWith("/uploads/")) return `${API}${u}`;
  if (u.startsWith("uploads/")) return `${API}/${u}`;
  if (!u.includes("/")) return `${API}/uploads/${u}`;

  return `${API}/${u.replace(/^\/+/, "")}`;
}

export default function Community() {
  const [tab, setTab] = useState("forYou");
  const [me, setMe] = useState(null);
  const [all, setAll] = useState([]);
  const [loadingAll, setLoadingAll] = useState(true);

  const [feed, setFeed] = useState([]);
  const [feedCursor, setFeedCursor] = useState(null);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedError, setFeedError] = useState("");

  const [selected, setSelected] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // who am I?
  useEffect(() => {
    apiFetch("/api/check-session")
      .then((r) => r.json())
      .then((j) => setMe(j.isLoggedIn ? j.userId : null))
      .catch(() => setMe(null));
  }, []);

  // For You (global)
  useEffect(() => {
    setLoadingAll(true);
    apiFetch("/api/artworks")
      .then((r) => r.json())
      .then((j) => setAll(j.artworks || []))
      .finally(() => setLoadingAll(false));
  }, []);

  // Following feed (cursor)
  const fetchFollowing = async ({ reset } = { reset: false }) => {
    if (!me) {
      setFeedError("Please log in to view your following feed.");
      return;
    }
    if (loadingFeed) return;

    setFeedError("");
    setLoadingFeed(true);

    try {
      let url = `/api/feed?following=1&limit=12`;
      if (!reset && feedCursor) url += `&cursor=${encodeURIComponent(feedCursor)}`;

      const r = await apiFetch(url);
      if (r.status === 401) throw new Error("Please log in to view your following feed.");

      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to load feed");

      const items = j.items || j.artworks || [];
      if (reset) setFeed(items);
      else setFeed((prev) => [...prev, ...items]);

      setFeedCursor(j.nextCursor || null);
      setFeedHasMore(Boolean(j.nextCursor));
    } catch (e) {
      setFeedError(e.message || "Failed to load feed");
    } finally {
      setLoadingFeed(false);
    }
  };

  // load when switching to Following
  useEffect(() => {
    if (tab !== "following") return;
    setFeed([]);
    setFeedCursor(null);
    setFeedHasMore(true);
    fetchFollowing({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, me]);

  // react to follow changes anywhere in the app
  useEffect(() => {
    const refreshIfOpen = () => {
      if (tab === "following") fetchFollowing({ reset: true });
    };

    // unified event
    window.addEventListener("follow-changed", refreshIfOpen);

    // backward-compat: normalize legacy event name
    const legacyHandler = (e) => {
      try {
        const detail = e?.detail || {};
        window.dispatchEvent(new CustomEvent("follow-changed", { detail }));
      } catch {}
    };
    window.addEventListener("taedal:follow-updated", legacyHandler);

    return () => {
      window.removeEventListener("follow-changed", refreshIfOpen);
      window.removeEventListener("taedal:follow-updated", legacyHandler);
    };
  }, [tab]);

  // rebind if tab changes
  const list = useMemo(() => (tab === "following" ? feed : all), [tab, feed, all]);

  const onDeleted = (id) => {
    if (tab === "following") setFeed((arr) => arr.filter((a) => a.id !== id));
    else setAll((arr) => arr.filter((a) => a.id !== id));
  };

  const onUpdated = (updated) => {
    const patch = (arr) => arr.map((a) => (a.id === updated.id ? { ...a, ...updated } : a));
    if (tab === "following") setFeed(patch);
    else setAll(patch);
  };

  return (
    <div className="profile-page">
      <Navbar />

      {/* small title */}
      <div style={{ textAlign: "center", marginTop: 22 }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>discover new art</h2>
        <div style={{ opacity: 0.65, fontSize: 12, marginTop: 4 }}>
          fresh uploads from independent artists, pinned on IPFS.
        </div>
      </div>

      {/* Tabs */}
      <div className="comm-tabs">
        <button
          className={`comm-tab ${tab === "forYou" ? "active" : ""}`}
          onClick={() => setTab("forYou")}
        >
          For You
        </button>
        <button
          className={`comm-tab ${tab === "following" ? "active" : ""}`}
          onClick={() => setTab("following")}
          disabled={!me}
          title={!me ? "Log in to see Following" : ""}
        >
          Following
        </button>
      </div>

      {/* Grid */}
      <section className="user-grid">
        {tab === "following" && !me ? (
          <div className="empty">please log in to see posts from creators you follow.</div>
        ) : null}

        {tab === "following" && feedError ? (
          <div className="empty" style={{ opacity: 0.85 }}>
            {feedError}
          </div>
        ) : null}

        {(tab === "forYou" && loadingAll) ||
        (tab === "following" && loadingFeed && list.length === 0) ? (
          Array.from({ length: 9 }).map((_, i) => <div key={i} className="user-card skeleton" />)
        ) : list.length === 0 ? (
          <div className="empty">no artworks yet.</div>
        ) : (
          <>
            {list.map((a) => {
              const src = resolveImagePath(a.image_url || a.image_file);
              return (
                <button
                  key={`${tab}-${a.id}`}
                  className="user-card"
                  onClick={() => {
                    setSelected(a);
                    setSelectedId(a.id);
                  }}
                  title={a.title}
                >
                  {src ? (
                    <img
                      src={src}
                      alt={a.title}
                      loading="lazy"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  ) : (
                    <div className="img-fallback">No image</div>
                  )}
                  {a.ipfs_cid ? <span className="badge-mini">minted</span> : null}
                </button>
              );
            })}
          </>
        )}
      </section>

      {/* Load more for Following */}
      {tab === "following" && list.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", margin: "16px 0 40px" }}>
          {feedHasMore ? (
            <button
              onClick={() => fetchFollowing({ reset: false })}
              disabled={loadingFeed}
              style={{
                background: "#fff",
                color: "#000",
                border: "none",
                borderRadius: 12,
                padding: "10px 16px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 2px 0 #000, 0 8px 24px rgba(0,0,0,.3)",
                opacity: loadingFeed ? 0.8 : 1,
              }}
            >
              {loadingFeed ? "Loading…" : "Load more"}
            </button>
          ) : (
            <div className="empty" style={{ opacity: 0.7 }}>
              you’re all caught up ✨
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {selectedId && (
        <ArtworkModal
          artwork={selected}
          artworkId={selectedId}
          onClose={() => {
            setSelected(null);
            setSelectedId(null);
          }}
          onDeleted={onDeleted}
          onUpdated={onUpdated}
        />
      )}
    </div>
  );
}
