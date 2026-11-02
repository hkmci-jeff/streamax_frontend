import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../main.jsx";
import { api } from "../api.js";
import { ErrorBox, Logo } from "../components/ui.jsx";

const MESSAGES = {
  INVALID_LOGIN_CREDENTIALS: "That email and password don't match.",
  "User is inactive": "This account has been disabled. Contact your MasterScape representative.",
};

export default function Login() {
  const { session, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("signin"); // signin | reset | reset-sent

  if (session) return <Navigate to={session.user?.role === "admin" ? "/admin" : "/"} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const s = await login(email.trim(), password);
      nav(s.user?.role === "admin" ? "/admin" : "/", { replace: true });
    } catch (err) {
      setError(new Error(MESSAGES[err.message] || err.message));
    } finally { setBusy(false); }
  }

  async function requestReset(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api("/dpr-auth/password-reset", { method: "POST", body: { email: email.trim() }, auth: false });
      setMode("reset-sent");
    } catch (err) {
      setError(err);
    } finally { setBusy(false); }
  }

  const switchTo = (m) => { setMode(m); setError(null); setPassword(""); };

  if (mode !== "signin") {
    return (
      <div className="login">
        <div className="login-inner">
          <Logo size={56} />
          {mode === "reset" ? (
            <form onSubmit={requestReset}>
              <h1 style={{ fontSize: 24, textAlign: "center", marginBottom: 4 }}>Reset your password</h1>
              <p className="muted small" style={{ margin: 0, textAlign: "center" }}>
                Enter your work email and we'll send you a link to choose a new password.
              </p>
              <ErrorBox error={error} />
              <label className="field">Work email
                <input className="input" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <button className="btn btn-primary" disabled={busy} style={{ marginTop: 6, minHeight: 46 }}>
                {busy ? "Sending…" : "Send reset link"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => switchTo("signin")}>Back to sign in</button>
            </form>
          ) : (
            <div className="form-card" role="status">
              <h1 style={{ fontSize: 24, textAlign: "center", marginBottom: 4 }}>Check your email</h1>
              <p className="muted" style={{ margin: 0, textAlign: "center" }}>
                If <strong style={{ color: "var(--text)" }}>{email.trim()}</strong> has a portal account, a reset link is on its way.
                It can take a few minutes, so check your spam folder too.
              </p>
              <button type="button" className="btn btn-primary" style={{ minHeight: 46 }} onClick={() => switchTo("signin")}>Back to sign in</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      <div className="login-inner">
        <Logo size={56} />
        <form onSubmit={submit}>
          <h1 style={{ fontSize: 24, textAlign: "center", marginBottom: 4 }}>Sign in to the Data Delivery Portal</h1>
          <ErrorBox error={error} />
          <label className="field">Work email
            <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">Password
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={busy} style={{ marginTop: 6, minHeight: 46 }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" className="link-btn" onClick={() => switchTo("reset")}>Forgot password?</button>
        </form>
        <p className="faint small" style={{ margin: 0, textAlign: "center" }}>
          Invite only. Need access? Ask your MasterScape contact.
        </p>
      </div>
    </div>
  );
}
