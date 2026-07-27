import { useEffect, useRef, useState } from "react";
import { MN } from "../../lib/domain-constants";
import { supabase } from "../../lib/supabase";
import { T } from "../../styles/tokens";
import { useAuth } from "../AuthGate";

export function UserMenu({role,setRole,visibleRoles,setUploadOpen,setCmd,commentMode,setCommentMode,setExp,canUpload,canCmd}){
  const a=useAuth();const user=a?.user;
  const[open,setOpen]=useState(false);
  const[theme,setTheme]=useState(()=>{try{return localStorage.getItem("dos-theme")||"dark";}catch{return "dark";}});
  const ref=useRef(null);
  useEffect(()=>{if(!open)return;const onDoc=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",onDoc);return()=>document.removeEventListener("mousedown",onDoc);},[open]);
  const toggleTheme=()=>{const next=theme==="dark"?"light":"dark";setTheme(next);try{localStorage.setItem("dos-theme",next);}catch{}document.documentElement.setAttribute("data-theme",next);};
  if(!user)return null;
  const initial=(user.email||"?").trim()[0].toUpperCase();
  const close=()=>setOpen(false);
  const row={display:"flex",alignItems:"center",gap:8,padding:"7px 10px",fontSize:11,color:T.text2,background:"transparent",border:"none",cursor:"pointer",textAlign:"left",width:"100%",borderRadius:6,fontWeight:500};
  const iconStyle={width:18,fontSize:12,textAlign:"center",flexShrink:0};
  return(
    <div ref={ref} style={{position:"relative"}}>
      <button title={user.email} onClick={()=>setOpen(v=>!v)} style={{width:24,height:24,borderRadius:"50%",background:open?"var(--accent-soft)":"var(--accent)",color:"#fff",fontSize:11,fontWeight:700,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>{initial}</button>
      {open&&(
        <div style={{position:"absolute",top:30,right:0,minWidth:220,background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,boxShadow:"0 10px 28px rgba(0,0,0,0.45)",padding:6,zIndex:90,display:"flex",flexDirection:"column",gap:1}}>
          <div style={{padding:"6px 10px 4px",fontSize:9,color:T.textMute,fontFamily:MN,fontWeight:700,letterSpacing:"0.08em"}}>{user.email}</div>
          {visibleRoles?.length>0&&<>
            <div style={{padding:"4px 10px 2px",fontSize:8,color:T.textMute,fontFamily:MN,fontWeight:700,letterSpacing:"0.08em"}}>ROLE</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:3,padding:"2px 8px 6px"}}>
              {visibleRoles.map(r=><button key={r.id} onClick={()=>setRole(r.id)} style={{fontSize:10,fontWeight:role===r.id?700:500,padding:"4px 8px",borderRadius:6,border:"1px solid var(--border)",cursor:"pointer",background:role===r.id?"var(--accent-pill-bg)":"var(--card-2)",color:role===r.id?r.c:"var(--text-dim)"}}>{r.label}</button>)}
            </div>
            <div style={{height:1,background:"var(--border)",margin:"4px 6px"}}/>
          </>}
          {canUpload&&<button onClick={()=>{setUploadOpen(true);close();}} style={row}><span style={iconStyle}>↑</span>Upload</button>}
          <button onClick={()=>{setExp(true);close();}} style={row}><span style={iconStyle}>⇅</span>Export / Import</button>
          {canCmd&&<button onClick={()=>{setCmd(true);close();}} style={row}><span style={iconStyle}>⌘</span>Command palette<span style={{marginLeft:"auto",fontSize:9,color:T.textMute,fontFamily:MN}}>⌘K</span></button>}
          <button onClick={()=>{setCommentMode(v=>!v);close();}} style={{...row,color:commentMode?T.accent:T.text2}}><span style={iconStyle}>💬</span>{commentMode?"Exit comment mode":"Leave feedback"}</button>
          <button onClick={()=>{toggleTheme();}} style={row}><span style={iconStyle}>{theme==="dark"?"☼":"☾"}</span>{theme==="dark"?"Light theme":"Dark theme"}</button>
          <div style={{height:1,background:"var(--border)",margin:"4px 6px"}}/>
          <button onClick={()=>{supabase.auth.signOut().catch(e=>console.warn("[signout]",e?.message||e));close();}} style={{...row,color:"var(--danger-fg)"}}><span style={iconStyle}>⎋</span>Sign out</button>
        </div>
      )}
    </div>
  );
}
