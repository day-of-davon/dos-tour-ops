import React, { useContext, useEffect, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { TM_EMAILS } from "../../lib/constants";
import { AT, CLIENTS, CM, MN, ROLES, TABS } from "../../lib/domain-constants";
import { showIdFor } from "../../lib/intel";
import { dU, fD } from "../../lib/time";
import { T } from "../../styles/tokens";
import { useAuth } from "../AuthGate";
import { UserMenu } from "./UserMenu";

export function TopBar({ss}){
  const{tab,setTab,role,setRole,setCmd,next,aC,setAC,setExp,sel,setSel,shows,sorted,tourDaysSorted,orderedTabs,reorderTabs,setUploadOpen,sidebarOpen,setSidebarOpen,showOffDays,mobile,tourStart,tourEnd,setTourStart,setTourEnd,advances,finance,intel,cShows,currentSplit,activeSplitParty,perms,me,commentMode,setCommentMode,showPickerOpen,setShowPickerOpen,allShows,setAllShows,userTypes,userAssignments}=useContext(Ctx);
  const[dragId,setDragId]=useState(null);
  const[overId,setOverId]=useState(null);
  const hasEvent=!!shows[sel]||(currentSplit&&activeSplitParty?.type==="show");
  const isAdmin=me?.id==="davon";
  const canAccessTab=(id)=>{if(id==="access")return isAdmin&&role==="tm_td";const rule=perms?.[`tab.${id}`];if(!rule)return true;return rule[role]??true;};
  useEffect(()=>{if(!hasEvent&&(tab==="advance"||tab==="production"))setTab("ros");},[hasEvent,tab,setTab]);
  useEffect(()=>{if(allShows&&(tab==="ros"||tab==="advance"||tab==="production"))setTab("dash");},[allShows,tab,setTab]);
  useEffect(()=>{if(!canAccessTab(tab))setTab("dash");},[role]);
  const _auth=useAuth();const _email=(_auth?.user?.email||"").toLowerCase();
  const _customRolePills=(userTypes||[]).map(t=>({id:t.id,label:t.label,c:"var(--text-2)"}));
  const _allRoleOptions=[...ROLES,..._customRolePills];
  const _assignedRole=userAssignments?.[_email];
  const visibleRoles=isAdmin||TM_EMAILS.has(_email)
    ?_allRoleOptions
    :_assignedRole
      ?_allRoleOptions.filter(r=>r.id===_assignedRole)
      :ROLES.filter(r=>r.id==="viewer");
  const curClient=CM[aC];
  const _clientPickerEmails=new Set(["d.johnson@dayofshow.net","o.mims@dayofshow.net","advance@dayofshow.net"]);
  const canPickClient=_clientPickerEmails.has(_email);
  const activeClients=CLIENTS.filter(c=>c.status==="active"&&me.clients.includes(c.id)&&(role!=="viewer"||c.id==="bbn"));
  React.useEffect(()=>{if(!activeClients.find(c=>c.id===aC))setAC(activeClients[0]?.id||"bbn");},[me.clients.join(","),role]);
  React.useEffect(()=>{if(!canPickClient&&aC!=="bbn")setAC("bbn");},[canPickClient,aC,setAC]);
  const stepList=useMemo(()=>{
    const tourIds=new Set((tourDaysSorted||[]).map(d=>d.date));
    const extras=(sorted||[]).filter(s=>s.clientId===aC&&!tourIds.has(s.date)).map(s=>({date:s.date,type:s.type||"show"}));
    const all=[...(tourDaysSorted||[]).map(d=>({date:d.date,type:d.type})),...extras].sort((a,b)=>a.date.localeCompare(b.date));
    return showOffDays?all:all.filter(d=>d.type!=="off"&&d.type!=="travel");
  },[tourDaysSorted,sorted,showOffDays,aC]);
  const today=new Date().toISOString().slice(0,10);
  const tabBadge=useMemo(()=>{
    const upcoming=(cShows||[]).filter(s=>s.date>=today);
    const pcFn=d=>{const adv=advances[d]||{};const items=adv.items||{};const custom=adv.customItems||[];return[...AT,...custom].filter(t=>(items[t.id]?.status||"pending")==="pending").length;};
    const advBadge=upcoming.filter(s=>pcFn(s.date)>0).length;
    const finBadge=(cShows||[]).filter(s=>{if(s.date>=today)return false;const st=finance[s.date]?.stages||{};return!["wire_ref_confirmed","signed_sheet","payment_initiated"].every(k=>st[k]);}).length;
    const intelBadge=(cShows||[]).flatMap(s=>{const sid=showIdFor(s);return[...(intel[sid]?.todos||[]).filter(t=>!t.done&&!t.ignored),...(intel[sid]?.followUps||[]).filter(f=>!f.done&&!f.ignored)];}).length;
    return{advance:advBadge,finance:finBadge,dash:intelBadge};
  },[cShows,advances,finance,intel,today]);
  return(
    <div style={{borderBottom:"1px solid var(--card-2)",background:"var(--bg)",width:"100%",maxWidth:"100%",overflow:"visible",boxShadow:"0 1px 0 rgba(109,40,217,0.15),0 2px 12px rgba(0,0,0,0.45)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 20px 5px",minWidth:0,gap:8,width:"100%"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flexShrink:1,overflow:"hidden"}}>
          <button onClick={()=>{
            if(!sidebarOpen&&!sel){
              const today=new Date().toISOString().slice(0,10);
              const allDates=[...new Set([...(sorted||[]).map(s=>s.date),...(tourDaysSorted||[]).map(d=>d.date)])].sort();
              const target=allDates.find(d=>d>=today);
              if(target)setSel(target);
            }
            setSidebarOpen(v=>!v);
          }} title="Navigation" style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:8,background:sidebarOpen?"var(--accent-soft)":"var(--accent)",color:"#fff",border:"none",cursor:"pointer",fontWeight:700,fontSize:11,letterSpacing:"-0.01em",flexShrink:1,minWidth:0,maxWidth:240,lineHeight:1,transition:"background 150ms ease"}}>
            <span style={{fontSize:15,fontWeight:300,opacity:0.9,lineHeight:1,flexShrink:0}}>≡</span>
            <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minWidth:0}}>{(()=>{const s=shows[sel];const d=stepList.find(x=>x.date===sel);const dateLabel=s?`${s.city} · ${fD(sel)}`:d?.type==="travel"?`Travel · ${fD(sel)}`:d?.type==="off"?`Off · ${fD(sel)}`:sel?fD(sel):"";if(allShows)return"All Shows";return dateLabel||"Select";})()}</span>
          </button>
          {(()=>{const show=shows?.[sel];if(show){const adv=advances[sel]||{};const pc=[...AT,...(adv.customItems||[])].filter(t=>((adv.items||{})[t.id]?.status||"pending")==="pending").length;const fStages=finance[sel]?.stages||{};const settled=["wire_ref_confirmed","signed_sheet","payment_initiated"].every(k=>fStages[k]);const days=dU(sel);const dayC=days<0?"var(--text-mute)":days===0?"var(--danger-fg)":days<=7?"var(--warn-fg)":days<=14?"var(--link)":"var(--text-mute)";return<div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flexShrink:1,overflow:"hidden"}}><span style={{padding:"1px 6px",borderRadius:4,background:dayC+"22",color:dayC,fontWeight:800,fontFamily:MN,whiteSpace:"nowrap",fontSize:9,flexShrink:0}}>{days===0?"TODAY":days>0?`${days}d`:`${-days}d ago`}</span><span onClick={()=>setTab("advance")} style={{cursor:"pointer",color:pc>0?"var(--warn-fg)":"var(--text-mute)",fontWeight:pc>0?700:400,whiteSpace:"nowrap",fontSize:9,fontFamily:MN,flexShrink:0}}>{pc} open</span><span style={{display:"flex",alignItems:"center",gap:4,color:T.textMute,whiteSpace:"nowrap",fontSize:9,fontFamily:MN,flexShrink:0}}><span style={{width:6,height:6,borderRadius:99,background:settled?"var(--success-fg)":"var(--text-mute)",display:"inline-block",flexShrink:0}}/>{settled?"SETTLED":"OUTSTANDING"}</span></div>;}if(!sel&&next)return<span style={{fontSize:10,fontFamily:MN,color:T.accent,fontWeight:600,whiteSpace:"nowrap"}}>{next.city} {fD(next.date)} · {dU(next.date)}d</span>;return null;})()}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:mobile?4:8,flexShrink:0,minWidth:0,maxWidth:"100%"}}>
          {ss&&!mobile&&<span style={{fontSize:9,color:ss==="saved"?"var(--success-fg)":"var(--text-mute)",fontFamily:MN,fontWeight:600}}>{ss==="saving"?"saving...":"saved ✓"}</span>}
          {canPickClient&&activeClients.length>1?<select value={aC} onChange={e=>setAC(e.target.value)} style={{fontSize:mobile?11:10,padding:mobile?"5px 12px":"3px 9px",borderRadius:99,border:`1.5px solid ${curClient?.color||"var(--border)"}`,background:curClient?`${curClient.color}14`:"var(--card)",color:curClient?.color||"var(--text-2)",fontFamily:"'Outfit',system-ui",fontWeight:700,cursor:"pointer",minHeight:mobile?30:undefined}}>
            {activeClients.map(c=><option key={c.id} value={c.id} style={{color:T.text,fontWeight:500}}>● {c.name} · {c.type==="festival"?"FEST":"ARTIST"}</option>)}
          </select>:<span style={{fontSize:mobile?11:10,padding:mobile?"5px 12px":"3px 9px",borderRadius:99,border:`1.5px solid ${(CM.bbn?.color)||"var(--border)"}`,background:CM.bbn?`${CM.bbn.color}14`:"var(--card)",color:CM.bbn?.color||"var(--text-2)",fontFamily:"'Outfit',system-ui",fontWeight:700,whiteSpace:"nowrap",minHeight:mobile?30:undefined,display:"inline-flex",alignItems:"center"}}>● bbno$</span>}
          <UserMenu role={role} setRole={setRole} visibleRoles={visibleRoles} setUploadOpen={setUploadOpen} setCmd={setCmd} commentMode={commentMode} setCommentMode={setCommentMode} setExp={setExp} canUpload={role==="tm_td"} canCmd={role==="tm_td"}/>
        </div>
      </div>
      <div style={{padding:mobile?"3px 12px 5px":"3px 20px 5px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        {!mobile&&role!=="viewer"&&<div style={{display:"flex",alignItems:"center",gap:4,marginLeft:8}}>
          <span style={{fontSize:8,color:T.textMute,fontFamily:MN,fontWeight:700,letterSpacing:"0.06em",flexShrink:0}}>TOUR</span>
          <input type="date" value={tourStart} onChange={e=>setTourStart(e.target.value)} style={{fontSize:9,padding:"2px 5px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-3)",color:T.text2,fontFamily:MN,cursor:"pointer"}}/>
          <span style={{fontSize:9,color:T.textMute}}>–</span>
          <input type="date" value={tourEnd} onChange={e=>setTourEnd(e.target.value)} style={{fontSize:9,padding:"2px 5px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-3)",color:T.text2,fontFamily:MN,cursor:"pointer"}}/>
        </div>}
        {mobile&&ss&&<span style={{fontSize:9,color:ss==="saved"?"var(--success-fg)":"var(--text-mute)",fontFamily:MN,fontWeight:600,marginLeft:"auto"}}>{ss==="saving"?"saving...":"saved ✓"}</span>}
      </div>
      <div style={{display:"flex",padding:mobile?"0 12px":"0 20px",width:"100%",overflowX:"auto",overflowY:"hidden",scrollbarWidth:"thin",WebkitOverflowScrolling:"touch"}}>
        {(orderedTabs||TABS).filter(t=>(hasEvent||t.id!=="advance"&&t.id!=="production")&&(!allShows||(t.id!=="advance"&&t.id!=="production"&&t.id!=="ros"))&&canAccessTab(t.id)).map(t=>{
          const isDrag=dragId===t.id;
          const isOver=overId===t.id&&dragId&&dragId!==t.id;
          return(
            <button
              key={t.id}
              draggable={!t.disabled&&!mobile}
              onDragStart={e=>{if(t.disabled||mobile)return;setDragId(t.id);e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("text/plain",t.id);}catch{}}}
              onDragOver={e=>{if(!dragId||t.disabled)return;e.preventDefault();e.dataTransfer.dropEffect="move";setOverId(t.id);}}
              onDragLeave={()=>{if(overId===t.id)setOverId(null);}}
              onDrop={e=>{e.preventDefault();if(dragId&&dragId!==t.id&&reorderTabs)reorderTabs(dragId,t.id);setDragId(null);setOverId(null);}}
              onDragEnd={()=>{setDragId(null);setOverId(null);}}
              onClick={()=>{if(t.disabled)return;setTab(t.id);if(sidebarOpen)setSidebarOpen(false);}}
              style={{padding:mobile?"9px 13px":"6px 12px",fontSize:mobile?12:11,fontWeight:tab===t.id?700:500,color:t.disabled?"var(--text-mute)":tab===t.id?"var(--text)":"var(--text-dim)",background:isOver?"var(--accent-pill-bg)":"none",border:"none",cursor:t.disabled?"default":mobile?"pointer":isDrag?"grabbing":"grab",borderBottom:tab===t.id?"2px solid var(--accent)":isOver?"2px solid var(--accent)":"2px solid transparent",display:"flex",alignItems:"center",gap:5,flexShrink:0,whiteSpace:"nowrap",opacity:isDrag?0.4:1,transition:"opacity .1s,background .1s",userSelect:"none",minHeight:mobile?40:undefined}}
            >
              <span style={{fontSize:mobile?12:10}}>{t.icon}</span>{t.label}{t.soon&&<span style={{fontSize:8,color:T.textMute}}>soon</span>}{tabBadge[t.id]>0&&<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:14,height:14,borderRadius:99,background:t.id==="finance"?"var(--danger-fg)":t.id==="advance"?"var(--warn-fg)":"var(--link)",color:"#fff",fontSize:7,fontWeight:800,fontFamily:MN,padding:"0 3px",marginLeft:2,lineHeight:1}}>{tabBadge[t.id]}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
