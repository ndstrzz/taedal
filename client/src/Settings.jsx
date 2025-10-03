// client/src/Signup.jsx
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./global.css";
import "./Navbar.css";
import Navbar from "./components/Navbar";

const API = "http://localhost:5000";

export default function Signup() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/check-session`, { credentials: "include" });
        const j = await r.json();
        if (j.isLoggedIn) {
          navigate("/account", { replace: true });
          return;
        }
      } catch {} finally {
        setChecking(false);
      }
    })();
  }, [navigate]);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    const { username, email, password } = form;
    if (!username || !email || !password) {
      setMsg("Please fill in all fields."); return;
    }
    try {
      const r = await fetch(`${API}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, email, password }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || "Sign up failed");
      navigate("/account", { replace: true });
    } catch (e) {
      setMsg(e.message || "Sign up failed");
    }
  };

  if (checking) return null;

  return (
    <div className="auth-page">
      <Navbar />

      <main style={{ display: "grid", placeItems: "center", padding: "8vh 16px" }}>
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
          <h1 style={{ margin: "2px 0 12px", fontSize: 24, fontWeight: 900, letterSpacing: ".04em" }}>
            Sign up
          </h1>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <div>
              <label htmlFor="username" style={{ display: "block", fontWeight: 800, fontSize: 13, marginBottom: 6, letterSpacing: ".08em", opacity: 0.92 }}>
                Username
              </label>
              <input id="username" name="username" className="svg-input" placeholder="yourname" value={form.username} onChange={onChange} autoComplete="username" />
            </div>
            <div>
              <label htmlFor="email" style={{ display: "block", fontWeight: 800, fontSize: 13, marginBottom: 6, letterSpacing: ".08em", opacity: 0.92 }}>
                Email
              </label>
              <input id="email" name="email" className="svg-input" placeholder="name@site.com" value={form.email} onChange={onChange} autoComplete="email" />
            </div>
            <div>
              <label htmlFor="password" style={{ display: "block", fontWeight: 800, fontSize: 13, marginBottom: 6, letterSpacing: ".08em", opacity: 0.92 }}>
                Password
              </label>
              <input id="password" name="password" type="password" className="svg-input" placeholder="••••••••" value={form.password} onChange={onChange} autoComplete="new-password" />
            </div>
            <button type="submit" className="ipfs-pill" style={{ marginTop: 2 }}>
              Create account
            </button>
          </form>

          {msg && <div className="form-msg" style={{ marginTop: 12, textAlign: "center", color: "#ffcccb" }}>{msg}</div>}

          <p style={{ marginTop: 14, textAlign: "center", opacity: 0.9 }}>
            Already have an account?{" "}
            <Link to="/login" style={{ color: "#fff", fontWeight: 800 }}>
              Log in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
