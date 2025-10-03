import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Navbar from "./components/Navbar";
import "./Contracts.css";

const API =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_API) ||
  "http://localhost:5000";

export default function ContractsReview() {
  const nav = useNavigate();
  const { id } = useParams();
  const shortId = typeof id === "string" ? id.slice(0, 8) : "";
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const r = await fetch(`${API}/api/contracts/${id}`, {
          credentials: "include",
          signal: ac.signal,
        });
        if (r.status === 401) {
          nav("/account", { replace: true });
          return;
        }
        if (r.status === 404) {
          setC(null);
          return;
        }
        const j = await r.json();
        if (!j.ok) {
          setErr(j.error || "Failed to load contract.");
          setC(null);
          return;
        }
        setC(j.contract || null);
      } catch (e) {
        if (e.name !== "AbortError") {
          console.error(e);
          setErr(e.message || "Load failed");
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [id, nav]);

  async function requestSignature() {
    try {
      const r = await fetch(`${API}/api/contracts/${id}/request-sign`, {
        method: "POST",
        credentials: "include",
      });
      if (r.status === 401) return nav("/account", { replace: true });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed");
      alert("Signature request sent.");
      setC((prev) => (prev ? { ...prev, status: "negotiating" } : prev));
    } catch (e) {
      alert(e.message || "Request failed");
    }
  }

  return (
    <div className="contracts-page">
      <Navbar />
      <div className="contracts-wrap" style={{ maxWidth: 900 }}>
        <div className="contracts-head">
          <div className="title">
            <h2>Contract {shortId ? `${shortId}…` : ""}</h2>
            <p className="sub">Review & sign.</p>
          </div>
          <div className="head-actions">
            <Link to={`/contracts/${id}/edit`} className="ghost">Edit</Link>
            <button className="primary-btn" onClick={requestSignature}>
              Request signature
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty">Loading…</div>
        ) : err ? (
          <div className="empty">{err}</div>
        ) : !c ? (
          <div className="empty" style={{ textAlign: "center" }}>Contract not found.</div>
        ) : (
          <div className="table" style={{ padding: 16 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div><b>Title:</b> {c.title}</div>
              <div><b>Counterparty:</b> {c.counterparty || "—"}</div>
              <div><b>Status:</b> {c.status}</div>
              <div><b>Value:</b> {c.currency} {(Number(c.value) || 0).toLocaleString()}</div>
              <div><b>Updated:</b> {(c.updated_at || "").slice(0,10)}</div>
              <hr />
              <div style={{ whiteSpace: "pre-wrap" }}>{c.body || "No terms yet."}</div>
            </div>
          </div>
        )}

        <div className="contracts-foot">
          <Link to="/contracts" className="textlink">Back to contracts</Link>
        </div>
      </div>
    </div>
  );
}
