import { useContext, useRef, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { supabase } from "../../lib/supabase";
import { T } from "../../styles/tokens";
import { DOC_TYPE_META, arrayBufferToBase64 } from "../../lib/files";

export function FileUploadModal({onClose}){
  const{uFin,uFlight,uShow,uProd,setSel,setTab,sel,eventKey,aC,shows,flights,finance}=useContext(Ctx);
  const[dragging,setDragging]=useState(false);
  const[file,setFile]=useState(null);
  const[parsing,setParsing]=useState(false);
  const[result,setResult]=useState(null);
  const[error,setError]=useState("");
  const[applying,setApplying]=useState(false);
  const[applied,setApplied]=useState("");
  const[showDateOverride,setShowDateOverride]=useState("");
  const fileRef=useRef(null);
  const cameraRef=useRef(null);

  const ACCEPT=".pdf,.docx,.xlsx,.xls,image/*";
  const IMG_EXTS=[".jpg",".jpeg",".png",".webp",".heic",".heif",".gif"];

  const handleFile=async(f)=>{
    if(!f)return;
    const name=f.name.toLowerCase();
    const isImg=(f.type||"").startsWith("image/")||IMG_EXTS.some(ext=>name.endsWith(ext));
    if(!isImg&&![".pdf",".docx",".xlsx",".xls"].some(ext=>name.endsWith(ext))){
      setError("Unsupported file type. Use PDF, DOCX, XLSX, or a photo.");return;
    }
    setFile(f);setResult(null);setError("");setApplied("");
    setParsing(true);
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){setError("No session.");setParsing(false);return;}
      const buf=await f.arrayBuffer();
      const b64=arrayBufferToBase64(buf);
      const resp=await fetch("/api/parse-doc",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({fileBase64:b64,mimeType:f.type,filename:f.name,contextDate:sel}),
      });
      const data=await resp.json();
      if(!resp.ok){setError(data.error||"Parse failed.");setParsing(false);return;}
      setResult(data);
    }catch(e){setError(`Upload failed: ${e.message}`);}
    setParsing(false);
  };

  const onDrop=e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files?.[0];if(f)handleFile(f);};

  // ── Apply actions ─────────────────────────────────────────────────────────
  const applyReceipt=()=>{
    if(!result?.receipt)return;
    const r=result.receipt;
    const targetDate=showDateOverride||r.date||sel;
    const entry={id:`upload_${Date.now()}`,name:r.vendor||"Unknown vendor",role:r.description||"",dept:r.category||"Other",amount:r.amount!=null?String(r.amount):"",currency:r.currency||"USD",method:"Upload",status:"pending",date:r.date||targetDate,referenceNo:r.referenceNo||"",payee:r.payee||"",kind:"expense",receiptPath:result.receiptPath||""};
    const existing=finance[targetDate]?.payouts||[];
    uFin(targetDate,{payouts:[...existing,entry]});
    setApplied(`Added to ledger for ${targetDate}`);setApplying(false);
  };

  const applyExpenseReport=()=>{
    if(!result?.expenses?.length)return;
    let count=0;
    (result.expenses).forEach((e,i)=>{
      const targetDate=e.date||sel;
      const entry={id:`upload_${Date.now()}_${i}`,name:e.vendor||"Unknown",role:e.description||"",dept:e.category||"Other",amount:e.amount!=null?String(e.amount):"",currency:e.currency||"USD",method:"Upload",status:"pending",date:e.date||sel,payee:e.payee||"",kind:"expense",receiptPath:result.receiptPath||""};
      const existing=finance[targetDate]?.payouts||[];
      uFin(targetDate,{payouts:[...existing,entry]});
      count++;
    });
    setApplied(`${count} expenses added to ledger.`);setApplying(false);
  };

  const applyFlights=()=>{
    if(!result?.flights?.length)return;
    const allExisting=Object.values(flights);
    const existingKeys=new Set(allExisting.map(f=>`${f.flightNo}__${f.depDate}`));
    let count=0;
    result.flights.forEach(f=>{
      const id=`fl_upload_${f.flightNo||""}_${f.depDate||Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const key=`${f.flightNo}__${f.depDate}`;
      if(existingKeys.has(key))return;
      uFlight(id,{...f,id,status:"pending",source:"upload"});
      existingKeys.add(key);count++;
    });
    setApplied(`${count} flight${count!==1?"s":""} added as pending in Transport.`);setApplying(false);
  };

  const applyContract=()=>{
    if(!result?.show)return;
    const s=result.show;
    if(!s.date){setError("No date found in contract — enter a date to create the show.");return;}
    if(shows[s.date]){setError(`Show on ${s.date} already exists.`);return;}
    const parseTime=t=>{if(!t)return 0;const[h,m]=(t.split(":")||[]).map(Number);return(h||0)*60+(m||0);};
    uShow(s.date,{date:s.date,clientId:aC,type:"show",city:s.city||"",venue:s.venue||"",promoter:s.promoter||"",country:"",region:"",advance:[],doors:parseTime(s.doors)||19*60,curfew:parseTime(s.curfew)||23*60,busArrive:9*60,crewCall:parseTime("10:30"),venueAccess:9*60,mgTime:16*60+30,notes:[s.notes,s.guarantee?`Guarantee: ${s.guarantee}`:"",s.merch?`Merch: ${s.merch}`:""].filter(Boolean).join(" | ")||""});
    if(result.contacts?.length){// Contacts get added to advance list
      const advContacts=result.contacts.map(c=>({name:c.name,email:c.email||"",phone:c.phone||"",role:c.role,dept:"venue",company:c.company||""}));
      uShow(s.date,{advance:advContacts});
    }
    setSel(s.date);setTab("ros");
    setApplied(`Show created: ${s.venue||s.city} on ${s.date}`);setApplying(false);
  };

  const applyTechPack=()=>{
    if(!result?.techPack)return;
    uProd(eventKey,{techPackData:result.techPack,techPackContacts:result.contacts||[],techPackFile:file?.name,techPackAt:new Date().toISOString()});
    setTab("production");
    setApplied(`Tech pack applied to Production for ${sel}.`);setApplying(false);
  };

  const dt=result?.docType||"UNKNOWN";
  const meta=DOC_TYPE_META[dt]||DOC_TYPE_META.UNKNOWN;
  const isReceipt=dt==="RECEIPT"||dt==="INVOICE";
  const isFlight=dt==="FLIGHT_CONFIRMATION"||dt==="TRAVEL_ITINERARY";
  const isContract=dt==="SHOW_CONTRACT";
  const isTechPack=dt==="VENUE_TECH_PACK";
  const isExpense=dt==="EXPENSE_REPORT";

  const overlay={position:"fixed",inset:0,background:"rgba(15,23,42,.35)",backdropFilter:"blur(6px)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:60,zIndex:1000};
  const box={width:520,maxWidth:"96vw",maxHeight:"80vh",overflow:"auto",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,boxShadow:"0 25px 60px rgba(0,0,0,.18)",display:"flex",flexDirection:"column"};
  const inp2={background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 6px",outline:"none",width:"100%",fontFamily:"'Outfit',system-ui"};

  return(
    <div onClick={onClose} style={overlay}>
      <div onClick={e=>e.stopPropagation()} style={box}>
        {/* Header */}
        <div style={{padding:"14px 18px 10px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <span style={{fontSize:11,fontWeight:800,color:T.text}}>↑ Upload Document</span>
          <span style={{fontSize:9,color:T.textMute,marginLeft:2}}>PDF · DOCX · XLSX · Photo</span>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:T.textMute,fontSize:20,lineHeight:1}}>×</button>
        </div>

        {/* Drop zone */}
        {!result&&!parsing&&(
          <div style={{margin:"16px 18px",display:"flex",flexDirection:"column",gap:8}}>
            <div
              onDragOver={e=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)}
              onDrop={onDrop}
              onClick={()=>fileRef.current?.click()}
              style={{border:`2px dashed ${dragging?"var(--accent)":"var(--border)"}`,borderRadius:10,padding:"32px 20px",textAlign:"center",cursor:"pointer",background:dragging?"var(--accent-pill-bg)":"var(--card-3)",transition:"all .15s"}}
            >
              <div style={{fontSize:24,marginBottom:8}}>📄</div>
              <div style={{fontSize:11,fontWeight:700,color:T.text,marginBottom:4}}>Drop a file or click to browse</div>
              <div style={{fontSize:10,color:T.textMute}}>PDF, DOCX, XLSX, or photo — receipts, contracts, tech packs, itineraries, expense reports</div>
              <input ref={fileRef} type="file" accept={ACCEPT} style={{display:"none"}} onChange={e=>handleFile(e.target.files?.[0])}/>
            </div>
            <button
              type="button"
              onClick={e=>{e.stopPropagation();cameraRef.current?.click();}}
              style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"10px 14px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card-3)",color:T.text,cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"'Outfit',system-ui"}}
            >
              <span style={{fontSize:14}}>📷</span> Take photo
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>handleFile(e.target.files?.[0])}/>
          </div>
        )}

        {/* Parsing state */}
        {parsing&&(
          <div style={{padding:"40px 18px",textAlign:"center"}}>
            <div style={{fontSize:24,marginBottom:10}}>⏳</div>
            <div style={{fontSize:11,fontWeight:700,color:T.text,marginBottom:4}}>Parsing {file?.name}…</div>
            <div style={{fontSize:10,color:T.textMute}}>Claude is reading and classifying your document.</div>
          </div>
        )}

        {/* Error */}
        {error&&!parsing&&(
          <div style={{margin:"0 18px 14px",padding:"8px 12px",background:"var(--danger-bg)",border:"1px solid var(--danger-bg)",borderRadius:6,fontSize:10,color:"var(--danger-fg)"}}>{error}</div>
        )}

        {/* Result */}
        {result&&!parsing&&(
          <div style={{padding:"14px 18px 20px",display:"flex",flexDirection:"column",gap:12}}>
            {/* Type badge + summary */}
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              <span style={{fontSize:20,flexShrink:0}}>{meta.icon}</span>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontSize:10,fontWeight:800,padding:"2px 9px",borderRadius:10,background:meta.bg,color:meta.c}}>{meta.label}</span>
                  <span style={{fontSize:9,color:T.textMute}}>{Math.round((result.confidence||0)*100)}% confidence</span>
                  <button onClick={()=>{setResult(null);setFile(null);setError("");setApplied("");}} style={{marginLeft:"auto",fontSize:9,color:T.accent,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>↩ Re-upload</button>
                </div>
                <div style={{fontSize:11,color:T.text,fontWeight:500}}>{result.summary}</div>
                {file&&<div style={{fontSize:9,color:T.textMute,marginTop:2}}>{file.name}</div>}
              </div>
            </div>

            {/* RECEIPT / INVOICE preview */}
            {isReceipt&&result.receipt&&(
              <div style={{background:"var(--card-3)",borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:6}}>
                {[["Vendor",result.receipt.vendor],["Date",result.receipt.date],["Amount",result.receipt.amount!=null?`${result.receipt.amount} ${result.receipt.currency||""}`:null],["Category",result.receipt.category],["Description",result.receipt.description],["Reference",result.receipt.referenceNo]].filter(([,v])=>v).map(([k,v])=>(
                  <div key={k} style={{display:"flex",gap:10,fontSize:10}}><span style={{color:T.textDim,minWidth:80,fontWeight:600}}>{k}</span><span style={{color:T.text}}>{v}</span></div>
                ))}
                <div style={{display:"flex",gap:8,alignItems:"center",marginTop:4}}>
                  <span style={{fontSize:9,color:T.textDim,fontWeight:600}}>Apply to date</span>
                  <input type="date" value={showDateOverride||result.receipt.date||sel} onChange={e=>setShowDateOverride(e.target.value)} style={{...inp2,width:130}}/>
                </div>
              </div>
            )}

            {/* FLIGHT preview */}
            {isFlight&&result.flights?.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {result.flights.map((f,i)=>(
                  <div key={i} style={{background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:6,padding:"8px 10px",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:9,fontWeight:800,padding:"2px 5px",borderRadius:4,background:"var(--link)",color:"#fff",flexShrink:0}}>{f.flightNo||f.carrier}</span>
                    <span style={{fontSize:10,color:T.text,flex:1}}>{f.fromCity||f.from} → {f.toCity||f.to}</span>
                    <span style={{fontFamily:MN,fontSize:9,color:T.textDim,whiteSpace:"nowrap"}}>{f.depDate} {f.dep}</span>
                    {f.pax?.length>0&&<span style={{fontSize:9,color:T.textMute}}>{f.pax.join(", ")}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* CONTRACT preview */}
            {isContract&&result.show&&(
              <div style={{background:"var(--success-bg)",border:"1px solid var(--success-bg)",borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:5}}>
                {[["Date",result.show.date],["Venue",result.show.venue],["City",result.show.city],["Promoter",result.show.promoter],["Guarantee",result.show.guarantee],["Capacity",result.show.capacity],["Doors",result.show.doors],["Curfew",result.show.curfew]].filter(([,v])=>v).map(([k,v])=>(
                  <div key={k} style={{display:"flex",gap:10,fontSize:10}}><span style={{color:T.successFg,minWidth:80,fontWeight:600}}>{k}</span><span style={{color:T.text}}>{String(v)}</span></div>
                ))}
                {result.contacts?.length>0&&<div style={{marginTop:4,fontSize:9,color:T.successFg,fontWeight:700}}>{result.contacts.length} contact{result.contacts.length>1?"s":""} found</div>}
              </div>
            )}

            {/* TECH PACK preview */}
            {isTechPack&&result.techPack&&(
              <div style={{background:"var(--accent-pill-bg)",border:"1px solid var(--accent-pill-bg)",borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:5}}>
                {[["Venue",result.techPack.venueName],["City",result.techPack.city],["Stage",result.techPack.stageDimensions],["Rigging",result.techPack.riggingPoints],["Power",result.techPack.powerSpec],["Load-in",result.techPack.loadIn],["Curfew",result.techPack.curfew]].filter(([,v])=>v).map(([k,v])=>(
                  <div key={k} style={{display:"flex",gap:10,fontSize:10}}><span style={{color:T.accent,minWidth:80,fontWeight:600}}>{k}</span><span style={{color:T.text}}>{v}</span></div>
                ))}
                {result.techPack.notes&&<div style={{fontSize:9,color:T.textDim,marginTop:2}}>{result.techPack.notes}</div>}
              </div>
            )}

            {/* EXPENSE REPORT preview */}
            {isExpense&&result.expenses?.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:160,overflow:"auto"}}>
                {result.expenses.map((e,i)=>(
                  <div key={i} style={{background:"var(--card-3)",borderRadius:6,padding:"5px 8px",display:"flex",gap:8,alignItems:"center",fontSize:9}}>
                    <span style={{fontFamily:MN,fontWeight:700,color:T.text,minWidth:60}}>{e.amount} {e.currency}</span>
                    <span style={{flex:1,color:T.text2}}>{e.vendor}</span>
                    <span style={{color:T.textMute}}>{e.date}</span>
                    <span style={{color:T.textDim}}>{e.category}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Applied confirmation */}
            {applied&&<div style={{padding:"7px 10px",background:"var(--success-bg)",border:"1px solid var(--success-fg)",borderRadius:6,fontSize:10,color:T.successFg,fontWeight:700}}>✓ {applied}</div>}

            {/* Action buttons */}
            {!applied&&(
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {isReceipt&&result.receipt?.amount!=null&&(
                  <button onClick={applyReceipt} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"var(--warn-fg)",color:"#fff",cursor:"pointer",fontWeight:700}}>Add to Ledger</button>
                )}
                {isFlight&&result.flights?.length>0&&(
                  <button onClick={applyFlights} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"var(--link)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import {result.flights.length} Flight{result.flights.length>1?"s":""}</button>
                )}
                {isContract&&result.show?.date&&(
                  <button onClick={applyContract} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"var(--success-fg)",color:"#fff",cursor:"pointer",fontWeight:700}}>Create Show</button>
                )}
                {isTechPack&&result.techPack&&(
                  <button onClick={applyTechPack} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Apply to Production</button>
                )}
                {isExpense&&result.expenses?.length>0&&(
                  <button onClick={applyExpenseReport} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"var(--warn-fg)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import {result.expenses.length} Expenses</button>
                )}
                <button onClick={onClose} style={{fontSize:10,padding:"5px 12px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer"}}>Close</button>
              </div>
            )}
            {applied&&<button onClick={onClose} style={{fontSize:10,padding:"5px 12px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.textDim,cursor:"pointer",width:"fit-content"}}>Done</button>}
          </div>
        )}
      </div>
    </div>
  );
}
