import { useContext } from "react";
import { Ctx } from "../../context/DosContext";
import { AT, MN } from "../../lib/domain-constants";
import { dU, fD } from "../../lib/time";
import { T } from "../../styles/tokens";

export function ContextBar(){
  const{sel,shows,advances,finance,setTab}=useContext(Ctx);
  const show=shows?.[sel];
  if(!show)return null;
  const adv=advances[sel]||{};const items=adv.items||{};const custom=adv.customItems||[];
  const pc=[...AT,...custom].filter(t=>(items[t.id]?.status||"pending")==="pending").length;
  const fStages=finance[sel]?.stages||{};
  const settled=["wire_ref_confirmed","signed_sheet","payment_initiated"].every(k=>fStages[k]);
  const days=dU(sel);
  const dayC=days<=7?"var(--danger-fg)":days<=14?"var(--warn-fg)":days<=21?"var(--link)":"var(--text-mute)";
  return(
    <div style={{height:28,background:"var(--card)",borderBottom:"1px solid var(--card-2)",display:"flex",alignItems:"center",padding:"0 20px",gap:12,fontSize:9,fontFamily:MN,flexShrink:0}}>
      <span onClick={()=>setTab("ros")} style={{cursor:"pointer",fontWeight:700,color:T.text,whiteSpace:"nowrap"}}>{fD(sel).toUpperCase()} · {show.city||""} · {show.venue||""}</span>
      <span style={{padding:"1px 6px",borderRadius:4,background:dayC+"22",color:dayC,fontWeight:800,fontFamily:MN,whiteSpace:"nowrap"}}>{days>0?`${days}d`:"TODAY"}</span>
      <span onClick={()=>setTab("advance")} style={{cursor:"pointer",color:pc>0?"var(--warn-fg)":"var(--text-mute)",fontWeight:pc>0?700:400,whiteSpace:"nowrap"}}>{pc} open</span>
      <span style={{display:"flex",alignItems:"center",gap:5,color:T.textMute,whiteSpace:"nowrap"}}>
        <span style={{width:7,height:7,borderRadius:99,background:settled?"var(--success-fg)":"var(--text-mute)",display:"inline-block",flexShrink:0}}/>
        {settled?"SETTLED":"OUTSTANDING"}
      </span>
    </div>
  );
}
