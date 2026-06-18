import { MN, UI } from "../../lib/domain-constants";
import { fmt, pM } from "../../lib/time";
import { T } from "../../styles/tokens";

export function AnchorTimes({b,setBF}){
  const toggle=(field,on)=>setBF(b.id,field,on?(b[field]??""):null);
  return(
    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
      <label style={{fontSize:9,fontWeight:700,color:T.textDim,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
        <input type="checkbox" checked={b.anchorStartAt!=null} onChange={e=>toggle("anchorStartAt",e.target.checked)}/>Start
      </label>
      {b.anchorStartAt!=null&&<input type="text" placeholder="7:00p" defaultValue={typeof b.anchorStartAt==="number"?fmt(b.anchorStartAt):b.anchorStartAt} onBlur={e=>{const m=pM(e.target.value);if(m!=null)setBF(b.id,"anchorStartAt",m);}} style={{...UI.input,fontFamily:MN,width:70}}/>}
      <label style={{fontSize:9,fontWeight:700,color:T.textDim,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
        <input type="checkbox" checked={b.anchorEndAt!=null} onChange={e=>toggle("anchorEndAt",e.target.checked)}/>End
      </label>
      {b.anchorEndAt!=null&&<input type="text" placeholder="8:00p" defaultValue={typeof b.anchorEndAt==="number"?fmt(b.anchorEndAt):b.anchorEndAt} onBlur={e=>{const m=pM(e.target.value);if(m!=null)setBF(b.id,"anchorEndAt",m);}} style={{...UI.input,fontFamily:MN,width:70}}/>}
    </div>
  );
}
