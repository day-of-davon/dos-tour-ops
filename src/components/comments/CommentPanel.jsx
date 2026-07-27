import { useContext, useEffect, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { COMMENT_CATEGORIES, COMMENT_TARGETS, ROLES, TABS } from "../../lib/domain-constants";
import { supabase } from "../../lib/supabase";
import { T } from "../../styles/tokens";

export function CommentPanel(){
  const{tab,me,role,setCommentMode}=useContext(Ctx);
  const[cTab,setCTab]=useState(tab);
  const[section,setSection]=useState("");
  const[category,setCategory]=useState("bug");
  const[body,setBody]=useState("");
  const[saving,setSaving]=useState(false);
  const[toast,setToast]=useState(null);
  // Sync tab dropdown when active tab changes
  useEffect(()=>{setCTab(tab);setSection("");},[tab]);
  const submit=async()=>{
    if(!body.trim())return;
    setSaving(true);
    try{
      const{data:{user}}=await supabase.auth.getUser();
      const{error}=await supabase.from("feature_comments").insert({
        user_id:user.id,
        user_email:user.email,
        team_id:"dos-bbno-2026",
        role,
        tab:cTab,
        section:section||null,
        category,
        body:body.trim(),
        status:"open",
      });
      if(error)throw error;
      setBody("");setSection("");
      setToast("Sent");setTimeout(()=>setToast(null),2500);
    }catch(e){setToast("Error: "+e.message);setTimeout(()=>setToast(null),3000);}
    finally{setSaving(false);}
  };
  const tabLabel=TABS.find(t=>t.id===cTab)?.label||cTab;
  const sections=COMMENT_TARGETS[cTab]||[];
  return(
    <div style={{position:"fixed",bottom:24,right:20,zIndex:200,width:300,background:"var(--card)",border:"1.5px solid var(--accent)",borderRadius:14,boxShadow:"0 8px 32px rgba(0,0,0,.22)",display:"flex",flexDirection:"column",gap:0,overflow:"hidden"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"var(--accent-pill-bg)",borderBottom:"1px solid var(--border)"}}>
        <span style={{fontSize:13}}>💬</span>
        <span style={{fontSize:11,fontWeight:700,color:T.accent,flex:1}}>Leave feedback</span>
        <span style={{fontSize:9,color:T.textDim,fontFamily:"var(--mono,monospace)",background:"var(--card-2)",borderRadius:4,padding:"2px 6px"}}>{me?.id||"you"} · {ROLES.find(r=>r.id===role)?.label||role}</span>
        <button onClick={()=>setCommentMode(false)} style={{fontSize:13,background:"none",border:"none",cursor:"pointer",color:T.textDim,lineHeight:1,padding:0}}>×</button>
      </div>
      {/* Fields */}
      <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",gap:6}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:3}}>
            <label style={{fontSize:8,fontWeight:700,color:T.textMute,letterSpacing:"0.07em",textTransform:"uppercase"}}>Tab</label>
            <select value={cTab} onChange={e=>{setCTab(e.target.value);setSection("");}} style={{fontSize:10,padding:"4px 7px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text,cursor:"pointer"}}>
              {TABS.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:3}}>
            <label style={{fontSize:8,fontWeight:700,color:T.textMute,letterSpacing:"0.07em",textTransform:"uppercase"}}>Category</label>
            <select value={category} onChange={e=>setCategory(e.target.value)} style={{fontSize:10,padding:"4px 7px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text,cursor:"pointer"}}>
              {COMMENT_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </div>
        {sections.length>0&&(
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            <label style={{fontSize:8,fontWeight:700,color:T.textMute,letterSpacing:"0.07em",textTransform:"uppercase"}}>Section <span style={{fontWeight:400}}>(optional)</span></label>
            <select value={section} onChange={e=>setSection(e.target.value)} style={{fontSize:10,padding:"4px 7px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text,cursor:"pointer"}}>
              <option value="">— general —</option>
              {sections.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          <label style={{fontSize:8,fontWeight:700,color:T.textMute,letterSpacing:"0.07em",textTransform:"uppercase"}}>Details</label>
          <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder={category==="bug"?"Describe the bug and steps to reproduce…":category==="feature"?"Describe the feature you'd like…":category==="ux"?"Describe the UX issue…":"What needs to be fixed?"} rows={4} style={{fontSize:10,padding:"6px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--bg)",color:T.text,resize:"vertical",fontFamily:"inherit",lineHeight:1.5}}/>
        </div>
        <button onClick={submit} disabled={saving||!body.trim()} style={{padding:"7px 0",borderRadius:7,border:"none",background:body.trim()?"var(--accent)":"var(--border)",color:body.trim()?"#fff":"var(--text-dim)",fontWeight:700,fontSize:11,cursor:body.trim()?"pointer":"default",opacity:saving?0.7:1}}>
          {saving?"Sending…":"Send feedback"}
        </button>
        {toast&&<span style={{fontSize:10,textAlign:"center",color:toast.startsWith("Error")?"var(--danger-fg)":"var(--success-fg)",fontWeight:600}}>{toast}</span>}
      </div>
    </div>
  );
}
