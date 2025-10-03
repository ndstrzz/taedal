// C:\Users\User\Downloads\taedal-project\client\src\VerifyPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "./VerifyPage.css";
import { API_BASE, apiFetch } from "./lib/config";

const API = API_BASE;

const isHttp = (u) => /^https?:\/\//i.test(u);
const looksLikeCid = (s) =>
  !!s && (/^ipfs:\/\//i.test(s) || /^[a-z0-9]{46,}$/i.test(s));

const toGatewayUrl = (cidOrUri) => {
  if (!cidOrUri) return null;
  const cid = cidOrUri.startsWith("ipfs://") ? cidOrUri.slice(7) : cidOrUri;
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
};

/** Normalize server image paths, CIDs, and absolute URLs */
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

function PrettyDate({ iso }) {
  if (!iso) return <span>—</span>;
  let d;
  try {
    d = new Date(iso);
  } catch {
    return <span>{iso}</span>;
  }
  return <time dateTime={iso}>{d.toLocaleString()}</time>;
}

function Mono({ children }) {
  return <span className="mono">{children}</span>;
}

function truncateMiddle(s, keep = 6) {
  if (!s || s.length <= keep * 2 + 3) return s || "";
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}

export default function VerifyPage() {
  // We support both routes: /verify/:tokenId and /verify/:ref
  const { tokenId, ref: refParam } = useParams();
  const ref = tokenId ?? refParam;

  const [data, setData] = useState(null); // { ok, verify: {...} }
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");

  const fetchVerify = async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await apiFetch(`/api/verify/${encodeURIComponent(ref)}`);
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) {
        setErr(j?.error || "not_found");
        setData(null);
      } else {
        setData(j);
      }
    } catch (e) {
      setErr(e.message || "load_failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ref) fetchVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  const v = data?.verify || null;
  const art = v?.artwork || null;
  const storage = v?.storage || {};
  const token = v?.token || {};

  const imageSrc = useMemo(() => resolveServerImageURL(art?.image_url), [art?.image_url]);

  const copy = async (val, label) => {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(String(val));
      setCopied(`${label} copied`);
      setTimeout(() => setCopied(""), 1200);
    } catch {
      setCopied("Copy failed");
      setTimeout(() => setCopied(""), 1200);
    }
  };

  if (!ref) {
    return (
      <main className="verify-stage">
        <div className="verify-frame">
          <div className="card center error">Missing reference.</div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="verify-stage">
        <div className="verify-frame">
          <div className="card center">
            <div className="big-title">Verifying…</div>
            <div className="sub">Hang tight while we fetch authenticity data.</div>
          </div>
        </div>
      </main>
    );
  }

  if (err || !v || !art) {
    return (
      <main className="verify-stage">
        <div className="verify-frame">
          <div className="card center error">
            <div className="big-title">Not found</div>
            <div className="sub">
              We couldn’t find an artwork for <Mono>{truncateMiddle(String(ref), 10)}</Mono>.
            </div>
            <button className="btn" onClick={fetchVerify}>
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  const statusLine = art.published ? "Authentic record found" : "Unpublished draft (owner view)";
  const listingHref = `/listing/${art.id}`;

  return (
    <main className="verify-stage">
      <div className="verify-frame">
        {copied ? <div className="toast">{copied}</div> : null}

        <div className="head">
          <div className="check">✓</div>
          <div className="head-text">
            <div className="k">verification</div>
            <div className="v">{statusLine}</div>
          </div>
        </div>

        <div className="grid">
          {/* left: image */}
          <section className="card preview">
            {imageSrc ? (
              <img
                className="art-img"
                src={imageSrc}
                alt={art.title || "artwork"}
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            ) : (
              <div className="img-fallback">No image</div>
            )}
          </section>

          {/* right: facts */}
          <aside className="card facts">
            <div className="title">{art.title || "Untitled"}</div>
            <div className="by">
              by{" "}
              {art?.creator?.id ? (
                <Link to={`/user/${art.creator.id}`} className="creator">
                  @{art.creator.username}
                </Link>
              ) : (
                <span>@{art?.creator?.username || "creator"}</span>
              )}
            </div>

            <div className="kv">
              <div className="k">Published</div>
              <div className="v">
                <PrettyDate iso={art.published_at} />
              </div>
            </div>

            <div className="block">
              <div className="block-title">Storage</div>
              <div className="kv">
                <div className="k">Image CID</div>
                <div className="v mono">
                  {storage.ipfs_cid ? (
                    <>
                      <a
                        href={storage.ipfs_gateway_url || toGatewayUrl(storage.ipfs_cid) || "#"}
                        target="_blank"
                        rel="noreferrer"
                        title="Open on IPFS gateway"
                      >
                        {truncateMiddle(storage.ipfs_cid)}
                      </a>
                      <button className="ghost" onClick={() => copy(storage.ipfs_cid, "CID")} title="Copy">
                        ⧉
                      </button>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <div className="kv">
                <div className="k">Metadata CID</div>
                <div className="v mono">
                  {storage.metadata_cid ? (
                    <>
                      <a
                        href={storage.metadata_gateway_url || toGatewayUrl(storage.metadata_cid) || "#"}
                        target="_blank"
                        rel="noreferrer"
                        title="Open metadata on IPFS gateway"
                      >
                        {truncateMiddle(storage.metadata_cid)}
                      </a>
                      <button className="ghost" onClick={() => copy(storage.metadata_cid, "CID")} title="Copy">
                        ⧉
                      </button>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </div>

            <div className="block">
              <div className="block-title">Token</div>
              <div className="kv">
                <div className="k">Token ID</div>
                <div className="v mono">{token.token_id ?? "—"}</div>
              </div>
              <div className="kv">
                <div className="k">Tx Hash</div>
                <div className="v mono">
                  {token.tx_hash ? (
                    <>
                      {truncateMiddle(token.tx_hash, 10)}
                      <button className="ghost" onClick={() => copy(token.tx_hash, "TX hash")} title="Copy">
                        ⧉
                      </button>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </div>

            <div className="cta-row">
              <Link className="btn" to={listingHref}>
                View full listing
              </Link>
              <button className="btn ghost" onClick={fetchVerify}>
                Refresh
              </button>
            </div>

            {art.description ? (
              <div className="desc">
                <div className="block-title">Description</div>
                <div className="desc-body">{art.description}</div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
