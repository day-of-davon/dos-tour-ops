import { useContext, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN, UI } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";

export function EventSwitcher({show,sel}){
  const{selEventId,setSelEventId,uShow,showCrew}=useContext(Ctx);
  const[adding,setAdding]=useState(false);
  const[newName,setNewName]=useState("");
  const[delId,setDelId]=useState(null);
  const BAR={minHeight:36,borderBottom:"1px solid var(--border)",background:"var(--card)",display:"flex",alignItems:"center"};
  if(!show)return <div style={{...BAR,minHeight:28}}/>;
  const subEvents=show.subEvents||[];
  const DOTS=["#16a34a","#2563eb","#d97706","#9333ea","#dc2626","#0891b2"];
  const crewCount=k=>Object.values(showCrew?.[k]||{}).filter(v=>v&&(v.going||v.status==="going"||v===true)).length;
  const EventTab=({active,onClick,dotColor,name,sub,children})=>(
    <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 14px",border:"none",borderBottom:active?"2px solid var(--text)":"2px solid transparent",background:"none",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,textAlign:"left",minHeight:36}}>
      <span style={{width:8,height:8,borderRadius:"50%",background:dotColor,flexShrink:0}}/>
      <span style={{display:"flex",flexDirection:"column",gap:1,lineHeight:1.2}}>
        <span style={{fontSize:13,fontWeight:700,color:active?"var(--text)":"var(--text-dim)"}}>{name}</span>
        {sub&&<span style={{fontSize:10,color:T.textMute,fontFamily:MN,letterSpacing:"0.02em"}}>{sub}</span>}
      </span>
      {children}
    </button>
  );
  const addEvent=()=>{
    const id=`ev_${Date.now()}`;
    const nb={id,name:newName.trim()||`Event ${subEvents.length+2}`,venue:show.venue,city:show.city,promoter:show.promoter||"",doors:show.doors,curfew:show.curfew,busArrive:show.busArrive,crewCall:show.crewCall,venueAccess:show.venueAccess,mgTime:show.mgTime,notes:"",busSkip:show.busSkip,mgSkip:show.mgSkip};
    uShow(sel,{subEvents:[...subEvents,nb]});
    setSelEventId(id);setAdding(false);setNewName("");
  };
  const removeEvent=id=>{
    const next=subEvents.filter(e=>e.id!==id);
    uShow(sel,{subEvents:next});
    if(selEventId===id)setSelEventId(null);
    setDelId(null);
  };
  const mainCrew=crewCount(sel);
  const mainSub=[show.city||show.venue||"Main",mainCrew?`${mainCrew} crew`:null].filter(Boolean).join(" · ");
  return(
    <div style={{...BAR,padding:"0 20px",gap:12,overflowX:"auto",scrollbarWidth:"none"}}>
      <EventTab active={!selEventId} onClick={()=>setSelEventId(null)} dotColor={DOTS[0]} name={show.venue||"Main"} sub={mainSub}/>
      {subEvents.map((ev,i)=>{
        const isA=selEventId===ev.id;
        const c=crewCount(ev.id);
        const sub=[ev.city||ev.venue||show.city||"",c?`${c} crew`:null].filter(Boolean).join(" · ");
        return(
          <div key={ev.id} style={{display:"flex",alignItems:"center",flexShrink:0,gap:2}}>
            <EventTab active={isA} onClick={()=>setSelEventId(ev.id)} dotColor={DOTS[(i+1)%DOTS.length]} name={ev.name} sub={sub}/>
            <button onClick={()=>setDelId(delId===ev.id?null:ev.id)} style={{background:"none",border:"none",color:"var(--text-faint)",fontSize:13,cursor:"pointer",padding:"0 4px",lineHeight:1}}>×</button>
            {delId===ev.id&&<span style={{fontSize:11,display:"flex",alignItems:"center",gap:4}}>
              <button onClick={()=>removeEvent(ev.id)} style={{fontSize:11,padding:"3px 8px",borderRadius:4,border:"none",background:"var(--danger-bg)",color:"var(--danger-fg)",cursor:"pointer",fontWeight:700}}>Delete</button>
              <button onClick={()=>setDelId(null)} style={{fontSize:11,padding:"3px 8px",borderRadius:4,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>Cancel</button>
            </span>}
          </div>
        );
      })}
      {adding?(
        <div style={{display:"flex",alignItems:"center",gap:5,marginLeft:6,flexShrink:0}}>
          <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addEvent();if(e.key==="Escape"){setAdding(false);setNewName("");}}} placeholder="Event name" style={{...UI.input,width:140,fontSize:12}}/>
          <button onClick={addEvent} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Add</button>
          <button onClick={()=>{setAdding(false);setNewName("");}} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>✕</button>
        </div>
      ):(
        <button onClick={()=>setAdding(true)} style={{padding:"8px 12px",fontSize:11,fontWeight:700,color:T.textDim,border:"none",borderBottom:"2px solid transparent",background:"none",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,marginLeft:"auto"}}>+ Event</button>
      )}
    </div>
  );
}
