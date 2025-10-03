import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./UploadStep1.css";

/* stepper */
import Step1 from "../assets/upload-page/step-1.svg";
import Step2 from "../assets/upload-page/step-2.svg";
import Step3 from "../assets/upload-page/step-3.svg";
import Step4 from "../assets/upload-page/step-4.svg";
import Step5 from "../assets/upload-page/step-5.svg";
import ProgressLine from "../assets/upload-page/progress-line.svg";

/* art */
import UploadDescription from "../assets/upload-page/upload-description.svg";
import UploadIcon from "../assets/upload-page/upload-icon.svg";
import DogUpload from "../assets/upload-page/dog-upload.svg";
import Wiring from "../assets/upload-page/wiring.svg";
import SimilarityTitle from "../assets/upload-page/similarity-checks.svg";
import Portal from "../assets/upload-page/portal.svg";
import ContinueBtn from "../assets/upload-page/continue-button.svg";

/* 🔧 ONE source of truth for API base */
import { API_BASE, apiFetch } from "../lib/config";

const TARGET_W = 282;
const TARGET_H = 281;
const MAX_FILES = 20;
const MIN_SPIN_MS = 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** apiFetch + timeout helper */
function apiFetchWithTimeout(path, options = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("Request timeout")), timeoutMs);
  const opts = { ...options, signal: options.signal ?? ctrl.signal };
  return apiFetch(path, opts).finally(() => clearTimeout(timer));
}

async function resizeImageToCanvas(file, w = TARGET_W, h = TARGET_H) {
  const img = new Image();
  img.decoding = "async";
  img.crossOrigin = "anonymous";

  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });

  img.src = dataUrl;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, dx, dy, dw, dh);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
  const resizedFile = new File([blob], (file.name || "image") + ".png", { type: "image/png" });
  const url = URL.createObjectURL(resizedFile);
  return { file: resizedFile, url };
}

const ipfsGateway = (cidOrUri) => {
  if (!cidOrUri) return null;
  const cid = cidOrUri.startsWith("ipfs://") ? cidOrUri.slice(7) : cidOrUri;
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
};

/** Resolve a usable preview URL for similarity results */
const resolveSimImageUrl = (m) => {
  const candidates = [
    m?.thumb_url, m?.thumbUrl, m?.thumbnail_url, m?.thumbnailUrl,
    m?.preview_url, m?.previewUrl, m?.image_url, m?.imageUrl,
    m?.url, m?.image, m?.path, m?.file_path, m?.filepath, m?.img,
  ].filter(Boolean);

  for (const raw0 of candidates) {
    const raw = String(raw0);
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("ipfs://")) return ipfsGateway(raw);
    if (/^[a-z2-7]{46,}|^bafy/i.test(raw)) return ipfsGateway(raw);

    const cleaned = raw.replace(/\\/g, "/");
    if (/^\/?uploads\//i.test(cleaned)) {
      const rel = cleaned.replace(/^\/?/, "");
      return `${API_BASE}/${rel}`;
    }
    const idx = cleaned.toLowerCase().lastIndexOf("uploads/");
    if (idx !== -1) {
      const rel = cleaned.slice(idx);
      return `${API_BASE}/${rel}`;
    }
  }
  const cid = m?.image_cid || m?.ipfs_cid || m?.cid || null;
  if (cid) return ipfsGateway(cid);
  return null;
};

const BLANK_IMG = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";

export default function UploadStep1() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  const [images, setImages] = useState([]);
  const [simMatches, setSimMatches] = useState([]);
  const [simError, setSimError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [reviewed, setReviewed] = useState(true);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // 🔑 unified auth state based on /api/me
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const canAddMore = images.length < MAX_FILES;
  const openPicker = () => inputRef.current?.click();

  // Session check via shared API base
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const r = await apiFetch("/api/me");
        const j = await r.json().catch(() => ({}));
        if (!ignore) {
          setIsLoggedIn(!!j?.ok && !!j?.user);
          setAuthChecked(true);
        }
      } catch {
        if (!ignore) {
          setIsLoggedIn(false);
          setAuthChecked(true);
        }
      }
    })();
    return () => { ignore = true; };
  }, []);

  // revoke previews on unmount / change
  useEffect(() => {
    return () => {
      images.forEach((it) => { try { URL.revokeObjectURL(it.url); } catch {} });
    };
  }, [images]);

  const addFiles = useCallback(async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const roomLeft = Math.max(0, MAX_FILES - images.length);
    if (roomLeft === 0) return;

    const files = Array.from(fileList)
      .filter((f) => f && f.type?.startsWith("image/"))
      .slice(0, roomLeft);

    if (files.length === 0) return;

    const processed = await Promise.all(
      files.map(async (f, i) => {
        const { file: resizedFile, url } = await resizeImageToCanvas(f, TARGET_W, TARGET_H);
        return { originalFile: f, resizedFile, url, name: f.name || `image-${Date.now()}-${i}` };
      })
    );
    setImages((prev) => [...prev, ...processed]);
  }, [images.length]);

  const onChange = async (e) => { await addFiles(e.target.files); e.target.value = ""; };
  const onDrop = async (e) => { e.preventDefault(); e.stopPropagation(); await addFiles(e.dataTransfer.files); };
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };

  const removeImage = (idx) => {
    setImages((prev) => {
      const out = [...prev];
      const [removed] = out.splice(idx, 1);
      if (removed) { try { URL.revokeObjectURL(removed.url); } catch {} }
      return out;
    });
  };

  const scrollBy = (dx) => { if (scrollRef.current) scrollRef.current.scrollBy({ left: dx, behavior: "smooth" }); };

  // ---------- similarity ----------
  const rerunSimilarCheck = async () => {
    if (images.length === 0) return;
    setSimError(""); setSimMatches([]); setReviewed(true); setIsChecking(true);
    const t0 = performance.now();

    try {
      const fd = new FormData();
      fd.append("artwork", images[0].originalFile);

      const res = await apiFetch("/api/similar", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));

      const elapsed = performance.now() - t0;
      if (elapsed < MIN_SPIN_MS) await sleep(MIN_SPIN_MS - elapsed);

      if (!res.ok || !data?.ok) {
        setSimError("Couldn't run similarity check (server error).");
      } else {
        const results = Array.isArray(data.results) ? data.results : [];
        setSimMatches(results);
        setReviewed(results.length === 0);
      }
    } catch {
      const elapsed = performance.now() - t0;
      if (elapsed < MIN_SPIN_MS) await sleep(MIN_SPIN_MS - elapsed);
      setSimError("Couldn't run similarity check (network error).");
    } finally {
      setIsChecking(false);
    }
  };

  const firstUrl = images[0]?.url;
  useEffect(() => {
    if (firstUrl) rerunSimilarCheck();
    else { setSimMatches([]); setReviewed(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstUrl]);

  // ---------- continue ----------
  const onContinue = async () => {
    setUploadError("");
    if (!isLoggedIn) { setUploadError("Please log in to upload your artwork."); return; }
    if (images.length === 0 || isUploading) return;
    if (simMatches.length > 0 && !reviewed) {
      setUploadError("Please review the possible matches and confirm before continuing.");
      return;
    }

    const first = images[0];
    const title = (first.name || "Untitled").replace(/\.[^/.]+$/, "") || "Untitled";

    try {
      setIsUploading(true);
      const fd = new FormData();
      fd.append("artwork", first.originalFile);
      fd.append("title", title);
      fd.append("description", "");

      const res = await apiFetchWithTimeout("/upload", { method: "POST", body: fd }, 15000);

      if (res.status === 401) { setUploadError("You need to log in before uploading."); return; }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Upload failed (${res.status})`);

      try {
        localStorage.setItem("createdArtworkId", String(data.id));
        if (data.ipfs_cid) localStorage.setItem("ipfsCid", data.ipfs_cid);
        if (data.sha256) localStorage.setItem("sha256", data.sha256);
        if (data.image_url) localStorage.setItem("imageUrl", data.image_url);
      } catch {}

      const lightImages = images.map(({ name, url }) => ({ name, url }));
      navigate("/upload/details", { state: { data: { images: lightImages } } });
    } catch (err) {
      console.warn("[step1] upload error:", err);
      setUploadError(err.message || "Upload error");
    } finally {
      setIsUploading(false);
    }
  };

  const gallery = useMemo(
    () =>
      images.map((it, i) => (
        <div key={`${it.name}-${i}`} className="thumb" style={{ width: TARGET_W, height: TARGET_H }}>
          <button
            type="button"
            className="thumb-remove"
            aria-label="remove image"
            onClick={(e) => { e.stopPropagation(); removeImage(i); }}
          >
            ×
          </button>
          <img
            className="thumb-img"
            src={it.url}
            alt={it.name}
            width={TARGET_W}
            height={TARGET_H}
            draggable="false"
            style={{ width: TARGET_W, height: TARGET_H, objectFit: "cover" }}
          />
          <div className="thumb-name" title={it.name}>{i === 0 ? "★ " : ""}{it.name}</div>
        </div>
      )),
    [images]
  );

  const continueDisabled =
    images.length === 0 || isUploading || (simMatches.length > 0 && !reviewed) || isChecking || (!isLoggedIn && authChecked);

  return (
    <main className="upload-stage">
      <div className="upload-frame" aria-label="Upload – Step 1">
        <img className="abs step step-1" src={Step1} alt="step 1: upload" />
        <img className="abs line line-1" src={ProgressLine} alt="" />
        <img className="abs step step-2" src={Step2} alt="step 2: details" />
        <img className="abs line line-2" src={ProgressLine} alt="" />
        <img className="abs step step-3" src={Step3} alt="step 3: pricing" />
        <img className="abs line line-3" src={ProgressLine} alt="" />
        <img className="abs step step-4" src={Step4} alt="step 4: mint" />
        <img className="abs line line-4" src={ProgressLine} alt="" />
        <img className="abs step step-5" src={Step5} alt="step 5: review" />

        <img className="abs upload-description" src={UploadDescription} alt="upload your artworks — description" />

        <section
          className="abs dropzone"
          onClick={canAddMore ? openPicker : undefined}
          onDrop={onDrop}
          onDragOver={onDragOver}
          role="button"
          aria-label="Drop files here or click to upload"
          tabIndex={0}
        >
          <button
            className="dz-arrow left"
            type="button"
            onClick={(e) => { e.stopPropagation(); scrollBy(-340); }}
            aria-label="scroll left"
          >
            ‹
          </button>
          <button
            className="dz-arrow right"
            type="button"
            onClick={(e) => { e.stopPropagation(); scrollBy(340); }}
            aria-label="scroll right"
          >
            ›
          </button>

          {images.length === 0 && (
            <div className="dz-center" onClick={openPicker}>
              <img className="dz-icon" src={UploadIcon} alt="" draggable="false" />
            </div>
          )}

          <div className="dropzone-gallery" ref={scrollRef}>{gallery}</div>
          <input ref={inputRef} type="file" accept="image/*" onChange={onChange} multiple hidden />
        </section>

        <img className="abs dog-upload" src={DogUpload} alt="" />
        <img className="abs wiring" src={Wiring} alt="" />

        <div className="abs similarity">
          <img className="similarity-title" src={SimilarityTitle} alt="similarity checks" />
          <div className="similarity-subline">
            {simMatches.length > 0 && !isChecking
              ? `found ${simMatches.length} potential match${simMatches.length > 1 ? "es" : ""}`
              : isChecking ? "matching…" : "no matches yet"}
          </div>

          <div className="similarity-matches">
            {isChecking && (
              <div className="sim-loading">
                <span className="spinner" aria-hidden />
                <span>matching similar artworks…</span>
              </div>
            )}
            {simError && <div className="sim-error">{simError}</div>}

            {simMatches.length > 0 && !isChecking && (
              <div className="sim-grid">
                {simMatches.map((m) => {
                  const src1 = resolveSimImageUrl(m);
                  const src2 = m?.ipfs_cid || m?.image_cid ? ipfsGateway(m.ipfs_cid || m.image_cid) : null;
                  return (
                    <a
                      key={`${m.id}-${m.user_id}`}
                      className="sim-card"
                      href={`/user/${m.user_id}`}
                      target="_blank"
                      rel="noreferrer"
                      title={`${m.title} • @${m.username}`}
                    >
                      <img
                        src={src1 || src2 || BLANK_IMG}
                        alt={m.title || "artwork"}
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (img.dataset.fallbackTried !== "1" && src2 && img.src !== src2) {
                            img.dataset.fallbackTried = "1"; img.src = src2;
                          } else { img.onerror = null; img.src = BLANK_IMG; }
                        }}
                      />
                      <div className="sim-meta">
                        <div className="sim-title">{m.title || "untitled"}</div>
                        <div className="sim-user">@{m.username || "user"}</div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}

            <button
              className="sim-rerun"
              type="button"
              onClick={rerunSimilarCheck}
              disabled={images.length === 0 || isChecking}
              title="Re-calculate exact duplicate match by hash"
            >
              {isChecking ? "matching…" : "re-run check"}
            </button>
          </div>

          <label className="similarity-confirm">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              disabled={simMatches.length === 0}
            />
            <span>I reviewed the possible matches and confirm this upload is original or permitted</span>
          </label>
        </div>

        <img className="abs portal" src={Portal} alt="" />

        {(!!uploadError || (!isLoggedIn && authChecked)) && (
          <div className="abs" style={{ left: 100, top: 1600, color: "#f66", fontWeight: 700 }}>
            {uploadError || "Please log in to continue."}
          </div>
        )}

        <img
          className={`abs continue-btn ${continueDisabled ? "is-disabled" : ""}`}
          src={ContinueBtn}
          alt="continue"
          role="button"
          onClick={onContinue}
          aria-disabled={continueDisabled}
          style={{ cursor: continueDisabled ? "not-allowed" : "pointer", zIndex: 10 }}
        />
      </div>
    </main>
  );
}
