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
    <div style={{background:"#F5F3EF",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',system-ui"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:18,fontWeight:800,color:"#0f172a",letterSpacing:"-0.03em"}}>DOS</div>
        <div style={{fontSize:10,color:"#64748b",marginTop:3,fontFamily:"'JetBrains Mono',monospace"}}>v7.0 {label}</div>
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
    <div style={{background:"#F5F3EF",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',system-ui",padding:20}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
      <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:14,padding:"32px 28px",width:"100%",maxWidth:360,textAlign:"center",boxShadow:"0 10px 30px rgba(0,0,0,.04)"}}>
        <div style={{fontSize:22,fontWeight:800,color:"#0f172a",letterSpacing:"-0.03em"}}>DOS</div>
        <div style={{fontSize:10,color:"#94a3b8",fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>v7.0 · Tour Ops</div>
        <div style={{fontSize:12,color:"#64748b",margin:"18px 0 22px"}}>Sign in to continue.</div>
        <button onClick={go} disabled={busy} style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"1px solid #d6d3cd",background:busy?"#ebe8e3":"#fff",color:"#0f172a",fontSize:13,fontWeight:600,cursor:busy?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span style={{fontSize:14,fontWeight:800,color:"#4285F4"}}>G</span>{busy ? "Redirecting…" : "Continue with Google"}
        </button>
        {err && <div style={{fontSize:10,color:"var(--danger-fg)",marginTop:12,fontFamily:"'JetBrains Mono',monospace"}}>{err}</div>}
      </div>
    </div>
  );
}
