import { useContext, useEffect, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { COMMENT_CATEGORIES, COMMENT_STATUSES, ROLES, TABS } from "../../lib/domain-constants";
import { supabase } from "../../lib/supabase";
import { T } from "../../styles/tokens";

export function CommentsReview(){
  const{me,role}=useContext(Ctx);
  const isAdmin=me?.id==="davon";
  const[comments,setComments]=useState([]);
  const[loading,setLoading]=useState(true);
  const[filterTab,setFilterTab]=useState("all");
  const[filterCat,setFilterCat]=useState("all");
  const[filterStatus,setFilterStatus]=useState("all");
  useEffect(()=>{(async()=>{
    setLoading(true);
    let q=supabase.from("feature_comments").select("*").eq("team_id","dos-bbno-2026").order("created_at",{ascending:false});
    if(!isAdmin){const{data:{user}}=await supabase.auth.getUser();q=q.eq("user_id",user?.id||"");}
    const{data,error}=await q;
    if(!error)setComments(data||[]);
    setLoading(false);
  })();},[isAdmin]);
  const updateStatus=async(id,status)=>{
    const{error}=await supabase.from("feature_comments").update({status}).eq("id",id);
    if(!error)setComments(p=>p.map(c=>c.id===id?{...c,status}:c));
  };
  const visible=comments.filter(c=>{
    if(filterTab!=="all"&&c.tab!==filterTab)return false;
    if(filterCat!=="all"&&c.category!==filterCat)return false;
    if(filterStatus!=="all"&&c.status!==filterStatus)return false;
    return true;
  });
  const catColor=id=>COMMENT_CATEGORIES.find(c=>c.id===id)?.color||"var(--text-dim)";
  const statusColor=id=>COMMENT_STATUSES.find(s=>s.id===id)?.color||"var(--text-dim)";
  return(
    <div style={{marginTop:28}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <span style={{fontSize:13,fontWeight:800,color:T.text}}>Feedback</span>
        <span style={{fontSize:9,color:T.textDim}}>{isAdmin?"All team comments":"Your submissions"}</span>
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <select value={filterTab} onChange={e=>setFilterTab(e.target.value)} style={{fontSize:9,padding:"3px 7px",borderRadius:5,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text,cursor:"pointer"}}>
            <option value="all">All tabs</option>
            {TABS.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{fontSize:9,padding:"3px 7px",borderRadius:5,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text,cursor:"pointer"}}>
            <option value="all">All categories</option>
            {COMMENT_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{fontSize:9,padding:"3px 7px",borderRadius:5,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text,cursor:"pointer"}}>
            <option value="all">All statuses</option>
            {COMMENT_STATUSES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>
      {loading?<div style={{fontSize:11,color:T.textDim,padding:"20px 0"}}>Loading…</div>:visible.length===0?<div style={{fontSize:11,color:T.textDim,padding:"20px 0"}}>No comments yet.</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:1,border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
          {visible.map((c,i)=>(
            <div key={c.id} style={{display:"grid",gridTemplateColumns:"90px 60px 80px 1fr 120px",alignItems:"start",gap:10,padding:"9px 14px",background:i%2===0?"var(--card)":"var(--card-2)",borderBottom:i<visible.length-1?"1px solid var(--card-3)":undefined,fontSize:10}}>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                <span style={{fontSize:9,fontWeight:600,color:T.text2}}>{c.user_email?.split("@")[0]||"unknown"}</span>
                <span style={{fontSize:8,color:T.textMute,fontFamily:"var(--mono,monospace)"}}>{new Date(c.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                <span style={{fontSize:8,color:T.textDim}}>{TABS.find(t=>t.id===c.tab)?.label||c.tab}{c.section&&` › ${c.section}`}</span>
              </div>
              <span style={{fontSize:8,fontWeight:700,color:catColor(c.category),background:`${catColor(c.category)}18`,borderRadius:4,padding:"2px 5px",alignSelf:"start",whiteSpace:"nowrap"}}>{COMMENT_CATEGORIES.find(x=>x.id===c.category)?.label||c.category}</span>
              <span style={{fontSize:8,color:T.textDim}}>{ROLES.find(r=>r.id===c.role)?.label||c.role}</span>
              <span style={{fontSize:10,color:T.text2,lineHeight:1.4,wordBreak:"break-word"}}>{c.body}</span>
              {isAdmin?(
                <select value={c.status} onChange={e=>updateStatus(c.id,e.target.value)} style={{fontSize:9,padding:"3px 6px",borderRadius:5,border:`1px solid ${statusColor(c.status)}`,background:"var(--card-3)",color:statusColor(c.status),cursor:"pointer",fontWeight:600,justifySelf:"end"}}>
                  {COMMENT_STATUSES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              ):(
                <span style={{fontSize:9,fontWeight:600,color:statusColor(c.status),alignSelf:"start",justifySelf:"end"}}>{COMMENT_STATUSES.find(s=>s.id===c.status)?.label||c.status}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
