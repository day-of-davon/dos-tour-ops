export function LifecyclePills({crewId,date,state,slots,onJump,compact}){
  const color=s=>({
    ok:{bg:"var(--success-bg)",c:"var(--success-fg)",bd:"var(--success-fg)"},
    missing:{bg:"var(--warn-bg)",c:"var(--warn-fg)",bd:"var(--warn-bg)"},
    na:{bg:"var(--card-2)",c:"var(--text-mute)",bd:"var(--border)"},
    unknown:{bg:"var(--accent-pill-bg)",c:"var(--accent)",bd:"var(--accent-pill-border)"},
  }[s]||{bg:"var(--card-2)",c:"var(--text-mute)",bd:"var(--border)"});
  const stateLabel={"bus-mid":"ON BUS","bus-join":"BUS JOIN","bus-leave":"BUS LEAVE","bus-solo":"BUS · SOLO","fly-one-off":"FLY · HOTEL"}[state]||"";
  const missing=slots.filter(s=>s.state==="missing").length;
  return(
    <div style={{display:"inline-flex",alignItems:"center",gap:4,flexWrap:"wrap"}} title={`${stateLabel}${missing?` — ${missing} missing`:""}`}>
      {!compact&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:state==="fly-one-off"?"var(--accent-pill-bg)":"var(--info-bg)",color:state==="fly-one-off"?"var(--accent)":"var(--link)",fontWeight:800,letterSpacing:"0.06em"}}>{stateLabel}</span>}
      {slots.map(s=>{const col=color(s.state);return(
        <button key={s.key} onClick={e=>{e.stopPropagation();onJump?.(s);}} title={`${s.label} — ${s.state==="ok"?"confirmed":s.state==="missing"?"missing":s.state==="unknown"?"not tracked":"not applicable"}`} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:compact?9:10,padding:compact?"2px 5px":"2px 7px",borderRadius:10,border:`1px solid ${col.bd}`,background:col.bg,color:col.c,cursor:"pointer",fontWeight:700,lineHeight:1}}>
          <span style={{fontSize:compact?9:10}}>{s.icon}</span>
          {s.state==="ok"&&<span style={{fontSize:8}}>✓</span>}
          {s.state==="missing"&&<span style={{fontSize:8}}>○</span>}
        </button>);})}
    </div>
  );
}
