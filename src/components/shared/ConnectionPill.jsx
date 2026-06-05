import { computeLayoverMins, fmtMins } from "../../DosApp.jsx";
import { MN } from "../../lib/domain-constants";

export function ConnectionPill({prev,next}){
  const m=computeLayoverMins(prev,next);
  if(!m)return null;
  const tight=m<60,missed=m<0;
  const col=missed?"var(--danger-fg)":tight?"var(--warn-fg)":"var(--text-mute)";
  const bg=missed?"var(--danger-bg)":tight?"var(--warn-bg)":"transparent";
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,padding:"0 4px",margin:"1px 0"}}>
      <div style={{flex:1,height:1,background:"var(--card-3)"}}/>
      <span style={{fontSize:8,fontFamily:MN,fontWeight:700,color:col,background:bg,padding:"1px 7px",borderRadius:8,whiteSpace:"nowrap"}}>
        {missed?`✗ missed by ${Math.abs(m)}m`:tight?`⚠ ${fmtMins(m)} layover · ${next.from||""}`:`${fmtMins(m)} · ${next.from||""}`}
      </span>
      <div style={{flex:1,height:1,background:"var(--card-3)"}}/>
    </div>
  );
}
