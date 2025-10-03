// client/src/Signup.js
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./global.css";
import "./Navbar.css";
import "./Signup.css";

import TaedalLogoName from "./assets/images/taedal-logo-name.svg";
import MintButton from "./assets/images/mint-button.svg";
import FrameSvg from "./assets/images/signup-form-container.svg";
import SignUpGoogleSkin from "./assets/images/sign-up-google.svg";
import SignUpButton2 from "./assets/images/sign-up-button-2.svg";
import CursorSvg from "./assets/images/cursor.svg";

import { API_BASE, apiFetch } from "./lib/config";

// we’ll log once so you can verify the base being used here too
if (typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.log("[cfg] GSI API_BASE (Signup):", API_BASE);
}

function Eye({ off }) {
  return (
    <svg className="password-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5c5.5 0 9.5 4.5 10.5 6-1 1.5-5 6-10.5 6S2.5 12.5 1.5 11c1-1.5 5-6 10.5-6Z"
        fill="currentColor"
        opacity="0.75"
      />
      <circle cx="12" cy="11" r="3.5" fill="#000" />
      {off ? <line x1="3" y1="3" x2="21" y2="21" stroke="#000" strokeWidth="2" /> : null}
    </svg>
  );
}

export default function Signup() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const googleBtnRef = useRef(null);

  // --- Google Sign-In (GSI) ---
  useEffect(() => {
    const onGoogleLoaded = () => {
      if (!window.google) return;

      window.google.accounts.id.initialize({
        // same client id you used before
        client_id: "412651468180-r122p7emhutv56hm7bi12dd194qf7nrd.apps.googleusercontent.com",
        callback: async ({ credential }) => {
          try {
            setSubmitting(true);
            const r = await apiFetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential }),
            });
            const j = await r.json().catch(() => ({}));
            if (!j.success) throw new Error(j.message || "Google sign-in failed");
            navigate("/account", { replace: true });
          } catch (e) {
            setError(e.message || "Google sign-in failed");
          } finally {
            setSubmitting(false);
          }
        },
        ux_mode: "popup",
      });

      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          type: "standard",
          width: 360,
        });
      }
    };

    // load GSI script once
    if (!document.getElementById("gsi-script")) {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.id = "gsi-script";
      s.onload = onGoogleLoaded;
      document.head.appendChild(s);
      return () => { try { document.head.removeChild(s); } catch {} };
    } else {
      onGoogleLoaded();
    }
  }, [navigate]);

  // --- email/password signup ---
  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) return setError("Please enter a username.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError("Please enter a valid email.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");

    try {
      setSubmitting(true);
      const r = await apiFetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.success) throw new Error(j.message || "Sign up failed.");
      navigate("/account", { replace: true });
    } catch (e) {
      setError(e.message || "Sign up failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="signup-page" style={{ "--cursor": `url(${CursorSvg}) 8 8` }}>
      {/* NAVBAR */}
      <header className="navbar">
        <div className="navbar-left">
          <Link to="/" className="logo-link">
            <img src={TaedalLogoName} alt="Taedal" className="taedal-logo-name" />
          </Link>
        </div>
        <div className="navbar-right">
          <Link to="/community" className="nav-link">community</Link>
          <Link to="/portfolio" className="nav-link">portfolio</Link>
          <Link to="/account" className="nav-link">account</Link>
          <Link to="/mint" className="mint-btn">
            <img src={MintButton} alt="Mint" className="mint-button-img" />
          </Link>
        </div>
      </header>

      {/* FORM */}
      <main className="signup-hero">
        <div className="frame-wrap">
          <img
            className="frame-svg"
            src={FrameSvg}
            alt=""
            onError={(e) => (e.currentTarget.style.display = "none")}
          />

          <div className="frame-inner">
            <section className="signup-card enter">
              <form className="signup-form" onSubmit={onSubmit} noValidate>
                <div className="input-group">
                  <label htmlFor="su-username">USERNAME</label>
                  <input
                    id="su-username"
                    className="svg-input"
                    type="text"
                    placeholder="yourname"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    disabled={submitting}
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="su-email">EMAIL</label>
                  <input
                    id="su-email"
                    className="svg-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={submitting}
                  />
                </div>

                <div className="input-group password-wrap">
                  <label htmlFor="su-password">PASSWORD</label>
                  <input
                    id="su-password"
                    className="svg-input"
                    type={showPw ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPw ? "Hide password" : "Show password"}
                    onClick={() => setShowPw((s) => !s)}
                    disabled={submitting}
                    title={showPw ? "Hide password" : "Show password"}
                  >
                    <Eye off={showPw} />
                  </button>
                </div>

                <button
                  type="submit"
                  className="signup-submit-svg"
                  style={{
                    backgroundImage: `url(${SignUpButton2})`,
                    cursor: submitting ? "not-allowed" : "pointer",
                    opacity: submitting ? 0.75 : 1,
                  }}
                  disabled={submitting}
                  aria-busy={submitting ? "true" : "false"}
                  aria-label="Create account"
                  title="Create account"
                />

                <div className="or-divider">—&nbsp;OR&nbsp;—</div>

                <div className="google-wrap">
                  <img
                    className="google-skin"
                    src={SignUpGoogleSkin}
                    alt="Continue with Google"
                    draggable="false"
                  />
                  <div ref={googleBtnRef} className="google-native" />
                </div>

                {error ? <div className="form-msg">{error}</div> : null}

                <p className="login-inline">
                  already have an account?&nbsp;
                  <Link to="/login">log in</Link>
                </p>
              </form>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
