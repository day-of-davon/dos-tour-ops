import { useState } from "react";
import { T } from "../../styles/tokens";

export function VBSection({title,children,accent}){
  const[open,setOpen]=useState(true);
  return(
    <div style={{background:"var(--card)",border:`1px solid ${accent||"var(--border)"}`,borderRadius:10,overflow:"hidden",marginBottom:8}}>
      <div onClick={()=>setOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",cursor:"pointer",background:accent?`${accent}18`:"var(--card-3)",borderBottom:open?"1px solid var(--border)":"none"}}>
        <span style={{fontSize:9,color:T.textDim}}>{open?"▾":"▸"}</span>
        <span style={{fontSize:9,fontWeight:800,color:accent||"var(--text-2)",letterSpacing:"0.06em",textTransform:"uppercase"}}>{title}</span>
      </div>
      {open&&<div style={{padding:"6px 10px 8px"}}>{children}</div>}
    </div>
  );
}
