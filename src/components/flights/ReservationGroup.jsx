import React, { useState } from "react";
import { ConnectionPill } from "../shared/ConnectionPill";
import { ReservationHeader } from "./ReservationHeader";
import { getLegLabel } from "../../lib/flights-view";

export function ReservationGroup({g,defaultCollapsed=false,borderColor,renderSegment}){
  const[collapsed,setCollapsed]=useState(defaultCollapsed);
  const border=borderColor||(g.journeyType==="ROUND_TRIP"?"var(--info-bg)":"var(--accent-pill-border)");
  return(
    <div style={{display:"flex",flexDirection:"column",gap:collapsed?0:4,...(g.isSolo?{}:{borderLeft:`2px solid ${border}`,paddingLeft:8})}}>
      {!g.isSolo&&<ReservationHeader g={g} collapsed={collapsed} onToggle={()=>setCollapsed(c=>!c)}/>}
      {!collapsed&&g.segs.map((f,i)=>(
        <React.Fragment key={f.id}>
          {i>0&&<ConnectionPill prev={g.segs[i-1]} next={f}/>}
          {renderSegment(f,getLegLabel(g.segs,i,g.journeyType))}
        </React.Fragment>
      ))}
    </div>
  );
}
