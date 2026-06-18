import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN, describeScanError } from "../../lib/domain-constants";
import { cleanFlightsObj, enrichFlight, findFlightMatch, findItineraryLegs, flightDedupKey, flightToLeg, matchShowByAirport } from "../../lib/flights";
import { gmailUrl } from "../../lib/intel";
import { SPLIT_DAYS } from "../../lib/ros-data";
import { supabase } from "../../lib/supabase";
import { fD } from "../../lib/time";
import { T } from "../../styles/tokens";
import { useAuth } from "../AuthGate";
import { IntelSection } from "../intel/IntelSection";
import { FlightCard } from "./FlightCard";
import { ReservationGroup } from "./ReservationGroup";
import { FOCUS_CARRIERS, groupByReservation, matchPaxToCrew } from "../../lib/flights-view";

export function FlightsSection(){
  const{flights,uFlight,setFlights,uRos,gRos,uFin,finance,crew,setShowCrew,shows,aC,sorted,tourStart,tourEnd,currentSplit,activeSplitParty,activeSplitPartyId,role}=useContext(Ctx);
  const a=useAuth();
  const[scanning,setScanning]=useState(false);
  const[scanMsg,setScanMsg]=useState("");
  const[pendingImport,setPendingImport]=useState([]);
  const[confirmingId,setConfirmingId]=useState(null);
  const flightsRef=useRef(flights);
  useEffect(()=>{flightsRef.current=flights;},[flights]);

  // Split-party filter — on a split day, show only flights for the active party.
  const partyMatch=useMemo(()=>{
    if(!currentSplit||!activeSplitParty)return null;
    const names=(activeSplitParty.crew||[]).map(id=>{
      const c=(crew||[]).find(x=>x.id===id);
      return (c?.name||id).toLowerCase();
    });
    return {names,partyId:activeSplitPartyId};
  },[currentSplit,activeSplitParty,activeSplitPartyId,crew]);
  const matchesParty=s=>{
    if(!partyMatch)return true;
    if((s.excludedParties||[]).includes(partyMatch.partyId))return false;
    if(s.partyId)return s.partyId===partyMatch.partyId;
    const pax=(s.pax||[]).filter(Boolean);
    if(!pax.length)return true;
    const lo=pax.map(n=>String(n).toLowerCase());
    return partyMatch.names.some(n=>lo.some(p=>p.includes(n)||n.includes(p.split(" ")[0])));
  };

  const allFlights=useMemo(()=>Object.values(flights).filter(matchesParty).sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||0),[flights,partyMatch]);// eslint-disable-line
  const confirmedRaw=allFlights.filter(f=>f.status==="confirmed");
  const confirmedByKey=new Map();confirmedRaw.forEach(f=>{const k=flightDedupKey(f);const cur=confirmedByKey.get(k);if(!cur||(f.confirmedAt||"")>(cur.confirmedAt||""))confirmedByKey.set(k,f);});
  const confirmed=[...confirmedByKey.values()].sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||0);
  const keepConfirmedIds=new Set(confirmed.map(f=>f.id));
  const keepConfirmedKey=[...keepConfirmedIds].sort().join(",");
  useEffect(()=>{const dupes=confirmedRaw.filter(f=>!keepConfirmedIds.has(f.id));if(dupes.length)dupes.forEach(f=>uFlight(f.id,null));},[keepConfirmedKey]);// eslint-disable-line
  const confirmedKeys=new Set(confirmed.map(flightDedupKey));
  const pendingRaw=allFlights.filter(f=>f.status==="pending"&&!confirmedKeys.has(flightDedupKey(f))&&!f.supersededBy);
  const pendingByKey=new Map();pendingRaw.forEach(f=>{if(!pendingByKey.has(flightDedupKey(f)))pendingByKey.set(flightDedupKey(f),f);});
  const pending=[...pendingByKey.values()];
  const unresolved=allFlights.filter(f=>f.status==="unresolved");
  const superseded=allFlights.filter(f=>f.status==="cancelled"||f.status==="changed"||f.supersededBy);

  const scanFlights=async(opts={})=>{
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const googleToken=session.provider_token;
      if(!googleToken){setScanMsg("Gmail access not available — re-login with Google.");return;}
      if(opts.reset){setFlights({});setPendingImport([]);}
      setScanning(true);setScanMsg(opts.reset?"Reset. Rescanning Gmail…":"Scanning Gmail for flight confirmations…");
      const showsArr=Object.values(shows||{}).filter(s=>s.clientId===aC).map(s=>({id:s.id||s.date,date:s.date,venue:s.venue,city:s.city,type:s.type}));
      const flightBody=JSON.stringify({googleToken,tourStart,tourEnd,focus:FOCUS_CARRIERS,shows:showsArr,...(opts.force?{force:true}:{}),...(opts.forcePayMethod?{forcePayMethod:true}:{})});
      const flightOpts={method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:flightBody};
      let resp=await fetch("/api/flights",flightOpts);
      for(let retry=0;resp.status===404&&retry<2;retry++){
        setScanMsg(`Warming up — retrying…`);
        await new Promise(r=>setTimeout(r,2500));
        resp=await fetch("/api/flights",flightOpts);
      }
      if(resp.status===402){setScanMsg("Gmail session expired — please re-login.");setScanning(false);return;}
      if(!resp.ok){const body=await resp.text().catch(()=>"");console.error("[flights-scan]",resp.status,body);setScanMsg(`Scan error ${resp.status} — ${describeScanError(body)||"try again."}`);setScanning(false);return;}
      const data=await resp.json();
      if(data.error){setScanMsg(`Error: ${data.error}`);setScanning(false);return;}
      const newFlights=data.flights||[];
      const cur=opts.reset?{}:flightsRef.current;
      const novel=[];const enriched=[];
      const working={...cur};
      newFlights.forEach(f=>{
        const match=findFlightMatch(working,f);
        if(match){
          const merged=enrichFlight(match,f);
          if(JSON.stringify(merged)!==JSON.stringify(match)){working[match.id]=merged;enriched.push(merged);}
        }else{
          const paxMap=new Map();(f.pax||[]).forEach(p=>{const k=String(p).toLowerCase();if(!paxMap.has(k))paxMap.set(k,p);});
          const rec={...f,pax:[...paxMap.values()],status:(f.status==="cancelled"||f.status==="changed")?f.status:"pending",suggestedCrewIds:matchPaxToCrew(f.pax,crew)};
          working[f.id]=rec;novel.push(rec);
        }
      });
      if(!novel.length&&!enriched.length){setScanMsg(`Scanned ${data.threadsFound} threads — no new or updated flights.`);setScanning(false);return;}
      setFlights(working);
      const freshCount=novel.filter(f=>f.fresh48h).length;
      const freshTag=freshCount?` (${freshCount} from last 48h)`:"";
      const matchedCount=novel.filter(f=>f.suggestedShowDate).length;
      const matchTag=matchedCount?` · ${matchedCount} matched to shows`:"";
      const addTag=novel.length?`Added ${novel.length}`:"";
      const enrTag=enriched.length?`${addTag?" · ":""}Enriched ${enriched.length}`:"";
      setScanMsg(`${addTag}${enrTag}${freshTag}${matchTag}${novel.length?" — confirm to sync crew.":""}`);
    }catch(e){
      const msg=e.message||"";
      if(msg.includes("string did not match")||msg.includes("Invalid URL")||msg.includes("not a valid URL"))setScanMsg("Auth session error — re-login with Google to refresh.");
      else setScanMsg(`Scan failed: ${msg}`);
    }
    setScanning(false);
  };

  const importFlight=f=>{
    uFlight(f.id,{...f,status:"pending"});
    setPendingImport(p=>p.filter(x=>x.id!==f.id));
  };
  const importAll=()=>{pendingImport.forEach(f=>uFlight(f.id,{...f,status:"pending"}));setPendingImport([]);};

  const confirmFlight=f=>{
    setConfirmingId(f.id);
    uFlight(f.id,{...f,status:"confirmed",confirmedAt:new Date().toISOString()});

    if(f.cost&&f.cost>0){
      uFin(f.depDate,prev=>{
        const existing=(prev?.flightExpenses||[]).filter(e=>e.flightId!==f.id);
        return{...prev,flightExpenses:[...existing,{flightId:f.id,label:`${f.flightNo||f.carrier} ${f.from}→${f.to}`,amount:f.cost,currency:f.currency||"USD",pax:f.pax||[],carrier:f.carrier}]};
      });
    }

    if(f.pax?.length&&crew?.length){
      const allFlightsObj={...flights,[f.id]:{...f,status:"confirmed"}};
      const legs=findItineraryLegs(f,allFlightsObj);
      const firstLeg=legs[0]||f,lastLeg=legs[legs.length-1]||f;
      const allLegObjs=legs.map(flightToLeg);
      const inShow=matchShowByAirport(lastLeg.to,lastLeg.toCity,lastLeg.arrDate||lastLeg.depDate,sorted||[],"inbound");
      const outShow=matchShowByAirport(firstLeg.from,firstLeg.fromCity,firstLeg.depDate,sorted||[],"outbound");
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
            return{...p,[inKey]:{...p[inKey],[match.id]:{...cur,attending:true,inboundMode:"fly",inboundConfirmed:true,inboundDate:lastLeg.arrDate||lastLeg.depDate,inboundTime:lastLeg.arr||"",inbound:[...existing,...allLegObjs]}}};
          });
        }
        if(outShow){
          const outKey=f.partyId&&SPLIT_DAYS[outShow.date]?`${outShow.date}#${f.partyId}`:outShow.date;
          setShowCrew(p=>{
            const cur=p[outKey]?.[match.id]||{};
            const flightIds=new Set(allLegObjs.map(l=>l.flightId));
            const existing=(cur.outbound||[]).filter(l=>!flightIds.has(l.flightId));
            return{...p,[outKey]:{...p[outKey],[match.id]:{...cur,attending:true,outboundMode:"fly",outboundConfirmed:true,outboundDate:firstLeg.depDate,outboundTime:firstLeg.dep||"",outbound:[...existing,...allLegObjs]}}};
          });
        }
        if(!inShow&&!outShow){
          const arrD=f.arrDate||f.depDate;
          const arrKey=f.partyId&&SPLIT_DAYS[arrD]?`${arrD}#${f.partyId}`:arrD;
          setShowCrew(p=>{
            const cur=p[arrKey]?.[match.id]||{};
            const ex=(cur.inbound||[]).filter(l=>l.flightId!==f.id);
            return{...p,[arrKey]:{...p[arrKey],[match.id]:{...cur,attending:true,inboundMode:"fly",inboundConfirmed:true,inboundDate:arrD,inboundTime:f.arr||"",inbound:[...ex,flightToLeg(f)]}}};
          });
        }
      });
    }
    setTimeout(()=>setConfirmingId(null),1200);
  };

  const dismissFlight=id=>{
    const f=flights[id];if(!f)return;
    // On a split day, dismissing a shared flight only hides it from the
    // active party. Scoped flights (own partyId) dismiss normally.
    if(partyMatch&&!(f.partyId&&f.partyId===partyMatch.partyId)){
      const excl=new Set(f.excludedParties||[]);excl.add(partyMatch.partyId);
      uFlight(id,{...f,excludedParties:[...excl]});
      return;
    }
    uFlight(id,{...f,status:"unresolved"});
  };
  const deleteFlight=id=>uFlight(id,null);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:10,fontWeight:800,color:T.link,letterSpacing:"0.06em"}}>✈ FLIGHTS</span>
        <span style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:"var(--info-bg)",color:T.link,fontWeight:700}}>{confirmed.length} confirmed · {pending.length} pending</span>
        {scanMsg&&<span style={{fontSize:9,color:scanning?"var(--accent)":"var(--text-dim)",fontFamily:MN}}>{scanMsg}</span>}
        {role!=="viewer"&&<div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <button onClick={()=>{const before=Object.keys(flights).length;const cleaned=cleanFlightsObj(flights);const after=Object.keys(cleaned).length;if(confirm(`Clean & deduplicate flights? ${before}→${after} (−${before-after})`)){setFlights(cleaned);setScanMsg(`Cleaned: ${before}→${after} flights.`);}}} disabled={scanning} style={{background:"var(--border)",color:T.textDim,border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 11px",cursor:"pointer",fontWeight:700}}>Clean & Dedup</button>
          <button onClick={()=>{if(confirm(`Clear all ${allFlights.length} flights and rescan Gmail?`))scanFlights({reset:true});}} disabled={scanning} style={{background:scanning?"var(--border)":"var(--danger-fg)",color:scanning?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,fontSize:10,padding:"4px 11px",cursor:scanning?"default":"pointer",fontWeight:700}}>Reset & Rescan</button>
          <button onClick={()=>scanFlights({forcePayMethod:true})} disabled={scanning} title="Re-parse only emails missing payment method / card info" style={{background:scanning?"var(--border)":"var(--warn-bg)",color:scanning?"var(--text-dim)":"var(--warn-fg)",border:`1px solid ${scanning?"var(--border)":"var(--warn-fg)"}`,borderRadius:6,fontSize:10,padding:"4px 11px",cursor:scanning?"default":"pointer",fontWeight:700}}>{scanning?"Scanning…":"↺ Payment"}</button>
          <button onClick={()=>scanFlights({force:true})} disabled={scanning} title="Force re-parse all emails" style={{background:scanning?"var(--border)":"var(--card-3)",color:scanning?"var(--text-dim)":"var(--text-2)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 11px",cursor:scanning?"default":"pointer",fontWeight:700}}>Force Rescan</button>
          <button onClick={()=>scanFlights()} disabled={scanning} style={{background:scanning?"var(--border)":"var(--link)",color:scanning?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,fontSize:10,padding:"4px 11px",cursor:scanning?"default":"pointer",fontWeight:700}}>{scanning?"Scanning…":"Scan Gmail"}</button>
        </div>}
      </div>

      {/* Pending import (just scanned, not yet in state) */}
      {pendingImport.length>0&&(
        <div style={{background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:10,padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:9,fontWeight:800,color:T.link,letterSpacing:"0.06em"}}>NEW — REVIEW BEFORE IMPORTING</span>
            <button onClick={importAll} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--link)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import All ({pendingImport.length})</button>
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
            {groupByReservation(pendingImport).filter(g=>!g.isSolo&&g.segs.length>1).map(g=>(
              <button key={`ia_${g.key}`} onClick={()=>g.segs.forEach(f=>importFlight(f))} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px dashed var(--accent-pill-border)",background:"var(--accent-pill-bg)",color:T.accent,cursor:"pointer",fontWeight:700,alignSelf:"flex-start"}}>Import All {g.segs.length} Segments · {g.routeChain}</button>
            ))}
          </div>
        </div>
      )}

      {/* Pending confirmation */}
      {pending.length>0&&(
        <IntelSection title="PENDING CONFIRMATION" count={pending.length}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {groupByReservation(pending).map(g=>(
              <ReservationGroup key={g.key} g={g} defaultCollapsed={false} renderSegment={(f,ll)=>{
                const isConf=confirmingId===f.id;
                return(
                  <FlightCard f={f} crew={crew} legLabel={ll}
                    onUpdatePax={newPax=>uFlight(f.id,{...f,pax:newPax,suggestedCrewIds:matchPaxToCrew(newPax,crew)})}
                    onUpdate={patch=>uFlight(f.id,{...flights[f.id],...patch,locked:true,editedAt:Date.now()})}
                    actions={<>
                      <button onClick={()=>confirmFlight(flights[f.id]||f)} disabled={isConf} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:isConf?"var(--success-fg)":"var(--link)",color:"#fff",cursor:isConf?"default":"pointer",fontWeight:700}}>{isConf?"✓ Synced!":"Confirm + Sync"}</button>
                      <button onClick={()=>dismissFlight(f.id)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>Dismiss</button>
                      {f.tid&&<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:T.link,textDecoration:"none",marginLeft:"auto"}}>email ↗</a>}
                    </>}/>
                );
              }}/>
            ))}
            {groupByReservation(pending).filter(g=>!g.isSolo&&g.segs.length>1).map(g=>(
              <button key={`ca_${g.key}`} onClick={()=>g.segs.forEach(f=>confirmFlight(f))} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px dashed var(--accent-pill-border)",background:"var(--accent-pill-bg)",color:T.accent,cursor:"pointer",fontWeight:700,alignSelf:"flex-start"}}>Confirm All {g.segs.length} Segments · {g.routeChain}</button>
            ))}
          </div>
        </IntelSection>
      )}

      {/* Confirmed */}
      {confirmed.length>0&&(
        <IntelSection title="CONFIRMED" count={confirmed.length} defaultOpen={true}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {groupByReservation(confirmed).map(g=>(
              <ReservationGroup key={g.key} g={g} defaultCollapsed={true} borderColor="var(--success-bg)" renderSegment={(f,ll)=>{
                const inShow=matchShowByAirport(f.to,f.toCity,f.arrDate||f.depDate,sorted||[],"inbound");
                const outShow=matchShowByAirport(f.from,f.fromCity,f.depDate,sorted||[],"outbound");
                const show=inShow||outShow;
                return(
                  <FlightCard f={f} crew={crew} legLabel={ll} defaultCollapsed={true}
                    actions={<>
                      {show&&<span style={{fontSize:8,padding:"1px 6px",borderRadius:4,background:inShow?"var(--success-bg)":"var(--warn-bg)",color:inShow?"var(--success-fg)":"var(--warn-fg)",fontWeight:700}}>{show.city} {fD(show.date)}</span>}
                      <span style={{fontSize:9,color:T.successFg,fontWeight:700}}>✓</span>
                      <button onClick={()=>dismissFlight(f.id)} title="Move to unresolved" style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:11}}>×</button>
                    </>}/>
                );
              }}/>
            ))}
          </div>
        </IntelSection>
      )}

      {/* Unresolved */}
      {unresolved.length>0&&(
        <IntelSection title="UNRESOLVED" count={unresolved.length}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {unresolved.map(f=>(
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:"var(--danger-bg)",border:"1px solid var(--danger-bg)",borderRadius:6,flexWrap:"wrap"}}>
                <span style={{fontSize:9,color:"var(--danger-fg)",fontWeight:800,fontFamily:MN,flexShrink:0}}>{f.depDate}</span>
                <span style={{fontSize:11,fontWeight:700,color:T.text,fontFamily:MN,flexShrink:0}}>{f.from}→{f.to}</span>
                <span style={{fontSize:10,color:T.text2,flexShrink:0}}>{f.flightNo||f.carrier}</span>
                <span style={{fontSize:9,color:T.textDim,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(f.pax||[]).join(", ")}</span>
                <button onClick={()=>uFlight(f.id,{...f,status:"pending"})} style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:"1px solid var(--info-bg)",background:"var(--info-bg)",color:T.link,cursor:"pointer",fontWeight:700,flexShrink:0}}>↩ Restore</button>
                <button onClick={()=>deleteFlight(f.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:11,flexShrink:0}}>×</button>
              </div>
            ))}
          </div>
        </IntelSection>
      )}

      {/* Changed / Cancelled — superseded by a newer booking email */}
      {superseded.length>0&&(
        <IntelSection title="CHANGED / CANCELLED" count={superseded.length}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {superseded.map(f=>(
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:"var(--warn-bg)",border:"1px solid var(--warn-bg)",borderRadius:6,flexWrap:"wrap",opacity:0.85}}>
                <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,fontWeight:800,background:f.status==="cancelled"?"var(--danger-bg)":"var(--warn-bg)",color:f.status==="cancelled"?"var(--danger-fg)":"var(--warn-fg)",flexShrink:0,border:`1px solid ${f.status==="cancelled"?"var(--danger-fg)":"var(--warn-fg)"}`}}>{f.status==="cancelled"?"CANCELLED":"CHANGED"}</span>
                <span style={{fontSize:9,color:T.textDim,fontWeight:800,fontFamily:MN,flexShrink:0}}>{f.depDate}</span>
                <span style={{fontSize:11,fontWeight:700,color:T.text,fontFamily:MN,flexShrink:0}}>{f.from}→{f.to}</span>
                <span style={{fontSize:10,color:T.text2,flexShrink:0}}>{f.flightNo||f.carrier}</span>
                <span style={{fontSize:9,color:T.textDim,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(f.paxNormalized||[]).map(p=>p.displayName).join(", ")||(f.pax||[]).join(", ")}</span>
                {f.supersededBy&&<span title={`Superseded by thread ${f.supersededBy}`} style={{fontSize:8,color:T.textMute,flexShrink:0,fontFamily:MN}}>↳ newer booking</span>}
                <button onClick={()=>uFlight(f.id,{...f,status:"pending",supersededBy:undefined})} title="Move back to pending" style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:"1px solid var(--info-bg)",background:"var(--info-bg)",color:T.link,cursor:"pointer",fontWeight:700,flexShrink:0}}>↩</button>
                <button onClick={()=>deleteFlight(f.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:11,flexShrink:0}}>×</button>
              </div>
            ))}
          </div>
        </IntelSection>
      )}

      {allFlights.length===0&&pendingImport.length===0&&(
        <div style={{fontSize:10,color:T.textMute,fontStyle:"italic",padding:"4px 0"}}>{role!=="viewer"?`No flights yet. Click "Scan Gmail" to import from confirmation emails.`:"No flights yet."}</div>
      )}
    </div>
  );
}
