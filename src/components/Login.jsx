import { useState } from "react";
import { supabase } from "../lib/supabase";

const C = {
  bg: "var(--bg)", card: "var(--card)", border: "var(--card-2)",
  accent: "#c9f", text: "var(--text)", textDim: "var(--text-dim)", green: "#4ade80",
};

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        // Request Gmail read scope so the Intel refresh can search threads
        scopes: "https://www.googleapis.com/auth/gmail.readonly",
        queryParams: {
          // Forces Google to show the account picker every time
          prompt: "select_account",
          // Ensures we get a refresh token
          access_type: "offline",
        },
      },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
    }
    // On success, Supabase redirects to Google — no further action needed here
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 48, maxWidth: 380, width: "90%", textAlign: "center" }}>
        {/* Logo */}
        <div style={{ fontSize: 11, color: C.accent, letterSpacing: 4, textTransform: "uppercase", marginBottom: 8 }}>Day of Show</div>
        <div style={{ fontSize: 36, fontWeight: 800, color: C.text, letterSpacing: 3, marginBottom: 4 }}>DOS</div>
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 40 }}>Tour Operations</div>

        {/* Sign in button */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: "100%", padding: "12px 24px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: loading ? "#1a1a28" : "#1e1e30", color: C.text, fontSize: 14, fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, transition: "background 0.15s",
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#252538"; }}
          onMouseLeave={e => { e.currentTarget.style.background = loading ? "#1a1a28" : "#1e1e30"; }}
        >
          {/* Google icon */}
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {loading ? "Redirecting..." : "Sign in with Google"}
        </button>

        {/* Gmail permission note */}
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 16, lineHeight: 1.5 }}>
          Requests read-only Gmail access for Intel refresh.<br />
          Your emails are never stored — only searched and classified.
        </div>

        {error && (
          <div style={{ marginTop: 16, padding: "10px 14px", background: "#f8717122", border: "1px solid #f87171", borderRadius: 6, fontSize: 12, color: "#f87171" }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
