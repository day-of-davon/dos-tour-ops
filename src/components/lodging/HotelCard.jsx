import { useState } from "react";
import { HOTEL_TODOS_DEFAULT } from "../../lib/constants";
import { MN } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";
import { HOTEL_STATUS_META, ROOM_STATUS_META } from "../../lib/lodging";

export function HotelCard({hotel,date,onEdit,crew,uLodging,uFin,finance}){
  const[open,setOpen]=useState(true);
  const[newRoom,setNewRoom]=useState({crewId:"",roomNo:"",type:"Single",cost:"",notes:""});
  const[addRoomOpen,setAddRoomOpen]=useState(false);

  const meta=HOTEL_STATUS_META[hotel.status||"pending"]||HOTEL_STATUS_META.pending;
  const rooms=hotel.rooms||[];

  const totalCost=rooms.reduce((s,r)=>s+(parseFloat(r.cost)||0),0);

  function toggleTodo(i){
    const todos=(hotel.todos||HOTEL_TODOS_DEFAULT.map(t=>({text:t,done:false})));
    const next=[...todos];next[i]={...next[i],done:!next[i].done};
    uLodging(hotel.id,{...hotel,todos:next});
  }
  function initTodos(){if(!hotel.todos){uLodging(hotel.id,{...hotel,todos:HOTEL_TODOS_DEFAULT.map(t=>({text:t,done:false}))});}}

  function addRoom(){
    if(!newRoom.crewId)return;
    const r={id:`rm_${Date.now()}`,...newRoom,cost:parseFloat(newRoom.cost)||0,status:"pending",addedAt:Date.now()};
    uLodging(hotel.id,{...hotel,rooms:[...rooms,r]});
    setNewRoom({crewId:"",roomNo:"",type:"Single",cost:"",notes:""});
    setAddRoomOpen(false);
  }

  function removeRoom(id){uLodging(hotel.id,{...hotel,rooms:rooms.filter(r=>r.id!==id)});}

  function cycleRoomStatus(id){
    const order=["pending","confirmed","occupied","released"];
    const next=rooms.map(r=>{if(r.id!==id)return r;const i=order.indexOf(r.status||"pending");return{...r,status:order[(i+1)%order.length]};});
    uLodging(hotel.id,{...hotel,rooms:next});
  }

  function pushToLedger(){
    if(!totalCost)return;
    const dateKey=hotel.checkIn||date;
    const fin=finance[dateKey]||{};
    const ledger=fin.ledgerEntries||[];
    const entry={id:`lodging_${hotel.id}_${Date.now()}`,date:dateKey,vendor:hotel.name,amount:totalCost,currency:hotel.currency||"USD",category:"Hotel",description:`${rooms.length} room${rooms.length!==1?"s":""} – ${hotel.name}`,source:"lodging",hotelId:hotel.id};
    uFin(dateKey,{...fin,ledgerEntries:[...ledger.filter(e=>e.hotelId!==hotel.id),entry]});
  }

  const todos=hotel.todos||HOTEL_TODOS_DEFAULT.map(t=>({text:t,done:false}));
  const doneTodos=todos.filter(t=>t.done).length;

  return(
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
      {/* Card header */}
      <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:8,borderBottom:open?"1px solid var(--border)":"none",cursor:"pointer"}} onClick={()=>{setOpen(v=>!v);if(!hotel.todos)initTodos();}}>
        <span style={{fontSize:13}}>{open?"▾":"▸"}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontWeight:800,fontSize:13,color:T.text}}>{hotel.name||"Unnamed Hotel"}</span>
            <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:99,...meta,display:"inline-block"}}>{meta.label}</span>
            {hotel.stars&&<span style={{fontSize:10,color:T.warnFg}}>{"★".repeat(hotel.stars)}</span>}
          </div>
          <div style={{fontSize:10,color:T.textDim,marginTop:1}}>{hotel.city&&`${hotel.city} · `}Check-in {hotel.checkIn} → Check-out {hotel.checkOut}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {totalCost>0&&<span style={{fontSize:10,fontWeight:700,color:T.successFg,fontFamily:MN}}>${totalCost.toFixed(0)}</span>}
          <button onClick={e=>{e.stopPropagation();onEdit();}} style={{background:"var(--card-2)",border:"none",borderRadius:6,padding:"4px 8px",fontSize:10,cursor:"pointer",color:T.text2}}>Edit</button>
          <button onClick={e=>{e.stopPropagation();if(confirm(`Remove ${hotel.name}?`))uLodging(hotel.id,null);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13,padding:"2px 4px"}}>×</button>
        </div>
      </div>

      {open&&(
        <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:12}}>
          {/* Details row */}
          <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:11,color:T.text2}}>
            {hotel.address&&<span>📍 {hotel.address}</span>}
            {hotel.phone&&<span>📞 <a href={`tel:${hotel.phone}`} style={{color:T.accent,textDecoration:"none"}}>{hotel.phone}</a></span>}
            {hotel.confirmNo&&<span style={{fontFamily:MN}}>Conf# <strong>{hotel.confirmNo}</strong></span>}
            {hotel.bookingRef&&<span style={{fontFamily:MN}}>Ref# <strong>{hotel.bookingRef}</strong></span>}
            {hotel.checkInTime&&<span>Check-in {hotel.checkInTime}</span>}
            {hotel.checkOutTime&&<span>Check-out {hotel.checkOutTime}</span>}
          </div>

          {/* Room assignments */}
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <div style={{fontSize:10,fontWeight:700,color:T.text,letterSpacing:"0.04em",textTransform:"uppercase"}}>Rooms ({rooms.length})</div>
              <button onClick={()=>setAddRoomOpen(v=>!v)} style={{background:"var(--accent-pill-bg)",color:T.accent,border:"none",borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>+ Assign Room</button>
            </div>
            {rooms.length===0&&<div style={{fontSize:10,color:T.textMute,fontStyle:"italic"}}>No rooms assigned.</div>}
            {rooms.map(r=>{
              const cm=crew.find(c=>c.id===r.crewId);
              const rMeta=ROOM_STATUS_META[r.status||"pending"]||ROOM_STATUS_META.pending;
              return(
                <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid var(--card-2)",fontSize:11}}>
                  <button onClick={()=>cycleRoomStatus(r.id)} style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:99,...rMeta,border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>{rMeta.label}</button>
                  <span style={{flex:1,fontWeight:600,color:T.text}}>{cm?.name||r.crewId}</span>
                  {r.roomNo&&<span style={{fontFamily:MN,color:T.textDim}}>#{r.roomNo}</span>}
                  <span style={{color:T.textDim}}>{r.type}</span>
                  {r.cost>0&&<span style={{fontFamily:MN,color:T.successFg,fontWeight:700}}>${r.cost}</span>}
                  {r.notes&&<span style={{color:T.textMute,fontSize:10}}>{r.notes}</span>}
                  <button onClick={()=>removeRoom(r.id)} style={{background:"none",border:"none",color:"var(--danger-fg)",cursor:"pointer",fontSize:13,padding:"0 2px"}}>×</button>
                </div>
              );
            })}
            {addRoomOpen&&(
              <div style={{background:"var(--card-4)",border:"1px solid var(--border)",borderRadius:6,padding:"10px 10px",marginTop:6,display:"flex",flexDirection:"column",gap:7}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <select value={newRoom.crewId} onChange={e=>setNewRoom(p=>({...p,crewId:e.target.value}))} style={{flex:2,padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",fontSize:11,minWidth:120}}>
                    <option value="">Select crew member</option>
                    {crew.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input placeholder="Room #" value={newRoom.roomNo} onChange={e=>setNewRoom(p=>({...p,roomNo:e.target.value}))} style={{width:70,padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",fontSize:11,fontFamily:MN}}/>
                  <select value={newRoom.type} onChange={e=>setNewRoom(p=>({...p,type:e.target.value}))} style={{width:90,padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",fontSize:11}}>
                    {["Single","Double","Twin","Suite","King","Shared"].map(t=><option key={t}>{t}</option>)}
                  </select>
                  <input placeholder="Cost" type="number" value={newRoom.cost} onChange={e=>setNewRoom(p=>({...p,cost:e.target.value}))} style={{width:70,padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",fontSize:11,fontFamily:MN}}/>
                </div>
                <input placeholder="Notes (optional)" value={newRoom.notes} onChange={e=>setNewRoom(p=>({...p,notes:e.target.value}))} style={{padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",fontSize:11}}/>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={addRoom} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Add Room</button>
                  <button onClick={()=>setAddRoomOpen(false)} style={{background:"var(--card-2)",color:T.text2,border:"none",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* To-do checklist */}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:T.text,letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:5}}>Checklist ({doneTodos}/{todos.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {todos.map((t,i)=>(
                <label key={i} style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:11,color:t.done?"var(--text-mute)":"var(--text)",textDecoration:t.done?"line-through":"none"}}>
                  <input type="checkbox" checked={!!t.done} onChange={()=>toggleTodo(i)} style={{accentColor:"var(--accent)",width:13,height:13,flexShrink:0}}/>
                  {t.text}
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:T.text,letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:4}}>Notes</div>
            <textarea value={hotel.notes||""} onChange={e=>uLodging(hotel.id,{...hotel,notes:e.target.value})} placeholder="Parking, shuttle, special requests, room block contact…" rows={2} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:11,resize:"vertical",background:"var(--card-4)",fontFamily:"'Outfit',system-ui"}}/>
          </div>

          {/* Finance row */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:4,borderTop:"1px solid var(--card-2)"}}>
            <div style={{fontSize:11,color:T.textDim}}>
              Total: <strong style={{color:T.successFg,fontFamily:MN}}>{hotel.currency||"USD"} {totalCost.toFixed(2)}</strong>
              {rooms.length>0&&<span style={{color:T.textMute,marginLeft:6}}>({rooms.length} room{rooms.length!==1?"s":""})</span>}
            </div>
            <button onClick={pushToLedger} disabled={!totalCost} style={{background:totalCost?"var(--success-fg)":"var(--border)",color:"#fff",border:"none",borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:totalCost?"pointer":"not-allowed"}}>↑ Add to Ledger</button>
          </div>
        </div>
      )}
    </div>
  );
}
