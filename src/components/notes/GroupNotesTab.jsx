import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { TEAM } from "../../lib/constants";
import { MN } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";
import { useAuth } from "../AuthGate";

export function GroupNotesTab(){
  const{groupNotes,uGroupNote,aC,cShows,sorted,role,userAssignments}=useContext(Ctx);
  const auth=useAuth();
  const myEmail=(auth?.user?.email||"").toLowerCase();
  const isViewer=role==="viewer";

  // All known emails across team + dynamically assigned users, excluding self
  const allKnownEmails=useMemo(()=>{
    const s=new Set([...Object.keys(TEAM),...Object.keys(userAssignments||{})].map(e=>e.toLowerCase()));
    s.delete(myEmail);
    return [...s].sort();
  },[userAssignments,myEmail]);

  // Notes visible to current user for current client, sorted by last activity
  const visibleNotes=useMemo(()=>
    Object.values(groupNotes||{})
      .filter(n=>n.clientId===aC&&(n.createdBy===myEmail||(n.sharedWith||[]).includes(myEmail)))
      .sort((a,b)=>{
        const al=(a.messages||[]).at(-1)?.ts||a.createdAt||"";
        const bl=(b.messages||[]).at(-1)?.ts||b.createdAt||"";
        return bl.localeCompare(al);
      })
  ,[groupNotes,aC,myEmail]);

  const[selId,setSelId]=useState(null);
  const[reply,setReply]=useState("");
  const[showForm,setShowForm]=useState(false);
  const[fTitle,setFTitle]=useState("");
  const[fBody,setFBody]=useState("");
  const[fShowDate,setFShowDate]=useState("");
  const[fShared,setFShared]=useState([]);
  const msgEndRef=useRef(null);

  // Auto-select first note when list changes and nothing selected
  useEffect(()=>{
    if(!selId&&visibleNotes.length)setSelId(visibleNotes[0].id);
  },[visibleNotes,selId]);
  // Scroll to bottom of thread on note change
  useEffect(()=>{msgEndRef.current?.scrollIntoView({behavior:"smooth"});},[selId,groupNotes]);

  const curNote=groupNotes?.[selId]||null;
  const isMine=curNote?.createdBy===myEmail;

  const displayName=email=>{
    const lower=(email||"").toLowerCase();
    return TEAM[lower]?.label||email.split("@")[0];
  };
  const fmtTs=ts=>{
    if(!ts)return"";
    const d=new Date(ts);
    const today=new Date().toDateString();
    return d.toDateString()===today?d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):d.toLocaleDateString([],{month:"short",day:"numeric"});
  };

  const createNote=()=>{
    if(!fTitle.trim()||!fBody.trim())return;
    const id=`gn_${Date.now()}`;
    uGroupNote(id,{
      id,clientId:aC,showDate:fShowDate||null,title:fTitle.trim(),
      createdBy:myEmail,createdAt:new Date().toISOString(),
      sharedWith:fShared,
      messages:[{id:`msg_${Date.now()}`,authorEmail:myEmail,body:fBody.trim(),ts:new Date().toISOString()}],
    });
    setSelId(id);setShowForm(false);setFTitle("");setFBody("");setFShared([]);setFShowDate("");
  };

  const postReply=()=>{
    if(!reply.trim()||!curNote)return;
    const msg={id:`msg_${Date.now()}`,authorEmail:myEmail,body:reply.trim(),ts:new Date().toISOString()};
    uGroupNote(selId,{...curNote,messages:[...(curNote.messages||[]),msg]});
    setReply("");
  };

  const toggleShareWith=email=>{
    if(!isMine)return;
    const sw=curNote.sharedWith||[];
    uGroupNote(selId,{...curNote,sharedWith:sw.includes(email)?sw.filter(e=>e!==email):[...sw,email]});
  };
  const toggleFormShare=email=>setFShared(p=>p.includes(email)?p.filter(e=>e!==email):[...p,email]);

  const showLabel=date=>{
    if(!date)return"Global";
    const s=(sorted||[]).find(x=>x.date===date);
    return s?`${s.city} ${date}`:date;
  };

  const CARD={background:T.card,border:`1px solid ${T.border}`,borderRadius:10};

  return(
    <div style={{display:"flex",gap:12,height:"calc(100vh - 100px)",minHeight:400}}>
      {/* Left: note list */}
      <div style={{width:240,flexShrink:0,display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:10,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",flex:1}}>NOTES</span>
          {!isViewer&&<button onClick={()=>{setShowForm(true);setSelId(null);}} style={{fontSize:10,padding:"4px 11px",borderRadius:6,border:"none",background:T.accent,color:T.card,cursor:"pointer",fontWeight:700}}>+ New</button>}
        </div>

        {visibleNotes.length===0&&!showForm&&(
          <div style={{fontSize:10,color:T.textMute,fontStyle:"italic",padding:"8px 0"}}>
            {isViewer?"No notes shared with you yet.":`No notes yet. Create one to share with the team.`}
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:4,overflowY:"auto",flex:1}}>
          {visibleNotes.map(n=>{
            const lastMsg=(n.messages||[]).at(-1);
            const active=selId===n.id&&!showForm;
            return(
              <div key={n.id} onClick={()=>{setSelId(n.id);setShowForm(false);}} style={{...CARD,padding:"9px 11px",cursor:"pointer",background:active?"var(--card-3)":T.card,borderColor:active?T.accent:T.border,transition:"background 0.1s"}}>
                <div style={{fontSize:11,fontWeight:700,color:T.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.title}</div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                  {n.showDate
                    ?<span style={{fontSize:8,padding:"1px 6px",borderRadius:10,background:"var(--info-bg)",color:T.link,fontWeight:700}}>{showLabel(n.showDate)}</span>
                    :<span style={{fontSize:8,padding:"1px 6px",borderRadius:10,background:"var(--card-2)",color:T.textDim,fontWeight:600}}>GLOBAL</span>}
                  <span style={{fontSize:8,color:T.textMute,fontFamily:MN,marginLeft:"auto"}}>{fmtTs(lastMsg?.ts||n.createdAt)}</span>
                </div>
                {lastMsg&&<div style={{fontSize:9,color:T.textDim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{displayName(lastMsg.authorEmail)}: {lastMsg.body}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: new note form OR thread */}
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:0,...CARD,overflow:"hidden"}}>
        {showForm?(
          <div style={{display:"flex",flexDirection:"column",gap:14,padding:"18px 20px",overflowY:"auto",flex:1}}>
            <div style={{fontSize:10,fontWeight:800,color:T.textDim,letterSpacing:"0.1em"}}>NEW NOTE</div>
            <div>
              <div style={{fontSize:9,fontWeight:700,color:T.textDim,marginBottom:4}}>TITLE</div>
              <input value={fTitle} onChange={e=>setFTitle(e.target.value)} placeholder="Note title…" autoFocus style={{width:"100%",fontFamily:"'Outfit',system-ui",fontSize:13,fontWeight:700,padding:"8px 12px",border:`1px solid ${T.border}`,borderRadius:8,background:"var(--card-2)",color:T.text}}/>
            </div>
            <div>
              <div style={{fontSize:9,fontWeight:700,color:T.textDim,marginBottom:4}}>FIRST MESSAGE</div>
              <textarea value={fBody} onChange={e=>setFBody(e.target.value)} placeholder="Write your note…" rows={4} style={{width:"100%",fontFamily:"'Outfit',system-ui",fontSize:12,padding:"8px 12px",border:`1px solid ${T.border}`,borderRadius:8,background:"var(--card-2)",color:T.text,resize:"vertical",lineHeight:1.5}}/>
            </div>
            <div>
              <div style={{fontSize:9,fontWeight:700,color:T.textDim,marginBottom:4}}>PIN TO SHOW (optional)</div>
              <select value={fShowDate} onChange={e=>setFShowDate(e.target.value)} style={{width:"100%",fontFamily:MN,fontSize:11,padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,background:"var(--card-2)",color:T.text}}>
                <option value="">— Global (all shows)</option>
                {(cShows||[]).map(s=><option key={s.date} value={s.date}>{s.city} · {s.date}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:9,fontWeight:700,color:T.textDim,marginBottom:6}}>SHARE WITH</div>
              <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:140,overflowY:"auto"}}>
                {allKnownEmails.length===0&&<div style={{fontSize:9,color:T.textMute,fontStyle:"italic"}}>No other known users. Add emails in the Access panel.</div>}
                {allKnownEmails.map(email=>(
                  <label key={email} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:11,color:T.text2,padding:"3px 0"}}>
                    <input type="checkbox" checked={fShared.includes(email)} onChange={()=>toggleFormShare(email)} style={{accentColor:T.accent}}/>
                    <span style={{flex:1}}>{displayName(email)}</span>
                    <span style={{fontSize:9,color:T.textMute,fontFamily:MN}}>{email}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button onClick={createNote} disabled={!fTitle.trim()||!fBody.trim()} style={{fontSize:11,padding:"8px 18px",borderRadius:7,border:"none",background:fTitle.trim()&&fBody.trim()?T.accent:"var(--border)",color:fTitle.trim()&&fBody.trim()?"var(--card)":"var(--text-dim)",cursor:fTitle.trim()&&fBody.trim()?"pointer":"default",fontWeight:700}}>Create Note</button>
              <button onClick={()=>setShowForm(false)} style={{fontSize:11,padding:"8px 14px",borderRadius:7,border:`1px solid ${T.border}`,background:"transparent",color:T.textDim,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        ):curNote?(
          <>
            {/* Thread header */}
            <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:3}}>{curNote.title}</div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:9,color:T.textMute,fontFamily:MN}}>by {displayName(curNote.createdBy)} · {fmtTs(curNote.createdAt)}</span>
                    {curNote.showDate
                      ?<span style={{fontSize:8,padding:"1px 7px",borderRadius:10,background:"var(--info-bg)",color:T.link,fontWeight:700}}>{showLabel(curNote.showDate)}</span>
                      :<span style={{fontSize:8,padding:"1px 7px",borderRadius:10,background:"var(--card-2)",color:T.textDim,fontWeight:600}}>GLOBAL</span>}
                  </div>
                </div>
              </div>
              {/* Sharing row — only note creator can edit */}
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span style={{fontSize:9,fontWeight:700,color:T.textDim}}>SHARED WITH:</span>
                {(curNote.sharedWith||[]).length===0
                  ?<span style={{fontSize:9,color:T.textMute,fontStyle:"italic"}}>only you</span>
                  :(curNote.sharedWith||[]).map(e=>(
                    <span key={e} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:9,padding:"2px 7px",borderRadius:10,background:"var(--card-3)",color:T.text2,fontWeight:600}}>
                      {displayName(e)}
                      {isMine&&<span onClick={()=>toggleShareWith(e)} style={{cursor:"pointer",color:T.textMute,marginLeft:2,fontWeight:700}}>×</span>}
                    </span>
                  ))}
                {isMine&&allKnownEmails.filter(e=>!(curNote.sharedWith||[]).includes(e)).length>0&&(
                  <select value="" onChange={e=>{if(e.target.value)toggleShareWith(e.target.value);}} style={{fontSize:9,padding:"2px 7px",borderRadius:6,border:`1px solid ${T.border}`,background:"var(--card-2)",color:T.textDim,cursor:"pointer",fontFamily:MN}}>
                    <option value="">+ add</option>
                    {allKnownEmails.filter(e=>!(curNote.sharedWith||[]).includes(e)).map(e=><option key={e} value={e}>{displayName(e)} ({e})</option>)}
                  </select>
                )}
              </div>
            </div>

            {/* Messages */}
            <div style={{flex:1,overflowY:"auto",padding:"12px 18px",display:"flex",flexDirection:"column",gap:10}}>
              {(curNote.messages||[]).map((msg,i)=>{
                const isMe=msg.authorEmail===myEmail;
                return(
                  <div key={msg.id||i} style={{display:"flex",gap:10,alignItems:"flex-start",flexDirection:isMe?"row-reverse":"row"}}>
                    <div style={{width:26,height:26,borderRadius:"50%",background:isMe?T.accent:"var(--card-3)",color:isMe?"#fff":T.text2,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {displayName(msg.authorEmail)[0]?.toUpperCase()||"?"}
                    </div>
                    <div style={{maxWidth:"72%",display:"flex",flexDirection:"column",gap:3,alignItems:isMe?"flex-end":"flex-start"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:9,fontWeight:700,color:isMe?T.accent:T.text2}}>{isMe?"You":displayName(msg.authorEmail)}</span>
                        <span style={{fontSize:8,color:T.textMute,fontFamily:MN}}>{fmtTs(msg.ts)}</span>
                      </div>
                      <div style={{fontSize:12,color:T.text,background:isMe?"var(--accent-pill-bg)":"var(--card-2)",border:`1px solid ${isMe?"var(--accent-pill-border)":T.border}`,borderRadius:isMe?"12px 12px 2px 12px":"12px 12px 12px 2px",padding:"8px 12px",lineHeight:1.55,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                        {msg.body}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={msgEndRef}/>
            </div>

            {/* Reply box */}
            {!isViewer&&(
              <div style={{padding:"10px 18px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"flex-end"}}>
                <textarea value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){e.preventDefault();postReply();}}} placeholder="Reply… (⌘↵ to send)" rows={2} style={{flex:1,fontFamily:"'Outfit',system-ui",fontSize:12,padding:"8px 12px",border:`1px solid ${T.border}`,borderRadius:8,background:"var(--card-2)",color:T.text,resize:"none",lineHeight:1.5}}/>
                <button onClick={postReply} disabled={!reply.trim()} style={{fontSize:11,padding:"8px 14px",borderRadius:7,border:"none",background:reply.trim()?T.accent:"var(--border)",color:reply.trim()?"var(--card)":"var(--text-dim)",cursor:reply.trim()?"pointer":"default",fontWeight:700,flexShrink:0}}>Send</button>
              </div>
            )}
          </>
        ):(
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8,color:T.textMute}}>
            <div style={{fontSize:24,opacity:0.2}}>◫</div>
            <div style={{fontSize:11}}>{isViewer?"No notes shared with you yet.":"Select a note or create one."}</div>
          </div>
        )}
      </div>
    </div>
  );
}
