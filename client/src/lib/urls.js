import { FRONTEND_BASE } from "./config";

/** Make any path absolute using the current frontend origin. */
export function toAbsolute(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const p = String(pathOrUrl).startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${FRONTEND_BASE}${p}`;
}
