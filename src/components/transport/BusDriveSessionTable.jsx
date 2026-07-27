import { MN } from "../../lib/domain-constants";
import { DRIVE_KIND_STYLE, parseDriveSessions } from "../../lib/ros-data";
import { T } from "../../styles/tokens";

export function BusDriveSessionTable({entry,label,compact,sessions:providedSessions}){
  if(!entry)return null;
  const storedSessions=entry.sessions!=null&&entry.sessions.length>0?entry.sessions:null;
  const sessions=providedSessions||storedSessions||parseDriveSessions(entry.note,entry.stops);
  const hasContent=!!providedSessions||!!storedSessions||!!entry.note||!!entry.stops;
  if(!hasContent)return null;
  const totalKm=entry.km||0;
  const totalDrive=entry.drive&&entry.drive!=="—"?entry.drive:null;
  const flagged=entry.flag==="⚠";
  return(
    <div style={{padding:compact?"10px 14px 12px":"10px 14px 14px",background:"var(--card)",borderTop:"1px solid var(--border)",fontSize:9}}>
      {label&&<div style={{fontSize:8,fontWeight:800,color:"var(--info-fg)",letterSpacing:"0.1em",marginBottom:6,textTransform:"uppercase"}}>{label}</div>}
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:8,paddingBottom:6,borderBottom:"1px solid var(--card-2)"}}>
        <div style={{fontSize:11,fontWeight:800,color:T.text,letterSpacing:"-0.01em"}}>{entry.route||"Drive day"}</div>
        {totalKm>0&&<span style={{fontSize:9,fontFamily:MN,fontWeight:700,color:T.text2,padding:"2px 7px",borderRadius:99,background:"var(--card-2)",border:"1px solid var(--border)"}}>{totalKm} km</span>}
        {totalDrive&&<span style={{fontSize:9,fontFamily:MN,fontWeight:700,color:flagged?"var(--danger-fg)":T.text2,padding:"2px 7px",borderRadius:99,background:flagged?"var(--danger-bg)":"var(--card-2)",border:`1px solid ${flagged?"var(--danger-fg)":"var(--border)"}`}}>{totalDrive}{flagged?" ⚠":""}</span>}
        {entry.dep&&entry.dep!=="—"&&<span style={{fontSize:9,fontFamily:MN,color:T.textDim}}>↑ {entry.dep}</span>}
        {entry.arr&&entry.arr!=="—"&&<span style={{fontSize:9,fontFamily:MN,color:T.textDim}}>↓ {entry.arr}</span>}
        <span style={{marginLeft:"auto",fontSize:8,color:T.textMute,fontFamily:MN,letterSpacing:"0.04em"}}>Pieter Smit T26-021201</span>
      </div>
      {sessions.length>0?(
        <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"'Outfit',system-ui",fontSize:9}}>
          <thead>
            <tr style={{textAlign:"left",color:T.textDim,fontWeight:800,letterSpacing:"0.06em"}}>
              <th style={{padding:"4px 6px",fontSize:8,width:54,whiteSpace:"nowrap",borderBottom:"1px solid var(--card-2)"}}>STAGE</th>
              <th style={{padding:"4px 6px",fontSize:8,width:106,whiteSpace:"nowrap",borderBottom:"1px solid var(--card-2)"}}>TIME</th>
              <th style={{padding:"4px 6px",fontSize:8,borderBottom:"1px solid var(--card-2)"}}>ROUTE / LOCATION</th>
              <th style={{padding:"4px 6px",fontSize:8,width:60,textAlign:"right",fontFamily:MN,whiteSpace:"nowrap",borderBottom:"1px solid var(--card-2)"}}>KM</th>
              <th style={{padding:"4px 6px",fontSize:8,width:54,textAlign:"right",fontFamily:MN,whiteSpace:"nowrap",borderBottom:"1px solid var(--card-2)"}}>DUR</th>
              <th style={{padding:"4px 6px",fontSize:8,borderBottom:"1px solid var(--card-2)"}}>NOTES</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((r,i)=>{const ks=DRIVE_KIND_STYLE[r.kind]||DRIVE_KIND_STYLE.other;return(
              <tr key={i} style={{borderBottom:i<sessions.length-1?"1px solid var(--card-2)":"none",background:i%2===0?"transparent":"var(--card-2)"}}>
                <td style={{padding:"5px 6px",verticalAlign:"top",whiteSpace:"nowrap"}}>
                  <span style={{fontSize:8,fontWeight:800,padding:"2px 7px",borderRadius:99,background:ks.bg,color:ks.c,letterSpacing:"0.06em",fontFamily:MN}}>{r.label}</span>
                </td>
                <td style={{padding:"5px 6px",verticalAlign:"top",fontFamily:MN,fontWeight:700,color:T.text2,whiteSpace:"nowrap",fontSize:9}}>{r.time||"—"}</td>
                <td style={{padding:"5px 6px",verticalAlign:"top",color:T.text,fontWeight:r.kind==="session"||r.kind==="ferry"?600:500,fontSize:9}}>{r.route||"—"}</td>
                <td style={{padding:"5px 6px",verticalAlign:"top",textAlign:"right",fontFamily:MN,color:r.km?T.text2:T.textMute,fontWeight:600,fontSize:9}}>{r.km||"—"}</td>
                <td style={{padding:"5px 6px",verticalAlign:"top",textAlign:"right",fontFamily:MN,color:r.dur?T.text2:T.textMute,fontWeight:600,fontSize:9}}>{r.dur||"—"}</td>
                <td style={{padding:"5px 6px",verticalAlign:"top",color:T.textDim,fontStyle:r.note?"italic":"normal",fontSize:9}}>{r.note||"—"}</td>
              </tr>
            );})}
          </tbody>
        </table>
      ):(
        entry.note&&<div style={{fontSize:9,color:T.text2,fontStyle:"italic"}}>{entry.note}</div>
      )}
      {entry.stops&&(
        <div style={{marginTop:8,paddingTop:6,borderTop:"1px solid var(--card-2)"}}>
          <div style={{fontSize:7,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",marginBottom:3}}>STOP LOCATIONS</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {String(entry.stops).split("·").map((s,i)=><span key={i} style={{fontSize:9,padding:"2px 8px",borderRadius:6,background:"var(--info-bg)",color:"var(--info-fg)",fontWeight:600,border:"1px solid var(--info-bg)"}}>📍 {s.trim()}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
