import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message ?? String(this.state.error);
      return (
        <div
          className="error-boundary-fallback"
          style={{
            padding: "1.5rem",
            maxWidth: 560,
            margin: "2rem auto",
            fontFamily: "var(--font, system-ui, sans-serif)",
            color: "var(--text, #e8edf5)",
          }}
        >
          <h1 style={{ color: "#fecaca", fontSize: "1.1rem", marginTop: 0 }}>
            Something went wrong
          </h1>
          <pre
            style={{
              color: "#e8edf5",
              background: "#1a2332",
              padding: "1rem",
              borderRadius: 8,
              overflow: "auto",
              fontSize: "0.85rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {msg}
          </pre>
          <p style={{ color: "var(--muted, #8b9cb3)", fontSize: "0.9rem" }}>
            Open DevTools (F12) → Console for the full stack trace.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
