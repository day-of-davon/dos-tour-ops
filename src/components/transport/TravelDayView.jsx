import React, { useContext, useEffect, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { parseDriveSessions } from "../../lib/ros-data";
import { SEG_META, buildDayTimeline, segMeta, segType } from "../../lib/segments";
import { fD, fFull, hhmmToMin } from "../../lib/time";
import { BUS_DATA_MAP } from "../../lib/tour-data";
import { T } from "../../styles/tokens";
import { SegmentDrawer } from "../flights/SegmentDrawer";
import { BusDriveSessionTable } from "./BusDriveSessionTable";
import { DriveSessionEditor } from "./DriveSessionEditor";

export function TravelDayView(){
  const{flights,uFlight,sel,setSel,shows,sorted,tourDaysSorted,crew,setShowCrew,showCrew,mobile,pushUndo,currentSplit,activeSplitParty,activeSplitPartyId,lodging}=useContext(Ctx);
  const[activeId,setActiveId]=useState(null);
  const[addType,setAddType]=useState(null);
  const[travelNotes,setTravelNotes]=useState("");
  const curShow=shows?.[sel];
  const curDay=(tourDaysSorted||[]).find(d=>d.date===sel);
  const title=currentSplit?(activeSplitParty?.label||"Split Day"):curShow?.venue||curShow?.city||(curDay?.type==="travel"?"Travel Day":curDay?.type==="off"?"Off Day":"—");
  const subTitle=curShow?curShow.city:(curDay?.city||"");

  // Build a pax-name matcher for the active split party (if any). Segments are
  // filtered to ones whose pax overlaps the active party's crew. Segments tagged
  // with partyId override the pax check. Untagged, no-pax segments show on all
  // parties (shared ground transport, etc.).
  const partyMatch=useMemo(()=>{
    if(!currentSplit||!activeSplitParty)return null;
    const names=(activeSplitParty.crew||[]).map(id=>{
      const c=(crew||[]).find(x=>x.id===id);
      return (c?.name||id).toLowerCase();
    });
    return {names,partyId:activeSplitPartyId};
  },[currentSplit,activeSplitParty,activeSplitPartyId,crew]);

  // Auto-scope legacy segments: on a split day, tag each untagged segment with
  // the unique party whose crew overlaps its pax. Ambiguous/zero-match segments
  // stay shared.
  useEffect(()=>{
    if(!currentSplit)return;
    const partyNames=currentSplit.parties.map(p=>({id:p.id,names:(p.crew||[]).map(id=>{
      const c=(crew||[]).find(x=>x.id===id);return (c?.name||id).toLowerCase();
    })}));
    Object.values(flights||{}).forEach(s=>{
      if(!s||s.status==="dismissed")return;
      if(s.partyId)return;
      if(s.depDate!==sel&&s.arrDate!==sel)return;
      const pax=(s.pax||[]).filter(Boolean).map(n=>String(n).toLowerCase());
      if(!pax.length)return;
      const hits=partyNames.filter(p=>p.names.some(n=>pax.some(x=>x.includes(n)||n.includes(x.split(" ")[0]))));
      if(hits.length===1)uFlight(s.id,{...s,partyId:hits[0].id});
    });
  },[sel,currentSplit,flights,crew]);// eslint-disable-line react-hooks/exhaustive-deps

  // Flight IDs directly assigned to crew members of the active split party via the
  // Crew tab. These bypass pax-name matching so segments show even when pax is unset
  // or uses a different name format.
  const crewLinkedFlightIds=useMemo(()=>{
    if(!currentSplit||!activeSplitPartyId)return new Set();
    const sc=showCrew[`${sel}#${activeSplitPartyId}`]||{};
    const ids=new Set();
    Object.values(sc).forEach(cd=>{
      if(!cd?.attending)return;
      ["inbound","outbound"].forEach(dir=>{(cd[dir]||[]).forEach(leg=>{if(leg.flightId)ids.add(leg.flightId);});});
    });
    return ids;
  },[sel,activeSplitPartyId,showCrew,currentSplit]);

  // All non-dismissed segments touching sel (depDate === sel OR arrDate === sel).
  const daySegs=useMemo(()=>{
    const segMatches=s=>{
      if(!partyMatch)return true;
      if((s.excludedParties||[]).includes(partyMatch.partyId))return false;
      if(crewLinkedFlightIds.has(s.id))return true;
      if(s.partyId)return s.partyId===partyMatch.partyId;
      const pax=(s.pax||[]).filter(Boolean);
      if(!pax.length)return true;
      const lo=pax.map(n=>String(n).toLowerCase());
      return partyMatch.names.some(n=>lo.some(p=>p.includes(n)||n.includes(p.split(" ")[0])));
    };
    return Object.values(flights||{})
      .filter(s=>s&&s.status!=="dismissed")
      .filter(s=>s.depDate===sel||s.arrDate===sel)
      .filter(segMatches)
      .map(s=>{
        const isDep=s.depDate===sel;
        const isArrOnly=s.arrDate===sel&&s.arrDate!==s.depDate;
        const sortMin=(isArrOnly?hhmmToMin(s.arr):hhmmToMin(s.dep))??0;
        return{...s,_role:isArrOnly?"arr":"dep",_sort:sortMin};
      })
      .sort((a,b)=>a._sort-b._sort);
  },[flights,sel,partyMatch,crewLinkedFlightIds]);

  const active=daySegs.find(s=>s.id===activeId)||null;

  // Timeline: chronological strip of all same-day events + hotel check-ins/outs.
  const timeline=useMemo(()=>buildDayTimeline(sel,daySegs,lodging),[sel,daySegs,lodging]);
  // Air-arrivals on this date whose next timeline entry is flagged `unbridged` — candidates for a ground-suggestion ghost row.
  const unbridgedAirIds=useMemo(()=>{
    const ids=new Set();
    for(let i=1;i<timeline.length;i++){
      const prev=timeline[i-1],cur=timeline[i];
      if(cur.warning==="unbridged"&&prev.kind==="air"&&prev.isArr&&prev.seg?.id)ids.add(prev.seg.id);
    }
    return ids;
  },[timeline]);
  // Hotel destination on this date (pulled from lodging store) for ground-suggestion defaults.
  const destHotel=useMemo(()=>{
    const today=Object.values(lodging||{}).find(h=>h&&h.checkIn===sel);
    return today||null;
  },[lodging,sel]);

  // Add a new segment (local-only until first save; uses timestamp-based id).
  const handleAdd=(type)=>{
    const id=`${type==="air"?"fl":"seg"}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
    const base={id,type,status:"confirmed",depDate:sel,arrDate:sel,dep:"",arr:"",from:"",to:"",fromCity:"",toCity:"",pax:[]};
    const withParty=currentSplit&&activeSplitPartyId?{...base,partyId:activeSplitPartyId}:base;
    const seed=type==="ground"?{...withParty,mode:"uber"}:type==="hotel"?{...withParty,hotelName:"",arr:"15:00",dep:"11:00"}:withParty;
    uFlight(id,seed);
    setActiveId(id);setAddType(null);
  };

  const pax=(seg)=>(seg?.pax||[]).filter(Boolean);
  const paxMatch=name=>(crew||[]).find(c=>c.name&&c.name.toLowerCase().includes(String(name).split(" ")[0].toLowerCase()));

  const{busEdits,uBusEdit}=useContext(Ctx);
  const busDay=useMemo(()=>{const base=BUS_DATA_MAP[sel];if(!base)return null;return{...base,...(busEdits?.[sel]||{})};},// eslint-disable-next-line react-hooks/exhaustive-deps
  [sel,busEdits]);
  const[busDetailExp,setBusDetailExp]=useState(false);
  const[busSessionEdit,setBusSessionEdit]=useState(false);
  const dayLabel=curDay?.type==="travel"?"Travel Day":curDay?.type==="split"?"Split Day":curDay?.type==="off"?"Off Day":"Show Day";

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12,minHeight:0}}>
      {/* Header */}
      <div style={{background:"linear-gradient(90deg,var(--accent) 0%,var(--accent) 100%)",borderRadius:10,padding:"14px 18px",color:"#fff",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:20,fontWeight:800,letterSpacing:"-0.02em"}}>{title}</div>
          <div style={{fontSize:11,color:"var(--accent-pill-bg)",marginTop:2}}>{subTitle}</div>
          <div style={{fontSize:9,fontFamily:MN,color:"var(--accent-pill-border)",marginTop:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Travel Notes</div>
          <textarea value={travelNotes} onChange={e=>setTravelNotes(e.target.value)} placeholder="Notes for today's travel (scratchpad, not persisted yet)" rows={2} style={{marginTop:4,width:"100%",minWidth:220,maxWidth:560,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:6,padding:"6px 9px",color:"#fff",fontSize:10,fontFamily:"'Outfit',system-ui",resize:"vertical",outline:"none"}}/>
        </div>
        <div style={{textAlign:"right",fontSize:11,color:"var(--accent-pill-bg)",flexShrink:0}}>
          <div style={{fontWeight:700,fontSize:11,color:"#fff"}}>{fFull(sel)}</div>
          <div style={{fontSize:10,marginTop:2,letterSpacing:"0.04em",textTransform:"uppercase",color:"var(--accent-pill-border)"}}>{dayLabel}</div>
          {(()=>{const stepDays=(tourDaysSorted||[]);const ci=stepDays.findIndex(d=>d.date===sel);const prev=stepDays[ci-1];const next=stepDays[ci+1];const btn=(enabled,label,date)=><button disabled={!enabled} onClick={()=>enabled&&setSel(date)} style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",color:enabled?"#fff":"rgba(255,255,255,0.3)",fontSize:13,padding:"3px 10px",borderRadius:6,cursor:enabled?"pointer":"default",fontWeight:700,lineHeight:1}}>{label}</button>;return<div style={{marginTop:8,display:"flex",gap:6,justifyContent:"flex-end"}}>{btn(!!prev,"‹",prev?.date)}{btn(!!next,"›",next?.date)}</div>;})()}
        </div>
      </div>

      {/* EU Bus Schedule context for selected date */}
      {busDay&&(
        <div onClick={e=>{if(e.target.closest("button,textarea,input,a"))return;if(!(busDay.stops||busDay.note||busDay.sessions))return;setBusDetailExp(v=>!v);setBusSessionEdit(false);}} style={{background:busDay.show?"var(--success-bg)":"var(--info-bg)",border:`1px solid ${busDay.show?"var(--success-fg)":"var(--info-fg)"}30`,borderRadius:10,padding:"10px 14px",display:"flex",gap:14,alignItems:"flex-start",flexWrap:"wrap",cursor:(busDay.stops||busDay.note||busDay.sessions)?"pointer":"default"}}>
          <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
            <div style={{fontSize:8,fontWeight:800,color:busDay.show?"var(--success-fg)":"var(--info-fg)",letterSpacing:"0.08em",textTransform:"uppercase"}}>{busDay.show?"Show Day":"Travel Day"} · EU Day {busDay.day}</div>
            <div style={{fontSize:13,fontWeight:800,color:busDay.show?"var(--success-fg)":"var(--info-fg)"}}>{busDay.show?(busDay.venue||busDay.route):busDay.route}</div>
            <div style={{fontSize:9,color:busDay.show?"var(--success-fg)":"var(--info-fg)",fontFamily:MN}}>{busDay.date} · {busDay.dow}</div>
          </div>
          {!busDay.show&&(
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
              {busDay.dep!=="—"&&<div style={{background:"var(--card)",border:"1px solid var(--info-fg)20",borderRadius:6,padding:"5px 10px",textAlign:"center"}}>
                <div style={{fontSize:8,color:T.textDim,fontWeight:700,letterSpacing:"0.06em"}}>DEP</div>
                <div style={{fontFamily:MN,fontSize:13,fontWeight:800,color:"var(--info-fg)"}}>{busDay.dep}</div>
              </div>}
              {busDay.arr!=="—"&&<div style={{background:"var(--card)",border:"1px solid var(--info-fg)20",borderRadius:6,padding:"5px 10px",textAlign:"center"}}>
                <div style={{fontSize:8,color:T.textDim,fontWeight:700,letterSpacing:"0.06em"}}>ARR</div>
                <div style={{fontFamily:MN,fontSize:13,fontWeight:800,color:"var(--info-fg)"}}>{busDay.arr}</div>
              </div>}
              {busDay.km>0&&<div style={{textAlign:"center"}}>
                <div style={{fontSize:8,color:T.textDim,fontWeight:700,letterSpacing:"0.06em"}}>KM</div>
                <div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:"var(--info-fg)"}}>{busDay.km}</div>
              </div>}
              {busDay.drive!=="—"&&<div style={{textAlign:"center"}}>
                <div style={{fontSize:8,color:T.textDim,fontWeight:700,letterSpacing:"0.06em"}}>DRIVE</div>
                <div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:busDay.flag==="⚠"?"var(--danger-fg)":"var(--info-fg)"}}>{busDay.drive}{busDay.flag&&<span style={{marginLeft:4}}>{busDay.flag}</span>}</div>
              </div>}
            </div>
          )}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,alignSelf:"flex-end",flexShrink:0}}>
            {(busDay.stops||busDay.note||busDay.sessions)&&<button onClick={()=>{setBusDetailExp(v=>!v);setBusSessionEdit(false);}} style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:`1px solid ${busDay.show?"var(--success-fg)":"var(--info-fg)"}50`,background:busDetailExp&&!busSessionEdit?"rgba(255,255,255,0.1)":"transparent",color:busDay.show?"var(--success-fg)":"var(--info-fg)",cursor:"pointer",fontWeight:700}}>{busDetailExp&&!busSessionEdit?"▴ Hide":"▾ Drive details"}</button>}
            <button onClick={()=>{setBusDetailExp(true);setBusSessionEdit(v=>!v);}} title="Edit drive sessions" style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:`1px solid ${busSessionEdit?"var(--warn-fg)":"var(--border)"}`,background:busSessionEdit?"var(--warn-bg)":"transparent",color:busSessionEdit?"var(--warn-fg)":T.textDim,cursor:"pointer",fontWeight:700,fontFamily:MN}}>✎{busEdits[sel]?.sessions?" *":""}</button>
            <span style={{fontSize:8,color:T.textMute,fontFamily:MN}}>Pieter Smit T26-021201</span>
          </div>
          {busDetailExp&&!busSessionEdit&&(busDay.stops||busDay.note||busDay.sessions)&&(
            <div style={{flexBasis:"100%",marginTop:8,borderTop:`1px solid ${busDay.show?"var(--success-fg)":"var(--info-fg)"}20`}}>
              <BusDriveSessionTable entry={busDay} label={busDay.show?"SHOW DAY · LOCAL DRIVE":"DRIVE SESSION TABLE"} compact/>
            </div>
          )}
          {busSessionEdit&&(
            <div style={{flexBasis:"100%",marginTop:8,paddingTop:4,borderTop:"1px solid var(--warn-fg)30"}}>
              <DriveSessionEditor
                initialSessions={(busDay.sessions?.length>0?busDay.sessions:null)||parseDriveSessions(busDay.note,busDay.stops)}
                hasOverride={!!(busEdits[sel]?.sessions)}
                onSave={rows=>{uBusEdit(sel,{sessions:rows});setBusSessionEdit(false);setBusDetailExp(true);}}
                onCancel={()=>setBusSessionEdit(false)}
                onReset={()=>{uBusEdit(sel,{sessions:null});setBusSessionEdit(false);setBusDetailExp(false);}}
              />
            </div>
          )}
        </div>
      )}

      {/* Add bar */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.06em"}}>ADD SEGMENT</span>
        {[["air","✈ Flight"],["ground","🚗 Ground"],["bus","🚌 Bus"],["rail","🚆 Rail"],["hotel","🏨 Hotel"]].map(([k,l])=>(
          <button key={k} onClick={()=>handleAdd(k)} style={{fontSize:10,padding:"4px 11px",borderRadius:6,border:`1px solid ${SEG_META[k].border}`,background:SEG_META[k].bg,color:SEG_META[k].color,cursor:"pointer",fontWeight:700}}>{l}</button>
        ))}
        <span style={{marginLeft:"auto",fontSize:9,color:T.textMute,fontFamily:MN}}>{daySegs.length} segment{daySegs.length===1?"":"s"} on {fD(sel)}</span>
      </div>

      {/* Day list + drawer */}
      <div style={{display:"flex",gap:12,flexWrap:mobile?"wrap":"nowrap",minHeight:0}}>
        {/* Left: day list */}
        <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:10}}>
          {(()=>{
            const flightSegs=daySegs.filter(s=>segType(s)==="air");
            const otherSegs=daySegs.filter(s=>segType(s)!=="air");
            const inbound=flightSegs.filter(s=>s.arrDate===sel);
            const outbound=flightSegs.filter(s=>s.depDate===sel);
            const groupByCrew=(flights,timeKey)=>{
              const groups=new Map();
              flights.forEach(f=>{
                const list=(f.pax||[]).filter(Boolean);
                const keys=list.length?list.map(p=>String(p).trim()):["__unassigned__"];
                keys.forEach(k=>{
                  if(!groups.has(k))groups.set(k,{name:k==="__unassigned__"?"Unassigned":k,flights:[],earliest:Infinity});
                  const g=groups.get(k);g.flights.push(f);
                  const t=hhmmToMin(f[timeKey])??Infinity;
                  if(t<g.earliest)g.earliest=t;
                });
              });
              groups.forEach(g=>{g.flights.sort((a,b)=>(hhmmToMin(a[timeKey])??0)-(hhmmToMin(b[timeKey])??0));});
              return [...groups.values()].sort((a,b)=>a.earliest-b.earliest);
            };
            const inboundByCrew=groupByCrew(inbound,"arr");
            const outboundByCrew=groupByCrew(outbound,"dep");

            const renderSeg=s=>{
              const m=segMeta(s);const isActive=s.id===activeId;
              const timeLabel=s._role==="arr"?`Arr ${s.arr||"—"}`:`${s.dep||"—"}${s.arr?` – ${s.arr}`:""}`;
              const routeLabel=segType(s)==="hotel"?(s.hotelName||s.to||"Hotel"):`${s.from||"—"}${s.to?` → ${s.to}`:""}`;
              const needsGround=unbridgedAirIds.has(s.id);
              const addGroundBridge=()=>{
                const id=`seg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
                const arrMin=hhmmToMin(s.arr)??0;
                const depMin=arrMin+20;
                const pad=n=>String(n).padStart(2,"0");
                const dep=`${pad(Math.floor(depMin/60)%24)}:${pad(depMin%60)}`;
                const toLabel=destHotel?(destHotel.hotelName||destHotel.city||""):"";
                const seed={id,type:"ground",status:"confirmed",mode:"uber",depDate:sel,arrDate:sel,dep,arr:"",from:s.to||"",fromCity:s.toCity||"",to:toLabel,toCity:destHotel?.city||s.toCity||"",pax:[...(s.pax||[])],...(currentSplit&&activeSplitPartyId?{partyId:activeSplitPartyId}:{})};
                uFlight(id,seed);setActiveId(id);
              };
              const detail=segType(s)==="air"?`${s.flightNo||""} ${s.carrier||""}`.trim():segType(s)==="ground"?`${s.mode||"drive"}${s.provider?` · ${s.provider}`:""}`:segType(s)==="hotel"?(s.hotelName||""):(s.carrier||s.mode||"");
              const paxList=pax(s);
              return(
                <React.Fragment key={s.id}>
                <div onClick={()=>setActiveId(s.id)} className="rh" style={{display:"grid",gridTemplateColumns:"20px auto 1fr auto",gap:10,padding:"9px 12px",background:"var(--card)",border:`1px solid ${isActive?m.border:"var(--border)"}`,borderLeft:`3px solid ${m.color}`,borderRadius:10,cursor:"pointer",boxShadow:isActive?"0 0 0 2px var(--accent-pill-bg)":undefined}}>
                  <div style={{fontSize:13,lineHeight:1,paddingTop:2}}>{m.icon}</div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2,flexShrink:0,minWidth:90}}>
                    {paxList.length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                      {paxList.slice(0,3).map((n,i)=>{const mch=paxMatch(n);return(
                        <span key={i} style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:mch?"var(--success-bg)":"var(--card-2)",color:mch?"var(--success-fg)":"var(--text-2)",fontWeight:700,letterSpacing:"0.02em"}}>{String(n).split(" ")[0].toUpperCase()}</span>
                      );})}
                      {paxList.length>3&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--card-2)",color:T.textDim,fontWeight:700}}>+{paxList.length-3}</span>}
                    </div>}
                    <div style={{fontFamily:MN,fontSize:10,fontWeight:700,color:m.color}}>{timeLabel}</div>
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{routeLabel}</div>
                    {detail&&<div style={{fontSize:9,color:T.textDim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{detail}</div>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                    {s._role==="arr"&&<span style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--success-bg)",color:T.successFg,fontWeight:800,letterSpacing:"0.06em"}}>ARR</span>}
                    {s.fresh48h&&s.status!=="confirmed"&&<span style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--accent-pill-bg)",color:T.accent,fontWeight:800,letterSpacing:"0.06em"}}>NEW</span>}
                    {partyMatch&&s.partyId!==partyMatch.partyId&&<button onClick={e=>{e.stopPropagation();
                      const excl=(s.excludedParties||[]).filter(p=>p!==partyMatch.partyId);
                      uFlight(s.id,{...s,partyId:partyMatch.partyId,excludedParties:excl});
                    }} title={`Scope to ${activeSplitParty?.label||"this event"}`} style={{fontSize:8,padding:"2px 6px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-3)",color:T.textDim,cursor:"pointer",fontWeight:700,letterSpacing:"0.04em"}}>↳ {(activeSplitParty?.label||"SCOPE").toUpperCase()}</button>}
                    <button onClick={e=>{e.stopPropagation();if(confirm(`Delete this ${m.label.toLowerCase()}?`)){const prev={...s};let next;
                      if(partyMatch&&!(s.partyId&&s.partyId===partyMatch.partyId)){
                        const excl=new Set(s.excludedParties||[]);excl.add(partyMatch.partyId);
                        next={...s,excludedParties:[...excl]};
                      }else{next={...s,status:"dismissed"};}
                      uFlight(s.id,next);pushUndo(`${m.label} deleted.`,()=>uFlight(s.id,prev));if(activeId===s.id)setActiveId(null);}}} title="Delete segment" style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13,lineHeight:1,padding:"0 4px"}}>×</button>
                  </div>
                </div>
                {needsGround&&(
                  <button onClick={addGroundBridge} title="Add ground bridge from airport to hotel" style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",background:"transparent",border:"1px dashed var(--warn-fg)",borderLeft:"3px solid var(--warn-fg)",borderRadius:10,color:T.warnFg,cursor:"pointer",textAlign:"left",fontSize:10,fontWeight:700,letterSpacing:"0.02em"}}>
                    <span style={{fontSize:13}}>＋</span>
                    <span>Add ground: {s.to||s.toCity||"airport"} → {destHotel?.hotelName||destHotel?.city||"hotel"} · ~20m buffer · Uber</span>
                  </button>
                )}
                </React.Fragment>
              );
            };

            const renderCrewGroup=(g,kind)=>(
              <div key={`${kind}-${g.name}`} style={{background:"var(--card-2)",border:"1px solid var(--border)",borderRadius:10,padding:"8px 10px",display:"flex",flexDirection:"column",gap:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,fontWeight:800,color:T.text,letterSpacing:"-0.01em"}}>{g.name}</span>
                  {(()=>{const c=paxMatch(g.name);return c?.role&&<span style={{fontSize:9,color:T.textDim}}>· {c.role}</span>;})()}
                  <span style={{marginLeft:"auto",fontFamily:MN,fontSize:9,color:T.textMute,fontWeight:700}}>{g.flights.length} {g.flights.length===1?"flight":"flights"}</span>
                </div>
                {g.flights.map(renderSeg)}
              </div>
            );

            const empty=daySegs.length===0;
            return(<>
              {empty&&(
                <div style={{padding:"28px 0",textAlign:"center",background:"var(--card)",border:"1px dashed var(--border)",borderRadius:10}}>
                  <div style={{fontSize:20,marginBottom:6,opacity:0.25}}>◌</div>
                  <div style={{fontSize:11,fontWeight:600,color:T.text,marginBottom:3}}>No travel on this day</div>
                  <div style={{fontSize:10,color:T.textMute}}>Use the buttons above to add a flight, ground transfer, or hotel check-in.</div>
                </div>
              )}
              {inboundByCrew.length>0&&(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <div style={{fontSize:9,fontWeight:800,color:T.successFg,letterSpacing:"0.1em",display:"flex",alignItems:"center",gap:8}}>
                    <span>↓ INBOUND FLIGHTS</span>
                    <div style={{flex:1,height:1,background:"var(--border)"}}/>
                    <span style={{fontFamily:MN,fontSize:8,color:T.textMute,fontWeight:700}}>{inbound.length} flight{inbound.length===1?"":"s"} · {inboundByCrew.length} crew</span>
                  </div>
                  {inboundByCrew.map(g=>renderCrewGroup(g,"in"))}
                </div>
              )}
              {outboundByCrew.length>0&&(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <div style={{fontSize:9,fontWeight:800,color:T.link,letterSpacing:"0.1em",display:"flex",alignItems:"center",gap:8}}>
                    <span>↑ OUTBOUND FLIGHTS</span>
                    <div style={{flex:1,height:1,background:"var(--border)"}}/>
                    <span style={{fontFamily:MN,fontSize:8,color:T.textMute,fontWeight:700}}>{outbound.length} flight{outbound.length===1?"":"s"} · {outboundByCrew.length} crew</span>
                  </div>
                  {outboundByCrew.map(g=>renderCrewGroup(g,"out"))}
                </div>
              )}
              {otherSegs.length>0&&(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",display:"flex",alignItems:"center",gap:8}}>
                    <span>GROUND, BUS, RAIL & HOTELS</span>
                    <div style={{flex:1,height:1,background:"var(--border)"}}/>
                  </div>
                  {otherSegs.map(renderSeg)}
                </div>
              )}
            </>);
          })()}
        </div>
        {/* Right: editor drawer */}
        {active&&<SegmentDrawer key={active.id} seg={active} crew={crew||[]} sorted={sorted||[]} onChange={patch=>uFlight(active.id,{...active,...patch})} onClose={()=>setActiveId(null)}/>}
      </div>
    </div>
  );
}
