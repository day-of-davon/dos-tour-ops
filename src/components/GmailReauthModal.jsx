import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function GmailReauthModal({ onClose }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const reauth = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        scopes: "https://www.googleapis.com/auth/gmail.readonly",
        queryParams: { prompt: "select_account", access_type: "offline" },
      },
    });
    if (error) { setErr(error.message); setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: "100%", background: "#fff", borderRadius: 12, border: "1px solid #d6d3cd", padding: 20, fontFamily: "'Outfit',system-ui" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#5B21B6", letterSpacing: "0.06em" }}>GMAIL ACCESS</span>
          <span style={{ fontSize: 8, padding: "2px 7px", borderRadius: 10, background: "#FEF3C7", color: "#92400E", fontWeight: 700 }}>EXPIRED</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 18 }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600, marginBottom: 4 }}>Re-authenticate to refresh intel.</div>
        <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5, marginBottom: 14 }}>
          Google access expired. Sign in again to keep Gmail scraping, flight imports, and intel refreshes working. Your app state is preserved.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={reauth} disabled={busy} style={{ flex: 1, padding: "9px 14px", borderRadius: 8, border: "none", background: busy ? "#ebe8e3" : "#5B21B6", color: busy ? "#64748b" : "#fff", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: busy ? "#64748b" : "#fff" }}>G</span>
            {busy ? "Redirecting…" : "Sign in with Google"}
          </button>
          <button onClick={onClose} style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid #d6d3cd", background: "#fff", color: "#475569", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Later</button>
        </div>
        {err && <div style={{ fontSize: 10, color: "#B91C1C", marginTop: 10, fontFamily: "'JetBrains Mono',monospace" }}>{err}</div>}
      </div>
    </div>
  );
}
