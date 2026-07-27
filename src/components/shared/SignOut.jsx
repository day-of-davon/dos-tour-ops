import { supabase } from "../../lib/supabase";
import { useAuth } from "../AuthGate";

export function SignOut(){
  const a=useAuth();const user=a?.user;if(!user)return null;
  const initial=(user.email||"?").trim()[0].toUpperCase();
  return <button title={user.email} onClick={()=>supabase.auth.signOut().catch(e=>console.warn("[signout]",e?.message||e))} style={{width:22,height:22,borderRadius:"50%",background:"var(--accent)",color:"#fff",fontSize:10,fontWeight:700,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>{initial}</button>;
}
