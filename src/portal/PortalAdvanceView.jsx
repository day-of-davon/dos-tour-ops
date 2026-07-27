import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { usePortalAuth } from "./PortalAuthGate";
import { AT, DEPTS, DM, MN, SC } from "../lib/domain-constants";
import { StatusBtn } from "../components/shared/StatusBtn";
import { T } from "../styles/tokens";

const fmtWhen = (iso) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

export function PortalAdvanceView({ grant, onBack, onSignOut }) {
  const { user } = usePortalAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState({});
  const [customItems, setCustomItems] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.rpc("portal_get_advance", {
      p_show_key: grant.show_key, p_client_id: grant.client_id,
    });
    if (error) { setError(error.message); setLoading(false); return; }
    setItems(data?.items || {});
    setCustomItems(data?.customItems || []);
    setOverrides(data?.itemOverrides || {});
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [grant.show_key, grant.client_id]);

  const allItems = useMemo(() => [...AT, ...customItems], [customItems]);
  const getQ = (item) => overrides[item.id]?.q || item.q;
  const getStatus = (id) => items[id]?.status || "pending";
  const canEdit = (item) => item.dir === "they_provide" || item.dir === "bilateral";

  const setStatus = async (id, status) => {
    setBusyId(id);
    const { data, error } = await supabase.rpc("portal_update_advance_item", {
      p_show_key: grant.show_key, p_client_id: grant.client_id, p_item_id: id, p_status: status,
    });
    setBusyId(null);
    if (error) { setError(error.message); return; }
    setItems(prev => ({ ...prev, [id]: data }));
  };

  if (loading) return <Shell title={grant.venue_label || grant.show_key}><div style={{padding:40,textAlign:"center",color:T.textDim,fontSize:12}}>Loading advance…</div></Shell>;

  return (
    <Shell title={grant.venue_label || grant.show_key} onBack={onBack} onSignOut={onSignOut} userEmail={user?.email}>
      {error && <div style={{margin:"0 20px 12px",padding:"8px 12px",borderRadius:8,background:"var(--danger-bg)",color:"var(--danger-fg)",fontSize:11}}>{error}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8,padding:"0 20px 30px"}}>
        {DEPTS.filter(d => d.id !== "all").map(dept => {
          const dItems = allItems.filter(t => t.dept === dept.id);
          if (!dItems.length) return null;
          return (
            <div key={dept.id} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
              <div style={{padding:"8px 14px",background:dept.bg,borderBottom:"1px solid var(--border)"}}>
                <span style={{fontSize:9,fontWeight:800,letterSpacing:"0.07em",color:dept.color}}>{dept.label.toUpperCase()}</span>
              </div>
              <div>
                {dItems.map((item, idx) => {
                  const status = getStatus(item.id);
                  const editable = canEdit(item);
                  const meta = items[item.id] || {};
                  return (
                    <div key={item.id} style={{display:"grid",gridTemplateColumns:"18px 1fr auto",gap:"0 8px",padding:"8px 14px",borderBottom:idx < dItems.length - 1 ? "1px solid var(--card-3)" : "none",opacity:editable ? 1 : 0.75,alignItems:"start"}}>
                      <span style={{fontFamily:MN,fontSize:8,color:T.textMute,paddingTop:3,textAlign:"right"}}>{idx + 1}.</span>
                      <div style={{minWidth:0}}>
                        <span style={{fontSize:10,color:status==="na"?"var(--text-mute)":"var(--text)",fontWeight:500,lineHeight:1.5,textDecoration:status==="na"?"line-through":"none"}}>{getQ(item)}</span>
                        {status==="confirmed" && meta.confirmedBy && <div style={{fontSize:8,color:T.textMute,marginTop:1,fontFamily:MN}}>✓ {meta.confirmedBy} · {fmtWhen(meta.confirmedAt)}</div>}
                        <div style={{marginTop:4}}>
                          <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:item.dir==="we_provide"?"var(--accent-pill-bg)":item.dir==="they_provide"?"var(--success-bg)":"var(--card-2)",color:item.dir==="we_provide"?"var(--accent)":item.dir==="they_provide"?"var(--success-fg)":"var(--text-2)",fontWeight:600}}>
                            {item.dir==="we_provide"?"DOS provides":item.dir==="they_provide"?"You provide":"Bilateral"}
                          </span>
                        </div>
                      </div>
                      <div style={{paddingTop:1}}>
                        {editable ? (
                          <StatusBtn status={status} setStatus={(ns)=>setStatus(item.id, ns)} mobile={false}/>
                        ) : (
                          <span style={{fontSize:9,padding:"3px 8px",borderRadius:5,background:(SC[status]||SC.pending).b,color:(SC[status]||SC.pending).c,fontWeight:700}}>{(SC[status]||SC.pending).l}</span>
                        )}
                        {busyId===item.id && <span style={{fontSize:8,color:T.textMute,marginLeft:4}}>saving…</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function Shell({ title, onBack, onSignOut, userEmail, children }) {
  return (
    <div style={{background:"var(--bg)",minHeight:"100vh",fontFamily:"'Outfit',system-ui"}}>
      <div style={{padding:"12px 20px",borderBottom:"1px solid var(--border)",background:"var(--card)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        {onBack && <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:T.textDim,fontSize:13,padding:0}}>←</button>}
        <div>
          <div style={{fontSize:13,fontWeight:700,color:T.text}}>{title}</div>
          <div style={{fontSize:9,color:T.textDim}}>Advance checklist</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
          {userEmail && <span style={{fontSize:9,color:T.textMute,fontFamily:MN}}>{userEmail}</span>}
          {onSignOut && <button onClick={onSignOut} style={{background:"var(--card-2)",border:"1px solid var(--border)",borderRadius:6,color:T.text2,fontSize:9,padding:"4px 9px",cursor:"pointer",fontWeight:600}}>Sign out</button>}
        </div>
      </div>
      <div style={{paddingTop:12}}>{children}</div>
    </div>
  );
}
