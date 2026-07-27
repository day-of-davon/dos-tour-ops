import { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { AIRPORT_BUFFERS, airportBufferMin, segMeta, segType } from "../../lib/segments";
import { subtractMinutes } from "../../lib/time";
import { T } from "../../styles/tokens";
import { PaxEditor } from "./PaxEditor";

export function SegmentDrawer({seg,crew,sorted,onChange,onClose}){
  const{flights}=useContext(Ctx);
  const t=segType(seg);const m=segMeta(seg);
  const[hasBag,setHasBag]=useState(seg.hasBag!==false);
  // Pickup-time suggestion when a ground transfer ends at a known airport. Finds the
  // matching outbound flight (same-day, same dep airport, pax overlap) and computes
  // when this ground segment should arrive at the airport: flight.dep - airport buffer.
  const suggestion=useMemo(()=>{
    if(t!=="ground"||!seg.to||!seg.depDate)return null;
    const toIata=String(seg.to).toUpperCase();
    if(!AIRPORT_BUFFERS[toIata])return null;
    const buffer=airportBufferMin(toIata,hasBag);
    const paxSet=new Set((seg.pax||[]).map(n=>String(n||"").toLowerCase()));
    const sameDay=Object.values(flights||{}).filter(f=>segType(f)==="air"&&f.status!=="dismissed"&&f.depDate===seg.depDate&&String(f.from||"").toUpperCase()===toIata);
    const match=sameDay.find(f=>{
      if(!paxSet.size)return true;
      return(f.pax||[]).some(n=>paxSet.has(String(n||"").toLowerCase()));
    });
    if(!match||!match.dep)return{buffer,airport:toIata,match:null,arriveBy:null};
    return{buffer,airport:toIata,match,arriveBy:subtractMinutes(match.dep,buffer)};
  },[t,seg.to,seg.depDate,seg.pax,hasBag,flights]);

  const setField=(k,v)=>onChange({[k]:v});
  const inp={background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,fontSize:11,padding:"5px 8px",outline:"none",fontFamily:"'Outfit',system-ui",width:"100%",boxSizing:"border-box"};
  const lab={fontSize:8,fontWeight:700,color:T.textDim,letterSpacing:"0.06em",marginBottom:3,textTransform:"uppercase"};
  const sub=(label,children)=>(<div style={{display:"flex",flexDirection:"column",gap:0,minWidth:0}}><div style={lab}>{label}</div>{children}</div>);

  return(
    <div style={{width:380,maxWidth:"100%",flexShrink:0,background:"var(--card)",border:`1px solid ${m.border}`,borderRadius:10,padding:12,display:"flex",flexDirection:"column",gap:10,alignSelf:"flex-start",position:"sticky",top:0}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:16}}>{m.icon}</span>
        <div style={{fontSize:13,fontWeight:800,color:m.color,letterSpacing:"-0.01em"}}>{m.label}</div>
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          {[["confirmed","Confirmed","var(--success-fg)","var(--success-bg)"],["pending","Pending","var(--warn-fg)","var(--warn-bg)"]].map(([v,l,c,bg])=>(
            <button key={v} onClick={()=>setField("status",v)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:700,background:seg.status===v?bg:"var(--card-3)",color:seg.status===v?c:"var(--text-dim)"}}>{l}</button>
          ))}
          <button onClick={onClose} title="Close" style={{background:"none",border:"none",cursor:"pointer",color:T.textDim,fontSize:16,lineHeight:1}}>×</button>
        </div>
      </div>

      {/* Type-specific identity row */}
      {t==="air"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {sub("Flight #",<input value={seg.flightNo||""} onChange={e=>setField("flightNo",e.target.value)} placeholder="AC601" style={{...inp,fontFamily:MN}}/>)}
          {sub("Carrier",<input value={seg.carrier||""} onChange={e=>setField("carrier",e.target.value)} placeholder="Air Canada" style={inp}/>)}
        </div>
      )}
      {t==="ground"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {sub("Mode",<select value={seg.mode||"uber"} onChange={e=>setField("mode",e.target.value)} style={inp}>{["uber","lyft","drive","taxi","rideshare","friend","shuttle"].map(m=><option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}</select>)}
          {sub("Provider / Driver",<input value={seg.provider||""} onChange={e=>setField("provider",e.target.value)} placeholder="e.g. Guillaume, Uber Black" style={inp}/>)}
        </div>
      )}
      {(t==="bus"||t==="rail"||t==="sea")&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {sub(t==="rail"?"Train #":"Operator",<input value={seg.flightNo||seg.carrier||""} onChange={e=>setField(t==="rail"?"flightNo":"carrier",e.target.value)} placeholder={t==="rail"?"Eurostar 9137":"Pieter Smit"} style={inp}/>)}
          {sub("Confirmation",<input value={seg.confirmNo||""} onChange={e=>setField("confirmNo",e.target.value)} style={{...inp,fontFamily:MN}}/>)}
        </div>
      )}
      {t==="hotel"&&(
        <div>
          {sub("Hotel",<input value={seg.hotelName||""} onChange={e=>setField("hotelName",e.target.value)} placeholder="Hotel name" style={inp}/>)}
        </div>
      )}

      {/* Route */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {sub(t==="hotel"?"Address":"From",<input value={seg.from||""} onChange={e=>setField("from",e.target.value)} placeholder={t==="air"?"DUB":t==="ground"?"Hotel Name / Address":"Origin"} style={inp}/>)}
        {t!=="hotel"&&sub("To",<input value={seg.to||""} onChange={e=>setField("to",e.target.value)} placeholder={t==="air"?"AMS":"Venue / Airport"} style={inp}/>)}
      </div>
      {(t==="air"||t==="ground"||t==="bus"||t==="rail"||t==="sea")&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {sub("From City",<input value={seg.fromCity||""} onChange={e=>setField("fromCity",e.target.value)} placeholder="Dublin" style={inp}/>)}
          {sub("To City",<input value={seg.toCity||""} onChange={e=>setField("toCity",e.target.value)} placeholder="Amsterdam" style={inp}/>)}
        </div>
      )}

      {/* Times */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
        {sub("Dep Date",<input type="date" value={seg.depDate||""} onChange={e=>setField("depDate",e.target.value)} style={{...inp,fontFamily:MN}}/>)}
        {sub("Dep Time",<input type="time" value={seg.dep||""} onChange={e=>setField("dep",e.target.value)} style={{...inp,fontFamily:MN}}/>)}
        {sub("Arr Date",<input type="date" value={seg.arrDate||""} onChange={e=>setField("arrDate",e.target.value)} style={{...inp,fontFamily:MN}}/>)}
        {sub("Arr Time",<input type="time" value={seg.arr||""} onChange={e=>setField("arr",e.target.value)} style={{...inp,fontFamily:MN}}/>)}
      </div>

      {/* Ground → airport pickup suggestion */}
      {suggestion&&(
        <div style={{background:"var(--warn-bg)",border:"1px solid var(--warn-bg)",borderRadius:6,padding:"8px 10px",fontSize:10}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontSize:9,fontWeight:800,color:T.warnFg,letterSpacing:"0.06em"}}>AIRPORT PICKUP</span>
            <span style={{marginLeft:"auto",display:"flex",gap:2,background:"var(--card)",padding:2,borderRadius:6}}>
              {[[true,"With bag"],[false,"Carry-on"]].map(([v,l])=>(
                <button key={String(v)} onClick={()=>setHasBag(v)} style={{fontSize:8,padding:"2px 7px",borderRadius:4,border:"none",background:hasBag===v?"var(--warn-fg)":"transparent",color:hasBag===v?"var(--card)":"var(--warn-fg)",cursor:"pointer",fontWeight:700}}>{l}</button>
              ))}
            </span>
          </div>
          {suggestion.match?(
            <>
              <div style={{color:T.warnFg}}>
                Matched outbound <strong style={{fontFamily:MN}}>{suggestion.match.flightNo||suggestion.match.carrier}</strong> departing <strong style={{fontFamily:MN}}>{suggestion.airport}</strong> at <strong style={{fontFamily:MN}}>{suggestion.match.dep}</strong>. Arrive airport by <strong style={{fontFamily:MN,fontSize:11}}>{suggestion.arriveBy}</strong> ({suggestion.buffer} min buffer).
              </div>
              <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                <button onClick={()=>{setField("arr",suggestion.arriveBy?.replace("*",""));if(!seg.arrDate)setField("arrDate",seg.depDate);}} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",background:"var(--warn-fg)",color:"#fff",cursor:"pointer",fontWeight:700}}>Set arrival = {suggestion.arriveBy}</button>
                {(seg.pax||[]).length===0&&suggestion.match.pax?.length>0&&<button onClick={()=>setField("pax",suggestion.match.pax)} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--warn-bg)",background:"var(--card)",color:T.warnFg,cursor:"pointer",fontWeight:700}}>Copy pax from flight ({suggestion.match.pax.length})</button>}
              </div>
            </>
          ):(
            <div style={{color:T.warnFg}}>
              {suggestion.airport} buffer: <strong>{suggestion.buffer} min</strong> before scheduled dep. No matching outbound flight found in the travel day — set pax, or add the flight first.
            </div>
          )}
          <div style={{marginTop:4,fontSize:9,color:T.warnFg,fontStyle:"italic"}}>Override manually if local traffic or pickup window differs.</div>
        </div>
      )}

      {/* Pax */}
      <div>
        <div style={lab}>Passengers</div>
        <PaxEditor pax={seg.pax||[]} crew={crew} onSave={newPax=>setField("pax",(newPax||[]).map(s=>String(s||"").trim()).filter(Boolean))}/>
      </div>

      {/* Codes: PNR / Ticket# / Cost */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {sub("PNR",<input value={seg.pnr||""} onChange={e=>setField("pnr",e.target.value)} placeholder="F9OCAU" style={{...inp,fontFamily:MN}}/>)}
        {sub("Ticket # (e-ticket)",<input value={seg.ticketNo||""} onChange={e=>setField("ticketNo",e.target.value)} placeholder="001-1234567890" style={{...inp,fontFamily:MN}}/>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {sub("Cost",<input type="number" value={seg.cost||""} onChange={e=>setField("cost",Number(e.target.value)||"")} placeholder="0.00" style={inp}/>)}
      </div>
      {sub("Notes",<textarea value={seg.notes||""} onChange={e=>setField("notes",e.target.value)} rows={2} placeholder="Dispatch instructions, pickup location, etc." style={{...inp,resize:"vertical",minHeight:50}}/>)}
    </div>
  );
}
