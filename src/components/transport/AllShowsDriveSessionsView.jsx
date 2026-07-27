import { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { computeDriveFlags } from "../../lib/intel";
import { BUS_DATA } from "../../lib/tour-data";
import { T } from "../../styles/tokens";
import { BusDriveSessionTable } from "./BusDriveSessionTable";
import { DriveFlagChips } from "./DriveFlagChips";

export function AllShowsDriveSessionsView(){
  const{busEdits,setSel,setAllShows,setTransView}=useContext(Ctx);
  const[filter,setFilter]=useState("all");
  const days=useMemo(()=>BUS_DATA.map(d=>{
    const base=new Date('2026-05-02T12:00:00');base.setDate(base.getDate()+d.day-1);
    const iso=base.toISOString().slice(0,10);
    const merged={...d,...(busEdits?.[iso]||{})};
    return{iso,entry:merged,flags:computeDriveFlags(merged)};
  }).filter(x=>x.entry.km>0),[busEdits]);
  const filtered=useMemo(()=>{
    if(filter==="all")return days;
    return days.filter(d=>{
      const ids=d.flags.map(f=>f.id);
      if(filter==="flagged")return d.flags.some(f=>f.sev==="danger"||f.sev==="warn");
      if(filter==="long")return ids.includes("drv")&&d.flags.some(f=>f.id==="drv"&&(f.sev==="warn"||f.sev==="danger"));
      if(filter==="ferry")return ids.includes("fy");
      if(filter==="sda")return ids.includes("sd");
      if(filter==="dd")return ids.includes("dd");
      return true;
    });
  },[days,filter]);
  const totalKm=filtered.reduce((s,d)=>s+(parseFloat(d.entry.km)||0),0);
  const totalDriveH=filtered.reduce((s,d)=>{const h=parseFloat(String(d.entry.drive||"").replace(/[^0-9.]/g,""));return s+(isNaN(h)?0:h);},0);
  const filters=[["all",`All (${days.length})`],["flagged","Flagged"],["long","Long drives"],["dd","DD required"],["ferry","Ferry"],["sda","Show-day arr"]];
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",padding:"8px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:8}}>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {filters.map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)} style={{fontSize:9,padding:"3px 10px",borderRadius:99,border:`1px solid ${filter===v?"var(--accent)":"var(--border)"}`,background:filter===v?"var(--accent-pill-bg)":"var(--card-2)",color:filter===v?T.accent:T.textDim,cursor:"pointer",fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase"}}>{l}</button>
          ))}
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:10,fontSize:9,fontFamily:MN,color:T.textDim}}>
          <span><span style={{fontWeight:800,color:T.text2}}>{filtered.length}</span> drive day{filtered.length===1?"":"s"}</span>
          <span><span style={{fontWeight:800,color:T.text2}}>{totalKm.toLocaleString()}</span> km</span>
          <span><span style={{fontWeight:800,color:T.text2}}>{totalDriveH.toFixed(1)}</span> h drive</span>
        </div>
      </div>
      {filtered.length===0&&<div style={{padding:"40px 20px",textAlign:"center",color:T.textMute,fontSize:11,fontStyle:"italic"}}>No drive days match this filter.</div>}
      {filtered.map(({iso,entry,flags})=>(
        <div key={iso} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",display:"flex",alignItems:"flex-start",gap:12,flexWrap:"wrap",borderBottom:flags.length>0||entry.note||entry.sessions?"1px solid var(--card-2)":"none"}}>
            <div style={{minWidth:0,flex:"1 1 220px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                <span style={{fontSize:8,fontWeight:800,color:T.textDim,fontFamily:MN,letterSpacing:"0.08em"}}>EU{String(entry.day).padStart(2,"0")}</span>
                <span style={{fontSize:8,fontWeight:800,padding:"1px 7px",borderRadius:99,background:entry.show?"var(--success-bg)":"var(--info-bg)",color:entry.show?"var(--success-fg)":"var(--info-fg)",letterSpacing:"0.06em"}}>{entry.show?"SHOW":"TRAVEL"}</span>
                <span style={{fontSize:9,color:T.textDim,fontFamily:MN}}>{entry.date} · {entry.dow}</span>
              </div>
              <div style={{fontSize:13,fontWeight:800,color:T.text,letterSpacing:"-0.01em"}}>{entry.route}</div>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
              {entry.dep&&entry.dep!=="—"&&<span style={{fontSize:9,fontFamily:MN,color:T.textDim}}>↑ {entry.dep}</span>}
              {entry.arr&&entry.arr!=="—"&&<span style={{fontSize:9,fontFamily:MN,color:T.textDim}}>↓ {entry.arr}</span>}
              {entry.km>0&&<span style={{fontSize:9,fontFamily:MN,fontWeight:700,color:T.text2,padding:"2px 8px",borderRadius:99,background:"var(--card-2)",border:"1px solid var(--border)"}}>{entry.km} km</span>}
              {entry.drive&&entry.drive!=="—"&&<span style={{fontSize:9,fontFamily:MN,fontWeight:700,color:entry.flag==="⚠"?"var(--danger-fg)":T.text2,padding:"2px 8px",borderRadius:99,background:entry.flag==="⚠"?"var(--danger-bg)":"var(--card-2)",border:`1px solid ${entry.flag==="⚠"?"var(--danger-fg)":"var(--border)"}`}}>{entry.drive}</span>}
              <button onClick={()=>{setAllShows(false);setSel(iso);setTransView("drive");}} title="Open this day's drive sessions" style={{fontSize:9,padding:"3px 10px",borderRadius:5,border:"1px solid var(--accent-pill-border)",background:"var(--accent-pill-bg)",color:T.accent,cursor:"pointer",fontWeight:700,fontFamily:MN}}>Open →</button>
            </div>
          </div>
          {flags.length>0&&<div style={{padding:"8px 14px",background:"var(--card-2)",borderBottom:entry.note||entry.sessions?"1px solid var(--card-2)":"none"}}>
            <DriveFlagChips entry={entry}/>
          </div>}
          <BusDriveSessionTable entry={entry} label={null} compact/>
        </div>
      ))}
    </div>
  );
}
