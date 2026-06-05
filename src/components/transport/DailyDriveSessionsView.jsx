import { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { computeDriveFlags } from "../../lib/intel";
import { parseDriveSessions } from "../../lib/ros-data";
import { fD, fFull } from "../../lib/time";
import { BUS_DATA, BUS_DATA_MAP } from "../../lib/tour-data";
import { T } from "../../styles/tokens";
import { BusDriveSessionTable } from "./BusDriveSessionTable";
import { DriveFlagChips } from "./DriveFlagChips";
import { DriveSessionEditor } from "./DriveSessionEditor";

export function DailyDriveSessionsView(){
  const{sel,busEdits,uBusEdit,setSel,setDateMenu}=useContext(Ctx);
  const busDay=useMemo(()=>{const base=BUS_DATA_MAP[sel];if(!base)return null;return{...base,...(busEdits?.[sel]||{})};},[sel,busEdits]);
  const[edit,setEdit]=useState(false);
  const driveDates=useMemo(()=>BUS_DATA.filter(d=>d.km>0).map((d,_,arr)=>{const base=new Date('2026-05-02T12:00:00');base.setDate(base.getDate()+d.day-1);return base.toISOString().slice(0,10);}),[]);
  const idx=driveDates.indexOf(sel);
  const prevDriveDate=idx>0?driveDates[idx-1]:(driveDates.length>0&&!driveDates.includes(sel)?driveDates.filter(d=>d<sel).pop():null);
  const nextDriveDate=idx>=0&&idx<driveDates.length-1?driveDates[idx+1]:(driveDates.length>0&&!driveDates.includes(sel)?driveDates.find(d=>d>sel):null);
  if(!busDay)return(
    <div style={{padding:"40px 20px",textAlign:"center",color:T.textDim}}>
      <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>No drive session for {fD(sel)}</div>
      <div style={{fontSize:10,color:T.textMute,marginBottom:12}}>Pick a tour day with a bus movement.</div>
      {(prevDriveDate||nextDriveDate)&&<div style={{display:"flex",gap:8,justifyContent:"center"}}>
        {prevDriveDate&&<button onClick={()=>setSel(prevDriveDate)} style={{fontSize:10,padding:"4px 11px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text2,cursor:"pointer",fontWeight:700}}>← {fD(prevDriveDate)}</button>}
        <button onClick={()=>setDateMenu(true)} style={{fontSize:10,padding:"4px 11px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text2,cursor:"pointer",fontWeight:700}}>☰ Pick day</button>
        {nextDriveDate&&<button onClick={()=>setSel(nextDriveDate)} style={{fontSize:10,padding:"4px 11px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text2,cursor:"pointer",fontWeight:700}}>{fD(nextDriveDate)} →</button>}
      </div>}
    </div>
  );
  const isRest=!(busDay.km>0);
  const flags=computeDriveFlags(busDay);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{background:busDay.show?"var(--success-bg)":"var(--info-bg)",border:`1px solid ${busDay.show?"var(--success-fg)":"var(--info-fg)"}30`,borderRadius:10,padding:"12px 16px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:flags.length>0?10:0}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:8,fontWeight:800,color:busDay.show?"var(--success-fg)":"var(--info-fg)",letterSpacing:"0.08em",textTransform:"uppercase"}}>{busDay.show?"Show Day":"Travel Day"} · EU Day {busDay.day}</div>
            <div style={{fontSize:15,fontWeight:800,color:T.text,marginTop:2}}>{busDay.route}</div>
            <div style={{fontSize:9,color:T.textDim,fontFamily:MN,marginTop:2}}>{busDay.date} · {busDay.dow} · {fFull(sel)}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            {busDay.dep&&busDay.dep!=="—"&&<div style={{textAlign:"center"}}><div style={{fontSize:8,color:T.textDim,fontWeight:700,letterSpacing:"0.06em"}}>DEP</div><div style={{fontFamily:MN,fontSize:13,fontWeight:800,color:T.text}}>{busDay.dep}</div></div>}
            {busDay.arr&&busDay.arr!=="—"&&<div style={{textAlign:"center"}}><div style={{fontSize:8,color:T.textDim,fontWeight:700,letterSpacing:"0.06em"}}>ARR</div><div style={{fontFamily:MN,fontSize:13,fontWeight:800,color:T.text}}>{busDay.arr}</div></div>}
            {busDay.km>0&&<div style={{textAlign:"center"}}><div style={{fontSize:8,color:T.textDim,fontWeight:700,letterSpacing:"0.06em"}}>KM</div><div style={{fontFamily:MN,fontSize:13,fontWeight:800,color:T.text}}>{busDay.km}</div></div>}
            {busDay.drive&&busDay.drive!=="—"&&<div style={{textAlign:"center"}}><div style={{fontSize:8,color:T.textDim,fontWeight:700,letterSpacing:"0.06em"}}>DRIVE</div><div style={{fontFamily:MN,fontSize:13,fontWeight:800,color:busDay.flag==="⚠"?"var(--danger-fg)":T.text}}>{busDay.drive}</div></div>}
            <button onClick={()=>setEdit(v=>!v)} title="Edit drive sessions" style={{fontSize:9,padding:"4px 10px",borderRadius:5,border:`1px solid ${edit?"var(--warn-fg)":"var(--border)"}`,background:edit?"var(--warn-bg)":"var(--card-2)",color:edit?"var(--warn-fg)":T.text2,cursor:"pointer",fontWeight:700,fontFamily:MN}}>✎ Edit{busEdits[sel]?.sessions?" *":""}</button>
          </div>
        </div>
        {flags.length>0&&<DriveFlagChips entry={busDay} size="lg"/>}
      </div>
      {!edit&&!isRest&&<BusDriveSessionTable entry={busDay} label={busDay.show?"SHOW DAY · LOCAL DRIVE":"DRIVE SESSION TABLE"}/>}
      {!edit&&isRest&&<div style={{padding:"24px",textAlign:"center",fontSize:11,color:T.textMute,fontStyle:"italic",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10}}>Rest day — no drive scheduled.</div>}
      {edit&&<div style={{background:"var(--card)",border:"1px solid var(--warn-fg)40",borderRadius:10,padding:"10px 14px"}}>
        <DriveSessionEditor
          initialSessions={(busDay.sessions?.length>0?busDay.sessions:null)||parseDriveSessions(busDay.note,busDay.stops)}
          hasOverride={!!(busEdits[sel]?.sessions)}
          onSave={rows=>{uBusEdit(sel,{sessions:rows});setEdit(false);}}
          onCancel={()=>setEdit(false)}
          onReset={()=>{uBusEdit(sel,{sessions:null});setEdit(false);}}
        />
      </div>}
      <div style={{display:"flex",gap:6,alignItems:"center",justifyContent:"space-between",fontSize:9,color:T.textMute,fontFamily:MN,padding:"4px 4px"}}>
        <button onClick={()=>prevDriveDate&&setSel(prevDriveDate)} disabled={!prevDriveDate} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"1px solid var(--border)",background:"var(--card-2)",color:prevDriveDate?T.text2:T.textMute,cursor:prevDriveDate?"pointer":"default",fontWeight:700}}>← Prev drive {prevDriveDate?fD(prevDriveDate):""}</button>
        <span>Pieter Smit T26-021201</span>
        <button onClick={()=>nextDriveDate&&setSel(nextDriveDate)} disabled={!nextDriveDate} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"1px solid var(--border)",background:"var(--card-2)",color:nextDriveDate?T.text2:T.textMute,cursor:nextDriveDate?"pointer":"default",fontWeight:700}}>Next drive {nextDriveDate?fD(nextDriveDate):""} →</button>
      </div>
    </div>
  );
}
