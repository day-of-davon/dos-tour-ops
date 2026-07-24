import { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { HOTEL_TODOS_DEFAULT } from "../../lib/constants";
import { MN } from "../../lib/domain-constants";
import { fD } from "../../lib/time";
import { supabase } from "../../lib/supabase";
import { T } from "../../styles/tokens";

export function LodgingAllShows(){
  const{lodging,uLodging,finance,uFin,sorted,setSel,setTab,setAllShows,mobile,aC,tourStart,tourEnd}=useContext(Ctx);
  const[scanning,setScanning]=useState(false);
  const[scanMsg,setScanMsg]=useState("");
  const[pendingImport,setPendingImport]=useState([]);

  // Hotel Gmail scan sweeps the whole inbox (not show-specific), so it belongs in
  // the All Shows view too. Mirrors LodgingTab's scanLodging/importHotel.
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
      uFin(dateKey,{ledgerEntries:[...existing,{id:`lodging_${h.id}`,date:dateKey,vendor:h.name||"Hotel",amount:parseFloat(h.cost),currency:h.currency||"USD",category:"Hotel",description:h.checkOut?`${h.checkIn}–${h.checkOut} · ${h.name||"Hotel"}`:h.name||"Hotel",source:"lodging",hotelId:h.id,receiptPath:h.receiptPath||""}]});
    }
  };
  const importAll=()=>{pendingImport.forEach(h=>importHotel(h));};

  const hotels=useMemo(()=>Object.values(lodging||{}).sort((a,b)=>(a.checkIn||"").localeCompare(b.checkIn||"")),[lodging]);
  const upcomingShows=(sorted||[]).filter(s=>s.clientId===aC&&s.type==="show");
  const totalCost=hotels.reduce((sum,h)=>sum+(parseFloat(h.cost)||0),0);
  const totalRooms=hotels.reduce((sum,h)=>sum+((h.rooms||[]).length||0),0);
  const showsCovered=new Set();
  hotels.forEach(h=>{upcomingShows.forEach(s=>{if(h.checkIn<=s.date&&h.checkOut>=s.date)showsCovered.add(s.date);});});
  const goToShow=date=>{setSel(date);setAllShows(false);setTab("lodging");};
  return(
    <div className="fi" style={{padding:mobile?"10px 8px 24px":"14px 20px 30px",flex:1,overflowY:"auto",minHeight:0}}>
      {/* Scan toolbar — Gmail hotel scan is tour-wide, so it lives in All Shows too */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:800,color:T.text,letterSpacing:"-0.02em"}}>Lodging · All Shows</div>
        <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {scanMsg&&<span style={{fontSize:9,color:scanning?"var(--accent)":"var(--text-dim)",fontFamily:MN,maxWidth:220}}>{scanMsg}</span>}
          <button onClick={()=>scanLodging({sweepFrom:"2026-01-01"})} disabled={scanning} style={{background:scanning?"var(--border)":"var(--accent-soft)",color:scanning?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:scanning?"default":"pointer"}}>{scanning?"Scanning…":"Historical Sweep"}</button>
          <button onClick={()=>scanLodging()} disabled={scanning} style={{background:scanning?"var(--border)":"var(--accent)",color:scanning?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:scanning?"default":"pointer"}}>{scanning?"Scanning…":"Scan Gmail"}</button>
        </div>
      </div>
      {pendingImport.length>0&&(
        <div style={{background:"var(--accent-pill-bg)",border:"1px solid var(--accent-pill-border)",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:9,fontWeight:800,color:T.accent,letterSpacing:"0.06em"}}>NEW HOTELS — REVIEW BEFORE IMPORTING</span>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setPendingImport([])} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer",fontWeight:700}}>Dismiss</button>
              <button onClick={importAll} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import All ({pendingImport.length})</button>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {pendingImport.map(h=>(
              <div key={h.id} style={{background:"var(--card)",borderRadius:8,padding:"8px 10px",border:"1px solid var(--accent-pill-bg)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div style={{minWidth:0,flex:1}}>
                  <span style={{fontSize:11,fontWeight:700,color:T.text}}>{h.name}</span>
                  {h.city&&<span style={{fontSize:10,color:T.textDim,marginLeft:6}}>{h.city}</span>}
                  <div style={{fontSize:9,color:T.text2,fontFamily:MN,marginTop:2}}>{h.checkIn} → {h.checkOut}{h.confirmNo&&<span style={{marginLeft:8,color:"var(--accent-soft)"}}>#{h.confirmNo}</span>}{h.cost?<span style={{marginLeft:8}}>{h.currency||"USD"} {Number(h.cost).toLocaleString()}</span>:null}</div>
                </div>
                {h.tid&&<a href={`https://mail.google.com/mail/u/0/#inbox/${h.tid}`} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:T.accent,textDecoration:"none"}}>email ↗</a>}
                <button onClick={()=>setPendingImport(p=>p.filter(x=>x.id!==h.id))} style={{fontSize:9,padding:"2px 8px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>Skip</button>
                <button onClick={()=>importHotel(h)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:14}}>
        {[["Hotels",hotels.length,"booked"],["Rooms",totalRooms,"total"],["Shows Covered",`${showsCovered.size}/${upcomingShows.length}`,""],["Total Cost",`$${totalCost.toLocaleString(undefined,{maximumFractionDigits:0})}`,""]].map(([l,v,s])=>(
          <div key={l} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:9,color:T.textDim,marginBottom:2,fontWeight:600}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,color:"var(--text)",fontFamily:MN}}>{v}</div>
            {s&&<div style={{fontSize:9,color:T.textMute,fontFamily:MN,marginTop:1}}>{s}</div>}
          </div>
        ))}
      </div>
      <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.1em",marginBottom:6}}>ALL HOTELS</div>
      {!hotels.length&&<div style={{padding:"40px 0",textAlign:"center",color:T.textDim,fontSize:11}}>No hotels yet. Open a specific show to add hotels.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {hotels.map(h=>{
          const nights=h.checkIn&&h.checkOut?Math.max(1,Math.round((new Date(h.checkOut)-new Date(h.checkIn))/86400000)):1;
          const coveredShows=upcomingShows.filter(s=>h.checkIn<=s.date&&h.checkOut>=s.date);
          return(
            <div key={h.id} className="rh" onClick={()=>goToShow(h.checkIn)} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 90px 60px",gap:8,alignItems:"center",padding:"9px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,cursor:"pointer"}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{h.name||"—"}</div>
                <div style={{fontSize:9,color:T.textDim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{h.city||""}{h.address?` · ${h.address}`:""}</div>
                {coveredShows.length>0&&<div style={{fontSize:9,color:T.accent,fontFamily:MN,marginTop:2}}>{coveredShows.map(s=>s.city).join(" · ")}</div>}
              </div>
              <div style={{fontSize:10,fontFamily:MN,color:T.text2}}>{h.checkIn?fD(h.checkIn):"—"}<span style={{color:T.textMute}}> → </span>{h.checkOut?fD(h.checkOut):"—"}</div>
              <div style={{fontSize:9,fontFamily:MN,color:T.textDim,textAlign:"right"}}>{nights}n · {(h.rooms||[]).length}rm</div>
              <div style={{fontSize:10,fontFamily:MN,color:T.text2,textAlign:"right"}}>{h.cost?`$${Number(h.cost).toLocaleString()}`:"—"}{h.currency&&h.currency!=="USD"?` ${h.currency}`:""}</div>
              <div style={{fontSize:8,padding:"2px 6px",borderRadius:99,background:h.status==="confirmed"?"var(--success-bg)":h.status==="pending"?"var(--warn-bg)":"var(--card-2)",color:h.status==="confirmed"?T.successFg:h.status==="pending"?T.warnFg:T.textMute,fontWeight:700,textAlign:"center",textTransform:"uppercase"}}>{h.status||"—"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
