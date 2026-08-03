import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// Catches any render error and shows a recovery screen instead of a blank page.
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error("Huddle crashed:", err, info); }
  reset = async () => {
    try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
    try { const { sb } = await import("./lib/supabase.js"); await sb.auth.signOut(); } catch (_) {}
    location.reload();
  };
  render() {
    if (!this.state.err) return this.props.children;
    const box = { minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f5f9", fontFamily: "system-ui,-apple-system,sans-serif", color: "#1f2d4e" };
    const btn = { border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
    const detail = String(this.state.err?.message || this.state.err || "Unknown error");
    return (
      <div style={box}>
        <div style={{ maxWidth: 460, textAlign: "center", padding: 24 }}>
          <img src="/huddle-icon.png" alt="Huddle" style={{ width: 46, height: 46, borderRadius: 12, margin: "0 auto 14px", display: "block" }} />
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 12px", lineHeight: 1.5 }}>
            Reloading usually fixes it. If it keeps happening, "Reset &amp; sign out" clears local data and signs you out — your studio's data is safe on the server.
          </p>
          <pre style={{ fontSize: 11, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 10px", margin: "0 0 18px", whiteSpace: "pre-wrap", textAlign: "left", maxHeight: 120, overflow: "auto" }}>{detail}</pre>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => location.reload()} style={{ ...btn, border: "1px solid #cbd5e1", background: "#fff", color: "#1f2d4e" }}>Reload</button>
            <button onClick={this.reset} style={{ ...btn, background: "#1f2d4e", color: "#fff" }}>Reset &amp; sign out</button>
          </div>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>
);
