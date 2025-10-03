import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Navbar from "./components/Navbar";
import "./Contracts.css";

const API =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_API) ||
  "http://localhost:5000";

export default function ContractsEdit() {
  const nav = useNavigate();
  const { id } = useParams(); // undefined on /contracts/new
  const isNew = !id;

  const [form, setForm] = useState({
    title: "",
    counterparty: "",
    status: "draft",
    currency: "USD",
    value: 0,
    body: "",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  // Load existing
  useEffect(() => {
    if (isNew) return;
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`${API}/api/contracts/${id}`, {
          credentials: "include",
          signal: ac.signal,
        });
        if (r.status === 401) return nav("/account", { replace: true });
        if (r.status === 404) return nav("/contracts", { replace: true });
        const j = await r.json();
        setForm({
          title: j.contract.title || "",
          counterparty: j.contract.counterparty || "",
          status: j.contract.status || "draft",
          currency: j.contract.currency || "USD",
          value: j.contract.value || 0,
          body: j.contract.body || "",
        });
      } catch (e) {
        if (e.name !== "AbortError") console.error(e);
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [id, isNew, nav]);

  async function save() {
    if (!form.title.trim()) {
      alert("Title is required");
      return;
    }
    try {
      setSaving(true);
      const url = isNew ? `${API}/api/contracts` : `${API}/api/contracts/${id}`;
      const method = isNew ? "POST" : "PATCH";
      const payload = {
        title: form.title,
        counterparty: form.counterparty,
        status: form.status,
        currency: form.currency,
        value: Number(form.value) || 0,
        body: form.body,
      };
      const r = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.status === 401) return nav("/account", { replace: true });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Save failed");
      const newId = isNew ? j.contract.id : id;
      nav(`/contracts/${newId}/review`);
    } catch (e) {
      alert(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="contracts-page">
      <Navbar />
      <div className="contracts-wrap" style={{ maxWidth: 900 }}>
        <div className="contracts-head">
          <div className="title">
            <h2>{isNew ? "New contract" : `Edit contract`}</h2>
            <p className="sub">{isNew ? "Fill the basic details." : "Update details and save."}</p>
          </div>
          <div className="head-actions">
            <button className="primary-btn" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty">Loading…</div>
        ) : (
          <div className="table" style={{ padding: 16 }}>
            <div style={{ display: "grid", gap: 14 }}>
              <label>
                <div>Title</div>
                <input
                  value={form.title}
                  onChange={set("title")}
                  style={{ width: "100%" }}
                />
              </label>

              <label>
                <div>Counterparty</div>
                <input
                  value={form.counterparty}
                  onChange={set("counterparty")}
                  style={{ width: "100%" }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <label>
                  <div>Status</div>
                  <select value={form.status} onChange={set("status")}>
                    <option value="draft">Draft</option>
                    <option value="negotiating">Negotiating</option>
                    <option value="active">Active</option>
                    <option value="signed">Signed</option>
                    <option value="expired">Expired</option>
                  </select>
                </label>

                <label>
                  <div>Currency</div>
                  <select value={form.currency} onChange={set("currency")}>
                    <option>USD</option>
                    <option>EUR</option>
                    <option>SGD</option>
                    <option>JPY</option>
                  </select>
                </label>

                <label>
                  <div>Value</div>
                  <input
                    type="number"
                    value={form.value}
                    onChange={set("value")}
                  />
                </label>
              </div>

              <label>
                <div>Terms (body)</div>
                <textarea
                  rows={8}
                  value={form.body}
                  onChange={set("body")}
                  style={{ width: "100%" }}
                />
              </label>
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
