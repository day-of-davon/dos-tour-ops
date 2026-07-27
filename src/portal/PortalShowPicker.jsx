import { T } from "../styles/tokens";

export function PortalShowPicker({ grants, onSelect }) {
  return (
    <div style={{background:"var(--bg)",minHeight:"100vh",padding:"40px 20px",fontFamily:"'Outfit',system-ui"}}>
      <div style={{maxWidth:480,margin:"0 auto"}}>
        <div style={{fontSize:20,fontWeight:800,color:T.text,letterSpacing:"-0.03em",marginBottom:2}}>DOS</div>
        <div style={{fontSize:11,color:T.textDim,marginBottom:24}}>Choose a show to view its advance.</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {grants.map(g => (
            <button
              key={`${g.show_key}__${g.client_id}`}
              onClick={() => onSelect(g)}
              style={{textAlign:"left",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px",cursor:"pointer",fontFamily:"inherit"}}
            >
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>{g.venue_label || g.show_key}</div>
              <div style={{fontSize:10,color:T.textDim,marginTop:2,fontFamily:"'JetBrains Mono',monospace"}}>{g.show_key}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
