import { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { AT, CM, DEPTS, MN } from "../../lib/domain-constants";
import { confOf, gmailUrl, matchScore, showIdFor } from "../../lib/intel";
import { dU, fD, fW, fmt } from "../../lib/time";
import { BUS_DATA_MAP } from "../../lib/tour-data";
import { T } from "../../styles/tokens";
import { DashSingle } from "./DashSingle";

export function Dash(){
  const{sorted,cShows,next,setTab,setSel,advances,finance,aC,mobile,intel,setIntel,addLog,addActLog,labelIntel,allShows,sel,refreshLabelIntel,refreshMsg,role}=useContext(Ctx);
  const[scanning,setScanning]=useState(false);
  const[scanLastAt,setScanLastAt]=useState(null);
  const[todoSort,setTodoSort]=useState("priority");
  const[fuSort,setFuSort]=useState("priority");
  const client=CM[aC];const today=new Date().toISOString().slice(0,10);
  const runIntelScan=async()=>{if(scanning)return;setScanning(true);try{await refreshLabelIntel(true);setScanLastAt(new Date());}finally{setScanning(false);}};
  const upcoming=cShows.filter(s=>s.date>=today).slice(0,10);
  const PORD={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};
  const BORD={urgent:0,input:1,standing_by:2,fresh:3,active:4};
  const priC=p=>p==="CRITICAL"?"var(--danger-fg)":p==="HIGH"?"var(--warn-fg)":p==="MEDIUM"?"var(--link)":"var(--text-mute)";
  const priB=p=>p==="CRITICAL"?"var(--danger-bg)":p==="HIGH"?"var(--warn-bg)":p==="MEDIUM"?"var(--info-bg)":"var(--card-2)";
  const bucketC=b=>b==="urgent"?"var(--danger-fg)":b==="input"?"var(--warn-fg)":b==="standing_by"?"var(--link)":b==="fresh"?"var(--success-fg)":"var(--text-mute)";
  const bucketB=b=>b==="urgent"?"var(--danger-bg)":b==="input"?"var(--warn-bg)":b==="standing_by"?"var(--info-bg)":b==="fresh"?"var(--success-bg)":"var(--card-2)";
  const pendingCount=d=>{const adv=advances[d]||{};const items=adv.items||{};const custom=adv.customItems||[];return [...AT,...custom].filter(t=>(items[t.id]?.status||"pending")==="pending").length;};
  const isFullySettled=d=>{const st=finance?.[d]?.stages||{};return["wire_ref_confirmed","signed_sheet","payment_initiated"].every(k=>st[k]);};
  const flags=useMemo(()=>{const f=[];sorted.forEach(s=>{if(s.notes?.includes("⚠ Immigration")&&dU(s.date)<45)f.push({type:"CRITICAL",msg:`Immigration outstanding — ${s.city} ${fD(s.date)}`,cId:s.clientId,days:dU(s.date)});if(s.notes?.includes("settlement slow")&&dU(s.date)<90)f.push({type:"HIGH",msg:`Settlement risk — ${s.venue}`,cId:s.clientId,days:dU(s.date)});const days=dU(s.date);const pc=pendingCount(s.date);const total=AT.length;if(s.date>=today&&days<=7&&pc>total*0.5)f.push({type:"HIGH",msg:`${pc} advance items open — ${s.city} in ${days}d`,cId:s.clientId,days,date:s.date});const busEntry=BUS_DATA_MAP[s.date];if(busEntry&&s.region==="eu"&&days>=0&&days<=2&&!s.busArriveConfirmed)f.push({type:"HIGH",msg:`Bus arrival unconfirmed — ${s.city}`,cId:s.clientId,days,date:s.date});});return f;},[sorted,advances,today]);
  const showMap=useMemo(()=>{const m={};cShows.forEach(s=>m[showIdFor(s)]=s);return m;},[cShows]);
  const arShowLabel=item=>{const s=showMap[item.showId];return s?`${s.city} ${fD(s.date)}`:"";}
  const arHidden=useMemo(()=>new Set([...(intel.__arState?.done||[]),...(intel.__arState?.ignored||[])]),[intel.__arState]);
  const sortByDue=(a,b)=>{const ad=a.deadline||a.show?.date||"9999-12-31";const bd=b.deadline||b.show?.date||"9999-12-31";return ad.localeCompare(bd);};
  const allTodos=useMemo(()=>cShows.flatMap(s=>{const sid=showIdFor(s);return(intel[sid]?.todos||[]).filter(t=>!t.done&&!t.ignored).map(t=>({...t,show:s}));}).sort((a,b)=>{if(todoSort==="due")return sortByDue(a,b);const d=(PORD[a.priority]??4)-(PORD[b.priority]??4);return d!==0?d:a.show.date.localeCompare(b.show.date);}),[cShows,intel,todoSort]);
  const allFollowUps=useMemo(()=>cShows.flatMap(s=>{const sid=showIdFor(s);return(intel[sid]?.followUps||[]).filter(f=>!f.done&&!f.ignored).map(f=>({...f,show:s}));}).sort((a,b)=>{if(fuSort==="due")return sortByDue(a,b);return(PORD[a.priority]??4)-(PORD[b.priority]??4);}),[cShows,intel,fuSort]);
  const arItems=useMemo(()=>(labelIntel?.actionRequired||[]).filter(i=>!arHidden.has(i.id)).sort((a,b)=>{const d=(BORD[a.bucket]??5)-(BORD[b.bucket]??5);return d!==0?d:new Date(b.date)-new Date(a.date);}),[labelIntel,arHidden]);
  const urgentItems=useMemo(()=>arItems.filter(i=>i.bucket==="urgent"||i.category==="LEGAL"),[arItems]);
  const FIN_LEGAL=new Set(["FINANCE","LEGAL"]);
  const logisticsItems=useMemo(()=>(labelIntel?.advanceItems||[]).filter(i=>!arHidden.has(i.id)&&(i.category==="LOGISTICS"||i.category==="ADVANCE")).slice(0,20),[labelIntel,arHidden]);

  // Snapshot what was visible in the source thread at dismissal time so future
  // scans can detect actual content change, not just any new reply on the thread.
  const threadSnapshotFor=(sid,tid)=>{if(!sid||!tid)return{};const t=(intel[sid]?.threads||[]).find(x=>x.tid===tid||x.id===tid);return t?{markedThreadDate:t.date||null,markedSnippet:t.snippet||null,markedSubject:t.subject||null}:{};};
  const markTodo=(t,state)=>{const sid=showIdFor(t.show);const at=new Date().toISOString();const snap=threadSnapshotFor(sid,t.threadTid);setIntel(p=>({...p,[sid]:{...(p[sid]||{}),todos:(p[sid]?.todos||[]).map(x=>x.id===t.id?{...x,[state]:true,markedAt:at,...snap,reopened:false,reopenReason:null}:x)}}));addLog({type:"user",section:"todo",showId:sid,action:state,label:t.text||t.subject,from:"dashboard"});addActLog({module:"intel",action:`intel.todo.${state}`,target:{type:"todo",id:t.id,label:t.text||t.subject},payload:{priority:t.priority,showId:sid},context:{date:t.show?.date||null,showId:sid,eventKey:sid}});};
  const markFollowUp=(f,state)=>{const sid=showIdFor(f.show);const at=new Date().toISOString();const snap=threadSnapshotFor(sid,f.tid);setIntel(p=>{const fu=p[sid]?.followUps||[];const idx=fu.findIndex(x=>x.action===f.action&&(x.tid===f.tid||x.owner===f.owner||x.priority===f.priority));if(idx<0)return p;return{...p,[sid]:{...(p[sid]||{}),followUps:fu.map((x,j)=>j===idx?{...x,[state]:true,markedAt:at,...snap,reopened:false,reopenReason:null}:x)}};});addLog({type:"user",section:"followup",showId:sid,action:state,label:f.action,from:"dashboard"});addActLog({module:"intel",action:`intel.followup.${state}`,target:{type:"followup",id:f.tid||null,label:f.action},payload:{priority:f.priority,owner:f.owner||null,showId:sid},context:{date:f.show?.date||null,showId:sid,eventKey:sid}});};
  // markAr now accepts the full item so we can snapshot subject/snippet/bucket
  // alongside the thread date — required by the content-change reopen protocol.
  const markAr=(id,state,label,item)=>{const at=new Date().toISOString();setIntel(p=>{const prev=p.__arState||{};let next;if(state==="undone"){const snap={...(prev.snap||{})};delete snap[id];next={...prev,done:(prev.done||[]).filter(x=>x!==id),ignored:(prev.ignored||[]).filter(x=>x!==id),snap};}else{const snap={...(prev.snap||{}),[id]:{at,threadDate:item?.date||null,snippet:item?.snippet||null,subject:item?.subject||null,bucket:item?.bucket||null,state}};next={...prev,[state]:[...new Set([...(prev[state]||[]),id])],snap};}return{...p,__arState:next};});addLog({type:"user",section:"ar",showId:null,action:state,label:label||id,from:"dashboard"});addActLog({module:"intel",action:`intel.ar.${state}`,target:{type:"ar_item",id,label:label||id},payload:{},context:{date:null,showId:null,eventKey:null}});};

  // Reopen reason for AR items: bucket escalation, subject change, or snippet
  // change. Mere thread-date forward motion no longer triggers reopen.
  const arSnap=intel.__arState?.snap||{};
  const BUCKET_ORDER={urgent:0,input:1,standing_by:2,fresh:3,active:4};
  const arReopenedItems=useMemo(()=>(labelIntel?.actionRequired||[]).map(i=>{
    const s=arSnap[i.id];
    if(!s||!i.date||!s.threadDate)return null;
    if(new Date(i.date)<=new Date(s.threadDate))return null; // no new activity
    let reason=null;
    if(s.bucket&&i.bucket&&s.bucket!==i.bucket&&(BUCKET_ORDER[i.bucket]??5)<(BUCKET_ORDER[s.bucket]??5))reason=`escalated · ${s.bucket} → ${i.bucket}`;
    if(!reason&&s.subject&&i.subject&&s.subject!==i.subject)reason="subject changed";
    if(!reason&&s.snippet&&i.snippet&&s.snippet!==i.snippet)reason="new reply";
    if(!reason)return null; // thread bumped but visible content unchanged — skip
    return{...i,reopenReason:reason,priorState:s.state};
  }).filter(Boolean),[labelIntel,arSnap]);
  const arReopenedIds=useMemo(()=>new Set(arReopenedItems.map(i=>i.id)),[arReopenedItems]);
  const allFollowUpsReopened=useMemo(()=>cShows.flatMap(s=>{const sid=showIdFor(s);return(intel[sid]?.followUps||[]).filter(f=>(f.done||f.ignored)&&f.reopened).map(f=>({...f,show:s}));}),[cShows,intel]);
  const allTodosReopened=useMemo(()=>cShows.flatMap(s=>{const sid=showIdFor(s);return(intel[sid]?.todos||[]).filter(t=>(t.done||t.ignored)&&t.reopened).map(t=>({...t,show:s}));}),[cShows,intel]);

  const settlementHidden=useMemo(()=>new Set([...(intel.__settlementState?.done||[]),...(intel.__settlementState?.ignored||[])]),[intel.__settlementState]);
  const markSettlement=(date,state)=>{const at=new Date().toISOString();setIntel(p=>{const prev=p.__settlementState||{};const snap={...(prev.snap||{}),[date]:{at,state}};return{...p,__settlementState:{...prev,[state]:[...new Set([...(prev[state]||[]),date])],snap}};});addLog({type:"user",section:"settlement",showId:date,action:state,from:"dashboard"});};
  const updateSettlementNote=(date,note)=>{setIntel(p=>({...p,__settlementNotes:{...(p.__settlementNotes||{}),[date]:note}}));};
  const updateTodoNote=(t,note)=>{const sid=showIdFor(t.show);setIntel(p=>({...p,[sid]:{...(p[sid]||{}),todoNotes:{...(p[sid]?.todoNotes||{}),[t.id]:note}}}));};
  const updateArNote=(id,note)=>{setIntel(p=>({...p,__arNotes:{...(p.__arNotes||{}),[id]:note}}));};

  const BTN_DONE={fontSize:8,padding:"2px 6px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",background:"var(--success-bg)",color:T.successFg};
  const BTN_IGN={fontSize:8,padding:"2px 6px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",background:"var(--card-2)",color:T.textMute};

  const applySuggestion=(i)=>{
    if(i.suggestion==="complete")markAr(i.id,"done",i.subject,i);
    else if(i.suggestion==="ignore")markAr(i.id,"ignored",i.subject,i);
    else if(i.suggestion==="action"&&i.suggestedAction)updateArNote(i.id,i.suggestedAction);
  };
  const renderSuggest=(i)=>{
    if(!i?.suggestion)return null;
    const conf=i.suggestionConfidence||"medium";
    const dim=conf==="low"?0.55:1;
    const tip=`${i.suggestion.toUpperCase()} (${conf})${i.suggestionReason?` — ${i.suggestionReason}`:""}`;
    if(i.suggestion==="complete")return<button onClick={()=>applySuggestion(i)} title={tip} style={{fontSize:8,padding:"2px 6px",borderRadius:4,border:"1px solid var(--success-fg)",background:"var(--success-bg)",color:"var(--success-fg)",cursor:"pointer",fontWeight:700,opacity:dim,whiteSpace:"nowrap",flexShrink:0}}>✓ Suggest Done</button>;
    if(i.suggestion==="ignore")return<button onClick={()=>applySuggestion(i)} title={tip} style={{fontSize:8,padding:"2px 6px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-2)",color:T.textMute,cursor:"pointer",fontWeight:700,opacity:dim,whiteSpace:"nowrap",flexShrink:0}}>× Suggest Ignore</button>;
    if(i.suggestion==="action"&&i.suggestedAction)return<button onClick={()=>applySuggestion(i)} title={`${tip} — click to save as note`} style={{fontSize:8,padding:"2px 6px",borderRadius:4,border:"1px solid var(--accent)",background:"var(--accent-pill-bg)",color:T.accent,cursor:"pointer",fontWeight:700,opacity:dim,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}}>→ {i.suggestedAction}</button>;
    return null;
  };

  // All hooks above must run unconditionally; route to DashSingle only after.
  if(!allShows&&sel)return<DashSingle/>;

  return(
    <div className="fi" style={{padding:mobile?"10px 10px 24px":"14px 20px 30px",maxWidth:960,flex:1,overflowY:"auto",minHeight:0}}>
      {flags.slice(0,4).map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",background:f.type==="CRITICAL"?"var(--danger-bg)":"var(--warn-bg)",borderRadius:10,marginBottom:4,borderLeft:`3px solid ${f.type==="CRITICAL"?"var(--danger-fg)":"var(--warn-fg)"}`}}><span style={{fontSize:9,fontWeight:800,color:f.type==="CRITICAL"?"var(--danger-fg)":"var(--warn-fg)",fontFamily:MN}}>{f.type}</span><span style={{fontSize:11,color:T.text,fontWeight:600,flex:1}}>{f.msg}</span>{CM[f.cId]&&<span style={{fontSize:8,color:T.textDim,fontFamily:MN,flexShrink:0}}>{CM[f.cId].short}</span>}{f.days!=null&&<span style={{fontSize:10,fontFamily:MN,fontWeight:800,color:f.type==="CRITICAL"?"var(--danger-fg)":"var(--warn-fg)",flexShrink:0}}>{f.days}d</span>}</div>)}
      {(()=>{const unsettledCount=(cShows||[]).filter(s=>s.date<today&&!isFullySettled(s.date)).length;const nextBus=next?BUS_DATA_MAP[next.date]?.dep:null;return(<>
      <div style={{display:"flex",alignItems:"center",gap:8,margin:"10px 0 6px"}}>
        <span style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em"}}>{client.name.toUpperCase()} OVERVIEW</span>
        <span style={{flex:1}}/>
        {role!=="viewer"&&scanLastAt&&!scanning&&<span style={{fontSize:9,color:T.textMute,fontFamily:MN}}>scanned {scanLastAt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
        {role!=="viewer"&&scanning&&refreshMsg&&<span style={{fontSize:9,color:T.accent,fontFamily:MN}}>{refreshMsg}</span>}
        {role!=="viewer"&&<button onClick={runIntelScan} disabled={scanning} title={`Scan all Gmail threads labeled for ${client.name} across ${cShows.length} shows`} style={{fontSize:10,padding:"4px 11px",borderRadius:6,border:"none",background:scanning?"var(--border)":"var(--accent)",color:scanning?"var(--text-dim)":"var(--card)",cursor:scanning?"default":"pointer",fontWeight:700,whiteSpace:"nowrap"}}>{scanning?"Scanning…":"↻ Scan Intel"}</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,margin:"0 0 12px"}}>
        {[{l:"Next Show",v:next?.city||"--",s:next?nextBus?`${dU(next.date)}d · BUS ${nextBus}`:`${dU(next.date)}d`:"",c:client.color},{l:`${client.name} Shows`,v:cShows.length,s:"total",c:"var(--text)"},{l:"Open Advances",v:upcoming.filter(s=>pendingCount(s.date)>0).length,s:"shows w/ pending",c:upcoming.filter(s=>pendingCount(s.date)>0).length>0?"var(--warn-fg)":"var(--text-mute)"},{l:"Open To-Dos",v:allTodos.length,s:"private",c:allTodos.length>0?"var(--warn-fg)":"var(--text-mute)"},{l:"Follow-Ups",v:allFollowUps.length,s:"across shows",c:allFollowUps.length>0?"var(--link)":"var(--text-mute)"},{l:"Unsettled",v:unsettledCount,s:"past shows",c:unsettledCount>2?"var(--danger-fg)":unsettledCount>0?"var(--warn-fg)":"var(--text-mute)"}].map((s,i)=><div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}><div style={{fontSize:9,color:T.textDim,marginBottom:2,fontWeight:600}}>{s.l}</div><div style={{fontSize:20,fontWeight:800,color:s.c,fontFamily:MN}}>{s.v}</div><div style={{fontSize:9,color:T.textMute,fontFamily:MN,marginTop:1}}>{s.s}</div></div>)}
      </div></>);})()}
      {role!=="viewer"&&(()=>{const pastShows=(cShows||[]).filter(s=>s.date<today&&!settlementHidden.has(s.date)).slice(-6);if(!pastShows.length)return null;return(
      <div style={{marginBottom:12}}>
        <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",marginBottom:5}}>SETTLEMENT PIPELINE</div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          {pastShows.map(s=>{const daysSince=Math.abs(dU(s.date));const settled=isFullySettled(s.date);const wired=(finance?.[s.date]?.stages||{})["payment_initiated"];const overdue=!settled&&daysSince>21;const warn=!settled&&daysSince>7&&!wired;const noteVal=intel.__settlementNotes?.[s.date]||"";return(
            <div key={s.date} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
              <div style={{width:6,height:6,borderRadius:99,background:settled?"var(--success-fg)":overdue?"var(--danger-fg)":warn?"var(--warn-fg)":"var(--card-3)",flexShrink:0,marginTop:4}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}} onClick={()=>{setSel(s.date);setTab("finance");}}>
                  <span style={{fontSize:11,fontWeight:700,color:settled?"var(--success-fg)":overdue?"var(--danger-fg)":warn?"var(--warn-fg)":"var(--text-2)",fontFamily:MN}}>{s.city} · {fD(s.date)}</span>
                  {overdue&&<span style={{fontSize:7,color:"var(--danger-fg)",fontFamily:MN,fontWeight:800}}>{daysSince}d overdue</span>}
                  {settled&&<span style={{fontSize:7,color:"var(--success-fg)",fontFamily:MN,fontWeight:800}}>settled</span>}
                </div>
                <input type="text" placeholder="add note..." value={noteVal} onChange={e=>updateSettlementNote(s.date,e.target.value)} style={{marginTop:3,width:"100%",fontSize:9,padding:"2px 6px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text2,outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                <button onClick={()=>markSettlement(s.date,"done")} style={BTN_DONE}>Done</button>
                <button onClick={()=>markSettlement(s.date,"ignored")} style={BTN_IGN}>Ignore</button>
              </div>
            </div>
          );})}
        </div>
      </div>);})()}
      {(arReopenedItems.length>0||allFollowUpsReopened.length>0||allTodosReopened.length>0)&&(
        <div style={{marginBottom:10}}>
          <div style={{fontSize:9,fontWeight:800,color:"var(--warn-fg)",letterSpacing:"0.1em",marginBottom:5,display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:"var(--warn-bg)",color:"var(--warn-fg)",fontWeight:800}}>REOPENED</span>
            <span>CONTENT CHANGED SINCE YOU DISMISSED — {arReopenedItems.length+allFollowUpsReopened.length+allTodosReopened.length}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            {arReopenedItems.slice(0,5).map(i=><div key={"ar_"+i.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 12px",background:"var(--warn-bg)",borderRadius:8,borderLeft:"3px solid var(--warn-fg)"}}>
              <span style={{fontSize:8,fontWeight:800,color:"var(--warn-fg)",fontFamily:MN,flexShrink:0,marginTop:1}}>AR · {i.category||""}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{i.subject||"(no subject)"}</div><div style={{fontSize:9,color:T.textDim}}>{i.from}{arShowLabel(i)?` · ${arShowLabel(i)}`:""}</div></div>
              <span style={{fontSize:8,padding:"2px 6px",borderRadius:8,background:"var(--card-2)",color:T.warnFg,fontWeight:700,flexShrink:0,fontFamily:MN}} title={`Originally ${i.priorState}; reopened because ${i.reopenReason}`}>{i.reopenReason}</span>
              <a href={gmailUrl(i.id)} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--warn-fg)",color:"#fff",fontWeight:700,textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>email →</a>
              <button onClick={()=>markAr(i.id,"undone",i.subject)} style={BTN_DONE}>Re-open</button>
              <button onClick={()=>markAr(i.id,i.priorState||"done",i.subject,i)} style={BTN_IGN}>Re-dismiss</button>
            </div>)}
            {allFollowUpsReopened.slice(0,5).map((f,idx)=>{const sid=showIdFor(f.show);const priorState=f.done?"done":"ignored";return(<div key={"fu_"+sid+"_"+idx} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 12px",background:"var(--warn-bg)",borderRadius:8,borderLeft:"3px solid var(--warn-fg)"}}>
              <span style={{fontSize:8,fontWeight:800,color:"var(--warn-fg)",fontFamily:MN,flexShrink:0,marginTop:1}}>FU · {f.priority||""}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,color:T.text}}>{f.action}</div><div style={{fontSize:9,color:T.textDim}}>{f.show?.city} {fD(f.show?.date)}{f.owner?` · ${f.owner}`:""}</div></div>
              <span style={{fontSize:8,padding:"2px 6px",borderRadius:8,background:"var(--card-2)",color:T.warnFg,fontWeight:700,flexShrink:0,fontFamily:MN}} title={`Originally ${priorState}; reopened because ${f.reopenReason}`}>{f.reopenReason}</span>
              {f.tid&&<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--warn-fg)",color:"#fff",fontWeight:700,textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>email →</a>}
              <button onClick={()=>setIntel(p=>({...p,[sid]:{...(p[sid]||{}),followUps:(p[sid]?.followUps||[]).map(x=>x.action===f.action?{...x,done:false,ignored:false,reopened:false,reopenReason:null,markedAt:null}:x)}}))} style={BTN_DONE}>Re-open</button>
              <button onClick={()=>markFollowUp(f,priorState)} style={BTN_IGN}>Re-dismiss</button>
            </div>);})}
            {allTodosReopened.slice(0,5).map(t=>{const sid=showIdFor(t.show);const priorState=t.done?"done":"ignored";return(<div key={"td_"+t.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 12px",background:"var(--warn-bg)",borderRadius:8,borderLeft:"3px solid var(--warn-fg)"}}>
              <span style={{fontSize:8,fontWeight:800,color:"var(--warn-fg)",fontFamily:MN,flexShrink:0,marginTop:1}}>TODO · {t.priority||""}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,color:T.text}}>{t.text}</div><div style={{fontSize:9,color:T.textDim}}>{t.show?.city} {fD(t.show?.date)}</div></div>
              <span style={{fontSize:8,padding:"2px 6px",borderRadius:8,background:"var(--card-2)",color:T.warnFg,fontWeight:700,flexShrink:0,fontFamily:MN}} title={`Originally ${priorState}; reopened because ${t.reopenReason}`}>{t.reopenReason}</span>
              <button onClick={()=>setIntel(p=>({...p,[sid]:{...(p[sid]||{}),todos:(p[sid]?.todos||[]).map(x=>x.id===t.id?{...x,done:false,ignored:false,reopened:false,reopenReason:null,markedAt:null}:x)}}))} style={BTN_DONE}>Re-open</button>
              <button onClick={()=>markTodo(t,priorState)} style={BTN_IGN}>Re-dismiss</button>
            </div>);})}
          </div>
        </div>
      )}
      {(()=>{const vUrgent=urgentItems.filter(i=>!arReopenedIds.has(i.id)&&(role!=="viewer"||!FIN_LEGAL.has(i.category)));return vUrgent.length>0&&<div style={{marginBottom:10,display:"flex",flexDirection:"column",gap:3}}>
        {vUrgent.slice(0,4).map(i=><div key={i.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 12px",background:"var(--danger-bg)",borderRadius:10,borderLeft:"3px solid var(--danger-fg)"}}>
          <span style={{fontSize:9,fontWeight:800,color:"var(--danger-fg)",fontFamily:MN,flexShrink:0,marginTop:1}}>{i.category}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{i.subject||"(no subject)"}</div>
            <div style={{fontSize:9,color:T.textDim}}>{i.from}{arShowLabel(i)?` · ${arShowLabel(i)}`:""}</div>
            <input type="text" placeholder="add note..." value={intel.__arNotes?.[i.id]||""} onChange={e=>updateArNote(i.id,e.target.value)} style={{marginTop:3,width:"100%",fontSize:9,padding:"2px 6px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text2,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <span style={{fontSize:8,padding:"2px 6px",borderRadius:8,background:bucketB(i.bucket),color:bucketC(i.bucket),fontWeight:700,flexShrink:0}}>{i.bucket}</span>
          {renderSuggest(i)}
          <a href={gmailUrl(i.id)} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--danger-bg)",color:"var(--danger-fg)",fontWeight:700,textDecoration:"none",whiteSpace:"nowrap",flexShrink:0,border:"1px solid var(--danger-fg)"}}>email →</a>
          <button onClick={()=>markAr(i.id,"done",i.subject,i)} style={BTN_DONE}>Done</button>
          <button onClick={()=>markAr(i.id,"ignored",i.subject,i)} style={BTN_IGN}>Ignore</button>
        </div>)}
      </div>;})()}
      {(()=>{
        const todayShows=upcoming.filter(s=>s.date===today);
        const soonShows=upcoming.filter(s=>dU(s.date)<=14&&s.date!==today);
        const laterShows=upcoming.filter(s=>dU(s.date)>14).slice(0,5);
        const renderShowRow=(show,compact=false)=>{const days=dU(show.date),uc=days<=7?"var(--danger-fg)":days<=14?"var(--warn-fg)":days<=21?"var(--link)":"var(--text-mute)";const pc=pendingCount(show.date);
          const depts=DEPTS.filter(d=>d.id!=="all");
          const healthBars=!compact&&<div style={{display:"flex",gap:2,alignItems:"flex-end"}}>
            {depts.map(dept=>{const di=AT.filter(t=>t.dept===dept.id);const conf=di.filter(t=>(advances[show.date]?.items?.[t.id]?.status||"pending")==="confirmed").length;const pct=di.length>0?conf/di.length:1;return(<div key={dept.id} title={`${dept.label}: ${conf}/${di.length}`} style={{width:4,height:20,borderRadius:2,background:"var(--card-2)",overflow:"hidden",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
              <div style={{height:`${pct*100}%`,background:pct===1?"var(--success-fg)":pct>0.5?"var(--warn-fg)":"var(--danger-fg)"}}/>
            </div>);})}</div>;
          return(<div key={show.date} onClick={()=>{setSel(show.date);setTab("ros");}} className="br rh" style={{display:"grid",gridTemplateColumns:"34px 58px 1fr auto auto 30px",alignItems:"center",gap:6,padding:"9px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,cursor:"pointer",borderLeft:`3px solid ${uc}`}}>
            <div style={{fontFamily:MN,fontSize:9,color:T.textDim}}>{fW(show.date)}</div>
            <div style={{fontFamily:MN,fontSize:10,color:T.accent,fontWeight:700}}>{fD(show.date)}</div>
            <div><div style={{fontSize:11,fontWeight:700}}>{show.city}</div><div style={{fontSize:9,color:T.textDim}}>{show.venue}</div></div>
            <div style={{display:"flex",gap:3,alignItems:"center"}}>{pc>0&&<span style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--warn-bg)",color:T.warnFg,fontWeight:700,fontFamily:MN}}>{pc} open</span>}{show.notes?.includes("⚠")&&<span>⚠</span>}{healthBars}</div>
            <div style={{fontFamily:MN,fontSize:9,fontWeight:600,color:show.doorsConfirmed?"var(--success-fg)":"var(--warn-fg)",textAlign:"right"}}>{fmt(show.doors)}{show.doorsConfirmed?" ✓":" ?"}</div>
            <div style={{fontFamily:MN,fontSize:11,fontWeight:800,color:uc,textAlign:"right"}}>{days}d</div>
          </div>);};
        return(<div style={{marginBottom:12}}>
          {todayShows.length>0&&<div style={{marginBottom:8}}>
            <div style={{fontSize:9,fontWeight:800,color:"var(--danger-fg)",letterSpacing:"0.1em",marginBottom:5}}>TODAY</div>
            {todayShows.map(show=>{const pc=pendingCount(show.date);return(<div key={show.date} style={{background:"var(--danger-bg)",border:"2px solid var(--danger-fg)",borderRadius:10,padding:"12px 14px",marginBottom:4}}>
              <div style={{fontSize:16,fontWeight:800,color:T.text}}>{show.city}</div>
              <div style={{fontSize:10,color:T.textDim,marginBottom:8}}>{show.venue} · {show.promoter}</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
                <span style={{fontSize:10,fontFamily:MN,color:T.warnFg,fontWeight:700}}>DOORS {fmt(show.doors)}</span>
                <span style={{fontSize:10,fontFamily:MN,color:"var(--danger-fg)",fontWeight:700}}>CURFEW {fmt(show.curfew)}</span>
                {pc>0&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:"var(--warn-bg)",color:T.warnFg,fontWeight:700}}>{pc} advance open</span>}
              </div>
              <div style={{display:"flex",gap:5}}>
                <button onClick={e=>{e.stopPropagation();setSel(show.date);setTab("ros");}} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--danger-fg)",background:"transparent",color:"var(--danger-fg)",cursor:"pointer",fontWeight:700}}>→ ROS</button>
                <button onClick={e=>{e.stopPropagation();setSel(show.date);setTab("advance");}} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--warn-fg)",background:"transparent",color:T.warnFg,cursor:"pointer",fontWeight:700}}>→ Advance</button>
                <button onClick={e=>{e.stopPropagation();setSel(show.date);setTab("finance");}} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.text2,cursor:"pointer",fontWeight:700}}>→ Finance</button>
              </div>
            </div>);})}
          </div>}
          {soonShows.length>0&&<>
            <div style={{fontSize:9,fontWeight:800,color:T.warnFg,letterSpacing:"0.1em",marginBottom:5}}>NEXT 14 DAYS</div>
            <div style={{display:"flex",flexDirection:"column",gap:3,marginBottom:8}}>{soonShows.map(show=>renderShowRow(show))}</div>
          </>}
          {laterShows.length>0&&<>
            <div style={{fontSize:9,fontWeight:800,color:client.color,letterSpacing:"0.1em",marginBottom:5}}>{client.name.toUpperCase()} — UPCOMING</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>{laterShows.map(show=>renderShowRow(show,true))}</div>
          </>}
          {!todayShows.length&&!soonShows.length&&!laterShows.length&&<div style={{fontSize:11,color:T.textMute,textAlign:"center",padding:"20px 0"}}>No upcoming shows.</div>}
        </div>);
      })()}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {allTodos.length>0&&<div>
          <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",marginBottom:5,display:"flex",alignItems:"center",gap:8}}>
            <span>TO-DOs (PRIVATE) ({allTodos.length})</span>
            <div style={{marginLeft:"auto",display:"flex",border:"1px solid var(--border)",borderRadius:6,overflow:"hidden"}}>
              <button onClick={()=>setTodoSort("priority")} style={{fontSize:8,padding:"2px 7px",border:"none",background:todoSort==="priority"?"var(--accent)":"var(--card-2)",color:todoSort==="priority"?"var(--card)":T.textMute,cursor:"pointer",fontWeight:700}}>Priority</button>
              <button onClick={()=>setTodoSort("due")} style={{fontSize:8,padding:"2px 7px",border:"none",borderLeft:"1px solid var(--border)",background:todoSort==="due"?"var(--accent)":"var(--card-2)",color:todoSort==="due"?"var(--card)":T.textMute,cursor:"pointer",fontWeight:700}}>Due date</button>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {allTodos.map(t=>{
              const sid=showIdFor(t.show);
              const threads=intel[sid]?.threads||[];
              let matchedTid=t.threadTid||null,matchConf=t.threadTid?"high":null;
              if(!matchedTid&&threads.length){let best=null,bestScore=0;threads.forEach(th=>{const s=matchScore(t.text||"",th);if(s>bestScore){bestScore=s;best=th;}});const c=confOf(bestScore);if(c&&best){matchedTid=best.tid;matchConf=c;}}
              const confC=matchConf==="high"?"var(--success-fg)":matchConf==="medium"?"var(--warn-fg)":"var(--link)";
              const confBg=matchConf==="high"?"var(--success-bg)":matchConf==="medium"?"var(--warn-bg)":"var(--info-bg)";
              return(<div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:8,padding:"2px 6px",borderRadius:6,background:priB(t.priority),color:priC(t.priority),fontWeight:700,flexShrink:0,marginTop:1}}>{t.priority||"LOW"}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:T.text,lineHeight:1.4}}>{t.text}</div>{(t.owner||t.deadline)&&<div style={{fontSize:9,color:T.textDim}}>{t.owner}{t.deadline?` · due ${t.deadline}`:""}</div>}<input type="text" placeholder="add note..." value={intel[sid]?.todoNotes?.[t.id]||""} onChange={e=>updateTodoNote(t,e.target.value)} style={{marginTop:3,width:"100%",fontSize:9,padding:"2px 6px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text2,outline:"none",boxSizing:"border-box"}}/></div>
              <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                {matchedTid&&<a href={gmailUrl(matchedTid)} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:confBg,color:confC,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>email · {matchConf} →</a>}
                <button onClick={()=>markTodo(t,"done")} style={BTN_DONE}>Done</button>
                <button onClick={()=>markTodo(t,"ignored")} style={BTN_IGN}>Ignore</button>
              </div>
            </div>);})}
          </div>
        </div>}
        {allFollowUps.length>0&&<div>
          <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",marginBottom:5,display:"flex",alignItems:"center",gap:8}}>
            <span>FOLLOW-UPS ({allFollowUps.length})</span>
            <div style={{marginLeft:"auto",display:"flex",border:"1px solid var(--border)",borderRadius:6,overflow:"hidden"}}>
              <button onClick={()=>setFuSort("priority")} style={{fontSize:8,padding:"2px 7px",border:"none",background:fuSort==="priority"?"var(--accent)":"var(--card-2)",color:fuSort==="priority"?"var(--card)":T.textMute,cursor:"pointer",fontWeight:700}}>Priority</button>
              <button onClick={()=>setFuSort("due")} style={{fontSize:8,padding:"2px 7px",border:"none",borderLeft:"1px solid var(--border)",background:fuSort==="due"?"var(--accent)":"var(--card-2)",color:fuSort==="due"?"var(--card)":T.textMute,cursor:"pointer",fontWeight:700}}>Due date</button>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {allFollowUps.map((f,i)=>{
              const sid=showIdFor(f.show);
              const threads=intel[sid]?.threads||[];
              let matchedTid=f.tid||null,matchConf=f.tid?"high":null;
              if(!matchedTid&&threads.length){let best=null,bestScore=0;threads.forEach(th=>{const s=matchScore(f.action||"",th);if(s>bestScore){bestScore=s;best=th;}});const c=confOf(bestScore);if(c&&best){matchedTid=best.tid;matchConf=c;}}
              const confC=matchConf==="high"?"var(--success-fg)":matchConf==="medium"?"var(--warn-fg)":"var(--link)";
              const confBg=matchConf==="high"?"var(--success-bg)":matchConf==="medium"?"var(--warn-bg)":"var(--info-bg)";
              return(<div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:8,padding:"2px 6px",borderRadius:6,background:priB(f.priority),color:priC(f.priority),fontWeight:700,flexShrink:0,marginTop:1}}>{f.priority||"LOW"}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:T.text,lineHeight:1.4}}>{f.action}</div>{(f.owner||f.deadline)&&<div style={{fontSize:9,color:T.textDim}}>{f.owner}{f.deadline?` · due ${f.deadline}`:""}</div>}</div>
              <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                {matchedTid&&<a href={gmailUrl(matchedTid)} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:confBg,color:confC,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>email · {matchConf} →</a>}
                <button onClick={()=>markFollowUp(f,"done")} style={BTN_DONE}>Done</button>
                <button onClick={()=>markFollowUp(f,"ignored")} style={BTN_IGN}>Ignore</button>
              </div>
            </div>);})}
          </div>
        </div>}
        {(()=>{const vAr=arItems.filter(i=>role!=="viewer"||!FIN_LEGAL.has(i.category));return vAr.length>0&&<div>
          <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",marginBottom:5}}>ACTION REQUIRED ({vAr.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {vAr.slice(0,25).map(i=><div key={i.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:8,padding:"2px 6px",borderRadius:6,background:bucketB(i.bucket),color:bucketC(i.bucket),fontWeight:700,flexShrink:0,marginTop:1}}>{i.bucket}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{i.subject||"(no subject)"}</div><div style={{fontSize:9,color:T.textDim}}>{i.from}{arShowLabel(i)?` · ${arShowLabel(i)}`:""}</div></div>
              <span style={{fontSize:8,color:T.textMute,fontFamily:MN,flexShrink:0,paddingTop:2}}>{i.category}</span>
              {renderSuggest(i)}
              <a href={gmailUrl(i.id)} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--info-bg)",color:T.link,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>email →</a>
              <button onClick={()=>markAr(i.id,"done",i.subject,i)} style={BTN_DONE}>Done</button>
              <button onClick={()=>markAr(i.id,"ignored",i.subject,i)} style={BTN_IGN}>Ignore</button>
            </div>)}
          </div>
        </div>;})()}
        {logisticsItems.length>0&&<div>
          <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",marginBottom:5}}>UPCOMING LOGISTICS ({logisticsItems.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {logisticsItems.map((i,idx)=><div key={idx} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:8,padding:"2px 6px",borderRadius:6,background:"var(--info-bg)",color:T.link,fontWeight:700,flexShrink:0,marginTop:1}}>{i.category}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{i.subject||"(no subject)"}</div><div style={{fontSize:9,color:T.textDim}}>{i.from}</div></div>
              {renderSuggest(i)}
              <a href={gmailUrl(i.id)} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--info-bg)",color:T.link,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>email →</a>
              <button onClick={()=>markAr(i.id,"done",i.subject,i)} style={BTN_DONE}>Done</button>
              <button onClick={()=>markAr(i.id,"ignored",i.subject,i)} style={BTN_IGN}>Ignore</button>
            </div>)}
          </div>
        </div>}
      </div>
      <button onClick={()=>setTab("advance")} style={{marginTop:12,background:client.color,border:"none",borderRadius:6,color:"#fff",fontSize:11,padding:"8px 16px",cursor:"pointer",fontWeight:700}}>Open Advance Tracker →</button>
    </div>
  );
}
