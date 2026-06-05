import { useState } from "react";
import { SEV_STYLES, checkRigVsVenue } from "../../DosApp.jsx";
import { MN, UI } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";
import { VBRow } from "./VBRow";
import { VBSection } from "./VBSection";

export function VenueBrief({vg,sel,data,upd}){
  const[newLinkLabel,setNewLinkLabel]=useState("");
  const[newLinkUrl,setNewLinkUrl]=useState("");
  const links=data.venueLinks||[];
  const addLink=()=>{
    if(!newLinkLabel.trim()||!newLinkUrl.trim())return;
    const url=newLinkUrl.trim().startsWith("http")?newLinkUrl.trim():`https://${newLinkUrl.trim()}`;
    upd({venueLinks:[...links,{id:`lnk_${Date.now()}`,label:newLinkLabel.trim(),url}]});
    setNewLinkLabel("");setNewLinkUrl("");
  };
  const removeLink=id=>upd({venueLinks:links.filter(l=>l.id!==id)});

  const LinkBlock=({compact})=>(
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:12,marginBottom:compact?0:10,textAlign:"left"}}>
      <div style={{...UI.sectionLabel,marginBottom:8}}>Document Links</div>
      {links.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
        {links.map(lnk=><div key={lnk.id} style={{display:"flex",alignItems:"center",gap:4,background:"var(--accent-pill-bg)",borderRadius:6,padding:"3px 8px"}}>
          <a href={lnk.url} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:T.accent,textDecoration:"none",fontWeight:600}}>{lnk.label} ↗</a>
          {!compact&&<button onClick={()=>removeLink(lnk.id)} style={{fontSize:11,color:T.textMute,background:"none",border:"none",cursor:"pointer",padding:"0 2px",lineHeight:1}}>×</button>}
        </div>)}
      </div>}
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <input value={newLinkLabel} onChange={e=>setNewLinkLabel(e.target.value)} placeholder="Label (e.g. Venue Tech Pack)" style={{...UI.input,flex:1,minWidth:120}} onKeyDown={e=>e.key==="Enter"&&addLink()}/>
        <input value={newLinkUrl} onChange={e=>setNewLinkUrl(e.target.value)} placeholder="Paste URL" style={{...UI.input,flex:2,minWidth:160}} onKeyDown={e=>e.key==="Enter"&&addLink()}/>
        <button onClick={addLink} disabled={!newLinkLabel.trim()||!newLinkUrl.trim()} style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",opacity:(!newLinkLabel.trim()||!newLinkUrl.trim())?0.4:1}}>Add</button>
      </div>
    </div>
  );

  if(!vg)return(
    <div style={{padding:32,textAlign:"center",color:T.textMute,fontSize:10}}>
      <div style={{fontSize:20,marginBottom:8}}>▤</div>
      <div style={{fontWeight:600,marginBottom:4}}>No venue brief on file</div>
      <div>This show date is not in the EU tour binder. Add document links below or upload vendor quotes.</div>
      <div style={{marginTop:16}}><LinkBlock/></div>
    </div>
  );

  const hasWarn=s=>s&&(s.startsWith("⚠")||s.includes("CRITICAL")||s.includes("NOT permitted")||s.includes("NO "));

  return(
    <div className="fi">
      {/* Flags banner */}
      {vg.flags&&<div style={{background:hasWarn(vg.flags)?"var(--danger-bg)":"var(--warn-bg)",border:`1px solid ${hasWarn(vg.flags)?"var(--danger-bg)":"var(--warn-bg)"}`,borderRadius:6,padding:"8px 12px",marginBottom:10,fontSize:10,color:hasWarn(vg.flags)?"var(--danger-fg)":"var(--warn-fg)",lineHeight:1.5}}><span style={{fontWeight:800}}>FLAGS: </span>{vg.flags}</div>}

      {/* Document links */}
      <LinkBlock/>
      {vg.advanceEmail&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,marginTop:-4}}>
        <a href={`mailto:${vg.advanceEmail}`} style={{fontSize:9,color:T.accent,background:"var(--accent-pill-bg)",padding:"2px 8px",borderRadius:6,textDecoration:"none",fontWeight:600}}>{vg.advanceContact||"Advance"} ✉</a>
        {vg.techContact&&vg.techContact.includes("@")&&<a href={`mailto:${vg.techContact.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]}`} style={{fontSize:9,color:T.successFg,background:"var(--success-bg)",padding:"2px 8px",borderRadius:6,textDecoration:"none",fontWeight:600}}>Tech Contact ✉</a>}
      </div>}

      <div style={{display:"grid",gridTemplateColumns:window.innerWidth>600?"1fr 1fr":"1fr",gap:0}}>
        <div style={{paddingRight:6}}>
          {/* Venue info */}
          <VBSection title="Venue" accent="var(--link)">
            <VBRow label="Capacity" value={vg.capacity?.toLocaleString()}/>
            <VBRow label="Address" value={vg.address}/>
            <VBRow label="Design Ver" value={vg.designVer}/>
            <VBRow label="Advance" value={vg.advanceContact&&`${vg.advanceContact}${vg.advanceEmail?` — `+vg.advanceEmail:""}`}/>
            <VBRow label="Tech Contact" value={vg.techContact}/>
          </VBSection>

          {/* Load */}
          <VBSection title="Load Dock / In-Out" accent="var(--success-fg)">
            <VBRow label="Load Dock" value={vg.loadDock}/>
            <VBRow label="Load In/Out" value={vg.loadIn}/>
          </VBSection>

          {/* Stage */}
          <VBSection title="Stage & Rigging" accent="var(--accent)">
            <VBRow label="Stage Dims" value={vg.stageDims}/>
            <VBRow label="Rigging" value={vg.rigging}/>
            <VBRow label="Rigging Notes" value={vg.riggingNotes}/>
          </VBSection>

          {/* Power */}
          <VBSection title="Venue Power" accent="var(--warn-fg)">
            <VBRow label="Power" value={vg.venuePower} warn={hasWarn(vg.venuePower)}/>
            <VBRow label="Bus/Shore" value={vg.busPower} warn={hasWarn(vg.busPower)}/>
            <VBRow label="Sound Limit" value={vg.soundLimit}/>
          </VBSection>
        </div>

        <div style={{paddingLeft:6}}>
          {/* LED */}
          <VBSection title="LED / Video" accent="var(--info-fg)">
            <VBRow label="LED Notes" value={vg.ledNotes} warn={hasWarn(vg.ledNotes)}/>
          </VBSection>

          {/* LX */}
          <VBSection title="Lighting" accent="var(--accent-soft)">
            <VBRow label="LX Notes" value={vg.lxNotes}/>
          </VBSection>

          {/* Audio */}
          <VBSection title="Audio" accent="var(--success-fg)">
            <VBRow label="Audio Notes" value={vg.audioNotes} warn={hasWarn(vg.audioNotes)}/>
          </VBSection>

          {/* SFX */}
          <VBSection title="SFX & Compliance" accent="var(--danger-fg)">
            {[["CO2",vg.co2],["Flames",vg.flames],["Pyro",vg.pyro],["Confetti",vg.confetti]].filter(([,v])=>v).map(([k,v])=><VBRow key={k} label={k} value={v} warn={hasWarn(v)}/>)}
            <VBRow label="SFX Notes" value={vg.sfxNotes} warn={hasWarn(vg.sfxNotes)}/>
          </VBSection>
        </div>
      </div>

      {/* Venue compatibility */}
      {(()=>{
        const rigChecks=checkRigVsVenue(vg);
        const rigCritical=rigChecks.filter(i=>i.severity==="CRITICAL").length;
        const rigHigh=rigChecks.filter(i=>i.severity==="HIGH").length;
        return(
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:12,marginBottom:8,marginTop:4}}>
            <div style={{...UI.sectionLabel,marginBottom:4}}>Venue Compatibility — {vg.venue}</div>
            <div style={{fontSize:9,color:T.textDim,marginBottom:8}}>
              {[vg.stageDims&&`Stage: ${vg.stageDims.slice(0,80)}`,vg.rigging&&`Rigging: ${vg.rigging.slice(0,60)}`].filter(Boolean).map((s,i)=><div key={i} style={{fontFamily:MN}}>{s}</div>)}
            </div>
            {rigChecks.length===0&&<div style={{padding:"16px 0",textAlign:"center"}}>
              <div style={{fontSize:20,marginBottom:4}}>✓</div>
              <div style={{fontSize:11,fontWeight:700,color:T.successFg}}>No compatibility issues detected</div>
              <div style={{fontSize:9,color:T.textMute,marginTop:4}}>Parameters on file are compatible with touring rig. Advance TBC items per fields above.</div>
            </div>}
            {rigChecks.length>0&&<div style={{display:"flex",flexDirection:"column",gap:6}}>
              {[...rigChecks].sort((a,b)=>({CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3}[a.severity]-{CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3}[b.severity])).map(issue=>{
                const sv=SEV_STYLES[issue.severity]||SEV_STYLES.LOW;
                return(
                  <div key={issue.id} style={{background:issue.severity==="CRITICAL"?"var(--danger-bg)":issue.severity==="HIGH"?"var(--warn-bg)":"var(--card)",border:`1px solid ${sv.b}`,borderRadius:10,padding:"8px 10px"}}>
                    <div style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:3}}>
                      <span style={{fontSize:8,fontWeight:800,padding:"1px 6px",borderRadius:10,background:sv.bg,color:sv.c,flexShrink:0}}>{issue.severity}</span>
                      <span style={{fontSize:8,fontWeight:700,color:T.textDim,flexShrink:0}}>{issue.category}</span>
                      <span style={{fontSize:9,fontWeight:600,color:T.text,flex:1}}>{issue.finding}</span>
                    </div>
                    <div style={{fontSize:8,color:T.text2}}><span style={{fontWeight:600}}>Action:</span> {issue.action}</div>
                  </div>
                );
              })}
              <div style={{fontSize:8,color:T.textMute,fontFamily:MN,marginTop:2}}>
                {rigCritical>0&&<span style={{color:"var(--danger-fg)",fontWeight:700,marginRight:6}}>{rigCritical} CRITICAL</span>}
                {rigHigh>0&&<span style={{color:T.warnFg,fontWeight:700,marginRight:6}}>{rigHigh} HIGH</span>}
                Based on venue data on file. Some flags may resolve via advance.
              </div>
            </div>}
          </div>
        );
      })()}

    </div>
  );
}
