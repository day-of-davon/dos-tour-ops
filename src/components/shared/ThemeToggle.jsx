import { useState } from "react";
import { Button } from "../ui";

export function ThemeToggle(){
  const[theme,setTheme]=useState(()=>{try{return localStorage.getItem("dos-theme")||"dark";}catch{return "dark";}});
  const toggle=()=>{const next=theme==="dark"?"light":"dark";setTheme(next);try{localStorage.setItem("dos-theme",next);}catch{}document.documentElement.setAttribute("data-theme",next);};
  return <Button variant="secondary" size="sm" onClick={toggle} title={`Switch to ${theme==="dark"?"light":"dark"} theme`} style={{minWidth:28}}>{theme==="dark"?"☼":"☾"}</Button>;
}
