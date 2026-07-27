import { useContext, useEffect, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { logAudit } from "../../lib/audit";
import { IMM_STATUS, IMM_TYPES, MN } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";

export function ImmigrationPanel(){
  const{immigration,uImmigration,shows,sel,aC,pushUndo}=useContext(Ctx);
  const show=shows[sel];
  const country=show?.country||null;
  // Country-scoped: show all items for selected show's country + items whose showDates include the selected date.
  const items=useMemo(()=>Object.values(immigration||{}).filter(it=>it.clientId===aC&&(it.country===country||(Array.isArray(it.showDates)&&it.showDates.includes(sel)))),[immigration,country,sel,aC]);
  const[adding,setAdding]=useState(false);
  const blank={country:country||"",type:"work_permit",label:"",status:"not_started",dueDate:"",ref:"",note:"",assignedTo:"",showDates:[]};
  const[form,setForm]=useState(blank);
  useEffect(()=>{setForm(f=>({...f,country:country||f.country}));},[country]);

  if(!country&&!items.length)return null;

  const typeOf=t=>IMM_TYPES.find(x=>x.id===t)||IMM_TYPES[IMM_TYPES.length-1];
  const statusOf=s=>IMM_STATUS.find(x=>x.id===s)||IMM_STATUS[0];

  const add=()=>{
    if(!form.label||!form.country)return;
    const id=`imm_${Date.now()}`;
    const row={...form,id,clientId:aC,createdAt:new Date().toISOString()};
    uImmigration(id,row);
    logAudit({entityType:"immigration",entityId:id,action:"create",before:null,after:row,meta:{country:row.country,type:row.type}});
    setForm({...blank,country:country||""});setAdding(false);
  };
  const updateStatus=(id,status)=>{
    const prev=immigration[id];if(!prev)return;
    const next={...prev,status};
    if(status==="submitted"&&!prev.submittedDate)next.submittedDate=new Date().toISOString().slice(0,10);
    if(status==="received"&&!prev.receivedDate)next.receivedDate=new Date().toISOString().slice(0,10);
    if(status==="approved"&&!prev.approvedDate)next.approvedDate=new Date().toISOString().slice(0,10);
    uImmigration(id,next);
    logAudit({entityType:"immigration",entityId:id,action:"status_change",before:{status:prev.status},after:{status},meta:{country:prev.country,type:prev.type}});
  };
  const del=id=>{
    const prev=immigration[id];if(!prev)return;
    uImmigration(id,null);
    pushUndo("Immigration item deleted.",()=>uImmigration(id,prev));
    logAudit({entityType:"immigration",entityId:id,action:"delete",before:prev,after:null});
  };

  return(
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div>
          <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.08em"}}>IMMIGRATION — {country||"?"}</div>
          <div style={{fontSize:9,color:T.textMute,marginTop:1}}>Country-scoped. Spans multiple shows.</div>
        </div>
        <button onClick={()=>setAdding(v=>!v)} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:700,background:"var(--accent)",color:"#fff"}}>{adding?"Cancel":"+ Add"}</button>
      </div>
      {adding&&(
        <div style={{background:"var(--card-3)",borderRadius:8,padding:"8px",marginBottom:8}}>
          <div style={{display:"grid",gridTemplateColumns:"60px 110px 1fr 110px 90px",gap:5,marginBottom:5}}>
            <input placeholder="CC" maxLength={3} value={form.country} onChange={e=>setForm(p=>({...p,country:e.target.value.toUpperCase()}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN,textTransform:"uppercase"}}/>
            <select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
              {IMM_TYPES.map(t=><option key={t.id} value={t.id}>{t.l}</option>)}
            </select>
            <input placeholder="Label (e.g. FR Short-Term Work Permit)" value={form.label} onChange={e=>setForm(p=>({...p,label:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
            <input type="date" placeholder="Due" value={form.dueDate} onChange={e=>setForm(p=>({...p,dueDate:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
            <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
              {IMM_STATUS.map(s=><option key={s.id} value={s.id}>{s.l}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:5}}>
            <input placeholder="Ref / tracking #" value={form.ref} onChange={e=>setForm(p=>({...p,ref:e.target.value}))} style={{flex:1,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
            <input placeholder="Assigned to (email)" value={form.assignedTo} onChange={e=>setForm(p=>({...p,assignedTo:e.target.value}))} style={{flex:1,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
            <input placeholder="Note" value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))} style={{flex:2,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
            <button onClick={add} disabled={!form.label||!form.country} style={{background:"var(--success-fg)",border:"none",borderRadius:4,color:"#fff",fontSize:10,padding:"4px 12px",cursor:(form.label&&form.country)?"pointer":"not-allowed",fontWeight:700,opacity:(form.label&&form.country)?1:0.5}}>Add</button>
          </div>
        </div>
      )}
      {items.length===0&&!adding&&<div style={{fontSize:10,color:T.textMute,padding:"4px 0",fontStyle:"italic"}}>No immigration items for {country}. Add work permits, visas, withholding, or customs docs.</div>}
      {items.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {items.map(it=>{const t=typeOf(it.type);const s=statusOf(it.status);const daysToDue=it.dueDate?Math.ceil((new Date(it.dueDate+"T12:00:00")-new Date())/86400000):null;const overdue=daysToDue!==null&&daysToDue<0&&it.status!=="approved"&&it.status!=="na";return(
            <div key={it.id} style={{display:"grid",gridTemplateColumns:"40px 100px 1fr 90px 100px 80px 28px",gap:6,alignItems:"center",padding:"6px 8px",borderRadius:6,background:overdue?"var(--danger-bg)":"var(--card-3)",border:overdue?"1px solid var(--danger-fg)":"1px solid var(--border)"}}>
              <span style={{fontSize:9,fontFamily:MN,fontWeight:800,color:T.text}}>{it.country}</span>
              <span style={{fontSize:9,color:T.textDim,fontWeight:600}}>{t.l}</span>
              <div style={{minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.label}</div>
                {it.note&&<div style={{fontSize:9,color:T.textMute,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.note}</div>}
              </div>
              <div style={{fontSize:9,fontFamily:MN,color:overdue?"var(--danger-fg)":daysToDue!==null&&daysToDue<=14?"var(--warn-fg)":"var(--text-dim)",fontWeight:700}}>
                {it.dueDate?`${it.dueDate}${daysToDue!==null?` (${daysToDue>=0?daysToDue:Math.abs(daysToDue)+"d late"})`:""}`:"—"}
              </div>
              <select value={it.status} onChange={e=>updateStatus(it.id,e.target.value)} style={{background:s.b,color:s.c,border:"none",borderRadius:4,fontSize:9,padding:"3px 5px",outline:"none",fontWeight:700,cursor:"pointer"}}>
                {IMM_STATUS.map(x=><option key={x.id} value={x.id}>{x.l}</option>)}
              </select>
              <span style={{fontSize:9,fontFamily:MN,color:T.text2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.ref||"—"}</span>
              <button onClick={()=>del(it.id)} style={{background:"transparent",border:"none",color:T.textMute,fontSize:12,cursor:"pointer",padding:"2px 4px"}} title="Delete">×</button>
            </div>
          );})}
        </div>
      )}
    </div>
  );
}
