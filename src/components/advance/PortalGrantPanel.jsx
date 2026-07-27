import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { ALL_SHOWS } from "../../lib/ros-data";
import { T } from "../../styles/tokens";
import { MN } from "../../lib/domain-constants";

const fmtWhen = (iso) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
};

// Grants let a venue/promoter log into /portal and view/confirm their side of
// this one show's advance checklist. show_key is the same `eventKey` this tab
// already keys advance state by (usually the bare show date); client_id
// disambiguates it, since eventKey/date alone is not globally unique across
// clients (see the date-collision note below).
export function PortalGrantPanel({ show, eventKey, clientId }) {
  const [grants, setGrants] = useState([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const dateKey = String(eventKey).split("#")[0];
  const collision = ALL_SHOWS.some(s => s.date === dateKey && s.clientId !== clientId);

  const load = async () => {
    const { data, error } = await supabase.rpc("advance_portal_admin_list_grants", {
      p_show_key: eventKey, p_client_id: clientId,
    });
    if (!error) setGrants(data || []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [eventKey, clientId]);

  const grant = async () => {
    if (!email.trim()) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("advance_portal_admin_grant", {
      p_show_key: eventKey, p_client_id: clientId,
      p_venue_label: show ? `${show.venue}, ${show.city}` : eventKey,
      p_email: email.trim(),
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setEmail(""); load();
  };

  const revoke = async (grantedEmail) => {
    setErr(null);
    const { error } = await supabase.rpc("advance_portal_admin_revoke", {
      p_show_key: eventKey, p_client_id: clientId, p_email: grantedEmail,
    });
    if (error) { setErr(error.message); return; }
    load();
  };

  return (
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
      <div style={{fontSize:9,fontWeight:700,color:T.textDim,marginBottom:6,letterSpacing:"0.06em"}}>VENUE / PROMOTER PORTAL ACCESS</div>
      {collision && (
        <div style={{fontSize:9,color:"var(--warn-fg)",background:"var(--warn-bg)",borderRadius:6,padding:"5px 8px",marginBottom:8}}>
          ⚠ Another show on this date ({dateKey}) belongs to a different client. Double-check this is the right show before granting access.
        </div>
      )}
      <div style={{display:"flex",gap:6,marginBottom:8}}>
        <input
          value={email} onChange={e=>setEmail(e.target.value)} placeholder="venue or promoter email"
          onKeyDown={e=>{if(e.key==="Enter")grant();}}
          style={{flex:1,background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:T.text,fontSize:10,padding:"5px 8px",outline:"none"}}
        />
        <button onClick={grant} disabled={busy || !email.trim()} style={{background:"var(--accent)",border:"none",borderRadius:6,color:"#fff",fontSize:9,padding:"5px 12px",cursor:"pointer",fontWeight:700}}>
          {busy ? "Granting…" : "Grant access"}
        </button>
      </div>
      {err && <div style={{fontSize:9,color:"var(--danger-fg)",marginBottom:8}}>{err}</div>}
      {grants.length > 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {grants.map(g => (
            <div key={g.granted_email} style={{display:"flex",alignItems:"center",gap:6,fontSize:9}}>
              <span style={{color:T.text,fontFamily:MN,flex:1}}>{g.granted_email}</span>
              {g.revoked_at ? (
                <span style={{color:T.textMute}}>revoked {fmtWhen(g.revoked_at)}</span>
              ) : (
                <>
                  <span style={{color:T.textMute}}>granted {fmtWhen(g.created_at)}</span>
                  <button onClick={()=>revoke(g.granted_email)} style={{background:"none",border:"none",color:"var(--danger-fg)",cursor:"pointer",fontWeight:700,fontSize:9,padding:"2px 4px"}}>Revoke</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{fontSize:8,color:T.textMute,marginTop:8}}>
        They sign in at <span style={{fontFamily:MN}}>{typeof window!=="undefined"?window.location.origin:""}/portal</span> with the granted email.
      </div>
    </div>
  );
}
