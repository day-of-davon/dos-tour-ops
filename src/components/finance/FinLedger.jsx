import { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { FIN_EVENT_TYPES, MN } from "../../lib/domain-constants";
import { fD } from "../../lib/time";
import { T } from "../../styles/tokens";
import { LEDGER_EDITABLE, EXPENSE_CATS } from "../../lib/finance";
import { supabase } from "../../lib/supabase";

export function FinLedger(){
  const{shows,finance,flights,lodging,uLodging,uFin,uFlight,setUploadOpen,tourStart,tourEnd}=useContext(Ctx);
  const[filterCat,setFilterCat]=useState("all");
  const[filterCur,setFilterCur]=useState("all");
  const[sortCol,setSortCol]=useState("date");
  const[sortDir,setSortDir]=useState(1);
  const[ec,setEc]=useState(null);
  const[eVal,setEVal]=useState("");
  // Rideshare Gmail scan → review → import into ledgerEntries (category Transport).
  const[scanning,setScanning]=useState(false);
  const[scanMsg,setScanMsg]=useState("");
  const[pendingRides,setPendingRides]=useState([]);
  const[pendingCars,setPendingCars]=useState([]);
  const[pendingMeals,setPendingMeals]=useState([]);

  const scanRides=async(opts={})=>{
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const googleToken=session.provider_token;
      if(!googleToken){setScanMsg("Gmail access not available — re-login with Google.");return;}
      setScanning(true);setScanMsg(opts.sweepFrom?"Historical sweep in progress…":"Scanning Gmail for rideshare receipts…");
      const resp=await fetch("/api/rideshare-scan",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken,tourStart,tourEnd,sweepFrom:opts.sweepFrom||null})});
      if(resp.status===402){setScanMsg("Gmail session expired — please re-login.");setScanning(false);return;}
      if(!resp.ok){setScanMsg(`Scan error ${resp.status} — try again.`);setScanning(false);return;}
      const data=await resp.json();
      if(data.error){setScanMsg(`Error: ${data.error}`);setScanning(false);return;}
      const rides=data.rides||[];
      // Skip rides already represented in the ledger (same date+amount+currency).
      const existingKeys=new Set();
      Object.entries(finance).forEach(([d,fin])=>(fin?.ledgerEntries||[]).forEach(le=>existingKeys.add(`${le.date||d}|${parseFloat(le.amount)||0}|${le.currency||"USD"}`)));
      const novel=rides.filter(r=>!existingKeys.has(`${r.date}|${r.amount}|${r.currency}`));
      if(!novel.length){setScanMsg(`Scanned ${data.threadsFound} threads — no new rides found.`);setScanning(false);return;}
      setPendingRides(novel);
      setScanMsg(`Found ${novel.length} new ride${novel.length>1?"s":""} in ${data.threadsFound} threads.`);
    }catch(e){setScanMsg(`Scan failed: ${e.message}`);}
    setScanning(false);
  };

  const importRide=r=>{
    const date=r.date;
    const existing=finance[date]?.ledgerEntries||[];
    const route=[r.pickup,r.dropoff].filter(Boolean).join(" → ");
    uFin(date,{ledgerEntries:[...existing,{
      id:r.id||`ride_${date}_${Math.round(r.amount*100)}`,
      date,vendor:r.service||"Rideshare",amount:parseFloat(r.amount),currency:r.currency||"USD",
      category:"Transport",description:route||r.rideType||r.service||"Ride",
      source:"rideshare",payee:(r.pax||[]).join(", "),ref:r.confirmNo||"",tid:r.tid||"",
    }]});
    setPendingRides(p=>p.filter(x=>x.id!==r.id));
  };
  const importAllRides=()=>pendingRides.forEach(importRide);

  const scanCars=async(opts={})=>{
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const googleToken=session.provider_token;
      if(!googleToken){setScanMsg("Gmail access not available — re-login with Google.");return;}
      setScanning(true);setScanMsg(opts.sweepFrom?"Historical sweep in progress…":"Scanning Gmail for car rentals…");
      const resp=await fetch("/api/car-rental-scan",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken,tourStart,tourEnd,sweepFrom:opts.sweepFrom||null})});
      if(resp.status===402){setScanMsg("Gmail session expired — please re-login.");setScanning(false);return;}
      if(!resp.ok){setScanMsg(`Scan error ${resp.status} — try again.`);setScanning(false);return;}
      const data=await resp.json();
      if(data.error){setScanMsg(`Error: ${data.error}`);setScanning(false);return;}
      const rentals=data.rentals||[];
      const existingKeys=new Set();
      Object.entries(finance).forEach(([d,fin])=>(fin?.ledgerEntries||[]).forEach(le=>existingKeys.add(`${le.date||d}|${parseFloat(le.amount)||0}|${le.currency||"USD"}`)));
      const novel=rentals.filter(r=>!existingKeys.has(`${r.pickupDate}|${r.amount}|${r.currency}`));
      if(!novel.length){setScanMsg(`Scanned ${data.threadsFound} threads — no new rentals found.`);setScanning(false);return;}
      setPendingCars(novel);
      setScanMsg(`Found ${novel.length} new rental${novel.length>1?"s":""} in ${data.threadsFound} threads.`);
    }catch(e){setScanMsg(`Scan failed: ${e.message}`);}
    setScanning(false);
  };
  const importCar=r=>{
    const date=r.pickupDate;
    const existing=finance[date]?.ledgerEntries||[];
    const route=[r.pickupLocation,r.dropoffLocation].filter(Boolean).join(" → ");
    const desc=[route,r.vehicle].filter(Boolean).join(" · ")||r.company||"Car rental";
    uFin(date,{ledgerEntries:[...existing,{
      id:r.id||`car_${date}_${Math.round(r.amount*100)}`,
      date,vendor:r.company||"Car Rental",amount:parseFloat(r.amount),currency:r.currency||"USD",
      category:"Car Rental",description:desc,
      source:"car-rental",payee:(r.pax||[]).join(", "),ref:r.confirmNo||"",tid:r.tid||"",
    }]});
    setPendingCars(p=>p.filter(x=>x.id!==r.id));
  };
  const importAllCars=()=>pendingCars.forEach(importCar);

  const scanFood=async(opts={})=>{
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const googleToken=session.provider_token;
      if(!googleToken){setScanMsg("Gmail access not available — re-login with Google.");return;}
      setScanning(true);setScanMsg(opts.sweepFrom?"Historical sweep in progress…":"Scanning Gmail for food delivery…");
      const resp=await fetch("/api/food-scan",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken,tourStart,tourEnd,sweepFrom:opts.sweepFrom||null})});
      if(resp.status===402){setScanMsg("Gmail session expired — please re-login.");setScanning(false);return;}
      if(!resp.ok){setScanMsg(`Scan error ${resp.status} — try again.`);setScanning(false);return;}
      const data=await resp.json();
      if(data.error){setScanMsg(`Error: ${data.error}`);setScanning(false);return;}
      const meals=data.meals||[];
      const existingKeys=new Set();
      Object.entries(finance).forEach(([d,fin])=>(fin?.ledgerEntries||[]).forEach(le=>existingKeys.add(`${le.date||d}|${parseFloat(le.amount)||0}|${le.currency||"USD"}`)));
      const novel=meals.filter(r=>!existingKeys.has(`${r.date}|${r.amount}|${r.currency}`));
      if(!novel.length){setScanMsg(`Scanned ${data.threadsFound} threads — no new orders found.`);setScanning(false);return;}
      setPendingMeals(novel);
      setScanMsg(`Found ${novel.length} new order${novel.length>1?"s":""} in ${data.threadsFound} threads.`);
    }catch(e){setScanMsg(`Scan failed: ${e.message}`);}
    setScanning(false);
  };
  const importMeal=r=>{
    const date=r.date;
    const existing=finance[date]?.ledgerEntries||[];
    const desc=[r.vendor,r.items].filter(Boolean).join(" · ")||r.service||"Food order";
    uFin(date,{ledgerEntries:[...existing,{
      id:r.id||`meal_${date}_${Math.round(r.amount*100)}`,
      date,vendor:r.vendor||r.service||"Food Delivery",amount:parseFloat(r.amount),currency:r.currency||"USD",
      category:"Meals",description:desc,
      source:"food",payee:(r.pax||[]).join(", "),ref:r.confirmNo||"",tid:r.tid||"",
    }]});
    setPendingMeals(p=>p.filter(x=>x.id!==r.id));
  };
  const importAllMeals=()=>pendingMeals.forEach(importMeal);

  const openReceipt=async path=>{
    if(!path)return;
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const resp=await fetch("/api/receipt-url",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({path})});
      const data=await resp.json();
      if(data.url)window.open(data.url,"_blank","noopener");
    }catch{/* receipt view is best-effort */}
  };

  const rows=useMemo(()=>{
    const out=[];
    const confirmedFlightIds=new Set(
      Object.values(flights||{}).filter(f=>f.status==="confirmed").map(f=>f.id)
    );
    Object.entries(finance).forEach(([date,fin])=>{
      if(!fin)return;
      const show=shows[date];
      const showLabel=show?`${show.city||""} — ${show.venue||""}`.replace(/^ — |—\s*$/,"").trim():fD(date);
      (fin.flightExpenses||[]).forEach(fe=>{
        if(confirmedFlightIds.has(fe.flightId))return;
        if(!fe.amount&&fe.amount!==0)return;
        out.push({id:fe.flightId||`fe_${date}_${Math.random()}`,date,show:showLabel,cat:"Flight",desc:fe.label||"",payee:(fe.pax||[]).join(", ")||"—",amount:parseFloat(fe.amount||0),currency:fe.currency||"USD",status:"confirmed",ref:fe.carrier||"",payMethod:fe.payMethod||"",bookedDate:fe.bookedDate||"",paidDate:fe.paidDate||"",receiptPath:fe.receiptPath||"",_src:{type:"flightExpense",date,srcId:fe.flightId}});
      });
      (fin.payouts||[]).forEach(p=>{
        // Receipt-backed payouts (kind:"expense") surface their real category; crew payouts stay "Payout".
        const isExp=p.kind==="expense"&&EXPENSE_CATS.has(p.dept);
        const cat=isExp?p.dept:"Payout";
        const desc=isExp?(p.role||p.description||p.dept||""):`${p.dept||""}${p.role?` · ${p.role}`:""}`;
        out.push({id:p.id||`po_${date}_${Math.random()}`,date,show:showLabel,cat,desc,payee:p.name||"—",amount:parseFloat(p.amount||0),currency:p.currency||"USD",status:p.status||"pending",ref:p.method||"",payMethod:p.payMethod||p.method||"",bookedDate:p.bookedDate||"",paidDate:p.paidDate||"",receiptPath:p.receiptPath||"",_src:{type:"payout",date,srcId:p.id}});
      });
      (fin.ledgerEntries||[]).forEach(le=>{
        if(!le.amount&&le.amount!==0)return;
        // Hotels are derived live from `lodging` below; skip their snapshot entries
        // so manually-added/edited hotels aren't missed and costs never double-count.
        if(le.source==="lodging"||le.hotelId)return;
        const cat=EXPENSE_CATS.has(le.category)?le.category:"Hotel";
        out.push({id:le.id||`le_${date}_${Math.random()}`,date:le.date||date,show:showLabel,cat,desc:le.description||"",payee:le.vendor||"—",amount:parseFloat(le.amount||0),currency:le.currency||"USD",status:"confirmed",ref:le.source||"",payMethod:le.payMethod||"",bookedDate:le.bookedDate||le.checkIn||"",paidDate:le.paidDate||"",receiptPath:le.receiptPath||"",_src:{type:"ledgerEntry",date,srcId:le.id}});
      });
      const hasEventForLegacy=(fin.events||[]).some(e=>e.type==="settlement"||e.type==="wire");
      if(fin.settlementAmount&&parseFloat(fin.settlementAmount)>0&&!hasEventForLegacy){
        out.push({id:`sa_${date}`,date,show:showLabel,cat:"Settlement",desc:"Settlement payment",payee:"—",amount:parseFloat(fin.settlementAmount),currency:"USD",status:fin.stages?.payment_initiated?"confirmed":"pending",ref:fin.wireRef||"",payMethod:"",bookedDate:"",paidDate:fin.wireDate||"",_src:{type:"legacySettlement",date,srcId:null}});
      }
      (fin.events||[]).forEach(ev=>{
        if(!ev||!ev.amount)return;
        const cat=(FIN_EVENT_TYPES.find(t=>t.id===ev.type)?.l)||"Event";
        out.push({id:ev.id,date,show:showLabel,cat,desc:ev.note||cat,payee:"—",amount:parseFloat(ev.amount)||0,currency:ev.currency||"USD",status:ev.status||"pending",ref:ev.ref||"",payMethod:ev.payMethod||"",bookedDate:ev.expectedDate||"",paidDate:ev.actualDate||"",_src:{type:"event",date,srcId:ev.id}});
      });
    });
    Object.values(flights||{}).forEach(f=>{
      if(f.status!=="confirmed")return;
      const showDate=f.suggestedShowDate||f.depDate||"";
      const show=shows[showDate];
      const showLabel=show?`${show.city||""} — ${show.venue||""}`.replace(/^ — |—\s*$/,"").trim():f.depDate||"";
      out.push({id:f.id,date:f.depDate||"",show:showLabel,cat:"Flight",desc:`${f.flightNo||f.carrier||"Flight"} · ${f.fromCity||f.from||""} → ${f.toCity||f.to||""}`,payee:(f.pax||[]).join(", ")||"—",amount:f.cost!=null?parseFloat(f.cost):null,currency:f.currency||"USD",status:"confirmed",ref:f.carrier||f.flightNo||"",payMethod:f.payMethod||"",bookedDate:f.bookedDate||"",paidDate:f.paidDate||"",receiptPath:f.receiptPath||"",_src:{type:"confirmedFlight",date:f.depDate||"",srcId:f.id}});
    });
    // Hotels: derive every lodging expense directly from live `lodging` state so
    // manually-added or later-edited hotels appear (the snapshot ledgerEntries miss
    // those). Effective cost = booking cost, else sum of per-room costs.
    Object.values(lodging||{}).forEach(h=>{
      const roomSum=(h.rooms||[]).reduce((s,r)=>s+(parseFloat(r.cost)||0),0);
      const cost=(h.cost!=null&&!isNaN(parseFloat(h.cost)))?parseFloat(h.cost):roomSum;
      if(!cost)return;
      const date=h.checkIn||"";
      const show=shows[date];
      const showLabel=show?`${show.city||""} — ${show.venue||""}`.replace(/^ — |—\s*$/,"").trim():(date?fD(date):"—");
      out.push({id:`lodging_${h.id}`,date,show:showLabel,cat:"Hotel",desc:h.checkOut?`${h.checkIn}–${h.checkOut} · ${h.name||"Hotel"}`:(h.name||"Hotel"),payee:h.name||"—",amount:cost,currency:h.currency||"USD",status:h.status==="confirmed"?"confirmed":"pending",ref:"lodging",payMethod:h.payMethod||"",bookedDate:h.checkIn||"",paidDate:"",receiptPath:h.receiptPath||"",_src:{type:"lodgingHotel",date,srcId:h.id}});
    });
    // Deduplicate: id first, then per-category content hash (handles same entity
    // arriving from multiple sources with different synthetic ids).
    const seenIds=new Set();
    const seenKeys=new Set();
    const keyFor=r=>{
      if(r.cat==="Flight"){
        const m=(r.desc||"").match(/([A-Z0-9]+)\s*·\s*(.+?)\s*→\s*(.+)/);
        const route=m?`${m[2].trim()}>${m[3].trim()}`:r.desc;
        return `F|${r.date}|${(r.ref||"").toUpperCase()}|${route}|${(r.payee||"").toLowerCase()}`;
      }
      if(r.cat==="Hotel")     return `H|${r.date}|${(r.payee||"").toLowerCase()}|${r.amount??""}|${r.currency}`;
      if(r.cat==="Payout")    return `P|${r.date}|${(r.payee||"").toLowerCase()}|${r.amount??""}|${r.currency}`;
      if(r.cat==="Settlement")return `S|${r.date}|${r.amount??""}|${r.currency}|${r.ref||""}`;
      if(EXPENSE_CATS.has(r.cat))return `E|${r.cat}|${r.date}|${(r.desc||"").toLowerCase()}|${r.amount??""}|${r.currency}`;
      return null;
    };
    return out.filter(r=>{
      if(r.id&&seenIds.has(r.id))return false;
      if(r.id)seenIds.add(r.id);
      const k=keyFor(r);
      if(k){if(seenKeys.has(k))return false;seenKeys.add(k);}
      return true;
    });
  },[finance,flights,shows,lodging]);

  const commit=()=>{
    if(!ec)return;
    const r=rows.find(x=>x.id===ec.id);
    if(!r){setEc(null);return;}
    const{type,date,srcId}=r._src;
    const val=eVal.trim();
    const num=parseFloat(val)||0;
    if(type==="confirmedFlight"){
      const f=flights[srcId];if(!f){setEc(null);return;}
      const FK={amount:"cost",ref:"carrier",date:"depDate"};
      uFlight(srcId,{...f,[FK[ec.field]||ec.field]:ec.field==="amount"?num:val,locked:true,editedAt:Date.now()});
    }else if(type==="event"){
      const fin=finance[date]||{};
      const FK={desc:"note",bookedDate:"expectedDate",paidDate:"actualDate"};
      uFin(date,{events:(fin.events||[]).map(e=>e.id===srcId?{...e,[FK[ec.field]||ec.field]:ec.field==="amount"?num:val}:e)});
    }else if(type==="payout"){
      const fin=finance[date]||{};
      const FK={payee:"name",ref:"method"};
      uFin(date,{payouts:(fin.payouts||[]).map(p=>p.id===srcId?{...p,[FK[ec.field]||ec.field]:ec.field==="amount"?num:val}:p)});
    }else if(type==="ledgerEntry"){
      const fin=finance[date]||{};
      const FK={payee:"vendor",desc:"description",ref:"source"};
      uFin(date,{ledgerEntries:(fin.ledgerEntries||[]).map(e=>e.id===srcId?{...e,[FK[ec.field]||ec.field]:ec.field==="amount"?num:val}:e)});
    }else if(type==="flightExpense"){
      const fin=finance[date]||{};
      const FK={desc:"label",ref:"carrier"};
      uFin(date,{flightExpenses:(fin.flightExpenses||[]).map(fe=>fe.flightId===srcId?{...fe,[FK[ec.field]||ec.field]:ec.field==="amount"?num:val}:fe)});
    }else if(type==="lodgingHotel"){
      const h=lodging[srcId];if(!h){setEc(null);return;}
      const key=ec.field==="amount"?"cost":ec.field; // amount→cost, currency→currency
      uLodging(srcId,{...h,[key]:ec.field==="amount"?num:val});
    }else if(type==="legacySettlement"){
      const FK={amount:"settlementAmount",ref:"wireRef",paidDate:"wireDate"};
      const fk=FK[ec.field];
      if(fk)uFin(date,{[fk]:ec.field==="amount"?String(num):val});
    }
    setEc(null);
  };

  const startEdit=(r,field,curVal)=>{
    if(!LEDGER_EDITABLE[r._src?.type]?.has(field))return;
    setEc({id:r.id,field});
    setEVal(curVal!=null?String(curVal):"");
  };

  const INP={background:"var(--card-3)",border:"1px solid var(--accent)",borderRadius:4,color:T.text,outline:"none",padding:"2px 4px",width:"100%",boxSizing:"border-box"};

  const ecell=(r,field,display,tdStyle)=>{
    const active=ec&&ec.id===r.id&&ec.field===field;
    const canEdit=!!LEDGER_EDITABLE[r._src?.type]?.has(field);
    if(active){
      const isDate=field==="date"||field==="bookedDate"||field==="paidDate";
      const isNum=field==="amount";
      const isCur=field==="currency";
      if(isCur)return <td style={tdStyle}><select autoFocus value={eVal} onChange={e=>setEVal(e.target.value)} onBlur={commit} style={{...INP,fontSize:9}}>{["USD","CAD","GBP","EUR"].map(c=><option key={c}>{c}</option>)}</select></td>;
      return <td style={tdStyle}><input autoFocus type={isDate?"date":isNum?"number":"text"} step={isNum?"0.01":undefined} value={eVal} onChange={e=>setEVal(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape")setEc(null);}} style={{...INP,fontSize:isNum?11:9,fontFamily:isNum||isDate?MN:"inherit"}}/></td>;
    }
    return <td style={{...tdStyle,cursor:canEdit?"text":"default"}} onClick={()=>startEdit(r,field,display)}>{display||"—"}</td>;
  };

  const cats=[...new Set(rows.map(r=>r.cat))].sort();
  const curs=[...new Set(rows.map(r=>r.currency))].sort();
  const filtered=rows.filter(r=>(filterCat==="all"||r.cat===filterCat)&&(filterCur==="all"||r.currency===filterCur));
  const sorted=[...filtered].sort((a,b)=>{
    let va=a[sortCol],vb=b[sortCol];
    if(sortCol==="amount"){va=a.amount??-Infinity;vb=b.amount??-Infinity;}
    if(typeof va==="string")va=va.toLowerCase();
    if(typeof vb==="string")vb=vb.toLowerCase();
    return va<vb?-sortDir:va>vb?sortDir:0;
  });
  const totals=filtered.reduce((m,r)=>{if(r.amount!=null)m[r.currency]=(m[r.currency]||0)+r.amount;return m;},{});

  const th=(label,col)=>{
    const active=sortCol===col;
    return <th onClick={()=>{if(active)setSortDir(d=>-d);else{setSortCol(col);setSortDir(1);}}} style={{padding:"6px 8px",textAlign:"left",fontSize:8,fontWeight:700,color:active?"var(--accent)":"var(--text-dim)",letterSpacing:"0.05em",borderBottom:"1px solid var(--border)",cursor:"pointer",whiteSpace:"nowrap",userSelect:"none",background:"var(--card-3)"}}>
      {label}{active?sortDir===1?" ↑":" ↓":""}
    </th>;
  };

  const CAT_COLOR={Flight:{bg:"var(--info-bg)",c:"var(--link)"},Hotel:{bg:"var(--warn-bg)",c:"var(--warn-fg)"},Transport:{bg:"var(--accent-pill-bg)",c:"var(--accent)"},Ground:{bg:"var(--accent-pill-bg)",c:"var(--accent)"},Rideshare:{bg:"var(--accent-pill-bg)",c:"var(--accent)"},"Car Rental":{bg:"var(--info-bg)",c:"var(--link)"},Meals:{bg:"var(--warn-bg)",c:"var(--warn-fg)"},Equipment:{bg:"var(--muted-bg)",c:"var(--text-2)"},Production:{bg:"var(--muted-bg)",c:"var(--text-2)"},Venue:{bg:"var(--muted-bg)",c:"var(--text-2)"},Merch:{bg:"var(--info-bg)",c:"var(--link)"},Payout:{bg:"var(--accent-pill-bg)",c:"var(--accent)"},Settlement:{bg:"var(--success-bg)",c:"var(--success-fg)"}};

  return(
    <div style={{flex:1,overflow:"auto",minHeight:0,padding:"14px 20px 30px"}}>
      {/* Filters + totals bar */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <span style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.06em"}}>CATEGORY</span>
        {["all",...cats].map(c=><button key={c} onClick={()=>setFilterCat(c)} style={{fontSize:9,padding:"3px 9px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,background:filterCat===c?"var(--accent)":"var(--card-2)",color:filterCat===c?"var(--card)":"var(--text-2)"}}>{c==="all"?"All":c}</button>)}
        <span style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.06em",marginLeft:8}}>CURRENCY</span>
        {["all",...curs].map(c=><button key={c} onClick={()=>setFilterCur(c)} style={{fontSize:9,padding:"3px 9px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,background:filterCur===c?"var(--accent)":"var(--card-2)",color:filterCur===c?"var(--card)":"var(--text-2)"}}>{c==="all"?"All":c}</button>)}
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {Object.entries(totals).map(([cur,amt])=><span key={cur} style={{fontSize:11,fontWeight:800,fontFamily:MN,color:T.text}}>{cur} {amt.toFixed(2)}</span>)}
          {scanMsg&&<span style={{fontSize:9,color:scanning?"var(--accent)":"var(--text-dim)",fontFamily:MN,maxWidth:200}}>{scanMsg}</span>}
          <button onClick={()=>scanRides({sweepFrom:"2026-01-01"})} disabled={scanning} title="Scan all of 2026 for rideshare receipts" style={{fontSize:9,padding:"3px 10px",borderRadius:6,border:"none",background:scanning?"var(--border)":"var(--accent-soft)",color:scanning?"var(--text-dim)":"var(--card)",cursor:scanning?"default":"pointer",fontWeight:700}}>Sweep</button>
          <button onClick={()=>scanRides()} disabled={scanning} style={{fontSize:9,padding:"3px 10px",borderRadius:6,border:"none",background:scanning?"var(--border)":"var(--accent)",color:scanning?"var(--text-dim)":"#fff",cursor:scanning?"default":"pointer",fontWeight:700}}>{scanning?"Scanning…":"🚗 Rides"}</button>
          <button onClick={()=>scanCars()} disabled={scanning} style={{fontSize:9,padding:"3px 10px",borderRadius:6,border:"none",background:scanning?"var(--border)":"var(--accent)",color:scanning?"var(--text-dim)":"#fff",cursor:scanning?"default":"pointer",fontWeight:700}}>{scanning?"Scanning…":"🚙 Cars"}</button>
          <button onClick={()=>scanFood()} disabled={scanning} style={{fontSize:9,padding:"3px 10px",borderRadius:6,border:"none",background:scanning?"var(--border)":"var(--accent)",color:scanning?"var(--text-dim)":"#fff",cursor:scanning?"default":"pointer",fontWeight:700}}>{scanning?"Scanning…":"🍔 Food"}</button>
          <button onClick={()=>setUploadOpen(true)} style={{fontSize:9,padding:"3px 10px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>↑ Upload</button>
        </div>
      </div>
      {pendingRides.length>0&&(
        <div style={{background:"var(--accent-pill-bg)",border:"1px solid var(--accent-pill-border)",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:9,fontWeight:800,color:T.accent,letterSpacing:"0.06em"}}>NEW RIDES — REVIEW BEFORE IMPORTING</span>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setPendingRides([])} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer",fontWeight:700}}>Dismiss</button>
              <button onClick={importAllRides} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import All ({pendingRides.length})</button>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {pendingRides.map(r=>(
              <div key={r.id} style={{background:"var(--card)",borderRadius:8,padding:"8px 10px",border:"1px solid var(--accent-pill-bg)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <span style={{fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:4,background:"var(--accent)",color:"#fff"}}>{r.service}</span>
                <span style={{fontSize:10,color:T.text,flex:1,minWidth:120}}>{[r.pickup,r.dropoff].filter(Boolean).join(" → ")||r.rideType||r.city||"Ride"}</span>
                <span style={{fontFamily:MN,fontSize:9,color:T.textDim,whiteSpace:"nowrap"}}>{r.date}{r.time?` ${r.time}`:""}</span>
                <span style={{fontFamily:MN,fontSize:11,fontWeight:700,color:T.text}}>{r.currency} {r.amount.toFixed(2)}</span>
                {r.validationFlags?.includes("outside_tour_range")&&<span style={{fontSize:8,color:"var(--warn-fg)"}}>outside tour</span>}
                {r.tid&&<a href={`https://mail.google.com/mail/u/0/#inbox/${r.tid}`} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:T.accent,textDecoration:"none"}}>email ↗</a>}
                <button onClick={()=>setPendingRides(p=>p.filter(x=>x.id!==r.id))} style={{fontSize:9,padding:"2px 8px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>Skip</button>
                <button onClick={()=>importRide(r)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {pendingCars.length>0&&(
        <div style={{background:"var(--accent-pill-bg)",border:"1px solid var(--accent-pill-border)",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:9,fontWeight:800,color:T.accent,letterSpacing:"0.06em"}}>NEW CAR RENTALS — REVIEW BEFORE IMPORTING</span>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setPendingCars([])} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer",fontWeight:700}}>Dismiss</button>
              <button onClick={importAllCars} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import All ({pendingCars.length})</button>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {pendingCars.map(r=>(
              <div key={r.id} style={{background:"var(--card)",borderRadius:8,padding:"8px 10px",border:"1px solid var(--accent-pill-bg)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <span style={{fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:4,background:"var(--link)",color:"#fff"}}>{r.company}</span>
                <span style={{fontSize:10,color:T.text,flex:1,minWidth:120}}>{[[r.pickupLocation,r.dropoffLocation].filter(Boolean).join(" → "),r.vehicle].filter(Boolean).join(" · ")||r.city||"Rental"}</span>
                <span style={{fontFamily:MN,fontSize:9,color:T.textDim,whiteSpace:"nowrap"}}>{r.pickupDate}{r.dropoffDate?` → ${r.dropoffDate}`:""}</span>
                <span style={{fontFamily:MN,fontSize:11,fontWeight:700,color:T.text}}>{r.currency} {r.amount.toFixed(2)}</span>
                {r.validationFlags?.includes("outside_tour_range")&&<span style={{fontSize:8,color:"var(--warn-fg)"}}>outside tour</span>}
                {r.tid&&<a href={`https://mail.google.com/mail/u/0/#inbox/${r.tid}`} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:T.accent,textDecoration:"none"}}>email ↗</a>}
                <button onClick={()=>setPendingCars(p=>p.filter(x=>x.id!==r.id))} style={{fontSize:9,padding:"2px 8px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>Skip</button>
                <button onClick={()=>importCar(r)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {pendingMeals.length>0&&(
        <div style={{background:"var(--accent-pill-bg)",border:"1px solid var(--accent-pill-border)",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:9,fontWeight:800,color:T.accent,letterSpacing:"0.06em"}}>NEW FOOD ORDERS — REVIEW BEFORE IMPORTING</span>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setPendingMeals([])} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer",fontWeight:700}}>Dismiss</button>
              <button onClick={importAllMeals} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import All ({pendingMeals.length})</button>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {pendingMeals.map(r=>(
              <div key={r.id} style={{background:"var(--card)",borderRadius:8,padding:"8px 10px",border:"1px solid var(--accent-pill-bg)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <span style={{fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:4,background:"var(--warn-fg)",color:"#fff"}}>{r.service}</span>
                <span style={{fontSize:10,color:T.text,flex:1,minWidth:120}}>{[r.vendor,r.items].filter(Boolean).join(" · ")||r.city||"Order"}</span>
                <span style={{fontFamily:MN,fontSize:9,color:T.textDim,whiteSpace:"nowrap"}}>{r.date}{r.time?` ${r.time}`:""}</span>
                <span style={{fontFamily:MN,fontSize:11,fontWeight:700,color:T.text}}>{r.currency} {r.amount.toFixed(2)}</span>
                {r.validationFlags?.includes("outside_tour_range")&&<span style={{fontSize:8,color:"var(--warn-fg)"}}>outside tour</span>}
                {r.tid&&<a href={`https://mail.google.com/mail/u/0/#inbox/${r.tid}`} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:T.accent,textDecoration:"none"}}>email ↗</a>}
                <button onClick={()=>setPendingMeals(p=>p.filter(x=>x.id!==r.id))} style={{fontSize:9,padding:"2px 8px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>Skip</button>
                <button onClick={()=>importMeal(r)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {sorted.length===0?(
        <div style={{textAlign:"center",padding:"40px 0",color:T.textMute,fontSize:11}}>No expenses logged.</div>
      ):(
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{[["date","Date"],["bookedDate","Booked"],["paidDate","Paid"],["show","Show"],["cat","Category"],["payee","Payee"],["desc","Description"],["amount","Amount"],["currency","Curr"],["status","Status"],["ref","Ref"],["payMethod","Payment"]].map(([col,label])=>th(label,col))}<th style={{padding:"6px 8px",textAlign:"center",fontSize:8,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.05em",borderBottom:"1px solid var(--border)",background:"var(--card-3)"}}>Rcpt</th></tr></thead>
            <tbody>
              {sorted.map((r,i)=>{
                const cc=CAT_COLOR[r.cat]||{bg:"var(--card-2)",c:"var(--text-2)"};
                const bg=i%2===0?"var(--card)":"var(--card-3)";
                const d0={padding:"6px 8px",fontSize:9,color:T.textDim,whiteSpace:"nowrap"};
                const canStatus=!!LEDGER_EDITABLE[r._src?.type]?.has("status");
                return(
                  <tr key={r.id} style={{borderBottom:"1px solid var(--card-3)",background:bg}}>
                    {ecell(r,"date",r.date,{...d0,fontFamily:MN})}
                    {ecell(r,"bookedDate",r.bookedDate,{...d0,fontFamily:MN})}
                    {ecell(r,"paidDate",r.paidDate,{...d0,fontFamily:MN,color:r.paidDate?"var(--success-fg)":"var(--text-mute)"})}
                    <td style={{padding:"6px 8px",fontSize:10,color:T.text,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.show}</td>
                    <td style={{padding:"6px 8px"}}><span style={{fontSize:8,padding:"2px 6px",borderRadius:4,fontWeight:700,background:cc.bg,color:cc.c}}>{r.cat}</span></td>
                    {ecell(r,"payee",r.payee,{padding:"6px 8px",fontSize:10,fontWeight:600,color:T.text})}
                    {ecell(r,"desc",r.desc,{padding:"6px 8px",fontSize:9,color:T.textDim,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"})}
                    {ecell(r,"amount",r.amount!=null?r.amount.toFixed(2):null,{padding:"6px 8px",fontFamily:MN,fontSize:11,fontWeight:700,color:r.amount!=null?"var(--text)":"var(--text-mute)",textAlign:"right"})}
                    {ecell(r,"currency",r.currency,{padding:"6px 8px",fontSize:9,color:T.textDim})}
                    {ec&&ec.id===r.id&&ec.field==="status"?(
                      <td style={{padding:"6px 8px"}}><select autoFocus value={eVal} onChange={e=>setEVal(e.target.value)} onBlur={commit} style={{...INP,fontSize:9}}>{["pending","confirmed","cancelled","paid"].map(s=><option key={s}>{s}</option>)}</select></td>
                    ):(
                      <td style={{padding:"6px 8px",cursor:canStatus?"pointer":"default"}} onClick={()=>canStatus&&startEdit(r,"status",r.status)}>
                        <span style={{fontSize:8,padding:"2px 5px",borderRadius:4,fontWeight:700,background:r.status==="confirmed"?"var(--success-bg)":"var(--warn-bg)",color:r.status==="confirmed"?"var(--success-fg)":"var(--warn-fg)"}}>{r.status}</span>
                      </td>
                    )}
                    {ecell(r,"ref",r.ref,{padding:"6px 8px",fontFamily:MN,fontSize:8,color:T.textMute})}
                    <td style={{padding:"6px 8px",fontSize:9,color:T.text2,whiteSpace:"nowrap"}}>{r.payMethod||"—"}</td>
                    <td style={{padding:"6px 8px",textAlign:"center"}}>{r.receiptPath?<button onClick={()=>openReceipt(r.receiptPath)} title="View stored receipt" style={{background:"none",border:"none",cursor:"pointer",fontSize:12,lineHeight:1,padding:0}}>📎</button>:<span style={{color:T.textMute,fontSize:9}}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{padding:"8px 12px",background:"var(--card-3)",borderTop:"1px solid var(--border)",display:"flex",gap:16,flexWrap:"wrap"}}>
            {Object.entries(totals).map(([cur,amt])=>(
              <div key={cur} style={{fontSize:9}}>
                <span style={{color:T.textDim,fontWeight:700}}>{cur} total: </span>
                <span style={{fontFamily:MN,fontWeight:800,color:T.text}}>{amt.toFixed(2)}</span>
                <span style={{color:T.textMute,marginLeft:5}}>({filtered.filter(r=>r.currency===cur).length} entries)</span>
              </div>
            ))}
            <span style={{marginLeft:"auto",fontSize:9,color:T.textMute}}>{sorted.length} rows</span>
          </div>
        </div>
      )}
    </div>
  );
}
