import { T } from "../../styles/tokens";

export function VBRow({label,value,warn}){
  if(!value||value==="TBC"&&!warn)return null;
  const isWarn=warn||(typeof value==="string"&&value.startsWith("⚠"));
  return(
    <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:6,padding:"4px 0",borderBottom:"1px solid var(--card-2)",alignItems:"flex-start"}}>
      <span style={{fontSize:9,fontWeight:800,color:T.textMute,textTransform:"uppercase",letterSpacing:"0.05em",paddingTop:1}}>{label}</span>
      <span style={{fontSize:10,color:isWarn?"var(--warn-fg)":"var(--text)",lineHeight:1.4}}>{value}</span>
    </div>
  );
}
