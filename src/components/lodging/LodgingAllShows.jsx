import { useContext, useMemo } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { fD } from "../../lib/time";
import { T } from "../../styles/tokens";

export function LodgingAllShows(){
  const{lodging,sorted,setSel,setTab,setAllShows,mobile,aC}=useContext(Ctx);
  const hotels=useMemo(()=>Object.values(lodging||{}).sort((a,b)=>(a.checkIn||"").localeCompare(b.checkIn||"")),[lodging]);
  const upcomingShows=(sorted||[]).filter(s=>s.clientId===aC&&s.type==="show");
  const totalCost=hotels.reduce((sum,h)=>sum+(parseFloat(h.cost)||0),0);
  const totalRooms=hotels.reduce((sum,h)=>sum+((h.rooms||[]).length||0),0);
  const showsCovered=new Set();
  hotels.forEach(h=>{upcomingShows.forEach(s=>{if(h.checkIn<=s.date&&h.checkOut>=s.date)showsCovered.add(s.date);});});
  const goToShow=date=>{setSel(date);setAllShows(false);setTab("lodging");};
  return(
    <div className="fi" style={{padding:mobile?"10px 8px 24px":"14px 20px 30px",flex:1,overflowY:"auto",minHeight:0}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:14}}>
        {[["Hotels",hotels.length,"booked"],["Rooms",totalRooms,"total"],["Shows Covered",`${showsCovered.size}/${upcomingShows.length}`,""],["Total Cost",`$${totalCost.toLocaleString(undefined,{maximumFractionDigits:0})}`,""]].map(([l,v,s])=>(
          <div key={l} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:9,color:T.textDim,marginBottom:2,fontWeight:600}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,color:"var(--text)",fontFamily:MN}}>{v}</div>
            {s&&<div style={{fontSize:9,color:T.textMute,fontFamily:MN,marginTop:1}}>{s}</div>}
          </div>
        ))}
      </div>
      <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",marginBottom:6}}>ALL HOTELS</div>
      {!hotels.length&&<div style={{padding:"40px 0",textAlign:"center",color:T.textDim,fontSize:11}}>No hotels yet. Open a specific show to add hotels.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {hotels.map(h=>{
          const nights=h.checkIn&&h.checkOut?Math.max(1,Math.round((new Date(h.checkOut)-new Date(h.checkIn))/86400000)):1;
          const coveredShows=upcomingShows.filter(s=>h.checkIn<=s.date&&h.checkOut>=s.date);
          return(
            <div key={h.id} className="rh" onClick={()=>goToShow(h.checkIn)} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 90px 60px",gap:8,alignItems:"center",padding:"9px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,cursor:"pointer"}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{h.name||"—"}</div>
                <div style={{fontSize:9,color:T.textDim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{h.city||""}{h.address?` · ${h.address}`:""}</div>
                {coveredShows.length>0&&<div style={{fontSize:9,color:T.accent,fontFamily:MN,marginTop:2}}>{coveredShows.map(s=>s.city).join(" · ")}</div>}
              </div>
              <div style={{fontSize:10,fontFamily:MN,color:T.text2}}>{h.checkIn?fD(h.checkIn):"—"}<span style={{color:T.textMute}}> → </span>{h.checkOut?fD(h.checkOut):"—"}</div>
              <div style={{fontSize:9,fontFamily:MN,color:T.textDim,textAlign:"right"}}>{nights}n · {(h.rooms||[]).length}rm</div>
              <div style={{fontSize:10,fontFamily:MN,color:T.text2,textAlign:"right"}}>{h.cost?`$${Number(h.cost).toLocaleString()}`:"—"}{h.currency&&h.currency!=="USD"?` ${h.currency}`:""}</div>
              <div style={{fontSize:8,padding:"2px 6px",borderRadius:99,background:h.status==="confirmed"?"var(--success-bg)":h.status==="pending"?"var(--warn-bg)":"var(--card-2)",color:h.status==="confirmed"?T.successFg:h.status==="pending"?T.warnFg:T.textMute,fontWeight:700,textAlign:"center",textTransform:"uppercase"}}>{h.status||"—"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
