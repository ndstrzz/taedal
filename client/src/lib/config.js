//C:\Users\User\Downloads\taedal-project\client\src\lib\config.js

/* eslint-disable no-console */

// Detect browser presence safely
const hasWindow = typeof window !== "undefined";

/**
 * 1) Optional local override via DevTools:
 *    localStorage.setItem('API_BASE_OVERRIDE', 'https://your-tunnel.trycloudflare.com')
 *    clear with: localStorage.removeItem('API_BASE_OVERRIDE')
 */
const lsOverride =
  (hasWindow && window.localStorage?.getItem("API_BASE_OVERRIDE")) || "";

/**
 * 2) Build-time env (recommended for your Cloudflare tunnel)
 *    .env => REACT_APP_API_BASE=https://<your-tunnel>.trycloudflare.com
 */
const envBase = process.env.REACT_APP_API_BASE || "";

/**
 * 3) Optional runtime injection (lowest priority to avoid stale values)
 *    window.__CONFIG__ = { API_BASE: "https://..." }
 */
const injected = (hasWindow && window.__CONFIG__?.API_BASE) || "";

/** Pick the winner (override > env > injected > localhost) and normalize */
function normalizeBase(u) {
  return String(u || "").replace(/\/+$/, "");
}

export const API_BASE = normalizeBase(
  lsOverride || envBase || injected || "http://localhost:5000"
);

export const FRONTEND_BASE = hasWindow
  ? window.location.origin
  : "http://localhost:3000";

/**
 * Small helper that always hits the right API base and includes cookies.
 * Usage: apiFetch('/api/me').then(r => r.json())
 */
export function apiFetch(path, opts = {}) {
  const isAbs = typeof path === "string" && /^https?:\/\//i.test(path);
  const rel = String(path || "");
  const full = isAbs
    ? rel
    : `${API_BASE}${rel.startsWith("/") ? rel : `/${rel}`}`;

  return fetch(full, {
    credentials: "include",
    cache: "no-store",
    headers: {
  ...(opts.headers || {}),
},

    ...opts,
  });
}

/** Helpers to manage the local override quickly during demos */
export function setApiBaseOverride(url) {
  if (!hasWindow) return;
  if (url) {
    window.localStorage.setItem("API_BASE_OVERRIDE", normalizeBase(url));
  } else {
    window.localStorage.removeItem("API_BASE_OVERRIDE");
  }
  console.warn(
    "[cfg] API_BASE_OVERRIDE updated. Hard-reload the page to apply."
  );
}

export function clearApiBaseOverride() {
  if (!hasWindow) return;
  window.localStorage.removeItem("API_BASE_OVERRIDE");
  console.warn("[cfg] API_BASE_OVERRIDE cleared. Hard-reload to apply.");
}

/** Tiny debug breadcrumb so you can see what actually won */
if (hasWindow) {
  // Expose the effective value for quick inspection from DevTools
  window.__TAEDAL_EFFECTIVE_API__ = API_BASE;
  console.log("[cfg] API_BASE:", API_BASE, {
    from: lsOverride ? "localStorage" : envBase ? ".env" : injected ? "injected" : "default",
  });
}
