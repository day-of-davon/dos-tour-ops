import { useState } from "react";
import { HOTEL_DEFAULT_CHECKIN, HOTEL_DEFAULT_CHECKOUT, HOTEL_TODOS_DEFAULT } from "../../lib/constants";
import { MN } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";
import { HOTEL_STATUS_META } from "../../lib/lodging";

export function HotelFormModal({date,hotel,onClose,onSave,existingHotels}){
  const isEdit=!!hotel;
  const[form,setForm]=useState(hotel||{id:newHotelIdFn(),name:"",address:"",city:"",phone:"",stars:"",checkIn:date,checkOut:date,checkInTime:HOTEL_DEFAULT_CHECKIN,checkOutTime:HOTEL_DEFAULT_CHECKOUT,confirmNo:"",bookingRef:"",status:"pending",currency:"USD",notes:"",rooms:[],todos:HOTEL_TODOS_DEFAULT.map(t=>({text:t,done:false}))});
  function newHotelIdFn(){return`hotel_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;}
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:80,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"var(--card)",borderRadius:10,padding:"20px 22px",width:"100%",maxWidth:460,boxShadow:"0 24px 64px rgba(0,0,0,.18)",display:"flex",flexDirection:"column",gap:12,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontWeight:800,fontSize:13,color:T.text}}>{isEdit?"Edit Hotel":"Add Hotel"}</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:T.textMute}}>×</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 10px"}}>
          {[["name","Hotel Name","full"],["address","Address","full"],["city","City","half"],["phone","Phone","half"],["confirmNo","Confirmation #","half"],["bookingRef","Booking Ref","half"],["checkIn","Check-in Date","half"],["checkOut","Check-out Date","half"],["checkInTime","Check-in Time","half"],["checkOutTime","Check-out Time","half"]].map(([k,lbl,span])=>(
            <div key={k} style={{gridColumn:span==="full"?"1/-1":"auto"}}>
              <div style={{fontSize:9,fontWeight:700,color:T.textDim,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>{lbl}</div>
              <input value={form[k]||""} onChange={e=>f(k,e.target.value)} type={k.includes("Date")?"date":k.includes("Time")?"time":"text"} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:11,fontFamily:k==="confirmNo"||k==="bookingRef"?MN:"inherit"}}/>
            </div>
          ))}
          <div>
            <div style={{fontSize:9,fontWeight:700,color:T.textDim,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Stars</div>
            <select value={form.stars||""} onChange={e=>f("stars",e.target.value?parseInt(e.target.value):"")} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:11}}>
              <option value="">–</option>
              {[1,2,3,4,5].map(n=><option key={n} value={n}>{"★".repeat(n)}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:T.textDim,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Status</div>
            <select value={form.status||"pending"} onChange={e=>f("status",e.target.value)} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:11}}>
              {Object.entries(HOTEL_STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:T.textDim,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Currency</div>
            <select value={form.currency||"USD"} onChange={e=>f("currency",e.target.value)} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:11}}>
              {["USD","EUR","GBP","CAD","AUD","PLN","CZK","SEK","NOK","DKK"].map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div style={{fontSize:9,fontWeight:700,color:T.textDim,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Notes</div>
          <textarea value={form.notes||""} onChange={e=>f("notes",e.target.value)} rows={2} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:11,resize:"vertical"}}/>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"var(--card-2)",border:"none",borderRadius:6,padding:"7px 14px",fontSize:11,cursor:"pointer",color:T.text2}}>Cancel</button>
          <button onClick={()=>onSave(form)} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"7px 16px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{isEdit?"Save Changes":"Add Hotel"}</button>
        </div>
      </div>
    </div>
  );
}
