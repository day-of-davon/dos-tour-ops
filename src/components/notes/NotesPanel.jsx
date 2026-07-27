import { useContext, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";

export function NotesPanel(){
  const{sel,eventKey,advances,uAdv,notesPriv,uNotesPriv,pushUndo}=useContext(Ctx);
  const[tabN,setTabN]=useState("public");const[txt,setTxt]=useState("");
  const shared=advances[eventKey]?.sharedNotes||[];const priv=notesPriv[eventKey]||[];
  const list=tabN==="public"?shared:priv;
  const add=()=>{if(!txt.trim())return;const n={id:`n${Date.now()}`,text:txt.trim(),ts:Date.now()};
    if(tabN==="public")uAdv(eventKey,{sharedNotes:[...shared,n]});else uNotesPriv(eventKey,[...priv,n]);
    setTxt("");};
  const del=id=>{if(tabN==="public"){const prev=shared;uAdv(eventKey,{sharedNotes:shared.filter(n=>n.id!==id)});pushUndo("Note deleted.",()=>uAdv(eventKey,{sharedNotes:prev}));}else{const prev=priv;uNotesPriv(eventKey,priv.filter(n=>n.id!==id));pushUndo("Note deleted.",()=>uNotesPriv(eventKey,prev));}};
  return <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px"}}>
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
      <span style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.06em"}}>NOTES</span>
      <div style={{display:"flex",gap:2,marginLeft:"auto",background:"var(--card-3)",borderRadius:6,padding:2}}>
        {["public","private"].map(m=><button key={m} onClick={()=>setTabN(m)} style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:"none",cursor:"pointer",background:tabN===m?"var(--card)":"transparent",color:tabN===m?"var(--text)":"var(--text-dim)",fontWeight:700,textTransform:"uppercase"}}>{m}</button>)}
      </div>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:6}}>
      {list.length===0&&<div style={{fontSize:10,color:T.textMute,fontStyle:"italic"}}>No {tabN} notes yet.</div>}
      {list.map(n=><div key={n.id} style={{display:"flex",gap:6,padding:"5px 7px",background:"var(--card-3)",borderRadius:6}}>
        <span style={{fontSize:10,color:T.text,flex:1,whiteSpace:"pre-wrap"}}>{n.text}</span>
        <span style={{fontSize:8,color:T.textMute,fontFamily:MN}}>{new Date(n.ts).toLocaleDateString()}</span>
        <button onClick={()=>del(n.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:11}}>×</button>
      </div>)}
    </div>
    <div style={{display:"flex",gap:5}}>
      <input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder={`Add ${tabN} note…`}
        style={{flex:1,background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 7px",outline:"none"}}/>
      <button onClick={add} style={{background:tabN==="public"?"var(--accent)":"var(--text-3)",border:"none",borderRadius:6,color:"#fff",fontSize:10,padding:"4px 12px",cursor:"pointer",fontWeight:700}}>Add</button>
    </div>
  </div>;
}
