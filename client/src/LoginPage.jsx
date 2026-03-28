import { useMemo, useState } from "react";
import { useAuth } from "./AuthContext.jsx";

export default function LoginPage() {
  const { login, register, authLoading, authErr } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const title = useMemo(() => (mode === "login" ? "Welcome back" : "Create your account"), [mode]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (mode === "login") await login({ email: email.trim(), password });
    else await register({ email: email.trim(), password });
  }

  return (
    <div className="auth-page">
      <div className="auth-backdrop" aria-hidden="true" />
      <div className="auth-card" role="region" aria-labelledby="auth-heading">
        <header className="auth-card-header">
          <p className="auth-brand">Daily To-Do List</p>
          <h1 id="auth-heading" className="auth-title">
            {title}
          </h1>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Sign in with your email and password to continue."
              : "Set up an account to sync and manage your tasks."}
          </p>
        </header>

        <div className="auth-mode-toggle" role="tablist" aria-label="Sign in or register">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`auth-mode-btn ${mode === "login" ? "is-active" : ""}`}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`auth-mode-btn ${mode === "register" ? "is-active" : ""}`}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        {authErr && (
          <div className="banner error auth-banner" role="alert">
            {authErr}
          </div>
        )}

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-input auth-input"
              placeholder="you@example.com"
              autoComplete="email"
              autoCapitalize="off"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-input auth-input"
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          <button type="submit" className="btn primary auth-submit" disabled={authLoading || !email.trim() || !password}>
            {authLoading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
