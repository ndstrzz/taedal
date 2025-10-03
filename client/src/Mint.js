// Safer mint flow with “similar-artwork review” gate.
// Adds on-chain linkage: pass artworkId to mintOnChain, then POST {tokenId, txHash} to server.

import React, { useMemo, useRef, useState } from "react";
import "./Navbar.css";
import "./Mint.css";
import Navbar from "./components/Navbar";

/* deck art */
import Deck1S from "./assets/images/decks/deck-1-static.svg";
import Deck2S from "./assets/images/decks/deck-2-static.svg";
import Deck3S from "./assets/images/decks/deck-3-static.svg";
import Deck4S from "./assets/images/decks/deck-4-static.svg";
import Deck5S from "./assets/images/decks/deck-5-static.svg";

import Deck1Open from "./assets/images/decks/deck-1-open.svg";
import Deck1Uploaded from "./assets/images/decks/deck-1-uploaded.svg";
import Deck2Open from "./assets/images/decks/deck-2-open.svg";
import Deck3Open from "./assets/images/decks/deck-3-open.svg";
import Deck4Open from "./assets/images/decks/deck-4-open.svg";
import Deck4Box from "./assets/images/decks/deck-4-box.svg";
import Deck5Open from "./assets/images/decks/deck-5-open.svg";
import Deck5Border from "./assets/images/decks/deck-5-border.svg";
import Deck5Button from "./assets/images/decks/deck-5-button.svg";

/* on-chain mint helper */
import { mintOnChain, NFT_ADDRESS, CHAIN_ID } from "./eth";

/* allowed types */
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

const API = "http://localhost:5000";

export default function Mint() {
  // deck hover/open
  const [hovered, setHovered] = useState(null);

  // Deck I (image)
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const fileInputRef = useRef(null);

  // Deck II (Artwork Title)
  const [artTitle, setArtTitle] = useState("");

  // Deck III (Description)
  const [longDesc, setLongDesc] = useState("");

  // Deck IV (rights-holder checkbox)
  const [consent, setConsent] = useState(false);

  // Success modal + uploading modal
  const [modalOpen, setModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Similar image check
  const [similar, setSimilar] = useState([]);
  const [similarReviewed, setSimilarReviewed] = useState(true);
  const [rechecking, setRechecking] = useState(false);

  // DB artwork id created by /upload (linkage)
  const [createdArtworkId, setCreatedArtworkId] = useState(null);

  // CIDs
  const [ipfsCid, setIpfsCid] = useState(null);
  const [metadataCid, setMetadataCid] = useState(null);

  // copy toasts
  const [copiedCID, setCopiedCID] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // on-chain mint
  const [minting, setMinting] = useState(false);
  const [txInfo, setTxInfo] = useState(null);

  // artist label
  const artistName = localStorage.getItem("username") || "anonymous artist";

  const isMainnet = Number(CHAIN_ID) === 1;
  const txUrl = (hash) =>
    isMainnet ? `https://etherscan.io/tx/${hash}` : `https://sepolia.etherscan.io/tx/${hash}`;
  const tokenUrl = (tokenId) =>
    isMainnet
      ? `https://opensea.io/assets/ethereum/${NFT_ADDRESS}/${tokenId}`
      : `https://sepolia.etherscan.io/token/${NFT_ADDRESS}?a=${tokenId}`;

  /* ---------------------------- file pick/validate ---------------------------- */

  const onPickFile = () => fileInputRef.current?.click();

  const handleFile = (f) => {
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) return alert("Please upload a PNG, JPG/JPEG, or WebP.");
    if (f.size > 100 * 1024 * 1024) return alert("Max file size is 100 MB.");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const onDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  };

  const onChangeFile = (e) => handleFile(e.target.files?.[0]);

  /* ------------------------------- main submit ------------------------------- */

  const handleMint = async () => {
    if (!preview) return alert("Please upload your artwork first (Deck I).");
    if (!artTitle.trim()) return alert("Please enter your artwork title (Deck II).");
    if (!consent) return alert("Please confirm you are the rights holder (Deck IV).");
    if (!file) return alert("No file selected. Please choose your image again.");

    try {
      setUploading(true);
      setTxInfo(null);
      setIpfsCid(null);
      setMetadataCid(null);
      setCopiedCID(false);
      setCopiedToken(false);
      setSimilar([]);
      setSimilarReviewed(true);
      setCreatedArtworkId(null);

      // 1) Upload image → server pins & returns basics (+possible similar[])
      const fd = new FormData();
      fd.append("artwork", file);
      fd.append("title", artTitle);
      fd.append("description", longDesc);
      fd.append("consent", consent ? "1" : "0");

      const r = await fetch(`${API}/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await r.json();
      if (!data || data.ok === false) throw new Error(data?.error || "Upload failed");

      if (typeof data.id === "number" || typeof data.id === "string") {
        setCreatedArtworkId(Number(data.id));
        console.log("[upload] artwork id:", Number(data.id));
      }

      const matches = Array.isArray(data.similar) ? data.similar : [];
      setSimilar(matches);
      setSimilarReviewed(matches.length === 0);

      setIpfsCid(data.ipfs_cid || null);

      // 2) Create ERC-721 metadata on server
      if (data.ipfs_cid) {
        const metaRes = await fetch(`${API}/api/metadata`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: artTitle,
            description: longDesc,
            imageCid: data.ipfs_cid,
            artworkId: data.id,
          }),
        });
        const meta = await metaRes.json();
        if (!meta.ok) throw new Error(meta.error || "Failed to create metadata");
        setMetadataCid(meta.metadata_cid);
      }

      setModalOpen(true);
    } catch (e) {
      console.error(e);
      alert(e.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  /* --------------------------- re-run dupe check --------------------------- */

  const rerunSimilarCheck = async () => {
    if (!file) return;
    try {
      setRechecking(true);
      const fd = new FormData();
      fd.append("artwork", file);
      const r = await fetch(`${API}/api/verify`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = await r.json();

      if (j?.success && j.match && j.record) {
        const m = {
          id: j.record.id,
          title: j.record.title,
          username: j.record.username,
          user_id: j.record.user_id,
          image_url: `/uploads/${j.record.image_file || ""}`,
          distance: 0,
        };
        setSimilar([m]);
        setSimilarReviewed(false);
      } else {
        setSimilar([]);
        setSimilarReviewed(true);
      }
    } catch (e) {
      console.error(e);
      alert("Re-check failed. Please try again.");
    } finally {
      setRechecking(false);
    }
  };

  /* --------------------------- copy helper buttons --------------------------- */

  const copyText = async (text, setter) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 1400);
    } catch {
      const t = document.createElement("textarea");
      t.value = text;
      document.body.appendChild(t);
      t.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(t);
      setter(true);
      setTimeout(() => setter(false), 1400);
    }
  };

  /* --------------------------------- decks ---------------------------------- */

  const decks = useMemo(
    () => [
      { id: 1, static: Deck1S, open: Deck1Open },
      { id: 2, static: Deck2S, open: Deck2Open },
      { id: 3, static: Deck3S, open: Deck3Open },
      { id: 4, static: Deck4S, open: Deck4Open },
      { id: 5, static: Deck5S, open: Deck5Open },
    ],
    []
  );

  return (
    <div className="mint-page">
      <Navbar />

      <section className="mint-intro">
        <p className="line">what do i do.</p>
        <p className="line">how is the process like.</p>
        <p className="line">try hovering around the decks below.</p>
      </section>

      <section className="decks-stage">
        <div className="decks-fan">
          {decks.map((d) => {
            const isOpen = hovered === d.id && d.open;
            const isFocus = hovered === d.id;
            const dim = hovered !== null && hovered !== d.id;

            const slotClass = [
              "deck-slot",
              `deck-${d.id}`,
              isOpen ? "open" : "static",
              isFocus ? "focused-left" : "",
              dim ? "dim" : "",
              "hoverable",
            ].join(" ");

            const deckImgSrc =
              d.id === 1 && isOpen
                ? (preview ? Deck1Uploaded : Deck1Open)
                : (isOpen ? d.open : d.static);

            return (
              <div
                key={d.id}
                className={slotClass}
                onMouseEnter={() => setHovered(d.id)}
                onFocus={() => setHovered(d.id)}
                tabIndex={0}
                role="button"
                aria-label={`deck ${d.id}`}
              >
                <img src={deckImgSrc} alt="" className="deck-img" draggable="false" />

                {/* DECK I — upload / replace */}
                {d.id === 1 && isOpen && (
                  <div
                    className="deck1-panel"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDrop}
                  >
                    <div
                      className="deck1-hit"
                      onClick={onPickFile}
                      role="button"
                      aria-label="Upload image"
                      title={preview ? "click to replace image" : "click to upload image"}
                    >
                      {!preview ? (
                        <button type="button" className="upload-sticker">UPLOAD IMAGE</button>
                      ) : (
                        <img src={preview} alt="preview" className="preview-img" />
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={onChangeFile}
                      hidden
                    />
                  </div>
                )}

                {/* DECK II — Title ONLY */}
                {d.id === 2 && isOpen && (
                  <div className="deck2-panel">
                    <input
                      className="deck2-field"
                      placeholder="artwork title"
                      value={artTitle}
                      onChange={(e) => setArtTitle(e.target.value)}
                      maxLength={140}
                    />
                  </div>
                )}

                {/* DECK III — Description */}
                {d.id === 3 && isOpen && (
                  <div className="deck3-panel">
                    <textarea
                      className="desc3-input"
                      placeholder="PLEASE TYPE HERE"
                      value={longDesc}
                      onChange={(e) => setLongDesc(e.target.value)}
                      maxLength={2000}
                    />
                    <div className="desc3-count">{longDesc.length}/2000</div>
                  </div>
                )}

                {/* DECK IV — rights-holder checkbox */}
                {d.id === 4 && isOpen && (
                  <div className="deck4-panel">
                    <label className={`consent-box ${consent ? "checked" : ""}`}>
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        aria-label="I am the rights holder or have permission to upload this artwork"
                      />
                      <img className="box-img" src={Deck4Box} alt="" />
                      <span className="checkmark">✓</span>
                    </label>
                  </div>
                )}

                {/* DECK V — read-only preview + mint */}
                {d.id === 5 && isOpen && (
                  <>
                    <div className="deck5-overlay">
                      <img src={Deck5Border} alt="" className="deck5-border" />
                      {preview ? (
                        <img src={preview} alt="art preview" className="deck5-preview" />
                      ) : (
                        <div className="deck5-placeholder">upload your image in deck I</div>
                      )}
                      <div className="deck5-text">
                        <div className="deck5-titleText">{artTitle || "ARTWORK TITLE"}</div>
                        <div className="deck5-artistText">{artistName}</div>
                        <div className="deck5-descText">{longDesc || "add a description in deck III"}</div>
                      </div>
                    </div>

                    <div className="deck5-side">
                      <div className="deck5-side-copy">
                        CLICK THE BUTTON
                        <br /> BELOW TO UPLOAD
                        <br /> YOUR AMAZING
                        <br /> ARTWORK !!
                      </div>
                      <button className="deck5-mint-btn" onClick={handleMint} disabled={uploading}>
                        <img src={Deck5Button} alt="mint" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="deck-mask" aria-hidden="true" />

        <div className="mint-footer-copy">
          <p>think. sketch.</p>
          <p>upload. review.</p>
          <p>repeat.</p>
        </div>
      </section>

      {/* SUCCESS MODAL */}
      {modalOpen && (
        <div className="mint-modal">
          <div className="mint-modal-card">
            <h3>🎉 your artwork has been uploaded!</h3>

            {ipfsCid && (
              <>
                <p className="cid-label">pinned to IPFS with CID:</p>
                <p className="cid-value">{ipfsCid}</p>

                <div className="modal-actions">
                  <a
                    href={`https://gateway.pinata.cloud/ipfs/${ipfsCid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="modal-ok"
                  >
                    view image
                  </a>

                  <button
                    type="button"
                    className="modal-copy"
                    onClick={() => copyText(ipfsCid, setCopiedCID)}
                  >
                    {copiedCID ? "copied!" : "copy cid"}
                  </button>
                </div>
              </>
            )}

            {metadataCid && (
              <>
                <div className="meta-block">
                  <p className="cid-label">metadata CID:</p>
                  <p className="cid-value">{metadataCid}</p>

                  <div className="modal-actions">
                    <a
                      href={`https://gateway.pinata.cloud/ipfs/${metadataCid}`}
                      target="_blank"
                      rel="noreferrer"
                      className="modal-ok"
                    >
                      view metadata
                    </a>

                    <button
                      type="button"
                      className="modal-copy"
                      onClick={() => copyText(`ipfs://${metadataCid}`, setCopiedToken)}
                    >
                      {copiedToken ? "copied!" : "copy tokenURI"}
                    </button>
                  </div>
                </div>

                {/* POSSIBLE MATCHES + REVIEW GATE */}
                <div
                  style={{
                    marginTop: 18,
                    padding: 14,
                    border: similar.length > 0 ? "2px solid #e4b400" : "2px solid #2c2c2c",
                    background: "#111",
                    borderRadius: 12,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>
                    Similarity check
                    {similar.length > 0
                      ? ` — found ${similar.length} potential match${similar.length > 1 ? "es" : ""}`
                      : " — no matches"}
                  </div>

                  {similar.length > 0 && (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        {similar.map((m) => (
                          <a
                            key={`${m.id}-${m.user_id}`}
                            href={`/user/${m.user_id}`}
                            style={{
                              textDecoration: "none",
                              color: "#fff",
                              background: "#151515",
                              borderRadius: 10,
                              overflow: "hidden",
                              border: "1px solid #333",
                            }}
                            title={`${m.title} • @${m.username}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              src={`${API}${m.image_url}`}
                              alt={m.title}
                              style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }}
                              loading="lazy"
                            />
                            <div style={{ padding: "6px 8px", fontSize: 12, lineHeight: 1.2 }}>
                              <div
                                style={{
                                  fontWeight: 800,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {m.title}
                              </div>
                              <div
                                style={{
                                  opacity: 0.8,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                @{m.username}
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>

                      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={similarReviewed}
                          onChange={(e) => setSimilarReviewed(e.target.checked)}
                        />
                        <span style={{ fontSize: 14 }}>
                          I reviewed the possible matches and confirm this upload is original or permitted.
                        </span>
                      </label>
                    </>
                  )}

                  <div className="modal-actions" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="modal-copy"
                      onClick={rerunSimilarCheck}
                      disabled={!file || rechecking}
                      title="Re-calculate exact duplicate match by hash"
                    >
                      {rechecking ? "checking…" : "re-run check"}
                    </button>
                  </div>
                </div>

                {/* On-chain mint (gated by review when matches exist) */}
                {!txInfo && (
                  <button
                    className="modal-ok primary"
                    onClick={async () => {
                      try {
                        if (!createdArtworkId) {
                          return alert("Upload returned no artwork id; please try uploading again.");
                        }
                        if (similar.length > 0 && !similarReviewed) {
                          return alert("Please review similar results and tick the confirmation checkbox first.");
                        }
                        setMinting(true);
                        const tokenURI = `ipfs://${metadataCid}`;

                        // 1) Wallet mint (emits Transfer)
                        const res = await mintOnChain(tokenURI, createdArtworkId);
                        console.log("[mint] ok", { createdArtworkId, tokenURI, res });

                        // 2) Persist linkage on server
                        const resp = await fetch(`${API}/api/artwork/${createdArtworkId}/onchain`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({ tokenId: res.tokenId, txHash: res.hash }),
                        });
                        const saved = await resp.json().catch(() => ({}));
                        console.log("[/onchain] status", resp.status, saved);

                        const tokenId = saved?.token_id ?? res.tokenId ?? null;
                        const hash = saved?.tx_hash ?? res.hash ?? "";

                        setTxInfo({
                          tokenId,
                          hash,
                          etherscan: hash ? txUrl(hash) : res.etherscan,
                        });
                      } catch (e) {
                        alert(e.message || "Mint failed");
                        console.error(e);
                      } finally {
                        setMinting(false);
                      }
                    }}
                    disabled={minting || (similar.length > 0 && !similarReviewed)}
                    title={
                      similar.length > 0 && !similarReviewed
                        ? "Review similar results before minting"
                        : "Mint"
                    }
                  >
                    {minting ? "waiting for wallet…" : "mint on-chain"}
                  </button>
                )}

                {txInfo && (
                  <div className="modal-actions" style={{ gap: 10, flexWrap: "wrap" }}>
                    {txInfo.etherscan && (
                      <a className="modal-ok" href={txInfo.etherscan} target="_blank" rel="noreferrer">
                        view transaction
                      </a>
                    )}
                    {txInfo.tokenId && (
                      <a className="modal-ok" href={tokenUrl(txInfo.tokenId)} target="_blank" rel="noreferrer">
                        view token
                      </a>
                    )}
                  </div>
                )}
              </>
            )}

            <button
              className="modal-ok"
              onClick={() => {
                setModalOpen(false);
                setSimilar([]);
                setSimilarReviewed(true);
              }}
            >
              ok
            </button>
          </div>
        </div>
      )}

      {/* UPLOADING MODAL */}
      {uploading && (
        <div className="mint-modal" aria-live="polite">
          <div className="mint-modal-card loader">
            <div className="swap">
              <div className="swap-card a">hashing…</div>
              <div className="swap-card b">pinning to ipfs…</div>
              <div className="swap-card c">creating metadata…</div>
            </div>
            <p className="loader-sub">this usually takes a few seconds.</p>
          </div>
        </div>
      )}
    </div>
  );
}
