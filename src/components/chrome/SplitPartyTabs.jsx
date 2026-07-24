import { useContext } from "react";
import { Ctx } from "../../context/DosContext";
import { MN } from "../../lib/domain-constants";
import { T } from "../../styles/tokens";

export function SplitPartyTabs(){
  const{currentSplit,activeSplitPartyId,setSplitParty,sel}=useContext(Ctx);
  if(!currentSplit)return null;
  return(
    <div style={{display:"flex",gap:0,padding:"0 16px",background:"var(--card)",borderBottom:"1px solid var(--border)",flexShrink:0}}>
      {currentSplit.parties.map(p=>{
        const active=p.id===activeSplitPartyId;
        return(
          <button key={p.id} onClick={()=>setSplitParty(sel,p.id)}
            style={{background:"transparent",border:"none",borderBottom:active?`2px solid ${p.color}`:"2px solid transparent",padding:"8px 14px",cursor:"pointer",textAlign:"left",marginBottom:-1,transition:"border-color 120ms ease"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{display:"inline-block",width:8,height:8,borderRadius:99,background:p.color}}/>
              <span style={{fontSize:11,fontWeight:700,color:active?"var(--text)":"var(--text-2)",fontFamily:MN,letterSpacing:"0.02em"}}>{p.label}</span>
            </div>
            <div style={{fontSize:9,color:T.textMute,marginTop:2,fontFamily:MN}}>{p.location} · {p.crew.length} crew</div>
          </button>
        );
      })}
    </div>
  );
}
