import { useContext, useEffect, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { logAudit } from "../../lib/audit";
import { TEAM_MEMBERS } from "../../lib/constants";
import { AT, CM, DEPTS, DM, MN, SC, SC_ORDER } from "../../lib/domain-constants";
import { confOf, fmtAudit, gmailUrl, matchScore, showIdFor, suggestStatusFromThread } from "../../lib/intel";
import { dU, fFull } from "../../lib/time";
import { T } from "../../styles/tokens";
import { useAuth } from "../AuthGate";
import { IntelPanel } from "../intel/IntelPanel";
import { NotesPanel } from "../notes/NotesPanel";
import { ImmigrationPanel } from "../production/ImmigrationPanel";
import { StatusBtn } from "../shared/StatusBtn";

export function AdvTab(){
  const{shows,cShows,advances,uAdv,sel,setSel,eventKey,aC,mobile,checkPriv,uCheckPriv,intel,setIntel,addLog,pushUndo,addActLog}=useContext(Ctx);
  const a=useAuth();const meEmail=a?.user?.email||"unknown";
  const[openDone,setOpenDone]=useState({});
  useEffect(()=>setOpenDone({}),[sel]);
  const client=CM[aC];const today=new Date().toISOString().slice(0,10);
  const upcoming=cShows.filter(s=>s.date>=today);
  const[activeDept,setActiveDept]=useState("all");
  const[showEmail,setShowEmail]=useState(false);
  const[emailDept,setEmailDept]=useState("all");
  const[addingDept,setAddingDept]=useState(null);
  const[newQ,setNewQ]=useState("");
  const[newDir,setNewDir]=useState("bilateral");
  const[newScope,setNewScope]=useState("public");
  const[editId,setEditId]=useState(null);
  const[editQ,setEditQ]=useState("");

  const show=shows[sel];
  const adv=advances[eventKey]||{};
  const items=adv.items||{};
  const customItems=adv.customItems||[];
  const overrides=adv.itemOverrides||{};

  const privList=checkPriv[eventKey]||[];
  const allItems=useMemo(()=>[...AT,...customItems,...privList],[customItems,privList]);
  const getQ=item=>overrides[item.id]?.q||item.q;
  const getStatus=id=>{const it=allItems.find(x=>x.id===id);if(it?.private)return it.status||"pending";return items[id]?.status||"pending";};
  const setStatus=(id,status)=>{const it=allItems.find(x=>x.id===id);
    const meta=status==="confirmed"?{confirmedBy:meEmail,confirmedAt:new Date().toISOString()}:{confirmedBy:null,confirmedAt:null};
    const prevStatus=it?.private?(privList.find(p=>p.id===id)?.status||"pending"):(items[id]?.status||"pending");
    if(it?.private)uCheckPriv(eventKey,privList.map(p=>p.id===id?{...p,status,...meta}:p));
    else uAdv(eventKey,{items:{...items,[id]:{...items[id],status,...meta}}});
    if(prevStatus!==status){
      logAudit({entityType:"advance",entityId:`${eventKey}:${id}`,action:"status_change",
        before:{status:prevStatus},after:{status},
        meta:{private:!!it?.private,question:it?.q||null},
        teamScoped:!it?.private});
      addLog({type:"user",section:"advance",showId:sid||eventKey,action:"status",label:`${it?.q||id}: ${prevStatus}→${status}`,from:"advance_tab"});
    }};
  const setOverride=(id,q)=>uAdv(eventKey,{itemOverrides:{...overrides,[id]:{...overrides[id],q}}});
  const deleteCustom=id=>{const it=allItems.find(x=>x.id===id);if(!it)return;
    if(it.private){const prev=privList;uCheckPriv(eventKey,privList.filter(c=>c.id!==id));pushUndo(`Deleted "${(it.q||"").slice(0,40)}"`,()=>uCheckPriv(eventKey,prev));}
    else{const prev=customItems;uAdv(eventKey,{customItems:customItems.filter(c=>c.id!==id)});pushUndo(`Deleted "${(it.q||"").slice(0,40)}"`,()=>uAdv(eventKey,{customItems:prev}));}};
  const addCustom=dept=>{if(!newQ.trim())return;const it={id:`c${Date.now()}`,dept,dir:newDir,q:newQ.trim(),custom:true};if(newScope==="private"){uCheckPriv(eventKey,[...privList,{...it,private:true,status:"pending"}]);}else{uAdv(eventKey,{customItems:[...customItems,it]});}setNewQ("");setNewDir("bilateral");setNewScope("public");setAddingDept(null);};

  const itemDependents=adv.itemDependents||{};
  const getDependents=id=>itemDependents[id]||[];
  const toggleDependent=(id,memberId)=>{
    const cur=itemDependents[id]||[];
    const next=cur.includes(memberId)?cur.filter(x=>x!==memberId):[...cur,memberId];
    uAdv(eventKey,{itemDependents:{...itemDependents,[id]:next}});
  };

  const deptCounts=useMemo(()=>{const r={};DEPTS.filter(d=>d.id!=="all").forEach(d=>{const di=allItems.filter(t=>t.dept===d.id);r[d.id]={total:di.length,pending:di.filter(t=>getStatus(t.id)==="pending").length};});return r;},[allItems,items]);

  const sid=show?showIdFor(show):"";
  const matches=useMemo(()=>{
    const data=intel[sid]||{};const threads=data.threads||[];const dismissed=new Set(data.dismissedMatches||[]);
    const out=[];
    allItems.forEach(item=>{
      if(getStatus(item.id)==="confirmed")return;
      let best=null,bestScore=0;
      threads.forEach(t=>{const s=matchScore(getQ(item),t);if(s>bestScore){bestScore=s;best=t;}});
      const c=confOf(bestScore);
      if(c&&best){const k=`${item.id}__${best.tid}`;if(!dismissed.has(k)){
        const sug=suggestStatusFromThread(best,getStatus(item.id));
        out.push({itemId:item.id,threadTid:best.tid,subject:best.subject,from:best.from,snippet:best.snippet,confidence:c,key:k,suggested:sug?.status||"confirmed",reason:sug?.reason||null});
      }}
    });
    return out;
  },[allItems,intel,sid,items,privList]);
  const matchFor=(id)=>matches.find(m=>m.itemId===id);

  const applyMatch=(m,targetStatus)=>{
    const prev=getStatus(m.itemId);const st=targetStatus||m.suggested||"confirmed";
    setStatus(m.itemId,st);
    setIntel(p=>({...p,[sid]:{...(p[sid]||{}),dismissedMatches:[...(p[sid]?.dismissedMatches||[]),m.key]}}));
    addActLog({module:"intel",action:"intel.match.accept",target:{type:"thread",id:m.threadTid,label:m.subject},payload:{itemId:m.itemId,confidence:m.confidence,suggestedStatus:m.suggested},context:{date:sel,showId:sid,eventKey:sid}});
    addActLog({module:"intel",action:"intel.status.apply",target:{type:"item",id:m.itemId,label:null},payload:{status:st,source:"suggested"},context:{date:sel,showId:sid,eventKey:sid}});
    logAudit({entityType:"advance",entityId:`${sel}:${m.itemId}`,action:"intel_sync",
      before:{status:prev},after:{status:st},
      meta:{source:"intel-suggest",threadTid:m.threadTid,confidence:m.confidence,reason:m.reason||null,subject:m.subject}});
    pushUndo(`Marked ${SC[st]?.l||st}.`,()=>{setStatus(m.itemId,prev);setIntel(p=>({...p,[sid]:{...(p[sid]||{}),dismissedMatches:(p[sid]?.dismissedMatches||[]).filter(k=>k!==m.key)}}));});
  };
  const confirmMatch=(m)=>applyMatch(m,"confirmed");

  const showDepts=activeDept==="all"?DEPTS.filter(d=>d.id!=="all"):DEPTS.filter(d=>d.id===activeDept);
  const totalPending=allItems.filter(t=>getStatus(t.id)==="pending").length;

  const genEmail=()=>{
    if(!show)return"";
    const tgt=emailDept==="all"?allItems:allItems.filter(t=>t.dept===emailDept);
    const contacts=(show.advance||[]).filter(c=>emailDept==="all"||c.dept===emailDept).map(c=>`${c.name} <${c.email}> (${c.role})`).join(", ")||"[advance contacts]";
    const byDept={};tgt.forEach(t=>{if(!byDept[t.dept])byDept[t.dept]=[];byDept[t.dept].push(t);});
    let b=`To: ${contacts}\nSubject: ${show.venue}, ${show.city} — ${fFull(show.date)} | Advance\n\nHey ${show.advance?.[0]?.name?.split(" ")[0]||"Team"},\n\nAdvancing our appearance at ${show.venue} on ${fFull(show.date)}. Please review the items below and respond directly.\n\n`;
    Object.entries(byDept).forEach(([dept,dItems])=>{
      b+=`── ${DM[dept]?.label?.toUpperCase()||dept.toUpperCase()} ──\n`;
      dItems.forEach((item,i)=>{const dir=item.dir==="we_provide"?"[We provide]":item.dir==="they_provide"?"[Please provide]":"[Bilateral]";b+=`${i+1}. ${dir} ${getQ(item)}\n`;});b+="\n";
    });
    b+=`──\nDavon Johnson\nDay of Show, LLC | d.johnson@dayofshow.net | 337.326.0041\n\nCONFIDENTIALITY DISCLAIMER: This message is confidential and intended only for the person(s) named above.`;
    return b;
  };

  if(!show)return(
    <div style={{padding:40,textAlign:"center",color:T.textDim}}>
      <div style={{fontSize:32,marginBottom:12,opacity:0.3}}>◎</div>
      <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:6}}>Select a show to start advancing</div>
      <div style={{fontSize:11,color:T.textDim,marginBottom:16,maxWidth:280,margin:"0 auto 16px"}}>Choose a date from the sidebar or use ← → to navigate shows.</div>
      {upcoming.length>0&&<button onClick={()=>setSel(upcoming[0].date)} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"8px 20px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Jump to next show →</button>}
    </div>
  );

  const SLA_THRESHOLDS={catering:14,production:21,hospitality:10,merch:7,security:7};
  const daysOut=sel?dU(sel):null;
  const slaViolations=daysOut!=null?DEPTS.filter(d=>d.id!=="all"&&SLA_THRESHOLDS[d.id]&&daysOut<=SLA_THRESHOLDS[d.id]&&(deptCounts[d.id]?.pending||0)>0).map(d=>({dept:d,threshold:SLA_THRESHOLDS[d.id],pending:deptCounts[d.id].pending})):[];

  return(
    <div className="fi" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 115px)",position:"relative"}}>
      <div style={{padding:"6px 20px",borderBottom:"1px solid var(--border)",background:"var(--card)",display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,fontSize:11}}>{show.venue}</span>
        <span style={{fontSize:11,color:T.textDim}}>{show.city} · {fFull(sel)}</span>
        <span style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:totalPending===0?"var(--success-bg)":"var(--warn-bg)",color:totalPending===0?"var(--success-fg)":"var(--warn-fg)",fontWeight:700}}>{totalPending===0?"Complete":`${totalPending} pending`}</span>
      </div>
      {slaViolations.length>0&&<div style={{padding:"4px 20px",background:"var(--warn-bg)",borderBottom:"1px solid var(--warn-fg)",display:"flex",gap:6,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontSize:8,fontWeight:800,color:T.warnFg,fontFamily:MN,flexShrink:0}}>SLA</span>
        {slaViolations.map(v=><span key={v.dept.id} style={{fontSize:8,padding:"2px 7px",borderRadius:99,background:v.dept.bg,color:v.dept.color,fontWeight:700}}>{v.dept.label} {v.pending} open · due {v.threshold}d out</span>)}
      </div>}
      {!showEmail&&<div style={{padding:"4px 20px",borderBottom:"1px solid var(--border)",background:"var(--card-3)",display:"flex",gap:2,overflowX:"auto",flexShrink:0,scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
        {DEPTS.map(d=>{const isA=activeDept===d.id;const cnt=d.id==="all"?null:deptCounts[d.id];const pct=cnt&&cnt.total>0?((cnt.total-cnt.pending)/cnt.total)*100:100;
          return(<button key={d.id} onClick={()=>setActiveDept(d.id)} style={{flexShrink:0,padding:"4px 10px 5px",borderRadius:99,border:isA?`1.5px solid ${d.color}`:"1px solid var(--border)",background:isA?d.bg:"transparent",color:isA?d.color:T.textDim,fontSize:9,fontWeight:isA?700:500,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span>{d.label}</span>
              {cnt&&cnt.pending>0&&<span style={{fontSize:8,background:d.color,color:"#fff",borderRadius:10,padding:"1px 4px",fontWeight:700}}>{cnt.pending}</span>}
            </div>
            {cnt&&cnt.total>0&&<div style={{width:"100%",minWidth:36,height:2,background:"rgba(255,255,255,0.15)",borderRadius:99}}>
              <div style={{width:`${pct}%`,height:"100%",background:cnt.pending===0?"var(--success-fg)":isA?"rgba(255,255,255,0.7)":d.color,borderRadius:99,transition:"width 0.4s ease"}}/>
            </div>}
          </button>);
        })}
      </div>}
      {!showEmail&&activeDept!=="all"&&(deptCounts[activeDept]?.pending||0)>0&&<div style={{padding:"5px 20px",background:"var(--card-2)",borderBottom:"1px solid var(--border)",display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
        <span style={{fontSize:9,color:T.textDim,fontFamily:MN}}>{deptCounts[activeDept]?.pending} pending in {DM[activeDept]?.label}</span>
        <button onClick={()=>allItems.filter(t=>t.dept===activeDept&&getStatus(t.id)==="pending").forEach(t=>setStatus(t.id,"in_progress"))} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--link)",background:"var(--info-bg)",color:T.link,cursor:"pointer",fontWeight:700}}>Mark all In Progress</button>
        <button onClick={()=>{setEmailDept(activeDept);setShowEmail(true);}} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card)",color:T.text2,cursor:"pointer",fontWeight:700}}>Draft Advance Email</button>
      </div>}
      <div style={{flex:1,overflow:"auto",padding:"10px 20px 30px"}}>
        {showEmail?(
          <div>
            <div style={{fontSize:10,color:T.textDim,marginBottom:6,fontWeight:600}}>ADVANCE EMAIL — {DM[emailDept]?.label?.toUpperCase()||"ALL DEPTS"}</div>
            <pre style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px",fontSize:9,fontFamily:MN,color:T.text,lineHeight:1.7,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{genEmail()}</pre>
            <button onClick={()=>navigator.clipboard.writeText(genEmail())} style={{marginTop:8,background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:T.text,fontSize:10,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>Copy</button>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <IntelPanel/>
            <ImmigrationPanel/>
            {showDepts.map(dept=>{
              const dItems=allItems.filter(t=>t.dept===dept.id);
              if(!dItems.length)return null;
              const dPending=dItems.filter(t=>getStatus(t.id)!=="confirmed");
              const dDone=dItems.filter(t=>getStatus(t.id)==="confirmed");
              const pending=dPending.filter(t=>getStatus(t.id)==="pending").length;
              const renderRow=(item,idx,arr,muted)=>{
                const status=getStatus(item.id);const q=getQ(item);
                const isEditing=editId===item.id;const canEdit=!item.locked;const isCustom=!!item.custom;
                const meta=item.private?item:(items[item.id]||{});
                const emailMatch=(()=>{const m=matchFor(item.id);if(!m)return null;
                  const col=m.confidence==="high"?"var(--success-fg)":m.confidence==="medium"?"var(--warn-fg)":"var(--text-dim)";
                  const bg=m.confidence==="high"?"var(--success-bg)":m.confidence==="medium"?"var(--warn-bg)":"var(--card-2)";
                  const sug=m.suggested||"confirmed";const sugMeta=SC[sug]||SC.confirmed;
                  const tip=m.reason?`${m.subject} — ${m.from}\n→ suggests "${sugMeta.l}" (${m.reason})`:`${m.subject} — ${m.from}`;
                  return <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <a href={gmailUrl(m.threadTid)} target="_blank" rel="noopener noreferrer" title={tip} style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:bg,color:col,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>email · {m.confidence} →</a>
                    <button onClick={()=>applyMatch(m,sug)} title={m.reason?`Auto-suggested: ${m.reason}`:"Apply suggested status"} style={{fontSize:8,padding:"2px 7px",borderRadius:4,border:"none",background:sugMeta.c,color:"#fff",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>{sugMeta.l}</button>
                    <select value="" onChange={e=>{if(e.target.value)applyMatch(m,e.target.value);}} title="Apply different status" style={{fontSize:8,padding:"2px 3px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-3)",color:T.text2,cursor:"pointer",fontWeight:600}}>
                      <option value="">···</option>
                      {SC_ORDER.filter(s=>s!==sug).map(s=><option key={s} value={s}>{SC[s]?.l||s}</option>)}
                    </select>
                  </div>;
                })();
                return(
                  <div key={item.id} style={{display:"grid",gridTemplateColumns:"18px 1fr auto auto",gap:"0 8px",padding:"8px 14px",borderBottom:idx<arr.length-1?"1px solid var(--card-3)":"none",background:isEditing?"var(--warn-bg)":"transparent",opacity:muted?0.7:1,alignItems:"start"}}>
                    <span style={{fontFamily:MN,fontSize:8,color:T.textMute,paddingTop:3,textAlign:"right"}}>{idx+1}.</span>
                    <div style={{minWidth:0}}>
                      {isEditing?(
                        <input autoFocus value={editQ} onChange={e=>setEditQ(e.target.value)}
                          onBlur={()=>{setOverride(item.id,editQ);setEditId(null);}}
                          onKeyDown={e=>{if(e.key==="Enter"){setOverride(item.id,editQ);setEditId(null);}if(e.key==="Escape")setEditId(null);}}
                          style={{width:"100%",background:"var(--card)",border:`1.5px solid ${dept.color}`,borderRadius:4,color:T.text,fontSize:10,padding:"3px 7px",outline:"none"}}/>
                      ):(
                        <div style={{display:"flex",alignItems:"flex-start",gap:4}}>
                          <span style={{fontSize:10,color:status==="na"?"var(--text-mute)":"var(--text)",fontWeight:500,lineHeight:1.5,flex:1,textDecoration:status==="na"?"line-through":"none"}}>{q}</span>
                          {canEdit&&!isEditing&&<button onClick={()=>{setEditId(item.id);setEditQ(q);}} style={{flexShrink:0,background:"none",border:"none",cursor:"pointer",color:"var(--text-faint)",fontSize:11,padding:"0 2px",lineHeight:1.5}} title="Edit item">✎</button>}
                          {isCustom&&<button onClick={()=>deleteCustom(item.id)} style={{flexShrink:0,background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13,padding:"0 2px",lineHeight:1.5}} title="Delete">×</button>}
                        </div>
                      )}
                      {status==="confirmed"&&meta.confirmedBy&&<div style={{fontSize:8,color:T.textMute,marginTop:1,fontFamily:MN}}>✓ {meta.confirmedBy} · {fmtAudit(meta.confirmedAt)}</div>}
                      <div style={{display:"flex",alignItems:"center",gap:3,marginTop:4,flexWrap:"wrap"}}>
                        <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:item.dir==="we_provide"?"var(--accent-pill-bg)":item.dir==="they_provide"?"var(--success-bg)":"var(--card-2)",color:item.dir==="we_provide"?"var(--accent)":item.dir==="they_provide"?"var(--success-fg)":"var(--text-2)",fontWeight:600}}>{item.dir==="we_provide"?"We":"They"}</span>
                        {item.locked&&<span style={{fontSize:8,color:T.textMute,fontFamily:MN}}>🔒</span>}
                        {isCustom&&<span style={{fontSize:8,color:dept.color,fontWeight:700}}>custom</span>}
                        {item.private&&<span style={{fontSize:8,color:"var(--text-3)",fontWeight:700,background:"var(--border)",padding:"1px 4px",borderRadius:4}}>private</span>}
                        {!item.private&&<span style={{color:"var(--border)",fontSize:8,margin:"0 1px"}}>·</span>}
                        {!item.private&&TEAM_MEMBERS.map(m=>{const active=getDependents(item.id).includes(m.id);return(
                          <button key={m.id} onClick={()=>toggleDependent(item.id,m.id)} title={`${active?"Remove":"Mark"} ${m.label} as dependent`}
                            style={{fontSize:8,padding:"1px 5px",borderRadius:4,fontWeight:700,cursor:"pointer",border:"none",
                              background:active?"var(--warn-bg)":"var(--card-2)",color:active?"var(--warn-fg)":"var(--text-mute)"}}>{m.initials}</button>
                        );})}
                      </div>
                    </div>
                    <div style={{paddingTop:1}}>{emailMatch}</div>
                    <div style={{paddingTop:1,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                      <StatusBtn status={status} setStatus={(ns)=>setStatus(item.id,ns)} mobile={mobile}/>
                      {status!=="confirmed"&&(()=>{const dc=(show.advance||[]).find(c=>c.dept===item.dept);return dc?<a href={`mailto:${dc.email}?subject=${encodeURIComponent(`${show.venue}, ${show.city} — ${fFull(sel)} | ${DM[item.dept]?.label||""} Advance`)}`} title={`Email ${dc.name}`} style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:"var(--info-bg)",color:T.link,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>✉ {dc.name.split(" ")[0]}</a>:null;})()}
                    </div>
                  </div>
                );
              };
              return(
                <div key={dept.id} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
                  <div style={{padding:"8px 14px",background:dept.bg,display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid var(--border)"}}>
                    <span style={{fontSize:9,fontWeight:800,letterSpacing:"0.07em",color:dept.color}}>{dept.label.toUpperCase()}</span>
                    {pending>0&&<span style={{fontSize:8,color:dept.color,fontFamily:MN,fontWeight:700}}>{pending} pending</span>}
                    <span style={{fontSize:8,color:T.textMute,marginLeft:"auto"}}>{dPending.length} open · {dDone.length} done</span>
                  </div>
                  <div>
                    {dPending.map((item,idx)=>renderRow(item,idx,dPending,false))}
                    {dDone.length>0&&<div style={{borderTop:"1px solid var(--card-3)"}}>
                      <button onClick={()=>setOpenDone(p=>({...p,[dept.id]:!p[dept.id]}))} style={{width:"100%",textAlign:"left",padding:"6px 14px",background:"var(--card-3)",border:"none",cursor:"pointer",fontSize:9,fontWeight:700,color:T.successFg,letterSpacing:"0.06em",display:"flex",alignItems:"center",gap:6}}>
                        <span>✓ Confirmed ({dDone.length})</span>
                        <span style={{marginLeft:"auto",color:T.textMute}}>{openDone[dept.id]?"▾":"▸"}</span>
                      </button>
                      {openDone[dept.id]&&<div>{dDone.map((item,idx)=>renderRow(item,idx,dDone,true))}</div>}
                    </div>}
                    {addingDept===dept.id?(
                      <div style={{padding:"8px 14px",borderTop:"1px solid var(--card-3)",background:"var(--card-3)"}}>
                        <input autoFocus placeholder="Describe the advance item..." value={newQ} onChange={e=>setNewQ(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addCustom(dept.id);if(e.key==="Escape")setAddingDept(null);}} style={{width:"100%",background:"var(--card)",border:`1.5px solid ${dept.color}`,borderRadius:6,color:T.text,fontSize:10,padding:"5px 8px",outline:"none",marginBottom:5}}/>
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          <select value={newDir} onChange={e=>setNewDir(e.target.value)} style={{fontSize:9,padding:"3px 5px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card)"}}>
                            <option value="we_provide">We provide</option><option value="they_provide">They provide</option><option value="bilateral">Bilateral</option>
                          </select>
                          <select value={newScope} onChange={e=>setNewScope(e.target.value)} style={{fontSize:9,padding:"3px 5px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card)"}}>
                            <option value="public">Public</option><option value="private">Private</option>
                          </select>
                          <button onClick={()=>addCustom(dept.id)} style={{background:dept.color,border:"none",borderRadius:4,color:"#fff",fontSize:9,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>Add</button>
                          <button onClick={()=>{setAddingDept(null);setNewQ("");}} style={{background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:4,color:T.textDim,fontSize:9,padding:"3px 8px",cursor:"pointer"}}>Cancel</button>
                        </div>
                      </div>
                    ):(
                      <div style={{padding:"5px 14px",borderTop:"1px solid var(--card-3)"}}>
                        <button onClick={()=>setAddingDept(dept.id)} style={{background:"none",border:`1px dashed ${dept.color}50`,borderRadius:6,color:dept.color,fontSize:9,padding:"3px 10px",cursor:"pointer",fontWeight:600,width:"100%",textAlign:"left"}}>+ Add custom {DM[dept.id]?.label} item</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <NotesPanel/>
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:9,fontWeight:700,color:T.textDim,marginBottom:6,letterSpacing:"0.06em"}}>THREAD & NOTES</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <div><div style={{fontSize:9,color:T.textDim,marginBottom:2}}>Gmail thread link</div><input defaultValue={adv.threadLink||""} onBlur={e=>uAdv(eventKey,{threadLink:e.target.value})} placeholder="https://mail.google.com/..." style={{width:"100%",background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:T.text,fontSize:10,fontFamily:MN,padding:"4px 7px",outline:"none"}}/></div>
                <div><div style={{fontSize:9,color:T.textDim,marginBottom:2}}>Notes</div><textarea defaultValue={adv.notes||""} onBlur={e=>uAdv(eventKey,{notes:e.target.value})} placeholder="Open issues, follow-ups..." rows={2} style={{width:"100%",background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:T.text,fontSize:10,padding:"4px 7px",outline:"none",resize:"vertical",fontFamily:"inherit"}}/></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
