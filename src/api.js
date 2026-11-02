// Thin client for the mspulse-backend DPR API.
// Dev: "/api/v1" is proxied to the backend by vite.config.js. A production build must be told where
// the backend is (VITE_API_BASE); without it we say so instead of calling the wrong host and 404ing.
const BASE = (import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? "/api/v1" : "")).replace(/\/+$/, "");
const KEY = "ddp.session";

export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; }
}
export function setSession(s) {
  try { s ? sessionStorage.setItem(KEY, JSON.stringify(s)) : sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

let onAuthLost = () => {};
export function setOnAuthLost(fn) { onAuthLost = fn; }

export async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  const s = getSession();
  if (auth && s?.token) headers.Authorization = `Bearer ${s.token}`;
  if (!BASE) throw new ApiError("This portal has not been connected to its server yet (VITE_API_BASE is not set).", 0);
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    // fetch only throws when no answer arrived at all: server down, wrong address, blocked by CORS, or offline.
    throw new ApiError("Can't reach the server. Check your connection and try again. If it keeps happening, tell your administrator.", 0);
  }
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || json?.success === false) {
    const msg = json?.message || json?.detail || `Request failed (${res.status})`;
    // Firebase ID tokens last ~1h; send the user back to sign-in when it lapses.
    if (auth && (res.status === 401 || (res.status === 403 && /token|inactive/i.test(msg)))) onAuthLost();
    throw new ApiError(typeof msg === "string" ? msg : "Request failed", res.status);
  }
  return json?.data;
}

export const fmtBytes = (n) => {
  if (n == null) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
};
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
// GCS md5Hash is base64; show hex like `md5sum` prints.
export const md5Hex = (b64) => {
  if (!b64) return null;
  try { return Array.from(atob(b64), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(""); } catch { return b64; }
};
