import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import "./Contracts.css";

const API =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_API) ||
  "http://localhost:5000";

function Pill({ children, tone = "neutral" }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
const STATUS_META = {
  draft: { label: "Draft", tone: "muted" },
  negotiating: { label: "Negotiating", tone: "warning" },
  active: { label: "Active", tone: "info" },
  signed: { label: "Signed", tone: "success" },
  expired: { label: "Expired", tone: "danger" },
};
const TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "negotiating", label: "Negotiating" },
  { key: "active", label: "Active" },
  { key: "signed", label: "Signed" },
];

export default function Contracts() {
  const nav = useNavigate();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // load from server
  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const url = new URL(`${API}/api/contracts`);
        url.searchParams.set("tab", tab);
        if (q.trim()) url.searchParams.set("q", q.trim());
        const r = await fetch(url, { credentials: "include", signal: ac.signal });
        if (r.status === 401) return nav("/account", { replace: true });
        const j = await r.json();
        setRows(j.contracts || []);
      } catch (e) {
        if (e.name !== "AbortError") console.error(e);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [tab, q, nav]);

  const filtered = useMemo(() => rows, [rows]);

  return (
    <div className="contracts-page">
      <Navbar />
      <div className="contracts-wrap">
        {/* header row */}
        <div className="contracts-head">
          <div className="title">
            <h2>Contracts</h2>
            <p className="sub">Manage IP licensing, commissions, and collabs.</p>
          </div>

        <div className="head-actions">
            <div className="search">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search contract, counterparty…"
              />
              {q && (
                <button className="clear" onClick={() => setQ("")} aria-label="Clear search">
                  ✕
                </button>
              )}
            </div>
            <button className="primary-btn" onClick={() => nav("/contracts/new")}>
              + New contract
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="contracts-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`tab ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* table */}
        {loading ? (
          <div className="empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <p>No contracts here yet.</p>
            <button className="primary-btn" onClick={() => nav("/contracts/new")}>
              Create your first contract
            </button>
          </div>
        ) : (
          <div className="table">
            <div className="thead">
              <div>Title</div>
              <div>Counterparty</div>
              <div>Status</div>
              <div className="num">Value</div>
              <div>Updated</div>
              <div className="right">Actions</div>
            </div>

            <div className="tbody">
              {filtered.map((r) => {
                const meta = STATUS_META[r.status] || STATUS_META.draft;
                return (
                  <div key={r.id} className="trow">
                    <div className="cell title">
                      <button className="linklike" onClick={() => nav(`/contracts/${r.id}/review`)}>
                        {r.title}
                      </button>
                    </div>
                    <div className="cell">{r.counterparty || "—"}</div>
                    <div className="cell">
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                    </div>
                    <div className="cell num">
                      {r.currency} {(Number(r.value) || 0).toLocaleString()}
                    </div>
                    <div className="cell">{(r.updated_at || "").slice(0, 10)}</div>
                    <div className="cell right">
                      <button className="ghost" onClick={() => nav(`/contracts/${r.id}/review`)}>
                        Open
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="contracts-foot">
          <Link to="/profile" className="textlink">
            Back to profile
          </Link>
        </div>
      </div>
    </div>
  );
}
