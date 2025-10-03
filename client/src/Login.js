// client/src/Login.js
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./global.css";
import "./Navbar.css";
import Navbar from "./components/Navbar";
import { apiFetch } from "./lib/config"; // <-- import the wrapper

// match server fallback client id
const GOOGLE_CLIENT_ID =
  "412651468180-r122p7emhutv56hm7bi12dd194qf7nrd.apps.googleusercontent.com";

export default function Login() {
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({ username: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState("");

  // If already logged in, bounce to /account
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch("/api/check-session");
        const j = await r.json();
        if (j.isLoggedIn) {
          navigate("/account", { replace: true });
          return;
        }
      } catch {
        /* ignore */
      } finally {
        setChecking(false);
      }
    })();
  }, [navigate]);

  // Google One-Tap / button
  useEffect(() => {
    const haveGoogle = () =>
      typeof window !== "undefined" &&
      window.google &&
      window.google.accounts?.id;

    const renderGoogle = () => {
      try {
        if (!haveGoogle()) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async ({ credential }) => {
            setMsg("Signing in with Google…");
            try {
              const r = await apiFetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential }),
              });
              const j = await r.json();
              if (!j.success)
                throw new Error(j.message || "Google sign-in failed");
              navigate("/account", { replace: true });
            } catch (e) {
              setMsg(e.message || "Google sign-in failed");
            }
          },
        });
        const host = document.getElementById("google-btn-host");
        if (host) {
          window.google.accounts.id.renderButton(host, {
            theme: "outline",
            size: "large",
            shape: "pill",
            text: "continue_with",
            logo_alignment: "left",
            width: 320,
          });
        }
      } catch {
        /* ignore */
      }
    };

    if (!haveGoogle()) {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = renderGoogle;
      document.head.appendChild(s);
      return () => {
        document.head.removeChild(s);
      };
    } else {
      renderGoogle();
    }
  }, []);

  const onChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");

    if (!form.username || !form.password) {
      setMsg("Please enter your username/email and password.");
      return;
    }

    try {
      const payload = {
        username: form.username,
        password: form.password,
      };
      const r = await apiFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || "Login failed");
      navigate("/account", { replace: true });
    } catch (e) {
      setMsg(e.message || "Login failed");
    }
  };

  if (checking) return null;

  return (
    <div className="auth-page">
      <Navbar />

      <main
        style={{
          display: "grid",
          placeItems: "center",
          padding: "8vh 16px",
        }}
      >
        <div
          style={{
            width: "min(520px, 92vw)",
            background: "#0b0b0b",
            color: "#fff",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.08)",
            padding: 22,
            boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
          }}
        >
          <h1
            style={{
              margin: "2px 0 12px",
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: ".04em",
            }}
          >
            Log in
          </h1>

          {/* Google */}
          <div
            id="google-btn-host"
            style={{ display: "grid", placeItems: "center", margin: "12px 0" }}
          />

          <div
            style={{
              textAlign: "center",
              color: "rgba(255,255,255,.8)",
              margin: "8px 0 12px",
              letterSpacing: ".25em",
              fontSize: 12,
            }}
          >
            OR
          </div>

          {/* Native form */}
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <div>
              <label
                htmlFor="username"
                style={{
                  display: "block",
                  fontWeight: 800,
                  fontSize: 13,
                  marginBottom: 6,
                  letterSpacing: ".08em",
                  opacity: 0.92,
                }}
              >
                Username or email
              </label>
              <input
                id="username"
                name="username"
                className="svg-input"
                placeholder="yourname or name@site.com"
                value={form.username}
                onChange={onChange}
                autoComplete="username"
              />
            </div>

            <div style={{ position: "relative" }}>
              <label
                htmlFor="password"
                style={{
                  display: "block",
                  fontWeight: 800,
                  fontSize: 13,
                  marginBottom: 6,
                  letterSpacing: ".08em",
                  opacity: 0.92,
                }}
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                className="svg-input"
                placeholder="••••••••"
                value={form.password}
                onChange={onChange}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="password-toggle"
                aria-label={showPw ? "Hide password" : "Show password"}
                title={showPw ? "Hide password" : "Show password"}
                style={{ position: "absolute", right: 6, top: 28 }}
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>

            <button type="submit" className="ipfs-pill" style={{ marginTop: 2 }}>
              Log in
            </button>
          </form>

          {msg && (
            <div
              className="form-msg"
              style={{ marginTop: 12, textAlign: "center", color: "#ffcccb" }}
            >
              {msg}
            </div>
          )}

          <p style={{ marginTop: 14, textAlign: "center", opacity: 0.9 }}>
            Don’t have an account?{" "}
            <Link to="/signup" style={{ color: "#fff", fontWeight: 800 }}>
              Sign up
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
