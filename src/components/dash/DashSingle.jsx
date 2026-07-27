import { useContext } from "react";
import { Ctx } from "../../context/DosContext";
import { AT, CM, MN } from "../../lib/domain-constants";
import { showIdFor } from "../../lib/intel";
import { dU, fD, fFull, fmt } from "../../lib/time";
import { BUS_DATA_MAP } from "../../lib/tour-data";
import { T } from "../../styles/tokens";

export function DashSingle(){
  const{sel,shows,setTab,advances,finance,aC,mobile,intel,setIntel,addLog,addActLog,showCrew,crew,lodging,flights,eventKey,tourDays}=useContext(Ctx);
  const today=new Date().toISOString().slice(0,10);
  const show=shows[sel];
  const td=tourDays?.[sel];
  const dayType=show?.type||td?.type||"show";
  const days=dU(sel);
  const client=CM[aC];
  const PORD={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};
  const sid=showIdFor({date:sel,clientId:show?.clientId||aC});
  const showIntel=intel[sid]||{};
  const todos=(showIntel.todos||[]).filter(t=>!t.done&&!t.ignored).sort((a,b)=>(PORD[a.priority]??4)-(PORD[b.priority]??4));
  const followUps=(showIntel.followUps||[]).filter(f=>!f.done&&!f.ignored).sort((a,b)=>(PORD[a.priority]??4)-(PORD[b.priority]??4));
  const adv=advances[sel]||{};const advItems=adv.items||{};const customAdv=adv.customItems||[];
  const advTotal=[...AT,...customAdv].length;
  const advPending=[...AT,...customAdv].filter(t=>(advItems[t.id]?.status||"pending")==="pending").length;
  const advConf=advTotal-advPending;
  const fin=eventKey?finance[eventKey]||{}:{};
  const finStages=fin.stages||{};
  const settled=["wire_ref_confirmed","signed_sheet","payment_initiated"].every(k=>finStages[k]);
  const wired=finStages["payment_initiated"];
  const dayHotels=Object.values(lodging||{}).filter(h=>h.checkIn<=sel&&h.checkOut>=sel);
  const sc=showCrew[eventKey]||{};
  const attending=(crew||[]).filter(c=>sc[c.id]?.attending);
  const inboundFlights=Object.values(flights||{}).filter(f=>f.status==="confirmed"&&f.arrDate===sel);
  const outboundFlights=Object.values(flights||{}).filter(f=>f.status==="confirmed"&&f.depDate===sel);
  const busEntry=BUS_DATA_MAP[sel];
  const PB={CRITICAL:["var(--danger-bg)","var(--danger-fg)"],HIGH:["var(--warn-bg)","var(--warn-fg)"],MEDIUM:["var(--info-bg)","var(--link)"],LOW:["var(--card-2)","var(--text-mute)"]};
  const markTodo=(t,state)=>{setIntel(p=>({...p,[sid]:{...(p[sid]||{}),todos:(p[sid]?.todos||[]).map(x=>x.id===t.id?{...x,[state]:true}:x)}}));addLog({type:"user",section:"todo",showId:sid,action:state,label:t.text||t.subject,from:"dashboard-single"});addActLog?.({module:"intel",action:`intel.todo.${state}`,target:{type:"todo",id:t.id,label:t.text||t.subject},payload:{priority:t.priority,showId:sid},context:{date:sel,showId:sid,eventKey:sid}});};
  const markFu=(f,state)=>{setIntel(p=>{const fu=p[sid]?.followUps||[];const idx=fu.findIndex(x=>x.action===f.action&&(x.tid===f.tid||x.owner===f.owner||x.priority===f.priority));if(idx<0)return p;return{...p,[sid]:{...(p[sid]||{}),followUps:fu.map((x,j)=>j===idx?{...x,[state]:true}:x)}};});addLog({type:"user",section:"followup",showId:sid,action:state,label:f.action,from:"dashboard-single"});};
  const BTN_DONE={fontSize:8,padding:"2px 6px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",background:"var(--success-bg)",color:T.successFg};
  const BTN_IGN={fontSize:8,padding:"2px 6px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",background:"var(--card-2)",color:T.textMute};
  const tile=(l,v,s,c,onClick)=>(
    <div onClick={onClick} className={onClick?"rh":""} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px",cursor:onClick?"pointer":"default"}}>
      <div style={{fontSize:9,color:T.textDim,marginBottom:2,fontWeight:600}}>{l}</div>
      <div style={{fontSize:18,fontWeight:800,color:c||"var(--text)",fontFamily:MN}}>{v}</div>
      {s&&<div style={{fontSize:9,color:T.textMute,fontFamily:MN,marginTop:1}}>{s}</div>}
    </div>
  );
  const headerLabel=show?.city||td?.city||(dayType==="travel"?"Travel":dayType==="off"?"Off":fD(sel));
  const headerSub=show?.venue||td?.venue||(dayType==="travel"?"Travel day":dayType==="off"?"Off day":"");
  return(
    <div className="fi" style={{padding:mobile?"10px 10px 24px":"14px 20px 30px",maxWidth:960,flex:1,overflowY:"auto",minHeight:0}}>
      <div style={{background:client?`${client.color}10`:"var(--card)",border:`1px solid ${client?.color||"var(--border)"}`,borderRadius:12,padding:"12px 16px",marginBottom:10,borderLeft:`4px solid ${client?.color||"var(--accent)"}`}}>
        <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:T.text,letterSpacing:"-0.02em"}}>{headerLabel}</div>
            <div style={{fontSize:11,color:T.textDim,marginTop:2}}>{headerSub}{headerSub&&" · "}{fFull(sel)}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            {dayType==="show"&&show&&<>
              <span style={{fontSize:10,fontFamily:MN,color:show.doorsConfirmed?"var(--success-fg)":T.warnFg,fontWeight:700}}>DOORS {fmt(show.doors)}{show.doorsConfirmed?" ✓":" ?"}</span>
              <span style={{fontSize:10,fontFamily:MN,color:T.text2,fontWeight:700}}>CURFEW {fmt(show.curfew)}</span>
            </>}
            <span style={{fontSize:11,fontFamily:MN,fontWeight:800,color:days<=0?"var(--danger-fg)":days<=7?"var(--warn-fg)":days<=21?"var(--link)":T.textMute,padding:"3px 9px",borderRadius:99,background:"var(--card-2)"}}>{days===0?"TODAY":days<0?`${Math.abs(days)}d ago`:`${days}d`}</span>
          </div>
        </div>
      </div>
      {dayType==="show"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:12}}>
        {tile("Advance",`${advConf}/${advTotal}`,advPending>0?`${advPending} pending`:"all clear",advPending===0?"var(--success-fg)":advPending>advTotal*0.5?"var(--danger-fg)":T.warnFg,()=>setTab("advance"))}
        {tile("Settlement",settled?"Settled":wired?"Wired":"Pending",fin.settlementAmount?`$${Number(fin.settlementAmount).toLocaleString()}`:"—",settled?"var(--success-fg)":wired?T.warnFg:T.textMute,()=>setTab("finance"))}
        {tile("Crew Attending",attending.length,(crew||[]).length?`of ${(crew||[]).length}`:"",attending.length>0?"var(--text)":T.textMute,()=>setTab("crew"))}
        {tile("Hotels",dayHotels.length,dayHotels[0]?.name||"—",dayHotels.length>0?"var(--text)":T.textMute,()=>setTab("lodging"))}
        {tile("Flights",inboundFlights.length+outboundFlights.length,`${inboundFlights.length} in · ${outboundFlights.length} out`,(inboundFlights.length+outboundFlights.length)>0?"var(--link)":T.textMute,()=>setTab("transport"))}
        {tile("Open To-Dos",todos.length,todos[0]?todos[0].priority:"none",todos.length>0?T.warnFg:T.textMute)}
      </div>}
      {dayType!=="show"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:12}}>
        {tile("Hotels",dayHotels.length,dayHotels[0]?.name||"—",dayHotels.length>0?"var(--text)":T.textMute,()=>setTab("lodging"))}
        {tile("Flights",inboundFlights.length+outboundFlights.length,`${inboundFlights.length} in · ${outboundFlights.length} out`,(inboundFlights.length+outboundFlights.length)>0?"var(--link)":T.textMute,()=>setTab("transport"))}
        {busEntry&&tile("Bus",busEntry.dep||"—",busEntry.arr?`arr ${busEntry.arr}`:"",T.text)}
      </div>}
      {todos.length>0&&<div style={{marginBottom:12}}>
        <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",marginBottom:5}}>OPEN TO-DOS · {todos.length}</div>
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {todos.slice(0,8).map(t=>{const[bg,fg]=PB[t.priority]||PB.LOW;return(
            <div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 12px",background:bg,borderRadius:8,borderLeft:`3px solid ${fg}`}}>
              <span style={{fontSize:8,fontWeight:800,color:fg,fontFamily:MN,flexShrink:0,marginTop:1}}>{t.priority||"LOW"}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,color:T.text}}>{t.text||t.subject}</div>{t.context&&<div style={{fontSize:9,color:T.textDim}}>{t.context}</div>}</div>
              <button onClick={()=>markTodo(t,"done")} style={BTN_DONE}>done</button>
              <button onClick={()=>markTodo(t,"ignored")} style={BTN_IGN}>ignore</button>
            </div>
          );})}
        </div>
      </div>}
      {followUps.length>0&&<div style={{marginBottom:12}}>
        <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",marginBottom:5}}>FOLLOW-UPS · {followUps.length}</div>
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {followUps.slice(0,6).map((f,i)=>{const[bg,fg]=PB[f.priority]||PB.LOW;return(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 12px",background:bg,borderRadius:8,borderLeft:`3px solid ${fg}`}}>
              <span style={{fontSize:8,fontWeight:800,color:fg,fontFamily:MN,flexShrink:0,marginTop:1}}>{f.priority||"LOW"}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,color:T.text}}>{f.action}</div>{f.owner&&<div style={{fontSize:9,color:T.textDim}}>owner: {f.owner}</div>}</div>
              <button onClick={()=>markFu(f,"done")} style={BTN_DONE}>done</button>
              <button onClick={()=>markFu(f,"ignored")} style={BTN_IGN}>ignore</button>
            </div>
          );})}
        </div>
      </div>}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
        {dayType==="show"&&<button onClick={()=>setTab("ros")} style={{fontSize:10,padding:"6px 14px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text2,cursor:"pointer",fontWeight:700}}>→ Schedule</button>}
        {dayType==="show"&&<button onClick={()=>setTab("advance")} style={{fontSize:10,padding:"6px 14px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text2,cursor:"pointer",fontWeight:700}}>→ Advance</button>}
        <button onClick={()=>setTab("guestlist")} style={{fontSize:10,padding:"6px 14px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text2,cursor:"pointer",fontWeight:700}}>→ Guest List</button>
        <button onClick={()=>setTab("crew")} style={{fontSize:10,padding:"6px 14px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text2,cursor:"pointer",fontWeight:700}}>→ Crew</button>
        <button onClick={()=>setTab("finance")} style={{fontSize:10,padding:"6px 14px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text2,cursor:"pointer",fontWeight:700}}>→ Finance</button>
      </div>
    </div>
  );
}
