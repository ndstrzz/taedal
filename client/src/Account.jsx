// client/src/Account.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./global.css";
import "./Navbar.css";
import "./Account.css";

import TaedalLogoName from "./assets/images/taedal-logo-name.svg";
import MintButton from "./assets/images/mint-button.svg";
import AccountPageLogo from "./assets/images/account-page-logo.svg";
import AccountPageTitle from "./assets/images/account-page-title.svg";
import SignUpBtn from "./assets/images/sign-up-button.svg";
import LogInBtn from "./assets/images/log-in-button.svg";
import CursorSvg from "./assets/images/cursor.svg";

import { API_BASE, apiFetch } from "./lib/config";

export default function Account() {
  // session + profile
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [me, setMe] = useState(null); // full user object from /api/me

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarFileName, setAvatarFileName] = useState(null); // server filename
  const [avatarPreview, setAvatarPreview] = useState(null); // File or blob URL

  // busy + toast
  const [savingBio, setSavingBio] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2000);
  };

  // hero refs (only used when logged out)
  const titleRef = useRef(null);
  const taglineRef = useRef(null);
  const heroRef = useRef(null);
  const logoWrapRef = useRef(null);

  // ===== Who am I? (unified session check) =====
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch("/api/me", { cache: "no-store" });
        const j = await r.json();
        const ok = !!j?.ok && !!j?.user;
        setLoggedIn(ok);
        setMe(ok ? j.user : null);
      } catch {
        setLoggedIn(false);
        setMe(null);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  // Load profile into editable fields once logged in
  useEffect(() => {
    if (!loggedIn || !me) return;
    setUsername(me.username || "");
    setBio(me.bio || "");
    setAvatarFileName(me.avatar_file || null);
  }, [loggedIn, me]);

  // ===== HERO behaviors (only matter when logged out) =====
  // Auto-expand tagline tracking to match title width
  useEffect(() => {
    if (loggedIn) return; // hero hidden
    const updateTracking = () => {
      if (!titleRef.current || !taglineRef.current) return;
      const titleW = titleRef.current.getBoundingClientRect().width;
      const el = taglineRef.current;

      el.style.letterSpacing = "0px";
      el.style.whiteSpace = "nowrap";
      el.style.width = "auto";
      const baseW = el.getBoundingClientRect().width;

      const text = el.textContent || "";
      const gaps = Math.max(text.length - 1, 1);
      const spacing = Math.max((titleW - baseW) / gaps, 0);

      el.style.width = `${titleW}px`;
      el.style.letterSpacing = `${spacing}px`;
    };
    updateTracking();
    const onResize = () => updateTracking();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [loggedIn]);

  // 3D parallax tilt on cursor move (applied to the logo wrapper)
  useEffect(() => {
    if (loggedIn) return; // hero hidden
    const el = logoWrapRef.current;
    const area = heroRef.current;
    if (!el || !area) return;

    const maxTilt = 6; // degrees
    const maxMoveX = 8; // px
    const maxMoveY = 6; // px

    const onMove = (e) => {
      const rect = area.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width; // 0..1
      const y = (e.clientY - rect.top) / rect.height; // 0..1
      const dx = x - 0.5;
      const dy = y - 0.5;

      const rotateX = (-dy * maxTilt).toFixed(2);
      const rotateY = (dx * maxTilt).toFixed(2);
      const tx = (dx * maxMoveX).toFixed(2);
      const ty = (dy * maxMoveY).toFixed(2);

      el.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translate3d(${tx}px, ${ty}px, 0)`;
    };

    const onLeave = () => {
      el.style.transform =
        "perspective(800px) rotateX(0deg) rotateY(0deg) translate3d(0,0,0)";
    };

    area.addEventListener("pointermove", onMove);
    area.addEventListener("pointerleave", onLeave);
    return () => {
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerleave", onLeave);
    };
  }, [loggedIn]);

  // avatar preview URL resolution
  const currentAvatarUrl = useMemo(() => {
    if (avatarPreview && typeof avatarPreview === "string") return avatarPreview;
    if (avatarPreview && avatarPreview instanceof File)
      return URL.createObjectURL(avatarPreview);
    return avatarFileName ? `${API_BASE}/avatars/${avatarFileName}` : null;
  }, [avatarPreview, avatarFileName]);

  // pick avatar
  const onPickAvatar = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/image\/(png|jpe?g|webp|gif)/i.test(f.type)) {
      alert("Unsupported file type. Please choose a PNG, JPG, WEBP, or GIF.");
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      alert("Image is larger than 4MB. Please choose a smaller image.");
      return;
    }
    setAvatarPreview(f);
  };

  // save avatar
  const saveAvatar = async () => {
    if (!avatarPreview || !(avatarPreview instanceof File)) {
      return alert("Choose an image first.");
    }
    setSavingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("avatar", avatarPreview);
      const r = await apiFetch("/api/account/avatar", {
        method: "POST",
        body: fd,
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Upload failed");

      setAvatarFileName(j.avatar_file || null);
      setAvatarPreview(null);
      showToast("Avatar updated ✓");

      // let other pages (Profile) react live
      try {
        window.dispatchEvent(
          new CustomEvent("profile-updated", {
            detail: { avatar_file: j.avatar_file },
          })
        );
      } catch {}
    } catch (e) {
      alert(e.message || "Avatar upload failed");
    } finally {
      setSavingAvatar(false);
    }
  };

  // save bio
  const saveBio = async () => {
    setSavingBio(true);
    try {
      const r = await apiFetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Save failed");
      showToast("Profile saved ✓");
    } catch (e) {
      alert(e.message || "Save failed");
    } finally {
      setSavingBio(false);
    }
  };

  if (checking) return null;

  return (
    <div className="account-page" style={{ "--cursor": `url(${CursorSvg}) 8 8` }}>
      {/* ===== NAVBAR ===== */}
      <header className="navbar">
        <div className="navbar-left">
          <Link to="/" className="logo-link">
            <img src={TaedalLogoName} alt="Taedal" className="taedal-logo-name" />
          </Link>
        </div>
        <div className="navbar-right">
          <Link to="/community" className="nav-link">community</Link>
          <Link to="/portfolio" className="nav-link">portfolio</Link>
          <Link to="/account" className="nav-link active">account</Link>
          <Link to="/mint" className="mint-btn">
            <img src={MintButton} alt="Mint" className="mint-button-img" />
          </Link>
        </div>
      </header>

      {/* =========================
          LOGGED OUT → SHOW HERO
          ========================= */}
      {!loggedIn && (
        <main ref={heroRef} className="account-hero">
          {/* 3D-tilt wrapper */}
          <div className="account-hero-logo-wrap" ref={logoWrapRef}>
            <img
              src={AccountPageLogo}
              alt="Account Hero"
              className="account-hero-logo"
              draggable="false"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                console.warn("Account hero image failed to load. Check the filename/path.");
              }}
            />
          </div>

          {/* TAEDAL title below logo */}
          <img
            ref={titleRef}
            src={AccountPageTitle}
            alt="TAEDAL"
            className="account-hero-title"
            draggable="false"
            onLoad={() => window.dispatchEvent(new Event("resize"))}
          />

          {/* buttons */}
          <div className="account-cta-row">
            <Link to="/signup" className="account-cta-btn" aria-label="Sign up">
              <img src={SignUpBtn} alt="sign up" className="account-cta-img" />
            </Link>

            <Link to="/login" className="account-cta-btn" aria-label="Log in">
              <img src={LogInBtn} alt="log in" className="account-cta-img" />
            </Link>
          </div>

          {/* tagline */}
          <p ref={taglineRef} className="account-tagline">
            made by artist for artists
          </p>
        </main>
      )}

      {/* =========================
          LOGGED IN → EDIT PROFILE
          ========================= */}
      {loggedIn && (
        <section
          className="account-wrap"
          style={{ maxWidth: 820, margin: "18px auto 60px", padding: "0 20px" }}
        >
          {/* toast */}
          {toast ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                position: "fixed",
                top: 18,
                left: "50%",
                transform: "translateX(-50%)",
                background: "#fff",
                color: "#000",
                borderRadius: 999,
                padding: "8px 12px",
                fontWeight: 800,
                boxShadow: "0 2px 0 #000, 0 8px 24px rgba(0,0,0,.35)",
                zIndex: 9999,
              }}
            >
              {toast}
            </div>
          ) : null}

          <h2
            style={{
              margin: "6px 0 16px",
              fontFamily: '"THICCBOI",system-ui',
              fontWeight: 900,
            }}
          >
            edit profile
          </h2>

          {/* Avatar card */}
          <div
            className="card"
            style={{
              background: "#0f0f0f",
              border: "1px solid #222",
              borderRadius: 16,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Avatar</div>

            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 104,
                  height: 104,
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: "#111",
                  border: "1px solid #222",
                  flex: "0 0 auto",
                }}
              >
                {currentAvatarUrl ? (
                  <img
                    src={currentAvatarUrl}
                    alt="avatar preview"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "grid",
                      placeItems: "center",
                      opacity: 0.6,
                    }}
                  >
                    no avatar
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <label className="ipfs-pill" style={{ cursor: "pointer" }}>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={onPickAvatar}
                  />
                  Choose image
                </label>

                <button
                  className="ipfs-pill"
                  onClick={saveAvatar}
                  disabled={!avatarPreview || savingAvatar}
                  style={{ background: "#fff", color: "#000", borderColor: "#000" }}
                >
                  {savingAvatar ? "Uploading…" : "Save avatar"}
                </button>

                {avatarPreview ? (
                  <button
                    className="ipfs-pill"
                    onClick={() => setAvatarPreview(null)}
                    disabled={savingAvatar}
                    style={{ background: "#191919", borderColor: "#333" }}
                  >
                    Cancel preview
                  </button>
                ) : null}
              </div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
              PNG / JPG / WEBP / GIF · up to 4&nbsp;MB. We’ll store it locally under{" "}
              <code>/avatars</code>.
            </div>
          </div>

          {/* Bio card */}
          <div
            className="card"
            style={{
              background: "#0f0f0f",
              border: "1px solid #222",
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Bio</div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people a little about yourself…"
              maxLength={1000}
              style={{
                width: "100%",
                minHeight: 120,
                resize: "vertical",
                background: "#121212",
                color: "#fff",
                border: "1px solid #333",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button
                className="ipfs-pill"
                onClick={saveBio}
                disabled={savingBio}
                style={{ background: "#fff", color: "#000", borderColor: "#000" }}
              >
                {savingBio ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
