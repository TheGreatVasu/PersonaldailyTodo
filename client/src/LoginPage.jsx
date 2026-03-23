import { useMemo, useState } from "react";
import { useAuth } from "./AuthContext.jsx";

export default function LoginPage() {
  const { login, register, authLoading, authErr } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const title = useMemo(() => (mode === "login" ? "Login" : "Create account"), [mode]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (mode === "login") await login({ email: email.trim(), password });
    else await register({ email: email.trim(), password });
  }

  return (
    <div className="app">
      <header className="header header-below-nav">
        <h1 className="page-title">{title}</h1>
        <p className="tagline">Your personal todo list. Sign in to view and manage your tasks.</p>
      </header>

      {authErr && (
        <div className="banner error" role="alert">
          {authErr}
        </div>
      )}

      <section className="panel" aria-label="Auth form">
        <div className="panel-head" style={{ marginBottom: "0.75rem" }}>
          <div className="hint" style={{ marginBottom: "0.6rem" }}>
            {mode === "login" ? "Use your email and password to continue." : "Create an account with email + password."}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className={`btn ghost small ${mode === "login" ? "active" : ""}`}
              onClick={() => setMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={`btn ghost small ${mode === "register" ? "active" : ""}`}
              onClick={() => setMode("register")}
            >
              Register
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit}>
          <label className="date-label" style={{ marginBottom: "0.6rem" }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-input"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <label className="date-label" style={{ marginBottom: "0.9rem" }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-input"
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          <button type="submit" className="btn primary" disabled={authLoading || !email.trim() || !password}>
            {mode === "login" ? "Login" : "Create account"}
          </button>
        </form>
      </section>
    </div>
  );
}

