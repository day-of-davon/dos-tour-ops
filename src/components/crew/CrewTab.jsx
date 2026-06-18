import React, { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN, UI } from "../../lib/domain-constants";
import { findItineraryLegs, flightItinKey, flightToLeg, matchShowByAirport } from "../../lib/flights";
import { crewLifecycleSlots, crewLifecycleState } from "../../lib/lifecycle";
import { fD, fFull } from "../../lib/time";
import { T } from "../../styles/tokens";
import { CrewAllShows } from "./CrewAllShows";
import { LifecyclePills } from "./LifecyclePills";

export function CrewTab(){
  const{sel,setSel,shows,tourDaysSorted,tourDays,crew,setCrew,showCrew,setShowCrew,mobile,pushUndo,flights,lodging,setTab,currentSplit,activeSplitPartyId,activeSplitParty,eventKey,allShows,sorted}=useContext(Ctx);
  if(allShows)return<CrewAllShows/>;
  const[panel,setPanel]=useState(null);
  const[editMode,setEditMode]=useState(false);
  const[flightPicker,setFlightPicker]=useState(null); // {crewId, dir}
  const[addPickerOpen,setAddPickerOpen]=useState(false);
  const[addPickerSel,setAddPickerSel]=useState([]);
  const show=shows[sel];
  const today=new Date().toISOString().slice(0,10);
  // eventKey already includes split-party scope on split days.
  const scKey=eventKey;
  const realDate=k=>String(k).split("#")[0];
  const sc=showCrew[scKey]||{};
  const uid=()=>Math.random().toString(36).slice(2,9);

  // Nearest prior date with any crew data (strip split suffix when comparing)
  const prevDate=useMemo(()=>{
    const candidates=Object.keys(showCrew).filter(k=>realDate(k)<sel&&Object.keys(showCrew[k]||{}).length>0).sort();
    return candidates[candidates.length-1]||null;
  },[sel,showCrew]);
  const prevCrew=prevDate?showCrew[prevDate]:null;
  const isInheriting=!showCrew[scKey]&&!!prevCrew;

  const copyFromPrev=()=>{
    if(!prevCrew)return;
    setShowCrew(p=>({...p,[scKey]:{...prevCrew}}));
  };

  const getCD=(crewId)=>{
    const d=sc[crewId]||(isInheriting?prevCrew?.[crewId]:null)||{};
    const legacy=d.travelMode||"bus";
    return{attending:false,inboundMode:legacy,outboundMode:legacy,inboundConfirmed:false,outboundConfirmed:false,inbound:[],outbound:[],inboundDate:"",inboundTime:"",inboundNotes:"",outboundDate:"",outboundTime:"",outboundNotes:"",parkingReq:"none",...d,travelMode:undefined};
  };
  const updateSC=(crewId,patch)=>setShowCrew(p=>({...p,[scKey]:{...p[scKey],[crewId]:{...getCD(crewId),...patch}}}));
  const toggleAttending=(crewId)=>{const cd=getCD(crewId);updateSC(crewId,{attending:!cd.attending});};
  const setInboundMode=(crewId,mode)=>updateSC(crewId,{inboundMode:mode});
  const setOutboundMode=(crewId,mode)=>updateSC(crewId,{outboundMode:mode});
  const cycleParkingReq=(crewId)=>{const cur=getCD(crewId).parkingReq||"none";const next={none:"requested",requested:"confirmed",confirmed:"none"};updateSC(crewId,{parkingReq:next[cur]||"none"});};
  const addLeg=(crewId,dir)=>{const cd=getCD(crewId);const leg={id:uid(),flight:"",from:"",to:"",depart:"",arrive:"",conf:"",status:"pending"};updateSC(crewId,{[dir]:[...(cd[dir]||[]),leg]});setPanel({crewId});};
  const updateLeg=(crewId,dir,legId,field,val)=>{const cd=getCD(crewId);updateSC(crewId,{[dir]:(cd[dir]||[]).map(l=>l.id===legId?{...l,[field]:val}:l)});};
  const removeLeg=(crewId,dir,legId)=>{const cd=getCD(crewId);updateSC(crewId,{[dir]:(cd[dir]||[]).filter(l=>l.id!==legId)});};
  const addMember=()=>setCrew(p=>[...p,{id:uid(),name:"",role:"",email:""}]);
  const updateMember=(id,field,val)=>setCrew(p=>p.map(c=>c.id===id?{...c,[field]:val}:c));
  const removeMember=(id)=>{const prev=crew;setCrew(p=>p.filter(c=>c.id!==id));pushUndo("Crew member removed.",()=>setCrew(prev));};

  const confirmedFlights=useMemo(()=>Object.values(flights||{}).filter(f=>f&&f.status==="confirmed"),[flights]);
  // Suggest flights for the current date. Two match modes:
  //   1. Show match — endpoint resolves to a show on `sel` via the IATA→city
  //      table + temporal window (preferred when `sel` is a show date).
  //   2. Travel-day match — flight's depDate/arrDate equals `sel`. Catches
  //      multi-leg legs that don't terminate at the show city (e.g. the
  //      LAX→JFK leg of LAX→JFK→DUB on its 5/2 departure day, when 5/2
  //      isn't a show and so has no airport-resolved match).
  // Either way, results dedupe by itinerary key so a multi-leg booking shows
  // up as a single row that expands to the full chain on render and on assign.
  const flightsForDir=(dir)=>{
    const matched=confirmedFlights.filter(f=>{
      if(dir==="inbound"){
        if(matchShowByAirport(f.to,f.toCity,f.arrDate||f.depDate,sorted||[],"inbound")?.date===sel)return true;
        return(f.arrDate||f.depDate)===sel;
      }
      if(matchShowByAirport(f.from,f.fromCity,f.depDate,sorted||[],"outbound")?.date===sel)return true;
      return f.depDate===sel;
    });
    const byItin=new Map();
    matched.forEach(f=>{const k=flightItinKey(f);if(!byItin.has(k))byItin.set(k,f);});
    const rep=[...byItin.values()];
    return rep.sort((a,b)=>{
      const aLegs=findItineraryLegs(a,flights),bLegs=findItineraryLegs(b,flights);
      const aD=dir==="inbound"?(aLegs[aLegs.length-1]?.arrDate||a.arrDate||a.depDate||""):(aLegs[0]?.depDate||a.depDate||"");
      const bD=dir==="inbound"?(bLegs[bLegs.length-1]?.arrDate||b.arrDate||b.depDate||""):(bLegs[0]?.depDate||b.depDate||"");
      const aT=dir==="inbound"?(aLegs[aLegs.length-1]?.arr||a.arr||""):(aLegs[0]?.dep||a.dep||"");
      const bT=dir==="inbound"?(bLegs[bLegs.length-1]?.arr||b.arr||""):(bLegs[0]?.dep||b.dep||"");
      return aD.localeCompare(bD)||aT.localeCompare(bT);
    });
  };
  const assignFlight=(crewId,dir,f)=>{
    const allLegs=findItineraryLegs(f,flights);
    const legs=allLegs.length?allLegs:[f];
    const firstLeg=legs[0],lastLeg=legs[legs.length-1];
    const allLegObjs=legs.map(flightToLeg);
    const flightIds=new Set(allLegObjs.map(l=>l.flightId));
    const confKey=dir==="inbound"?"inboundConfirmed":"outboundConfirmed";
    const dateKey=dir==="inbound"?"inboundDate":"outboundDate";
    const timeKey=dir==="inbound"?"inboundTime":"outboundTime";
    const timeVal=dir==="inbound"?(lastLeg.arr||""):(firstLeg.dep||"");
    const dateVal=dir==="inbound"?(lastLeg.arrDate||lastLeg.depDate||sel):(firstLeg.depDate||sel);
    setShowCrew(p=>{
      const cur=p[scKey]?.[crewId]||{};
      const ex=(cur[dir]||[]).filter(l=>!flightIds.has(l.flightId));
      return{...p,[scKey]:{...p[scKey],[crewId]:{...cur,attending:true,inboundMode:dir==="inbound"?cur.inboundMode||"fly":cur.inboundMode,outboundMode:dir==="outbound"?cur.outboundMode||"fly":cur.outboundMode,[dir]:[...ex,...allLegObjs],[confKey]:true,[dateKey]:dateVal,[timeKey]:timeVal}}};
    });
    setFlightPicker(null);
  };
  const unassignFlight=(crewId,dir,flightId)=>{
    setShowCrew(p=>{
      const cur=p[scKey]?.[crewId]||{};
      return{...p,[scKey]:{...p[scKey],[crewId]:{...cur,[dir]:(cur[dir]||[]).filter(l=>l.flightId!==flightId)}}};
    });
  };

  const rosterCrew=activeSplitParty?crew.filter(c=>activeSplitParty.crew.includes(c.id)):crew;
  const attending=rosterCrew.filter(c=>getCD(c.id).attending);
  // Per-crew attending dates across the whole tour, sorted. Used to classify
  // bus-mid vs bus-join vs bus-leave for the lifecycle pills.
  const attendingDatesByCrew=useMemo(()=>{
    const m={};
    Object.entries(showCrew||{}).forEach(([k,perCrew])=>{
      const d=realDate(k);
      Object.entries(perCrew||{}).forEach(([cid,rec])=>{
        if(rec?.attending){const arr=(m[cid]=m[cid]||new Set());arr.add(d);}
      });
    });
    const out={};
    Object.keys(m).forEach(cid=>{out[cid]=[...m[cid]].sort();});
    return out;
  },[showCrew]);
  const jumpToTravelDay=(date)=>{setSel(date);setTab("transport");};
  const panelCrew=panel?crew.find(c=>c.id===panel.crewId):null;
  const panelCD=panel?getCD(panel.crewId):null;

  const TRAVEL_MODES=["bus","fly","local","vendor","drive","n/a"];
  const LEG_STATUS=["pending","confirmed","cancelled"];
  const inp={background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 6px",outline:"none",width:"100%",fontFamily:"'Outfit',system-ui"};
  const btn=(bg="var(--accent)",col="var(--card)")=>({background:bg,border:"none",borderRadius:6,color:col,fontSize:10,padding:"4px 11px",cursor:"pointer",fontWeight:700});

  const dateLabel=(d)=>{const s=shows[d];const td=tourDaysSorted.find(x=>x.date===d);if(s)return s.city||s.venue||fD(d);if(td?.type==="travel"&&td?.bus?.route)return td.bus.route;return fD(d);};
  const dayType=(d)=>{const s=shows[d];if(s)return s.type||"show";const td=tourDaysSorted.find(x=>x.date===d);return td?.type||"off";};

  return(
    <div className="fi" style={{display:"flex",height:"calc(100vh - 115px)"}}>
      {/* Main panel */}
      <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{padding:"6px 20px",borderBottom:"1px solid var(--border)",background:"var(--card)",display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,fontSize:11}}>{show?.venue||dateLabel(sel)}</span>
        <span style={{fontSize:11,color:T.textDim}}>{show?.city||""}{show?.city?" · ":""}{fFull(sel)}</span>
        {activeSplitParty&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:activeSplitParty.bg,color:activeSplitParty.color,fontWeight:700}}>{activeSplitParty.label} · {rosterCrew.length} crew</span>}
        <span style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:"var(--accent-pill-bg)",color:T.accent,fontWeight:700}}>{attending.length} attending</span>
        <div style={{marginLeft:"auto",display:"flex",gap:5}}>
          <button onClick={()=>setTab("transport")} title="Open per-date travel view for all crew" style={{...btn("var(--card-3)","var(--accent)"),border:"1px solid var(--accent-pill-border)"}}>🧭 Travel Day →</button>
          <button onClick={()=>setEditMode(v=>!v)} style={btn(editMode?"var(--accent)":"var(--card-3)",editMode?"var(--card)":"var(--text-2)")}>{editMode?"Done Editing":"Edit Roster"}</button>
          {editMode&&<button onClick={addMember} style={btn("var(--card-3)","var(--text-2)")}>+ New Member</button>}
          <button onClick={()=>{setAddPickerOpen(v=>!v);setAddPickerSel([]);}} style={btn(addPickerOpen?"var(--accent)":"var(--success-fg)")}>{addPickerOpen?"Cancel":"+ Add to Event"}</button>
        </div>
      </div>
      {isInheriting&&prevDate&&(
        <div style={{margin:"10px 20px 0",padding:"7px 12px",background:"var(--warn-bg)",border:"1px solid var(--warn-bg)",borderRadius:10,display:"flex",alignItems:"center",gap:8,fontSize:9}}>
          <span style={{color:T.warnFg}}>Showing crew carried from <strong>{fFull(prevDate)}</strong> — no data saved for this date yet.</span>
          <button onClick={copyFromPrev} style={{marginLeft:"auto",fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--warn-fg)",color:"#fff",cursor:"pointer",fontWeight:700,flexShrink:0}}>Copy to {fD(sel)}</button>
        </div>
      )}
      {addPickerOpen&&(()=>{
        const notAttending=crew.filter(c=>!getCD(c.id).attending);
        const confirmAdd=()=>{
          addPickerSel.forEach(id=>updateSC(id,{attending:true}));
          setAddPickerOpen(false);setAddPickerSel([]);
        };
        return(
          <div style={{margin:"10px 20px 0",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
            <div style={{padding:"8px 14px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8,fontSize:10,fontWeight:700}}>
              <span>Add to {show?.venue||dateLabel(sel)}</span>
              <span style={{fontSize:9,color:T.textDim,fontWeight:400}}>{addPickerSel.length} selected</span>
              <div style={{marginLeft:"auto",display:"flex",gap:5}}>
                {notAttending.length>0&&<button onClick={()=>setAddPickerSel(addPickerSel.length===notAttending.length?[]:notAttending.map(c=>c.id))} style={{background:"none",border:"1px solid var(--border)",borderRadius:6,fontSize:9,padding:"3px 9px",cursor:"pointer",color:T.text2}}>{addPickerSel.length===notAttending.length?"Deselect All":"Select All"}</button>}
                <button onClick={confirmAdd} disabled={addPickerSel.length===0} style={{background:addPickerSel.length?"var(--success-fg)":"var(--card-3)",border:"none",borderRadius:6,fontSize:10,padding:"4px 12px",cursor:addPickerSel.length?"pointer":"default",color:addPickerSel.length?"#fff":"var(--text-mute)",fontWeight:700}}>Add {addPickerSel.length>0?addPickerSel.length+" ":""}</button>
              </div>
            </div>
            {notAttending.length===0
              ?<div style={{padding:"14px",fontSize:10,color:T.textDim}}>All roster members are already attending.</div>
              :<div style={{display:"flex",flexDirection:"column",maxHeight:260,overflowY:"auto"}}>
                {notAttending.map(c=>{
                  const sel2=addPickerSel.includes(c.id);
                  return(
                    <div key={c.id} onClick={()=>setAddPickerSel(p=>sel2?p.filter(x=>x!==c.id):[...p,c.id])} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 14px",borderBottom:"1px solid var(--card-3)",cursor:"pointer",background:sel2?"var(--accent-pill-bg)":"transparent"}}>
                      <div style={{width:16,height:16,borderRadius:3,border:`2px solid ${sel2?"var(--accent)":"var(--border)"}`,background:sel2?"var(--accent)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        {sel2&&<span style={{color:"#fff",fontSize:10,fontWeight:700}}>✓</span>}
                      </div>
                      <div>
                        <div style={{fontSize:11,fontWeight:600,color:T.text}}>{c.name||<span style={{color:T.textMute}}>Unnamed</span>}</div>
                        <div style={{fontSize:9,color:T.textDim}}>{c.role}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            }
          </div>
        );
      })()}
      <div style={{padding:"10px 20px 30px",display:"flex",flexDirection:"column",gap:10}}>
        {/* Roster */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:mobile?"28px 1fr 54px 56px":"28px 1fr 170px 54px 56px",gap:8,padding:"6px 14px",borderBottom:"1px solid var(--border)",fontSize:9,fontWeight:700,color:T.textDim,letterSpacing:"0.06em",textTransform:"uppercase"}}>
            <div/><div>Name / Role</div>{!mobile&&<div>Travel</div>}<div>Park</div><div/>
          </div>
          {rosterCrew.map(c=>{
            const cd=getCD(c.id);
            const isOpen=panel?.crewId===c.id;
            const MB=(mode,conf)=>{
              const isFly=mode==="fly";
              return <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,fontWeight:700,background:isFly?"var(--accent-pill-bg)":"var(--card-2)",color:isFly?"var(--accent)":"var(--text-2)",textTransform:"uppercase"}}>{mode.slice(0,3)}</span>
                <span style={{fontSize:8,padding:"1px 6px",borderRadius:4,fontWeight:700,background:conf?"var(--success-bg)":"var(--danger-bg)",color:conf?"var(--success-fg)":"var(--danger-fg)"}}>{conf?"Confirmed":"Unconfirmed"}</span>
              </span>;
            };
            return(
            <React.Fragment key={c.id}>
              <div style={{display:"grid",gridTemplateColumns:mobile?"28px 1fr 54px 56px":"28px 1fr 170px 54px 56px",gap:8,padding:"8px 14px",borderBottom:isOpen?"none":"1px solid var(--card-3)",alignItems:"center"}}>
                <div onClick={()=>toggleAttending(c.id)} style={{width:20,height:20,borderRadius:4,border:`2px solid ${cd.attending?"var(--success-fg)":"var(--border)"}`,background:cd.attending?"var(--success-fg)":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:700,flexShrink:0}}>{cd.attending?"✓":""}</div>
                {editMode?(
                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    <input value={c.name} onChange={e=>updateMember(c.id,"name",e.target.value)} placeholder="Name" style={{...inp,flex:1}}/>
                    <input value={c.role} onChange={e=>updateMember(c.id,"role",e.target.value)} placeholder="Role" style={{...inp,flex:1}}/>
                    <input value={c.email} onChange={e=>updateMember(c.id,"email",e.target.value)} placeholder="Email" style={{...inp,flex:1}}/>
                    <button onClick={()=>removeMember(c.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13,flexShrink:0}}>×</button>
                  </div>
                ):(
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:11,color:cd.attending?"var(--text)":"var(--text-mute)"}}>{c.name||<span style={{color:T.textMute}}>New member</span>}</div>
                    <div style={{fontSize:10,color:T.textDim}}>{c.role}</div>
                    {cd.attending&&(()=>{
                      try{
                        const attDates=attendingDatesByCrew[c.id]||[sel];
                        const state=crewLifecycleState(c.id,sel,attDates,tourDays);
                        const slots=crewLifecycleSlots({state,crewId:c.id,crew,date:sel,showCrew:currentSplit?{...showCrew,[sel]:showCrew[scKey]||{}}:showCrew,flights,lodging});
                        const jump=slot=>{
                          setSel(sel);
                          if(slot?.key==="hotel")setTab("lodging");
                          else setTab("transport");
                        };
                        return(
                          <div style={{marginTop:5}}>
                            <LifecyclePills crewId={c.id} date={sel} state={state} slots={slots} compact={mobile} onJump={jump}/>
                          </div>
                        );
                      }catch(e){
                        console.error("[lifecycle]",c.name,e);
                        return null;
                      }
                    })()}
                  </div>
                )}
                {!mobile&&<div>{cd.attending
                  ?<div style={{display:"flex",flexDirection:"column",gap:4}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:8,color:T.textMute,width:18}}>In</span>{MB(cd.inboundMode,cd.inboundConfirmed)}</div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:8,color:T.textMute,width:18}}>Out</span>{MB(cd.outboundMode,cd.outboundConfirmed)}</div>
                    </div>
                  :<span style={{fontSize:9,color:"var(--border)"}}>—</span>}
                </div>}
                <div>{cd.attending
                  ?<button onClick={()=>cycleParkingReq(c.id)} style={{fontSize:8,padding:"2px 6px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,
                      background:cd.parkingReq==="confirmed"?"var(--success-bg)":cd.parkingReq==="requested"?"var(--warn-bg)":"var(--card-2)",
                      color:cd.parkingReq==="confirmed"?"var(--success-fg)":cd.parkingReq==="requested"?"var(--warn-fg)":"var(--text-mute)"}}>
                    {cd.parkingReq==="confirmed"?"✓ P":cd.parkingReq==="requested"?"Req":"—"}
                  </button>
                  :<span/>}
                </div>
                <div>{cd.attending&&<button onClick={()=>setPanel(isOpen?null:{crewId:c.id})} style={{...UI.expandBtn(isOpen),fontSize:9,padding:"3px 8px"}}>{isOpen?"▾":"▸"}</button>}</div>
              </div>
              {isOpen&&(
                <div style={{background:"var(--card-3)",borderTop:"1px solid var(--card-3)",borderBottom:"1px solid var(--card-3)",padding:"12px 14px",display:"flex",flexDirection:"column",gap:12}}>
                  {/* Lodging badge */}
                  {(()=>{const crewHotels=Object.values(lodging).filter(h=>h.checkIn<=sel&&h.checkOut>=sel&&(h.rooms||[]).some(r=>r.crewId===c.id));return crewHotels.length>0&&(<div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"5px 8px",background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:6}}>
                    <span style={{fontSize:9,fontWeight:700,color:T.link,letterSpacing:"0.04em"}}>LODGING</span>
                    {crewHotels.map(h=>{const room=(h.rooms||[]).find(r=>r.crewId===c.id);return(<span key={h.id} style={{fontSize:11,color:T.text,fontWeight:600}}>{h.name}{room?.roomNo&&<span style={{fontFamily:MN,color:T.textDim,marginLeft:4}}>#{room.roomNo}</span>}{room?.type&&<span style={{color:T.textMute,fontSize:9,marginLeft:4}}>{room.type}</span>}</span>);})}
                    <button onClick={()=>setTab("lodging")} style={{marginLeft:"auto",fontSize:9,padding:"2px 7px",borderRadius:6,border:"none",background:"var(--info-fg)",color:"#fff",cursor:"pointer",fontWeight:700}}>→ Lodging</button>
                  </div>);})()}
                  <div style={{display:"flex",flexDirection:mobile?"column":"row",gap:16}}>
                  {[["inbound","Inbound"],["outbound","Outbound"]].map(([dir,dirLabel])=>{
                    const mode=dir==="inbound"?cd.inboundMode:cd.outboundMode;
                    const conf=dir==="inbound"?cd.inboundConfirmed:cd.outboundConfirmed;
                    const confKey=dir==="inbound"?"inboundConfirmed":"outboundConfirmed";
                    const dateKey=`${dir}Date`,timeKey=`${dir}Time`,notesKey=`${dir}Notes`;
                    return(
                      <div key={dir} style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                          <span style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.06em"}}>{dirLabel.toUpperCase()}</span>
                          <select value={mode} onChange={e=>dir==="inbound"?setInboundMode(c.id,e.target.value):setOutboundMode(c.id,e.target.value)} style={{...inp,width:"auto",padding:"2px 6px",fontSize:9}}>
                            {TRAVEL_MODES.map(m=><option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
                          </select>
                          <button onClick={()=>updateSC(c.id,{[confKey]:!conf})} style={{fontSize:9,padding:"2px 9px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,marginLeft:"auto",
                            background:conf?"var(--success-bg)":"var(--warn-bg)",color:conf?"var(--success-fg)":"var(--warn-fg)"}}>
                            {conf?"✓ Confirmed":"Unconfirmed"}
                          </button>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"130px 100px",gap:6,alignItems:"center",marginBottom:mode==="fly"?8:6}}>
                          <input type="date" value={cd[dateKey]||""} onChange={e=>updateSC(c.id,{[dateKey]:e.target.value})} title={`${dirLabel} date`} style={inp}/>
                          <input type="time" value={cd[timeKey]||""} onChange={e=>updateSC(c.id,{[timeKey]:e.target.value})} title={`${dirLabel} time`} style={inp}/>
                        </div>
                        {mode==="fly"?(
                          <div style={{display:"flex",flexDirection:"column",gap:6}}>
                            {(cd[dir]||[]).map(leg=>{
                              const isAssigned=!!leg.flightId;
                              return isAssigned?(
                                <div key={leg.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"var(--accent-pill-bg)",borderRadius:6,border:"1px solid var(--accent-pill-border)"}}>
                                  <span style={{fontSize:9,fontWeight:700,color:T.accent,whiteSpace:"nowrap"}}>✈ {leg.flight||"—"}</span>
                                  <span style={{fontSize:9,color:T.text2,flex:1}}>{leg.fromCity||leg.from} → {leg.toCity||leg.to}</span>
                                  {leg.depart&&<span style={{fontSize:9,fontFamily:MN,color:T.textDim,whiteSpace:"nowrap"}}>{leg.depart}{leg.arrive?` → ${leg.arrive}`:""}</span>}
                                  {leg.conf&&<span style={{fontSize:8,color:T.textMute,fontFamily:MN,whiteSpace:"nowrap"}}>#{leg.conf}</span>}
                                  <button onClick={()=>unassignFlight(c.id,dir,leg.flightId)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13,padding:0,flexShrink:0,lineHeight:1}}>×</button>
                                </div>
                              ):(
                                <div key={leg.id} style={{display:"grid",gridTemplateColumns:"1fr 70px 70px 90px 90px 80px 24px",gap:4,alignItems:"center"}}>
                                  {[["flight","Flight #"],["from","From"],["to","To"],["depart","Depart"],["arrive","Arrive"]].map(([k,ph])=>(
                                    <input key={k} placeholder={ph} value={leg[k]} onChange={e=>updateLeg(c.id,dir,leg.id,k,e.target.value)} style={inp}/>
                                  ))}
                                  <select value={leg.status} onChange={e=>updateLeg(c.id,dir,leg.id,"status",e.target.value)} style={{...inp,padding:"3px 4px",fontSize:9}}>
                                    {LEG_STATUS.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                                  </select>
                                  <button onClick={()=>removeLeg(c.id,dir,leg.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13,padding:0}}>×</button>
                                </div>
                              );
                            })}
                            {/* Flight picker dropdown */}
                            {flightPicker?.crewId===c.id&&flightPicker?.dir===dir?(
                              <div style={{background:"var(--card)",border:"1px solid var(--accent-pill-border)",borderRadius:10,overflow:"hidden",boxShadow:"0 4px 16px rgba(0,0,0,0.10)"}}>
                                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderBottom:"1px solid var(--border)",background:"var(--card-3)"}}>
                                  <span style={{fontSize:9,fontWeight:800,color:T.accent,letterSpacing:"0.06em"}}>ASSIGN FLIGHT — {dir==="inbound"?"ARRIVALS":"DEPARTURES"} {fD(sel)}</span>
                                  <button onClick={()=>setFlightPicker(null)} style={{background:"none",border:"none",cursor:"pointer",color:T.textMute,fontSize:13,padding:0,lineHeight:1}}>×</button>
                                </div>
                                {(()=>{
                                  const matches=flightsForDir(dir);
                                  if(matches.length===0)return <div style={{padding:"12px 10px",fontSize:10,color:T.textMute,textAlign:"center"}}>No confirmed flights match {show?.city||fD(sel)} for {dir}.<br/><span style={{fontSize:9}}>Scan Gmail for flights in Transport tab.</span></div>;
                                  return matches.map(f=>{
                                    const allLegs=findItineraryLegs(f,flights);
                                    const legs=allLegs.length?allLegs:[f];
                                    const firstLeg=legs[0],lastLeg=legs[legs.length-1];
                                    const isMulti=legs.length>1;
                                    const chain=[firstLeg.from,...legs.map(l=>l.to)].filter(Boolean);
                                    const flightIds=new Set(legs.map(l=>l.id));
                                    const alreadyAssigned=(cd[dir]||[]).some(l=>flightIds.has(l.flightId));
                                    const anchorDate=dir==="inbound"?(lastLeg.arrDate||lastLeg.depDate):firstLeg.depDate;
                                    const delta=anchorDate?Math.round((new Date(anchorDate+"T12:00:00")-new Date(sel+"T12:00:00"))/86400000):0;
                                    const badge=delta===0?null:(delta>0?`+${delta}d`:`${delta}d`);
                                    const carriers=[...new Set(legs.map(l=>l.carrier).filter(Boolean))];
                                    const flightNos=legs.map(l=>l.flightNo).filter(Boolean).join(" · ");
                                    const conf=firstLeg.confirmNo||firstLeg.bookingRef||firstLeg.pnr||"";
                                    const paxCount=Math.max(...legs.map(l=>l.pax?.length||0),0);
                                    return(
                                      <div key={f.id} onClick={()=>!alreadyAssigned&&assignFlight(c.id,dir,f)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderBottom:"1px solid var(--card-3)",cursor:alreadyAssigned?"default":"pointer",background:alreadyAssigned?"var(--card-3)":"var(--card)",opacity:alreadyAssigned?0.6:1,flexWrap:"wrap"}} className="rh">
                                        <span style={{fontFamily:MN,fontSize:12,fontWeight:800,color:T.link,flexShrink:0}}>{chain.map((c,i)=>(<React.Fragment key={i}>{c}{i<chain.length-1&&<span style={{fontSize:9,color:T.textMute,fontWeight:400,padding:"0 4px"}}>→</span>}</React.Fragment>))}</span>
                                        {isMulti&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--accent-pill-bg)",color:T.accent,fontWeight:700,letterSpacing:"0.04em",flexShrink:0}}>{legs.length} LEGS</span>}
                                        {flightNos&&<span style={{fontSize:10,fontWeight:700,color:T.text,flexShrink:0}}>{flightNos}</span>}
                                        {carriers.length>0&&<span style={{fontSize:9,color:T.textDim,flexShrink:0}}>{carriers.join(" / ")}</span>}
                                        <span style={{fontFamily:MN,fontSize:9,color:T.text2,flexShrink:0}}>{firstLeg.dep||""}{lastLeg.arr?`–${lastLeg.arr}`:""}</span>
                                        {(firstLeg.fromCity||lastLeg.toCity)&&<span style={{fontSize:9,color:T.textMute,flexShrink:0}}>{firstLeg.fromCity||firstLeg.from} → {lastLeg.toCity||lastLeg.to}</span>}
                                        {conf&&<span style={{fontFamily:MN,fontSize:8,fontWeight:700,color:T.text2,flexShrink:0}}>{conf}</span>}
                                        {paxCount>0&&<span style={{fontSize:8,color:T.textMute,flexShrink:0}}>{paxCount} pax</span>}
                                        <span style={{flex:1}}/>
                                        {badge&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--warn-bg)",color:T.warnFg,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>{badge}</span>}
                                        {alreadyAssigned?<span style={{fontSize:8,color:T.successFg,fontWeight:700,flexShrink:0}}>✓ Assigned</span>:<span style={{fontSize:9,color:T.accent,fontWeight:700,flexShrink:0}}>Assign →</span>}
                                      </div>
                                    );
                                  });
                                })()}
                                <div style={{padding:"6px 10px",borderTop:"1px solid var(--border)",background:"var(--card-3)"}}>
                                  <button onClick={()=>addLeg(c.id,dir)} style={{...btn("var(--text-dim)"),fontSize:8,padding:"2px 8px"}}>+ Enter manually</button>
                                </div>
                              </div>
                            ):(
                              <div style={{display:"flex",gap:6}}>
                                <button onClick={()=>setFlightPicker({crewId:c.id,dir})} style={{...btn("var(--accent)"),fontSize:9,padding:"3px 10px"}}>✈ Assign Flight</button>
                                <button onClick={()=>addLeg(c.id,dir)} style={{...btn("var(--text-dim)"),fontSize:9,padding:"3px 9px"}}>+ Manual</button>
                              </div>
                            )}
                          </div>
                        ):(
                          <input value={cd[notesKey]||""} onChange={e=>updateSC(c.id,{[notesKey]:e.target.value})} placeholder={dir==="inbound"?"Pickup / meet point…":"Drop-off / instructions…"} style={inp}/>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
            </React.Fragment>
            );
          })}
        </div>
        {/* Summary */}
        {attending.length>0&&(
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.06em",marginBottom:8}}>ATTENDING ({attending.length})</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {attending.map(c=>{const cd=getCD(c.id);const hasFly=cd.inboundMode==="fly"||cd.outboundMode==="fly";const sameMode=cd.inboundMode===cd.outboundMode;const bothConfirmed=cd.inboundConfirmed&&cd.outboundConfirmed;const noneConfirmed=!cd.inboundConfirmed&&!cd.outboundConfirmed;return(
                <span key={c.id} style={{fontSize:10,padding:"3px 9px",borderRadius:99,background:hasFly?"var(--accent-pill-bg)":"var(--card-2)",color:hasFly?"var(--accent)":"var(--text-2)",fontWeight:600,border:`1px solid ${bothConfirmed?"var(--success-fg)":noneConfirmed?"var(--warn-bg)":"var(--border)"}`}}>
                  {c.name} <span style={{opacity:0.6,fontSize:8,textTransform:"uppercase"}}>{sameMode?cd.inboundMode:`${cd.inboundMode}→${cd.outboundMode}`}</span>{bothConfirmed&&<span style={{fontSize:8,color:T.successFg,marginLeft:3}}>✓</span>}
                </span>);
              })}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
