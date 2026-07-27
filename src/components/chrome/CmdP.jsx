import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { CLIENTS, CM, MN, TABS } from "../../lib/domain-constants";
import { dU, fD, fW } from "../../lib/time";
import { T } from "../../styles/tokens";

export function CmdP(){
  const{sorted,setSel,setTab,setCmd,setAC,setExp,setDateMenu,next,sel,shows,refreshIntel,mobile,role}=useContext(Ctx);
  const[q,setQ]=useState("");const[sel1,setSel1]=useState(0);const ref=useRef(null);const listRef=useRef(null);
  useEffect(()=>{ref.current?.focus();},[]);
  const actions=useMemo(()=>{
    const a=[{type:"action",id:"open_now",label:"Go to Now",sub:"Dashboard / next 72h",icon:"◉",run:()=>setTab("dash")},
      {type:"action",id:"open_advance",label:"Open Advance tracker",sub:"current show",icon:"◎",run:()=>setTab("advance")},
      {type:"action",id:"open_ros",label:"Open Schedule",sub:"ROS for current show",icon:"▦",run:()=>setTab("ros")},
      {type:"action",id:"open_transport",label:"Open Logistics",sub:"bus + dispatch",icon:"◈",run:()=>setTab("transport")},
      {type:"action",id:"open_finance",label:"Open Finance",sub:"settlement + payout",icon:"◐",run:()=>setTab("finance")},
      {type:"action",id:"open_dates",label:"Open Dates menu",sub:"full tour calendar",icon:"☰",run:()=>setDateMenu(true)},
      {type:"action",id:"export",label:"Export / Import snapshot",sub:"JSON download",icon:"⇅",run:()=>setExp(true)}];
    const cur=sel?shows?.[sel]:null;
    if(cur&&refreshIntel&&role!=="viewer")a.push({type:"action",id:"refresh_intel",label:`Refresh Gmail intel (${cur.city||cur.venue})`,sub:"scan inbox for this show",icon:"↻",run:()=>refreshIntel(cur,true)});
    if(next)a.push({type:"action",id:"jump_next",label:`Jump to next show (${next.city})`,sub:`${fD(next.date)} · ${dU(next.date)}d`,icon:"→",run:()=>{setSel(next.date);if(next.clientId)setAC(next.clientId);setTab("ros");}});
    return a;
  },[next,sel,shows,refreshIntel,setTab,setDateMenu,setExp,setSel,setAC]);
  const res=useMemo(()=>{
    const ql=q.toLowerCase().trim();
    if(!ql)return[...actions.slice(0,5),...sorted.slice(0,5).map(s=>({type:"show",id:s.date,label:`${fD(s.date)} ${s.city}`,sub:s.venue,cId:s.clientId}))];
    const it=[];
    actions.forEach(a=>{if(a.label.toLowerCase().includes(ql)||a.sub?.toLowerCase().includes(ql))it.push(a);});
    TABS.forEach(t=>{if(!t.disabled&&t.label.toLowerCase().includes(ql))it.push({type:"tab",id:t.id,label:t.label,icon:t.icon});});
    CLIENTS.forEach(c=>{if(c.name.toLowerCase().includes(ql))it.push({type:"client",id:c.id,label:c.name,sub:c.type});});
    sorted.forEach(s=>{if(s.city.toLowerCase().includes(ql)||s.venue.toLowerCase().includes(ql)||s.date.includes(ql))it.push({type:"show",id:s.date,label:`${fD(s.date)} ${s.city}`,sub:s.venue,cId:s.clientId});});
    return it.slice(0,14);
  },[q,sorted,actions]);
  useEffect(()=>{setSel1(0);},[q]);
  const go=item=>{
    if(item.type==="action"){item.run?.();}
    if(item.type==="tab")setTab(item.id);
    if(item.type==="show"){setSel(item.id);if(item.cId)setAC(item.cId);setTab("ros");}
    if(item.type==="client"){setAC(item.id);setTab("dash");}
    setCmd(false);
  };
  const onKey=e=>{
    if(e.key==="Escape")setCmd(false);
    else if(e.key==="ArrowDown"){e.preventDefault();setSel1(i=>Math.min(i+1,res.length-1));}
    else if(e.key==="ArrowUp"){e.preventDefault();setSel1(i=>Math.max(i-1,0));}
    else if(e.key==="Enter"&&res.length)go(res[sel1]||res[0]);
  };
  useEffect(()=>{if(!listRef.current)return;const el=listRef.current.querySelector(`[data-idx="${sel1}"]`);el?.scrollIntoView({block:"nearest"});},[sel1]);
  return(
    <div onClick={()=>setCmd(false)} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.25)",backdropFilter:"blur(6px)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:mobile?40:100,padding:mobile?"40px 12px":undefined,zIndex:1000}}>
      <div onClick={e=>e.stopPropagation()} style={{width:440,maxWidth:"100%",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,boxShadow:"0 25px 60px rgba(0,0,0,.15)",overflow:"hidden"}}>
        <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search shows, views, actions..." onKeyDown={onKey} style={{width:"100%",padding:mobile?"16px 18px":"14px 18px",background:"transparent",border:"none",borderBottom:"1px solid var(--border)",color:T.text,fontSize:mobile?16:14,outline:"none",fontWeight:500}}/>
        <div ref={listRef} style={{maxHeight:360,overflow:"auto"}}>
          {res.length===0&&<div style={{padding:"22px 18px",textAlign:"center",fontSize:11,color:T.textMute}}>No matches. Press <kbd style={{fontFamily:MN,fontSize:10,padding:"1px 5px",background:"var(--card-2)",borderRadius:4}}>Esc</kbd> to close.</div>}
          {res.map((r,i)=>{const active=i===sel1;return <div key={`${r.type}-${r.id}-${i}`} data-idx={i} onClick={()=>go(r)} onMouseEnter={()=>setSel1(i)} style={{padding:mobile?"12px 18px":"10px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,background:active?"var(--accent-pill-bg)":"transparent",borderBottom:"1px solid var(--card-3)",borderLeft:active?"3px solid var(--accent)":"3px solid transparent"}}>
            <span style={{fontSize:11,color:active?"var(--accent)":"var(--text-dim)",width:16,fontFamily:MN,fontWeight:700}}>{r.type==="tab"||r.type==="action"?r.icon:r.type==="client"?CM[r.id]?.short||"●":fW(r.id)}</span>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:mobile?13:12,color:T.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>{r.sub&&<div style={{fontSize:10,color:T.textDim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.sub}</div>}</div>
            {r.cId&&<div style={{width:7,height:7,borderRadius:"50%",background:CM[r.cId]?.color||"var(--text-mute)"}}/>}
            <span style={{fontSize:8,color:active?"var(--accent)":"var(--text-mute)",fontFamily:MN,letterSpacing:"0.04em",textTransform:"uppercase"}}>{r.type}</span>
          </div>;})}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"7px 14px",borderTop:"1px solid var(--border)",background:"var(--card-4)",fontSize:9,color:T.textDim,fontFamily:MN}}>
          <span><kbd style={{fontFamily:MN,padding:"1px 5px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:4}}>↑↓</kbd> navigate</span>
          <span><kbd style={{fontFamily:MN,padding:"1px 5px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:4}}>↵</kbd> select</span>
          <span><kbd style={{fontFamily:MN,padding:"1px 5px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:4}}>esc</kbd> close</span>
          <span style={{marginLeft:"auto"}}>⌘K</span>
        </div>
      </div>
    </div>
  );
}
