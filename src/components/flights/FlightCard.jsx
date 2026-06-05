import { useState } from "react";
import { statusStyle } from "../../DosApp.jsx";
import { MN } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";
import { PaxEditor } from "./PaxEditor";

export function FlightCard({f,actions,liveStatus,onRefreshStatus,refreshing,onUpdatePax,onUpdate,crew,defaultCollapsed=false,legLabel}){
  const st=liveStatus?statusStyle(liveStatus.status):null;
  const delayed=liveStatus?.delayMinutes>0;
  const isFresh=!!f.fresh48h;
  const[editing,setEditing]=useState(false);
  const[draft,setDraft]=useState({});
  const[collapsed,setCollapsed]=useState(defaultCollapsed);
  const startEdit=()=>{
    setDraft({flightNo:f.flightNo||"",carrier:f.carrier||"",from:f.from||"",to:f.to||"",fromCity:f.fromCity||"",toCity:f.toCity||"",depDate:f.depDate||"",dep:f.dep||"",arrDate:f.arrDate||"",arr:f.arr||"",pnr:f.pnr||"",confirmNo:f.confirmNo||"",ticketNo:f.ticketNo||"",cost:f.cost!=null?String(f.cost):"",currency:f.currency||""});
    setEditing(true);
  };
  const saveEdit=()=>{
    const patch={};
    ["flightNo","carrier","from","to","fromCity","toCity","depDate","dep","arrDate","arr","pnr","confirmNo","ticketNo","currency"].forEach(k=>{
      const v=(draft[k]||"").trim();const orig=(f[k]||"").trim();
      if(v!==orig)patch[k]=v||null;
      if(k==="from"||k==="to")patch[k]=(patch[k]||f[k]||"").toUpperCase()||null;
    });
    const n=parseFloat(draft.cost);if(!isNaN(n)&&n!==f.cost)patch.cost=n;else if(draft.cost===""&&f.cost!=null)patch.cost=null;
    if(Object.keys(patch).length)onUpdate(patch);
    setEditing(false);
  };
  const inp={background:"var(--card-2)",border:"1px solid var(--border)",borderRadius:4,fontSize:9,padding:"2px 6px",outline:"none",fontFamily:MN,color:T.text,width:"100%",boxSizing:"border-box"};
  const lbl={fontSize:7,fontWeight:800,color:T.textMute,letterSpacing:"0.08em",marginBottom:1};
  const fld=(key,label,extra={})=><div style={{minWidth:0,...extra.w?{width:extra.w}:{}}}><div style={lbl}>{label}</div><input style={{...inp,...extra.style}} value={draft[key]??""} onChange={e=>setDraft(p=>({...p,[key]:extra.upper?e.target.value.toUpperCase():e.target.value}))} maxLength={extra.max}/></div>;
  return(
    <div style={{background:"var(--card)",border:`1px solid ${editing?"var(--accent)":isFresh?"var(--accent)":st&&delayed?"var(--warn-fg)":st?.c==="var(--danger-fg)"?"var(--danger-fg)":"var(--border)"}`,borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:6,boxShadow:isFresh&&!editing?"0 0 0 2px var(--accent-pill-bg)":undefined}}>
      <div onClick={()=>setCollapsed(c=>!c)} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",cursor:"pointer"}}>
        {legLabel&&<span style={{fontSize:7,fontWeight:800,letterSpacing:"0.08em",padding:"1px 6px",borderRadius:6,background:"var(--card-3)",color:T.textMute,flexShrink:0}}>{legLabel}</span>}
        <div style={{fontFamily:MN,fontSize:13,fontWeight:800,color:T.link}}>{f.from}<span style={{fontSize:10,color:T.textMute,fontWeight:400,padding:"0 5px"}}>→</span>{f.to}</div>
        <div style={{fontSize:10,fontWeight:700,color:T.text}}>{f.flightNo||f.carrier}</div>
        {f.carrier&&f.flightNo&&<div style={{fontSize:9,color:T.textDim}}>{f.carrier}</div>}
        {isFresh&&<span title="Booked within the last 48 hours" style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--accent-pill-bg)",color:T.accent,fontWeight:800,letterSpacing:"0.06em"}}>NEW · 48H</span>}
        {f.parseVerified===true&&<span title="Data verified against source email" style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--success-bg)",color:T.successFg,fontWeight:700}}>✓ verified</span>}
        {f.parseVerified===false&&<span title={f.parseNote||"Verification flagged a discrepancy — review before confirming"} style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--warn-bg)",color:T.warnFg,fontWeight:700,cursor:"help"}}>⚠ check data</span>}
        {f.confidence==="med"&&<span title={f.parseNotes||"Parser flagged this leg as medium confidence"} style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--warn-bg)",color:T.warnFg,fontWeight:700,cursor:"help"}}>~ med conf</span>}
        {f.confidence==="low"&&<span title={f.parseNotes||"Parser flagged this leg as low confidence — verify before confirming"} style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--danger-bg)",color:"var(--danger-fg)",fontWeight:700,cursor:"help"}}>! low conf</span>}
        {(f.validationFlags||[]).length>0&&<span title={`Validation: ${(f.validationFlags||[]).join(", ")}`} style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--warn-bg)",color:T.warnFg,fontWeight:700,cursor:"help"}}>⚠ {(f.validationFlags||[]).length} flag{(f.validationFlags||[]).length>1?"s":""}</span>}
        {st&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:st.bg,color:st.c,fontWeight:700}}>{st.label}{delayed?` +${liveStatus.delayMinutes}m`:""}</span>}
        {f.suggestedShowDate&&<span title={`${f.suggestedRole==="outbound"?"Departs day after":"Arrives for"} ${f.suggestedVenue||f.suggestedShowDate}`} style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:f.suggestedRole==="outbound"?"var(--warn-bg)":"var(--success-bg)",color:f.suggestedRole==="outbound"?"var(--warn-fg)":"var(--success-fg)",fontWeight:700}}>{f.suggestedRole==="outbound"?"OUT":"IN"} · {f.suggestedShowDate}</span>}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
          {onRefreshStatus&&<button onClick={e=>{e.stopPropagation();onRefreshStatus();}} disabled={refreshing} title="Refresh live status" style={{background:"none",border:"none",cursor:refreshing?"default":"pointer",fontSize:10,color:refreshing?"var(--text-mute)":"var(--accent)",padding:0,lineHeight:1}}>{refreshing?"⟳":"⟳"}</button>}
          {onUpdate&&!editing&&!collapsed&&<button onClick={e=>{e.stopPropagation();startEdit();}} title="Edit flight data" style={{fontSize:9,padding:"1px 7px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-2)",color:T.textDim,cursor:"pointer",fontWeight:600}}>Edit</button>}
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
            <div style={{fontSize:9,fontFamily:MN,color:T.text2,fontWeight:600}}>{f.depDate}</div>
            {collapsed&&f.pax?.length>0&&<div style={{fontSize:11,fontWeight:700,color:T.text,letterSpacing:"-0.01em"}}>{f.pax.map(p=>String(p).trim().split(/\s+/)[0]).filter(Boolean).join(", ")}</div>}
          </div>
        </div>
      </div>
      {collapsed&&<div style={{display:"flex",alignItems:"flex-start",gap:16,paddingTop:2}}>
        <div style={{display:"flex",flexDirection:"column",gap:3,minWidth:0}}>
          <div style={{fontFamily:MN,fontSize:12,fontWeight:800,color:T.link,letterSpacing:"0.02em"}}>
            {f.from}<span style={{color:T.textMute,fontWeight:400,padding:"0 5px"}}>→</span>{f.to}
          </div>
          {(f.dep||f.arr)&&<div style={{fontFamily:MN,fontSize:10,fontWeight:600,color:T.text}}>
            {f.dep||"–"}<span style={{color:T.textMute,fontWeight:400,padding:"0 4px"}}>–</span>{f.arr||"–"}
          </div>}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:9,color:T.textDim,alignItems:"center",flex:1,paddingTop:1}}>
          {f.pnr&&<span style={{fontFamily:MN,color:T.text2,fontWeight:700}}>{f.pnr}</span>}
          {f.fareClass&&<span style={{textTransform:"capitalize",color:T.textMute}}>{f.fareClass}</span>}
          {f.pax?.length>0&&<span style={{color:T.textDim}}>{f.pax.length} pax</span>}
        </div>
        {actions&&<div style={{marginLeft:"auto",display:"flex",gap:5,flexShrink:0}}>{actions}</div>}
      </div>}
      {!collapsed&&liveStatus&&(
        <div style={{display:"flex",gap:12,padding:"5px 8px",background:st.bg,borderRadius:6,flexWrap:"wrap"}}>
          {liveStatus.depActual&&<div><div style={{fontSize:8,color:st.c,fontWeight:700}}>ACT DEP</div><div style={{fontFamily:MN,fontSize:10,fontWeight:800,color:st.c}}>{liveStatus.depActual}{liveStatus.depGate?` · Gate ${liveStatus.depGate}`:""}</div></div>}
          {liveStatus.arrActual&&<div><div style={{fontSize:8,color:st.c,fontWeight:700}}>ACT ARR</div><div style={{fontFamily:MN,fontSize:10,fontWeight:800,color:st.c}}>{liveStatus.arrActual}{liveStatus.arrGate?` · Gate ${liveStatus.arrGate}`:""}</div></div>}
          {!liveStatus.depActual&&liveStatus.depScheduled&&<div><div style={{fontSize:8,color:st.c,fontWeight:700}}>SCH DEP</div><div style={{fontFamily:MN,fontSize:10,color:st.c}}>{liveStatus.depScheduled}{liveStatus.depGate?` · Gate ${liveStatus.depGate}`:""}</div></div>}
          {!liveStatus.arrActual&&liveStatus.arrScheduled&&<div><div style={{fontSize:8,color:st.c,fontWeight:700}}>SCH ARR</div><div style={{fontFamily:MN,fontSize:10,color:st.c}}>{liveStatus.arrScheduled}{liveStatus.arrGate?` · Gate ${liveStatus.arrGate}`:""}</div></div>}
          {liveStatus.aircraft&&<div><div style={{fontSize:8,color:st.c,fontWeight:700}}>AIRCRAFT</div><div style={{fontSize:9,color:st.c}}>{liveStatus.aircraft}</div></div>}
          {liveStatus.fetchedAt&&<div style={{marginLeft:"auto"}}><div style={{fontSize:8,color:T.textMute}}>updated {new Date(liveStatus.fetchedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div></div>}
        </div>
      )}
      {!editing&&!collapsed&&<div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center"}}>
          <div>
            <div style={{fontFamily:MN,fontSize:17,fontWeight:800,color:T.text,lineHeight:1}}>{f.from||"—"}</div>
            {f.fromCity&&<div style={{fontSize:9,color:T.textDim,marginTop:2}}>{f.fromCity}</div>}
            <div style={{fontFamily:MN,fontSize:12,fontWeight:700,color:T.text,marginTop:4}}>{f.dep||"—"}</div>
            {f.depDate&&<div style={{fontSize:8,color:T.textMute,marginTop:1}}>{f.depDate}</div>}
          </div>
          <div style={{textAlign:"center",minWidth:40}}>
            {f.durationMinutes&&<div style={{fontSize:8,color:T.textMute,marginBottom:2}}>{Math.floor(f.durationMinutes/60)}h{String(f.durationMinutes%60).padStart(2,"0")}m</div>}
            <div style={{fontSize:12,color:T.textMute}}>→</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:MN,fontSize:17,fontWeight:800,color:T.text,lineHeight:1}}>{f.to||"—"}</div>
            {f.toCity&&<div style={{fontSize:9,color:T.textDim,marginTop:2}}>{f.toCity}</div>}
            <div style={{fontFamily:MN,fontSize:12,fontWeight:700,color:T.text,marginTop:4}}>{f.arr||"—"}</div>
            {f.arrDate&&<div style={{fontSize:8,color:T.textMute,marginTop:1}}>{f.arrDate}</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start",paddingTop:2,borderTop:"1px solid var(--card-3)"}}>
          {onUpdatePax
            ?<PaxEditor pax={f.pax||[]} crew={crew} onSave={onUpdatePax}/>
            :(f.pax?.length>0&&<div><div style={{fontSize:8,color:T.textMute,fontWeight:600}}>PAX</div><div style={{fontSize:10,color:T.text}}>{f.paxNormalized?.length?f.paxNormalized.map((p,i)=><span key={i} title={p.crewId?`Roster match: ${p.crewId}`:"No roster match"}>{i>0&&", "}<span style={{color:p.crewId?"var(--success-fg)":"var(--text)"}}>{p.displayName}</span>{p.crewId&&<span style={{fontSize:7,marginLeft:2,opacity:0.7}}>✓</span>}</span>):f.pax.join(", ")}</div></div>)}
          {f.pnr&&<div><div style={{fontSize:8,color:T.textMute,fontWeight:600}}>PNR</div><div style={{fontFamily:MN,fontSize:10,color:T.text,fontWeight:700}}>{f.pnr}</div></div>}
          {f.confirmNo&&<div><div style={{fontSize:8,color:T.textMute,fontWeight:600}}>CONF #</div><div style={{fontFamily:MN,fontSize:10,color:T.text,fontWeight:700}}>{f.confirmNo}</div></div>}
          {f.ticketNo&&<div><div style={{fontSize:8,color:T.textMute,fontWeight:600}}>TICKET #</div><div style={{fontFamily:MN,fontSize:10,color:T.text,fontWeight:700}}>{f.ticketNo}</div></div>}
          {f.fareClass&&<div><div style={{fontSize:8,color:T.textMute,fontWeight:600}}>CABIN</div><div style={{fontFamily:MN,fontSize:10,color:T.text,fontWeight:700,textTransform:"capitalize"}}>{f.fareClass}{f.cabin?` · ${f.cabin}`:""}</div></div>}
          {f.seat&&<div><div style={{fontSize:8,color:T.textMute,fontWeight:600}}>SEAT</div><div style={{fontFamily:MN,fontSize:10,color:T.text,fontWeight:700}}>{f.seat}</div></div>}
          {f.operator&&f.operator!==f.carrier&&<div><div style={{fontSize:8,color:T.textMute,fontWeight:600}}>OPERATED BY</div><div style={{fontSize:9,color:T.textDim}}>{f.operator}</div></div>}
          {f.layoverMinutes>0&&<div><div style={{fontSize:8,color:T.textMute,fontWeight:600}}>LAYOVER</div><div style={{fontFamily:MN,fontSize:10,color:T.warnFg,fontWeight:700}}>{Math.floor(f.layoverMinutes/60)}h{String(f.layoverMinutes%60).padStart(2,"0")}m</div></div>}
          {f.cost&&<div><div style={{fontSize:8,color:T.textMute,fontWeight:600}}>COST</div><div style={{fontFamily:MN,fontSize:10,color:T.successFg,fontWeight:700}}>{f.currency||"$"}{f.cost}</div></div>}
        </div>
      </div>}
      {editing&&!collapsed&&<div style={{display:"flex",flexDirection:"column",gap:6,padding:"8px 10px",background:"var(--card-2)",borderRadius:6,border:"1px solid var(--border)"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
          {fld("flightNo","FLIGHT NO")}
          {fld("carrier","CARRIER")}
          {fld("from","FROM (IATA)",{upper:true,max:3})}
          {fld("to","TO (IATA)",{upper:true,max:3})}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
          {fld("fromCity","FROM CITY")}
          {fld("toCity","TO CITY")}
          {fld("depDate","DEP DATE")}
          {fld("dep","DEP TIME")}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
          {fld("arrDate","ARR DATE")}
          {fld("arr","ARR TIME")}
          {fld("pnr","PNR",{max:6})}
          {fld("confirmNo","CONF #")}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
          {fld("ticketNo","TICKET #")}
          {fld("cost","COST")}
          {fld("currency","CURRENCY",{upper:true,max:3})}
          <div/>
        </div>
        <div style={{display:"flex",gap:6,paddingTop:2}}>
          <button onClick={saveEdit} style={{fontSize:9,padding:"3px 10px",borderRadius:4,border:"none",background:"var(--link)",color:"#fff",cursor:"pointer",fontWeight:700}}>Save Changes</button>
          <button onClick={()=>setEditing(false)} style={{fontSize:9,padding:"3px 10px",borderRadius:4,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>Cancel</button>
        </div>
      </div>}
      {!collapsed&&crew&&f.suggestedCrewIds?.length>0&&(
        <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:8,fontWeight:700,color:T.textMute,letterSpacing:"0.06em"}}>CREW</span>
          {f.suggestedCrewIds.map(id=>{const c=(crew||[]).find(x=>x.id===id);return c?(<span key={id} style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:"var(--success-bg)",color:T.successFg,fontWeight:700,border:"1px solid var(--success-bg)"}} title={c.role}>{c.name.split(" ")[0]}</span>):null;})}
        </div>
      )}
      {!collapsed&&f.parseVerified===false&&f.parseNote&&<div style={{fontSize:9,color:T.warnFg,background:"var(--warn-bg)",border:"1px solid var(--warn-bg)",borderRadius:6,padding:"4px 8px"}}>{f.parseNote}</div>}
      {!collapsed&&actions&&<div style={{display:"flex",gap:5,paddingTop:4,borderTop:"1px solid var(--card-3)"}}>{actions}</div>}
    </div>
  );
}
