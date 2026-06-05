import { useContext, useMemo, useState } from "react";
import { Ctx } from "../../context/DosContext";
import { LEDGER_EDITABLE } from "../../DosApp.jsx";
import { FIN_EVENT_TYPES, MN } from "../../lib/domain-constants";
import { fD } from "../../lib/time";
import { T } from "../../styles/tokens";

export function FinLedger(){
  const{shows,finance,flights,uFin,uFlight,setUploadOpen}=useContext(Ctx);
  const[filterCat,setFilterCat]=useState("all");
  const[filterCur,setFilterCur]=useState("all");
  const[sortCol,setSortCol]=useState("date");
  const[sortDir,setSortDir]=useState(1);
  const[ec,setEc]=useState(null);
  const[eVal,setEVal]=useState("");

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
        out.push({id:fe.flightId||`fe_${date}_${Math.random()}`,date,show:showLabel,cat:"Flight",desc:fe.label||"",payee:(fe.pax||[]).join(", ")||"—",amount:parseFloat(fe.amount||0),currency:fe.currency||"USD",status:"confirmed",ref:fe.carrier||"",payMethod:fe.payMethod||"",bookedDate:fe.bookedDate||"",paidDate:fe.paidDate||"",_src:{type:"flightExpense",date,srcId:fe.flightId}});
      });
      (fin.payouts||[]).forEach(p=>{
        out.push({id:p.id||`po_${date}_${Math.random()}`,date,show:showLabel,cat:"Payout",desc:`${p.dept||""}${p.role?` · ${p.role}`:""}`,payee:p.name||"—",amount:parseFloat(p.amount||0),currency:p.currency||"USD",status:p.status||"pending",ref:p.method||"",payMethod:p.payMethod||p.method||"",bookedDate:p.bookedDate||"",paidDate:p.paidDate||"",_src:{type:"payout",date,srcId:p.id}});
      });
      (fin.ledgerEntries||[]).forEach(le=>{
        if(!le.amount&&le.amount!==0)return;
        out.push({id:le.id||`le_${date}_${Math.random()}`,date:le.date||date,show:showLabel,cat:"Hotel",desc:le.description||"",payee:le.vendor||"—",amount:parseFloat(le.amount||0),currency:le.currency||"USD",status:"confirmed",ref:le.source||"",payMethod:le.payMethod||"",bookedDate:le.bookedDate||le.checkIn||"",paidDate:le.paidDate||"",_src:{type:"ledgerEntry",date,srcId:le.id}});
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
      out.push({id:f.id,date:f.depDate||"",show:showLabel,cat:"Flight",desc:`${f.flightNo||f.carrier||"Flight"} · ${f.fromCity||f.from||""} → ${f.toCity||f.to||""}`,payee:(f.pax||[]).join(", ")||"—",amount:f.cost!=null?parseFloat(f.cost):null,currency:f.currency||"USD",status:"confirmed",ref:f.carrier||f.flightNo||"",payMethod:f.payMethod||"",bookedDate:f.bookedDate||"",paidDate:f.paidDate||"",_src:{type:"confirmedFlight",date:f.depDate||"",srcId:f.id}});
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
      return null;
    };
    return out.filter(r=>{
      if(r.id&&seenIds.has(r.id))return false;
      if(r.id)seenIds.add(r.id);
      const k=keyFor(r);
      if(k){if(seenKeys.has(k))return false;seenKeys.add(k);}
      return true;
    });
  },[finance,flights,shows]);

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

  const CAT_COLOR={Flight:{bg:"var(--info-bg)",c:"var(--link)"},Hotel:{bg:"var(--warn-bg)",c:"var(--warn-fg)"},Payout:{bg:"var(--accent-pill-bg)",c:"var(--accent)"},Settlement:{bg:"var(--success-bg)",c:"var(--success-fg)"}};

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
          <button onClick={()=>setUploadOpen(true)} style={{fontSize:9,padding:"3px 10px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>↑ Upload</button>
        </div>
      </div>
      {sorted.length===0?(
        <div style={{textAlign:"center",padding:"40px 0",color:T.textMute,fontSize:11}}>No expenses logged.</div>
      ):(
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{[["date","Date"],["bookedDate","Booked"],["paidDate","Paid"],["show","Show"],["cat","Category"],["payee","Payee"],["desc","Description"],["amount","Amount"],["currency","Curr"],["status","Status"],["ref","Ref"],["payMethod","Payment"]].map(([col,label])=>th(label,col))}</tr></thead>
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
