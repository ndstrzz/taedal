// client/src/pages/PricingStep3.jsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./PricingStep3.css";

/* ---------- stepper art ---------- */
import Step1Done from "../assets/minting-page/step-1-done.svg";
import Progressed from "../assets/minting-page/progress-line.svg";
import Step2Done from "../assets/minting-page/step-2-done.svg";
import Step3D from "../assets/pricing-page/step-3d.svg";
import Step4 from "../assets/minting-page/step-4.svg";
import Step5 from "../assets/minting-page/step-5.svg";

/* ---------- page art ---------- */
import SetYourPrice from "../assets/pricing-page/set-your-price.svg";
import { ReactComponent as DogPrice } from "../assets/pricing-page/dog-price.svg";

/* bottom buttons */
import BackUploadBtn from "../assets/minting-page/back-to-upload-button.svg";
import ContinueBtn from "../assets/minting-page/continue-button.svg";

/* ✅ Single source of truth for API */
import { apiFetch } from "../lib/config";

/* --------- tiny helper: animate numbers for fee breakdown --------- */
function useAnimatedNumber(value, { ms = 250, fps = 60 } = {}) {
  const [v, setV] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const frames = Math.max(1, Math.round((ms / 1000) * fps));
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      const p = Math.min(1, i / frames);
      const cur = from + (to - from) * p;
      setV(cur);
      if (p >= 1) {
        clearInterval(id);
        fromRef.current = to;
      }
    }, 1000 / fps);

    return () => clearInterval(id);
  }, [value, ms, fps]);

  return v;
}

export default function PricingStep3({ onBack, onContinue }) {
  const navigate = useNavigate();

  /* ---------------- state ---------------- */
  const [currency, setCurrency] = useState("USD");
  const [price, setPrice] = useState("");           // string for input
  const [edition, setEdition] = useState("single"); // single | limited | open
  const [editionSize, setEditionSize] = useState(""); // when limited
  const [saving, setSaving] = useState(false);

  /* parse & clamp */
  const priceNum = useMemo(() => {
    const n = parseFloat(price);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [price]);

  // fees — platform 2.5%
  const platformFee = priceNum * 0.025;
  const youReceive = Math.max(0, priceNum - platformFee);

  /* animated figures */
  const aPrice = useAnimatedNumber(priceNum);
  const aFee = useAnimatedNumber(platformFee);
  const aNet = useAnimatedNumber(youReceive);

  /* persist lightweight draft (optional) */
  useEffect(() => {
    try {
      const draft = { currency, price, edition, editionSize };
      localStorage.setItem("pricingDraft", JSON.stringify(draft));
    } catch {}
  }, [currency, price, edition, editionSize]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("pricingDraft");
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && typeof d === "object") {
        if (d.currency) setCurrency(d.currency);
        if (typeof d.price === "string") setPrice(d.price);
        if (d.edition) setEdition(d.edition);
        if (typeof d.editionSize === "string") setEditionSize(d.editionSize);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canContinue =
    priceNum > 0 &&
    (edition !== "limited" ||
      (edition === "limited" && /^\d+$/.test(editionSize) && Number(editionSize) > 0));

  const handleContinue = async () => {
    if (!canContinue || saving) return;

    const payload = {
      price: priceNum,
      currency,
      edition,
      editionSize: edition === "limited" ? Number(editionSize) : undefined,
    };

    // Allow parent to handle if it passed a prop
    if (typeof onContinue === "function") {
      onContinue({ ...payload, platformFee, youReceive });
      return;
    }

    // Save to server
    const id = Number(localStorage.getItem("createdArtworkId"));
    if (!id) {
      alert("Missing artwork ID. Please start from Step 1 again.");
      return;
    }

    try {
      setSaving(true);
      const r = await apiFetch(`/api/artwork/${id}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Failed to save pricing");

      // go to Step 4
      navigate("/upload/confirm", { state: { pricing: { ...payload, platformFee, youReceive } } });
    } catch (e) {
      alert(e.message || "Failed to save pricing");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (typeof onBack === "function") onBack();
    else navigate(-1);
  };

  /* ---------------- layout ---------------- */
  return (
    <main className="mint-stage">
      <div className="mint-frame" aria-label="Pricing – Step 3 (1440×1780)">

        {/* Stepper */}
        <img className="abs step step-1" src={Step1Done} alt="step 1 done" />
        <img className="abs line line-1" src={Progressed} alt="" />
        <img className="abs step step-2" src={Step2Done} alt="step 2 done" />
        <img className="abs line line-2" src={Progressed} alt="" />
        <img className="abs step step-3" src={Step3D} alt="step 3 current" />
        <img className="abs line line-3" src={Progressed} alt="" />
        <img className="abs step step-4" src={Step4} alt="step 4" />
        <img className="abs line line-4" src={Progressed} alt="" />
        <img className="abs step step-5" src={Step5} alt="step 5" />

        {/* Title */}
        <img className="abs set-price-title" src={SetYourPrice} alt="set your price" />

        {/* Dog art */}
        <div className="abs dog-price-wrap" aria-hidden>
          <DogPrice className="dog-price-svg" />
        </div>

        {/* LEFT: Pricing card */}
        <section className="abs card left-card">
          <div className="blk-title-row">
            <div className="blk-icon">$</div>
            <div className="blk-title">pricing</div>
          </div>

          {/* Price field */}
          <div className="field">
            <div className="label">price</div>
            <div className="sublabel">enter artwork price</div>

            <div className="price-row">
              <input
                className="price-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
              />
              <select
                className="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="USD">USD ($)</option>
                <option value="ETH">ETH (Ξ)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          {/* Edition type */}
          <div className="field">
            <div className="label">edition type</div>

            <div className="pill-group">
              <button
                type="button"
                className={["pill", edition === "single" ? "is-active" : ""].join(" ")}
                onClick={() => setEdition("single")}
              >
                single edition<span> — one-of-a-kind artwork</span>
              </button>

              <button
                type="button"
                className={["pill", edition === "limited" ? "is-active" : ""].join(" ")}
                onClick={() => setEdition("limited")}
              >
                limited edition<span> — fixed number of copies</span>
              </button>

              <button
                type="button"
                className={["pill", edition === "open" ? "is-active" : ""].join(" ")}
                onClick={() => setEdition("open")}
              >
                open edition<span> — unlimited copies</span>
              </button>
            </div>

            {edition === "limited" && (
              <div className="limit-row">
                <label className="limit-label">edition size</label>
                <input
                  className="limit-input"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g., 25"
                  value={editionSize}
                  onChange={(e) => setEditionSize(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: Fee breakdown */}
        <section className="abs card right-card">
          <div className="blk-title-row">
            <div className="blk-icon">⌗</div>
            <div className="blk-title">fee breakdown</div>
          </div>

          <div className="fee-row">
            <div className="k">listing price</div>
            <div className="v mono">
              {currency} {aPrice.toFixed(2)}
            </div>
          </div>

          <div className="fee-row">
            <div className="k">platform fee (2.5%)</div>
            <div className="v mono">- {currency} {aFee.toFixed(2)}</div>
          </div>

          <div className="fee-hr" />

          <div className="fee-row total">
            <div className="k">you receive</div>
            <div className="v mono">{currency} {aNet.toFixed(2)}</div>
          </div>

          <div className="royalty-note">
            future sales royalty: 10% (info)
          </div>
        </section>

        {/* Bottom buttons */}
        <img
          className="abs back-upload-btn"
          src={BackUploadBtn}
          alt="back to details"
          role="button"
          onClick={handleBack}
        />
        <img
          className={["abs continue-btn", (!canContinue || saving) ? "is-disabled" : ""].join(" ")}
          src={ContinueBtn}
          alt="continue"
          role="button"
          onClick={handleContinue}
        />
      </div>
    </main>
  );
}
