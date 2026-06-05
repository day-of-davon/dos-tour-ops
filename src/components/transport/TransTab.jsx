import { useContext, useEffect, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { FLEET_EXCEPTION_STATUS_KEY, collectFleetExceptions } from "../../DosApp.jsx";
import { MN } from "../../lib/domain-constants";
import { gmailUrl } from "../../lib/intel";
import { T } from "../../styles/tokens";
import { FlightsSection } from "../flights/FlightsSection";
import { TourCalendar } from "../schedule/TourCalendar";
import { AllShowsDriveSessionsView } from "./AllShowsDriveSessionsView";
import { DailyDriveSessionsView } from "./DailyDriveSessionsView";
import { FleetExceptionsView } from "./FleetExceptionsView";
import { TravelDayView } from "./TravelDayView";

export function TransTab(){
  const{flights,uFlight,sel,labelIntel,transView:view,setTransView:setView,allShows}=useContext(Ctx);
  const[crewFlightsOpen,setCrewFlightsOpen]=useState(false);
  const confirmedCount=Object.values(flights).filter(f=>f.status==="confirmed").length;
  const daySegCount=Object.values(flights).filter(s=>s.status!=="dismissed"&&(s.depDate===sel||s.arrDate===sel)).length;
  useEffect(()=>{if(allShows&&view==="travel")setView("calendar");},[allShows,view,setView]);
  const fleetOpenCount=useMemo(()=>{
    const overrides=(()=>{try{return JSON.parse(localStorage.getItem(FLEET_EXCEPTION_STATUS_KEY)||"{}");}catch{return{};}})();
    return collectFleetExceptions().filter(e=>(overrides[e.id]||e.status)==="open").length;
  },[view]);
  const fleetLabel=`Fleet${fleetOpenCount>0?` ⚠ ${fleetOpenCount}`:""}`;
  const subTabs=allShows
    ?[["calendar","Tour Calendar"],["drive","Drive Sessions"],["fleet",fleetLabel],["flights",`✈ Flights${confirmedCount>0?` (${confirmedCount})`:""}`]]
    :[["travel",`Travel Day${daySegCount>0?` (${daySegCount})`:""}`],["drive","Drive Sessions"],["fleet",fleetLabel],["flights",`✈ Flights${confirmedCount>0?` (${confirmedCount})`:""}`]];
  return(
    <div className="fi" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 115px)"}}>
      <div style={{padding:"7px 20px",borderBottom:"1px solid var(--border)",background:"var(--card)",display:"flex",gap:6,flexShrink:0,alignItems:"center",flexWrap:"nowrap",overflowX:"auto",scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
        {subTabs.map(([v,l])=>(
          <button key={v} onClick={()=>setView(v)} style={{padding:"4px 12px",borderRadius:6,border:"1px solid var(--border)",background:view===v?"var(--accent)":"var(--card-3)",color:view===v?"var(--card)":"var(--text-dim)",fontSize:10,fontWeight:700,cursor:"pointer"}}>{l}</button>
        ))}
      </div>
      <div style={{flex:1,overflow:"auto",padding:"12px 20px 30px"}}>
        {view==="calendar"&&<TourCalendar/>}
        {view==="fleet"&&<FleetExceptionsView/>}
        {view==="drive"&&(allShows?<AllShowsDriveSessionsView/>:<DailyDriveSessionsView/>)}
        {view==="travel"&&!allShows&&<><TravelDayView/><div style={{margin:"20px 0 8px",display:"flex",alignItems:"center",gap:10}}><div style={{flex:1,height:1,background:"var(--border)"}}></div><span style={{fontSize:8,fontWeight:800,color:T.textMute,letterSpacing:"0.1em",whiteSpace:"nowrap"}}>TOUR CALENDAR</span><div style={{flex:1,height:1,background:"var(--border)"}}></div></div><TourCalendar/></>}
        {view==="flights"&&<>{labelIntel?.crewFlights?.length>0&&(
          <div style={{background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:10,marginBottom:12,overflow:"hidden"}}>
            <div onClick={()=>setCrewFlightsOpen(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",cursor:"pointer",userSelect:"none"}}>
              <div style={{fontSize:9,fontWeight:800,color:"var(--info-fg)",letterSpacing:"0.08em"}}>CREW FLIGHTS · LABEL SCAN ({labelIntel.crewFlights.length} deduped)</div>
              <div style={{fontSize:11,color:"var(--info-fg)",lineHeight:1}}>{crewFlightsOpen?"▲":"▼"}</div>
            </div>
            {crewFlightsOpen&&<div style={{padding:"0 14px 12px"}}>
              {labelIntel.crewFlights.map(f=>(
                <div key={f.id} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:"1px solid var(--info-bg)",alignItems:"center"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.subject}</div>
                    <div style={{fontSize:9,color:"var(--info-fg)"}}>{f.from} · {f.date}</div>
                    {f.showId&&<div style={{fontSize:8,color:T.textDim,fontFamily:MN}}>{f.showId}</div>}
                  </div>
                  <a href={gmailUrl(f.id)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:T.link,textDecoration:"none",flexShrink:0}}>email ↗</a>
                </div>
              ))}
            </div>}
          </div>
        )}<FlightsSection/></>}
        {view==="festival"&&(
          <div style={{padding:"40px 0",textAlign:"center",color:T.textDim}}><div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Festival Dispatch</div><div style={{fontSize:11,color:T.textMute}}>Olivia manages driver pool for Beyond Wonderland and Wakaan.<br/>Payout log is in Finance → Payment Batch.</div></div>
        )}
      </div>
    </div>
  );
}
