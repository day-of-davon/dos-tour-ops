import { useCallback, useContext, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { HOTEL_TODOS_DEFAULT } from "../../lib/constants";
import { MN } from "../../lib/domain-constants";
import { supabase } from "../../lib/supabase";
import { T } from "../../styles/tokens";
import { HotelCard } from "./HotelCard";
import { HotelFormModal } from "./HotelFormModal";
import { LodgingAllShows } from "./LodgingAllShows";

export function LodgingTab(){
  const{lodging,uLodging,crew,showCrew,finance,uFin,tourDaysSorted,mobile,sel,setSel,tourStart,tourEnd,allShows}=useContext(Ctx);
  if(allShows)return<LodgingAllShows/>;
  const[addOpen,setAddOpen]=useState(false);
  const[editId,setEditId]=useState(null);
  const[scanning,setScanning]=useState(false);
  const[scanMsg,setScanMsg]=useState("");
  const[pendingImport,setPendingImport]=useState([]);

  // Hotels on a given date: those whose checkIn <= date <= checkOut
  const hotelsForDate=useCallback((date)=>{
    return Object.values(lodging).filter(h=>h.checkIn<=date&&h.checkOut>=date);
  },[lodging]);

  // Badge count per day: distinct hotels covering that date
  const badgeCount=useCallback((date)=>hotelsForDate(date).length,[hotelsForDate]);

  const dayHotels=hotelsForDate(sel);

  function newHotelId(){return`hotel_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;}

  const scanLodging=async(opts={})=>{
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const googleToken=session.provider_token;
      if(!googleToken){setScanMsg("Gmail access not available — re-login with Google.");return;}
      if(opts.reset){setPendingImport([]);}
      setScanning(true);setScanMsg(opts.sweepFrom?"Historical sweep in progress…":"Scanning Gmail for hotel confirmations…");
      const resp=await fetch("/api/lodging-scan",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken,tourStart,tourEnd,sweepFrom:opts.sweepFrom||null})});
      if(resp.status===402){setScanMsg("Gmail session expired — please re-login.");setScanning(false);return;}
      if(!resp.ok){setScanMsg(`Scan error ${resp.status} — try again.`);setScanning(false);return;}
      const data=await resp.json();
      if(data.error){setScanMsg(`Error: ${data.error}`);setScanning(false);return;}
      const newLodgings=data.lodgings||[];
      const existingKeys=new Set(Object.values(lodging).map(h=>`${h.name}__${h.checkIn}`));
      const novel=newLodgings.filter(h=>!lodging[h.id]&&!existingKeys.has(`${h.name}__${h.checkIn}`));
      if(!novel.length){setScanMsg(`Scanned ${data.threadsFound} threads — no new hotels found.`);setScanning(false);return;}
      setPendingImport(novel);
      setScanMsg(`Found ${novel.length} new hotel${novel.length>1?"s":""} in ${data.threadsFound} threads.`);
    }catch(e){setScanMsg(`Scan failed: ${e.message}`);}
    setScanning(false);
  };

  const importHotel=h=>{
    uLodging(h.id,{...h,status:"pending",rooms:h.rooms||[],todos:HOTEL_TODOS_DEFAULT.map(t=>({text:t,done:false}))});
    setPendingImport(p=>p.filter(x=>x.id!==h.id));
    if(h.cost&&h.cost>0&&h.checkIn){
      const dateKey=h.checkIn;
      const existing=(finance[dateKey]?.ledgerEntries||[]).filter(e=>e.hotelId!==h.id);
      uFin(dateKey,{ledgerEntries:[...existing,{id:`lodging_${h.id}`,date:dateKey,vendor:h.name||"Hotel",amount:parseFloat(h.cost),currency:h.currency||"USD",category:"Hotel",description:h.checkOut?`${h.checkIn}–${h.checkOut} · ${h.name||"Hotel"}`:h.name||"Hotel",source:"lodging",hotelId:h.id}]});
    }
  };
  const importAll=()=>{pendingImport.forEach(h=>importHotel(h));};

  return(
    <div style={{display:"flex",flex:1,minHeight:0,height:"100%",background:"var(--bg)"}}>
      {/* Main content */}
      <div style={{flex:1,overflowY:"auto",padding:mobile?"10px 8px":"14px 16px",display:"flex",flexDirection:"column",gap:14,minWidth:0}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:T.text,letterSpacing:"-0.02em"}}>
              {sel?new Date(sel+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}):"Lodging"}
            </div>
            <div style={{fontSize:10,color:T.textDim,marginTop:1}}>{dayHotels.length} hotel{dayHotels.length!==1?"s":""} covering this date</div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            {scanMsg&&<span style={{fontSize:9,color:scanning?"var(--accent)":"var(--text-dim)",fontFamily:MN,maxWidth:200}}>{scanMsg}</span>}
            <button onClick={()=>scanLodging({sweepFrom:"2026-01-01"})} disabled={scanning} style={{background:scanning?"var(--border)":"var(--accent-soft)",color:scanning?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:scanning?"default":"pointer"}}>
              {scanning?"Scanning…":"Historical Sweep"}
            </button>
            <button onClick={()=>scanLodging()} disabled={scanning} style={{background:scanning?"var(--border)":"var(--accent)",color:scanning?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:scanning?"default":"pointer"}}>
              {scanning?"Scanning…":"Scan Gmail"}
            </button>
            <button onClick={()=>setAddOpen(true)} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              + Add Hotel
            </button>
          </div>
        </div>

        {/* Pending import (just scanned, not yet in state) */}
        {pendingImport.length>0&&(
          <div style={{background:"var(--accent-pill-bg)",border:"1px solid var(--accent-pill-border)",borderRadius:10,padding:"10px 12px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:9,fontWeight:800,color:T.accent,letterSpacing:"0.06em"}}>NEW HOTELS — REVIEW BEFORE IMPORTING</span>
              <button onClick={importAll} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import All ({pendingImport.length})</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {pendingImport.map(h=>(
                <div key={h.id} style={{background:"var(--card)",borderRadius:10,padding:"10px 12px",border:"1px solid var(--accent-pill-bg)",display:"flex",flexDirection:"column",gap:4}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
                    <div>
                      <span style={{fontSize:11,fontWeight:700,color:T.text}}>{h.name}</span>
                      {h.city&&<span style={{fontSize:10,color:T.textDim,marginLeft:6}}>{h.city}</span>}
                    </div>
                    <div style={{display:"flex",gap:5,alignItems:"center"}}>
                      {h.tid&&<a href={`https://mail.google.com/mail/u/0/#inbox/${h.tid}`} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:T.accent,textDecoration:"none"}}>open email ↗</a>}
                      <button onClick={()=>setPendingImport(p=>p.filter(x=>x.id!==h.id))} style={{fontSize:9,padding:"2px 8px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>Skip</button>
                      <button onClick={()=>importHotel(h)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import</button>
                    </div>
                  </div>
                  <div style={{fontSize:10,color:T.text2,fontFamily:MN}}>
                    {h.checkIn} → {h.checkOut}
                    {h.confirmNo&&<span style={{marginLeft:8,color:"var(--accent-soft)"}}>#{h.confirmNo}</span>}
                    {h.cost&&<span style={{marginLeft:8}}>{h.currency||"USD"} {h.cost.toLocaleString()}</span>}
                    {h.pax?.length>0&&<span style={{marginLeft:8,color:T.textDim}}>{h.pax.join(", ")}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {dayHotels.length===0&&(
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"28px 20px",textAlign:"center",color:T.textMute,fontSize:11}}>
            No hotels assigned to this date.<br/>
            <span style={{color:T.accent,cursor:"pointer",fontWeight:600}} onClick={()=>setAddOpen(true)}>+ Add a hotel</span>
          </div>
        )}

        {dayHotels.map(hotel=>(
          <HotelCard key={hotel.id} hotel={hotel} date={sel} onEdit={()=>setEditId(hotel.id)} crew={crew} uLodging={uLodging} uFin={uFin} finance={finance}/>
        ))}
      </div>

      {addOpen&&<HotelFormModal date={sel} onClose={()=>setAddOpen(false)} onSave={(h)=>{uLodging(h.id,h);setAddOpen(false);}} existingHotels={lodging}/>}
      {editId&&<HotelFormModal date={sel} hotel={lodging[editId]} onClose={()=>setEditId(null)} onSave={(h)=>{uLodging(h.id,h);setEditId(null);}} existingHotels={lodging}/>}
    </div>
  );
}
