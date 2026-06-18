import { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { AT, MN, LEG_META, LEG_ORDER, legOf, PORTFOLIO_FLAGS } from "../../lib/domain-constants";
import { dU, fD } from "../../lib/time";
import { T } from "../../styles/tokens";

export function CrossTab(){
  const{shows,advances,finance,setTab,setSel,setAC,setAllShows,mobile}=useContext(Ctx);
  const[legFilter,setLegFilter]=useState("all");
  const[horizon,setHorizon]=useState(30);

  const rows=useMemo(()=>Object.values(shows||{})
    .filter(s=>s&&s.date&&(s.type||"show")==="show")
    .map(s=>{
      const adv=advances[s.date]||{};const items=adv.items||{};
      const all=[...AT,...(adv.customItems||[])];
      const advPending=all.filter(t=>(items[t.id]?.status||"pending")==="pending").length;
      const stages=(finance[s.date]||{}).stages||{};
      const settled=["wire_ref_confirmed","signed_sheet","payment_initiated"].every(k=>stages[k]);
      const note=s.notes||"";const fi=note.indexOf("⚠");
      return{...s,leg:legOf(s),days:dU(s.date),advPending,advTotal:all.length,settled,
        flagged:fi>=0,flagNote:fi>=0?note.slice(fi).replace(/⚠+/g," ").replace(/\s+/g," ").trim():""};
    }),[shows,advances,finance]);

  const legs=LEG_ORDER.map(id=>{
    const ls=rows.filter(r=>r.leg===id).sort((a,b)=>a.date.localeCompare(b.date));
    const upcoming=ls.filter(r=>r.days>=0);const played=ls.filter(r=>r.days<0);
    return{id,...LEG_META[id],all:ls,upcoming,
      advDone:upcoming.filter(r=>r.advPending===0).length,advTotal:upcoming.length,
      settled:played.filter(r=>r.settled).length,settleTotal:played.length,
      blockers:upcoming.filter(r=>r.flagged).length,
      range:ls.length?`${fD(ls[0].date)} – ${fD(ls[ls.length-1].date)}`:"—"};
  }).filter(l=>l.all.length);

  const feed=rows.filter(r=>r.days>=0&&r.days<=horizon&&(legFilter==="all"||r.leg===legFilter))
    .sort((a,b)=>a.days-b.days);

  const pc=d=>d<=0?"var(--danger-fg)":d<=7?"var(--warn-fg)":d<=21?"var(--link)":T.textMute;
  const go=s=>{setAC(s.clientId);setAllShows&&setAllShows(false);setSel(s.date);setTab("dash");};
  const FILTERS=[{id:"all",label:`All ${rows.filter(r=>r.days>=0).length}`},...legs.map(l=>({id:l.id,label:l.short}))];

  return(
    <div className="fi" style={{padding:mobile?"10px 10px 24px":"14px 20px 30px",maxWidth:1100,flex:1,overflowY:"auto",minHeight:0}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {FILTERS.map(f=>(
            <button key={f.id} onClick={()=>setLegFilter(f.id)} style={{fontSize:10,fontFamily:MN,padding:"4px 11px",borderRadius:99,cursor:"pointer",border:"1px solid var(--border)",fontWeight:700,background:legFilter===f.id?"var(--text)":"transparent",color:legFilter===f.id?"var(--bg)":T.textDim}}>{f.label}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:4}}>
          {[14,30,366].map(h=>(
            <button key={h} onClick={()=>setHorizon(h)} style={{fontSize:9,fontFamily:MN,padding:"4px 9px",borderRadius:6,cursor:"pointer",border:"1px solid var(--border)",fontWeight:700,background:horizon===h?"var(--card-2)":"transparent",color:horizon===h?T.text:T.textMute}}>{h===366?"All":`${h}d`}</button>
          ))}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"repeat(3,minmax(0,1fr))",gap:10,marginBottom:18}}>
        {legs.map(l=>{
          const pct=l.advTotal?Math.round(100*l.advDone/l.advTotal):0;
          const dim=legFilter!=="all"&&legFilter!==l.id;
          return(
            <div key={l.id} onClick={()=>setLegFilter(legFilter===l.id?"all":l.id)} style={{background:"var(--card)",border:"1px solid var(--border)",borderTop:`3px solid ${l.color}`,borderRadius:10,padding:"12px 14px",cursor:"pointer",opacity:dim?0.4:1,transition:"opacity .15s"}}>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between"}}>
                <span style={{fontSize:12,fontWeight:700,color:T.text}}>{l.label}</span>
                <span style={{fontSize:20,fontWeight:800,color:T.text,fontFamily:MN}}>{l.upcoming.length}<span style={{fontSize:10,color:T.textMute}}>/{l.all.length}</span></span>
              </div>
              <div style={{fontSize:9,color:T.textMute,fontFamily:MN,margin:"2px 0 9px"}}>{l.range} · {l.upcoming.length} upcoming</div>
              <div style={{height:5,background:"var(--card-2)",borderRadius:99,overflow:"hidden",marginBottom:7}}>
                <div style={{width:`${pct}%`,height:"100%",background:l.color}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:9,fontFamily:MN,color:T.textDim}}>
                <span>adv {l.advDone}/{l.advTotal}</span>
                <span>settle {l.settled}/{l.settleTotal}</span>
                <span style={{color:l.blockers?"var(--danger-fg)":T.textMute,fontWeight:700}}>⚑ {l.blockers}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",marginBottom:6}}>HOT · {horizon===366?"ALL UPCOMING":`NEXT ${horizon} DAYS`} · {feed.length}</div>
      <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:18}}>
        {feed.length===0&&<div style={{fontSize:11,color:T.textMute,padding:"10px 0"}}>Nothing in this window.</div>}
        {feed.map(s=>(
          <div key={s.date+s.clientId} onClick={()=>go(s)} className="rh" style={{display:"flex",alignItems:"center",gap:9,padding:"8px 12px",background:"var(--card)",border:`1px solid ${s.flagged?"var(--danger-fg)":"var(--border)"}`,borderRadius:8,cursor:"pointer"}}>
            <span style={{fontFamily:MN,fontSize:10,fontWeight:800,color:pc(s.days),minWidth:42,flexShrink:0}}>{s.days===0?"TODAY":`${s.days}d`}</span>
            <span style={{fontSize:9,fontFamily:MN,fontWeight:700,padding:"2px 6px",borderRadius:4,background:LEG_META[s.leg].color+"22",color:LEG_META[s.leg].color,flexShrink:0}}>{LEG_META[s.leg].short}</span>
            <span style={{fontSize:12,fontWeight:600,color:T.text,flex:1,minWidth:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.city} · {s.venue}</span>
            <span style={{fontSize:9,fontFamily:MN,color:s.flagged?"var(--danger-fg)":T.textMute,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:mobile?120:300,flexShrink:0}}>{s.flagged?s.flagNote:s.advPending>0?`${s.advPending} advance open`:"advance clear"}</span>
          </div>
        ))}
      </div>

      {PORTFOLIO_FLAGS.length>0&&<>
        <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",marginBottom:6}}>PORTFOLIO BLOCKERS · NOT TIED TO ONE SHOW</div>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          {PORTFOLIO_FLAGS.map((f,i)=>{
            const crit=f.level==="critical";
            return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 12px",background:crit?"var(--danger-bg)":"var(--warn-bg)",borderRadius:8}}>
                <span style={{fontSize:12,fontWeight:800,color:crit?"var(--danger-fg)":"var(--warn-fg)",flex:1}}>{f.label}</span>
                <span style={{fontSize:9,fontFamily:MN,color:crit?"var(--danger-fg)":"var(--warn-fg)"}}>{f.sub}</span>
              </div>
            );
          })}
        </div>
      </>}
    </div>
  );
}
