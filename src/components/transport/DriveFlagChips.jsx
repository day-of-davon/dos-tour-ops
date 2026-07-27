import { useMemo } from "react";
import { MN } from "../../lib/domain-constants";
import { DRIVE_FLAG_STYLE, computeDriveFlags } from "../../lib/intel";

export function DriveFlagChips({entry,size:sz="sm"}){
  const flags=useMemo(()=>computeDriveFlags(entry),[entry]);
  if(flags.length===0)return null;
  const fs=sz==="lg"?9:8;
  const pad=sz==="lg"?"3px 9px":"2px 7px";
  return(
    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
      {flags.map(f=>{const s=DRIVE_FLAG_STYLE[f.sev]||DRIVE_FLAG_STYLE.mute;return(
        <span key={f.id} style={{fontSize:fs,fontWeight:800,padding:pad,borderRadius:99,background:s.bg,color:s.c,letterSpacing:"0.06em",fontFamily:MN,whiteSpace:"nowrap",border:`1px solid ${s.c}30`}}>{f.label}</span>
      );})}
    </div>
  );
}
