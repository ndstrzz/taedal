// client/src/Search.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./Navbar.css";
import "./User.css";
import Navbar from "./components/Navbar";

const API =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_API) ||
  "http://localhost:5000";

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") || "").trim();

  const [text, setText] = useState(q);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [users, setUsers] = useState([]);
  const [arts, setArts] = useState([]);

  const canSearch = text.length >= 2;

  // run search when `q` in the URL changes
  useEffect(() => {
    setText(q);
    if (!q) {
      setUsers([]);
      setArts([]);
      return;
    }
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await fetch(`${API}/api/search?q=${encodeURIComponent(q)}`, {
          credentials: "include",
        });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || "Search failed");
        setUsers(j.users || []);
        setArts(j.artworks || []);
      } catch (e) {
        setErr(e.message || "Search failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [q]);

  const onSubmit = (e) => {
    e.preventDefault();
    setParams(text ? { q: text } : {});
  };

  const hasResults = useMemo(() => (users?.length || 0) + (arts?.length || 0) > 0, [users, arts]);

  return (
    <div className="search-page" style={{ minHeight: "100vh", background: "#000", color: "#fff" }}>
      <Navbar />

      <section style={{ maxWidth: 1100, margin: "16px auto 0", padding: "0 20px" }}>
        <form onSubmit={onSubmit} style={{ display: "flex", gap: 10 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search users or artworks…"
            aria-label="Search"
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 12,
              border: "2px solid #2b2b2b",
              background: "#0f0f0f",
              color: "#fff",
              outline: "none",
              fontFamily:
                '"THICCBOI",system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
              fontWeight: 800,
              letterSpacing: ".02em",
            }}
          />
          <button
            type="submit"
            disabled={!canSearch}
            className="tab-btn"
            style={{ whiteSpace: "nowrap" }}
            title={canSearch ? "Search" : "Type at least 2 characters"}
          >
            Search
          </button>
        </form>

        {/* status / helper text */}
        <div style={{ marginTop: 10, opacity: 0.75, fontSize: 13 }}>
          {loading
            ? "Searching…"
            : q
            ? `Results for “${q}”`
            : "Tip: search by username or artwork title (min 2 chars)."}
          {err && <span style={{ color: "#f88", marginLeft: 10 }}>{err}</span>}
        </div>

        {/* Users */}
        {users?.length > 0 && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ margin: "0 0 10px", fontFamily: '"Breakfast Club","THICCBOI"', fontSize: 18 }}>
              Users
            </h3>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {users.map((u) => (
                <li key={u.id}>
                  <Link
                    to={`/user/${u.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      border: "1px solid #222",
                      background: "#0f0f0f",
                      padding: "10px 12px",
                      borderRadius: 12,
                      textDecoration: "none",
                      color: "#fff",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: "#111",
                        overflow: "hidden",
                        flex: "0 0 36px",
                      }}
                      aria-hidden
                    >
                      {/* no avatar field here; this keeps it simple */}
                    </div>
                    <div style={{ fontWeight: 900 }}>@{u.username}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Artworks */}
        {arts?.length > 0 && (
          <section style={{ marginTop: 26, marginBottom: 60 }}>
            <h3 style={{ margin: "0 0 10px", fontFamily: '"Breakfast Club","THICCBOI"', fontSize: 18 }}>
              Artworks
            </h3>

            <div
              className="user-grid"
              style={{
                maxWidth: "unset",
                margin: 0,
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              }}
            >
              {arts.map((a) => (
                <Link
                  to={`/user/${a.user_id}`}
                  key={a.id}
                  className="user-card"
                  title={`${a.title} by ${a.username}`}
                >
                  <img src={`${API}/uploads/${a.image_file}`} alt={a.title} loading="lazy" />
                  <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
                    <b style={{ color: "#fff" }}>{a.title}</b> &nbsp;·&nbsp; @{a.username}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!loading && q && !hasResults && (
          <div style={{ marginTop: 22, opacity: 0.8 }}>No results. Try a different keyword.</div>
        )}
      </section>
    </div>
  );
}
