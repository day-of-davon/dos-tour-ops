import React, { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN, UI } from "../../lib/domain-constants";
import { FIELD_KEYS, deduplicateIntel, fmtAudit, fmtMin, gmailUrl, parseAllTimes, showIdFor } from "../../lib/intel";
import { supabase } from "../../lib/supabase";
import { T } from "../../styles/tokens";
import { IntelSection } from "./IntelSection";

export function IntelPanel(){
  const{sel,shows,intel,setIntel,addLog,refreshIntel,toggleIntelShare,refreshing,refreshMsg,uShow,labelIntel,addActLog,role}=useContext(Ctx);
  const show=shows[sel];const sid=show?showIdFor(show):"";const data=intel[sid]||{};
  const upd=patch=>setIntel(p=>({...p,[sid]:{...(p[sid]||{}),...patch}}));
  const primaryTid=(data.threads||[]).find(t=>t.tid)?.tid||null;
  const threadHref=(tid)=>tid?gmailUrl(tid):null;
  const[drafts,setDrafts]=useState({});
  const[showCompleted,setShowCompleted]=useState(false);
  const[intelSort,setIntelSort]=useState("priority");
  const draftReply=async(tid)=>{
    setDrafts(p=>({...p,[tid]:{status:"loading"}}));
    const{data:{session}}=await supabase.auth.getSession();
    if(!session?.provider_token){setDrafts(p=>({...p,[tid]:{status:"error",error:"Gmail token missing — re-login"}}));return;}
    try{
      const resp=await fetch("/api/comms",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({tid,show,googleToken:session.provider_token})});
      const json=await resp.json();
      if(!resp.ok){setDrafts(p=>({...p,[tid]:{status:"error",error:json.error||"Draft failed"}}));return;}
      setDrafts(p=>({...p,[tid]:{status:"done",text:json.draft,subject:json.subject,participants:json.participants,replyTo:json.replyTo}}));
    }catch(e){setDrafts(p=>({...p,[tid]:{status:"error",error:e.message||"Network error"}}));}
  };
  const clearDraft=tid=>setDrafts(p=>{const n={...p};delete n[tid];return n;});
  const DraftPanel=({tid})=>{
    const d=drafts[tid];if(!d)return null;
    if(d.status==="loading")return<div style={{padding:"6px 0 4px 0",fontSize:9,color:T.textMute,fontFamily:MN}}>Drafting…</div>;
    if(d.status==="error")return<div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0"}}>
      <span style={{fontSize:9,color:"var(--danger-fg)"}}>{d.error}</span>
      <button onClick={()=>clearDraft(tid)} style={{background:"none",border:"none",cursor:"pointer",color:T.textMute,fontSize:11}}>×</button>
    </div>;
    return<div style={{marginTop:4,border:"1px solid var(--accent)",borderRadius:6,padding:"8px 10px",background:"var(--card-2)",display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:8,fontWeight:800,color:T.accent,letterSpacing:"0.06em"}}>DRAFT REPLY</span>
        <span style={{fontSize:8,color:T.textMute,fontFamily:MN,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.subject}</span>
        <button onClick={()=>clearDraft(tid)} title="Close draft" style={{background:"none",border:"none",cursor:"pointer",color:T.textMute,fontSize:11,flexShrink:0}}>×</button>
      </div>
      <textarea value={d.text} onChange={e=>setDrafts(p=>({...p,[tid]:{...p[tid],text:e.target.value}}))} rows={6} style={{width:"100%",fontFamily:MN,fontSize:9,padding:"6px 8px",border:"1px solid var(--border)",borderRadius:4,resize:"vertical",background:"var(--card)",color:T.text,lineHeight:1.5}}/>
      <div style={{display:"flex",gap:5,alignItems:"center"}}>
        <button onClick={()=>{
          navigator.clipboard.writeText(d.text).catch(()=>{});
          window.open(gmailUrl(tid),"_blank","noopener");
          setDrafts(p=>({...p,[tid]:{...p[tid],copied:true}}));
        }} style={{fontSize:8,padding:"3px 9px",borderRadius:4,border:"1px solid var(--accent)",background:"var(--accent)",color:"var(--card)",cursor:"pointer",fontWeight:700}}>Open thread + copy ↗</button>
        <button onClick={()=>{navigator.clipboard.writeText(d.text);setDrafts(p=>({...p,[tid]:{...p[tid],copied:true}}));}} style={{fontSize:8,padding:"3px 9px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card)",color:T.text2,cursor:"pointer",fontWeight:700}}>Copy only</button>
        {d.copied&&<span style={{fontSize:8,color:T.successFg,fontFamily:MN}}>copied — hit Reply all + Cmd+V</span>}
      </div>
    </div>;
  };
  const arDone=useMemo(()=>new Set(intel.__arState?.done||[]),[intel.__arState]);
  const arIgnored=useMemo(()=>new Set(intel.__arState?.ignored||[]),[intel.__arState]);
  const markArIntel=(id,state,label)=>{
    setIntel(p=>{const prev=p.__arState||{};const next=state==="undone"?{...prev,done:(prev.done||[]).filter(x=>x!==id)}:{...prev,[state]:[...new Set([...(prev[state]||[]),id])]};return{...p,__arState:next};});
    addLog({type:"user",section:"ar",showId:sid,action:state,label,from:"intel_panel"});
    addActLog({module:"intel",action:`intel.ar.${state}`,target:{type:"ar_item",id,label:label||id},payload:{showId:sid},context:{date:sel,showId:sid,eventKey:sid}});
  };
  const arNotes=useMemo(()=>intel.__arState?.notes||{},[intel.__arState]);
  const saveArNote=(id,text)=>setIntel(p=>{const prev=p.__arState||{};const notes={...(prev.notes||{})};if(text)notes[id]=text;else delete notes[id];return{...p,__arState:{...prev,notes}};});
  const[arNoteOpen,setArNoteOpen]=useState({});
  const toggleArNote=id=>setArNoteOpen(p=>({...p,[id]:!p[id]}));
  const toggleTodo=(id,currentDone,label)=>{upd({todos:(data.todos||[]).map(t=>t.id===id?{...t,done:!t.done}:t)});addLog({type:"user",section:"todo",showId:sid,action:currentDone?"undone":"done",label,from:"intel_panel"});};
  const delTodo=id=>upd({todos:(data.todos||[]).filter(t=>t.id!==id)});
  const dismissFlag=k=>upd({dismissedFlags:[...(data.dismissedFlags||[]),k]});
  const addTodo=()=>upd({todos:[...(data.todos||[]),{id:`t${Date.now()}`,text:"New action item",priority:"MED",done:false,ts:Date.now()}]});
  const addThread=()=>upd({threads:[...(data.threads||[]),{tid:`m${Date.now()}`,subject:"New thread",from:"",intent:"manual",date:new Date().toISOString().slice(0,10),manual:true}]});
  const delThread=tid=>upd({threads:(data.threads||[]).filter(t=>t.tid!==tid)});
  const addFollowUp=()=>upd({followUps:[...(data.followUps||[]),{action:"New follow-up",owner:"",priority:"MED",deadline:"",manual:true}]});
  const delFollowUp=i=>upd({followUps:(data.followUps||[]).filter((_,idx)=>idx!==i)});
  const restoreFollowUp=i=>{upd({followUps:(data.followUps||[]).map((x,idx)=>idx===i?{...x,done:false}:x)});addLog({type:"user",section:"followup",showId:sid,action:"restored",label:(data.followUps||[])[i]?.action||"",from:"intel_panel"});};
  const addManualFlag=()=>upd({manualFlags:[...(data.manualFlags||[]),{key:`m${Date.now()}`,label:"New inconsistency",severity:"UNCONFIRMED",platform:"",emailVal:"",snippet:""}]});
  const delManualFlag=k=>upd({manualFlags:(data.manualFlags||[]).filter(f=>f.key!==k)});
  const updManualFlag=(k,patch)=>upd({manualFlags:(data.manualFlags||[]).map(f=>f.key===k?{...f,...patch}:f)});
  const scheduleFlags=useMemo(()=>{
    if(!show)return[];const out=[];const dismissed=new Set(data.dismissedFlags||[]);const seen=new Set();
    const addFlag=(key,fld,emailVal,snippet,threadTid)=>{
      if(dismissed.has(key)||seen.has(key))return;
      const cur=show[fld.field];const conf=show[fld.field+"Confirmed"];
      let severity=null;
      if(cur==null||cur===0||!conf)severity="UNCONFIRMED";
      else if(cur!==emailVal)severity="CONFLICT";
      if(!severity)return;
      seen.add(key);
      out.push({key,field:fld.field,label:fld.label,platform:cur?fmtMin(cur):"(not set)",emailVal:fmtMin(emailVal),emailValMinutes:emailVal,snippet,threadTid,severity});
    };
    const fldByName=Object.fromEntries(FIELD_KEYS.map(f=>[f.field,f]));
    const isEndField=fld=>fld&&(fld.field==="curfew"||fld.field==="busArrive");
    (data.schedule||[]).forEach((s,i)=>{
      const fld=fldByName[s.field];const corpus=`${s.time||""} ${s.item||""}`;const times=parseAllTimes(corpus);
      if(fld&&times.length){
        // For a grouped range, end-fields (curfew) use the end time; start-fields use the start time
        const relevant=times.filter(t=>t.rangeRole===null||(isEndField(fld)?t.rangeRole==="end":t.rangeRole==="start"));
        const use=relevant.length?relevant:times.filter(t=>t.rangeRole!=="end");
        use.forEach(t=>addFlag(`sch_${fld.field}_${t.minutes}_${i}`,fld,t.minutes,corpus.trim(),s.tid||null));
      } else if(times.length){
        const text=String(s.item||"").toLowerCase();const guess=FIELD_KEYS.find(f=>f.keys.some(k=>text.includes(k)));
        if(guess){
          const relevant=times.filter(t=>t.rangeRole===null||(isEndField(guess)?t.rangeRole==="end":t.rangeRole==="start"));
          const use=relevant.length?relevant:times.filter(t=>t.rangeRole!=="end");
          use.forEach(t=>addFlag(`sch_${guess.field}_${t.minutes}_${i}`,guess,t.minutes,corpus.trim(),s.tid||null));
        }
      }
    });
    (data.threads||[]).forEach(t=>{
      const corpus=`${t.subject||""}\n${t.bodySnippet||t.snippet||""}`;
      const lower=corpus.toLowerCase();const times=parseAllTimes(corpus);if(!times.length)return;
      times.forEach(tm=>{
        let best=null,bestDist=Infinity;
        FIELD_KEYS.forEach(fld=>{
          // Range role filtering: end-of-range times only match end-fields; start-of-range times skip end-fields
          if(tm.rangeRole==="end"&&!isEndField(fld))return;
          if(tm.rangeRole==="start"&&isEndField(fld))return;
          fld.keys.forEach(k=>{const idx=lower.indexOf(k);if(idx<0)return;const d=Math.abs(idx-tm.index);if(d<bestDist){bestDist=d;best=fld;}});
        });
        if(!best||bestDist>80)return;
        const s=Math.max(0,tm.index-30),e=Math.min(corpus.length,tm.index+60);
        addFlag(`th_${best.field}_${tm.minutes}_${t.tid}_${tm.index}`,best,tm.minutes,corpus.slice(s,e).trim(),t.tid);
      });
    });
    return out;
  },[data,show]);
  if(!show)return null;const busy=refreshing===sid;const shared=data.isShared||false;
  return <div style={{display:"flex",flexDirection:"column",gap:8}}>
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <span style={{fontSize:10,fontWeight:800,color:T.accent,letterSpacing:"0.06em"}}>GMAIL INTEL</span>
      <span style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:"var(--card-2)",color:T.textDim,fontWeight:600,letterSpacing:"0.04em"}}>PRIVATE</span>
      {data.lastRefreshed&&<span style={{fontSize:9,color:T.textMute,fontFamily:MN}}>last: {new Date(data.lastRefreshed).toLocaleString()}</span>}
      {data._partial&&<span title="Claude response was truncated by max_tokens; some threads/fields may be missing. Re-run the scan." style={{fontSize:9,fontWeight:700,color:T.warnFg,fontFamily:MN,padding:"1px 6px",borderRadius:4,border:"1px solid var(--warn-fg)"}}>PARTIAL</span>}
      <span style={{marginLeft:"auto",fontSize:9,color:T.textDim}}>{(data.threads||[]).length} threads · {(data.todos||[]).length} to-dos</span>
      {role!=="viewer"&&<button onClick={()=>toggleIntelShare(show,!shared)} style={{background:shared?"var(--success-bg)":"var(--card-2)",color:shared?"var(--success-fg)":"var(--text-2)",border:`1px solid ${shared?"var(--success-fg)":"var(--border)"}`,borderRadius:6,fontSize:9,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>{shared?"Shared with team":"Share with team"}</button>}
      {role!=="viewer"&&<button onClick={()=>{const d=intel[sid];if(!d)return;const before={t:(d.todos||[]).length,f:(d.followUps||[]).length,th:(d.threads||[]).length};const clean=deduplicateIntel(d);const saved=(before.t-(clean.todos||[]).length)+(before.f-(clean.followUps||[]).length)+(before.th-(clean.threads||[]).length);setIntel(p=>({...p,[sid]:clean}));if(saved>0)addLog({type:"user",section:"dedup",showId:sid,action:"cleaned",label:`Removed ${saved} duplicate${saved>1?"s":""}`,from:"intel_panel"});}} title="Remove near-duplicate todos, follow-ups, and threads" style={{background:"var(--card-2)",color:T.text2,border:"1px solid var(--border)",borderRadius:6,fontSize:9,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>Clean Dupes</button>}
      {role!=="viewer"&&<button onClick={()=>refreshIntel(show,true)} disabled={!!refreshing} style={{background:refreshing?"var(--border)":"var(--accent)",color:refreshing?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,fontSize:10,padding:"4px 11px",cursor:refreshing?"default":"pointer",fontWeight:700}}>{busy?"Scanning…":"Refresh Intel"}</button>}
    </div>
    {refreshMsg&&<div style={{fontSize:10,color:T.accent,fontFamily:MN}}>{refreshMsg}</div>}
    {(()=>{
      const arItems=(labelIntel?.actionRequired||[]).filter(item=>item.showId===sid&&!arIgnored.has(item.id));
      if(!arItems.length)return null;
      const BUCKETS=[
        {key:"urgent",label:"URGENT",bg:"var(--danger-bg)",col:"var(--danger-fg)"},
        {key:"input",label:"INPUT / APPROVAL NEEDED",bg:"var(--warn-bg)",col:"var(--warn-fg)"},
        {key:"standing_by",label:"STANDING BY",bg:"var(--info-bg)",col:"var(--link)"},
        {key:"fresh",label:"FRESH",bg:"var(--accent-pill-bg)",col:"var(--accent)"},
        {key:"active",label:"ACTIVE",bg:"var(--card)",col:"var(--text-2)"},
      ];
      const grouped={urgent:[],input:[],standing_by:[],fresh:[],active:[]};
      for(const item of arItems){const k=item.bucket||"active";grouped[k]?grouped[k].push(item):grouped.active.push(item);}
      return(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <div style={{fontSize:9,fontWeight:800,color:T.warnFg,letterSpacing:"0.08em"}}>ACTION REQUIRED · LABEL SCAN ({arItems.length})</div>
          {BUCKETS.filter(b=>grouped[b.key].length>0).map(b=>(
            <div key={b.key} style={{background:b.bg,border:`1px solid ${b.col}30`,borderRadius:10,padding:"8px 12px"}}>
              <div style={{fontSize:8,fontWeight:800,color:b.col,letterSpacing:"0.08em",marginBottom:5}}>{b.label} ({grouped[b.key].length})</div>
              {grouped[b.key].map(item=>{const done=arDone.has(item.id);const noteOpen=arNoteOpen[item.id];const note=arNotes[item.id]||"";
                const sug=item.suggestion;const sugConf=item.suggestionConfidence||"medium";const sugDim=sugConf==="low"?0.55:1;
                const applySug=()=>{if(sug==="complete")markArIntel(item.id,"done",item.subject);else if(sug==="ignore")markArIntel(item.id,"ignored",item.subject);else if(sug==="action"&&item.suggestedAction)saveArNote(item.id,item.suggestedAction);};
                const sugTip=`${sug?sug.toUpperCase():""} (${sugConf})${item.suggestionReason?` — ${item.suggestionReason}`:""}`;
                return(
                <React.Fragment key={item.id}>
                <div style={{padding:"6px 0",borderBottom:`1px solid ${b.col}18`}}>
                  <div style={{marginBottom:4,opacity:done?0.5:1}}>
                    <div style={{fontSize:10,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:done?"line-through":"none"}}>{item.subject}</div>
                    <div style={{fontSize:9,color:b.col,opacity:0.85}}>{item.category&&item.category!=="MISC"?`${item.category} · `:""}{item.signal} · {item.from}</div>
                  </div>
                  <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                    <a href={gmailUrl(item.id)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,padding:"2px 9px",borderRadius:4,border:`1px solid ${b.col}70`,background:"var(--card)",color:b.col,textDecoration:"none",fontWeight:700,flexShrink:0}}>email · {item.signal||item.bucket} →</a>
                    {sug==="complete"&&!done&&<button onClick={applySug} title={sugTip} style={{fontSize:9,padding:"2px 9px",borderRadius:4,border:"1px solid var(--success-fg)",background:"var(--success-bg)",color:"var(--success-fg)",cursor:"pointer",fontWeight:700,opacity:sugDim,flexShrink:0}}>✓ Suggest Done</button>}
                    {sug==="ignore"&&!done&&<button onClick={applySug} title={sugTip} style={{fontSize:9,padding:"2px 9px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-2)",color:T.textMute,cursor:"pointer",fontWeight:700,opacity:sugDim,flexShrink:0}}>× Suggest Ignore</button>}
                    {sug==="action"&&item.suggestedAction&&!done&&<button onClick={applySug} title={`${sugTip} — click to save as note`} style={{fontSize:9,padding:"2px 9px",borderRadius:4,border:"1px solid var(--accent)",background:"var(--accent-pill-bg)",color:T.accent,cursor:"pointer",fontWeight:700,opacity:sugDim,maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}}>→ {item.suggestedAction}</button>}
                    <button onClick={()=>markArIntel(item.id,done?"undone":"done",item.subject)} style={{fontSize:9,padding:"2px 9px",borderRadius:4,border:done?"1px solid var(--success-fg)":"1px solid var(--border)",background:done?"var(--success-bg)":"var(--card-2)",color:done?"var(--success-fg)":"var(--text-2)",cursor:"pointer",fontWeight:700,flexShrink:0}}>{done?"↩ Restore":"Done"}</button>
                    {!done&&<button onClick={()=>markArIntel(item.id,"ignored",item.subject)} style={{fontSize:9,padding:"2px 9px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-2)",color:T.textMute,cursor:"pointer",fontWeight:600,flexShrink:0}}>Ignore</button>}
                    <button onClick={()=>toggleArNote(item.id)} style={{fontSize:9,padding:"2px 9px",borderRadius:4,border:`1px solid ${note&&!noteOpen?"var(--accent)":"var(--border)"}`,background:noteOpen?"var(--card-3)":"var(--card-2)",color:note&&!noteOpen?T.accent:T.textMute,cursor:"pointer",fontWeight:600,flexShrink:0}}>{note&&!noteOpen?"note ✎":"note"}</button>
                  </div>
                  {!noteOpen&&note&&<div style={{fontSize:9,color:T.textDim,fontStyle:"italic",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{note}</div>}
                  {noteOpen&&<textarea value={note} onChange={e=>saveArNote(item.id,e.target.value)} placeholder="Add a note…" rows={2} style={{marginTop:5,width:"100%",fontFamily:MN,fontSize:9,padding:"5px 7px",border:"1px solid var(--border)",borderRadius:4,resize:"vertical",background:"var(--card)",color:T.text,lineHeight:1.5,boxSizing:"border-box"}}/>}
                </div>
                <DraftPanel tid={item.id}/>
                </React.Fragment>
              );})}

            </div>
          ))}
        </div>
      );
    })()}
    <IntelSection title="SCHEDULE INCONSISTENCIES" count={scheduleFlags.length+(data.manualFlags||[]).length} defaultOpen={true} actions={<button onClick={addManualFlag} style={{...UI.expandBtn(false,"var(--warn-fg)"),fontSize:9}}>+ Add</button>}>
      {scheduleFlags.length===0&&(data.manualFlags||[]).length===0?<div style={{fontSize:10,color:T.textMute,fontStyle:"italic"}}>No inconsistencies.</div>:
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {scheduleFlags.map(f=>{const isC=f.severity==="CONFLICT";const col=isC?"var(--danger-fg)":"var(--warn-fg)";const bg=isC?"var(--danger-bg)":"var(--warn-bg)";
          const confirmPlatform=()=>dismissFlag(f.key);
          const confirmEmail=()=>{uShow(sel,{[f.field]:f.emailValMinutes,[f.field+"Confirmed"]:true});dismissFlag(f.key);};
          const markBadMatch=()=>dismissFlag(f.key);
          return <div key={f.key} style={{border:`1px solid ${col}40`,background:bg,borderRadius:6,padding:"7px 9px",display:"flex",flexDirection:"column",gap:4}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:col,color:"#fff",fontWeight:800}}>{f.severity}</span>
              <span style={{fontSize:11,fontWeight:700,color:T.text}}>{f.label}</span>
              <span style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}>
                {f.threadTid&&<a href={gmailUrl(f.threadTid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:col,textDecoration:"none",fontWeight:600}}>open ↗</a>}
              </span>
            </div>
            <div style={{fontSize:10,fontFamily:MN,color:T.text}}>platform: <span style={{fontWeight:600}}>{f.platform}</span> · email: <span style={{fontWeight:600}}>{f.emailVal}</span></div>
            <div style={{fontSize:9,color:T.textDim,fontStyle:"italic"}}>{f.snippet}</div>
            <div style={{display:"flex",gap:5,marginTop:2}}>
              <button onClick={confirmPlatform} title="Platform time is correct — dismiss flag" style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:"1px solid var(--text-2)",background:"var(--card-2)",color:"var(--text-3)",cursor:"pointer",fontWeight:700}}>Platform correct</button>
              <button onClick={confirmEmail} title="Email time is correct — update show and dismiss" style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:`1px solid ${col}60`,background:isC?"var(--danger-bg)":"var(--warn-bg)",color:col,cursor:"pointer",fontWeight:700}}>Use email time</button>
              <button onClick={markBadMatch} title="Low confidence — comparison is improperly formed or imprecise" style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-3)",color:T.textMute,cursor:"pointer",fontWeight:600}}>Bad match</button>
            </div>
          </div>;
        })}
        {(data.manualFlags||[]).map(f=><div key={f.key} style={{border:"1px solid var(--border)",background:"var(--card-4)",borderRadius:6,padding:"7px 9px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr 28px",gap:6,alignItems:"center"}}>
          <input value={f.label} onChange={e=>updManualFlag(f.key,{label:e.target.value})} placeholder="Label" style={UI.input}/>
          <input value={f.platform} onChange={e=>updManualFlag(f.key,{platform:e.target.value})} placeholder="Platform" style={UI.input}/>
          <input value={f.emailVal} onChange={e=>updManualFlag(f.key,{emailVal:e.target.value})} placeholder="Email value" style={UI.input}/>
          <button onClick={()=>delManualFlag(f.key)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13}}>×</button>
        </div>)}
      </div>}
    </IntelSection>
    {(()=>{
      const PRI={CRITICAL:0,HIGH:1,MED:2,MEDIUM:2,LOW:3};
      const threadMap=new Map((data.threads||[]).map(t=>[t.tid,t]));
      const activeTodos=(data.todos||[]).filter(t=>!t.done&&!t.ignored);
      const activeFu=(data.followUps||[]).filter(f=>!f.done&&!f.ignored);
      const completedTodos=(data.todos||[]).filter(t=>t.done&&!t.ignored);
      const completedFu=(data.followUps||[]).reduce((acc,f,i)=>{if(f.done&&!f.ignored)acc.push({...f,_i:i});return acc;},[]);
      const todosByTid={};for(const t of activeTodos)(todosByTid[t.threadTid||"__none__"]||=[]).push(t);
      const fuByTid={};for(const f of activeFu)(fuByTid[f.tid||"__none__"]||=[]).push(f);
      const seenTid=new Set();
      const groups=[];
      for(const t of(data.threads||[])){if(seenTid.has(t.tid)||(!t.manual&&!t.subject))continue;seenTid.add(t.tid);groups.push({thread:t,tid:t.tid});}
      for(const k of[...Object.keys(todosByTid),...Object.keys(fuByTid)]){if(k==="__none__"||seenTid.has(k))continue;seenTid.add(k);groups.push({thread:null,tid:k});}
      const unlinkedTodos=todosByTid["__none__"]||[];
      const unlinkedFu=fuByTid["__none__"]||[];
      const renderTodo=t=>(
        <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0 3px 10px",borderTop:"1px solid var(--card-3)"}}>
          <input type="checkbox" checked={!!t.done} onChange={()=>toggleTodo(t.id,t.done,t.text)}/>
          <span style={{fontSize:10,flex:1,color:t.done?"var(--text-mute)":"var(--text)",textDecoration:t.done?"line-through":"none"}}>{t.text}</span>
          {t.threadTid&&<a href={gmailUrl(t.threadTid)} target="_blank" rel="noopener noreferrer" title="Open thread" style={{color:T.textMute,fontSize:9,textDecoration:"none",flexShrink:0}}>✉</a>}
          {t.priority&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:t.priority==="CRITICAL"?"var(--danger-bg)":t.priority==="HIGH"?"var(--warn-bg)":"var(--card-2)",color:t.priority==="CRITICAL"?"var(--danger-fg)":t.priority==="HIGH"?"var(--warn-fg)":"var(--text-dim)",fontWeight:700}}>{t.priority}</span>}
          <button onClick={()=>delTodo(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:T.textMute,fontSize:11}}>×</button>
        </div>
      );
      const renderFu=(f,i)=>(
        <div key={i} style={{display:"grid",gridTemplateColumns:`1fr 90px 70px 90px${f.manual?"":" auto auto"} 24px`,gap:6,padding:"3px 0 3px 10px",borderTop:"1px solid var(--card-3)",fontSize:10,alignItems:"center"}}>
          {f.manual?<input value={f.action||""} onChange={e=>upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,action:e.target.value}:x)})} placeholder="Action" style={UI.input}/>:f.tid?<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" title="Open thread" style={{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.text,textDecoration:"underline",textDecorationColor:"var(--text-mute)",textUnderlineOffset:2}}>{f.action}</a>:<span style={{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.action}</span>}
          {f.manual?<input value={f.owner||""} onChange={e=>upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,owner:e.target.value}:x)})} placeholder="Owner" style={UI.input}/>:<span style={{fontSize:8,color:T.textDim}}>{f.owner}</span>}
          {f.manual?<select value={f.priority||"MED"} onChange={e=>upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,priority:e.target.value}:x)})} style={UI.input}><option>CRITICAL</option><option>HIGH</option><option>MED</option><option>LOW</option></select>:<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:f.priority==="CRITICAL"?"var(--danger-bg)":"var(--card-2)",color:f.priority==="CRITICAL"?"var(--danger-fg)":"var(--text-dim)",fontWeight:700}}>{f.priority}</span>}
          {f.manual?<input value={f.deadline||""} onChange={e=>upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,deadline:e.target.value}:x)})} placeholder="YYYY-MM-DD" style={UI.input}/>:<span style={{fontSize:8,color:T.textMute,fontFamily:MN}}>{f.deadline}</span>}
          {!f.manual&&<button onClick={()=>{upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,done:true}:x)});addLog({type:"user",section:"followup",showId:sid,action:"done",label:f.action,from:"intel_panel"});}} style={{fontSize:8,padding:"2px 5px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",background:"var(--success-bg)",color:T.successFg}}>Done</button>}
          {!f.manual&&<button onClick={()=>{upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,ignored:true}:x)});addLog({type:"user",section:"followup",showId:sid,action:"ignored",label:f.action,from:"intel_panel"});}} style={{fontSize:8,padding:"2px 5px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",background:"var(--card-2)",color:T.textMute}}>Ignore</button>}
          <button onClick={()=>delFollowUp(i)} style={{background:"none",border:"none",cursor:"pointer",color:T.textMute,fontSize:11}}>×</button>
        </div>
      );
      const totalCount=(data.threads||[]).filter(t=>t.manual||t.subject).length;
      const itemCount=activeTodos.length+activeFu.length;
      const sortItems=arr=>arr.slice().sort((a,b)=>{
        if(intelSort==="due"){const ad=a.deadline||"9999-12-31";const bd=b.deadline||"9999-12-31";return ad.localeCompare(bd);}
        return(PRI[a.priority]??4)-(PRI[b.priority]??4);
      });
      return(
      <IntelSection title="INTEL BY THREAD" count={totalCount} defaultOpen={true} actions={<div style={{display:"flex",gap:4,alignItems:"center"}}>
        <div style={{display:"flex",border:"1px solid var(--border)",borderRadius:6,overflow:"hidden"}}>
          <button onClick={()=>setIntelSort("priority")} style={{fontSize:8,padding:"2px 7px",border:"none",background:intelSort==="priority"?"var(--accent)":"var(--card-2)",color:intelSort==="priority"?"var(--card)":T.textMute,cursor:"pointer",fontWeight:700}}>Priority</button>
          <button onClick={()=>setIntelSort("due")} style={{fontSize:8,padding:"2px 7px",border:"none",borderLeft:"1px solid var(--border)",background:intelSort==="due"?"var(--accent)":"var(--card-2)",color:intelSort==="due"?"var(--card)":T.textMute,cursor:"pointer",fontWeight:700}}>Due date</button>
        </div>
        <button onClick={addTodo} style={{...UI.expandBtn(false,"var(--accent)"),fontSize:9}}>+ Todo</button>
        <button onClick={addThread} style={{...UI.expandBtn(false,"var(--accent)"),fontSize:9}}>+ Thread</button>
        <button onClick={addFollowUp} style={{...UI.expandBtn(false,"var(--accent)"),fontSize:9}}>+ Follow-up</button>
      </div>}>
        {totalCount===0&&itemCount===0&&<div style={{fontSize:10,color:T.textMute,fontStyle:"italic"}}>No intel yet. Run a scan.</div>}
        {groups.map(({thread,tid})=>{
          const gTodos=sortItems(todosByTid[tid]||[]);
          const gFus=sortItems(fuByTid[tid]||[]);
          if(!thread&&!gTodos.length&&!gFus.length)return null;
          return(
            <div key={tid} style={{marginBottom:6,borderLeft:"2px solid var(--border)",paddingLeft:8}}>
              {thread&&(
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0"}}>
                  <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--accent-pill-bg)",color:T.accent,fontWeight:700,flexShrink:0}}>{thread.intent||"?"}</span>
                  {thread.manual
                    ?<input value={thread.subject||""} onChange={e=>upd({threads:data.threads.map(x=>x.tid===tid?{...x,subject:e.target.value}:x)})} placeholder="Subject" style={{...UI.input,flex:1}}/>
                    :<a href={gmailUrl(tid)} target="_blank" rel="noopener noreferrer" style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.text,textDecoration:"none",fontSize:10}}>
                      <span style={{fontWeight:600}}>{thread.subject}</span>{thread.from&&<span style={{color:T.textDim,fontSize:8}}>{" · "+thread.from}</span>}
                    </a>}
                  {thread.status&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--card-2)",color:T.textMute,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>{thread.status}</span>}
                  <span style={{fontSize:8,color:T.textMute,fontFamily:MN,flexShrink:0}}>{thread.date}</span>
                  {!thread.manual&&<button onClick={()=>draftReply(tid)} disabled={drafts[tid]?.status==="loading"} title="Draft reply-all" style={{fontSize:9,padding:"2px 6px",borderRadius:4,border:"1px solid var(--accent)",background:"var(--card)",color:T.accent,cursor:"pointer",fontWeight:700,flexShrink:0,opacity:drafts[tid]?.status==="loading"?0.5:1}}>✉</button>}
                  <button onClick={()=>delThread(tid)} style={{background:"none",border:"none",cursor:"pointer",color:T.textMute,fontSize:11,flexShrink:0}}>×</button>
                </div>
              )}
              {thread&&<DraftPanel tid={tid}/>}
              {gTodos.map(renderTodo)}
              {gFus.map(f=>renderFu(f,(data.followUps||[]).findIndex(x=>x===f)))}
            </div>
          );
        })}
        {(unlinkedTodos.length>0||unlinkedFu.length>0)&&(
          <div style={{marginBottom:6,borderLeft:"2px solid var(--card-3)",paddingLeft:8}}>
            <div style={{fontSize:8,fontWeight:700,color:T.textMute,letterSpacing:"0.06em",padding:"3px 0"}}>MANUAL / NO THREAD</div>
            {sortItems(unlinkedTodos).map(renderTodo)}
            {sortItems(unlinkedFu).map(f=>renderFu(f,(data.followUps||[]).findIndex(x=>x===f)))}
          </div>
        )}
        {(completedTodos.length>0||completedFu.length>0)&&(
          <div style={{marginTop:4,borderLeft:"2px solid var(--success-fg)40",paddingLeft:8}}>
            <div onClick={()=>setShowCompleted(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",cursor:"pointer",userSelect:"none"}}>
              <span style={{fontSize:8,fontWeight:700,color:"var(--success-fg)",letterSpacing:"0.06em"}}>COMPLETED ({completedTodos.length+completedFu.length})</span>
              <span style={{fontSize:9,color:T.textMute}}>{showCompleted?"▴":"▾"}</span>
            </div>
            {showCompleted&&<>
              {completedTodos.map(t=>(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0 3px 10px",borderTop:"1px solid var(--card-3)"}}>
                  <span style={{fontSize:10,flex:1,color:T.textMute,textDecoration:"line-through",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.text}</span>
                  {t.threadTid&&<a href={gmailUrl(t.threadTid)} target="_blank" rel="noopener noreferrer" title="Open thread" style={{color:T.textMute,fontSize:9,textDecoration:"none",flexShrink:0}}>✉</a>}
                  {t.priority&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--card-2)",color:T.textDim,fontWeight:700,flexShrink:0}}>{t.priority}</span>}
                  <button onClick={()=>toggleTodo(t.id,true,t.text)} title="Restore to active" style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:"1px solid var(--border)",background:"transparent",color:"var(--success-fg)",cursor:"pointer",fontWeight:700,flexShrink:0}}>↩</button>
                  <button onClick={()=>delTodo(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:T.textMute,fontSize:11,flexShrink:0}}>×</button>
                </div>
              ))}
              {completedFu.map(f=>(
                <div key={f._i} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0 3px 10px",borderTop:"1px solid var(--card-3)"}}>
                  <span style={{fontSize:10,flex:1,color:T.textMute,textDecoration:"line-through",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.action}</span>
                  {f.owner&&<span style={{fontSize:8,color:T.textDim,flexShrink:0}}>{f.owner}</span>}
                  {f.priority&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--card-2)",color:T.textDim,fontWeight:700,flexShrink:0}}>{f.priority}</span>}
                  {f.deadline&&<span style={{fontSize:8,color:T.textMute,fontFamily:MN,flexShrink:0}}>{f.deadline}</span>}
                  <button onClick={()=>restoreFollowUp(f._i)} title="Restore to follow-ups" style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:"1px solid var(--border)",background:"transparent",color:"var(--success-fg)",cursor:"pointer",fontWeight:700,flexShrink:0}}>↩</button>
                  <button onClick={()=>delFollowUp(f._i)} style={{background:"none",border:"none",cursor:"pointer",color:T.textMute,fontSize:11,flexShrink:0}}>×</button>
                </div>
              ))}
            </>}
          </div>
        )}
      </IntelSection>
      );
    })()}
    {(data.showContacts||[]).length>0&&<div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px"}}>
      <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.06em",marginBottom:6}}>CONTACTS</div>
      {data.showContacts.map((c,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8,padding:"4px 0",borderBottom:"1px solid var(--card-3)",fontSize:10}}>
        <span style={{fontWeight:600}}>{c.name}</span><span style={{color:T.textDim}}>{c.role}</span>
        {c.email&&<a href={`mailto:${c.email}`} style={{color:T.accent,fontSize:9,textDecoration:"none"}}>{c.email}</a>}
      </div>)}
    </div>}
    {(data.sharedByOthers||[]).map((s,i)=>{
      const label=s.user_email||"teammate";const d=s.intel||{};
      return <div key={i} style={{border:"1px solid var(--success-fg)",borderRadius:10,padding:"10px 12px",background:"var(--success-bg)"}}>
        <div style={{fontSize:9,fontWeight:800,color:T.successFg,letterSpacing:"0.06em",marginBottom:8}}>SHARED BY {label.toUpperCase()} · {new Date(s.cached_at).toLocaleDateString()}</div>
        {(d.followUps||[]).length>0&&<div>
          <div style={{fontSize:8,fontWeight:700,color:T.textDim,marginBottom:4}}>FOLLOW-UPS ({d.followUps.length})</div>
          {d.followUps.map((f,fi)=><div key={fi} style={{display:"grid",gridTemplateColumns:"1fr 80px 70px 80px",gap:8,padding:"4px 0",borderBottom:"1px solid var(--success-bg)",fontSize:10,alignItems:"center"}}>
            <span>{f.action}</span>
            <span style={{fontSize:8,color:T.textDim}}>{f.owner}</span>
            <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:f.priority==="CRITICAL"?"var(--danger-bg)":"var(--card-2)",color:f.priority==="CRITICAL"?"var(--danger-fg)":"var(--text-dim)",fontWeight:700}}>{f.priority}</span>
            <span style={{fontSize:8,color:T.textMute,fontFamily:MN}}>{f.deadline}</span>
          </div>)}
        </div>}
      </div>;
    })}
    {(()=>{
      const logEntries=[...(intel.__changelog||[])].filter(e=>e.showId===sid||e.showId===null).reverse().slice(0,50);
      if(!logEntries.length)return null;
      const entryColor=a=>a==="done"||a==="added"?"var(--success-fg)":a==="ignored"||a==="removed"?"var(--danger-fg)":"var(--text-dim)";
      return(
        <IntelSection title="ACTIVITY LOG" count={logEntries.length} defaultOpen={false}>
          <div style={{display:"flex",flexDirection:"column",gap:1}}>
            {logEntries.map((e,i)=><div key={`${e.ts}-${e.action}-${e.section}-${i}`} style={{display:"grid",gridTemplateColumns:"90px 60px 70px 1fr",gap:6,padding:"3px 0",borderBottom:"1px solid var(--card-3)",fontSize:9,alignItems:"start"}}>
              <span style={{fontFamily:MN,color:T.textMute,fontSize:8}}>{fmtAudit(e.ts)}</span>
              <span style={{color:T.textDim,fontSize:8}}>{e.from}</span>
              <span style={{color:entryColor(e.action),fontWeight:700,fontSize:8}}>{e.action}</span>
              <span style={{color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.section}: {e.label}</span>
            </div>)}
          </div>
        </IntelSection>
      );
    })()}
  </div>;
}
