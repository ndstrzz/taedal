// client/src/pages/UploadStep2.jsx
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLocation, useNavigate } from "react-router-dom";

import "./UploadStep1.css";   // stepper absolute positions
import "./UploadStep2.css";   // step-2 specific styles

// stepper art
import Step1Done from "../assets/upload-page/step-1-done.svg";
import Line1Progressed from "../assets/upload-page/progressed.svg";
import Step2D from "../assets/upload-page/step-2d.svg";
import Step3 from "../assets/upload-page/step-3.svg";
import Step4 from "../assets/upload-page/step-4.svg";
import Step5 from "../assets/upload-page/step-5.svg";
import ProgressLine from "../assets/upload-page/progress-line.svg";

// page art
import Step2Description from "../assets/details-step/step-2-description.svg";
import { ReactComponent as DogDetails } from "../assets/details-step/dog-details.svg";
import Languages from "../assets/details-step/languages.svg";

// buttons
import BackUploadBtn from "../assets/details-step/back-upload-button.svg";
import ContinueBtn from "../assets/details-step/continue-button.svg";

/* ✅ Single source of truth for API */
import { apiFetch } from "../lib/config";

const CATEGORIES = [
  "Painting",
  "Photography",
  "Illustration",
  "3D",
  "Sculpture",
  "Generative",
];
const MEDIUMS = ["Oil", "Acrylic", "Watercolor", "Digital", "Mixed Media", "Ink"];

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35 } },
};
const fieldVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i = 0) => ({
    opacity: 1,
    x: 0,
    transition: { delay: 0.05 * i, duration: 0.25 },
  }),
};
const badgeVariants = {
  hidden: { opacity: 0, scale: 0.8, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.18 } },
  exit: { opacity: 0, scale: 0.8, x: -16, transition: { duration: 0.15 } },
};

export default function UploadStep2() {
  const navigate = useNavigate();
  const location = useLocation();

  // images from step 1 (for continuity)
  const imagesFromStep1 = location.state?.data?.images || [];

  // created id from step 1
  const createdArtworkId = (() => {
    try { return Number(localStorage.getItem("createdArtworkId")) || null; }
    catch { return null; }
  })();

  // form
  const [values, setValues] = useState({
    title: "",
    description: "",
    category: "",
    medium: "",
    dimensions: "",
    year: "",
    series: "",
    physical: false,
    location: "",
    weight: "",
    inspiration: "",
  });

  const [tags, setTags] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [techniques, setTechniques] = useState([]);

  const tagInput = useRef(null);
  const matInput = useRef(null);
  const techInput = useRef(null);

  const onChange = (k) => (e) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const requiredOK =
    values.title.trim() &&
    values.description.trim() &&
    values.category &&
    values.medium;

  const addChip = (which) => {
    const ref =
      which === "tags" ? tagInput : which === "materials" ? matInput : techInput;
    const setter =
      which === "tags" ? setTags : which === "materials" ? setMaterials : setTechniques;

    const raw = (ref.current?.value || "").trim();
    if (!raw) return;
    const val = raw.replace(/\s+/g, " ");
    setter((prev) => (prev.includes(val) ? prev : [...prev, val]));
    if (ref.current) {
      ref.current.value = "";
      ref.current.focus();
    }
  };

  const removeChip = (which, i) => {
    const setter =
      which === "tags" ? setTags : which === "materials" ? setMaterials : setTechniques;
    setter((prev) => prev.filter((_, idx) => idx !== i));
  };

  // restore draft
  useEffect(() => {
    try {
      const raw = localStorage.getItem("detailsDraft");
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && typeof d === "object") {
        setValues((v) => ({
          ...v,
          ...["title","description","category","medium","dimensions","year","series","inspiration","location","weight"]
            .reduce((acc, k) => (typeof d[k] === "string" ? (acc[k] = d[k], acc) : acc), {}),
          physical: typeof d.physical === "boolean" ? d.physical : v.physical,
        }));
        if (Array.isArray(d.tags)) setTags(d.tags);
        if (Array.isArray(d.materials)) setMaterials(d.materials);
        if (Array.isArray(d.techniques)) setTechniques(d.techniques);
      }
    } catch {}
  }, []);

  // persist draft
  useEffect(() => {
    try {
      const draft = { ...values, tags, materials, techniques };
      localStorage.setItem("detailsDraft", JSON.stringify(draft));
      if (values.title) localStorage.setItem("lastUploadTitle", values.title);
    } catch {}
  }, [values, tags, materials, techniques]);

  // submit
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!requiredOK) return;

    // sanitize numeric year if present
    const yearNum =
      String(values.year || "").trim() === ""
        ? null
        : Number(values.year);

    // save all editable fields to server (owner-only)
    if (createdArtworkId) {
      try {
        const r = await apiFetch(`/api/artwork/${createdArtworkId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: values.title,
            description: values.description,
            category: values.category,
            medium: values.medium,
            dimensions: values.dimensions,
            year: yearNum,
            series: values.series,
            physical: !!values.physical,
            location: values.location,
            weight: values.weight,
            inspiration: values.inspiration,
            tags,
            materials,
            techniques,
          }),
        });
        // don't block UX; swallow non-200s silently here
        await r.json().catch(() => ({}));
      } catch {}
    }

    // carry forward for next steps
    try {
      localStorage.setItem(
        "detailsForPricing",
        JSON.stringify({
          ...values,
          year: yearNum ?? values.year,
          tags, materials, techniques, createdArtworkId
        })
      );
    } catch {}

    navigate("/upload/pricing", {
      state: {
        data: {
          images: imagesFromStep1,
          details: { ...values, year: yearNum ?? values.year },
          tags,
          materials,
          techniques,
        },
      },
    });
  };

  const Chips = ({ items, onRemove }) => (
    <div className="chip-wrap">
      <AnimatePresence initial={false}>
        {items.map((it, i) => (
          <motion.span
            key={`${it}-${i}`}
            className="chip"
            variants={badgeVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            layout
          >
            {it}
            <button
              type="button"
              className="chip-x"
              aria-label={`remove ${it}`}
              onClick={() => onRemove(i)}
            >
              ×
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      {items.length === 0 && <div className="chip-empty" />}
    </div>
  );

  return (
    <main className="upload2-stage">
      <div className="upload2-frame" aria-label="Upload – Step 2">
        {/* stepper */}
        <img className="abs step step-1" src={Step1Done} alt="step 1 done" />
        <img className="abs line line-1" src={Line1Progressed} alt="" />
        <img className="abs step step-2" src={Step2D} alt="step 2 current" />
        <img className="abs line line-2" src={ProgressLine} alt="" />
        <img className="abs step step-3" src={Step3} alt="step 3" />
        <img className="abs line line-3" src={ProgressLine} alt="" />
        <img className="abs step step-4" src={Step4} alt="step 4" />
        <img className="abs line line-4" src={ProgressLine} alt="" />
        <img className="abs step step-5" src={Step5} alt="step 5" />

        {/* header art */}
        <img
          className="abs step2-desc"
          src={Step2Description}
          alt="artwork details description"
        />
        <div className="dog-wrap" aria-hidden="true">
          <DogDetails className="dog-svg only-blue-glow" />
        </div>
        <img className="abs languages" src={Languages} alt="" />

        {/* cards */}
        <form className="forms-grid" onSubmit={onSubmit}>
          {/* left */}
          <motion.div className="card" variants={cardVariants} initial="hidden" animate="visible" layout>
            <h3 className="card-title">basic information</h3>

            <motion.label className="fld" custom={0} variants={fieldVariants} initial="hidden" animate="visible">
              <span>title *</span>
              <input
                className="inp"
                value={values.title}
                onChange={onChange("title")}
                placeholder="enter artwork title"
                maxLength={120}
                required
              />
              <div className="hint">{values.title.length}/120</div>
            </motion.label>

            <motion.label className="fld" custom={1} variants={fieldVariants} initial="hidden" animate="visible">
              <span>description *</span>
              <textarea
                className="txt"
                value={values.description}
                onChange={onChange("description")}
                placeholder="describe your artwork"
                rows={4}
                required
              />
              <div className="hint">
                {values.description.split(/\s+/).filter(Boolean).length} words
              </div>
            </motion.label>

            <motion.label className="fld" custom={2} variants={fieldVariants} initial="hidden" animate="visible">
              <span>category *</span>
              <select
                className="sel"
                value={values.category}
                onChange={onChange("category")}
                required
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </motion.label>

            <motion.label className="fld" custom={3} variants={fieldVariants} initial="hidden" animate="visible">
              <span>medium *</span>
              <select
                className="sel"
                value={values.medium}
                onChange={onChange("medium")}
                required
              >
                <option value="">Select medium</option>
                {MEDIUMS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </motion.label>

            <div className="row-2col">
              <motion.label className="fld" custom={4} variants={fieldVariants} initial="hidden" animate="visible">
                <span>dimensions</span>
                <input
                  className="inp"
                  value={values.dimensions}
                  onChange={onChange("dimensions")}
                  placeholder="e.g., 40 × 60 cm"
                />
              </motion.label>

              <motion.label className="fld" custom={5} variants={fieldVariants} initial="hidden" animate="visible">
                <span>year created</span>
                <input
                  className="inp"
                  type="number"
                  inputMode="numeric"
                  placeholder="YYYY"
                  value={values.year}
                  onChange={onChange("year")}
                />
              </motion.label>
            </div>

            <motion.label className="fld" custom={6} variants={fieldVariants} initial="hidden" animate="visible">
              <span>series (optional)</span>
              <input
                className="inp"
                value={values.series}
                onChange={onChange("series")}
                placeholder="enter series name"
              />
            </motion.label>
          </motion.div>

          {/* right */}
          <motion.div className="card" variants={cardVariants} initial="hidden" animate="visible" layout>
            <h3 className="card-title">additional details</h3>

            <motion.label className="checkbox-row" custom={0} variants={fieldVariants} initial="hidden" animate="visible">
              <input
                type="checkbox"
                checked={values.physical}
                onChange={(e) =>
                  setValues((v) => ({ ...v, physical: e.target.checked }))
                }
              />
              <span>this is a physical artwork</span>
            </motion.label>

            <AnimatePresence initial={false}>
              {values.physical && (
                <motion.div
                  key="phys"
                  className="physical-box"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="row-2col">
                    <label className="fld">
                      <span>location</span>
                      <input
                        className="inp"
                        value={values.location}
                        onChange={onChange("location")}
                        placeholder="city, country"
                      />
                    </label>
                    <label className="fld">
                      <span>weight</span>
                      <input
                        className="inp"
                        value={values.weight}
                        onChange={onChange("weight")}
                        placeholder="e.g., 3.5 kg"
                      />
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tags */}
            <motion.div className="fld" custom={1} variants={fieldVariants} initial="hidden" animate="visible">
              <span>tags</span>
              <div className="chip-input">
                <input
                  ref={tagInput}
                  className="inp"
                  placeholder="type and press Enter"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChip("tags");
                    }
                  }}
                />
                <button type="button" className="plus" onClick={() => addChip("tags")}>＋</button>
              </div>
              <Chips items={tags} onRemove={(i) => removeChip("tags", i)} />
            </motion.div>

            {/* Materials */}
            <motion.div className="fld" custom={2} variants={fieldVariants} initial="hidden" animate="visible">
              <span>materials used</span>
              <div className="chip-input">
                <input
                  ref={matInput}
                  className="inp"
                  placeholder="type and press Enter"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChip("materials");
                    }
                  }}
                />
                <button type="button" className="plus" onClick={() => addChip("materials")}>＋</button>
              </div>
              <Chips items={materials} onRemove={(i) => removeChip("materials", i)} />
            </motion.div>

            {/* Techniques */}
            <motion.div className="fld" custom={3} variants={fieldVariants} initial="hidden" animate="visible">
              <span>techniques</span>
              <div className="chip-input">
                <input
                  ref={techInput}
                  className="inp"
                  placeholder="type and press Enter"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChip("techniques");
                    }
                  }}
                />
                <button type="button" className="plus" onClick={() => addChip("techniques")}>＋</button>
              </div>
              <Chips items={techniques} onRemove={(i) => removeChip("techniques", i)} />
            </motion.div>

            <motion.label className="fld" custom={4} variants={fieldVariants} initial="hidden" animate="visible">
              <span>inspiration (optional)</span>
              <textarea
                className="txt"
                value={values.inspiration}
                onChange={onChange("inspiration")}
                placeholder="share the backstory, concepts, references…"
                rows={3}
              />
            </motion.label>
          </motion.div>
        </form>

        {/* bottom buttons */}
        <img
          className="abs back-upload-btn"
          src={BackUploadBtn}
          alt="back to upload"
          role="button"
          onClick={() => window.history.back()}
        />
        <img
          className={`abs continue-btn ${!requiredOK ? "is-disabled" : ""}`}
          src={ContinueBtn}
          alt="continue"
          role="button"
          onClick={(e) => {
            if (!requiredOK) return;
            e.preventDefault();
            document
              .querySelector(".forms-grid")
              ?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
          }}
        />
      </div>
    </main>
  );
}
