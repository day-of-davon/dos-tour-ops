import { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN, UI } from "../../lib/domain-constants";
import { fD, toM } from "../../lib/time";
import { T } from "../../styles/tokens";

export function DateDrawer({onClose}){
  const{sorted,tourDaysSorted,sel,setSel,uShow,aC,shows,tourDays}=useContext(Ctx);
  const[newDate,setNewDate]=useState("");
  const[newType,setNewType]=useState("off");
  const[newVenue,setNewVenue]=useState("");
  const[newCity,setNewCity]=useState("");
  const[filter,setFilter]=useState("all");
  const[editingDay,setEditingDay]=useState(null);
  const[editVal,setEditVal]=useState("");
  const saveEdit=(date)=>{if(editVal.trim())uShow(date,{city:editVal.trim()});setEditingDay(null);};
  const startEdit=(e,d)=>{e.stopPropagation();setEditingDay(d.date);setEditVal(d.city||"");};
  const add=()=>{
    if(!newDate||shows[newDate])return;
    const isShow=newType==="show";
    uShow(newDate,{date:newDate,clientId:aC,type:newType,city:newType==="travel"?"Travel":isShow?(newCity||""):"Off Day",venue:newType==="travel"?"Travel Day":isShow?(newVenue||""):"Off Day",country:"",region:"",promoter:"",advance:[],doors:isShow?toM(19):0,curfew:isShow?toM(23):0,busArrive:isShow?toM(9):0,crewCall:isShow?toM(10):0,venueAccess:isShow?toM(9):0,mgTime:isShow?toM(16,30):0,notes:""});
    setSel(newDate);setNewDate("");setNewVenue("");setNewCity("");onClose();
  };
  const drawerLabel=useMemo(()=>{
    if(!sel)return"DATES";
    const td=tourDays?.[sel];const sh=shows?.[sel];
    if(sh&&(sh.type==="travel"||sh.type==="off")){const r=td?.bus?.route;return r?r:sh.city||sh.type.toUpperCase();}
    if(sh)return sh.city||sh.venue||fD(sel);
    if(td){if(td.type==="travel"&&td.bus?.route)return td.bus.route;if(td.type==="split")return"Split Day";if(td.type==="off")return"Off";}
    return fD(sel);
  },[sel,tourDays,shows]);
  const typeStyle=t=>t==="travel"?{bg:"var(--info-bg)",c:"var(--link)",l:"Travel"}:t==="off"?{bg:"var(--bg)",c:"var(--text-mute)",l:"Off"}:t==="split"?{bg:"var(--warn-bg)",c:"var(--warn-fg)",l:"Split"}:t==="show"?{bg:"var(--success-bg)",c:"var(--success-fg)",l:"Show"}:null;
  // Merge tour days with non-tour shows (post-EU shows, festivals). Use tourDays for Apr16-May31, fall back to sorted for everything else.
  const rows=useMemo(()=>{
    const tourIds=new Set((tourDaysSorted||[]).map(d=>d.date));
    const extras=(sorted||[]).filter(s=>s.clientId===aC&&!tourIds.has(s.date)).map(s=>({date:s.date,type:s.type||"show",show:s,city:s.city,venue:s.venue}));
    const all=[...(tourDaysSorted||[]),...extras].sort((a,b)=>a.date.localeCompare(b.date));
    if(filter==="all")return all;
    return all.filter(d=>d.type===filter);
  },[tourDaysSorted,sorted,filter,aC]);
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.3)",zIndex:80,display:"flex",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:320,maxWidth:"90vw",height:"100%",background:"var(--card)",boxShadow:"-4px 0 16px rgba(0,0,0,0.12)",display:"flex",flexDirection:"column",fontFamily:"'Outfit',system-ui"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:11,fontWeight:800,letterSpacing:"0.06em",color:T.text}}>{drawerLabel}</span>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",fontSize:20,color:T.textDim}}>×</button>
        </div>
        <div style={{padding:"10px 16px",borderBottom:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} style={{...UI.input,fontFamily:MN,padding:"5px 8px",flex:1}}/>
            <select value={newType} onChange={e=>setNewType(e.target.value)} style={{...UI.input,padding:"5px 8px"}}>
              <option value="show">Show</option>
              <option value="off">Off Day</option>
              <option value="travel">Travel Day</option>
            </select>
          </div>
          {newType==="show"&&<div style={{display:"flex",gap:6}}>
            <input value={newVenue} onChange={e=>setNewVenue(e.target.value)} placeholder="Venue" style={{...UI.input,padding:"5px 8px",flex:1}}/>
            <input value={newCity} onChange={e=>setNewCity(e.target.value)} placeholder="City" style={{...UI.input,padding:"5px 8px",flex:1}}/>
          </div>}
          <button onClick={add} disabled={!newDate||!!shows[newDate]} style={{...UI.expandBtn(false,"var(--success-fg)"),opacity:(!newDate||shows[newDate])?0.4:1}}>+ Add</button>
        </div>
        <div style={{padding:"6px 12px",borderBottom:"1px solid var(--border)",display:"flex",gap:4,flexWrap:"wrap"}}>
          {[["all","All"],["show","Show"],["travel","Travel"],["off","Off"],["split","Split"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)} style={{padding:"2px 8px",fontSize:9,fontWeight:700,borderRadius:10,border:`1px solid ${filter===v?"var(--accent)":"var(--border)"}`,background:filter===v?"var(--accent-pill-bg)":"var(--card)",color:filter===v?"var(--accent)":"var(--text-dim)",cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        <div style={{flex:1,overflow:"auto",padding:"6px 8px"}}>
          {rows.map(d=>{const isSel=d.date===sel;const ts=typeStyle(d.type);const isDim=d.type==="off";return(
            <div key={d.date} onClick={()=>{if(editingDay===d.date)return;setSel(d.date);onClose();}} className="rh" style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:6,cursor:"pointer",background:isSel?"var(--accent-pill-bg)":"transparent",borderLeft:isSel?"3px solid var(--accent)":"3px solid transparent",opacity:isDim?0.65:1,position:"relative"}}>
              <div style={{fontFamily:MN,fontSize:10,fontWeight:700,color:isSel?"var(--accent)":"var(--text-2)",width:48,flexShrink:0}}>{fD(d.date)}</div>
              <div style={{flex:1,minWidth:0}}>
                {editingDay===d.date
                  ?<input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={()=>saveEdit(d.date)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();saveEdit(d.date);}if(e.key==="Escape"){setEditingDay(null);}}} onClick={e=>e.stopPropagation()} style={{...UI.input,fontSize:11,fontWeight:600,padding:"1px 4px",width:"100%",boxSizing:"border-box"}}/>
                  :<div style={{fontSize:11,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.city||"—"}</div>}
                <div style={{fontSize:9,color:T.textDim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.venue}{d.bus?.note?` · ${d.bus.note}`:""}</div>
              </div>
              {ts?<span style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:ts.bg,color:ts.c,fontWeight:700,flexShrink:0}}>{ts.l}</span>:null}
              <button onClick={e=>startEdit(e,d)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:T.textMute,padding:"2px 3px",lineHeight:1,flexShrink:0,opacity:0.6}} title="Rename">✎</button>
            </div>);})}
        </div>
      </div>
    </div>
  );
}
