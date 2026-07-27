import { MN } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";

export function GLMetric({label,value,sub}){
  return<div style={{flex:"1 1 120px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px",minWidth:110}}>
    <div style={{fontSize:9,fontWeight:700,color:T.textDim,letterSpacing:"0.08em"}}>{label.toUpperCase()}</div>
    <div style={{fontSize:20,fontWeight:800,color:T.text,fontFamily:MN,lineHeight:1.1,marginTop:2}}>{value}{sub&&<span style={{fontSize:10,color:T.textMute,marginLeft:6}}>{sub}</span>}</div>
  </div>;
}
