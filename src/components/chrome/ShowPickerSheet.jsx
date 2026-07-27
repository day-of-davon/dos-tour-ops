import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { fD } from "../../lib/time";
import { T } from "../../styles/tokens";

export function ShowPickerSheet(){
  const{showPickerOpen,setShowPickerOpen,sel,setSel,shows,sorted,tourDaysSorted,showOffDays,aC,mobile,tab,setTab,allShows,setAllShows}=useContext(Ctx);
  const[q,setQ]=useState("");
  const inputRef=useRef(null);
  useEffect(()=>{if(showPickerOpen)setTimeout(()=>inputRef.current?.focus(),80);},[showPickerOpen]);
  useEffect(()=>{const fn=e=>{if(e.key==="Escape")setShowPickerOpen(false);};document.addEventListener("keydown",fn);return()=>document.removeEventListener("keydown",fn);},[]);
  const rows=useMemo(()=>{
    const tourIds=new Set((tourDaysSorted||[]).map(d=>d.date));
    const extras=(sorted||[]).filter(s=>s.clientId===aC&&!tourIds.has(s.date)).map(s=>({date:s.date,type:s.type||"show",city:s.city}));
    const all=[...(tourDaysSorted||[]),...extras].sort((a,b)=>a.date.localeCompare(b.date));
    return(showOffDays?all:all.filter(d=>d.type!=="off"&&d.type!=="travel")).filter(d=>{
      if(!q)return true;
      const s=shows[d.date];
      const city=(s?.city||d.city||"").toLowerCase();
      const dt=fD(d.date).toLowerCase();
      return city.includes(q.toLowerCase())||dt.includes(q.toLowerCase());
    });
  },[tourDaysSorted,sorted,showOffDays,aC,q]);
  const grouped=useMemo(()=>{
    const m={};
    rows.forEach(d=>{
      const mo=new Date(d.date+"T12:00:00").toLocaleString("en-US",{month:"long",year:"numeric"});
      if(!m[mo])m[mo]=[];
      m[mo].push(d);
    });
    return Object.entries(m);
  },[rows]);
  const pick=(date)=>{setSel(date);setAllShows(false);if(tab==="dash"||allShows)setTab("ros");setShowPickerOpen(false);};
  if(!showPickerOpen)return null;
  const sheetH=mobile?"72vh":"56vh";
  return(
    <>
      <div onClick={()=>setShowPickerOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:88,animation:"fadeIn 200ms ease"}}/>
      <div style={{position:"fixed",bottom:0,left:0,right:0,height:sheetH,background:"var(--card)",borderRadius:"16px 16px 0 0",borderTop:"1px solid var(--border)",zIndex:89,display:"flex",flexDirection:"column",animation:"slideUp 240ms cubic-bezier(0.32,0,0.67,0)"}}>
        <div style={{width:36,height:4,borderRadius:2,background:"var(--border)",margin:"10px auto 0",flexShrink:0}}/>
        <div style={{padding:"8px 14px 6px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search shows…" style={{flex:1,fontSize:11,padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text,fontFamily:"'Outfit',system-ui",outline:"none"}}/>
          <button onClick={()=>setShowPickerOpen(false)} style={{background:"none",border:"none",color:T.textDim,cursor:"pointer",fontSize:16,padding:"0 4px",lineHeight:1}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"4px 0 20px"}}>
          {grouped.map(([mo,dates])=>(
            <div key={mo}>
              <div style={{fontSize:8,fontWeight:700,color:T.textFaint,letterSpacing:"0.08em",textTransform:"uppercase",padding:"10px 14px 4px"}}>{mo}</div>
              {dates.map(d=>{
                const s=shows[d.date];
                const isSel=d.date===sel;
                const isShow=d.type==="show"||!!s;
                const label=isShow?(s?.city||"Show"):d.type==="travel"?"Travel":"Off Day";
                const dotBg=isSel?"var(--accent)":isShow?"var(--success-fg)":d.type==="travel"?"var(--link)":"var(--text-faint)";
                return(
                  <div key={d.date} onClick={()=>pick(d.date)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",cursor:"pointer",background:isSel?"var(--accent-pill-bg)":"transparent",transition:"background 80ms ease"}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:dotBg,flexShrink:0}}/>
                    <span style={{fontSize:11,fontWeight:isSel?700:500,color:isSel?T.accentSoft:T.text,flex:1}}>{label}</span>
                    <span style={{fontSize:10,color:T.textDim,fontFamily:MN,fontWeight:600}}>{fD(d.date)}</span>
                  </div>
                );
              })}
            </div>
          ))}
          {grouped.length===0&&<div style={{padding:"24px 14px",fontSize:11,color:T.textMute,textAlign:"center"}}>No shows match "{q}"</div>}
        </div>
      </div>
    </>
  );
}
