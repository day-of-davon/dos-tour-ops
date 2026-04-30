import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Splash label="loading..." />;
  if (session === null) return <SignIn />;

  return (
    <AuthCtx.Provider value={{ session, user: session.user }}>
      {children}
    </AuthCtx.Provider>
  );
}

function Splash({ label }) {
  return (
    <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',system-ui"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:20,fontWeight:800,color:"var(--text)",letterSpacing:"-0.03em"}}>DOS</div>
        <div style={{fontSize:10,color:"var(--text-dim)",marginTop:3,fontFamily:"'JetBrains Mono',monospace"}}>v7.0 {label}</div>
      </div>
    </div>
  );
}

function SignIn() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        scopes: "https://www.googleapis.com/auth/gmail.readonly",
      },
    });
    if (error) { setErr(error.message); setBusy(false); }
  };
  return (
    <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',system-ui",padding:20}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"32px 28px",width:"100%",maxWidth:360,textAlign:"center",boxShadow:"0 10px 30px rgba(0,0,0,.04)"}}>
        <div style={{fontSize:20,fontWeight:800,color:"var(--text)",letterSpacing:"-0.03em"}}>DOS</div>
        <div style={{fontSize:10,color:"var(--text-mute)",fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>v7.0 · Tour Ops</div>
        <div style={{fontSize:11,color:"var(--text-dim)",margin:"18px 0 22px"}}>Sign in to continue.</div>
        <button onClick={go} disabled={busy} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1px solid var(--border)",background:busy?"var(--card-2)":"var(--card-2)",color:"var(--text)",fontSize:13,fontWeight:600,cursor:busy?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span style={{fontSize:13,fontWeight:800,color:"#4285F4"}}>G</span>{busy ? "Redirecting…" : "Continue with Google"}
        </button>
        {err && <div style={{fontSize:10,color:"var(--danger-fg)",marginTop:12,fontFamily:"'JetBrains Mono',monospace"}}>{err}</div>}
      </div>
    </div>
  );
}
