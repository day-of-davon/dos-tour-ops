import { useState } from "react";
import { VENUE_GRID } from "./production";
import { BUS_DATA_MAP } from "./tour-data";

export const FLEET_EXCEPTION_STATUS_KEY="dos-fleet-exception-status";

export const FLEET_EXCEPTION_STATUSES=[
  ["open","Open","var(--danger-fg)","var(--danger-bg)"],
  ["in-progress","In Progress","var(--warn-fg)","var(--warn-bg)"],
  ["resolved","Resolved","var(--success-fg)","var(--success-bg)"],
  ["blocked","Blocked","var(--text-mute)","var(--card-2)"],
];

export function useFleetExceptionStatus(){
  const[overrides,setOverrides]=useState(()=>{
    try{return JSON.parse(localStorage.getItem(FLEET_EXCEPTION_STATUS_KEY)||"{}");}
    catch{return{};}
  });
  const set=(id,status)=>setOverrides(prev=>{
    const next={...prev,[id]:status};
    try{localStorage.setItem(FLEET_EXCEPTION_STATUS_KEY,JSON.stringify(next));}catch{}
    return next;
  });
  return[overrides,set];
}

export function collectFleetExceptions(){
  const out=[];
  Object.entries(BUS_DATA_MAP).forEach(([iso,d])=>{
    if(d.fleetException)out.push({id:`crossing_${iso}`,iso,kind:"crossing",label:d.route,date:d.date,dow:d.dow,...d.fleetException});
  });
  Object.entries(VENUE_GRID).forEach(([iso,v])=>{
    if(v.fleetException)out.push({id:`venue_${iso}`,iso,kind:"venue",label:`${v.venue} · ${v.city}`,date:iso,dow:null,...v.fleetException});
  });
  return out.sort((a,b)=>a.iso.localeCompare(b.iso));
}
