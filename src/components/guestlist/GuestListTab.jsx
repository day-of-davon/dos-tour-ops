import { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { GL_BUILTIN_TEMPLATE_ID, GL_DEFAULT_SHOW, GL_PARTY_ROLES, GL_STATUS, glAppendActivity, glApplyTemplate, glBuildTemplate, glBuiltinTemplate, glInitFromTemplate, glNewId } from "../../lib/guestlist";
import { T } from "../../styles/tokens";
import { useAuth } from "../AuthGate";
import { GLMetric } from "./GLMetric";
import { GuestListAllShows } from "./GuestListAllShows";

export function GuestListTab(){
  const{guestlists,uGuestlist,glTemplates,setGlTemplates,sel,setSel,eventKey,sorted,shows,mobile,crew,role,allShows}=useContext(Ctx);
  if(allShows)return<GuestListAllShows/>;
  const a=useAuth();
  const by=(a?.user?.email||"unknown").toLowerCase();
  const allTemplates=useMemo(()=>[glBuiltinTemplate(),...Object.values(glTemplates||{}).sort((a,b)=>(a.name||"").localeCompare(b.name||""))],[glTemplates]);
  const[configTplId,setConfigTplId]=useState(GL_BUILTIN_TEMPLATE_ID);
  const[tplMenu,setTplMenu]=useState(false);
  const[tplSaveName,setTplSaveName]=useState("");
  const[activityOpen,setActivityOpen]=useState(false);
  const[categoriesOpen,setCategoriesOpen]=useState(false);
  const showDates=useMemo(()=>(sorted||[]).filter(s=>s.type!=="off"&&s.type!=="travel"&&s.type!=="split").map(s=>s.date),[sorted]);
  const date=sel&&shows?.[sel]?sel:(showDates[0]||sel);
  const show=shows?.[date];
  const glKey=eventKey||(sel&&shows?.[sel]?sel:(showDates[0]||sel));
  const gl=guestlists[glKey]||GL_DEFAULT_SHOW();
  const glExists=!!guestlists[glKey];
  const[addParty,setAddParty]=useState(false);
  const[partyForm,setPartyForm]=useState({name:"",role:"manager",contact:""});
  const[expandedParty,setExpandedParty]=useState(null);

  const statusMeta=GL_STATUS.find(s=>s.id===gl.status)||GL_STATUS[0];
  const parties=gl.parties||{};
  const partyList=Object.entries(parties);

  const categoryUsage=useMemo(()=>{
    const m={};
    gl.categories.forEach(c=>{m[c.id]={qty:c.qty||0,used:0,checkedIn:0,walkOn:c.walkOnQty||0};});
    partyList.forEach(([,p])=>{
      (p.entries||[]).forEach(e=>{
        if(!m[p.categoryId])return;
        const seats=1+(e.plusOne?1:0);
        m[p.categoryId].used+=seats;
        if(e.status==="checked_in")m[p.categoryId].checkedIn+=seats;
      });
    });
    return m;
  },[gl.categories,partyList]);

  const totals=useMemo(()=>{
    let allot=0,used=0,checkedIn=0;
    gl.categories.forEach(c=>{allot+=c.qty||0;});
    Object.values(categoryUsage).forEach(u=>{used+=u.used;checkedIn+=u.checkedIn;});
    return{allot,used,checkedIn};
  },[gl.categories,categoryUsage]);

  const logEntry=(kind,label,meta)=>({id:glNewId("act"),at:new Date().toISOString(),by,role,kind,label,meta:meta||null});
  const mutate=(kind,label,mut,meta)=>uGuestlist(glKey,cur=>{
    const base=typeof mut==="function"?mut(cur||GL_DEFAULT_SHOW()):{...(cur||GL_DEFAULT_SHOW()),...mut};
    return{...base,activity:glAppendActivity(base.activity,logEntry(kind,label,meta))};
  });
  const logOnly=(kind,label,meta)=>uGuestlist(glKey,cur=>({...cur,activity:glAppendActivity(cur?.activity,logEntry(kind,label,meta))}));

  function initShow(){
    const tpl=allTemplates.find(t=>t.id===configTplId)||glBuiltinTemplate();
    mutate("show.init",`Initialized from template "${tpl.name}"`,()=>glInitFromTemplate(tpl),{templateId:tpl.id,templateName:tpl.name});
  }
  function saveAsTemplate(){
    const name=(tplSaveName||`${show?.venue||"Show"} ${date}`).trim();
    if(!name)return;
    const tpl=glBuildTemplate(name,gl);
    setGlTemplates(p=>({...p,[tpl.id]:tpl}));
    mutate("template.save",`Saved template "${tpl.name}"`,{templateId:tpl.id},{templateId:tpl.id,templateName:tpl.name,categories:tpl.categories.length});
    setTplSaveName("");setTplMenu(false);
  }
  function applyTemplate(tplId){
    const tpl=allTemplates.find(t=>t.id===tplId);
    if(!tpl)return;
    if(partyList.length&&!confirm(`Apply template "${tpl.name}"? Existing categories will be replaced. Parties will be re-mapped.`))return;
    mutate("template.apply",`Applied template "${tpl.name}"`,cur=>glApplyTemplate(cur||glInitFromTemplate(tpl),tpl),{templateId:tpl.id,templateName:tpl.name});
    setTplMenu(false);
  }
  function deleteTemplate(tplId){
    const tpl=glTemplates[tplId];
    if(!tpl||!confirm(`Delete template "${tpl.name}"?`))return;
    setGlTemplates(p=>{const n={...p};delete n[tplId];return n;});
    logOnly("template.delete",`Deleted template "${tpl.name}"`,{templateId:tplId,templateName:tpl.name});
  }
  function updateCat(cid,patch){
    const prev=gl.categories.find(c=>c.id===cid);
    mutate("category.update",`Edited category ${prev?.name||cid}`,cur=>({...cur,categories:cur.categories.map(c=>c.id===cid?{...c,...patch}:c)}),{categoryId:cid,patch});
  }
  function addCategory(){
    const nc={id:glNewId("cat"),name:"New Category",side:"artist",zones:["FOH"],qty:2,walkOnQty:0};
    mutate("category.add",`Added category "${nc.name}"`,cur=>({...cur,categories:[...cur.categories,nc]}),{categoryId:nc.id});
  }
  function removeCategory(cid){
    const prev=gl.categories.find(c=>c.id===cid);
    mutate("category.remove",`Removed category "${prev?.name||cid}"`,cur=>({...cur,categories:cur.categories.filter(c=>c.id!==cid)}),{categoryId:cid});
  }
  function setStatus(s){
    const prev=gl.status;
    mutate("show.status",`Status: ${prev} → ${s}`,{status:s},{from:prev,to:s});
  }
  function setCutoff(v){mutate("show.cutoff",v?`Cutoff set ${v}`:"Cutoff cleared",{cutoffAt:v},{cutoffAt:v});}
  function setWalkOnCap(v){const n=parseInt(v)||0;mutate("show.walkOnCap",`Walk-on cap: ${n}`,{walkOnCap:n},{walkOnCap:n});}
  function setNotes(v){mutate("show.notes",`Notes updated`,{notes:v});}

  function createParty(){
    if(!partyForm.name.trim())return;
    const partyRole=GL_PARTY_ROLES.find(r=>r.id===partyForm.role)||GL_PARTY_ROLES[0];
    const pid=glNewId("party");
    const name=partyForm.name.trim();
    mutate("party.create",`Added party "${name}" (${partyRole.label})`,cur=>({...cur,parties:{...cur.parties,[pid]:{name,role:partyRole.id,side:partyRole.side,contact:partyForm.contact.trim(),categoryId:partyRole.defaultCategory,entries:[]}}}),{partyId:pid,partyName:name,role:partyRole.id});
    setPartyForm({name:"",role:"manager",contact:""});setAddParty(false);setExpandedParty(pid);
  }
  function updateParty(pid,patch){
    const prev=gl.parties[pid];
    mutate("party.update",`Edited party "${prev?.name||pid}"`,cur=>({...cur,parties:{...cur.parties,[pid]:{...cur.parties[pid],...patch}}}),{partyId:pid,patch});
  }
  function removeParty(pid){
    const prev=gl.parties[pid];
    mutate("party.remove",`Removed party "${prev?.name||pid}"`,cur=>{const n={...cur.parties};delete n[pid];return{...cur,parties:n};},{partyId:pid,partyName:prev?.name});
  }
  function addEntry(pid){
    const e={id:glNewId("e"),name:"",plusOne:false,note:"",status:"pending",isWalkOn:false};
    const party=gl.parties[pid];
    mutate("entry.add",`Added entry to "${party?.name||pid}"`,cur=>({...cur,parties:{...cur.parties,[pid]:{...cur.parties[pid],entries:[...(cur.parties[pid].entries||[]),e]}}}),{partyId:pid,entryId:e.id});
  }
  function updateEntry(pid,eid,patch){
    const party=gl.parties[pid];
    const prev=party?.entries?.find(e=>e.id===eid);
    const statusChanged=patch.status&&prev?.status!==patch.status;
    const nameChanged="name" in patch&&prev?.name!==patch.name;
    const kind=statusChanged?(patch.status==="checked_in"?"entry.checkin":"entry.status"):(nameChanged?"entry.rename":"entry.update");
    const label=statusChanged?`${prev?.name||"Guest"}: ${prev?.status||"pending"} → ${patch.status}`:(nameChanged?`Renamed entry "${prev?.name||""}" → "${patch.name}"`:`Edited entry "${prev?.name||eid}"`);
    mutate(kind,label,cur=>({...cur,parties:{...cur.parties,[pid]:{...cur.parties[pid],entries:cur.parties[pid].entries.map(e=>e.id===eid?{...e,...patch}:e)}}}),{partyId:pid,entryId:eid,patch});
  }
  function removeEntry(pid,eid){
    const party=gl.parties[pid];
    const prev=party?.entries?.find(e=>e.id===eid);
    mutate("entry.remove",`Removed entry "${prev?.name||eid}" from "${party?.name||pid}"`,cur=>({...cur,parties:{...cur.parties,[pid]:{...cur.parties[pid],entries:cur.parties[pid].entries.filter(e=>e.id!==eid)}}}),{partyId:pid,entryId:eid});
  }

  function exportDoorList(){
    const rows=[];
    partyList.forEach(([,p])=>{
      const cat=gl.categories.find(c=>c.id===p.categoryId);
      (p.entries||[]).forEach(e=>{
        rows.push({name:e.name,plusOne:e.plusOne,category:cat?.name||"",zones:cat?.zones?.join("/")||"",submittedBy:p.name,status:e.status,note:e.note});
        if(e.plusOne)rows.push({name:`${e.name} +1`,plusOne:false,category:cat?.name||"",zones:cat?.zones?.join("/")||"",submittedBy:p.name,status:e.status,note:""});
      });
    });
    rows.sort((a,b)=>a.name.localeCompare(b.name));
    const payload={show:show?.venue||"",city:show?.city||"",date,status:gl.status,cutoffAt:gl.cutoffAt,totals,door:rows};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`guestlist_${date}_${(show?.venue||"").replace(/\s+/g,"_")}.json`;a.click();URL.revokeObjectURL(url);
    logOnly("door.export",`Exported door list (${rows.length} rows)`,{rows:rows.length});
  }

  if(!show){
    return<div style={{flex:1,padding:mobile?"10px 8px":"14px 16px",color:T.textDim,fontSize:11}}>
      Select a show date from the sidebar to manage its guest list.
      {showDates.length>0&&<div style={{marginTop:8}}><button onClick={()=>setSel(showDates[0])} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Go to {showDates[0]}</button></div>}
    </div>;
  }

  return(
    <div style={{flex:1,overflowY:"auto",padding:mobile?"10px 8px":"14px 16px",display:"flex",flexDirection:"column",gap:14,minWidth:0,background:"var(--bg)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:T.text,letterSpacing:"-0.02em"}}>{show.venue} · {show.city}</div>
          <div style={{fontSize:10,color:T.textDim,marginTop:1,fontFamily:MN}}>{new Date(date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"})}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          {glExists&&<>
            <span style={{fontSize:9,fontWeight:700,color:statusMeta.color,background:statusMeta.bg,border:`1px solid ${statusMeta.color}`,borderRadius:6,padding:"3px 8px",letterSpacing:"0.05em"}}>{statusMeta.label.toUpperCase()}</span>
            <select value={gl.status} onChange={e=>setStatus(e.target.value)} style={{background:"var(--card)",color:T.text,border:"1px solid var(--border)",borderRadius:6,padding:"4px 6px",fontSize:10}}>
              {GL_STATUS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button onClick={()=>setTplMenu(v=>!v)} style={{background:"transparent",color:T.text2,border:"1px solid var(--border)",borderRadius:6,padding:"6px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>Templates</button>
            <button onClick={exportDoorList} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Export Door List</button>
          </>}
        </div>
      </div>

      {!glExists&&<div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"16px 16px",display:"flex",flexDirection:"column",gap:12}}>
        <div>
          <div style={{fontSize:11,fontWeight:800,color:T.text,letterSpacing:"-0.01em"}}>Configure Guest List</div>
          <div style={{fontSize:10,color:T.textDim,marginTop:3}}>Pick a starting template. Categories and caps can be edited after init.</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1fr auto",gap:8,alignItems:"end"}}>
          <label style={{display:"flex",flexDirection:"column",gap:4}}>
            <span style={{fontSize:9,color:T.textDim,letterSpacing:"0.05em"}}>TEMPLATE</span>
            <select value={configTplId} onChange={e=>setConfigTplId(e.target.value)} style={{background:"var(--bg)",color:T.text,border:"1px solid var(--border)",borderRadius:6,padding:"7px 9px",fontSize:11}}>
              {allTemplates.map(t=><option key={t.id} value={t.id}>{t.name}{t.builtin?" · built-in":""} · {(t.categories||[]).length} cats</option>)}
            </select>
          </label>
          <button onClick={initShow} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"8px 14px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Initialize Show</button>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4,fontSize:9,color:T.textMute,fontFamily:MN}}>
          {(allTemplates.find(t=>t.id===configTplId)?.categories||[]).map(c=><span key={c.id} style={{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:4,padding:"2px 6px"}}>{c.name} · {c.qty}</span>)}
        </div>
      </div>}

      {glExists&&tplMenu&&<div style={{background:"var(--card)",border:"1px solid var(--accent)",borderRadius:10,padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
        <div style={{fontSize:10,fontWeight:800,color:T.textDim,letterSpacing:"0.08em"}}>TEMPLATES</div>
        <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"2fr 1fr",gap:8,alignItems:"end"}}>
          <label style={{display:"flex",flexDirection:"column",gap:4}}>
            <span style={{fontSize:9,color:T.textDim,letterSpacing:"0.05em"}}>SAVE CURRENT CONFIG AS TEMPLATE</span>
            <input value={tplSaveName} onChange={e=>setTplSaveName(e.target.value)} placeholder={`${show?.venue||"Show"} ${date}`} style={{background:"var(--bg)",color:T.text,border:"1px solid var(--border)",borderRadius:6,padding:"6px 8px",fontSize:11}}/>
          </label>
          <button onClick={saveAsTemplate} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"7px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Save as Template</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:200,overflowY:"auto"}}>
          {allTemplates.map(t=>{
            const active=gl.templateId===t.id;
            return<div key={t.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,alignItems:"center",background:active?"var(--accent-pill-bg)":"var(--bg)",border:`1px solid ${active?"var(--accent)":"var(--border)"}`,borderRadius:6,padding:"6px 8px"}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.text}}>{t.name}{t.builtin&&<span style={{marginLeft:6,fontSize:8,color:T.link,fontFamily:MN}}>BUILT-IN</span>}{active&&<span style={{marginLeft:6,fontSize:8,color:T.successFg,fontFamily:MN}}>ACTIVE</span>}</div>
                <div style={{fontSize:9,color:T.textMute,fontFamily:MN,marginTop:1}}>{(t.categories||[]).length} categories · walk-on cap {t.walkOnCap??10}</div>
              </div>
              <button onClick={()=>applyTemplate(t.id)} style={{background:"transparent",color:T.link,border:"1px solid var(--accent)",borderRadius:4,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>Apply</button>
              {!t.builtin?<button onClick={()=>deleteTemplate(t.id)} style={{background:"transparent",color:T.textMute,border:"1px solid var(--border)",borderRadius:4,padding:"4px 8px",fontSize:10,cursor:"pointer"}}>Delete</button>:<span style={{width:38}}/>}
            </div>;
          })}
        </div>
      </div>}

      {glExists&&<>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          <GLMetric label="Allotment" value={totals.allot}/>
          <GLMetric label="Submitted" value={totals.used} sub={totals.allot?`${Math.round(totals.used/totals.allot*100)}%`:""}/>
          <GLMetric label="Checked In" value={totals.checkedIn}/>
          <GLMetric label="Remaining" value={Math.max(0,totals.allot-totals.used)}/>
        </div>

        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:10}}>
            <span style={{fontSize:10,fontWeight:800,color:T.textDim,letterSpacing:"0.08em"}}>SHOW CONFIG</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"repeat(3,1fr)",gap:10}}>
            <label style={{display:"flex",flexDirection:"column",gap:3}}>
              <span style={{fontSize:9,color:T.textDim,letterSpacing:"0.05em"}}>CUTOFF</span>
              <input type="datetime-local" value={gl.cutoffAt||""} onChange={e=>setCutoff(e.target.value)} style={{background:"var(--bg)",color:T.text,border:"1px solid var(--border)",borderRadius:6,padding:"5px 7px",fontSize:11,fontFamily:MN}}/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:3}}>
              <span style={{fontSize:9,color:T.textDim,letterSpacing:"0.05em"}}>WALK-ON CAP</span>
              <input type="number" value={gl.walkOnCap??0} onChange={e=>setWalkOnCap(e.target.value)} style={{background:"var(--bg)",color:T.text,border:"1px solid var(--border)",borderRadius:6,padding:"5px 7px",fontSize:11,fontFamily:MN}}/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:3}}>
              <span style={{fontSize:9,color:T.textDim,letterSpacing:"0.05em"}}>NOTES</span>
              <input type="text" value={gl.notes||""} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Venue hard cap 500" style={{background:"var(--bg)",color:T.text,border:"1px solid var(--border)",borderRadius:6,padding:"5px 7px",fontSize:11}}/>
            </label>
          </div>
        </div>

        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:10}}>
            <span style={{fontSize:10,fontWeight:800,color:T.textDim,letterSpacing:"0.08em"}}>PARTIES · {partyList.length}</span>
            <button onClick={()=>setAddParty(v=>!v)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>{addParty?"Cancel":"+ Party"}</button>
          </div>
          {addParty&&<div style={{background:"var(--bg)",border:"1px solid var(--accent)",borderRadius:6,padding:10,marginBottom:10,display:"grid",gridTemplateColumns:mobile?"1fr":"2fr 1.2fr 2fr auto",gap:6,alignItems:"center"}}>
            <input autoFocus placeholder="Party name (e.g. Alex Gumuchian)" value={partyForm.name} onChange={e=>setPartyForm(f=>({...f,name:e.target.value}))} style={{background:"var(--card)",color:T.text,border:"1px solid var(--border)",borderRadius:6,padding:"5px 7px",fontSize:11}}/>
            <select value={partyForm.role} onChange={e=>setPartyForm(f=>({...f,role:e.target.value}))} style={{background:"var(--card)",color:T.text,border:"1px solid var(--border)",borderRadius:6,padding:"5px 7px",fontSize:11}}>
              {GL_PARTY_ROLES.map(r=><option key={r.id} value={r.id}>{r.label} ({r.side})</option>)}
            </select>
            <input placeholder="Contact email" value={partyForm.contact} onChange={e=>setPartyForm(f=>({...f,contact:e.target.value}))} style={{background:"var(--card)",color:T.text,border:"1px solid var(--border)",borderRadius:6,padding:"5px 7px",fontSize:11,fontFamily:MN}}/>
            <button onClick={createParty} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Add</button>
          </div>}
          {partyList.length===0&&<div style={{fontSize:10,color:T.textMute,textAlign:"center",padding:"12px 8px"}}>No parties yet. Add a party to start collecting entries.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {partyList.map(([pid,p])=>{
              const cat=gl.categories.find(c=>c.id===p.categoryId);
              const used=(p.entries||[]).reduce((s,e)=>s+1+(e.plusOne?1:0),0);
              const expanded=expandedParty===pid;
              const sideColor=p.side==="venue"?"var(--info-fg)":"var(--accent-soft)";
              return<div key={pid} style={{background:"var(--bg)",border:`1px solid ${expanded?sideColor:"var(--border)"}`,borderRadius:6,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",cursor:"pointer"}} onClick={()=>setExpandedParty(expanded?null:pid)}>
                  <span style={{fontSize:8,fontWeight:800,color:sideColor,background:p.side==="venue"?"var(--info-bg)":"var(--accent-pill-bg)",border:`1px solid ${sideColor}`,borderRadius:4,padding:"1px 5px",letterSpacing:"0.06em"}}>{p.side.toUpperCase()}</span>
                  <span style={{fontSize:11,fontWeight:700,color:T.text,flex:1}}>{p.name}</span>
                  <span style={{fontSize:10,color:T.textDim,fontFamily:MN}}>{cat?.name||"—"}</span>
                  <span style={{fontSize:10,color:used>(cat?.qty||0)?"var(--danger-fg)":"var(--text-dim)",fontFamily:MN}}>{used}/{cat?.qty||0}</span>
                  <span style={{fontSize:10,color:T.textMute}}>{expanded?"▾":"▸"}</span>
                </div>
                {expanded&&<div style={{padding:"0 10px 10px 10px",display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid var(--border)"}}>
                  <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1.5fr 2fr auto",gap:6,alignItems:"center",marginTop:8}}>
                    <select value={p.categoryId||""} onChange={e=>updateParty(pid,{categoryId:e.target.value})} style={{background:"var(--card)",color:T.text,border:"1px solid var(--border)",borderRadius:6,padding:"4px 6px",fontSize:10}}>
                      {gl.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input value={p.contact||""} onChange={e=>updateParty(pid,{contact:e.target.value})} placeholder="contact email" style={{background:"var(--card)",color:T.text2,border:"1px solid var(--border)",borderRadius:6,padding:"4px 6px",fontSize:10,fontFamily:MN}}/>
                    <button onClick={()=>{if(confirm(`Remove ${p.name}?`))removeParty(pid);}} style={{background:"transparent",color:"var(--danger-fg)",border:"1px solid var(--border)",borderRadius:6,padding:"4px 10px",fontSize:10,cursor:"pointer"}}>Remove party</button>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {(p.entries||[]).map(e=>{
                      const checked=e.status==="checked_in";
                      return<div key={e.id} style={{display:"grid",gridTemplateColumns:mobile?"1fr auto":"24px 2fr 60px 2fr 90px 24px",gap:6,alignItems:"center",background:checked?"var(--success-bg)":"var(--card)",border:`1px solid ${checked?"var(--success-fg)":"var(--border)"}`,borderRadius:6,padding:"5px 7px"}}>
                        <input type="checkbox" checked={checked} onChange={ev=>updateEntry(pid,e.id,{status:ev.target.checked?"checked_in":"pending",checkedInAt:ev.target.checked?new Date().toISOString():null})} style={{accentColor:"var(--success-fg)",cursor:"pointer"}}/>
                        <input value={e.name} onChange={ev=>updateEntry(pid,e.id,{name:ev.target.value})} placeholder="Guest name" style={{background:"transparent",color:T.text,border:"none",fontSize:11,padding:2}}/>
                        <label style={{fontSize:10,color:T.textDim,display:"flex",alignItems:"center",gap:4,fontFamily:MN,cursor:"pointer"}}>
                          <input type="checkbox" checked={!!e.plusOne} onChange={ev=>updateEntry(pid,e.id,{plusOne:ev.target.checked})} style={{accentColor:"var(--accent)",cursor:"pointer"}}/>+1
                        </label>
                        <input value={e.note||""} onChange={ev=>updateEntry(pid,e.id,{note:ev.target.value})} placeholder="note (dietary, access, …)" style={{background:"transparent",color:T.text2,border:"none",fontSize:10,padding:2}}/>
                        <select value={e.status} onChange={ev=>updateEntry(pid,e.id,{status:ev.target.value})} style={{background:"var(--bg)",color:T.text2,border:"1px solid var(--border)",borderRadius:4,padding:"2px 4px",fontSize:9}}>
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="checked_in">Checked In</option>
                          <option value="no_show">No Show</option>
                          <option value="denied">Denied</option>
                        </select>
                        <button onClick={()=>removeEntry(pid,e.id)} style={{background:"transparent",color:T.textMute,border:"none",fontSize:13,cursor:"pointer",padding:0}}>×</button>
                      </div>;
                    })}
                  </div>
                  <button onClick={()=>addEntry(pid)} style={{alignSelf:"flex-start",background:"transparent",color:"var(--accent-soft)",border:"1px dashed var(--accent)",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:600,cursor:"pointer"}}>+ Entry</button>
                </div>}
              </div>;
            })}
          </div>
        </div>

        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,cursor:"pointer"}} onClick={()=>setCategoriesOpen(v=>!v)}>
            <span style={{fontSize:10,fontWeight:800,color:T.textDim,letterSpacing:"0.08em"}}>CATEGORIES · {gl.categories.length}</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={e=>{e.stopPropagation();setCategoriesOpen(true);addCategory();}} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:T.text2,cursor:"pointer"}}>+ Category</button>
              <span style={{fontSize:10,color:T.textMute}}>{categoriesOpen?"▾":"▸"}</span>
            </div>
          </div>
          {categoriesOpen&&<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:6}}>
            {gl.categories.map(c=>{
              const u=categoryUsage[c.id]||{used:0,checkedIn:0};
              const over=u.used>c.qty;
              return<div key={c.id} style={{display:"grid",gridTemplateColumns:mobile?"1fr auto":"1.5fr 2fr 70px 70px 90px 24px",gap:6,alignItems:"center",background:"var(--bg)",border:`1px solid ${over?"var(--danger-fg)":"var(--border)"}`,borderRadius:6,padding:"6px 8px"}}>
                <input value={c.name} onChange={e=>updateCat(c.id,{name:e.target.value})} style={{background:"transparent",color:T.text,border:"none",fontSize:11,fontWeight:600,padding:2}}/>
                <input value={(c.zones||[]).join(", ")} onChange={e=>updateCat(c.id,{zones:e.target.value.split(",").map(x=>x.trim()).filter(Boolean)})} placeholder="FOH, BS" style={{background:"transparent",color:T.text2,border:"none",fontSize:10,fontFamily:MN,padding:2}}/>
                <input type="number" value={c.qty} onChange={e=>updateCat(c.id,{qty:parseInt(e.target.value)||0})} style={{background:"var(--card)",color:T.text,border:"1px solid var(--border)",borderRadius:4,padding:"3px 5px",fontSize:10,fontFamily:MN,width:"100%"}}/>
                <input type="number" value={c.walkOnQty||0} onChange={e=>updateCat(c.id,{walkOnQty:parseInt(e.target.value)||0})} placeholder="WO" style={{background:"var(--card)",color:T.text,border:"1px solid var(--border)",borderRadius:4,padding:"3px 5px",fontSize:10,fontFamily:MN,width:"100%"}}/>
                <span style={{fontSize:10,fontFamily:MN,color:over?"var(--danger-fg)":"var(--text-dim)",textAlign:"right"}}>{u.used}/{c.qty} <span style={{color:T.textMute}}>· {u.checkedIn}✓</span></span>
                <button onClick={()=>removeCategory(c.id)} style={{background:"transparent",color:T.textMute,border:"none",fontSize:13,cursor:"pointer",padding:0}}>×</button>
              </div>;
            })}
          </div>}
        </div>

        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,cursor:"pointer"}} onClick={()=>setActivityOpen(v=>!v)}>
            <span style={{fontSize:10,fontWeight:800,color:T.textDim,letterSpacing:"0.08em"}}>ACTIVITY · {(gl.activity||[]).length}</span>
            <span style={{fontSize:10,color:T.textMute}}>{activityOpen?"▾":"▸"}</span>
          </div>
          {activityOpen&&<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:4,maxHeight:320,overflowY:"auto"}}>
            {(gl.activity||[]).length===0&&<div style={{fontSize:10,color:T.textMute,padding:"6px 2px"}}>No activity yet.</div>}
            {[...(gl.activity||[])].reverse().map(ev=>{
              const when=new Date(ev.at);
              const whenLabel=`${when.toLocaleDateString(undefined,{month:"short",day:"numeric"})} ${when.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}`;
              const kindColor=ev.kind?.startsWith("entry.checkin")?"var(--success-fg)":ev.kind?.startsWith("entry.remove")||ev.kind?.startsWith("party.remove")||ev.kind?.startsWith("category.remove")?"var(--danger-fg)":ev.kind?.startsWith("template")?"var(--link)":ev.kind?.startsWith("show.status")?"var(--warn-fg)":"var(--text-dim)";
              return<div key={ev.id} style={{display:"grid",gridTemplateColumns:mobile?"1fr":"90px 110px 1fr 110px",gap:8,alignItems:"center",background:"var(--bg)",border:"1px solid var(--card-2)",borderRadius:6,padding:"5px 8px",fontSize:10,fontFamily:MN}}>
                <span style={{color:T.textMute}}>{whenLabel}</span>
                <span style={{color:kindColor,fontWeight:700,fontSize:9,letterSpacing:"0.04em"}}>{ev.kind}</span>
                <span style={{color:"var(--text-3)",fontFamily:"'Outfit',system-ui",fontSize:10}}>{ev.label}</span>
                <span style={{color:T.textMute,textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.by}{ev.role?` · ${ev.role}`:""}</span>
              </div>;
            })}
          </div>}
        </div>
      </>}
    </div>
  );
}
