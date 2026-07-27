import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const PortalAuthCtx = createContext(null);
export const usePortalAuth = () => useContext(PortalAuthCtx);

export default function PortalAuthGate({ children }) {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Splash label="loading..." />;
  if (session === null) return <SignIn />;

  return (
    <PortalAuthCtx.Provider value={{ session, user: session.user }}>
      {children}
    </PortalAuthCtx.Provider>
  );
}

function Splash({ label }) {
  return (
    <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',system-ui"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:20,fontWeight:800,color:"var(--text)",letterSpacing:"-0.03em"}}>DOS</div>
        <div style={{fontSize:10,color:"var(--text-dim)",marginTop:3,fontFamily:"'JetBrains Mono',monospace"}}>Show Portal · {label}</div>
      </div>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sent, setSent] = useState(false);

  const go = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/portal` },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  };

  return (
    <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',system-ui",padding:20}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"32px 28px",width:"100%",maxWidth:360,textAlign:"center",boxShadow:"0 10px 30px rgba(0,0,0,.04)"}}>
        <div style={{fontSize:20,fontWeight:800,color:"var(--text)",letterSpacing:"-0.03em"}}>DOS</div>
        <div style={{fontSize:10,color:"var(--text-mute)",fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>Show Portal</div>
        {sent ? (
          <div style={{fontSize:11,color:"var(--text-dim)",margin:"18px 0 4px"}}>
            Check <strong style={{color:"var(--text)"}}>{email.trim()}</strong> for a sign-in link.
          </div>
        ) : (
          <>
            <div style={{fontSize:11,color:"var(--text-dim)",margin:"18px 0 14px"}}>Enter the email your advance was set up with.</div>
            <form onSubmit={go}>
              <input
                type="email" autoFocus value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="you@venue.com" disabled={busy}
                style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card-2)",color:"var(--text)",fontSize:13,outline:"none",marginBottom:10}}
              />
              <button type="submit" disabled={busy || !email.trim()} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card-2)",color:"var(--text)",fontSize:13,fontWeight:600,cursor:busy?"default":"pointer"}}>
                {busy ? "Sending…" : "Send sign-in link"}
              </button>
            </form>
          </>
        )}
        {err && <div style={{fontSize:10,color:"var(--danger-fg)",marginTop:12,fontFamily:"'JetBrains Mono',monospace"}}>{err}</div>}
      </div>
    </div>
  );
}
