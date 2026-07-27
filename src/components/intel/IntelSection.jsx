import { MN } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";

export function IntelSection({title,count,children,actions,defaultOpen=false}){
  return(
    <details open={defaultOpen||undefined} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
      <summary style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)"}}>
        <span style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.06em"}}>{title}</span>
        {count!=null&&<span style={{fontSize:9,color:T.textMute,fontFamily:MN}}>({count})</span>}
        {actions&&<span style={{marginLeft:"auto",display:"flex",gap:6}} onClick={e=>e.stopPropagation()}>{actions}</span>}
      </summary>
      <div style={{padding:"8px 12px 10px"}}>{children}</div>
    </details>
  );
}
