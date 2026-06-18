import { useEffect, useRef, useState } from "react";
import { SC, SC_CYCLE, SC_ORDER } from "../../lib/domain-constants";

export function StatusBtn({status,setStatus,mobile}){
  const[open,setOpen]=useState(false);
  const[flipUp,setFlipUp]=useState(false);
  const s=SC[status]||SC.pending;const ref=useRef(null);const btnRef=useRef(null);const lp=useRef(null);
  useEffect(()=>{
    if(!open)return;
    if(btnRef.current){
      const rect=btnRef.current.getBoundingClientRect();
      const estHeight=SC_ORDER.length*(mobile?30:24)+10;
      const spaceBelow=window.innerHeight-rect.bottom;
      setFlipUp(spaceBelow<estHeight&&rect.top>estHeight);
    }
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[open,mobile]);
  const cycle=()=>{const i=SC_CYCLE.indexOf(status);setStatus(SC_CYCLE[(i+1)%SC_CYCLE.length]||SC_CYCLE[0]);};
  const onClick=e=>{if(mobile){setOpen(true);return;}cycle();};
  const onCtx=e=>{e.preventDefault();setOpen(true);};
  const onDown=e=>{if(mobile)return;if(lp.current)clearTimeout(lp.current);lp.current=setTimeout(()=>setOpen(true),400);};
  const onUp=()=>{if(lp.current){clearTimeout(lp.current);lp.current=null;}};
  const caretClick=e=>{e.stopPropagation();e.preventDefault();setOpen(v=>!v);};
  const tip=mobile?`${s.l} — tap to change`:`${s.l} — click to cycle, caret or right-click for all options`;
  return <div ref={ref} style={{position:"relative",flexShrink:0,display:"inline-flex"}}>
    <button ref={btnRef} title={tip} onClick={onClick} onContextMenu={onCtx} onMouseDown={onDown} onMouseUp={onUp} onMouseLeave={onUp} onTouchStart={onDown} onTouchEnd={onUp}
      onKeyDown={e=>{if(["Enter"," ","ArrowRight","+"].includes(e.key)){e.preventDefault();cycle();}}}
      style={{fontSize:mobile?10:9,padding:mobile?"5px 9px":"3px 8px",borderTopLeftRadius:5,borderBottomLeftRadius:5,borderTopRightRadius:0,borderBottomRightRadius:0,border:"none",borderRight:`1px solid ${s.c}26`,cursor:"pointer",fontWeight:700,background:s.b,color:s.c,minWidth:mobile?82:78,minHeight:mobile?28:undefined}}>{s.l}</button>
    <button title="Open all status options" aria-label="Open status menu" onClick={caretClick}
      style={{fontSize:mobile?10:9,padding:mobile?"5px 7px":"3px 6px",borderTopRightRadius:5,borderBottomRightRadius:5,borderTopLeftRadius:0,borderBottomLeftRadius:0,border:"none",cursor:"pointer",fontWeight:800,background:s.b,color:s.c,minHeight:mobile?28:undefined,opacity:.75}}>▾</button>
    {open&&<div style={{position:"absolute",...(flipUp?{bottom:"100%",marginBottom:3}:{top:"100%",marginTop:3}),right:0,background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,boxShadow:"0 6px 20px rgba(0,0,0,.1)",zIndex:50,padding:3,minWidth:130,maxHeight:"min(70vh, 320px)",overflowY:"auto"}}>
      {SC_ORDER.map(k=>{const v=SC[k];return <button key={k} onClick={()=>{setStatus(k);setOpen(false);}} style={{display:"block",width:"100%",textAlign:"left",padding:mobile?"7px 10px":"4px 8px",fontSize:mobile?11:10,border:"none",background:status===k?v.b:"transparent",color:v.c,cursor:"pointer",borderRadius:4,fontWeight:600}}>{v.l}</button>;})}
    </div>}
  </div>;
}
