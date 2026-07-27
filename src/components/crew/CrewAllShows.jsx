import { useContext, useMemo } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { fD } from "../../lib/time";
import { T } from "../../styles/tokens";

export function CrewAllShows(){
  const{sorted,shows,tourDaysSorted,crew,showCrew,setShowCrew,setSel,setAllShows,setTab,aC,mobile,showOffDays,setShowOffDays}=useContext(Ctx);
  const dates=useMemo(()=>{
    const tourIds=new Set((tourDaysSorted||[]).map(d=>d.date));
    const extras=(sorted||[]).filter(s=>s.clientId===aC&&!tourIds.has(s.date)).map(s=>({date:s.date,type:s.type||"show",city:s.city,venue:s.venue}));
    const all=[...(tourDaysSorted||[]).map(d=>({date:d.date,type:d.type,city:d.city,venue:d.venue})),...extras].sort((a,b)=>a.date.localeCompare(b.date));
    return showOffDays?all:all.filter(d=>d.type!=="off"&&d.type!=="travel");
  },[sorted,tourDaysSorted,aC,showOffDays]);
  const getCD=(scKey,crewId)=>{const sc=showCrew[scKey]||{};const d=sc[crewId]||{};return{attending:false,inboundConfirmed:false,outboundConfirmed:false,inboundMode:"bus",outboundMode:"bus",...d,travelMode:undefined};};
  const updateSC=(scKey,crewId,patch)=>setShowCrew(p=>({...p,[scKey]:{...p[scKey],[crewId]:{...getCD(scKey,crewId),...patch}}}));
  const toggleAttend=(scKey,crewId)=>{const cd=getCD(scKey,crewId);updateSC(scKey,crewId,{attending:!cd.attending});};
  const toggleConf=(scKey,crewId,dir)=>{const cd=getCD(scKey,crewId);const k=dir==="in"?"inboundConfirmed":"outboundConfirmed";updateSC(scKey,crewId,{[k]:!cd[k]});};
  const goToShow=date=>{const row=dates.find(x=>x.date===date);setSel(date);setAllShows(false);setTab(row&&row.type==="travel"?"transport":"crew");};
  const cell={padding:"4px 5px",fontSize:9,textAlign:"center",borderRight:"1px solid var(--border)",borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"};
  const headerCell={...cell,fontWeight:800,fontFamily:MN,color:T.textDim,background:"var(--card-2)",position:"sticky",top:0,zIndex:1};
  const indicator=(active,confirmed,onClick,title)=>(
    <button onClick={e=>{e.stopPropagation();onClick();}} title={title} style={{width:14,height:14,borderRadius:3,border:`1px solid ${confirmed?"var(--success-fg)":active?T.warnFg:"var(--border)"}`,background:confirmed?"var(--success-fg)":active?"var(--warn-bg)":"transparent",color:confirmed?"#fff":active?T.warnFg:"transparent",cursor:"pointer",padding:0,fontSize:9,fontWeight:800,lineHeight:"12px",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{confirmed?"✓":active?"·":""}</button>
  );
  const totals=dates.map(d=>{const sc=showCrew[d.date]||{};return(crew||[]).filter(c=>sc[c.id]?.attending).length;});
  return(
    <div className="fi" style={{padding:mobile?"10px 8px 24px":"14px 20px 30px",flex:1,overflowY:"auto",minHeight:0}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:T.text}}>Crew × Date Grid</div>
          <div style={{fontSize:10,color:T.textDim,marginTop:1}}>Click ATT to toggle attending. Tap each square to confirm inbound / outbound.</div>
        </div>
        <div style={{display:"flex",gap:10,fontSize:9,fontFamily:MN,color:T.textDim,alignItems:"center"}}>
          <button onClick={()=>setShowOffDays(v=>!v)} title="Toggle off / travel day columns" style={{display:"flex",alignItems:"center",gap:6,padding:"3px 9px",borderRadius:99,border:"1px solid var(--border)",background:showOffDays?"var(--accent-pill-bg)":"var(--card-2)",cursor:"pointer"}}>
            <span style={{fontSize:9,fontWeight:600,color:showOffDays?T.accentSoft:T.textDim,whiteSpace:"nowrap"}}>off / travel</span>
            <div style={{position:"relative",width:24,height:14,borderRadius:99,background:showOffDays?"var(--accent)":"var(--card-3)",transition:"background 150ms ease",flexShrink:0}}>
              <span style={{position:"absolute",top:2,left:showOffDays?12:2,width:10,height:10,borderRadius:99,background:"#fff",transition:"left 150ms ease",boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/>
            </div>
          </button>
          <span><span style={{display:"inline-block",width:10,height:10,background:"var(--success-fg)",borderRadius:2,marginRight:4,verticalAlign:"middle"}}/>confirmed</span>
          <span><span style={{display:"inline-block",width:10,height:10,background:"var(--warn-bg)",border:`1px solid ${T.warnFg}`,borderRadius:2,marginRight:4,verticalAlign:"middle"}}/>attending</span>
          <span><span style={{display:"inline-block",width:10,height:10,border:"1px solid var(--border)",borderRadius:2,marginRight:4,verticalAlign:"middle"}}/>—</span>
        </div>
      </div>
      {!crew?.length&&<div style={{padding:"30px 0",textAlign:"center",color:T.textDim,fontSize:11}}>No crew members yet. Add them from a specific show.</div>}
      {crew?.length>0&&dates.length>0&&<div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8,background:"var(--card)"}}>
        <table style={{borderCollapse:"collapse",fontFamily:"'Outfit',system-ui",width:"100%"}}>
          <thead>
            <tr>
              <th style={{...headerCell,textAlign:"left",padding:"6px 10px",minWidth:140,position:"sticky",left:0,zIndex:2,background:"var(--card-2)"}}>Crew</th>
              {dates.map(d=>{
                const tColor=d.type==="travel"?"var(--link)":d.type==="off"?T.textMute:d.type==="split"?T.warnFg:T.text;
                const tBg=d.type==="travel"?"var(--info-bg)":d.type==="off"?"var(--card-2)":d.type==="split"?"var(--warn-bg)":"var(--card-2)";
                return(
                  <th key={d.date} style={{...headerCell,minWidth:74,cursor:"pointer",background:tBg}} onClick={()=>goToShow(d.date)} title={`${d.city||d.type} (${d.type})`}>
                    <div style={{fontSize:8,color:T.textMute}}>{fD(d.date)}</div>
                    <div style={{fontSize:9,color:tColor,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:70}}>{d.city||(d.type==="travel"?"Travel":d.type==="off"?"Off":d.type==="split"?"Split":"—")}</div>
                    {d.type!=="show"&&<div style={{fontSize:7,color:tColor,fontFamily:MN,fontWeight:800,letterSpacing:"0.06em",marginTop:1}}>{d.type.toUpperCase()}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {(crew||[]).map(c=>(
              <tr key={c.id}>
                <td style={{padding:"6px 10px",fontSize:10,fontWeight:600,color:T.text,borderRight:"1px solid var(--border)",borderBottom:"1px solid var(--border)",position:"sticky",left:0,zIndex:1,background:"var(--card)",whiteSpace:"nowrap"}}>
                  <div>{c.name||"—"}</div>
                  {c.role&&<div style={{fontSize:8,color:T.textDim,fontFamily:MN}}>{c.role}</div>}
                </td>
                {dates.map(d=>{
                  const cd=getCD(d.date,c.id);
                  return(
                    <td key={d.date} style={{...cell,background:cd.attending?"var(--card)":"var(--bg)"}}>
                      <div style={{display:"flex",gap:2,alignItems:"center",justifyContent:"center"}}>
                        <button onClick={()=>toggleAttend(d.date,c.id)} title="Toggle attending" style={{fontSize:7,fontWeight:800,padding:"1px 4px",borderRadius:3,border:`1px solid ${cd.attending?"var(--accent)":"var(--border)"}`,background:cd.attending?"var(--accent-pill-bg)":"transparent",color:cd.attending?"var(--accent)":T.textMute,cursor:"pointer",fontFamily:MN}}>ATT</button>
                        {cd.attending&&indicator(cd.attending,cd.inboundConfirmed,()=>toggleConf(d.date,c.id,"in"),`Inbound ${cd.inboundMode||"bus"} ${cd.inboundConfirmed?"confirmed":"pending"}`)}
                        {cd.attending&&indicator(cd.attending,cd.outboundConfirmed,()=>toggleConf(d.date,c.id,"out"),`Outbound ${cd.outboundMode||"bus"} ${cd.outboundConfirmed?"confirmed":"pending"}`)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td style={{padding:"6px 10px",fontSize:9,fontWeight:800,color:T.textDim,fontFamily:MN,borderRight:"1px solid var(--border)",borderTop:"2px solid var(--border)",position:"sticky",left:0,zIndex:1,background:"var(--card-2)",letterSpacing:"0.06em"}}>ATTENDING</td>
              {totals.map((t,i)=>(<td key={i} style={{...cell,fontWeight:800,fontFamily:MN,color:t>0?T.text:T.textMute,borderTop:"2px solid var(--border)",background:"var(--card-2)"}}>{t||"—"}</td>))}
            </tr>
          </tbody>
        </table>
      </div>}
    </div>
  );
}
