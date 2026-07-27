import React, { useContext, useEffect, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { logAudit } from "../../lib/audit";
import { MN, POST_STAGES, PRE_STAGES } from "../../lib/domain-constants";
import { gmailUrl, showIdFor } from "../../lib/intel";
import { dU, fD, fFull } from "../../lib/time";
import { T } from "../../styles/tokens";
import { FinEventsPanel } from "./FinEventsPanel";
import { FinLedger } from "./FinLedger";

export function FinTab(){
  const{shows,cShows,finance,uFin,pushUndo,labelIntel,sel,setSel,eventKey,allShows}=useContext(Ctx);
  const today=new Date().toISOString().slice(0,10);
  const[finView,setFinView]=useState(allShows?"overview":"settlement");
  useEffect(()=>{if(allShows&&finView==="settlement")setFinView("overview");},[allShows]);
  const[addP,setAddP]=useState(false);
  const[pForm,setPForm]=useState({name:"",role:"",dept:"Drivers",amount:"",currency:"USD",method:"Wire",payMethod:"",status:"pending"});
  const show=sel?shows[sel]:null;
  const fin=eventKey?finance[eventKey]||{}:{};
  const stages=fin.stages||{};
  const payouts=fin.payouts||[];
  const toggleStage=id=>{
    const prev=!!stages[id];const next=!prev;
    uFin(eventKey,{stages:{...stages,[id]:next}});
    logAudit({entityType:"finance",entityId:`${eventKey}:${id}`,action:"stage_toggle",
      before:{done:prev},after:{done:next},meta:{stage:id}});
  };
  const done=["wire_ref_confirmed","signed_sheet","payment_initiated"].every(id=>stages[id]);
  const addPayout=()=>{if(!eventKey||!pForm.name||!pForm.amount)return;uFin(eventKey,{payouts:[...payouts,{...pForm,id:`p${Date.now()}`,date:today}]});setPForm({name:"",role:"",dept:"Drivers",amount:"",currency:"USD",method:"Wire",payMethod:"",status:"pending"});setAddP(false);};
  const currencies=[...new Set(payouts.map(p=>p.currency))];
  const batchTotal=cur=>payouts.filter(p=>p.currency===cur).reduce((s,p)=>s+parseFloat(p.amount||0),0).toFixed(2);
  const curStatus=!eventKey?"":done?"settled":stages["payment_initiated"]?"in_progress":"pending";

  return(
    <div className="fi" style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
      {/* Sub-tab bar */}
      <div style={{display:"flex",gap:0,borderBottom:"1px solid var(--border)",background:"var(--card)",flexShrink:0,padding:"0 16px"}}>
        {[["settlement","Settlement"],["ledger","Ledger"],["overview","All Shows"]].filter(([v])=>!allShows||v!=="settlement").map(([v,l])=>(
          <button key={v} onClick={()=>setFinView(v)} style={{padding:"8px 16px",fontSize:11,fontWeight:finView===v?700:500,color:finView===v?"var(--text)":"var(--text-dim)",border:"none",borderBottom:finView===v?"2px solid var(--text)":"2px solid transparent",background:"none",cursor:"pointer",letterSpacing:"0.01em"}}>{l}</button>
        ))}
      </div>
      {finView==="ledger"&&<FinLedger/>}
      {finView==="overview"&&(()=>{const today=new Date().toISOString().slice(0,10);return(<div style={{flex:1,overflow:"auto",padding:"14px 20px 30px"}}>
        <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.08em",marginBottom:8}}>SETTLEMENT STATUS — ALL SHOWS</div>
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {cShows.map(s=>{const fk=s.date;const fStages=finance[fk]?.stages||{};const isSettled=["wire_ref_confirmed","signed_sheet","payment_initiated"].every(k=>fStages[k]);const inProgress=fStages["payment_initiated"];const isPast=s.date<today;const days=dU(s.date);const overdue=isPast&&!isSettled&&Math.abs(days)>7;return(
            <div key={s.date} onClick={()=>{setSel(s.date);setFinView("settlement");}} className="rh" style={{display:"grid",gridTemplateColumns:"58px 1fr 80px 90px 70px",alignItems:"center",gap:8,padding:"8px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,cursor:"pointer",borderLeft:`3px solid ${isSettled?"var(--success-fg)":inProgress?"var(--warn-fg)":overdue?"var(--danger-fg)":"var(--card-2)"}`}}>
              <div style={{fontFamily:MN,fontSize:9,color:T.textDim}}>{fD(s.date)}</div>
              <div><div style={{fontSize:10,fontWeight:700}}>{s.city}</div><div style={{fontSize:8,color:T.textDim}}>{s.venue}</div></div>
              <div style={{fontSize:9,fontFamily:MN,color:T.text2}}>{finance[fk]?.settlementAmount?`$${finance[fk].settlementAmount}`:"—"}</div>
              <div style={{fontSize:8,padding:"2px 6px",borderRadius:99,background:isSettled?"var(--success-bg)":inProgress?"var(--warn-bg)":"var(--card-2)",color:isSettled?"var(--success-fg)":inProgress?"var(--warn-fg)":"var(--text-mute)",fontWeight:700,textAlign:"center"}}>{isSettled?"Settled":inProgress?"In Progress":"Pending"}</div>
              <div style={{fontSize:8,color:overdue?"var(--danger-fg)":"var(--text-mute)",fontFamily:MN,textAlign:"right"}}>{isPast&&!isSettled?`${Math.abs(days)}d overdue`:days>0?`${days}d out`:"today"}</div>
            </div>
          );})}
        </div>
      </div>);})()}
      {finView==="settlement"&&<div style={{flex:1,overflow:"auto",padding:"14px 20px 30px"}}>
        {!sel?(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 0",gap:10}}><div style={{fontSize:32,opacity:0.2}}>💰</div><div style={{fontSize:14,fontWeight:700,color:T.text}}>No show selected</div><div style={{fontSize:11,color:T.textDim,maxWidth:280,textAlign:"center"}}>Select a show from the sidebar to view settlement and payouts.</div>{cShows.filter(s=>s.date>=new Date().toISOString().slice(0,10))[0]&&<button onClick={()=>setSel(cShows.filter(s=>s.date>=new Date().toISOString().slice(0,10))[0].date)} style={{marginTop:6,padding:"6px 16px",borderRadius:8,border:"none",background:"var(--accent)",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>Jump to next show →</button>}</div>):(
          <div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:800}}>{show?.city} — {show?.venue}</div>
              <div style={{fontSize:10,color:T.textDim,fontFamily:MN,marginTop:1}}>{fFull(sel)}</div>
              {done&&<div style={{marginTop:6,display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",background:"var(--success-bg)",borderRadius:10,fontSize:10,fontWeight:800,color:T.successFg}}>SETTLEMENT DONE ✓</div>}
            </div>
            {(()=>{const guarantee=parseFloat(show?.guarantee||0);const wireAmount=parseFloat(fin.settlementAmount||0);const variance=wireAmount-guarantee;const variancePct=guarantee>0?(variance/guarantee)*100:null;return guarantee>0?(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                {[{l:"Deal Guarantee",v:`$${guarantee.toLocaleString()}`,c:"var(--text)"},{l:"Settlement Amount",v:wireAmount>0?`$${wireAmount.toLocaleString()}`:"—",c:"var(--text)"},{l:"Variance",v:variancePct!=null?`${variance>=0?"+":""}$${Math.abs(variance).toLocaleString()} (${variancePct.toFixed(1)}%)`:"—",c:variance>=0?"var(--success-fg)":"var(--danger-fg)"}].map(s=>(
                  <div key={s.l} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:8,color:T.textDim,marginBottom:3,fontWeight:600}}>{s.l}</div>
                    <div style={{fontSize:15,fontWeight:800,color:s.c,fontFamily:MN}}>{s.v}</div>
                  </div>
                ))}
              </div>
            ):null;})()}
            {(()=>{const ps=(labelIntel?.settlements||[]).filter(s=>s.showId===showIdFor(shows?.[sel]||{}));return ps.length>0?(
              <div style={{background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:10,padding:"10px 12px",marginBottom:10}}>
                <div style={{fontSize:9,fontWeight:800,color:T.link,letterSpacing:"0.08em",marginBottom:6}}>INBOX SETTLEMENTS ({ps.length})</div>
                {ps.map(s=>(
                  <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:"1px solid var(--info-bg)"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.subject}</div>
                      <div style={{fontSize:9,color:T.textDim}}>{s.from} · {s.date}</div>
                    </div>
                    <a href={gmailUrl(s.id)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:T.link,textDecoration:"none",flexShrink:0}}>open ↗</a>
                  </div>
                ))}
              </div>
            ):null;})()}
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px",marginBottom:10}}>
              <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.08em",marginBottom:10}}>SETTLEMENT PIPELINE</div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:8,fontWeight:700,color:T.textDim,marginBottom:4,letterSpacing:"0.06em"}}>PRE-EVENT</div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {PRE_STAGES.map(s=><div key={s.id} onClick={()=>toggleStage(s.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",background:stages[s.id]?"var(--success-bg)":"var(--card)",cursor:"pointer"}}>
                    <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${stages[s.id]?"var(--success-fg)":"var(--border)"}`,background:stages[s.id]?"var(--success-fg)":"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{stages[s.id]&&<span style={{color:"#fff",fontSize:11,lineHeight:1}}>✓</span>}</div>
                    <span style={{fontSize:11,color:T.text,fontWeight:stages[s.id]?600:400}}>{s.l}</span>
                  </div>)}
                </div>
              </div>
              <div>
                <div style={{fontSize:8,fontWeight:700,color:T.textDim,marginBottom:4,letterSpacing:"0.06em"}}>POST-EVENT</div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {POST_STAGES.map(s=>{const isDone=stages[s.id];return(
                    <div key={s.id} onClick={()=>toggleStage(s.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,border:`1px solid ${s.req?"var(--warn-fg)":"var(--border)"}`,background:isDone?"var(--success-bg)":"var(--card)",cursor:"pointer"}}>
                      <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${isDone?"var(--success-fg)":s.req?"var(--warn-fg)":"var(--border)"}`,background:isDone?"var(--success-fg)":"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{isDone&&<span style={{color:"#fff",fontSize:11,lineHeight:1}}>✓</span>}</div>
                      <span style={{fontSize:11,color:T.text,fontWeight:isDone?600:400,flex:1}}>{s.l}</span>
                      {s.req&&!isDone&&<span style={{fontSize:8,color:T.warnFg,fontWeight:700}}>required</span>}
                    </div>
                  );})}
                </div>
              </div>
              {(()=>{const wireSteps=[{id:"signed",label:"Sheet Signed",stageKey:"signed_sheet"},{id:"wire",label:"Wire Initiated",stageKey:"payment_initiated"},{id:"ref",label:"Ref Confirmed",stageKey:"wire_ref_confirmed"}];return(
                <div style={{display:"flex",alignItems:"center",gap:0,marginTop:10,padding:"8px 0"}}>
                  {wireSteps.map((step,i)=>{const d=stages[step.stageKey];return(<React.Fragment key={step.id}>
                    {i>0&&<div style={{flex:1,height:2,background:d?"var(--success-fg)":"var(--card-2)"}}/>}
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,flexShrink:0}}>
                      <div style={{width:10,height:10,borderRadius:99,background:d?"var(--success-fg)":"var(--card-2)",border:`2px solid ${d?"var(--success-fg)":"var(--border)"}`}}/>
                      <div style={{fontSize:8,color:T.textDim,textAlign:"center",whiteSpace:"nowrap"}}>{step.label}</div>
                    </div>
                  </React.Fragment>);})}
                </div>
              );})()}
              {!done&&stages["payment_initiated"]&&<div style={{marginTop:4,padding:"7px 10px",background:"var(--warn-bg)",borderRadius:6,fontSize:10,color:T.warnFg,fontWeight:600}}>Wire ref # and signed sheet both required to mark done.</div>}
              <div style={{marginTop:10,fontSize:9,color:T.textMute,fontStyle:"italic"}}>Legacy flat fields below. Prefer <b>Financial Events</b> above for new settlements, wires, withholding, merch, and VIP — each tracks independently.</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginTop:6}}>
                {[{l:"Wire Ref #",k:"wireRef",ph:"REF-20260520"},{l:"Wire Date",k:"wireDate",ph:"2026-05-22"},{l:"Settlement Amount",k:"settlementAmount",ph:"0.00"}].map(f=><div key={f.k}><div style={{fontSize:9,color:T.textDim,marginBottom:2}}>{f.l}</div><input defaultValue={fin[f.k]||""} onBlur={e=>{const v=e.target.value;const prev=fin[f.k]||"";if(v===prev)return;uFin(eventKey,{[f.k]:v});pushUndo(`${f.l} updated.`,()=>uFin(eventKey,{[f.k]:prev}));}} placeholder={f.ph} style={{width:"100%",background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:T.text,fontSize:10,fontFamily:MN,padding:"4px 6px",outline:"none"}}/></div>)}
              </div>
              <div style={{marginTop:7}}><div style={{fontSize:9,color:T.textDim,marginBottom:2}}>Settlement Notes</div><textarea defaultValue={fin.notes||""} onBlur={e=>{const v=e.target.value;const prev=fin.notes||"";if(v===prev)return;uFin(eventKey,{notes:v});pushUndo("Settlement notes updated.",()=>uFin(eventKey,{notes:prev}));}} placeholder="Deductions, disputes, bonus splits..." rows={2} style={{width:"100%",background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:T.text,fontSize:10,padding:"4px 6px",outline:"none",resize:"vertical",fontFamily:"inherit"}}/></div>
            </div>
            <FinEventsPanel selS={eventKey} fin={fin} uFin={uFin} pushUndo={pushUndo}/>
            {(fin.flightExpenses||[]).length>0&&<div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px",marginBottom:10}}>
              <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.08em",marginBottom:8}}>FLIGHT EXPENSES</div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:"var(--card-3)"}}>{["Flight","Route","Carrier","Pax","Amount","Curr"].map(h=><th key={h} style={{padding:"5px 7px",textAlign:"left",fontSize:8,fontWeight:700,color:T.textDim,letterSpacing:"0.05em",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead>
                <tbody>{(fin.flightExpenses||[]).map((fe,i)=><tr key={fe.flightId||i} style={{borderBottom:"1px solid var(--card-3)"}}>
                  <td style={{padding:"5px 7px",fontFamily:MN,fontSize:9,fontWeight:700}}>{fe.label?.split(" ")[0]||"—"}</td>
                  <td style={{padding:"5px 7px",fontSize:10}}>{fe.label?.split(" ").slice(1).join(" ")||"—"}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:T.text2}}>{fe.carrier||"—"}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:T.textDim}}>{(fe.pax||[]).join(", ")||"—"}</td>
                  <td style={{padding:"5px 7px",fontFamily:MN,fontSize:10,fontWeight:700,color:fe.amount?"var(--text)":"var(--text-mute)"}}>{fe.amount!=null?fe.amount:"—"}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:T.textDim}}>{fe.currency||"—"}</td>
                </tr>)}
                </tbody>
              </table>
              {[...new Set((fin.flightExpenses||[]).map(fe=>fe.currency).filter(Boolean))].map(cur=>{const t=(fin.flightExpenses||[]).filter(fe=>fe.currency===cur&&fe.amount!=null).reduce((s,fe)=>s+parseFloat(fe.amount||0),0);return t>0?<div key={cur} style={{marginTop:6,padding:"5px 8px",background:"var(--info-bg)",borderRadius:6,fontSize:9,color:T.link}}><span style={{fontWeight:700}}>Flight total {cur}: </span><span style={{fontFamily:MN,fontWeight:700}}>{t.toFixed(2)}</span></div>:null;})}
            </div>}
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div>
                  <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.08em"}}>PAYMENT BATCH</div>
                  <div style={{marginTop:2}}>{currencies.map(cur=><span key={cur} style={{fontSize:9,fontFamily:MN,fontWeight:700,color:T.text,marginRight:10}}>{cur} {batchTotal(cur)}</span>)}</div>
                </div>
                <button onClick={()=>setAddP(v=>!v)} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:700,background:"var(--accent)",color:"#fff"}}>+ Add Payout</button>
              </div>
              {addP&&<div style={{background:"var(--card-3)",borderRadius:10,padding:"10px",marginBottom:10}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 70px 65px 70px 80px",gap:5,marginBottom:5}}>
                  <input placeholder="Payee name" value={pForm.name} onChange={e=>setPForm(p=>({...p,name:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
                  <input placeholder="Amount" value={pForm.amount} onChange={e=>setPForm(p=>({...p,amount:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
                  <select value={pForm.currency} onChange={e=>setPForm(p=>({...p,currency:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
                    {["USD","CAD","GBP","EUR"].map(c=><option key={c}>{c}</option>)}
                  </select>
                  <select value={pForm.method} onChange={e=>setPForm(p=>({...p,method:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
                    {["Wire","ACH","Check"].map(m=><option key={m}>{m}</option>)}
                  </select>
                  <select value={pForm.dept} onChange={e=>setPForm(p=>({...p,dept:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
                    {["Drivers","AR Staff","Production","Vendors","Site Ops","Quartermaster","Other"].map(d=><option key={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",gap:5}}>
                  <input placeholder="Role / position" value={pForm.role} onChange={e=>setPForm(p=>({...p,role:e.target.value}))} style={{flex:1,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
                  <input placeholder="Card / payment (e.g. Amex 4567)" value={pForm.payMethod} onChange={e=>setPForm(p=>({...p,payMethod:e.target.value}))} style={{flex:1,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
                  <button onClick={addPayout} style={{background:"var(--success-fg)",border:"none",borderRadius:4,color:"#fff",fontSize:10,padding:"4px 12px",cursor:"pointer",fontWeight:700}}>Add</button>
                  <button onClick={()=>setAddP(false)} style={{background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:4,color:T.textDim,fontSize:10,padding:"4px 8px",cursor:"pointer"}}>Cancel</button>
                </div>
              </div>}
              {payouts.length>0?(<table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:"var(--card-3)"}}>{["Name","Role","Dept","Amount","Curr","Method","Payment","Status","Date"].map(h=><th key={h} style={{padding:"5px 7px",textAlign:"left",fontSize:8,fontWeight:700,color:T.textDim,letterSpacing:"0.05em",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead>
                <tbody>{payouts.map((p,i)=><tr key={p.id||i} style={{borderBottom:"1px solid var(--card-3)"}}>
                  <td style={{padding:"5px 7px",fontSize:10,fontWeight:600}}>{p.name}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:T.text2}}>{p.role}</td>
                  <td style={{padding:"5px 7px",fontSize:8}}><span style={{background:"var(--card-2)",padding:"1px 5px",borderRadius:4,color:T.text2,fontWeight:600}}>{p.dept}</span></td>
                  <td style={{padding:"5px 7px",fontFamily:MN,fontSize:10,fontWeight:700}}>{p.amount}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:T.textDim}}>{p.currency}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:T.textDim}}>{p.method}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:T.text2,whiteSpace:"nowrap"}}>{p.payMethod||"—"}</td>
                  <td style={{padding:"5px 7px"}}><span style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:p.status==="confirmed"?"var(--success-bg)":"var(--warn-bg)",color:p.status==="confirmed"?"var(--success-fg)":"var(--warn-fg)",fontWeight:700}}>{p.status}</span></td>
                  <td style={{padding:"5px 7px",fontFamily:MN,fontSize:9,color:T.textMute}}>{p.date}</td>
                </tr>)}</tbody>
              </table>):<div style={{fontSize:11,color:T.textMute,textAlign:"center",padding:"14px 0"}}>No payouts logged.</div>}
              {payouts.length>0&&currencies.map(cur=>{const t=parseFloat(batchTotal(cur));const FX={EUR:1.08,GBP:1.27};const usdEquiv=FX[cur]?(t*FX[cur]).toFixed(2):null;return(<div key={cur} style={{marginTop:8,padding:"6px 10px",background:"var(--card-3)",borderRadius:6,fontSize:9,color:T.text2,display:"flex",alignItems:"center",gap:8}}><span style={{fontWeight:700}}>Batch total {cur}: </span><span style={{fontFamily:MN,fontWeight:700,color:T.text}}>{batchTotal(cur)}</span><span style={{color:T.textMute}}>({payouts.filter(p=>p.currency===cur).length} payees)</span>{usdEquiv&&<span style={{fontFamily:MN,color:T.textMute,marginLeft:"auto"}}>≈ USD {usdEquiv}</span>}</div>);})}
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}
