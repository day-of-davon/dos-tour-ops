import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { usePortalAuth } from "./PortalAuthGate";
import { PortalShowPicker } from "./PortalShowPicker";
import { PortalAdvanceView } from "./PortalAdvanceView";
import { T } from "../styles/tokens";

export default function PortalApp() {
  const { user } = usePortalAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [grants, setGrants] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("portal_list_my_grants");
      if (error) { setError(error.message); setLoading(false); return; }
      setGrants(data || []);
      if ((data || []).length === 1) setSelected(data[0]);
      setLoading(false);
    })();
  }, []);

  const signOut = () => supabase.auth.signOut();

  if (loading) {
    return (
      <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',system-ui"}}>
        <div style={{fontSize:11,color:T.textDim}}>Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',system-ui",padding:20}}>
        <div style={{textAlign:"center",maxWidth:340}}>
          <div style={{fontSize:12,color:"var(--danger-fg)",marginBottom:12}}>{error}</div>
          <button onClick={signOut} style={{background:"var(--card-2)",border:"1px solid var(--border)",borderRadius:8,color:T.text,fontSize:11,padding:"7px 14px",cursor:"pointer",fontWeight:600}}>Sign out</button>
        </div>
      </div>
    );
  }

  if (!grants.length) {
    return (
      <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',system-ui",padding:20}}>
        <div style={{textAlign:"center",maxWidth:340}}>
          <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:6}}>No advance access yet</div>
          <div style={{fontSize:11,color:T.textDim,marginBottom:16}}>{user?.email} doesn't have access to any show's advance. Check with your Day of Show contact.</div>
          <button onClick={signOut} style={{background:"var(--card-2)",border:"1px solid var(--border)",borderRadius:8,color:T.text,fontSize:11,padding:"7px 14px",cursor:"pointer",fontWeight:600}}>Sign out</button>
        </div>
      </div>
    );
  }

  if (!selected) {
    return <PortalShowPicker grants={grants} onSelect={setSelected} />;
  }

  return (
    <PortalAdvanceView
      grant={selected}
      onBack={grants.length > 1 ? () => setSelected(null) : null}
      onSignOut={signOut}
    />
  );
}
