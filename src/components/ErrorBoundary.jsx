import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const msg = (this.state.error && (this.state.error.message || String(this.state.error))) || "Unknown error";
    return (
      <div style={{ background: "#F5F3EF", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Outfit',system-ui", padding: 20 }}>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
        <div style={{ background: "#fff", border: "1px solid #d6d3cd", borderRadius: 14, padding: "28px 26px", width: "100%", maxWidth: 420, boxShadow: "0 10px 30px rgba(0,0,0,.04)" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em" }}>DOS</div>
          <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'JetBrains Mono',monospace", marginTop: 2 }}>v7.0 · crash recovery</div>
          <div style={{ fontSize: 13, color: "#0f172a", marginTop: 18, fontWeight: 600 }}>Something broke.</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6, lineHeight: 1.5 }}>The app hit an unexpected error. Your data is safe in Supabase. Reload to recover.</div>
          <pre style={{ marginTop: 12, padding: "8px 10px", background: "#F5F3EF", border: "1px solid #ebe8e3", borderRadius: 6, fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: "#B91C1C", maxHeight: 140, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg}</pre>
          <button onClick={this.handleReload} style={{ marginTop: 14, width: "100%", padding: "10px 14px", borderRadius: 8, border: "none", background: "#5B21B6", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Reload</button>
        </div>
      </div>
    );
  }
}
