import React, { useContext, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { MN, PERM_ROLES, PERM_SCHEMA } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";
import { CommentsReview } from "../comments/CommentsReview";

export function AccessTab(){
  const{perms,uPerms,me,userTypes,addUserType,renameUserType,removeUserType,userAssignments,setUserAssignment,removeUserAssignment}=useContext(Ctx);
  const[newTypeLabel,setNewTypeLabel]=useState("");
  const[newAssignEmail,setNewAssignEmail]=useState("");
  const[newAssignRole,setNewAssignRole]=useState("");
  const[editingTypeId,setEditingTypeId]=useState(null);
  const[editingTypeLabel,setEditingTypeLabel]=useState("");
  if(me?.id!=="davon")return<div style={{padding:40,textAlign:"center",fontSize:11,color:T.textDim}}>Access denied.</div>;
  const allRoles=[...PERM_ROLES,...(userTypes||[]).map(t=>({id:t.id,label:t.label,custom:true}))];
  const cell={display:"flex",alignItems:"center",justifyContent:"center"};
  const colW=`repeat(${allRoles.length},80px)`;
  const gridCols=`1fr ${colW}`;
  const hdr={fontSize:8,fontWeight:800,letterSpacing:"0.08em",color:T.textDim,padding:"8px 16px",textTransform:"uppercase"};
  const resetAll=()=>{
    allRoles.forEach(r=>{
      PERM_SCHEMA.forEach(s=>s.items.forEach(item=>{uPerms(item.id,r.id,true);}));
    });
  };
  const onAddType=()=>{const id=addUserType(newTypeLabel);if(id)setNewTypeLabel("");};
  const onAddAssign=()=>{
    const email=newAssignEmail.trim().toLowerCase();
    if(!email||!newAssignRole)return;
    setUserAssignment(email,newAssignRole);
    setNewAssignEmail("");setNewAssignRole("");
  };
  const assignmentEntries=Object.entries(userAssignments||{}).sort((a,b)=>a[0].localeCompare(b[0]));
  const inputStyle={fontSize:11,padding:"5px 9px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:T.text,fontFamily:"inherit"};
  const sectionHeader={fontSize:13,fontWeight:800,color:T.text,marginBottom:8};
  const sectionHint={fontSize:9,color:T.textDim,marginBottom:10};
  return(
    <div className="fi" style={{padding:"16px 20px",maxWidth:820,width:"100%",height:"calc(100vh - 115px)",overflowY:"auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <span style={{fontSize:13,fontWeight:800,color:T.text}}>Access Control</span>
        <span style={{fontSize:9,color:T.textDim}}>Permissions apply to all non-admin users on next load.</span>
        <button onClick={resetAll} style={{marginLeft:"auto",fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:T.textDim,cursor:"pointer"}}>Reset All</button>
      </div>
      {/* User Types */}
      <div style={{marginBottom:24}}>
        <div style={sectionHeader}>User Types</div>
        <div style={sectionHint}>Built-in types are fixed. Add custom types to grant the same permission columns to additional roles.</div>
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
          {PERM_ROLES.map((r,i)=>(
            <div key={r.id} style={{display:"grid",gridTemplateColumns:"1fr 90px 90px",alignItems:"center",padding:"7px 14px",borderBottom:"1px solid var(--card-3)",fontSize:11}}>
              <span style={{color:T.text2,fontWeight:600}}>{r.label}</span>
              <span style={{fontSize:9,color:T.textMute,fontFamily:MN}}>{r.id}</span>
              <span style={{fontSize:8,color:T.textDim,justifySelf:"end",letterSpacing:"0.06em"}}>BUILT-IN</span>
            </div>
          ))}
          {(userTypes||[]).map(t=>{
            const isEditing=editingTypeId===t.id;
            return(
              <div key={t.id} style={{display:"grid",gridTemplateColumns:"1fr 90px 90px",alignItems:"center",padding:"7px 14px",borderBottom:"1px solid var(--card-3)",fontSize:11}}>
                {isEditing?(
                  <input value={editingTypeLabel} onChange={e=>setEditingTypeLabel(e.target.value)}
                    onBlur={()=>{renameUserType(t.id,editingTypeLabel);setEditingTypeId(null);}}
                    onKeyDown={e=>{if(e.key==="Enter"){renameUserType(t.id,editingTypeLabel);setEditingTypeId(null);}if(e.key==="Escape")setEditingTypeId(null);}}
                    autoFocus style={{...inputStyle,fontSize:11,padding:"3px 7px"}}/>
                ):(
                  <span onClick={()=>{setEditingTypeId(t.id);setEditingTypeLabel(t.label);}} title="Click to rename" style={{color:T.text2,fontWeight:600,cursor:"pointer"}}>{t.label}</span>
                )}
                <span style={{fontSize:9,color:T.textMute,fontFamily:MN}}>{t.id.slice(0,10)}…</span>
                <button onClick={()=>{if(confirm(`Delete user type "${t.label}"? Assignments using it will be removed.`))removeUserType(t.id);}} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"1px solid var(--border)",background:"var(--card-2)",color:T.dangerFg,cursor:"pointer",justifySelf:"end"}}>Remove</button>
              </div>
            );
          })}
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 14px",background:"var(--card-2)"}}>
            <input value={newTypeLabel} onChange={e=>setNewTypeLabel(e.target.value)} placeholder="New user type label (e.g. Promoter, Crew)" onKeyDown={e=>{if(e.key==="Enter")onAddType();}} style={{...inputStyle,flex:1}}/>
            <button onClick={onAddType} disabled={!newTypeLabel.trim()} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:newTypeLabel.trim()?"var(--accent)":"var(--border)",color:newTypeLabel.trim()?"#fff":T.textDim,fontWeight:700,cursor:newTypeLabel.trim()?"pointer":"default"}}>Add Type</button>
          </div>
        </div>
      </div>
      {/* User Assignments */}
      <div style={{marginBottom:24}}>
        <div style={sectionHeader}>User Assignments</div>
        <div style={sectionHint}>Map an OAuth login email to a user type. Takes effect on the user's next load.</div>
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
          {assignmentEntries.length===0&&<div style={{fontSize:11,color:T.textDim,padding:"12px 14px"}}>No email assignments yet.</div>}
          {assignmentEntries.map(([email,roleId])=>{
            const r=allRoles.find(x=>x.id===roleId);
            return(
              <div key={email} style={{display:"grid",gridTemplateColumns:"1fr 180px 80px",alignItems:"center",gap:8,padding:"7px 14px",borderBottom:"1px solid var(--card-3)",fontSize:11}}>
                <span style={{color:T.text2,fontFamily:MN,fontSize:10,wordBreak:"break-all"}}>{email}</span>
                <select value={roleId} onChange={e=>setUserAssignment(email,e.target.value)} style={{...inputStyle,fontSize:10,padding:"4px 7px",cursor:"pointer"}}>
                  {allRoles.map(rr=><option key={rr.id} value={rr.id}>{rr.label}{rr.custom?" (custom)":""}</option>)}
                  {!r&&<option value={roleId}>(unknown: {roleId})</option>}
                </select>
                <button onClick={()=>{if(confirm(`Remove assignment for ${email}?`))removeUserAssignment(email);}} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"1px solid var(--border)",background:"var(--card-2)",color:T.dangerFg,cursor:"pointer",justifySelf:"end"}}>Remove</button>
              </div>
            );
          })}
          <div style={{display:"grid",gridTemplateColumns:"1fr 180px 80px",alignItems:"center",gap:8,padding:"9px 14px",background:"var(--card-2)"}}>
            <input value={newAssignEmail} onChange={e=>setNewAssignEmail(e.target.value)} placeholder="email@domain.com" type="email" style={{...inputStyle,fontFamily:MN,fontSize:10}}/>
            <select value={newAssignRole} onChange={e=>setNewAssignRole(e.target.value)} style={{...inputStyle,fontSize:10,padding:"5px 7px",cursor:"pointer"}}>
              <option value="">— select user type —</option>
              {allRoles.map(rr=><option key={rr.id} value={rr.id}>{rr.label}{rr.custom?" (custom)":""}</option>)}
            </select>
            <button onClick={onAddAssign} disabled={!newAssignEmail.trim()||!newAssignRole} style={{fontSize:10,padding:"5px 0",borderRadius:6,border:"none",background:(newAssignEmail.trim()&&newAssignRole)?"var(--accent)":"var(--border)",color:(newAssignEmail.trim()&&newAssignRole)?"#fff":T.textDim,fontWeight:700,cursor:(newAssignEmail.trim()&&newAssignRole)?"pointer":"default",justifySelf:"end",width:"100%"}}>Assign</button>
          </div>
        </div>
      </div>
      {/* Permissions Matrix */}
      <div style={sectionHeader}>Permissions</div>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden",overflowX:"auto"}}>
        <div style={{display:"grid",gridTemplateColumns:gridCols,borderBottom:"1px solid var(--border)",background:"var(--card-2)"}}>
          <div style={hdr}>Permission</div>
          {allRoles.map(r=>(
            <div key={r.id} style={{...hdr,...cell,textAlign:"center",borderLeft:"1px solid var(--border)"}}>
              {r.label}
              {r.id==="tm_td"&&<span style={{marginLeft:4,fontSize:7,color:T.accent}}>admin</span>}
              {r.custom&&<span style={{marginLeft:4,fontSize:7,color:T.textMute}}>custom</span>}
            </div>
          ))}
        </div>
        {PERM_SCHEMA.map((section,si)=>(
          <React.Fragment key={section.section}>
            <div style={{display:"grid",gridTemplateColumns:gridCols,background:"var(--card-3)",borderTop:si>0?"1px solid var(--border)":undefined}}>
              <div style={{...hdr,color:T.textMute,paddingTop:6,paddingBottom:6}}>{section.section}</div>
              {allRoles.map(r=><div key={r.id} style={{borderLeft:"1px solid var(--border)"}}/>)}
            </div>
            {section.items.map((item,ii)=>{
              const isLast=ii===section.items.length-1;
              return(
                <div key={item.id} style={{display:"grid",gridTemplateColumns:gridCols,borderTop:"1px solid var(--card-3)",borderBottom:isLast?"1px solid var(--border)":undefined}}>
                  <div style={{padding:"8px 16px",fontSize:11,color:T.text2}}>{item.label}</div>
                  {allRoles.map(r=>{
                    const isAdmin=r.id==="tm_td";
                    const val=isAdmin?true:(perms?.[item.id]?.[r.id]??true);
                    return(
                      <div key={r.id} style={{...cell,borderLeft:"1px solid var(--border)"}}>
                        <button
                          onClick={()=>{if(!isAdmin)uPerms(item.id,r.id,!val);}}
                          title={isAdmin?"Admin always has access":val?"Revoke":"Grant"}
                          style={{width:20,height:20,borderRadius:4,border:`2px solid ${val?"var(--success-fg)":"var(--border)"}`,background:val?"var(--success-fg)":"transparent",cursor:isAdmin?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,opacity:isAdmin?0.5:1}}
                        >
                          {val&&<span style={{color:"#fff",fontSize:11,fontWeight:800,lineHeight:1}}>✓</span>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <CommentsReview/>
    </div>
  );
}
