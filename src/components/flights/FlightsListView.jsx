import { useContext, useEffect, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { findItineraryLegs, findReturnLeg, flightDedupKey, flightItinKey, flightToLeg, matchShowByAirport, validateConnections } from "../../lib/flights";
import { gmailUrl } from "../../lib/intel";
import { SPLIT_DAYS } from "../../lib/ros-data";
import { supabase } from "../../lib/supabase";
import { fD, fFull } from "../../lib/time";
import { T } from "../../styles/tokens";
import { IntelSection } from "../intel/IntelSection";
import { FlightCard } from "./FlightCard";
import { ReservationGroup } from "./ReservationGroup";
import { groupByReservation, matchPaxToCrew } from "../../lib/flights-view";

export function FlightsListView(){
  const{flights,uFlight,setFlights,uRos,gRos,uFin,finance,crew,setShowCrew,setSel,setTab,sorted,shows,tourStart,tourEnd,role}=useContext(Ctx);
  const goToSchedule=(date)=>{setSel(date);setTab("ros");};
  const[scanning,setScanning]=useState(false);
  const[scanMsg,setScanMsg]=useState("");
  const[pendingImport,setPendingImport]=useState([]);
  const[confirmingId,setConfirmingId]=useState(null);
  const[liveStatuses,setLiveStatuses]=useState({});  // keyed by flight id
  const[refreshingId,setRefreshingId]=useState(null);
  const[refreshingAll,setRefreshingAll]=useState(false);
  const[reassignMsg,setReassignMsg]=useState("");

  const allFlights=Object.values(flights);
  const pending=allFlights.filter(f=>f.status==="pending").sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||0);
  const confirmedRaw=allFlights.filter(f=>f.status==="confirmed").sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||a.dep?.localeCompare(b.dep||"")||0);
  // Deduplicate confirmed by strong key — keep most recently confirmed; purge extras from store
  const confirmedByKey=new Map();
  confirmedRaw.forEach(f=>{const k=flightDedupKey(f);const cur=confirmedByKey.get(k);if(!cur||(f.confirmedAt||"")>(cur.confirmedAt||""))confirmedByKey.set(k,f);});
  const keepIds=new Set([...confirmedByKey.values()].map(f=>f.id));
  const keepIdsKey=[...keepIds].sort().join(",");
  useEffect(()=>{
    const dupes=confirmedRaw.filter(f=>!keepIds.has(f.id));
    if(dupes.length)dupes.forEach(f=>uFlight(f.id,null));
  },[keepIdsKey]);// eslint-disable-line
  useEffect(()=>{
    setLiveStatuses(prev=>{
      const next={};let changed=false;
      for(const k of Object.keys(prev)){if(flights[k])next[k]=prev[k];else changed=true;}
      return changed?next:prev;
    });
  },[flights]);
  const confirmed=[...confirmedByKey.values()].sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||a.dep?.localeCompare(b.dep||"")||0);
  const unresolved=allFlights.filter(f=>f.status==="unresolved").sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||0);
  const byDate=confirmed.reduce((m,f)=>{(m[f.depDate]||(m[f.depDate]=[])).push(f);return m;},{});
  const dates=Object.keys(byDate).sort();

  const scanFlights=async()=>{
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const googleToken=session.provider_token;
      if(!googleToken){setScanMsg("Gmail access not available — re-login with Google.");return;}
      setScanning(true);setScanMsg("Scanning Gmail…");
      const showsArr=Object.values(shows||{}).map(s=>({id:s.id||s.date,date:s.date,venue:s.venue,city:s.city,type:s.type}));
      const resp=await fetch("/api/flights",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken,tourStart,tourEnd,shows:showsArr})});
      if(resp.status===402){setScanMsg("Gmail session expired — re-login.");setScanning(false);return;}
      const data=await resp.json();
      if(data.error){setScanMsg(`Error: ${data.error}`);setScanning(false);return;}
      const existingKeys=new Set(allFlights.map(flightDedupKey));
      const novel=(data.flights||[]).filter(f=>!flights[f.id]&&!existingKeys.has(flightDedupKey(f)));
      const freshCount=novel.filter(f=>f.fresh48h).length;
      const freshTag=freshCount?` (${freshCount} from last 48h)`:"";
      if(!novel.length){setScanMsg(`Scanned ${data.threadsFound} threads${data.freshThreads?` (${data.freshThreads} from last 48h)`:""} — no new flights.`);setScanning(false);return;}
      const additions={};novel.forEach(f=>{additions[f.id]={...f,status:"pending",suggestedCrewIds:matchPaxToCrew(f.pax,crew)};});
      setFlights(prev=>({...prev,...additions}));
      setScanMsg(`Added ${novel.length} flight${novel.length>1?"s":""}${freshTag} to travel days — confirm to sync crew.`);
    }catch(e){setScanMsg(`Scan failed: ${e.message}`);}
    setScanning(false);
  };

  const importFlight=f=>{uFlight(f.id,{...f,status:"pending"});setPendingImport(p=>p.filter(x=>x.id!==f.id));};
  const importAll=()=>{pendingImport.forEach(f=>uFlight(f.id,{...f,status:"pending"}));setPendingImport([]);};

  // Apply smart show-matching for one flight: treats the flight as part of a multi-leg itinerary
  // (all legs sharing confirmNo/bookingRef/pax), runs inbound-side (last leg destination) and
  // outbound-side (first leg origin) matching independently against the show list. A flight can
  // attach to BOTH a prior show (outbound) and an upcoming show (inbound) simultaneously.
  // Returns {inShow, outShow, legs, allLegObjs} so callers can report the matches.
  const assignFlightToShows=(f,allFlightsObj)=>{
    const legs=findItineraryLegs(f,allFlightsObj);
    if(!legs.length)return{inShow:null,outShow:null,legs:[],allLegObjs:[]};
    const firstLeg=legs[0],lastLeg=legs[legs.length-1];
    const allLegObjs=legs.map(flightToLeg);
    const inShow=matchShowByAirport(lastLeg.to,lastLeg.toCity,lastLeg.arrDate||lastLeg.depDate,sorted||[],"inbound");
    const outShow=matchShowByAirport(firstLeg.from,firstLeg.fromCity,firstLeg.depDate,sorted||[],"outbound");
    if(!f.pax?.length||!crew?.length)return{inShow,outShow,legs,allLegObjs};
    f.pax.forEach(name=>{
      if(!name)return;
      const match=matchPaxToCrew([name],crew).map(id=>crew.find(c=>c.id===id)).find(Boolean);
      if(!match)return;
      if(inShow){
        const inKey=f.partyId&&SPLIT_DAYS[inShow.date]?`${inShow.date}#${f.partyId}`:inShow.date;
        setShowCrew(p=>{
          const cur=p[inKey]?.[match.id]||{};
          const flightIds=new Set(allLegObjs.map(l=>l.flightId));
          const existing=(cur.inbound||[]).filter(l=>!flightIds.has(l.flightId));
          return{...p,[inKey]:{...p[inKey],[match.id]:{
            ...cur,attending:true,inboundMode:"fly",inboundConfirmed:true,
            inboundDate:lastLeg.arrDate||lastLeg.depDate,inboundTime:lastLeg.arr||"",
            inbound:[...existing,...allLegObjs]
          }}};
        });
      }
      if(outShow){
        const outKey=f.partyId&&SPLIT_DAYS[outShow.date]?`${outShow.date}#${f.partyId}`:outShow.date;
        setShowCrew(p=>{
          const cur=p[outKey]?.[match.id]||{};
          const flightIds=new Set(allLegObjs.map(l=>l.flightId));
          const existing=(cur.outbound||[]).filter(l=>!flightIds.has(l.flightId));
          return{...p,[outKey]:{...p[outKey],[match.id]:{
            ...cur,attending:true,outboundMode:"fly",outboundConfirmed:true,
            outboundDate:firstLeg.depDate,outboundTime:firstLeg.dep||"",
            outbound:[...existing,...allLegObjs]
          }}};
        });
      }
      // Fallback: no geographic match anywhere — use arrival date as show key (old behavior).
      if(!inShow&&!outShow){
        const arrD=f.arrDate||f.depDate;
        const arrKey=f.partyId&&SPLIT_DAYS[arrD]?`${arrD}#${f.partyId}`:arrD;
        setShowCrew(p=>{
          const cur=p[arrKey]?.[match.id]||{};
          const ex=(cur.inbound||[]).filter(l=>l.flightId!==f.id);
          return{...p,[arrKey]:{...p[arrKey],[match.id]:{
            ...cur,attending:true,inboundMode:"fly",inboundConfirmed:true,
            inboundDate:arrD,inboundTime:f.arr||"",inbound:[...ex,flightToLeg(f)]
          }}};
        });
      }
    });
    return{inShow,outShow,legs,allLegObjs};
  };

  const confirmFlight=f=>{
    setConfirmingId(f.id);
    uFlight(f.id,{...f,status:"confirmed",confirmedAt:new Date().toISOString()});
    if(f.cost&&f.cost>0){
      uFin(f.depDate,prev=>{
        const existing=(prev?.flightExpenses||[]).filter(e=>e.flightId!==f.id);
        return{...prev,flightExpenses:[...existing,{flightId:f.id,label:`${f.flightNo||f.carrier} ${f.from}→${f.to}`,amount:f.cost,currency:f.currency||"USD",pax:f.pax||[],carrier:f.carrier}]};
      });
    }
    assignFlightToShows(f,{...flights,[f.id]:{...f,status:"confirmed"}});
    setTimeout(()=>setConfirmingId(null),1200);
  };

  // Edit pax on a confirmed/pending flight. For confirmed flights, additionally:
  //   - pull this itinerary's legs out of removed pax's showCrew records (both inbound + outbound)
  //   - re-run show matching so newly-added pax get enrolled on matched shows
  // Pending/import flights just get the pax list updated; matching runs on confirm.
  const updatePax=(f,newPax)=>{
    const oldPax=f.pax||[];
    const cleaned=(newPax||[]).map(s=>String(s||"").trim()).filter(Boolean);
    const removed=oldPax.filter(p=>!cleaned.some(n=>n.toLowerCase()===p.toLowerCase()));
    const nextFlight={...f,pax:cleaned};
    uFlight(f.id,nextFlight);
    if(f.status!=="confirmed")return;
    const nextFlightsObj={...flights,[f.id]:nextFlight};
    const legs=findItineraryLegs(nextFlight,nextFlightsObj);
    const firstLeg=legs[0]||nextFlight,lastLeg=legs[legs.length-1]||nextFlight;
    const inShow=matchShowByAirport(lastLeg.to,lastLeg.toCity,lastLeg.arrDate||lastLeg.depDate,sorted||[],"inbound");
    const outShow=matchShowByAirport(firstLeg.from,firstLeg.fromCity,firstLeg.depDate,sorted||[],"outbound");
    const itinFlightIds=new Set(legs.map(l=>l.id));
    // Remove this itinerary's legs from removed-pax crew records on both matched shows.
    if(removed.length&&(inShow||outShow)){
      removed.forEach(name=>{
        const match=matchPaxToCrew([name],crew||[]).map(id=>(crew||[]).find(c=>c.id===id)).find(Boolean);
        if(!match)return;
        [inShow,outShow].filter(Boolean).forEach(show=>{
          setShowCrew(p=>{
            const cur=p[show.date]?.[match.id];if(!cur)return p;
            return{...p,[show.date]:{...p[show.date],[match.id]:{
              ...cur,
              inbound:(cur.inbound||[]).filter(l=>!itinFlightIds.has(l.flightId)),
              outbound:(cur.outbound||[]).filter(l=>!itinFlightIds.has(l.flightId)),
            }}};
          });
        });
      });
    }
    // Re-assign for the updated pax list. Idempotent for unchanged names; adds new ones.
    assignFlightToShows(nextFlight,nextFlightsObj);
  };
  // For a flight still in the pending-import tray, edit pax without persisting (pre-import).
  const updatePendingImportPax=(f,newPax)=>{
    const cleaned=(newPax||[]).map(s=>String(s||"").trim()).filter(Boolean);
    setPendingImport(p=>p.map(x=>x.id===f.id?{...x,pax:cleaned}:x));
  };

  // Re-run geographic+chronological matching across all confirmed flights. Useful after adding
  // new shows, correcting city data, or seeding flights ahead of attending confirmation.
  const reassignAllFlights=()=>{
    const conf=Object.values(flights).filter(f=>f.status==="confirmed");
    if(!conf.length){setReassignMsg("No confirmed flights to re-assign.");setTimeout(()=>setReassignMsg(""),3000);return;}
    const seenItin=new Set();
    let inCount=0,outCount=0,noneCount=0;
    conf.forEach(f=>{
      const key=flightItinKey(f);
      if(seenItin.has(key))return;
      seenItin.add(key);
      const{inShow,outShow}=assignFlightToShows(f,flights);
      if(inShow)inCount++;
      if(outShow)outCount++;
      if(!inShow&&!outShow)noneCount++;
    });
    setReassignMsg(`Matched ${inCount} inbound, ${outCount} outbound across ${seenItin.size} itinerary${seenItin.size>1?"s":""}. ${noneCount?`${noneCount} unmatched.`:""}`);
    setTimeout(()=>setReassignMsg(""),5000);
  };

  const fetchStatus=async(f)=>{
    if(!f.flightNo)return;
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const resp=await fetch("/api/flight-status",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({flightNo:f.flightNo,depDate:f.depDate})});
      if(!resp.ok)return;
      const data=await resp.json();
      if(data.status)setLiveStatuses(p=>({...p,[f.id]:data.status}));
    }catch(e){console.warn("[flight-status]",f.flightNo,e?.message||e);}
  };

  const refreshStatus=async(f)=>{
    setRefreshingId(f.id);
    await fetchStatus(f);
    setRefreshingId(null);
  };

  const refreshAllStatus=async()=>{
    const toRefresh=confirmed.filter(f=>f.flightNo);
    if(!toRefresh.length)return;
    setRefreshingAll(true);
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){setRefreshingAll(false);return;}
      const resp=await fetch("/api/flight-status",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({flights:toRefresh.map(f=>({flightNo:f.flightNo,depDate:f.depDate,id:f.id}))})});
      if(resp.ok){
        const data=await resp.json();
        const next={};
        toRefresh.forEach(f=>{const s=data.statuses?.[`${f.flightNo}__${f.depDate}`];if(s&&!s.error)next[f.id]=s;});
        setLiveStatuses(p=>({...p,...next}));
      }
    }catch(e){console.warn("[flight-status] refreshAll",e?.message||e);}
    setRefreshingAll(false);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {/* Scan bar */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:10,fontWeight:800,color:T.link,letterSpacing:"0.06em"}}>✈ FLIGHTS</span>
        <span style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:"var(--info-bg)",color:T.link,fontWeight:700}}>{confirmed.length} confirmed · {pending.length} pending</span>
        {scanMsg&&<span style={{fontSize:9,color:scanning?"var(--accent)":"var(--text-dim)",fontFamily:MN}}>{scanMsg}</span>}
        {reassignMsg&&<span style={{fontSize:9,color:T.successFg,fontFamily:MN,fontWeight:600}}>{reassignMsg}</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
          {confirmed.length>0&&<button onClick={reassignAllFlights} title="Re-match all confirmed flights to tour shows by airport proximity + date window" style={{background:"var(--card-3)",color:T.successFg,border:"1px solid var(--success-fg)",borderRadius:6,fontSize:10,padding:"5px 12px",cursor:"pointer",fontWeight:700}}>⟲ Re-match to Shows</button>}
          {confirmed.length>0&&<button onClick={refreshAllStatus} disabled={refreshingAll} style={{background:refreshingAll?"var(--border)":"var(--card-3)",color:refreshingAll?"var(--text-mute)":"var(--accent)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"5px 12px",cursor:refreshingAll?"default":"pointer",fontWeight:700}}>{refreshingAll?"Refreshing…":"⟳ Refresh Status"}</button>}
          {role!=="viewer"&&<button onClick={scanFlights} disabled={scanning} style={{background:scanning?"var(--border)":"var(--link)",color:scanning?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,fontSize:10,padding:"5px 14px",cursor:scanning?"default":"pointer",fontWeight:700}}>{scanning?"Scanning…":"Scan Gmail for Flights"}</button>}
        </div>
      </div>

      {/* Pending import */}
      {pendingImport.length>0&&(
        <div style={{background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:10,padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:9,fontWeight:800,color:T.link,letterSpacing:"0.06em"}}>NEW — REVIEW BEFORE IMPORTING</span>
            <button onClick={importAll} style={{fontSize:9,padding:"3px 10px",borderRadius:6,border:"none",background:"var(--link)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import All ({pendingImport.length})</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {groupByReservation(pendingImport).map(g=>(
              <ReservationGroup key={g.key} g={g} defaultCollapsed={false} renderSegment={(f,ll)=>(
                <FlightCard f={f} crew={crew} legLabel={ll} actions={<>
                  <button onClick={()=>importFlight(f)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--link)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import</button>
                  <button onClick={()=>setPendingImport(p=>p.filter(x=>x.id!==f.id))} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>Skip</button>
                  {f.tid&&<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:T.link,textDecoration:"none",marginLeft:"auto"}}>open email ↗</a>}
                </>}/>
              )}/>
            ))}
          </div>
        </div>
      )}

      {/* Pending confirmation */}
      {pending.length>0&&(
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.08em",marginBottom:8}}>PENDING CONFIRMATION <span style={{background:"var(--warn-bg)",color:T.warnFg,borderRadius:10,padding:"1px 6px",fontWeight:700,fontSize:8}}>{pending.length}</span></div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {groupByReservation(pending).map(g=>(
              <ReservationGroup key={g.key} g={g} defaultCollapsed={false} renderSegment={(f,ll)=>{const isConf=confirmingId===f.id;return(
                <FlightCard f={f} crew={crew} legLabel={ll} onUpdatePax={newPax=>updatePax(f,newPax)} actions={<>
                  <button onClick={()=>confirmFlight(f)} disabled={isConf} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:isConf?"var(--success-fg)":"var(--link)",color:"#fff",cursor:isConf?"default":"pointer",fontWeight:700}}>{isConf?"✓ Synced!":"Confirm + Sync"}</button>
                  <button onClick={()=>uFlight(f.id,{...f,status:"unresolved"})} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>Dismiss</button>
                  {f.tid&&<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:T.link,textDecoration:"none",marginLeft:"auto"}}>email ↗</a>}
                </>}/>
              );}}/>
            ))}
          </div>
        </div>
      )}

      {/* Confirmed list */}
      {confirmed.length>0?(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {dates.map(date=>(
            <div key={date}>
              <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.08em",marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>goToSchedule(date)} style={{background:"none",border:"none",padding:0,cursor:"pointer",fontSize:9,fontWeight:800,color:T.accent,letterSpacing:"0.08em",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:2}}>{fFull(date)}</button>
                <div style={{flex:1,height:1,background:"var(--border)"}}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {byDate[date].map(f=>{
                  const legs=findItineraryLegs(f,flights);
                  const firstLeg=legs[0]||f;const lastLeg=legs[legs.length-1]||f;
                  const inShow=matchShowByAirport(lastLeg.to,lastLeg.toCity,lastLeg.arrDate||lastLeg.depDate,sorted||[],"inbound");
                  const outShow=matchShowByAirport(firstLeg.from,firstLeg.fromCity,firstLeg.depDate,sorted||[],"outbound");
                  const matchBadge=(show,label,bg,c)=>show?<button onClick={()=>goToSchedule(show.date)} title={`${label} match: ${show.venue}`} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:`1px solid ${c}40`,background:bg,color:c,cursor:"pointer",fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}><span style={{fontSize:8,letterSpacing:"0.06em"}}>{label}</span>{show.city}<span style={{fontFamily:MN,fontSize:8,opacity:.7}}>{fD(show.date)}</span></button>:null;
                  // Connection warning — if this leg is a downstream leg in its itinerary, compute gap to prior leg.
                  const legIdx=legs.findIndex(l=>l.id===f.id);
                  const connRows=validateConnections(legs);
                  const connRow=legIdx>=0?connRows[legIdx]:null;
                  const connPill=connRow?.warning?(()=>{
                    const m=connRow.layover;
                    const label=m==null?connRow.warning:m<0?`✗ missed by ${Math.abs(m)}m`:m<60?`⚠ ${m}m layover`:`${Math.round(m/60*10)/10}h layover`;
                    const col=connRow.warning==="missed-connection"?"var(--danger-fg)":connRow.warning==="tight-connection"?"var(--warn-fg)":"var(--text-dim)";
                    const bg=connRow.warning==="missed-connection"?"var(--danger-bg)":connRow.warning==="tight-connection"?"var(--warn-bg)":"var(--card-soft,transparent)";
                    return <span title={`Connection at ${(f.from||"").toUpperCase()}`} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:`1px solid ${col}40`,background:bg,color:col,fontWeight:700}}>{label}</span>;
                  })():null;
                  // Return-trip chip.
                  const rtn=findReturnLeg(f,flights);
                  const rtnChip=rtn?(
                    <button onClick={()=>goToSchedule(rtn.depDate)} title={`Return leg ${(rtn.from||"").toUpperCase()}→${(rtn.to||"").toUpperCase()} ${rtn.depDate}`} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer",fontWeight:700}}>↔ return {fD(rtn.depDate)}</button>
                  ):null;
                  return(
                    <FlightCard key={f.id} f={f}
                      crew={crew}
                      defaultCollapsed={true}
                      onUpdatePax={newPax=>updatePax(f,newPax)}
                      liveStatus={liveStatuses[f.id]||null}
                      refreshing={refreshingId===f.id}
                      onRefreshStatus={f.flightNo?()=>refreshStatus(f):null}
                      actions={<>
                        {matchBadge(outShow,"← OUT","var(--warn-bg)","var(--warn-fg)")}
                        {matchBadge(inShow,"IN →","var(--success-bg)","var(--success-fg)")}
                        {connPill}
                        {rtnChip}
                        {!inShow&&!outShow&&<span style={{fontSize:9,color:T.textMute,fontStyle:"italic"}}>No show match — add city to airport table to match.</span>}
                        <button onClick={()=>goToSchedule(f.depDate)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--info-bg)",background:"var(--info-bg)",color:T.link,cursor:"pointer",fontWeight:700}}>→ Schedule {f.depDate?.slice(5)}</button>
                        {f.arrDate&&f.arrDate!==f.depDate&&<button onClick={()=>goToSchedule(f.arrDate)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--info-bg)",background:"var(--info-bg)",color:T.link,cursor:"pointer",fontWeight:700}}>→ Arr {f.arrDate?.slice(5)}</button>}
                        <button onClick={()=>uFlight(f.id,{...f,status:"unresolved"})} style={{marginLeft:"auto",fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textMute,cursor:"pointer"}}>Remove</button>
                      </>}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ):(pendingImport.length===0&&pending.length===0&&unresolved.length===0&&(
        <div style={{padding:"40px 0",textAlign:"center",color:T.textMute}}><div style={{fontSize:20,marginBottom:8,opacity:0.25}}>✈</div><div style={{fontSize:11}}>No flights yet.</div>{role!=="viewer"&&<div style={{fontSize:10,marginTop:4}}>Hit "Scan Gmail for Flights" above to import from email.</div>}</div>
      ))}

      {/* Unresolved */}
      {unresolved.length>0&&(
        <IntelSection title="UNRESOLVED" count={unresolved.length}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {unresolved.map(f=>(
              <FlightCard key={f.id} f={f} crew={crew} actions={<>
                <button onClick={()=>uFlight(f.id,{...f,status:"pending"})} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--info-bg)",background:"var(--info-bg)",color:T.link,cursor:"pointer",fontWeight:700}}>↩ Restore</button>
                <button onClick={()=>uFlight(f.id,null)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--danger-bg)",background:"transparent",color:"var(--danger-fg)",cursor:"pointer"}}>Delete</button>
              </>}/>
            ))}
          </div>
        </IntelSection>
      )}
    </div>
  );
}
