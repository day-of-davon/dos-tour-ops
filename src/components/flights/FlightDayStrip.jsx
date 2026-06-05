import { useContext, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { tagFlightRoles } from "../../lib/flights";
import { supabase } from "../../lib/supabase";
import { T } from "../../styles/tokens";
import { FlightCard } from "./FlightCard";

export function FlightDayStrip({sel}){
  const{flights,uFlight,lodging,setTab,tourStart,tourEnd,role}=useContext(Ctx);
  const[open,setOpen]=useState(true);
  const[scanning,setScanning]=useState(false);
  const[refreshing,setRefreshing]=useState(false);
  const[stripMsg,setStripMsg]=useState("");
  const[liveStatuses,setLiveStatuses]=useState({});

  const deps=Object.values(flights).filter(f=>f.status==="confirmed"&&f.depDate===sel);
  const arrs=Object.values(flights).filter(f=>f.status==="confirmed"&&f.arrDate===sel&&f.arrDate!==f.depDate);
  const dayFlights=[...deps,...arrs];

  const scanFlights=async(e)=>{
    e.stopPropagation();
    const{data:{session}}=await supabase.auth.getSession();
    if(!session)return;
    const googleToken=session.provider_token;
    if(!googleToken){setStripMsg("Gmail unavailable — re-login.");return;}
    setScanning(true);setStripMsg("Scanning…");
    try{
      const resp=await fetch("/api/flights",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken,tourStart,tourEnd})});
      if(resp.status===402){setStripMsg("Gmail expired — re-login.");setScanning(false);return;}
      const data=await resp.json();
      if(data.error){setStripMsg(`Error: ${data.error}`);setScanning(false);return;}
      const allFlights=Object.values(flights);
      const existingKeys=new Set(allFlights.map(f=>`${f.flightNo}__${f.depDate}`));
      const novel=(data.flights||[]).filter(f=>!flights[f.id]&&!existingKeys.has(`${f.flightNo}__${f.depDate}`));
      novel.forEach(f=>uFlight(f.id,{...f,status:"pending"}));
      setStripMsg(novel.length?`+${novel.length} flight${novel.length>1?"s":""} added to Transport`:"No new flights found.");
    }catch(err){setStripMsg(`Scan failed: ${err.message}`);}
    setScanning(false);
    setTimeout(()=>setStripMsg(""),4000);
  };

  const refreshTimes=async(e)=>{
    e.stopPropagation();
    const toRefresh=dayFlights.filter(f=>f.flightNo);
    if(!toRefresh.length){setStripMsg("No flight numbers to refresh.");setTimeout(()=>setStripMsg(""),3000);return;}
    setRefreshing(true);setStripMsg("Refreshing…");
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){setRefreshing(false);return;}
      const resp=await fetch("/api/flight-status",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({flights:toRefresh.map(f=>({flightNo:f.flightNo,depDate:f.depDate,id:f.id}))})});
      if(resp.ok){
        const data=await resp.json();
        const next={};
        toRefresh.forEach(f=>{const s=data.statuses?.[`${f.flightNo}__${f.depDate}`];if(s&&!s.error)next[f.id]=s;});
        setLiveStatuses(p=>({...p,...next}));
        const updated=Object.keys(next).length;
        setStripMsg(updated?`Updated ${updated} flight${updated>1?"s":""}. `:"No status data available.");
      }
    }catch(err){setStripMsg(`Refresh failed: ${err.message}`);}
    setRefreshing(false);
    setTimeout(()=>setStripMsg(""),4000);
  };

  const hasAny=deps.length||arrs.length;
  return(
    <details style={{background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:10,marginBottom:10,overflow:"hidden"}}>
      <summary style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",userSelect:"none",listStyle:"revert"}}>
        <span style={{fontSize:10,fontWeight:800,color:T.link,letterSpacing:"0.06em"}}>✈ FLIGHTS</span>
        {deps.length>0&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--info-bg)",color:T.link,fontWeight:700}}>{deps.length} DEP</span>}
        {arrs.length>0&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--success-bg)",color:T.successFg,fontWeight:700}}>{arrs.length} ARR</span>}
        {!hasAny&&<span style={{fontSize:9,color:T.textMute,fontStyle:"italic"}}>none on this date</span>}
        {stripMsg&&<span style={{fontSize:9,color:T.textDim,fontFamily:MN,marginLeft:4}}>{stripMsg}</span>}
        <span style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}} onClick={e=>{e.stopPropagation();e.preventDefault();}}>
          {role!=="viewer"&&hasAny>0&&<button onClick={refreshTimes} disabled={refreshing} style={{fontSize:9,padding:"2px 8px",borderRadius:6,border:"1px solid var(--info-fg)",background:refreshing?"var(--info-bg)":"var(--card)",color:T.link,cursor:refreshing?"default":"pointer",fontWeight:700,flexShrink:0}}>{refreshing?"…":"↻ Times"}</button>}
          {role!=="viewer"&&<button onClick={scanFlights} disabled={scanning} style={{fontSize:9,padding:"2px 8px",borderRadius:6,border:"none",background:scanning?"var(--info-bg)":"var(--link)",color:scanning?"var(--link)":"var(--card)",cursor:scanning?"default":"pointer",fontWeight:700,flexShrink:0}}>{scanning?"Scanning…":"Scan Gmail"}</button>}
        </span>
      </summary>
      {/* Lodging summary row (always visible) */}
      {(()=>{const checkIns=Object.values(lodging||{}).filter(h=>h.checkIn===sel);const checkOuts=Object.values(lodging||{}).filter(h=>h.checkOut===sel);const staying=Object.values(lodging||{}).filter(h=>h.checkIn<sel&&h.checkOut>sel);const all=[...checkIns,...checkOuts,...staying];if(!all.length)return null;return(
        <div onClick={()=>setTab("lodging")} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",borderTop:"1px solid var(--success-bg)",background:"var(--success-bg)",cursor:"pointer",flexWrap:"wrap"}}>
          <span style={{fontSize:9,fontWeight:800,color:T.successFg,letterSpacing:"0.06em"}}>⌂ LODGING</span>
          {checkIns.map(h=><span key={h.id} style={{fontSize:9,padding:"1px 6px",borderRadius:10,background:"var(--success-fg)",color:"#fff",fontWeight:700}}>↓ {h.name}{h.checkInTime?` ${h.checkInTime}`:""}</span>)}
          {checkOuts.map(h=><span key={h.id} style={{fontSize:9,padding:"1px 6px",borderRadius:10,background:"var(--text-mute)",color:"#fff",fontWeight:700}}>↑ {h.name}{h.checkOutTime?` ${h.checkOutTime}`:""}</span>)}
          {staying.map(h=><span key={h.id} style={{fontSize:9,padding:"1px 6px",borderRadius:10,background:"var(--success-bg)",color:T.successFg,fontWeight:600,border:"1px solid var(--success-bg)"}}>● {h.name}</span>)}
        </div>
      );})()}
      <div style={{borderTop:"1px solid var(--info-bg)",display:"flex",flexDirection:"column",gap:0}}>
        <div style={{display:"flex",flexDirection:"column",gap:6,padding:"8px 10px"}}>
        {tagFlightRoles(deps,arrs).map(({f,role})=>(
          <FlightCard key={f.id} f={f}
            legLabel={role==="dep"?"DEP":"ARR"}
            defaultCollapsed={true}
            liveStatus={liveStatuses[f.id]||null}
            refreshing={false}
            onRefreshStatus={null}
          />
        ))}
        </div>
      </div>
    </details>
  );
}
