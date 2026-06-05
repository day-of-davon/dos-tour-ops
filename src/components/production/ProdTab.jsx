import { useCallback, useContext, useMemo, useRef, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { DESIGN_RIG, MANIFEST_SEED, POS_STYLES, PROD_DEPTS, SEV_STYLES, VENUE_GRID, checkRigVsVenue } from "../../DosApp.jsx";
import { MN, UI } from "../../lib/domain-constants";
import { supabase } from "../../lib/supabase";
import { T } from "../../styles/tokens";
import { VenueBrief } from "../lodging/VenueBrief";

export function ProdTab(){
  const{shows,sel,eventKey,production,uProd,mobile}=useContext(Ctx);
  const show=shows?.[sel];
  const data=production[eventKey]||{docs:[],items:[],issues:[],analysis:null};

  const[subTab,setSubTab]=useState("venue");
  const[uploading,setUploading]=useState(false);
  const[analyzing,setAnalyzing]=useState(false);
  const[uploadMsg,setUploadMsg]=useState("");
  const[docType,setDocType]=useState("vendor_quote");
  const[vendorName,setVendorName]=useState("");
  const[quoteRef,setQuoteRef]=useState("");
  const[deptFilter,setDeptFilter]=useState("ALL");
  const[posFilter,setPosFilter]=useState("ALL");
  const fileRef=useRef(null);

  const upd=useCallback(patch=>uProd(eventKey,{...data,...patch}),[eventKey,data,uProd]);

  const handleFile=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.type!=="application/pdf"){setUploadMsg("PDF files only");return;}
    setUploading(true);setUploadMsg(`Parsing ${file.name}…`);
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){setUploadMsg("No session");return;}
      const buf=await file.arrayBuffer();
      const b64=btoa(String.fromCharCode(...new Uint8Array(buf)));
      const resp=await fetch("/api/production",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({pdfBase64:b64,docType,vendorName:vendorName.trim()||null,quoteRef:quoteRef.trim()||null}),
      });
      const result=await resp.json();
      if(!resp.ok){setUploadMsg(result.error||"Parse failed");return;}
      const docId=`doc_${Date.now()}`;
      const newDoc={id:docId,fileName:file.name,docType,vendorName:vendorName.trim()||null,quoteRef:quoteRef.trim()||null,parsedAt:new Date().toISOString(),itemCount:result.count};
      const newItems=(result.items||[]).map(i=>({...i,doc_id:docId}));
      upd({docs:[...(data.docs||[]),newDoc],items:[...(data.items||[]),...newItems],analysis:null,issues:[]});
      setUploadMsg(`Parsed ${result.count} items from ${file.name}`);
      setVendorName("");setQuoteRef("");
      if(fileRef.current)fileRef.current.value="";
      setTimeout(()=>setUploadMsg(""),4000);
    }catch(e){setUploadMsg(`Error: ${e.message}`);}
    finally{setUploading(false);}
  };

  const runAnalysis=async()=>{
    if(!data.items?.length){setUploadMsg("Upload at least one document first");return;}
    setAnalyzing(true);setUploadMsg("Running analysis…");
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){setUploadMsg("No session");return;}
      const resp=await fetch("/api/production",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({action:"analyze",existingItems:data.items}),
      });
      const result=await resp.json();
      if(!resp.ok){setUploadMsg(result.error||"Analysis failed");return;}
      upd({issues:result.issues||[],analysis:{powerBudget:result.powerBudget,weightLedger:result.weightLedger,analyzedAt:new Date().toISOString()}});
      setUploadMsg(`Analysis complete — ${result.issues?.length||0} issues detected`);
      setSubTab("analysis");
      setTimeout(()=>setUploadMsg(""),4000);
    }catch(e){setUploadMsg(`Error: ${e.message}`);}
    finally{setAnalyzing(false);}
  };

  const overridePosition=(itemId,pos)=>{
    upd({items:(data.items||[]).map(i=>i.id===itemId?{...i,rig_position:pos}:i),analysis:null,issues:[]});
  };

  const resolveIssue=id=>{
    upd({issues:(data.issues||[]).map(i=>i.id===id?{...i,resolved:!i.resolved}:i)});
  };

  const deleteDoc=docId=>{
    upd({docs:(data.docs||[]).filter(d=>d.id!==docId),items:(data.items||[]).filter(i=>i.doc_id!==docId),analysis:null,issues:[]});
  };

  const seedManifest=()=>{
    const seeded=MANIFEST_SEED.map(i=>({...i,id:`seed_${sel}_${i.id}`,doc_id:"seed"}));
    const seedDoc={id:"seed",fileName:"EU Tour Binder (seeded)",docType:"vendor_quote",vendorName:"Neg Earth / Sonalyst / Tour Carry",quoteRef:"26-1273 | 26-0097 | v1.0.0",parsedAt:new Date().toISOString(),itemCount:seeded.length};
    upd({docs:[seedDoc],items:seeded,analysis:null,issues:[]});
  };

  const toggleIncluded=itemId=>{
    upd({items:(data.items||[]).map(i=>i.id===itemId?{...i,included:!i.included}:i),analysis:null});
  };

  const updateQty=(itemId,val)=>{
    const n=parseInt(val,10);
    if(isNaN(n)||n<0)return;
    upd({items:(data.items||[]).map(i=>i.id===itemId?{...i,qty:n}:i),analysis:null});
  };

  const exportJson=()=>{
    const blob=new Blob([JSON.stringify({show:show?.venue,date:show?.date,...data},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");
    a.href=url;a.download=`production-${show?.venue||"show"}-${show?.date||"export"}.json`.toLowerCase().replace(/\s+/g,"_");
    a.click();URL.revokeObjectURL(url);
  };

  const[showExcluded,setShowExcluded]=useState(false);
  const filteredItems=useMemo(()=>{
    let items=data.items||[];
    if(!showExcluded)items=items.filter(i=>i.included!==false);
    if(deptFilter!=="ALL")items=items.filter(i=>i.department===deptFilter);
    if(posFilter!=="ALL")items=items.filter(i=>i.rig_position===posFilter);
    return items;
  },[data.items,deptFilter,posFilter,showExcluded]);

  const groupedItems=useMemo(()=>{
    return filteredItems.reduce((acc,item)=>{
      const d=item.department||"OTHER";
      if(!acc[d])acc[d]=[];
      acc[d].push(item);
      return acc;
    },{});
  },[filteredItems]);

  const tbdCount=useMemo(()=>(data.items||[]).filter(i=>i.rig_position==="TBD").length,[data.items]);
  const openIssues=useMemo(()=>(data.issues||[]).filter(i=>!i.resolved).length,[data.issues]);

  const vg=VENUE_GRID[sel]||null;
  const rigChecks=useMemo(()=>checkRigVsVenue(VENUE_GRID[sel]||null),[sel]);
  const rigCritical=rigChecks.filter(i=>i.severity==="CRITICAL").length;
  const rigHigh=rigChecks.filter(i=>i.severity==="HIGH").length;
  const rigBadge=rigCritical>0?rigCritical:rigHigh>0?rigHigh:null;
  const rigBadgeColor=rigCritical>0?"var(--danger-fg)":"var(--warn-fg)";

  const SUB_TABS=[
    {id:"venue",label:"Venue Brief"},
    {id:"rigcheck",label:"Rig Check",badge:rigBadge,badgeColor:rigBadgeColor},
    {id:"upload",label:"Upload"},
    {id:"manifest",label:`Manifest${data.items?.length?` (${data.items.length})`:""}`,badge:tbdCount>0?tbdCount:null,badgeColor:"var(--warn-fg)"},
    {id:"analysis",label:"Analysis"},
    {id:"issues",label:`Issues${openIssues>0?` (${openIssues})`:""}`,badge:openIssues>0?openIssues:null,badgeColor:"var(--danger-fg)"},
  ];

  if(!show)return<div style={{padding:24,color:T.textDim,fontSize:11}}>Select a show to view production data.</div>;

  return(
    <div className="fi" style={{padding:"16px 20px",maxWidth:900,width:"100%",height:"calc(100vh - 115px)",overflowY:"auto"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:800,color:T.text}}>{show.venue}</div>
          <div style={{fontSize:10,color:T.textDim,fontFamily:MN}}>{show.date} · {show.city}</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {data.items?.length>0&&<button onClick={runAnalysis} disabled={analyzing} style={{fontSize:10,fontWeight:700,padding:"5px 12px",borderRadius:6,border:"none",background:analyzing?"var(--border)":"var(--accent)",color:analyzing?"var(--text-mute)":"var(--card)",cursor:analyzing?"default":"pointer"}}>{analyzing?"Analyzing…":"Run Analysis"}</button>}
          {data.items?.length>0&&<button onClick={exportJson} style={{fontSize:10,fontWeight:600,padding:"5px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-3)",color:T.text2,cursor:"pointer"}}>Export JSON</button>}
        </div>
      </div>

      {uploadMsg&&<div style={{fontSize:10,color:uploadMsg.startsWith("Error")||uploadMsg.startsWith("PDF")?"var(--danger-fg)":"var(--success-fg)",background:uploadMsg.startsWith("Error")||uploadMsg.startsWith("PDF")?"var(--danger-bg)":"var(--success-bg)",border:`1px solid ${uploadMsg.startsWith("Error")||uploadMsg.startsWith("PDF")?"var(--danger-bg)":"var(--success-bg)"}`,borderRadius:6,padding:"6px 10px",marginBottom:10,fontFamily:MN}}>{uploadMsg}</div>}

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:1,borderBottom:"1px solid var(--border)",marginBottom:12,overflowX:"auto",overflowY:"hidden",scrollbarWidth:"thin",WebkitOverflowScrolling:"touch"}}>
        {SUB_TABS.map(t=><button key={t.id} onClick={()=>setSubTab(t.id)} style={{padding:"5px 12px",fontSize:10,fontWeight:subTab===t.id?700:500,color:subTab===t.id?"var(--text)":"var(--text-dim)",background:"none",border:"none",cursor:"pointer",borderBottom:subTab===t.id?"2px solid var(--accent)":"2px solid transparent",display:"flex",alignItems:"center",gap:4,flexShrink:0,whiteSpace:"nowrap"}}>
          {t.label}{t.badge!=null&&<span style={{fontSize:8,fontWeight:800,background:t.badgeColor||"var(--accent)",color:"#fff",borderRadius:10,padding:"1px 5px"}}>{t.badge}</span>}
        </button>)}
      </div>

      {/* Venue Brief tab */}
      {subTab==="venue"&&<VenueBrief vg={vg} sel={sel} data={data} upd={upd}/>}

      {/* Rig Check tab */}
      {subTab==="rigcheck"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
        {/* Spec header */}
        <div style={{background:"var(--border)",borderRadius:10,padding:"12px 16px",color:"#fff"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:800,fontFamily:MN,color:"var(--border)"}}>BBNO$ EU TOUR RIG — {DESIGN_RIG.version}</div>
              <div style={{fontSize:9,color:T.textDim,fontFamily:MN}}>Designer: {DESIGN_RIG.drawnBy} · {DESIGN_RIG.publishedAt} · {DESIGN_RIG.file}</div>
            </div>
            <span style={{fontSize:9,fontWeight:700,padding:"3px 9px",borderRadius:6,background:"var(--card-2)",color:T.textMute,fontFamily:MN}}>~{DESIGN_RIG.req.power_kw_est} kW est.</span>
          </div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {[["Rig W",`${DESIGN_RIG.dims.rig_width_mm/1000}m`],["LED Tower H",`${DESIGN_RIG.dims.led_tower_h_mm/1000}m`],["Fly Trim",`${DESIGN_RIG.dims.fly_trim_mm/1000}m`],["Stage Depth",`${DESIGN_RIG.dims.stage_depth_mm/1000}m`],["Stage W total",`${DESIGN_RIG.dims.stage_w_total_mm/1000}m`],["Min Clear (GS)",`${DESIGN_RIG.req.min_clearance_gs_m}m`],["Min Clear (fly)",`${DESIGN_RIG.req.min_clearance_fly_m}m`],["Lasers",`${DESIGN_RIG.req.laser_count}× Class 4`]].map(([k,v])=><div key={k} style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:T.textMute,textTransform:"uppercase",letterSpacing:"0.04em"}}>{k}</div>
              <div style={{fontSize:11,fontWeight:800,fontFamily:MN,color:"var(--card-3)"}}>{v}</div>
            </div>)}
          </div>
        </div>

        {/* Fixture schedule */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:12}}>
          <div style={{...UI.sectionLabel,marginBottom:8}}>Fixture Schedule (Sht-1 Symbol Key + VWX)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 40px 60px 60px 50px",gap:0,padding:"4px 8px",background:"var(--card-3)",borderRadius:"6px 6px 0 0",borderBottom:"1px solid var(--border)"}}>
            {["Fixture","Qty","W/unit","Binder","Δ"].map(h=><span key={h} style={{fontSize:8,fontWeight:800,color:T.textMute,letterSpacing:"0.04em"}}>{h}</span>)}
          </div>
          {DESIGN_RIG.fixtures.map((f,i)=>{
            const hasDelta=f.delta!=null&&f.delta!==0;
            const deltaColor=f.delta>0?"var(--danger-fg)":f.delta<0?"var(--warn-fg)":"var(--success-fg)";
            return(
              <div key={f.name} style={{display:"grid",gridTemplateColumns:"1fr 40px 60px 60px 50px",gap:0,padding:"4px 8px",background:hasDelta?"var(--danger-bg)":i%2===0?"var(--card)":"var(--card-3)",borderBottom:"1px solid var(--card-2)",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:9,fontWeight:600,color:T.text}}>{f.name}</div>
                  {f.note&&<div style={{fontSize:8,color:T.textMute,fontStyle:"italic"}}>{f.note}</div>}
                  <div style={{fontSize:8,color:"var(--text-faint)"}}>{f.dept} · {f.position} · {f.source}</div>
                </div>
                <span style={{fontSize:10,fontWeight:700,fontFamily:MN,textAlign:"center",color:f.qty==null?"var(--text-mute)":"var(--text)"}}>{f.qty??"-"}</span>
                <span style={{fontSize:9,fontFamily:MN,color:T.text2,textAlign:"right"}}>{f.power_w?`${f.power_w}W`:"—"}</span>
                <span style={{fontSize:9,fontFamily:MN,color:T.textDim,textAlign:"center"}}>{f.binder_qty??"-"}</span>
                <span style={{fontSize:10,fontWeight:700,fontFamily:MN,textAlign:"center",color:hasDelta?deltaColor:"var(--success-fg)"}}>{f.delta==null?"?":f.delta===0?"✓":f.delta>0?`+${f.delta}`:f.delta}</span>
              </div>
            );
          })}
          <div style={{padding:"4px 8px",fontSize:8,color:T.textMute}}>Δ = design qty − binder qty · red = under-quoted · amber = over-quoted</div>
        </div>

        {/* Design vs quote discrepancies */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:12}}>
          <div style={{...UI.sectionLabel,marginBottom:8}}>Design vs Quote Discrepancies</div>
          {DESIGN_RIG.specDiscrepancies.map((disc,i)=>{
            const sv=SEV_STYLES[disc.severity]||SEV_STYLES.LOW;
            return(
              <div key={i} style={{padding:"7px 10px",borderBottom:"1px solid var(--card-2)",background:i%2===0?"var(--card)":"var(--card-3)"}}>
                <div style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:3}}>
                  <span style={{fontSize:8,fontWeight:800,padding:"1px 6px",borderRadius:10,background:sv.bg,color:sv.c,flexShrink:0}}>{disc.severity}</span>
                  <span style={{fontSize:8,fontWeight:700,color:T.textDim,flexShrink:0}}>{disc.category}</span>
                  <span style={{fontSize:9,color:T.text,flex:1}}>{disc.finding}</span>
                </div>
                <div style={{fontSize:8,color:T.text2,paddingLeft:2}}><span style={{fontWeight:600}}>Action:</span> {disc.action}</div>
              </div>
            );
          })}
        </div>

      </div>}

      {/* Upload tab */}
      {subTab==="upload"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
          <div style={{...UI.sectionLabel,marginBottom:10}}>Add Document</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            {["vendor_quote","design_drawing"].map(dt=><button key={dt} onClick={()=>setDocType(dt)} style={{fontSize:10,fontWeight:700,padding:"4px 12px",borderRadius:6,border:`1.5px solid ${docType===dt?"var(--accent)":"var(--border)"}`,background:docType===dt?"var(--accent-pill-bg)":"var(--card)",color:docType===dt?"var(--accent)":"var(--text-2)",cursor:"pointer"}}>{dt==="vendor_quote"?"Vendor Quote":"Design Drawing"}</button>)}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            <input value={vendorName} onChange={e=>setVendorName(e.target.value)} placeholder="Vendor name (e.g. Neg Earth)" style={{...UI.input,flex:1,minWidth:140}} disabled={docType==="design_drawing"}/>
            <input value={quoteRef} onChange={e=>setQuoteRef(e.target.value)} placeholder="Quote ref (e.g. 26-1273)" style={{...UI.input,flex:1,minWidth:120}} disabled={docType==="design_drawing"}/>
          </div>
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"24px 16px",border:"2px dashed var(--border)",borderRadius:10,cursor:"pointer",background:"var(--card-3)",color:T.textDim,fontSize:10,fontWeight:600}}>
            <span style={{fontSize:20}}>▤</span>
            {uploading?"Uploading…":"Click to upload PDF or drag and drop"}
            <input ref={fileRef} type="file" accept="application/pdf" onChange={handleFile} style={{display:"none"}} disabled={uploading}/>
          </label>
        </div>

        {(data.docs||[]).length>0&&<div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
          <div style={{...UI.sectionLabel,marginBottom:8}}>Uploaded Documents</div>
          {(data.docs||[]).map(doc=><div key={doc.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--card-2)"}}>
            <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,background:doc.docType==="vendor_quote"?"var(--accent-pill-bg)":"var(--success-bg)",color:doc.docType==="vendor_quote"?"var(--accent)":"var(--success-fg)"}}>{doc.docType==="vendor_quote"?"QUOTE":"DESIGN"}</span>
            <span style={{fontSize:10,flex:1,color:T.text}}>{doc.fileName}</span>
            {doc.vendorName&&<span style={{fontSize:9,color:T.textDim}}>{doc.vendorName}</span>}
            {doc.quoteRef&&<span style={{fontSize:9,color:T.textMute,fontFamily:MN}}>{doc.quoteRef}</span>}
            <span style={{fontSize:9,color:T.successFg,fontFamily:MN}}>{doc.itemCount} items</span>
            <button onClick={()=>deleteDoc(doc.id)} style={{fontSize:10,color:T.textMute,background:"none",border:"none",cursor:"pointer",padding:"0 4px"}} title="Remove document">×</button>
          </div>)}
          {data.items?.length>0&&<div style={{marginTop:12,padding:"8px 10px",background:"var(--card-3)",borderRadius:6,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:T.text2}}>{data.items.length} total items across {data.docs.length} document(s)</span>
            {tbdCount>0&&<span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,background:"var(--warn-bg)",color:T.warnFg}}>{tbdCount} TBD positions</span>}
            <button onClick={()=>setSubTab("manifest")} style={{marginLeft:"auto",fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-3)",color:T.text2,cursor:"pointer"}}>View Manifest →</button>
          </div>}
        </div>}

        {!data.docs?.length&&<div style={{padding:32,textAlign:"center",color:T.textMute,fontSize:10}}>
          <div style={{fontSize:24,marginBottom:8}}>▤</div>
          <div style={{fontWeight:600,marginBottom:4}}>No documents uploaded</div>
          <div>Upload vendor quote PDFs or production design drawings to generate a manifest.</div>
        </div>}
      </div>}

      {/* Manifest tab */}
      {subTab==="manifest"&&<div>
        {/* Filters */}
        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
          <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)} style={{...UI.input,fontSize:9}}>
            {PROD_DEPTS.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
          <select value={posFilter} onChange={e=>setPosFilter(e.target.value)} style={{...UI.input,fontSize:9}}>
            {["ALL","fly","ground","tower","touring_carry","TBD"].map(p=><option key={p} value={p}>{p==="ALL"?"All positions":p.toUpperCase()}</option>)}
          </select>
          {tbdCount>0&&<button onClick={()=>setPosFilter("TBD")} style={{fontSize:9,fontWeight:700,padding:"3px 9px",borderRadius:6,border:"1.5px solid var(--warn-fg)",background:"var(--warn-bg)",color:T.warnFg,cursor:"pointer"}}>▲ {tbdCount} TBD</button>}
          <button onClick={()=>setShowExcluded(v=>!v)} style={{fontSize:9,fontWeight:700,padding:"3px 9px",borderRadius:6,border:`1.5px solid ${showExcluded?"var(--accent)":"var(--border)"}`,background:showExcluded?"var(--accent-pill-bg)":"var(--card-3)",color:showExcluded?"var(--accent)":"var(--text-mute)",cursor:"pointer"}}>{showExcluded?"Show all":"Excluded hidden"}</button>
          <span style={{marginLeft:"auto",fontSize:9,color:T.textMute}}>{(data.items||[]).filter(i=>i.included!==false).length} of {(data.items||[]).length} included</span>
        </div>

        {(data.items||[]).length===0&&VENUE_GRID[sel]&&<div style={{padding:32,textAlign:"center"}}>
          <div style={{fontSize:24,marginBottom:8}}>▤</div>
          <div style={{fontSize:11,fontWeight:600,color:T.text,marginBottom:4}}>No manifest loaded</div>
          <div style={{fontSize:10,color:T.textDim,marginBottom:16}}>Seed from the EU Tour Binder or upload vendor quote PDFs in the Upload tab.</div>
          <button onClick={seedManifest} style={{fontSize:11,fontWeight:700,padding:"8px 20px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer"}}>Load Tour Manifest</button>
        </div>}

        {(data.items||[]).length===0&&!VENUE_GRID[sel]&&<div style={{padding:32,textAlign:"center",color:T.textMute,fontSize:10}}>No items. Upload vendor quote PDFs in the Upload tab.</div>}

        {(data.items||[]).length>0&&Object.entries(groupedItems).length===0&&<div style={{padding:32,textAlign:"center",color:T.textMute,fontSize:10}}>No items match the current filters.</div>}

        {Object.entries(groupedItems).map(([dept,items])=><div key={dept} style={{marginBottom:12}}>
          <div style={{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>{dept} ({items.length})</div>
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
            {/* Table header */}
            <div style={{display:"grid",gridTemplateColumns:"20px 1fr 60px 60px 60px 60px 60px 70px 70px",gap:0,borderBottom:"1px solid var(--border)",padding:"5px 8px",background:"var(--card-3)"}}>
              {["","Item","Qty","Position","Wt/u","Wt tot","Pwr/u","IP","Source"].map(h=><span key={h} style={{fontSize:8,fontWeight:800,color:T.textMute,letterSpacing:"0.04em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h}</span>)}
            </div>
            {items.map(item=>{
              const pos=item.rig_position||"TBD";
              const ps=POS_STYLES[pos]||POS_STYLES.TBD;
              const flagged=item.has_discrepancy;
              const excluded=item.included===false;
              return(
                <div key={item.id} className="rh" style={{display:"grid",gridTemplateColumns:"20px 1fr 60px 60px 60px 60px 60px 70px 70px",gap:0,padding:"5px 8px",borderBottom:"1px solid var(--card-2)",background:flagged?"var(--danger-bg)":excluded?"var(--card-3)":"var(--card)",alignItems:"center",opacity:excluded?0.45:1}}>
                  <input type="checkbox" checked={!excluded} onChange={()=>toggleIncluded(item.id)} style={{width:13,height:13,cursor:"pointer",accentColor:"var(--accent)"}}/>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:excluded?"line-through":"none"}} title={item.item_name}>{item.item_name}</div>
                    {item.model_ref&&item.model_ref!==item.item_name&&<div style={{fontSize:8,color:T.textMute,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.model_ref}</div>}
                    {item.vendor_name&&<div style={{fontSize:8,color:T.textDim}}>{item.vendor_name}{item.vendor_quote_ref&&` · ${item.vendor_quote_ref}`}</div>}
                  </div>
                  <input type="number" min={0} value={item.qty||1} onChange={e=>updateQty(item.id,e.target.value)} style={{width:48,fontSize:10,fontFamily:MN,fontWeight:600,textAlign:"center",border:"1px solid var(--border)",borderRadius:4,padding:"2px 4px",background:"var(--card-3)",color:T.text,outline:"none"}}/>
                  <div style={{display:"flex",alignItems:"center"}}>
                    <select value={pos} onChange={e=>overridePosition(item.id,e.target.value)} style={{fontSize:8,fontWeight:700,padding:"2px 4px",borderRadius:4,border:`1px solid ${ps.c}`,background:ps.bg,color:ps.c,cursor:"pointer",maxWidth:56}}>
                      {["fly","ground","tower","touring_carry","TBD"].map(p=><option key={p} value={p}>{p.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <span style={{fontSize:9,fontFamily:MN,color:T.text2,textAlign:"right"}}>{item.weight_kg?`${item.weight_kg}kg`:"—"}</span>
                  <span style={{fontSize:9,fontFamily:MN,color:T.text2,textAlign:"right"}}>{item.weight_kg&&item.qty?`${Math.round(item.weight_kg*item.qty*10)/10}kg`:"—"}</span>
                  <span style={{fontSize:9,fontFamily:MN,color:T.text2,textAlign:"right"}}>{item.power_w?`${item.power_w}W`:"—"}</span>
                  <span style={{fontSize:8,fontFamily:MN,color:T.text2}}>{item.ip_rating||"—"}</span>
                  <span style={{fontSize:8,color:item.spec_source==="fixture_specs"?"var(--success-fg)":"var(--text-mute)"}}>{item.source_type==="design_spec"?"design":"quote"}{item.spec_source==="fixture_specs"&&" ✓"}</span>
                </div>
              );
            })}
          </div>
        </div>)}
      </div>}

      {/* Analysis tab */}
      {subTab==="analysis"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
        {!data.analysis?<div style={{padding:32,textAlign:"center"}}>
          <div style={{fontSize:10,color:T.textDim,marginBottom:12}}>Run analysis to see power budget, weight ledger, and issue detection.</div>
          {data.items?.length>0&&<button onClick={runAnalysis} disabled={analyzing} style={{fontSize:11,fontWeight:700,padding:"8px 20px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer"}}>{analyzing?"Analyzing…":"Run Analysis"}</button>}
        </div>:<>
          {/* Power Budget */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:14}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div style={{...UI.sectionLabel,margin:0}}>Power Budget</div>
              <span style={{fontSize:20,fontWeight:800,fontFamily:MN,color:data.analysis.powerBudget.total_kw>100?"var(--danger-fg)":data.analysis.powerBudget.total_kw>80?"var(--warn-fg)":"var(--success-fg)"}}>{data.analysis.powerBudget.total_kw} kW</span>
              <span style={{fontSize:9,color:T.textMute}}>→ {data.analysis.powerBudget.recommended_minimum_kw} kW recommended minimum (30% headroom)</span>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {Object.entries(data.analysis.powerBudget.by_dept||{}).sort((a,b)=>b[1]-a[1]).map(([dept,w])=><div key={dept} style={{background:"var(--card-3)",borderRadius:6,padding:"5px 10px"}}>
                <div style={{fontSize:8,color:T.textMute,textTransform:"uppercase"}}>{dept}</div>
                <div style={{fontSize:11,fontWeight:700,fontFamily:MN,color:T.text}}>{Math.round(w/100)/10} kW</div>
              </div>)}
            </div>
            {data.analysis.powerBudget.missing_power_count>0&&<div style={{marginTop:8,fontSize:9,color:T.warnFg,background:"var(--warn-bg)",borderRadius:6,padding:"4px 8px"}}>{data.analysis.powerBudget.missing_power_count} item(s) missing power data — total may be understated</div>}
          </div>

          {/* Weight Ledger */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:14}}>
            <div style={{...UI.sectionLabel,marginBottom:10}}>Weight Ledger — Fly vs. Ground Split</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <div style={{background:"var(--accent-pill-bg)",borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
                <div style={{fontSize:8,color:T.accent,fontWeight:800,textTransform:"uppercase",marginBottom:4}}>Fly</div>
                <div style={{fontSize:20,fontWeight:800,fontFamily:MN,color:T.accent}}>{data.analysis.weightLedger.fly_kg} kg</div>
                <div style={{fontSize:9,color:"var(--accent-soft)"}}>{data.analysis.weightLedger.fly_item_count} item(s)</div>
              </div>
              <div style={{background:"var(--success-bg)",borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
                <div style={{fontSize:8,color:T.successFg,fontWeight:800,textTransform:"uppercase",marginBottom:4}}>Ground</div>
                <div style={{fontSize:20,fontWeight:800,fontFamily:MN,color:T.successFg}}>{data.analysis.weightLedger.ground_kg} kg</div>
                <div style={{fontSize:9,color:T.successFg}}>{data.analysis.weightLedger.ground_item_count} item(s)</div>
              </div>
              <div style={{background:"var(--warn-bg)",borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
                <div style={{fontSize:8,color:T.warnFg,fontWeight:800,textTransform:"uppercase",marginBottom:4}}>TBD</div>
                <div style={{fontSize:20,fontWeight:800,fontFamily:MN,color:T.warnFg}}>{data.analysis.weightLedger.tbd_count}</div>
                <div style={{fontSize:9,color:T.warnFg}}>items unclassified</div>
              </div>
            </div>
            {data.analysis.weightLedger.tbd_count>0&&<div style={{marginTop:8,fontSize:9,color:T.warnFg,background:"var(--warn-bg)",borderRadius:6,padding:"4px 8px"}}>Set positions in Manifest tab to complete weight split.</div>}
          </div>

          <div style={{fontSize:9,color:T.textMute,fontFamily:MN}}>Analyzed {new Date(data.analysis.analyzedAt).toLocaleString()} — re-run after position corrections</div>
        </>}
      </div>}

      {/* Issues tab */}
      {subTab==="issues"&&<div>
        {!(data.issues?.length)&&<div style={{padding:32,textAlign:"center",color:T.textMute,fontSize:10}}>
          {data.items?.length?<><div style={{marginBottom:8}}>No issues detected yet.</div><button onClick={runAnalysis} disabled={analyzing} style={{fontSize:10,fontWeight:700,padding:"5px 14px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer"}}>{analyzing?"Analyzing…":"Run Analysis"}</button></>:<div>Upload documents then run analysis to detect issues.</div>}
        </div>}
        {(data.issues||[]).map(issue=>{
          const sv=SEV_STYLES[issue.severity]||SEV_STYLES.LOW;
          return(
            <div key={issue.id} style={{background:issue.resolved?"var(--card-3)":"var(--card)",border:`1px solid ${issue.resolved?"var(--border)":sv.b}`,borderRadius:10,padding:"10px 12px",marginBottom:8,opacity:issue.resolved?0.6:1}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:4}}>
                <span style={{fontSize:8,fontWeight:800,padding:"2px 7px",borderRadius:10,background:sv.bg,color:sv.c,flexShrink:0}}>{issue.severity}</span>
                <span style={{fontSize:9,fontWeight:700,color:T.textDim,flexShrink:0}}>{issue.category}</span>
                <span style={{fontSize:9,fontWeight:700,color:T.text,flex:1}}>{issue.finding}</span>
                <button onClick={()=>resolveIssue(issue.id)} style={{fontSize:8,fontWeight:700,padding:"2px 8px",borderRadius:6,border:"1px solid var(--border)",background:issue.resolved?"var(--success-bg)":"var(--card)",color:issue.resolved?"var(--success-fg)":"var(--text-2)",cursor:"pointer",flexShrink:0}}>{issue.resolved?"✓ Resolved":"Resolve"}</button>
              </div>
              {issue.impact&&<div style={{fontSize:9,color:T.textDim,marginBottom:2}}><span style={{fontWeight:600}}>Impact:</span> {issue.impact}</div>}
              {issue.action&&<div style={{fontSize:9,color:T.text2}}><span style={{fontWeight:600}}>Action:</span> {issue.action}</div>}
            </div>
          );
        })}
        {data.issues?.length>0&&<div style={{marginTop:8,fontSize:9,color:T.textMute,fontFamily:MN}}>{data.issues.filter(i=>!i.resolved).length} open · {data.issues.filter(i=>i.resolved).length} resolved</div>}
      </div>}
    </div>
  );
}
