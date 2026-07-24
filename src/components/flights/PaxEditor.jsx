import { useState } from "react";
import { T } from "../../styles/tokens";
import { matchPaxToCrew } from "../../lib/flights-view";

export function PaxEditor({pax,crew,onSave}){
  const[names,setNames]=useState(pax||[]);
  const[input,setInput]=useState("");
  const[open,setOpen]=useState(false);
  const inp2={background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 8px",outline:"none",fontFamily:"'Outfit',system-ui",width:"100%",boxSizing:"border-box"};
  const sugg=input.length>0?(crew||[]).filter(c=>c.name&&c.name.toLowerCase().includes(input.toLowerCase())).slice(0,5):[];

  const add=name=>{
    const t=String(name||"").trim();
    if(!t||names.includes(t))return;
    const next=[...names,t];
    setNames(next);onSave(next);setInput("");setOpen(false);
  };
  const remove=i=>{const next=names.filter((_,j)=>j!==i);setNames(next);onSave(next);};

  return(
    <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:0,width:"100%"}}>
      <div style={{fontSize:8,fontWeight:700,color:T.textDim,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:2}}>Passengers</div>
      {names.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3}}>
        {names.map((n,i)=>{
          const matched=matchPaxToCrew([n],crew||[]).length>0;
          return(<span key={i} style={{display:"flex",alignItems:"center",gap:2,fontSize:9,padding:"2px 6px",borderRadius:4,background:matched?"var(--success-bg)":"var(--card-2)",color:matched?"var(--success-fg)":"var(--text-2)",border:`1px solid ${matched?"var(--success-bg)":"var(--border)"}`}}>
            {n}<button onClick={()=>remove(i)} style={{background:"none",border:"none",cursor:"pointer",color:T.textMute,fontSize:11,lineHeight:1,padding:"0 0 0 2px"}}>×</button>
          </span>);
        })}
      </div>}
      <div style={{position:"relative"}}>
        <input value={input} onChange={e=>{setInput(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),160)}
          onKeyDown={e=>{if(e.key==="Enter"&&input.trim()){add(input);e.preventDefault();}}}
          placeholder="Add name or search crew…" style={inp2}/>
        {open&&sugg.length>0&&(
          <div style={{position:"absolute",top:"100%",left:0,right:0,background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,zIndex:20,maxHeight:130,overflowY:"auto",boxShadow:"0 4px 12px rgba(0,0,0,0.08)"}}>
            {sugg.map(c=>(
              <div key={c.id} onMouseDown={()=>add(c.name)} style={{padding:"5px 9px",cursor:"pointer",fontSize:10,display:"flex",gap:6,alignItems:"center"}} className="rh">
                <span style={{fontWeight:700}}>{c.name.split(" ")[0]}</span>
                <span style={{color:T.textDim,fontSize:9}}>{c.name.split(" ").slice(1).join(" ")}</span>
                <span style={{marginLeft:"auto",fontSize:8,color:T.textMute}}>{c.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
