import { useContext, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { SK } from "../../lib/constants";
import { MN } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";

export function ExportModal({onClose}){
  const{shows,ros,advances,finance,role,tab,sel,aC}=useContext(Ctx);
  const[mode,setMode]=useState("export");const[txt,setTxt]=useState("");const[msg,setMsg]=useState("");
  const snapshot={shows,ros,advances,finance,settings:{role,tab,sel,aC},v:"v7",exported:new Date().toISOString()};
  const dl=()=>{const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`dos-snapshot-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);};
  const imp=async()=>{try{const d=JSON.parse(txt);if(!d.shows||!d.advances)throw new Error("Missing shows/advances");
    await Promise.all([window.storage.set(SK.SHOWS,d.shows),window.storage.set(SK.ROS,d.ros||{}),window.storage.set(SK.ADVANCES,d.advances),window.storage.set(SK.FINANCE,d.finance||{}),d.settings&&window.storage.set(SK.SETTINGS,d.settings)].filter(Boolean));
    setMsg("Imported. Reloading…");setTimeout(()=>window.location.reload(),600);
  }catch(e){setMsg("Error: "+e.message);}};
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{width:520,maxWidth:"100%",background:"var(--card)",borderRadius:10,border:"1px solid var(--border)",padding:18,fontFamily:"'Outfit',system-ui"}}>
      <div style={{display:"flex",gap:4,marginBottom:10}}>
        {["export","import"].map(m=><button key={m} onClick={()=>setMode(m)} style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:6,border:"none",background:mode===m?"var(--accent)":"var(--card-3)",color:mode===m?"var(--card)":"var(--text-dim)",cursor:"pointer"}}>{m.toUpperCase()}</button>)}
        <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:T.textDim,fontSize:16}}>×</button>
      </div>
      {mode==="export"?(<><div style={{fontSize:11,color:T.textDim,marginBottom:6}}>Shared snapshot (shows, ROS, advances, finance, settings).</div>
        <pre style={{background:"var(--card-3)",padding:10,borderRadius:6,fontSize:9,fontFamily:MN,maxHeight:300,overflow:"auto"}}>{JSON.stringify(snapshot,null,2).slice(0,4000)}{JSON.stringify(snapshot).length>4000&&"\n…"}</pre>
        <button onClick={dl} style={{marginTop:8,background:"var(--accent)",border:"none",borderRadius:6,color:"#fff",fontSize:11,padding:"6px 14px",cursor:"pointer",fontWeight:700}}>Download JSON</button></>):(
        <><div style={{fontSize:11,color:T.textDim,marginBottom:6}}>Paste JSON to restore shared state.</div>
          <textarea value={txt} onChange={e=>setTxt(e.target.value)} placeholder="{...}" rows={10} style={{width:"100%",fontFamily:MN,fontSize:9,padding:8,border:"1px solid var(--border)",borderRadius:6,resize:"vertical"}}/>
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}>
            <button onClick={imp} disabled={!txt.trim()} style={{background:"var(--accent)",border:"none",borderRadius:6,color:"#fff",fontSize:11,padding:"6px 14px",cursor:txt.trim()?"pointer":"default",fontWeight:700,opacity:txt.trim()?1:.5}}>Restore</button>
            {msg&&<span style={{fontSize:10,color:msg.startsWith("Error")?"var(--danger-fg)":"var(--success-fg)"}}>{msg}</span>}
          </div></>)}
    </div></div>;
}
