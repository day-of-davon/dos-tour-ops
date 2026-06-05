import { useContext, useMemo, useRef, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { AT, CM, MN, UI } from "../../lib/domain-constants";
import { buildICS, downloadICS } from "../../lib/ics";
import { dU, fD, fmt, toM } from "../../lib/time";
import { BUS_DATA_MAP } from "../../lib/tour-data";
import { T } from "../../styles/tokens";

export function NavSidebar(){
  const{sidebarOpen,setSidebarOpen,tab,sel,setSel,sorted,tourDaysSorted,shows,uShow,advances,finance,aC,setTab,next,tourDays,showOffDays,setShowOffDays,allShows,setAllShows}=useContext(Ctx);
  const[newDate,setNewDate]=useState("");
  const[newType,setNewType]=useState("off");
  const[newVenue,setNewVenue]=useState("");
  const[newCity,setNewCity]=useState("");
  const today=new Date().toISOString().slice(0,10);

  // Merge tour days + non-tour shows, filter off/travel per toggle
  const rows=useMemo(()=>{
    const tourIds=new Set((tourDaysSorted||[]).map(d=>d.date));
    const extras=(sorted||[]).filter(s=>s.clientId===aC&&!tourIds.has(s.date)).map(s=>({date:s.date,type:s.type||"show",show:s,city:s.city,venue:s.venue,synthetic:false}));
    const all=[...(tourDaysSorted||[]),...extras].sort((a,b)=>a.date.localeCompare(b.date));
    if(!showOffDays)return all.filter(d=>d.type!=="off"&&d.type!=="travel");
    return all;
  },[tourDaysSorted,sorted,showOffDays,aC]);

  const pendingCount=d=>{const adv=advances[d]||{};const items=adv.items||{};const custom=adv.customItems||[];return[...AT,...custom].filter(t=>(items[t.id]?.status||"pending")==="pending").length;};

  const flags=useMemo(()=>{const f=[];sorted.forEach(s=>{if(s.notes?.includes("⚠ Immigration")&&dU(s.date)<45)f.push({type:"CRITICAL",msg:`FR immigration — ${s.city}`,date:s.date});if(s.notes?.includes("⚠ Insurance"))f.push({type:"CRITICAL",msg:"Tour insurance — $0",date:s.date});});return f.slice(0,3);},[sorted]);

  const add=()=>{
    if(!newDate||shows[newDate])return;
    const isShow=newType==="show";
    uShow(newDate,{date:newDate,clientId:aC,type:newType,city:newType==="travel"?"Travel":isShow?(newCity||""):"Off Day",venue:newType==="travel"?"Travel Day":isShow?(newVenue||""):"Off Day",country:"",region:"",promoter:"",advance:[],doors:isShow?toM(19):0,curfew:isShow?toM(23):0,busArrive:isShow?toM(9):0,crewCall:isShow?toM(10):0,venueAccess:isShow?toM(9):0,mgTime:isShow?toM(16,30):0,notes:""});
    setSel(newDate);setNewDate("");setNewVenue("");setNewCity("");
  };

  const listRef=useRef(null);
  const selRef=useRef(null);

  const typeColor=t=>t==="travel"?{bg:"var(--info-bg)",c:"var(--link)"}:t==="off"?{bg:"var(--card-2)",c:"var(--text-mute)"}:t==="split"?{bg:"var(--warn-bg)",c:"var(--warn-fg)"}:{bg:"var(--success-bg)",c:"var(--success-fg)"};

  return(<>
    <div onClick={()=>setSidebarOpen(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)",zIndex:79,opacity:sidebarOpen?1:0,pointerEvents:sidebarOpen?"auto":"none",transition:"opacity 220ms ease"}}/>
    <div style={{position:"absolute",top:0,left:0,bottom:0,width:220,background:"var(--card)",borderRight:"1px solid var(--border)",zIndex:80,transform:sidebarOpen?"translateX(0)":"translateX(-220px)",transition:"transform 220ms cubic-bezier(0.25,0,0.1,1)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Mini stats + All Shows */}
      <div style={{padding:"10px 12px 8px",borderBottom:"1px solid var(--border)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,marginBottom:next?4:0}}>
          <div style={{fontSize:9,fontWeight:700,color:T.textMute,letterSpacing:"0.06em",textTransform:"uppercase"}}>{next?"Next Show":"Tour"}</div>
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            <button onClick={()=>{
              const events=rows.map(d=>{
                const sh=d.show||shows[d.date];
                const isShow=d.type==="show"&&sh;
                const icon=isShow?"🎤":d.type==="travel"?"✈":d.type==="off"?"·":d.type==="split"?"⇆":"·";
                const titleCity=d.city||sh?.city||(d.type==="travel"?"Travel":d.type==="off"?"Off":d.type==="split"?"Split Day":"Tour day");
                const venueOrNote=sh?.venue||d.venue||d.bus?.route||"";
                const summary=`${icon} ${titleCity}${isShow&&venueOrNote?` · ${venueOrNote}`:""}`;
                const location=isShow?[sh.venue,sh.city].filter(Boolean).join(", "):d.bus?.route||d.city||"";
                const detailLines=[];
                if(isShow){
                  if(sh.promoter)detailLines.push(`Promoter: ${sh.promoter}`);
                  if(sh.doors)detailLines.push(`Doors: ${fmt(sh.doors)}`);
                  if(sh.curfew)detailLines.push(`Curfew: ${fmt(sh.curfew)}`);
                  if(sh.crewCall)detailLines.push(`Crew Call: ${fmt(sh.crewCall)}`);
                  if(sh.busArrive)detailLines.push(`Bus Arrival: ${fmt(sh.busArrive)}`);
                  if(sh.notes)detailLines.push(sh.notes);
                }else if(d.type==="travel"){
                  if(d.bus?.route)detailLines.push(`Route: ${d.bus.route}`);
                  if(d.bus?.dep&&d.bus.dep!=="—")detailLines.push(`Depart: ${d.bus.dep}`);
                  if(d.bus?.arr&&d.bus.arr!=="—")detailLines.push(`Arrive: ${d.bus.arr}`);
                  if(d.bus?.km)detailLines.push(`${d.bus.km}km · ${d.bus.drive||""}`);
                  if(d.bus?.note)detailLines.push(d.bus.note);
                }
                return{date:d.date,kind:d.type||"day",summary,location,description:detailLines.join("\n")};
              }).filter(e=>e.date);
              const ics=buildICS(events,`${(CM[aC]||{}).name||"DOS"} Tour`);
              downloadICS(`dos-tour-${aC}-${new Date().toISOString().slice(0,10)}.ics`,ics);
            }} title="Export all dates as full-day events to Google Calendar (.ics)" style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:99,border:"1px solid var(--border)",background:"var(--card-2)",color:T.textDim,cursor:"pointer",letterSpacing:"0.04em",lineHeight:1.2}}>📅 Export</button>
            <button onClick={()=>{setAllShows(true);setSidebarOpen(false);}} title="All shows aggregate view" style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:99,border:"1px solid var(--border)",background:"var(--card-2)",color:T.textDim,cursor:"pointer",letterSpacing:"0.04em",textTransform:"uppercase",lineHeight:1.2}}>All Shows</button>
          </div>
        </div>
        {next&&<>
          <div style={{fontSize:11,fontWeight:800,color:T.text,lineHeight:1.2}}>{next.city}</div>
          <div style={{fontSize:9,color:T.textDim,marginTop:1}}>{fD(next.date)} · <span style={{color:T.accent,fontWeight:700,fontFamily:MN}}>{dU(next.date)}d</span></div>
        </>}
      </div>
      {/* Flags */}
      {flags.length>0&&(
        <div style={{padding:"6px 10px",borderBottom:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:3}}>
          {flags.map((f,i)=>(
            <div key={i} onClick={()=>{if(f.date)setSel(f.date);}} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 6px",background:"var(--danger-bg)",borderRadius:6,cursor:f.date?"pointer":"default",borderLeft:"2px solid var(--danger-fg)"}}>
              <span style={{fontSize:8,fontWeight:800,color:"var(--danger-fg)",fontFamily:MN,flexShrink:0}}>!</span>
              <span style={{fontSize:9,color:"var(--danger-fg)",fontWeight:600,lineHeight:1.2}}>{f.msg}</span>
            </div>
          ))}
        </div>
      )}
      {/* Off/travel toggle */}
      <div style={{padding:"7px 12px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:9,fontWeight:600,color:T.textDim}}>Off / travel days</span>
        <button onClick={()=>setShowOffDays(v=>!v)} style={{position:"relative",width:28,height:16,borderRadius:99,border:"none",cursor:"pointer",background:showOffDays?"var(--accent)":"var(--card-2)",padding:0,transition:"background 0.2s ease",flexShrink:0,boxShadow:"inset 0 1px 3px rgba(0,0,0,0.4)"}}>
          <span style={{position:"absolute",top:2,left:showOffDays?14:2,width:12,height:12,borderRadius:99,background:showOffDays?"#fff":"var(--text-dim)",transition:"left 0.2s ease,background 0.2s ease",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}}/>
        </button>
      </div>
      {/* Date list */}
      <div ref={listRef} style={{flex:1,overflowY:"auto",padding:"4px 0"}}>
        {(()=>{
          const renderRow=d=>{
            const isSel=d.date===sel&&!allShows;
            const tc=typeColor(d.type);
            const isOff=d.type==="off"||d.type==="travel";
            const pc=d.type==="show"?pendingCount(d.date):0;
            const days=dU(d.date);
            const urgColor=days<=7?"var(--danger-fg)":days<=14?"var(--warn-fg)":days<=21?"var(--link)":"var(--text-mute)";
            const dateStr=new Date(d.date+"T12:00:00");
            const mo=dateStr.toLocaleString("en-US",{month:"short"});
            const dt=dateStr.getDate();
            const wd=dateStr.toLocaleString("en-US",{weekday:"short"});
            return(
              <div key={d.date} ref={isSel?selRef:null} onClick={()=>{setSel(d.date);setAllShows(false);setSidebarOpen(false);}} className="rh" style={{display:"flex",alignItems:"center",gap:0,padding:"6px 10px 6px 0",cursor:"pointer",background:isSel?"rgba(91,33,182,0.16)":"transparent",borderLeft:isSel?"3px solid var(--accent-soft)":"3px solid transparent",opacity:isOff?0.65:1,boxShadow:isSel?"inset 0 0 0 1px rgba(124,58,237,0.18)":undefined}}>
                <div style={{width:46,flexShrink:0,textAlign:"center"}}>
                  <div style={{fontSize:8,fontWeight:700,color:isSel?"var(--link)":"var(--text-mute)",fontFamily:MN,letterSpacing:"0.04em"}}>{wd.toUpperCase()}</div>
                  <div style={{fontSize:13,fontWeight:800,color:isSel?"var(--accent-pill-border)":"var(--text)",lineHeight:1}}>{dt}</div>
                  <div style={{fontSize:8,color:isSel?"var(--accent)":"var(--text-mute)"}}>{mo}</div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:1}}>
                    <span style={{fontSize:10,fontWeight:600,color:isSel?"var(--accent-pill-border)":"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.city||d.venue||"—"}</span>
                    {!isOff&&<span style={{fontSize:8,padding:"1px 4px",borderRadius:99,fontWeight:700,...tc,flexShrink:0}}>{d.type==="show"?"▶":"⇢"}</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                    {pc>0&&<span style={{fontSize:8,fontFamily:MN,color:T.warnFg,fontWeight:700}}>{pc} open</span>}
                    {d.type==="show"&&days>=0&&<span style={{fontSize:8,fontFamily:MN,color:urgColor,fontWeight:700}}>{days}d</span>}
                    {d.type==="show"&&(()=>{const fStages=finance[d.date]?.stages||{};const settled=["wire_ref_confirmed","signed_sheet","payment_initiated"].every(k=>fStages[k]);const wired=fStages["payment_initiated"];return <span style={{width:6,height:6,borderRadius:99,background:settled?"var(--success-fg)":wired?"var(--warn-fg)":"var(--card-3)",flexShrink:0,display:"inline-block"}} title={settled?"Settled":wired?"Wire initiated":"Settlement pending"}/>;})()}
                    {isOff&&<span style={{fontSize:8,color:T.textMute,fontStyle:"italic"}}>{d.type}</span>}
                    {d.type==="split"&&d.split?.parties?.map(p=>(
                      <span key={p.id} style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:p.bg,color:p.color,fontWeight:700,fontFamily:MN,whiteSpace:"nowrap"}}>{p.label}</span>
                    ))}
                  </div>
                  {d.type==="show"&&(()=>{const total=AT.length;const confirmed=total-pc;const pct=total>0?(confirmed/total)*100:100;const busEff=BUS_DATA_MAP[d.date]?.arr;return(<>
                    <div style={{width:"100%",height:2,background:"var(--card-2)",borderRadius:99,marginTop:2}}>
                      <div style={{width:`${pct}%`,height:"100%",background:pct===100?"var(--success-fg)":pct>60?"var(--warn-fg)":"var(--danger-fg)",borderRadius:99,transition:"width 0.3s ease"}}/>
                    </div>
                    {busEff&&busEff!=="—"&&<span style={{fontSize:7,fontFamily:MN,color:"var(--text-faint)",marginTop:1,display:"block"}}>BUS {busEff}</span>}
                  </>);})()}
                </div>
              </div>
            );
          };
          const past=rows.filter(d=>d.date<today);
          const upcoming=rows.filter(d=>d.date>=today);
          const hasSelInPast=past.some(d=>d.date===sel);
          return(<>
            {past.length>0&&(
              <details open={hasSelInPast} style={{borderBottom:"1px solid var(--border)"}}>
                <summary style={{fontSize:9,fontWeight:700,color:T.textMute,letterSpacing:"0.06em",textTransform:"uppercase",padding:"6px 12px",cursor:"pointer",userSelect:"none",listStyle:"revert"}}>Past ({past.length})</summary>
                {past.map(renderRow)}
              </details>
            )}
            {upcoming.map(renderRow)}
          </>);
        })()}
      </div>
      {/* Add date */}
      <div style={{padding:"8px 10px",borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:5}}>
        <div style={{display:"flex",gap:4}}>
          <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} style={{...UI.input,flex:1,fontFamily:MN,padding:"4px 5px",fontSize:10,minWidth:0}}/>
          <select value={newType} onChange={e=>setNewType(e.target.value)} style={{...UI.input,padding:"4px 5px",fontSize:10,width:64}}>
            <option value="show">Show</option>
            <option value="off">Off</option>
            <option value="travel">Travel</option>
          </select>
        </div>
        {newType==="show"&&<>
          <input value={newVenue} onChange={e=>setNewVenue(e.target.value)} placeholder="Venue" style={{...UI.input,fontSize:10,padding:"4px 5px"}}/>
          <input value={newCity} onChange={e=>setNewCity(e.target.value)} placeholder="City" style={{...UI.input,fontSize:10,padding:"4px 5px"}}/>
        </>}
        <button onClick={add} disabled={!newDate||!!shows[newDate]} style={{...UI.expandBtn(false,"var(--success-fg)"),fontSize:9,padding:"4px 0",width:"100%",opacity:(!newDate||shows[newDate])?0.4:1}}>+ Add Date</button>
      </div>
    </div>
  </>);
}
