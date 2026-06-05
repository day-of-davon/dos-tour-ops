import React, { useContext, useMemo, useRef, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { CM, MN, UI } from "../../lib/domain-constants";
import { CUSTOM_ROS_MAP } from "../../lib/ros-data";
import { SEG_META } from "../../lib/segments";
import { fmt, hhmmToMin, pM } from "../../lib/time";
import { BUS_DATA_MAP } from "../../lib/tour-data";
import { T } from "../../styles/tokens";
import { FlightDayStrip } from "../flights/FlightDayStrip";
import { BusDriveSessionTable } from "../transport/BusDriveSessionTable";
import { AnchorTimes } from "./AnchorTimes";
import { DayScheduleView } from "./DayScheduleView";

export function ROSTab(){
  const{shows,uShow,gRos,uRos,ros,sel,setSel,eventKey,cShows,role,aC,selEventId,setSelEventId,currentSplit,flights,setTab,busEdits}=useContext(Ctx);
  const[editB,setEditB]=useState(null);const[dOver,setDOver]=useState(null);
  const[busDetailExp,setBusDetailExp]=useState({});
  const[editShow,setEditShow]=useState(false);
  const[editVenue,setEditVenue]=useState("");const[editCity,setEditCity]=useState("");const[editPromoter,setEditPromoter]=useState("");
  const dId=useRef(null);const client=CM[aC];const show=shows[sel];
  // Sub-event support: use compound ROS key when a sub-event is selected
  const subEvent=selEventId?(show?.subEvents||[]).find(e=>e.id===selEventId)||null:null;
  const effShow=subEvent||show;
  const rosKey=eventKey;
  const blocks=gRos(rosKey);
  const today2=new Date().toISOString().slice(0,10);const upcoming0=cShows.filter(s=>s.date>=today2);
  if(!show)return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,padding:40,gap:10}}>
      <div style={{fontSize:32,opacity:0.2}}>📋</div>
      <div style={{fontSize:14,fontWeight:700,color:T.text}}>No show selected</div>
      <div style={{fontSize:11,color:T.textDim,maxWidth:280,textAlign:"center"}}>Select a show from the sidebar to view and edit the run of show.</div>
      {upcoming0[0]&&<button onClick={()=>setSel(upcoming0[0].date)} style={{marginTop:6,padding:"6px 16px",borderRadius:8,border:"none",background:"var(--accent)",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>Jump to next show →</button>}
    </div>
  );
  const today=new Date().toISOString().slice(0,10);const upcoming=cShows.filter(s=>s.date>=today);

  const busCalTimes=useMemo(()=>{
    const todayBus={...BUS_DATA_MAP[sel],...(busEdits?.[sel]||{})};
    const busArriveEff=(todayBus?.arr&&todayBus.arr!=="—")?pM(todayBus.arr):null;
    let busDepartEff=null,busDepartRoute=null,departBus=null;
    for(let d=1;d<=4;d++){const dt=new Date(sel+"T12:00:00");dt.setDate(dt.getDate()+d);const iso=dt.toISOString().slice(0,10);const e={...BUS_DATA_MAP[iso],...(busEdits?.[iso]||{})};if(e?.dep&&e.dep!=="—"){const raw=pM(e.dep);busDepartEff=(raw!=null&&raw<8*60)?raw+1440:raw;busDepartRoute=e.route;departBus=e;break;}}
    return{busArriveEff,busArriveRoute:todayBus?.route||null,busDepartEff,busDepartRoute,arriveBus:BUS_DATA_MAP[sel]?todayBus:null,departBus};
  },[sel,busEdits]);// eslint-disable-line

  const times=useMemo(()=>{
    const t={};const{doors,curfew,busArrive,crewCall,venueAccess,mgTime}=effShow;
    const effBusArrive=effShow.busArriveConfirmed?busArrive:(busCalTimes.busArriveEff??busArrive);
    t.bus_arrive={s:effBusArrive,e:effBusArrive};t.venue_access={s:venueAccess,e:venueAccess};t.crew_call={s:crewCall,e:crewCall};
    const pre=blocks.filter(b=>b.phase==="pre"&&!b.anchorKey);let c=crewCall;
    for(const b of pre){t[b.id]={s:c,e:c+b.duration};c+=b.duration;}
    const mgCI=blocks.find(b=>b.id==="mg_checkin")?.duration||30;
    t.mg_checkin={s:mgTime-mgCI,e:mgTime};t.mg={s:mgTime,e:mgTime+(blocks.find(b=>b.id==="mg")?.duration||120)};
    const eD=blocks.find(b=>b.id==="doors_early")?.duration||30;
    t.doors_early={s:doors-eD,e:doors};t.doors_ga={s:doors,e:doors};
    const sh=blocks.filter(b=>b.phase==="show");c=doors+60;
    for(const b of sh){t[b.id]={s:c,e:c+b.duration};c+=b.duration;}
    const hE=t.bbno_set?.e||curfew;t.curfew={s:curfew,e:curfew};
    const post=blocks.filter(b=>b.phase==="post");c=curfew;
    for(const b of post){if(b.anchorKey==="busDepart"){const bt=effShow.busDepart??busCalTimes.busDepartEff;if(bt!=null){t[b.id]={s:bt,e:bt};}else{t[b.id]={s:c,e:c};}continue;}if(b.offsetRef==="bbno_set_end"){t[b.id]={s:hE+(b.offsetMin||0),e:hE+(b.offsetMin||0)+b.duration};continue;}t[b.id]={s:c,e:c+b.duration};c+=b.duration;}
    return t;
  },[effShow,blocks,busCalTimes]);

  const setDur=(id,dur)=>uRos(rosKey,blocks.map(b=>b.id===id?{...b,duration:Math.max(0,dur)}:b));
  const setBF=(id,field,val)=>uRos(rosKey,blocks.map(b=>b.id===id?{...b,[field]:val}:b));
  const addBlock=phase=>{const nb={id:`custom_${Date.now()}`,label:"New Block",duration:30,phase,type:"custom",color:T.accent,roles:["tm_td"]};const idx=blocks.map((b,i)=>b.phase===phase?i:-1).filter(i=>i>=0).pop();const next=[...blocks];if(idx==null)next.push(nb);else next.splice(idx+1,0,nb);uRos(rosKey,next);setEditB(nb.id);};
  const removeBlock=id=>{uRos(rosKey,blocks.filter(b=>b.id!==id));setEditB(null);};
  const startResize=(b,edge,e)=>{
    e.stopPropagation();e.preventDefault();
    const startY=e.clientY,origDur=b.duration,idx=blocks.findIndex(x=>x.id===b.id);
    const prev=[...blocks].slice(0,idx).reverse().find(x=>!x.isAnchor&&x.phase===b.phase&&x.duration>0);
    const origPrev=prev?.duration||0,pxPerMin=0.8;
    const onMove=ev=>{
      const dMin=Math.round(((ev.clientY-startY)/pxPerMin)/5)*5;
      if(edge==="bottom"){
        const nd=Math.max(0,origDur+dMin);
        uRos(rosKey,blocks.map(x=>x.id===b.id?{...x,duration:nd}:x));
      }else if(prev){
        const nd=Math.max(0,origDur-dMin),np=Math.max(0,origPrev+dMin);
        uRos(rosKey,blocks.map(x=>x.id===b.id?{...x,duration:nd}:x.id===prev.id?{...x,duration:np}:x));
      }
    };
    const onUp=()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
  };
  const reorder=(fid,tid)=>{const fi=blocks.findIndex(b=>b.id===fid),ti=blocks.findIndex(b=>b.id===tid);if(fi<0||ti<0||blocks[fi].phase!==blocks[ti].phase||blocks[fi].isAnchor||blocks[ti].isAnchor)return;const n=[...blocks];const[m]=n.splice(fi,1);n.splice(ti,0,m);const ciI=n.findIndex(b=>b.id==="mg_checkin"),mgI=n.findIndex(b=>b.id==="mg");if(ciI>=0&&mgI>=0&&ciI>mgI){const[ci]=n.splice(ciI,1);n.splice(mgI,0,ci);}uRos(rosKey,n);};
  // uEffShow: writes anchor times to the correct target (main show or sub-event)
  const uEffShow=(patch)=>{
    if(!subEvent){uShow(sel,patch);}
    else{uShow(sel,{subEvents:(show.subEvents||[]).map(e=>e.id===selEventId?{...e,...patch}:e)});}
  };
  const setAnc=(key,str)=>{const m=pM(str);if(m===null)return;uEffShow({[key]:m,[key+"Confirmed"]:true});};

  const AMAP={busArrive:"Bus Arrival",busDepart:"Bus Depart",venueAccess:"Venue Access",crewCall:"Crew Call",mgTime:"M&G",doors:"Doors",curfew:"Curfew"};
  const isCustom=!subEvent&&!!CUSTOM_ROS_MAP[sel];

  const isNonShowDay=(show.type==="off"||show.type==="travel")&&!subEvent;

  const busForItem=id=>id==="bus_arrive"?busCalTimes.arriveBus:id==="bus_depart"?busCalTimes.departBus:null;
  const renderBusDetail=(entry,label)=>{
    if(!entry)return null;
    return<BusDriveSessionTable entry={entry} label={label}/>;
  };

  const renderB=b=>{
    let t=times[b.id];if(!t)return null;
    if(b.anchorStartAt!=null||b.anchorEndAt!=null)t={s:b.anchorStartAt!=null?b.anchorStartAt:t.s,e:b.anchorEndAt!=null?b.anchorEndAt:t.e};
    const isA=b.isAnchor,isE=editB===b.id,isDT=dOver===b.id;
    const canD=!isA&&b.id!=="doors_early"&&b.id!=="mg_checkin";
    const canE=b.id!=="mg_checkin"&&b.id!=="doors_early";
    const cK=b.anchorKey?b.anchorKey+"Confirmed":null;const isC=cK?effShow[cK]:false;
    return(
      <React.Fragment key={b.id}>
      <div draggable={canD}
        onDragStart={e=>{dId.current=b.id;e.dataTransfer.effectAllowed="move";}}
        onDragOver={e=>{e.preventDefault();if(dId.current&&dId.current!==b.id)setDOver(b.id);}}
        onDrop={e=>{e.preventDefault();if(dId.current&&dId.current!==b.id)reorder(dId.current,b.id);dId.current=null;setDOver(null);}}
        onDragEnd={()=>{dId.current=null;setDOver(null);}}
        onClick={()=>canE&&setEditB(isE?null:b.id)} className="br"
        style={{position:"relative",display:"flex",alignItems:"center",gap:8,padding:isA?"10px 14px":"7px 14px",background:isDT?"var(--accent-pill-bg)":"var(--card)",border:isA?`2px solid ${b.color}50`:isE?`1px solid ${b.color}`:"1px solid var(--border)",borderRadius:isA?12:8,cursor:canD?"grab":canE?"pointer":"default",transition:"border .12s ease,background .12s ease",boxShadow:isA?"0 2px 6px rgba(0,0,0,.06)":"none",minHeight:isA?undefined:Math.max(32,Math.min(180,b.duration*0.8))}}>
        {!isA&&b.duration>0&&<div onMouseDown={e=>startResize(b,"top",e)} title="Drag to shift start" style={{position:"absolute",top:-3,left:8,right:8,height:6,cursor:"ns-resize",zIndex:2}}/>}
        {!isA&&b.duration>0&&<div onMouseDown={e=>startResize(b,"bottom",e)} title="Drag to change duration" style={{position:"absolute",bottom:-3,left:8,right:8,height:6,cursor:"ns-resize",zIndex:2}}/>}
        {canD?<div style={{color:T.textMute,fontSize:13,cursor:"grab",userSelect:"none",width:16,flexShrink:0,textAlign:"center"}}>⋮⋮</div>:<div style={{width:16,flexShrink:0}}/>}
        <div style={{width:54,fontFamily:MN,fontSize:11,color:isA?b.color:T.text2,fontWeight:isA?800:500,textAlign:"right",flexShrink:0}}>{fmt(t.s)}</div>
        <div style={{width:4,height:isA?28:20,background:b.color,borderRadius:4,flexShrink:0,opacity:isA?1:.5}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:isA?13:12,fontWeight:isA?800:600,color:isA?b.color:T.text,display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
            {b.label}
            {isA&&cK&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:4,fontWeight:800,background:isC?"var(--success-bg)":"var(--warn-bg)",color:isC?"var(--success-fg)":"var(--warn-fg)"}}>{isC?"CONFIRMED":"UNCONFIRMED"}</span>}
            {b.id==="curfew"&&sel==="2026-04-16"&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:4,fontWeight:800,background:"var(--danger-bg)",color:"var(--danger-fg)"}}>HARD</span>}
            {b.id==="bus_arrive"&&effShow.busArrivePrevDay&&<span title={`Bus parks at venue ${(()=>{const d=new Date(sel+"T12:00:00");d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);})()}`} style={{fontSize:8,padding:"2px 6px",borderRadius:4,fontWeight:800,background:"var(--info-bg)",color:"var(--info-fg)"}}>PREV DAY</span>}
          </div>
          {b.note&&<div style={{fontSize:9,color:T.textDim,marginTop:1}}>{b.note}</div>}
        </div>
        {b.duration>0&&!isA&&b.id!=="mg_checkin"&&<div style={{fontFamily:MN,fontSize:10,color:T.text2,background:"var(--card-3)",padding:"3px 7px",borderRadius:4,flexShrink:0,border:"1px solid var(--border)",fontWeight:600}}>{`${b.duration}m`}</div>}
        {b.duration>0&&<div style={{width:46,fontFamily:MN,fontSize:9,color:T.textMute,textAlign:"right",flexShrink:0}}>{fmt(t.e)}</div>}
        {cK&&<button onClick={e=>{e.stopPropagation();uEffShow({[cK]:!isC});}} title={isC?"Confirmed":"Mark confirmed"} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:isC?"var(--success-fg)":"var(--text-faint)",padding:"2px 4px",flexShrink:0}}>{isC?"✓":"○"}</button>}
        {b.type==="bus"&&busForItem(b.id)&&(()=>{const hasDet=busForItem(b.id);const isOpen=busDetailExp[b.id];return hasDet&&(hasDet.note||hasDet.stops)?<button onClick={e=>{e.stopPropagation();setBusDetailExp(p=>({...p,[b.id]:!p[b.id]}));}} title="Drive session details" style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:isOpen?"var(--info-fg)":T.textMute,padding:"2px 4px",flexShrink:0,fontWeight:700}}>{isOpen?"▴":"▾"}</button>:null;})()}
        {canE&&<button onClick={e=>{e.stopPropagation();setEditB(isE?null:b.id);}} title="Edit" style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:isE?"var(--text)":"var(--text-mute)",padding:"2px 6px",flexShrink:0,fontWeight:700,letterSpacing:1}}>{isE?"×":"⋯"}</button>}
      </div>
      {b.type==="bus"&&busDetailExp[b.id]&&renderBusDetail(busForItem(b.id),b.id==="bus_arrive"?"ARRIVING LEG — DRIVE SESSION":"DEPARTING LEG — DRIVE SESSION")}
      {isE&&canE&&(
        <div style={{...UI.expandPanel,borderLeftColor:b.color,marginTop:-2,marginBottom:4,borderRadius:"0 0 8px 8px"}} onClick={e=>e.stopPropagation()}>
          {isA&&b.anchorKey?(
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <label style={{fontSize:9,fontWeight:700,color:T.textDim}}>{AMAP[b.anchorKey]} TIME</label>
              <input type="text" placeholder="7:00p" defaultValue={fmt(effShow[b.anchorKey])} onKeyDown={e=>{if(e.key==="Enter"){setAnc(b.anchorKey,e.target.value);setEditB(null);}if(e.key==="Escape")setEditB(null);}} onBlur={e=>setAnc(b.anchorKey,e.target.value)} style={{...UI.input,fontFamily:MN,width:80,fontWeight:700}}/>
              <button onClick={()=>uEffShow({[b.anchorKey+"Confirmed"]:!isC})} style={UI.expandBtn(false,isC?"var(--success-fg)":"var(--warn-fg)")}>{isC?"✓ Confirmed":"Mark Confirmed"}</button>
              {b.anchorKey==="busArrive"&&<label style={{fontSize:9,fontWeight:700,color:"var(--info-fg)",display:"flex",alignItems:"center",gap:4,cursor:"pointer",background:"var(--info-bg)",padding:"2px 7px",borderRadius:4,border:"1px solid var(--info-bg)"}}><input type="checkbox" checked={!!effShow.busArrivePrevDay} onChange={e=>uEffShow({busArrivePrevDay:e.target.checked})}/>Arrives day before</label>}
              {b.anchorKey==="busArrive"&&busCalTimes.busArriveEff!=null&&<span style={{fontSize:9,color:"var(--info-fg)",fontWeight:700,background:"var(--info-bg)",padding:"2px 7px",borderRadius:4}}>{`from tour calendar · ${fmt(busCalTimes.busArriveEff)}`}{busCalTimes.busArriveRoute?` · ${busCalTimes.busArriveRoute}`:""}</span>}
              {b.anchorKey==="busDepart"&&busCalTimes.busDepartEff!=null&&<span style={{fontSize:9,color:"var(--info-fg)",fontWeight:700,background:"var(--info-bg)",padding:"2px 7px",borderRadius:4}}>{`from tour calendar · ${fmt(busCalTimes.busDepartEff)}`}{busCalTimes.busDepartRoute?` · ${busCalTimes.busDepartRoute}`:""}</span>}
              <label style={{fontSize:9,fontWeight:700,color:T.textDim,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}><input type="checkbox" checked={!!b.isAnchor} onChange={e=>setBF(b.id,"isAnchor",e.target.checked)}/>Anchor</label>
              <button onClick={()=>removeBlock(b.id)} style={{marginLeft:"auto",background:"none",border:"none",color:"var(--danger-fg)",fontSize:10,cursor:"pointer",fontWeight:700}}>Remove block</button>
              {b.isAnchor&&<AnchorTimes b={b} setBF={setBF}/>}
              <span style={{flexBasis:"100%",fontSize:9,color:T.textMute}}>Enter = save · Esc = close</span>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr",gap:8,alignItems:"center"}}>
              <div>
                <div style={{fontSize:8,color:T.textDim,fontWeight:700,marginBottom:2}}>DURATION</div>
                <input type="number" min="0" max="480" step="5" value={b.duration} onChange={e=>setDur(b.id,parseInt(e.target.value)||0)} style={{...UI.input,fontFamily:MN,width:70,textAlign:"center"}}/>
              </div>
              <div>
                <div style={{fontSize:8,color:T.textDim,fontWeight:700,marginBottom:2}}>LABEL</div>
                <input type="text" value={b.label} onChange={e=>setBF(b.id,"label",e.target.value)} style={{...UI.input,width:"100%"}}/>
              </div>
              <div>
                <div style={{fontSize:8,color:T.textDim,fontWeight:700,marginBottom:2}}>NOTE</div>
                <input type="text" value={b.note||""} onChange={e=>setBF(b.id,"note",e.target.value)} placeholder="Optional note" style={{...UI.input,width:"100%"}}/>
              </div>
              <div style={{gridColumn:"1 / -1",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <label style={{fontSize:9,fontWeight:700,color:T.textDim,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}><input type="checkbox" checked={!!b.isAnchor} onChange={e=>setBF(b.id,"isAnchor",e.target.checked)}/>Anchor</label>
                <AnchorTimes b={b} setBF={setBF}/>
                <button onClick={()=>removeBlock(b.id)} style={{marginLeft:"auto",background:"none",border:"none",color:"var(--danger-fg)",fontSize:10,cursor:"pointer",fontWeight:700}}>Remove block</button>
              </div>
            </div>
          )}
        </div>
      )}
      </React.Fragment>
    );
  };

  const phases=[{k:"bus_in",l:"BUS ARRIVAL",s:"Anchor",pc:"var(--link)"},{k:"pre",l:"PRE-SHOW",s:"Forward from Crew Call",pc:"var(--warn-fg)"},{k:"mg",l:"MEET & GREET",s:"Anchor",pc:"var(--accent)"},{k:"doors",l:"DOORS",s:"Contract anchor",pc:"var(--success-fg)"},{k:"show",l:"SHOW",s:"Doors +60min",pc:"var(--danger-fg)"},{k:"curfew",l:"CURFEW",s:sel==="2026-04-16"?"HARD":"Contract anchor",pc:"var(--text-dim)"},{k:"post",l:"POST-SHOW",s:"Relative to set end",pc:"var(--info-fg)"}];

  const transit=useMemo(()=>{
    const segs=Object.values(flights||{}).filter(f=>f&&f.status!=="dismissed"&&["air","ground","bus","rail"].includes(f.type||"air")&&(f.depDate===sel||f.arrDate===sel));
    const rows=[];
    segs.forEach(s=>{
      const t=s.type||"air";
      // departures from this date
      if(s.depDate===sel&&s.dep){
        const m=pM(s.dep);if(m!=null)rows.push({id:`${s.id}__dep`,seg:s,kind:t,role:"dep",start:m,end:hhmmToMin(s.arr)??m,from:s.fromCity||s.from,to:s.toCity||s.to,label:t==="air"?(s.flightNo||s.carrier||"Flight"):t==="ground"?(s.mode||s.provider||"Ground"):t==="bus"?(s.carrier||"Bus"):(s.trainNo||s.carrier||"Rail")});
      }
      // arrivals on this date (different day from departure)
      if(s.arrDate===sel&&s.arrDate!==s.depDate&&s.arr){
        const m=pM(s.arr);if(m!=null)rows.push({id:`${s.id}__arr`,seg:s,kind:t,role:"arr",start:m,end:m,from:s.fromCity||s.from,to:s.toCity||s.to,label:t==="air"?(s.flightNo||s.carrier||"Flight"):t==="ground"?(s.mode||s.provider||"Ground"):t==="bus"?(s.carrier||"Bus"):(s.trainNo||s.carrier||"Rail")});
      }
    });
    rows.sort((a,b)=>a.start-b.start);
    return rows;
  },[flights,sel]);

  const showStart=times.crew_call?.s??times.bus_arrive?.s??(effShow.crewCall||0);
  const showEnd=times.curfew?.e??(effShow.curfew||0);
  const transitArr=transit.filter(r=>r.start<showStart||r.role==="arr");
  const transitDep=transit.filter(r=>!(r.start<showStart||r.role==="arr"));

  const renderTransit=r=>{
    const meta=SEG_META[r.kind]||SEG_META.air;
    const dur=Math.max(0,(r.end||r.start)-r.start);
    return(
      <div key={r.id} onClick={()=>setTab("transport")} className="br" style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",background:"var(--card)",border:`1px solid ${meta.color}30`,borderRadius:8,borderLeft:`3px solid ${meta.color}`,cursor:"pointer"}}>
        <div style={{width:16,flexShrink:0,textAlign:"center",fontSize:13}}>{meta.icon}</div>
        <div style={{width:54,fontFamily:MN,fontSize:11,color:meta.color,fontWeight:700,textAlign:"right",flexShrink:0}}>{fmt(r.start)}</div>
        <div style={{width:4,height:20,background:meta.color,borderRadius:4,flexShrink:0,opacity:0.5}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:600,color:T.text,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span>{r.label}</span>
            <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:meta.bg,color:meta.color,fontWeight:800,letterSpacing:"0.04em"}}>{meta.label.toUpperCase()}</span>
            {r.role==="arr"&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--success-bg)",color:T.successFg,fontWeight:800}}>ARR</span>}
            {r.role==="dep"&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--info-bg)",color:T.link,fontWeight:800}}>DEP</span>}
            {r.seg?.status==="confirmed"&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--success-bg)",color:T.successFg,fontWeight:800}}>✓</span>}
          </div>
          {(r.from||r.to)&&<div style={{fontSize:9,color:T.textDim,marginTop:1,fontFamily:MN}}>{r.from||"—"} → {r.to||"—"}</div>}
        </div>
        {dur>0&&<div style={{fontFamily:MN,fontSize:10,color:T.text2,background:"var(--card-3)",padding:"3px 7px",borderRadius:4,flexShrink:0,border:"1px solid var(--border)",fontWeight:600}}>{`${dur}m`}</div>}
        {r.end>r.start&&<div style={{width:46,fontFamily:MN,fontSize:9,color:T.textMute,textAlign:"right",flexShrink:0}}>{fmt(r.end)}</div>}
      </div>
    );
  };
  const transitHeader=(label,count)=>(
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0 3px"}}>
      <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.1em",color:"var(--link)"}}>{label}</div>
      <div style={{flex:1,height:1,background:"var(--border)"}}/>
      <button onClick={()=>setTab("transport")} title="Manage in Logistics" style={{fontSize:8,color:T.textDim,background:"none",border:"1px dashed var(--text-faint)",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontWeight:700}}>Logistics ↗</button>
      <div style={{fontSize:8,color:T.textMute,fontStyle:"italic"}}>{count} segment{count===1?"":"s"}</div>
    </div>
  );

  return(
    <div className="fi" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 115px)"}}>
      {isNonShowDay&&<DayScheduleView show={show} bus={BUS_DATA_MAP[sel]||null} split={currentSplit||null} sel={sel}/>}
      {!isNonShowDay&&<><div style={{padding:"6px 20px",borderBottom:"1px solid var(--border)",background:"var(--card)",display:"flex",gap:10,flexWrap:"wrap",fontSize:11,flexShrink:0,alignItems:"center"}}>
        <span style={{fontWeight:700}}>{effShow.venue}</span><span style={{color:T.text2,fontSize:10}}>{effShow.promoter}</span>
        {isCustom&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:"var(--accent-pill-bg)",color:T.accent,fontWeight:700}}>Custom ROS</span>}
        {subEvent&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:"var(--accent-pill-bg)",color:T.accent,fontWeight:700}}>{subEvent.name}</span>}
        {effShow.notes&&<span style={{color:T.warnFg,fontWeight:600,fontSize:9}}>{effShow.notes}</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <button onClick={()=>uEffShow({busSkip:!effShow.busSkip,busPre:false})} title="Toggle Bus Arrival" style={{background:effShow.busSkip?"var(--card-3)":"var(--info-bg)",border:`1px solid ${effShow.busSkip?"var(--border)":"var(--link)"}`,borderRadius:6,color:effShow.busSkip?"var(--text-mute)":"var(--link)",fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:700}}>{effShow.busSkip?"+ Bus":"✓ Bus"}</button>
          {!effShow.busSkip&&<button onClick={()=>uEffShow({busPre:!effShow.busPre})} title="Bus arrived before show day" style={{background:effShow.busPre?"var(--info-bg)":"var(--card-3)",border:`1px solid ${effShow.busPre?"var(--link)":"var(--border)"}`,borderRadius:6,color:effShow.busPre?"var(--link)":"var(--text-mute)",fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:700}}>Pre-day</button>}
          <button onClick={()=>uEffShow({mgSkip:!effShow.mgSkip})} title="Toggle Meet & Greet" style={{background:effShow.mgSkip?"var(--card-3)":"var(--success-bg)",border:`1px solid ${effShow.mgSkip?"var(--border)":"var(--success-fg)"}`,borderRadius:6,color:effShow.mgSkip?"var(--text-mute)":"var(--success-fg)",fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:700}}>{effShow.mgSkip?"+ M&G":"✓ M&G"}</button>
          <button onClick={()=>{uRos(rosKey,null);setEditB(null);}} style={{background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:T.textDim,fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:600}}>Reset</button>
          <button onClick={()=>{setEditVenue(effShow.venue||"");setEditCity(effShow.city||"");setEditPromoter(effShow.promoter||"");setEditShow(v=>!v);}} style={{background:editShow?"var(--accent-pill-bg)":"var(--card-3)",border:`1px solid ${editShow?"var(--accent)":"var(--border)"}`,borderRadius:6,color:editShow?"var(--accent)":"var(--text-dim)",fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:600}}>✏ Edit</button>
        </div>
      </div>
      {editShow&&<div style={{padding:"8px 20px",background:"var(--card-3)",borderBottom:"1px solid var(--border)",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",flexShrink:0}}>
        <input value={editVenue} onChange={e=>setEditVenue(e.target.value)} placeholder="Venue" style={{...UI.input,fontSize:10,minWidth:120,flex:2}}/>
        <input value={editCity} onChange={e=>setEditCity(e.target.value)} placeholder="City" style={{...UI.input,fontSize:10,minWidth:90,flex:1}}/>
        <input value={editPromoter} onChange={e=>setEditPromoter(e.target.value)} placeholder="Promoter" style={{...UI.input,fontSize:10,minWidth:110,flex:2}}/>
        <button onClick={()=>{uEffShow({venue:editVenue,city:editCity,promoter:editPromoter});setEditShow(false);}} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",background:"var(--success-fg)",color:"#fff",cursor:"pointer",fontWeight:700,flexShrink:0}}>Save</button>
        <button onClick={()=>setEditShow(false)} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer",flexShrink:0}}>Cancel</button>
      </div>}
      <div style={{padding:"10px 20px 30px",background:"var(--bg)",flex:1,overflowY:"auto"}}>
        <FlightDayStrip sel={sel}/>
        {transitArr.length>0&&<div style={{marginBottom:6}}>{transitHeader("ARRIVALS / INBOUND TRANSIT",transitArr.length)}<div style={{display:"flex",flexDirection:"column",gap:3}}>{transitArr.map(renderTransit)}</div></div>}
        {phases.filter(ph=>!(ph.k==="mg"&&effShow.mgSkip)&&!(ph.k==="bus_in"&&(effShow.busSkip||effShow.busPre))).map(ph=>{const pb=blocks.filter(b=>ph.k==="bus_in"?b.phase==="bus_in":ph.k==="curfew"?b.id==="curfew":ph.k==="doors"?b.phase==="doors":ph.k==="mg"?b.phase==="mg":b.phase===ph.k);const canAdd=!["bus_in","curfew","doors","mg"].includes(ph.k);
          return(<div key={ph.k} style={{marginBottom:6}}><div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0 3px"}}><div style={{fontSize:9,fontWeight:800,letterSpacing:"0.1em",color:ph.pc||"var(--text-dim)"}}>{ph.l}</div><div style={{flex:1,height:1,background:"var(--border)"}}/><div style={{fontSize:8,color:T.textMute,fontStyle:"italic"}}>{ph.s}</div>{canAdd&&<button onClick={()=>addBlock(ph.k)} title="Add block" style={{background:"none",border:"1px dashed var(--text-faint)",borderRadius:6,color:T.textDim,fontSize:9,padding:"2px 8px",cursor:"pointer",fontWeight:700}}>+ Block</button>}</div><div style={{display:"flex",flexDirection:"column",gap:3}}>{pb.map(b=>renderB(b))}</div>{!pb.length&&canAdd&&<div style={{fontSize:9,color:T.textMute,fontStyle:"italic",padding:"4px 0"}}>No blocks — click + Block to add.</div>}</div>);
        })}
        {transitDep.length>0&&<div style={{marginBottom:6}}>{transitHeader("DEPARTURES / OUTBOUND TRANSIT",transitDep.length)}<div style={{display:"flex",flexDirection:"column",gap:3}}>{transitDep.map(renderTransit)}</div></div>}
        <div style={{marginTop:12,padding:"12px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,display:"flex",gap:12,flexWrap:"wrap"}}>
          {[...(effShow.busSkip?[]:[{l:effShow.busPre?"Bus":"Bus ETA",v:effShow.busPre?"On-site (prev)":fmt(effShow.busArrive),c:"var(--link)"}]),{l:"Crew Call",v:fmt(effShow.crewCall),c:"var(--warn-fg)"},{l:"M&G",v:fmt(effShow.mgTime),c:"var(--success-fg)",hide:effShow.mgSkip},{l:"Doors",v:fmt(effShow.doors),c:"var(--success-fg)"},{l:"Headline",v:times.bbno_set?`${fmt(times.bbno_set.s)}–${fmt(times.bbno_set.e)}`:"--",c:"var(--danger-fg)"},{l:"Settlement",v:times.settlement?fmt(times.settlement.s):"--",c:"var(--warn-fg)"},{l:"Curfew",v:fmt(effShow.curfew),c:"var(--danger-fg)"},{l:"Bus Out",v:times.bus_depart?fmt(times.bus_depart.s):"--",c:"var(--link)",hide:effShow.busSkip}].filter(s=>!s.hide).map((s,i)=><div key={i}><div style={{fontSize:8,color:T.textDim,marginBottom:1,fontWeight:600}}>{s.l}</div><div style={{fontFamily:MN,fontSize:11,color:s.c,fontWeight:800}}>{s.v}</div></div>)}
        </div>
      </div>
      </>}
    </div>
  );
}
