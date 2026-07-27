import { useState } from "react";
import { logAudit } from "../../lib/audit";
import { FIN_EVENT_STATUS, FIN_EVENT_TYPES, MN } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";

export function FinEventsPanel({selS,fin,uFin,pushUndo}){
  const events=fin.events||[];
  const[adding,setAdding]=useState(false);
  const[form,setForm]=useState({type:"settlement",amount:"",currency:"USD",expectedDate:"",actualDate:"",status:"pending",ref:"",payMethod:"",note:""});
  const reset=()=>setForm({type:"settlement",amount:"",currency:"USD",expectedDate:"",actualDate:"",status:"pending",ref:"",payMethod:"",note:""});

  const add=()=>{
    if(!form.amount)return;
    const ev={...form,id:`ev_${Date.now()}`,createdAt:new Date().toISOString(),amount:parseFloat(form.amount)||0};
    uFin(selS,{events:[...events,ev]});
    logAudit({entityType:"finance",entityId:`${selS}:${ev.id}`,action:"event_create",
      before:null,after:ev,meta:{type:ev.type}});
    reset();setAdding(false);
  };
  const update=(id,patch)=>{
    const prev=events.find(e=>e.id===id);if(!prev)return;
    const next={...prev,...patch};
    uFin(selS,{events:events.map(e=>e.id===id?next:e)});
    logAudit({entityType:"finance",entityId:`${selS}:${id}`,action:"event_update",
      before:prev,after:next,meta:{fields:Object.keys(patch)}});
  };
  const del=id=>{
    const prev=events.find(e=>e.id===id);if(!prev)return;
    uFin(selS,{events:events.filter(e=>e.id!==id)});
    pushUndo("Event deleted.",()=>uFin(selS,{events:[...events]}));
    logAudit({entityType:"finance",entityId:`${selS}:${id}`,action:"event_delete",
      before:prev,after:null,meta:{type:prev.type}});
  };

  // Migrate legacy flat wireRef/wireDate/settlementAmount into a settlement event.
  const hasLegacy=(fin.settlementAmount||fin.wireRef||fin.wireDate)&&!events.some(e=>e.type==="settlement"||e.type==="wire");
  const migrate=()=>{
    const migrated=[];
    if(fin.settlementAmount){
      migrated.push({id:`ev_mig_s_${Date.now()}`,type:"settlement",amount:parseFloat(fin.settlementAmount)||0,currency:"USD",
        expectedDate:selS,actualDate:fin.stages?.payment_initiated?selS:"",status:fin.stages?.payment_initiated?"confirmed":"pending",
        ref:"",note:"migrated from legacy settlementAmount",createdAt:new Date().toISOString()});
    }
    if(fin.wireRef||fin.wireDate){
      migrated.push({id:`ev_mig_w_${Date.now()+1}`,type:"wire",amount:parseFloat(fin.settlementAmount)||0,currency:"USD",
        expectedDate:fin.wireDate||"",actualDate:fin.wireDate||"",status:fin.stages?.wire_ref_confirmed?"confirmed":"pending",
        ref:fin.wireRef||"",note:"migrated from legacy wireRef/wireDate",createdAt:new Date().toISOString()});
    }
    if(!migrated.length)return;
    uFin(selS,{events:[...events,...migrated]});
    migrated.forEach(ev=>logAudit({entityType:"finance",entityId:`${selS}:${ev.id}`,action:"event_create",before:null,after:ev,meta:{type:ev.type,source:"migration"}}));
  };

  const typeOf=t=>FIN_EVENT_TYPES.find(x=>x.id===t)||FIN_EVENT_TYPES[FIN_EVENT_TYPES.length-1];
  const statusOf=s=>FIN_EVENT_STATUS.find(x=>x.id===s)||FIN_EVENT_STATUS[0];

  return(
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.08em"}}>FINANCIAL EVENTS</div>
        <div style={{display:"flex",gap:6}}>
          {hasLegacy&&<button onClick={migrate} style={{fontSize:9,padding:"3px 9px",borderRadius:4,border:"1px solid var(--warn-fg)",background:"var(--warn-bg)",color:T.warnFg,cursor:"pointer",fontWeight:700}}>Migrate legacy ↗</button>}
          <button onClick={()=>setAdding(v=>!v)} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:700,background:"var(--accent)",color:"#fff"}}>{adding?"Cancel":"+ Add Event"}</button>
        </div>
      </div>
      {adding&&(
        <div style={{background:"var(--card-3)",borderRadius:10,padding:"10px",marginBottom:10}}>
          <div style={{display:"grid",gridTemplateColumns:"110px 90px 70px 110px 110px 100px",gap:5,marginBottom:5}}>
            <select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
              {FIN_EVENT_TYPES.map(t=><option key={t.id} value={t.id}>{t.l}</option>)}
            </select>
            <input placeholder="Amount" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
            <select value={form.currency} onChange={e=>setForm(p=>({...p,currency:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
              {["USD","CAD","GBP","EUR"].map(c=><option key={c}>{c}</option>)}
            </select>
            <input type="date" placeholder="Expected" value={form.expectedDate} onChange={e=>setForm(p=>({...p,expectedDate:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
            <input type="date" placeholder="Actual" value={form.actualDate} onChange={e=>setForm(p=>({...p,actualDate:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
            <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
              {FIN_EVENT_STATUS.map(s=><option key={s.id} value={s.id}>{s.l}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:5,marginBottom:5}}>
            <input placeholder="Ref # (wire, invoice, etc.)" value={form.ref} onChange={e=>setForm(p=>({...p,ref:e.target.value}))} style={{flex:1,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
            <input placeholder="Card / payment method (e.g. Amex 4567)" value={form.payMethod} onChange={e=>setForm(p=>({...p,payMethod:e.target.value}))} style={{flex:1,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
            <input placeholder="Note" value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))} style={{flex:2,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
            <button onClick={add} disabled={!form.amount} style={{background:"var(--success-fg)",border:"none",borderRadius:4,color:"#fff",fontSize:10,padding:"4px 12px",cursor:form.amount?"pointer":"not-allowed",fontWeight:700,opacity:form.amount?1:0.5}}>Add</button>
          </div>
        </div>
      )}
      {events.length===0&&!adding&&<div style={{fontSize:10,color:T.textMute,padding:"6px 0",fontStyle:"italic"}}>No financial events yet. Settlement, wire, withholding, merch, and VIP each track independently.</div>}
      {events.length>0&&(
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:"var(--card-3)"}}>{["Type","Amount","Expected","Actual","Status","Ref","Payment","Note",""].map(h=><th key={h} style={{padding:"5px 7px",textAlign:"left",fontSize:8,fontWeight:700,color:T.textDim,letterSpacing:"0.05em",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead>
          <tbody>{events.map(ev=>{const t=typeOf(ev.type);const s=statusOf(ev.status);return(
            <tr key={ev.id} style={{borderBottom:"1px solid var(--card-3)"}}>
              <td style={{padding:"5px 7px"}}><span style={{fontSize:9,padding:"1px 6px",borderRadius:4,background:t.b,color:t.c,fontWeight:700}}>{t.l}</span></td>
              <td style={{padding:"5px 7px",fontFamily:MN,fontSize:10,fontWeight:700}}>{ev.currency} {Number(ev.amount||0).toFixed(2)}</td>
              <td style={{padding:"5px 7px",fontFamily:MN,fontSize:9,color:T.textDim}}>{ev.expectedDate||"—"}</td>
              <td style={{padding:"5px 7px",fontFamily:MN,fontSize:9,color:ev.actualDate?"var(--text)":"var(--text-mute)"}}>{ev.actualDate||"—"}</td>
              <td style={{padding:"5px 7px"}}>
                <select value={ev.status} onChange={e=>update(ev.id,{status:e.target.value})} style={{background:s.b,color:s.c,border:"none",borderRadius:4,fontSize:9,padding:"2px 4px",outline:"none",fontWeight:700,cursor:"pointer"}}>
                  {FIN_EVENT_STATUS.map(x=><option key={x.id} value={x.id}>{x.l}</option>)}
                </select>
              </td>
              <td style={{padding:"5px 7px",fontFamily:MN,fontSize:9,color:T.text2}}>{ev.ref||"—"}</td>
              <td style={{padding:"5px 7px",fontSize:9,color:T.text2,whiteSpace:"nowrap"}}>{ev.payMethod||"—"}</td>
              <td style={{padding:"5px 7px",fontSize:9,color:T.textDim,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.note||"—"}</td>
              <td style={{padding:"5px 7px"}}><button onClick={()=>del(ev.id)} style={{background:"transparent",border:"none",color:T.textMute,fontSize:11,cursor:"pointer",padding:"2px 6px"}} title="Delete">×</button></td>
            </tr>
          );})}</tbody>
        </table>
      )}
    </div>
  );
}
