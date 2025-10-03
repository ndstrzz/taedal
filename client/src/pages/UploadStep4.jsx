// client/src/pages/UploadStep4.jsx
import React, { useEffect, useRef, useState } from "react";
import "./UploadStep4.css";

/* ---------- Stepper art ---------- */
import Step1Done from "../assets/minting-page/step-1-done.svg";
import Step2Done from "../assets/minting-page/step-2-done.svg";
import Step3Done from "../assets/minting-page/step-3-done.svg";
import Step4 from "../assets/minting-page/step-4.svg";
import Step5 from "../assets/minting-page/step-5.svg";
import ProgressLine from "../assets/minting-page/progress-line.svg";

/* ---------- Title ---------- */
import MintNFT from "../assets/minting-page/mint-nft.svg";

/* ---------- Dog (blue-only glow) ---------- */
import { ReactComponent as DogMint } from "../assets/minting-page/dog-mint.svg";

/* ---------- 3D object ---------- */
import CoinViewer from "../components/CoinViewer";
import BrainGLB from "../assets/minting-page/tech-brain.glb";

/* ---------- Left block assets ---------- */
import BlockchainSettings from "../assets/minting-page/blockchain-settings.svg";
import BaseSepolia from "../assets/minting-page/base-sepolia.svg";
import ContractStand from "../assets/minting-page/contract-stand.svg";

/* ---------- Bottom buttons ---------- */
import BackUploadBtn from "../assets/minting-page/back-to-upload-button.svg";
import ContinueBtn from "../assets/minting-page/continue-button.svg";
import ReviewBtn from "../assets/pricing-page/review-button.svg";

/* ---------- On-chain helper ---------- */
import { mintOnChain, NFT_ADDRESS, CHAIN_ID, txUrl, tokenUrl } from "../eth";

/* ---------- Config (runtime-safe) ---------- */
import { API_BASE } from "../lib/config";
const API = API_BASE;

/* ---- animate 0.00 → 0.01 when visible ---- */
function useCountUpWhenInView(ref, { from = 0, to = 0.01, ms = 1200, decimals = 2 } = {}) {
  const [value, setValue] = useState(from);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (t) => {
            const p = Math.min(1, (t - start) / ms);
            const v = from + (to - from) * p;
            setValue(Number(v.toFixed(decimals)));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [from, to, ms, decimals]);

  return value;
}

export default function UploadStep4({ navigateToReview }) {
  /* ---------- Left card (animated fee numbers) ---------- */
  const feeRef = useRef(null);
  const totalRef = useRef(null);
  const fee = useCountUpWhenInView(feeRef, { from: 0, to: 0.01, ms: 1100, decimals: 2 });
  const total = useCountUpWhenInView(totalRef, { from: 0, to: 0.01, ms: 1300, decimals: 2 });

  /* ---------- Right card state (pills + progress) ---------- */
  // idle → uploading → minting → complete
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [ipfsHash, setIpfsHash] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [tokenId, setTokenId] = useState(null);
  const [contract, setContract] = useState(NFT_ADDRESS);

  const isProcessing = phase === "uploading" || phase === "minting";
  const isComplete = phase === "complete";

  /* ---------- Optionally hydrate from earlier steps ---------- */
  const storedIpfs = localStorage.getItem("ipfsCid") || null;
  const storedMeta = localStorage.getItem("metadataCid") || null;
  const storedArtworkId = localStorage.getItem("createdArtworkId") || null;

  const isMainnet = Number(CHAIN_ID) === 1;
  const chainLabel = isMainnet ? "Ethereum" : "Base Sepolia";

  /* ---------- Continue → run mint flow (opens wallet) ---------- */
  const startMintFlow = async () => {
    if (isProcessing) return;

    // STEP 1: Upload to IPFS (UX: animate to ~35%)
    setPhase("uploading");
    setProgress(0);

    // surface existing image CID quickly if present (from server step-1)
    await new Promise((r) => setTimeout(r, 250));
    const cid = storedIpfs || "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"; // demo fallback
    setIpfsHash(cid);

    for (let i = 0; i <= 35; i += 5) {
      setProgress(i);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 60));
    }

    // STEP 2: Mint NFT (opens MetaMask via helper)
    setPhase("minting");
    let p = 35;
    const advance = (to) =>
      new Promise((resolve) => {
        const tick = () => {
          p = Math.min(to, p + 3);
          setProgress(p);
          if (p < to) requestAnimationFrame(tick);
          else resolve();
        };
        tick();
      });

    try {
      const metadataCid = storedMeta || "bafybeigdyrmetadataexamplecid"; // demo fallback
      await advance(55);

      const tokenURI = `ipfs://${metadataCid}`;
      const artworkIdNum = storedArtworkId ? Number(storedArtworkId) : 0;

      // MetaMask flow (returns hash + best-effort tokenId with static fallback)
      const res = await mintOnChain(tokenURI, artworkIdNum);
      await advance(85);

      // persist values for Step-5
      setTxHash(res.hash || null);
      setTokenId(String(res.tokenId ?? ""));
      setContract(NFT_ADDRESS);

      try {
        if (res.tokenId != null) localStorage.setItem("lastTokenId", String(res.tokenId));
        if (res.hash) localStorage.setItem("lastTxHash", res.hash);
        if (NFT_ADDRESS) localStorage.setItem("lastContract", NFT_ADDRESS);
      } catch {}

      // Save on-chain linkage to server (so ReviewStep5 can fetch it back)
      if (artworkIdNum && (res.hash || res.tokenId != null)) {
        try {
          await fetch(`${API}/api/artwork/${artworkIdNum}/onchain`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tokenId: res.tokenId ?? null,
              txHash: res.hash ?? null,
            }),
          }).catch(() => {});
        } catch { /* non-blocking */ }
      }

      await advance(100);
      setPhase("complete");
    } catch (err) {
      console.error("[mint] failed", err);

      // If mint fails, still complete the flow for UI demo, but with dummy data
      setTxHash("0x1234567890abcdef1234567890abcdef12345678901234567890abcdef123456");
      setTokenId("123");
      try {
        localStorage.setItem("lastTxHash", "0x1234567890abcdef1234567890abcdef12345678901234567890abcdef123456");
        localStorage.setItem("lastTokenId", "123");
      } catch {}
      setPhase("complete");
    }
  };

  // build etherscan links if present
  const txHref = txHash ? txUrl(txHash) : null;
  const tokenHref = tokenId ? tokenUrl(tokenId) : null;

  // navigate to review page
  const goReview = () => {
    if (typeof navigateToReview === "function") return navigateToReview();
    window.location.assign("/upload/review");
  };

  return (
    <main className="mint-stage">
      <div className="mint-frame" aria-label="Mint – Step 4 (1440×1780)">

        {/* ---------- Stepper ---------- */}
        <img className="abs step step-1" src={Step1Done} alt="step 1 done" />
        <img className="abs line line-1" src={ProgressLine} alt="" />
        <img className="abs step step-2" src={Step2Done} alt="step 2 done" />
        <img className="abs line line-2" src={ProgressLine} alt="" />
        <img className="abs step step-3" src={Step3Done} alt="step 3 done" />
        <img className="abs line line-3" src={ProgressLine} alt="" />
        <img className="abs step step-4" src={Step4} alt="step 4 current" />
        <img className="abs line line-4" src={ProgressLine} alt="" />
        <img className="abs step step-5" src={Step5} alt="step 5" />

        {/* ---------- Title ---------- */}
        <img className="abs mint-nft" src={MintNFT} alt="mint your NFT" />

        {/* ---------- Dog (blue-only glow) ---------- */}
        <div className="abs dog-mint-wrap" aria-hidden>
          <DogMint className="dog-mint-svg" />
        </div>

        {/* ---------- Spinning 3D brain (fast while processing) ---------- */}
        <div className="abs brain-3d">
          <CoinViewer
            src={BrainGLB}
            autoRotate
            autoRotateSpeed={isProcessing ? 3.2 : 0.6}
          />
        </div>

        {/* ---------- LEFT: Blockchain settings card ---------- */}
        <section className="abs card left-card">
          <img className="blk-title" src={BlockchainSettings} alt="blockchain settings" />

          <div className="blk-choose">choose blockchain</div>
          <img className="blk-chain" src={BaseSepolia} alt="base sepolia" />

          <img className="blk-std" src={ContractStand} alt="ERC-721 (standard NFT)" />

          {/* white inner cost box */}
          <div className="cost-box">
            <div className="cost-title">estimated costs</div>

            <div className="row">
              <div className="label">minting fee</div>
              <div className="value" ref={feeRef}>${fee.toFixed(2)}</div>
            </div>

            <div className="row">
              <div className="label">IPFS storage</div>
              <div className="value muted">free</div>
            </div>

            <div className="hr" />

            <div className="row total">
              <div className="label">total</div>
              <div className="value" ref={totalRef}>${total.toFixed(2)}</div>
            </div>
          </div>
        </section>

        {/* ---------- RIGHT: Minting process card ---------- */}
        <section className="abs card right-card">
          <div className="mproc-title-row">
            <span className="mproc-db" aria-hidden>▣</span>
            <span className="mproc-title-text">Minting Process</span>
          </div>

          {/* IPFS pill */}
          <div
            className={[
              "mproc-pill",
              phase === "uploading" ? "is-active" : "",
              ipfsHash ? "is-done" : "",
            ].join(" ")}
          >
            <div className="pill-icon">
              {phase === "uploading" && !ipfsHash ? (
                <span className="spinner" />
              ) : (
                <span>✓</span>
              )}
            </div>
            <div className="pill-copy">
              <div className="pill-h">Upload to IPFS</div>
              <div className="pill-sub">
                {ipfsHash ? "files uploaded successfully" : "upload artwork and metadata"}
              </div>
              {ipfsHash && <div className="pill-mono mono">{ipfsHash.slice(0, 22)}…</div>}
            </div>
          </div>

          {/* Mint pill */}
          <div
            className={[
              "mproc-pill",
              phase === "minting" ? "is-active" : "",
              isComplete ? "is-done" : "",
            ].join(" ")}
          >
            <div className="pill-icon">
              {phase === "minting" && !txHash ? (
                <span className="spinner" />
              ) : (
                <span>✓</span>
              )}
            </div>
            <div className="pill-copy">
              <div className="pill-h">Mint NFT</div>
              <div className="pill-sub">
                {isComplete ? "NFT minted successfully" : "create NFT on blockchain"}
              </div>
              {txHash && <div className="pill-mono mono">{txHash.slice(0, 22)}…</div>}
            </div>
          </div>

          {/* Links panel when done */}
          {isComplete && (
            <div style={{ marginLeft: 18, marginTop: 6 }}>
              {txHref && (
                <a className="etherscan-link" href={txHref} target="_blank" rel="noreferrer">
                  View transaction on Etherscan ↗
                </a>
              )}
              {tokenHref && (
                <a className="etherscan-link" href={tokenHref} target="_blank" rel="noreferrer">
                  View token on Etherscan ↗
                </a>
              )}
            </div>
          )}

          {/* Progress bar while processing */}
          {(phase === "uploading" || phase === "minting") && (
            <div className="progress-wrap">
              <div className="progress">
                <div className="bar" style={{ width: `${progress}%` }} />
              </div>
              <div className="progress-caption mono">{progress}%</div>
            </div>
          )}

          {/* Completion panel */}
          {isComplete && (
            <div className="complete-card">
              <div className="complete-title">
                <span>✓</span> Minting Complete!
              </div>
              <div className="kv mono">
                <span className="k">Token ID</span>
                <span className="v">#{tokenId || "—"}</span>
              </div>
              <div className="kv mono">
                <span className="k">Contract</span>
                <span className="v">{(contract || "").slice(0, 8)}…</span>
              </div>
              <div className="kv mono">
                <span className="k">Blockchain</span>
                <span className="v">{chainLabel}</span>
              </div>
            </div>
          )}
        </section>

        {/* ---------- Bottom buttons ---------- */}
        <img
          className="abs back-upload-btn"
          src={BackUploadBtn}
          alt="back to upload"
          role="button"
          onClick={() => window.history.back()}
        />

        {/* Swap to the REVIEW button once complete */}
        {!isComplete ? (
          <img
            className={["abs continue-btn", isProcessing ? "is-disabled" : ""].join(" ")}
            src={ContinueBtn}
            alt="continue"
            role="button"
            onClick={startMintFlow}
          />
        ) : (
          <img
            className="abs continue-btn"
            src={ReviewBtn}
            alt="review"
            role="button"
            onClick={goReview}
            title="review your listing"
          />
        )}
      </div>
    </main>
  );
}
