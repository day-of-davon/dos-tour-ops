import React, { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { DEFAULT_CREW, MN } from "../../lib/domain-constants";
import { ALL_SHOWS, buildDraftSessions } from "../../lib/ros-data";
import { fD, fW } from "../../lib/time";
import { BUS_DATA } from "../../lib/tour-data";
import { T } from "../../styles/tokens";
import { BusDriveSessionTable } from "../transport/BusDriveSessionTable";

export function TourCalendar(){
  const{setSel,setTab,flights,uFlight,effectiveSplitDays,allShows,setAllShows,busEdits,uBusEdit,setTransView}=useContext(Ctx);
  const importBusLegs=()=>{
    const base=new Date('2026-05-02T12:00:00');
    BUS_DATA.forEach(d=>{
      if(d.dep==="—"||!d.route.includes("→"))return;
      const dt=new Date(base);dt.setDate(dt.getDate()+d.day-1);
      const isoDate=dt.toISOString().slice(0,10);
      if(Object.values(flights).some(f=>f.type==="bus"&&f.depDate===isoDate&&f.status!=="dismissed"))return;
      const parts=d.route.split("→").map(s=>s.trim());
      const id=`bus_${isoDate}_${Math.random().toString(36).slice(2,6)}`;
      uFlight(id,{id,type:"bus",status:"confirmed",depDate:isoDate,arrDate:isoDate,dep:d.dep,arr:d.arr,from:parts[0],to:parts[1]||"",fromCity:parts[0],toCity:parts[1]||"",carrier:"Pieter Smit",flightNo:"Tour Bus",notes:d.note||"",pax:[]});
    });
  };
  const[expRows,setExpRows]=useState({});
  const[editRows,setEditRows]=useState({});
  const[editForms,setEditForms]=useState({});
  const[calcRows,setCalcRows]=useState({});
  const[calcForms,setCalcForms]=useState({});
  const[calcResults,setCalcResults]=useState({});
  const[calcLoading,setCalcLoading]=useState({});
  const splitRoute=(route)=>{const[a,b]=String(route||"").split("→").map(s=>s.trim());return{from:a||"",to:b||""};};
  const toggleCalc=(iso,form)=>{
    setCalcRows(p=>({...p,[iso]:!p[iso]}));
    if(!calcRows[iso]){
      const{from,to}=splitRoute(form?.route||editForms[iso]?.route||"");
      setCalcForms(p=>({...p,[iso]:p[iso]||{origin:from,destination:to,depTime:form?.dep||editForms[iso]?.dep||"08:00"}}));
    }
  };
  const calcRoute=async(iso)=>{
    const f=calcForms[iso]||{};
    if(!f.origin||!f.destination){setCalcResults(p=>({...p,[iso]:{error:"Provide origin and destination"}}));return;}
    setCalcLoading(p=>({...p,[iso]:true}));
    try{
      const resp=await fetch("/api/route",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({origin:f.origin,destination:f.destination,departureTime:f.depTime||null,departureDate:iso})});
      const data=await resp.json();
      setCalcResults(p=>({...p,[iso]:data}));
    }catch(e){setCalcResults(p=>({...p,[iso]:{error:e.message}}));}
    setCalcLoading(p=>({...p,[iso]:false}));
  };
  const applyCalc=(iso)=>{
    const r=calcResults[iso];const f=calcForms[iso]||{};
    if(!r||r.error)return;
    setEditForms(p=>({...p,[iso]:{...(p[iso]||{}),dep:f.depTime||(p[iso]?.dep||""),arr:r.eta||(p[iso]?.arr||""),km:r.distance_km!=null?String(r.distance_km):(p[iso]?.km||""),drive:r.drive_label||(p[iso]?.drive||""),route:`${f.origin} → ${f.destination}`}}));
    setCalcRows(p=>({...p,[iso]:false}));
  };
  const crewById=useMemo(()=>DEFAULT_CREW.reduce((a,c)=>{a[c.id]=c;return a},{}),[]);
  const openDay=(iso,type)=>{setSel(iso);if(type==="travel"){if(allShows)setAllShows(false);setTransView("drive");}};

  const busMap=useMemo(()=>{
    const m={};
    BUS_DATA.forEach(d=>{
      const base=new Date('2026-05-02T12:00:00');
      base.setDate(base.getDate()+d.day-1);
      const iso=base.toISOString().slice(0,10);
      m[iso]={...d,...(busEdits[iso]||{})};
    });
    return m;
  },[busEdits]);
  const toggleBusEdit=(iso,bus)=>{
    const wasOpen=editRows[iso];
    setEditRows(p=>({...p,[iso]:!p[iso]}));
    if(!wasOpen)setEditForms(p=>({...p,[iso]:{dep:bus.dep||"",arr:bus.arr||"",km:String(bus.km||0),drive:bus.drive||"",route:bus.route||"",note:bus.note||"",stops:bus.stops||""}}));
  };
  const saveBusEdit=(iso)=>{
    const f=editForms[iso]||{};
    uBusEdit(iso,{...f,km:parseInt(f.km)||0});
    setEditRows(p=>({...p,[iso]:false}));
  };
  const resetBusEdit=(iso)=>{uBusEdit(iso,null);setEditRows(p=>({...p,[iso]:false}));};
  const showMap=useMemo(()=>{
    const m={};
    ALL_SHOWS.filter(s=>s.clientId==="bbn"&&s.date>="2026-04-16"&&s.date<="2026-05-31").forEach(s=>{m[s.date]=s;});
    return m;
  },[]);
  const days=useMemo(()=>{
    const result=[];
    const end=new Date('2026-06-01T12:00:00');
    for(let d=new Date('2026-04-16T12:00:00');d<=end;d.setDate(d.getDate()+1)){
      const iso=d.toISOString().slice(0,10);
      const bus=busMap[iso];
      const show=showMap[iso];
      const split=effectiveSplitDays[iso];
      let type="off";
      if(split)type="split";
      else if(show||(bus&&bus.show))type="show";
      else if(bus)type="travel";
      result.push({iso,bus,show,split,type});
    }
    return result;
  },[busMap,showMap,effectiveSplitDays]);
  const TS={
    show:{l:"SHOW",c:"var(--success-fg)",b:"var(--success-bg)"},
    travel:{l:"TRAVEL",c:"var(--link)",b:"var(--info-bg)"},
    off:{l:"OFF",c:"var(--text-dim)",b:"var(--card-2)"},
    split:{l:"SPLIT",c:"var(--warn-fg)",b:"var(--warn-bg)"},
  };
  const todayISO=new Date().toISOString().slice(0,10);
  const parseDriveH=s=>{if(!s)return 0;const m=s.match(/(\d+)h/);return m?parseInt(m[1]):0;};
  const maxDriveH=Math.max(1,...days.filter(d=>d.type==="travel"&&d.bus?.drive).map(d=>parseDriveH(d.bus.drive)));
  const totalKm=days.filter(d=>d.bus?.km>0).reduce((s,d)=>s+(d.bus?.km||0),0);
  const totalDriveH=days.filter(d=>d.type==="travel"&&d.bus?.drive).reduce((s,d)=>s+parseDriveH(d.bus.drive),0);
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:8}}>
        {[
          {l:"Shows",v:days.filter(d=>d.type==="show").length,c:"var(--success-fg)",b:"var(--success-bg)"},
          {l:"Travel Days",v:days.filter(d=>d.type==="travel").length,c:"var(--link)",b:"var(--info-bg)"},
          {l:"Off Days",v:days.filter(d=>d.type==="off").length,c:"var(--text-dim)",b:"var(--card-2)"},
          {l:"Split Days",v:days.filter(d=>d.type==="split").length,c:"var(--warn-fg)",b:"var(--warn-bg)"},
        ].map((s,i)=>(
          <div key={i} style={{background:s.b,border:`1px solid ${s.c}30`,borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:9,color:s.c,fontWeight:700,marginBottom:2}}>{s.l}</div>
            <div style={{fontFamily:MN,fontSize:16,fontWeight:800,color:s.c}}>{s.v}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,padding:"8px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,flexWrap:"wrap"}}>
        {[{l:"Total KM",v:"8,970"},{l:"Drive Days",v:"14"},{l:"HOS Flags",v:"3",warn:true}].map((s,i)=>(
          <div key={i} style={{display:"flex",alignItems:"baseline",gap:4}}>
            <span style={{fontFamily:MN,fontSize:13,fontWeight:800,color:s.warn?"var(--danger-fg)":"var(--text)"}}>{s.v}</span>
            <span style={{fontSize:9,color:T.textDim}}>{s.l}</span>
          </div>
        ))}
        <span style={{fontSize:9,color:T.textMute,fontFamily:MN}}>Pieter Smit T26-021201</span>
        <button onClick={importBusLegs} style={{marginLeft:"auto",fontSize:9,padding:"3px 10px",borderRadius:6,border:"1px solid var(--accent)",background:"var(--accent-pill-bg)",color:T.accent,cursor:"pointer",fontWeight:700,fontFamily:MN}}>→ Import Legs to Travel Days</button>
      </div>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"auto",maxHeight:380}}>
        {(()=>{
          const past=days.filter(d=>d.iso<todayISO);
          const upcoming=days.filter(d=>d.iso>=todayISO);
          const renderDay=(d,i,arr)=>{
            const ts=TS[d.type]||TS.off;
            const isOff=d.type==="off";
            const isSplit=d.type==="split";
            const isExp=expRows[d.iso];
            const hasFlag=(d.bus?.flag==="⚠")||(d.show?.notes||"").includes("⚠");
            const canExpand=isSplit||hasFlag;
            const driveH=parseDriveH(d.bus?.drive);
            const drivePct=maxDriveH>0?Math.min(100,(driveH/maxDriveH)*100):0;
            const driveC=driveH>5?"var(--danger-fg)":driveH>3?"var(--warn-fg)":"var(--success-fg)";
            return(
              <React.Fragment key={d.iso}>
              <div style={{borderBottom:i<arr.length-1?"1px solid var(--card-3)":"none"}}>
              <div
                onClick={()=>openDay(d.iso,d.type)}
                className="rh"
                style={{display:"grid",gridTemplateColumns:"76px 58px 1fr auto",alignItems:"center",gap:8,padding:isOff?"5px 12px":"8px 12px",background:d.type==="show"?"var(--muted-bg)":d.type==="travel"?"var(--info-bg)":d.type==="split"?"var(--warn-bg)":"var(--card)",cursor:"pointer",opacity:isOff?0.65:1,borderLeft:d.type==="show"?"3px solid var(--success-fg)":"3px solid transparent"}}
              >
                <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                  <span style={{fontFamily:MN,fontSize:isOff?9:10,fontWeight:isOff?400:700,color:ts.c}}>{fD(d.iso)}</span>
                  <span style={{fontSize:8,color:T.textMute}}>{fW(d.iso)}</span>
                </div>
                <div style={{background:ts.b,color:ts.c,fontSize:8,fontWeight:800,padding:"2px 6px",borderRadius:4,textAlign:"center",letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{ts.l}</div>
                <div style={{minWidth:0,overflow:"hidden"}}>
                  {d.type==="show"&&(
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:10,fontWeight:600,color:T.text}}>{d.show?.venue||d.bus?.venue}</span>
                      <span style={{fontSize:9,color:T.textDim}}>— {d.show?.city}</span>
                      {d.show?.notes&&<span style={{fontSize:9,color:T.warnFg}}>{d.show.notes}</span>}
                      {d.show?.promoter&&<span style={{fontSize:8,color:T.textMute,fontStyle:"italic"}}>{d.show.promoter}</span>}
                    </div>
                  )}
                  {d.type==="travel"&&(
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:10,color:T.text,fontWeight:500}}>{d.bus?.route}</span>
                      {d.bus?.km>0&&<span style={{fontFamily:MN,fontSize:9,color:T.textDim}}>{d.bus.km}km</span>}
                      <span style={{fontFamily:MN,fontSize:9,color:T.textDim}}>{d.bus?.drive}</span>
                      {d.bus?.dep!=="—"&&<span style={{fontFamily:MN,fontSize:9,color:T.text2}}>↑{d.bus.dep}</span>}
                      {d.bus?.arr!=="—"&&<span style={{fontFamily:MN,fontSize:9,color:T.text2}}>↓{d.bus.arr}</span>}
                      {d.bus?.note&&<span style={{fontSize:9,color:T.textMute}}>{d.bus.note}</span>}
                    </div>
                  )}
                  {d.type==="off"&&<span style={{fontSize:9,color:T.textMute}}>—</span>}
                  {d.type==="split"&&(
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                      {d.split.parties.map(p=>(
                        <span key={p.id} style={{fontSize:9,padding:"2px 8px",borderRadius:4,background:p.bg,color:p.color,fontWeight:700}}>{p.label} · {p.crew.length} crew</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                  {hasFlag&&<span style={{fontSize:11}}>⚠</span>}
                  {canExpand&&<span onClick={e=>{e.stopPropagation();setExpRows(p=>({...p,[d.iso]:!p[d.iso]}));}} style={{fontSize:9,color:ts.c,fontWeight:700,padding:"2px 6px",borderRadius:4,cursor:"pointer"}}>{isExp?"▴":"▾"}</span>}
                  {d.type==="travel"&&<span onClick={e=>{e.stopPropagation();toggleBusEdit(d.iso,d.bus);}} title="Edit bus entry" style={{fontSize:10,color:editRows[d.iso]?"var(--accent)":T.textMute,cursor:"pointer",padding:"2px 4px",borderRadius:4,border:`1px solid ${editRows[d.iso]?"var(--accent)":"var(--border)"}`,lineHeight:1,background:editRows[d.iso]?"var(--accent-pill-bg)":"transparent"}}>{busEdits[d.iso]?"✎*":"✎"}</span>}
                </div>
              </div>
              {d.type==="travel"&&driveH>0&&<div style={{height:3,background:"var(--card-2)"}}><div style={{width:`${drivePct}%`,height:"100%",background:driveC,transition:"width 0.3s"}}/></div>}
              {d.type==="travel"&&editRows[d.iso]&&(
                <div onClick={e=>e.stopPropagation()} style={{padding:"10px 12px",background:"var(--card)",borderTop:"1px solid var(--border)"}}>
                  <div style={{fontSize:8,fontWeight:800,color:T.textDim,letterSpacing:"0.08em",marginBottom:6}}>EDIT BUS ENTRY{busEdits[d.iso]?" · OVERRIDDEN":""}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"flex-end",marginBottom:6}}>
                    {[["DEP","dep"],["ARR","arr"],["KM","km"],["DRIVE","drive"],["ROUTE","route"]].map(([l,k])=>(
                      <div key={k}>
                        <div style={{fontSize:7,fontWeight:700,color:T.textDim,marginBottom:2,letterSpacing:"0.06em"}}>{l}</div>
                        <input value={(editForms[d.iso]||{})[k]||""} onChange={e=>setEditForms(p=>({...p,[d.iso]:{...(p[d.iso]||{}),[k]:e.target.value}}))} style={{fontFamily:MN,fontSize:10,padding:"3px 6px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text,width:k==="route"?140:k==="drive"?48:k==="km"?48:56,outline:"none"}}/>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"flex-end",marginBottom:8}}>
                    {[["NOTE","note"],["STOPS","stops"]].map(([l,k])=>(
                      <div key={k} style={{flex:k==="note"?1:2,minWidth:120}}>
                        <div style={{fontSize:7,fontWeight:700,color:T.textDim,marginBottom:2,letterSpacing:"0.06em"}}>{l}</div>
                        <input value={(editForms[d.iso]||{})[k]||""} onChange={e=>setEditForms(p=>({...p,[d.iso]:{...(p[d.iso]||{}),[k]:e.target.value}}))} style={{fontSize:9,padding:"3px 6px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text,width:"100%",outline:"none",boxSizing:"border-box"}}/>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button onClick={()=>saveBusEdit(d.iso)} style={{fontSize:9,padding:"3px 10px",borderRadius:5,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>✓ Save</button>
                    <button onClick={()=>setEditRows(p=>({...p,[d.iso]:false}))} style={{fontSize:9,padding:"3px 8px",borderRadius:5,border:"1px solid var(--border)",background:"transparent",color:T.text2,cursor:"pointer"}}>Cancel</button>
                    <button onClick={()=>toggleCalc(d.iso,d.bus)} style={{fontSize:9,padding:"3px 10px",borderRadius:5,border:`1px solid ${calcRows[d.iso]?"var(--accent)":"var(--info-fg)"}`,background:calcRows[d.iso]?"var(--accent-pill-bg)":"transparent",color:calcRows[d.iso]?"var(--accent)":"var(--info-fg)",cursor:"pointer",fontWeight:700}}>🧮 {calcRows[d.iso]?"Hide":"Calculate"} Route</button>
                    {busEdits[d.iso]&&<button onClick={()=>resetBusEdit(d.iso)} style={{fontSize:9,padding:"3px 8px",borderRadius:5,border:"1px solid var(--danger-fg)",background:"transparent",color:"var(--danger-fg)",cursor:"pointer",fontWeight:700,marginLeft:"auto"}}>↺ Reset to default</button>}
                  </div>
                  {calcRows[d.iso]&&(()=>{const cf=calcForms[d.iso]||{};const cr=calcResults[d.iso];const loading=calcLoading[d.iso];return(
                    <div style={{marginTop:8,padding:"10px 12px",background:"var(--info-bg)",borderRadius:6,border:"1px solid var(--info-fg)"}}>
                      <div style={{fontSize:8,fontWeight:800,color:"var(--info-fg)",letterSpacing:"0.08em",marginBottom:6}}>ROUTE CALCULATOR · driving-hgv</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 80px",gap:6,marginBottom:6}}>
                        <div>
                          <div style={{fontSize:7,fontWeight:700,color:T.textDim,marginBottom:2,letterSpacing:"0.06em"}}>ORIGIN ADDRESS</div>
                          <input value={cf.origin||""} onChange={e=>setCalcForms(p=>({...p,[d.iso]:{...(p[d.iso]||{}),origin:e.target.value}}))} placeholder="e.g. Aarschot, BE" style={{fontSize:10,padding:"4px 6px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card)",color:T.text,width:"100%",outline:"none",boxSizing:"border-box"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:7,fontWeight:700,color:T.textDim,marginBottom:2,letterSpacing:"0.06em"}}>DESTINATION ADDRESS</div>
                          <input value={cf.destination||""} onChange={e=>setCalcForms(p=>({...p,[d.iso]:{...(p[d.iso]||{}),destination:e.target.value}}))} placeholder="e.g. Neg Earth, London NW10" style={{fontSize:10,padding:"4px 6px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card)",color:T.text,width:"100%",outline:"none",boxSizing:"border-box"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:7,fontWeight:700,color:T.textDim,marginBottom:2,letterSpacing:"0.06em"}}>DEP TIME</div>
                          <input type="time" value={cf.depTime||""} onChange={e=>setCalcForms(p=>({...p,[d.iso]:{...(p[d.iso]||{}),depTime:e.target.value}}))} style={{fontFamily:MN,fontSize:10,padding:"3px 6px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card)",color:T.text,width:"100%",outline:"none",boxSizing:"border-box"}}/>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <button onClick={()=>calcRoute(d.iso)} disabled={loading} style={{fontSize:9,padding:"4px 12px",borderRadius:5,border:"none",background:loading?"var(--card-3)":"var(--info-fg)",color:loading?T.textDim:"#fff",cursor:loading?"default":"pointer",fontWeight:700}}>{loading?"Calculating…":"→ Calculate"}</button>
                        {cr&&!cr.error&&(
                          <>
                            <span style={{fontFamily:MN,fontSize:10,fontWeight:800,color:T.text,padding:"2px 7px",borderRadius:99,background:"var(--card)",border:"1px solid var(--border)"}}>{cr.distance_km!=null?`${cr.distance_km} km`:"— km"}</span>
                            <span style={{fontFamily:MN,fontSize:10,fontWeight:800,color:T.text,padding:"2px 7px",borderRadius:99,background:"var(--card)",border:"1px solid var(--border)"}}>{cr.drive_label||"— drive"}</span>
                            {cr.eta&&<span style={{fontFamily:MN,fontSize:10,fontWeight:800,color:"var(--success-fg)",padding:"2px 7px",borderRadius:99,background:"var(--success-bg)",border:"1px solid var(--success-fg)"}}>ETA {cr.eta}</span>}
                            <span style={{fontSize:8,color:T.textMute,fontFamily:MN}}>via {cr.provider}</span>
                            <button onClick={()=>applyCalc(d.iso)} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"none",background:"var(--success-fg)",color:"#fff",cursor:"pointer",fontWeight:700,marginLeft:"auto"}}>↳ Apply to fields</button>
                          </>
                        )}
                        {cr?.error&&<span style={{fontSize:9,color:"var(--danger-fg)",fontWeight:700}}>{cr.error==="no_routing_provider_configured"?"Set ORS_API_KEY or GOOGLE_MAPS_API_KEY in Vercel env to enable.":cr.error}</span>}
                      </div>
                      {cr?.geocoded&&!cr.error&&(
                        <div style={{marginTop:6,fontSize:8,color:T.textDim,fontFamily:MN}}>📍 {cr.geocoded.origin} → 📍 {cr.geocoded.destination}</div>
                      )}
                      {(()=>{const draft=buildDraftSessions(cr,cf);if(!draft)return null;const draftEntry={route:`${cf.origin} → ${cf.destination}`,km:cr.distance_km,drive:cr.drive_label,dep:cf.depTime,arr:cr.eta,flag:cr.duration_min>540?"⚠":"",note:" ",stops:""};return(
                        <div style={{marginTop:8,borderTop:"1px solid var(--info-fg)40",borderRadius:6,overflow:"hidden",background:"var(--card)"}}>
                          <BusDriveSessionTable entry={draftEntry} label="DRAFT DRIVE SESSION TABLE — review before applying" sessions={draft} compact/>
                        </div>
                      );})()}
                    </div>
                  );})()}
                </div>
              )}
              {isSplit&&isExp&&(
                <div style={{padding:"0 12px 10px",background:"var(--warn-bg)",borderTop:"1px solid var(--warn-bg)"}}>
                  {d.split.parties.map(p=>(
                    <div key={p.id} style={{marginTop:8,padding:"8px 10px",background:p.bg,borderRadius:6,border:`1px solid ${p.color}30`}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,fontWeight:800,color:p.color}}>{p.label}</span>
                        <span style={{fontSize:9,color:T.textMute}}>·</span>
                        <span style={{fontSize:9,color:T.textDim}}>{p.location}</span>
                        <span style={{fontSize:9,color:T.textMute}}>·</span>
                        <span style={{fontSize:9,color:T.textDim}}>{p.event}</span>
                      </div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:p.note?4:0}}>
                        {p.crew.map(cid=>{const c=crewById[cid];return c?(
                          <span key={cid} style={{fontSize:8,padding:"2px 8px",borderRadius:10,background:"var(--card)",border:`1px solid ${p.color}40`,color:p.color,fontWeight:600}}>
                            {c.name.split(" ")[0]} <span style={{fontWeight:400,opacity:0.7,fontSize:8}}>({c.role.split(" (")[0].split("/")[0].trim()})</span>
                          </span>
                        ):null;})}
                      </div>
                      {p.note&&<div style={{fontSize:9,color:T.textDim,fontStyle:"italic"}}>{p.note}</div>}
                    </div>
                  ))}
                </div>
              )}
              {!isSplit&&hasFlag&&isExp&&d.show?.notes&&(
                <div style={{padding:"6px 12px 8px",background:"var(--warn-bg)",borderTop:"1px solid var(--warn-bg)",fontSize:9,color:T.warnFg}}>{d.show.notes}</div>
              )}
            </div>
            </React.Fragment>
            );
          };
          return(<>
            {past.length>0&&(
              <details style={{borderBottom:"1px solid var(--card-3)"}}>
                <summary style={{padding:"6px 12px",fontSize:9,fontWeight:800,color:T.textMute,fontFamily:MN,letterSpacing:"0.1em",cursor:"pointer",userSelect:"none",background:"var(--card-2)",listStyle:"revert"}}>Past · {past.length} day{past.length===1?"":"s"}</summary>
                {past.map((d,i)=>renderDay(d,i,past))}
              </details>
            )}
            {upcoming.length>0&&past.length>0&&<div style={{padding:"4px 12px",background:"var(--warn-bg)",borderTop:"1px solid var(--warn-fg)",borderBottom:"1px solid var(--warn-fg)",fontSize:8,fontWeight:800,color:T.warnFg,fontFamily:MN,letterSpacing:"0.1em"}}>▸ TODAY</div>}
            {upcoming.map((d,i)=>renderDay(d,i,upcoming))}
          </>);
        })()}
      </div>
      <div style={{marginTop:8,padding:"10px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,display:"flex",gap:20,alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:4}}><span style={{fontFamily:MN,fontSize:13,fontWeight:800,color:T.link}}>{totalKm.toLocaleString()}km</span><span style={{fontSize:9,color:T.textDim,marginLeft:4}}>TOTAL DRIVE DIST</span></div>
        <div style={{display:"flex",alignItems:"baseline",gap:4}}><span style={{fontFamily:MN,fontSize:13,fontWeight:800,color:T.text}}>{totalDriveH}h</span><span style={{fontSize:9,color:T.textDim,marginLeft:4}}>TOTAL DRIVE TIME</span></div>
      </div>
    </div>
  );
}
