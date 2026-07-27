import { useMemo } from "react";
import { MN } from "../../lib/domain-constants";
import { FLEET } from "../../lib/tour-data";
import { T } from "../../styles/tokens";
import { FLEET_EXCEPTION_STATUSES, collectFleetExceptions, useFleetExceptionStatus } from "../../lib/fleet";

export function FleetExceptionsView(){
  const[overrides,setStatus]=useFleetExceptionStatus();
  const exceptions=useMemo(()=>collectFleetExceptions(),[]);
  const withStatus=exceptions.map(e=>({...e,status:overrides[e.id]||e.status}));
  const counts=withStatus.reduce((m,e)=>{m[e.status]=(m[e.status]||0)+1;return m;},{});
  const trailerSpec=`${FLEET.trailer.lengthM}L × ${FLEET.trailer.widthM}W × ${FLEET.trailer.heightM}H m`;
  const truckSpec=`${FLEET.trucks.length}x Fly By Nite ${FLEET.trucks[0].sizeFt}ft`;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{padding:"10px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <div style={{fontSize:11,fontWeight:800,color:T.text,letterSpacing:"-0.01em"}}>Fleet exceptions</div>
        <div style={{display:"flex",gap:6,fontSize:9,fontFamily:MN}}>
          {FLEET_EXCEPTION_STATUSES.map(([s,l,fg,bg])=>(
            <span key={s} style={{padding:"2px 8px",borderRadius:99,background:bg,color:fg,fontWeight:700}}>{l} {counts[s]||0}</span>
          ))}
        </div>
        <div style={{marginLeft:"auto",fontSize:9,fontFamily:MN,color:T.textMute,textAlign:"right"}}>
          Bus + trailer ({trailerSpec}) ≈ {FLEET.combinedLengthM}m · {truckSpec}
        </div>
      </div>
      {withStatus.length===0&&<div style={{padding:"40px 20px",textAlign:"center",color:T.textMute,fontSize:11,fontStyle:"italic"}}>No fleet exceptions on file.</div>}
      {withStatus.map(e=>{
        const sty=FLEET_EXCEPTION_STATUSES.find(s=>s[0]===e.status)||FLEET_EXCEPTION_STATUSES[0];
        return(
          <div key={e.id} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",opacity:e.status==="resolved"?0.6:1}}>
            <div style={{padding:"10px 14px",display:"flex",alignItems:"flex-start",gap:12,flexWrap:"wrap",borderBottom:"1px solid var(--card-2)"}}>
              <div style={{minWidth:0,flex:"1 1 220px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
                  <span style={{fontSize:8,fontWeight:800,padding:"1px 7px",borderRadius:99,background:e.kind==="crossing"?"var(--accent-pill-bg)":"var(--info-bg)",color:e.kind==="crossing"?"var(--accent)":"var(--info-fg)",letterSpacing:"0.06em"}}>{e.kind==="crossing"?"CROSSING":"VENUE"}</span>
                  <span style={{fontSize:9,color:T.textDim,fontFamily:MN}}>{e.date}{e.dow?` · ${e.dow}`:""}</span>
                  <span style={{fontSize:8,fontFamily:MN,color:T.textMute}}>{e.iso}</span>
                  <span style={{fontSize:8,fontWeight:800,padding:"1px 7px",borderRadius:99,background:sty[3],color:sty[2],letterSpacing:"0.06em",textTransform:"uppercase"}}>{sty[1]}</span>
                </div>
                <div style={{fontSize:13,fontWeight:800,color:T.text,letterSpacing:"-0.01em"}}>{e.label}</div>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {FLEET_EXCEPTION_STATUSES.map(([s,l,fg,bg])=>(
                  <button key={s} onClick={()=>setStatus(e.id,s)} style={{fontSize:8,padding:"3px 8px",borderRadius:5,border:`1px solid ${e.status===s?fg:"var(--border)"}`,background:e.status===s?bg:"var(--card-2)",color:e.status===s?fg:T.textDim,cursor:"pointer",fontWeight:700,fontFamily:MN,letterSpacing:"0.04em",textTransform:"uppercase"}}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{padding:"10px 14px",fontSize:11,lineHeight:1.5,color:T.text2}}>
              <div style={{marginBottom:6}}><span style={{fontSize:8,fontFamily:MN,fontWeight:800,color:T.textMute,letterSpacing:"0.08em",marginRight:6}}>REASON</span>{e.reason}</div>
              <div><span style={{fontSize:8,fontFamily:MN,fontWeight:800,color:T.textMute,letterSpacing:"0.08em",marginRight:6}}>ACTION</span>{e.action}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
