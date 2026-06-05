import { MN } from "../../lib/domain-constants";
import { gmailUrl } from "../../lib/intel";
import { T } from "../../styles/tokens";
import { JOURNEY_BADGE } from "../../lib/flights-view";

export function ReservationHeader({g,collapsed,onToggle}){
  if(g.isSolo)return null;
  const jb=JOURNEY_BADGE[g.journeyType]||JOURNEY_BADGE.MULTI_LEG;
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 4px",flexWrap:"wrap",cursor:onToggle?"pointer":undefined}} onClick={onToggle}>
      <span style={{fontSize:8,fontWeight:800,letterSpacing:"0.06em",padding:"2px 7px",borderRadius:10,background:jb.bg,color:jb.c,flexShrink:0}}>{jb.label}</span>
      {g.routeChain&&<span style={{fontFamily:MN,fontSize:10,fontWeight:800,color:T.text,flexShrink:0}}>{g.routeChain}</span>}
      {g.segs.length>1&&<span style={{fontSize:8,color:T.textMute,flexShrink:0}}>{g.segs.length} seg</span>}
      {g.pnr&&<span style={{fontSize:9,fontFamily:MN,fontWeight:700,color:T.text2,flexShrink:0}}>{g.pnr}</span>}
      {g.carriers.length>0&&<span style={{fontSize:9,color:T.textDim,flexShrink:0}}>{g.carriers.join(" · ")}</span>}
      {g.paxUnion.length>0&&<span style={{fontSize:9,color:T.textMute,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.paxUnion.join(", ")}</span>}
      {g.totalCost!=null&&<span style={{fontSize:9,fontFamily:MN,fontWeight:700,color:T.successFg,flexShrink:0}}>{g.currency||"$"}{g.totalCost.toFixed(2)}</span>}
      {g.tid&&<a href={gmailUrl(g.tid)} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:9,color:T.link,textDecoration:"none",flexShrink:0}}>email ↗</a>}
      {onToggle&&<span style={{fontSize:10,color:T.textMute,marginLeft:"auto",flexShrink:0}}>{collapsed?"▼":"▲"}</span>}
    </div>
  );
}
