import { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { DEFAULT_CREW, MN, UI } from "../../lib/domain-constants";
import { fFull, fmt, hhmmToMin, pM } from "../../lib/time";
import { T } from "../../styles/tokens";
import { FlightDayStrip } from "../flights/FlightDayStrip";

export function DayScheduleView({show,bus,split,sel}){
  const{uShow,uRos,gRos,shows,aC,flights,lodging,setTab,activeSplitParty}=useContext(Ctx);
  const isTravel=show.type==="travel";
  const isSplit=show.type==="split";
  const isStored=!!shows?.[sel];
  // Notes
  const[editNotes,setEditNotes]=useState(false);
  const[notesVal,setNotesVal]=useState(show.notes||"");
  // Edit day info
  const[editDay,setEditDay]=useState(false);
  const[dayCity,setDayCity]=useState(show.city||"");
  const[dayVenue,setDayVenue]=useState(show.venue||"");
  const[dayType,setDayType]=useState(show.type||"off");
  // Schedule items
  const[addingItem,setAddingItem]=useState(false);
  const[newItem,setNewItem]=useState({time:"",label:"",notes:""});
  const[editItemId,setEditItemId]=useState(null);
  const allItems=gRos(sel)||[];
  const dayItems=allItems.filter(b=>b.isDayItem&&!b.flightId);

  // Unified timeline: bus + flights + lodging + schedule items sorted by time
  const timeline=useMemo(()=>{
    const items=[];
    // Bus segment
    if(isTravel&&bus){
      const depMin=hhmmToMin(bus.dep);
      const arrMin=hhmmToMin(bus.arr);
      items.push({type:"bus",id:"bus",sortMin:depMin??-1,bus,depMin,arrMin});
    }
    // Lodging: check-in on this date
    Object.values(lodging||{}).filter(h=>h.checkIn===sel).forEach(h=>{
      const t=h.checkInTime||"15:00";
      items.push({type:"lodging_in",id:`lodging_in_${h.id}`,sortMin:hhmmToMin(t)??900,h,t});
    });
    // Lodging: check-out on this date
    Object.values(lodging||{}).filter(h=>h.checkOut===sel).forEach(h=>{
      const t=h.checkOutTime||"12:00";
      items.push({type:"lodging_out",id:`lodging_out_${h.id}`,sortMin:hhmmToMin(t)??720,h,t});
    });
    // Schedule items
    dayItems.forEach(b=>{
      items.push({type:"item",id:b.id,sortMin:b.startMin??-1,b});
    });
    return items.sort((a,b)=>a.sortMin-b.sortMin);
  },[isTravel,bus,lodging,sel,dayItems]);

  const ensureStored=()=>{if(!isStored)uShow(sel,{date:sel,clientId:aC,type:show.type||"off",city:show.city||"",venue:show.venue||"",advance:[],doors:0,curfew:0,busArrive:0,crewCall:0,venueAccess:0,mgTime:0,notes:""});};
  const saveNotes=()=>{ensureStored();uShow(sel,{notes:notesVal});setEditNotes(false);};
  const saveDayInfo=()=>{
    const base=isStored?shows[sel]:{date:sel,advance:[],doors:0,curfew:0,busArrive:0,crewCall:0,venueAccess:0,mgTime:0};
    uShow(sel,{...base,type:dayType,city:dayCity,venue:dayVenue});
    setEditDay(false);
  };
  const convertToShow=()=>{
    const base=isStored?shows[sel]:{date:sel,advance:[],promoter:"",country:"",region:""};
    uShow(sel,{...base,type:"show",city:dayCity||show.city||"",venue:dayVenue||show.venue||""});
    setEditDay(false);
  };
  const addItem=()=>{
    if(!newItem.label.trim())return;
    const tMin=newItem.time?pM(newItem.time):null;
    const nb={id:`item_${Date.now()}`,label:newItem.label.trim(),time:newItem.time,startMin:tMin,notes:newItem.notes,type:"custom",isDayItem:true,color:T.accent,phase:"pre",duration:60,roles:["tm_td","pm","ld","driver"]};
    uRos(sel,[...allItems,nb]);
    setNewItem({time:"",label:"",notes:""});setAddingItem(false);
  };
  const removeItem=id=>uRos(sel,allItems.filter(b=>b.id!==id));
  const updateItem=(id,patch)=>uRos(sel,allItems.map(b=>b.id===id?{...b,...patch,startMin:patch.time!==undefined?pM(patch.time):b.startMin}:b));

  return(
    <div className="fi" style={{padding:"16px 20px",maxWidth:680}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:800,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {isTravel?(bus?.route||show.city||"Travel Day"):isSplit?"Split Day":(show.city||"Rest Day")}
          </div>
          <div style={{fontSize:10,color:T.textDim,fontFamily:MN}}>{fFull(sel)}</div>
        </div>
        <button onClick={()=>setEditDay(v=>!v)} style={{fontSize:9,padding:"3px 8px",borderRadius:6,border:`1px solid ${editDay?"var(--accent)":"var(--border)"}`,background:editDay?"var(--accent-pill-bg)":"var(--card-3)",color:editDay?"var(--accent)":"var(--text-2)",cursor:"pointer",fontWeight:600,flexShrink:0}}>✏ Edit</button>
        <div style={{fontSize:8,fontWeight:800,padding:"3px 9px",borderRadius:6,background:isTravel?"var(--info-bg)":isSplit?"var(--warn-bg)":"var(--card-2)",color:isTravel?"var(--link)":isSplit?"var(--warn-fg)":"var(--text-dim)",letterSpacing:"0.06em",flexShrink:0}}>
          {isTravel?"TRAVEL":isSplit?"SPLIT":"OFF"}
        </div>
      </div>

      {/* Edit panel */}
      {editDay&&(
        <div style={{background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
          <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.08em",marginBottom:10}}>EDIT DAY</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
            <div>
              <div style={{fontSize:8,color:T.textDim,fontWeight:600,marginBottom:3}}>CITY / LOCATION</div>
              <input value={dayCity} onChange={e=>setDayCity(e.target.value)} placeholder="e.g. Amsterdam" style={{...UI.input,width:"100%"}}/>
            </div>
            <div>
              <div style={{fontSize:8,color:T.textDim,fontWeight:600,marginBottom:3}}>VENUE / NOTE</div>
              <input value={dayVenue} onChange={e=>setDayVenue(e.target.value)} placeholder="e.g. Hotel Okura" style={{...UI.input,width:"100%"}}/>
            </div>
          </div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:8,color:T.textDim,fontWeight:600,marginBottom:3}}>TYPE</div>
            <select value={dayType} onChange={e=>setDayType(e.target.value)} style={{...UI.input}}>
              <option value="off">Off Day</option>
              <option value="travel">Travel Day</option>
            </select>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={saveDayInfo} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",background:"var(--success-fg)",color:"#fff",cursor:"pointer",fontWeight:700}}>Save</button>
            <button onClick={convertToShow} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-3)",color:T.text,cursor:"pointer",fontWeight:600}}>↑ Convert to Show Day</button>
            <button onClick={()=>setEditDay(false)} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      <FlightDayStrip sel={sel}/>
      {/* Split card */}
      {split&&(()=>{
        const focusId=activeSplitParty?.id||split.parties[0]?.id;
        const focus=split.parties.find(p=>p.id===focusId)||split.parties[0];
        const others=split.parties.filter(p=>p.id!==focus?.id);
        return(
          <div style={{background:"var(--warn-bg)",border:"1px solid var(--warn-bg)",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
            <div style={{fontSize:9,fontWeight:800,color:T.warnFg,letterSpacing:"0.08em",marginBottom:8}}>SPLIT PARTY — {split.parties.length} GROUPS</div>
            {focus&&(
              <div style={{padding:"8px 10px",background:focus.bg,borderRadius:6,border:`1px solid ${focus.color}30`,marginBottom:others.length?6:0}}>
                <div style={{fontSize:10,fontWeight:700,color:focus.color,marginBottom:3}}>{focus.label} <span style={{fontWeight:400,color:T.textDim}}>· {focus.location}</span></div>
                <div style={{fontSize:9,color:T.textDim,marginBottom:6}}>{focus.event}</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {focus.crew.map(cid=>{const c=DEFAULT_CREW.find(x=>x.id===cid);return c?(<span key={cid} style={{fontSize:8,padding:"2px 8px",borderRadius:10,background:"var(--card)",border:`1px solid ${focus.color}40`,color:focus.color,fontWeight:600}}>{c.name.split(" ")[0]} <span style={{fontWeight:400,opacity:0.7,fontSize:8}}>({c.role.split(" (")[0].split("/")[0].trim()})</span></span>):null;})}
                </div>
                {focus.note&&<div style={{fontSize:8,color:T.textDim,marginTop:5,fontStyle:"italic"}}>{focus.note}</div>}
              </div>
            )}
            {others.length>0&&(
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                {others.map(p=><span key={p.id} style={{fontSize:8,padding:"2px 8px",borderRadius:10,background:"var(--card-2)",color:T.textMute,fontWeight:600}}>{p.label}</span>)}
              </div>
            )}
          </div>
        );
      })()}

      {/* Unified timeline: bus + flights + schedule items */}
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.08em"}}>TIMELINE{timeline.length>0?` · ${timeline.length}`:""}</div>
          <button onClick={()=>setAddingItem(true)} style={{fontSize:9,padding:"3px 8px",borderRadius:6,border:"1px solid var(--accent)",background:"var(--accent-pill-bg)",color:T.accent,cursor:"pointer",fontWeight:700}}>+ Add Item</button>
        </div>
        {addingItem&&(
          <div style={{background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px",marginBottom:8}}>
            <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
              <input placeholder="Time (e.g. 2:00p)" value={newItem.time} onChange={e=>setNewItem(p=>({...p,time:e.target.value}))} style={{...UI.input,width:110,fontFamily:MN}}/>
              <input placeholder="Label" value={newItem.label} onChange={e=>setNewItem(p=>({...p,label:e.target.value}))} style={{...UI.input,flex:1,minWidth:140}}/>
            </div>
            <input placeholder="Notes (optional)" value={newItem.notes} onChange={e=>setNewItem(p=>({...p,notes:e.target.value}))} style={{...UI.input,width:"100%",marginBottom:6,boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:6}}>
              <button onClick={addItem} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Add</button>
              <button onClick={()=>{setAddingItem(false);setNewItem({time:"",label:"",notes:""});}} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {timeline.map(entry=>{
            if(entry.type==="bus"){
              const{bus:b,depMin,arrMin}=entry;
              return(
                <div key="bus" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"10px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10}}>
                  <div style={{width:44,flexShrink:0,textAlign:"right"}}>
                    {depMin!=null&&<div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:T.link}}>{fmt(depMin)}</div>}
                    {arrMin!=null&&<div style={{fontFamily:MN,fontSize:9,color:T.textDim}}>{fmt(arrMin)}</div>}
                  </div>
                  <div style={{width:3,alignSelf:"stretch",background:"var(--link)",borderRadius:4,opacity:0.4,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <span style={{fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:4,background:"var(--info-bg)",color:T.link,letterSpacing:"0.04em"}}>BUS</span>
                      <span style={{fontSize:11,fontWeight:700,color:T.text}}>{b.route}</span>
                      {b.flag==="⚠"&&<span style={{fontSize:9,color:"var(--danger-fg)"}}>⚠</span>}
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {b.km&&<span style={{fontSize:9,color:T.textDim}}>{b.km} km</span>}
                      {b.drive&&b.drive!=="—"&&<span style={{fontSize:9,color:T.textDim}}>{b.drive} drive</span>}
                      {b.day&&<span style={{fontFamily:MN,fontSize:8,color:T.textMute}}>Day {b.day}/30</span>}
                    </div>
                    {b.flag==="⚠"&&b.note&&<div style={{fontSize:9,color:"var(--danger-fg)",marginTop:3,fontWeight:600}}>{b.note}</div>}
                    {b.note&&b.flag!=="⚠"&&<div style={{fontSize:9,color:T.textMute,marginTop:2,fontStyle:"italic"}}>{b.note}</div>}
                  </div>
                </div>
              );
            }
            if(entry.type==="lodging_in"||entry.type==="lodging_out"){
              const{h,t,type:lt}=entry;const isIn=lt==="lodging_in";
              const rooms=(h.rooms||[]).length;
              return(
                <div key={entry.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"9px 12px",background:"var(--success-bg)",border:"1px solid var(--success-bg)",borderRadius:10,cursor:"pointer"}} onClick={()=>setTab("lodging")}>
                  <div style={{width:44,flexShrink:0,textAlign:"right"}}>
                    <div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:isIn?"var(--success-fg)":"var(--text-dim)"}}>{t}</div>
                  </div>
                  <div style={{width:3,alignSelf:"stretch",background:isIn?"var(--success-fg)":"var(--text-mute)",borderRadius:4,opacity:0.5,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                      <span style={{fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:4,background:isIn?"var(--success-fg)":"var(--text-mute)",color:"#fff",letterSpacing:"0.04em"}}>{isIn?"CHECK IN":"CHECK OUT"}</span>
                      <span style={{fontSize:11,fontWeight:700,color:T.text}}>{h.name}</span>
                      {h.city&&<span style={{fontSize:9,color:T.textDim}}>{h.city}</span>}
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {rooms>0&&<span style={{fontSize:9,color:T.text2}}>{rooms} room{rooms!==1?"s":""}</span>}
                      {h.confirmNo&&<span style={{fontFamily:MN,fontSize:8,color:T.textMute}}>#{h.confirmNo}</span>}
                    </div>
                  </div>
                </div>
              );
            }
            // type === "item"
            const item=entry.b;const isEditing=editItemId===item.id;
            return(
              <div key={item.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 10px",background:"var(--card)",border:`1px solid ${isEditing?"var(--accent)":"var(--border)"}`,borderRadius:10}}>
                {isEditing?(
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:5}}>
                    <div style={{display:"flex",gap:5}}>
                      <input defaultValue={item.time||""} onChange={e=>updateItem(item.id,{time:e.target.value})} placeholder="Time" style={{...UI.input,width:100,fontFamily:MN}}/>
                      <input defaultValue={item.label} onChange={e=>updateItem(item.id,{label:e.target.value})} placeholder="Label" style={{...UI.input,flex:1}}/>
                    </div>
                    <input defaultValue={item.notes||""} onChange={e=>updateItem(item.id,{notes:e.target.value})} placeholder="Notes" style={{...UI.input,width:"100%",boxSizing:"border-box"}}/>
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>setEditItemId(null)} style={{fontSize:9,padding:"3px 8px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Done</button>
                      <button onClick={()=>{removeItem(item.id);setEditItemId(null);}} style={{fontSize:9,padding:"3px 8px",borderRadius:6,border:"1px solid var(--danger-bg)",background:"var(--danger-bg)",color:"var(--danger-fg)",cursor:"pointer"}}>Delete</button>
                    </div>
                  </div>
                ):(
                  <>
                    <div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:T.accent,width:44,flexShrink:0,paddingTop:1,textAlign:"right"}}>{item.startMin!=null?fmt(item.startMin):item.time||"—"}</div>
                    <div style={{width:3,height:32,background:"var(--accent)",borderRadius:4,flexShrink:0,opacity:0.5,alignSelf:"center"}}/>
                    <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setEditItemId(item.id)}>
                      <div style={{fontSize:11,fontWeight:600,color:T.text}}>{item.label}</div>
                      {item.notes&&<div style={{fontSize:9,color:T.textDim,marginTop:2}}>{item.notes}</div>}
                    </div>
                    <button onClick={()=>setEditItemId(item.id)} style={{background:"none",border:"none",cursor:"pointer",color:T.textMute,fontSize:11,padding:"0 2px",flexShrink:0}}>✏</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {timeline.length===0&&!addingItem&&(
          <div style={{padding:"18px 0",textAlign:"center",background:"var(--card-3)",border:"1px dashed var(--border)",borderRadius:10}}>
            <div style={{fontSize:10,color:T.textMute}}>No items. Add meals, check-ins, promo events, etc.</div>
          </div>
        )}
      </div>

      {/* Off-day empty state when no items, no bus, no split */}
      {!isTravel&&!split&&timeline.length===0&&!addingItem&&(
        <div style={{padding:"24px 0",textAlign:"center"}}>
          <div style={{fontSize:20,marginBottom:6,opacity:0.25}}>◌</div>
          <div style={{fontSize:11,fontWeight:600,color:T.text,marginBottom:3}}>Rest Day</div>
          <div style={{fontSize:9,color:T.textMute}}>Nothing scheduled. Add items above or convert to a show day.</div>
        </div>
      )}

      {/* Notes */}
      <div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.08em"}}>NOTES</div>
          <button onClick={()=>{if(editNotes)saveNotes();else{setNotesVal(show.notes||"");setEditNotes(true);}}} style={{fontSize:9,padding:"3px 8px",borderRadius:6,border:`1px solid ${editNotes?"var(--accent)":"var(--border)"}`,background:editNotes?"var(--accent-pill-bg)":"var(--card-3)",color:editNotes?"var(--accent)":"var(--text-2)",cursor:"pointer",fontWeight:600}}>
            {editNotes?"Save":"Edit"}
          </button>
        </div>
        {editNotes?(
          <textarea value={notesVal} onChange={e=>setNotesVal(e.target.value)} placeholder="Notes for this day..." rows={3} style={{...UI.input,width:"100%",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit",lineHeight:1.5}}/>
        ):notesVal?(
          <div style={{background:"var(--warn-bg)",border:"1px solid var(--warn-bg)",borderRadius:6,padding:"8px 12px",fontSize:9,color:T.warnFg,fontWeight:500}}>{notesVal}</div>
        ):(
          <div style={{fontSize:9,color:T.textMute,fontStyle:"italic"}}>No notes.</div>
        )}
      </div>
    </div>
  );
}
