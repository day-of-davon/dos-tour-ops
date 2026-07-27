import { useEffect, useState } from "react";

export function useMobile(bp=640){
  const[m,setM]=useState(typeof window!=="undefined"&&window.innerWidth<=bp);
  useEffect(()=>{const h=()=>setM(window.innerWidth<=bp);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[bp]);
  return m;
}
