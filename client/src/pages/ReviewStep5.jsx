// client/src/pages/ReviewStep5.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./ReviewStep5.css";

/* Stepper */
import Step1Done from "../assets/minting-page/step-1-done.svg";
import Step2Done from "../assets/minting-page/step-2-done.svg";
import Step3Done from "../assets/minting-page/step-3-done.svg";
import Step4Done from "../assets/minting-page/step-4-done.svg";
import Step5D from "../assets/minting-page/step-5.svg";
import ProgressLine from "../assets/minting-page/progress-line.svg";

/* Small glyphs */
import EditIcon from "../assets/review-page/edit-pencil.svg";

/* Chain helpers */
import { CHAIN_ID, NFT_ADDRESS } from "../eth";

/* Config + absolute URL helper */
import { API_BASE } from "../lib/config";
import { toAbsolute } from "../lib/urls";

const API = API_BASE;

const isHttp = (u) => /^https?:\/\//i.test(u);
const looksLikeCid = (s) =>
  !!s && (/^ipfs:\/\//i.test(s) || /^[a-z0-9]{46,}$/i.test(s));

function toGatewayUrl(cidOrUri) {
  if (!cidOrUri) return null;
  const cid = cidOrUri.startsWith("ipfs://") ? cidOrUri.slice(7) : cidOrUri;
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}

/** Turn anything we might get for image_url into a proper http URL */
function resolveServerImageURL(image_url) {
  if (!image_url) return null;
  if (image_url.startsWith("blob:")) return image_url;
  if (isHttp(image_url)) return image_url;
  if (looksLikeCid(image_url)) return toGatewayUrl(image_url);

  let u = String(image_url)
    .replace(/\\/g, "/")
    .replace(/^\.(\/|\\)/, "");

  const idx = u.toLowerCase().lastIndexOf("/uploads/");
  if (idx !== -1) u = u.slice(idx + 1);

  if (u.startsWith("/uploads/")) return `${API}${u}`;
  if (u.startsWith("uploads/")) return `${API}/${u}`;
  if (!u.includes("/")) return `${API}/uploads/${u}`;
  return `${API}/${u.replace(/^\/+/, "")}`;
}

function useExplorer() {
  const id = Number(CHAIN_ID);
  if (id === 84532) {
    return {
      label: "Base Sepolia",
      tx: (h) => `https://sepolia.basescan.org/tx/${h}`,
      token: (addr, tokenId) =>
        `https://sepolia.basescan.org/token/${addr}?a=${tokenId}`,
    };
  }
  if (id === 1) {
    return {
      label: "Ethereum",
      tx: (h) => `https://etherscan.io/tx/${h}`,
      token: (addr, tokenId) => `https://etherscan.io/token/${addr}?a=${tokenId}`,
    };
  }
  return {
    label: `Chain ${id}`,
    tx: (h) => `https://etherscan.io/tx/${h}`,
    token: (addr, tokenId) => `https://etherscan.io/token/${addr}?a=${tokenId}`,
  };
}

export default function ReviewStep5() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const explorer = useExplorer();

  // agree/publish state
  const [agree, setAgree] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState(null);

  // From prior steps
  const nav = state?.data || {};
  const navImages = nav.images || [];
  const navDetails = nav.details || {};
  const navPricing = nav.pricing || {};
  const navChain = nav.chain || {};

  // LocalStorage fallbacks
  const ls = {
    createdArtworkId: localStorage.getItem("createdArtworkId"),
    imageUrl: localStorage.getItem("imageUrl"),
    ipfsCid: localStorage.getItem("ipfsCid"),
    metadataCid: localStorage.getItem("metadataCid"),
    tokenId:
      localStorage.getItem("lastTokenId") || localStorage.getItem("tokenId"),
    txHash:
      localStorage.getItem("lastTxHash") || localStorage.getItem("txHash"),
    contract:
      localStorage.getItem("lastContract") ||
      localStorage.getItem("contractAddress") ||
      NFT_ADDRESS,
    detailsDraft: localStorage.getItem("detailsDraft"),
    pricingDraft: localStorage.getItem("pricingDraft"),
  };

  let draftDetails = {};
  try {
    draftDetails = ls.detailsDraft ? JSON.parse(ls.detailsDraft) : {};
  } catch {}
  let draftPricing = {};
  try {
    draftPricing = ls.pricingDraft ? JSON.parse(ls.pricingDraft) : {};
  } catch {}

  // (Optional) hydrate from server if we lack fields
  const [serverArt, setServerArt] = useState(null);

  useEffect(() => {
    const missingTitle = !(navDetails.title || draftDetails.title);
    const missingDesc = !(navDetails.description || draftDetails.description);
    const missingImg = !(navImages[0]?.url) && !(ls.imageUrl) && !(ls.ipfsCid);

    if (!ls.createdArtworkId || !(missingTitle || missingDesc || missingImg)) {
      return;
    }

    let ignore = false;
    (async () => {
      try {
        const r = await fetch(`${API}/api/artwork/${ls.createdArtworkId}`, {
          credentials: "include",
        });
        const j = await r.json().catch(() => ({}));
        if (!ignore && j?.ok && j?.artwork) {
          setServerArt(j.artwork);
          if (j.artwork.published && j.artwork.published_at) {
            setPublishedAt(j.artwork.published_at);
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      ignore = true;
    };
  }, [
    navDetails.title,
    navDetails.description,
    navImages,
    ls.createdArtworkId,
    ls.imageUrl,
    ls.ipfsCid,
    draftDetails.title,
    draftDetails.description,
  ]);

  // Compose display fields
  const title =
    navDetails.title || draftDetails.title || serverArt?.title || "Untitled";

  const description =
    navDetails.description ||
    draftDetails.description ||
    serverArt?.description ||
    "";

  const pricing = {
    currency: navPricing.currency || draftPricing.currency || "USD",
    price: navPricing.price ?? draftPricing.price ?? serverArt?.price ?? 0,
    edition: navPricing.edition || draftPricing.edition || "single",
    editionSize: navPricing.editionSize || draftPricing.editionSize || 1,
  };

  const editionLabel =
    pricing.edition === "limited"
      ? `${pricing.editionSize || 1} / limited`
      : pricing.edition === "open"
      ? "open edition"
      : "1 / 1";

  // Preview image resolution
  const previewSrc = useMemo(() => {
    if (navImages[0]?.url) return navImages[0].url;
    if (ls.imageUrl) return resolveServerImageURL(ls.imageUrl);
    if (serverArt?.image_url) return resolveServerImageURL(serverArt.image_url);
    if (ls.ipfsCid) return toGatewayUrl(ls.ipfsCid);
    return null;
  }, [navImages, ls.imageUrl, serverArt?.image_url, ls.ipfsCid]);

  // Chain bits
  const tokenId = navChain.tokenId || ls.tokenId || "—";
  const contract = navChain.contract || ls.contract || "—";
  const chainLabel = navChain.chainLabel || explorer.label;
  const txHash = navChain.txHash || ls.txHash || null;

  const etherscanTx = txHash ? explorer.tx(txHash) : null;
  const etherscanToken =
    tokenId && tokenId !== "—" ? explorer.token(contract, tokenId) : null;

  // Publish flow
  const onPublish = async () => {
    if (!agree || publishing) return;
    const id = Number(ls.createdArtworkId);
    if (!id) {
      alert("Missing artwork id.");
      return;
    }
    try {
      setPublishing(true);
      const r = await fetch(`${API}/api/artwork/${id}/publish`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Publish failed");
      setPublishedAt(j.published_at || new Date().toISOString());
    } catch (e) {
      alert(`Publish error: ${e.message || e}`);
    } finally {
      setPublishing(false);
    }
  };

  const listingHref = `/listing/${Number(ls.createdArtworkId || 0) || ""}`;
  const absoluteListingHref = toAbsolute(listingHref);

  return (
    <main className="review-stage">
      <div className="review-frame" aria-label="Review – Step 5">
        {/* Stepper */}
        <img className="abs step step-1" src={Step1Done} alt="step 1 done" />
        <img className="abs line line-1" src={ProgressLine} alt="" />
        <img className="abs step step-2" src={Step2Done} alt="step 2 done" />
        <img className="abs line line-2" src={ProgressLine} alt="" />
        <img className="abs step step-3" src={Step3Done} alt="step 3 done" />
        <img className="abs line line-3" src={ProgressLine} alt="" />
        <img className="abs step step-4" src={Step4Done} alt="step 4 done" />
        <img className="abs line line-4" src={ProgressLine} alt="" />
        <img className="abs step step-5" src={Step5D} alt="step 5 current" />

        {/* Content grid */}
        <div className="rev-grid">
          {/* Left: Preview */}
          <section className="card rev-preview">
            <div className="card-head">
              <div className="card-title">Artwork Preview</div>
              <button
                className="edit-btn"
                onClick={() => navigate("/upload/details")}
                title="Edit artwork files/details"
              >
                <img src={EditIcon} alt="" />
              </button>
            </div>

            <div className="badge">Physical + NFT</div>

            <div className="preview-box">
              {previewSrc ? (
                <img
                  className="preview-img"
                  src={previewSrc}
                  alt={title}
                  onError={(e) => {
                    const bad = e.currentTarget.getAttribute("src") || "";
                    const fixed = resolveServerImageURL(bad);
                    if (fixed && fixed !== bad) {
                      e.currentTarget.src = fixed;
                      return;
                    }
                    e.currentTarget.style.display = "none";
                    const holder = e.currentTarget.nextElementSibling;
                    if (holder) holder.style.display = "block";
                  }}
                />
              ) : null}
              <div className="preview-alt">{title}</div>
            </div>

            <div className="mini-stats">
              <div>
                <div className="ms-k">Files</div>
                <div className="ms-v">1</div>
              </div>
              <div>
                <div className="ms-k">Edition</div>
                <div className="ms-v">
                  {pricing.edition === "limited"
                    ? pricing.editionSize || 1
                    : pricing.edition === "open"
                    ? "∞"
                    : "1"}
                </div>
              </div>
            </div>
          </section>

          {/* Right column */}
          <div className="rev-right">
            {/* Details */}
            <section className="card rev-details">
              <div className="card-head">
                <div className="card-title">Details</div>
                <button
                  className="edit-btn"
                  onClick={() => navigate("/upload/details")}
                  title="Edit details"
                >
                  <img src={EditIcon} alt="" />
                </button>
              </div>

              <div className="kv-row">
                <div className="kv">
                  <div className="k">Title</div>
                  <div className="v">{title}</div>
                </div>
                <div className="kv">
                  <div className="k">Medium</div>
                  <div className="v">
                    {navDetails.medium || draftDetails.medium || "—"}
                  </div>
                </div>
              </div>

              <div className="kv-row">
                <div className="kv">
                  <div className="k">Category</div>
                  <div className="v">
                    {navDetails.category || draftDetails.category || "—"}
                  </div>
                </div>
                <div className="kv">
                  <div className="k">Year</div>
                  <div className="v">
                    {navDetails.year || draftDetails.year || "—"}
                  </div>
                </div>
              </div>

              {(description || "").trim() ? (
                <div className="desc">{description}</div>
              ) : null}
            </section>

            {/* Pricing */}
            <section className="card rev-pricing">
              <div className="card-head">
                <div className="card-title">$ Pricing</div>
                <button
                  className="edit-btn"
                  onClick={() => navigate("/upload/pricing")}
                  title="Edit pricing"
                >
                  <img src={EditIcon} alt="" />
                </button>
              </div>

              <div className="price-row">
                <div className="k">Price</div>
                <div className="v strong">
                  {(pricing.currency || "USD")}{" "}
                  {Number(pricing.price || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>

              <div className="kv">
                <div className="k">Edition type</div>
                <div className="v">{editionLabel}</div>
              </div>

              <div className="kv">
                <div className="k">Royalties</div>
                <div className="v">10%</div>
              </div>
            </section>

            {/* Chain */}
            <section className="card rev-chain">
              <div className="card-head">
                <div className="card-title">Blockchain</div>
              </div>

              <div className="kv">
                <div className="k">Network</div>
                <div className="v">{chainLabel}</div>
              </div>
              <div className="kv">
                <div className="k">Standard</div>
                <div className="v">ERC-721</div>
              </div>
              <div className="kv">
                <div className="k">Token ID</div>
                <div className="v mono">#{tokenId || "—"}</div>
              </div>
              <div className="kv">
                <div className="k">IPFS Hash</div>
                <div className="v mono">
                  {ls.ipfsCid ? `${ls.ipfsCid.slice(0, 10)}…` : "—"}
                </div>
              </div>

              <div className="kv">
                <div className="k">Links</div>
                <div className="v links">
                  {explorer && (ls.txHash || navChain.txHash) ? (
                    <a
                      href={explorer.tx(ls.txHash || navChain.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="a"
                    >
                      View transaction on Etherscan ↗
                    </a>
                  ) : null}
                  {explorer && contract && tokenId && tokenId !== "—" ? (
                    <a
                      href={explorer.token(contract, tokenId)}
                      target="_blank"
                      rel="noreferrer"
                      className="a"
                    >
                      View token on Etherscan ↗
                    </a>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Agreement + publish */}
        <section className="agree-publish card">
          <label className="agree-row">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span>
              I agree to the <u>Terms of Service</u> and <u>Creator Agreement</u>
            </span>
          </label>

          <div className="ready-box">
            <div className="ready-left">
              <div className="ready-title">
                {publishedAt ? "Published!" : "Ready to publish!"}
              </div>
              <div className="ready-sub">
                {publishedAt
                  ? "Your artwork is live on the marketplace."
                  : "Your artwork will be live on the marketplace immediately after publishing."}
              </div>
              <div className="ready-foot">
                {publishedAt
                  ? `Published at ${new Date(publishedAt).toLocaleString()}`
                  : "Publishing to Taedal Marketplace"}
              </div>
            </div>

            <div className="ready-right">
              <div className="eta-k">Estimated time</div>
              <div className="eta-v">~30 seconds</div>
            </div>
          </div>

          <div className="publish-row">
            <button
              className="ghost-btn"
              onClick={() => navigate("/upload/confirm")}
            >
              Back to Mint
            </button>

            {!publishedAt ? (
              <button
                className="primary-btn"
                onClick={onPublish}
                disabled={!agree || publishing}
                title={!agree ? "You must agree first" : "Publish"}
              >
                {publishing ? "Publishing…" : "Publish Artwork"}
              </button>
            ) : (
              // Absolute link so it works perfectly when scanned/shared
              <a
                className="primary-btn"
                href={absoluteListingHref}
                title="View your live listing"
              >
                View Listing
              </a>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
