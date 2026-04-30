import { StrictMode, Component } from "react";
import { createRoot } from "react-dom/client";
import App from "./DosApp.jsx";
import AuthGate from "./components/AuthGate.jsx";
import { storage, getShared, setShared, deleteShared, getPrivate, setPrivate, deletePrivate, isSharedKey } from "./lib/storage";

window.storage = {
  get: (k) => isSharedKey(k) ? getShared(k) : storage.get(k),
  set: (k, v) => isSharedKey(k) ? setShared(k, v) : storage.set(k, v),
  delete: (k) => isSharedKey(k) ? deleteShared(k) : storage.delete(k),
  getShared, setShared, deleteShared,
  getPrivate, setPrivate, deletePrivate,
};

// Catches any render-time crash in the child tree so the app doesn't white-screen.
// Renders the error + component stack on-page so it's diagnosable without devtools.
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null, info: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    this.setState({ info });
    // Log too, in case devtools is open
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
  }
  reset = () => { this.setState({ error: null, info: null }); };
  reload = () => { window.location.reload(); };
  clearStorage = async () => {
    if (!confirm("Clear local cached settings and reload? Supabase data is not affected.")) return;
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    window.location.reload();
  };
  render() {
    if (!this.state.error) return this.props.children;
    const msg = String(this.state.error?.message || this.state.error || "Unknown error");
    const stack = String(this.state.error?.stack || "").split("\n").slice(0, 10).join("\n");
    const compStack = String(this.state.info?.componentStack || "").split("\n").slice(0, 12).join("\n");
    return (
      <div style={{background:"#F5F3EF",minHeight:"100vh",padding:20,fontFamily:"'Outfit',system-ui",color:"#0f172a"}}>
        <div style={{maxWidth:760,margin:"40px auto",background:"#fff",border:"1px solid #FCA5A5",borderRadius:12,padding:"20px 24px",boxShadow:"0 4px 16px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{fontSize:18,fontWeight:800,letterSpacing:"-0.03em"}}>DOS</div>
            <span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:"#FEE2E2",color:"#991B1B",fontWeight:700,letterSpacing:"0.06em"}}>RENDER ERROR</span>
          </div>
          <div style={{fontSize:13,color:"#991B1B",fontWeight:700,marginBottom:6}}>{msg}</div>
          <div style={{fontSize:10,color:"#64748b",marginBottom:14}}>Something threw during the first render. The app caught it instead of showing a blank page. Details below.</div>
          <div style={{fontSize:10,fontWeight:700,color:"#64748b",letterSpacing:"0.06em",marginBottom:4}}>STACK</div>
          <pre style={{background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:6,padding:"10px 12px",fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#334155",whiteSpace:"pre-wrap",overflow:"auto",maxHeight:220,marginBottom:12}}>{stack}</pre>
          {compStack && <>
            <div style={{fontSize:10,fontWeight:700,color:"#64748b",letterSpacing:"0.06em",marginBottom:4}}>COMPONENT STACK</div>
            <pre style={{background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:6,padding:"10px 12px",fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#334155",whiteSpace:"pre-wrap",overflow:"auto",maxHeight:160,marginBottom:12}}>{compStack}</pre>
          </>}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={this.reload} style={{background:"#5B21B6",border:"none",borderRadius:6,color:"#fff",fontSize:11,padding:"7px 14px",cursor:"pointer",fontWeight:700}}>Reload page</button>
            <button onClick={this.reset} style={{background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:6,color:"#475569",fontSize:11,padding:"7px 14px",cursor:"pointer",fontWeight:700}}>Try again (no reload)</button>
            <button onClick={this.clearStorage} title="Wipes localStorage/sessionStorage, then reloads. Use if bad cached settings are causing the crash." style={{background:"#fff",border:"1px solid #FCA5A5",borderRadius:6,color:"#991B1B",fontSize:11,padding:"7px 14px",cursor:"pointer",fontWeight:700}}>Clear local cache + reload</button>
          </div>
          <div style={{fontSize:9,color:"#94a3b8",marginTop:14,fontFamily:"'JetBrains Mono',monospace"}}>v7.0 · paste this stack in chat so Claude can fix it</div>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthGate><App /></AuthGate>
    </ErrorBoundary>
  </StrictMode>
);
