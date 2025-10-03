// client/src/pages/ListingView.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import "./ListingView.css";
import { CHAIN_ID, NFT_ADDRESS, txUrl, tokenUrl } from "../eth";

const API = "http://localhost:5000";

const toGateway = (cid) =>
  cid ? `https://gateway.pinata.cloud/ipfs/${cid.replace(/^ipfs:\/\//, "")}` : null;

const money = (v, currency = "USD") => {
  if (v == null || Number.isNaN(Number(v))) return `${currency} —`;
  const n = Number(v);
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export default function ListingView() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("details");
  const [loading, setLoading] = useState(true);

  const lsPricing = (() => {
    try {
      const d = JSON.parse(localStorage.getItem("pricingDraft") || "{}");
      return d;
    } catch {
      return {};
    }
  })();

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const r = await fetch(`${API}/api/listing/${id}`, { credentials: "include" });
        const j = await r.json().catch(() => ({}));
        if (!ignore) {
          setData(j?.ok ? j : { ok: false, error: "Not found" });
          setLoading(false);
        }
      } catch {
        if (!ignore) {
          setData({ ok: false, error: "Network error" });
          setLoading(false);
        }
      }
    })();
    return () => { ignore = true; };
  }, [id]);

  const listing = data?.listing || {};
  const creator = data?.creator || {};

  const priceLabel = useMemo(() => {
    const p = listing.price ?? (lsPricing.price != null ? Number(lsPricing.price) : null);
    const cur = listing.currency || lsPricing.currency || "USD";
    return money(p, cur);
  }, [listing.price, listing.currency, lsPricing]);

  const tokenHref = listing.token_id ? tokenUrl(listing.token_id) : null;
  const txHref = listing.tx_hash ? txUrl(listing.tx_hash) : null;

  const imageSrc = useMemo(() => {
    const raw = listing.image_url;
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw) || raw.startsWith("blob:")) return raw;
    // normalize /uploads path
    const cleaned = String(raw).replace(/\\/g, "/");
    const rel = cleaned.startsWith("/")
      ? cleaned
      : `/${cleaned}`;
    return `${API}${rel}`;
  }, [listing.image_url]);

  if (loading) {
    return <main className="listing-page"><div className="lv-container">Loading…</div></main>;
  }
  if (!data?.ok) {
    return <main className="listing-page"><div className="lv-container">Listing not found.</div></main>;
  }

  return (
    <main className="listing-page">
      <div className="lv-container">
        {/* Left: media */}
        <div className="lv-left">
          {imageSrc ? (
            <img className="lv-image" src={imageSrc} alt={listing.title} />
          ) : (
            <div className="lv-image alt">No image</div>
          )}

          {/* thumbnails row (optional future) */}
          <div className="lv-thumbs" />
        </div>

        {/* Right: info */}
        <div className="lv-right">
          <div className="lv-title">
            {listing.title}
            {listing.token_id ? <span className="mono">#{listing.token_id}</span> : null}
          </div>

          <div className="lv-sub">
            <span>by&nbsp;
              {creator?.id ? (
                <Link to={`/user/${creator.id}`}>@{creator.username}</Link>
              ) : (
                <span>@unknown</span>
              )}
            </span>
            <span className="dot">•</span>
            <span>ERC-721</span>
            <span className="dot">•</span>
            <span>{Number(CHAIN_ID) === 1 ? "Ethereum" : "Base Sepolia"}</span>
          </div>

          <div className="lv-price-card">
            <div className="lv-price">{priceLabel}</div>
            <div className="lv-cta">
              <button className="buy-btn" disabled>Buy now</button>
              <button className="offer-btn" disabled>Make offer</button>
            </div>
            <div className="lv-links">
              {txHref ? <a href={txHref} target="_blank" rel="noreferrer">View tx ↗</a> : null}
              {tokenHref ? <a href={tokenHref} target="_blank" rel="noreferrer">View token ↗</a> : null}
              {listing.ipfs_cid ? <a href={toGateway(listing.ipfs_cid)} target="_blank" rel="noreferrer">IPFS ↗</a> : null}
            </div>
          </div>

          {/* Tabs */}
          <div className="lv-tabs">
            <button className={tab === "details" ? "is-active" : ""} onClick={() => setTab("details")}>Details</button>
            <button className={tab === "orders" ? "is-active" : ""} onClick={() => setTab("orders")}>Orders</button>
            <button className={tab === "activity" ? "is-active" : ""} onClick={() => setTab("activity")}>Activity</button>
          </div>

          {/* Panels */}
          <div className="lv-panel">
            {tab === "details" && (
              <div className="lv-details">
                {listing.description ? <p className="lv-desc">{listing.description}</p> : <p className="lv-muted">No description.</p>}
                <div className="kv">
                  <div className="k">Contract</div>
                  <div className="v mono">{NFT_ADDRESS ? `${NFT_ADDRESS.slice(0, 10)}…` : "—"}</div>
                </div>
                <div className="kv">
                  <div className="k">Token ID</div>
                  <div className="v mono">{listing.token_id || "—"}</div>
                </div>
                <div className="kv">
                  <div className="k">Edition</div>
                  <div className="v">
                    {(listing.edition || "single") === "limited"
                      ? `${listing.edition_size || 1} / limited`
                      : (listing.edition === "open" ? "open edition" : "1 / 1")}
                  </div>
                </div>
                <div className="kv">
                  <div className="k">Created</div>
                  <div className="v">{new Date(listing.date_created).toLocaleString()}</div>
                </div>
                <div className="kv">
                  <div className="k">Likes</div>
                  <div className="v">{data.counts?.likes ?? 0}</div>
                </div>
                <div className="kv">
                  <div className="k">Bookmarks</div>
                  <div className="v">{data.counts?.bookmarks ?? 0}</div>
                </div>
              </div>
            )}

            {tab === "orders" && (
              <div className="lv-orders">
                <div className="lv-muted">No on-chain orders yet. (Hook your marketplace later.)</div>
              </div>
            )}

            {tab === "activity" && (
              <div className="lv-activity">
                {Array.isArray(data.activity) && data.activity.length > 0 ? (
                  data.activity.map((a, i) => (
                    <div key={i} className="act-row">
                      <div className="act-type">{a.type}</div>
                      <div className="act-body">
                        <span className="mono">@{a.by_username}</span> — {a.body}
                      </div>
                      <div className="act-time">
                        {new Date(a.at).toLocaleString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="lv-muted">No recent activity.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
