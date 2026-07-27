import { useState } from "react";
import { MN } from "../../lib/domain-constants";
import { DRIVE_KIND_STYLE } from "../../lib/ros-data";
import { T } from "../../styles/tokens";

export function DriveSessionEditor({initialSessions,onSave,onCancel,onReset,hasOverride}){
  const[rows,setRows]=useState(()=>initialSessions.map((r,i)=>({...r,_k:i})));
  const[nk,setNk]=useState(initialSessions.length);
  const upd=(k,f,v)=>setRows(p=>p.map(r=>r._k===k?{...r,[f]:v}:r));
  const mv=(k,dir)=>setRows(p=>{const i=p.findIndex(r=>r._k===k);const j=i+dir;if(j<0||j>=p.length)return p;const n=[...p];[n[i],n[j]]=[n[j],n[i]];return n;});
  const del=(k)=>setRows(p=>p.filter(r=>r._k!==k));
  const addRow=()=>{const k=nk;setNk(n=>n+1);const sn=rows.filter(r=>r.kind==="session").length+1;setRows(p=>[...p,{kind:"session",label:`S${sn}`,time:"",route:"",km:null,dur:null,note:null,_k:k}]);};
  const kinds=Object.keys(DRIVE_KIND_STYLE);
  const inp={fontSize:9,padding:"2px 4px",borderRadius:3,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"'Outfit',system-ui"};
  return(
    <div style={{padding:"8px 0 0"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
        <span style={{fontSize:8,fontWeight:800,color:"var(--warn-fg)",letterSpacing:"0.1em",textTransform:"uppercase"}}>Edit Drive Sessions{hasOverride?" · Override active":""}</span>
        <span style={{marginLeft:"auto",fontSize:8,color:T.textMute,fontStyle:"italic"}}>click any cell to edit</span>
      </div>
      <div style={{overflowX:"auto",borderRadius:6,border:"1px solid var(--border)"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:9,fontFamily:"'Outfit',system-ui"}}>
          <thead>
            <tr style={{color:T.textDim,fontWeight:800,letterSpacing:"0.06em",fontSize:8,background:"var(--card-2)"}}>
              <th style={{padding:"4px 5px",textAlign:"left",borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>KIND</th>
              <th style={{padding:"4px 5px",textAlign:"left",borderBottom:"1px solid var(--border)",width:42}}>LABEL</th>
              <th style={{padding:"4px 5px",textAlign:"left",borderBottom:"1px solid var(--border)",width:108}}>TIME</th>
              <th style={{padding:"4px 5px",textAlign:"left",borderBottom:"1px solid var(--border)"}}>ROUTE / LOCATION</th>
              <th style={{padding:"4px 5px",textAlign:"right",borderBottom:"1px solid var(--border)",width:56,fontFamily:MN}}>KM</th>
              <th style={{padding:"4px 5px",textAlign:"right",borderBottom:"1px solid var(--border)",width:48,fontFamily:MN}}>DUR</th>
              <th style={{padding:"4px 5px",textAlign:"left",borderBottom:"1px solid var(--border)",width:110}}>NOTES</th>
              <th style={{padding:"4px 5px",borderBottom:"1px solid var(--border)",width:60}}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=>{
              const ks=DRIVE_KIND_STYLE[r.kind]||DRIVE_KIND_STYLE.other;
              return(
                <tr key={r._k} style={{background:i%2===0?"transparent":"rgba(255,255,255,0.025)"}}>
                  <td style={{padding:"3px 4px",verticalAlign:"middle"}}>
                    <select value={r.kind} onChange={e=>{const nk=e.target.value;const auto=DRIVE_KIND_STYLE[nk]?.label||r.label;setRows(p=>p.map(x=>x._k===r._k?{...x,kind:nk,label:auto}:x));}} style={{...inp,width:72,fontSize:8,padding:"2px 3px",background:ks.bg,color:ks.c,border:`1px solid ${ks.c}50`,fontWeight:800,fontFamily:MN}}>
                      {kinds.map(k=><option key={k} value={k} style={{background:"var(--card)",color:T.text,fontWeight:400}}>{k}</option>)}
                    </select>
                  </td>
                  <td style={{padding:"3px 4px",verticalAlign:"middle"}}>
                    <input value={r.label||""} onChange={e=>upd(r._k,"label",e.target.value||null)} style={{...inp,width:42,fontFamily:MN,fontWeight:700,fontSize:9}}/>
                  </td>
                  <td style={{padding:"3px 4px",verticalAlign:"middle"}}>
                    <input value={r.time||""} onChange={e=>upd(r._k,"time",e.target.value||null)} style={{...inp,width:108,fontFamily:MN,fontSize:9}} placeholder="HH:MM–HH:MM TZ"/>
                  </td>
                  <td style={{padding:"3px 4px",verticalAlign:"middle"}}>
                    <input value={r.route||""} onChange={e=>upd(r._k,"route",e.target.value||null)} style={{...inp,fontSize:9}} placeholder="Route or location"/>
                  </td>
                  <td style={{padding:"3px 4px",verticalAlign:"middle"}}>
                    <input value={r.km||""} onChange={e=>upd(r._k,"km",e.target.value||null)} style={{...inp,width:56,fontFamily:MN,textAlign:"right",fontSize:9}} placeholder="—"/>
                  </td>
                  <td style={{padding:"3px 4px",verticalAlign:"middle"}}>
                    <input value={r.dur||""} onChange={e=>upd(r._k,"dur",e.target.value||null)} style={{...inp,width:48,fontFamily:MN,textAlign:"right",fontSize:9}} placeholder="—"/>
                  </td>
                  <td style={{padding:"3px 4px",verticalAlign:"middle"}}>
                    <input value={r.note||""} onChange={e=>upd(r._k,"note",e.target.value||null)} style={{...inp,width:110,fontSize:9}} placeholder="—"/>
                  </td>
                  <td style={{padding:"3px 4px",verticalAlign:"middle",whiteSpace:"nowrap"}}>
                    <button onClick={()=>mv(r._k,-1)} disabled={i===0} style={{fontSize:9,padding:"1px 4px",borderRadius:3,border:"1px solid var(--border)",background:"transparent",color:i===0?T.textMute:T.text2,cursor:i===0?"default":"pointer",marginRight:2,lineHeight:1}}>↑</button>
                    <button onClick={()=>mv(r._k,1)} disabled={i===rows.length-1} style={{fontSize:9,padding:"1px 4px",borderRadius:3,border:"1px solid var(--border)",background:"transparent",color:i===rows.length-1?T.textMute:T.text2,cursor:i===rows.length-1?"default":"pointer",marginRight:2,lineHeight:1}}>↓</button>
                    <button onClick={()=>del(r._k)} style={{fontSize:9,padding:"1px 4px",borderRadius:3,border:"1px solid var(--danger-fg)60",background:"transparent",color:"var(--danger-fg)",cursor:"pointer",lineHeight:1}}>✕</button>
                  </td>
                </tr>
              );
            })}
            {rows.length===0&&<tr><td colSpan={8} style={{padding:"10px 8px",textAlign:"center",color:T.textMute,fontSize:9,fontStyle:"italic"}}>No rows — use + Add row below</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:7,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        <button onClick={addRow} style={{fontSize:9,padding:"3px 10px",borderRadius:5,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text2,cursor:"pointer",fontWeight:700}}>+ Add row</button>
        <button onClick={()=>onSave(rows.map(({_k,...r})=>r))} style={{fontSize:9,padding:"3px 10px",borderRadius:5,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>✓ Save sessions</button>
        <button onClick={onCancel} style={{fontSize:9,padding:"3px 8px",borderRadius:5,border:"1px solid var(--border)",background:"transparent",color:T.text2,cursor:"pointer"}}>Cancel</button>
        {hasOverride&&<button onClick={onReset} style={{fontSize:9,padding:"3px 8px",borderRadius:5,border:"1px solid var(--danger-fg)",background:"transparent",color:"var(--danger-fg)",cursor:"pointer",fontWeight:700,marginLeft:"auto"}}>↺ Reset to parsed</button>}
      </div>
    </div>
  );
}
