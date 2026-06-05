import { useContext, useMemo } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { fD } from "../../lib/time";
import { T } from "../../styles/tokens";

export function GuestListAllShows(){
  const{guestlists,sorted,shows,setSel,setAllShows,setTab,aC,mobile}=useContext(Ctx);
  const showRows=useMemo(()=>(sorted||[]).filter(s=>s.clientId===aC&&s.type==="show").map(s=>{
    const gl=guestlists[s.date];
    if(!gl){return{date:s.date,city:s.city,venue:s.venue,init:false,allot:0,used:0,checkedIn:0,parties:0};}
    let allot=0,used=0,checkedIn=0;
    (gl.categories||[]).forEach(c=>{allot+=(c.qty||0);});
    Object.values(gl.parties||{}).forEach(p=>{(p.entries||[]).forEach(e=>{const seats=1+(e.plusOne?1:0);used+=seats;if(e.status==="checked_in")checkedIn+=seats;});});
    return{date:s.date,city:s.city,venue:s.venue,init:true,allot,used,checkedIn,parties:Object.keys(gl.parties||{}).length,status:gl.status};
  }),[sorted,guestlists,aC]);
  const totals=showRows.reduce((acc,r)=>{acc.allot+=r.allot;acc.used+=r.used;acc.checkedIn+=r.checkedIn;acc.parties+=r.parties;acc.initShows+=r.init?1:0;return acc;},{allot:0,used:0,checkedIn:0,parties:0,initShows:0});
  const goToShow=date=>{setSel(date);setAllShows(false);setTab("guestlist");};
  return(
    <div className="fi" style={{padding:mobile?"10px 8px 24px":"14px 20px 30px",flex:1,overflowY:"auto",minHeight:0}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:14}}>
        {[["Allotments",totals.allot.toLocaleString(),`${totals.initShows}/${showRows.length} shows`],["Used",totals.used.toLocaleString(),totals.allot>0?`${Math.round(totals.used/totals.allot*100)}% utilization`:""],["Checked-in",totals.checkedIn.toLocaleString(),totals.used>0?`${Math.round(totals.checkedIn/totals.used*100)}% of seats`:""],["Parties",totals.parties.toLocaleString(),"across tour"]].map(([l,v,s])=>(
          <div key={l} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:9,color:T.textDim,marginBottom:2,fontWeight:600}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,color:"var(--text)",fontFamily:MN}}>{v}</div>
            {s&&<div style={{fontSize:9,color:T.textMute,fontFamily:MN,marginTop:1}}>{s}</div>}
          </div>
        ))}
      </div>
      <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",marginBottom:6}}>BY SHOW</div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {showRows.map(r=>{
          const pct=r.allot>0?Math.round(r.used/r.allot*100):0;
          return(
            <div key={r.date} className="rh" onClick={()=>goToShow(r.date)} style={{display:"grid",gridTemplateColumns:"58px 1fr 70px 70px 70px 80px",gap:8,alignItems:"center",padding:"9px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,cursor:"pointer"}}>
              <div style={{fontFamily:MN,fontSize:9,color:T.accent,fontWeight:700}}>{fD(r.date)}</div>
              <div style={{minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.city}</div>
                <div style={{fontSize:9,color:T.textDim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.venue}</div>
              </div>
              <div style={{fontSize:10,fontFamily:MN,color:T.text2,textAlign:"right"}}>{r.init?`${r.used}/${r.allot}`:<span style={{color:T.textMute}}>—</span>}</div>
              <div style={{fontSize:9,fontFamily:MN,color:T.textDim,textAlign:"right"}}>{r.parties} parties</div>
              <div style={{fontSize:10,fontFamily:MN,color:T.text2,textAlign:"right"}}>{r.init?`${r.checkedIn} in`:""}</div>
              <div style={{fontSize:8,padding:"2px 6px",borderRadius:99,background:r.init?(pct>=90?"var(--danger-bg)":pct>=50?"var(--warn-bg)":"var(--success-bg)"):"var(--card-2)",color:r.init?(pct>=90?T.dangerFg:pct>=50?T.warnFg:T.successFg):T.textMute,fontWeight:700,textAlign:"center"}}>{r.init?`${pct}%`:"not started"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
