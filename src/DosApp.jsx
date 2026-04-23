import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { useAuth } from "./components/AuthGate.jsx";
import { Button, Pill } from "./components/ui.jsx";
import { supabase } from "./lib/supabase";
import { logAudit, setAuditIdentity } from "./lib/audit";
import {
  SK, PK,
  HOTEL_DEFAULT_CHECKIN, HOTEL_DEFAULT_CHECKOUT, HOTEL_TODOS_DEFAULT,
  TEAM, ROLE_LABEL, GUEST_ME, resolveMe, TEAM_MEMBERS, TM_EMAILS,
} from "./lib/constants";

// DOS TOUR OPS v7.0 — Day of Show, LLC
// Client-first · All dept advance lanes · Custom + editable items · Full settlement

const hhmmToMin=s=>{if(!s)return null;const[h,m]=s.split(":").map(Number);return isNaN(h)||isNaN(m)?null:h*60+m;};
// Group same-day flight legs by itinerary (confirmNo / bookingRef / pax signature) and tag
// each with role: final leg of a multi-leg chain = "arr", all prior legs = "dep". Single-leg
// groups stay "dep". Overnight arrivals (arrs) are always "arr".
const flightItinKey=f=>f.confirmNo||f.pnr||f.bookingRef||((f.pax||[]).slice().sort().join("|")||f.id);
const flightDedupKey=f=>{
  const fn=f.flightNo||f.carrier,fr=f.from,to=f.to,dd=f.depDate;
  if(fn&&fr&&to&&dd)return`${fn}__${fr}__${to}__${dd}`;
  return f.pnr||f.confirmNo||f.bookingRef||f.tid||f.id;
};
// Normalize + deduplicate flights object in-place (same logic as dos-mt-sync/clean-flights.js).
// Returns a new object; does not mutate input.
const normFlightNo=s=>String(s||'').trim().toUpperCase().replace(/\s+/g,'');
const isJunkFlightNo=fn=>!fn||/^(UNKNOWN|AC)$/.test(normFlightNo(fn));
const flightRichness=f=>{
  const n=Object.values(f).filter(v=>v!=null&&v!==''&&!(Array.isArray(v)&&!v.length)).length;
  return n+(f.pnr?5:0)+((f.pax||[]).length?3:0)+(isJunkFlightNo(f.flightNo)?-50:0);
};
function cleanFlightsObj(raw){
  const arr=Object.values(raw||{});
  // Drop truly empty shells
  const survivors=arr.filter(f=>{
    if(!f.from&&!f.to&&!(f.pax||[]).length)return false;
    return true;
  });
  // Group by normalized dedup key; keep richest per group
  const groups=new Map();
  for(const f of survivors){
    const fn=normFlightNo(f.flightNo);
    const key=isJunkFlightNo(f.flightNo)||!f.from||!f.to||!f.depDate
      ?f.pnr||f.confirmNo||f.bookingRef||f.id
      :`${fn}__${f.from}__${f.to}__${f.depDate}`;
    const cur=groups.get(key);
    if(!cur||flightRichness(f)>flightRichness(cur)){
      groups.set(key,{
        ...f,
        flightNo:f.flightNo&&!isJunkFlightNo(f.flightNo)?normFlightNo(f.flightNo):f.flightNo,
        pax:(f.pax||[]).map(p=>String(p).replace(/\s+/g,' ').trim()).filter(Boolean),
      });
    }
  }
  // Known manual patches
  const cttcoz=groups.get('CTTCOZ');
  if(cttcoz)Object.assign(cttcoz,{flightNo:'AC598',carrier:'Air Canada',from:'YVR',fromCity:'Vancouver',to:'SNA',toCity:'Orange County',depDate:'2026-04-06',arrDate:'2026-04-06',dep:'08:10',arr:'11:15',cost:488.78,currency:'CAD',pax:['Nicholas Foerster']});
  const ac748=groups.get('AC748__YUL__BOS__2026-05-01');
  if(ac748)ac748.pax=['Mathieu Senechal'];
  const out={};
  for(const f of groups.values())out[f.id]=f;
  return out;
}
// Extract a human-readable message from a scan-api error body.
// Server returns {error, anthropic:{type,message}, detail} JSON on 502; fall back to raw text.
const describeScanError=body=>{
  if(!body)return "";
  try{
    const p=JSON.parse(body);
    if(p?.anthropic?.message)return`${p.anthropic.type||"error"}: ${p.anthropic.message}`.slice(0,400);
    if(p?.error)return String(p.error).slice(0,400);
  }catch{}
  return String(body).slice(0,400);
};
// Merge fresh scan data into an existing flight, filling empty fields and unioning pax.
// Preserves user-set status/confirmedAt and non-empty suggestedCrewIds.
const FLIGHT_ENRICH_FIELDS=["flightNo","carrier","from","fromCity","to","toCity","depDate","dep","arrDate","arr","cost","currency","pnr","confirmNo","ticketNo","bookingStatus","payMethod"];
const enrichFlight=(existing,fresh)=>{
  if(existing.locked)return existing;
  const out={...existing};
  FLIGHT_ENRICH_FIELDS.forEach(k=>{
    if((out[k]==null||out[k]==="")&&fresh[k]!=null&&fresh[k]!=="")out[k]=fresh[k];
  });
  if(Array.isArray(fresh.pax)&&fresh.pax.length){
    const seen=new Set((out.pax||[]).map(p=>String(p).toLowerCase()));
    const merged=[...(out.pax||[])];
    fresh.pax.forEach(p=>{const k=String(p).toLowerCase();if(!seen.has(k)){merged.push(p);seen.add(k);}});
    out.pax=merged;
  }
  if(fresh.parseVerified&&!out.parseVerified){out.parseVerified=true;out.parseNote=fresh.parseNote||null;}
  if(fresh.fresh48h)out.fresh48h=true;
  // Always refresh server-computed show-match fields — stale match happens when `to` was
  // missing on the initial parse, causing date-proximity-only matching to a wrong show.
  if(fresh.suggestedShowDate!==undefined)out.suggestedShowDate=fresh.suggestedShowDate;
  if(fresh.suggestedRole!==undefined)out.suggestedRole=fresh.suggestedRole;
  if(fresh.suggestedVenue!==undefined)out.suggestedVenue=fresh.suggestedVenue;
  return out;
};
// Locate an existing record that matches a freshly scanned flight. Matches by tid first,
// then by flightNo among the tid's siblings, falling back to a null-flightNo sibling.
const findFlightMatch=(cur,f)=>{
  if(cur[f.id])return cur[f.id];
  const vals=Object.values(cur);
  const byTid=f.tid?vals.filter(x=>x.tid===f.tid):[];
  if(byTid.length){
    if(f.flightNo){
      const exact=byTid.find(x=>x.flightNo===f.flightNo);
      if(exact)return exact;
      const nullLeg=byTid.find(x=>!x.flightNo&&(!f.depDate||!x.depDate||x.depDate===f.depDate));
      if(nullLeg)return nullLeg;
    }else{
      const dateMatch=byTid.find(x=>f.depDate&&x.depDate===f.depDate);
      if(dateMatch)return dateMatch;
      return byTid[0];
    }
  }
  const dk=flightDedupKey(f);
  if(dk&&dk!=="______")return vals.find(x=>flightDedupKey(x)===dk)||null;
  return null;
};
const tagFlightRoles=(deps,arrs)=>{
  const groups={};
  deps.forEach(f=>{const k=flightItinKey(f);(groups[k]=groups[k]||[]).push(f);});
  const depTagged=[];
  Object.values(groups).forEach(g=>{
    if(g.length===1){depTagged.push({f:g[0],role:"dep"});return;}
    const sorted=g.slice().sort((a,b)=>`${a.depDate||""} ${a.dep||""}`.localeCompare(`${b.depDate||""} ${b.dep||""}`));
    sorted.forEach((f,i)=>depTagged.push({f,role:i===sorted.length-1?"arr":"dep"}));
  });
  return[...depTagged,...arrs.map(f=>({f,role:"arr"}))];
};

// Airport groups for tour show cities. One city → one-or-more IATA codes covering
// realistic crew routing (primary + common alternates). Extend as routes warrant.
const CITY_AIRPORTS={
  dublin:["DUB"],
  manchester:["MAN"],
  glasgow:["GLA","EDI"],
  london:["LHR","LGW","STN","LCY","LTN","SEN"],
  zurich:["ZRH","BSL"],
  cologne:["CGN","DUS","FRA"],
  amsterdam:["AMS","RTM"],
  paris:["CDG","ORY","BVA"],
  chambord:["ORY","CDG","TUF"],
  villeurbanne:["LYS"],
  lyon:["LYS"],
  milan:["MXP","LIN","BGY"],
  prague:["PRG"],
  berlin:["BER"],
  bratislava:["BTS","VIE"],
  vienna:["VIE","BTS"],
  warsaw:["WAW","WMI"],
  morrison:["DEN"],
  denver:["DEN"],
  worcester:["BOS","PVD","BDL","ORH"],
  boston:["BOS","PVD","MHT"],
  mississauga:["YYZ","YTZ","YHM"],
  toronto:["YYZ","YTZ","YHM"],
  uncasville:["BDL","PVD","JFK","BOS","HPN"],
  ottawa:["YOW"],
  montreal:["YUL","YMX","YHU"],
  "los angeles":["LAX","BUR","LGB","SNA","ONT"],
  "new york":["JFK","LGA","EWR","HPN"],
  halifax:["YHZ"],
};
const AIRPORT_TO_CITIES={};
Object.entries(CITY_AIRPORTS).forEach(([city,codes])=>{
  codes.forEach(c=>{(AIRPORT_TO_CITIES[c]=AIRPORT_TO_CITIES[c]||[]).push(city);});
});
const cityKey=c=>String(c||"").toLowerCase().split(",")[0].trim();

// Match a flight endpoint (iata+date+city) to a tour show via geographic + chronological proximity.
// direction="inbound": show must occur on/after arrival (0..+7d). direction="outbound": show must
// occur on/before departure (-7..0d). Returns closest by date among geographic candidates, or null.
// A single flight can (and frequently does) match BOTH an outbound show (origin side) and an
// inbound show (destination side); callers run this twice, once per side.
const matchShowByAirport=(iata,flightCity,flightDate,shows,direction)=>{
  if(!flightDate||!Array.isArray(shows)||!shows.length)return null;
  const code=(iata||"").toUpperCase();
  const iataCities=code?(AIRPORT_TO_CITIES[code]||[]):[];
  const fc=cityKey(flightCity);
  const candidates=shows.filter(s=>{
    if(!s?.date||!s?.city)return false;
    if(s.type==="off"||s.type==="travel"||s.type==="split")return false;
    const sc=cityKey(s.city);
    if(!sc)return false;
    if(iataCities.includes(sc))return true;
    if(fc&&(fc===sc||fc.includes(sc)||sc.includes(fc)))return true;
    return false;
  });
  if(!candidates.length)return null;
  const flightDay=new Date(flightDate+"T12:00:00").getTime();
  const scored=candidates.map(s=>{
    const sd=new Date(s.date+"T12:00:00").getTime();
    return{show:s,delta:Math.round((sd-flightDay)/86400000)};
  });
  const inWindow=direction==="inbound"
    ?scored.filter(x=>x.delta>=-1&&x.delta<=7)
    :scored.filter(x=>x.delta>=-7&&x.delta<=1);
  if(!inWindow.length)return null;
  inWindow.sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta)||a.show.date.localeCompare(b.show.date));
  return inWindow[0].show;
};

// Assemble all legs (pending + confirmed) that share the same itinerary key as `f`, sorted chronologically.
const findItineraryLegs=(f,allFlightsObj)=>{
  const key=flightItinKey(f);
  return Object.values(allFlightsObj)
    .filter(x=>flightItinKey(x)===key)
    .sort((a,b)=>`${a.depDate||""} ${a.dep||""}`.localeCompare(`${b.depDate||""} ${b.dep||""}`));
};

// ── Journey sequencing helpers ───────────────────────────────────────────
// Compute gap in minutes between prior leg's arr and next leg's dep.
const legGapMinutes=(prev,next)=>{
  if(!prev?.arrDate||!prev?.arr||!next?.depDate||!next?.dep)return null;
  const a=new Date(`${prev.arrDate}T${prev.arr}:00`).getTime();
  const d=new Date(`${next.depDate}T${next.dep}:00`).getTime();
  if(isNaN(a)||isNaN(d))return null;
  return Math.round((d-a)/60000);
};
// Annotate legs with connection warnings. Returns [{leg, layover, warning}].
// warning ∈ {null, "tight-connection" (<60m same-airport), "missed-connection" (<0),
//            "long-layover" (>6h at interchange)}
const validateConnections=(legs)=>{
  const rows=legs.map(l=>({leg:l,layover:null,warning:null}));
  for(let i=1;i<rows.length;i++){
    const prev=rows[i-1].leg,cur=rows[i].leg;
    if(prev.to&&cur.from&&prev.to.toUpperCase()!==cur.from.toUpperCase())continue;
    const gap=cur.layoverMinutes!=null?cur.layoverMinutes:legGapMinutes(prev,cur);
    if(gap==null)continue;
    rows[i].layover=gap;
    if(gap<0)rows[i].warning="missed-connection";
    else if(gap<60)rows[i].warning="tight-connection";
    else if(gap>360)rows[i].warning="long-layover";
  }
  return rows;
};
// Find the return-half leg for a round-trip. Prefers explicit returnOfId, then
// journeyRef grouping, then reverse-route + same-pax heuristic.
const findReturnLeg=(f,allFlightsObj)=>{
  if(!f)return null;
  const all=Object.values(allFlightsObj||{});
  if(f.returnOfId){
    const back=all.find(x=>x.id===f.returnOfId||`${x.tid}#0`===f.returnOfId);
    if(back)return back;
  }
  const byRet=all.find(x=>x.returnOfId&&(x.returnOfId===f.id||x.returnOfId===`${f.tid}#0`));
  if(byRet)return byRet;
  if(f.journeyRef){
    const peers=all.filter(x=>x.id!==f.id&&x.journeyRef===f.journeyRef);
    const reverse=peers.find(x=>
      (x.from||"").toUpperCase()===(f.to||"").toUpperCase()&&
      (x.to||"").toUpperCase()===(f.from||"").toUpperCase()&&
      (x.depDate||"")>(f.depDate||"")
    );
    if(reverse)return reverse;
  }
  const paxKey=s=>(s.pax||[]).map(p=>String(p).toLowerCase()).sort().join("|");
  const fp=paxKey(f);
  if(!fp)return null;
  return all.find(x=>
    x.id!==f.id&&paxKey(x)===fp&&
    (x.from||"").toUpperCase()===(f.to||"").toUpperCase()&&
    (x.to||"").toUpperCase()===(f.from||"").toUpperCase()&&
    (x.depDate||"")>(f.depDate||"")
  )||null;
};

// Build a chronological timeline of all travel events touching `date`. daySegs
// is the caller-scoped list of segments (already filtered by party). lodging is
// the separate lodging store; check-ins/outs on `date` become timeline entries.
// Each entry: {kind, seg, label, start, end, from, to, gapBefore, warning}.
// start/end are HH:MM strings; gapBefore is minutes since previous entry's end.
const buildDayTimeline=(date,daySegs,lodging)=>{
  const entries=[];
  (daySegs||[]).forEach(s=>{
    const t=segType(s);
    const isArr=s._role==="arr"||(s.arrDate===date&&s.depDate!==date);
    const start=isArr?s.arr:s.dep;
    const end=isArr?s.arr:(s.arr||s.dep);
    if(!start)return;
    const label=t==="air"?(s.flightNo||s.carrier||"Flight"):t==="ground"?(s.mode||s.provider||"Ground"):t==="hotel"?(s.hotelName||"Hotel"):t==="bus"?(s.carrier||"Bus"):t==="rail"?(s.trainNo||s.carrier||"Rail"):"Seg";
    entries.push({kind:t,seg:s,label,start,end,from:isArr?s.fromCity||s.from:s.fromCity||s.from,to:s.toCity||s.to,isArr});
  });
  Object.values(lodging||{}).forEach(h=>{
    if(!h)return;
    if(h.checkIn===date)entries.push({kind:"hotel_in",seg:h,label:h.hotelName||"Hotel",start:h.checkInTime||HOTEL_DEFAULT_CHECKIN,end:h.checkInTime||HOTEL_DEFAULT_CHECKIN,from:null,to:h.city||h.hotelName});
    if(h.checkOut===date)entries.push({kind:"hotel_out",seg:h,label:h.hotelName||"Hotel",start:h.checkOutTime||HOTEL_DEFAULT_CHECKOUT,end:h.checkOutTime||HOTEL_DEFAULT_CHECKOUT,from:h.hotelName,to:null});
  });
  entries.sort((a,b)=>(hhmmToMin(a.start)??0)-(hhmmToMin(b.start)??0));
  for(let i=0;i<entries.length;i++){
    if(i===0){entries[i].gapBefore=null;entries[i].warning=null;continue;}
    const prev=entries[i-1],cur=entries[i];
    const g=(hhmmToMin(cur.start)??0)-(hhmmToMin(prev.end)??0);
    cur.gapBefore=g;
    cur.warning=null;
    const sameAirport=prev.kind==="air"&&cur.kind==="air"&&
      (prev.seg?.to||"").toUpperCase()===(cur.seg?.from||"").toUpperCase();
    if(sameAirport&&g<60&&g>=0)cur.warning="tight-connection";
    else if(sameAirport&&g<0)cur.warning="missed-connection";
    else if(prev.kind==="air"&&prev.isArr&&!["ground","bus","rail"].includes(cur.kind)&&g>30){
      // Air arrival with no ground/bus follow-up before the next event at a different place → unbridged.
      const prevCity=cityKey(prev.to||prev.seg?.toCity||"");
      const curCity=cityKey(cur.from||cur.to||cur.seg?.city||"");
      if(prevCity&&curCity&&prevCity!==curCity)cur.warning="unbridged";
      else if(prev.to&&cur.kind==="hotel_in")cur.warning="unbridged";
    }else if(g>360)cur.warning="long-layover";
  }
  return entries;
};

// ── Segment model (unified travel store) ───────────────────────────────────
// The `flights` store widens into a generic segments store: each record has a `type`
// ∈ {air, ground, bus, rail, sea, hotel}. Legacy records (no type) are implicitly "air".
// Ground/bus/etc. segments share the air shape with different fields populated:
//   air:    flightNo, carrier, from/to (IATA), fromCity/toCity, dep/arr, pax
//   ground: mode (uber|drive|taxi|lyft|rideshare|friend), provider, from/to (labels or
//           addresses), fromCity/toCity, dep/arr, pax, distance, duration
//   bus:    carrier, from/to, dep/arr, pax, route
//   rail:   carrier, trainNo, from/to, dep/arr, pax
//   hotel:  hotelName, from (address), checkIn/checkOut dates, pax
const SEG_META={
  air:   {label:"Flight",  icon:"✈", color:"var(--link)", bg:"var(--info-bg)", border:"var(--info-bg)"},
  ground:{label:"Ground",  icon:"🚗", color:"var(--warn-fg)", bg:"var(--warn-bg)", border:"var(--warn-bg)"},
  bus:   {label:"Bus",     icon:"🚌", color:"var(--info-fg)", bg:"var(--info-bg)", border:"var(--info-bg)"},
  rail:  {label:"Rail",    icon:"🚆", color:"var(--success-fg)", bg:"var(--success-bg)", border:"var(--success-fg)"},
  sea:   {label:"Sea",     icon:"⛴", color:"var(--info-fg)", bg:"var(--info-bg)", border:"var(--info-fg)"},
  hotel: {label:"Hotel",   icon:"🏨", color:"var(--accent)", bg:"var(--accent-pill-bg)", border:"var(--accent-pill-border)"},
};
const segType=s=>s?.type||(s?.flightNo||s?.carrier?"air":"ground");
const segMeta=s=>SEG_META[segType(s)]||SEG_META.air;

// Airport check-in buffers in minutes before scheduled departure. Split by
// with-checked-bag vs carry-on-only. Override per segment via seg.airportBuffer.
const AIRPORT_BUFFERS={
  // EU hubs (typical Schengen/int'l queues)
  LHR:{bag:180,carry:120}, LGW:{bag:180,carry:120}, STN:{bag:150,carry:120}, LCY:{bag:90,carry:60}, LTN:{bag:150,carry:120},
  CDG:{bag:180,carry:120}, ORY:{bag:150,carry:120}, BVA:{bag:120,carry:90},
  AMS:{bag:150,carry:120}, FRA:{bag:150,carry:120}, MUC:{bag:150,carry:120}, CGN:{bag:120,carry:90}, DUS:{bag:120,carry:90},
  MXP:{bag:150,carry:120}, LIN:{bag:90,carry:60}, BGY:{bag:120,carry:90},
  MAD:{bag:150,carry:120}, BCN:{bag:150,carry:120},
  FCO:{bag:150,carry:120}, VCE:{bag:120,carry:90},
  ZRH:{bag:120,carry:90}, GVA:{bag:120,carry:90}, BSL:{bag:120,carry:90},
  VIE:{bag:120,carry:90}, BER:{bag:120,carry:90},
  DUB:{bag:120,carry:90},
  MAN:{bag:120,carry:90}, GLA:{bag:90,carry:60}, EDI:{bag:90,carry:60},
  PRG:{bag:120,carry:90}, BUD:{bag:120,carry:90}, WAW:{bag:120,carry:90}, WMI:{bag:90,carry:60},
  CPH:{bag:120,carry:90}, ARN:{bag:120,carry:90}, OSL:{bag:120,carry:90}, HEL:{bag:120,carry:90},
  LIS:{bag:120,carry:90}, OPO:{bag:120,carry:90},
  BTS:{bag:90,carry:60},
  // NA hubs
  JFK:{bag:150,carry:120}, LGA:{bag:120,carry:90}, EWR:{bag:150,carry:120},
  LAX:{bag:150,carry:120}, BUR:{bag:60,carry:45}, LGB:{bag:60,carry:45}, SNA:{bag:75,carry:60}, ONT:{bag:75,carry:60},
  SFO:{bag:120,carry:90}, OAK:{bag:90,carry:60}, SJC:{bag:90,carry:60},
  SEA:{bag:90,carry:60}, PDX:{bag:90,carry:60},
  ORD:{bag:150,carry:120}, MDW:{bag:120,carry:90},
  ATL:{bag:150,carry:120}, DFW:{bag:150,carry:120}, IAH:{bag:150,carry:120},
  DEN:{bag:90,carry:60}, PHX:{bag:90,carry:60}, LAS:{bag:90,carry:60},
  BOS:{bag:120,carry:90}, PHL:{bag:120,carry:90}, DCA:{bag:120,carry:90}, IAD:{bag:150,carry:120},
  MIA:{bag:150,carry:120}, FLL:{bag:120,carry:90}, MCO:{bag:120,carry:90}, TPA:{bag:90,carry:60},
  BNA:{bag:90,carry:60}, BDL:{bag:90,carry:60}, PVD:{bag:90,carry:60}, MHT:{bag:75,carry:60},
  MSP:{bag:90,carry:60}, DTW:{bag:120,carry:90},
  // Canada
  YYZ:{bag:120,carry:90}, YTZ:{bag:60,carry:45}, YUL:{bag:120,carry:90}, YVR:{bag:120,carry:90},
  YOW:{bag:90,carry:60}, YHZ:{bag:90,carry:60}, YWG:{bag:90,carry:60}, YYC:{bag:90,carry:60},
  __default:{bag:120,carry:90},
};
const airportBufferMin=(iata,hasBag=true)=>{
  const b=AIRPORT_BUFFERS[(iata||"").toUpperCase()]||AIRPORT_BUFFERS.__default;
  return hasBag?b.bag:b.carry;
};
// Subtract `mins` from "HH:MM" and return "HH:MM" (wraps into negative = previous day warning separately).
const subtractMinutes=(hhmm,mins)=>{
  const t=hhmmToMin(hhmm);if(t==null)return"";
  const diff=t-mins;
  if(diff<0){const d=1440+diff;return`${String(Math.floor(d/60)).padStart(2,"0")}:${String(d%60).padStart(2,"0")}*`;}
  return`${String(Math.floor(diff/60)).padStart(2,"0")}:${String(diff%60).padStart(2,"0")}`;
};

// ── Lodging-mode inference ────────────────────────────────────────────────
// Bus dates: crew sleep on the Pieter Smit nightliner; hotel rooms are not needed
// (artist may take one off-day; tracked separately). Any date in BUS_DATA_MAP with
// a show or travel entry is treated as "bus". Everything else (Red Rocks, NA summer,
// post-EU one-offs) is "hotel" — requires room + airport/hotel/venue ground chain.
const lodgingModeFor=(date,tourDaysObj)=>{
  const td=tourDaysObj?.[date];
  const bus=td?.bus||BUS_DATA_MAP[date];
  if(!bus)return"hotel";
  // Days marked explicitly "off" outside the bus window don't count.
  if(td?.type==="off"&&!bus)return"hotel";
  return"bus";
};
const daysBetween=(a,b)=>{
  if(!a||!b)return 0;
  return Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/86400000);
};
// Classify a crew member's role on a given show date based on their attending
// history: bus-mid (middle of the bus run — on bus, no segments expected),
// bus-join (first bus day, needs inbound air + ground to bus),
// bus-leave (last bus day, needs ground to airport + outbound air),
// bus-solo (attending only one bus day — effectively treat like one-off bus),
// fly-one-off (standalone fly-in/fly-out show with hotel).
const crewLifecycleState=(crewId,date,attendingDates,tourDaysObj)=>{
  const thisMode=lodgingModeFor(date,tourDaysObj);
  if(thisMode!=="bus")return"fly-one-off";
  const idx=(attendingDates||[]).indexOf(date);
  const prev=idx>0?attendingDates[idx-1]:null;
  const next=idx>=0&&idx<attendingDates.length-1?attendingDates[idx+1]:null;
  const prevBus=prev?lodgingModeFor(prev,tourDaysObj)==="bus":false;
  const nextBus=next?lodgingModeFor(next,tourDaysObj)==="bus":false;
  const gapPrev=prev?daysBetween(prev,date):999;
  const gapNext=next?daysBetween(date,next):999;
  // Consider "consecutive on bus" = prev within 3 days and also bus mode.
  const joinedFromBus=prevBus&&gapPrev<=3;
  const stayingOnBus=nextBus&&gapNext<=3;
  if(!joinedFromBus&&!stayingOnBus)return"bus-solo";
  if(!joinedFromBus)return"bus-join";
  if(!stayingOnBus)return"bus-leave";
  return"bus-mid";
};

// Given a lifecycle state + the data, return an ordered list of lifecycle slots for
// rendering. Each slot: {key, icon, label, state: "ok"|"missing"|"na"|"unknown"}.
// "ok" = segment present; "missing" = expected but not found; "na" = not applicable
// (e.g. hotel slot on a bus-mid day); "unknown" = segment is not tracked as a
// distinct record (hotel stays without a check-in record).
const crewLifecycleSlots=({state,crewId,crew,date,showCrew,flights,lodging})=>{
  const cd=showCrew?.[date]?.[crewId]||{};
  const cname=(crew||[]).find(c=>c.id===crewId)?.name||"";
  const fname=cname.split(" ")[0].toLowerCase();
  const paxIncludes=(pax)=>fname&&(pax||[]).some(n=>String(n||"").toLowerCase().startsWith(fname));
  const allSegs=Object.values(flights||{}).filter(s=>s&&s.status!=="dismissed");
  const hasInboundAir=(cd.inbound||[]).some(l=>l.flight||l.flightId)||allSegs.some(s=>segType(s)==="air"&&s.arrDate===date&&paxIncludes(s.pax));
  const hasOutboundAir=(cd.outbound||[]).some(l=>l.flight||l.flightId)||allSegs.some(s=>segType(s)==="air"&&s.depDate===date&&paxIncludes(s.pax));
  const groundsArriving=allSegs.filter(s=>segType(s)==="ground"&&s.arrDate===date&&paxIncludes(s.pax));
  const groundsDeparting=allSegs.filter(s=>segType(s)==="ground"&&s.depDate===date&&paxIncludes(s.pax));
  // Hotel presence: check the dedicated lodging store (room assigned to this crewId,
  // covering this date) OR any segment-style hotel record the user may have added.
  const hotelFromLodging=Object.values(lodging||{}).some(h=>h&&h.checkIn<=date&&h.checkOut>=date&&(h.rooms||[]).some(r=>r.crewId===crewId));
  const hotelOnDate=hotelFromLodging||allSegs.some(s=>segType(s)==="hotel"&&(s.depDate===date||s.arrDate===date)&&paxIncludes(s.pax));
  if(state==="bus-mid"){
    return[{key:"bus",icon:"🚌",label:"On bus",state:"ok"}];
  }
  if(state==="bus-join"){
    return[
      {key:"fly-in",icon:"✈",label:"Inbound flight",state:hasInboundAir?"ok":"missing"},
      {key:"gnd-in",icon:"🚗",label:"Airport → Bus pickup",state:groundsArriving.length?"ok":"missing"},
      {key:"bus",icon:"🚌",label:"On bus",state:"ok"},
    ];
  }
  if(state==="bus-leave"){
    return[
      {key:"bus",icon:"🚌",label:"On bus",state:"ok"},
      {key:"gnd-out",icon:"🚗",label:"Bus → Airport",state:groundsDeparting.length?"ok":"missing"},
      {key:"fly-out",icon:"✈",label:"Outbound flight",state:hasOutboundAir?"ok":"missing"},
    ];
  }
  if(state==="bus-solo"){
    // Standalone bus day: needs full chain in and out but lodging is the bus.
    return[
      {key:"fly-in",icon:"✈",label:"Inbound flight",state:hasInboundAir?"ok":"missing"},
      {key:"gnd-in",icon:"🚗",label:"Airport → Bus",state:groundsArriving.length?"ok":"missing"},
      {key:"bus",icon:"🚌",label:"On bus",state:"ok"},
      {key:"gnd-out",icon:"🚗",label:"Bus → Airport",state:groundsDeparting.length?"ok":"missing"},
      {key:"fly-out",icon:"✈",label:"Outbound flight",state:hasOutboundAir?"ok":"missing"},
    ];
  }
  // fly-one-off: full chain with hotel
  return[
    {key:"fly-in",icon:"✈",label:"Inbound flight",state:hasInboundAir?"ok":"missing"},
    {key:"gnd-to-htl",icon:"🚗",label:"Airport → Hotel",state:groundsArriving.length?"ok":"missing"},
    {key:"hotel",icon:"🏨",label:"Hotel",state:hotelOnDate?"ok":"unknown"},
    {key:"gnd-to-ven",icon:"🚗",label:"Hotel → Venue",state:groundsDeparting.length?"ok":"missing"},
    {key:"fly-out",icon:"✈",label:"Outbound flight",state:hasOutboundAir?"ok":"missing"},
  ];
};

// Serialize a flight record into the compact leg shape used in showCrew.
const flightToLeg=f=>({
  id:`leg_${f.id}`,
  flight:f.flightNo||"",
  carrier:f.carrier||"",
  from:f.from,fromCity:f.fromCity||f.from,
  to:f.to,toCity:f.toCity||f.to,
  depart:f.dep,arrive:f.arr,
  depDate:f.depDate,arrDate:f.arrDate,
  conf:f.confirmNo||f.bookingRef||"",
  status:"confirmed",
  flightId:f.id,
});

const MN="'JetBrains Mono',monospace";

const CLIENTS=[
  {id:"bbn",name:"bbno$",type:"artist",status:"active",color:"var(--accent)",short:"BBN"},
  {id:"wkn",name:"Wakaan",type:"festival",status:"active",color:"var(--success-fg)",short:"WKN"},
  {id:"bwc",name:"Beyond Wonderland",type:"festival",status:"active",color:"var(--link)",short:"BWC"},
  {id:"elm",name:"Elements",type:"festival",status:"active",color:"var(--warn-fg)",short:"ELM"},
];
const CM=CLIENTS.reduce((a,c)=>{a[c.id]=c;return a},{});
const isClientOwner=(me,clientId)=>!!(me?.primary||[]).includes(clientId);
const ROLES=[{id:"tm_td",label:"TM/TD",c:"var(--accent)"},{id:"transport_coord",label:"Transport",c:"var(--warn-fg)"}];
const TABS=[{id:"dash",label:"Dashboard",icon:"⊞"},{id:"advance",label:"Advance",icon:"◎"},{id:"guestlist",label:"Guest List",icon:"◉"},{id:"ros",label:"Schedule",icon:"▦"},{id:"transport",label:"Logistics",icon:"◈"},{id:"finance",label:"Finance",icon:"◐"},{id:"crew",label:"Crew",icon:"◇"},{id:"lodging",label:"Lodging",icon:"⌂"},{id:"production",label:"Production",icon:"▤"},{id:"access",label:"Access",icon:"⊙"}];
const ADMIN_EMAIL="d.johnson@dayofshow.net";
const SESSION_ID=Math.random().toString(36).slice(2,9);
const PERM_ROLES=[
  {id:"tm_td",label:"TM/TD"},
  {id:"transport_coord",label:"Transport"},
  {id:"viewer",label:"Viewer"},
];
const PERM_SCHEMA=[
  {section:"Tabs",items:[
    {id:"tab.dash",label:"Dashboard"},
    {id:"tab.advance",label:"Advance"},
    {id:"tab.guestlist",label:"Guest List"},
    {id:"tab.ros",label:"Schedule"},
    {id:"tab.transport",label:"Logistics"},
    {id:"tab.finance",label:"Finance"},
    {id:"tab.crew",label:"Crew"},
    {id:"tab.lodging",label:"Lodging"},
    {id:"tab.production",label:"Production"},
  ]},
  {section:"Logistics",items:[
    {id:"feat.flights.scan",label:"Scan Flights"},
    {id:"feat.flights.edit",label:"Edit Flights"},
    {id:"feat.ground.edit",label:"Edit Ground Ops"},
  ]},
  {section:"Finance",items:[
    {id:"feat.finance.edit",label:"Edit Settlement"},
    {id:"feat.finance.ledger",label:"Ledger"},
  ]},
  {section:"Advance",items:[
    {id:"feat.advance.edit",label:"Edit Checklist"},
  ]},
  {section:"Crew",items:[
    {id:"feat.crew.edit",label:"Edit Roster"},
  ]},
  {section:"Production",items:[
    {id:"feat.production.edit",label:"Edit Production"},
  ]},
];
const DEFAULT_PERMS=(()=>{const p={};PERM_SCHEMA.forEach(s=>s.items.forEach(item=>{p[item.id]={};PERM_ROLES.forEach(r=>{p[item.id][r.id]=true;});}));return p;})();
const GL_DEFAULT_CATEGORIES=[
  {id:"artist_guest",name:"Artist Guest",side:"artist",zones:["FOH"],qty:6,walkOnQty:2},
  {id:"artist_family",name:"Artist Family",side:"artist",zones:["VIP","DR"],qty:4,walkOnQty:0},
  {id:"manager",name:"Manager",side:"artist",zones:["FOH","BS"],qty:2,walkOnQty:0},
  {id:"agent",name:"Agent",side:"artist",zones:["FOH"],qty:1,walkOnQty:0},
  {id:"media",name:"Publicist + Media",side:"artist",zones:["FOH","PIT"],qty:4,walkOnQty:0},
  {id:"feature",name:"Feature Performer",side:"artist",zones:["FOH","BS"],qty:4,walkOnQty:0},
  {id:"aaa_crew",name:"AAA Crew",side:"artist",zones:["FOH","BS","STG","CAT","DR","VIP","HOSPO","PIT"],qty:99,walkOnQty:0},
  {id:"promoter",name:"Venue Promoter",side:"venue",zones:["FOH","BS","VIP","HOSPO"],qty:6,walkOnQty:0},
  {id:"ar_manager",name:"AR Manager",side:"venue",zones:["HOSPO","VIP"],qty:4,walkOnQty:0},
  {id:"hospo",name:"Hospo Guests",side:"venue",zones:["VIP"],qty:10,walkOnQty:0},
];
const GL_STATUS=[
  {id:"draft",label:"Draft",color:"var(--text-dim)",bg:"var(--card-2)"},
  {id:"pending_approval",label:"Pending Approval",color:"var(--warn-fg)",bg:"var(--warn-bg)"},
  {id:"open",label:"Open",color:"var(--success-fg)",bg:"var(--success-bg)"},
  {id:"locked",label:"Locked",color:"var(--accent)",bg:"var(--accent-pill-bg)"},
  {id:"closed",label:"Closed",color:"var(--text-3)",bg:"var(--bg)"},
];
const GL_PARTY_ROLES=[
  {id:"artist",label:"Artist",side:"artist",defaultCategory:"artist_guest"},
  {id:"manager",label:"Manager",side:"artist",defaultCategory:"manager"},
  {id:"agent",label:"Agent",side:"artist",defaultCategory:"agent"},
  {id:"publicist",label:"Publicist",side:"artist",defaultCategory:"media"},
  {id:"family",label:"Family",side:"artist",defaultCategory:"artist_family"},
  {id:"feature",label:"Feature Performer",side:"artist",defaultCategory:"feature"},
  {id:"crew",label:"Crew",side:"artist",defaultCategory:"aaa_crew"},
  {id:"promoter",label:"Promoter",side:"venue",defaultCategory:"promoter"},
  {id:"ar_manager",label:"AR Manager",side:"venue",defaultCategory:"ar_manager"},
  {id:"hospo_mgr",label:"Hospo Manager",side:"venue",defaultCategory:"hospo"},
  {id:"talent_buyer",label:"Talent Buyer",side:"venue",defaultCategory:"promoter"},
];
const GL_DEFAULT_SHOW=()=>({
  categories:GL_DEFAULT_CATEGORIES.map(c=>({...c})),
  parties:{},
  cutoffAt:"",
  status:"draft",
  walkOnCap:10,
  notes:"",
});
const glNewId=p=>`${p}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
const GL_BUILTIN_TEMPLATE_ID="__tour_default";
const glBuiltinTemplate=()=>({id:GL_BUILTIN_TEMPLATE_ID,name:"Tour Default",builtin:true,categories:GL_DEFAULT_CATEGORIES.map(c=>({...c})),walkOnCap:10,notes:""});
const glInitFromTemplate=tpl=>({categories:(tpl?.categories||GL_DEFAULT_CATEGORIES).map(c=>({...c})),parties:{},cutoffAt:"",status:"draft",walkOnCap:tpl?.walkOnCap??10,notes:tpl?.notes||"",templateId:tpl?.id||null});
const glBuildTemplate=(name,show)=>({id:glNewId("tpl"),name:name.trim(),builtin:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),categories:(show.categories||[]).map(c=>({...c})),walkOnCap:show.walkOnCap??10,notes:show.notes||""});
const GL_ACTIVITY_CAP=200;
const glAppendActivity=(arr,entry)=>{
  const next=[...(arr||[]),entry];
  return next.length>GL_ACTIVITY_CAP?next.slice(-GL_ACTIVITY_CAP):next;
};
const glApplyTemplate=(show,tpl)=>{
  // Remap parties' categoryIds: prefer same id, else first category of matching side, else first category.
  const next={...show,categories:(tpl.categories||[]).map(c=>({...c})),walkOnCap:tpl.walkOnCap??show.walkOnCap,notes:tpl.notes||show.notes,templateId:tpl.id};
  const nextIds=new Set(next.categories.map(c=>c.id));
  if(show.parties&&Object.keys(show.parties).length){
    const mapped={};
    Object.entries(show.parties).forEach(([pid,p])=>{
      let cid=p.categoryId;
      if(!nextIds.has(cid)){
        const sideMatch=next.categories.find(c=>c.side===p.side);
        cid=sideMatch?.id||next.categories[0]?.id||cid;
      }
      mapped[pid]={...p,categoryId:cid};
    });
    next.parties=mapped;
  }
  return next;
};
const DEFAULT_CREW=[
  {id:"ag", name:"Alex Gumuchian",        role:"Headliner (bbno$)",          email:"alexgumuchian@gmail.com"},
  {id:"jb", name:"Julien Bruce",           role:"Support (Jungle Bobby)",     email:""},
  {id:"mse",name:"Mat Senechal",           role:"Bassist/Keys",               email:""},
  {id:"tip",name:"Taylor Madrigal (Tip)",  role:"DJ",                         email:""},
  {id:"ac", name:"Andrew Campbell",        role:"DJ (Bishu)",                 email:""},
  {id:"dj", name:"Davon Johnson",          role:"TM/TD",                      email:"d.johnson@dayofshow.net"},
  {id:"ms", name:"Mike Sheck",             role:"PM (Advance)",               email:"mikesheck@l7touring.com"},
  {id:"dn", name:"Dan Nudelman",           role:"PM (On-site)",               email:"dan@noodle.management"},
  {id:"tc", name:"TBD",                    role:"Tour Coordinator",           email:""},
  {id:"rm", name:"Ruairi Matthews",        role:"FOH Audio",                  email:"ruairim@magentasound.ca"},
  {id:"nf", name:"Nick Foerster",          role:"Monitor Engineer",           email:""},
  {id:"sa", name:"Saad A.",               role:"Audio/BNE",                  email:""},
  {id:"gg", name:"Gabe Greenwood",         role:"LD",                         email:""},
  {id:"lt1",name:"TBD",                    role:"LED Tech 1",                 email:""},
  {id:"lt2",name:"TBD",                    role:"LED Tech 2",                 email:""},
  {id:"cl", name:"Cody Leggett",           role:"Lasers/LSO",                 email:"cody@photon7.com"},
  {id:"mh", name:"Michael Heid",           role:"Visual/Set Design (Sigma-1)",email:"bbno-visual@sigma-1.com"},
  {id:"go", name:"Grace Offerdahl",        role:"Merch (Tour Seller)",        email:"graceofferdahl@gmail.com"},
  {id:"nm", name:"Nathan McCoy",           role:"Merch Dir (A3)",             email:"nathan@a3merch.com"},
  {id:"mp", name:"Megan Putnam",           role:"Hospo/GL",                   email:"mputnam5@yahoo.com"},
  {id:"od", name:"O'Len Davis",            role:"Content & Media",            email:""},
  {id:"gb", name:"Guillaume Bessette",     role:"Bus Driver (Prod.G)",        email:""},
  {id:"td", name:"TBD",                    role:"Truck Driver",               email:""},
];
const AB=new Set(["bus_arrive","doors_early","doors_ga","clear","bus_depart"]);

const UI={
  expandPanel:{background:"var(--card-4)",borderLeft:"3px solid var(--accent)",padding:"10px 14px 12px"},
  expandBtn:(open,accent="var(--accent)")=>({background:open?"var(--accent)":accent,border:"none",borderRadius:6,color:"#fff",fontSize:10,padding:"4px 11px",cursor:"pointer",fontWeight:700}),
  sectionLabel:{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6},
  input:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:"'Outfit',system-ui"},
};

const DEPTS=[
  {id:"all",label:"All",color:"var(--text-2)",bg:"var(--card-2)"},
  {id:"artist_team",label:"Artist Team",color:"var(--accent)",bg:"var(--accent-pill-bg)"},
  {id:"venue",label:"Venue / Promoter",color:"var(--success-fg)",bg:"var(--success-bg)"},
  {id:"ar_hospo",label:"AR / Hospo",color:"var(--success-fg)",bg:"var(--success-bg)"},
  {id:"transport",label:"Transport",color:"var(--link)",bg:"var(--info-bg)"},
  {id:"production",label:"Production",color:"var(--warn-fg)",bg:"var(--warn-bg)"},
  {id:"vendors",label:"Vendors",color:"var(--accent-soft)",bg:"var(--accent-pill-bg)"},
  {id:"site_ops",label:"Site Ops",color:"var(--info-fg)",bg:"var(--info-bg)"},
  {id:"quartermaster",label:"Quartermaster",color:"var(--text-dim)",bg:"var(--card-3)"},
];
const DM=DEPTS.reduce((a,d)=>{a[d.id]=d;return a},{});

// locked:true = status only, question immutable | locked:false/undefined = editable
const AT=[
  {id:"at1",dept:"artist_team",dir:"we_provide",q:"Rider submitted (production + hospitality)."},
  {id:"at2",dept:"artist_team",dir:"we_provide",q:"Crew list and credentials submitted."},
  {id:"at3",dept:"artist_team",dir:"we_provide",q:"Tech spec submitted (FOH plot, monitor world, power req, LED manifest)."},
  {id:"at4",dept:"artist_team",dir:"we_provide",q:"M&G preferences confirmed (count, timing, format, photo policy)."},
  {id:"at5",dept:"artist_team",dir:"we_provide",q:"Guest list submitted (AA, GA, plus-ones, crew holds)."},
  {id:"at6",dept:"artist_team",dir:"we_provide",q:"Travel itinerary shared with venue (bus arrival, flight if applicable)."},
  {id:"vn1",dept:"venue",dir:"they_provide",q:"Venue tech pack sent (stage plot, rigging plan, CAD, PSR)."},
  {id:"vn2",dept:"venue",dir:"they_provide",q:"House LX patch, node addresses, and type sent for pre-merge."},
  {id:"vn3",dept:"venue",dir:"they_provide",q:"Guest allotment confirmed. Access levels (VIP, GA, AA)."},
  {id:"vn4",dept:"venue",dir:"they_provide",q:"Merch terms confirmed (artist-sells or venue-sells, split %)."},
  {id:"vn5",dept:"venue",dir:"they_provide",q:"Hospitality budget confirmed. Cash leftover or buyout."},
  {id:"vn6",dept:"venue",dir:"they_provide",q:"Friends and family viewing area. Location and capacity."},
  {id:"vn7",dept:"venue",dir:"they_provide",locked:true,q:"Withholding tax requirements and immigration documentation provided."},
  {id:"vn8",dept:"venue",dir:"they_provide",locked:true,q:"Wire transfer details, tax forms, and withholding docs for settlement."},
  {id:"ar1",dept:"ar_hospo",dir:"bilateral",q:"Hospitality setup confirmed (room layout, catering, green room)."},
  {id:"ar2",dept:"ar_hospo",dir:"bilateral",q:"Hotel confirmation received. Artist and touring party assigned."},
  {id:"ar3",dept:"ar_hospo",dir:"bilateral",q:"M&G logistics locked (room, flow, security, photo station)."},
  {id:"ar4",dept:"ar_hospo",dir:"bilateral",q:"Badge/credential allocation received and distributed."},
  {id:"ar5",dept:"ar_hospo",dir:"they_provide",q:"Runner scheduled. Rate confirmed. Can handle crew transfers."},
  {id:"ar6",dept:"ar_hospo",dir:"they_provide",q:"WiFi credentials provided (network + password)."},
  {id:"ar7",dept:"ar_hospo",dir:"bilateral",q:"Towels confirmed: 25 bath + 10 black stage per show day."},
  {id:"tr1",dept:"transport",dir:"bilateral",q:"Parking confirmed: nightliner + truck for required nights."},
  {id:"tr2",dept:"transport",dir:"they_provide",q:"Shore power (32A 3-phase) available at parking location."},
  {id:"tr3",dept:"transport",dir:"they_provide",q:"Loading dock access details and dimensions provided."},
  {id:"tr4",dept:"transport",dir:"they_provide",q:"Overnight parking restrictions and permits confirmed."},
  {id:"tr5",dept:"transport",dir:"bilateral",q:"Parking/dock layout or satellite image received."},
  {id:"tr6",dept:"transport",dir:"we_provide",q:"Driver contact shared with venue (name, mobile, vehicle info)."},
  {id:"tr7",dept:"transport",dir:"bilateral",q:"Bus arrival window confirmed. Power connect on arrival."},
  {id:"pr1",dept:"production",dir:"they_provide",q:"Guest Cat5e or Cat6 line available. Length and shielding confirmed."},
  {id:"pr2",dept:"production",dir:"they_provide",locked:true,q:"RF permitting confirmed for IEM (470-542 MHz) and mic (470-636 MHz)."},
  {id:"pr3",dept:"production",dir:"they_provide",locked:true,q:"Laser zoning confirmed. Venue map with cameras/projectors sent."},
  {id:"pr4",dept:"production",dir:"they_provide",q:"Labor call confirmed with PM. Quote received per position."},
  {id:"pr5",dept:"production",dir:"they_provide",q:"Loaders doubling as hands confirmed or additional hands called."},
  {id:"pr6",dept:"production",dir:"bilateral",q:"Power distribution confirmed (200A 3ph LX, 60A VX, 100A audio)."},
  {id:"pr7",dept:"production",dir:"bilateral",q:"Greenroom/dressing room layout confirmed. Rooms assigned."},
  {id:"vd1",dept:"vendors",dir:"bilateral",q:"Equipment delivery window confirmed with production."},
  {id:"vd2",dept:"vendors",dir:"bilateral",q:"Setup and strike time allocated in venue schedule."},
  {id:"vd3",dept:"vendors",dir:"we_provide",locked:true,q:"COI / insurance certificate submitted to venue."},
  {id:"vd4",dept:"vendors",dir:"bilateral",q:"Payment terms confirmed. Invoice submitted."},
  {id:"vd5",dept:"vendors",dir:"bilateral",q:"Vendor parking and unloading access confirmed."},
  {id:"so1",dept:"site_ops",dir:"bilateral",q:"Security meeting time confirmed."},
  {id:"so2",dept:"site_ops",dir:"they_provide",q:"Security deployment schedule provided (perimeter, pit, backstage, bus)."},
  {id:"so3",dept:"site_ops",dir:"they_provide",q:"Forklift availability confirmed (extensions if no loading dock)."},
  {id:"so4",dept:"site_ops",dir:"they_provide",q:"Cable ramp accessible at load-in."},
  {id:"so5",dept:"site_ops",dir:"bilateral",q:"Photo/video policy communicated to venue security."},
  {id:"qm1",dept:"quartermaster",dir:"we_provide",q:"Expendables list submitted (tape, batteries, misc supplies)."},
  {id:"qm2",dept:"quartermaster",dir:"bilateral",q:"Storage location confirmed for tour cases and excess gear."},
  {id:"qm3",dept:"quartermaster",dir:"bilateral",q:"Towel order confirmed (25 bath, 10 black stage). Delivery location set."},
  {id:"qm4",dept:"quartermaster",dir:"bilateral",q:"Stage supplies confirmed (music stands, chairs, power strips)."},
];

const SC={
  pending:{l:"Pending",c:"var(--text-dim)",b:"var(--card-2)"},
  sent:{l:"Sent",c:"var(--text-3)",b:"var(--border)"},
  received:{l:"Received",c:"var(--text-3)",b:"var(--border)"},
  in_progress:{l:"In Progress",c:"var(--link)",b:"var(--info-bg)"},
  respond:{l:"Respond",c:"var(--warn-fg)",b:"var(--warn-bg)"},
  follow_up:{l:"Follow Up",c:"var(--warn-fg)",b:"var(--warn-bg)"},
  escalate:{l:"Escalate",c:"var(--danger-fg)",b:"var(--danger-bg)"},
  confirmed:{l:"Confirmed",c:"var(--success-fg)",b:"var(--success-bg)"},
  na:{l:"N/A",c:"var(--text-mute)",b:"var(--card-2)"},
  // Stored rows written before "responded" was renamed to "in_progress"; render them the same.
  responded:{l:"In Progress",c:"var(--link)",b:"var(--info-bg)"},
};
const SC_CYCLE=["pending","in_progress","confirmed"];
const SC_ORDER=["pending","in_progress","sent","received","respond","follow_up","escalate","confirmed","na"];
// Immigration entity — country-scoped, spans multiple shows.
// Lifecycle: not_started → in_progress → submitted → received → approved (or rejected).
const IMM_TYPES=[
  {id:"work_permit",l:"Work Permit"},
  {id:"visa",l:"Visa"},
  {id:"withholding",l:"Withholding / Tax"},
  {id:"customs",l:"Customs / Carnet"},
  {id:"other",l:"Other"},
];
const IMM_STATUS=[
  {id:"not_started",l:"Not Started",c:"var(--text-dim)",b:"var(--muted-bg)"},
  {id:"in_progress",l:"In Progress",c:"var(--link)",b:"var(--info-bg)"},
  {id:"submitted",l:"Submitted",c:"var(--warn-fg)",b:"var(--warn-bg)"},
  {id:"received",l:"Received",c:"var(--accent)",b:"var(--accent-pill-bg)"},
  {id:"approved",l:"Approved",c:"var(--success-fg)",b:"var(--success-bg)"},
  {id:"rejected",l:"Rejected",c:"var(--danger-fg)",b:"var(--danger-bg)"},
  {id:"na",l:"N/A",c:"var(--text-mute)",b:"var(--muted-bg)"},
];
const PRE_STAGES=[{id:"contract_received",l:"Contract Received"},{id:"estimate_received",l:"Pre-Show Estimate"},{id:"guarantee_confirmed",l:"Guarantee Confirmed"}];
const POST_STAGES=[{id:"expenses_reviewed",l:"Expenses Reviewed"},{id:"disputes_resolved",l:"Disputes Resolved"},{id:"payment_initiated",l:"Payment Initiated"},{id:"wire_ref_confirmed",l:"Wire Ref # Confirmed",req:true},{id:"signed_sheet",l:"Signed Sheet Received",req:true}];
// Financial events — distinct timelines per event. Settlement lands same-night,
// wire can arrive T+45, withholding triggers T+30. Modeling as independent events
// avoids status collisions on a single show-level record.
const FIN_EVENT_TYPES=[
  {id:"settlement",l:"Settlement",c:"var(--success-fg)",b:"var(--success-bg)"},
  {id:"wire",l:"Wire",c:"var(--link)",b:"var(--info-bg)"},
  {id:"withholding",l:"Withholding",c:"var(--warn-fg)",b:"var(--warn-bg)"},
  {id:"merch",l:"Merch",c:"var(--accent)",b:"var(--accent-pill-bg)"},
  {id:"reconciliation",l:"Reconciliation",c:"var(--text-2)",b:"var(--muted-bg)"},
  {id:"other",l:"Other",c:"var(--text-dim)",b:"var(--muted-bg)"},
];
const FIN_EVENT_STATUS=[
  {id:"pending",l:"Pending",c:"var(--text-dim)",b:"var(--muted-bg)"},
  {id:"in_progress",l:"In Progress",c:"var(--link)",b:"var(--info-bg)"},
  {id:"confirmed",l:"Confirmed",c:"var(--success-fg)",b:"var(--success-bg)"},
  {id:"disputed",l:"Disputed",c:"var(--danger-fg)",b:"var(--danger-bg)"},
];

const toM=(h,m=0)=>h*60+m;
const fmt=mins=>{if(mins==null)return"--";const n=((mins%1440)+1440)%1440,h=Math.floor(n/60),m=n%60,p=h>=12?"p":"a",h12=h===0?12:h>12?h-12:h;return`${h12}:${String(m).padStart(2,"0")}${p}`;};
const pM=str=>{if(!str)return null;const m=str.match(/^(\d{1,2}):(\d{2})\s*(a|p|am|pm)?$/i);if(!m)return null;let h=parseInt(m[1]);const mi=parseInt(m[2]),pe=(m[3]||"a").toLowerCase();if(pe.startsWith("p")&&h<12)h+=12;if(pe.startsWith("a")&&h===12)h=0;return h*60+mi;};
const dU=d=>Math.ceil((new Date(d+"T12:00:00")-new Date())/86400000);
const fD=d=>new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});
const fW=d=>new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"});
const fFull=d=>new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
const sG=async k=>{try{const r=await window.storage.get(k);return r?JSON.parse(r.value):null}catch(e){console.error("[storage.get]",k,e?.message||e);return null}};
const sS=async(k,v)=>{try{await window.storage.set(k,JSON.stringify(v));return true}catch(e){console.error("[storage.set]",k,e?.message||e);return false}};

const ALL_SHOWS=[
  {date:"2026-04-16",clientId:"bbn",city:"Morrison",venue:"Red Rocks Amphitheatre",country:"US",region:"na",promoter:"AEG / Sasha Minkov",advance:[{name:"Sasha Minkov",email:"sminkov@aegpresents.com",role:"Promoter",dept:"venue"}],doors:toM(17,30),curfew:toM(23,30),busArrive:toM(7),crewCall:toM(8),venueAccess:toM(7),mgTime:toM(16,30),notes:"Hard curfew 11:30p. BNP vendor. w/ Oliver Tree.",customRos:true},
  {date:"2026-05-01",clientId:"bbn",city:"Worcester",venue:"WPI",country:"US",region:"na",promoter:"Pretty Polly / Tori Pacheco",advance:[{name:"Dan Saldarini",email:"dan@prettypolly.com",role:"Promoter",dept:"venue"},{name:"Tori Pacheco",email:"tori@prettypolly.com",role:"Hospo",dept:"ar_hospo"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10),venueAccess:toM(9),mgTime:toM(16,30),notes:"Advance past due."},
  {date:"2026-05-04",clientId:"bbn",city:"Dublin",venue:"National Stadium",country:"IE",region:"eu",promoter:"MCD / Zach Desmond",advance:[{name:"Brian Fluskey",email:"brianfluskey@gmail.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"Show 1/2."},
  {date:"2026-05-05",clientId:"bbn",city:"Dublin",venue:"National Stadium",country:"IE",region:"eu",promoter:"MCD / Zach Desmond",advance:[{name:"Brian Fluskey",email:"brianfluskey@gmail.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"Show 2/2."},
  {date:"2026-05-07",clientId:"bbn",city:"Manchester",venue:"O2 Victoria Warehouse",country:"GB",region:"eu",promoter:"LN UK / Kiarn Eslami",advance:[{name:"Tyrone",email:"tyrone84@gmail.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"Show 1/2."},
  {date:"2026-05-08",clientId:"bbn",city:"Manchester",venue:"O2 Victoria Warehouse",country:"GB",region:"eu",promoter:"LN UK",advance:[{name:"Tyrone",email:"tyrone84@gmail.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"Show 2/2."},
  {date:"2026-05-10",clientId:"bbn",city:"Glasgow",venue:"O2 Academy",country:"GB",region:"eu",promoter:"DF Concerts",advance:[{name:"Charmaine Hardman",email:"charmaine.hardman@dfconcerts.co.uk",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"Show 1/2."},
  {date:"2026-05-11",clientId:"bbn",city:"Glasgow",venue:"O2 Academy",country:"GB",region:"eu",promoter:"DF Concerts",advance:[{name:"Charmaine Hardman",email:"charmaine.hardman@dfconcerts.co.uk",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"Show 2/2."},
  {date:"2026-05-13",clientId:"bbn",city:"London",venue:"O2 Brixton Academy",country:"GB",region:"eu",promoter:"LN UK",advance:[{name:"Tyrone",email:"tyrone84@gmail.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"10h drive from Glasgow May 12."},
  {date:"2026-05-15",clientId:"bbn",city:"Zurich",venue:"Halle 622",country:"CH",region:"eu",promoter:"Gadget / Stefan Wyss",advance:[{name:"Sarah Blum",email:"sarah.blum@gadget.ch",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9,30),crewCall:toM(10,30),venueAccess:toM(9,30),mgTime:toM(16,30)},
  {date:"2026-05-16",clientId:"bbn",city:"Cologne",venue:"E-Werk",country:"DE",region:"eu",promoter:"LN DE",advance:[{name:"Oli Zimmermann",email:"oliver.zimmermann@livenation-production.de",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(11),crewCall:toM(11,30),venueAccess:toM(8),mgTime:toM(16,30),notes:"Bus 11:00a. Local crew 08:00a."},
  {date:"2026-05-17",clientId:"bbn",city:"Cologne",venue:"Palladium",country:"DE",region:"eu",promoter:"LN DE",advance:[{name:"Oli Zimmermann",email:"oliver.zimmermann@livenation-production.de",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-05-19",clientId:"bbn",city:"Amsterdam",venue:"AFAS Live",country:"NL",region:"eu",promoter:"MOJO",advance:[{name:"John Cameron",email:"j.cameron@mojo.nl",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-05-20",clientId:"bbn",city:"Paris",venue:"Le Bataclan",country:"FR",region:"eu",promoter:"LN FR",advance:[{name:"Cyril Legauffey",email:"c.legauffey@gmail.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(11),crewCall:toM(11,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"⚠ Immigration forms outstanding."},
  {date:"2026-05-22",clientId:"bbn",city:"Milan",venue:"Fabrique",country:"IT",region:"eu",promoter:"LN IT",advance:[{name:"Andrea Aurigo",email:"andrea.aurigo@livenation.it",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9,30),crewCall:toM(10,30),venueAccess:toM(9,30),mgTime:toM(16,30)},
  {date:"2026-05-24",clientId:"bbn",city:"Prague",venue:"SaSaZu",country:"CZ",region:"eu",promoter:"Fource",advance:[{name:"Barbora Rehorova",email:"bara@fource.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-05-26",clientId:"bbn",city:"Berlin",venue:"Columbiahalle",country:"DE",region:"eu",promoter:"LN DE",advance:[{name:"Oli Zimmermann",email:"oliver.zimmermann@livenation-production.de",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-05-28",clientId:"bbn",city:"Bratislava",venue:"Majestic Music Club",country:"SK",region:"eu",promoter:"LN HU",advance:[{name:"Peter Lipovsky",email:"peter.lipovsky@gmail.com",role:"Production",dept:"venue"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-05-30",clientId:"bbn",city:"Warsaw",venue:"Orange Festival",country:"PL",region:"eu",promoter:"AlterArt",advance:[],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-06-26",clientId:"bbn",city:"Chambord",venue:"Chambord Live",country:"FR",region:"eu-post",promoter:"LN SAS",advance:[],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"⚠ Immigration forms outstanding."},
  {date:"2026-06-28",clientId:"bbn",city:"Villeurbanne",venue:"Le Transbordeur",country:"FR",region:"eu-post",promoter:"LN SAS",advance:[],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"⚠ Immigration forms outstanding."},
  {date:"2026-07-01",clientId:"bbn",city:"Mississauga",venue:"Celebration Square",country:"CA",region:"summer",promoter:"TBD",advance:[],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-07-11",clientId:"bbn",city:"Uncasville",venue:"Mohegan Sun Arena",country:"US",region:"summer",promoter:"TBD",advance:[],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-07-12",clientId:"bbn",city:"Ottawa",venue:"Ottawa Bluesfest",country:"CA",region:"summer",promoter:"TBD",advance:[],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-10-22",clientId:"wkn",city:"Ozark",venue:"Mulberry Mountain",country:"US",region:"festival",promoter:"Wakaan",advance:[{name:"Chloe",email:"chloe@wakaan.com",role:"AR Manager",dept:"ar_hospo"},{name:"Waylon",email:"waylon@wakaan.com",role:"Director",dept:"venue"}],doors:toM(12),curfew:toM(2),busArrive:toM(10),crewCall:toM(9),venueAccess:toM(9),mgTime:toM(18),notes:"Multi-day. Olivia managing transport."},
  {date:"2026-06-13",clientId:"bwc",city:"Chicago",venue:"Medialink Campus",country:"US",region:"festival",promoter:"Insomniac / Tectonic",advance:[{name:"Haley Evans",email:"haley@tectonicteam.com",role:"AR Manager",dept:"ar_hospo"},{name:"Jaron Drucker",email:"jaron@tectonicteam.com",role:"Transport",dept:"transport"}],doors:toM(14),curfew:toM(0),busArrive:toM(10),crewCall:toM(9),venueAccess:toM(9),mgTime:toM(15),notes:"Olivia primary. AR + transport dispatch."},
  {date:"2026-08-07",clientId:"elm",city:"Long Pond",venue:"Lake Harmony",country:"US",region:"festival",promoter:"Elements Music & Arts",advance:[{name:"Brett Herman",email:"brett@elementsfest.us",role:"Director",dept:"venue"}],doors:toM(12),curfew:toM(3),busArrive:toM(10),crewCall:toM(10),venueAccess:toM(10),mgTime:toM(17),notes:"⚠ 2025 settlement slow. Monitor closely."},
];

const DEFAULT_ROS=()=>[
  {id:"bus_arrive",label:"BUS ARRIVES",duration:0,phase:"bus_in",type:"bus",color:"var(--info-fg)",roles:["tm_td","transport_coord"],note:"32A 3-phase power",isAnchor:true,anchorKey:"busArrive"},
  {id:"venue_access",label:"Venue Access",duration:0,phase:"pre",type:"access",color:"var(--text-2)",roles:["tm_td","viewer"],note:"Per advance",isAnchor:true,anchorKey:"venueAccess"},
  {id:"crew_call",label:"CREW CALL",duration:0,phase:"pre",type:"crew",color:"var(--warn-fg)",roles:["tm_td","viewer"],note:"Local + tour crew",isAnchor:true,anchorKey:"crewCall"},
  {id:"loadin",label:"Load In",duration:240,phase:"pre",type:"setup",color:"var(--warn-fg)",roles:["tm_td","viewer"],note:"FOH, mons, LD, LED, lasers, merch"},
  {id:"sc_bbno",label:"SC: bbno$",duration:60,phase:"pre",type:"soundcheck",color:"var(--accent)",roles:["tm_td","viewer"],note:"Full band check"},
  {id:"sc_jb",label:"SC: Jungle Bobby",duration:30,phase:"pre",type:"soundcheck",color:"var(--accent-soft)",roles:["tm_td","viewer"],note:"Support act"},
  {id:"security",label:"Security Meeting",duration:30,phase:"pre",type:"meeting",color:"var(--danger-fg)",roles:["tm_td"],note:"Barricade, pit, artist security"},
  {id:"mg_checkin",label:"M&G Check In",duration:30,phase:"mg",type:"mg",color:"var(--success-fg)",roles:["tm_td"],note:"Always before M&G."},
  {id:"mg",label:"Meet & Greet",duration:120,phase:"mg",type:"mg",color:"var(--success-fg)",roles:["tm_td"],note:"Fan experience",isAnchor:true,anchorKey:"mgTime"},
  {id:"doors_early",label:"Doors: Early Entry",duration:30,phase:"doors",type:"doors",color:"var(--success-fg)",roles:["tm_td"],note:"VIP / early entry"},
  {id:"doors_ga",label:"Doors: GA",duration:0,phase:"doors",type:"doors",color:"var(--success-fg)",roles:["tm_td"],note:"General admission",isAnchor:true,anchorKey:"doors"},
  {id:"bishu",label:"Bishu DJ Set",duration:15,phase:"show",type:"performance",color:"var(--accent)",roles:["tm_td","viewer"],note:"Opening DJ"},
  {id:"jungle_bobby",label:"Jungle Bobby",duration:30,phase:"show",type:"performance",color:"var(--accent)",roles:["tm_td","viewer"],note:"Support set"},
  {id:"changeover",label:"Changeover",duration:15,phase:"show",type:"changeover",color:"var(--text-2)",roles:["tm_td","viewer"],note:"Stage flip"},
  {id:"bbno_set",label:"bbno$ HEADLINE SET",duration:105,phase:"show",type:"headline",color:"var(--danger-fg)",roles:["tm_td","viewer"],note:"Internet Explorer Tour"},
  {id:"curfew",label:"CURFEW",duration:0,phase:"curfew",type:"curfew",color:"var(--danger-fg)",roles:["tm_td"],note:"House lights",isAnchor:true,anchorKey:"curfew"},
  {id:"crew_cb",label:"Crew Call Back",duration:0,phase:"post",type:"crew",color:"var(--warn-fg)",roles:["tm_td","viewer"],note:"30min before set ends",offsetRef:"bbno_set_end",offsetMin:-30},
  {id:"loadout",label:"Load Out",duration:120,phase:"post",type:"setup",color:"var(--warn-fg)",roles:["tm_td","viewer"],note:"Gear to truck/trailer"},
  {id:"settlement",label:"Settlement",duration:60,phase:"post",type:"business",color:"var(--warn-fg)",roles:["tm_td"],note:"30min after headline ends",offsetRef:"bbno_set_end",offsetMin:30},
  {id:"showers",label:"Showers / Wind Down",duration:45,phase:"post",type:"crew",color:"var(--text-2)",roles:["tm_td","transport_coord"]},
  {id:"clear",label:"Clear Venue",duration:30,phase:"post",type:"bus",color:"var(--text-3)",roles:["tm_td","transport_coord"],note:"Final walk, bus loaded"},
  {id:"bus_depart",label:"BUS DEPARTS",duration:0,phase:"post",type:"bus",color:"var(--info-fg)",roles:["tm_td","transport_coord"],note:"Next city. Crew sleeps.",isAnchor:true,anchorKey:"busDepart"},
];

const RRX_ROS=()=>[
  {id:"bus_arrive",label:"BUS ARRIVES",duration:0,phase:"bus_in",type:"bus",color:"var(--info-fg)",roles:["tm_td","transport_coord"],note:"Red Rocks loading dock",isAnchor:true,anchorKey:"busArrive"},
  {id:"venue_access",label:"Venue Access",duration:0,phase:"pre",type:"access",color:"var(--text-2)",roles:["tm_td","viewer"],note:"Per AEG advance",isAnchor:true,anchorKey:"venueAccess"},
  {id:"crew_call",label:"CREW CALL",duration:0,phase:"pre",type:"crew",color:"var(--warn-fg)",roles:["tm_td","viewer"],note:"BNP + tour crew",isAnchor:true,anchorKey:"crewCall"},
  {id:"loadin",label:"Load In",duration:240,phase:"pre",type:"setup",color:"var(--warn-fg)",roles:["tm_td","viewer"],note:"BNP: audio, video, lighting"},
  {id:"programming",label:"Programming",duration:90,phase:"pre",type:"setup",color:"var(--info-fg)",roles:["tm_td","viewer"],note:"LX, VX, Laser. MA3, Depense R4."},
  {id:"sc_bbno",label:"SC: bbno$",duration:60,phase:"pre",type:"soundcheck",color:"var(--accent)",roles:["tm_td","viewer"]},
  {id:"sc_ot",label:"SC: Oliver Tree",duration:45,phase:"pre",type:"soundcheck",color:"var(--accent-soft)",roles:["tm_td","viewer"]},
  {id:"sc_kaarijaa",label:"SC: Käärijä",duration:30,phase:"pre",type:"soundcheck",color:"var(--accent-pill-border)",roles:["tm_td","viewer"]},
  {id:"sc_yngmartyr",label:"SC: YNG Martyr",duration:25,phase:"pre",type:"soundcheck",color:"var(--accent)",roles:["tm_td","viewer"]},
  {id:"sc_jb",label:"SC: Jungle Bobby",duration:20,phase:"pre",type:"soundcheck",color:"var(--accent-pill-border)",roles:["tm_td","viewer"]},
  {id:"security",label:"Security Meeting",duration:30,phase:"pre",type:"meeting",color:"var(--danger-fg)",roles:["tm_td"]},
  {id:"mg_checkin",label:"M&G Check In",duration:30,phase:"mg",type:"mg",color:"var(--success-fg)",roles:["tm_td"]},
  {id:"mg",label:"Meet & Greet",duration:120,phase:"mg",type:"mg",color:"var(--success-fg)",roles:["tm_td"],isAnchor:true,anchorKey:"mgTime"},
  {id:"doors_early",label:"Doors: Early Entry",duration:30,phase:"doors",type:"doors",color:"var(--success-fg)",roles:["tm_td"]},
  {id:"doors_ga",label:"Doors",duration:0,phase:"doors",type:"doors",color:"var(--success-fg)",roles:["tm_td"],isAnchor:true,anchorKey:"doors"},
  {id:"jungle_bobby_s",label:"Jungle Bobby",duration:30,phase:"show",type:"performance",color:"var(--accent)",roles:["tm_td","viewer"]},
  {id:"co1",label:"Changeover 1",duration:5,phase:"show",type:"changeover",color:"var(--text-2)",roles:["tm_td","viewer"]},
  {id:"yng_martyr",label:"YNG Martyr",duration:40,phase:"show",type:"performance",color:"var(--accent)",roles:["tm_td","viewer"]},
  {id:"co2",label:"Changeover 2",duration:5,phase:"show",type:"changeover",color:"var(--text-2)",roles:["tm_td","viewer"]},
  {id:"kaarijaa_set",label:"Käärijä",duration:50,phase:"show",type:"performance",color:"var(--accent-soft)",roles:["tm_td","viewer"]},
  {id:"co3",label:"Changeover 3",duration:5,phase:"show",type:"changeover",color:"var(--text-2)",roles:["tm_td","viewer"]},
  {id:"oliver_tree",label:"Oliver Tree",duration:50,phase:"show",type:"performance",color:"var(--accent-pill-border)",roles:["tm_td","viewer"]},
  {id:"co4",label:"Changeover 4",duration:10,phase:"show",type:"changeover",color:"var(--text-2)",roles:["tm_td","viewer"]},
  {id:"bbno_set",label:"bbno$ HEADLINE SET",duration:105,phase:"show",type:"headline",color:"var(--danger-fg)",roles:["tm_td","viewer"]},
  {id:"curfew",label:"CURFEW (HARD)",duration:0,phase:"curfew",type:"curfew",color:"var(--danger-fg)",roles:["tm_td"],isAnchor:true,anchorKey:"curfew"},
  {id:"crew_cb",label:"Crew Call Back",duration:0,phase:"post",type:"crew",color:"var(--warn-fg)",roles:["tm_td","viewer"],offsetRef:"bbno_set_end",offsetMin:-30},
  {id:"loadout",label:"Load Out",duration:120,phase:"post",type:"setup",color:"var(--warn-fg)",roles:["tm_td","viewer"]},
  {id:"settlement",label:"Settlement",duration:60,phase:"post",type:"business",color:"var(--warn-fg)",roles:["tm_td"],offsetRef:"bbno_set_end",offsetMin:30},
  {id:"showers",label:"Showers / Wind Down",duration:45,phase:"post",type:"crew",color:"var(--text-2)",roles:["tm_td","transport_coord"]},
  {id:"clear",label:"Clear Venue",duration:30,phase:"post",type:"bus",color:"var(--text-3)",roles:["tm_td","transport_coord"]},
  {id:"bus_depart",label:"BUS DEPARTS",duration:0,phase:"post",type:"bus",color:"var(--info-fg)",roles:["tm_td","transport_coord"],isAnchor:true,anchorKey:"busDepart"},
];
const CUSTOM_ROS_MAP={"2026-04-16":RRX_ROS};

const BUS_DATA=[
  {day:1,date:"May 02",dow:"Sat",route:"Aarschot → London",km:360,drive:"6h",dep:"08:00",arr:"15:00",show:false,flag:"",note:"Deadhead. Ferry Calais-Dover."},
  {day:2,date:"May 03",dow:"Sun",route:"London → Dublin",km:450,drive:"7h",dep:"08:00",arr:"16:45",show:false,flag:"",note:"Ferry Holyhead-Dublin."},
  {day:3,date:"May 04",dow:"Mon",route:"Dublin",km:0,drive:"—",dep:"—",arr:"—",show:true,venue:"National Stadium",flag:""},
  {day:4,date:"May 05",dow:"Tue",route:"Dublin",km:0,drive:"—",dep:"—",arr:"—",show:true,venue:"National Stadium",flag:""},
  {day:5,date:"May 06",dow:"Wed",route:"Dublin → Manchester",km:210,drive:"4h",dep:"02:00",arr:"07:30",show:false,flag:"",note:"Ferry IRE-UK."},
  {day:6,date:"May 07",dow:"Thu",route:"Manchester",km:0,drive:"—",dep:"—",arr:"—",show:true,venue:"O2 Victoria Warehouse",flag:""},
  {day:7,date:"May 08",dow:"Fri",route:"Manchester",km:0,drive:"—",dep:"—",arr:"—",show:true,venue:"O2 Victoria Warehouse",flag:""},
  {day:8,date:"May 09",dow:"Sat",route:"Manchester → Glasgow",km:350,drive:"6h",dep:"02:45",arr:"09:30",show:false,flag:""},
  {day:9,date:"May 10",dow:"Sun",route:"Glasgow",km:0,drive:"—",dep:"—",arr:"—",show:true,venue:"O2 Academy",flag:""},
  {day:10,date:"May 11",dow:"Mon",route:"Glasgow",km:0,drive:"—",dep:"—",arr:"—",show:true,venue:"O2 Academy",flag:""},
  {day:11,date:"May 12",dow:"Tue",route:"Glasgow → London",km:650,drive:"10h",dep:"01:30",arr:"13:00",show:false,flag:"⚠",note:"10h exemption 1/2 W3."},
  {day:12,date:"May 13",dow:"Wed",route:"London",km:0,drive:"—",dep:"—",arr:"—",show:true,venue:"O2 Brixton Academy",flag:""},
  {day:13,date:"May 14",dow:"Thu",route:"London → Strasbourg",km:620,drive:"8h",dep:"02:00",arr:"11:45",show:false,flag:"",note:"Ferry Dover-Calais."},
  {day:14,date:"May 15",dow:"Fri",route:"Strasbourg → Zurich",km:150,drive:"2h",dep:"07:30",arr:"09:30",show:true,venue:"Halle 622",flag:""},
  {day:15,date:"May 16",dow:"Sat",route:"Zurich → Cologne",km:380,drive:"4h",dep:"02:00",arr:"09:30",show:true,venue:"E-Werk",flag:"",note:"Bus 11:00. Local crew 08:00."},
  {day:16,date:"May 17",dow:"Sun",route:"Cologne",km:0,drive:"—",dep:"—",arr:"—",show:true,venue:"Palladium",flag:""},
  {day:17,date:"May 18",dow:"Mon",route:"Cologne → Amsterdam",km:230,drive:"3h",dep:"14:00",arr:"17:00",show:false,flag:"",note:"Day off transit."},
  {day:18,date:"May 19",dow:"Tue",route:"Amsterdam",km:0,drive:"—",dep:"—",arr:"—",show:true,venue:"AFAS Live",flag:""},
  {day:19,date:"May 20",dow:"Wed",route:"Amsterdam → Paris",km:510,drive:"8h",dep:"02:00",arr:"11:00",show:true,venue:"Le Bataclan",flag:"⚠",note:"Immigration outstanding."},
  {day:20,date:"May 21",dow:"Thu",route:"Paris → Chambery",km:560,drive:"6h",dep:"02:00",arr:"09:30",show:false,flag:"",note:"DD joins."},
  {day:21,date:"May 22",dow:"Fri",route:"Chambery → Milan",km:220,drive:"3h",dep:"06:30",arr:"09:30",show:true,venue:"Fabrique",flag:""},
  {day:22,date:"May 23",dow:"Sat",route:"Milan → Vienna",km:490,drive:"5h",dep:"02:00",arr:"08:30",show:false,flag:""},
  {day:23,date:"May 24",dow:"Sun",route:"Vienna → Prague",km:290,drive:"3h",dep:"06:00",arr:"09:30",show:true,venue:"SaSaZu",flag:""},
  {day:24,date:"May 25",dow:"Mon",route:"Prague → Berlin",km:350,drive:"4h",dep:"02:00",arr:"07:00",show:false,flag:""},
  {day:25,date:"May 26",dow:"Tue",route:"Berlin",km:0,drive:"—",dep:"—",arr:"—",show:true,venue:"Columbiahalle",flag:""},
  {day:26,date:"May 27",dow:"Wed",route:"Berlin → Bratislava",km:680,drive:"7h",dep:"02:00",arr:"14:45",show:false,flag:"",note:"Day off transit."},
  {day:27,date:"May 28",dow:"Thu",route:"Bratislava",km:0,drive:"—",dep:"—",arr:"—",show:true,venue:"Majestic Music Club",flag:""},
  {day:28,date:"May 29",dow:"Fri",route:"Bratislava → Warsaw",km:550,drive:"6h",dep:"02:00",arr:"09:30",show:false,flag:""},
  {day:29,date:"May 30",dow:"Sat",route:"Warsaw",km:0,drive:"—",dep:"—",arr:"—",show:true,venue:"Orange Festival",flag:""},
  {day:30,date:"May 31",dow:"Sun",route:"Warsaw → Aarschot",km:1400,drive:"14h",dep:"02:00",arr:"18:00",show:false,flag:"⚠",note:"Return. 2x 10h exemption."},
];

// BUS_DATA keyed by ISO date for fast lookup (Day 1 = 2026-05-02)
const BUS_DATA_MAP=BUS_DATA.reduce((m,d)=>{
  const base=new Date('2026-05-02T12:00:00');
  base.setDate(base.getDate()+d.day-1);
  m[base.toISOString().slice(0,10)]=d;
  return m;
},{});

// Split days: touring party divides across simultaneous events
const SPLIT_DAYS={
  "2026-05-01":{
    parties:[
      {id:"worcester",label:"Worcester Show",location:"Worcester, MA",event:"WPI — Pretty Polly",type:"show",color:"var(--success-fg)",bg:"var(--success-bg)",crew:["ag","jb","mse","tip","ac","rm"],note:"Performing crew. Advance past due."},
      {id:"eu_prog",label:"EU Programming",location:"En Route / Europe",event:"Pre-tour advance + logistics",type:"travel",color:"var(--link)",bg:"var(--info-bg)",crew:["dj","ms","dn"],note:"TM + PM advance work ahead of Dublin Day 1."}
    ]
  }
};

const resolvePartyCrew=(date,partyId,showCrew,allCrew)=>{
  const sc=showCrew[`${date}#${partyId}`]||{};
  const hasData=Object.values(sc).some(c=>c.attending!==undefined);
  if(!hasData)return null;
  return allCrew.filter(c=>sc[c.id]?.attending===true).map(c=>c.id);
};

const Ctx=createContext(null);

function useMobile(bp=640){
  const[m,setM]=useState(typeof window!=="undefined"&&window.innerWidth<=bp);
  useEffect(()=>{const h=()=>setM(window.innerWidth<=bp);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[bp]);
  return m;
}

const showIdFor=(s)=>`${s.venue}__${s.date}`.toLowerCase().replace(/\s+/g,"_");
const gmailUrl=(tid)=>`https://mail.google.com/mail/u/0/#all/${tid}`;
const STOP=new Set(["the","a","an","of","to","for","and","or","is","on","in","with","your","we","please","be","at","by","from","are","this","that"]);
const tokens=(s)=>(String(s||"").toLowerCase().match(/[a-z0-9]{3,}/g)||[]).filter(w=>!STOP.has(w));
// ── Intel deduplication ──────────────────────────────────────────────────────
// Runs after every scan/import. Normalizes and fuzzy-matches todos, followUps,
// and threads so repeated scans don't accumulate near-identical entries.
function textSimilar(a,b){
  const ta=tokens(a),tb=tokens(b);
  if(!ta.length||!tb.length)return false;
  const sa=new Set(ta),sb=new Set(tb);
  const na=String(a||"").toLowerCase().trim(),nb=String(b||"").toLowerCase().trim();
  if(na===nb)return true;
  if(na.includes(nb)||nb.includes(na))return true;
  const shared=[...sa].filter(w=>sb.has(w)).length;
  return shared/Math.min(sa.size,sb.size)>=0.75;
}
function deduplicateIntel(data){
  if(!data)return data;
  // Threads: dedup by tid, then by normalized subject+sender prefix
  const seenTid=new Set(),seenSubj=new Map();
  const threads=(data.threads||[]).filter(t=>{
    if(seenTid.has(t.tid))return false;
    seenTid.add(t.tid);
    if(t.manual)return true;
    const key=String(t.subject||"").toLowerCase().replace(/^(re|fwd?):\s*/i,"").trim()+"|"+String(t.from||"").toLowerCase().split(/[\s@]/)[0];
    if(seenSubj.has(key))return false;
    seenSubj.set(key,true);
    return true;
  });
  // Todos: keep highest-priority when action text is similar; manual todos always survive
  const todos=[];
  for(const t of(data.todos||[])){
    if(t.manual){todos.push(t);continue;}
    const dupe=todos.findIndex(x=>!x.manual&&textSimilar(x.text,t.text));
    if(dupe<0){todos.push(t);}
    else{
      const PRI={CRITICAL:0,HIGH:1,MED:2,MEDIUM:2,LOW:3};
      if((PRI[t.priority]??4)<(PRI[todos[dupe].priority]??4))todos[dupe]={...t,id:todos[dupe].id};
    }
  }
  // FollowUps: keep highest-priority when action text is similar; manual ones survive
  const followUps=[];
  for(const f of(data.followUps||[])){
    if(f.manual){followUps.push(f);continue;}
    const dupe=followUps.findIndex(x=>!x.manual&&textSimilar(x.action,f.action));
    if(dupe<0){followUps.push(f);}
    else{
      const PRI={CRITICAL:0,HIGH:1,MED:2,MEDIUM:2,LOW:3};
      if((PRI[f.priority]??4)<(PRI[followUps[dupe].priority]??4))followUps[dupe]=f;
    }
  }
  return{...data,threads,todos,followUps};
}

function matchScore(itemText,thread){
  const a=new Set(tokens(itemText));const b=new Set([...tokens(thread.subject),...tokens(thread.from)]);
  if(!a.size||!b.size)return 0;let hit=0;a.forEach(w=>{if(b.has(w))hit++;});
  return hit/Math.min(a.size,b.size);
}
const confOf=(s)=>s>=0.6?"high":s>=0.35?"medium":s>=0.18?"low":null;
// Suggest advance status from thread subject+snippet. Returns {status, reason} or null.
function suggestStatusFromThread(thread,currentStatus){
  const txt=((thread.subject||"")+" "+(thread.snippet||thread.bodySnippet||"")).toLowerCase();
  if(/\b(urgent|asap|overdue|time\s*sensitive|escalat)/.test(txt))return{status:"escalate",reason:"urgency keyword"};
  if(/\b(confirmed|approved|signed\s*off|all\s*set|locked\s*in|good\s*to\s*go)\b/.test(txt))return{status:"confirmed",reason:"confirmation keyword"};
  if(/\b(received|got\s*it|thanks\s*for\s*sending|in\s*hand)\b/.test(txt))return{status:"received",reason:"receipt keyword"};
  if(/\b(following\s*up|checking\s*in|bumping|any\s*update|just\s*a\s*reminder|awaiting)\b/.test(txt))return{status:"follow_up",reason:"follow-up keyword"};
  if(/\b(please\s*(respond|reply|confirm|sign|complete|fill)|needs?\s*response|your\s*input)\b/.test(txt))return{status:"respond",reason:"response requested"};
  if(currentStatus==="pending")return{status:"in_progress",reason:"thread matched"};
  return null;
}
const FIELD_KEYS=[
  {field:"doors",keys:["doors","door"],label:"Doors"},
  {field:"curfew",keys:["curfew"],label:"Curfew"},
  {field:"busArrive",keys:["bus arrival","bus arrive","bus"],label:"Bus Arrival"},
  {field:"crewCall",keys:["crew call","crewcall"],label:"Crew Call"},
  {field:"venueAccess",keys:["venue access","load in","load-in","loadin"],label:"Venue Access"},
  {field:"mgTime",keys:["meet & greet","m&g","meet and greet"," mg "],label:"M&G"},
];
function parseAllTimes(str){
  const s=String(str||"");
  const re=/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)?\b/g;
  let m;const raw=[];
  while((m=re.exec(s))){
    let h=parseInt(m[1],10);const min=parseInt(m[2]||"0",10);const ap=(m[3]||"").toLowerCase();
    if(ap==="pm"&&h<12)h+=12;if(ap==="am"&&h===12)h=0;
    if(h<0||h>23||min<0||min>59)continue;
    if(!ap&&!m[2]&&(h<5||h>23))continue;
    raw.push({minutes:h*60+min,index:m.index,end:m.index+m[0].length,token:m[0],rangeRole:null});
  }
  // Detect grouped ranges: TIME [-–—/to] TIME (gap ≤ 8 chars)
  for(let i=0;i<raw.length-1;i++){
    if(raw[i].rangeRole!==null)continue;
    const gap=s.slice(raw[i].end,raw[i+1].index);
    if(gap.length<=8&&(/^\s*[-–—\/]\s*$/.test(gap)||/^\s+to\s+$/i.test(gap))){
      raw[i].rangeRole="start";raw[i+1].rangeRole="end";
    }
  }
  return raw;
}
function parseTimeStr(s){const t=parseAllTimes(s);return t.length?t[0].minutes:null;}
function fmtMin(m){if(m==null||m===0)return"—";const h=Math.floor(m/60),mm=m%60;const ap=h>=12?"PM":"AM";const h12=((h+11)%12)+1;return `${h12}:${String(mm).padStart(2,"0")} ${ap}`;}
const fmtAudit=(iso)=>{if(!iso)return"";const d=new Date(iso);const M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];const h=d.getHours();const ap=h>=12?"pm":"am";const h12=((h+11)%12)+1;return `${M[d.getMonth()]} ${d.getDate()}, ${h12}:${String(d.getMinutes()).padStart(2,"0")}${ap}`;};
const sGP=async k=>{try{const r=await window.storage.getPrivate(k);return r?JSON.parse(r.value):null}catch(e){console.error("[storage.getPrivate]",k,e?.message||e);return null}};
const sSP=async(k,v)=>{try{await window.storage.setPrivate(k,JSON.stringify(v));return true}catch(e){console.error("[storage.setPrivate]",k,e?.message||e);return false}};

function ContextBar(){
  const{sel,shows,advances,finance,setTab}=useContext(Ctx);
  const show=shows?.[sel];
  if(!show)return null;
  const adv=advances[sel]||{};const items=adv.items||{};const custom=adv.customItems||[];
  const pc=[...AT,...custom].filter(t=>(items[t.id]?.status||"pending")==="pending").length;
  const fStages=finance[sel]?.stages||{};
  const settled=["wire_ref_confirmed","signed_sheet","payment_initiated"].every(k=>fStages[k]);
  const days=dU(sel);
  const dayC=days<=7?"var(--danger-fg)":days<=14?"var(--warn-fg)":days<=21?"var(--link)":"var(--text-mute)";
  return(
    <div style={{height:28,background:"var(--card)",borderBottom:"1px solid var(--card-2)",display:"flex",alignItems:"center",padding:"0 20px",gap:12,fontSize:9,fontFamily:MN,flexShrink:0}}>
      <span onClick={()=>setTab("ros")} style={{cursor:"pointer",fontWeight:700,color:"var(--text)",whiteSpace:"nowrap"}}>{fD(sel).toUpperCase()} · {show.city||""} · {show.venue||""}</span>
      <span style={{padding:"1px 6px",borderRadius:4,background:dayC+"22",color:dayC,fontWeight:800,fontFamily:MN,whiteSpace:"nowrap"}}>{days>0?`${days}d`:"TODAY"}</span>
      <span onClick={()=>setTab("advance")} style={{cursor:"pointer",color:pc>0?"var(--warn-fg)":"var(--text-mute)",fontWeight:pc>0?700:400,whiteSpace:"nowrap"}}>{pc} open</span>
      <span style={{display:"flex",alignItems:"center",gap:5,color:"var(--text-mute)",whiteSpace:"nowrap"}}>
        <span style={{width:7,height:7,borderRadius:99,background:settled?"var(--success-fg)":"var(--text-mute)",display:"inline-block",flexShrink:0}}/>
        {settled?"SETTLED":"OUTSTANDING"}
      </span>
    </div>
  );
}

export default function App(){
  const auth=useAuth();
  const me=useMemo(()=>resolveMe(auth?.user?.email),[auth?.user?.email]);
  useEffect(()=>{setAuditIdentity({role:me.role,userKey:me.id});},[me.role,me.id]);
  const[tab,setTab]=useState("advance");
  const[role,setRole]=useState("tm");
  const[aC,setAC]=useState("bbn");
  const[shows,setShows]=useState(null);
  const[ros,setRos]=useState({});
  const[advances,setAdvances]=useState({});
  const[finance,setFinance]=useState({});
  const[sel,setSel]=useState(ALL_SHOWS[0].date);
  const[cmd,setCmd]=useState(false);
  const[loaded,setLoaded]=useState(false);
  const[ss,setSs]=useState("");
  const[notesPriv,setNotesPriv]=useState({});
  const[checkPriv,setCheckPriv]=useState({});
  const[intel,setIntel]=useState({});
  const[labelIntel,setLabelIntel]=useState(null);
  const[refreshing,setRefreshing]=useState(null);
  const[crew,setCrew]=useState(DEFAULT_CREW);
  const[showCrew,setShowCrew]=useState({});
  const[production,setProduction]=useState({});
  const[tabOrder,setTabOrder]=useState(null);
  const[flights,setFlights]=useState({});
  const[lodging,setLodging]=useState({});
  const[guestlists,setGuestlists]=useState({});
  const[glTemplates,setGlTemplates]=useState({});
  const[immigration,setImmigration]=useState({});
  const[refreshMsg,setRefreshMsg]=useState("");
  const[selEventId,setSelEventId]=useState(null);
  // Reset sub-event selection whenever the selected day changes
  const prevSel=useRef(sel);
  useEffect(()=>{if(prevSel.current!==sel){setSelEventId(null);prevSel.current=sel;}},[sel]);
  const[exp,setExp]=useState(false);
  const[uploadOpen,setUploadOpen]=useState(false);
  const[undoToast,setUndoToast]=useState(null);
  const[dateMenu,setDateMenu]=useState(false);
  const[showOffDays,setShowOffDays]=useState(true);
  const[sidebarOpen,setSidebarOpen]=useState(true);
  const[transView,setTransView]=useState("flights");
  // Per-date active split-party id. Absent entries fall back to the first party.
  const[splitParty,setSplitPartyState]=useState({});
  const setSplitParty=useCallback((date,partyId)=>setSplitPartyState(p=>({...p,[date]:partyId})),[]);
  const effectiveSplitDays=useMemo(()=>{
    const out={};
    Object.entries(SPLIT_DAYS).forEach(([date,split])=>{
      out[date]={...split,parties:split.parties.map(p=>{const resolved=resolvePartyCrew(date,p.id,showCrew,crew);return resolved?{...p,crew:resolved}:p;})};
    });
    return out;
  },[showCrew,crew]);
  const currentSplit=effectiveSplitDays[sel]||null;
  const activeSplitPartyId=currentSplit?(splitParty[sel]||currentSplit.parties[0].id):null;
  const activeSplitParty=currentSplit?currentSplit.parties.find(p=>p.id===activeSplitPartyId):null;
  const[tourStart,setTourStart]=useState("2026-04-01");
  const[tourEnd,setTourEnd]=useState("2026-06-30");
  const[lastFlightScanAt,setLastFlightScanAt]=useState(null);
  const[perms,setPerms]=useState(DEFAULT_PERMS);
  const uPerms=useCallback((permId,roleId,val)=>setPerms(p=>({...p,[permId]:{...p[permId],[roleId]:val}})),[]);
  const[actLog,setActLog]=useState([]);
  const addActLog=useCallback((event)=>setActLog(p=>{const next=[...p,{...event,ts:new Date().toISOString(),session:SESSION_ID}];return next.length>2000?next.slice(-2000):next;}),[]);
  const mobile=useMobile();
  const st=useRef(null);const stp=useRef(null);

  useEffect(()=>{(async()=>{
    const[s,r,a,f,se,cr,pr,fl,lo,gl,glt,im,pe]=await Promise.all([sG(SK.SHOWS),sG(SK.ROS),sG(SK.ADVANCES),sG(SK.FINANCE),sG(SK.SETTINGS),sG(SK.CREW),sG(SK.PRODUCTION),sG(SK.FLIGHTS),sG(SK.LODGING),sG(SK.GUESTLISTS),sG(SK.GL_TEMPLATES),sG(SK.IMMIGRATION),sG(SK.PERMISSIONS)]);
    const init=ALL_SHOWS.reduce((acc,sh)=>{acc[sh.date]={...sh,doorsConfirmed:false,curfewConfirmed:false,busArriveConfirmed:false,crewCallConfirmed:false,venueAccessConfirmed:false,mgTimeConfirmed:false,etaSource:"schedule",lastModified:Date.now()};return acc;},{});
    const merged={...init};if(s)Object.keys(s).forEach(k=>{merged[k]=merged[k]?{...merged[k],...s[k]}:{...s[k]};});
    setShows(merged);setRos(r||{});setAdvances(a||{});setFinance(f||{});
    if(se?.role)setRole(se.role);if(se?.tab&&se.tab!=="dashboard")setTab(se.tab);if(se?.sel)setSel(se.sel);if(se?.aC)setAC(se.aC);
    if(Array.isArray(se?.tabOrder))setTabOrder(se.tabOrder);
    if(se?.showOffDays!==undefined)setShowOffDays(se.showOffDays);
    if(se?.sidebarOpen!==undefined)setSidebarOpen(se.sidebarOpen);
    if(se?.tourStart)setTourStart(se.tourStart);if(se?.tourEnd)setTourEnd(se.tourEnd);
    if(se?.lastFlightScanAt)setLastFlightScanAt(se.lastFlightScanAt);
    if(cr?.crew)setCrew(cr.crew);if(cr?.showCrew)setShowCrew(cr.showCrew);
    setProduction(pr||{});setFlights(fl||{});setLodging(lo||{});setGuestlists(gl||{});setGlTemplates(glt||{});setImmigration(im||{});if(pe)setPerms(p=>({...DEFAULT_PERMS,...pe,...Object.fromEntries(Object.entries(DEFAULT_PERMS).map(([k,v])=>([k,{...v,...(pe[k]||{})}])))}));
    const[np,cp,it,al]=await Promise.all([sGP(PK.NOTES_PRIV),sGP(PK.CHECKLIST_PRIV),sGP(PK.INTEL),sGP(PK.ACTLOG)]);
    setNotesPriv(np||{});setCheckPriv(cp||{});setIntel(it||{});if(Array.isArray(al))setActLog(al);
    setLoaded(true);
  })()},[]);

  useEffect(()=>{if(!loaded)return;if(stp.current)clearTimeout(stp.current);stp.current=setTimeout(()=>{sSP(PK.NOTES_PRIV,notesPriv);sSP(PK.CHECKLIST_PRIV,checkPriv);sSP(PK.INTEL,intel);sSP(PK.ACTLOG,actLog);},600);},[notesPriv,checkPriv,intel,actLog,loaded]);
  const uNotesPriv=useCallback((d,arr)=>setNotesPriv(p=>({...p,[d]:arr})),[]);
  const uCheckPriv=useCallback((d,arr)=>setCheckPriv(p=>({...p,[d]:arr})),[]);

  useEffect(()=>{if(!undoToast)return;const t=setTimeout(()=>setUndoToast(null),30000);return()=>clearTimeout(t);},[undoToast]);
  const pushUndo=useCallback((label,undo)=>setUndoToast({label,undo,ts:Date.now()}),[]);

  useEffect(()=>{
    const tabMap={a:"advance",f:"finance",s:"ros",t:"transport",c:"crew",g:"guestlist",d:"dash"};
    const handler=e=>{
      const tgt=e.target.tagName;
      if(tgt==="INPUT"||tgt==="TEXTAREA"||e.metaKey||e.ctrlKey||e.altKey)return;
      if(tabMap[e.key]){setTab(tabMap[e.key]);return;}
      if(e.key==="ArrowLeft"||e.key==="ArrowRight"){
        setSel(prev=>{
          const list=Object.values(shows||{}).sort((a,b)=>a.date.localeCompare(b.date));
          const idx=list.findIndex(s=>s.date===prev);
          if(idx<0)return prev;
          const ni=idx+(e.key==="ArrowRight"?1:-1);
          return(ni>=0&&ni<list.length)?list[ni].date:prev;
        });
      }
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[shows,setTab,setSel]);

  useEffect(()=>{
    if(!loaded)return;
    const confirmed=Object.values(flights||{}).filter(f=>f&&f.status==="confirmed"&&f.suggestedShowDate&&f.suggestedRole&&Array.isArray(f.suggestedCrewIds)&&f.suggestedCrewIds.length>0);
    if(!confirmed.length)return;
    setShowCrew(p=>{
      let next=p;
      for(const f of confirmed){
        const dir=f.suggestedRole;
        const baseDate=f.suggestedShowDate;
        const dateKey=f.partyId&&SPLIT_DAYS[baseDate]?`${baseDate}#${f.partyId}`:baseDate;
        const leg={id:`leg_${f.id}`,flight:f.flightNo||"",carrier:f.carrier||"",from:f.from,fromCity:f.fromCity||f.from,to:f.to,toCity:f.toCity||f.to,depart:f.dep,arrive:f.arr,conf:f.confirmNo||f.bookingRef||"",status:"confirmed",flightId:f.id,autoPopulated:true};
        const confKey=dir==="inbound"?"inboundConfirmed":"outboundConfirmed";
        const dateField=dir==="inbound"?"inboundDate":"outboundDate";
        const timeField=dir==="inbound"?"inboundTime":"outboundTime";
        const timeVal=dir==="inbound"?f.arr:f.dep;
        const dateVal=dir==="inbound"?(f.arrDate||baseDate):f.depDate;
        for(const crewId of f.suggestedCrewIds){
          const cur=(next[dateKey]||{})[crewId]||{};
          if(cur.attending===false)continue;
          const existing=(cur[dir]||[]);
          if(existing.some(l=>l.flightId===f.id))continue;
          const modeKey=dir==="inbound"?"inboundMode":"outboundMode";
          next={...next,[dateKey]:{...next[dateKey],[crewId]:{...cur,attending:true,[modeKey]:cur[modeKey]||"fly",[dir]:[...existing,leg],[confKey]:true,[dateField]:dateVal,[timeField]:timeVal||""}}};
        }
      }
      return next;
    });
  },[flights,loaded]);

  const refreshIntel=useCallback(async(show,force=false)=>{
    if(refreshing)return;
    const sid=showIdFor(show);
    const t0=Date.now();
    addActLog({module:"intel",action:"intel.scan.start",target:{type:"show",id:sid,label:show.venue},payload:{trigger:force?"manual":"background"},context:{date:show.date,showId:sid,eventKey:sid}});
    setRefreshing(sid);setRefreshMsg(`Scanning Gmail for ${show.venue}…`);
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){setRefreshMsg("No active session");return;}
      const googleToken=session.provider_token;
      if(!googleToken){setRefreshMsg("Gmail token missing — sign out and back in");return;}
      const ac1=new AbortController();const t1=setTimeout(()=>ac1.abort(),110000);
      let resp;try{resp=await fetch("/api/intel",{method:"POST",signal:ac1.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({show,googleToken,forceRefresh:force,userEmail:session.user?.email})});}finally{clearTimeout(t1);}
      if(!resp.ok){const err=await resp.json().catch(()=>({}));const msg=err.error==="gmail_token_expired"?"gmail_token_expired":`http_${resp.status}`;addActLog({module:"intel",action:"intel.scan.error",target:{type:"show",id:sid,label:show.venue},payload:{status:resp.status,message:msg},context:{date:show.date,showId:sid,eventKey:sid}});setRefreshMsg(err.error==="gmail_token_expired"?"Gmail token expired — re-sign in":`Error: ${resp.status}`);return;}
      const data=await resp.json();const ni=data.intel;
      if(!ni||!ni.threads){
        const hint=data.debug?.stopReason==="max_tokens"?" (response truncated — too many threads)":data.debug?.rawText?` — raw: ${data.debug.rawText.slice(0,120)}`:"";
        addActLog({module:"intel",action:"intel.scan.error",target:{type:"show",id:sid,label:show.venue},payload:{status:0,message:"no_structured_intel"},context:{date:show.date,showId:sid,eventKey:sid}});
        setRefreshMsg(`No structured intel returned${hint}`);
        console.error("[intel] debug:",data.debug);
        return;
      }
      setIntel(p=>{
        const existing=p[sid]||{};
        const seenT=new Set();
        const threads=[...(ni.threads||[]),...(existing.threads||[])].filter(t=>{if(seenT.has(t.tid))return false;seenT.add(t.tid);return true;});
        const seenE=new Set();
        const contacts=[...(ni.showContacts||[]),...(existing.showContacts||[])].filter(c=>{const k=(c.email||c.name||"").toLowerCase();if(seenE.has(k))return false;seenE.add(k);return true;});
        const newTodos=(ni.followUps||[]).map(f=>({id:`t${Date.now()}_${Math.random().toString(36).slice(2,7)}`,text:f.action,owner:f.owner,priority:f.priority,deadline:f.deadline,threadTid:f.tid||null,done:false,ts:Date.now()}));
        const newTidByText=new Map(newTodos.filter(t=>t.threadTid).map(t=>[t.text,t.threadTid]));
        const merged=(existing.todos||[]).map(t=>(!t.threadTid&&newTidByText.has(t.text))?{...t,threadTid:newTidByText.get(t.text)}:t);
        const mergedTexts=new Set(merged.map(t=>t.text));
        const todos=[...merged,...newTodos.filter(t=>!mergedTexts.has(t.text))];
        const prevFuTexts=new Set((existing.followUps||[]).map(f=>f.action));
        const newFuTexts=new Set((ni.followUps||[]).map(f=>f.action));
        const ts=new Date().toISOString();
        const scanEntries=[
          ...(ni.followUps||[]).filter(f=>!prevFuTexts.has(f.action)).map(f=>({ts,type:"scan",section:"followup",showId:sid,action:"added",label:f.action,from:"scan"})),
          ...(existing.followUps||[]).filter(f=>!newFuTexts.has(f.action)).map(f=>({ts,type:"scan",section:"followup",showId:sid,action:"removed",label:f.action,from:"scan"})),
        ];
        const changelog=[...(p.__changelog||[]).slice(-Math.max(1,499-scanEntries.length)),...scanEntries];
        const merged2=deduplicateIntel({threads,followUps:ni.followUps||[],showContacts:contacts,schedule:ni.schedule||existing.schedule||[],todos,matches:existing.matches||[],dismissedFlags:existing.dismissedFlags||[],arStatus:existing.arStatus||{},lastRefreshed:new Date().toISOString(),isShared:data.isShared||false,sharedByOthers:data.sharedByOthers||[],_partial:!!ni._partial});
        return{...p,__changelog:changelog,[sid]:merged2};
      });
      addActLog({module:"intel",action:"intel.scan.complete",target:{type:"show",id:sid,label:show.venue},payload:{threads:(ni.threads||[]).length,todos:(ni.followUps||[]).length,followUps:(ni.followUps||[]).length,actionRequired:0,durationMs:Date.now()-t0},context:{date:show.date,showId:sid,eventKey:sid}});
      setRefreshMsg(`${show.venue}: ${data.gmailThreadsFound||0} threads`);
      setTimeout(()=>setRefreshMsg(""),3500);
    }catch(e){addActLog({module:"intel",action:"intel.scan.error",target:{type:"show",id:sid,label:show.venue},payload:{status:0,message:e.message},context:{date:show.date,showId:sid,eventKey:sid}});setRefreshMsg(`Refresh failed: ${e.message}`);}
    finally{setRefreshing(null);}
  },[refreshing,addActLog]);

  const toggleIntelShare=useCallback(async(show,share)=>{
    const sid=showIdFor(show);
    const{data:{session}}=await supabase.auth.getSession();
    if(!session)return;
    const ac2=new AbortController();const t2=setTimeout(()=>ac2.abort(),30000);
    try{await fetch("/api/intel",{method:"POST",signal:ac2.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:"toggleShare",show,isShared:share})});}finally{clearTimeout(t2);}
    setIntel(p=>({...p,[sid]:{...(p[sid]||{}),isShared:share}}));
  },[]);

  const refreshLabelIntel=useCallback(async(force=false)=>{
    const t0l=Date.now();
    addActLog({module:"intel",action:"intel.scan.start",target:{type:"label",id:"bulk",label:"label scan"},payload:{trigger:force?"manual":"background"},context:{date:null,showId:null,eventKey:null}});
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session?.provider_token)return;
      const showsArr=Object.values(shows||{}).filter(s=>s.clientId===aC);
      const authHeaders={"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`};
      const ac3=new AbortController();const t3=setTimeout(()=>ac3.abort(),110000);
      let resp;try{resp=await fetch("/api/intel",{method:"POST",signal:ac3.signal,headers:authHeaders,body:JSON.stringify({action:"bulkFetch",shows:showsArr,googleToken:session.provider_token,forceRefresh:force,userEmail:session.user?.email})});}finally{clearTimeout(t3);}
      if(!resp.ok)return;
      const data=await resp.json();
      setLabelIntel(prev=>{
        const prevAr=prev?.actionRequired||[];
        const prevIds=new Set(prevAr.map(i=>i.id));
        const newAr=data.actionRequired||[];
        const newIds=new Set(newAr.map(i=>i.id));
        const ts=new Date().toISOString();
        const scanEntries=[
          ...newAr.filter(i=>!prevIds.has(i.id)).map(i=>({ts,type:"scan",section:"ar",showId:i.showId||null,action:"added",label:i.subject,from:"scan"})),
          ...prevAr.filter(i=>!newIds.has(i.id)).map(i=>({ts,type:"scan",section:"ar",showId:i.showId||null,action:"removed",label:i.subject,from:"scan"})),
        ];
        if(scanEntries.length){
          setIntel(p=>({...p,__changelog:[...(p.__changelog||[]).slice(-Math.max(1,499-scanEntries.length)),...scanEntries]}));
        }
        return data;
      });
      if(data.byShow){
        setIntel(prev=>{
          const next={...prev};
          for(const[sid,tids]of Object.entries(data.byShow)){
            const existing=next[sid]||{};
            const seenTids=new Set((existing.threads||[]).map(t=>t.tid||t.id));
            const allItems=[...(data.settlements||[]),...(data.crewFlights||[]),...(data.advanceItems||[]),...(data.actionRequired||[])];
            const newStubs=tids.filter(tid=>!seenTids.has(tid)).map(tid=>{
              const found=allItems.find(t=>t.id===tid);
              return found?{tid:found.id,subject:found.subject,from:found.from,date:found.date,snippet:found.snippet,fromLabelScan:true,intent:"MISC"}:{tid,fromLabelScan:true,subject:"",from:"",intent:"MISC"};
            });
            if(newStubs.length)next[sid]=deduplicateIntel({...existing,threads:[...(existing.threads||[]),...newStubs]});
          }
          return next;
        });
      }
      addActLog({module:"intel",action:"intel.scan.complete",target:{type:"label",id:"bulk",label:"label scan"},payload:{actionRequired:(data.actionRequired||[]).length,durationMs:Date.now()-t0l},context:{date:null,showId:null,eventKey:null}});
    }catch(e){addActLog({module:"intel",action:"intel.scan.error",target:{type:"label",id:"bulk",label:"label scan"},payload:{status:0,message:e.message},context:{date:null,showId:null,eventKey:null}});console.error("[labelScan]",e.message);}
  },[shows,aC,addActLog]);

  const addLog=useCallback((entry)=>{
    setIntel(p=>({...p,__changelog:[...(p.__changelog||[]).slice(-499),{ts:new Date().toISOString(),...entry}]}));
  },[setIntel]);

  const save=useCallback(()=>{
    if(!loaded)return;if(st.current)clearTimeout(st.current);
    st.current=setTimeout(async()=>{setSs("saving");await Promise.all([sS(SK.SHOWS,shows),sS(SK.ROS,ros),sS(SK.ADVANCES,advances),sS(SK.FINANCE,finance),sS(SK.SETTINGS,{role,tab,sel,aC,tabOrder,showOffDays,sidebarOpen,tourStart,tourEnd,lastFlightScanAt}),sS(SK.CREW,{crew,showCrew}),sS(SK.PRODUCTION,production),sS(SK.FLIGHTS,flights),sS(SK.LODGING,lodging),sS(SK.GUESTLISTS,guestlists),sS(SK.GL_TEMPLATES,glTemplates),sS(SK.IMMIGRATION,immigration),sS(SK.PERMISSIONS,perms)]);setSs("saved");setTimeout(()=>setSs(""),1500);},600);
  },[loaded,shows,ros,advances,finance,role,tab,sel,aC,tabOrder,crew,showCrew,production,flights,lodging,guestlists,glTemplates,immigration,showOffDays,sidebarOpen,tourStart,tourEnd,lastFlightScanAt,perms]);
  useEffect(()=>{save();},[shows,ros,advances,finance,role,tab,sel,aC,crew,showCrew,production,tabOrder,flights,lodging,guestlists,glTemplates,immigration,showOffDays,sidebarOpen,tourStart,tourEnd,perms]);
  useEffect(()=>{const h=e=>{if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setCmd(v=>!v);}if(e.key==="Escape")setCmd(false);};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[]);
  const labelScanFired=useRef(false);
  useEffect(()=>{if(loaded&&!labelScanFired.current){labelScanFired.current=true;refreshLabelIntel();}},[loaded]);// eslint-disable-line

  const flightScanFired=useRef(false);
  useEffect(()=>{
    if(!loaded||flightScanFired.current)return;
    flightScanFired.current=true;
    (async()=>{
      try{
        // Skip scan if last scan was within 55 minutes (watermark guard)
        if(lastFlightScanAt){
          const age=(Date.now()-new Date(lastFlightScanAt).getTime())/60000;
          if(age<55){console.log(`[bg-flights] skipping — last scan ${age.toFixed(1)}m ago`);return;}
        }
        const{data:{session}}=await supabase.auth.getSession();
        if(!session?.provider_token)return;
        const showsArr=Object.values(shows||{}).map(s=>({id:s.id||s.date,date:s.date,venue:s.venue,city:s.city,type:s.type}));
        // Watermark: scan only since last scan (minus 2h overlap) to skip old emails
        const sweepFrom=lastFlightScanAt
          ?Math.floor((new Date(lastFlightScanAt).getTime()-2*60*60*1000)/1000)
          :undefined;
        const resp=await fetch("/api/flights",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken:session.provider_token,tourStart,tourEnd,focus:FOCUS_CARRIERS,shows:showsArr,...(sweepFrom?{sweepFrom}:{})})});
        if(!resp.ok)return;
        const data=await resp.json();
        // Record watermark regardless of whether new flights arrived
        if(data.scannedAt)setLastFlightScanAt(data.scannedAt);
        if(!data.flights?.length)return;
        setFlights(cur=>{
          const next={...cur};
          let added=0,enriched=0;
          data.flights.forEach(f=>{
            const match=findFlightMatch(next,f);
            if(match){
              const merged=enrichFlight(match,f);
              if(JSON.stringify(merged)!==JSON.stringify(match)){next[match.id]=merged;enriched++;}
            }else{
              next[f.id]={...f,status:"pending",suggestedCrewIds:matchPaxToCrew(f.pax,crew)};
              added++;
            }
          });
          return(added||enriched)?next:cur;
        });
      }catch(e){console.warn("[bg-flights]",e.message);}
    })();
  },[loaded]);// eslint-disable-line

  const uImmigration=useCallback((id,data)=>setImmigration(p=>{if(data===null){const n={...p};delete n[id];return n;}return{...p,[id]:{...(p[id]||{}),...data}};}),[]);
  const uShow=useCallback((d,u)=>setShows(p=>({...p,[d]:{...p[d],...u,lastModified:Date.now()}})),[]);
  const uRos=useCallback((d,b)=>setRos(p=>{const n={...p};if(b)n[d]=b;else delete n[d];return n;}),[]);
  const uAdv=useCallback((d,u)=>setAdvances(p=>({...p,[d]:{...(p[d]||{}),...u}})),[]);
  const uFin=useCallback((d,u)=>setFinance(p=>({...p,[d]:{...(p[d]||{}),...(typeof u==="function"?u(p[d]||{}):u)}})),[]);
  const uProd=useCallback((d,u)=>setProduction(p=>({...p,[d]:{...(p[d]||{}),...u}})),[]);
  const uFlight=useCallback((id,seg)=>setFlights(p=>{if(!seg){const n={...p};delete n[id];return n;}return{...p,[id]:seg};}),[]);
  const uLodging=useCallback((id,data)=>setLodging(p=>{if(!data){const n={...p};delete n[id];return n;}return{...p,[id]:data};}),[]);
  const uGuestlist=useCallback((date,updater)=>setGuestlists(p=>{
    const cur=p[date]||GL_DEFAULT_SHOW();
    const next=typeof updater==="function"?updater(cur):{...cur,...updater};
    if(next===null){const n={...p};delete n[date];return n;}
    return{...p,[date]:next};
  }),[]);
  const gRos=useCallback(d=>{if(ros[d])return ros[d];if(CUSTOM_ROS_MAP[d])return CUSTOM_ROS_MAP[d]();const sh=shows?.[d];if(sh?.type==="off"||sh?.type==="travel")return [];return DEFAULT_ROS();},[ros,shows]);
  const sorted=useMemo(()=>shows?Object.values(shows).sort((a,b)=>a.date.localeCompare(b.date)):[], [shows]);
  const next=useMemo(()=>{const t=new Date().toISOString().slice(0,10);return sorted.find(s=>s.date>=t)||sorted[0];},[sorted]);
  const cShows=useMemo(()=>sorted.filter(s=>s.clientId===aC),[sorted,aC]);

  // Tour days: real shows + synthesized travel/off/split days for Apr 16–May 31 window.
  // Keyed by ISO date. Real shows win; synthetic fill for bus moves + off days.
  const tourDays=useMemo(()=>{
    const m={};
    (sorted||[]).forEach(s=>{
      m[s.date]={date:s.date,type:s.type||"show",show:s,bus:BUS_DATA_MAP[s.date]||null,split:effectiveSplitDays[s.date]||null,synthetic:false,city:s.city,venue:s.venue,clientId:s.clientId};
    });
    if(!sorted.length)return m;
    const start=new Date(sorted[0].date+'T12:00:00');
    const end=new Date(sorted[sorted.length-1].date+'T12:00:00');
    for(let d=new Date(start.getTime());d<=end;d.setDate(d.getDate()+1)){
      const iso=d.toISOString().slice(0,10);
      const bus=BUS_DATA_MAP[iso]||null;
      const split=effectiveSplitDays[iso]||null;
      if(m[iso]){
        // enrich existing real show with bus/split context
        m[iso]={...m[iso],bus:m[iso].bus||bus,split:m[iso].split||split};
        continue;
      }
      if(split){m[iso]={date:iso,type:"split",split,bus,synthetic:true,city:split.parties.map(p=>p.location).join(" / "),venue:"Split Day",clientId:"bbn"};}
      else if(bus&&!bus.show){m[iso]={date:iso,type:"travel",bus,synthetic:true,city:bus.route,venue:"Travel Day",clientId:"bbn"};}
      else if(bus&&bus.show){m[iso]={date:iso,type:"show",bus,synthetic:true,city:bus.route,venue:bus.venue||"Show",clientId:"bbn"};}
      else{m[iso]={date:iso,type:"off",synthetic:true,city:"—",venue:"Off Day",clientId:"bbn"};}
    }
    return m;
  },[sorted,effectiveSplitDays]);
  const tourDaysSorted=useMemo(()=>Object.values(tourDays).sort((a,b)=>a.date.localeCompare(b.date)),[tourDays]);

  // Ordered tabs: apply saved tabOrder, append any tabs not in saved order (handles new tabs added in code)
  const orderedTabs=useMemo(()=>{
    if(!Array.isArray(tabOrder)||!tabOrder.length)return TABS;
    const byId=TABS.reduce((a,t)=>{a[t.id]=t;return a;},{});
    const seen=new Set();
    const out=[];
    for(const id of tabOrder){if(byId[id]&&!seen.has(id)){out.push(byId[id]);seen.add(id);}}
    for(const t of TABS){if(!seen.has(t.id))out.push(t);}
    return out;
  },[tabOrder]);
  const reorderTabs=useCallback((fromId,toId)=>{
    if(fromId===toId)return;
    const ids=orderedTabs.map(t=>t.id);
    const fi=ids.indexOf(fromId),ti=ids.indexOf(toId);
    if(fi<0||ti<0)return;
    const next=[...ids];const[moved]=next.splice(fi,1);next.splice(ti,0,moved);
    setTabOrder(next);
  },[orderedTabs]);

  // eventKey: sub-events keyed by their own ID (spans dates/festivals);
  // split-day parties keyed by `${date}#${partyId}`; otherwise by date.
  const eventKey=useMemo(()=>{
    if(selEventId)return selEventId;
    if(currentSplit&&activeSplitPartyId)return `${sel}#${activeSplitPartyId}`;
    return sel;
  },[selEventId,sel,currentSplit,activeSplitPartyId]);
  const ctxValue=useMemo(()=>({shows,uShow,ros,uRos,gRos,advances,uAdv,finance,uFin,sel,setSel,eventKey,role,setRole,tab,setTab,sorted,cShows,next,setCmd,aC,setAC,notesPriv,uNotesPriv,checkPriv,uCheckPriv,mobile,setExp,intel,setIntel,addLog,refreshIntel,toggleIntelShare,refreshing,refreshMsg,labelIntel,refreshLabelIntel,pushUndo,undoToast,setUndoToast,crew,setCrew,showCrew,setShowCrew,dateMenu,setDateMenu,production,uProd,tourDays,tourDaysSorted,orderedTabs,reorderTabs,selEventId,setSelEventId,flights,uFlight,setFlights,uploadOpen,setUploadOpen,lodging,uLodging,guestlists,uGuestlist,glTemplates,setGlTemplates,showOffDays,setShowOffDays,sidebarOpen,setSidebarOpen,tourStart,tourEnd,setTourStart,setTourEnd,splitParty,setSplitParty,currentSplit,activeSplitPartyId,activeSplitParty,effectiveSplitDays,immigration,uImmigration,me,transView,setTransView,perms,uPerms,actLog,addActLog}),[shows,ros,advances,finance,sel,eventKey,role,tab,aC,notesPriv,checkPriv,mobile,intel,labelIntel,refreshing,refreshMsg,sorted,cShows,next,crew,showCrew,production,tourDays,tourDaysSorted,orderedTabs,selEventId,flights,uploadOpen,lodging,guestlists,glTemplates,showOffDays,sidebarOpen,undoToast,dateMenu,tourStart,tourEnd,uShow,uRos,gRos,uAdv,uFin,uNotesPriv,uCheckPriv,addLog,refreshIntel,toggleIntelShare,pushUndo,reorderTabs,uFlight,uLodging,uGuestlist,uProd,refreshLabelIntel,splitParty,setSplitParty,currentSplit,activeSplitPartyId,activeSplitParty,effectiveSplitDays,immigration,uImmigration,me,transView,perms,actLog,addActLog]);// eslint-disable-line

  if(!loaded||!shows)return(<div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',system-ui"}}><div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:800,color:"var(--text)",letterSpacing:"-0.03em"}}>DOS</div><div style={{fontSize:10,color:"var(--text-dim)",marginTop:3,fontFamily:MN}}>v7.0 loading...</div></div></div>);

  return(
    <Ctx.Provider value={ctxValue}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body,#root{width:100%;max-width:100vw;overflow-x:hidden}.br,.rh{min-width:0;transition:background 0.13s ease}.br>div,.rh>div{min-width:0;overflow:hidden;text-overflow:ellipsis}body{background:var(--bg)}img,svg,video{max-width:100%;height:auto}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--accent);border-radius:4px}::-webkit-scrollbar-thumb:hover{background:var(--accent)}@keyframes fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}.fi{animation:fi .18s ease forwards}.br:hover{background:var(--card-2)!important}.rh:hover{background:var(--card-2)!important}button{transition:opacity 0.12s ease,background 0.12s ease,box-shadow 0.12s ease}input:focus,select:focus,textarea:focus{outline:none!important;box-shadow:0 0 0 2px rgba(109,40,217,0.45)!important;border-color:var(--accent)!important}details summary::-webkit-details-marker{display:none}::selection{background:rgba(91,33,182,0.35);color:var(--text)}`}</style>
      <div style={{fontFamily:"'Outfit',system-ui",background:"var(--bg)",color:"var(--text)",height:"100vh",width:"100%",maxWidth:"100vw",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <TopBar ss={ss}/>
        <ContextBar/>
        <div style={{flex:1,display:"flex",flexDirection:"row",minWidth:0,minHeight:0,width:"100%",overflow:"hidden"}}>
          <NavSidebar/>
          <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,minHeight:0,overflow:"hidden"}}>
            {tab!=="dash"&&<SplitPartyTabs/>}
            {tab!=="dash"&&<EventSwitcher show={shows[sel]} sel={sel}/>}
            {tab==="dash"&&<Dash/>}{tab==="advance"&&<AdvTab/>}{tab==="guestlist"&&<GuestListTab/>}{tab==="ros"&&<ScheduleTab/>}{tab==="transport"&&<TransTab/>}{tab==="finance"&&<FinTab/>}{tab==="crew"&&<CrewTab/>}{tab==="lodging"&&<LodgingTab/>}{tab==="production"&&<ProdTab/>}{tab==="access"&&<AccessTab/>}
          </div>
        </div>
        {cmd&&<CmdP/>}
        {exp&&<ExportModal onClose={()=>setExp(false)}/>}
        {dateMenu&&<DateDrawer onClose={()=>setDateMenu(false)}/>}
        {uploadOpen&&<FileUploadModal onClose={()=>setUploadOpen(false)}/>}
        {undoToast&&<div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:"var(--border)",color:"#fff",borderRadius:10,padding:"8px 14px",display:"flex",alignItems:"center",gap:10,fontSize:11,boxShadow:"0 8px 24px rgba(0,0,0,.2)",zIndex:90}}>
          <span>{undoToast.label}</span>
          <button onClick={()=>{undoToast.undo();setUndoToast(null);}} style={{background:"var(--accent)",border:"none",borderRadius:6,color:"#fff",fontSize:10,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>Undo</button>
          <button onClick={()=>setUndoToast(null)} style={{background:"none",border:"none",color:"var(--text-mute)",fontSize:13,cursor:"pointer"}}>×</button>
        </div>}
      </div>
    </Ctx.Provider>
  );
}

function ExportModal({onClose}){
  const{shows,ros,advances,finance,role,tab,sel,aC}=useContext(Ctx);
  const[mode,setMode]=useState("export");const[txt,setTxt]=useState("");const[msg,setMsg]=useState("");
  const snapshot={shows,ros,advances,finance,settings:{role,tab,sel,aC},v:"v7",exported:new Date().toISOString()};
  const dl=()=>{const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`dos-snapshot-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);};
  const imp=async()=>{try{const d=JSON.parse(txt);if(!d.shows||!d.advances)throw new Error("Missing shows/advances");
    await Promise.all([window.storage.set(SK.SHOWS,d.shows),window.storage.set(SK.ROS,d.ros||{}),window.storage.set(SK.ADVANCES,d.advances),window.storage.set(SK.FINANCE,d.finance||{}),d.settings&&window.storage.set(SK.SETTINGS,d.settings)].filter(Boolean));
    setMsg("Imported. Reloading…");setTimeout(()=>window.location.reload(),600);
  }catch(e){setMsg("Error: "+e.message);}};
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{width:520,maxWidth:"100%",background:"var(--card)",borderRadius:10,border:"1px solid var(--border)",padding:18,fontFamily:"'Outfit',system-ui"}}>
      <div style={{display:"flex",gap:4,marginBottom:10}}>
        {["export","import"].map(m=><button key={m} onClick={()=>setMode(m)} style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:6,border:"none",background:mode===m?"var(--accent)":"var(--card-3)",color:mode===m?"var(--card)":"var(--text-dim)",cursor:"pointer"}}>{m.toUpperCase()}</button>)}
        <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"var(--text-dim)",fontSize:16}}>×</button>
      </div>
      {mode==="export"?(<><div style={{fontSize:11,color:"var(--text-dim)",marginBottom:6}}>Shared snapshot (shows, ROS, advances, finance, settings).</div>
        <pre style={{background:"var(--card-3)",padding:10,borderRadius:6,fontSize:9,fontFamily:MN,maxHeight:300,overflow:"auto"}}>{JSON.stringify(snapshot,null,2).slice(0,4000)}{JSON.stringify(snapshot).length>4000&&"\n…"}</pre>
        <button onClick={dl} style={{marginTop:8,background:"var(--accent)",border:"none",borderRadius:6,color:"#fff",fontSize:11,padding:"6px 14px",cursor:"pointer",fontWeight:700}}>Download JSON</button></>):(
        <><div style={{fontSize:11,color:"var(--text-dim)",marginBottom:6}}>Paste JSON to restore shared state.</div>
          <textarea value={txt} onChange={e=>setTxt(e.target.value)} placeholder="{...}" rows={10} style={{width:"100%",fontFamily:MN,fontSize:9,padding:8,border:"1px solid var(--border)",borderRadius:6,resize:"vertical"}}/>
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}>
            <button onClick={imp} disabled={!txt.trim()} style={{background:"var(--accent)",border:"none",borderRadius:6,color:"#fff",fontSize:11,padding:"6px 14px",cursor:txt.trim()?"pointer":"default",fontWeight:700,opacity:txt.trim()?1:.5}}>Restore</button>
            {msg&&<span style={{fontSize:10,color:msg.startsWith("Error")?"var(--danger-fg)":"var(--success-fg)"}}>{msg}</span>}
          </div></>)}
    </div></div>;
}

function StatusBtn({status,setStatus,mobile}){
  const[open,setOpen]=useState(false);const s=SC[status]||SC.pending;const ref=useRef(null);const lp=useRef(null);
  useEffect(()=>{if(!open)return;const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[open]);
  const cycle=()=>{const i=SC_CYCLE.indexOf(status);setStatus(SC_CYCLE[(i+1)%SC_CYCLE.length]||SC_CYCLE[0]);};
  const onClick=e=>{if(mobile){setOpen(true);return;}cycle();};
  const onCtx=e=>{e.preventDefault();setOpen(true);};
  const onDown=e=>{if(mobile)return;if(lp.current)clearTimeout(lp.current);lp.current=setTimeout(()=>setOpen(true),400);};
  const onUp=()=>{if(lp.current){clearTimeout(lp.current);lp.current=null;}};
  const caretClick=e=>{e.stopPropagation();e.preventDefault();setOpen(v=>!v);};
  const tip=mobile?`${s.l} — tap to change`:`${s.l} — click to cycle, caret or right-click for all options`;
  return <div ref={ref} style={{position:"relative",flexShrink:0,display:"inline-flex"}}>
    <button title={tip} onClick={onClick} onContextMenu={onCtx} onMouseDown={onDown} onMouseUp={onUp} onMouseLeave={onUp} onTouchStart={onDown} onTouchEnd={onUp}
      onKeyDown={e=>{if(["Enter"," ","ArrowRight","+"].includes(e.key)){e.preventDefault();cycle();}}}
      style={{fontSize:mobile?10:9,padding:mobile?"5px 9px":"3px 8px",borderTopLeftRadius:5,borderBottomLeftRadius:5,borderTopRightRadius:0,borderBottomRightRadius:0,border:"none",borderRight:`1px solid ${s.c}26`,cursor:"pointer",fontWeight:700,background:s.b,color:s.c,minWidth:mobile?82:78,minHeight:mobile?28:undefined}}>{s.l}</button>
    <button title="Open all status options" aria-label="Open status menu" onClick={caretClick}
      style={{fontSize:mobile?10:9,padding:mobile?"5px 7px":"3px 6px",borderTopRightRadius:5,borderBottomRightRadius:5,borderTopLeftRadius:0,borderBottomLeftRadius:0,border:"none",cursor:"pointer",fontWeight:800,background:s.b,color:s.c,minHeight:mobile?28:undefined,opacity:.75}}>▾</button>
    {open&&<div style={{position:"absolute",top:"100%",right:0,marginTop:3,background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,boxShadow:"0 6px 20px rgba(0,0,0,.1)",zIndex:50,padding:3,minWidth:130}}>
      {SC_ORDER.map(k=>{const v=SC[k];return <button key={k} onClick={()=>{setStatus(k);setOpen(false);}} style={{display:"block",width:"100%",textAlign:"left",padding:mobile?"7px 10px":"4px 8px",fontSize:mobile?11:10,border:"none",background:status===k?v.b:"transparent",color:v.c,cursor:"pointer",borderRadius:4,fontWeight:600}}>{v.l}</button>;})}
    </div>}
  </div>;
}

function IntelSection({title,count,children,actions,defaultOpen=false}){
  return(
    <details open={defaultOpen||undefined} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
      <summary style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)"}}>
        <span style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.06em"}}>{title}</span>
        {count!=null&&<span style={{fontSize:9,color:"var(--text-mute)",fontFamily:MN}}>({count})</span>}
        {actions&&<span style={{marginLeft:"auto",display:"flex",gap:6}} onClick={e=>e.stopPropagation()}>{actions}</span>}
      </summary>
      <div style={{padding:"8px 12px 10px"}}>{children}</div>
    </details>
  );
}

const STATUS_STYLE={
  Landed:{bg:"var(--success-bg)",c:"var(--success-fg)",label:"Landed"},
  Departed:{bg:"var(--info-bg)",c:"var(--info-fg)",label:"Departed"},
  Scheduled:{bg:"var(--card-2)",c:"var(--text-2)",label:"Scheduled"},
  Cancelled:{bg:"var(--danger-bg)",c:"var(--danger-fg)",label:"Cancelled"},
  Delayed:{bg:"var(--warn-bg)",c:"var(--warn-fg)",label:"Delayed"},
  Unknown:{bg:"var(--card-2)",c:"var(--text-mute)",label:"—"},
};
function statusStyle(s){return STATUS_STYLE[s]||STATUS_STYLE.Unknown;}

const FOCUS_CARRIERS=["delta","american","united","air canada"];
const resKey=f=>(f.pnr||f.bookingRef||f.confirmNo||f.tid||`solo_${f.id}`).toString().trim().toUpperCase();

function computeLayoverMins(prev,next){
  if(!prev?.arr||!next?.dep)return null;
  const d1=new Date(`${prev.arrDate||prev.depDate||"2000-01-01"}T${prev.arr}`);
  const d2=new Date(`${next.depDate||"2000-01-01"}T${next.dep}`);
  if(isNaN(d1)||isNaN(d2))return null;
  const diff=Math.round((d2-d1)/60000);
  return diff>0&&diff<1440?diff:null;
}
function fmtMins(m){if(!m)return"";return`${Math.floor(m/60)}h${String(m%60).padStart(2,"0")}m`;}
function getJourneyType(segs){
  if(segs.length===1)return"ONE_WAY";
  const last=segs[segs.length-1],first=segs[0];
  if(segs.length===2&&(last.returnOfId||(last.to&&last.to===first.from)))return"ROUND_TRIP";
  return"MULTI_LEG";
}
function getLegLabel(segs,i,jType){
  if(segs.length<2)return null;
  if(jType==="ROUND_TRIP")return i===0?"OUTBOUND":"RETURN";
  return`LEG ${i+1} / ${segs.length}`;
}

const groupByReservation=list=>{
  const m=new Map();
  list.forEach(f=>{const k=resKey(f);if(!m.has(k))m.set(k,[]);m.get(k).push(f);});
  const groups=[...m.entries()].map(([k,segs])=>{
    const sorted=[...segs].sort((a,b)=>(a.depDate||"").localeCompare(b.depDate||"")||(a.dep||"").localeCompare(b.dep||""));
    const paxUnion=[...new Set(sorted.flatMap(s=>s.pax||[]))];
    const costs=sorted.filter(s=>typeof s.cost==="number");
    const totalCost=costs.length?costs.reduce((a,b)=>a+b.cost,0):null;
    const currency=costs[0]?.currency||"";
    const carriers=[...new Set(sorted.map(s=>s.carrier).filter(Boolean))];
    const pnrSeg=sorted.find(s=>s.pnr)||sorted.find(s=>s.bookingRef||s.confirmNo);
    const pnr=pnrSeg?.pnr||pnrSeg?.bookingRef||pnrSeg?.confirmNo||"";
    const ticketNo=sorted.find(s=>s.ticketNo)?.ticketNo||"";
    const tid=sorted.find(s=>s.tid)?.tid||null;
    const isSolo=k.startsWith("SOLO_");
    const journeyType=getJourneyType(sorted);
    const routeChain=[...new Set([sorted[0]?.from,...sorted.map(s=>s.to)])].filter(Boolean).join("→");
    return{key:k,segs:sorted,paxUnion,totalCost,currency,carriers,pnr,ticketNo,firstDate:sorted[0]?.depDate||"",tid,isSolo,journeyType,routeChain};
  });
  return groups.sort((a,b)=>a.firstDate.localeCompare(b.firstDate));
};

const JOURNEY_BADGE={
  ONE_WAY:{label:"ONE-WAY",bg:"var(--card-2)",c:"var(--text-dim)"},
  ROUND_TRIP:{label:"ROUND TRIP",bg:"var(--info-bg)",c:"var(--info-fg,var(--link))"},
  MULTI_LEG:{label:"MULTI-LEG",bg:"var(--accent-pill-bg)",c:"var(--accent)"},
};
function ReservationHeader({g,collapsed,onToggle}){
  if(g.isSolo)return null;
  const jb=JOURNEY_BADGE[g.journeyType]||JOURNEY_BADGE.MULTI_LEG;
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 4px",flexWrap:"wrap",cursor:onToggle?"pointer":undefined}} onClick={onToggle}>
      <span style={{fontSize:8,fontWeight:800,letterSpacing:"0.06em",padding:"2px 7px",borderRadius:10,background:jb.bg,color:jb.c,flexShrink:0}}>{jb.label}</span>
      {g.routeChain&&<span style={{fontFamily:MN,fontSize:10,fontWeight:800,color:"var(--text)",flexShrink:0}}>{g.routeChain}</span>}
      {g.segs.length>1&&<span style={{fontSize:8,color:"var(--text-mute)",flexShrink:0}}>{g.segs.length} seg</span>}
      {g.pnr&&<span style={{fontSize:9,fontFamily:MN,fontWeight:700,color:"var(--text-2)",flexShrink:0}}>{g.pnr}</span>}
      {g.carriers.length>0&&<span style={{fontSize:9,color:"var(--text-dim)",flexShrink:0}}>{g.carriers.join(" · ")}</span>}
      {g.paxUnion.length>0&&<span style={{fontSize:9,color:"var(--text-mute)",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.paxUnion.join(", ")}</span>}
      {g.totalCost!=null&&<span style={{fontSize:9,fontFamily:MN,fontWeight:700,color:"var(--success-fg)",flexShrink:0}}>{g.currency||"$"}{g.totalCost.toFixed(2)}</span>}
      {g.tid&&<a href={gmailUrl(g.tid)} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:9,color:"var(--link)",textDecoration:"none",flexShrink:0}}>email ↗</a>}
      {onToggle&&<span style={{fontSize:10,color:"var(--text-mute)",marginLeft:"auto",flexShrink:0}}>{collapsed?"▼":"▲"}</span>}
    </div>
  );
}

function ConnectionPill({prev,next}){
  const m=computeLayoverMins(prev,next);
  if(!m)return null;
  const tight=m<60,missed=m<0;
  const col=missed?"var(--danger-fg)":tight?"var(--warn-fg)":"var(--text-mute)";
  const bg=missed?"var(--danger-bg)":tight?"var(--warn-bg)":"transparent";
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,padding:"0 4px",margin:"1px 0"}}>
      <div style={{flex:1,height:1,background:"var(--card-3)"}}/>
      <span style={{fontSize:8,fontFamily:MN,fontWeight:700,color:col,background:bg,padding:"1px 7px",borderRadius:8,whiteSpace:"nowrap"}}>
        {missed?`✗ missed by ${Math.abs(m)}m`:tight?`⚠ ${fmtMins(m)} layover · ${next.from||""}`:`${fmtMins(m)} · ${next.from||""}`}
      </span>
      <div style={{flex:1,height:1,background:"var(--card-3)"}}/>
    </div>
  );
}

function ReservationGroup({g,defaultCollapsed=false,borderColor,renderSegment}){
  const[collapsed,setCollapsed]=useState(defaultCollapsed);
  const border=borderColor||(g.journeyType==="ROUND_TRIP"?"var(--info-bg)":"var(--accent-pill-border)");
  return(
    <div style={{display:"flex",flexDirection:"column",gap:collapsed?0:4,...(g.isSolo?{}:{borderLeft:`2px solid ${border}`,paddingLeft:8})}}>
      {!g.isSolo&&<ReservationHeader g={g} collapsed={collapsed} onToggle={()=>setCollapsed(c=>!c)}/>}
      {!collapsed&&g.segs.map((f,i)=>(
        <React.Fragment key={f.id}>
          {i>0&&<ConnectionPill prev={g.segs[i-1]} next={f}/>}
          {renderSegment(f,getLegLabel(g.segs,i,g.journeyType))}
        </React.Fragment>
      ))}
    </div>
  );
}

function FlightCard({f,actions,liveStatus,onRefreshStatus,refreshing,onUpdatePax,onUpdate,crew,defaultCollapsed=false,legLabel}){
  const st=liveStatus?statusStyle(liveStatus.status):null;
  const delayed=liveStatus?.delayMinutes>0;
  const isFresh=!!f.fresh48h;
  const[editing,setEditing]=useState(false);
  const[draft,setDraft]=useState({});
  const[collapsed,setCollapsed]=useState(defaultCollapsed);
  const startEdit=()=>{
    setDraft({flightNo:f.flightNo||"",carrier:f.carrier||"",from:f.from||"",to:f.to||"",fromCity:f.fromCity||"",toCity:f.toCity||"",depDate:f.depDate||"",dep:f.dep||"",arrDate:f.arrDate||"",arr:f.arr||"",pnr:f.pnr||"",confirmNo:f.confirmNo||"",ticketNo:f.ticketNo||"",cost:f.cost!=null?String(f.cost):"",currency:f.currency||""});
    setEditing(true);
  };
  const saveEdit=()=>{
    const patch={};
    ["flightNo","carrier","from","to","fromCity","toCity","depDate","dep","arrDate","arr","pnr","confirmNo","ticketNo","currency"].forEach(k=>{
      const v=(draft[k]||"").trim();const orig=(f[k]||"").trim();
      if(v!==orig)patch[k]=v||null;
      if(k==="from"||k==="to")patch[k]=(patch[k]||f[k]||"").toUpperCase()||null;
    });
    const n=parseFloat(draft.cost);if(!isNaN(n)&&n!==f.cost)patch.cost=n;else if(draft.cost===""&&f.cost!=null)patch.cost=null;
    if(Object.keys(patch).length)onUpdate(patch);
    setEditing(false);
  };
  const inp={background:"var(--card-2)",border:"1px solid var(--border)",borderRadius:4,fontSize:9,padding:"2px 6px",outline:"none",fontFamily:MN,color:"var(--text)",width:"100%",boxSizing:"border-box"};
  const lbl={fontSize:7,fontWeight:800,color:"var(--text-mute)",letterSpacing:"0.08em",marginBottom:1};
  const fld=(key,label,extra={})=><div style={{minWidth:0,...extra.w?{width:extra.w}:{}}}><div style={lbl}>{label}</div><input style={{...inp,...extra.style}} value={draft[key]??""} onChange={e=>setDraft(p=>({...p,[key]:extra.upper?e.target.value.toUpperCase():e.target.value}))} maxLength={extra.max}/></div>;
  return(
    <div style={{background:"var(--card)",border:`1px solid ${editing?"var(--accent)":isFresh?"var(--accent)":st&&delayed?"var(--warn-fg)":st?.c==="var(--danger-fg)"?"var(--danger-fg)":"var(--border)"}`,borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:6,boxShadow:isFresh&&!editing?"0 0 0 2px var(--accent-pill-bg)":undefined}}>
      <div onClick={()=>setCollapsed(c=>!c)} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",cursor:"pointer"}}>
        {legLabel&&<span style={{fontSize:7,fontWeight:800,letterSpacing:"0.08em",padding:"1px 6px",borderRadius:6,background:"var(--card-3)",color:"var(--text-mute)",flexShrink:0}}>{legLabel}</span>}
        <div style={{fontFamily:MN,fontSize:13,fontWeight:800,color:"var(--link)"}}>{f.from}<span style={{fontSize:10,color:"var(--text-mute)",fontWeight:400,padding:"0 5px"}}>→</span>{f.to}</div>
        <div style={{fontSize:10,fontWeight:700,color:"var(--text)"}}>{f.flightNo||f.carrier}</div>
        {f.carrier&&f.flightNo&&<div style={{fontSize:9,color:"var(--text-dim)"}}>{f.carrier}</div>}
        {isFresh&&<span title="Booked within the last 48 hours" style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--accent-pill-bg)",color:"var(--accent)",fontWeight:800,letterSpacing:"0.06em"}}>NEW · 48H</span>}
        {f.parseVerified===true&&<span title="Data verified against source email" style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--success-bg)",color:"var(--success-fg)",fontWeight:700}}>✓ verified</span>}
        {f.parseVerified===false&&<span title={f.parseNote||"Verification flagged a discrepancy — review before confirming"} style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--warn-bg)",color:"var(--warn-fg)",fontWeight:700,cursor:"help"}}>⚠ check data</span>}
        {f.confidence==="med"&&<span title={f.parseNotes||"Parser flagged this leg as medium confidence"} style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--warn-bg)",color:"var(--warn-fg)",fontWeight:700,cursor:"help"}}>~ med conf</span>}
        {f.confidence==="low"&&<span title={f.parseNotes||"Parser flagged this leg as low confidence — verify before confirming"} style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--danger-bg)",color:"var(--danger-fg)",fontWeight:700,cursor:"help"}}>! low conf</span>}
        {(f.validationFlags||[]).length>0&&<span title={`Validation: ${(f.validationFlags||[]).join(", ")}`} style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--warn-bg)",color:"var(--warn-fg)",fontWeight:700,cursor:"help"}}>⚠ {(f.validationFlags||[]).length} flag{(f.validationFlags||[]).length>1?"s":""}</span>}
        {st&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:st.bg,color:st.c,fontWeight:700}}>{st.label}{delayed?` +${liveStatus.delayMinutes}m`:""}</span>}
        {f.suggestedShowDate&&<span title={`${f.suggestedRole==="outbound"?"Departs day after":"Arrives for"} ${f.suggestedVenue||f.suggestedShowDate}`} style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:f.suggestedRole==="outbound"?"var(--warn-bg)":"var(--success-bg)",color:f.suggestedRole==="outbound"?"var(--warn-fg)":"var(--success-fg)",fontWeight:700}}>{f.suggestedRole==="outbound"?"OUT":"IN"} · {f.suggestedShowDate}</span>}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
          {onRefreshStatus&&<button onClick={e=>{e.stopPropagation();onRefreshStatus();}} disabled={refreshing} title="Refresh live status" style={{background:"none",border:"none",cursor:refreshing?"default":"pointer",fontSize:10,color:refreshing?"var(--text-mute)":"var(--accent)",padding:0,lineHeight:1}}>{refreshing?"⟳":"⟳"}</button>}
          {onUpdate&&!editing&&!collapsed&&<button onClick={e=>{e.stopPropagation();startEdit();}} title="Edit flight data" style={{fontSize:9,padding:"1px 7px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-2)",color:"var(--text-dim)",cursor:"pointer",fontWeight:600}}>Edit</button>}
          <div style={{fontSize:9,fontFamily:MN,color:"var(--text-2)",fontWeight:600}}>{f.depDate}</div>
        </div>
      </div>
      {collapsed&&<div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:9,color:"var(--text-dim)",paddingTop:2}}>
        {f.dep&&<span style={{fontFamily:MN,color:"var(--text)"}}>{f.dep}{f.arr?`–${f.arr}`:""}</span>}
        {f.fromCity&&<span>{f.fromCity}</span>}
        {f.toCity&&<span style={{color:"var(--text-mute)"}}>→ {f.toCity}</span>}
        {f.pnr&&<span style={{fontFamily:MN,color:"var(--text-2)",fontWeight:700}}>{f.pnr}</span>}
        {f.fareClass&&<span style={{textTransform:"capitalize"}}>{f.fareClass}</span>}
        {f.pax?.length>0&&<span style={{color:"var(--text-mute)"}}>{f.pax.length} pax</span>}
        {actions&&<div style={{marginLeft:"auto",display:"flex",gap:5}}>{actions}</div>}
      </div>}
      {!collapsed&&liveStatus&&(
        <div style={{display:"flex",gap:12,padding:"5px 8px",background:st.bg,borderRadius:6,flexWrap:"wrap"}}>
          {liveStatus.depActual&&<div><div style={{fontSize:8,color:st.c,fontWeight:700}}>ACT DEP</div><div style={{fontFamily:MN,fontSize:10,fontWeight:800,color:st.c}}>{liveStatus.depActual}{liveStatus.depGate?` · Gate ${liveStatus.depGate}`:""}</div></div>}
          {liveStatus.arrActual&&<div><div style={{fontSize:8,color:st.c,fontWeight:700}}>ACT ARR</div><div style={{fontFamily:MN,fontSize:10,fontWeight:800,color:st.c}}>{liveStatus.arrActual}{liveStatus.arrGate?` · Gate ${liveStatus.arrGate}`:""}</div></div>}
          {!liveStatus.depActual&&liveStatus.depScheduled&&<div><div style={{fontSize:8,color:st.c,fontWeight:700}}>SCH DEP</div><div style={{fontFamily:MN,fontSize:10,color:st.c}}>{liveStatus.depScheduled}{liveStatus.depGate?` · Gate ${liveStatus.depGate}`:""}</div></div>}
          {!liveStatus.arrActual&&liveStatus.arrScheduled&&<div><div style={{fontSize:8,color:st.c,fontWeight:700}}>SCH ARR</div><div style={{fontFamily:MN,fontSize:10,color:st.c}}>{liveStatus.arrScheduled}{liveStatus.arrGate?` · Gate ${liveStatus.arrGate}`:""}</div></div>}
          {liveStatus.aircraft&&<div><div style={{fontSize:8,color:st.c,fontWeight:700}}>AIRCRAFT</div><div style={{fontSize:9,color:st.c}}>{liveStatus.aircraft}</div></div>}
          {liveStatus.fetchedAt&&<div style={{marginLeft:"auto"}}><div style={{fontSize:8,color:"var(--text-mute)"}}>updated {new Date(liveStatus.fetchedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div></div>}
        </div>
      )}
      {!editing&&!collapsed&&<div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center"}}>
          <div>
            <div style={{fontFamily:MN,fontSize:17,fontWeight:800,color:"var(--text)",lineHeight:1}}>{f.from||"—"}</div>
            {f.fromCity&&<div style={{fontSize:9,color:"var(--text-dim)",marginTop:2}}>{f.fromCity}</div>}
            <div style={{fontFamily:MN,fontSize:12,fontWeight:700,color:"var(--text)",marginTop:4}}>{f.dep||"—"}</div>
            {f.depDate&&<div style={{fontSize:8,color:"var(--text-mute)",marginTop:1}}>{f.depDate}</div>}
          </div>
          <div style={{textAlign:"center",minWidth:40}}>
            {f.durationMinutes&&<div style={{fontSize:8,color:"var(--text-mute)",marginBottom:2}}>{Math.floor(f.durationMinutes/60)}h{String(f.durationMinutes%60).padStart(2,"0")}m</div>}
            <div style={{fontSize:12,color:"var(--text-mute)"}}>→</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:MN,fontSize:17,fontWeight:800,color:"var(--text)",lineHeight:1}}>{f.to||"—"}</div>
            {f.toCity&&<div style={{fontSize:9,color:"var(--text-dim)",marginTop:2}}>{f.toCity}</div>}
            <div style={{fontFamily:MN,fontSize:12,fontWeight:700,color:"var(--text)",marginTop:4}}>{f.arr||"—"}</div>
            {f.arrDate&&<div style={{fontSize:8,color:"var(--text-mute)",marginTop:1}}>{f.arrDate}</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start",paddingTop:2,borderTop:"1px solid var(--card-3)"}}>
          {onUpdatePax
            ?<PaxEditor pax={f.pax||[]} crew={crew} onSave={onUpdatePax}/>
            :(f.pax?.length>0&&<div><div style={{fontSize:8,color:"var(--text-mute)",fontWeight:600}}>PAX</div><div style={{fontSize:10,color:"var(--text)"}}>{f.paxNormalized?.length?f.paxNormalized.map((p,i)=><span key={i} title={p.crewId?`Roster match: ${p.crewId}`:"No roster match"}>{i>0&&", "}<span style={{color:p.crewId?"var(--success-fg)":"var(--text)"}}>{p.displayName}</span>{p.crewId&&<span style={{fontSize:7,marginLeft:2,opacity:0.7}}>✓</span>}</span>):f.pax.join(", ")}</div></div>)}
          {f.pnr&&<div><div style={{fontSize:8,color:"var(--text-mute)",fontWeight:600}}>PNR</div><div style={{fontFamily:MN,fontSize:10,color:"var(--text)",fontWeight:700}}>{f.pnr}</div></div>}
          {f.confirmNo&&<div><div style={{fontSize:8,color:"var(--text-mute)",fontWeight:600}}>CONF #</div><div style={{fontFamily:MN,fontSize:10,color:"var(--text)",fontWeight:700}}>{f.confirmNo}</div></div>}
          {f.ticketNo&&<div><div style={{fontSize:8,color:"var(--text-mute)",fontWeight:600}}>TICKET #</div><div style={{fontFamily:MN,fontSize:10,color:"var(--text)",fontWeight:700}}>{f.ticketNo}</div></div>}
          {f.fareClass&&<div><div style={{fontSize:8,color:"var(--text-mute)",fontWeight:600}}>CABIN</div><div style={{fontFamily:MN,fontSize:10,color:"var(--text)",fontWeight:700,textTransform:"capitalize"}}>{f.fareClass}{f.cabin?` · ${f.cabin}`:""}</div></div>}
          {f.seat&&<div><div style={{fontSize:8,color:"var(--text-mute)",fontWeight:600}}>SEAT</div><div style={{fontFamily:MN,fontSize:10,color:"var(--text)",fontWeight:700}}>{f.seat}</div></div>}
          {f.operator&&f.operator!==f.carrier&&<div><div style={{fontSize:8,color:"var(--text-mute)",fontWeight:600}}>OPERATED BY</div><div style={{fontSize:9,color:"var(--text-dim)"}}>{f.operator}</div></div>}
          {f.layoverMinutes>0&&<div><div style={{fontSize:8,color:"var(--text-mute)",fontWeight:600}}>LAYOVER</div><div style={{fontFamily:MN,fontSize:10,color:"var(--warn-fg)",fontWeight:700}}>{Math.floor(f.layoverMinutes/60)}h{String(f.layoverMinutes%60).padStart(2,"0")}m</div></div>}
          {f.cost&&<div><div style={{fontSize:8,color:"var(--text-mute)",fontWeight:600}}>COST</div><div style={{fontFamily:MN,fontSize:10,color:"var(--success-fg)",fontWeight:700}}>{f.currency||"$"}{f.cost}</div></div>}
        </div>
      </div>}
      {editing&&!collapsed&&<div style={{display:"flex",flexDirection:"column",gap:6,padding:"8px 10px",background:"var(--card-2)",borderRadius:6,border:"1px solid var(--border)"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
          {fld("flightNo","FLIGHT NO")}
          {fld("carrier","CARRIER")}
          {fld("from","FROM (IATA)",{upper:true,max:3})}
          {fld("to","TO (IATA)",{upper:true,max:3})}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
          {fld("fromCity","FROM CITY")}
          {fld("toCity","TO CITY")}
          {fld("depDate","DEP DATE")}
          {fld("dep","DEP TIME")}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
          {fld("arrDate","ARR DATE")}
          {fld("arr","ARR TIME")}
          {fld("pnr","PNR",{max:6})}
          {fld("confirmNo","CONF #")}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
          {fld("ticketNo","TICKET #")}
          {fld("cost","COST")}
          {fld("currency","CURRENCY",{upper:true,max:3})}
          <div/>
        </div>
        <div style={{display:"flex",gap:6,paddingTop:2}}>
          <button onClick={saveEdit} style={{fontSize:9,padding:"3px 10px",borderRadius:4,border:"none",background:"var(--link)",color:"#fff",cursor:"pointer",fontWeight:700}}>Save Changes</button>
          <button onClick={()=>setEditing(false)} style={{fontSize:9,padding:"3px 10px",borderRadius:4,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer"}}>Cancel</button>
        </div>
      </div>}
      {!collapsed&&crew&&f.suggestedCrewIds?.length>0&&(
        <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:8,fontWeight:700,color:"var(--text-mute)",letterSpacing:"0.06em"}}>CREW</span>
          {f.suggestedCrewIds.map(id=>{const c=(crew||[]).find(x=>x.id===id);return c?(<span key={id} style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:"var(--success-bg)",color:"var(--success-fg)",fontWeight:700,border:"1px solid var(--success-bg)"}} title={c.role}>{c.name.split(" ")[0]}</span>):null;})}
        </div>
      )}
      {!collapsed&&f.parseVerified===false&&f.parseNote&&<div style={{fontSize:9,color:"var(--warn-fg)",background:"var(--warn-bg)",border:"1px solid var(--warn-bg)",borderRadius:6,padding:"4px 8px"}}>{f.parseNote}</div>}
      {!collapsed&&actions&&<div style={{display:"flex",gap:5,paddingTop:4,borderTop:"1px solid var(--card-3)"}}>{actions}</div>}
    </div>
  );
}

function matchPaxToCrew(paxNames,crewList){
  const ids=new Set();
  // Precompute normalized crew tokens once.
  const roster=(crewList||[]).filter(c=>c.name&&c.name!=="TBD").map(c=>{
    const cn=c.name.toLowerCase().replace(/\s*\(.*?\)\s*/g,"").trim();
    return{id:c.id,cn,ct:cn.split(/\s+/)};
  });
  for(const pax of(paxNames||[])){
    const pn=pax.toLowerCase().trim();
    const pt=pn.split(/\s+/);
    for(const{id,cn,ct}of roster){
      const overlap=pt.filter(t=>t.length>2&&ct.includes(t)).length;
      // Prefix match on first names handles Alex/Alexander, Dan/Daniel, etc.
      const firstPrefix=pt[0]&&ct[0]&&(pt[0].startsWith(ct[0])||ct[0].startsWith(pt[0]))&&Math.min(pt[0].length,ct[0].length)>=3;
      const lastMatch=pt.length>1&&ct.length>1&&pt[pt.length-1]===ct[ct.length-1];
      if(overlap>=2||pn===cn||(firstPrefix&&lastMatch))ids.add(id);
    }
  }
  return[...ids];
}

// Inline pax editor — used in SegmentDrawer and FlightCard editable mode.
function PaxEditor({pax,crew,onSave}){
  const[names,setNames]=useState(pax||[]);
  const[input,setInput]=useState("");
  const[open,setOpen]=useState(false);
  const inp2={background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 8px",outline:"none",fontFamily:"'Outfit',system-ui",width:"100%",boxSizing:"border-box"};
  const sugg=input.length>0?(crew||[]).filter(c=>c.name&&c.name.toLowerCase().includes(input.toLowerCase())).slice(0,5):[];

  const add=name=>{
    const t=String(name||"").trim();
    if(!t||names.includes(t))return;
    const next=[...names,t];
    setNames(next);onSave(next);setInput("");setOpen(false);
  };
  const remove=i=>{const next=names.filter((_,j)=>j!==i);setNames(next);onSave(next);};

  return(
    <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:0,width:"100%"}}>
      <div style={{fontSize:8,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:2}}>Passengers</div>
      {names.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3}}>
        {names.map((n,i)=>{
          const matched=matchPaxToCrew([n],crew||[]).length>0;
          return(<span key={i} style={{display:"flex",alignItems:"center",gap:2,fontSize:9,padding:"2px 6px",borderRadius:4,background:matched?"var(--success-bg)":"var(--card-2)",color:matched?"var(--success-fg)":"var(--text-2)",border:`1px solid ${matched?"var(--success-bg)":"var(--border)"}`}}>
            {n}<button onClick={()=>remove(i)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-mute)",fontSize:11,lineHeight:1,padding:"0 0 0 2px"}}>×</button>
          </span>);
        })}
      </div>}
      <div style={{position:"relative"}}>
        <input value={input} onChange={e=>{setInput(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),160)}
          onKeyDown={e=>{if(e.key==="Enter"&&input.trim()){add(input);e.preventDefault();}}}
          placeholder="Add name or search crew…" style={inp2}/>
        {open&&sugg.length>0&&(
          <div style={{position:"absolute",top:"100%",left:0,right:0,background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,zIndex:20,maxHeight:130,overflowY:"auto",boxShadow:"0 4px 12px rgba(0,0,0,0.08)"}}>
            {sugg.map(c=>(
              <div key={c.id} onMouseDown={()=>add(c.name)} style={{padding:"5px 9px",cursor:"pointer",fontSize:10,display:"flex",gap:6,alignItems:"center"}} className="rh">
                <span style={{fontWeight:700}}>{c.name.split(" ")[0]}</span>
                <span style={{color:"var(--text-dim)",fontSize:9}}>{c.name.split(" ").slice(1).join(" ")}</span>
                <span style={{marginLeft:"auto",fontSize:8,color:"var(--text-mute)"}}>{c.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FlightsSection(){
  const{flights,uFlight,setFlights,uRos,gRos,uFin,finance,crew,setShowCrew,shows,aC,sorted,tourStart,tourEnd,currentSplit,activeSplitParty,activeSplitPartyId}=useContext(Ctx);
  const a=useAuth();
  const[scanning,setScanning]=useState(false);
  const[scanMsg,setScanMsg]=useState("");
  const[pendingImport,setPendingImport]=useState([]);
  const[confirmingId,setConfirmingId]=useState(null);
  const flightsRef=useRef(flights);
  useEffect(()=>{flightsRef.current=flights;},[flights]);

  // Split-party filter — on a split day, show only flights for the active party.
  const partyMatch=useMemo(()=>{
    if(!currentSplit||!activeSplitParty)return null;
    const names=(activeSplitParty.crew||[]).map(id=>{
      const c=(crew||[]).find(x=>x.id===id);
      return (c?.name||id).toLowerCase();
    });
    return {names,partyId:activeSplitPartyId};
  },[currentSplit,activeSplitParty,activeSplitPartyId,crew]);
  const matchesParty=s=>{
    if(!partyMatch)return true;
    if((s.excludedParties||[]).includes(partyMatch.partyId))return false;
    if(s.partyId)return s.partyId===partyMatch.partyId;
    const pax=(s.pax||[]).filter(Boolean);
    if(!pax.length)return true;
    const lo=pax.map(n=>String(n).toLowerCase());
    return partyMatch.names.some(n=>lo.some(p=>p.includes(n)||n.includes(p.split(" ")[0])));
  };

  const allFlights=useMemo(()=>Object.values(flights).filter(matchesParty).sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||0),[flights,partyMatch]);// eslint-disable-line
  const confirmedRaw=allFlights.filter(f=>f.status==="confirmed");
  const confirmedByKey=new Map();confirmedRaw.forEach(f=>{const k=flightDedupKey(f);const cur=confirmedByKey.get(k);if(!cur||(f.confirmedAt||"")>(cur.confirmedAt||""))confirmedByKey.set(k,f);});
  const confirmed=[...confirmedByKey.values()].sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||0);
  const keepConfirmedIds=new Set(confirmed.map(f=>f.id));
  const keepConfirmedKey=[...keepConfirmedIds].sort().join(",");
  useEffect(()=>{const dupes=confirmedRaw.filter(f=>!keepConfirmedIds.has(f.id));if(dupes.length)dupes.forEach(f=>uFlight(f.id,null));},[keepConfirmedKey]);// eslint-disable-line
  const confirmedKeys=new Set(confirmed.map(flightDedupKey));
  const pendingRaw=allFlights.filter(f=>f.status==="pending"&&!confirmedKeys.has(flightDedupKey(f))&&!f.supersededBy);
  const pendingByKey=new Map();pendingRaw.forEach(f=>{if(!pendingByKey.has(flightDedupKey(f)))pendingByKey.set(flightDedupKey(f),f);});
  const pending=[...pendingByKey.values()];
  const unresolved=allFlights.filter(f=>f.status==="unresolved");
  const superseded=allFlights.filter(f=>f.status==="cancelled"||f.status==="changed"||f.supersededBy);

  const scanFlights=async(opts={})=>{
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const googleToken=session.provider_token;
      if(!googleToken){setScanMsg("Gmail access not available — re-login with Google.");return;}
      if(opts.reset){setFlights({});setPendingImport([]);}
      setScanning(true);setScanMsg(opts.reset?"Reset. Rescanning Gmail…":"Scanning Gmail for flight confirmations…");
      const showsArr=Object.values(shows||{}).filter(s=>s.clientId===aC).map(s=>({id:s.id||s.date,date:s.date,venue:s.venue,city:s.city,type:s.type}));
      const flightBody=JSON.stringify({googleToken,tourStart,tourEnd,focus:FOCUS_CARRIERS,shows:showsArr,...(opts.force?{force:true}:{}),...(opts.forcePayMethod?{forcePayMethod:true}:{})});
      const flightOpts={method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:flightBody};
      let resp=await fetch("/api/flights",flightOpts);
      for(let retry=0;resp.status===404&&retry<2;retry++){
        setScanMsg(`Warming up — retrying…`);
        await new Promise(r=>setTimeout(r,2500));
        resp=await fetch("/api/flights",flightOpts);
      }
      if(resp.status===402){setScanMsg("Gmail session expired — please re-login.");setScanning(false);return;}
      if(!resp.ok){const body=await resp.text().catch(()=>"");console.error("[flights-scan]",resp.status,body);setScanMsg(`Scan error ${resp.status} — ${describeScanError(body)||"try again."}`);setScanning(false);return;}
      const data=await resp.json();
      if(data.error){setScanMsg(`Error: ${data.error}`);setScanning(false);return;}
      const newFlights=data.flights||[];
      const cur=opts.reset?{}:flightsRef.current;
      const novel=[];const enriched=[];
      const working={...cur};
      newFlights.forEach(f=>{
        const match=findFlightMatch(working,f);
        if(match){
          const merged=enrichFlight(match,f);
          if(JSON.stringify(merged)!==JSON.stringify(match)){working[match.id]=merged;enriched.push(merged);}
        }else{
          const paxMap=new Map();(f.pax||[]).forEach(p=>{const k=String(p).toLowerCase();if(!paxMap.has(k))paxMap.set(k,p);});
          const rec={...f,pax:[...paxMap.values()],status:(f.status==="cancelled"||f.status==="changed")?f.status:"pending",suggestedCrewIds:matchPaxToCrew(f.pax,crew)};
          working[f.id]=rec;novel.push(rec);
        }
      });
      if(!novel.length&&!enriched.length){setScanMsg(`Scanned ${data.threadsFound} threads — no new or updated flights.`);setScanning(false);return;}
      setFlights(working);
      const freshCount=novel.filter(f=>f.fresh48h).length;
      const freshTag=freshCount?` (${freshCount} from last 48h)`:"";
      const matchedCount=novel.filter(f=>f.suggestedShowDate).length;
      const matchTag=matchedCount?` · ${matchedCount} matched to shows`:"";
      const addTag=novel.length?`Added ${novel.length}`:"";
      const enrTag=enriched.length?`${addTag?" · ":""}Enriched ${enriched.length}`:"";
      setScanMsg(`${addTag}${enrTag}${freshTag}${matchTag}${novel.length?" — confirm to sync crew.":""}`);
    }catch(e){
      const msg=e.message||"";
      if(msg.includes("string did not match")||msg.includes("Invalid URL")||msg.includes("not a valid URL"))setScanMsg("Auth session error — re-login with Google to refresh.");
      else setScanMsg(`Scan failed: ${msg}`);
    }
    setScanning(false);
  };

  const importFlight=f=>{
    uFlight(f.id,{...f,status:"pending"});
    setPendingImport(p=>p.filter(x=>x.id!==f.id));
  };
  const importAll=()=>{pendingImport.forEach(f=>uFlight(f.id,{...f,status:"pending"}));setPendingImport([]);};

  const confirmFlight=f=>{
    setConfirmingId(f.id);
    uFlight(f.id,{...f,status:"confirmed",confirmedAt:new Date().toISOString()});

    if(f.cost&&f.cost>0){
      uFin(f.depDate,prev=>{
        const existing=(prev?.flightExpenses||[]).filter(e=>e.flightId!==f.id);
        return{...prev,flightExpenses:[...existing,{flightId:f.id,label:`${f.flightNo||f.carrier} ${f.from}→${f.to}`,amount:f.cost,currency:f.currency||"USD",pax:f.pax||[],carrier:f.carrier}]};
      });
    }

    if(f.pax?.length&&crew?.length){
      const allFlightsObj={...flights,[f.id]:{...f,status:"confirmed"}};
      const legs=findItineraryLegs(f,allFlightsObj);
      const firstLeg=legs[0]||f,lastLeg=legs[legs.length-1]||f;
      const allLegObjs=legs.map(flightToLeg);
      const inShow=matchShowByAirport(lastLeg.to,lastLeg.toCity,lastLeg.arrDate||lastLeg.depDate,sorted||[],"inbound");
      const outShow=matchShowByAirport(firstLeg.from,firstLeg.fromCity,firstLeg.depDate,sorted||[],"outbound");
      f.pax.forEach(name=>{
        if(!name)return;
        const match=matchPaxToCrew([name],crew).map(id=>crew.find(c=>c.id===id)).find(Boolean);
        if(!match)return;
        if(inShow){
          const inKey=f.partyId&&SPLIT_DAYS[inShow.date]?`${inShow.date}#${f.partyId}`:inShow.date;
          setShowCrew(p=>{
            const cur=p[inKey]?.[match.id]||{};
            const flightIds=new Set(allLegObjs.map(l=>l.flightId));
            const existing=(cur.inbound||[]).filter(l=>!flightIds.has(l.flightId));
            return{...p,[inKey]:{...p[inKey],[match.id]:{...cur,attending:true,inboundMode:"fly",inboundConfirmed:true,inboundDate:lastLeg.arrDate||lastLeg.depDate,inboundTime:lastLeg.arr||"",inbound:[...existing,...allLegObjs]}}};
          });
        }
        if(outShow){
          const outKey=f.partyId&&SPLIT_DAYS[outShow.date]?`${outShow.date}#${f.partyId}`:outShow.date;
          setShowCrew(p=>{
            const cur=p[outKey]?.[match.id]||{};
            const flightIds=new Set(allLegObjs.map(l=>l.flightId));
            const existing=(cur.outbound||[]).filter(l=>!flightIds.has(l.flightId));
            return{...p,[outKey]:{...p[outKey],[match.id]:{...cur,attending:true,outboundMode:"fly",outboundConfirmed:true,outboundDate:firstLeg.depDate,outboundTime:firstLeg.dep||"",outbound:[...existing,...allLegObjs]}}};
          });
        }
        if(!inShow&&!outShow){
          const arrD=f.arrDate||f.depDate;
          const arrKey=f.partyId&&SPLIT_DAYS[arrD]?`${arrD}#${f.partyId}`:arrD;
          setShowCrew(p=>{
            const cur=p[arrKey]?.[match.id]||{};
            const ex=(cur.inbound||[]).filter(l=>l.flightId!==f.id);
            return{...p,[arrKey]:{...p[arrKey],[match.id]:{...cur,attending:true,inboundMode:"fly",inboundConfirmed:true,inboundDate:arrD,inboundTime:f.arr||"",inbound:[...ex,flightToLeg(f)]}}};
          });
        }
      });
    }
    setTimeout(()=>setConfirmingId(null),1200);
  };

  const dismissFlight=id=>{
    const f=flights[id];if(!f)return;
    // On a split day, dismissing a shared flight only hides it from the
    // active party. Scoped flights (own partyId) dismiss normally.
    if(partyMatch&&!(f.partyId&&f.partyId===partyMatch.partyId)){
      const excl=new Set(f.excludedParties||[]);excl.add(partyMatch.partyId);
      uFlight(id,{...f,excludedParties:[...excl]});
      return;
    }
    uFlight(id,{...f,status:"unresolved"});
  };
  const deleteFlight=id=>uFlight(id,null);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:10,fontWeight:800,color:"var(--link)",letterSpacing:"0.06em"}}>✈ FLIGHTS</span>
        <span style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:"var(--info-bg)",color:"var(--link)",fontWeight:700}}>{confirmed.length} confirmed · {pending.length} pending</span>
        {scanMsg&&<span style={{fontSize:9,color:scanning?"var(--accent)":"var(--text-dim)",fontFamily:MN}}>{scanMsg}</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <button onClick={()=>{const before=Object.keys(flights).length;const cleaned=cleanFlightsObj(flights);const after=Object.keys(cleaned).length;if(confirm(`Clean & deduplicate flights? ${before}→${after} (−${before-after})`)){setFlights(cleaned);setScanMsg(`Cleaned: ${before}→${after} flights.`);}}} disabled={scanning} style={{background:"var(--border)",color:"var(--text-dim)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 11px",cursor:"pointer",fontWeight:700}}>Clean & Dedup</button>
          <button onClick={()=>{if(confirm(`Clear all ${allFlights.length} flights and rescan Gmail?`))scanFlights({reset:true});}} disabled={scanning} style={{background:scanning?"var(--border)":"var(--danger-fg)",color:scanning?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,fontSize:10,padding:"4px 11px",cursor:scanning?"default":"pointer",fontWeight:700}}>Reset & Rescan</button>
          <button onClick={()=>scanFlights({forcePayMethod:true})} disabled={scanning} title="Re-parse only emails missing payment method / card info" style={{background:scanning?"var(--border)":"var(--warn-bg)",color:scanning?"var(--text-dim)":"var(--warn-fg)",border:`1px solid ${scanning?"var(--border)":"var(--warn-fg)"}`,borderRadius:6,fontSize:10,padding:"4px 11px",cursor:scanning?"default":"pointer",fontWeight:700}}>{scanning?"Scanning…":"↺ Payment"}</button>
          <button onClick={()=>scanFlights({force:true})} disabled={scanning} title="Force re-parse all emails" style={{background:scanning?"var(--border)":"var(--card-3)",color:scanning?"var(--text-dim)":"var(--text-2)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 11px",cursor:scanning?"default":"pointer",fontWeight:700}}>Force Rescan</button>
          <button onClick={()=>scanFlights()} disabled={scanning} style={{background:scanning?"var(--border)":"var(--link)",color:scanning?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,fontSize:10,padding:"4px 11px",cursor:scanning?"default":"pointer",fontWeight:700}}>{scanning?"Scanning…":"Scan Gmail"}</button>
        </div>
      </div>

      {/* Pending import (just scanned, not yet in state) */}
      {pendingImport.length>0&&(
        <div style={{background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:10,padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:9,fontWeight:800,color:"var(--link)",letterSpacing:"0.06em"}}>NEW — REVIEW BEFORE IMPORTING</span>
            <button onClick={importAll} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--link)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import All ({pendingImport.length})</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {groupByReservation(pendingImport).map(g=>(
              <ReservationGroup key={g.key} g={g} defaultCollapsed={false} renderSegment={(f,ll)=>(
                <FlightCard f={f} crew={crew} legLabel={ll} actions={<>
                  <button onClick={()=>importFlight(f)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--link)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import</button>
                  <button onClick={()=>setPendingImport(p=>p.filter(x=>x.id!==f.id))} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer"}}>Skip</button>
                  {f.tid&&<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"var(--link)",textDecoration:"none",marginLeft:"auto"}}>open email ↗</a>}
                </>}/>
              )}/>
            ))}
            {groupByReservation(pendingImport).filter(g=>!g.isSolo&&g.segs.length>1).map(g=>(
              <button key={`ia_${g.key}`} onClick={()=>g.segs.forEach(f=>importFlight(f))} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px dashed var(--accent-pill-border)",background:"var(--accent-pill-bg)",color:"var(--accent)",cursor:"pointer",fontWeight:700,alignSelf:"flex-start"}}>Import All {g.segs.length} Segments · {g.routeChain}</button>
            ))}
          </div>
        </div>
      )}

      {/* Pending confirmation */}
      {pending.length>0&&(
        <IntelSection title="PENDING CONFIRMATION" count={pending.length}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {groupByReservation(pending).map(g=>(
              <ReservationGroup key={g.key} g={g} defaultCollapsed={false} renderSegment={(f,ll)=>{
                const isConf=confirmingId===f.id;
                return(
                  <FlightCard f={f} crew={crew} legLabel={ll}
                    onUpdatePax={newPax=>uFlight(f.id,{...f,pax:newPax,suggestedCrewIds:matchPaxToCrew(newPax,crew)})}
                    onUpdate={patch=>uFlight(f.id,{...flights[f.id],...patch,locked:true,editedAt:Date.now()})}
                    actions={<>
                      <button onClick={()=>confirmFlight(flights[f.id]||f)} disabled={isConf} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:isConf?"var(--success-fg)":"var(--link)",color:"#fff",cursor:isConf?"default":"pointer",fontWeight:700}}>{isConf?"✓ Synced!":"Confirm + Sync"}</button>
                      <button onClick={()=>dismissFlight(f.id)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer"}}>Dismiss</button>
                      {f.tid&&<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"var(--link)",textDecoration:"none",marginLeft:"auto"}}>email ↗</a>}
                    </>}/>
                );
              }}/>
            ))}
            {groupByReservation(pending).filter(g=>!g.isSolo&&g.segs.length>1).map(g=>(
              <button key={`ca_${g.key}`} onClick={()=>g.segs.forEach(f=>confirmFlight(f))} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px dashed var(--accent-pill-border)",background:"var(--accent-pill-bg)",color:"var(--accent)",cursor:"pointer",fontWeight:700,alignSelf:"flex-start"}}>Confirm All {g.segs.length} Segments · {g.routeChain}</button>
            ))}
          </div>
        </IntelSection>
      )}

      {/* Confirmed */}
      {confirmed.length>0&&(
        <IntelSection title="CONFIRMED" count={confirmed.length} defaultOpen={true}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {groupByReservation(confirmed).map(g=>(
              <ReservationGroup key={g.key} g={g} defaultCollapsed={true} borderColor="var(--success-bg)" renderSegment={(f,ll)=>{
                const inShow=matchShowByAirport(f.to,f.toCity,f.arrDate||f.depDate,sorted||[],"inbound");
                const outShow=matchShowByAirport(f.from,f.fromCity,f.depDate,sorted||[],"outbound");
                const show=inShow||outShow;
                return(
                  <FlightCard f={f} crew={crew} legLabel={ll} defaultCollapsed={true}
                    actions={<>
                      {show&&<span style={{fontSize:8,padding:"1px 6px",borderRadius:4,background:inShow?"var(--success-bg)":"var(--warn-bg)",color:inShow?"var(--success-fg)":"var(--warn-fg)",fontWeight:700}}>{show.city} {fD(show.date)}</span>}
                      <span style={{fontSize:9,color:"var(--success-fg)",fontWeight:700}}>✓</span>
                      <button onClick={()=>dismissFlight(f.id)} title="Move to unresolved" style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:11}}>×</button>
                    </>}/>
                );
              }}/>
            ))}
          </div>
        </IntelSection>
      )}

      {/* Unresolved */}
      {unresolved.length>0&&(
        <IntelSection title="UNRESOLVED" count={unresolved.length}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {unresolved.map(f=>(
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:"var(--danger-bg)",border:"1px solid var(--danger-bg)",borderRadius:6,flexWrap:"wrap"}}>
                <span style={{fontSize:9,color:"var(--danger-fg)",fontWeight:800,fontFamily:MN,flexShrink:0}}>{f.depDate}</span>
                <span style={{fontSize:11,fontWeight:700,color:"var(--text)",fontFamily:MN,flexShrink:0}}>{f.from}→{f.to}</span>
                <span style={{fontSize:10,color:"var(--text-2)",flexShrink:0}}>{f.flightNo||f.carrier}</span>
                <span style={{fontSize:9,color:"var(--text-dim)",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(f.pax||[]).join(", ")}</span>
                <button onClick={()=>uFlight(f.id,{...f,status:"pending"})} style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:"1px solid var(--info-bg)",background:"var(--info-bg)",color:"var(--link)",cursor:"pointer",fontWeight:700,flexShrink:0}}>↩ Restore</button>
                <button onClick={()=>deleteFlight(f.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:11,flexShrink:0}}>×</button>
              </div>
            ))}
          </div>
        </IntelSection>
      )}

      {/* Changed / Cancelled — superseded by a newer booking email */}
      {superseded.length>0&&(
        <IntelSection title="CHANGED / CANCELLED" count={superseded.length}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {superseded.map(f=>(
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:"var(--warn-bg)",border:"1px solid var(--warn-bg)",borderRadius:6,flexWrap:"wrap",opacity:0.85}}>
                <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,fontWeight:800,background:f.status==="cancelled"?"var(--danger-bg)":"var(--warn-bg)",color:f.status==="cancelled"?"var(--danger-fg)":"var(--warn-fg)",flexShrink:0,border:`1px solid ${f.status==="cancelled"?"var(--danger-fg)":"var(--warn-fg)"}`}}>{f.status==="cancelled"?"CANCELLED":"CHANGED"}</span>
                <span style={{fontSize:9,color:"var(--text-dim)",fontWeight:800,fontFamily:MN,flexShrink:0}}>{f.depDate}</span>
                <span style={{fontSize:11,fontWeight:700,color:"var(--text)",fontFamily:MN,flexShrink:0}}>{f.from}→{f.to}</span>
                <span style={{fontSize:10,color:"var(--text-2)",flexShrink:0}}>{f.flightNo||f.carrier}</span>
                <span style={{fontSize:9,color:"var(--text-dim)",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(f.paxNormalized||[]).map(p=>p.displayName).join(", ")||(f.pax||[]).join(", ")}</span>
                {f.supersededBy&&<span title={`Superseded by thread ${f.supersededBy}`} style={{fontSize:8,color:"var(--text-mute)",flexShrink:0,fontFamily:MN}}>↳ newer booking</span>}
                <button onClick={()=>uFlight(f.id,{...f,status:"pending",supersededBy:undefined})} title="Move back to pending" style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:"1px solid var(--info-bg)",background:"var(--info-bg)",color:"var(--link)",cursor:"pointer",fontWeight:700,flexShrink:0}}>↩</button>
                <button onClick={()=>deleteFlight(f.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:11,flexShrink:0}}>×</button>
              </div>
            ))}
          </div>
        </IntelSection>
      )}

      {allFlights.length===0&&pendingImport.length===0&&(
        <div style={{fontSize:10,color:"var(--text-mute)",fontStyle:"italic",padding:"4px 0"}}>No flights yet. Click "Scan Gmail" to import from confirmation emails.</div>
      )}
    </div>
  );
}

function IntelPanel(){
  const{sel,shows,intel,setIntel,addLog,refreshIntel,toggleIntelShare,refreshing,refreshMsg,uShow,labelIntel,addActLog}=useContext(Ctx);
  const show=shows[sel];const sid=show?showIdFor(show):"";const data=intel[sid]||{};
  const upd=patch=>setIntel(p=>({...p,[sid]:{...(p[sid]||{}),...patch}}));
  const primaryTid=(data.threads||[]).find(t=>t.tid)?.tid||null;
  const threadHref=(tid)=>tid?gmailUrl(tid):null;
  const[drafts,setDrafts]=useState({});
  const draftReply=async(tid)=>{
    setDrafts(p=>({...p,[tid]:{status:"loading"}}));
    const{data:{session}}=await supabase.auth.getSession();
    if(!session?.provider_token){setDrafts(p=>({...p,[tid]:{status:"error",error:"Gmail token missing — re-login"}}));return;}
    try{
      const resp=await fetch("/api/comms",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({tid,show,googleToken:session.provider_token,userEmail:session.user?.email})});
      const json=await resp.json();
      if(!resp.ok){setDrafts(p=>({...p,[tid]:{status:"error",error:json.error||"Draft failed"}}));return;}
      setDrafts(p=>({...p,[tid]:{status:"done",text:json.draft,subject:json.subject,participants:json.participants}}));
    }catch(e){setDrafts(p=>({...p,[tid]:{status:"error",error:e.message||"Network error"}}));}
  };
  const clearDraft=tid=>setDrafts(p=>{const n={...p};delete n[tid];return n;});
  const DraftPanel=({tid})=>{
    const d=drafts[tid];if(!d)return null;
    if(d.status==="loading")return<div style={{padding:"6px 0 4px 0",fontSize:9,color:"var(--text-mute)",fontFamily:MN}}>Drafting…</div>;
    if(d.status==="error")return<div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0"}}>
      <span style={{fontSize:9,color:"var(--danger-fg)"}}>{d.error}</span>
      <button onClick={()=>clearDraft(tid)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-mute)",fontSize:11}}>×</button>
    </div>;
    return<div style={{marginTop:4,border:"1px solid var(--accent)",borderRadius:6,padding:"8px 10px",background:"var(--card-2)",display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:8,fontWeight:800,color:"var(--accent)",letterSpacing:"0.06em"}}>DRAFT REPLY</span>
        <span style={{fontSize:8,color:"var(--text-mute)",fontFamily:MN,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.subject}</span>
        <button onClick={()=>clearDraft(tid)} title="Close draft" style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-mute)",fontSize:11,flexShrink:0}}>×</button>
      </div>
      <textarea value={d.text} onChange={e=>setDrafts(p=>({...p,[tid]:{...p[tid],text:e.target.value}}))} rows={6} style={{width:"100%",fontFamily:MN,fontSize:9,padding:"6px 8px",border:"1px solid var(--border)",borderRadius:4,resize:"vertical",background:"var(--card)",color:"var(--text)",lineHeight:1.5}}/>
      <div style={{display:"flex",gap:5}}>
        <button onClick={()=>navigator.clipboard.writeText(d.text)} style={{fontSize:8,padding:"3px 9px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-2)",cursor:"pointer",fontWeight:700}}>Copy</button>
        <a href={gmailUrl(tid)} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"3px 9px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card)",color:"var(--link)",cursor:"pointer",fontWeight:700,textDecoration:"none"}}>Open Gmail ↗</a>
      </div>
    </div>;
  };
  const arDone=useMemo(()=>new Set(intel.__arState?.done||[]),[intel.__arState]);
  const arIgnored=useMemo(()=>new Set(intel.__arState?.ignored||[]),[intel.__arState]);
  const markArIntel=(id,state,label)=>{
    setIntel(p=>{const prev=p.__arState||{};const next=state==="undone"?{...prev,done:(prev.done||[]).filter(x=>x!==id)}:{...prev,[state]:[...new Set([...(prev[state]||[]),id])]};return{...p,__arState:next};});
    addLog({type:"user",section:"ar",showId:sid,action:state,label,from:"intel_panel"});
    addActLog({module:"intel",action:`intel.ar.${state}`,target:{type:"ar_item",id,label:label||id},payload:{showId:sid},context:{date:sel,showId:sid,eventKey:sid}});
  };
  const toggleTodo=(id,currentDone,label)=>{upd({todos:(data.todos||[]).map(t=>t.id===id?{...t,done:!t.done}:t)});addLog({type:"user",section:"todo",showId:sid,action:currentDone?"undone":"done",label,from:"intel_panel"});};
  const delTodo=id=>upd({todos:(data.todos||[]).filter(t=>t.id!==id)});
  const dismissFlag=k=>upd({dismissedFlags:[...(data.dismissedFlags||[]),k]});
  const addTodo=()=>upd({todos:[...(data.todos||[]),{id:`t${Date.now()}`,text:"New action item",priority:"MED",done:false,ts:Date.now()}]});
  const addThread=()=>upd({threads:[...(data.threads||[]),{tid:`m${Date.now()}`,subject:"New thread",from:"",intent:"manual",date:new Date().toISOString().slice(0,10),manual:true}]});
  const delThread=tid=>upd({threads:(data.threads||[]).filter(t=>t.tid!==tid)});
  const addFollowUp=()=>upd({followUps:[...(data.followUps||[]),{action:"New follow-up",owner:"",priority:"MED",deadline:"",manual:true}]});
  const delFollowUp=i=>upd({followUps:(data.followUps||[]).filter((_,idx)=>idx!==i)});
  const addManualFlag=()=>upd({manualFlags:[...(data.manualFlags||[]),{key:`m${Date.now()}`,label:"New inconsistency",severity:"UNCONFIRMED",platform:"",emailVal:"",snippet:""}]});
  const delManualFlag=k=>upd({manualFlags:(data.manualFlags||[]).filter(f=>f.key!==k)});
  const updManualFlag=(k,patch)=>upd({manualFlags:(data.manualFlags||[]).map(f=>f.key===k?{...f,...patch}:f)});
  const scheduleFlags=useMemo(()=>{
    if(!show)return[];const out=[];const dismissed=new Set(data.dismissedFlags||[]);const seen=new Set();
    const addFlag=(key,fld,emailVal,snippet,threadTid)=>{
      if(dismissed.has(key)||seen.has(key))return;
      const cur=show[fld.field];const conf=show[fld.field+"Confirmed"];
      let severity=null;
      if(cur==null||cur===0||!conf)severity="UNCONFIRMED";
      else if(cur!==emailVal)severity="CONFLICT";
      if(!severity)return;
      seen.add(key);
      out.push({key,field:fld.field,label:fld.label,platform:cur?fmtMin(cur):"(not set)",emailVal:fmtMin(emailVal),emailValMinutes:emailVal,snippet,threadTid,severity});
    };
    const fldByName=Object.fromEntries(FIELD_KEYS.map(f=>[f.field,f]));
    const isEndField=fld=>fld&&(fld.field==="curfew"||fld.field==="busArrive");
    (data.schedule||[]).forEach((s,i)=>{
      const fld=fldByName[s.field];const corpus=`${s.time||""} ${s.item||""}`;const times=parseAllTimes(corpus);
      if(fld&&times.length){
        // For a grouped range, end-fields (curfew) use the end time; start-fields use the start time
        const relevant=times.filter(t=>t.rangeRole===null||(isEndField(fld)?t.rangeRole==="end":t.rangeRole==="start"));
        const use=relevant.length?relevant:times.filter(t=>t.rangeRole!=="end");
        use.forEach(t=>addFlag(`sch_${fld.field}_${t.minutes}_${i}`,fld,t.minutes,corpus.trim(),s.tid||null));
      } else if(times.length){
        const text=String(s.item||"").toLowerCase();const guess=FIELD_KEYS.find(f=>f.keys.some(k=>text.includes(k)));
        if(guess){
          const relevant=times.filter(t=>t.rangeRole===null||(isEndField(guess)?t.rangeRole==="end":t.rangeRole==="start"));
          const use=relevant.length?relevant:times.filter(t=>t.rangeRole!=="end");
          use.forEach(t=>addFlag(`sch_${guess.field}_${t.minutes}_${i}`,guess,t.minutes,corpus.trim(),s.tid||null));
        }
      }
    });
    (data.threads||[]).forEach(t=>{
      const corpus=`${t.subject||""}\n${t.bodySnippet||t.snippet||""}`;
      const lower=corpus.toLowerCase();const times=parseAllTimes(corpus);if(!times.length)return;
      times.forEach(tm=>{
        let best=null,bestDist=Infinity;
        FIELD_KEYS.forEach(fld=>{
          // Range role filtering: end-of-range times only match end-fields; start-of-range times skip end-fields
          if(tm.rangeRole==="end"&&!isEndField(fld))return;
          if(tm.rangeRole==="start"&&isEndField(fld))return;
          fld.keys.forEach(k=>{const idx=lower.indexOf(k);if(idx<0)return;const d=Math.abs(idx-tm.index);if(d<bestDist){bestDist=d;best=fld;}});
        });
        if(!best||bestDist>80)return;
        const s=Math.max(0,tm.index-30),e=Math.min(corpus.length,tm.index+60);
        addFlag(`th_${best.field}_${tm.minutes}_${t.tid}_${tm.index}`,best,tm.minutes,corpus.slice(s,e).trim(),t.tid);
      });
    });
    return out;
  },[data,show]);
  if(!show)return null;const busy=refreshing===sid;const shared=data.isShared||false;
  return <div style={{display:"flex",flexDirection:"column",gap:8}}>
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <span style={{fontSize:10,fontWeight:800,color:"var(--accent)",letterSpacing:"0.06em"}}>GMAIL INTEL</span>
      <span style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:"var(--card-2)",color:"var(--text-dim)",fontWeight:600,letterSpacing:"0.04em"}}>PRIVATE</span>
      {data.lastRefreshed&&<span style={{fontSize:9,color:"var(--text-mute)",fontFamily:MN}}>last: {new Date(data.lastRefreshed).toLocaleString()}</span>}
      {data._partial&&<span title="Claude response was truncated by max_tokens; some threads/fields may be missing. Re-run the scan." style={{fontSize:9,fontWeight:700,color:"var(--warn-fg)",fontFamily:MN,padding:"1px 6px",borderRadius:4,border:"1px solid var(--warn-fg)"}}>PARTIAL</span>}
      <span style={{marginLeft:"auto",fontSize:9,color:"var(--text-dim)"}}>{(data.threads||[]).length} threads · {(data.todos||[]).length} to-dos</span>
      <button onClick={()=>toggleIntelShare(show,!shared)} style={{background:shared?"var(--success-bg)":"var(--card-2)",color:shared?"var(--success-fg)":"var(--text-2)",border:`1px solid ${shared?"var(--success-fg)":"var(--border)"}`,borderRadius:6,fontSize:9,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>{shared?"Shared with team":"Share with team"}</button>
      <button onClick={()=>{const d=intel[sid];if(!d)return;const before={t:(d.todos||[]).length,f:(d.followUps||[]).length,th:(d.threads||[]).length};const clean=deduplicateIntel(d);const saved=(before.t-(clean.todos||[]).length)+(before.f-(clean.followUps||[]).length)+(before.th-(clean.threads||[]).length);setIntel(p=>({...p,[sid]:clean}));if(saved>0)addLog({type:"user",section:"dedup",showId:sid,action:"cleaned",label:`Removed ${saved} duplicate${saved>1?"s":""}`,from:"intel_panel"});}} title="Remove near-duplicate todos, follow-ups, and threads" style={{background:"var(--card-2)",color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:6,fontSize:9,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>Clean Dupes</button>
      <button onClick={()=>refreshIntel(show,true)} disabled={!!refreshing} style={{background:refreshing?"var(--border)":"var(--accent)",color:refreshing?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,fontSize:10,padding:"4px 11px",cursor:refreshing?"default":"pointer",fontWeight:700}}>{busy?"Scanning…":"Refresh Intel"}</button>
    </div>
    {refreshMsg&&<div style={{fontSize:10,color:"var(--accent)",fontFamily:MN}}>{refreshMsg}</div>}
    {(()=>{
      const arItems=(labelIntel?.actionRequired||[]).filter(item=>item.showId===sid&&!arIgnored.has(item.id));
      if(!arItems.length)return null;
      const BUCKETS=[
        {key:"urgent",label:"URGENT",bg:"var(--danger-bg)",col:"var(--danger-fg)"},
        {key:"input",label:"INPUT / APPROVAL NEEDED",bg:"var(--warn-bg)",col:"var(--warn-fg)"},
        {key:"standing_by",label:"STANDING BY",bg:"var(--info-bg)",col:"var(--link)"},
        {key:"fresh",label:"FRESH",bg:"var(--accent-pill-bg)",col:"var(--accent)"},
        {key:"active",label:"ACTIVE",bg:"var(--card)",col:"var(--text-2)"},
      ];
      const grouped={urgent:[],input:[],standing_by:[],fresh:[],active:[]};
      for(const item of arItems){const k=item.bucket||"active";grouped[k]?grouped[k].push(item):grouped.active.push(item);}
      return(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <div style={{fontSize:9,fontWeight:800,color:"var(--warn-fg)",letterSpacing:"0.08em"}}>ACTION REQUIRED · LABEL SCAN ({arItems.length})</div>
          {BUCKETS.filter(b=>grouped[b.key].length>0).map(b=>(
            <div key={b.key} style={{background:b.bg,border:`1px solid ${b.col}30`,borderRadius:10,padding:"8px 12px"}}>
              <div style={{fontSize:8,fontWeight:800,color:b.col,letterSpacing:"0.08em",marginBottom:5}}>{b.label} ({grouped[b.key].length})</div>
              {grouped[b.key].map(item=>{const done=arDone.has(item.id);return(
                <React.Fragment key={item.id}>
                <div style={{display:"flex",gap:8,padding:"4px 0",borderBottom:`1px solid ${b.col}18`,alignItems:"center",opacity:done?0.45:1}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:done?"line-through":"none"}}>{item.subject}</div>
                    <div style={{fontSize:9,color:b.col,opacity:0.85}}>{item.category&&item.category!=="MISC"?`${item.category} · `:""}{item.signal} · {item.from}</div>
                  </div>
                  <a href={gmailUrl(item.id)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"var(--link)",textDecoration:"none",flexShrink:0}}>↗</a>
                  <button onClick={()=>draftReply(item.id)} disabled={drafts[item.id]?.status==="loading"} title="Draft reply-all" style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:"1px solid var(--accent)",background:"var(--card)",color:"var(--accent)",cursor:"pointer",fontWeight:700,flexShrink:0,opacity:drafts[item.id]?.status==="loading"?0.5:1}}>✉</button>
                  <button onClick={()=>markArIntel(item.id,done?"undone":"done",item.subject)} title={done?"Mark open":"Mark done"} style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:"none",background:done?"var(--success-bg)":"var(--card-2)",color:done?"var(--success-fg)":"var(--text-2)",cursor:"pointer",fontWeight:700,flexShrink:0}}>✓</button>
                  <button onClick={()=>markArIntel(item.id,"ignored",item.subject)} title="Ignore" style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:"none",background:"var(--card-2)",color:"var(--text-mute)",cursor:"pointer",fontWeight:700,flexShrink:0}}>✕</button>
                </div>
                <DraftPanel tid={item.id}/>
                </React.Fragment>
              );})}

            </div>
          ))}
        </div>
      );
    })()}
    <IntelSection title="SCHEDULE INCONSISTENCIES" count={scheduleFlags.length+(data.manualFlags||[]).length} defaultOpen={true} actions={<button onClick={addManualFlag} style={{...UI.expandBtn(false,"var(--warn-fg)"),fontSize:9}}>+ Add</button>}>
      {scheduleFlags.length===0&&(data.manualFlags||[]).length===0?<div style={{fontSize:10,color:"var(--text-mute)",fontStyle:"italic"}}>No inconsistencies.</div>:
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {scheduleFlags.map(f=>{const isC=f.severity==="CONFLICT";const col=isC?"var(--danger-fg)":"var(--warn-fg)";const bg=isC?"var(--danger-bg)":"var(--warn-bg)";
          const confirmPlatform=()=>dismissFlag(f.key);
          const confirmEmail=()=>{uShow(sel,{[f.field]:f.emailValMinutes,[f.field+"Confirmed"]:true});dismissFlag(f.key);};
          const markBadMatch=()=>dismissFlag(f.key);
          return <div key={f.key} style={{border:`1px solid ${col}40`,background:bg,borderRadius:6,padding:"7px 9px",display:"flex",flexDirection:"column",gap:4}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:col,color:"#fff",fontWeight:800}}>{f.severity}</span>
              <span style={{fontSize:11,fontWeight:700,color:"var(--text)"}}>{f.label}</span>
              <span style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}>
                {f.threadTid&&<a href={gmailUrl(f.threadTid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:col,textDecoration:"none",fontWeight:600}}>open ↗</a>}
              </span>
            </div>
            <div style={{fontSize:10,fontFamily:MN,color:"var(--text)"}}>platform: <span style={{fontWeight:600}}>{f.platform}</span> · email: <span style={{fontWeight:600}}>{f.emailVal}</span></div>
            <div style={{fontSize:9,color:"var(--text-dim)",fontStyle:"italic"}}>{f.snippet}</div>
            <div style={{display:"flex",gap:5,marginTop:2}}>
              <button onClick={confirmPlatform} title="Platform time is correct — dismiss flag" style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:"1px solid var(--text-2)",background:"var(--card-2)",color:"var(--text-3)",cursor:"pointer",fontWeight:700}}>Platform correct</button>
              <button onClick={confirmEmail} title="Email time is correct — update show and dismiss" style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:`1px solid ${col}60`,background:isC?"var(--danger-bg)":"var(--warn-bg)",color:col,cursor:"pointer",fontWeight:700}}>Use email time</button>
              <button onClick={markBadMatch} title="Low confidence — comparison is improperly formed or imprecise" style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-3)",color:"var(--text-mute)",cursor:"pointer",fontWeight:600}}>Bad match</button>
            </div>
          </div>;
        })}
        {(data.manualFlags||[]).map(f=><div key={f.key} style={{border:"1px solid var(--border)",background:"var(--card-4)",borderRadius:6,padding:"7px 9px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr 28px",gap:6,alignItems:"center"}}>
          <input value={f.label} onChange={e=>updManualFlag(f.key,{label:e.target.value})} placeholder="Label" style={UI.input}/>
          <input value={f.platform} onChange={e=>updManualFlag(f.key,{platform:e.target.value})} placeholder="Platform" style={UI.input}/>
          <input value={f.emailVal} onChange={e=>updManualFlag(f.key,{emailVal:e.target.value})} placeholder="Email value" style={UI.input}/>
          <button onClick={()=>delManualFlag(f.key)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13}}>×</button>
        </div>)}
      </div>}
    </IntelSection>
    {(()=>{
      const PRI={CRITICAL:0,HIGH:1,MED:2,MEDIUM:2,LOW:3};
      const threadMap=new Map((data.threads||[]).map(t=>[t.tid,t]));
      const activeTodos=(data.todos||[]).filter(t=>!t.ignored);
      const activeFu=(data.followUps||[]).filter(f=>!f.done&&!f.ignored);
      const todosByTid={};for(const t of activeTodos)(todosByTid[t.threadTid||"__none__"]||=[]).push(t);
      const fuByTid={};for(const f of activeFu)(fuByTid[f.tid||"__none__"]||=[]).push(f);
      const seenTid=new Set();
      const groups=[];
      for(const t of(data.threads||[])){if(seenTid.has(t.tid)||(!t.manual&&!t.subject))continue;seenTid.add(t.tid);groups.push({thread:t,tid:t.tid});}
      for(const k of[...Object.keys(todosByTid),...Object.keys(fuByTid)]){if(k==="__none__"||seenTid.has(k))continue;seenTid.add(k);groups.push({thread:null,tid:k});}
      const unlinkedTodos=todosByTid["__none__"]||[];
      const unlinkedFu=fuByTid["__none__"]||[];
      const renderTodo=t=>(
        <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0 3px 10px",borderTop:"1px solid var(--card-3)"}}>
          <input type="checkbox" checked={!!t.done} onChange={()=>toggleTodo(t.id,t.done,t.text)}/>
          <span style={{fontSize:10,flex:1,color:t.done?"var(--text-mute)":"var(--text)",textDecoration:t.done?"line-through":"none"}}>{t.text}</span>
          {t.threadTid&&<a href={gmailUrl(t.threadTid)} target="_blank" rel="noopener noreferrer" title="Open thread" style={{color:"var(--text-mute)",fontSize:9,textDecoration:"none",flexShrink:0}}>✉</a>}
          {t.priority&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:t.priority==="CRITICAL"?"var(--danger-bg)":t.priority==="HIGH"?"var(--warn-bg)":"var(--card-2)",color:t.priority==="CRITICAL"?"var(--danger-fg)":t.priority==="HIGH"?"var(--warn-fg)":"var(--text-dim)",fontWeight:700}}>{t.priority}</span>}
          <button onClick={()=>delTodo(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-mute)",fontSize:11}}>×</button>
        </div>
      );
      const renderFu=(f,i)=>(
        <div key={i} style={{display:"grid",gridTemplateColumns:`1fr 90px 70px 90px${f.manual?"":" auto auto"} 24px`,gap:6,padding:"3px 0 3px 10px",borderTop:"1px solid var(--card-3)",fontSize:10,alignItems:"center"}}>
          {f.manual?<input value={f.action||""} onChange={e=>upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,action:e.target.value}:x)})} placeholder="Action" style={UI.input}/>:f.tid?<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" title="Open thread" style={{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--text)",textDecoration:"underline",textDecorationColor:"var(--text-mute)",textUnderlineOffset:2}}>{f.action}</a>:<span style={{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.action}</span>}
          {f.manual?<input value={f.owner||""} onChange={e=>upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,owner:e.target.value}:x)})} placeholder="Owner" style={UI.input}/>:<span style={{fontSize:8,color:"var(--text-dim)"}}>{f.owner}</span>}
          {f.manual?<select value={f.priority||"MED"} onChange={e=>upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,priority:e.target.value}:x)})} style={UI.input}><option>CRITICAL</option><option>HIGH</option><option>MED</option><option>LOW</option></select>:<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:f.priority==="CRITICAL"?"var(--danger-bg)":"var(--card-2)",color:f.priority==="CRITICAL"?"var(--danger-fg)":"var(--text-dim)",fontWeight:700}}>{f.priority}</span>}
          {f.manual?<input value={f.deadline||""} onChange={e=>upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,deadline:e.target.value}:x)})} placeholder="YYYY-MM-DD" style={UI.input}/>:<span style={{fontSize:8,color:"var(--text-mute)",fontFamily:MN}}>{f.deadline}</span>}
          {!f.manual&&<button onClick={()=>{upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,done:true}:x)});addLog({type:"user",section:"followup",showId:sid,action:"done",label:f.action,from:"intel_panel"});}} style={{fontSize:8,padding:"2px 5px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",background:"var(--success-bg)",color:"var(--success-fg)"}}>Done</button>}
          {!f.manual&&<button onClick={()=>{upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,ignored:true}:x)});addLog({type:"user",section:"followup",showId:sid,action:"ignored",label:f.action,from:"intel_panel"});}} style={{fontSize:8,padding:"2px 5px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",background:"var(--card-2)",color:"var(--text-mute)"}}>Ignore</button>}
          <button onClick={()=>delFollowUp(i)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-mute)",fontSize:11}}>×</button>
        </div>
      );
      const totalCount=(data.threads||[]).filter(t=>t.manual||t.subject).length;
      const itemCount=activeTodos.length+activeFu.length;
      return(
      <IntelSection title="INTEL BY THREAD" count={totalCount} defaultOpen={true} actions={<div style={{display:"flex",gap:4}}>
        <button onClick={addTodo} style={{...UI.expandBtn(false,"var(--accent)"),fontSize:9}}>+ Todo</button>
        <button onClick={addThread} style={{...UI.expandBtn(false,"var(--accent)"),fontSize:9}}>+ Thread</button>
        <button onClick={addFollowUp} style={{...UI.expandBtn(false,"var(--accent)"),fontSize:9}}>+ Follow-up</button>
      </div>}>
        {totalCount===0&&itemCount===0&&<div style={{fontSize:10,color:"var(--text-mute)",fontStyle:"italic"}}>No intel yet. Run a scan.</div>}
        {groups.map(({thread,tid})=>{
          const gTodos=(todosByTid[tid]||[]).sort((a,b)=>(PRI[a.priority]??4)-(PRI[b.priority]??4));
          const gFus=fuByTid[tid]||[];
          if(!thread&&!gTodos.length&&!gFus.length)return null;
          return(
            <div key={tid} style={{marginBottom:6,borderLeft:"2px solid var(--border)",paddingLeft:8}}>
              {thread&&(
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0"}}>
                  <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--accent-pill-bg)",color:"var(--accent)",fontWeight:700,flexShrink:0}}>{thread.intent||"?"}</span>
                  {thread.manual
                    ?<input value={thread.subject||""} onChange={e=>upd({threads:data.threads.map(x=>x.tid===tid?{...x,subject:e.target.value}:x)})} placeholder="Subject" style={{...UI.input,flex:1}}/>
                    :<a href={gmailUrl(tid)} target="_blank" rel="noopener noreferrer" style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--text)",textDecoration:"none",fontSize:10}}>
                      <span style={{fontWeight:600}}>{thread.subject}</span>{thread.from&&<span style={{color:"var(--text-dim)",fontSize:8}}>{" · "+thread.from}</span>}
                    </a>}
                  {thread.status&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--card-2)",color:"var(--text-mute)",fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>{thread.status}</span>}
                  <span style={{fontSize:8,color:"var(--text-mute)",fontFamily:MN,flexShrink:0}}>{thread.date}</span>
                  {!thread.manual&&<button onClick={()=>draftReply(tid)} disabled={drafts[tid]?.status==="loading"} title="Draft reply-all" style={{fontSize:9,padding:"2px 6px",borderRadius:4,border:"1px solid var(--accent)",background:"var(--card)",color:"var(--accent)",cursor:"pointer",fontWeight:700,flexShrink:0,opacity:drafts[tid]?.status==="loading"?0.5:1}}>✉</button>}
                  <button onClick={()=>delThread(tid)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-mute)",fontSize:11,flexShrink:0}}>×</button>
                </div>
              )}
              {thread&&<DraftPanel tid={tid}/>}
              {gTodos.map(renderTodo)}
              {gFus.map(f=>renderFu(f,(data.followUps||[]).findIndex(x=>x===f)))}
            </div>
          );
        })}
        {(unlinkedTodos.length>0||unlinkedFu.length>0)&&(
          <div style={{marginBottom:6,borderLeft:"2px solid var(--card-3)",paddingLeft:8}}>
            <div style={{fontSize:8,fontWeight:700,color:"var(--text-mute)",letterSpacing:"0.06em",padding:"3px 0"}}>MANUAL / NO THREAD</div>
            {[...unlinkedTodos].sort((a,b)=>(PRI[a.priority]??4)-(PRI[b.priority]??4)).map(renderTodo)}
            {unlinkedFu.map(f=>renderFu(f,(data.followUps||[]).findIndex(x=>x===f)))}
          </div>
        )}
      </IntelSection>
      );
    })()}
    {(data.showContacts||[]).length>0&&<div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px"}}>
      <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.06em",marginBottom:6}}>CONTACTS</div>
      {data.showContacts.map((c,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8,padding:"4px 0",borderBottom:"1px solid var(--card-3)",fontSize:10}}>
        <span style={{fontWeight:600}}>{c.name}</span><span style={{color:"var(--text-dim)"}}>{c.role}</span>
        {c.email&&<a href={`mailto:${c.email}`} style={{color:"var(--accent)",fontSize:9,textDecoration:"none"}}>{c.email}</a>}
      </div>)}
    </div>}
    {(data.sharedByOthers||[]).map((s,i)=>{
      const label=s.user_email||"teammate";const d=s.intel||{};
      return <div key={i} style={{border:"1px solid var(--success-fg)",borderRadius:10,padding:"10px 12px",background:"var(--success-bg)"}}>
        <div style={{fontSize:9,fontWeight:800,color:"var(--success-fg)",letterSpacing:"0.06em",marginBottom:8}}>SHARED BY {label.toUpperCase()} · {new Date(s.cached_at).toLocaleDateString()}</div>
        {(d.followUps||[]).length>0&&<div>
          <div style={{fontSize:8,fontWeight:700,color:"var(--text-dim)",marginBottom:4}}>FOLLOW-UPS ({d.followUps.length})</div>
          {d.followUps.map((f,fi)=><div key={fi} style={{display:"grid",gridTemplateColumns:"1fr 80px 70px 80px",gap:8,padding:"4px 0",borderBottom:"1px solid var(--success-bg)",fontSize:10,alignItems:"center"}}>
            <span>{f.action}</span>
            <span style={{fontSize:8,color:"var(--text-dim)"}}>{f.owner}</span>
            <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:f.priority==="CRITICAL"?"var(--danger-bg)":"var(--card-2)",color:f.priority==="CRITICAL"?"var(--danger-fg)":"var(--text-dim)",fontWeight:700}}>{f.priority}</span>
            <span style={{fontSize:8,color:"var(--text-mute)",fontFamily:MN}}>{f.deadline}</span>
          </div>)}
        </div>}
      </div>;
    })}
    {(()=>{
      const logEntries=[...(intel.__changelog||[])].filter(e=>e.showId===sid||e.showId===null).reverse().slice(0,50);
      if(!logEntries.length)return null;
      const entryColor=a=>a==="done"||a==="added"?"var(--success-fg)":a==="ignored"||a==="removed"?"var(--danger-fg)":"var(--text-dim)";
      return(
        <IntelSection title="ACTIVITY LOG" count={logEntries.length} defaultOpen={false}>
          <div style={{display:"flex",flexDirection:"column",gap:1}}>
            {logEntries.map((e,i)=><div key={`${e.ts}-${e.action}-${e.section}-${i}`} style={{display:"grid",gridTemplateColumns:"90px 60px 70px 1fr",gap:6,padding:"3px 0",borderBottom:"1px solid var(--card-3)",fontSize:9,alignItems:"start"}}>
              <span style={{fontFamily:MN,color:"var(--text-mute)",fontSize:8}}>{fmtAudit(e.ts)}</span>
              <span style={{color:"var(--text-dim)",fontSize:8}}>{e.from}</span>
              <span style={{color:entryColor(e.action),fontWeight:700,fontSize:8}}>{e.action}</span>
              <span style={{color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.section}: {e.label}</span>
            </div>)}
          </div>
        </IntelSection>
      );
    })()}
  </div>;
}

function NotesPanel(){
  const{sel,eventKey,advances,uAdv,notesPriv,uNotesPriv,pushUndo}=useContext(Ctx);
  const[tabN,setTabN]=useState("public");const[txt,setTxt]=useState("");
  const shared=advances[eventKey]?.sharedNotes||[];const priv=notesPriv[eventKey]||[];
  const list=tabN==="public"?shared:priv;
  const add=()=>{if(!txt.trim())return;const n={id:`n${Date.now()}`,text:txt.trim(),ts:Date.now()};
    if(tabN==="public")uAdv(eventKey,{sharedNotes:[...shared,n]});else uNotesPriv(eventKey,[...priv,n]);
    setTxt("");};
  const del=id=>{if(tabN==="public"){const prev=shared;uAdv(eventKey,{sharedNotes:shared.filter(n=>n.id!==id)});pushUndo("Note deleted.",()=>uAdv(eventKey,{sharedNotes:prev}));}else{const prev=priv;uNotesPriv(eventKey,priv.filter(n=>n.id!==id));pushUndo("Note deleted.",()=>uNotesPriv(eventKey,prev));}};
  return <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px"}}>
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
      <span style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.06em"}}>NOTES</span>
      <div style={{display:"flex",gap:2,marginLeft:"auto",background:"var(--card-3)",borderRadius:6,padding:2}}>
        {["public","private"].map(m=><button key={m} onClick={()=>setTabN(m)} style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:"none",cursor:"pointer",background:tabN===m?"var(--card)":"transparent",color:tabN===m?"var(--text)":"var(--text-dim)",fontWeight:700,textTransform:"uppercase"}}>{m}</button>)}
      </div>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:6}}>
      {list.length===0&&<div style={{fontSize:10,color:"var(--text-mute)",fontStyle:"italic"}}>No {tabN} notes yet.</div>}
      {list.map(n=><div key={n.id} style={{display:"flex",gap:6,padding:"5px 7px",background:"var(--card-3)",borderRadius:6}}>
        <span style={{fontSize:10,color:"var(--text)",flex:1,whiteSpace:"pre-wrap"}}>{n.text}</span>
        <span style={{fontSize:8,color:"var(--text-mute)",fontFamily:MN}}>{new Date(n.ts).toLocaleDateString()}</span>
        <button onClick={()=>del(n.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:11}}>×</button>
      </div>)}
    </div>
    <div style={{display:"flex",gap:5}}>
      <input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder={`Add ${tabN} note…`}
        style={{flex:1,background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 7px",outline:"none"}}/>
      <button onClick={add} style={{background:tabN==="public"?"var(--accent)":"var(--text-3)",border:"none",borderRadius:6,color:"#fff",fontSize:10,padding:"4px 12px",cursor:"pointer",fontWeight:700}}>Add</button>
    </div>
  </div>;
}

function ThemeToggle(){
  const[theme,setTheme]=useState(()=>{try{return localStorage.getItem("dos-theme")||"dark";}catch{return "dark";}});
  const toggle=()=>{const next=theme==="dark"?"light":"dark";setTheme(next);try{localStorage.setItem("dos-theme",next);}catch{}document.documentElement.setAttribute("data-theme",next);};
  return <Button variant="secondary" size="sm" onClick={toggle} title={`Switch to ${theme==="dark"?"light":"dark"} theme`} style={{minWidth:28}}>{theme==="dark"?"☼":"☾"}</Button>;
}

function SignOut(){
  const a=useAuth();const user=a?.user;if(!user)return null;
  const initial=(user.email||"?").trim()[0].toUpperCase();
  return <button title={user.email} onClick={()=>supabase.auth.signOut().catch(e=>console.warn("[signout]",e?.message||e))} style={{width:22,height:22,borderRadius:"50%",background:"var(--accent)",color:"#fff",fontSize:10,fontWeight:700,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>{initial}</button>;
}

// ── NAV SIDEBAR ──────────────────────────────────────────────────────────────

function NavSidebar(){
  const{sidebarOpen,tab,sel,setSel,sorted,tourDaysSorted,shows,uShow,advances,finance,aC,setTab,next,tourDays,showOffDays,setShowOffDays}=useContext(Ctx);
  const[newDate,setNewDate]=useState("");
  const[newType,setNewType]=useState("off");
  const[newVenue,setNewVenue]=useState("");
  const[newCity,setNewCity]=useState("");
  const today=new Date().toISOString().slice(0,10);

  // Merge tour days + non-tour shows, filter off/travel per toggle
  const rows=useMemo(()=>{
    const tourIds=new Set((tourDaysSorted||[]).map(d=>d.date));
    const extras=(sorted||[]).filter(s=>s.clientId===aC&&!tourIds.has(s.date)).map(s=>({date:s.date,type:s.type||"show",show:s,city:s.city,venue:s.venue,synthetic:false}));
    const all=[...(tourDaysSorted||[]),...extras].sort((a,b)=>a.date.localeCompare(b.date));
    if(!showOffDays)return all.filter(d=>d.type!=="off"&&d.type!=="travel");
    return all;
  },[tourDaysSorted,sorted,showOffDays,aC]);

  const pendingCount=d=>{const adv=advances[d]||{};const items=adv.items||{};const custom=adv.customItems||[];return[...AT,...custom].filter(t=>(items[t.id]?.status||"pending")==="pending").length;};

  const flags=useMemo(()=>{const f=[];sorted.forEach(s=>{if(s.notes?.includes("⚠ Immigration")&&dU(s.date)<45)f.push({type:"CRITICAL",msg:`FR immigration — ${s.city}`,date:s.date});if(s.notes?.includes("⚠ Insurance"))f.push({type:"CRITICAL",msg:"Tour insurance — $0",date:s.date});});return f.slice(0,3);},[sorted]);

  const add=()=>{
    if(!newDate||shows[newDate])return;
    const isShow=newType==="show";
    uShow(newDate,{date:newDate,clientId:aC,type:newType,city:newType==="travel"?"Travel":isShow?(newCity||""):"Off Day",venue:newType==="travel"?"Travel Day":isShow?(newVenue||""):"Off Day",country:"",region:"",promoter:"",advance:[],doors:isShow?toM(19):0,curfew:isShow?toM(23):0,busArrive:isShow?toM(9):0,crewCall:isShow?toM(10):0,venueAccess:isShow?toM(9):0,mgTime:isShow?toM(16,30):0,notes:""});
    setSel(newDate);setNewDate("");setNewVenue("");setNewCity("");
  };

  const listRef=useRef(null);
  const selRef=useRef(null);

  const typeColor=t=>t==="travel"?{bg:"var(--info-bg)",c:"var(--link)"}:t==="off"?{bg:"var(--card-2)",c:"var(--text-mute)"}:t==="split"?{bg:"var(--warn-bg)",c:"var(--warn-fg)"}:{bg:"var(--success-bg)",c:"var(--success-fg)"};

  if(!sidebarOpen)return null;

  return(
    <div style={{width:200,flexShrink:0,background:"var(--bg)",borderRight:"1px solid var(--card-2)",display:"flex",flexDirection:"column",height:"100%",minHeight:0,overflow:"hidden"}}>
      {/* Mini stats */}
      {next&&(
        <div style={{padding:"10px 12px 8px",borderBottom:"1px solid var(--border)"}}>
          <div style={{fontSize:9,fontWeight:700,color:"var(--text-mute)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Next Show</div>
          <div style={{fontSize:11,fontWeight:800,color:"var(--text)",lineHeight:1.2}}>{next.city}</div>
          <div style={{fontSize:9,color:"var(--text-dim)",marginTop:1}}>{fD(next.date)} · <span style={{color:"var(--accent)",fontWeight:700,fontFamily:MN}}>{dU(next.date)}d</span></div>
        </div>
      )}
      {/* Flags */}
      {flags.length>0&&(
        <div style={{padding:"6px 10px",borderBottom:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:3}}>
          {flags.map((f,i)=>(
            <div key={i} onClick={()=>{if(f.date)setSel(f.date);}} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 6px",background:"var(--danger-bg)",borderRadius:6,cursor:f.date?"pointer":"default",borderLeft:"2px solid var(--danger-fg)"}}>
              <span style={{fontSize:8,fontWeight:800,color:"var(--danger-fg)",fontFamily:MN,flexShrink:0}}>!</span>
              <span style={{fontSize:9,color:"var(--danger-fg)",fontWeight:600,lineHeight:1.2}}>{f.msg}</span>
            </div>
          ))}
        </div>
      )}
      {/* Off/travel toggle */}
      <div style={{padding:"7px 12px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:9,fontWeight:600,color:"var(--text-dim)"}}>Off / travel days</span>
        <button onClick={()=>setShowOffDays(v=>!v)} style={{position:"relative",width:28,height:16,borderRadius:99,border:"none",cursor:"pointer",background:showOffDays?"var(--accent)":"var(--card-2)",padding:0,transition:"background 0.2s ease",flexShrink:0,boxShadow:"inset 0 1px 3px rgba(0,0,0,0.4)"}}>
          <span style={{position:"absolute",top:2,left:showOffDays?14:2,width:12,height:12,borderRadius:99,background:showOffDays?"#fff":"var(--text-dim)",transition:"left 0.2s ease,background 0.2s ease",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}}/>
        </button>
      </div>
      {/* Date list */}
      <div ref={listRef} style={{flex:1,overflowY:"auto",padding:"4px 0"}}>
        {rows.map(d=>{
          const isSel=d.date===sel;
          const tc=typeColor(d.type);
          const isOff=d.type==="off"||d.type==="travel";
          const pc=d.type==="show"?pendingCount(d.date):0;
          const days=dU(d.date);
          const urgColor=days<=7?"var(--danger-fg)":days<=14?"var(--warn-fg)":days<=21?"var(--link)":"var(--text-mute)";
          const dateStr=new Date(d.date+"T12:00:00");
          const mo=dateStr.toLocaleString("en-US",{month:"short"});
          const dt=dateStr.getDate();
          const wd=dateStr.toLocaleString("en-US",{weekday:"short"});
          return(
            <div key={d.date} ref={isSel?selRef:null} onClick={()=>{setSel(d.date);if(tab==="dash")setTab("ros");}} className="rh" style={{display:"flex",alignItems:"center",gap:0,padding:"6px 10px 6px 0",cursor:"pointer",background:isSel?"rgba(91,33,182,0.16)":"transparent",borderLeft:isSel?"3px solid var(--accent-soft)":"3px solid transparent",opacity:isOff?0.65:1,boxShadow:isSel?"inset 0 0 0 1px rgba(124,58,237,0.18)":undefined}}>
              <div style={{width:46,flexShrink:0,textAlign:"center"}}>
                <div style={{fontSize:8,fontWeight:700,color:isSel?"var(--link)":"var(--text-mute)",fontFamily:MN,letterSpacing:"0.04em"}}>{wd.toUpperCase()}</div>
                <div style={{fontSize:13,fontWeight:800,color:isSel?"var(--accent-pill-border)":"var(--text)",lineHeight:1}}>{dt}</div>
                <div style={{fontSize:8,color:isSel?"var(--accent)":"var(--text-mute)"}}>{mo}</div>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:1}}>
                  <span style={{fontSize:10,fontWeight:600,color:isSel?"var(--accent-pill-border)":"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.city||d.venue||"—"}</span>
                  {!isOff&&<span style={{fontSize:8,padding:"1px 4px",borderRadius:99,fontWeight:700,...tc,flexShrink:0}}>{d.type==="show"?"▶":"⇢"}</span>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                  {pc>0&&<span style={{fontSize:8,fontFamily:MN,color:"var(--warn-fg)",fontWeight:700}}>{pc} open</span>}
                  {d.type==="show"&&days>=0&&<span style={{fontSize:8,fontFamily:MN,color:urgColor,fontWeight:700}}>{days}d</span>}
                  {d.type==="show"&&(()=>{const fStages=finance[d.date]?.stages||{};const settled=["wire_ref_confirmed","signed_sheet","payment_initiated"].every(k=>fStages[k]);const wired=fStages["payment_initiated"];return <span style={{width:6,height:6,borderRadius:99,background:settled?"var(--success-fg)":wired?"var(--warn-fg)":"var(--card-3)",flexShrink:0,display:"inline-block"}} title={settled?"Settled":wired?"Wire initiated":"Settlement pending"}/>;})()}
                  {isOff&&<span style={{fontSize:8,color:"var(--text-mute)",fontStyle:"italic"}}>{d.type}</span>}
                  {d.type==="split"&&d.split?.parties?.map(p=>(
                    <span key={p.id} style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:p.bg,color:p.color,fontWeight:700,fontFamily:MN,whiteSpace:"nowrap"}}>{p.label}</span>
                  ))}
                </div>
                {d.type==="show"&&(()=>{const total=AT.length;const confirmed=total-pc;const pct=total>0?(confirmed/total)*100:100;const busEff=BUS_DATA_MAP[d.date]?.arr;return(<>
                  <div style={{width:"100%",height:2,background:"var(--card-2)",borderRadius:99,marginTop:2}}>
                    <div style={{width:`${pct}%`,height:"100%",background:pct===100?"var(--success-fg)":pct>60?"var(--warn-fg)":"var(--danger-fg)",borderRadius:99,transition:"width 0.3s ease"}}/>
                  </div>
                  {busEff&&busEff!=="—"&&<span style={{fontSize:7,fontFamily:MN,color:"var(--text-faint)",marginTop:1,display:"block"}}>BUS {busEff}</span>}
                </>);})()}
              </div>
            </div>
          );
        })}
      </div>
      {/* Add date */}
      <div style={{padding:"8px 10px",borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:5}}>
        <div style={{display:"flex",gap:4}}>
          <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} style={{...UI.input,flex:1,fontFamily:MN,padding:"4px 5px",fontSize:10,minWidth:0}}/>
          <select value={newType} onChange={e=>setNewType(e.target.value)} style={{...UI.input,padding:"4px 5px",fontSize:10,width:64}}>
            <option value="show">Show</option>
            <option value="off">Off</option>
            <option value="travel">Travel</option>
          </select>
        </div>
        {newType==="show"&&<>
          <input value={newVenue} onChange={e=>setNewVenue(e.target.value)} placeholder="Venue" style={{...UI.input,fontSize:10,padding:"4px 5px"}}/>
          <input value={newCity} onChange={e=>setNewCity(e.target.value)} placeholder="City" style={{...UI.input,fontSize:10,padding:"4px 5px"}}/>
        </>}
        <button onClick={add} disabled={!newDate||!!shows[newDate]} style={{...UI.expandBtn(false,"var(--success-fg)"),fontSize:9,padding:"4px 0",width:"100%",opacity:(!newDate||shows[newDate])?0.4:1}}>+ Add Date</button>
      </div>
    </div>
  );
}

function TopBar({ss}){
  const{tab,setTab,role,setRole,setCmd,next,aC,setAC,setExp,sel,setSel,shows,sorted,tourDaysSorted,orderedTabs,reorderTabs,setUploadOpen,sidebarOpen,setSidebarOpen,showOffDays,mobile,tourStart,tourEnd,setTourStart,setTourEnd,advances,finance,intel,cShows,currentSplit,activeSplitParty,perms,me}=useContext(Ctx);
  const[dragId,setDragId]=useState(null);
  const[overId,setOverId]=useState(null);
  const hasEvent=!!shows[sel]||(currentSplit&&activeSplitParty?.type==="show");
  const isAdmin=me?.id==="davon";
  const canAccessTab=(id)=>{if(id==="access")return isAdmin;const rule=perms?.[`tab.${id}`];if(!rule)return true;return rule[me?.role]??true;};
  useEffect(()=>{if(!hasEvent&&(tab==="advance"||tab==="production"))setTab("ros");},[hasEvent,tab,setTab]);
  const _auth=useAuth();const _email=_auth?.user?.email||"";
  const visibleRoles=ROLES.filter(r=>r.id!=="tm_td"||TM_EMAILS.has(_email));
  const curClient=CM[aC];
  const activeClients=CLIENTS.filter(c=>c.status==="active"&&me.clients.includes(c.id));
  React.useEffect(()=>{if(!activeClients.find(c=>c.id===aC))setAC(me.clients[0]||"bbn");},[me.clients.join(",")]);
  const stepBtn={background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-2)",fontSize:11,padding:mobile?"5px 8px":"3px 7px",cursor:"pointer",fontWeight:700,minHeight:mobile?30:undefined,lineHeight:1};
  const stepList=useMemo(()=>{
    const tourIds=new Set((tourDaysSorted||[]).map(d=>d.date));
    const extras=(sorted||[]).filter(s=>s.clientId===aC&&!tourIds.has(s.date)).map(s=>({date:s.date,type:s.type||"show"}));
    const all=[...(tourDaysSorted||[]).map(d=>({date:d.date,type:d.type})),...extras].sort((a,b)=>a.date.localeCompare(b.date));
    return showOffDays?all:all.filter(d=>d.type!=="off"&&d.type!=="travel");
  },[tourDaysSorted,sorted,showOffDays,aC]);
  const curIdx=stepList.findIndex(d=>d.date===sel);
  const stepDate=dir=>{if(curIdx<0)return;const ni=curIdx+dir;if(ni<0||ni>=stepList.length)return;setSel(stepList[ni].date);};
  const canPrev=curIdx>0;const canNext=curIdx>=0&&curIdx<stepList.length-1;
  const today=new Date().toISOString().slice(0,10);
  const tabBadge=useMemo(()=>{
    const upcoming=(cShows||[]).filter(s=>s.date>=today);
    const pcFn=d=>{const adv=advances[d]||{};const items=adv.items||{};const custom=adv.customItems||[];return[...AT,...custom].filter(t=>(items[t.id]?.status||"pending")==="pending").length;};
    const advBadge=upcoming.filter(s=>pcFn(s.date)>0).length;
    const finBadge=(cShows||[]).filter(s=>{if(s.date>=today)return false;const st=finance[s.date]?.stages||{};return!["wire_ref_confirmed","signed_sheet","payment_initiated"].every(k=>st[k]);}).length;
    const intelBadge=(cShows||[]).flatMap(s=>{const sid=showIdFor(s);return[...(intel[sid]?.todos||[]).filter(t=>!t.done&&!t.ignored),...(intel[sid]?.followUps||[]).filter(f=>!f.done&&!f.ignored)];}).length;
    return{advance:advBadge,finance:finBadge,dash:intelBadge};
  },[cShows,advances,finance,intel,today]);
  return(
    <div style={{borderBottom:"1px solid var(--card-2)",background:"var(--bg)",width:"100%",maxWidth:"100%",overflow:"visible",boxShadow:"0 1px 0 rgba(109,40,217,0.15),0 2px 12px rgba(0,0,0,0.45)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 20px 5px",minWidth:0,gap:8,width:"100%"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flexShrink:1,overflow:"hidden"}}>
          <span style={{fontSize:16,fontWeight:800,color:"var(--text)",letterSpacing:"-0.03em",flexShrink:0}}>DOS</span>
          <span style={{fontSize:8,color:"var(--text-mute)",fontWeight:600}}>v7.0</span>
          <button onClick={()=>{
            if(!sidebarOpen){
              const today=new Date().toISOString().slice(0,10);
              const allDates=[...new Set([...(sorted||[]).map(s=>s.date),...(tourDaysSorted||[]).map(d=>d.date)])].sort();
              const target=allDates.find(d=>d>=today);
              if(target)setSel(target);
            }
            setSidebarOpen(v=>!v);
          }} title="Jump to today" style={{fontSize:11,padding:"3px 7px",borderRadius:6,border:"1px solid var(--border)",background:sidebarOpen?"var(--accent)":"var(--card-3)",color:sidebarOpen?"var(--card)":"var(--text-2)",cursor:"pointer",flexShrink:0}}>☰</button>
          <div style={{display:"flex",alignItems:"center",gap:0,flexShrink:0}}>
            <button onClick={()=>stepDate(-1)} disabled={!canPrev} title="Previous date" style={{fontSize:11,padding:"2px 7px",borderRadius:"5px 0 0 5px",border:"1px solid var(--border)",borderRight:"none",background:canPrev?"var(--card-3)":"var(--card-4)",color:canPrev?"var(--text)":"var(--text-mute)",cursor:canPrev?"pointer":"default"}}>‹</button>
            <button onClick={()=>stepDate(1)} disabled={!canNext} title="Next date" style={{fontSize:11,padding:"2px 7px",borderRadius:"0 5px 5px 0",border:"1px solid var(--border)",background:canNext?"var(--card-3)":"var(--card-4)",color:canNext?"var(--text)":"var(--text-mute)",cursor:canNext?"pointer":"default"}}>›</button>
          </div>
          {next&&<span style={{fontSize:10,fontFamily:MN,color:"var(--accent)",fontWeight:600}}>{next.city} {fD(next.date)} · {dU(next.date)}d</span>}
        </div>
        {!mobile&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,flexShrink:0}}>
          <span style={{fontSize:8,color:"var(--text-mute)",fontFamily:MN,fontWeight:700,letterSpacing:"0.08em"}}>DJ</span>
          <div style={{display:"flex",gap:1,background:"var(--border)",borderRadius:6,padding:2}}>
            {visibleRoles.map(r=><button key={r.id} onClick={()=>setRole(r.id)} style={{fontSize:9,fontWeight:role===r.id?700:500,padding:"3px 8px",borderRadius:6,border:"none",cursor:"pointer",background:role===r.id?"var(--card)":"transparent",color:role===r.id?r.c:"var(--text-dim)",boxShadow:role===r.id?"0 1px 3px rgba(0,0,0,.1)":"none"}}>{r.label}</button>)}
          </div>
        </div>}
        <div style={{display:"flex",alignItems:"center",gap:mobile?4:8,flexShrink:0,minWidth:0,maxWidth:"100%"}}>
          {ss&&!mobile&&<span style={{fontSize:9,color:ss==="saved"?"var(--success-fg)":"var(--text-mute)",fontFamily:MN,fontWeight:600}}>{ss==="saving"?"saving...":"saved ✓"}</span>}
          <Button variant="secondary" size="sm" onClick={()=>setUploadOpen(true)} title="Upload document" style={mobile?{fontSize:11,padding:"5px 9px",minHeight:30}:{fontSize:9}}>{mobile?"↑":"↑ Upload"}</Button>
          <Button variant="secondary" size="sm" onClick={()=>setExp(true)} title="Export / Import" style={mobile?{fontSize:11,padding:"5px 9px",minHeight:30}:{fontSize:9}}>⇅</Button>
          <Button variant="secondary" size="sm" onClick={()=>setCmd(true)} title="Command palette (⌘K)" style={mobile?{fontSize:11,padding:"5px 9px",minHeight:30}:{fontSize:9}}>{mobile?"⌘":"⌘K"}</Button>
          <ThemeToggle/>
          <SignOut/>
        </div>
      </div>
      <div style={{padding:mobile?"3px 12px 5px":"3px 20px 5px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <select value={aC} onChange={e=>setAC(e.target.value)} style={{fontSize:mobile?11:10,padding:mobile?"5px 12px":"3px 9px",borderRadius:99,border:`1.5px solid ${curClient?.color||"var(--border)"}`,background:curClient?`${curClient.color}14`:"var(--card)",color:curClient?.color||"var(--text-2)",fontFamily:"'Outfit',system-ui",fontWeight:700,cursor:"pointer",minHeight:mobile?30:undefined}}>
          {activeClients.map(c=><option key={c.id} value={c.id} style={{color:"var(--text)",fontWeight:500}}>● {c.name} · {c.type==="festival"?"FEST":"ARTIST"}</option>)}
        </select>
        {!mobile&&<div style={{display:"flex",alignItems:"center",gap:4,marginLeft:8}}>
          <span style={{fontSize:8,color:"var(--text-mute)",fontFamily:MN,fontWeight:700,letterSpacing:"0.06em",flexShrink:0}}>TOUR</span>
          <input type="date" value={tourStart} onChange={e=>setTourStart(e.target.value)} style={{fontSize:9,padding:"2px 5px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-3)",color:"var(--text-2)",fontFamily:MN,cursor:"pointer"}}/>
          <span style={{fontSize:9,color:"var(--text-mute)"}}>–</span>
          <input type="date" value={tourEnd} onChange={e=>setTourEnd(e.target.value)} style={{fontSize:9,padding:"2px 5px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-3)",color:"var(--text-2)",fontFamily:MN,cursor:"pointer"}}/>
        </div>}
        {mobile&&<div style={{display:"flex",gap:1,background:"var(--border)",borderRadius:6,padding:2,marginLeft:"auto"}}>
          {visibleRoles.map(r=><button key={r.id} onClick={()=>setRole(r.id)} style={{fontSize:10,fontWeight:role===r.id?700:500,padding:"4px 8px",borderRadius:6,border:"none",cursor:"pointer",background:role===r.id?"var(--card)":"transparent",color:role===r.id?r.c:"var(--text-dim)",boxShadow:role===r.id?"0 1px 3px rgba(0,0,0,.1)":"none"}}>{r.label}</button>)}
        </div>}
        {mobile&&ss&&<span style={{fontSize:9,color:ss==="saved"?"var(--success-fg)":"var(--text-mute)",fontFamily:MN,fontWeight:600}}>{ss==="saving"?"saving...":"saved ✓"}</span>}
      </div>
      <div style={{display:"flex",padding:mobile?"0 12px":"0 20px",width:"100%",overflowX:"auto",overflowY:"hidden",scrollbarWidth:"thin",WebkitOverflowScrolling:"touch"}}>
        {(orderedTabs||TABS).filter(t=>(hasEvent||t.id!=="advance"&&t.id!=="production")&&canAccessTab(t.id)).map(t=>{
          const isDrag=dragId===t.id;
          const isOver=overId===t.id&&dragId&&dragId!==t.id;
          return(
            <button
              key={t.id}
              draggable={!t.disabled&&!mobile}
              onDragStart={e=>{if(t.disabled||mobile)return;setDragId(t.id);e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("text/plain",t.id);}catch{}}}
              onDragOver={e=>{if(!dragId||t.disabled)return;e.preventDefault();e.dataTransfer.dropEffect="move";setOverId(t.id);}}
              onDragLeave={()=>{if(overId===t.id)setOverId(null);}}
              onDrop={e=>{e.preventDefault();if(dragId&&dragId!==t.id&&reorderTabs)reorderTabs(dragId,t.id);setDragId(null);setOverId(null);}}
              onDragEnd={()=>{setDragId(null);setOverId(null);}}
              onClick={()=>!t.disabled&&setTab(t.id)}
              style={{padding:mobile?"9px 13px":"6px 12px",fontSize:mobile?12:11,fontWeight:tab===t.id?700:500,color:t.disabled?"var(--text-mute)":tab===t.id?"var(--text)":"var(--text-dim)",background:isOver?"var(--accent-pill-bg)":"none",border:"none",cursor:t.disabled?"default":mobile?"pointer":isDrag?"grabbing":"grab",borderBottom:tab===t.id?"2px solid var(--accent)":isOver?"2px solid var(--accent)":"2px solid transparent",display:"flex",alignItems:"center",gap:5,flexShrink:0,whiteSpace:"nowrap",opacity:isDrag?0.4:1,transition:"opacity .1s,background .1s",userSelect:"none",minHeight:mobile?40:undefined}}
            >
              <span style={{fontSize:mobile?12:10}}>{t.icon}</span>{t.label}{t.soon&&<span style={{fontSize:8,color:"var(--text-mute)"}}>soon</span>}{tabBadge[t.id]>0&&<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:14,height:14,borderRadius:99,background:t.id==="finance"?"var(--danger-fg)":t.id==="advance"?"var(--warn-fg)":"var(--link)",color:"#fff",fontSize:7,fontWeight:800,fontFamily:MN,padding:"0 3px",marginLeft:2,lineHeight:1}}>{tabBadge[t.id]}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DateDrawer({onClose}){
  const{sorted,tourDaysSorted,sel,setSel,uShow,aC,shows,tourDays}=useContext(Ctx);
  const[newDate,setNewDate]=useState("");
  const[newType,setNewType]=useState("off");
  const[newVenue,setNewVenue]=useState("");
  const[newCity,setNewCity]=useState("");
  const[filter,setFilter]=useState("all");
  const[editingDay,setEditingDay]=useState(null);
  const[editVal,setEditVal]=useState("");
  const saveEdit=(date)=>{if(editVal.trim())uShow(date,{city:editVal.trim()});setEditingDay(null);};
  const startEdit=(e,d)=>{e.stopPropagation();setEditingDay(d.date);setEditVal(d.city||"");};
  const add=()=>{
    if(!newDate||shows[newDate])return;
    const isShow=newType==="show";
    uShow(newDate,{date:newDate,clientId:aC,type:newType,city:newType==="travel"?"Travel":isShow?(newCity||""):"Off Day",venue:newType==="travel"?"Travel Day":isShow?(newVenue||""):"Off Day",country:"",region:"",promoter:"",advance:[],doors:isShow?toM(19):0,curfew:isShow?toM(23):0,busArrive:isShow?toM(9):0,crewCall:isShow?toM(10):0,venueAccess:isShow?toM(9):0,mgTime:isShow?toM(16,30):0,notes:""});
    setSel(newDate);setNewDate("");setNewVenue("");setNewCity("");onClose();
  };
  const drawerLabel=useMemo(()=>{
    if(!sel)return"DATES";
    const td=tourDays?.[sel];const sh=shows?.[sel];
    if(sh&&(sh.type==="travel"||sh.type==="off")){const r=td?.bus?.route;return r?r:sh.city||sh.type.toUpperCase();}
    if(sh)return sh.city||sh.venue||fD(sel);
    if(td){if(td.type==="travel"&&td.bus?.route)return td.bus.route;if(td.type==="split")return"Split Day";if(td.type==="off")return"Off";}
    return fD(sel);
  },[sel,tourDays,shows]);
  const typeStyle=t=>t==="travel"?{bg:"var(--info-bg)",c:"var(--link)",l:"Travel"}:t==="off"?{bg:"var(--bg)",c:"var(--text-mute)",l:"Off"}:t==="split"?{bg:"var(--warn-bg)",c:"var(--warn-fg)",l:"Split"}:t==="show"?{bg:"var(--success-bg)",c:"var(--success-fg)",l:"Show"}:null;
  // Merge tour days with non-tour shows (post-EU shows, festivals). Use tourDays for Apr16-May31, fall back to sorted for everything else.
  const rows=useMemo(()=>{
    const tourIds=new Set((tourDaysSorted||[]).map(d=>d.date));
    const extras=(sorted||[]).filter(s=>s.clientId===aC&&!tourIds.has(s.date)).map(s=>({date:s.date,type:s.type||"show",show:s,city:s.city,venue:s.venue}));
    const all=[...(tourDaysSorted||[]),...extras].sort((a,b)=>a.date.localeCompare(b.date));
    if(filter==="all")return all;
    return all.filter(d=>d.type===filter);
  },[tourDaysSorted,sorted,filter,aC]);
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.3)",zIndex:80,display:"flex",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:320,maxWidth:"90vw",height:"100%",background:"var(--card)",boxShadow:"-4px 0 16px rgba(0,0,0,0.12)",display:"flex",flexDirection:"column",fontFamily:"'Outfit',system-ui"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:11,fontWeight:800,letterSpacing:"0.06em",color:"var(--text)"}}>{drawerLabel}</span>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",fontSize:20,color:"var(--text-dim)"}}>×</button>
        </div>
        <div style={{padding:"10px 16px",borderBottom:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} style={{...UI.input,fontFamily:MN,padding:"5px 8px",flex:1}}/>
            <select value={newType} onChange={e=>setNewType(e.target.value)} style={{...UI.input,padding:"5px 8px"}}>
              <option value="show">Show</option>
              <option value="off">Off Day</option>
              <option value="travel">Travel Day</option>
            </select>
          </div>
          {newType==="show"&&<div style={{display:"flex",gap:6}}>
            <input value={newVenue} onChange={e=>setNewVenue(e.target.value)} placeholder="Venue" style={{...UI.input,padding:"5px 8px",flex:1}}/>
            <input value={newCity} onChange={e=>setNewCity(e.target.value)} placeholder="City" style={{...UI.input,padding:"5px 8px",flex:1}}/>
          </div>}
          <button onClick={add} disabled={!newDate||!!shows[newDate]} style={{...UI.expandBtn(false,"var(--success-fg)"),opacity:(!newDate||shows[newDate])?0.4:1}}>+ Add</button>
        </div>
        <div style={{padding:"6px 12px",borderBottom:"1px solid var(--border)",display:"flex",gap:4,flexWrap:"wrap"}}>
          {[["all","All"],["show","Show"],["travel","Travel"],["off","Off"],["split","Split"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)} style={{padding:"2px 8px",fontSize:9,fontWeight:700,borderRadius:10,border:`1px solid ${filter===v?"var(--accent)":"var(--border)"}`,background:filter===v?"var(--accent-pill-bg)":"var(--card)",color:filter===v?"var(--accent)":"var(--text-dim)",cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        <div style={{flex:1,overflow:"auto",padding:"6px 8px"}}>
          {rows.map(d=>{const isSel=d.date===sel;const ts=typeStyle(d.type);const isDim=d.type==="off";return(
            <div key={d.date} onClick={()=>{if(editingDay===d.date)return;setSel(d.date);onClose();}} className="rh" style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:6,cursor:"pointer",background:isSel?"var(--accent-pill-bg)":"transparent",borderLeft:isSel?"3px solid var(--accent)":"3px solid transparent",opacity:isDim?0.65:1,position:"relative"}}>
              <div style={{fontFamily:MN,fontSize:10,fontWeight:700,color:isSel?"var(--accent)":"var(--text-2)",width:48,flexShrink:0}}>{fD(d.date)}</div>
              <div style={{flex:1,minWidth:0}}>
                {editingDay===d.date
                  ?<input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={()=>saveEdit(d.date)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();saveEdit(d.date);}if(e.key==="Escape"){setEditingDay(null);}}} onClick={e=>e.stopPropagation()} style={{...UI.input,fontSize:11,fontWeight:600,padding:"1px 4px",width:"100%",boxSizing:"border-box"}}/>
                  :<div style={{fontSize:11,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.city||"—"}</div>}
                <div style={{fontSize:9,color:"var(--text-dim)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.venue}{d.bus?.note?` · ${d.bus.note}`:""}</div>
              </div>
              {ts?<span style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:ts.bg,color:ts.c,fontWeight:700,flexShrink:0}}>{ts.l}</span>:null}
              <button onClick={e=>startEdit(e,d)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"var(--text-mute)",padding:"2px 3px",lineHeight:1,flexShrink:0,opacity:0.6}} title="Rename">✎</button>
            </div>);})}
        </div>
      </div>
    </div>
  );
}

function Dash(){
  const{sorted,cShows,next,setTab,setSel,advances,finance,aC,mobile,intel,setIntel,addLog,labelIntel}=useContext(Ctx);
  const client=CM[aC];const today=new Date().toISOString().slice(0,10);
  const upcoming=cShows.filter(s=>s.date>=today).slice(0,10);
  const PORD={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};
  const BORD={urgent:0,input:1,standing_by:2,fresh:3,active:4};
  const priC=p=>p==="CRITICAL"?"var(--danger-fg)":p==="HIGH"?"var(--warn-fg)":p==="MEDIUM"?"var(--link)":"var(--text-mute)";
  const priB=p=>p==="CRITICAL"?"var(--danger-bg)":p==="HIGH"?"var(--warn-bg)":p==="MEDIUM"?"var(--info-bg)":"var(--card-2)";
  const bucketC=b=>b==="urgent"?"var(--danger-fg)":b==="input"?"var(--warn-fg)":b==="standing_by"?"var(--link)":b==="fresh"?"var(--success-fg)":"var(--text-mute)";
  const bucketB=b=>b==="urgent"?"var(--danger-bg)":b==="input"?"var(--warn-bg)":b==="standing_by"?"var(--info-bg)":b==="fresh"?"var(--success-bg)":"var(--card-2)";
  const pendingCount=d=>{const adv=advances[d]||{};const items=adv.items||{};const custom=adv.customItems||[];return [...AT,...custom].filter(t=>(items[t.id]?.status||"pending")==="pending").length;};
  const isFullySettled=d=>{const st=finance?.[d]?.stages||{};return["wire_ref_confirmed","signed_sheet","payment_initiated"].every(k=>st[k]);};
  const flags=useMemo(()=>{const f=[];sorted.forEach(s=>{if(s.notes?.includes("⚠ Immigration")&&dU(s.date)<45)f.push({type:"CRITICAL",msg:`Immigration outstanding — ${s.city} ${fD(s.date)}`,cId:s.clientId,days:dU(s.date)});if(s.notes?.includes("settlement slow")&&dU(s.date)<90)f.push({type:"HIGH",msg:`Settlement risk — ${s.venue}`,cId:s.clientId,days:dU(s.date)});const days=dU(s.date);const pc=pendingCount(s.date);const total=AT.length;if(s.date>=today&&days<=7&&pc>total*0.5)f.push({type:"HIGH",msg:`${pc} advance items open — ${s.city} in ${days}d`,cId:s.clientId,days,date:s.date});const busEntry=BUS_DATA_MAP[s.date];if(busEntry&&days>=0&&days<=2&&!s.busArriveConfirmed)f.push({type:"HIGH",msg:`Bus arrival unconfirmed — ${s.city}`,cId:s.clientId,days,date:s.date});});return f;},[sorted,advances,today]);
  const showMap=useMemo(()=>{const m={};cShows.forEach(s=>m[showIdFor(s)]=s);return m;},[cShows]);
  const arShowLabel=item=>{const s=showMap[item.showId];return s?`${s.city} ${fD(s.date)}`:"";}
  const arHidden=useMemo(()=>new Set([...(intel.__arState?.done||[]),...(intel.__arState?.ignored||[])]),[intel.__arState]);
  const allTodos=useMemo(()=>cShows.flatMap(s=>{const sid=showIdFor(s);return(intel[sid]?.todos||[]).filter(t=>!t.done&&!t.ignored).map(t=>({...t,show:s}));}).sort((a,b)=>{const d=(PORD[a.priority]??4)-(PORD[b.priority]??4);return d!==0?d:a.show.date.localeCompare(b.show.date);}),[cShows,intel]);
  const allFollowUps=useMemo(()=>cShows.flatMap(s=>{const sid=showIdFor(s);return(intel[sid]?.followUps||[]).filter(f=>!f.done&&!f.ignored).map(f=>({...f,show:s}));}).sort((a,b)=>(PORD[a.priority]??4)-(PORD[b.priority]??4)),[cShows,intel]);
  const arItems=useMemo(()=>(labelIntel?.actionRequired||[]).filter(i=>!arHidden.has(i.id)).sort((a,b)=>{const d=(BORD[a.bucket]??5)-(BORD[b.bucket]??5);return d!==0?d:new Date(b.date)-new Date(a.date);}),[labelIntel,arHidden]);
  const urgentItems=useMemo(()=>arItems.filter(i=>i.bucket==="urgent"||i.category==="LEGAL"),[arItems]);
  const logisticsItems=useMemo(()=>(labelIntel?.advanceItems||[]).filter(i=>!arHidden.has(i.id)&&(i.category==="LOGISTICS"||i.category==="ADVANCE")).slice(0,20),[labelIntel,arHidden]);

  const markTodo=(t,state)=>{const sid=showIdFor(t.show);setIntel(p=>({...p,[sid]:{...(p[sid]||{}),todos:(p[sid]?.todos||[]).map(x=>x.id===t.id?{...x,[state]:true}:x)}}));addLog({type:"user",section:"todo",showId:sid,action:state,label:t.text||t.subject,from:"dashboard"});addActLog({module:"intel",action:`intel.todo.${state}`,target:{type:"todo",id:t.id,label:t.text||t.subject},payload:{priority:t.priority,showId:sid},context:{date:t.show?.date||null,showId:sid,eventKey:sid}});};
  const markFollowUp=(f,state)=>{const sid=showIdFor(f.show);setIntel(p=>{const fu=p[sid]?.followUps||[];const idx=fu.findIndex(x=>x.action===f.action&&(x.tid===f.tid||x.owner===f.owner||x.priority===f.priority));if(idx<0)return p;return{...p,[sid]:{...(p[sid]||{}),followUps:fu.map((x,j)=>j===idx?{...x,[state]:true}:x)}};});addLog({type:"user",section:"followup",showId:sid,action:state,label:f.action,from:"dashboard"});addActLog({module:"intel",action:`intel.followup.${state}`,target:{type:"followup",id:f.tid||null,label:f.action},payload:{priority:f.priority,owner:f.owner||null,showId:sid},context:{date:f.show?.date||null,showId:sid,eventKey:sid}});};
  const markAr=(id,state,label)=>{setIntel(p=>{const prev=p.__arState||{};const next=state==="undone"?{...prev,done:(prev.done||[]).filter(x=>x!==id)}:{...prev,[state]:[...new Set([...(prev[state]||[]),id])]};return{...p,__arState:next};});addLog({type:"user",section:"ar",showId:null,action:state,label:label||id,from:"dashboard"});addActLog({module:"intel",action:`intel.ar.${state}`,target:{type:"ar_item",id,label:label||id},payload:{},context:{date:null,showId:null,eventKey:null}});};

  const BTN_DONE={fontSize:8,padding:"2px 6px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",background:"var(--success-bg)",color:"var(--success-fg)"};
  const BTN_IGN={fontSize:8,padding:"2px 6px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",background:"var(--card-2)",color:"var(--text-mute)"};

  return(
    <div className="fi" style={{padding:mobile?"10px 10px 24px":"14px 20px 30px",maxWidth:960,flex:1,overflowY:"auto",minHeight:0}}>
      {flags.slice(0,4).map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",background:f.type==="CRITICAL"?"var(--danger-bg)":"var(--warn-bg)",borderRadius:10,marginBottom:4,borderLeft:`3px solid ${f.type==="CRITICAL"?"var(--danger-fg)":"var(--warn-fg)"}`}}><span style={{fontSize:9,fontWeight:800,color:f.type==="CRITICAL"?"var(--danger-fg)":"var(--warn-fg)",fontFamily:MN}}>{f.type}</span><span style={{fontSize:11,color:"var(--text)",fontWeight:600,flex:1}}>{f.msg}</span>{CM[f.cId]&&<span style={{fontSize:8,color:"var(--text-dim)",fontFamily:MN,flexShrink:0}}>{CM[f.cId].short}</span>}{f.days!=null&&<span style={{fontSize:10,fontFamily:MN,fontWeight:800,color:f.type==="CRITICAL"?"var(--danger-fg)":"var(--warn-fg)",flexShrink:0}}>{f.days}d</span>}</div>)}
      {(()=>{const unsettledCount=(cShows||[]).filter(s=>s.date<today&&!isFullySettled(s.date)).length;const nextBus=next?BUS_DATA_MAP[next.date]?.dep:null;return(
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,margin:"10px 0 12px"}}>
        {[{l:"Next Show",v:next?.city||"--",s:next?nextBus?`${dU(next.date)}d · BUS ${nextBus}`:`${dU(next.date)}d`:"",c:client.color},{l:`${client.name} Shows`,v:cShows.length,s:"total",c:"var(--text)"},{l:"Open Advances",v:upcoming.filter(s=>pendingCount(s.date)>0).length,s:"shows w/ pending",c:upcoming.filter(s=>pendingCount(s.date)>0).length>0?"var(--warn-fg)":"var(--text-mute)"},{l:"Open To-Dos",v:allTodos.length,s:"private",c:allTodos.length>0?"var(--warn-fg)":"var(--text-mute)"},{l:"Follow-Ups",v:allFollowUps.length,s:"across shows",c:allFollowUps.length>0?"var(--link)":"var(--text-mute)"},{l:"Unsettled",v:unsettledCount,s:"past shows",c:unsettledCount>2?"var(--danger-fg)":unsettledCount>0?"var(--warn-fg)":"var(--text-mute)"}].map((s,i)=><div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}><div style={{fontSize:9,color:"var(--text-dim)",marginBottom:2,fontWeight:600}}>{s.l}</div><div style={{fontSize:20,fontWeight:800,color:s.c,fontFamily:MN}}>{s.v}</div><div style={{fontSize:9,color:"var(--text-mute)",fontFamily:MN,marginTop:1}}>{s.s}</div></div>)}
      </div>);})()}
      {(()=>{const pastShows=(cShows||[]).filter(s=>s.date<today).slice(-6);if(!pastShows.length)return null;return(
      <div style={{marginBottom:12}}>
        <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.1em",marginBottom:5}}>SETTLEMENT PIPELINE</div>
        <div style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none",padding:"2px 0"}}>
          {pastShows.map(s=>{const daysSince=Math.abs(dU(s.date));const settled=isFullySettled(s.date);const wired=(finance?.[s.date]?.stages||{})["payment_initiated"];const overdue=!settled&&daysSince>21;const warn=!settled&&daysSince>7&&!wired;return(
            <div key={s.date} onClick={()=>{setSel(s.date);setTab("finance");}} className="rh" title={settled?"Settled":overdue?"Overdue":"Pending"} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:99,border:"1px solid var(--border)",background:settled?"var(--success-bg)":overdue?"var(--danger-bg)":warn?"var(--warn-bg)":"var(--card)",cursor:"pointer",flexShrink:0}}>
              <div style={{width:6,height:6,borderRadius:99,background:settled?"var(--success-fg)":overdue?"var(--danger-fg)":warn?"var(--warn-fg)":"var(--card-3)",flexShrink:0}}/>
              <span style={{fontSize:8,fontWeight:700,color:settled?"var(--success-fg)":overdue?"var(--danger-fg)":warn?"var(--warn-fg)":"var(--text-2)",whiteSpace:"nowrap",fontFamily:MN}}>{s.city} · {fD(s.date)}</span>
              {overdue&&<span style={{fontSize:7,color:"var(--danger-fg)",fontFamily:MN,fontWeight:800}}>{daysSince}d</span>}
            </div>
          );})}
        </div>
      </div>);})()}
      {urgentItems.length>0&&<div style={{marginBottom:10,display:"flex",flexDirection:"column",gap:3}}>
        {urgentItems.slice(0,4).map(i=><div key={i.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 12px",background:"var(--danger-bg)",borderRadius:10,borderLeft:"3px solid var(--danger-fg)"}}>
          <span style={{fontSize:9,fontWeight:800,color:"var(--danger-fg)",fontFamily:MN,flexShrink:0,marginTop:1}}>{i.category}</span>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{i.subject||"(no subject)"}</div><div style={{fontSize:9,color:"var(--text-dim)"}}>{i.from}{arShowLabel(i)?` · ${arShowLabel(i)}`:""}</div></div>
          <span style={{fontSize:8,padding:"2px 6px",borderRadius:8,background:bucketB(i.bucket),color:bucketC(i.bucket),fontWeight:700,flexShrink:0}}>{i.bucket}</span>
          <a href={gmailUrl(i.id)} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--danger-bg)",color:"var(--danger-fg)",fontWeight:700,textDecoration:"none",whiteSpace:"nowrap",flexShrink:0,border:"1px solid var(--danger-fg)"}}>email →</a>
        </div>)}
      </div>}
      {(()=>{
        const todayShows=upcoming.filter(s=>s.date===today);
        const soonShows=upcoming.filter(s=>dU(s.date)<=14&&s.date!==today);
        const laterShows=upcoming.filter(s=>dU(s.date)>14).slice(0,5);
        const renderShowRow=(show,compact=false)=>{const days=dU(show.date),uc=days<=7?"var(--danger-fg)":days<=14?"var(--warn-fg)":days<=21?"var(--link)":"var(--text-mute)";const pc=pendingCount(show.date);
          const depts=DEPTS.filter(d=>d.id!=="all");
          const healthBars=!compact&&<div style={{display:"flex",gap:2,alignItems:"flex-end"}}>
            {depts.map(dept=>{const di=AT.filter(t=>t.dept===dept.id);const conf=di.filter(t=>(advances[show.date]?.items?.[t.id]?.status||"pending")==="confirmed").length;const pct=di.length>0?conf/di.length:1;return(<div key={dept.id} title={`${dept.label}: ${conf}/${di.length}`} style={{width:4,height:20,borderRadius:2,background:"var(--card-2)",overflow:"hidden",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
              <div style={{height:`${pct*100}%`,background:pct===1?"var(--success-fg)":pct>0.5?"var(--warn-fg)":"var(--danger-fg)"}}/>
            </div>);})}</div>;
          return(<div key={show.date} onClick={()=>{setSel(show.date);setTab("ros");}} className="br rh" style={{display:"grid",gridTemplateColumns:"34px 58px 1fr auto auto 30px",alignItems:"center",gap:6,padding:"9px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,cursor:"pointer",borderLeft:`3px solid ${uc}`}}>
            <div style={{fontFamily:MN,fontSize:9,color:"var(--text-dim)"}}>{fW(show.date)}</div>
            <div style={{fontFamily:MN,fontSize:10,color:"var(--accent)",fontWeight:700}}>{fD(show.date)}</div>
            <div><div style={{fontSize:11,fontWeight:700}}>{show.city}</div><div style={{fontSize:9,color:"var(--text-dim)"}}>{show.venue}</div></div>
            <div style={{display:"flex",gap:3,alignItems:"center"}}>{pc>0&&<span style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--warn-bg)",color:"var(--warn-fg)",fontWeight:700,fontFamily:MN}}>{pc} open</span>}{show.notes?.includes("⚠")&&<span>⚠</span>}{healthBars}</div>
            <div style={{fontFamily:MN,fontSize:9,fontWeight:600,color:show.doorsConfirmed?"var(--success-fg)":"var(--warn-fg)",textAlign:"right"}}>{fmt(show.doors)}{show.doorsConfirmed?" ✓":" ?"}</div>
            <div style={{fontFamily:MN,fontSize:11,fontWeight:800,color:uc,textAlign:"right"}}>{days}d</div>
          </div>);};
        return(<div style={{marginBottom:12}}>
          {todayShows.length>0&&<div style={{marginBottom:8}}>
            <div style={{fontSize:9,fontWeight:800,color:"var(--danger-fg)",letterSpacing:"0.1em",marginBottom:5}}>TODAY</div>
            {todayShows.map(show=>{const pc=pendingCount(show.date);return(<div key={show.date} style={{background:"var(--danger-bg)",border:"2px solid var(--danger-fg)",borderRadius:10,padding:"12px 14px",marginBottom:4}}>
              <div style={{fontSize:16,fontWeight:800,color:"var(--text)"}}>{show.city}</div>
              <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:8}}>{show.venue} · {show.promoter}</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
                <span style={{fontSize:10,fontFamily:MN,color:"var(--warn-fg)",fontWeight:700}}>DOORS {fmt(show.doors)}</span>
                <span style={{fontSize:10,fontFamily:MN,color:"var(--danger-fg)",fontWeight:700}}>CURFEW {fmt(show.curfew)}</span>
                {pc>0&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:"var(--warn-bg)",color:"var(--warn-fg)",fontWeight:700}}>{pc} advance open</span>}
              </div>
              <div style={{display:"flex",gap:5}}>
                <button onClick={e=>{e.stopPropagation();setSel(show.date);setTab("ros");}} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--danger-fg)",background:"transparent",color:"var(--danger-fg)",cursor:"pointer",fontWeight:700}}>→ ROS</button>
                <button onClick={e=>{e.stopPropagation();setSel(show.date);setTab("advance");}} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--warn-fg)",background:"transparent",color:"var(--warn-fg)",cursor:"pointer",fontWeight:700}}>→ Advance</button>
                <button onClick={e=>{e.stopPropagation();setSel(show.date);setTab("finance");}} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-2)",cursor:"pointer",fontWeight:700}}>→ Finance</button>
              </div>
            </div>);})}
          </div>}
          {soonShows.length>0&&<>
            <div style={{fontSize:9,fontWeight:800,color:"var(--warn-fg)",letterSpacing:"0.1em",marginBottom:5}}>NEXT 14 DAYS</div>
            <div style={{display:"flex",flexDirection:"column",gap:3,marginBottom:8}}>{soonShows.map(show=>renderShowRow(show))}</div>
          </>}
          {laterShows.length>0&&<>
            <div style={{fontSize:9,fontWeight:800,color:client.color,letterSpacing:"0.1em",marginBottom:5}}>{client.name.toUpperCase()} — UPCOMING</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>{laterShows.map(show=>renderShowRow(show,true))}</div>
          </>}
          {!todayShows.length&&!soonShows.length&&!laterShows.length&&<div style={{fontSize:11,color:"var(--text-mute)",textAlign:"center",padding:"20px 0"}}>No upcoming shows.</div>}
        </div>);
      })()}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {allTodos.length>0&&<div>
          <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.1em",marginBottom:5}}>TO-DOs (PRIVATE) ({allTodos.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {allTodos.map(t=>{
              const sid=showIdFor(t.show);
              const threads=intel[sid]?.threads||[];
              let matchedTid=t.threadTid||null,matchConf=t.threadTid?"high":null;
              if(!matchedTid&&threads.length){let best=null,bestScore=0;threads.forEach(th=>{const s=matchScore(t.text||"",th);if(s>bestScore){bestScore=s;best=th;}});const c=confOf(bestScore);if(c&&best){matchedTid=best.tid;matchConf=c;}}
              const confC=matchConf==="high"?"var(--success-fg)":matchConf==="medium"?"var(--warn-fg)":"var(--link)";
              const confBg=matchConf==="high"?"var(--success-bg)":matchConf==="medium"?"var(--warn-bg)":"var(--info-bg)";
              return(<div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:8,padding:"2px 6px",borderRadius:6,background:priB(t.priority),color:priC(t.priority),fontWeight:700,flexShrink:0,marginTop:1}}>{t.priority||"LOW"}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:"var(--text)",lineHeight:1.4}}>{t.text}</div>{(t.owner||t.deadline)&&<div style={{fontSize:9,color:"var(--text-dim)"}}>{t.owner}{t.deadline?` · due ${t.deadline}`:""}</div>}</div>
              <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                {matchedTid&&<a href={gmailUrl(matchedTid)} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:confBg,color:confC,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>email · {matchConf} →</a>}
                <button onClick={()=>markTodo(t,"done")} style={BTN_DONE}>Done</button>
                <button onClick={()=>markTodo(t,"ignored")} style={BTN_IGN}>Ignore</button>
              </div>
            </div>);})}
          </div>
        </div>}
        {allFollowUps.length>0&&<div>
          <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.1em",marginBottom:5}}>FOLLOW-UPS ({allFollowUps.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {allFollowUps.map((f,i)=>{
              const sid=showIdFor(f.show);
              const threads=intel[sid]?.threads||[];
              let matchedTid=f.tid||null,matchConf=f.tid?"high":null;
              if(!matchedTid&&threads.length){let best=null,bestScore=0;threads.forEach(th=>{const s=matchScore(f.action||"",th);if(s>bestScore){bestScore=s;best=th;}});const c=confOf(bestScore);if(c&&best){matchedTid=best.tid;matchConf=c;}}
              const confC=matchConf==="high"?"var(--success-fg)":matchConf==="medium"?"var(--warn-fg)":"var(--link)";
              const confBg=matchConf==="high"?"var(--success-bg)":matchConf==="medium"?"var(--warn-bg)":"var(--info-bg)";
              return(<div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:8,padding:"2px 6px",borderRadius:6,background:priB(f.priority),color:priC(f.priority),fontWeight:700,flexShrink:0,marginTop:1}}>{f.priority||"LOW"}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:"var(--text)",lineHeight:1.4}}>{f.action}</div>{(f.owner||f.deadline)&&<div style={{fontSize:9,color:"var(--text-dim)"}}>{f.owner}{f.deadline?` · due ${f.deadline}`:""}</div>}</div>
              <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                {matchedTid&&<a href={gmailUrl(matchedTid)} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:confBg,color:confC,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>email · {matchConf} →</a>}
                <button onClick={()=>markFollowUp(f,"done")} style={BTN_DONE}>Done</button>
                <button onClick={()=>markFollowUp(f,"ignored")} style={BTN_IGN}>Ignore</button>
              </div>
            </div>);})}
          </div>
        </div>}
        {arItems.length>0&&<div>
          <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.1em",marginBottom:5}}>ACTION REQUIRED ({arItems.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {arItems.slice(0,25).map(i=><div key={i.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:8,padding:"2px 6px",borderRadius:6,background:bucketB(i.bucket),color:bucketC(i.bucket),fontWeight:700,flexShrink:0,marginTop:1}}>{i.bucket}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{i.subject||"(no subject)"}</div><div style={{fontSize:9,color:"var(--text-dim)"}}>{i.from}{arShowLabel(i)?` · ${arShowLabel(i)}`:""}</div></div>
              <span style={{fontSize:8,color:"var(--text-mute)",fontFamily:MN,flexShrink:0,paddingTop:2}}>{i.category}</span>
              <a href={gmailUrl(i.id)} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--info-bg)",color:"var(--link)",fontWeight:700,textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>email →</a>
              <button onClick={()=>markAr(i.id,"done",i.subject)} style={BTN_DONE}>Done</button>
              <button onClick={()=>markAr(i.id,"ignored",i.subject)} style={BTN_IGN}>Ignore</button>
            </div>)}
          </div>
        </div>}
        {logisticsItems.length>0&&<div>
          <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.1em",marginBottom:5}}>UPCOMING LOGISTICS ({logisticsItems.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {logisticsItems.map((i,idx)=><div key={idx} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:8,padding:"2px 6px",borderRadius:6,background:"var(--info-bg)",color:"var(--link)",fontWeight:700,flexShrink:0,marginTop:1}}>{i.category}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{i.subject||"(no subject)"}</div><div style={{fontSize:9,color:"var(--text-dim)"}}>{i.from}</div></div>
              <a href={gmailUrl(i.id)} target="_blank" rel="noopener noreferrer" style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--info-bg)",color:"var(--link)",fontWeight:700,textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>email →</a>
              <button onClick={()=>markAr(i.id,"done",i.subject)} style={BTN_DONE}>Done</button>
              <button onClick={()=>markAr(i.id,"ignored",i.subject)} style={BTN_IGN}>Ignore</button>
            </div>)}
          </div>
        </div>}
      </div>
      <button onClick={()=>setTab("advance")} style={{marginTop:12,background:client.color,border:"none",borderRadius:6,color:"#fff",fontSize:11,padding:"8px 16px",cursor:"pointer",fontWeight:700}}>Open Advance Tracker →</button>
    </div>
  );
}

function SplitPartyTabs(){
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
            <div style={{fontSize:9,color:"var(--text-mute)",marginTop:2,fontFamily:MN}}>{p.location} · {p.crew.length} crew</div>
          </button>
        );
      })}
    </div>
  );
}

function ImmigrationPanel(){
  const{immigration,uImmigration,shows,sel,aC,pushUndo}=useContext(Ctx);
  const show=shows[sel];
  const country=show?.country||null;
  // Country-scoped: show all items for selected show's country + items whose showDates include the selected date.
  const items=useMemo(()=>Object.values(immigration||{}).filter(it=>it.clientId===aC&&(it.country===country||(Array.isArray(it.showDates)&&it.showDates.includes(sel)))),[immigration,country,sel,aC]);
  const[adding,setAdding]=useState(false);
  const blank={country:country||"",type:"work_permit",label:"",status:"not_started",dueDate:"",ref:"",note:"",assignedTo:"",showDates:[]};
  const[form,setForm]=useState(blank);
  useEffect(()=>{setForm(f=>({...f,country:country||f.country}));},[country]);

  if(!country&&!items.length)return null;

  const typeOf=t=>IMM_TYPES.find(x=>x.id===t)||IMM_TYPES[IMM_TYPES.length-1];
  const statusOf=s=>IMM_STATUS.find(x=>x.id===s)||IMM_STATUS[0];

  const add=()=>{
    if(!form.label||!form.country)return;
    const id=`imm_${Date.now()}`;
    const row={...form,id,clientId:aC,createdAt:new Date().toISOString()};
    uImmigration(id,row);
    logAudit({entityType:"immigration",entityId:id,action:"create",before:null,after:row,meta:{country:row.country,type:row.type}});
    setForm({...blank,country:country||""});setAdding(false);
  };
  const updateStatus=(id,status)=>{
    const prev=immigration[id];if(!prev)return;
    const next={...prev,status};
    if(status==="submitted"&&!prev.submittedDate)next.submittedDate=new Date().toISOString().slice(0,10);
    if(status==="received"&&!prev.receivedDate)next.receivedDate=new Date().toISOString().slice(0,10);
    if(status==="approved"&&!prev.approvedDate)next.approvedDate=new Date().toISOString().slice(0,10);
    uImmigration(id,next);
    logAudit({entityType:"immigration",entityId:id,action:"status_change",before:{status:prev.status},after:{status},meta:{country:prev.country,type:prev.type}});
  };
  const del=id=>{
    const prev=immigration[id];if(!prev)return;
    uImmigration(id,null);
    pushUndo("Immigration item deleted.",()=>uImmigration(id,prev));
    logAudit({entityType:"immigration",entityId:id,action:"delete",before:prev,after:null});
  };

  return(
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div>
          <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em"}}>IMMIGRATION — {country||"?"}</div>
          <div style={{fontSize:9,color:"var(--text-mute)",marginTop:1}}>Country-scoped. Spans multiple shows.</div>
        </div>
        <button onClick={()=>setAdding(v=>!v)} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:700,background:"var(--accent)",color:"#fff"}}>{adding?"Cancel":"+ Add"}</button>
      </div>
      {adding&&(
        <div style={{background:"var(--card-3)",borderRadius:8,padding:"8px",marginBottom:8}}>
          <div style={{display:"grid",gridTemplateColumns:"60px 110px 1fr 110px 90px",gap:5,marginBottom:5}}>
            <input placeholder="CC" maxLength={3} value={form.country} onChange={e=>setForm(p=>({...p,country:e.target.value.toUpperCase()}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN,textTransform:"uppercase"}}/>
            <select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
              {IMM_TYPES.map(t=><option key={t.id} value={t.id}>{t.l}</option>)}
            </select>
            <input placeholder="Label (e.g. FR Short-Term Work Permit)" value={form.label} onChange={e=>setForm(p=>({...p,label:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
            <input type="date" placeholder="Due" value={form.dueDate} onChange={e=>setForm(p=>({...p,dueDate:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
            <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
              {IMM_STATUS.map(s=><option key={s.id} value={s.id}>{s.l}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:5}}>
            <input placeholder="Ref / tracking #" value={form.ref} onChange={e=>setForm(p=>({...p,ref:e.target.value}))} style={{flex:1,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
            <input placeholder="Assigned to (email)" value={form.assignedTo} onChange={e=>setForm(p=>({...p,assignedTo:e.target.value}))} style={{flex:1,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
            <input placeholder="Note" value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))} style={{flex:2,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
            <button onClick={add} disabled={!form.label||!form.country} style={{background:"var(--success-fg)",border:"none",borderRadius:4,color:"#fff",fontSize:10,padding:"4px 12px",cursor:(form.label&&form.country)?"pointer":"not-allowed",fontWeight:700,opacity:(form.label&&form.country)?1:0.5}}>Add</button>
          </div>
        </div>
      )}
      {items.length===0&&!adding&&<div style={{fontSize:10,color:"var(--text-mute)",padding:"4px 0",fontStyle:"italic"}}>No immigration items for {country}. Add work permits, visas, withholding, or customs docs.</div>}
      {items.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {items.map(it=>{const t=typeOf(it.type);const s=statusOf(it.status);const daysToDue=it.dueDate?Math.ceil((new Date(it.dueDate+"T12:00:00")-new Date())/86400000):null;const overdue=daysToDue!==null&&daysToDue<0&&it.status!=="approved"&&it.status!=="na";return(
            <div key={it.id} style={{display:"grid",gridTemplateColumns:"40px 100px 1fr 90px 100px 80px 28px",gap:6,alignItems:"center",padding:"6px 8px",borderRadius:6,background:overdue?"var(--danger-bg)":"var(--card-3)",border:overdue?"1px solid var(--danger-fg)":"1px solid var(--border)"}}>
              <span style={{fontSize:9,fontFamily:MN,fontWeight:800,color:"var(--text)"}}>{it.country}</span>
              <span style={{fontSize:9,color:"var(--text-dim)",fontWeight:600}}>{t.l}</span>
              <div style={{minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.label}</div>
                {it.note&&<div style={{fontSize:9,color:"var(--text-mute)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.note}</div>}
              </div>
              <div style={{fontSize:9,fontFamily:MN,color:overdue?"var(--danger-fg)":daysToDue!==null&&daysToDue<=14?"var(--warn-fg)":"var(--text-dim)",fontWeight:700}}>
                {it.dueDate?`${it.dueDate}${daysToDue!==null?` (${daysToDue>=0?daysToDue:Math.abs(daysToDue)+"d late"})`:""}`:"—"}
              </div>
              <select value={it.status} onChange={e=>updateStatus(it.id,e.target.value)} style={{background:s.b,color:s.c,border:"none",borderRadius:4,fontSize:9,padding:"3px 5px",outline:"none",fontWeight:700,cursor:"pointer"}}>
                {IMM_STATUS.map(x=><option key={x.id} value={x.id}>{x.l}</option>)}
              </select>
              <span style={{fontSize:9,fontFamily:MN,color:"var(--text-2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.ref||"—"}</span>
              <button onClick={()=>del(it.id)} style={{background:"transparent",border:"none",color:"var(--text-mute)",fontSize:12,cursor:"pointer",padding:"2px 4px"}} title="Delete">×</button>
            </div>
          );})}
        </div>
      )}
    </div>
  );
}

function AdvTab(){
  const{shows,cShows,advances,uAdv,sel,setSel,eventKey,aC,mobile,checkPriv,uCheckPriv,intel,setIntel,addLog,pushUndo,addActLog}=useContext(Ctx);
  const a=useAuth();const meEmail=a?.user?.email||"unknown";
  const[openDone,setOpenDone]=useState({});
  useEffect(()=>setOpenDone({}),[sel]);
  const client=CM[aC];const today=new Date().toISOString().slice(0,10);
  const upcoming=cShows.filter(s=>s.date>=today);
  const[activeDept,setActiveDept]=useState("all");
  const[showEmail,setShowEmail]=useState(false);
  const[emailDept,setEmailDept]=useState("all");
  const[addingDept,setAddingDept]=useState(null);
  const[newQ,setNewQ]=useState("");
  const[newDir,setNewDir]=useState("bilateral");
  const[newScope,setNewScope]=useState("public");
  const[editId,setEditId]=useState(null);
  const[editQ,setEditQ]=useState("");

  const show=shows[sel];
  const adv=advances[eventKey]||{};
  const items=adv.items||{};
  const customItems=adv.customItems||[];
  const overrides=adv.itemOverrides||{};

  const privList=checkPriv[eventKey]||[];
  const allItems=useMemo(()=>[...AT,...customItems,...privList],[customItems,privList]);
  const getQ=item=>overrides[item.id]?.q||item.q;
  const getStatus=id=>{const it=allItems.find(x=>x.id===id);if(it?.private)return it.status||"pending";return items[id]?.status||"pending";};
  const setStatus=(id,status)=>{const it=allItems.find(x=>x.id===id);
    const meta=status==="confirmed"?{confirmedBy:meEmail,confirmedAt:new Date().toISOString()}:{confirmedBy:null,confirmedAt:null};
    const prevStatus=it?.private?(privList.find(p=>p.id===id)?.status||"pending"):(items[id]?.status||"pending");
    if(it?.private)uCheckPriv(eventKey,privList.map(p=>p.id===id?{...p,status,...meta}:p));
    else uAdv(eventKey,{items:{...items,[id]:{...items[id],status,...meta}}});
    if(prevStatus!==status){
      logAudit({entityType:"advance",entityId:`${eventKey}:${id}`,action:"status_change",
        before:{status:prevStatus},after:{status},
        meta:{private:!!it?.private,question:it?.q||null},
        teamScoped:!it?.private});
      addLog({type:"user",section:"advance",showId:sid||eventKey,action:"status",label:`${it?.q||id}: ${prevStatus}→${status}`,from:"advance_tab"});
    }};
  const setOverride=(id,q)=>uAdv(eventKey,{itemOverrides:{...overrides,[id]:{...overrides[id],q}}});
  const deleteCustom=id=>{const it=allItems.find(x=>x.id===id);if(!it)return;
    if(it.private){const prev=privList;uCheckPriv(eventKey,privList.filter(c=>c.id!==id));pushUndo(`Deleted "${(it.q||"").slice(0,40)}"`,()=>uCheckPriv(eventKey,prev));}
    else{const prev=customItems;uAdv(eventKey,{customItems:customItems.filter(c=>c.id!==id)});pushUndo(`Deleted "${(it.q||"").slice(0,40)}"`,()=>uAdv(eventKey,{customItems:prev}));}};
  const addCustom=dept=>{if(!newQ.trim())return;const it={id:`c${Date.now()}`,dept,dir:newDir,q:newQ.trim(),custom:true};if(newScope==="private"){uCheckPriv(eventKey,[...privList,{...it,private:true,status:"pending"}]);}else{uAdv(eventKey,{customItems:[...customItems,it]});}setNewQ("");setNewDir("bilateral");setNewScope("public");setAddingDept(null);};

  const itemDependents=adv.itemDependents||{};
  const getDependents=id=>itemDependents[id]||[];
  const toggleDependent=(id,memberId)=>{
    const cur=itemDependents[id]||[];
    const next=cur.includes(memberId)?cur.filter(x=>x!==memberId):[...cur,memberId];
    uAdv(eventKey,{itemDependents:{...itemDependents,[id]:next}});
  };

  const deptCounts=useMemo(()=>{const r={};DEPTS.filter(d=>d.id!=="all").forEach(d=>{const di=allItems.filter(t=>t.dept===d.id);r[d.id]={total:di.length,pending:di.filter(t=>getStatus(t.id)==="pending").length};});return r;},[allItems,items]);

  const sid=show?showIdFor(show):"";
  const matches=useMemo(()=>{
    const data=intel[sid]||{};const threads=data.threads||[];const dismissed=new Set(data.dismissedMatches||[]);
    const out=[];
    allItems.forEach(item=>{
      if(getStatus(item.id)==="confirmed")return;
      let best=null,bestScore=0;
      threads.forEach(t=>{const s=matchScore(getQ(item),t);if(s>bestScore){bestScore=s;best=t;}});
      const c=confOf(bestScore);
      if(c&&best){const k=`${item.id}__${best.tid}`;if(!dismissed.has(k)){
        const sug=suggestStatusFromThread(best,getStatus(item.id));
        out.push({itemId:item.id,threadTid:best.tid,subject:best.subject,from:best.from,snippet:best.snippet,confidence:c,key:k,suggested:sug?.status||"confirmed",reason:sug?.reason||null});
      }}
    });
    return out;
  },[allItems,intel,sid,items,privList]);
  const matchFor=(id)=>matches.find(m=>m.itemId===id);

  const applyMatch=(m,targetStatus)=>{
    const prev=getStatus(m.itemId);const st=targetStatus||m.suggested||"confirmed";
    setStatus(m.itemId,st);
    setIntel(p=>({...p,[sid]:{...(p[sid]||{}),dismissedMatches:[...(p[sid]?.dismissedMatches||[]),m.key]}}));
    addActLog({module:"intel",action:"intel.match.accept",target:{type:"thread",id:m.threadTid,label:m.subject},payload:{itemId:m.itemId,confidence:m.confidence,suggestedStatus:m.suggested},context:{date:sel,showId:sid,eventKey:sid}});
    addActLog({module:"intel",action:"intel.status.apply",target:{type:"item",id:m.itemId,label:null},payload:{status:st,source:"suggested"},context:{date:sel,showId:sid,eventKey:sid}});
    logAudit({entityType:"advance",entityId:`${sel}:${m.itemId}`,action:"intel_sync",
      before:{status:prev},after:{status:st},
      meta:{source:"intel-suggest",threadTid:m.threadTid,confidence:m.confidence,reason:m.reason||null,subject:m.subject}});
    pushUndo(`Marked ${SC[st]?.l||st}.`,()=>{setStatus(m.itemId,prev);setIntel(p=>({...p,[sid]:{...(p[sid]||{}),dismissedMatches:(p[sid]?.dismissedMatches||[]).filter(k=>k!==m.key)}}));});
  };
  const confirmMatch=(m)=>applyMatch(m,"confirmed");

  const showDepts=activeDept==="all"?DEPTS.filter(d=>d.id!=="all"):DEPTS.filter(d=>d.id===activeDept);
  const totalPending=allItems.filter(t=>getStatus(t.id)==="pending").length;

  const genEmail=()=>{
    if(!show)return"";
    const tgt=emailDept==="all"?allItems:allItems.filter(t=>t.dept===emailDept);
    const contacts=(show.advance||[]).filter(c=>emailDept==="all"||c.dept===emailDept).map(c=>`${c.name} <${c.email}> (${c.role})`).join(", ")||"[advance contacts]";
    const byDept={};tgt.forEach(t=>{if(!byDept[t.dept])byDept[t.dept]=[];byDept[t.dept].push(t);});
    let b=`To: ${contacts}\nSubject: ${show.venue}, ${show.city} — ${fFull(show.date)} | Advance\n\nHey ${show.advance?.[0]?.name?.split(" ")[0]||"Team"},\n\nAdvancing our appearance at ${show.venue} on ${fFull(show.date)}. Please review the items below and respond directly.\n\n`;
    Object.entries(byDept).forEach(([dept,dItems])=>{
      b+=`── ${DM[dept]?.label?.toUpperCase()||dept.toUpperCase()} ──\n`;
      dItems.forEach((item,i)=>{const dir=item.dir==="we_provide"?"[We provide]":item.dir==="they_provide"?"[Please provide]":"[Bilateral]";b+=`${i+1}. ${dir} ${getQ(item)}\n`;});b+="\n";
    });
    b+=`──\nDavon Johnson\nDay of Show, LLC | d.johnson@dayofshow.net | 337.326.0041\n\nCONFIDENTIALITY DISCLAIMER: This message is confidential and intended only for the person(s) named above.`;
    return b;
  };

  if(!show)return(
    <div style={{padding:40,textAlign:"center",color:"var(--text-dim)"}}>
      <div style={{fontSize:32,marginBottom:12,opacity:0.3}}>◎</div>
      <div style={{fontSize:14,fontWeight:700,color:"var(--text)",marginBottom:6}}>Select a show to start advancing</div>
      <div style={{fontSize:11,color:"var(--text-dim)",marginBottom:16,maxWidth:280,margin:"0 auto 16px"}}>Choose a date from the sidebar or use ← → to navigate shows.</div>
      {upcoming.length>0&&<button onClick={()=>setSel(upcoming[0].date)} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"8px 20px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Jump to next show →</button>}
    </div>
  );

  const SLA_THRESHOLDS={catering:14,production:21,hospitality:10,merch:7,security:7};
  const daysOut=sel?dU(sel):null;
  const slaViolations=daysOut!=null?DEPTS.filter(d=>d.id!=="all"&&SLA_THRESHOLDS[d.id]&&daysOut<=SLA_THRESHOLDS[d.id]&&(deptCounts[d.id]?.pending||0)>0).map(d=>({dept:d,threshold:SLA_THRESHOLDS[d.id],pending:deptCounts[d.id].pending})):[];

  return(
    <div className="fi" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 115px)",position:"relative"}}>
      <div style={{padding:"6px 20px",borderBottom:"1px solid var(--border)",background:"var(--card)",display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,fontSize:11}}>{show.venue}</span>
        <span style={{fontSize:11,color:"var(--text-dim)"}}>{show.city} · {fFull(sel)}</span>
        <span style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:totalPending===0?"var(--success-bg)":"var(--warn-bg)",color:totalPending===0?"var(--success-fg)":"var(--warn-fg)",fontWeight:700}}>{totalPending===0?"Complete":`${totalPending} pending`}</span>
      </div>
      {slaViolations.length>0&&<div style={{padding:"4px 20px",background:"var(--warn-bg)",borderBottom:"1px solid var(--warn-fg)",display:"flex",gap:6,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontSize:8,fontWeight:800,color:"var(--warn-fg)",fontFamily:MN,flexShrink:0}}>SLA</span>
        {slaViolations.map(v=><span key={v.dept.id} style={{fontSize:8,padding:"2px 7px",borderRadius:99,background:v.dept.bg,color:v.dept.color,fontWeight:700}}>{v.dept.label} {v.pending} open · due {v.threshold}d out</span>)}
      </div>}
      {!showEmail&&<div style={{padding:"4px 20px",borderBottom:"1px solid var(--border)",background:"var(--card-3)",display:"flex",gap:2,overflowX:"auto",flexShrink:0,scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
        {DEPTS.map(d=>{const isA=activeDept===d.id;const cnt=d.id==="all"?null:deptCounts[d.id];const pct=cnt&&cnt.total>0?((cnt.total-cnt.pending)/cnt.total)*100:100;
          return(<button key={d.id} onClick={()=>setActiveDept(d.id)} style={{flexShrink:0,padding:"4px 10px 5px",borderRadius:99,border:isA?`1.5px solid ${d.color}`:"1px solid var(--border)",background:isA?d.bg:"transparent",color:isA?d.color:"var(--text-dim)",fontSize:9,fontWeight:isA?700:500,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span>{d.label}</span>
              {cnt&&cnt.pending>0&&<span style={{fontSize:8,background:d.color,color:"#fff",borderRadius:10,padding:"1px 4px",fontWeight:700}}>{cnt.pending}</span>}
            </div>
            {cnt&&cnt.total>0&&<div style={{width:"100%",minWidth:36,height:2,background:"rgba(255,255,255,0.15)",borderRadius:99}}>
              <div style={{width:`${pct}%`,height:"100%",background:cnt.pending===0?"var(--success-fg)":isA?"rgba(255,255,255,0.7)":d.color,borderRadius:99,transition:"width 0.4s ease"}}/>
            </div>}
          </button>);
        })}
      </div>}
      {!showEmail&&activeDept!=="all"&&(deptCounts[activeDept]?.pending||0)>0&&<div style={{padding:"5px 20px",background:"var(--card-2)",borderBottom:"1px solid var(--border)",display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
        <span style={{fontSize:9,color:"var(--text-dim)",fontFamily:MN}}>{deptCounts[activeDept]?.pending} pending in {DM[activeDept]?.label}</span>
        <button onClick={()=>allItems.filter(t=>t.dept===activeDept&&getStatus(t.id)==="pending").forEach(t=>setStatus(t.id,"in_progress"))} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--link)",background:"var(--info-bg)",color:"var(--link)",cursor:"pointer",fontWeight:700}}>Mark all In Progress</button>
        <button onClick={()=>{setEmailDept(activeDept);setShowEmail(true);}} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-2)",cursor:"pointer",fontWeight:700}}>Draft Advance Email</button>
      </div>}
      <div style={{flex:1,overflow:"auto",padding:"10px 20px 30px"}}>
        {showEmail?(
          <div>
            <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:6,fontWeight:600}}>ADVANCE EMAIL — {DM[emailDept]?.label?.toUpperCase()||"ALL DEPTS"}</div>
            <pre style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px",fontSize:9,fontFamily:MN,color:"var(--text)",lineHeight:1.7,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{genEmail()}</pre>
            <button onClick={()=>navigator.clipboard.writeText(genEmail())} style={{marginTop:8,background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",fontSize:10,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>Copy</button>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <IntelPanel/>
            <ImmigrationPanel/>
            {showDepts.map(dept=>{
              const dItems=allItems.filter(t=>t.dept===dept.id);
              if(!dItems.length)return null;
              const dPending=dItems.filter(t=>getStatus(t.id)!=="confirmed");
              const dDone=dItems.filter(t=>getStatus(t.id)==="confirmed");
              const pending=dPending.filter(t=>getStatus(t.id)==="pending").length;
              const renderRow=(item,idx,arr,muted)=>{
                const status=getStatus(item.id);const q=getQ(item);
                const isEditing=editId===item.id;const canEdit=!item.locked;const isCustom=!!item.custom;
                const meta=item.private?item:(items[item.id]||{});
                const emailMatch=(()=>{const m=matchFor(item.id);if(!m)return null;
                  const col=m.confidence==="high"?"var(--success-fg)":m.confidence==="medium"?"var(--warn-fg)":"var(--text-dim)";
                  const bg=m.confidence==="high"?"var(--success-bg)":m.confidence==="medium"?"var(--warn-bg)":"var(--card-2)";
                  const sug=m.suggested||"confirmed";const sugMeta=SC[sug]||SC.confirmed;
                  const tip=m.reason?`${m.subject} — ${m.from}\n→ suggests "${sugMeta.l}" (${m.reason})`:`${m.subject} — ${m.from}`;
                  return <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <a href={gmailUrl(m.threadTid)} target="_blank" rel="noopener noreferrer" title={tip} style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:bg,color:col,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>email · {m.confidence} →</a>
                    <button onClick={()=>applyMatch(m,sug)} title={m.reason?`Auto-suggested: ${m.reason}`:"Apply suggested status"} style={{fontSize:8,padding:"2px 7px",borderRadius:4,border:"none",background:sugMeta.c,color:"#fff",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>{sugMeta.l}</button>
                    <select value="" onChange={e=>{if(e.target.value)applyMatch(m,e.target.value);}} title="Apply different status" style={{fontSize:8,padding:"2px 3px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-3)",color:"var(--text-2)",cursor:"pointer",fontWeight:600}}>
                      <option value="">···</option>
                      {SC_ORDER.filter(s=>s!==sug).map(s=><option key={s} value={s}>{SC[s]?.l||s}</option>)}
                    </select>
                  </div>;
                })();
                return(
                  <div key={item.id} style={{display:"grid",gridTemplateColumns:"18px 1fr auto auto",gap:"0 8px",padding:"8px 14px",borderBottom:idx<arr.length-1?"1px solid var(--card-3)":"none",background:isEditing?"var(--warn-bg)":"transparent",opacity:muted?0.7:1,alignItems:"start"}}>
                    <span style={{fontFamily:MN,fontSize:8,color:"var(--text-mute)",paddingTop:3,textAlign:"right"}}>{idx+1}.</span>
                    <div style={{minWidth:0}}>
                      {isEditing?(
                        <input autoFocus value={editQ} onChange={e=>setEditQ(e.target.value)}
                          onBlur={()=>{setOverride(item.id,editQ);setEditId(null);}}
                          onKeyDown={e=>{if(e.key==="Enter"){setOverride(item.id,editQ);setEditId(null);}if(e.key==="Escape")setEditId(null);}}
                          style={{width:"100%",background:"var(--card)",border:`1.5px solid ${dept.color}`,borderRadius:4,color:"var(--text)",fontSize:10,padding:"3px 7px",outline:"none"}}/>
                      ):(
                        <div style={{display:"flex",alignItems:"flex-start",gap:4}}>
                          <span style={{fontSize:10,color:status==="na"?"var(--text-mute)":"var(--text)",fontWeight:500,lineHeight:1.5,flex:1,textDecoration:status==="na"?"line-through":"none"}}>{q}</span>
                          {canEdit&&!isEditing&&<button onClick={()=>{setEditId(item.id);setEditQ(q);}} style={{flexShrink:0,background:"none",border:"none",cursor:"pointer",color:"var(--text-faint)",fontSize:11,padding:"0 2px",lineHeight:1.5}} title="Edit item">✎</button>}
                          {isCustom&&<button onClick={()=>deleteCustom(item.id)} style={{flexShrink:0,background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13,padding:"0 2px",lineHeight:1.5}} title="Delete">×</button>}
                        </div>
                      )}
                      {status==="confirmed"&&meta.confirmedBy&&<div style={{fontSize:8,color:"var(--text-mute)",marginTop:1,fontFamily:MN}}>✓ {meta.confirmedBy} · {fmtAudit(meta.confirmedAt)}</div>}
                      <div style={{display:"flex",alignItems:"center",gap:3,marginTop:4,flexWrap:"wrap"}}>
                        <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:item.dir==="we_provide"?"var(--accent-pill-bg)":item.dir==="they_provide"?"var(--success-bg)":"var(--card-2)",color:item.dir==="we_provide"?"var(--accent)":item.dir==="they_provide"?"var(--success-fg)":"var(--text-2)",fontWeight:600}}>{item.dir==="we_provide"?"We":"They"}</span>
                        {item.locked&&<span style={{fontSize:8,color:"var(--text-mute)",fontFamily:MN}}>🔒</span>}
                        {isCustom&&<span style={{fontSize:8,color:dept.color,fontWeight:700}}>custom</span>}
                        {item.private&&<span style={{fontSize:8,color:"var(--text-3)",fontWeight:700,background:"var(--border)",padding:"1px 4px",borderRadius:4}}>private</span>}
                        {!item.private&&<span style={{color:"var(--border)",fontSize:8,margin:"0 1px"}}>·</span>}
                        {!item.private&&TEAM_MEMBERS.map(m=>{const active=getDependents(item.id).includes(m.id);return(
                          <button key={m.id} onClick={()=>toggleDependent(item.id,m.id)} title={`${active?"Remove":"Mark"} ${m.label} as dependent`}
                            style={{fontSize:8,padding:"1px 5px",borderRadius:4,fontWeight:700,cursor:"pointer",border:"none",
                              background:active?"var(--warn-bg)":"var(--card-2)",color:active?"var(--warn-fg)":"var(--text-mute)"}}>{m.initials}</button>
                        );})}
                      </div>
                    </div>
                    <div style={{paddingTop:1}}>{emailMatch}</div>
                    <div style={{paddingTop:1,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                      <StatusBtn status={status} setStatus={(ns)=>setStatus(item.id,ns)} mobile={mobile}/>
                      {status!=="confirmed"&&(()=>{const dc=(show.advance||[]).find(c=>c.dept===item.dept);return dc?<a href={`mailto:${dc.email}?subject=${encodeURIComponent(`${show.venue}, ${show.city} — ${fFull(sel)} | ${DM[item.dept]?.label||""} Advance`)}`} title={`Email ${dc.name}`} style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:"var(--info-bg)",color:"var(--link)",fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>✉ {dc.name.split(" ")[0]}</a>:null;})()}
                    </div>
                  </div>
                );
              };
              return(
                <div key={dept.id} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
                  <div style={{padding:"8px 14px",background:dept.bg,display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid var(--border)"}}>
                    <span style={{fontSize:9,fontWeight:800,letterSpacing:"0.07em",color:dept.color}}>{dept.label.toUpperCase()}</span>
                    {pending>0&&<span style={{fontSize:8,color:dept.color,fontFamily:MN,fontWeight:700}}>{pending} pending</span>}
                    <span style={{fontSize:8,color:"var(--text-mute)",marginLeft:"auto"}}>{dPending.length} open · {dDone.length} done</span>
                  </div>
                  <div>
                    {dPending.map((item,idx)=>renderRow(item,idx,dPending,false))}
                    {dDone.length>0&&<div style={{borderTop:"1px solid var(--card-3)"}}>
                      <button onClick={()=>setOpenDone(p=>({...p,[dept.id]:!p[dept.id]}))} style={{width:"100%",textAlign:"left",padding:"6px 14px",background:"var(--card-3)",border:"none",cursor:"pointer",fontSize:9,fontWeight:700,color:"var(--success-fg)",letterSpacing:"0.06em",display:"flex",alignItems:"center",gap:6}}>
                        <span>✓ Confirmed ({dDone.length})</span>
                        <span style={{marginLeft:"auto",color:"var(--text-mute)"}}>{openDone[dept.id]?"▾":"▸"}</span>
                      </button>
                      {openDone[dept.id]&&<div>{dDone.map((item,idx)=>renderRow(item,idx,dDone,true))}</div>}
                    </div>}
                    {addingDept===dept.id?(
                      <div style={{padding:"8px 14px",borderTop:"1px solid var(--card-3)",background:"var(--card-3)"}}>
                        <input autoFocus placeholder="Describe the advance item..." value={newQ} onChange={e=>setNewQ(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addCustom(dept.id);if(e.key==="Escape")setAddingDept(null);}} style={{width:"100%",background:"var(--card)",border:`1.5px solid ${dept.color}`,borderRadius:6,color:"var(--text)",fontSize:10,padding:"5px 8px",outline:"none",marginBottom:5}}/>
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          <select value={newDir} onChange={e=>setNewDir(e.target.value)} style={{fontSize:9,padding:"3px 5px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card)"}}>
                            <option value="we_provide">We provide</option><option value="they_provide">They provide</option><option value="bilateral">Bilateral</option>
                          </select>
                          <select value={newScope} onChange={e=>setNewScope(e.target.value)} style={{fontSize:9,padding:"3px 5px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card)"}}>
                            <option value="public">Public</option><option value="private">Private</option>
                          </select>
                          <button onClick={()=>addCustom(dept.id)} style={{background:dept.color,border:"none",borderRadius:4,color:"#fff",fontSize:9,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>Add</button>
                          <button onClick={()=>{setAddingDept(null);setNewQ("");}} style={{background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:4,color:"var(--text-dim)",fontSize:9,padding:"3px 8px",cursor:"pointer"}}>Cancel</button>
                        </div>
                      </div>
                    ):(
                      <div style={{padding:"5px 14px",borderTop:"1px solid var(--card-3)"}}>
                        <button onClick={()=>setAddingDept(dept.id)} style={{background:"none",border:`1px dashed ${dept.color}50`,borderRadius:6,color:dept.color,fontSize:9,padding:"3px 10px",cursor:"pointer",fontWeight:600,width:"100%",textAlign:"left"}}>+ Add custom {DM[dept.id]?.label} item</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <NotesPanel/>
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:9,fontWeight:700,color:"var(--text-dim)",marginBottom:6,letterSpacing:"0.06em"}}>THREAD & NOTES</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <div><div style={{fontSize:9,color:"var(--text-dim)",marginBottom:2}}>Gmail thread link</div><input defaultValue={adv.threadLink||""} onBlur={e=>uAdv(eventKey,{threadLink:e.target.value})} placeholder="https://mail.google.com/..." style={{width:"100%",background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",fontSize:10,fontFamily:MN,padding:"4px 7px",outline:"none"}}/></div>
                <div><div style={{fontSize:9,color:"var(--text-dim)",marginBottom:2}}>Notes</div><textarea defaultValue={adv.notes||""} onBlur={e=>uAdv(eventKey,{notes:e.target.value})} placeholder="Open issues, follow-ups..." rows={2} style={{width:"100%",background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",fontSize:10,padding:"4px 7px",outline:"none",resize:"vertical",fontFamily:"inherit"}}/></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AnchorTimes({b,setBF}){
  const toggle=(field,on)=>setBF(b.id,field,on?(b[field]??""):null);
  return(
    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
      <label style={{fontSize:9,fontWeight:700,color:"var(--text-dim)",display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
        <input type="checkbox" checked={b.anchorStartAt!=null} onChange={e=>toggle("anchorStartAt",e.target.checked)}/>Start
      </label>
      {b.anchorStartAt!=null&&<input type="text" placeholder="7:00p" defaultValue={typeof b.anchorStartAt==="number"?fmt(b.anchorStartAt):b.anchorStartAt} onBlur={e=>{const m=pM(e.target.value);if(m!=null)setBF(b.id,"anchorStartAt",m);}} style={{...UI.input,fontFamily:MN,width:70}}/>}
      <label style={{fontSize:9,fontWeight:700,color:"var(--text-dim)",display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
        <input type="checkbox" checked={b.anchorEndAt!=null} onChange={e=>toggle("anchorEndAt",e.target.checked)}/>End
      </label>
      {b.anchorEndAt!=null&&<input type="text" placeholder="8:00p" defaultValue={typeof b.anchorEndAt==="number"?fmt(b.anchorEndAt):b.anchorEndAt} onBlur={e=>{const m=pM(e.target.value);if(m!=null)setBF(b.id,"anchorEndAt",m);}} style={{...UI.input,fontFamily:MN,width:70}}/>}
    </div>
  );
}

function FlightDayStrip({sel}){
  const{flights,uFlight,lodging,setTab,tourStart,tourEnd}=useContext(Ctx);
  const[open,setOpen]=useState(true);
  const[scanning,setScanning]=useState(false);
  const[refreshing,setRefreshing]=useState(false);
  const[stripMsg,setStripMsg]=useState("");
  const[liveStatuses,setLiveStatuses]=useState({});

  const deps=Object.values(flights).filter(f=>f.status==="confirmed"&&f.depDate===sel);
  const arrs=Object.values(flights).filter(f=>f.status==="confirmed"&&f.arrDate===sel&&f.arrDate!==f.depDate);
  const dayFlights=[...deps,...arrs];

  const scanFlights=async(e)=>{
    e.stopPropagation();
    const{data:{session}}=await supabase.auth.getSession();
    if(!session)return;
    const googleToken=session.provider_token;
    if(!googleToken){setStripMsg("Gmail unavailable — re-login.");return;}
    setScanning(true);setStripMsg("Scanning…");
    try{
      const resp=await fetch("/api/flights",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken,tourStart,tourEnd})});
      if(resp.status===402){setStripMsg("Gmail expired — re-login.");setScanning(false);return;}
      const data=await resp.json();
      if(data.error){setStripMsg(`Error: ${data.error}`);setScanning(false);return;}
      const allFlights=Object.values(flights);
      const existingKeys=new Set(allFlights.map(f=>`${f.flightNo}__${f.depDate}`));
      const novel=(data.flights||[]).filter(f=>!flights[f.id]&&!existingKeys.has(`${f.flightNo}__${f.depDate}`));
      novel.forEach(f=>uFlight(f.id,{...f,status:"pending"}));
      setStripMsg(novel.length?`+${novel.length} flight${novel.length>1?"s":""} added to Transport`:"No new flights found.");
    }catch(err){setStripMsg(`Scan failed: ${err.message}`);}
    setScanning(false);
    setTimeout(()=>setStripMsg(""),4000);
  };

  const refreshTimes=async(e)=>{
    e.stopPropagation();
    const toRefresh=dayFlights.filter(f=>f.flightNo);
    if(!toRefresh.length){setStripMsg("No flight numbers to refresh.");setTimeout(()=>setStripMsg(""),3000);return;}
    setRefreshing(true);setStripMsg("Refreshing…");
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){setRefreshing(false);return;}
      const resp=await fetch("/api/flight-status",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({flights:toRefresh.map(f=>({flightNo:f.flightNo,depDate:f.depDate,id:f.id}))})});
      if(resp.ok){
        const data=await resp.json();
        const next={};
        toRefresh.forEach(f=>{const s=data.statuses?.[`${f.flightNo}__${f.depDate}`];if(s&&!s.error)next[f.id]=s;});
        setLiveStatuses(p=>({...p,...next}));
        const updated=Object.keys(next).length;
        setStripMsg(updated?`Updated ${updated} flight${updated>1?"s":""}. `:"No status data available.");
      }
    }catch(err){setStripMsg(`Refresh failed: ${err.message}`);}
    setRefreshing(false);
    setTimeout(()=>setStripMsg(""),4000);
  };

  const hasAny=deps.length||arrs.length;
  return(
    <div style={{background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:10,marginBottom:10,overflow:"hidden"}}>
      <div onClick={()=>setOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",userSelect:"none"}}>
        <span style={{fontSize:10,fontWeight:800,color:"var(--link)",letterSpacing:"0.06em"}}>✈ FLIGHTS</span>
        {deps.length>0&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--info-bg)",color:"var(--link)",fontWeight:700}}>{deps.length} DEP</span>}
        {arrs.length>0&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:"var(--success-bg)",color:"var(--success-fg)",fontWeight:700}}>{arrs.length} ARR</span>}
        {stripMsg&&<span style={{fontSize:9,color:"var(--text-dim)",fontFamily:MN,marginLeft:4}}>{stripMsg}</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
          {hasAny>0&&<button onClick={refreshTimes} disabled={refreshing} style={{fontSize:9,padding:"2px 8px",borderRadius:6,border:"1px solid var(--info-fg)",background:refreshing?"var(--info-bg)":"var(--card)",color:"var(--link)",cursor:refreshing?"default":"pointer",fontWeight:700,flexShrink:0}}>{refreshing?"…":"↻ Times"}</button>}
          <button onClick={scanFlights} disabled={scanning} style={{fontSize:9,padding:"2px 8px",borderRadius:6,border:"none",background:scanning?"var(--info-bg)":"var(--link)",color:scanning?"var(--link)":"var(--card)",cursor:scanning?"default":"pointer",fontWeight:700,flexShrink:0}}>{scanning?"Scanning…":"Scan Gmail"}</button>
        </div>
        <span style={{fontSize:10,color:"var(--info-fg)",flexShrink:0}}>{open?"▾":"▸"}</span>
      </div>
      {/* Lodging summary row (always visible) */}
      {(()=>{const checkIns=Object.values(lodging||{}).filter(h=>h.checkIn===sel);const checkOuts=Object.values(lodging||{}).filter(h=>h.checkOut===sel);const staying=Object.values(lodging||{}).filter(h=>h.checkIn<sel&&h.checkOut>sel);const all=[...checkIns,...checkOuts,...staying];if(!all.length)return null;return(
        <div onClick={()=>setTab("lodging")} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",borderTop:"1px solid var(--success-bg)",background:"var(--success-bg)",cursor:"pointer",flexWrap:"wrap"}}>
          <span style={{fontSize:9,fontWeight:800,color:"var(--success-fg)",letterSpacing:"0.06em"}}>⌂ LODGING</span>
          {checkIns.map(h=><span key={h.id} style={{fontSize:9,padding:"1px 6px",borderRadius:10,background:"var(--success-fg)",color:"#fff",fontWeight:700}}>↓ {h.name}{h.checkInTime?` ${h.checkInTime}`:""}</span>)}
          {checkOuts.map(h=><span key={h.id} style={{fontSize:9,padding:"1px 6px",borderRadius:10,background:"var(--text-mute)",color:"#fff",fontWeight:700}}>↑ {h.name}{h.checkOutTime?` ${h.checkOutTime}`:""}</span>)}
          {staying.map(h=><span key={h.id} style={{fontSize:9,padding:"1px 6px",borderRadius:10,background:"var(--success-bg)",color:"var(--success-fg)",fontWeight:600,border:"1px solid var(--success-bg)"}}>● {h.name}</span>)}
        </div>
      );})()}
      {open&&(
        <div style={{borderTop:"1px solid var(--info-bg)",display:"flex",flexDirection:"column",gap:0}}>
          <div style={{display:"flex",flexDirection:"column",gap:6,padding:"8px 10px"}}>
          {tagFlightRoles(deps,arrs).map(({f,role})=>(
            <FlightCard key={f.id} f={f}
              legLabel={role==="dep"?"DEP":"ARR"}
              defaultCollapsed={true}
              liveStatus={liveStatuses[f.id]||null}
              refreshing={false}
              onRefreshStatus={null}
            />
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DayScheduleView({show,bus,split,sel}){
  const{uShow,uRos,gRos,shows,aC,flights,lodging,setTab,activeSplitParty}=useContext(Ctx);
  const isTravel=show.type==="travel";
  const isSplit=show.type==="split";
  const isStored=!!shows?.[sel];
  // Notes
  const[editNotes,setEditNotes]=useState(false);
  const[notesVal,setNotesVal]=useState(show.notes||"");
  // Edit day info
  const[editDay,setEditDay]=useState(false);
  const[dayCity,setDayCity]=useState(show.city||"");
  const[dayVenue,setDayVenue]=useState(show.venue||"");
  const[dayType,setDayType]=useState(show.type||"off");
  // Schedule items
  const[addingItem,setAddingItem]=useState(false);
  const[newItem,setNewItem]=useState({time:"",label:"",notes:""});
  const[editItemId,setEditItemId]=useState(null);
  const allItems=gRos(sel)||[];
  const dayItems=allItems.filter(b=>b.isDayItem&&!b.flightId);

  // Unified timeline: bus + flights + lodging + schedule items sorted by time
  const timeline=useMemo(()=>{
    const items=[];
    // Bus segment
    if(isTravel&&bus){
      const depMin=hhmmToMin(bus.dep);
      const arrMin=hhmmToMin(bus.arr);
      items.push({type:"bus",id:"bus",sortMin:depMin??-1,bus,depMin,arrMin});
    }
    // Lodging: check-in on this date
    Object.values(lodging||{}).filter(h=>h.checkIn===sel).forEach(h=>{
      const t=h.checkInTime||"15:00";
      items.push({type:"lodging_in",id:`lodging_in_${h.id}`,sortMin:hhmmToMin(t)??900,h,t});
    });
    // Lodging: check-out on this date
    Object.values(lodging||{}).filter(h=>h.checkOut===sel).forEach(h=>{
      const t=h.checkOutTime||"12:00";
      items.push({type:"lodging_out",id:`lodging_out_${h.id}`,sortMin:hhmmToMin(t)??720,h,t});
    });
    // Schedule items
    dayItems.forEach(b=>{
      items.push({type:"item",id:b.id,sortMin:b.startMin??-1,b});
    });
    return items.sort((a,b)=>a.sortMin-b.sortMin);
  },[isTravel,bus,lodging,sel,dayItems]);

  const ensureStored=()=>{if(!isStored)uShow(sel,{date:sel,clientId:aC,type:show.type||"off",city:show.city||"",venue:show.venue||"",advance:[],doors:0,curfew:0,busArrive:0,crewCall:0,venueAccess:0,mgTime:0,notes:""});};
  const saveNotes=()=>{ensureStored();uShow(sel,{notes:notesVal});setEditNotes(false);};
  const saveDayInfo=()=>{
    const base=isStored?shows[sel]:{date:sel,advance:[],doors:0,curfew:0,busArrive:0,crewCall:0,venueAccess:0,mgTime:0};
    uShow(sel,{...base,type:dayType,city:dayCity,venue:dayVenue});
    setEditDay(false);
  };
  const convertToShow=()=>{
    const base=isStored?shows[sel]:{date:sel,advance:[],promoter:"",country:"",region:""};
    uShow(sel,{...base,type:"show",city:dayCity||show.city||"",venue:dayVenue||show.venue||""});
    setEditDay(false);
  };
  const addItem=()=>{
    if(!newItem.label.trim())return;
    const tMin=newItem.time?pM(newItem.time):null;
    const nb={id:`item_${Date.now()}`,label:newItem.label.trim(),time:newItem.time,startMin:tMin,notes:newItem.notes,type:"custom",isDayItem:true,color:"var(--accent)",phase:"pre",duration:60,roles:["tm_td","pm","ld","driver"]};
    uRos(sel,[...allItems,nb]);
    setNewItem({time:"",label:"",notes:""});setAddingItem(false);
  };
  const removeItem=id=>uRos(sel,allItems.filter(b=>b.id!==id));
  const updateItem=(id,patch)=>uRos(sel,allItems.map(b=>b.id===id?{...b,...patch,startMin:patch.time!==undefined?pM(patch.time):b.startMin}:b));

  return(
    <div className="fi" style={{padding:"16px 20px",maxWidth:680}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:800,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {isTravel?(bus?.route||show.city||"Travel Day"):isSplit?"Split Day":(show.city||"Rest Day")}
          </div>
          <div style={{fontSize:10,color:"var(--text-dim)",fontFamily:MN}}>{fFull(sel)}</div>
        </div>
        <button onClick={()=>setEditDay(v=>!v)} style={{fontSize:9,padding:"3px 8px",borderRadius:6,border:`1px solid ${editDay?"var(--accent)":"var(--border)"}`,background:editDay?"var(--accent-pill-bg)":"var(--card-3)",color:editDay?"var(--accent)":"var(--text-2)",cursor:"pointer",fontWeight:600,flexShrink:0}}>✏ Edit</button>
        <div style={{fontSize:8,fontWeight:800,padding:"3px 9px",borderRadius:6,background:isTravel?"var(--info-bg)":isSplit?"var(--warn-bg)":"var(--card-2)",color:isTravel?"var(--link)":isSplit?"var(--warn-fg)":"var(--text-dim)",letterSpacing:"0.06em",flexShrink:0}}>
          {isTravel?"TRAVEL":isSplit?"SPLIT":"OFF"}
        </div>
      </div>

      {/* Edit panel */}
      {editDay&&(
        <div style={{background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
          <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:10}}>EDIT DAY</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
            <div>
              <div style={{fontSize:8,color:"var(--text-dim)",fontWeight:600,marginBottom:3}}>CITY / LOCATION</div>
              <input value={dayCity} onChange={e=>setDayCity(e.target.value)} placeholder="e.g. Amsterdam" style={{...UI.input,width:"100%"}}/>
            </div>
            <div>
              <div style={{fontSize:8,color:"var(--text-dim)",fontWeight:600,marginBottom:3}}>VENUE / NOTE</div>
              <input value={dayVenue} onChange={e=>setDayVenue(e.target.value)} placeholder="e.g. Hotel Okura" style={{...UI.input,width:"100%"}}/>
            </div>
          </div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:8,color:"var(--text-dim)",fontWeight:600,marginBottom:3}}>TYPE</div>
            <select value={dayType} onChange={e=>setDayType(e.target.value)} style={{...UI.input}}>
              <option value="off">Off Day</option>
              <option value="travel">Travel Day</option>
            </select>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={saveDayInfo} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",background:"var(--success-fg)",color:"#fff",cursor:"pointer",fontWeight:700}}>Save</button>
            <button onClick={convertToShow} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-3)",color:"var(--text)",cursor:"pointer",fontWeight:600}}>↑ Convert to Show Day</button>
            <button onClick={()=>setEditDay(false)} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      <FlightDayStrip sel={sel}/>
      {/* Split card */}
      {split&&(()=>{
        const focusId=activeSplitParty?.id||split.parties[0]?.id;
        const focus=split.parties.find(p=>p.id===focusId)||split.parties[0];
        const others=split.parties.filter(p=>p.id!==focus?.id);
        return(
          <div style={{background:"var(--warn-bg)",border:"1px solid var(--warn-bg)",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
            <div style={{fontSize:9,fontWeight:800,color:"var(--warn-fg)",letterSpacing:"0.08em",marginBottom:8}}>SPLIT PARTY — {split.parties.length} GROUPS</div>
            {focus&&(
              <div style={{padding:"8px 10px",background:focus.bg,borderRadius:6,border:`1px solid ${focus.color}30`,marginBottom:others.length?6:0}}>
                <div style={{fontSize:10,fontWeight:700,color:focus.color,marginBottom:3}}>{focus.label} <span style={{fontWeight:400,color:"var(--text-dim)"}}>· {focus.location}</span></div>
                <div style={{fontSize:9,color:"var(--text-dim)",marginBottom:6}}>{focus.event}</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {focus.crew.map(cid=>{const c=DEFAULT_CREW.find(x=>x.id===cid);return c?(<span key={cid} style={{fontSize:8,padding:"2px 8px",borderRadius:10,background:"var(--card)",border:`1px solid ${focus.color}40`,color:focus.color,fontWeight:600}}>{c.name.split(" ")[0]} <span style={{fontWeight:400,opacity:0.7,fontSize:8}}>({c.role.split(" (")[0].split("/")[0].trim()})</span></span>):null;})}
                </div>
                {focus.note&&<div style={{fontSize:8,color:"var(--text-dim)",marginTop:5,fontStyle:"italic"}}>{focus.note}</div>}
              </div>
            )}
            {others.length>0&&(
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                {others.map(p=><span key={p.id} style={{fontSize:8,padding:"2px 8px",borderRadius:10,background:"var(--card-2)",color:"var(--text-mute)",fontWeight:600}}>{p.label}</span>)}
              </div>
            )}
          </div>
        );
      })()}

      {/* Unified timeline: bus + flights + schedule items */}
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em"}}>TIMELINE{timeline.length>0?` · ${timeline.length}`:""}</div>
          <button onClick={()=>setAddingItem(true)} style={{fontSize:9,padding:"3px 8px",borderRadius:6,border:"1px solid var(--accent)",background:"var(--accent-pill-bg)",color:"var(--accent)",cursor:"pointer",fontWeight:700}}>+ Add Item</button>
        </div>
        {addingItem&&(
          <div style={{background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px",marginBottom:8}}>
            <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
              <input placeholder="Time (e.g. 2:00p)" value={newItem.time} onChange={e=>setNewItem(p=>({...p,time:e.target.value}))} style={{...UI.input,width:110,fontFamily:MN}}/>
              <input placeholder="Label" value={newItem.label} onChange={e=>setNewItem(p=>({...p,label:e.target.value}))} style={{...UI.input,flex:1,minWidth:140}}/>
            </div>
            <input placeholder="Notes (optional)" value={newItem.notes} onChange={e=>setNewItem(p=>({...p,notes:e.target.value}))} style={{...UI.input,width:"100%",marginBottom:6,boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:6}}>
              <button onClick={addItem} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Add</button>
              <button onClick={()=>{setAddingItem(false);setNewItem({time:"",label:"",notes:""});}} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {timeline.map(entry=>{
            if(entry.type==="bus"){
              const{bus:b,depMin,arrMin}=entry;
              return(
                <div key="bus" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"10px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10}}>
                  <div style={{width:44,flexShrink:0,textAlign:"right"}}>
                    {depMin!=null&&<div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:"var(--link)"}}>{fmt(depMin)}</div>}
                    {arrMin!=null&&<div style={{fontFamily:MN,fontSize:9,color:"var(--text-dim)"}}>{fmt(arrMin)}</div>}
                  </div>
                  <div style={{width:3,alignSelf:"stretch",background:"var(--link)",borderRadius:4,opacity:0.4,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <span style={{fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:4,background:"var(--info-bg)",color:"var(--link)",letterSpacing:"0.04em"}}>BUS</span>
                      <span style={{fontSize:11,fontWeight:700,color:"var(--text)"}}>{b.route}</span>
                      {b.flag==="⚠"&&<span style={{fontSize:9,color:"var(--danger-fg)"}}>⚠</span>}
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {b.km&&<span style={{fontSize:9,color:"var(--text-dim)"}}>{b.km} km</span>}
                      {b.drive&&b.drive!=="—"&&<span style={{fontSize:9,color:"var(--text-dim)"}}>{b.drive} drive</span>}
                      {b.day&&<span style={{fontFamily:MN,fontSize:8,color:"var(--text-mute)"}}>Day {b.day}/30</span>}
                    </div>
                    {b.flag==="⚠"&&b.note&&<div style={{fontSize:9,color:"var(--danger-fg)",marginTop:3,fontWeight:600}}>{b.note}</div>}
                    {b.note&&b.flag!=="⚠"&&<div style={{fontSize:9,color:"var(--text-mute)",marginTop:2,fontStyle:"italic"}}>{b.note}</div>}
                  </div>
                </div>
              );
            }
            if(entry.type==="lodging_in"||entry.type==="lodging_out"){
              const{h,t,type:lt}=entry;const isIn=lt==="lodging_in";
              const rooms=(h.rooms||[]).length;
              return(
                <div key={entry.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"9px 12px",background:"var(--success-bg)",border:"1px solid var(--success-bg)",borderRadius:10,cursor:"pointer"}} onClick={()=>setTab("lodging")}>
                  <div style={{width:44,flexShrink:0,textAlign:"right"}}>
                    <div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:isIn?"var(--success-fg)":"var(--text-dim)"}}>{t}</div>
                  </div>
                  <div style={{width:3,alignSelf:"stretch",background:isIn?"var(--success-fg)":"var(--text-mute)",borderRadius:4,opacity:0.5,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                      <span style={{fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:4,background:isIn?"var(--success-fg)":"var(--text-mute)",color:"#fff",letterSpacing:"0.04em"}}>{isIn?"CHECK IN":"CHECK OUT"}</span>
                      <span style={{fontSize:11,fontWeight:700,color:"var(--text)"}}>{h.name}</span>
                      {h.city&&<span style={{fontSize:9,color:"var(--text-dim)"}}>{h.city}</span>}
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {rooms>0&&<span style={{fontSize:9,color:"var(--text-2)"}}>{rooms} room{rooms!==1?"s":""}</span>}
                      {h.confirmNo&&<span style={{fontFamily:MN,fontSize:8,color:"var(--text-mute)"}}>#{h.confirmNo}</span>}
                    </div>
                  </div>
                </div>
              );
            }
            // type === "item"
            const item=entry.b;const isEditing=editItemId===item.id;
            return(
              <div key={item.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 10px",background:"var(--card)",border:`1px solid ${isEditing?"var(--accent)":"var(--border)"}`,borderRadius:10}}>
                {isEditing?(
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:5}}>
                    <div style={{display:"flex",gap:5}}>
                      <input defaultValue={item.time||""} onChange={e=>updateItem(item.id,{time:e.target.value})} placeholder="Time" style={{...UI.input,width:100,fontFamily:MN}}/>
                      <input defaultValue={item.label} onChange={e=>updateItem(item.id,{label:e.target.value})} placeholder="Label" style={{...UI.input,flex:1}}/>
                    </div>
                    <input defaultValue={item.notes||""} onChange={e=>updateItem(item.id,{notes:e.target.value})} placeholder="Notes" style={{...UI.input,width:"100%",boxSizing:"border-box"}}/>
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>setEditItemId(null)} style={{fontSize:9,padding:"3px 8px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Done</button>
                      <button onClick={()=>{removeItem(item.id);setEditItemId(null);}} style={{fontSize:9,padding:"3px 8px",borderRadius:6,border:"1px solid var(--danger-bg)",background:"var(--danger-bg)",color:"var(--danger-fg)",cursor:"pointer"}}>Delete</button>
                    </div>
                  </div>
                ):(
                  <>
                    <div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:"var(--accent)",width:44,flexShrink:0,paddingTop:1,textAlign:"right"}}>{item.startMin!=null?fmt(item.startMin):item.time||"—"}</div>
                    <div style={{width:3,height:32,background:"var(--accent)",borderRadius:4,flexShrink:0,opacity:0.5,alignSelf:"center"}}/>
                    <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setEditItemId(item.id)}>
                      <div style={{fontSize:11,fontWeight:600,color:"var(--text)"}}>{item.label}</div>
                      {item.notes&&<div style={{fontSize:9,color:"var(--text-dim)",marginTop:2}}>{item.notes}</div>}
                    </div>
                    <button onClick={()=>setEditItemId(item.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-mute)",fontSize:11,padding:"0 2px",flexShrink:0}}>✏</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {timeline.length===0&&!addingItem&&(
          <div style={{padding:"18px 0",textAlign:"center",background:"var(--card-3)",border:"1px dashed var(--border)",borderRadius:10}}>
            <div style={{fontSize:10,color:"var(--text-mute)"}}>No items. Add meals, check-ins, promo events, etc.</div>
          </div>
        )}
      </div>

      {/* Off-day empty state when no items, no bus, no split */}
      {!isTravel&&!split&&timeline.length===0&&!addingItem&&(
        <div style={{padding:"24px 0",textAlign:"center"}}>
          <div style={{fontSize:20,marginBottom:6,opacity:0.25}}>◌</div>
          <div style={{fontSize:11,fontWeight:600,color:"var(--text)",marginBottom:3}}>Rest Day</div>
          <div style={{fontSize:9,color:"var(--text-mute)"}}>Nothing scheduled. Add items above or convert to a show day.</div>
        </div>
      )}

      {/* Notes */}
      <div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em"}}>NOTES</div>
          <button onClick={()=>{if(editNotes)saveNotes();else{setNotesVal(show.notes||"");setEditNotes(true);}}} style={{fontSize:9,padding:"3px 8px",borderRadius:6,border:`1px solid ${editNotes?"var(--accent)":"var(--border)"}`,background:editNotes?"var(--accent-pill-bg)":"var(--card-3)",color:editNotes?"var(--accent)":"var(--text-2)",cursor:"pointer",fontWeight:600}}>
            {editNotes?"Save":"Edit"}
          </button>
        </div>
        {editNotes?(
          <textarea value={notesVal} onChange={e=>setNotesVal(e.target.value)} placeholder="Notes for this day..." rows={3} style={{...UI.input,width:"100%",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit",lineHeight:1.5}}/>
        ):notesVal?(
          <div style={{background:"var(--warn-bg)",border:"1px solid var(--warn-bg)",borderRadius:6,padding:"8px 12px",fontSize:9,color:"var(--warn-fg)",fontWeight:500}}>{notesVal}</div>
        ):(
          <div style={{fontSize:9,color:"var(--text-mute)",fontStyle:"italic"}}>No notes.</div>
        )}
      </div>
    </div>
  );
}

// Router: dispatches to ROSTab for show days, DayScheduleView for off/travel/split days.
// Separating into sibling components keeps React hook order stable when switching day types.
function ScheduleTab(){
  const{shows,sel,tourDays,currentSplit,activeSplitParty}=useContext(Ctx);
  const show=shows[sel];
  const td=tourDays?.[sel];
  const isSynthetic=!show&&td&&(td.type==="off"||td.type==="travel"||td.type==="split");
  // On a split day with a real show: route by active party type.
  // Show party → ROS. Non-show party (advance, travel) → that party's day view.
  if(currentSplit&&show){
    if(!activeSplitParty||activeSplitParty.type==="show")return <ROSTab/>;
    return <DayScheduleView show={{type:activeSplitParty.type||"travel",city:activeSplitParty.location||"",venue:activeSplitParty.event||""}} bus={null} split={currentSplit} sel={sel}/>;
  }
  if(isSynthetic) return <DayScheduleView show={{type:td.type,notes:td.bus?.note}} bus={BUS_DATA_MAP[sel]||td?.bus||null} split={currentSplit||td?.split||null} sel={sel}/>;
  if(!show)return <div style={{padding:40,textAlign:"center",color:"var(--text-dim)",fontSize:11}}>No event scheduled for this date.</div>;
  return <ROSTab/>;
}

function EventSwitcher({show,sel}){
  const{selEventId,setSelEventId,uShow,showCrew}=useContext(Ctx);
  const[adding,setAdding]=useState(false);
  const[newName,setNewName]=useState("");
  const[delId,setDelId]=useState(null);
  const BAR={minHeight:56,borderBottom:"1px solid var(--border)",background:"var(--card)",display:"flex",alignItems:"center"};
  if(!show)return <div style={{...BAR,minHeight:40}}/>;
  const subEvents=show.subEvents||[];
  const DOTS=["#16a34a","#2563eb","#d97706","#9333ea","#dc2626","#0891b2"];
  const crewCount=k=>Object.values(showCrew?.[k]||{}).filter(v=>v&&(v.going||v.status==="going"||v===true)).length;
  const EventTab=({active,onClick,dotColor,name,sub,children})=>(
    <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px",border:"none",borderBottom:active?"2px solid var(--text)":"2px solid transparent",background:"none",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,textAlign:"left",minHeight:56}}>
      <span style={{width:8,height:8,borderRadius:"50%",background:dotColor,flexShrink:0}}/>
      <span style={{display:"flex",flexDirection:"column",gap:1,lineHeight:1.2}}>
        <span style={{fontSize:13,fontWeight:700,color:active?"var(--text)":"var(--text-dim)"}}>{name}</span>
        {sub&&<span style={{fontSize:10,color:"var(--text-mute)",fontFamily:MN,letterSpacing:"0.02em"}}>{sub}</span>}
      </span>
      {children}
    </button>
  );
  const addEvent=()=>{
    const id=`ev_${Date.now()}`;
    const nb={id,name:newName.trim()||`Event ${subEvents.length+2}`,venue:show.venue,city:show.city,promoter:show.promoter||"",doors:show.doors,curfew:show.curfew,busArrive:show.busArrive,crewCall:show.crewCall,venueAccess:show.venueAccess,mgTime:show.mgTime,notes:"",busSkip:show.busSkip,mgSkip:show.mgSkip};
    uShow(sel,{subEvents:[...subEvents,nb]});
    setSelEventId(id);setAdding(false);setNewName("");
  };
  const removeEvent=id=>{
    const next=subEvents.filter(e=>e.id!==id);
    uShow(sel,{subEvents:next});
    if(selEventId===id)setSelEventId(null);
    setDelId(null);
  };
  const mainCrew=crewCount(sel);
  const mainSub=[show.city||show.venue||"Main",mainCrew?`${mainCrew} crew`:null].filter(Boolean).join(" · ");
  return(
    <div style={{...BAR,padding:"0 20px",gap:12,overflowX:"auto",scrollbarWidth:"none"}}>
      <EventTab active={!selEventId} onClick={()=>setSelEventId(null)} dotColor={DOTS[0]} name={show.venue||"Main"} sub={mainSub}/>
      {subEvents.map((ev,i)=>{
        const isA=selEventId===ev.id;
        const c=crewCount(ev.id);
        const sub=[ev.city||ev.venue||show.city||"",c?`${c} crew`:null].filter(Boolean).join(" · ");
        return(
          <div key={ev.id} style={{display:"flex",alignItems:"center",flexShrink:0,gap:2}}>
            <EventTab active={isA} onClick={()=>setSelEventId(ev.id)} dotColor={DOTS[(i+1)%DOTS.length]} name={ev.name} sub={sub}/>
            <button onClick={()=>setDelId(delId===ev.id?null:ev.id)} style={{background:"none",border:"none",color:"var(--text-faint)",fontSize:13,cursor:"pointer",padding:"0 4px",lineHeight:1}}>×</button>
            {delId===ev.id&&<span style={{fontSize:11,display:"flex",alignItems:"center",gap:4}}>
              <button onClick={()=>removeEvent(ev.id)} style={{fontSize:11,padding:"3px 8px",borderRadius:4,border:"none",background:"var(--danger-bg)",color:"var(--danger-fg)",cursor:"pointer",fontWeight:700}}>Delete</button>
              <button onClick={()=>setDelId(null)} style={{fontSize:11,padding:"3px 8px",borderRadius:4,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer"}}>Cancel</button>
            </span>}
          </div>
        );
      })}
      {adding?(
        <div style={{display:"flex",alignItems:"center",gap:5,marginLeft:6,flexShrink:0}}>
          <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addEvent();if(e.key==="Escape"){setAdding(false);setNewName("");}}} placeholder="Event name" style={{...UI.input,width:140,fontSize:12}}/>
          <button onClick={addEvent} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Add</button>
          <button onClick={()=>{setAdding(false);setNewName("");}} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer"}}>✕</button>
        </div>
      ):(
        <button onClick={()=>setAdding(true)} style={{padding:"8px 12px",fontSize:11,fontWeight:700,color:"var(--text-dim)",border:"none",borderBottom:"2px solid transparent",background:"none",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,marginLeft:"auto"}}>+ Event</button>
      )}
    </div>
  );
}

function ROSTab(){
  const{shows,uShow,gRos,uRos,ros,sel,setSel,eventKey,cShows,role,aC,selEventId,setSelEventId,currentSplit}=useContext(Ctx);
  const[editB,setEditB]=useState(null);const[dOver,setDOver]=useState(null);
  const[editShow,setEditShow]=useState(false);
  const[editVenue,setEditVenue]=useState("");const[editCity,setEditCity]=useState("");const[editPromoter,setEditPromoter]=useState("");
  const dId=useRef(null);const client=CM[aC];const show=shows[sel];
  // Sub-event support: use compound ROS key when a sub-event is selected
  const subEvent=selEventId?(show?.subEvents||[]).find(e=>e.id===selEventId)||null:null;
  const effShow=subEvent||show;
  const rosKey=eventKey;
  const blocks=gRos(rosKey);
  const today2=new Date().toISOString().slice(0,10);const upcoming0=cShows.filter(s=>s.date>=today2);
  if(!show)return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,padding:40,gap:10}}>
      <div style={{fontSize:32,opacity:0.2}}>📋</div>
      <div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>No show selected</div>
      <div style={{fontSize:11,color:"var(--text-dim)",maxWidth:280,textAlign:"center"}}>Select a show from the sidebar to view and edit the run of show.</div>
      {upcoming0[0]&&<button onClick={()=>setSel(upcoming0[0].date)} style={{marginTop:6,padding:"6px 16px",borderRadius:8,border:"none",background:"var(--accent)",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>Jump to next show →</button>}
    </div>
  );
  const today=new Date().toISOString().slice(0,10);const upcoming=cShows.filter(s=>s.date>=today);

  const busCalTimes=useMemo(()=>{
    const todayBus=BUS_DATA_MAP[sel];
    const busArriveEff=(todayBus?.arr&&todayBus.arr!=="—")?pM(todayBus.arr):null;
    let busDepartEff=null,busDepartRoute=null;
    for(let d=1;d<=4;d++){const dt=new Date(sel+"T12:00:00");dt.setDate(dt.getDate()+d);const e=BUS_DATA_MAP[dt.toISOString().slice(0,10)];if(e?.dep&&e.dep!=="—"){const raw=pM(e.dep);busDepartEff=(raw!=null&&raw<8*60)?raw+1440:raw;busDepartRoute=e.route;break;}}
    return{busArriveEff,busArriveRoute:todayBus?.route||null,busDepartEff,busDepartRoute};
  },[sel]);

  const times=useMemo(()=>{
    const t={};const{doors,curfew,busArrive,crewCall,venueAccess,mgTime}=effShow;
    const effBusArrive=effShow.busArriveConfirmed?busArrive:(busCalTimes.busArriveEff??busArrive);
    t.bus_arrive={s:effBusArrive,e:effBusArrive};t.venue_access={s:venueAccess,e:venueAccess};t.crew_call={s:crewCall,e:crewCall};
    const pre=blocks.filter(b=>b.phase==="pre"&&!b.isAnchor);let c=crewCall;
    for(const b of pre){t[b.id]={s:c,e:c+b.duration};c+=b.duration;}
    const mgCI=blocks.find(b=>b.id==="mg_checkin")?.duration||30;
    t.mg_checkin={s:mgTime-mgCI,e:mgTime};t.mg={s:mgTime,e:mgTime+(blocks.find(b=>b.id==="mg")?.duration||120)};
    const eD=blocks.find(b=>b.id==="doors_early")?.duration||30;
    t.doors_early={s:doors-eD,e:doors};t.doors_ga={s:doors,e:doors};
    const sh=blocks.filter(b=>b.phase==="show");c=doors+60;
    for(const b of sh){t[b.id]={s:c,e:c+b.duration};c+=b.duration;}
    const hE=t.bbno_set?.e||curfew;t.curfew={s:curfew,e:curfew};
    const post=blocks.filter(b=>b.phase==="post");c=curfew;
    for(const b of post){if(b.anchorKey==="busDepart"){const bt=effShow.busDepart??busCalTimes.busDepartEff;if(bt!=null){t[b.id]={s:bt,e:bt};}else{t[b.id]={s:c,e:c};}continue;}if(b.offsetRef==="bbno_set_end"){t[b.id]={s:hE+(b.offsetMin||0),e:hE+(b.offsetMin||0)+b.duration};continue;}t[b.id]={s:c,e:c+b.duration};c+=b.duration;}
    return t;
  },[effShow,blocks,busCalTimes]);

  const setDur=(id,dur)=>uRos(rosKey,blocks.map(b=>b.id===id?{...b,duration:Math.max(0,dur)}:b));
  const setBF=(id,field,val)=>uRos(rosKey,blocks.map(b=>b.id===id?{...b,[field]:val}:b));
  const addBlock=phase=>{const nb={id:`custom_${Date.now()}`,label:"New Block",duration:30,phase,type:"custom",color:"var(--accent)",roles:["tm_td"]};const idx=blocks.map((b,i)=>b.phase===phase?i:-1).filter(i=>i>=0).pop();const next=[...blocks];if(idx==null)next.push(nb);else next.splice(idx+1,0,nb);uRos(rosKey,next);setEditB(nb.id);};
  const removeBlock=id=>{uRos(rosKey,blocks.filter(b=>b.id!==id));setEditB(null);};
  const startResize=(b,edge,e)=>{
    e.stopPropagation();e.preventDefault();
    const startY=e.clientY,origDur=b.duration,idx=blocks.findIndex(x=>x.id===b.id);
    const prev=[...blocks].slice(0,idx).reverse().find(x=>!x.isAnchor&&x.phase===b.phase&&x.duration>0);
    const origPrev=prev?.duration||0,pxPerMin=0.8;
    const onMove=ev=>{
      const dMin=Math.round(((ev.clientY-startY)/pxPerMin)/5)*5;
      if(edge==="bottom"){
        const nd=Math.max(0,origDur+dMin);
        uRos(rosKey,blocks.map(x=>x.id===b.id?{...x,duration:nd}:x));
      }else if(prev){
        const nd=Math.max(0,origDur-dMin),np=Math.max(0,origPrev+dMin);
        uRos(rosKey,blocks.map(x=>x.id===b.id?{...x,duration:nd}:x.id===prev.id?{...x,duration:np}:x));
      }
    };
    const onUp=()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
  };
  const reorder=(fid,tid)=>{const fi=blocks.findIndex(b=>b.id===fid),ti=blocks.findIndex(b=>b.id===tid);if(fi<0||ti<0||blocks[fi].phase!==blocks[ti].phase||blocks[fi].isAnchor||blocks[ti].isAnchor)return;const n=[...blocks];const[m]=n.splice(fi,1);n.splice(ti,0,m);const ciI=n.findIndex(b=>b.id==="mg_checkin"),mgI=n.findIndex(b=>b.id==="mg");if(ciI>=0&&mgI>=0&&ciI>mgI){const[ci]=n.splice(ciI,1);n.splice(mgI,0,ci);}uRos(rosKey,n);};
  // uEffShow: writes anchor times to the correct target (main show or sub-event)
  const uEffShow=(patch)=>{
    if(!subEvent){uShow(sel,patch);}
    else{uShow(sel,{subEvents:(show.subEvents||[]).map(e=>e.id===selEventId?{...e,...patch}:e)});}
  };
  const setAnc=(key,str)=>{const m=pM(str);if(m===null)return;uEffShow({[key]:m,[key+"Confirmed"]:true});};
  const hl=b=>AB.has(b.id)||role==="tm_td"||b.roles?.includes(role);
  const AMAP={busArrive:"Bus Arrival",busDepart:"Bus Depart",venueAccess:"Venue Access",crewCall:"Crew Call",mgTime:"M&G",doors:"Doors",curfew:"Curfew"};
  const isCustom=!subEvent&&!!CUSTOM_ROS_MAP[sel];

  const isNonShowDay=(show.type==="off"||show.type==="travel")&&!subEvent;

  const renderB=b=>{
    let t=times[b.id];if(!t)return null;
    if(b.anchorStartAt!=null||b.anchorEndAt!=null)t={s:b.anchorStartAt!=null?b.anchorStartAt:t.s,e:b.anchorEndAt!=null?b.anchorEndAt:t.e};
    const isA=b.isAnchor,hi=hl(b),isE=editB===b.id,isDT=dOver===b.id;
    const canD=!isA&&b.id!=="doors_early"&&b.id!=="mg_checkin";
    const canE=b.id!=="mg_checkin"&&b.id!=="doors_early";
    const cK=b.anchorKey?b.anchorKey+"Confirmed":null;const isC=cK?effShow[cK]:false;
    return(
      <React.Fragment key={b.id}>
      <div draggable={canD}
        onDragStart={e=>{dId.current=b.id;e.dataTransfer.effectAllowed="move";}}
        onDragOver={e=>{e.preventDefault();if(dId.current&&dId.current!==b.id)setDOver(b.id);}}
        onDrop={e=>{e.preventDefault();if(dId.current&&dId.current!==b.id)reorder(dId.current,b.id);dId.current=null;setDOver(null);}}
        onDragEnd={()=>{dId.current=null;setDOver(null);}}
        onClick={()=>canE&&setEditB(isE?null:b.id)} className="br"
        style={{position:"relative",display:"flex",alignItems:"center",gap:8,padding:isA?"10px 14px":"7px 14px",background:isDT?"var(--accent-pill-bg)":"var(--card)",border:isA?`2px solid ${b.color}50`:isE?`1px solid ${b.color}`:"1px solid var(--border)",borderRadius:isA?12:8,cursor:canD?"grab":canE?"pointer":"default",opacity:hi?1:0.22,transition:"border .12s ease,background .12s ease",boxShadow:isA?"0 2px 6px rgba(0,0,0,.06)":"none",minHeight:isA?undefined:Math.max(32,Math.min(180,b.duration*0.8))}}>
        {!isA&&b.duration>0&&<div onMouseDown={e=>startResize(b,"top",e)} title="Drag to shift start" style={{position:"absolute",top:-3,left:8,right:8,height:6,cursor:"ns-resize",zIndex:2}}/>}
        {!isA&&b.duration>0&&<div onMouseDown={e=>startResize(b,"bottom",e)} title="Drag to change duration" style={{position:"absolute",bottom:-3,left:8,right:8,height:6,cursor:"ns-resize",zIndex:2}}/>}
        {canD?<div style={{color:"var(--text-mute)",fontSize:13,cursor:"grab",userSelect:"none",width:16,flexShrink:0,textAlign:"center"}}>⋮⋮</div>:<div style={{width:16,flexShrink:0}}/>}
        <div style={{width:54,fontFamily:MN,fontSize:11,color:isA?b.color:"var(--text-2)",fontWeight:isA?800:500,textAlign:"right",flexShrink:0}}>{fmt(t.s)}</div>
        <div style={{width:4,height:isA?28:20,background:b.color,borderRadius:4,flexShrink:0,opacity:isA?1:.5}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:isA?13:12,fontWeight:isA?800:600,color:isA?b.color:"var(--text)",display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
            {b.label}
            {isA&&cK&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:4,fontWeight:800,background:isC?"var(--success-bg)":"var(--warn-bg)",color:isC?"var(--success-fg)":"var(--warn-fg)"}}>{isC?"CONFIRMED":"UNCONFIRMED"}</span>}
            {b.id==="curfew"&&sel==="2026-04-16"&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:4,fontWeight:800,background:"var(--danger-bg)",color:"var(--danger-fg)"}}>HARD</span>}
            {b.id==="bus_arrive"&&effShow.busArrivePrevDay&&<span title={`Bus parks at venue ${(()=>{const d=new Date(sel+"T12:00:00");d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);})()}`} style={{fontSize:8,padding:"2px 6px",borderRadius:4,fontWeight:800,background:"var(--info-bg)",color:"var(--info-fg)"}}>PREV DAY</span>}
          </div>
          {b.note&&<div style={{fontSize:9,color:"var(--text-dim)",marginTop:1}}>{b.note}</div>}
        </div>
        {b.duration>0&&!isA&&b.id!=="mg_checkin"&&<div style={{fontFamily:MN,fontSize:10,color:"var(--text-2)",background:"var(--card-3)",padding:"3px 7px",borderRadius:4,flexShrink:0,border:"1px solid var(--border)",fontWeight:600}}>{`${b.duration}m`}</div>}
        {b.duration>0&&<div style={{width:46,fontFamily:MN,fontSize:9,color:"var(--text-mute)",textAlign:"right",flexShrink:0}}>{fmt(t.e)}</div>}
        {cK&&<button onClick={e=>{e.stopPropagation();uEffShow({[cK]:!isC});}} title={isC?"Confirmed":"Mark confirmed"} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:isC?"var(--success-fg)":"var(--text-faint)",padding:"2px 4px",flexShrink:0}}>{isC?"✓":"○"}</button>}
        {canE&&<button onClick={e=>{e.stopPropagation();setEditB(isE?null:b.id);}} title="Edit" style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:isE?"var(--text)":"var(--text-mute)",padding:"2px 6px",flexShrink:0,fontWeight:700,letterSpacing:1}}>{isE?"×":"⋯"}</button>}
      </div>
      {isE&&canE&&(
        <div style={{...UI.expandPanel,borderLeftColor:b.color,marginTop:-2,marginBottom:4,borderRadius:"0 0 8px 8px"}} onClick={e=>e.stopPropagation()}>
          {isA&&b.anchorKey?(
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <label style={{fontSize:9,fontWeight:700,color:"var(--text-dim)"}}>{AMAP[b.anchorKey]} TIME</label>
              <input type="text" placeholder="7:00p" defaultValue={fmt(effShow[b.anchorKey])} onKeyDown={e=>{if(e.key==="Enter"){setAnc(b.anchorKey,e.target.value);setEditB(null);}if(e.key==="Escape")setEditB(null);}} onBlur={e=>setAnc(b.anchorKey,e.target.value)} style={{...UI.input,fontFamily:MN,width:80,fontWeight:700}}/>
              <button onClick={()=>uEffShow({[b.anchorKey+"Confirmed"]:!isC})} style={UI.expandBtn(false,isC?"var(--success-fg)":"var(--warn-fg)")}>{isC?"✓ Confirmed":"Mark Confirmed"}</button>
              {b.anchorKey==="busArrive"&&<label style={{fontSize:9,fontWeight:700,color:"var(--info-fg)",display:"flex",alignItems:"center",gap:4,cursor:"pointer",background:"var(--info-bg)",padding:"2px 7px",borderRadius:4,border:"1px solid var(--info-bg)"}}><input type="checkbox" checked={!!effShow.busArrivePrevDay} onChange={e=>uEffShow({busArrivePrevDay:e.target.checked})}/>Arrives day before</label>}
              {b.anchorKey==="busArrive"&&busCalTimes.busArriveEff!=null&&<span style={{fontSize:9,color:"var(--info-fg)",fontWeight:700,background:"var(--info-bg)",padding:"2px 7px",borderRadius:4}}>{`from tour calendar · ${fmt(busCalTimes.busArriveEff)}`}{busCalTimes.busArriveRoute?` · ${busCalTimes.busArriveRoute}`:""}</span>}
              {b.anchorKey==="busDepart"&&busCalTimes.busDepartEff!=null&&<span style={{fontSize:9,color:"var(--info-fg)",fontWeight:700,background:"var(--info-bg)",padding:"2px 7px",borderRadius:4}}>{`from tour calendar · ${fmt(busCalTimes.busDepartEff)}`}{busCalTimes.busDepartRoute?` · ${busCalTimes.busDepartRoute}`:""}</span>}
              <label style={{fontSize:9,fontWeight:700,color:"var(--text-dim)",display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}><input type="checkbox" checked={!!b.isAnchor} onChange={e=>setBF(b.id,"isAnchor",e.target.checked)}/>Anchor</label>
              <button onClick={()=>removeBlock(b.id)} style={{marginLeft:"auto",background:"none",border:"none",color:"var(--danger-fg)",fontSize:10,cursor:"pointer",fontWeight:700}}>Remove block</button>
              {b.isAnchor&&<AnchorTimes b={b} setBF={setBF}/>}
              <span style={{flexBasis:"100%",fontSize:9,color:"var(--text-mute)"}}>Enter = save · Esc = close</span>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr",gap:8,alignItems:"center"}}>
              <div>
                <div style={{fontSize:8,color:"var(--text-dim)",fontWeight:700,marginBottom:2}}>DURATION</div>
                <input type="number" min="0" max="480" step="5" value={b.duration} onChange={e=>setDur(b.id,parseInt(e.target.value)||0)} style={{...UI.input,fontFamily:MN,width:70,textAlign:"center"}}/>
              </div>
              <div>
                <div style={{fontSize:8,color:"var(--text-dim)",fontWeight:700,marginBottom:2}}>LABEL</div>
                <input type="text" value={b.label} onChange={e=>setBF(b.id,"label",e.target.value)} style={{...UI.input,width:"100%"}}/>
              </div>
              <div>
                <div style={{fontSize:8,color:"var(--text-dim)",fontWeight:700,marginBottom:2}}>NOTE</div>
                <input type="text" value={b.note||""} onChange={e=>setBF(b.id,"note",e.target.value)} placeholder="Optional note" style={{...UI.input,width:"100%"}}/>
              </div>
              <div style={{gridColumn:"1 / -1",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <label style={{fontSize:9,fontWeight:700,color:"var(--text-dim)",display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}><input type="checkbox" checked={!!b.isAnchor} onChange={e=>setBF(b.id,"isAnchor",e.target.checked)}/>Anchor</label>
                {b.isAnchor&&<AnchorTimes b={b} setBF={setBF}/>}
                <button onClick={()=>removeBlock(b.id)} style={{marginLeft:"auto",background:"none",border:"none",color:"var(--danger-fg)",fontSize:10,cursor:"pointer",fontWeight:700}}>Remove block</button>
              </div>
            </div>
          )}
        </div>
      )}
      </React.Fragment>
    );
  };

  const phases=[{k:"bus_in",l:"BUS ARRIVAL",s:"Anchor",pc:"var(--link)"},{k:"pre",l:"PRE-SHOW",s:"Forward from Crew Call",pc:"var(--warn-fg)"},{k:"mg",l:"MEET & GREET",s:"Anchor",pc:"var(--accent)"},{k:"doors",l:"DOORS",s:"Contract anchor",pc:"var(--success-fg)"},{k:"show",l:"SHOW",s:"Doors +60min",pc:"var(--danger-fg)"},{k:"curfew",l:"CURFEW",s:sel==="2026-04-16"?"HARD":"Contract anchor",pc:"var(--text-dim)"},{k:"post",l:"POST-SHOW",s:"Relative to set end",pc:"var(--info-fg)"}];

  return(
    <div className="fi" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 115px)"}}>
      {isNonShowDay&&<DayScheduleView show={show} bus={BUS_DATA_MAP[sel]||null} split={currentSplit||null} sel={sel}/>}
      {!isNonShowDay&&<><div style={{padding:"6px 20px",borderBottom:"1px solid var(--border)",background:"var(--card)",display:"flex",gap:10,flexWrap:"wrap",fontSize:11,flexShrink:0,alignItems:"center"}}>
        <span style={{fontWeight:700}}>{effShow.venue}</span><span style={{color:"var(--text-2)",fontSize:10}}>{effShow.promoter}</span>
        {isCustom&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:"var(--accent-pill-bg)",color:"var(--accent)",fontWeight:700}}>Custom ROS</span>}
        {subEvent&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:"var(--accent-pill-bg)",color:"var(--accent)",fontWeight:700}}>{subEvent.name}</span>}
        {effShow.notes&&<span style={{color:"var(--warn-fg)",fontWeight:600,fontSize:9}}>{effShow.notes}</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <button onClick={()=>uEffShow({busSkip:!effShow.busSkip,busPre:false})} title="Toggle Bus Arrival" style={{background:effShow.busSkip?"var(--card-3)":"var(--info-bg)",border:`1px solid ${effShow.busSkip?"var(--border)":"var(--link)"}`,borderRadius:6,color:effShow.busSkip?"var(--text-mute)":"var(--link)",fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:700}}>{effShow.busSkip?"+ Bus":"✓ Bus"}</button>
          {!effShow.busSkip&&<button onClick={()=>uEffShow({busPre:!effShow.busPre})} title="Bus arrived before show day" style={{background:effShow.busPre?"var(--info-bg)":"var(--card-3)",border:`1px solid ${effShow.busPre?"var(--link)":"var(--border)"}`,borderRadius:6,color:effShow.busPre?"var(--link)":"var(--text-mute)",fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:700}}>Pre-day</button>}
          <button onClick={()=>uEffShow({mgSkip:!effShow.mgSkip})} title="Toggle Meet & Greet" style={{background:effShow.mgSkip?"var(--card-3)":"var(--success-bg)",border:`1px solid ${effShow.mgSkip?"var(--border)":"var(--success-fg)"}`,borderRadius:6,color:effShow.mgSkip?"var(--text-mute)":"var(--success-fg)",fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:700}}>{effShow.mgSkip?"+ M&G":"✓ M&G"}</button>
          <button onClick={()=>{uRos(rosKey,null);setEditB(null);}} style={{background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-dim)",fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:600}}>Reset</button>
          <button onClick={()=>{setEditVenue(effShow.venue||"");setEditCity(effShow.city||"");setEditPromoter(effShow.promoter||"");setEditShow(v=>!v);}} style={{background:editShow?"var(--accent-pill-bg)":"var(--card-3)",border:`1px solid ${editShow?"var(--accent)":"var(--border)"}`,borderRadius:6,color:editShow?"var(--accent)":"var(--text-dim)",fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:600}}>✏ Edit</button>
        </div>
      </div>
      {editShow&&<div style={{padding:"8px 20px",background:"var(--card-3)",borderBottom:"1px solid var(--border)",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",flexShrink:0}}>
        <input value={editVenue} onChange={e=>setEditVenue(e.target.value)} placeholder="Venue" style={{...UI.input,fontSize:10,minWidth:120,flex:2}}/>
        <input value={editCity} onChange={e=>setEditCity(e.target.value)} placeholder="City" style={{...UI.input,fontSize:10,minWidth:90,flex:1}}/>
        <input value={editPromoter} onChange={e=>setEditPromoter(e.target.value)} placeholder="Promoter" style={{...UI.input,fontSize:10,minWidth:110,flex:2}}/>
        <button onClick={()=>{uEffShow({venue:editVenue,city:editCity,promoter:editPromoter});setEditShow(false);}} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",background:"var(--success-fg)",color:"#fff",cursor:"pointer",fontWeight:700,flexShrink:0}}>Save</button>
        <button onClick={()=>setEditShow(false)} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer",flexShrink:0}}>Cancel</button>
      </div>}
      <div style={{padding:"10px 20px 30px",background:"var(--bg)",flex:1,overflowY:"auto"}}>
        <FlightDayStrip sel={sel}/>
        {phases.filter(ph=>!(ph.k==="mg"&&effShow.mgSkip)&&!(ph.k==="bus_in"&&(effShow.busSkip||effShow.busPre))).map(ph=>{const pb=blocks.filter(b=>ph.k==="bus_in"?b.phase==="bus_in":ph.k==="curfew"?b.id==="curfew":ph.k==="doors"?b.phase==="doors":ph.k==="mg"?b.phase==="mg":b.phase===ph.k);const canAdd=!["bus_in","curfew","doors","mg"].includes(ph.k);
          return(<div key={ph.k} style={{marginBottom:6}}><div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0 3px"}}><div style={{fontSize:9,fontWeight:800,letterSpacing:"0.1em",color:ph.pc||"var(--text-dim)"}}>{ph.l}</div><div style={{flex:1,height:1,background:"var(--border)"}}/><div style={{fontSize:8,color:"var(--text-mute)",fontStyle:"italic"}}>{ph.s}</div>{canAdd&&<button onClick={()=>addBlock(ph.k)} title="Add block" style={{background:"none",border:"1px dashed var(--text-faint)",borderRadius:6,color:"var(--text-dim)",fontSize:9,padding:"2px 8px",cursor:"pointer",fontWeight:700}}>+ Block</button>}</div><div style={{display:"flex",flexDirection:"column",gap:3}}>{pb.map(b=>renderB(b))}</div>{!pb.length&&canAdd&&<div style={{fontSize:9,color:"var(--text-mute)",fontStyle:"italic",padding:"4px 0"}}>No blocks — click + Block to add.</div>}</div>);
        })}
        <div style={{marginTop:12,padding:"12px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,display:"flex",gap:12,flexWrap:"wrap"}}>
          {[...(effShow.busSkip?[]:[{l:effShow.busPre?"Bus":"Bus ETA",v:effShow.busPre?"On-site (prev)":fmt(effShow.busArrive),c:"var(--link)"}]),{l:"Crew Call",v:fmt(effShow.crewCall),c:"var(--warn-fg)"},{l:"M&G",v:fmt(effShow.mgTime),c:"var(--success-fg)",hide:effShow.mgSkip},{l:"Doors",v:fmt(effShow.doors),c:"var(--success-fg)"},{l:"Headline",v:times.bbno_set?`${fmt(times.bbno_set.s)}–${fmt(times.bbno_set.e)}`:"--",c:"var(--danger-fg)"},{l:"Settlement",v:times.settlement?fmt(times.settlement.s):"--",c:"var(--warn-fg)"},{l:"Curfew",v:fmt(effShow.curfew),c:"var(--danger-fg)"},{l:"Bus Out",v:times.bus_depart?fmt(times.bus_depart.s):"--",c:"var(--link)",hide:effShow.busSkip}].filter(s=>!s.hide).map((s,i)=><div key={i}><div style={{fontSize:8,color:"var(--text-dim)",marginBottom:1,fontWeight:600}}>{s.l}</div><div style={{fontFamily:MN,fontSize:11,color:s.c,fontWeight:800}}>{s.v}</div></div>)}
        </div>
      </div>
      </>}
    </div>
  );
}

function TourCalendar(){
  const{setSel,setTab,flights,uFlight,effectiveSplitDays}=useContext(Ctx);
  const importBusLegs=()=>{
    const base=new Date('2026-05-02T12:00:00');
    BUS_DATA.forEach(d=>{
      if(d.dep==="—"||!d.route.includes("→"))return;
      const dt=new Date(base);dt.setDate(dt.getDate()+d.day-1);
      const isoDate=dt.toISOString().slice(0,10);
      if(Object.values(flights).some(f=>f.type==="bus"&&f.depDate===isoDate&&f.status!=="dismissed"))return;
      const parts=d.route.split("→").map(s=>s.trim());
      const id=`bus_${isoDate}_${Math.random().toString(36).slice(2,6)}`;
      uFlight(id,{id,type:"bus",status:"confirmed",depDate:isoDate,arrDate:isoDate,dep:d.dep,arr:d.arr,from:parts[0],to:parts[1]||"",fromCity:parts[0],toCity:parts[1]||"",carrier:"Pieter Smit",flightNo:"Tour Bus",notes:d.note||"",pax:[]});
    });
  };
  const[expRows,setExpRows]=useState({});
  const crewById=useMemo(()=>DEFAULT_CREW.reduce((a,c)=>{a[c.id]=c;return a},{}),[]);
  const openDay=iso=>{setSel(iso);setTab("ros");};
  const busMap=useMemo(()=>{
    const m={};
    BUS_DATA.forEach(d=>{
      const base=new Date('2026-05-02T12:00:00');
      base.setDate(base.getDate()+d.day-1);
      m[base.toISOString().slice(0,10)]=d;
    });
    return m;
  },[]);
  const showMap=useMemo(()=>{
    const m={};
    ALL_SHOWS.filter(s=>s.clientId==="bbn"&&s.date>="2026-04-16"&&s.date<="2026-05-31").forEach(s=>{m[s.date]=s;});
    return m;
  },[]);
  const days=useMemo(()=>{
    const result=[];
    const end=new Date('2026-05-31T12:00:00');
    for(let d=new Date('2026-04-16T12:00:00');d<=end;d.setDate(d.getDate()+1)){
      const iso=d.toISOString().slice(0,10);
      const bus=busMap[iso];
      const show=showMap[iso];
      const split=effectiveSplitDays[iso];
      let type="off";
      if(split)type="split";
      else if(show||(bus&&bus.show))type="show";
      else if(bus)type="travel";
      result.push({iso,bus,show,split,type});
    }
    return result;
  },[busMap,showMap,effectiveSplitDays]);
  const TS={
    show:{l:"SHOW",c:"var(--success-fg)",b:"var(--success-bg)"},
    travel:{l:"TRAVEL",c:"var(--link)",b:"var(--info-bg)"},
    off:{l:"OFF",c:"var(--text-dim)",b:"var(--card-2)"},
    split:{l:"SPLIT",c:"var(--warn-fg)",b:"var(--warn-bg)"},
  };
  const todayISO=new Date().toISOString().slice(0,10);
  const parseDriveH=s=>{if(!s)return 0;const m=s.match(/(\d+)h/);return m?parseInt(m[1]):0;};
  const maxDriveH=Math.max(1,...days.filter(d=>d.type==="travel"&&d.bus?.drive).map(d=>parseDriveH(d.bus.drive)));
  const totalKm=days.filter(d=>d.bus?.km>0).reduce((s,d)=>s+(d.bus?.km||0),0);
  const totalDriveH=days.filter(d=>d.type==="travel"&&d.bus?.drive).reduce((s,d)=>s+parseDriveH(d.bus.drive),0);
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:8}}>
        {[
          {l:"Shows",v:days.filter(d=>d.type==="show").length,c:"var(--success-fg)",b:"var(--success-bg)"},
          {l:"Travel Days",v:days.filter(d=>d.type==="travel").length,c:"var(--link)",b:"var(--info-bg)"},
          {l:"Off Days",v:days.filter(d=>d.type==="off").length,c:"var(--text-dim)",b:"var(--card-2)"},
          {l:"Split Days",v:days.filter(d=>d.type==="split").length,c:"var(--warn-fg)",b:"var(--warn-bg)"},
        ].map((s,i)=>(
          <div key={i} style={{background:s.b,border:`1px solid ${s.c}30`,borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:9,color:s.c,fontWeight:700,marginBottom:2}}>{s.l}</div>
            <div style={{fontFamily:MN,fontSize:16,fontWeight:800,color:s.c}}>{s.v}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,padding:"8px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,flexWrap:"wrap"}}>
        {[{l:"Total KM",v:"8,970"},{l:"Drive Days",v:"13"},{l:"HOS Flags",v:"3",warn:true}].map((s,i)=>(
          <div key={i} style={{display:"flex",alignItems:"baseline",gap:4}}>
            <span style={{fontFamily:MN,fontSize:13,fontWeight:800,color:s.warn?"var(--danger-fg)":"var(--text)"}}>{s.v}</span>
            <span style={{fontSize:9,color:"var(--text-dim)"}}>{s.l}</span>
          </div>
        ))}
        <span style={{fontSize:9,color:"var(--text-mute)",fontFamily:MN}}>Pieter Smit T26-021201</span>
        <button onClick={importBusLegs} style={{marginLeft:"auto",fontSize:9,padding:"3px 10px",borderRadius:6,border:"1px solid var(--accent)",background:"var(--accent-pill-bg)",color:"var(--accent)",cursor:"pointer",fontWeight:700,fontFamily:MN}}>→ Import Legs to Travel Days</button>
      </div>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"auto",maxHeight:380}}>
        {days.map((d,i)=>{
          const ts=TS[d.type]||TS.off;
          const isOff=d.type==="off";
          const isSplit=d.type==="split";
          const isExp=expRows[d.iso];
          const hasFlag=(d.bus?.flag==="⚠")||(d.show?.notes||"").includes("⚠");
          const canExpand=isSplit||hasFlag;
          const showTodayMarker=i>0&&days[i-1].iso<todayISO&&d.iso>=todayISO;
          const driveH=parseDriveH(d.bus?.drive);
          const drivePct=maxDriveH>0?Math.min(100,(driveH/maxDriveH)*100):0;
          const driveC=driveH>5?"var(--danger-fg)":driveH>3?"var(--warn-fg)":"var(--success-fg)";
          return(
            <React.Fragment key={d.iso}>
              {showTodayMarker&&<div style={{padding:"4px 12px",background:"var(--warn-bg)",borderTop:"1px solid var(--warn-fg)",borderBottom:"1px solid var(--warn-fg)",fontSize:8,fontWeight:800,color:"var(--warn-fg)",fontFamily:MN,letterSpacing:"0.1em"}}>▸ TODAY</div>}
              <div style={{borderBottom:i<days.length-1?"1px solid var(--card-3)":"none"}}>
              <div
                onClick={()=>openDay(d.iso)}
                className="rh"
                style={{display:"grid",gridTemplateColumns:"76px 58px 1fr auto",alignItems:"center",gap:8,padding:isOff?"5px 12px":"8px 12px",background:d.type==="show"?"var(--muted-bg)":d.type==="travel"?"var(--info-bg)":d.type==="split"?"var(--warn-bg)":"var(--card)",cursor:"pointer",opacity:isOff?0.65:1,borderLeft:d.type==="show"?"3px solid var(--success-fg)":"3px solid transparent"}}
              >
                <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                  <span style={{fontFamily:MN,fontSize:isOff?9:10,fontWeight:isOff?400:700,color:ts.c}}>{fD(d.iso)}</span>
                  <span style={{fontSize:8,color:"var(--text-mute)"}}>{fW(d.iso)}</span>
                </div>
                <div style={{background:ts.b,color:ts.c,fontSize:8,fontWeight:800,padding:"2px 6px",borderRadius:4,textAlign:"center",letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{ts.l}</div>
                <div style={{minWidth:0,overflow:"hidden"}}>
                  {d.type==="show"&&(
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:10,fontWeight:600,color:"var(--text)"}}>{d.show?.venue||d.bus?.venue}</span>
                      <span style={{fontSize:9,color:"var(--text-dim)"}}>— {d.show?.city}</span>
                      {d.show?.notes&&<span style={{fontSize:9,color:"var(--warn-fg)"}}>{d.show.notes}</span>}
                      {d.show?.promoter&&<span style={{fontSize:8,color:"var(--text-mute)",fontStyle:"italic"}}>{d.show.promoter}</span>}
                    </div>
                  )}
                  {d.type==="travel"&&(
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:10,color:"var(--text)",fontWeight:500}}>{d.bus?.route}</span>
                      {d.bus?.km>0&&<span style={{fontFamily:MN,fontSize:9,color:"var(--text-dim)"}}>{d.bus.km}km</span>}
                      <span style={{fontFamily:MN,fontSize:9,color:"var(--text-dim)"}}>{d.bus?.drive}</span>
                      {d.bus?.dep!=="—"&&<span style={{fontFamily:MN,fontSize:9,color:"var(--text-2)"}}>↑{d.bus.dep}</span>}
                      {d.bus?.arr!=="—"&&<span style={{fontFamily:MN,fontSize:9,color:"var(--text-2)"}}>↓{d.bus.arr}</span>}
                      {d.bus?.note&&<span style={{fontSize:9,color:"var(--text-mute)"}}>{d.bus.note}</span>}
                    </div>
                  )}
                  {d.type==="off"&&<span style={{fontSize:9,color:"var(--text-mute)"}}>—</span>}
                  {d.type==="split"&&(
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                      {d.split.parties.map(p=>(
                        <span key={p.id} style={{fontSize:9,padding:"2px 8px",borderRadius:4,background:p.bg,color:p.color,fontWeight:700}}>{p.label} · {p.crew.length} crew</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                  {hasFlag&&<span style={{fontSize:11}}>⚠</span>}
                  {canExpand&&<span onClick={e=>{e.stopPropagation();setExpRows(p=>({...p,[d.iso]:!p[d.iso]}));}} style={{fontSize:9,color:ts.c,fontWeight:700,padding:"2px 6px",borderRadius:4,cursor:"pointer"}}>{isExp?"▴":"▾"}</span>}
                </div>
              </div>
              {d.type==="travel"&&driveH>0&&<div style={{height:3,background:"var(--card-2)"}}><div style={{width:`${drivePct}%`,height:"100%",background:driveC,transition:"width 0.3s"}}/></div>}
              {isSplit&&isExp&&(
                <div style={{padding:"0 12px 10px",background:"var(--warn-bg)",borderTop:"1px solid var(--warn-bg)"}}>
                  {d.split.parties.map(p=>(
                    <div key={p.id} style={{marginTop:8,padding:"8px 10px",background:p.bg,borderRadius:6,border:`1px solid ${p.color}30`}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,fontWeight:800,color:p.color}}>{p.label}</span>
                        <span style={{fontSize:9,color:"var(--text-mute)"}}>·</span>
                        <span style={{fontSize:9,color:"var(--text-dim)"}}>{p.location}</span>
                        <span style={{fontSize:9,color:"var(--text-mute)"}}>·</span>
                        <span style={{fontSize:9,color:"var(--text-dim)"}}>{p.event}</span>
                      </div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:p.note?4:0}}>
                        {p.crew.map(cid=>{const c=crewById[cid];return c?(
                          <span key={cid} style={{fontSize:8,padding:"2px 8px",borderRadius:10,background:"var(--card)",border:`1px solid ${p.color}40`,color:p.color,fontWeight:600}}>
                            {c.name.split(" ")[0]} <span style={{fontWeight:400,opacity:0.7,fontSize:8}}>({c.role.split(" (")[0].split("/")[0].trim()})</span>
                          </span>
                        ):null;})}
                      </div>
                      {p.note&&<div style={{fontSize:9,color:"var(--text-dim)",fontStyle:"italic"}}>{p.note}</div>}
                    </div>
                  ))}
                </div>
              )}
              {!isSplit&&hasFlag&&isExp&&d.show?.notes&&(
                <div style={{padding:"6px 12px 8px",background:"var(--warn-bg)",borderTop:"1px solid var(--warn-bg)",fontSize:9,color:"var(--warn-fg)"}}>{d.show.notes}</div>
              )}
            </div>
            </React.Fragment>
          );
        })}
      </div>
      <div style={{marginTop:8,padding:"10px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,display:"flex",gap:20,alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:4}}><span style={{fontFamily:MN,fontSize:13,fontWeight:800,color:"var(--link)"}}>{totalKm.toLocaleString()}km</span><span style={{fontSize:9,color:"var(--text-dim)",marginLeft:4}}>TOTAL DRIVE DIST</span></div>
        <div style={{display:"flex",alignItems:"baseline",gap:4}}><span style={{fontFamily:MN,fontSize:13,fontWeight:800,color:"var(--text)"}}>{totalDriveH}h</span><span style={{fontSize:9,color:"var(--text-dim)",marginLeft:4}}>TOTAL DRIVE TIME</span></div>
      </div>
    </div>
  );
}

function FlightsListView(){
  const{flights,uFlight,setFlights,uRos,gRos,uFin,finance,crew,setShowCrew,setSel,setTab,sorted,shows,tourStart,tourEnd}=useContext(Ctx);
  const goToSchedule=(date)=>{setSel(date);setTab("ros");};
  const[scanning,setScanning]=useState(false);
  const[scanMsg,setScanMsg]=useState("");
  const[pendingImport,setPendingImport]=useState([]);
  const[confirmingId,setConfirmingId]=useState(null);
  const[liveStatuses,setLiveStatuses]=useState({});  // keyed by flight id
  const[refreshingId,setRefreshingId]=useState(null);
  const[refreshingAll,setRefreshingAll]=useState(false);
  const[reassignMsg,setReassignMsg]=useState("");

  const allFlights=Object.values(flights);
  const pending=allFlights.filter(f=>f.status==="pending").sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||0);
  const confirmedRaw=allFlights.filter(f=>f.status==="confirmed").sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||a.dep?.localeCompare(b.dep||"")||0);
  // Deduplicate confirmed by strong key — keep most recently confirmed; purge extras from store
  const confirmedByKey=new Map();
  confirmedRaw.forEach(f=>{const k=flightDedupKey(f);const cur=confirmedByKey.get(k);if(!cur||(f.confirmedAt||"")>(cur.confirmedAt||""))confirmedByKey.set(k,f);});
  const keepIds=new Set([...confirmedByKey.values()].map(f=>f.id));
  const keepIdsKey=[...keepIds].sort().join(",");
  useEffect(()=>{
    const dupes=confirmedRaw.filter(f=>!keepIds.has(f.id));
    if(dupes.length)dupes.forEach(f=>uFlight(f.id,null));
  },[keepIdsKey]);// eslint-disable-line
  useEffect(()=>{
    setLiveStatuses(prev=>{
      const next={};let changed=false;
      for(const k of Object.keys(prev)){if(flights[k])next[k]=prev[k];else changed=true;}
      return changed?next:prev;
    });
  },[flights]);
  const confirmed=[...confirmedByKey.values()].sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||a.dep?.localeCompare(b.dep||"")||0);
  const unresolved=allFlights.filter(f=>f.status==="unresolved").sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||0);
  const byDate=confirmed.reduce((m,f)=>{(m[f.depDate]||(m[f.depDate]=[])).push(f);return m;},{});
  const dates=Object.keys(byDate).sort();

  const scanFlights=async()=>{
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const googleToken=session.provider_token;
      if(!googleToken){setScanMsg("Gmail access not available — re-login with Google.");return;}
      setScanning(true);setScanMsg("Scanning Gmail…");
      const showsArr=Object.values(shows||{}).map(s=>({id:s.id||s.date,date:s.date,venue:s.venue,city:s.city,type:s.type}));
      const resp=await fetch("/api/flights",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken,tourStart,tourEnd,shows:showsArr})});
      if(resp.status===402){setScanMsg("Gmail session expired — re-login.");setScanning(false);return;}
      const data=await resp.json();
      if(data.error){setScanMsg(`Error: ${data.error}`);setScanning(false);return;}
      const existingKeys=new Set(allFlights.map(flightDedupKey));
      const novel=(data.flights||[]).filter(f=>!flights[f.id]&&!existingKeys.has(flightDedupKey(f)));
      const freshCount=novel.filter(f=>f.fresh48h).length;
      const freshTag=freshCount?` (${freshCount} from last 48h)`:"";
      if(!novel.length){setScanMsg(`Scanned ${data.threadsFound} threads${data.freshThreads?` (${data.freshThreads} from last 48h)`:""} — no new flights.`);setScanning(false);return;}
      const additions={};novel.forEach(f=>{additions[f.id]={...f,status:"pending",suggestedCrewIds:matchPaxToCrew(f.pax,crew)};});
      setFlights(prev=>({...prev,...additions}));
      setScanMsg(`Added ${novel.length} flight${novel.length>1?"s":""}${freshTag} to travel days — confirm to sync crew.`);
    }catch(e){setScanMsg(`Scan failed: ${e.message}`);}
    setScanning(false);
  };

  const importFlight=f=>{uFlight(f.id,{...f,status:"pending"});setPendingImport(p=>p.filter(x=>x.id!==f.id));};
  const importAll=()=>{pendingImport.forEach(f=>uFlight(f.id,{...f,status:"pending"}));setPendingImport([]);};

  // Apply smart show-matching for one flight: treats the flight as part of a multi-leg itinerary
  // (all legs sharing confirmNo/bookingRef/pax), runs inbound-side (last leg destination) and
  // outbound-side (first leg origin) matching independently against the show list. A flight can
  // attach to BOTH a prior show (outbound) and an upcoming show (inbound) simultaneously.
  // Returns {inShow, outShow, legs, allLegObjs} so callers can report the matches.
  const assignFlightToShows=(f,allFlightsObj)=>{
    const legs=findItineraryLegs(f,allFlightsObj);
    if(!legs.length)return{inShow:null,outShow:null,legs:[],allLegObjs:[]};
    const firstLeg=legs[0],lastLeg=legs[legs.length-1];
    const allLegObjs=legs.map(flightToLeg);
    const inShow=matchShowByAirport(lastLeg.to,lastLeg.toCity,lastLeg.arrDate||lastLeg.depDate,sorted||[],"inbound");
    const outShow=matchShowByAirport(firstLeg.from,firstLeg.fromCity,firstLeg.depDate,sorted||[],"outbound");
    if(!f.pax?.length||!crew?.length)return{inShow,outShow,legs,allLegObjs};
    f.pax.forEach(name=>{
      if(!name)return;
      const match=matchPaxToCrew([name],crew).map(id=>crew.find(c=>c.id===id)).find(Boolean);
      if(!match)return;
      if(inShow){
        const inKey=f.partyId&&SPLIT_DAYS[inShow.date]?`${inShow.date}#${f.partyId}`:inShow.date;
        setShowCrew(p=>{
          const cur=p[inKey]?.[match.id]||{};
          const flightIds=new Set(allLegObjs.map(l=>l.flightId));
          const existing=(cur.inbound||[]).filter(l=>!flightIds.has(l.flightId));
          return{...p,[inKey]:{...p[inKey],[match.id]:{
            ...cur,attending:true,inboundMode:"fly",inboundConfirmed:true,
            inboundDate:lastLeg.arrDate||lastLeg.depDate,inboundTime:lastLeg.arr||"",
            inbound:[...existing,...allLegObjs]
          }}};
        });
      }
      if(outShow){
        const outKey=f.partyId&&SPLIT_DAYS[outShow.date]?`${outShow.date}#${f.partyId}`:outShow.date;
        setShowCrew(p=>{
          const cur=p[outKey]?.[match.id]||{};
          const flightIds=new Set(allLegObjs.map(l=>l.flightId));
          const existing=(cur.outbound||[]).filter(l=>!flightIds.has(l.flightId));
          return{...p,[outKey]:{...p[outKey],[match.id]:{
            ...cur,attending:true,outboundMode:"fly",outboundConfirmed:true,
            outboundDate:firstLeg.depDate,outboundTime:firstLeg.dep||"",
            outbound:[...existing,...allLegObjs]
          }}};
        });
      }
      // Fallback: no geographic match anywhere — use arrival date as show key (old behavior).
      if(!inShow&&!outShow){
        const arrD=f.arrDate||f.depDate;
        const arrKey=f.partyId&&SPLIT_DAYS[arrD]?`${arrD}#${f.partyId}`:arrD;
        setShowCrew(p=>{
          const cur=p[arrKey]?.[match.id]||{};
          const ex=(cur.inbound||[]).filter(l=>l.flightId!==f.id);
          return{...p,[arrKey]:{...p[arrKey],[match.id]:{
            ...cur,attending:true,inboundMode:"fly",inboundConfirmed:true,
            inboundDate:arrD,inboundTime:f.arr||"",inbound:[...ex,flightToLeg(f)]
          }}};
        });
      }
    });
    return{inShow,outShow,legs,allLegObjs};
  };

  const confirmFlight=f=>{
    setConfirmingId(f.id);
    uFlight(f.id,{...f,status:"confirmed",confirmedAt:new Date().toISOString()});
    if(f.cost&&f.cost>0){
      uFin(f.depDate,prev=>{
        const existing=(prev?.flightExpenses||[]).filter(e=>e.flightId!==f.id);
        return{...prev,flightExpenses:[...existing,{flightId:f.id,label:`${f.flightNo||f.carrier} ${f.from}→${f.to}`,amount:f.cost,currency:f.currency||"USD",pax:f.pax||[],carrier:f.carrier}]};
      });
    }
    assignFlightToShows(f,{...flights,[f.id]:{...f,status:"confirmed"}});
    setTimeout(()=>setConfirmingId(null),1200);
  };

  // Edit pax on a confirmed/pending flight. For confirmed flights, additionally:
  //   - pull this itinerary's legs out of removed pax's showCrew records (both inbound + outbound)
  //   - re-run show matching so newly-added pax get enrolled on matched shows
  // Pending/import flights just get the pax list updated; matching runs on confirm.
  const updatePax=(f,newPax)=>{
    const oldPax=f.pax||[];
    const cleaned=(newPax||[]).map(s=>String(s||"").trim()).filter(Boolean);
    const removed=oldPax.filter(p=>!cleaned.some(n=>n.toLowerCase()===p.toLowerCase()));
    const nextFlight={...f,pax:cleaned};
    uFlight(f.id,nextFlight);
    if(f.status!=="confirmed")return;
    const nextFlightsObj={...flights,[f.id]:nextFlight};
    const legs=findItineraryLegs(nextFlight,nextFlightsObj);
    const firstLeg=legs[0]||nextFlight,lastLeg=legs[legs.length-1]||nextFlight;
    const inShow=matchShowByAirport(lastLeg.to,lastLeg.toCity,lastLeg.arrDate||lastLeg.depDate,sorted||[],"inbound");
    const outShow=matchShowByAirport(firstLeg.from,firstLeg.fromCity,firstLeg.depDate,sorted||[],"outbound");
    const itinFlightIds=new Set(legs.map(l=>l.id));
    // Remove this itinerary's legs from removed-pax crew records on both matched shows.
    if(removed.length&&(inShow||outShow)){
      removed.forEach(name=>{
        const match=matchPaxToCrew([name],crew||[]).map(id=>(crew||[]).find(c=>c.id===id)).find(Boolean);
        if(!match)return;
        [inShow,outShow].filter(Boolean).forEach(show=>{
          setShowCrew(p=>{
            const cur=p[show.date]?.[match.id];if(!cur)return p;
            return{...p,[show.date]:{...p[show.date],[match.id]:{
              ...cur,
              inbound:(cur.inbound||[]).filter(l=>!itinFlightIds.has(l.flightId)),
              outbound:(cur.outbound||[]).filter(l=>!itinFlightIds.has(l.flightId)),
            }}};
          });
        });
      });
    }
    // Re-assign for the updated pax list. Idempotent for unchanged names; adds new ones.
    assignFlightToShows(nextFlight,nextFlightsObj);
  };
  // For a flight still in the pending-import tray, edit pax without persisting (pre-import).
  const updatePendingImportPax=(f,newPax)=>{
    const cleaned=(newPax||[]).map(s=>String(s||"").trim()).filter(Boolean);
    setPendingImport(p=>p.map(x=>x.id===f.id?{...x,pax:cleaned}:x));
  };

  // Re-run geographic+chronological matching across all confirmed flights. Useful after adding
  // new shows, correcting city data, or seeding flights ahead of attending confirmation.
  const reassignAllFlights=()=>{
    const conf=Object.values(flights).filter(f=>f.status==="confirmed");
    if(!conf.length){setReassignMsg("No confirmed flights to re-assign.");setTimeout(()=>setReassignMsg(""),3000);return;}
    const seenItin=new Set();
    let inCount=0,outCount=0,noneCount=0;
    conf.forEach(f=>{
      const key=flightItinKey(f);
      if(seenItin.has(key))return;
      seenItin.add(key);
      const{inShow,outShow}=assignFlightToShows(f,flights);
      if(inShow)inCount++;
      if(outShow)outCount++;
      if(!inShow&&!outShow)noneCount++;
    });
    setReassignMsg(`Matched ${inCount} inbound, ${outCount} outbound across ${seenItin.size} itinerary${seenItin.size>1?"s":""}. ${noneCount?`${noneCount} unmatched.`:""}`);
    setTimeout(()=>setReassignMsg(""),5000);
  };

  const fetchStatus=async(f)=>{
    if(!f.flightNo)return;
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const resp=await fetch("/api/flight-status",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({flightNo:f.flightNo,depDate:f.depDate})});
      if(!resp.ok)return;
      const data=await resp.json();
      if(data.status)setLiveStatuses(p=>({...p,[f.id]:data.status}));
    }catch(e){console.warn("[flight-status]",f.flightNo,e?.message||e);}
  };

  const refreshStatus=async(f)=>{
    setRefreshingId(f.id);
    await fetchStatus(f);
    setRefreshingId(null);
  };

  const refreshAllStatus=async()=>{
    const toRefresh=confirmed.filter(f=>f.flightNo);
    if(!toRefresh.length)return;
    setRefreshingAll(true);
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){setRefreshingAll(false);return;}
      const resp=await fetch("/api/flight-status",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({flights:toRefresh.map(f=>({flightNo:f.flightNo,depDate:f.depDate,id:f.id}))})});
      if(resp.ok){
        const data=await resp.json();
        const next={};
        toRefresh.forEach(f=>{const s=data.statuses?.[`${f.flightNo}__${f.depDate}`];if(s&&!s.error)next[f.id]=s;});
        setLiveStatuses(p=>({...p,...next}));
      }
    }catch(e){console.warn("[flight-status] refreshAll",e?.message||e);}
    setRefreshingAll(false);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {/* Scan bar */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:10,fontWeight:800,color:"var(--link)",letterSpacing:"0.06em"}}>✈ FLIGHTS</span>
        <span style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:"var(--info-bg)",color:"var(--link)",fontWeight:700}}>{confirmed.length} confirmed · {pending.length} pending</span>
        {scanMsg&&<span style={{fontSize:9,color:scanning?"var(--accent)":"var(--text-dim)",fontFamily:MN}}>{scanMsg}</span>}
        {reassignMsg&&<span style={{fontSize:9,color:"var(--success-fg)",fontFamily:MN,fontWeight:600}}>{reassignMsg}</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
          {confirmed.length>0&&<button onClick={reassignAllFlights} title="Re-match all confirmed flights to tour shows by airport proximity + date window" style={{background:"var(--card-3)",color:"var(--success-fg)",border:"1px solid var(--success-fg)",borderRadius:6,fontSize:10,padding:"5px 12px",cursor:"pointer",fontWeight:700}}>⟲ Re-match to Shows</button>}
          {confirmed.length>0&&<button onClick={refreshAllStatus} disabled={refreshingAll} style={{background:refreshingAll?"var(--border)":"var(--card-3)",color:refreshingAll?"var(--text-mute)":"var(--accent)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"5px 12px",cursor:refreshingAll?"default":"pointer",fontWeight:700}}>{refreshingAll?"Refreshing…":"⟳ Refresh Status"}</button>}
          <button onClick={scanFlights} disabled={scanning} style={{background:scanning?"var(--border)":"var(--link)",color:scanning?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,fontSize:10,padding:"5px 14px",cursor:scanning?"default":"pointer",fontWeight:700}}>{scanning?"Scanning…":"Scan Gmail for Flights"}</button>
        </div>
      </div>

      {/* Pending import */}
      {pendingImport.length>0&&(
        <div style={{background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:10,padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:9,fontWeight:800,color:"var(--link)",letterSpacing:"0.06em"}}>NEW — REVIEW BEFORE IMPORTING</span>
            <button onClick={importAll} style={{fontSize:9,padding:"3px 10px",borderRadius:6,border:"none",background:"var(--link)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import All ({pendingImport.length})</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {groupByReservation(pendingImport).map(g=>(
              <ReservationGroup key={g.key} g={g} defaultCollapsed={false} renderSegment={(f,ll)=>(
                <FlightCard f={f} crew={crew} legLabel={ll} actions={<>
                  <button onClick={()=>importFlight(f)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--link)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import</button>
                  <button onClick={()=>setPendingImport(p=>p.filter(x=>x.id!==f.id))} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer"}}>Skip</button>
                  {f.tid&&<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"var(--link)",textDecoration:"none",marginLeft:"auto"}}>open email ↗</a>}
                </>}/>
              )}/>
            ))}
          </div>
        </div>
      )}

      {/* Pending confirmation */}
      {pending.length>0&&(
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8}}>PENDING CONFIRMATION <span style={{background:"var(--warn-bg)",color:"var(--warn-fg)",borderRadius:10,padding:"1px 6px",fontWeight:700,fontSize:8}}>{pending.length}</span></div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {groupByReservation(pending).map(g=>(
              <ReservationGroup key={g.key} g={g} defaultCollapsed={false} renderSegment={(f,ll)=>{const isConf=confirmingId===f.id;return(
                <FlightCard f={f} crew={crew} legLabel={ll} onUpdatePax={newPax=>updatePax(f,newPax)} actions={<>
                  <button onClick={()=>confirmFlight(f)} disabled={isConf} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:isConf?"var(--success-fg)":"var(--link)",color:"#fff",cursor:isConf?"default":"pointer",fontWeight:700}}>{isConf?"✓ Synced!":"Confirm + Sync"}</button>
                  <button onClick={()=>uFlight(f.id,{...f,status:"unresolved"})} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer"}}>Dismiss</button>
                  {f.tid&&<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"var(--link)",textDecoration:"none",marginLeft:"auto"}}>email ↗</a>}
                </>}/>
              );}}/>
            ))}
          </div>
        </div>
      )}

      {/* Confirmed list */}
      {confirmed.length>0?(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {dates.map(date=>(
            <div key={date}>
              <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>goToSchedule(date)} style={{background:"none",border:"none",padding:0,cursor:"pointer",fontSize:9,fontWeight:800,color:"var(--accent)",letterSpacing:"0.08em",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:2}}>{fFull(date)}</button>
                <div style={{flex:1,height:1,background:"var(--border)"}}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {byDate[date].map(f=>{
                  const legs=findItineraryLegs(f,flights);
                  const firstLeg=legs[0]||f;const lastLeg=legs[legs.length-1]||f;
                  const inShow=matchShowByAirport(lastLeg.to,lastLeg.toCity,lastLeg.arrDate||lastLeg.depDate,sorted||[],"inbound");
                  const outShow=matchShowByAirport(firstLeg.from,firstLeg.fromCity,firstLeg.depDate,sorted||[],"outbound");
                  const matchBadge=(show,label,bg,c)=>show?<button onClick={()=>goToSchedule(show.date)} title={`${label} match: ${show.venue}`} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:`1px solid ${c}40`,background:bg,color:c,cursor:"pointer",fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}><span style={{fontSize:8,letterSpacing:"0.06em"}}>{label}</span>{show.city}<span style={{fontFamily:MN,fontSize:8,opacity:.7}}>{fD(show.date)}</span></button>:null;
                  // Connection warning — if this leg is a downstream leg in its itinerary, compute gap to prior leg.
                  const legIdx=legs.findIndex(l=>l.id===f.id);
                  const connRows=validateConnections(legs);
                  const connRow=legIdx>=0?connRows[legIdx]:null;
                  const connPill=connRow?.warning?(()=>{
                    const m=connRow.layover;
                    const label=m==null?connRow.warning:m<0?`✗ missed by ${Math.abs(m)}m`:m<60?`⚠ ${m}m layover`:`${Math.round(m/60*10)/10}h layover`;
                    const col=connRow.warning==="missed-connection"?"var(--danger-fg)":connRow.warning==="tight-connection"?"var(--warn-fg)":"var(--text-dim)";
                    const bg=connRow.warning==="missed-connection"?"var(--danger-bg)":connRow.warning==="tight-connection"?"var(--warn-bg)":"var(--card-soft,transparent)";
                    return <span title={`Connection at ${(f.from||"").toUpperCase()}`} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:`1px solid ${col}40`,background:bg,color:col,fontWeight:700}}>{label}</span>;
                  })():null;
                  // Return-trip chip.
                  const rtn=findReturnLeg(f,flights);
                  const rtnChip=rtn?(
                    <button onClick={()=>goToSchedule(rtn.depDate)} title={`Return leg ${(rtn.from||"").toUpperCase()}→${(rtn.to||"").toUpperCase()} ${rtn.depDate}`} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer",fontWeight:700}}>↔ return {fD(rtn.depDate)}</button>
                  ):null;
                  return(
                    <FlightCard key={f.id} f={f}
                      crew={crew}
                      defaultCollapsed={true}
                      onUpdatePax={newPax=>updatePax(f,newPax)}
                      liveStatus={liveStatuses[f.id]||null}
                      refreshing={refreshingId===f.id}
                      onRefreshStatus={f.flightNo?()=>refreshStatus(f):null}
                      actions={<>
                        {matchBadge(outShow,"← OUT","var(--warn-bg)","var(--warn-fg)")}
                        {matchBadge(inShow,"IN →","var(--success-bg)","var(--success-fg)")}
                        {connPill}
                        {rtnChip}
                        {!inShow&&!outShow&&<span style={{fontSize:9,color:"var(--text-mute)",fontStyle:"italic"}}>No show match — add city to airport table to match.</span>}
                        <button onClick={()=>goToSchedule(f.depDate)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--info-bg)",background:"var(--info-bg)",color:"var(--link)",cursor:"pointer",fontWeight:700}}>→ Schedule {f.depDate?.slice(5)}</button>
                        {f.arrDate&&f.arrDate!==f.depDate&&<button onClick={()=>goToSchedule(f.arrDate)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--info-bg)",background:"var(--info-bg)",color:"var(--link)",cursor:"pointer",fontWeight:700}}>→ Arr {f.arrDate?.slice(5)}</button>}
                        <button onClick={()=>uFlight(f.id,{...f,status:"unresolved"})} style={{marginLeft:"auto",fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-mute)",cursor:"pointer"}}>Remove</button>
                      </>}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ):(pendingImport.length===0&&pending.length===0&&unresolved.length===0&&(
        <div style={{padding:"40px 0",textAlign:"center",color:"var(--text-mute)"}}><div style={{fontSize:20,marginBottom:8,opacity:0.25}}>✈</div><div style={{fontSize:11}}>No flights yet.</div><div style={{fontSize:10,marginTop:4}}>Hit "Scan Gmail for Flights" above to import from email.</div></div>
      ))}

      {/* Unresolved */}
      {unresolved.length>0&&(
        <IntelSection title="UNRESOLVED" count={unresolved.length}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {unresolved.map(f=>(
              <FlightCard key={f.id} f={f} crew={crew} actions={<>
                <button onClick={()=>uFlight(f.id,{...f,status:"pending"})} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--info-bg)",background:"var(--info-bg)",color:"var(--link)",cursor:"pointer",fontWeight:700}}>↩ Restore</button>
                <button onClick={()=>uFlight(f.id,null)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--danger-bg)",background:"transparent",color:"var(--danger-fg)",cursor:"pointer"}}>Delete</button>
              </>}/>
            ))}
          </div>
        </IntelSection>
      )}
    </div>
  );
}

// Per-date aggregated view of all travel segments (flights + ground transfers + bus + rail + hotel check-ins).
// Master Tour-style: chronological list on the left, editor drawer on the right. The currently-selected show
// date (sel) drives what's displayed; header shows a prev/next stepper and jumps to the Travel Dates menu.
function TravelDayView(){
  const{flights,uFlight,sel,setSel,setDateMenu,shows,sorted,tourDaysSorted,crew,setShowCrew,showCrew,mobile,pushUndo,currentSplit,activeSplitParty,activeSplitPartyId,lodging}=useContext(Ctx);
  const[activeId,setActiveId]=useState(null);
  const[addType,setAddType]=useState(null);
  const[travelNotes,setTravelNotes]=useState("");
  const curShow=shows?.[sel];
  const curDay=(tourDaysSorted||[]).find(d=>d.date===sel);
  const title=currentSplit?(activeSplitParty?.label||"Split Day"):curShow?.venue||curShow?.city||(curDay?.type==="travel"?"Travel Day":curDay?.type==="off"?"Off Day":"—");
  const subTitle=curShow?curShow.city:(curDay?.city||"");

  // Build a pax-name matcher for the active split party (if any). Segments are
  // filtered to ones whose pax overlaps the active party's crew. Segments tagged
  // with partyId override the pax check. Untagged, no-pax segments show on all
  // parties (shared ground transport, etc.).
  const partyMatch=useMemo(()=>{
    if(!currentSplit||!activeSplitParty)return null;
    const names=(activeSplitParty.crew||[]).map(id=>{
      const c=(crew||[]).find(x=>x.id===id);
      return (c?.name||id).toLowerCase();
    });
    return {names,partyId:activeSplitPartyId};
  },[currentSplit,activeSplitParty,activeSplitPartyId,crew]);

  // Auto-scope legacy segments: on a split day, tag each untagged segment with
  // the unique party whose crew overlaps its pax. Ambiguous/zero-match segments
  // stay shared.
  useEffect(()=>{
    if(!currentSplit)return;
    const partyNames=currentSplit.parties.map(p=>({id:p.id,names:(p.crew||[]).map(id=>{
      const c=(crew||[]).find(x=>x.id===id);return (c?.name||id).toLowerCase();
    })}));
    Object.values(flights||{}).forEach(s=>{
      if(!s||s.status==="dismissed")return;
      if(s.partyId)return;
      if(s.depDate!==sel&&s.arrDate!==sel)return;
      const pax=(s.pax||[]).filter(Boolean).map(n=>String(n).toLowerCase());
      if(!pax.length)return;
      const hits=partyNames.filter(p=>p.names.some(n=>pax.some(x=>x.includes(n)||n.includes(x.split(" ")[0]))));
      if(hits.length===1)uFlight(s.id,{...s,partyId:hits[0].id});
    });
  },[sel,currentSplit,flights,crew]);// eslint-disable-line react-hooks/exhaustive-deps

  // Flight IDs directly assigned to crew members of the active split party via the
  // Crew tab. These bypass pax-name matching so segments show even when pax is unset
  // or uses a different name format.
  const crewLinkedFlightIds=useMemo(()=>{
    if(!currentSplit||!activeSplitPartyId)return new Set();
    const sc=showCrew[`${sel}#${activeSplitPartyId}`]||{};
    const ids=new Set();
    Object.values(sc).forEach(cd=>{
      if(!cd?.attending)return;
      ["inbound","outbound"].forEach(dir=>{(cd[dir]||[]).forEach(leg=>{if(leg.flightId)ids.add(leg.flightId);});});
    });
    return ids;
  },[sel,activeSplitPartyId,showCrew,currentSplit]);

  // All non-dismissed segments touching sel (depDate === sel OR arrDate === sel).
  const daySegs=useMemo(()=>{
    const segMatches=s=>{
      if(!partyMatch)return true;
      if((s.excludedParties||[]).includes(partyMatch.partyId))return false;
      if(crewLinkedFlightIds.has(s.id))return true;
      if(s.partyId)return s.partyId===partyMatch.partyId;
      const pax=(s.pax||[]).filter(Boolean);
      if(!pax.length)return true;
      const lo=pax.map(n=>String(n).toLowerCase());
      return partyMatch.names.some(n=>lo.some(p=>p.includes(n)||n.includes(p.split(" ")[0])));
    };
    return Object.values(flights||{})
      .filter(s=>s&&s.status!=="dismissed")
      .filter(s=>s.depDate===sel||s.arrDate===sel)
      .filter(segMatches)
      .map(s=>{
        const isDep=s.depDate===sel;
        const isArrOnly=s.arrDate===sel&&s.arrDate!==s.depDate;
        const sortMin=(isArrOnly?hhmmToMin(s.arr):hhmmToMin(s.dep))??0;
        return{...s,_role:isArrOnly?"arr":"dep",_sort:sortMin};
      })
      .sort((a,b)=>a._sort-b._sort);
  },[flights,sel,partyMatch,crewLinkedFlightIds]);

  const active=daySegs.find(s=>s.id===activeId)||null;

  // Timeline: chronological strip of all same-day events + hotel check-ins/outs.
  const timeline=useMemo(()=>buildDayTimeline(sel,daySegs,lodging),[sel,daySegs,lodging]);
  // Air-arrivals on this date whose next timeline entry is flagged `unbridged` — candidates for a ground-suggestion ghost row.
  const unbridgedAirIds=useMemo(()=>{
    const ids=new Set();
    for(let i=1;i<timeline.length;i++){
      const prev=timeline[i-1],cur=timeline[i];
      if(cur.warning==="unbridged"&&prev.kind==="air"&&prev.isArr&&prev.seg?.id)ids.add(prev.seg.id);
    }
    return ids;
  },[timeline]);
  // Hotel destination on this date (pulled from lodging store) for ground-suggestion defaults.
  const destHotel=useMemo(()=>{
    const today=Object.values(lodging||{}).find(h=>h&&h.checkIn===sel);
    return today||null;
  },[lodging,sel]);

  // Add a new segment (local-only until first save; uses timestamp-based id).
  const handleAdd=(type)=>{
    const id=`${type==="air"?"fl":"seg"}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
    const base={id,type,status:"confirmed",depDate:sel,arrDate:sel,dep:"",arr:"",from:"",to:"",fromCity:"",toCity:"",pax:[]};
    const withParty=currentSplit&&activeSplitPartyId?{...base,partyId:activeSplitPartyId}:base;
    const seed=type==="ground"?{...withParty,mode:"uber"}:type==="hotel"?{...withParty,hotelName:"",arr:"15:00",dep:"11:00"}:withParty;
    uFlight(id,seed);
    setActiveId(id);setAddType(null);
  };

  const pax=(seg)=>(seg?.pax||[]).filter(Boolean);
  const paxMatch=name=>(crew||[]).find(c=>c.name&&c.name.toLowerCase().includes(String(name).split(" ")[0].toLowerCase()));

  const busDay=BUS_DATA_MAP[sel]||null;
  const dayLabel=curDay?.type==="travel"?"Travel Day":curDay?.type==="split"?"Split Day":curDay?.type==="off"?"Off Day":"Show Day";

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12,minHeight:0}}>
      {/* Header */}
      <div style={{background:"linear-gradient(90deg,var(--accent) 0%,var(--accent) 100%)",borderRadius:10,padding:"14px 18px",color:"#fff",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:20,fontWeight:800,letterSpacing:"-0.02em"}}>{title}</div>
          <div style={{fontSize:11,color:"var(--accent-pill-bg)",marginTop:2}}>{subTitle}</div>
          <div style={{fontSize:9,fontFamily:MN,color:"var(--accent-pill-border)",marginTop:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Travel Notes</div>
          <textarea value={travelNotes} onChange={e=>setTravelNotes(e.target.value)} placeholder="Notes for today's travel (scratchpad, not persisted yet)" rows={2} style={{marginTop:4,width:"100%",minWidth:220,maxWidth:560,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:6,padding:"6px 9px",color:"#fff",fontSize:10,fontFamily:"'Outfit',system-ui",resize:"vertical",outline:"none"}}/>
        </div>
        <div style={{textAlign:"right",fontSize:11,color:"var(--accent-pill-bg)",flexShrink:0}}>
          <div style={{fontWeight:700,fontSize:11,color:"#fff"}}>{fFull(sel)}</div>
          <div style={{fontSize:10,marginTop:2,letterSpacing:"0.04em",textTransform:"uppercase",color:"var(--accent-pill-border)"}}>{dayLabel}</div>
          <button onClick={()=>setDateMenu(true)} style={{marginTop:8,background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",fontSize:10,padding:"4px 10px",borderRadius:6,cursor:"pointer",fontWeight:700}}>☰ Change Day</button>
        </div>
      </div>

      {/* EU Bus Schedule context for selected date */}
      {busDay&&(
        <div style={{background:busDay.show?"var(--success-bg)":"var(--info-bg)",border:`1px solid ${busDay.show?"var(--success-bg)":"var(--info-bg)"}`,borderRadius:10,padding:"10px 14px",display:"flex",gap:14,alignItems:"flex-start",flexWrap:"wrap"}}>
          <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
            <div style={{fontSize:8,fontWeight:800,color:busDay.show?"var(--success-fg)":"var(--info-fg)",letterSpacing:"0.08em",textTransform:"uppercase"}}>{busDay.show?"Show Day":"Travel Day"} · EU Day {busDay.day}</div>
            <div style={{fontSize:13,fontWeight:800,color:busDay.show?"var(--success-fg)":"var(--info-fg)"}}>{busDay.show?(busDay.venue||busDay.route):busDay.route}</div>
            <div style={{fontSize:9,color:busDay.show?"var(--success-fg)":"var(--info-fg)",fontFamily:MN}}>{busDay.date} · {busDay.dow}</div>
          </div>
          {!busDay.show&&(
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
              {busDay.dep!=="—"&&<div style={{background:"var(--card)",border:"1px solid var(--info-bg)",borderRadius:6,padding:"5px 10px",textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-dim)",fontWeight:700,letterSpacing:"0.06em"}}>DEP</div>
                <div style={{fontFamily:MN,fontSize:13,fontWeight:800,color:"var(--info-fg)"}}>{busDay.dep}</div>
              </div>}
              {busDay.arr!=="—"&&<div style={{background:"var(--card)",border:"1px solid var(--info-bg)",borderRadius:6,padding:"5px 10px",textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-dim)",fontWeight:700,letterSpacing:"0.06em"}}>ARR</div>
                <div style={{fontFamily:MN,fontSize:13,fontWeight:800,color:"var(--info-fg)"}}>{busDay.arr}</div>
              </div>}
              {busDay.km>0&&<div style={{textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-dim)",fontWeight:700,letterSpacing:"0.06em"}}>KM</div>
                <div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:"var(--info-fg)"}}>{busDay.km}</div>
              </div>}
              {busDay.drive!=="—"&&<div style={{textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-dim)",fontWeight:700,letterSpacing:"0.06em"}}>DRIVE</div>
                <div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:busDay.flag==="⚠"?"var(--danger-fg)":"var(--info-fg)"}}>{busDay.drive}{busDay.flag&&<span style={{marginLeft:4}}>{busDay.flag}</span>}</div>
              </div>}
            </div>
          )}
          {busDay.note&&<div style={{fontSize:9,color:"var(--text-2)",fontStyle:"italic",alignSelf:"center",maxWidth:240}}>{busDay.note}</div>}
          <div style={{marginLeft:"auto",fontSize:8,color:"var(--text-mute)",fontFamily:MN,alignSelf:"flex-end",flexShrink:0}}>Pieter Smit T26-021201</div>
        </div>
      )}

      {/* Travel Day Timeline — chronological strip with gaps + warnings */}
      {timeline.length>0&&(
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 14px"}}>
          <div style={{fontSize:8,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:6}}>TIMELINE</div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",fontFamily:MN,fontSize:10}}>
            {timeline.map((e,i)=>{
              const icon=e.kind==="air"?"✈":e.kind==="ground"?"🚗":e.kind==="bus"?"🚌":e.kind==="rail"?"🚆":e.kind==="hotel"||e.kind==="hotel_in"||e.kind==="hotel_out"?"🏨":"◆";
              const m=e.kind==="hotel_in"||e.kind==="hotel_out"?SEG_META.hotel:SEG_META[e.kind]||SEG_META.air;
              const warnColor=e.warning==="missed-connection"?"var(--danger-fg)":(e.warning==="tight-connection"||e.warning==="unbridged")?"var(--warn-fg)":"var(--text-dim)";
              const warnBg=e.warning==="missed-connection"?"var(--danger-bg)":(e.warning==="tight-connection"||e.warning==="unbridged")?"var(--warn-bg)":"transparent";
              const gapLabel=e.gapBefore!=null?(e.gapBefore<60?`${e.gapBefore}m`:`${Math.round(e.gapBefore/60*10)/10}h`):null;
              return(
                <React.Fragment key={i}>
                  {i>0&&gapLabel&&(
                    <span title={e.warning||""} style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:warnBg,color:warnColor,border:e.warning?`1px solid ${warnColor}40`:"1px dashed var(--border)",fontWeight:700}}>
                      {e.warning==="unbridged"?`⚠ ${gapLabel} unbridged`:e.warning==="tight-connection"?`⚠ ${gapLabel} layover`:e.warning==="missed-connection"?`✗ missed`:gapLabel}
                    </span>
                  )}
                  <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 8px",borderRadius:6,background:m.bg,color:m.color,fontWeight:700,border:`1px solid ${m.border}`}}>
                    <span>{icon}</span>
                    <span>{e.start}</span>
                    <span style={{opacity:.8}}>{e.kind==="hotel_in"?"check-in":e.kind==="hotel_out"?"check-out":e.label}</span>
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Add bar */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.06em"}}>ADD SEGMENT</span>
        {[["air","✈ Flight"],["ground","🚗 Ground"],["bus","🚌 Bus"],["rail","🚆 Rail"],["hotel","🏨 Hotel"]].map(([k,l])=>(
          <button key={k} onClick={()=>handleAdd(k)} style={{fontSize:10,padding:"4px 11px",borderRadius:6,border:`1px solid ${SEG_META[k].border}`,background:SEG_META[k].bg,color:SEG_META[k].color,cursor:"pointer",fontWeight:700}}>{l}</button>
        ))}
        <span style={{marginLeft:"auto",fontSize:9,color:"var(--text-mute)",fontFamily:MN}}>{daySegs.length} segment{daySegs.length===1?"":"s"} on {fD(sel)}</span>
      </div>

      {/* Day list + drawer */}
      <div style={{display:"flex",gap:12,flexWrap:mobile?"wrap":"nowrap",minHeight:0}}>
        {/* Left: day list */}
        <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:6}}>
          {daySegs.length===0&&(
            <div style={{padding:"28px 0",textAlign:"center",background:"var(--card)",border:"1px dashed var(--border)",borderRadius:10}}>
              <div style={{fontSize:20,marginBottom:6,opacity:0.25}}>◌</div>
              <div style={{fontSize:11,fontWeight:600,color:"var(--text)",marginBottom:3}}>No travel on this day</div>
              <div style={{fontSize:10,color:"var(--text-mute)"}}>Use the buttons above to add a flight, ground transfer, or hotel check-in.</div>
            </div>
          )}
          {daySegs.map(s=>{
            const m=segMeta(s);const isActive=s.id===activeId;
            const timeLabel=s._role==="arr"?`Arr ${s.arr||"—"}`:`${s.dep||"—"}${s.arr?` – ${s.arr}`:""}`;
            const routeLabel=segType(s)==="hotel"?(s.hotelName||s.to||"Hotel"):`${s.from||"—"}${s.to?` → ${s.to}`:""}`;
            const needsGround=unbridgedAirIds.has(s.id);
            const addGroundBridge=()=>{
              const id=`seg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
              const arrMin=hhmmToMin(s.arr)??0;
              const depMin=arrMin+20; // 20m customs buffer
              const pad=n=>String(n).padStart(2,"0");
              const dep=`${pad(Math.floor(depMin/60)%24)}:${pad(depMin%60)}`;
              const toLabel=destHotel?(destHotel.hotelName||destHotel.city||""):"";
              const seed={id,type:"ground",status:"confirmed",mode:"uber",depDate:sel,arrDate:sel,dep,arr:"",from:s.to||"",fromCity:s.toCity||"",to:toLabel,toCity:destHotel?.city||s.toCity||"",pax:[...(s.pax||[])],...(currentSplit&&activeSplitPartyId?{partyId:activeSplitPartyId}:{})};
              uFlight(id,seed);setActiveId(id);
            };
            const detail=segType(s)==="air"?`${s.flightNo||""} ${s.carrier||""}`.trim():segType(s)==="ground"?`${s.mode||"drive"}${s.provider?` · ${s.provider}`:""}`:segType(s)==="hotel"?(s.hotelName||""):(s.carrier||s.mode||"");
            const paxList=pax(s);
            return(
              <React.Fragment key={s.id}>
              <div onClick={()=>setActiveId(s.id)} className="rh" style={{display:"grid",gridTemplateColumns:"20px auto 1fr auto",gap:10,padding:"9px 12px",background:"var(--card)",border:`1px solid ${isActive?m.border:"var(--border)"}`,borderLeft:`3px solid ${m.color}`,borderRadius:10,cursor:"pointer",boxShadow:isActive?"0 0 0 2px var(--accent-pill-bg)":undefined}}>
                <div style={{fontSize:13,lineHeight:1,paddingTop:2}}>{m.icon}</div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2,flexShrink:0,minWidth:90}}>
                  {paxList.length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {paxList.slice(0,3).map((n,i)=>{const mch=paxMatch(n);return(
                      <span key={i} style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:mch?"var(--success-bg)":"var(--card-2)",color:mch?"var(--success-fg)":"var(--text-2)",fontWeight:700,letterSpacing:"0.02em"}}>{String(n).split(" ")[0].toUpperCase()}</span>
                    );})}
                    {paxList.length>3&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--card-2)",color:"var(--text-dim)",fontWeight:700}}>+{paxList.length-3}</span>}
                  </div>}
                  <div style={{fontFamily:MN,fontSize:10,fontWeight:700,color:m.color}}>{timeLabel}</div>
                </div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{routeLabel}</div>
                  {detail&&<div style={{fontSize:9,color:"var(--text-dim)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{detail}</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                  {s._role==="arr"&&<span style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--success-bg)",color:"var(--success-fg)",fontWeight:800,letterSpacing:"0.06em"}}>ARR</span>}
                  {s.fresh48h&&s.status!=="confirmed"&&<span style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"var(--accent-pill-bg)",color:"var(--accent)",fontWeight:800,letterSpacing:"0.06em"}}>NEW</span>}
                  {partyMatch&&s.partyId!==partyMatch.partyId&&<button onClick={e=>{e.stopPropagation();
                    const excl=(s.excludedParties||[]).filter(p=>p!==partyMatch.partyId);
                    uFlight(s.id,{...s,partyId:partyMatch.partyId,excludedParties:excl});
                  }} title={`Scope to ${activeSplitParty?.label||"this event"}`} style={{fontSize:8,padding:"2px 6px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card-3)",color:"var(--text-dim)",cursor:"pointer",fontWeight:700,letterSpacing:"0.04em"}}>↳ {(activeSplitParty?.label||"SCOPE").toUpperCase()}</button>}
                  <button onClick={e=>{e.stopPropagation();if(confirm(`Delete this ${m.label.toLowerCase()}?`)){const prev={...s};let next;
                    if(partyMatch&&!(s.partyId&&s.partyId===partyMatch.partyId)){
                      const excl=new Set(s.excludedParties||[]);excl.add(partyMatch.partyId);
                      next={...s,excludedParties:[...excl]};
                    }else{next={...s,status:"dismissed"};}
                    uFlight(s.id,next);pushUndo(`${m.label} deleted.`,()=>uFlight(s.id,prev));if(activeId===s.id)setActiveId(null);}}} title="Delete segment" style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13,lineHeight:1,padding:"0 4px"}}>×</button>
                </div>
              </div>
              {needsGround&&(
                <button onClick={addGroundBridge} title="Add ground bridge from airport to hotel" style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",background:"transparent",border:"1px dashed var(--warn-fg)",borderLeft:"3px solid var(--warn-fg)",borderRadius:10,color:"var(--warn-fg)",cursor:"pointer",textAlign:"left",fontSize:10,fontWeight:700,letterSpacing:"0.02em"}}>
                  <span style={{fontSize:13}}>＋</span>
                  <span>Add ground: {s.to||s.toCity||"airport"} → {destHotel?.hotelName||destHotel?.city||"hotel"} · ~20m buffer · Uber</span>
                </button>
              )}
              </React.Fragment>
            );
          })}
        </div>
        {/* Right: editor drawer */}
        {active&&<SegmentDrawer key={active.id} seg={active} crew={crew||[]} sorted={sorted||[]} onChange={patch=>uFlight(active.id,{...active,...patch})} onClose={()=>setActiveId(null)}/>}
      </div>
    </div>
  );
}

// Editor drawer for one segment. Fields adapt to type (air/ground/bus/rail/hotel).
// For ground transfers going TO a known airport, the pickup-time suggestion uses the
// matched flight's scheduled dep minus the airport buffer.
function SegmentDrawer({seg,crew,sorted,onChange,onClose}){
  const{flights}=useContext(Ctx);
  const t=segType(seg);const m=segMeta(seg);
  const[hasBag,setHasBag]=useState(seg.hasBag!==false);
  // Pickup-time suggestion when a ground transfer ends at a known airport. Finds the
  // matching outbound flight (same-day, same dep airport, pax overlap) and computes
  // when this ground segment should arrive at the airport: flight.dep - airport buffer.
  const suggestion=useMemo(()=>{
    if(t!=="ground"||!seg.to||!seg.depDate)return null;
    const toIata=String(seg.to).toUpperCase();
    if(!AIRPORT_BUFFERS[toIata])return null;
    const buffer=airportBufferMin(toIata,hasBag);
    const paxSet=new Set((seg.pax||[]).map(n=>String(n||"").toLowerCase()));
    const sameDay=Object.values(flights||{}).filter(f=>segType(f)==="air"&&f.status!=="dismissed"&&f.depDate===seg.depDate&&String(f.from||"").toUpperCase()===toIata);
    const match=sameDay.find(f=>{
      if(!paxSet.size)return true;
      return(f.pax||[]).some(n=>paxSet.has(String(n||"").toLowerCase()));
    });
    if(!match||!match.dep)return{buffer,airport:toIata,match:null,arriveBy:null};
    return{buffer,airport:toIata,match,arriveBy:subtractMinutes(match.dep,buffer)};
  },[t,seg.to,seg.depDate,seg.pax,hasBag,flights]);

  const setField=(k,v)=>onChange({[k]:v});
  const inp={background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,fontSize:11,padding:"5px 8px",outline:"none",fontFamily:"'Outfit',system-ui",width:"100%",boxSizing:"border-box"};
  const lab={fontSize:8,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.06em",marginBottom:3,textTransform:"uppercase"};
  const sub=(label,children)=>(<div style={{display:"flex",flexDirection:"column",gap:0,minWidth:0}}><div style={lab}>{label}</div>{children}</div>);

  return(
    <div style={{width:380,maxWidth:"100%",flexShrink:0,background:"var(--card)",border:`1px solid ${m.border}`,borderRadius:10,padding:12,display:"flex",flexDirection:"column",gap:10,alignSelf:"flex-start",position:"sticky",top:0}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:16}}>{m.icon}</span>
        <div style={{fontSize:13,fontWeight:800,color:m.color,letterSpacing:"-0.01em"}}>{m.label}</div>
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          {[["confirmed","Confirmed","var(--success-fg)","var(--success-bg)"],["pending","Pending","var(--warn-fg)","var(--warn-bg)"]].map(([v,l,c,bg])=>(
            <button key={v} onClick={()=>setField("status",v)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:700,background:seg.status===v?bg:"var(--card-3)",color:seg.status===v?c:"var(--text-dim)"}}>{l}</button>
          ))}
          <button onClick={onClose} title="Close" style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-dim)",fontSize:16,lineHeight:1}}>×</button>
        </div>
      </div>

      {/* Type-specific identity row */}
      {t==="air"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {sub("Flight #",<input value={seg.flightNo||""} onChange={e=>setField("flightNo",e.target.value)} placeholder="AC601" style={{...inp,fontFamily:MN}}/>)}
          {sub("Carrier",<input value={seg.carrier||""} onChange={e=>setField("carrier",e.target.value)} placeholder="Air Canada" style={inp}/>)}
        </div>
      )}
      {t==="ground"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {sub("Mode",<select value={seg.mode||"uber"} onChange={e=>setField("mode",e.target.value)} style={inp}>{["uber","lyft","drive","taxi","rideshare","friend","shuttle"].map(m=><option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}</select>)}
          {sub("Provider / Driver",<input value={seg.provider||""} onChange={e=>setField("provider",e.target.value)} placeholder="e.g. Guillaume, Uber Black" style={inp}/>)}
        </div>
      )}
      {(t==="bus"||t==="rail"||t==="sea")&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {sub(t==="rail"?"Train #":"Operator",<input value={seg.flightNo||seg.carrier||""} onChange={e=>setField(t==="rail"?"flightNo":"carrier",e.target.value)} placeholder={t==="rail"?"Eurostar 9137":"Pieter Smit"} style={inp}/>)}
          {sub("Confirmation",<input value={seg.confirmNo||""} onChange={e=>setField("confirmNo",e.target.value)} style={{...inp,fontFamily:MN}}/>)}
        </div>
      )}
      {t==="hotel"&&(
        <div>
          {sub("Hotel",<input value={seg.hotelName||""} onChange={e=>setField("hotelName",e.target.value)} placeholder="Hotel name" style={inp}/>)}
        </div>
      )}

      {/* Route */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {sub(t==="hotel"?"Address":"From",<input value={seg.from||""} onChange={e=>setField("from",e.target.value)} placeholder={t==="air"?"DUB":t==="ground"?"Hotel Name / Address":"Origin"} style={inp}/>)}
        {t!=="hotel"&&sub("To",<input value={seg.to||""} onChange={e=>setField("to",e.target.value)} placeholder={t==="air"?"AMS":"Venue / Airport"} style={inp}/>)}
      </div>
      {(t==="air"||t==="ground"||t==="bus"||t==="rail"||t==="sea")&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {sub("From City",<input value={seg.fromCity||""} onChange={e=>setField("fromCity",e.target.value)} placeholder="Dublin" style={inp}/>)}
          {sub("To City",<input value={seg.toCity||""} onChange={e=>setField("toCity",e.target.value)} placeholder="Amsterdam" style={inp}/>)}
        </div>
      )}

      {/* Times */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
        {sub("Dep Date",<input type="date" value={seg.depDate||""} onChange={e=>setField("depDate",e.target.value)} style={{...inp,fontFamily:MN}}/>)}
        {sub("Dep Time",<input type="time" value={seg.dep||""} onChange={e=>setField("dep",e.target.value)} style={{...inp,fontFamily:MN}}/>)}
        {sub("Arr Date",<input type="date" value={seg.arrDate||""} onChange={e=>setField("arrDate",e.target.value)} style={{...inp,fontFamily:MN}}/>)}
        {sub("Arr Time",<input type="time" value={seg.arr||""} onChange={e=>setField("arr",e.target.value)} style={{...inp,fontFamily:MN}}/>)}
      </div>

      {/* Ground → airport pickup suggestion */}
      {suggestion&&(
        <div style={{background:"var(--warn-bg)",border:"1px solid var(--warn-bg)",borderRadius:6,padding:"8px 10px",fontSize:10}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontSize:9,fontWeight:800,color:"var(--warn-fg)",letterSpacing:"0.06em"}}>AIRPORT PICKUP</span>
            <span style={{marginLeft:"auto",display:"flex",gap:2,background:"var(--card)",padding:2,borderRadius:6}}>
              {[[true,"With bag"],[false,"Carry-on"]].map(([v,l])=>(
                <button key={String(v)} onClick={()=>setHasBag(v)} style={{fontSize:8,padding:"2px 7px",borderRadius:4,border:"none",background:hasBag===v?"var(--warn-fg)":"transparent",color:hasBag===v?"var(--card)":"var(--warn-fg)",cursor:"pointer",fontWeight:700}}>{l}</button>
              ))}
            </span>
          </div>
          {suggestion.match?(
            <>
              <div style={{color:"var(--warn-fg)"}}>
                Matched outbound <strong style={{fontFamily:MN}}>{suggestion.match.flightNo||suggestion.match.carrier}</strong> departing <strong style={{fontFamily:MN}}>{suggestion.airport}</strong> at <strong style={{fontFamily:MN}}>{suggestion.match.dep}</strong>. Arrive airport by <strong style={{fontFamily:MN,fontSize:11}}>{suggestion.arriveBy}</strong> ({suggestion.buffer} min buffer).
              </div>
              <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                <button onClick={()=>{setField("arr",suggestion.arriveBy?.replace("*",""));if(!seg.arrDate)setField("arrDate",seg.depDate);}} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",background:"var(--warn-fg)",color:"#fff",cursor:"pointer",fontWeight:700}}>Set arrival = {suggestion.arriveBy}</button>
                {(seg.pax||[]).length===0&&suggestion.match.pax?.length>0&&<button onClick={()=>setField("pax",suggestion.match.pax)} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--warn-bg)",background:"var(--card)",color:"var(--warn-fg)",cursor:"pointer",fontWeight:700}}>Copy pax from flight ({suggestion.match.pax.length})</button>}
              </div>
            </>
          ):(
            <div style={{color:"var(--warn-fg)"}}>
              {suggestion.airport} buffer: <strong>{suggestion.buffer} min</strong> before scheduled dep. No matching outbound flight found in the travel day — set pax, or add the flight first.
            </div>
          )}
          <div style={{marginTop:4,fontSize:9,color:"var(--warn-fg)",fontStyle:"italic"}}>Override manually if local traffic or pickup window differs.</div>
        </div>
      )}

      {/* Pax */}
      <div>
        <div style={lab}>Passengers</div>
        <PaxEditor pax={seg.pax||[]} crew={crew} onSave={newPax=>setField("pax",(newPax||[]).map(s=>String(s||"").trim()).filter(Boolean))}/>
      </div>

      {/* Codes: PNR / Ticket# / Cost */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {sub("PNR",<input value={seg.pnr||""} onChange={e=>setField("pnr",e.target.value)} placeholder="F9OCAU" style={{...inp,fontFamily:MN}}/>)}
        {sub("Ticket # (e-ticket)",<input value={seg.ticketNo||""} onChange={e=>setField("ticketNo",e.target.value)} placeholder="001-1234567890" style={{...inp,fontFamily:MN}}/>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {sub("Cost",<input type="number" value={seg.cost||""} onChange={e=>setField("cost",Number(e.target.value)||"")} placeholder="0.00" style={inp}/>)}
      </div>
      {sub("Notes",<textarea value={seg.notes||""} onChange={e=>setField("notes",e.target.value)} rows={2} placeholder="Dispatch instructions, pickup location, etc." style={{...inp,resize:"vertical",minHeight:50}}/>)}
    </div>
  );
}

function TransTab(){
  const{flights,uFlight,sel,labelIntel,transView:view,setTransView:setView}=useContext(Ctx);
  const[crewFlightsOpen,setCrewFlightsOpen]=useState(false);
  const confirmedCount=Object.values(flights).filter(f=>f.status==="confirmed").length;
  const daySegCount=Object.values(flights).filter(s=>s.status!=="dismissed"&&(s.depDate===sel||s.arrDate===sel)).length;
  return(
    <div className="fi" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 115px)"}}>
      <div style={{padding:"7px 20px",borderBottom:"1px solid var(--border)",background:"var(--card)",display:"flex",gap:6,flexShrink:0,alignItems:"center",flexWrap:"nowrap",overflowX:"auto",scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
        {[["travel",`Travel Day${daySegCount>0?` (${daySegCount})`:""}`],["flights",`✈ Flights${confirmedCount>0?` (${confirmedCount})`:""}`]].map(([v,l])=>(
          <button key={v} onClick={()=>setView(v)} style={{padding:"4px 12px",borderRadius:6,border:"1px solid var(--border)",background:view===v?"var(--accent)":"var(--card-3)",color:view===v?"var(--card)":"var(--text-dim)",fontSize:10,fontWeight:700,cursor:"pointer"}}>{l}</button>
        ))}
      </div>
      <div style={{flex:1,overflow:"auto",padding:"12px 20px 30px"}}>
        {view==="travel"&&<><TravelDayView/><div style={{margin:"20px 0 8px",display:"flex",alignItems:"center",gap:10}}><div style={{flex:1,height:1,background:"var(--border)"}}></div><span style={{fontSize:8,fontWeight:800,color:"var(--text-mute)",letterSpacing:"0.1em",whiteSpace:"nowrap"}}>TOUR CALENDAR</span><div style={{flex:1,height:1,background:"var(--border)"}}></div></div><TourCalendar/></>}
        {view==="flights"&&<>{labelIntel?.crewFlights?.length>0&&(
          <div style={{background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:10,marginBottom:12,overflow:"hidden"}}>
            <div onClick={()=>setCrewFlightsOpen(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",cursor:"pointer",userSelect:"none"}}>
              <div style={{fontSize:9,fontWeight:800,color:"var(--info-fg)",letterSpacing:"0.08em"}}>CREW FLIGHTS · LABEL SCAN ({labelIntel.crewFlights.length} deduped)</div>
              <div style={{fontSize:11,color:"var(--info-fg)",lineHeight:1}}>{crewFlightsOpen?"▲":"▼"}</div>
            </div>
            {crewFlightsOpen&&<div style={{padding:"0 14px 12px"}}>
              {labelIntel.crewFlights.map(f=>(
                <div key={f.id} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:"1px solid var(--info-bg)",alignItems:"center"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.subject}</div>
                    <div style={{fontSize:9,color:"var(--info-fg)"}}>{f.from} · {f.date}</div>
                    {f.showId&&<div style={{fontSize:8,color:"var(--text-dim)",fontFamily:MN}}>{f.showId}</div>}
                  </div>
                  <a href={gmailUrl(f.id)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"var(--link)",textDecoration:"none",flexShrink:0}}>email ↗</a>
                </div>
              ))}
            </div>}
          </div>
        )}<FlightsSection/></>}
        {view==="festival"&&(
          <div style={{padding:"40px 0",textAlign:"center",color:"var(--text-dim)"}}><div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Festival Dispatch</div><div style={{fontSize:11,color:"var(--text-mute)"}}>Olivia manages driver pool for Beyond Wonderland and Wakaan.<br/>Payout log is in Finance → Payment Batch.</div></div>
        )}
      </div>
    </div>
  );
}

const LEDGER_EDITABLE={
  confirmedFlight:new Set(["date","amount","currency","ref","bookedDate","paidDate"]),
  event:new Set(["date","desc","amount","currency","status","ref","bookedDate","paidDate"]),
  payout:new Set(["payee","amount","currency","status","ref","bookedDate","paidDate"]),
  ledgerEntry:new Set(["date","desc","payee","amount","currency","ref","bookedDate","paidDate"]),
  flightExpense:new Set(["desc","amount","currency","ref","bookedDate","paidDate"]),
  legacySettlement:new Set(["amount","ref"]),
};

function FinLedger(){
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

  const INP={background:"var(--card-3)",border:"1px solid var(--accent)",borderRadius:4,color:"var(--text)",outline:"none",padding:"2px 4px",width:"100%",boxSizing:"border-box"};

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
        <span style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.06em"}}>CATEGORY</span>
        {["all",...cats].map(c=><button key={c} onClick={()=>setFilterCat(c)} style={{fontSize:9,padding:"3px 9px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,background:filterCat===c?"var(--accent)":"var(--card-2)",color:filterCat===c?"var(--card)":"var(--text-2)"}}>{c==="all"?"All":c}</button>)}
        <span style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.06em",marginLeft:8}}>CURRENCY</span>
        {["all",...curs].map(c=><button key={c} onClick={()=>setFilterCur(c)} style={{fontSize:9,padding:"3px 9px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,background:filterCur===c?"var(--accent)":"var(--card-2)",color:filterCur===c?"var(--card)":"var(--text-2)"}}>{c==="all"?"All":c}</button>)}
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {Object.entries(totals).map(([cur,amt])=><span key={cur} style={{fontSize:11,fontWeight:800,fontFamily:MN,color:"var(--text)"}}>{cur} {amt.toFixed(2)}</span>)}
          <button onClick={()=>setUploadOpen(true)} style={{fontSize:9,padding:"3px 10px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>↑ Upload</button>
        </div>
      </div>
      {sorted.length===0?(
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text-mute)",fontSize:11}}>No expenses logged.</div>
      ):(
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{[["date","Date"],["bookedDate","Booked"],["paidDate","Paid"],["show","Show"],["cat","Category"],["payee","Payee"],["desc","Description"],["amount","Amount"],["currency","Curr"],["status","Status"],["ref","Ref"],["payMethod","Payment"]].map(([col,label])=>th(label,col))}</tr></thead>
            <tbody>
              {sorted.map((r,i)=>{
                const cc=CAT_COLOR[r.cat]||{bg:"var(--card-2)",c:"var(--text-2)"};
                const bg=i%2===0?"var(--card)":"var(--card-3)";
                const d0={padding:"6px 8px",fontSize:9,color:"var(--text-dim)",whiteSpace:"nowrap"};
                const canStatus=!!LEDGER_EDITABLE[r._src?.type]?.has("status");
                return(
                  <tr key={r.id} style={{borderBottom:"1px solid var(--card-3)",background:bg}}>
                    {ecell(r,"date",r.date,{...d0,fontFamily:MN})}
                    {ecell(r,"bookedDate",r.bookedDate,{...d0,fontFamily:MN})}
                    {ecell(r,"paidDate",r.paidDate,{...d0,fontFamily:MN,color:r.paidDate?"var(--success-fg)":"var(--text-mute)"})}
                    <td style={{padding:"6px 8px",fontSize:10,color:"var(--text)",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.show}</td>
                    <td style={{padding:"6px 8px"}}><span style={{fontSize:8,padding:"2px 6px",borderRadius:4,fontWeight:700,background:cc.bg,color:cc.c}}>{r.cat}</span></td>
                    {ecell(r,"payee",r.payee,{padding:"6px 8px",fontSize:10,fontWeight:600,color:"var(--text)"})}
                    {ecell(r,"desc",r.desc,{padding:"6px 8px",fontSize:9,color:"var(--text-dim)",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"})}
                    {ecell(r,"amount",r.amount!=null?r.amount.toFixed(2):null,{padding:"6px 8px",fontFamily:MN,fontSize:11,fontWeight:700,color:r.amount!=null?"var(--text)":"var(--text-mute)",textAlign:"right"})}
                    {ecell(r,"currency",r.currency,{padding:"6px 8px",fontSize:9,color:"var(--text-dim)"})}
                    {ec&&ec.id===r.id&&ec.field==="status"?(
                      <td style={{padding:"6px 8px"}}><select autoFocus value={eVal} onChange={e=>setEVal(e.target.value)} onBlur={commit} style={{...INP,fontSize:9}}>{["pending","confirmed","cancelled","paid"].map(s=><option key={s}>{s}</option>)}</select></td>
                    ):(
                      <td style={{padding:"6px 8px",cursor:canStatus?"pointer":"default"}} onClick={()=>canStatus&&startEdit(r,"status",r.status)}>
                        <span style={{fontSize:8,padding:"2px 5px",borderRadius:4,fontWeight:700,background:r.status==="confirmed"?"var(--success-bg)":"var(--warn-bg)",color:r.status==="confirmed"?"var(--success-fg)":"var(--warn-fg)"}}>{r.status}</span>
                      </td>
                    )}
                    {ecell(r,"ref",r.ref,{padding:"6px 8px",fontFamily:MN,fontSize:8,color:"var(--text-mute)"})}
                    <td style={{padding:"6px 8px",fontSize:9,color:"var(--text-2)",whiteSpace:"nowrap"}}>{r.payMethod||"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{padding:"8px 12px",background:"var(--card-3)",borderTop:"1px solid var(--border)",display:"flex",gap:16,flexWrap:"wrap"}}>
            {Object.entries(totals).map(([cur,amt])=>(
              <div key={cur} style={{fontSize:9}}>
                <span style={{color:"var(--text-dim)",fontWeight:700}}>{cur} total: </span>
                <span style={{fontFamily:MN,fontWeight:800,color:"var(--text)"}}>{amt.toFixed(2)}</span>
                <span style={{color:"var(--text-mute)",marginLeft:5}}>({filtered.filter(r=>r.currency===cur).length} entries)</span>
              </div>
            ))}
            <span style={{marginLeft:"auto",fontSize:9,color:"var(--text-mute)"}}>{sorted.length} rows</span>
          </div>
        </div>
      )}
    </div>
  );
}

function FinEventsPanel({selS,fin,uFin,pushUndo}){
  const events=fin.events||[];
  const[adding,setAdding]=useState(false);
  const[form,setForm]=useState({type:"settlement",amount:"",currency:"USD",expectedDate:"",actualDate:"",status:"pending",ref:"",payMethod:"",note:""});
  const reset=()=>setForm({type:"settlement",amount:"",currency:"USD",expectedDate:"",actualDate:"",status:"pending",ref:"",payMethod:"",note:""});

  const add=()=>{
    if(!form.amount)return;
    const ev={...form,id:`ev_${Date.now()}`,createdAt:new Date().toISOString(),amount:parseFloat(form.amount)||0};
    uFin(selS,{events:[...events,ev]});
    logAudit({entityType:"finance",entityId:`${selS}:${ev.id}`,action:"event_create",
      before:null,after:ev,meta:{type:ev.type}});
    reset();setAdding(false);
  };
  const update=(id,patch)=>{
    const prev=events.find(e=>e.id===id);if(!prev)return;
    const next={...prev,...patch};
    uFin(selS,{events:events.map(e=>e.id===id?next:e)});
    logAudit({entityType:"finance",entityId:`${selS}:${id}`,action:"event_update",
      before:prev,after:next,meta:{fields:Object.keys(patch)}});
  };
  const del=id=>{
    const prev=events.find(e=>e.id===id);if(!prev)return;
    uFin(selS,{events:events.filter(e=>e.id!==id)});
    pushUndo("Event deleted.",()=>uFin(selS,{events:[...events]}));
    logAudit({entityType:"finance",entityId:`${selS}:${id}`,action:"event_delete",
      before:prev,after:null,meta:{type:prev.type}});
  };

  // Migrate legacy flat wireRef/wireDate/settlementAmount into a settlement event.
  const hasLegacy=(fin.settlementAmount||fin.wireRef||fin.wireDate)&&!events.some(e=>e.type==="settlement"||e.type==="wire");
  const migrate=()=>{
    const migrated=[];
    if(fin.settlementAmount){
      migrated.push({id:`ev_mig_s_${Date.now()}`,type:"settlement",amount:parseFloat(fin.settlementAmount)||0,currency:"USD",
        expectedDate:selS,actualDate:fin.stages?.payment_initiated?selS:"",status:fin.stages?.payment_initiated?"confirmed":"pending",
        ref:"",note:"migrated from legacy settlementAmount",createdAt:new Date().toISOString()});
    }
    if(fin.wireRef||fin.wireDate){
      migrated.push({id:`ev_mig_w_${Date.now()+1}`,type:"wire",amount:parseFloat(fin.settlementAmount)||0,currency:"USD",
        expectedDate:fin.wireDate||"",actualDate:fin.wireDate||"",status:fin.stages?.wire_ref_confirmed?"confirmed":"pending",
        ref:fin.wireRef||"",note:"migrated from legacy wireRef/wireDate",createdAt:new Date().toISOString()});
    }
    if(!migrated.length)return;
    uFin(selS,{events:[...events,...migrated]});
    migrated.forEach(ev=>logAudit({entityType:"finance",entityId:`${selS}:${ev.id}`,action:"event_create",before:null,after:ev,meta:{type:ev.type,source:"migration"}}));
  };

  const typeOf=t=>FIN_EVENT_TYPES.find(x=>x.id===t)||FIN_EVENT_TYPES[FIN_EVENT_TYPES.length-1];
  const statusOf=s=>FIN_EVENT_STATUS.find(x=>x.id===s)||FIN_EVENT_STATUS[0];

  return(
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em"}}>FINANCIAL EVENTS</div>
        <div style={{display:"flex",gap:6}}>
          {hasLegacy&&<button onClick={migrate} style={{fontSize:9,padding:"3px 9px",borderRadius:4,border:"1px solid var(--warn-fg)",background:"var(--warn-bg)",color:"var(--warn-fg)",cursor:"pointer",fontWeight:700}}>Migrate legacy ↗</button>}
          <button onClick={()=>setAdding(v=>!v)} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:700,background:"var(--accent)",color:"#fff"}}>{adding?"Cancel":"+ Add Event"}</button>
        </div>
      </div>
      {adding&&(
        <div style={{background:"var(--card-3)",borderRadius:10,padding:"10px",marginBottom:10}}>
          <div style={{display:"grid",gridTemplateColumns:"110px 90px 70px 110px 110px 100px",gap:5,marginBottom:5}}>
            <select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
              {FIN_EVENT_TYPES.map(t=><option key={t.id} value={t.id}>{t.l}</option>)}
            </select>
            <input placeholder="Amount" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
            <select value={form.currency} onChange={e=>setForm(p=>({...p,currency:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
              {["USD","CAD","GBP","EUR"].map(c=><option key={c}>{c}</option>)}
            </select>
            <input type="date" placeholder="Expected" value={form.expectedDate} onChange={e=>setForm(p=>({...p,expectedDate:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
            <input type="date" placeholder="Actual" value={form.actualDate} onChange={e=>setForm(p=>({...p,actualDate:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
            <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
              {FIN_EVENT_STATUS.map(s=><option key={s.id} value={s.id}>{s.l}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:5,marginBottom:5}}>
            <input placeholder="Ref # (wire, invoice, etc.)" value={form.ref} onChange={e=>setForm(p=>({...p,ref:e.target.value}))} style={{flex:1,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
            <input placeholder="Card / payment method (e.g. Amex 4567)" value={form.payMethod} onChange={e=>setForm(p=>({...p,payMethod:e.target.value}))} style={{flex:1,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
            <input placeholder="Note" value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))} style={{flex:2,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
            <button onClick={add} disabled={!form.amount} style={{background:"var(--success-fg)",border:"none",borderRadius:4,color:"#fff",fontSize:10,padding:"4px 12px",cursor:form.amount?"pointer":"not-allowed",fontWeight:700,opacity:form.amount?1:0.5}}>Add</button>
          </div>
        </div>
      )}
      {events.length===0&&!adding&&<div style={{fontSize:10,color:"var(--text-mute)",padding:"6px 0",fontStyle:"italic"}}>No financial events yet. Settlement, wire, withholding, and merch each track independently.</div>}
      {events.length>0&&(
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:"var(--card-3)"}}>{["Type","Amount","Expected","Actual","Status","Ref","Payment","Note",""].map(h=><th key={h} style={{padding:"5px 7px",textAlign:"left",fontSize:8,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.05em",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead>
          <tbody>{events.map(ev=>{const t=typeOf(ev.type);const s=statusOf(ev.status);return(
            <tr key={ev.id} style={{borderBottom:"1px solid var(--card-3)"}}>
              <td style={{padding:"5px 7px"}}><span style={{fontSize:9,padding:"1px 6px",borderRadius:4,background:t.b,color:t.c,fontWeight:700}}>{t.l}</span></td>
              <td style={{padding:"5px 7px",fontFamily:MN,fontSize:10,fontWeight:700}}>{ev.currency} {Number(ev.amount||0).toFixed(2)}</td>
              <td style={{padding:"5px 7px",fontFamily:MN,fontSize:9,color:"var(--text-dim)"}}>{ev.expectedDate||"—"}</td>
              <td style={{padding:"5px 7px",fontFamily:MN,fontSize:9,color:ev.actualDate?"var(--text)":"var(--text-mute)"}}>{ev.actualDate||"—"}</td>
              <td style={{padding:"5px 7px"}}>
                <select value={ev.status} onChange={e=>update(ev.id,{status:e.target.value})} style={{background:s.b,color:s.c,border:"none",borderRadius:4,fontSize:9,padding:"2px 4px",outline:"none",fontWeight:700,cursor:"pointer"}}>
                  {FIN_EVENT_STATUS.map(x=><option key={x.id} value={x.id}>{x.l}</option>)}
                </select>
              </td>
              <td style={{padding:"5px 7px",fontFamily:MN,fontSize:9,color:"var(--text-2)"}}>{ev.ref||"—"}</td>
              <td style={{padding:"5px 7px",fontSize:9,color:"var(--text-2)",whiteSpace:"nowrap"}}>{ev.payMethod||"—"}</td>
              <td style={{padding:"5px 7px",fontSize:9,color:"var(--text-dim)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.note||"—"}</td>
              <td style={{padding:"5px 7px"}}><button onClick={()=>del(ev.id)} style={{background:"transparent",border:"none",color:"var(--text-mute)",fontSize:11,cursor:"pointer",padding:"2px 6px"}} title="Delete">×</button></td>
            </tr>
          );})}</tbody>
        </table>
      )}
    </div>
  );
}

function FinTab(){
  const{shows,cShows,finance,uFin,pushUndo,labelIntel,sel,setSel,eventKey}=useContext(Ctx);
  const today=new Date().toISOString().slice(0,10);
  const[finView,setFinView]=useState("settlement");
  const[addP,setAddP]=useState(false);
  const[pForm,setPForm]=useState({name:"",role:"",dept:"Drivers",amount:"",currency:"USD",method:"Wire",payMethod:"",status:"pending"});
  const show=sel?shows[sel]:null;
  const fin=eventKey?finance[eventKey]||{}:{};
  const stages=fin.stages||{};
  const payouts=fin.payouts||[];
  const toggleStage=id=>{
    const prev=!!stages[id];const next=!prev;
    uFin(eventKey,{stages:{...stages,[id]:next}});
    logAudit({entityType:"finance",entityId:`${eventKey}:${id}`,action:"stage_toggle",
      before:{done:prev},after:{done:next},meta:{stage:id}});
  };
  const done=["wire_ref_confirmed","signed_sheet","payment_initiated"].every(id=>stages[id]);
  const addPayout=()=>{if(!eventKey||!pForm.name||!pForm.amount)return;uFin(eventKey,{payouts:[...payouts,{...pForm,id:`p${Date.now()}`,date:today}]});setPForm({name:"",role:"",dept:"Drivers",amount:"",currency:"USD",method:"Wire",payMethod:"",status:"pending"});setAddP(false);};
  const currencies=[...new Set(payouts.map(p=>p.currency))];
  const batchTotal=cur=>payouts.filter(p=>p.currency===cur).reduce((s,p)=>s+parseFloat(p.amount||0),0).toFixed(2);
  const curStatus=!eventKey?"":done?"settled":stages["payment_initiated"]?"in_progress":"pending";

  return(
    <div className="fi" style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
      {/* Sub-tab bar */}
      <div style={{display:"flex",gap:0,borderBottom:"1px solid var(--border)",background:"var(--card)",flexShrink:0,padding:"0 16px"}}>
        {[["settlement","Settlement"],["ledger","Ledger"],["overview","All Shows"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFinView(v)} style={{padding:"8px 16px",fontSize:11,fontWeight:finView===v?700:500,color:finView===v?"var(--text)":"var(--text-dim)",border:"none",borderBottom:finView===v?"2px solid var(--text)":"2px solid transparent",background:"none",cursor:"pointer",letterSpacing:"0.01em"}}>{l}</button>
        ))}
      </div>
      {finView==="ledger"&&<FinLedger/>}
      {finView==="overview"&&(()=>{const today=new Date().toISOString().slice(0,10);return(<div style={{flex:1,overflow:"auto",padding:"14px 20px 30px"}}>
        <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8}}>SETTLEMENT STATUS — ALL SHOWS</div>
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {cShows.map(s=>{const fk=s.date;const fStages=finance[fk]?.stages||{};const isSettled=["wire_ref_confirmed","signed_sheet","payment_initiated"].every(k=>fStages[k]);const inProgress=fStages["payment_initiated"];const isPast=s.date<today;const days=dU(s.date);const overdue=isPast&&!isSettled&&Math.abs(days)>7;return(
            <div key={s.date} onClick={()=>{setSel(s.date);setFinView("settlement");}} className="rh" style={{display:"grid",gridTemplateColumns:"58px 1fr 80px 90px 70px",alignItems:"center",gap:8,padding:"8px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,cursor:"pointer",borderLeft:`3px solid ${isSettled?"var(--success-fg)":inProgress?"var(--warn-fg)":overdue?"var(--danger-fg)":"var(--card-2)"}`}}>
              <div style={{fontFamily:MN,fontSize:9,color:"var(--text-dim)"}}>{fD(s.date)}</div>
              <div><div style={{fontSize:10,fontWeight:700}}>{s.city}</div><div style={{fontSize:8,color:"var(--text-dim)"}}>{s.venue}</div></div>
              <div style={{fontSize:9,fontFamily:MN,color:"var(--text-2)"}}>{finance[fk]?.settlementAmount?`$${finance[fk].settlementAmount}`:"—"}</div>
              <div style={{fontSize:8,padding:"2px 6px",borderRadius:99,background:isSettled?"var(--success-bg)":inProgress?"var(--warn-bg)":"var(--card-2)",color:isSettled?"var(--success-fg)":inProgress?"var(--warn-fg)":"var(--text-mute)",fontWeight:700,textAlign:"center"}}>{isSettled?"Settled":inProgress?"In Progress":"Pending"}</div>
              <div style={{fontSize:8,color:overdue?"var(--danger-fg)":"var(--text-mute)",fontFamily:MN,textAlign:"right"}}>{isPast&&!isSettled?`${Math.abs(days)}d overdue`:days>0?`${days}d out`:"today"}</div>
            </div>
          );})}
        </div>
      </div>);})()}
      {finView==="settlement"&&<div style={{flex:1,overflow:"auto",padding:"14px 20px 30px"}}>
        {!sel?(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 0",gap:10}}><div style={{fontSize:32,opacity:0.2}}>💰</div><div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>No show selected</div><div style={{fontSize:11,color:"var(--text-dim)",maxWidth:280,textAlign:"center"}}>Select a show from the sidebar to view settlement and payouts.</div>{cShows.filter(s=>s.date>=new Date().toISOString().slice(0,10))[0]&&<button onClick={()=>setSel(cShows.filter(s=>s.date>=new Date().toISOString().slice(0,10))[0].date)} style={{marginTop:6,padding:"6px 16px",borderRadius:8,border:"none",background:"var(--accent)",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>Jump to next show →</button>}</div>):(
          <div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:800}}>{show?.city} — {show?.venue}</div>
              <div style={{fontSize:10,color:"var(--text-dim)",fontFamily:MN,marginTop:1}}>{fFull(sel)}</div>
              {done&&<div style={{marginTop:6,display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",background:"var(--success-bg)",borderRadius:10,fontSize:10,fontWeight:800,color:"var(--success-fg)"}}>SETTLEMENT DONE ✓</div>}
            </div>
            {(()=>{const guarantee=parseFloat(show?.guarantee||0);const wireAmount=parseFloat(fin.settlementAmount||0);const variance=wireAmount-guarantee;const variancePct=guarantee>0?(variance/guarantee)*100:null;return guarantee>0?(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                {[{l:"Deal Guarantee",v:`$${guarantee.toLocaleString()}`,c:"var(--text)"},{l:"Settlement Amount",v:wireAmount>0?`$${wireAmount.toLocaleString()}`:"—",c:"var(--text)"},{l:"Variance",v:variancePct!=null?`${variance>=0?"+":""}$${Math.abs(variance).toLocaleString()} (${variancePct.toFixed(1)}%)`:"—",c:variance>=0?"var(--success-fg)":"var(--danger-fg)"}].map(s=>(
                  <div key={s.l} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:8,color:"var(--text-dim)",marginBottom:3,fontWeight:600}}>{s.l}</div>
                    <div style={{fontSize:15,fontWeight:800,color:s.c,fontFamily:MN}}>{s.v}</div>
                  </div>
                ))}
              </div>
            ):null;})()}
            {(()=>{const ps=(labelIntel?.settlements||[]).filter(s=>s.showId===showIdFor(shows?.[sel]||{}));return ps.length>0?(
              <div style={{background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:10,padding:"10px 12px",marginBottom:10}}>
                <div style={{fontSize:9,fontWeight:800,color:"var(--link)",letterSpacing:"0.08em",marginBottom:6}}>INBOX SETTLEMENTS ({ps.length})</div>
                {ps.map(s=>(
                  <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:"1px solid var(--info-bg)"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.subject}</div>
                      <div style={{fontSize:9,color:"var(--text-dim)"}}>{s.from} · {s.date}</div>
                    </div>
                    <a href={gmailUrl(s.id)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"var(--link)",textDecoration:"none",flexShrink:0}}>open ↗</a>
                  </div>
                ))}
              </div>
            ):null;})()}
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px",marginBottom:10}}>
              <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:10}}>SETTLEMENT PIPELINE</div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:8,fontWeight:700,color:"var(--text-dim)",marginBottom:4,letterSpacing:"0.06em"}}>PRE-EVENT</div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {PRE_STAGES.map(s=><div key={s.id} onClick={()=>toggleStage(s.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",background:stages[s.id]?"var(--success-bg)":"var(--card)",cursor:"pointer"}}>
                    <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${stages[s.id]?"var(--success-fg)":"var(--border)"}`,background:stages[s.id]?"var(--success-fg)":"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{stages[s.id]&&<span style={{color:"#fff",fontSize:11,lineHeight:1}}>✓</span>}</div>
                    <span style={{fontSize:11,color:"var(--text)",fontWeight:stages[s.id]?600:400}}>{s.l}</span>
                  </div>)}
                </div>
              </div>
              <div>
                <div style={{fontSize:8,fontWeight:700,color:"var(--text-dim)",marginBottom:4,letterSpacing:"0.06em"}}>POST-EVENT</div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {POST_STAGES.map(s=>{const isDone=stages[s.id];return(
                    <div key={s.id} onClick={()=>toggleStage(s.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,border:`1px solid ${s.req?"var(--warn-fg)":"var(--border)"}`,background:isDone?"var(--success-bg)":"var(--card)",cursor:"pointer"}}>
                      <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${isDone?"var(--success-fg)":s.req?"var(--warn-fg)":"var(--border)"}`,background:isDone?"var(--success-fg)":"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{isDone&&<span style={{color:"#fff",fontSize:11,lineHeight:1}}>✓</span>}</div>
                      <span style={{fontSize:11,color:"var(--text)",fontWeight:isDone?600:400,flex:1}}>{s.l}</span>
                      {s.req&&!isDone&&<span style={{fontSize:8,color:"var(--warn-fg)",fontWeight:700}}>required</span>}
                    </div>
                  );})}
                </div>
              </div>
              {(()=>{const wireSteps=[{id:"signed",label:"Sheet Signed",stageKey:"signed_sheet"},{id:"wire",label:"Wire Initiated",stageKey:"payment_initiated"},{id:"ref",label:"Ref Confirmed",stageKey:"wire_ref_confirmed"}];return(
                <div style={{display:"flex",alignItems:"center",gap:0,marginTop:10,padding:"8px 0"}}>
                  {wireSteps.map((step,i)=>{const d=stages[step.stageKey];return(<React.Fragment key={step.id}>
                    {i>0&&<div style={{flex:1,height:2,background:d?"var(--success-fg)":"var(--card-2)"}}/>}
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,flexShrink:0}}>
                      <div style={{width:10,height:10,borderRadius:99,background:d?"var(--success-fg)":"var(--card-2)",border:`2px solid ${d?"var(--success-fg)":"var(--border)"}`}}/>
                      <div style={{fontSize:8,color:"var(--text-dim)",textAlign:"center",whiteSpace:"nowrap"}}>{step.label}</div>
                    </div>
                  </React.Fragment>);})}
                </div>
              );})()}
              {!done&&stages["payment_initiated"]&&<div style={{marginTop:4,padding:"7px 10px",background:"var(--warn-bg)",borderRadius:6,fontSize:10,color:"var(--warn-fg)",fontWeight:600}}>Wire ref # and signed sheet both required to mark done.</div>}
              <div style={{marginTop:10,fontSize:9,color:"var(--text-mute)",fontStyle:"italic"}}>Legacy flat fields below. Prefer <b>Financial Events</b> above for new settlements, wires, withholding, and merch — each tracks independently.</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginTop:6}}>
                {[{l:"Wire Ref #",k:"wireRef",ph:"REF-20260520"},{l:"Wire Date",k:"wireDate",ph:"2026-05-22"},{l:"Settlement Amount",k:"settlementAmount",ph:"0.00"}].map(f=><div key={f.k}><div style={{fontSize:9,color:"var(--text-dim)",marginBottom:2}}>{f.l}</div><input defaultValue={fin[f.k]||""} onBlur={e=>{const v=e.target.value;const prev=fin[f.k]||"";if(v===prev)return;uFin(eventKey,{[f.k]:v});pushUndo(`${f.l} updated.`,()=>uFin(eventKey,{[f.k]:prev}));}} placeholder={f.ph} style={{width:"100%",background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",fontSize:10,fontFamily:MN,padding:"4px 6px",outline:"none"}}/></div>)}
              </div>
              <div style={{marginTop:7}}><div style={{fontSize:9,color:"var(--text-dim)",marginBottom:2}}>Settlement Notes</div><textarea defaultValue={fin.notes||""} onBlur={e=>{const v=e.target.value;const prev=fin.notes||"";if(v===prev)return;uFin(eventKey,{notes:v});pushUndo("Settlement notes updated.",()=>uFin(eventKey,{notes:prev}));}} placeholder="Deductions, disputes, bonus splits..." rows={2} style={{width:"100%",background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",fontSize:10,padding:"4px 6px",outline:"none",resize:"vertical",fontFamily:"inherit"}}/></div>
            </div>
            <FinEventsPanel selS={eventKey} fin={fin} uFin={uFin} pushUndo={pushUndo}/>
            {(fin.flightExpenses||[]).length>0&&<div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px",marginBottom:10}}>
              <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8}}>FLIGHT EXPENSES</div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:"var(--card-3)"}}>{["Flight","Route","Carrier","Pax","Amount","Curr"].map(h=><th key={h} style={{padding:"5px 7px",textAlign:"left",fontSize:8,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.05em",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead>
                <tbody>{(fin.flightExpenses||[]).map((fe,i)=><tr key={fe.flightId||i} style={{borderBottom:"1px solid var(--card-3)"}}>
                  <td style={{padding:"5px 7px",fontFamily:MN,fontSize:9,fontWeight:700}}>{fe.label?.split(" ")[0]||"—"}</td>
                  <td style={{padding:"5px 7px",fontSize:10}}>{fe.label?.split(" ").slice(1).join(" ")||"—"}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:"var(--text-2)"}}>{fe.carrier||"—"}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:"var(--text-dim)"}}>{(fe.pax||[]).join(", ")||"—"}</td>
                  <td style={{padding:"5px 7px",fontFamily:MN,fontSize:10,fontWeight:700,color:fe.amount?"var(--text)":"var(--text-mute)"}}>{fe.amount!=null?fe.amount:"—"}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:"var(--text-dim)"}}>{fe.currency||"—"}</td>
                </tr>)}
                </tbody>
              </table>
              {[...new Set((fin.flightExpenses||[]).map(fe=>fe.currency).filter(Boolean))].map(cur=>{const t=(fin.flightExpenses||[]).filter(fe=>fe.currency===cur&&fe.amount!=null).reduce((s,fe)=>s+parseFloat(fe.amount||0),0);return t>0?<div key={cur} style={{marginTop:6,padding:"5px 8px",background:"var(--info-bg)",borderRadius:6,fontSize:9,color:"var(--link)"}}><span style={{fontWeight:700}}>Flight total {cur}: </span><span style={{fontFamily:MN,fontWeight:700}}>{t.toFixed(2)}</span></div>:null;})}
            </div>}
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div>
                  <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em"}}>PAYMENT BATCH</div>
                  <div style={{marginTop:2}}>{currencies.map(cur=><span key={cur} style={{fontSize:9,fontFamily:MN,fontWeight:700,color:"var(--text)",marginRight:10}}>{cur} {batchTotal(cur)}</span>)}</div>
                </div>
                <button onClick={()=>setAddP(v=>!v)} style={{fontSize:9,padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:700,background:"var(--accent)",color:"#fff"}}>+ Add Payout</button>
              </div>
              {addP&&<div style={{background:"var(--card-3)",borderRadius:10,padding:"10px",marginBottom:10}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 70px 65px 70px 80px",gap:5,marginBottom:5}}>
                  <input placeholder="Payee name" value={pForm.name} onChange={e=>setPForm(p=>({...p,name:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
                  <input placeholder="Amount" value={pForm.amount} onChange={e=>setPForm(p=>({...p,amount:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
                  <select value={pForm.currency} onChange={e=>setPForm(p=>({...p,currency:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
                    {["USD","CAD","GBP","EUR"].map(c=><option key={c}>{c}</option>)}
                  </select>
                  <select value={pForm.method} onChange={e=>setPForm(p=>({...p,method:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
                    {["Wire","ACH","Check"].map(m=><option key={m}>{m}</option>)}
                  </select>
                  <select value={pForm.dept} onChange={e=>setPForm(p=>({...p,dept:e.target.value}))} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
                    {["Drivers","AR Staff","Production","Vendors","Site Ops","Quartermaster","Other"].map(d=><option key={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",gap:5}}>
                  <input placeholder="Role / position" value={pForm.role} onChange={e=>setPForm(p=>({...p,role:e.target.value}))} style={{flex:1,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
                  <input placeholder="Card / payment (e.g. Amex 4567)" value={pForm.payMethod} onChange={e=>setPForm(p=>({...p,payMethod:e.target.value}))} style={{flex:1,background:"var(--card)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
                  <button onClick={addPayout} style={{background:"var(--success-fg)",border:"none",borderRadius:4,color:"#fff",fontSize:10,padding:"4px 12px",cursor:"pointer",fontWeight:700}}>Add</button>
                  <button onClick={()=>setAddP(false)} style={{background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:4,color:"var(--text-dim)",fontSize:10,padding:"4px 8px",cursor:"pointer"}}>Cancel</button>
                </div>
              </div>}
              {payouts.length>0?(<table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:"var(--card-3)"}}>{["Name","Role","Dept","Amount","Curr","Method","Payment","Status","Date"].map(h=><th key={h} style={{padding:"5px 7px",textAlign:"left",fontSize:8,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.05em",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead>
                <tbody>{payouts.map((p,i)=><tr key={p.id||i} style={{borderBottom:"1px solid var(--card-3)"}}>
                  <td style={{padding:"5px 7px",fontSize:10,fontWeight:600}}>{p.name}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:"var(--text-2)"}}>{p.role}</td>
                  <td style={{padding:"5px 7px",fontSize:8}}><span style={{background:"var(--card-2)",padding:"1px 5px",borderRadius:4,color:"var(--text-2)",fontWeight:600}}>{p.dept}</span></td>
                  <td style={{padding:"5px 7px",fontFamily:MN,fontSize:10,fontWeight:700}}>{p.amount}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:"var(--text-dim)"}}>{p.currency}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:"var(--text-dim)"}}>{p.method}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:"var(--text-2)",whiteSpace:"nowrap"}}>{p.payMethod||"—"}</td>
                  <td style={{padding:"5px 7px"}}><span style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:p.status==="confirmed"?"var(--success-bg)":"var(--warn-bg)",color:p.status==="confirmed"?"var(--success-fg)":"var(--warn-fg)",fontWeight:700}}>{p.status}</span></td>
                  <td style={{padding:"5px 7px",fontFamily:MN,fontSize:9,color:"var(--text-mute)"}}>{p.date}</td>
                </tr>)}</tbody>
              </table>):<div style={{fontSize:11,color:"var(--text-mute)",textAlign:"center",padding:"14px 0"}}>No payouts logged.</div>}
              {payouts.length>0&&currencies.map(cur=>{const t=parseFloat(batchTotal(cur));const FX={EUR:1.08,GBP:1.27};const usdEquiv=FX[cur]?(t*FX[cur]).toFixed(2):null;return(<div key={cur} style={{marginTop:8,padding:"6px 10px",background:"var(--card-3)",borderRadius:6,fontSize:9,color:"var(--text-2)",display:"flex",alignItems:"center",gap:8}}><span style={{fontWeight:700}}>Batch total {cur}: </span><span style={{fontFamily:MN,fontWeight:700,color:"var(--text)"}}>{batchTotal(cur)}</span><span style={{color:"var(--text-mute)"}}>({payouts.filter(p=>p.currency===cur).length} payees)</span>{usdEquiv&&<span style={{fontFamily:MN,color:"var(--text-mute)",marginLeft:"auto"}}>≈ USD {usdEquiv}</span>}</div>);})}
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}

const DOC_TYPE_META={
  RECEIPT:{label:"Receipt",bg:"var(--warn-bg)",c:"var(--warn-fg)",icon:"🧾"},
  INVOICE:{label:"Invoice",bg:"var(--warn-bg)",c:"var(--warn-fg)",icon:"📋"},
  FLIGHT_CONFIRMATION:{label:"Flight Confirmation",bg:"var(--info-bg)",c:"var(--link)",icon:"✈"},
  TRAVEL_ITINERARY:{label:"Travel Itinerary",bg:"var(--info-bg)",c:"var(--link)",icon:"🗺"},
  SHOW_CONTRACT:{label:"Show Contract",bg:"var(--success-bg)",c:"var(--success-fg)",icon:"📄"},
  VENUE_TECH_PACK:{label:"Venue Tech Pack",bg:"var(--accent-pill-bg)",c:"var(--accent)",icon:"🔧"},
  EXPENSE_REPORT:{label:"Expense Report",bg:"var(--warn-bg)",c:"var(--warn-fg)",icon:"📊"},
  UNKNOWN:{label:"Unknown",bg:"var(--card-2)",c:"var(--text-dim)",icon:"?"},
};

function FileUploadModal({onClose}){
  const{uFin,uFlight,uShow,uProd,setSel,setTab,sel,eventKey,aC,shows,flights,finance}=useContext(Ctx);
  const[dragging,setDragging]=useState(false);
  const[file,setFile]=useState(null);
  const[parsing,setParsing]=useState(false);
  const[result,setResult]=useState(null);
  const[error,setError]=useState("");
  const[applying,setApplying]=useState(false);
  const[applied,setApplied]=useState("");
  const[showDateOverride,setShowDateOverride]=useState("");
  const fileRef=useRef(null);

  const ACCEPT=".pdf,.docx,.xlsx,.xls";

  const handleFile=async(f)=>{
    if(!f)return;
    const name=f.name.toLowerCase();
    if(![".pdf",".docx",".xlsx",".xls"].some(ext=>name.endsWith(ext))){
      setError("Unsupported file type. Use PDF, DOCX, or XLSX.");return;
    }
    setFile(f);setResult(null);setError("");setApplied("");
    setParsing(true);
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){setError("No session.");setParsing(false);return;}
      const buf=await f.arrayBuffer();
      const b64=btoa(String.fromCharCode(...new Uint8Array(buf)));
      const resp=await fetch("/api/parse-doc",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({fileBase64:b64,mimeType:f.type,filename:f.name,contextDate:sel}),
      });
      const data=await resp.json();
      if(!resp.ok){setError(data.error||"Parse failed.");setParsing(false);return;}
      setResult(data);
    }catch(e){setError(`Upload failed: ${e.message}`);}
    setParsing(false);
  };

  const onDrop=e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files?.[0];if(f)handleFile(f);};

  // ── Apply actions ─────────────────────────────────────────────────────────
  const applyReceipt=()=>{
    if(!result?.receipt)return;
    const r=result.receipt;
    const targetDate=showDateOverride||r.date||sel;
    const entry={id:`upload_${Date.now()}`,name:r.vendor||"Unknown vendor",role:r.description||"",dept:r.category||"Other",amount:r.amount!=null?String(r.amount):"",currency:r.currency||"USD",method:"Upload",status:"pending",date:r.date||targetDate,referenceNo:r.referenceNo||"",payee:r.payee||""};
    const existing=finance[targetDate]?.payouts||[];
    uFin(targetDate,{payouts:[...existing,entry]});
    setApplied(`Added to ledger for ${targetDate}`);setApplying(false);
  };

  const applyExpenseReport=()=>{
    if(!result?.expenses?.length)return;
    let count=0;
    (result.expenses).forEach((e,i)=>{
      const targetDate=e.date||sel;
      const entry={id:`upload_${Date.now()}_${i}`,name:e.vendor||"Unknown",role:e.description||"",dept:e.category||"Other",amount:e.amount!=null?String(e.amount):"",currency:e.currency||"USD",method:"Upload",status:"pending",date:e.date||sel,payee:e.payee||""};
      const existing=finance[targetDate]?.payouts||[];
      uFin(targetDate,{payouts:[...existing,entry]});
      count++;
    });
    setApplied(`${count} expenses added to ledger.`);setApplying(false);
  };

  const applyFlights=()=>{
    if(!result?.flights?.length)return;
    const allExisting=Object.values(flights);
    const existingKeys=new Set(allExisting.map(f=>`${f.flightNo}__${f.depDate}`));
    let count=0;
    result.flights.forEach(f=>{
      const id=`fl_upload_${f.flightNo||""}_${f.depDate||Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const key=`${f.flightNo}__${f.depDate}`;
      if(existingKeys.has(key))return;
      uFlight(id,{...f,id,status:"pending",source:"upload"});
      existingKeys.add(key);count++;
    });
    setApplied(`${count} flight${count!==1?"s":""} added as pending in Transport.`);setApplying(false);
  };

  const applyContract=()=>{
    if(!result?.show)return;
    const s=result.show;
    if(!s.date){setError("No date found in contract — enter a date to create the show.");return;}
    if(shows[s.date]){setError(`Show on ${s.date} already exists.`);return;}
    const parseTime=t=>{if(!t)return 0;const[h,m]=(t.split(":")||[]).map(Number);return(h||0)*60+(m||0);};
    uShow(s.date,{date:s.date,clientId:aC,type:"show",city:s.city||"",venue:s.venue||"",promoter:s.promoter||"",country:"",region:"",advance:[],doors:parseTime(s.doors)||19*60,curfew:parseTime(s.curfew)||23*60,busArrive:9*60,crewCall:parseTime("10:30"),venueAccess:9*60,mgTime:16*60+30,notes:[s.notes,s.guarantee?`Guarantee: ${s.guarantee}`:"",s.merch?`Merch: ${s.merch}`:""].filter(Boolean).join(" | ")||""});
    if(result.contacts?.length){// Contacts get added to advance list
      const advContacts=result.contacts.map(c=>({name:c.name,email:c.email||"",phone:c.phone||"",role:c.role,dept:"venue",company:c.company||""}));
      uShow(s.date,{advance:advContacts});
    }
    setSel(s.date);setTab("ros");
    setApplied(`Show created: ${s.venue||s.city} on ${s.date}`);setApplying(false);
  };

  const applyTechPack=()=>{
    if(!result?.techPack)return;
    uProd(eventKey,{techPackData:result.techPack,techPackContacts:result.contacts||[],techPackFile:file?.name,techPackAt:new Date().toISOString()});
    setTab("production");
    setApplied(`Tech pack applied to Production for ${sel}.`);setApplying(false);
  };

  const dt=result?.docType||"UNKNOWN";
  const meta=DOC_TYPE_META[dt]||DOC_TYPE_META.UNKNOWN;
  const isReceipt=dt==="RECEIPT"||dt==="INVOICE";
  const isFlight=dt==="FLIGHT_CONFIRMATION"||dt==="TRAVEL_ITINERARY";
  const isContract=dt==="SHOW_CONTRACT";
  const isTechPack=dt==="VENUE_TECH_PACK";
  const isExpense=dt==="EXPENSE_REPORT";

  const overlay={position:"fixed",inset:0,background:"rgba(15,23,42,.35)",backdropFilter:"blur(6px)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:60,zIndex:1000};
  const box={width:520,maxWidth:"96vw",maxHeight:"80vh",overflow:"auto",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,boxShadow:"0 25px 60px rgba(0,0,0,.18)",display:"flex",flexDirection:"column"};
  const inp2={background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 6px",outline:"none",width:"100%",fontFamily:"'Outfit',system-ui"};

  return(
    <div onClick={onClose} style={overlay}>
      <div onClick={e=>e.stopPropagation()} style={box}>
        {/* Header */}
        <div style={{padding:"14px 18px 10px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <span style={{fontSize:11,fontWeight:800,color:"var(--text)"}}>↑ Upload Document</span>
          <span style={{fontSize:9,color:"var(--text-mute)",marginLeft:2}}>PDF · DOCX · XLSX</span>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"var(--text-mute)",fontSize:20,lineHeight:1}}>×</button>
        </div>

        {/* Drop zone */}
        {!result&&!parsing&&(
          <div
            onDragOver={e=>{e.preventDefault();setDragging(true);}}
            onDragLeave={()=>setDragging(false)}
            onDrop={onDrop}
            onClick={()=>fileRef.current?.click()}
            style={{margin:"16px 18px",border:`2px dashed ${dragging?"var(--accent)":"var(--border)"}`,borderRadius:10,padding:"32px 20px",textAlign:"center",cursor:"pointer",background:dragging?"var(--accent-pill-bg)":"var(--card-3)",transition:"all .15s"}}
          >
            <div style={{fontSize:24,marginBottom:8}}>📄</div>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text)",marginBottom:4}}>Drop a file or click to browse</div>
            <div style={{fontSize:10,color:"var(--text-mute)"}}>PDF, DOCX, or XLSX — receipts, contracts, tech packs, itineraries, expense reports</div>
            <input ref={fileRef} type="file" accept={ACCEPT} style={{display:"none"}} onChange={e=>handleFile(e.target.files?.[0])}/>
          </div>
        )}

        {/* Parsing state */}
        {parsing&&(
          <div style={{padding:"40px 18px",textAlign:"center"}}>
            <div style={{fontSize:24,marginBottom:10}}>⏳</div>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text)",marginBottom:4}}>Parsing {file?.name}…</div>
            <div style={{fontSize:10,color:"var(--text-mute)"}}>Claude is reading and classifying your document.</div>
          </div>
        )}

        {/* Error */}
        {error&&!parsing&&(
          <div style={{margin:"0 18px 14px",padding:"8px 12px",background:"var(--danger-bg)",border:"1px solid var(--danger-bg)",borderRadius:6,fontSize:10,color:"var(--danger-fg)"}}>{error}</div>
        )}

        {/* Result */}
        {result&&!parsing&&(
          <div style={{padding:"14px 18px 20px",display:"flex",flexDirection:"column",gap:12}}>
            {/* Type badge + summary */}
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              <span style={{fontSize:20,flexShrink:0}}>{meta.icon}</span>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontSize:10,fontWeight:800,padding:"2px 9px",borderRadius:10,background:meta.bg,color:meta.c}}>{meta.label}</span>
                  <span style={{fontSize:9,color:"var(--text-mute)"}}>{Math.round((result.confidence||0)*100)}% confidence</span>
                  <button onClick={()=>{setResult(null);setFile(null);setError("");setApplied("");}} style={{marginLeft:"auto",fontSize:9,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",fontWeight:700}}>↩ Re-upload</button>
                </div>
                <div style={{fontSize:11,color:"var(--text)",fontWeight:500}}>{result.summary}</div>
                {file&&<div style={{fontSize:9,color:"var(--text-mute)",marginTop:2}}>{file.name}</div>}
              </div>
            </div>

            {/* RECEIPT / INVOICE preview */}
            {isReceipt&&result.receipt&&(
              <div style={{background:"var(--card-3)",borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:6}}>
                {[["Vendor",result.receipt.vendor],["Date",result.receipt.date],["Amount",result.receipt.amount!=null?`${result.receipt.amount} ${result.receipt.currency||""}`:null],["Category",result.receipt.category],["Description",result.receipt.description],["Reference",result.receipt.referenceNo]].filter(([,v])=>v).map(([k,v])=>(
                  <div key={k} style={{display:"flex",gap:10,fontSize:10}}><span style={{color:"var(--text-dim)",minWidth:80,fontWeight:600}}>{k}</span><span style={{color:"var(--text)"}}>{v}</span></div>
                ))}
                <div style={{display:"flex",gap:8,alignItems:"center",marginTop:4}}>
                  <span style={{fontSize:9,color:"var(--text-dim)",fontWeight:600}}>Apply to date</span>
                  <input type="date" value={showDateOverride||result.receipt.date||sel} onChange={e=>setShowDateOverride(e.target.value)} style={{...inp2,width:130}}/>
                </div>
              </div>
            )}

            {/* FLIGHT preview */}
            {isFlight&&result.flights?.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {result.flights.map((f,i)=>(
                  <div key={i} style={{background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:6,padding:"8px 10px",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:9,fontWeight:800,padding:"2px 5px",borderRadius:4,background:"var(--link)",color:"#fff",flexShrink:0}}>{f.flightNo||f.carrier}</span>
                    <span style={{fontSize:10,color:"var(--text)",flex:1}}>{f.fromCity||f.from} → {f.toCity||f.to}</span>
                    <span style={{fontFamily:MN,fontSize:9,color:"var(--text-dim)",whiteSpace:"nowrap"}}>{f.depDate} {f.dep}</span>
                    {f.pax?.length>0&&<span style={{fontSize:9,color:"var(--text-mute)"}}>{f.pax.join(", ")}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* CONTRACT preview */}
            {isContract&&result.show&&(
              <div style={{background:"var(--success-bg)",border:"1px solid var(--success-bg)",borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:5}}>
                {[["Date",result.show.date],["Venue",result.show.venue],["City",result.show.city],["Promoter",result.show.promoter],["Guarantee",result.show.guarantee],["Capacity",result.show.capacity],["Doors",result.show.doors],["Curfew",result.show.curfew]].filter(([,v])=>v).map(([k,v])=>(
                  <div key={k} style={{display:"flex",gap:10,fontSize:10}}><span style={{color:"var(--success-fg)",minWidth:80,fontWeight:600}}>{k}</span><span style={{color:"var(--text)"}}>{String(v)}</span></div>
                ))}
                {result.contacts?.length>0&&<div style={{marginTop:4,fontSize:9,color:"var(--success-fg)",fontWeight:700}}>{result.contacts.length} contact{result.contacts.length>1?"s":""} found</div>}
              </div>
            )}

            {/* TECH PACK preview */}
            {isTechPack&&result.techPack&&(
              <div style={{background:"var(--accent-pill-bg)",border:"1px solid var(--accent-pill-bg)",borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:5}}>
                {[["Venue",result.techPack.venueName],["City",result.techPack.city],["Stage",result.techPack.stageDimensions],["Rigging",result.techPack.riggingPoints],["Power",result.techPack.powerSpec],["Load-in",result.techPack.loadIn],["Curfew",result.techPack.curfew]].filter(([,v])=>v).map(([k,v])=>(
                  <div key={k} style={{display:"flex",gap:10,fontSize:10}}><span style={{color:"var(--accent)",minWidth:80,fontWeight:600}}>{k}</span><span style={{color:"var(--text)"}}>{v}</span></div>
                ))}
                {result.techPack.notes&&<div style={{fontSize:9,color:"var(--text-dim)",marginTop:2}}>{result.techPack.notes}</div>}
              </div>
            )}

            {/* EXPENSE REPORT preview */}
            {isExpense&&result.expenses?.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:160,overflow:"auto"}}>
                {result.expenses.map((e,i)=>(
                  <div key={i} style={{background:"var(--card-3)",borderRadius:6,padding:"5px 8px",display:"flex",gap:8,alignItems:"center",fontSize:9}}>
                    <span style={{fontFamily:MN,fontWeight:700,color:"var(--text)",minWidth:60}}>{e.amount} {e.currency}</span>
                    <span style={{flex:1,color:"var(--text-2)"}}>{e.vendor}</span>
                    <span style={{color:"var(--text-mute)"}}>{e.date}</span>
                    <span style={{color:"var(--text-dim)"}}>{e.category}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Applied confirmation */}
            {applied&&<div style={{padding:"7px 10px",background:"var(--success-bg)",border:"1px solid var(--success-fg)",borderRadius:6,fontSize:10,color:"var(--success-fg)",fontWeight:700}}>✓ {applied}</div>}

            {/* Action buttons */}
            {!applied&&(
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {isReceipt&&result.receipt?.amount!=null&&(
                  <button onClick={applyReceipt} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"var(--warn-fg)",color:"#fff",cursor:"pointer",fontWeight:700}}>Add to Ledger</button>
                )}
                {isFlight&&result.flights?.length>0&&(
                  <button onClick={applyFlights} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"var(--link)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import {result.flights.length} Flight{result.flights.length>1?"s":""}</button>
                )}
                {isContract&&result.show?.date&&(
                  <button onClick={applyContract} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"var(--success-fg)",color:"#fff",cursor:"pointer",fontWeight:700}}>Create Show</button>
                )}
                {isTechPack&&result.techPack&&(
                  <button onClick={applyTechPack} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Apply to Production</button>
                )}
                {isExpense&&result.expenses?.length>0&&(
                  <button onClick={applyExpenseReport} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"var(--warn-fg)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import {result.expenses.length} Expenses</button>
                )}
                <button onClick={onClose} style={{fontSize:10,padding:"5px 12px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer"}}>Close</button>
              </div>
            )}
            {applied&&<button onClick={onClose} style={{fontSize:10,padding:"5px 12px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer",width:"fit-content"}}>Done</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function CmdP(){
  const{sorted,setSel,setTab,setCmd,setAC,setExp,setDateMenu,next,sel,shows,refreshIntel,mobile}=useContext(Ctx);
  const[q,setQ]=useState("");const[sel1,setSel1]=useState(0);const ref=useRef(null);const listRef=useRef(null);
  useEffect(()=>{ref.current?.focus();},[]);
  const actions=useMemo(()=>{
    const a=[{type:"action",id:"open_now",label:"Go to Now",sub:"Dashboard / next 72h",icon:"◉",run:()=>setTab("dash")},
      {type:"action",id:"open_advance",label:"Open Advance tracker",sub:"current show",icon:"◎",run:()=>setTab("advance")},
      {type:"action",id:"open_ros",label:"Open Schedule",sub:"ROS for current show",icon:"▦",run:()=>setTab("ros")},
      {type:"action",id:"open_transport",label:"Open Logistics",sub:"bus + dispatch",icon:"◈",run:()=>setTab("transport")},
      {type:"action",id:"open_finance",label:"Open Finance",sub:"settlement + payout",icon:"◐",run:()=>setTab("finance")},
      {type:"action",id:"open_dates",label:"Open Dates menu",sub:"full tour calendar",icon:"☰",run:()=>setDateMenu(true)},
      {type:"action",id:"export",label:"Export / Import snapshot",sub:"JSON download",icon:"⇅",run:()=>setExp(true)}];
    const cur=sel?shows?.[sel]:null;
    if(cur&&refreshIntel)a.push({type:"action",id:"refresh_intel",label:`Refresh Gmail intel (${cur.city||cur.venue})`,sub:"scan inbox for this show",icon:"↻",run:()=>refreshIntel(cur,true)});
    if(next)a.push({type:"action",id:"jump_next",label:`Jump to next show (${next.city})`,sub:`${fD(next.date)} · ${dU(next.date)}d`,icon:"→",run:()=>{setSel(next.date);if(next.clientId)setAC(next.clientId);setTab("ros");}});
    return a;
  },[next,sel,shows,refreshIntel,setTab,setDateMenu,setExp,setSel,setAC]);
  const res=useMemo(()=>{
    const ql=q.toLowerCase().trim();
    if(!ql)return[...actions.slice(0,5),...sorted.slice(0,5).map(s=>({type:"show",id:s.date,label:`${fD(s.date)} ${s.city}`,sub:s.venue,cId:s.clientId}))];
    const it=[];
    actions.forEach(a=>{if(a.label.toLowerCase().includes(ql)||a.sub?.toLowerCase().includes(ql))it.push(a);});
    TABS.forEach(t=>{if(!t.disabled&&t.label.toLowerCase().includes(ql))it.push({type:"tab",id:t.id,label:t.label,icon:t.icon});});
    CLIENTS.forEach(c=>{if(c.name.toLowerCase().includes(ql))it.push({type:"client",id:c.id,label:c.name,sub:c.type});});
    sorted.forEach(s=>{if(s.city.toLowerCase().includes(ql)||s.venue.toLowerCase().includes(ql)||s.date.includes(ql))it.push({type:"show",id:s.date,label:`${fD(s.date)} ${s.city}`,sub:s.venue,cId:s.clientId});});
    return it.slice(0,14);
  },[q,sorted,actions]);
  useEffect(()=>{setSel1(0);},[q]);
  const go=item=>{
    if(item.type==="action"){item.run?.();}
    if(item.type==="tab")setTab(item.id);
    if(item.type==="show"){setSel(item.id);if(item.cId)setAC(item.cId);setTab("ros");}
    if(item.type==="client"){setAC(item.id);setTab("dash");}
    setCmd(false);
  };
  const onKey=e=>{
    if(e.key==="Escape")setCmd(false);
    else if(e.key==="ArrowDown"){e.preventDefault();setSel1(i=>Math.min(i+1,res.length-1));}
    else if(e.key==="ArrowUp"){e.preventDefault();setSel1(i=>Math.max(i-1,0));}
    else if(e.key==="Enter"&&res.length)go(res[sel1]||res[0]);
  };
  useEffect(()=>{if(!listRef.current)return;const el=listRef.current.querySelector(`[data-idx="${sel1}"]`);el?.scrollIntoView({block:"nearest"});},[sel1]);
  return(
    <div onClick={()=>setCmd(false)} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.25)",backdropFilter:"blur(6px)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:mobile?40:100,padding:mobile?"40px 12px":undefined,zIndex:1000}}>
      <div onClick={e=>e.stopPropagation()} style={{width:440,maxWidth:"100%",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,boxShadow:"0 25px 60px rgba(0,0,0,.15)",overflow:"hidden"}}>
        <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search shows, views, actions..." onKeyDown={onKey} style={{width:"100%",padding:mobile?"16px 18px":"14px 18px",background:"transparent",border:"none",borderBottom:"1px solid var(--border)",color:"var(--text)",fontSize:mobile?16:14,outline:"none",fontWeight:500}}/>
        <div ref={listRef} style={{maxHeight:360,overflow:"auto"}}>
          {res.length===0&&<div style={{padding:"22px 18px",textAlign:"center",fontSize:11,color:"var(--text-mute)"}}>No matches. Press <kbd style={{fontFamily:MN,fontSize:10,padding:"1px 5px",background:"var(--card-2)",borderRadius:4}}>Esc</kbd> to close.</div>}
          {res.map((r,i)=>{const active=i===sel1;return <div key={`${r.type}-${r.id}-${i}`} data-idx={i} onClick={()=>go(r)} onMouseEnter={()=>setSel1(i)} style={{padding:mobile?"12px 18px":"10px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,background:active?"var(--accent-pill-bg)":"transparent",borderBottom:"1px solid var(--card-3)",borderLeft:active?"3px solid var(--accent)":"3px solid transparent"}}>
            <span style={{fontSize:11,color:active?"var(--accent)":"var(--text-dim)",width:16,fontFamily:MN,fontWeight:700}}>{r.type==="tab"||r.type==="action"?r.icon:r.type==="client"?CM[r.id]?.short||"●":fW(r.id)}</span>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:mobile?13:12,color:"var(--text)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>{r.sub&&<div style={{fontSize:10,color:"var(--text-dim)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.sub}</div>}</div>
            {r.cId&&<div style={{width:7,height:7,borderRadius:"50%",background:CM[r.cId]?.color||"var(--text-mute)"}}/>}
            <span style={{fontSize:8,color:active?"var(--accent)":"var(--text-mute)",fontFamily:MN,letterSpacing:"0.04em",textTransform:"uppercase"}}>{r.type}</span>
          </div>;})}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"7px 14px",borderTop:"1px solid var(--border)",background:"var(--card-4)",fontSize:9,color:"var(--text-dim)",fontFamily:MN}}>
          <span><kbd style={{fontFamily:MN,padding:"1px 5px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:4}}>↑↓</kbd> navigate</span>
          <span><kbd style={{fontFamily:MN,padding:"1px 5px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:4}}>↵</kbd> select</span>
          <span><kbd style={{fontFamily:MN,padding:"1px 5px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:4}}>esc</kbd> close</span>
          <span style={{marginLeft:"auto"}}>⌘K</span>
        </div>
      </div>
    </div>
  );
}

// Compact lifecycle pill row for a single crew member on a specific date.
// Adapts to bus dates (simpler chain, bus as lodging) vs fly dates/one-offs (full
// airport ↔ hotel ↔ venue chain with hotel as lodging). Clicking any pill jumps to
// the Transport → Travel Day view for that date; the user can then complete the
// gap using the +Ground / +Flight / +Hotel creators.
function LifecyclePills({crewId,date,state,slots,onJump,compact}){
  const color=s=>({
    ok:{bg:"var(--success-bg)",c:"var(--success-fg)",bd:"var(--success-fg)"},
    missing:{bg:"var(--warn-bg)",c:"var(--warn-fg)",bd:"var(--warn-bg)"},
    na:{bg:"var(--card-2)",c:"var(--text-mute)",bd:"var(--border)"},
    unknown:{bg:"var(--accent-pill-bg)",c:"var(--accent)",bd:"var(--accent-pill-border)"},
  }[s]||{bg:"var(--card-2)",c:"var(--text-mute)",bd:"var(--border)"});
  const stateLabel={"bus-mid":"ON BUS","bus-join":"BUS JOIN","bus-leave":"BUS LEAVE","bus-solo":"BUS · SOLO","fly-one-off":"FLY · HOTEL"}[state]||"";
  const missing=slots.filter(s=>s.state==="missing").length;
  return(
    <div style={{display:"inline-flex",alignItems:"center",gap:4,flexWrap:"wrap"}} title={`${stateLabel}${missing?` — ${missing} missing`:""}`}>
      {!compact&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:state==="fly-one-off"?"var(--accent-pill-bg)":"var(--info-bg)",color:state==="fly-one-off"?"var(--accent)":"var(--link)",fontWeight:800,letterSpacing:"0.06em"}}>{stateLabel}</span>}
      {slots.map(s=>{const col=color(s.state);return(
        <button key={s.key} onClick={e=>{e.stopPropagation();onJump?.(s);}} title={`${s.label} — ${s.state==="ok"?"confirmed":s.state==="missing"?"missing":s.state==="unknown"?"not tracked":"not applicable"}`} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:compact?9:10,padding:compact?"2px 5px":"2px 7px",borderRadius:10,border:`1px solid ${col.bd}`,background:col.bg,color:col.c,cursor:"pointer",fontWeight:700,lineHeight:1}}>
          <span style={{fontSize:compact?9:10}}>{s.icon}</span>
          {s.state==="ok"&&<span style={{fontSize:8}}>✓</span>}
          {s.state==="missing"&&<span style={{fontSize:8}}>○</span>}
        </button>);})}
    </div>
  );
}

function CrewTab(){
  const{sel,setSel,shows,tourDaysSorted,tourDays,crew,setCrew,showCrew,setShowCrew,mobile,pushUndo,flights,lodging,setTab,currentSplit,activeSplitPartyId,activeSplitParty,eventKey}=useContext(Ctx);
  const[panel,setPanel]=useState(null);
  const[editMode,setEditMode]=useState(false);
  const[flightPicker,setFlightPicker]=useState(null); // {crewId, dir}
  const[addPickerOpen,setAddPickerOpen]=useState(false);
  const[addPickerSel,setAddPickerSel]=useState([]);
  const show=shows[sel];
  const today=new Date().toISOString().slice(0,10);
  // eventKey already includes split-party scope on split days.
  const scKey=eventKey;
  const realDate=k=>String(k).split("#")[0];
  const sc=showCrew[scKey]||{};
  const uid=()=>Math.random().toString(36).slice(2,9);

  // Nearest prior date with any crew data (strip split suffix when comparing)
  const prevDate=useMemo(()=>{
    const candidates=Object.keys(showCrew).filter(k=>realDate(k)<sel&&Object.keys(showCrew[k]||{}).length>0).sort();
    return candidates[candidates.length-1]||null;
  },[sel,showCrew]);
  const prevCrew=prevDate?showCrew[prevDate]:null;
  const isInheriting=!showCrew[scKey]&&!!prevCrew;

  const copyFromPrev=()=>{
    if(!prevCrew)return;
    setShowCrew(p=>({...p,[scKey]:{...prevCrew}}));
  };

  const getCD=(crewId)=>{
    const d=sc[crewId]||(isInheriting?prevCrew?.[crewId]:null)||{};
    const legacy=d.travelMode||"bus";
    return{attending:false,inboundMode:legacy,outboundMode:legacy,inboundConfirmed:false,outboundConfirmed:false,inbound:[],outbound:[],inboundDate:"",inboundTime:"",inboundNotes:"",outboundDate:"",outboundTime:"",outboundNotes:"",parkingReq:"none",...d,travelMode:undefined};
  };
  const updateSC=(crewId,patch)=>setShowCrew(p=>({...p,[scKey]:{...p[scKey],[crewId]:{...getCD(crewId),...patch}}}));
  const toggleAttending=(crewId)=>{const cd=getCD(crewId);updateSC(crewId,{attending:!cd.attending});};
  const setInboundMode=(crewId,mode)=>updateSC(crewId,{inboundMode:mode});
  const setOutboundMode=(crewId,mode)=>updateSC(crewId,{outboundMode:mode});
  const cycleParkingReq=(crewId)=>{const cur=getCD(crewId).parkingReq||"none";const next={none:"requested",requested:"confirmed",confirmed:"none"};updateSC(crewId,{parkingReq:next[cur]||"none"});};
  const addLeg=(crewId,dir)=>{const cd=getCD(crewId);const leg={id:uid(),flight:"",from:"",to:"",depart:"",arrive:"",conf:"",status:"pending"};updateSC(crewId,{[dir]:[...(cd[dir]||[]),leg]});setPanel({crewId});};
  const updateLeg=(crewId,dir,legId,field,val)=>{const cd=getCD(crewId);updateSC(crewId,{[dir]:(cd[dir]||[]).map(l=>l.id===legId?{...l,[field]:val}:l)});};
  const removeLeg=(crewId,dir,legId)=>{const cd=getCD(crewId);updateSC(crewId,{[dir]:(cd[dir]||[]).filter(l=>l.id!==legId)});};
  const addMember=()=>setCrew(p=>[...p,{id:uid(),name:"",role:"",email:""}]);
  const updateMember=(id,field,val)=>setCrew(p=>p.map(c=>c.id===id?{...c,[field]:val}:c));
  const removeMember=(id)=>{const prev=crew;setCrew(p=>p.filter(c=>c.id!==id));pushUndo("Crew member removed.",()=>setCrew(prev));};

  const confirmedFlights=useMemo(()=>Object.values(flights||{}).filter(f=>f&&f.status==="confirmed"),[flights]);
  const flightsForDir=(dir)=>{
    if(dir==="inbound") return confirmedFlights.filter(f=>f.arrDate===sel);
    return confirmedFlights.filter(f=>f.depDate===sel);
  };
  const outboundNearby=useMemo(()=>{
    const d1=new Date(sel+"T12:00:00");d1.setDate(d1.getDate()+1);
    const d5=new Date(sel+"T12:00:00");d5.setDate(d5.getDate()+5);
    const d1s=d1.toISOString().slice(0,10),d5s=d5.toISOString().slice(0,10);
    return confirmedFlights.filter(f=>f.depDate&&f.depDate>=d1s&&f.depDate<=d5s)
      .sort((a,b)=>a.depDate<b.depDate?-1:1);
  },[confirmedFlights,sel]);
  const assignFlight=(crewId,dir,f)=>{
    const leg={id:`leg_${f.id}`,flight:f.flightNo||"",carrier:f.carrier||"",from:f.from,fromCity:f.fromCity||f.from,to:f.to,toCity:f.toCity||f.to,depart:f.dep,arrive:f.arr,conf:f.confirmNo||f.bookingRef||"",status:"confirmed",flightId:f.id};
    const confKey=dir==="inbound"?"inboundConfirmed":"outboundConfirmed";
    const dateKey=dir==="inbound"?"inboundDate":"outboundDate";
    const timeKey=dir==="inbound"?"inboundTime":"outboundTime";
    const timeVal=dir==="inbound"?f.arr:f.dep;
    const dateVal=dir==="inbound"?(f.arrDate||sel):f.depDate;
    setShowCrew(p=>{
      const cur=p[scKey]?.[crewId]||{};
      const ex=(cur[dir]||[]).filter(l=>l.flightId!==f.id);
      return{...p,[scKey]:{...p[scKey],[crewId]:{...cur,attending:true,inboundMode:dir==="inbound"?cur.inboundMode||"fly":cur.inboundMode,outboundMode:dir==="outbound"?cur.outboundMode||"fly":cur.outboundMode,[dir]:[...ex,leg],[confKey]:true,[dateKey]:dateVal,[timeKey]:timeVal||""}}};
    });
    setFlightPicker(null);
  };
  const unassignFlight=(crewId,dir,flightId)=>{
    setShowCrew(p=>{
      const cur=p[scKey]?.[crewId]||{};
      return{...p,[scKey]:{...p[scKey],[crewId]:{...cur,[dir]:(cur[dir]||[]).filter(l=>l.flightId!==flightId)}}};
    });
  };

  const rosterCrew=activeSplitParty?crew.filter(c=>activeSplitParty.crew.includes(c.id)):crew;
  const attending=rosterCrew.filter(c=>getCD(c.id).attending);
  // Per-crew attending dates across the whole tour, sorted. Used to classify
  // bus-mid vs bus-join vs bus-leave for the lifecycle pills.
  const attendingDatesByCrew=useMemo(()=>{
    const m={};
    Object.entries(showCrew||{}).forEach(([k,perCrew])=>{
      const d=realDate(k);
      Object.entries(perCrew||{}).forEach(([cid,rec])=>{
        if(rec?.attending){const arr=(m[cid]=m[cid]||new Set());arr.add(d);}
      });
    });
    const out={};
    Object.keys(m).forEach(cid=>{out[cid]=[...m[cid]].sort();});
    return out;
  },[showCrew]);
  const jumpToTravelDay=(date)=>{setSel(date);setTab("transport");};
  const panelCrew=panel?crew.find(c=>c.id===panel.crewId):null;
  const panelCD=panel?getCD(panel.crewId):null;

  const TRAVEL_MODES=["bus","fly","local","vendor","drive","n/a"];
  const LEG_STATUS=["pending","confirmed","cancelled"];
  const inp={background:"var(--card-3)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 6px",outline:"none",width:"100%",fontFamily:"'Outfit',system-ui"};
  const btn=(bg="var(--accent)",col="var(--card)")=>({background:bg,border:"none",borderRadius:6,color:col,fontSize:10,padding:"4px 11px",cursor:"pointer",fontWeight:700});

  const dateLabel=(d)=>{const s=shows[d];const td=tourDaysSorted.find(x=>x.date===d);if(s)return s.city||s.venue||fD(d);if(td?.type==="travel"&&td?.bus?.route)return td.bus.route;return fD(d);};
  const dayType=(d)=>{const s=shows[d];if(s)return s.type||"show";const td=tourDaysSorted.find(x=>x.date===d);return td?.type||"off";};

  return(
    <div className="fi" style={{display:"flex",height:"calc(100vh - 115px)"}}>
      {/* Main panel */}
      <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{padding:"6px 20px",borderBottom:"1px solid var(--border)",background:"var(--card)",display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,fontSize:11}}>{show?.venue||dateLabel(sel)}</span>
        <span style={{fontSize:11,color:"var(--text-dim)"}}>{show?.city||""}{show?.city?" · ":""}{fFull(sel)}</span>
        {activeSplitParty&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:activeSplitParty.bg,color:activeSplitParty.color,fontWeight:700}}>{activeSplitParty.label} · {rosterCrew.length} crew</span>}
        <span style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:"var(--accent-pill-bg)",color:"var(--accent)",fontWeight:700}}>{attending.length} attending</span>
        <div style={{marginLeft:"auto",display:"flex",gap:5}}>
          <button onClick={()=>setTab("transport")} title="Open per-date travel view for all crew" style={{...btn("var(--card-3)","var(--accent)"),border:"1px solid var(--accent-pill-border)"}}>🧭 Travel Day →</button>
          <button onClick={()=>setEditMode(v=>!v)} style={btn(editMode?"var(--accent)":"var(--card-3)",editMode?"var(--card)":"var(--text-2)")}>{editMode?"Done Editing":"Edit Roster"}</button>
          {editMode&&<button onClick={addMember} style={btn("var(--card-3)","var(--text-2)")}>+ New Member</button>}
          <button onClick={()=>{setAddPickerOpen(v=>!v);setAddPickerSel([]);}} style={btn(addPickerOpen?"var(--accent)":"var(--success-fg)")}>{addPickerOpen?"Cancel":"+ Add to Event"}</button>
        </div>
      </div>
      {isInheriting&&prevDate&&(
        <div style={{margin:"10px 20px 0",padding:"7px 12px",background:"var(--warn-bg)",border:"1px solid var(--warn-bg)",borderRadius:10,display:"flex",alignItems:"center",gap:8,fontSize:9}}>
          <span style={{color:"var(--warn-fg)"}}>Showing crew carried from <strong>{fFull(prevDate)}</strong> — no data saved for this date yet.</span>
          <button onClick={copyFromPrev} style={{marginLeft:"auto",fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--warn-fg)",color:"#fff",cursor:"pointer",fontWeight:700,flexShrink:0}}>Copy to {fD(sel)}</button>
        </div>
      )}
      {addPickerOpen&&(()=>{
        const notAttending=crew.filter(c=>!getCD(c.id).attending);
        const confirmAdd=()=>{
          addPickerSel.forEach(id=>updateSC(id,{attending:true}));
          setAddPickerOpen(false);setAddPickerSel([]);
        };
        return(
          <div style={{margin:"10px 20px 0",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
            <div style={{padding:"8px 14px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8,fontSize:10,fontWeight:700}}>
              <span>Add to {show?.venue||dateLabel(sel)}</span>
              <span style={{fontSize:9,color:"var(--text-dim)",fontWeight:400}}>{addPickerSel.length} selected</span>
              <div style={{marginLeft:"auto",display:"flex",gap:5}}>
                {notAttending.length>0&&<button onClick={()=>setAddPickerSel(addPickerSel.length===notAttending.length?[]:notAttending.map(c=>c.id))} style={{background:"none",border:"1px solid var(--border)",borderRadius:6,fontSize:9,padding:"3px 9px",cursor:"pointer",color:"var(--text-2)"}}>{addPickerSel.length===notAttending.length?"Deselect All":"Select All"}</button>}
                <button onClick={confirmAdd} disabled={addPickerSel.length===0} style={{background:addPickerSel.length?"var(--success-fg)":"var(--card-3)",border:"none",borderRadius:6,fontSize:10,padding:"4px 12px",cursor:addPickerSel.length?"pointer":"default",color:addPickerSel.length?"#fff":"var(--text-mute)",fontWeight:700}}>Add {addPickerSel.length>0?addPickerSel.length+" ":""}</button>
              </div>
            </div>
            {notAttending.length===0
              ?<div style={{padding:"14px",fontSize:10,color:"var(--text-dim)"}}>All roster members are already attending.</div>
              :<div style={{display:"flex",flexDirection:"column",maxHeight:260,overflowY:"auto"}}>
                {notAttending.map(c=>{
                  const sel2=addPickerSel.includes(c.id);
                  return(
                    <div key={c.id} onClick={()=>setAddPickerSel(p=>sel2?p.filter(x=>x!==c.id):[...p,c.id])} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 14px",borderBottom:"1px solid var(--card-3)",cursor:"pointer",background:sel2?"var(--accent-pill-bg)":"transparent"}}>
                      <div style={{width:16,height:16,borderRadius:3,border:`2px solid ${sel2?"var(--accent)":"var(--border)"}`,background:sel2?"var(--accent)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        {sel2&&<span style={{color:"#fff",fontSize:10,fontWeight:700}}>✓</span>}
                      </div>
                      <div>
                        <div style={{fontSize:11,fontWeight:600,color:"var(--text)"}}>{c.name||<span style={{color:"var(--text-mute)"}}>Unnamed</span>}</div>
                        <div style={{fontSize:9,color:"var(--text-dim)"}}>{c.role}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            }
          </div>
        );
      })()}
      <div style={{padding:"10px 20px 30px",display:"flex",flexDirection:"column",gap:10}}>
        {/* Roster */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:mobile?"28px 1fr 54px 56px":"28px 1fr 170px 54px 56px",gap:8,padding:"6px 14px",borderBottom:"1px solid var(--border)",fontSize:9,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.06em",textTransform:"uppercase"}}>
            <div/><div>Name / Role</div>{!mobile&&<div>Travel</div>}<div>Park</div><div/>
          </div>
          {rosterCrew.map(c=>{
            const cd=getCD(c.id);
            const isOpen=panel?.crewId===c.id;
            const MB=(mode,conf)=>{
              const isFly=mode==="fly";
              return <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,fontWeight:700,background:isFly?"var(--accent-pill-bg)":"var(--card-2)",color:isFly?"var(--accent)":"var(--text-2)",textTransform:"uppercase"}}>{mode.slice(0,3)}</span>
                <span style={{fontSize:8,padding:"1px 6px",borderRadius:4,fontWeight:700,background:conf?"var(--success-bg)":"var(--danger-bg)",color:conf?"var(--success-fg)":"var(--danger-fg)"}}>{conf?"Confirmed":"Unconfirmed"}</span>
              </span>;
            };
            return(
            <React.Fragment key={c.id}>
              <div style={{display:"grid",gridTemplateColumns:mobile?"28px 1fr 54px 56px":"28px 1fr 170px 54px 56px",gap:8,padding:"8px 14px",borderBottom:isOpen?"none":"1px solid var(--card-3)",alignItems:"center"}}>
                <div onClick={()=>toggleAttending(c.id)} style={{width:20,height:20,borderRadius:4,border:`2px solid ${cd.attending?"var(--success-fg)":"var(--border)"}`,background:cd.attending?"var(--success-fg)":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:700,flexShrink:0}}>{cd.attending?"✓":""}</div>
                {editMode?(
                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    <input value={c.name} onChange={e=>updateMember(c.id,"name",e.target.value)} placeholder="Name" style={{...inp,flex:1}}/>
                    <input value={c.role} onChange={e=>updateMember(c.id,"role",e.target.value)} placeholder="Role" style={{...inp,flex:1}}/>
                    <input value={c.email} onChange={e=>updateMember(c.id,"email",e.target.value)} placeholder="Email" style={{...inp,flex:1}}/>
                    <button onClick={()=>removeMember(c.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13,flexShrink:0}}>×</button>
                  </div>
                ):(
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:11,color:cd.attending?"var(--text)":"var(--text-mute)"}}>{c.name||<span style={{color:"var(--text-mute)"}}>New member</span>}</div>
                    <div style={{fontSize:10,color:"var(--text-dim)"}}>{c.role}</div>
                    {cd.attending&&(()=>{
                      try{
                        const attDates=attendingDatesByCrew[c.id]||[sel];
                        const state=crewLifecycleState(c.id,sel,attDates,tourDays);
                        const slots=crewLifecycleSlots({state,crewId:c.id,crew,date:sel,showCrew:currentSplit?{...showCrew,[sel]:showCrew[scKey]||{}}:showCrew,flights,lodging});
                        const jump=slot=>{
                          setSel(sel);
                          if(slot?.key==="hotel")setTab("lodging");
                          else setTab("transport");
                        };
                        return(
                          <div style={{marginTop:5}}>
                            <LifecyclePills crewId={c.id} date={sel} state={state} slots={slots} compact={mobile} onJump={jump}/>
                          </div>
                        );
                      }catch(e){
                        console.error("[lifecycle]",c.name,e);
                        return null;
                      }
                    })()}
                  </div>
                )}
                {!mobile&&<div>{cd.attending
                  ?<div style={{display:"flex",flexDirection:"column",gap:4}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:8,color:"var(--text-mute)",width:18}}>In</span>{MB(cd.inboundMode,cd.inboundConfirmed)}</div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:8,color:"var(--text-mute)",width:18}}>Out</span>{MB(cd.outboundMode,cd.outboundConfirmed)}</div>
                    </div>
                  :<span style={{fontSize:9,color:"var(--border)"}}>—</span>}
                </div>}
                <div>{cd.attending
                  ?<button onClick={()=>cycleParkingReq(c.id)} style={{fontSize:8,padding:"2px 6px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,
                      background:cd.parkingReq==="confirmed"?"var(--success-bg)":cd.parkingReq==="requested"?"var(--warn-bg)":"var(--card-2)",
                      color:cd.parkingReq==="confirmed"?"var(--success-fg)":cd.parkingReq==="requested"?"var(--warn-fg)":"var(--text-mute)"}}>
                    {cd.parkingReq==="confirmed"?"✓ P":cd.parkingReq==="requested"?"Req":"—"}
                  </button>
                  :<span/>}
                </div>
                <div>{cd.attending&&<button onClick={()=>setPanel(isOpen?null:{crewId:c.id})} style={{...UI.expandBtn(isOpen),fontSize:9,padding:"3px 8px"}}>{isOpen?"▾":"▸"}</button>}</div>
              </div>
              {isOpen&&(
                <div style={{background:"var(--card-3)",borderTop:"1px solid var(--card-3)",borderBottom:"1px solid var(--card-3)",padding:"12px 14px",display:"flex",flexDirection:"column",gap:12}}>
                  {/* Lodging badge */}
                  {(()=>{const crewHotels=Object.values(lodging).filter(h=>h.checkIn<=sel&&h.checkOut>=sel&&(h.rooms||[]).some(r=>r.crewId===c.id));return crewHotels.length>0&&(<div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"5px 8px",background:"var(--info-bg)",border:"1px solid var(--info-bg)",borderRadius:6}}>
                    <span style={{fontSize:9,fontWeight:700,color:"var(--link)",letterSpacing:"0.04em"}}>LODGING</span>
                    {crewHotels.map(h=>{const room=(h.rooms||[]).find(r=>r.crewId===c.id);return(<span key={h.id} style={{fontSize:11,color:"var(--text)",fontWeight:600}}>{h.name}{room?.roomNo&&<span style={{fontFamily:MN,color:"var(--text-dim)",marginLeft:4}}>#{room.roomNo}</span>}{room?.type&&<span style={{color:"var(--text-mute)",fontSize:9,marginLeft:4}}>{room.type}</span>}</span>);})}
                    <button onClick={()=>setTab("lodging")} style={{marginLeft:"auto",fontSize:9,padding:"2px 7px",borderRadius:6,border:"none",background:"var(--info-fg)",color:"#fff",cursor:"pointer",fontWeight:700}}>→ Lodging</button>
                  </div>);})()}
                  <div style={{display:"flex",flexDirection:mobile?"column":"row",gap:16}}>
                  {[["inbound","Inbound"],["outbound","Outbound"]].map(([dir,dirLabel])=>{
                    const mode=dir==="inbound"?cd.inboundMode:cd.outboundMode;
                    const conf=dir==="inbound"?cd.inboundConfirmed:cd.outboundConfirmed;
                    const confKey=dir==="inbound"?"inboundConfirmed":"outboundConfirmed";
                    const dateKey=`${dir}Date`,timeKey=`${dir}Time`,notesKey=`${dir}Notes`;
                    return(
                      <div key={dir} style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                          <span style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.06em"}}>{dirLabel.toUpperCase()}</span>
                          <select value={mode} onChange={e=>dir==="inbound"?setInboundMode(c.id,e.target.value):setOutboundMode(c.id,e.target.value)} style={{...inp,width:"auto",padding:"2px 6px",fontSize:9}}>
                            {TRAVEL_MODES.map(m=><option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
                          </select>
                          <button onClick={()=>updateSC(c.id,{[confKey]:!conf})} style={{fontSize:9,padding:"2px 9px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,marginLeft:"auto",
                            background:conf?"var(--success-bg)":"var(--warn-bg)",color:conf?"var(--success-fg)":"var(--warn-fg)"}}>
                            {conf?"✓ Confirmed":"Unconfirmed"}
                          </button>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"130px 100px",gap:6,alignItems:"center",marginBottom:mode==="fly"?8:6}}>
                          <input type="date" value={cd[dateKey]||""} onChange={e=>updateSC(c.id,{[dateKey]:e.target.value})} title={`${dirLabel} date`} style={inp}/>
                          <input type="time" value={cd[timeKey]||""} onChange={e=>updateSC(c.id,{[timeKey]:e.target.value})} title={`${dirLabel} time`} style={inp}/>
                        </div>
                        {mode==="fly"?(
                          <div style={{display:"flex",flexDirection:"column",gap:6}}>
                            {(cd[dir]||[]).map(leg=>{
                              const isAssigned=!!leg.flightId;
                              return isAssigned?(
                                <div key={leg.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"var(--accent-pill-bg)",borderRadius:6,border:"1px solid var(--accent-pill-border)"}}>
                                  <span style={{fontSize:9,fontWeight:700,color:"var(--accent)",whiteSpace:"nowrap"}}>✈ {leg.flight||"—"}</span>
                                  <span style={{fontSize:9,color:"var(--text-2)",flex:1}}>{leg.fromCity||leg.from} → {leg.toCity||leg.to}</span>
                                  {leg.depart&&<span style={{fontSize:9,fontFamily:MN,color:"var(--text-dim)",whiteSpace:"nowrap"}}>{leg.depart}{leg.arrive?` → ${leg.arrive}`:""}</span>}
                                  {leg.conf&&<span style={{fontSize:8,color:"var(--text-mute)",fontFamily:MN,whiteSpace:"nowrap"}}>#{leg.conf}</span>}
                                  <button onClick={()=>unassignFlight(c.id,dir,leg.flightId)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13,padding:0,flexShrink:0,lineHeight:1}}>×</button>
                                </div>
                              ):(
                                <div key={leg.id} style={{display:"grid",gridTemplateColumns:"1fr 70px 70px 90px 90px 80px 24px",gap:4,alignItems:"center"}}>
                                  {[["flight","Flight #"],["from","From"],["to","To"],["depart","Depart"],["arrive","Arrive"]].map(([k,ph])=>(
                                    <input key={k} placeholder={ph} value={leg[k]} onChange={e=>updateLeg(c.id,dir,leg.id,k,e.target.value)} style={inp}/>
                                  ))}
                                  <select value={leg.status} onChange={e=>updateLeg(c.id,dir,leg.id,"status",e.target.value)} style={{...inp,padding:"3px 4px",fontSize:9}}>
                                    {LEG_STATUS.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                                  </select>
                                  <button onClick={()=>removeLeg(c.id,dir,leg.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13,padding:0}}>×</button>
                                </div>
                              );
                            })}
                            {/* Flight picker dropdown */}
                            {flightPicker?.crewId===c.id&&flightPicker?.dir===dir?(
                              <div style={{background:"var(--card)",border:"1px solid var(--accent-pill-border)",borderRadius:10,overflow:"hidden",boxShadow:"0 4px 16px rgba(0,0,0,0.10)"}}>
                                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderBottom:"1px solid var(--border)",background:"var(--card-3)"}}>
                                  <span style={{fontSize:9,fontWeight:800,color:"var(--accent)",letterSpacing:"0.06em"}}>ASSIGN FLIGHT — {dir==="inbound"?"ARRIVALS":"DEPARTURES"} {fD(sel)}</span>
                                  <button onClick={()=>setFlightPicker(null)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-mute)",fontSize:13,padding:0,lineHeight:1}}>×</button>
                                </div>
                                {(()=>{
                                  const exact=flightsForDir(dir);
                                  const nearby=dir==="outbound"?outboundNearby:[];
                                  const renderRow=(f,badge)=>{const alreadyAssigned=(cd[dir]||[]).some(l=>l.flightId===f.id);return(
                                    <div key={f.id} onClick={()=>!alreadyAssigned&&assignFlight(c.id,dir,f)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderBottom:"1px solid var(--card-3)",cursor:alreadyAssigned?"default":"pointer",background:alreadyAssigned?"var(--card-3)":"var(--card)",opacity:alreadyAssigned?0.6:1,flexWrap:"wrap"}} className="rh">
                                      <span style={{fontFamily:MN,fontSize:12,fontWeight:800,color:"var(--link)",flexShrink:0}}>{f.from}<span style={{fontSize:9,color:"var(--text-mute)",fontWeight:400,padding:"0 4px"}}>→</span>{f.to}</span>
                                      <span style={{fontSize:10,fontWeight:700,color:"var(--text)",flexShrink:0}}>{f.flightNo||f.carrier}</span>
                                      {f.carrier&&f.flightNo&&<span style={{fontSize:9,color:"var(--text-dim)",flexShrink:0}}>{f.carrier}</span>}
                                      <span style={{fontFamily:MN,fontSize:9,color:"var(--text-2)",flexShrink:0}}>{f.dep}{f.arr?`–${f.arr}`:""}</span>
                                      {(f.fromCity||f.toCity)&&<span style={{fontSize:9,color:"var(--text-mute)",flexShrink:0}}>{f.fromCity||f.from} → {f.toCity||f.to}</span>}
                                      {f.depDate!==sel&&<span style={{fontFamily:MN,fontSize:8,color:"var(--text-mute)",flexShrink:0}}>{fD(f.depDate)}</span>}
                                      {f.pnr&&<span style={{fontFamily:MN,fontSize:8,fontWeight:700,color:"var(--text-2)",flexShrink:0}}>{f.pnr}</span>}
                                      {f.fareClass&&<span style={{fontSize:8,color:"var(--text-mute)",textTransform:"capitalize",flexShrink:0}}>{f.fareClass}</span>}
                                      {f.pax?.length>0&&<span style={{fontSize:8,color:"var(--text-mute)",flexShrink:0}}>{f.pax.length} pax</span>}
                                      <span style={{flex:1}}/>
                                      {badge&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"var(--warn-bg)",color:"var(--warn-fg)",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>{badge}</span>}
                                      {alreadyAssigned?<span style={{fontSize:8,color:"var(--success-fg)",fontWeight:700,flexShrink:0}}>✓ Assigned</span>:<span style={{fontSize:9,color:"var(--accent)",fontWeight:700,flexShrink:0}}>Assign →</span>}
                                    </div>
                                  );};
                                  if(exact.length===0&&nearby.length===0)return <div style={{padding:"12px 10px",fontSize:10,color:"var(--text-mute)",textAlign:"center"}}>No confirmed {dir==="inbound"?"arrivals":"departures"} on {fD(sel)}.<br/><span style={{fontSize:9}}>Scan Gmail for flights in Transport tab.</span></div>;
                                  return(<>
                                    {exact.map(f=>renderRow(f,null))}
                                    {nearby.length>0&&<>
                                      <div style={{padding:"4px 10px",fontSize:8,fontWeight:800,letterSpacing:"0.07em",color:"var(--text-mute)",background:"var(--card-2)",borderTop:exact.length?"1px solid var(--border)":"none"}}>UPCOMING DEPARTURES</div>
                                      {nearby.map(f=>renderRow(f,`D+${Math.round((new Date(f.depDate+"T12:00:00")-new Date(sel+"T12:00:00"))/86400000)}`))}
                                    </>}
                                  </>);
                                })()}
                                <div style={{padding:"6px 10px",borderTop:"1px solid var(--border)",background:"var(--card-3)"}}>
                                  <button onClick={()=>addLeg(c.id,dir)} style={{...btn("var(--text-dim)"),fontSize:8,padding:"2px 8px"}}>+ Enter manually</button>
                                </div>
                              </div>
                            ):(
                              <div style={{display:"flex",gap:6}}>
                                <button onClick={()=>setFlightPicker({crewId:c.id,dir})} style={{...btn("var(--accent)"),fontSize:9,padding:"3px 10px"}}>✈ Assign Flight</button>
                                <button onClick={()=>addLeg(c.id,dir)} style={{...btn("var(--text-dim)"),fontSize:9,padding:"3px 9px"}}>+ Manual</button>
                              </div>
                            )}
                          </div>
                        ):(
                          <input value={cd[notesKey]||""} onChange={e=>updateSC(c.id,{[notesKey]:e.target.value})} placeholder={dir==="inbound"?"Pickup / meet point…":"Drop-off / instructions…"} style={inp}/>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
            </React.Fragment>
            );
          })}
        </div>
        {/* Summary */}
        {attending.length>0&&(
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.06em",marginBottom:8}}>ATTENDING ({attending.length})</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {attending.map(c=>{const cd=getCD(c.id);const hasFly=cd.inboundMode==="fly"||cd.outboundMode==="fly";const sameMode=cd.inboundMode===cd.outboundMode;const bothConfirmed=cd.inboundConfirmed&&cd.outboundConfirmed;const noneConfirmed=!cd.inboundConfirmed&&!cd.outboundConfirmed;return(
                <span key={c.id} style={{fontSize:10,padding:"3px 9px",borderRadius:99,background:hasFly?"var(--accent-pill-bg)":"var(--card-2)",color:hasFly?"var(--accent)":"var(--text-2)",fontWeight:600,border:`1px solid ${bothConfirmed?"var(--success-fg)":noneConfirmed?"var(--warn-bg)":"var(--border)"}`}}>
                  {c.name} <span style={{opacity:0.6,fontSize:8,textTransform:"uppercase"}}>{sameMode?cd.inboundMode:`${cd.inboundMode}→${cd.outboundMode}`}</span>{bothConfirmed&&<span style={{fontSize:8,color:"var(--success-fg)",marginLeft:3}}>✓</span>}
                </span>);
              })}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function PH({label}){return<div className="fi" style={{padding:40,textAlign:"center",color:"var(--text-dim)"}}><div style={{fontSize:13,fontWeight:700,marginBottom:6,color:"var(--text-2)"}}>{label}</div><div style={{fontSize:11}}>Coming in a future phase.</div></div>;}

// ── Production Intelligence Engine (PIE) ────────────────────────────────────

// Equipment manifest seeded from bbno$ EU Production Binder
// Neg Earth 26-1273 | Sonalyst 26-0097 | Design Spec v1.0.0
const MANIFEST_SEED=[
  // LIGHTING
  {id:"s1",department:"LIGHTING",item_name:"Ayrton Diablo S (550W Profile)",model_ref:"Ayrton Diablo S",qty:8,weight_kg:21.8,power_w:550,ip_rating:"IP20",rig_position:"fly",is_package:false,notes:"DESIGN SPEC. Neg Earth quoted Perseo-S instead. IP20. Profile/beam/effects hybrid.",vendor_name:"Design Spec v1.0.0",vendor_quote_ref:"v1.0.0",source_type:"design_spec",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:true,discrepancy_type:"FIXTURE MISMATCH",flag_severity:"HIGH",flag_note:"Neg Earth quoted Perseo-S instead — confirm with Sheck before PO",included:true},
  {id:"s2",department:"LIGHTING",item_name:"Ayrton Perseo-S (Neg Earth actual)",model_ref:"Ayrton Perseo-S",qty:8,weight_kg:26,power_w:520,ip_rating:"IP65",rig_position:"fly",is_package:false,notes:"QUOTED substitute for Diablo. Beam fixture, different category. Requires Sheck sign-off.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:true,discrepancy_type:"FIXTURE MISMATCH",flag_severity:"HIGH",flag_note:"NOT per design spec — confirm with Sheck",included:true},
  {id:"s3",department:"LIGHTING",item_name:"GLP JDC2 IP (Hybrid LED Strobe)",model_ref:"GLP JDC2 IP",qty:16,weight_kg:24,power_w:1500,ip_rating:"IP65",rig_position:"fly",is_package:false,notes:"DigiFX + NDI. 180° tilt. Dedicated circuit per unit.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s4",department:"LIGHTING",item_name:"ACME Pixel Line IP (STROBE 3 IP, RGBW)",model_ref:"ACME Pixel Line IP",qty:12,weight_kg:4.5,power_w:420,ip_rating:"IP66",rig_position:"fly",is_package:false,notes:"672 RGB + 112 CW LEDs, 32 sections. Smart Glass Technology.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s5",department:"LIGHTING",item_name:"Look Solutions Unique 2.1 Hazer (DMX)",model_ref:"Look Solutions Unique 2.1",qty:2,weight_kg:14,power_w:500,ip_rating:null,rig_position:"ground",is_package:false,notes:"DMX-controlled touring hazer.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s6",department:"LIGHTING",item_name:"ProFan DMX Effect Fan",model_ref:null,qty:2,weight_kg:7,power_w:150,ip_rating:null,rig_position:"ground",is_package:false,notes:"DMX fan. Used with hazer.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s7",department:"LIGHTING",item_name:"10' HUD Black Box Truss Section",model_ref:null,qty:6,weight_kg:9,power_w:null,ip_rating:null,rig_position:"fly",is_package:false,notes:"Neg Earth spec. Design calls Tyler Truss GT 10' — confirm compatibility.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:true,discrepancy_type:"TRUSS MISMATCH",flag_severity:"MEDIUM",flag_note:"Truss brand ≠ design spec (Tyler GT) — confirm coupler compatibility",included:true},
  // VIDEO
  {id:"s8",department:"VIDEO",item_name:"ROE Carbon CB5 5.76mm LED Panel (T4v Frame)",model_ref:"ROE Carbon CB5",qty:48,weight_kg:13.9,power_w:400,ip_rating:"IP65",rig_position:"fly",is_package:false,notes:"600×1200mm. Brompton-mapped. IP65. Design: 'ROE MC-5H T4v Frame' — confirm same panel.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:true,discrepancy_type:"MODEL DESIGNATION",flag_severity:"MEDIUM",flag_note:"Panel model designation mismatch vs. drawing — confirm ROE CB5 = MC-5H T4v",included:true},
  {id:"s9",department:"VIDEO",item_name:"Brompton S4 LED Processor",model_ref:"Brompton S4",qty:2,weight_kg:5,power_w:250,ip_rating:null,rig_position:"fly",is_package:false,notes:"Main + backup. Required for ROE CB5 operation.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s10",department:"VIDEO",item_name:"ROE Air Frame Double Hanging Bar 1.2m",model_ref:null,qty:6,weight_kg:6,power_w:null,ip_rating:null,rig_position:"fly",is_package:false,notes:"Panel suspension system for LED wall.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s11",department:"VIDEO",item_name:"LITEC Supertruss 30.5cm 1m Section (Black)",model_ref:null,qty:1,weight_kg:4,power_w:null,ip_rating:null,rig_position:"fly",is_package:false,notes:"Video truss structure.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s12",department:"VIDEO",item_name:"LITEC Supertruss 30.5cm 3m Section (Black)",model_ref:null,qty:2,weight_kg:12,power_w:null,ip_rating:null,rig_position:"fly",is_package:false,notes:"Video truss structure.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s13",department:"VIDEO",item_name:"500kg Chain Hoist 3ph (LITEC Exe-Rise D8+, 25m)",model_ref:null,qty:2,weight_kg:32,power_w:750,ip_rating:null,rig_position:"fly",is_package:false,notes:"4m/min. 2 hoists = 1,000kg rated vs ~800kg wall+truss load.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:true,discrepancy_type:"HOIST COUNT",flag_severity:"CRITICAL",flag_note:"Hoist count may be insufficient — verify rigging load calc with Neg Earth",included:true},
  {id:"s14",department:"VIDEO",item_name:"Motor Control Points + Rigging Points",model_ref:null,qty:4,weight_kg:null,power_w:null,ip_rating:null,rig_position:"fly",is_package:false,notes:"Per Neg Earth scope. Venue rigging approval required at each stop.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s15",department:"VIDEO",item_name:"Power, Data, Fiber & Ancillaries (Video)",model_ref:null,qty:1,weight_kg:30,power_w:null,ip_rating:null,rig_position:"fly",is_package:true,notes:"Signal path; panel distribution. Loom not separately itemised.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  // AUDIO (tour carry)
  {id:"s16",department:"AUDIO",item_name:"PK Sound T10 Robotic Line Array",model_ref:"PK Sound T10",qty:6,weight_kg:47.6,power_w:3000,ip_rating:"IP42",rig_position:"touring_carry",is_package:false,notes:"Dual 10\" bandpass LF + 2x 6.5\" CMI mid + HF planar waveguide. Robotic 60-120°. Auto-Array. 3 per side, flown.",vendor_name:"Tour carry",vendor_quote_ref:null,source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:false,flag_note:"Qty confirmed — 3 per side",included:true},
  {id:"s17",department:"AUDIO",item_name:"PK Sound T218 Intelligent Subwoofer",model_ref:"PK Sound T218",qty:12,weight_kg:104,power_w:4000,ip_rating:"IP42",rig_position:"ground",is_package:false,notes:"Dual 18\" front-loaded bass reflex. 25-100 Hz. Onboard Class D amp + DSP. Ground stacked only.",vendor_name:"Tour carry",vendor_quote_ref:null,source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:false,flag_note:"Qty confirmed — ground stacked, not in fly weight",included:true},
  // LASERS
  {id:"s18",department:"LASERS",item_name:"Kvant LD33 Spectrum RGBY (Design Spec)",model_ref:"Kvant LD33",qty:8,weight_kg:37,power_w:900,ip_rating:"IP54",rig_position:"ground",is_package:false,notes:"FB4-MAX. Saturn9 30kpps. Incl. flight case. Sonalyst £65,750 pkg (no model confirmed). Neg Earth excludes lasers.",vendor_name:"Design Spec v1.0.0",vendor_quote_ref:"v1.0.0",source_type:"design_spec",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:true,discrepancy_type:"VENDOR UNCONFIRMED",flag_severity:"CRITICAL",flag_note:"VENDOR UNCONFIRMED — Sonalyst pkg (£65,750) or Photon7. Must confirm before May 4.",included:true},
  // POWER & DISTRO
  {id:"s19",department:"POWER_DISTRO",item_name:"50mm Powerlock Cable 15m",model_ref:null,qty:2,weight_kg:8,power_w:null,ip_rating:null,rig_position:"ground",is_package:false,notes:"Main power distribution feed.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s20",department:"POWER_DISTRO",item_name:"36 Way Hot Power Rack (MFO-36)",model_ref:null,qty:1,weight_kg:22,power_w:null,ip_rating:null,rig_position:"ground",is_package:false,notes:"1× P/L in, 1× out, 6× Soca. Hot-patch capable.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  // STAGING
  {id:"s21",department:"STAGING",item_name:"Riser / Stage Package (Sonalyst)",model_ref:null,qty:1,weight_kg:null,power_w:null,ip_rating:null,rig_position:"ground",is_package:true,notes:"Sht-6: 20'×13'9\" main + 6' side exts = 32' total width. Astroturf. Multi-level. Shifted 2ft US (Rev B).",vendor_name:"Sonalyst",vendor_quote_ref:"26-0097",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s22",department:"SFX",item_name:"SFX Addition (Rev B, 3/12/26)",model_ref:null,qty:null,weight_kg:null,power_w:null,ip_rating:null,rig_position:"TBD",is_package:false,notes:"Rev B notes 'Added SFX' — type unspecified. Pyro? CO2? Confirm with Sheck/Dan.",vendor_name:"TBD",vendor_quote_ref:null,source_type:"design_spec",spec_source:"quote",visible_venue:false,has_discrepancy:true,discrepancy_type:"SFX UNSPECIFIED",flag_severity:"CRITICAL",flag_note:"SFX TYPE + VENDOR UNCONFIRMED — clarify with Sheck/Dan before advance",included:true},
];

const PROD_DEPTS=["ALL","LIGHTING","VIDEO","AUDIO","LASERS","POWER_DISTRO","STAGING","SFX","TRANSPORT","OTHER"];
const SEV_STYLES={CRITICAL:{bg:"var(--danger-bg)",c:"var(--danger-fg)",b:"var(--danger-bg)"},HIGH:{bg:"var(--warn-bg)",c:"var(--warn-fg)",b:"var(--warn-bg)"},MEDIUM:{bg:"var(--warn-bg)",c:"var(--warn-fg)",b:"var(--warn-bg)"},LOW:{bg:"var(--success-bg)",c:"var(--success-fg)",b:"var(--success-bg)"}};
const POS_STYLES={fly:{bg:"var(--accent-pill-bg)",c:"var(--accent)"},ground:{bg:"var(--success-bg)",c:"var(--success-fg)"},tower:{bg:"var(--warn-bg)",c:"var(--warn-fg)"},touring_carry:{bg:"var(--info-bg)",c:"var(--link)"},TBD:{bg:"var(--card-2)",c:"var(--text-dim)"}};

// Venue Grid 4.21 — seeded from bbno$ EU Production Binder
const VENUE_GRID={
  "2026-05-04":{venue:"National Stadium",city:"Dublin, Ireland",capacity:2000,address:"145 S Circular Rd, Merchants Quay, Dublin D08 HY40",advanceContact:"Brian Fluskey",advanceEmail:"brianfluskey@gmail.com",techContact:"MWS Ltd — murt@mws.ie | Irish Rigging Services (stage/roof)",loadDock:"TBC — advance with Brian",loadIn:"TBC — advance with Brian. Brian to send venue info shortly per Apr 11 reply.",stageDims:"TBC via advance",rigging:"Yes — Irish Rigging Services",riggingNotes:"Advance with venue — no rigging spec in LX doc",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor (main + backup). Flown or ground-stack. Max ground-stack: 7.2m × 5m.",lxNotes:"Back Truss: 6x Quantum Profile, 6x MAC Aura, 6x 2-cell moles. Front: 6x MAC Aura, 6x 2-cell moles. Console: Avolites Arena. 2x Unique2 Hazers",audioNotes:"PA: D&B V Series 6/side mains + 6 out, D&B Y10P fills, 10x D&B V-SUB, D&B D80 amps. FOH: Midas Pro2. MON: Midas Pro2. 8-way Shure PSM1000 IEM. Provider: MWS Ltd (murt@mws.ie)",soundLimit:null,venuePower:"TBC — advance with venue",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"Advance SFX requirements with MWS Ltd / venue.",flags:"Show 1 of 2",busPower:"TBC — advance with venue (MWS/Brian Fluskey)"},
  "2026-05-05":{venue:"National Stadium",city:"Dublin, Ireland",capacity:2000,address:"145 S Circular Rd, Merchants Quay, Dublin D08 HY40",advanceContact:"Brian Fluskey",advanceEmail:"brianfluskey@gmail.com",techContact:"MWS Ltd — murt@mws.ie | Irish Rigging Services (stage/roof)",loadDock:"TBC — advance with Brian",loadIn:"NO load-out after show 1. Bus overnights. Load-out after show 2.",stageDims:"TBC via advance",rigging:"Yes — Irish Rigging Services",riggingNotes:"Advance with venue — no rigging spec in LX doc",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor (main + backup). Flown or ground-stack. Max ground-stack: 7.2m × 5m.",lxNotes:"Back Truss: 6x Quantum Profile, 6x MAC Aura, 6x 2-cell moles. Front: 6x MAC Aura, 6x 2-cell moles. Console: Avolites Arena. 2x Unique2 Hazers",audioNotes:"PA: D&B V Series 6/side mains + 6 out, D&B Y10P fills, 10x D&B V-SUB, D&B D80 amps. FOH: Midas Pro2. MON: Midas Pro2. Provider: MWS Ltd (murt@mws.ie)",soundLimit:null,venuePower:"TBC — advance with venue",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"Advance SFX requirements with MWS Ltd / venue.",flags:"Show 2 of 2 — fee cross-collat",busPower:"TBC — advance with venue (MWS/Brian Fluskey)"},
  "2026-05-07":{venue:"O2 Victoria Warehouse",city:"Manchester, UK",capacity:3500,address:"Trafford Park, Stretford, Manchester M17 1AB",advanceContact:"Tyrone",advanceEmail:"tyrone84@gmail.com",techContact:"Emlyn Spiers (Tech & Prod Mgr) — emlyn.spiers@gmail.com | 07591788868. GM: Russell Taylor-Toal — russell@o2victoriawarehouse.co.uk",loadDock:"Trafford Wharf Road yard. 3x 45ft trucks. Flat push ~10m. Man Utd home = 2 buses only; trucks tip & go.",loadIn:"Flat push from yard to stage, forked up. House crew: Manchester Stage & Crew (5hr call). Riggers: Knight Rigging Services.",stageDims:"28ft (8.5m) D max · 52ft (15.8m) W max · 4'6\" (1.37m) H. No wings — monitors on floor. Trim H 7m from stage.",rigging:"Yes — house I-beam grid (fixed). 9t total, 800kg max point load, 1.5t/beam. Cherry picker (venue supplies). No spreaders.",riggingNotes:"Fixed grid positions only. Cherry picker required from venue.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Flown or ground-stack. Max ground-stack: 7.2m × 5m.",lxNotes:"House rig: 28x Martin MAC Aura XB Wash, 26x Ayrton Diablo Profile, 12x GLP JDC1 Strobe, 6x Elation Cuepix Blinder WW2, 6x Chauvet E-260W Profile. Console: Avolites Arena. Hazer: 2x Hazebase Base Pro + 2x DMX Fan. 4x trusses: Drape/Back/Mid/Front (all 15m OV40).",audioNotes:"Main: 12x L-Acoustics K1 + 6x K2 + 16x KS28 subs + 4x KARA II centre + 8x KARA II rear + 4x ARCS II sidefills + 2x KS28 sidefill subs. FOH: DiGiCo SD12 D2. MON: DiGiCo SD12 D2. Multi run 50m around room.",soundLimit:"LAeq,T 105 dB + LCeq,T 112 dB. Pre-23:00: 15-min averages. Post-23:00/DJ: 5-min averages. F1 Acoustics on-site.",venuePower:"USR (LX/VX): 300A 3ph Powerlock + 125A + 63A + 32A 3ph. No separate audio power — advance with Emlyn. No mains distro/cabling on site.",co2:null,flames:"NO — PROHIBITED",pyro:"Permitted — full RA/MS + product data sheets required 2+ weeks advance. Closed stage possible.",confetti:"Permitted — bio-degradable, non-flammable only. £150 cleaning charge. Aim away from LX rig.",sfxNotes:"All SFX advance 2+ weeks min. Lasers: permitted, no crowd scanning (directly or diffracted), full RA/MS 2 weeks prior. Foam/handheld flares: NOT permitted. Smoke/haze: permission required day-of.",flags:"Show 1/3. Shore power not listed — advance with Emlyn. Truck parking: up to 5x 45ft trucks (Man Utd dependent).",busPower:"Parking: 2 buses. Shore power not listed in venue pack — advance with Emlyn. Truck parking: up to 5x 45ft trucks (Man Utd dependent)."},
  "2026-05-08":{venue:"O2 Victoria Warehouse",city:"Manchester, UK",capacity:3500,address:"Trafford Park, Stretford, Manchester M17 1AB",advanceContact:"Tyrone",advanceEmail:"tyrone84@gmail.com",techContact:"Emlyn Spiers (Tech & Prod Mgr) — emlyn.spiers@gmail.com | 07591788868",loadDock:"Trafford Wharf Road yard. 3x 45ft trucks. Flat push ~10m.",loadIn:"Flat push. House crew: Manchester Stage & Crew (5hr call). Riggers: Knight Rigging Services.",stageDims:"28ft (8.5m) D max · 52ft (15.8m) W max · 4'6\" (1.37m) H. Trim H 7m from stage.",rigging:"Yes — house I-beam grid (fixed). 9t total, 800kg max point load.",riggingNotes:"Fixed grid positions only. Cherry picker required from venue.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"House rig: 28x Martin MAC Aura XB Wash, 26x Ayrton Diablo Profile, 12x GLP JDC1 Strobe. Console: Avolites Arena. 4x trusses Drape/Back/Mid/Front.",audioNotes:"Main: 12x L-Acoustics K1 + 6x K2 + 16x KS28 subs. FOH: DiGiCo SD12 D2. MON: DiGiCo SD12 D2.",soundLimit:"LAeq,T 105 dB + LCeq,T 112 dB. F1 Acoustics on-site noise monitoring.",venuePower:"USR (LX/VX): 300A 3ph Powerlock + 125A + 63A + 32A 3ph. No mains distro/cabling on site.",co2:null,flames:"NO — PROHIBITED",pyro:"Permitted — full RA/MS + product data sheets 2+ weeks advance.",confetti:"Permitted — bio-degradable only. £150 cleaning charge.",sfxNotes:"All SFX advance 2+ weeks. Lasers: no crowd scanning. Foam/handheld flares: NOT permitted.",flags:"Show 2/3",busPower:"Parking: 2 buses. Shore power not listed — advance with Emlyn."},
  "2026-05-10":{venue:"O2 Academy Glasgow",city:"Glasgow, UK",capacity:2354,address:"121 Eglinton St, Glasgow G5 9NT",advanceContact:"Barry McKenna",advanceEmail:"barry.mckenna@dfconcerts.co.uk",techContact:"Rob Watson (Technical Mgr) — rob@o2academyglasgow.co.uk. GM: Chris Johnston — chrisjohnston@o2academyglasgow.co.uk",loadDock:"Bedford St — flat push. Door: 1.95m×2.10m, ramp 910mm to stage.",loadIn:"Min 6 crew per truck. Min 4 hands to tip (tight access). Book crew via rob@o2academyglasgow.co.uk",stageDims:"10.4m W × 8.06m D × 1.5m H × 7.15m clearance",rigging:"Yes — house rigging. Advance with Rob Watson.",riggingNotes:"Section 89 application needed for risers >2ft (14 days prior). 2x8'×4' + 1x8'×2' steel deck available.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"In-house LX per contract (FEU). No followspots or comms in-house — rental via Rob. 2-4 follow spot positions in balcony booths.",audioNotes:"In-house PA per contract (FEU). Advance specs with Rob Watson.",soundLimit:null,venuePower:"Shore: 4x 16A/1 Ceeform (above stage door). All 110V max for portable. 3-phase via Powerlock/CEE-form.",co2:"TBC — advance with venue",flames:"NO — not normally allowed (vertical exclusion 6m min)",pyro:"Permitted with 28-day advance notice. Full RA/MS + MSDS. Radial exclusion zones apply.",confetti:"Permitted — paper/biodegradable only. No metallic. £500 post-show cleanup. Full RA/MS + MSDS 28 days prior.",sfxNotes:"SFX/Lasers: See APPENDIX 1 in venue H&S pack. Must be advanced.",flags:"⚠ Advance contact is Barry McKenna — NOT Charmaine Hardman. Show 1/2.",busPower:"Shore power: 4x 16A/1 Ceeform above/right of stage door. Bus lot: Kilbarchan Street (private area rear of venue)."},
  "2026-05-11":{venue:"O2 Academy Glasgow",city:"Glasgow, UK",capacity:2354,address:"121 Eglinton St, Glasgow G5 9NT",advanceContact:"Barry McKenna",advanceEmail:"barry.mckenna@dfconcerts.co.uk",techContact:"Rob Watson (Technical Mgr) — rob@o2academyglasgow.co.uk",loadDock:"Bedford St — flat push. Door: 1.95m×2.10m.",loadIn:"Min 6 crew per truck. Min 4 hands to tip. Book crew via Rob.",stageDims:"10.4m W × 8.06m D × 1.5m H × 7.15m clearance",rigging:"Yes — house rigging. Advance with Rob Watson.",riggingNotes:"Section 89 application for risers >2ft (14 days prior).",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"In-house LX per contract (FEU). Rental followspots/comms via Rob. 2-4 follow spot positions.",audioNotes:"In-house PA per contract (FEU). Advance specs with Rob Watson.",soundLimit:null,venuePower:"Shore: 4x 16A/1 Ceeform above stage door. 3-phase via Powerlock/CEE-form.",co2:"TBC",flames:"NO",pyro:"Permitted — 28-day advance notice. Full RA/MS + MSDS.",confetti:"Permitted — paper/biodegradable only. £500 post-show cleanup.",sfxNotes:"SFX/Lasers: APPENDIX 1 in venue H&S pack.",flags:"⚠ Advance contact is Barry McKenna — NOT Charmaine Hardman. Show 2/2 — no separate fee.",busPower:"Shore: 4x 16A/1 Ceeform above/right stage door. Bus lot: Kilbarchan Street."},
  "2026-05-13":{venue:"O2 Academy Brixton",city:"London, UK",capacity:4851,address:"211 Stockwell Rd, Brixton, London SW9 9SL",advanceContact:"Tyrone | production@o2academybrixton.co.uk",advanceEmail:"tyrone84@gmail.com",techContact:"Advance to production@o2academybrixton.co.uk. Contact GM/Tech for SFX, laser, rigging, filming requests.",loadDock:"Stockwell Park Walk (rear). 2x trucks + 2x buses. What3Words: mixed.packet.length. ONE-WAY — enter via Stockwell Rd or from Stockwell tube.",loadIn:"Flat push ~10m to stage (upstage centre). Load-in: 10:00 AM. Load-out: within 1.5hrs after show. No vehicle movement 30min pre-doors to venue-clear.",stageDims:"15.70m D (51'6\") × 10.1m W (33'2\"). Proscenium arch: 17m (55'9\"). Stage H: 1.2m (3'11\"). No thrust. 40ft backdrop/banner truss available.",rigging:"Yes — advance all rigging plots for approval. Follow spots reduce saleable capacity.",riggingNotes:"No dedicated in-house riggers. Advance rigging plots for approval.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"Front/Mid/Back trusses (all 40ft pre-rig). Front: 8x MAC Aura PXL + 8x MAC Ultra + 4x Chauvet Strike Array. Mid: 8x MAC Aura PXL + 6x MAC Ultra + 4x Strike Array + 4x GLP JDC1. Back: 8x MAC Aura PXL + 8x MAC Ultra + 4x GLP JDC1. Console: MA3 Light + Avolites Tiger Touch. Hazer: 2x Cirro MK3. De-rig of house PA/LX: £3,200 — 1 month notice.",audioNotes:"Mains: 16x L-Acoustics K1 (8/side) + 8x K1SB + 6x K2 downs. Subs: 16x KS28. Front fill: 4x A10 Focus. Under-balcony: 10x A10i Wide. FOH: DiGiCo Quantum 225 (HMA fibre + Waves). MON: DiGiCo Quantum 225. FOH pos: FIXED 19m from DSE, 3.56m D × 6m W × 0.6m high.",soundLimit:null,venuePower:"SR (LX): 300A 3ph PowerLock + 2x32A + 1x63A 3ph + 4x16A + 1x32A + 1x63A single. SL (audio): 125A Ceeform 3ph + 2x63A + 2x32A 3ph + 1x63A + 1x32A + 4x16A single. NOTE: No mains distro or cabling on site.",co2:"Not specifically permitted — advance with venue/Lambeth Council",flames:"Not specifically permitted",pyro:"Permitted — Lambeth Council approval req'd via venue. 1 month advance. Full product info + RAMS + certification + proof of operator competence.",confetti:"Permitted — £200+VAT cleaning. Paper/biodegradable only, no metallic.",sfxNotes:"⚠ LASER DOCS OUTSTANDING — Tyrone chasing Apr 16. Sheck promised EOD Apr 16 PT. Lambeth Council approval req'd 1 month before May 13 — deadline may have passed. Foam/handheld flares: NOT permitted.",flags:"⚠⚠ LASER DOCS CRITICAL — Lambeth deadline may be passed. ESCALATE. Confirm with Cody + Sheck docs sent. Parking dispensation covers load dock only — confirm overnight scope with Tyrone.",busPower:"2x 16A single-phase Ceeform + 2x 32A 3-phase Ceeform. 2 trucks + 2 buses on Stockwell Park Walk."},
  "2026-05-15":{venue:"Halle 622",city:"Zurich, Switzerland",capacity:3614,address:"Binzmühlestrasse 85, Zurich 8050",advanceContact:"Roger Fisch (Production)",advanceEmail:"roger.fisch@maag-moments.ch",techContact:"Julia Kinas — julia.kinas@maag-moments.ch | +41 44 444 26 98. Roger Fisch — roger.fisch@maag-moments.ch | +41 79 622 65 65.",loadDock:"Binzmühlestrasse 85 — flat push 30m to stage, 2 trucks at a time. Bus parking: max 6. Shore: 1x63A→2xCEE32A, 3xCEE32A→3xCEE16A",loadIn:"Load in via big empty hall next to concert hall, no stairs. Forklift avail (max 1500kg, extra charge).",stageDims:"10-14m W × 8-10m D × 1.40m H. Bütec 2m×1m elements. Clearance: 11m floor→pre-rigg, 12.5m floor→ceiling, 10m→ventilation SR.",rigging:"Pre-rigg installed (ST + XD spreaders). 3 beams (middle + ±6m). ALL points must be defined + checked by Winkler in advance. NOT included in rent.",riggingNotes:"Rigging via Winkler Livecom. Advance all points. Max floor load 3500kg/m2. Stage: 5kN/500kg per m2.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"In-house: 2x Projector PT-DZ21K2 (20K lumen) + motorized screen 8×6.5m. NOTE: Touring LED wall will replace.",lxNotes:"LX NOT incl in rent. 55x Ares LED Wash, 20x Sharpy, 20x Solaspot 1500, 13x Sparx10, 9x RoXX Cluster B2 Blinder. Under balc: 48x Par30, 20x Ares XS. FOH: RoadHog 4 + MA3. 2x follow spot positions (rent from Winkler).",audioNotes:"PA NOT incl in rent. D&B V-Line 8x Vi8/side. 12x D&B J-SUB (upgradeable to 16). Delay: D&B Y-Line 8x Yi8/side. Nearfill: 4x D&B Q10. Amps: 22x D&B D12. FOH: Yamaha CL5 + Rio 32-24. 4x Shure UHF-R wireless. DJ: Pioneer CDJ2000/3000, DJM-900NX2.",soundLimit:"100 dBA avg/1hr max in public area. 125 dBA peak. Measured at FOH.",venuePower:"230/400V 50Hz. Stage: 2xCEE125 + PowerLock 400A (or 2x200PL) + CEE63 distro (USR). Mid-hall: CEE125 + CEE63 (SR wall, FOH power). Under balc: CEE63. Balcony: CEE32 (follow spots).",co2:"TBC — check with local fire police",flames:"TBC — check with local fire police",pyro:"Must be approved by local fire police — send specs in advance.",confetti:"Not mentioned — advance with venue",sfxNotes:"Pyro/Laser: Must be approved by local fire police — send specs in advance. Haze: Unique2 available (extra cost). No smoking anywhere. No gas cooking.",flags:"Merch: CHF 250 flat fee in entrance foyer. FOH: ~22m from DSE, 6x3m area. No drive-up to stage. Forklift max 1500kg. LX and audio NOT in venue rent — full touring package required.",busPower:"Shore: 1x 63A (→2x32A Ceeform) + 3x32A (→3x16A). 230/400V. Max 6 buses/trucks on site."},
  "2026-05-16":{venue:"E-Werk (contract: Palladium)",city:"Cologne, Germany",capacity:4000,address:"Schanzenstraße 40, 51063 Köln",advanceContact:"Oliver Zimmermann (LN DE Production)",advanceEmail:"oliver.zimmermann@livenation-production.de",techContact:"Oliver Zimmermann — oliver.zimmermann@livenation-production.de",loadDock:"Rear of Palladium at ground level. Parking confirmed both vehicles 2 nights (May 16-18). Shore power 32A 3ph CONFIRMED.",loadIn:"Local crew 8:00 AM; tour joins 11:30 AM, complete ~3:30 PM. NO load-out (show 1 of 2). Bus overnights.",stageDims:"TBC — no venue docs on file. Advance with Oli.",rigging:null,riggingNotes:"No separate venue docs — advance with Oli (oliver.zimmermann@livenation-production.de).",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"In-house LX (FEU, max €12,500). Advance spec with Oli. IEM G10 (470-542 MHz) + mic A band (470-636 MHz) OK for Germany — no RF permits needed.",audioNotes:"In-house PA (FEU). Advance spec with Oli.",soundLimit:null,venuePower:"TBC — advance with Oli",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"Lasers: local LSO REQUIRED at artist expense — Day 1 (May 16): €1,600. Day 2 (May 17): €1,200. LSO arranged via Oli. Need: laser company name+address, touring LSO name + documents.",flags:"⚠ Contract=Palladium, venue=E-Werk. No separate venue docs on file. Show 1/3. LX cap €12,500. Hospo budget: €5,400 total (both shows). Loaders double as hands (4h min, 6h call). Security meeting 3:30 PM. No work permits for touring staff. WHT applicable — sheet from Oli pending. Guest: 30/show on balcony SR VIP.",busPower:"Shore power 32A 3-phase CONFIRMED. Rear parking confirmed both vehicles 2 nights (May 16-18)."},
  "2026-05-17":{venue:"E-Werk (contract: Palladium)",city:"Cologne, Germany",capacity:4000,address:"Schanzenstraße 40, 51063 Köln",advanceContact:"Oliver Zimmermann (LN DE Production)",advanceEmail:"oliver.zimmermann@livenation-production.de",techContact:"Gerhard Hammer (Technical Dir) — gerhard.hammer@koeln-event.de | David Steinhorn — david.steinhorn@koeln-event.de | GM: Wilhelm Wirtz — +49 221-9679-0",loadDock:"Rear of hall, ground level, direct trailer access. Both gates 3.98m W × 4m H. Backstage parking area behind venue.",loadIn:"Deliveries at rear, ground level. Hard-wearing steel-fibre concrete flooring. Crane available (endposition on floor plan).",stageDims:"Mobile NIVOflex stage: standard 13m W × 10m D × 1.5m H (+ extensions). Ceiling: 11m, clearance 10.2m mid-hall, 8m from stage floor. Load gate: 3.98m W × 4m H. Side hall: 7.25m ceiling, 6m clearance.",rigging:null,riggingNotes:"Advance with Gerhard Hammer / Oli Zimmermann.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"In-house LX (FEU, max €12,500). Advance spec with Oli.",audioNotes:"In-house PA (FEU). Advance spec with Oli.",soundLimit:null,venuePower:"STV 1-1 (sound): 125A + 63A + 32A + 16A CEE. STV 1-2 (lights): 2x125A + 2x63A + 2x32A + 2x16A. STV 1-4 (lights): 2x125A + 4x63A + 4x32A + 4x16A + 12x Schuko. STV 2-5 (coach/shore): 63A + 2x32A + 3x16A + 6x Schuko. Max total: 250A.",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"Lasers: local LSO REQUIRED at artist expense — Day 2 (May 17): €1,200. LSO arranged via Oli.",flags:"Hospo budget: €5,400 total both shows. Guest: 30/show + VIP balcony SR. No parking permits needed. Shore: 32A 3-phase confirmed. Loaders double as hands (6h min call). Show 2/3.",busPower:"STV 2-5: 63A + 2x32A CEE (backstage parking). STV 2-1: 1x32A CEE (secondary). Coach/shore cross-strut clearance to check on-site."},
  "2026-05-19":{venue:"AFAS Live",city:"Amsterdam, Netherlands",capacity:6000,address:"ArenA Boulevard 590, Amsterdam 1101",advanceContact:"John Cameron (MOJO advance)",advanceEmail:"j.cameron@mojo.nl",techContact:"AFAS Live / MOJO Concerts. RF coordinator: Kees Heegstra (Camel & Co) — rf-coordination@camel-co.nl | +31 6 52490951. Frequencies required 4 weeks before show.",loadDock:"TBC — advance with venue/MOJO. NOTE: No truck ramps (double ramp NOT allowed). Forklift available.",loadIn:"Forklift available. NO truck ramps allowed. All rigging via staircase to catwalk. House riggers mandatory.",stageDims:"Stage Dex modular (Prolyte), adjustable H 10cm–2m. Standard: 18m W × 12m D (or 10m D). H: 1.80m standing / 1.60m seated. Stage must be min 1m from rear wall.",rigging:"Yes — Frontline Rigging Consultants (in-house, mandatory). House riggers must be present. Rigging plot due 3 weeks before show.",riggingNotes:"Beam: flat trussed I-beam. Floor to beam: 17.50m / 21.00m. Beam-to-beam: 7.80m. SWL: 468 kg/m lower / 535 kg/m upper beam.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"TBC — advance with MOJO/venue.",audioNotes:"TBC — advance with MOJO/venue.",soundLimit:null,venuePower:"SR (L1/LX): 400A Powerlock + 3x125A + 2x63A + 4x32A, max 630A/phase. SC (K14/VX): 400A PL + 3x125A + 2x63A + 4x32A, max 630A/phase. SL (K1/audio): 200A PL + 2x125A + 2x63A + 3x32A, max 250A/phase. All audio amps MUST connect to K1 (SL).",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"RF/wireless: ALL frequencies (IEM, RF, mics, intercoms, pyro, DECT, WiFi) must be filed with Camel & Co 4 weeks before show. Dutch Telecom Agency inspects on site — illegal freqs = show stop + fine. LED walls must comply with EU EMC Directive 2014/30/EC.",flags:"⚠ RF filing with Camel & Co MANDATORY 4 weeks before show. Rigging plot mandatory 3 weeks prior to Frontline. Backstage WiFi: AFAS Live Production / Amsterdam!. Fixed internet via UTP patch.",busPower:"Shore power: TBC — advance with MOJO."},
  "2026-05-20":{venue:"Le Bataclan",city:"Paris, France",capacity:1694,address:"50 Blvd Voltaire, Paris 75011",advanceContact:"Cyril",advanceEmail:"c.legauffey@gmail.com",techContact:"Cyril (c.legauffey@gmail.com) | Damien Chamard Boudet (LN FR promoter) — damien.chamardboudet@livenation.fr",loadDock:"50 Boulevard Voltaire (main entrance). Flat push 40m (131ft), 3 steps down to pit then venue ramp to stage. Bus zone: 23m on Bd Voltaire 50-52 (1x32A). Cycle path: 54-56 Bd Voltaire (1x16A, last resort).",loadIn:"From main entrance. No crash barriers in-house (Mojo available on demand). Upstage 1m line = emergency exit — NO storage.",stageDims:"17.85m W × 7.37m D (avg) × 1.06m H × 11m opening.",rigging:"Yes — stage truss + house truss (from light plots). House truss only — fixed positions.",riggingNotes:"See plan de feu PDF for exact positions and circuits. House truss fixed only.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"House truss (fixed): 10x MAC Aura, 5x MAC Viper Profile, 6x PC 2KW, 4x PAR 64. Plan de feu on file. Stage: Diablo S, Zonda 3 FX, MAC Aura, Color Strike M, Molefay Two Light.",audioNotes:"⚠ Full audio spec not on file — advance with Cyril (c.legauffey@gmail.com). Catering: cold buffet at bar 10am-4pm for 20-25 pax.",soundLimit:null,venuePower:"⚠ Power spec not on file — advance with Cyril.",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"No gas cooking allowed. Emergency exit 1m zone upstage — no storage permitted. No barricade in-house.",flags:"⚠ Audio spec and power spec not in docs on file — pull from advance. No iron/fan/towels/tableware provided. Barricade: rental only via Mojo.",busPower:"Bus zone: 23m on Bd Voltaire 50-52 (1x32A). Cycle path 54-56 Bd Voltaire (1x16A, imperative need only). No electrical at 44-46 Bd Voltaire."},
  "2026-05-22":{venue:"Fabrique",city:"Milan, Italy",capacity:3100,address:"Via Gaudenzio Fantoli 9, Milan 20138",advanceContact:"Andrea Aurigo / Micaela Armigero (LN Italy)",advanceEmail:"andrea.aurigo@livenation.it",techContact:"andrea.aurigo@livenation.it / micaela.armigero@livenation.it",loadDock:"TBC — advance with Andrea/Micaela. Flag: tunnel clearance issue noted in tour notes.",loadIn:"TBC — advance with Andrea/Micaela.",stageDims:"TBC — no venue docs on file.",rigging:null,riggingNotes:"No venue docs on file.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"TBC — advance with LN Italy.",audioNotes:"TBC — advance with LN Italy.",soundLimit:null,venuePower:"TBC",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"TBC — advance with venue.",flags:"⚠ PRODUCTION CONTRACT ONLY — principal terms may be separate. ⚠ No venue docs on file — advance with Andrea/Micaela immediately. ⚠ Tunnel clearance issue flagged in tour notes.",busPower:"TBC"},
  "2026-05-24":{venue:"SaSaZu",city:"Prague, Czech Republic",capacity:2200,address:"Bubenské nábřeží 306/13, Prague 170 00",advanceContact:"Barbora",advanceEmail:"bara@fource.com",techContact:"Fource Productions — advance with Barbora (bara@fource.com)",loadDock:"TBC — advance with Barbora. No venue docs on file.",loadIn:"TBC — advance with Barbora.",stageDims:"TBC — no venue docs on file.",rigging:null,riggingNotes:"No venue docs on file.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"TBC — advance with Barbora.",audioNotes:"TBC — advance with Barbora.",soundLimit:null,venuePower:"TBC",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"TBC",flags:"⚠ No venue docs on file (folder contains shortcut files only). Advance with Barbora ASAP. Post-Prague: 3 flights to book TBD.",busPower:"TBC"},
  "2026-05-26":{venue:"Columbiahalle",city:"Berlin, Germany",capacity:3500,address:"Columbiadamm 13-21, Berlin 10965",advanceContact:"Oliver Zimmermann (LN DE Production)",advanceEmail:"oliver.zimmermann@livenation-production.de",techContact:"Oliver Zimmermann — oliver.zimmermann@livenation-production.de",loadDock:"TBC — no venue docs on file.",loadIn:"TBC — advance with Oli.",stageDims:"TBC — no venue docs on file.",rigging:null,riggingNotes:"No venue docs on file — advance with Oli.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"In-house LX (FEU, max €12,500). Advance with Oli.",audioNotes:"In-house PA (FEU). Advance with Oli.",soundLimit:null,venuePower:"TBC — advance with Oli",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"TBC — advance with Oli. Laser LSO requirements same as Cologne — check with Oli.",flags:"⚠ No venue docs on file. Show 3/3. LX cap €12,500. Advance with Oli immediately.",busPower:"TBC"},
  "2026-05-28":{venue:"Majestic Music Club",city:"Bratislava, Slovakia",capacity:1000,address:"Karpatska 2, Bratislava 811 05",advanceContact:"Peter Lipovsky",advanceEmail:"peter.lipovsky@gmail.com",techContact:"Peter Lipovsky — peter.lipovsky@gmail.com | +421 949 609 279. Máté Horváth — mate.horvath@livenation.hu. Gabi Révész — gabi.revesz@livenation.hu (add to all threads).",loadDock:"DROP & GO ONLY. No forklift. 14 steps up to venue. Bus+truck overnight: Refinery Gallery — 48.128201, 17.180051 (bus has 32/3 power; truck no power). Check-in May 27, check-out May 29.",loadIn:"Drop & go only. 8 stagehands standard for truck unload. 10-12 hands for heavy items (GT truss). Runner: 7-seater van available all day.",stageDims:"10.5m W × 6.5m D × 1.3m H × 5.6m clearance. Wings: 2m W × 5m D. Fully carpeted, flat. Risers: 6x Nivtec 2x1m @ 40/60/80cm.",rigging:"Yes — from light plot. Ceiling 6m clearance, 4.5m to lighting trusses.",riggingNotes:"SGM Regia 2048 Live console. Ceiling 6m clearance, 4.5m to lighting trusses.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"⚠ VENUE LED ONLY — Diamond P3.9 5.5×3m + LVP 605 processor provided by Peter. Touring ROE LED NOT required (ground-stack clearance 4.5m max). Confirm VJ signal routing with Peter.",lxNotes:"Console: SGM Regia 2048 Live. Fixtures: 8x Robe 575XT, 6x Hero Wash 300FC, 10x Varytec Hero Beam 100, 4x Stairville Wild Wash 648 LED (SL+SR), 3x Wild Wash 648 (CS), 6x Varytec Hero Wash 300TW (DS), 4x Hero Wash 300FC (US), 2x LED Matrix 5x5 Blinder, 2x AFH-600 Hazer (US), 2x Botex SP-1500 Strobe.",audioNotes:"PA: 6x NEXO GEO M1210 + 1x NEXO GEO M1220/side + 6x EV PX2181 sub. FOH: Midas Legend 3000. MON: 6x ZxA5 active + 2x EV TX1811 drum/sidefills. 4x CAT5 available.",soundLimit:null,venuePower:"⚠ IN-HOUSE: 2x32/3 OR 1x63/3 (no combos). Generator will be added. Generator connection: 1x125/3 or multiple 63/3 or Powerlocks (NO CAMLOCKS). US vs EU voltage discrepancy flagged — Sheck to confirm power spec with Neg Earth. LED: 1x32/3 or 1x63/3.",co2:null,flames:null,pyro:"Lasers: 8x 30W (per Sheck). LSO docs being gathered.",confetti:null,sfxNotes:"Lasers: 8x 30W per Sheck. LSO docs in progress. VJ connection + location not yet specified — Sheck to confirm.",flags:"⚠ NO FORKLIFT — 14 stairs up. ⚠ Power discrepancy US vs EU — Sheck to confirm with Neg Earth. ⚠ No on-site parking — MUST reserve Refinery Gallery in advance. Touring LED NOT needed. Catering list requested by Peter — send immediately. Security: 2 from M&G onward, 6 total.",busPower:"⚠ No on-site parking. Bus power (32/3) available 5km/20min from venue — MUST reserve in advance. Contact Peter for reservation."},
  "2026-05-30":{venue:"Orange Warsaw Festival",city:"Warsaw, Poland",capacity:30000,address:"Sluzewiec Horse Racing Track, Pulawska 266, Warsaw",advanceContact:"Mikolaj Ziolkowski",advanceEmail:"mikolaj.ziolkowski@alterart.pl",techContact:"Mikolaj Ziolkowski / AlterArt — contact to be established via Wasserman booking",loadDock:"TBC — festival show.",loadIn:"TBC — festival show. Min 60min.",stageDims:"TBC — festival stage.",rigging:null,riggingNotes:"Festival provided.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"Festival PA&Lights provided. Advance stage specs with AlterArt.",audioNotes:"Festival PA provided. Advance specs with AlterArt.",soundLimit:null,venuePower:"TBC — festival show. Advance with Mikolaj.",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"TBC — festival show.",flags:"⚠ No venue docs on file — festival show. 5 comp tix. Advance with Mikolaj/AlterArt for stage specs and power. Last show of EU run.",busPower:"TBC — festival show."},
};

// Tour rig specification — extracted from BBNO$26_EUTOUR_v1.0.0_031526.vwx + PDF
// Symbol Key (Sht-1), Elevation (Sht-2), Section (Sht-3), Staging (Sht-6)
// Designer: Mike Sheck | Drawn: 3/17-3/18/26 | © L7 Productions, LLC
const DESIGN_RIG={
  version:"v1.0.0",
  file:"BBNO$26_EUTOUR_v1.0.0_031526.vwx",
  drawnBy:"Mike Sheck",
  publishedAt:"2026-03-17",
  // Confirmed quantities from Symbol Key (Sht-1)
  fixtures:[
    {dept:"LIGHTING",name:"Ayrton Diablo",qty:8,power_w:550,position:"fly",source:"Sht-1 Symbol Key",binder_qty:12,delta:-4},
    {dept:"LIGHTING",name:"GLP JDC2 IP",qty:16,power_w:1500,position:"fly",source:"Sht-1 Symbol Key",binder_qty:12,delta:4},
    {dept:"LIGHTING",name:"ACME Pixel Line IP (Strobe 3 IP)",qty:12,power_w:420,position:"fly",source:"Sht-1 Symbol Key",binder_qty:48,delta:-36,note:"Binder quotes 48 — verify if additional positions exist beyond overview plan"},
    {dept:"LIGHTING",name:"Robe iForte",qty:2,power_w:800,position:"fly",source:"VWX binary",binder_qty:2,delta:0},
    {dept:"LASERS",name:"Kvant LD33 Spectrum RGBY",qty:8,power_w:33,position:"ground",source:"Sht-1 Symbol Key",binder_qty:3,delta:5},
    {dept:"VIDEO",name:"ROE MC-5H T4v Frame LED Panel",qty:48,power_w:400,position:"ground",source:"Sht-1 Symbol Key",binder_qty:60,delta:-12},
    {dept:"VIDEO",name:"ROE Black Marble BM4",qty:null,power_w:null,position:"fly",source:"VWX binary",binder_qty:null,note:"In VWX design; binder quotes ROE Carbon CB5. Different panel spec — CONFIRM"},
    {dept:"VIDEO",name:"Brompton S4 Processor",qty:2,power_w:250,position:"ground",source:"binder",binder_qty:2,delta:0},
    {dept:"VIDEO",name:"ROE Vanish S Curved Panels",qty:null,power_w:null,position:"ground",source:"VWX binary",binder_qty:0,note:"In design file — no vendor quote found"},
    {dept:"TRUSS",name:"Tyler Truss GT 10' w/ Horizontal Forks",qty:6,power_w:null,position:"fly",source:"Sht-1 Symbol Key",binder_qty:null},
    {dept:"CONTROL",name:"GrandMA3 Full",qty:1,power_w:300,position:"ground",source:"binder",binder_qty:1,delta:0},
    {dept:"CONTROL",name:"GrandMA3 Light",qty:2,power_w:300,position:"ground",source:"binder",binder_qty:2,delta:0},
    {dept:"STAGING",name:"All Access River Stage (Green Astroturf)",qty:1,power_w:null,position:"ground",source:"Sht-6",binder_qty:null,note:"Rev B 3/12: shifted 2ft US, SFX added"},
  ],
  // Dimensions confirmed from drawings
  dims:{
    rig_width_mm:7203,    // Sht-2 Elevation
    led_tower_h_mm:4913,  // Sht-3 Section
    fly_trim_mm:5840,     // Sht-3 Section (front truss fly height)
    stage_depth_mm:6494,  // Sht-3 Section
    stage_w_total_mm:9754,// Sht-6: 20' center + 6' each wing
  },
  // Minimum venue requirements derived from design
  req:{
    min_clearance_fly_m:7.0,   // fly trim 5.84m + overhead + safety = 7m minimum
    min_clearance_gs_m:5.5,    // LED towers 4.91m + safety for ground-stack
    min_stage_w_m:10.0,        // 9.75m stage + working space
    min_stage_d_m:7.0,         // 6.5m rig depth + front working space
    power_kw_est:95,           // 8×550 + 16×1500 + 48×400 + 12×420 + control + backline
    min_phase_a:200,
    laser_class:"Class 4",
    laser_count:8,
    laser_types:["Kvant LD33 RGBY"],
    requires_forklift:true,
    requires_rigging:true,
  },
  // Design vs quote discrepancies
  specDiscrepancies:[
    {severity:"CRITICAL",category:"QTY MISMATCH",finding:"GLP JDC2 IP: design=16, binder quote=12. 4 additional units not in Neg Earth quote 26-1273.",action:"Confirm qty with Neg Earth (Alex Griffiths). Update quote if 16 are required."},
    {severity:"HIGH",category:"QTY MISMATCH",finding:"Kvant LD33 RGBY: design=8, binder=3. 5 additional laser units not quoted — significant cost + compliance gap.",action:"Confirm qty with Sonalyst (quote 26-0097). LSO docs must cover all 8 units per jurisdiction."},
    {severity:"HIGH",category:"UNQUOTED FIXTURE",finding:"ROE Black Marble BM4 panels in VWX design — binder quotes ROE Carbon CB5 (different pitch/IP/weight). Spec not aligned.",action:"Confirm final panel spec with Neg Earth and Sigma-1 (Michael Heid). CB5 and BM4 are not interchangeable."},
    {severity:"HIGH",category:"UNQUOTED FIXTURE",finding:"ROE Vanish S curved panels in VWX — no vendor quote found in binder.",action:"Confirm with Neg Earth if Vanish panels are in scope. Source vendor or remove from design."},
    {severity:"MEDIUM",category:"QTY MISMATCH",finding:"Ayrton Diablo: design=8, binder=12. 4 units in binder may be over-specced — or used in additional positions not shown in overview plan.",action:"Confirm with LD (Gabe Greenwood) what the actual Diablo count is per show."},
    {severity:"MEDIUM",category:"QTY MISMATCH",finding:"ROE MC-5H: design=48 panels, binder=60. 12-panel gap — confirm final panel count with Neg Earth.",action:"Update manifest qty to match final agreed count."},
    {severity:"MEDIUM",category:"ACME VARIANT",finding:"ACME Pixel Line: design specifies 'Strobe 3 IP' variant (12 units); binder quotes generic 'Pixel Line IP' (48 units). Model variant and quantity both diverge.",action:"Confirm exact model variant and total qty with Neg Earth. Strobe 1 vs Strobe 3 affects DMX patching."},
  ],
};

// Parse ceiling clearance from venue text fields
function parseClearance(stageDims,riggingNotes,lxNotes){
  const t=`${stageDims||""} ${riggingNotes||""} ${lxNotes||""}`;
  const patterns=[
    /(\d+(?:\.\d+)?)\s*m\s+clearance/i,
    /clearance\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*m/i,
    /trim\s*[hH]\s*(\d+(?:\.\d+)?)\s*m/i,
    /(\d+(?:\.\d+)?)\s*m\s+from\s+stage/i,
    /(\d+(?:\.\d+)?)\s*m\s*(?:to\s+)?(?:pre-rigg|ceiling|trusses)/i,
    /(\d+(?:\.\d+)?)m\s*floor.{1,15}(?:ceil|rigg|beam)/i,
    /ceiling\s+(\d+(?:\.\d+)?)\s*m/i,
  ];
  for(const p of patterns){const m=t.match(p);if(m)return parseFloat(m[1]);}
  return null;
}
function parseStageW(stageDims){
  const t=stageDims||"";
  const m=t.match(/(\d+(?:\.\d+)?)\s*m\s+W/i)||t.match(/W\s+(?:max\s+)?(\d+(?:\.\d+)?)\s*m/i)||t.match(/(\d+(?:\.\d+)?)m\s+wide/i)||t.match(/(\d+(?:\.\d+)?)\s*m\s*(?:W|wide)/i);
  if(m)return parseFloat(m[1]);
  const ft=t.match(/(\d+(?:\.\d+)?)\s*ft\s+W/i)||t.match(/W\s+(?:max\s+)?(\d+(?:\.\d+)?)\s*ft/i);
  if(ft)return Math.round(parseFloat(ft[1])*0.3048*10)/10;
  return null;
}
function parseStageD(stageDims){
  const t=stageDims||"";
  const m=t.match(/(\d+(?:\.\d+)?)\s*m\s+D/i)||t.match(/D\s+(?:max\s+)?(\d+(?:\.\d+)?)\s*m/i);
  if(m)return parseFloat(m[1]);
  const ft=t.match(/(\d+(?:\.\d+)?)\s*ft\s+D/i)||t.match(/D\s+(?:max\s+)?(\d+(?:\.\d+)?)\s*ft/i);
  if(ft)return Math.round(parseFloat(ft[1])*0.3048*10)/10;
  return null;
}

function checkRigVsVenue(vg){
  if(!vg)return[];
  const issues=[];
  const r=DESIGN_RIG.req;
  const d=DESIGN_RIG.dims;

  // 1. Ceiling clearance
  const clr=parseClearance(vg.stageDims,vg.riggingNotes,vg.lxNotes);
  if(clr!==null){
    const ledH=d.led_tower_h_mm/1000;
    const flyH=d.fly_trim_mm/1000;
    if(clr<ledH+0.3){
      issues.push({id:"rv_clr",severity:"CRITICAL",category:"CLEARANCE",
        finding:`${clr}m clearance — LED towers are ${ledH}m tall. Ground-stack will NOT fit. Touring rig cannot be deployed as designed.`,
        action:`Advance modified plot with LD (Gabe Greenwood). Confirm venue LED substitute or reduce tower height. Min ${ledH+0.3}m needed for ground-stack.`});
    } else if(clr<r.min_clearance_gs_m){
      issues.push({id:"rv_clr",severity:"HIGH",category:"CLEARANCE",
        finding:`${clr}m clearance is tight — LED towers at ${ledH}m need ${r.min_clearance_gs_m}m min for safe ground-stack deployment.`,
        action:"Advance rig trim with LD. Confirm exact measurement from stage deck to rigging. Safety margin may require reducing tower height."});
    } else if(clr<r.min_clearance_fly_m){
      issues.push({id:"rv_clr",severity:"MEDIUM",category:"CLEARANCE",
        finding:`${clr}m clearance — ground-stack OK (LED towers ${ledH}m), but fly trusses at ${flyH}m trim will be at or above venue limit. May need to reduce fly trim.`,
        action:"Advance rigging plot. Fly trim at "+flyH+"m may need to be dropped. Confirm with venue rigger and LD."});
    }
  } else if(!vg.stageDims||vg.stageDims.toLowerCase().includes("tbc")){
    issues.push({id:"rv_clr",severity:"HIGH",category:"CLEARANCE",
      finding:"Stage clearance height not on file. LED towers are 4.91m; fly trusses need 7m+ clearance.",
      action:"Advance stage dims with venue TD urgently. Minimum clearance spec: 5.5m ground-stack, 7m fly."});
  }

  // 2. Stage width
  const sw=parseStageW(vg.stageDims);
  if(sw!==null&&sw<r.min_stage_w_m){
    issues.push({id:"rv_sw",severity:sw<8?"CRITICAL":"HIGH",category:"STAGE WIDTH",
      finding:`Stage ${sw}m W — touring rig footprint is ${d.rig_width_mm/1000}m wide, full stage package is ${d.stage_w_total_mm/1000}m (wings included). Rig will exceed stage.`,
      action:"Advance modified stage plot with LD. Consider removing wing extensions. Confirm floor plan with Sigma-1 (Michael Heid)."});
  }

  // 3. Stage depth
  const sd=parseStageD(vg.stageDims);
  if(sd!==null&&sd<r.min_stage_d_m){
    issues.push({id:"rv_sd",severity:sd<6?"CRITICAL":"HIGH",category:"STAGE DEPTH",
      finding:`Stage ${sd}m D — rig requires ${r.min_stage_d_m}m min depth (LED ground stack ${d.stage_depth_mm/1000}m + front working space).`,
      action:"Advance modified plot with LD. Back wall LED may need to be moved upstage. Confirm with staging vendor (All Access)."});
  }

  // 4. Load access
  const loadTxt=`${vg.loadDock||""} ${vg.loadIn||""}`.toLowerCase();
  const stairsMatch=loadTxt.match(/(\d+)\s*step/);
  const hasStairs=stairsMatch||loadTxt.match(/\bstairs?\b/);
  const hasNoForklift=loadTxt.includes("no forklift")||loadTxt.includes("drop & go");
  if((hasStairs||hasNoForklift)&&!loadTxt.includes("forklift avail")){
    const stairCount=stairsMatch?parseInt(stairsMatch[1]):null;
    issues.push({id:"rv_load",severity:stairCount>=10?"CRITICAL":"HIGH",category:"LOAD ACCESS",
      finding:`${hasNoForklift?"No forklift. ":""}${stairCount?`${stairCount} stairs to stage. `:"Stairs to stage. "}Tyler GT Truss sections + All Access staging require forklift or crane. Total fly weight ~${r.power_kw_est}kW.`,
      action:"Arrange additional crew (min 12 hands for heavy items). Source hand-truck/ramp. Coordinate with venue contact and local production manager."});
  }

  // 5. Rigging not confirmed
  if(!vg.rigging||vg.rigging==="Festival provided"){
    issues.push({id:"rv_rig",severity:"HIGH",category:"RIGGING",
      finding:"No confirmed rigging system on file. Rig requires certified rigging for front truss at 5.84m trim.",
      action:"Advance rigging spec with venue TD. Required: certified rigger, grid or beam SWL >3t total, cherry picker or ladder access for trim."});
  } else if((vg.rigging||"").toLowerCase().includes("advance")){
    issues.push({id:"rv_rig",severity:"MEDIUM",category:"RIGGING",
      finding:"Rigging not yet advanced/confirmed. Rigging plot must be submitted to venue rigger before load-in.",
      action:"Submit rigging plot to venue rigger. Include hoist positions, trim heights, and total fly weight."});
  }

  // 6. Max point load
  const pointMatch=(vg.rigging||"").match(/(\d+)\s*kg\s*max\s*point/i)||(vg.riggingNotes||"").match(/(\d+)\s*kg\s*(?:max\s+)?point/i);
  if(pointMatch){
    const maxPt=parseInt(pointMatch[1]);
    const estMaxPt=Math.ceil((d.led_tower_h_mm/1000*48*23.5+16*23.5+8*21.8)/12); // rough est
    if(maxPt<estMaxPt){
      issues.push({id:"rv_pt",severity:"HIGH",category:"RIGGING CAPACITY",
        finding:`Venue max ${maxPt}kg/point — estimated rig needs ~${estMaxPt}kg/point. Fly weight may exceed per-point limit.`,
        action:"Provide detailed rigging plot to venue rigger. May need to spread load across more points or cut fly elements. Advance with Knight/IRS/Frontline per venue."});
    }
  }

  // 7. Lasers
  const sfxAll=`${vg.sfxNotes||""} ${vg.flags||""}`.toLowerCase();
  const laserTexts={
    blocked:sfxAll.includes("laser") && (sfxAll.includes("not permitted")||sfxAll.includes("not allowed")),
    deadlinePassed:sfxAll.includes("deadline may have passed")||sfxAll.includes("deadline")&&sfxAll.includes("passed"),
    docsOut:sfxAll.includes("laser") && (sfxAll.includes("outstanding")||sfxAll.includes("critical")||sfxAll.includes("escalate")||sfxAll.includes("docs")),
    lsoRequired:sfxAll.includes("lso required")||sfxAll.includes("lso docs"),
    approvalReq:sfxAll.includes("laser") && (sfxAll.includes("approval")||sfxAll.includes("permit")||sfxAll.includes("police")||sfxAll.includes("council")),
  };
  if(laserTexts.blocked){
    issues.push({id:"rv_las",severity:"CRITICAL",category:"LASER COMPLIANCE",
      finding:"Lasers may be restricted at this venue. Rig carries 8× Kvant LD33 RGBY (Class 4).",
      action:"Confirm laser status with venue and local authority. If prohibited, remove from day-of rig. Contact Cody Leggett (cody@photon7.com)."});
  } else if(laserTexts.deadlinePassed){
    issues.push({id:"rv_las",severity:"CRITICAL",category:"LASER COMPLIANCE",
      finding:`⚠ Laser approval deadline may have PASSED. 8× Kvant LD33 RGBY require local authority approval (Class 4).`,
      action:"ESCALATE NOW: Cody Leggett + Sheck. Confirm if approval was submitted. If deadline passed, lasers may be prohibited for this date."});
  } else if(laserTexts.docsOut||laserTexts.lsoRequired||laserTexts.approvalReq){
    issues.push({id:"rv_las",severity:"HIGH",category:"LASER COMPLIANCE",
      finding:`Laser docs/LSO/approval outstanding. 8× Kvant LD33 RGBY = Class 4 — requires advance approval per jurisdiction.`,
      action:`${laserTexts.lsoRequired?"Arrange local LSO at artist expense (per venue requirement). ":""}Submit RAMS + laser cert to venue/authority. Cody Leggett to confirm docs sent.`});
  }

  // 8. Power
  const pwrTxt=(vg.venuePower||"").toLowerCase();
  if(!pwrTxt||pwrTxt.includes("tbc")||pwrTxt.includes("not on file")){
    issues.push({id:"rv_pwr",severity:"HIGH",category:"POWER",
      finding:`Venue power spec not on file. Tour rig draws ~${r.power_kw_est}kW — requires min ${r.min_phase_a}A/phase at 400V 3-phase.`,
      action:"Request full power spec from venue TD. Minimum: 2× 125A 3-phase feeds (LX + audio separate). Confirm generator availability if venue power insufficient."});
  } else if(!pwrTxt.includes("powerlock")&&!pwrTxt.includes("125a")&&!pwrTxt.includes("200a")&&!pwrTxt.includes("400a")&&!pwrTxt.includes("63a")&&pwrTxt.length<20){
    issues.push({id:"rv_pwr",severity:"MEDIUM",category:"POWER",
      finding:"Power spec on file but may be insufficient. Confirm min 200A/phase 3-phase is available for LX+VX draw.",
      action:"Advance with venue TD."});
  }

  // 9. Venue provides LED (rig stays on truck)
  const ledTxt=(vg.ledNotes||"").toLowerCase();
  if(ledTxt.includes("venue led only")||ledTxt.includes("touring roe led not required")){
    issues.push({id:"rv_led",severity:"MEDIUM",category:"LED WALL",
      finding:"Venue provides LED wall — touring ROE/MC panels stay on truck. VJ signal routing changes.",
      action:"Confirm signal routing with venue TD and Michael Heid (Sigma-1). Brompton S4 processors may need to be removed from rack or rerouted to venue LED."});
  }

  // 10. Sound limit
  if(vg.soundLimit&&!vg.soundLimit.toLowerCase().includes("tbc")){
    issues.push({id:"rv_snd",severity:"LOW",category:"SOUND LIMIT",
      finding:`Sound limit: ${vg.soundLimit}`,
      action:"Brief Ruairi (FOH) and monitor engineer pre-show. Noise management may be on-site monitoring in real-time."});
  }

  // 11. Flames prohibited (rig doesn't have flames but flag if pyro was added — Rev B "Added SFX")
  const flamesTxt=(vg.flames||"").toLowerCase();
  if(flamesTxt.includes("no")||flamesTxt.includes("prohibited")||flamesTxt.includes("not allowed")){
    issues.push({id:"rv_sfx",severity:"LOW",category:"SFX RESTRICTION",
      finding:`Flames/fire restricted at this venue. Design Rev B added SFX — confirm no flame-based SFX in show.`,
      action:"Brief Sigma-1/show design: no flame SFX at this venue. CO2 and haze OK if separately cleared."});
  }

  return issues;
}

function VBRow({label,value,warn}){
  if(!value||value==="TBC"&&!warn)return null;
  const isWarn=warn||(typeof value==="string"&&value.startsWith("⚠"));
  return(
    <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:6,padding:"4px 0",borderBottom:"1px solid var(--card-2)",alignItems:"flex-start"}}>
      <span style={{fontSize:9,fontWeight:800,color:"var(--text-mute)",textTransform:"uppercase",letterSpacing:"0.05em",paddingTop:1}}>{label}</span>
      <span style={{fontSize:10,color:isWarn?"var(--warn-fg)":"var(--text)",lineHeight:1.4}}>{value}</span>
    </div>
  );
}

function VBSection({title,children,accent}){
  const[open,setOpen]=useState(true);
  return(
    <div style={{background:"var(--card)",border:`1px solid ${accent||"var(--border)"}`,borderRadius:10,overflow:"hidden",marginBottom:8}}>
      <div onClick={()=>setOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",cursor:"pointer",background:accent?`${accent}18`:"var(--card-3)",borderBottom:open?"1px solid var(--border)":"none"}}>
        <span style={{fontSize:9,color:"var(--text-dim)"}}>{open?"▾":"▸"}</span>
        <span style={{fontSize:9,fontWeight:800,color:accent||"var(--text-2)",letterSpacing:"0.06em",textTransform:"uppercase"}}>{title}</span>
      </div>
      {open&&<div style={{padding:"6px 10px 8px"}}>{children}</div>}
    </div>
  );
}

function VenueBrief({vg,sel,data,upd}){
  const[newLinkLabel,setNewLinkLabel]=useState("");
  const[newLinkUrl,setNewLinkUrl]=useState("");
  const links=data.venueLinks||[];
  const addLink=()=>{
    if(!newLinkLabel.trim()||!newLinkUrl.trim())return;
    const url=newLinkUrl.trim().startsWith("http")?newLinkUrl.trim():`https://${newLinkUrl.trim()}`;
    upd({venueLinks:[...links,{id:`lnk_${Date.now()}`,label:newLinkLabel.trim(),url}]});
    setNewLinkLabel("");setNewLinkUrl("");
  };
  const removeLink=id=>upd({venueLinks:links.filter(l=>l.id!==id)});

  if(!vg)return(
    <div style={{padding:32,textAlign:"center",color:"var(--text-mute)",fontSize:10}}>
      <div style={{fontSize:20,marginBottom:8}}>▤</div>
      <div style={{fontWeight:600,marginBottom:4}}>No venue brief on file</div>
      <div>This show date is not in the EU tour binder. Add document links below or upload vendor quotes.</div>
      <div style={{marginTop:16,background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:12,textAlign:"left"}}>
        <div style={{...UI.sectionLabel,marginBottom:8}}>Document Links</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          <input value={newLinkLabel} onChange={e=>setNewLinkLabel(e.target.value)} placeholder="Label (e.g. Venue Tech Pack)" style={{...UI.input,flex:1,minWidth:120}}/>
          <input value={newLinkUrl} onChange={e=>setNewLinkUrl(e.target.value)} placeholder="URL" style={{...UI.input,flex:2,minWidth:160}}/>
          <button onClick={addLink} disabled={!newLinkLabel.trim()||!newLinkUrl.trim()} style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",opacity:(!newLinkLabel.trim()||!newLinkUrl.trim())?0.4:1}}>Add</button>
        </div>
      </div>
    </div>
  );

  const hasWarn=s=>s&&(s.startsWith("⚠")||s.includes("CRITICAL")||s.includes("NOT permitted")||s.includes("NO "));

  return(
    <div className="fi">
      {/* Flags banner */}
      {vg.flags&&<div style={{background:hasWarn(vg.flags)?"var(--danger-bg)":"var(--warn-bg)",border:`1px solid ${hasWarn(vg.flags)?"var(--danger-bg)":"var(--warn-bg)"}`,borderRadius:6,padding:"8px 12px",marginBottom:10,fontSize:10,color:hasWarn(vg.flags)?"var(--danger-fg)":"var(--warn-fg)",lineHeight:1.5}}><span style={{fontWeight:800}}>FLAGS: </span>{vg.flags}</div>}

      <div style={{display:"grid",gridTemplateColumns:window.innerWidth>600?"1fr 1fr":"1fr",gap:0}}>
        <div style={{paddingRight:6}}>
          {/* Venue info */}
          <VBSection title="Venue" accent="var(--link)">
            <VBRow label="Capacity" value={vg.capacity?.toLocaleString()}/>
            <VBRow label="Address" value={vg.address}/>
            <VBRow label="Design Ver" value={vg.designVer}/>
            <VBRow label="Advance" value={vg.advanceContact&&`${vg.advanceContact}${vg.advanceEmail?` — `+vg.advanceEmail:""}`}/>
            <VBRow label="Tech Contact" value={vg.techContact}/>
          </VBSection>

          {/* Load */}
          <VBSection title="Load Dock / In-Out" accent="var(--success-fg)">
            <VBRow label="Load Dock" value={vg.loadDock}/>
            <VBRow label="Load In/Out" value={vg.loadIn}/>
          </VBSection>

          {/* Stage */}
          <VBSection title="Stage & Rigging" accent="var(--accent)">
            <VBRow label="Stage Dims" value={vg.stageDims}/>
            <VBRow label="Rigging" value={vg.rigging}/>
            <VBRow label="Rigging Notes" value={vg.riggingNotes}/>
          </VBSection>

          {/* Power */}
          <VBSection title="Venue Power" accent="var(--warn-fg)">
            <VBRow label="Power" value={vg.venuePower} warn={hasWarn(vg.venuePower)}/>
            <VBRow label="Bus/Shore" value={vg.busPower} warn={hasWarn(vg.busPower)}/>
            <VBRow label="Sound Limit" value={vg.soundLimit}/>
          </VBSection>
        </div>

        <div style={{paddingLeft:6}}>
          {/* LED */}
          <VBSection title="LED / Video" accent="var(--info-fg)">
            <VBRow label="LED Notes" value={vg.ledNotes} warn={hasWarn(vg.ledNotes)}/>
          </VBSection>

          {/* LX */}
          <VBSection title="Lighting" accent="var(--accent-soft)">
            <VBRow label="LX Notes" value={vg.lxNotes}/>
          </VBSection>

          {/* Audio */}
          <VBSection title="Audio" accent="var(--success-fg)">
            <VBRow label="Audio Notes" value={vg.audioNotes} warn={hasWarn(vg.audioNotes)}/>
          </VBSection>

          {/* SFX */}
          <VBSection title="SFX & Compliance" accent="var(--danger-fg)">
            {[["CO2",vg.co2],["Flames",vg.flames],["Pyro",vg.pyro],["Confetti",vg.confetti]].filter(([,v])=>v).map(([k,v])=><VBRow key={k} label={k} value={v} warn={hasWarn(v)}/>)}
            <VBRow label="SFX Notes" value={vg.sfxNotes} warn={hasWarn(vg.sfxNotes)}/>
          </VBSection>
        </div>
      </div>

      {/* Venue compatibility */}
      {(()=>{
        const rigChecks=checkRigVsVenue(vg);
        const rigCritical=rigChecks.filter(i=>i.severity==="CRITICAL").length;
        const rigHigh=rigChecks.filter(i=>i.severity==="HIGH").length;
        return(
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:12,marginBottom:8,marginTop:4}}>
            <div style={{...UI.sectionLabel,marginBottom:4}}>Venue Compatibility — {vg.venue}</div>
            <div style={{fontSize:9,color:"var(--text-dim)",marginBottom:8}}>
              {[vg.stageDims&&`Stage: ${vg.stageDims.slice(0,80)}`,vg.rigging&&`Rigging: ${vg.rigging.slice(0,60)}`].filter(Boolean).map((s,i)=><div key={i} style={{fontFamily:MN}}>{s}</div>)}
            </div>
            {rigChecks.length===0&&<div style={{padding:"16px 0",textAlign:"center"}}>
              <div style={{fontSize:20,marginBottom:4}}>✓</div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--success-fg)"}}>No compatibility issues detected</div>
              <div style={{fontSize:9,color:"var(--text-mute)",marginTop:4}}>Parameters on file are compatible with touring rig. Advance TBC items per fields above.</div>
            </div>}
            {rigChecks.length>0&&<div style={{display:"flex",flexDirection:"column",gap:6}}>
              {[...rigChecks].sort((a,b)=>({CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3}[a.severity]-{CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3}[b.severity])).map(issue=>{
                const sv=SEV_STYLES[issue.severity]||SEV_STYLES.LOW;
                return(
                  <div key={issue.id} style={{background:issue.severity==="CRITICAL"?"var(--danger-bg)":issue.severity==="HIGH"?"var(--warn-bg)":"var(--card)",border:`1px solid ${sv.b}`,borderRadius:10,padding:"8px 10px"}}>
                    <div style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:3}}>
                      <span style={{fontSize:8,fontWeight:800,padding:"1px 6px",borderRadius:10,background:sv.bg,color:sv.c,flexShrink:0}}>{issue.severity}</span>
                      <span style={{fontSize:8,fontWeight:700,color:"var(--text-dim)",flexShrink:0}}>{issue.category}</span>
                      <span style={{fontSize:9,fontWeight:600,color:"var(--text)",flex:1}}>{issue.finding}</span>
                    </div>
                    <div style={{fontSize:8,color:"var(--text-2)"}}><span style={{fontWeight:600}}>Action:</span> {issue.action}</div>
                  </div>
                );
              })}
              <div style={{fontSize:8,color:"var(--text-mute)",fontFamily:MN,marginTop:2}}>
                {rigCritical>0&&<span style={{color:"var(--danger-fg)",fontWeight:700,marginRight:6}}>{rigCritical} CRITICAL</span>}
                {rigHigh>0&&<span style={{color:"var(--warn-fg)",fontWeight:700,marginRight:6}}>{rigHigh} HIGH</span>}
                Based on venue data on file. Some flags may resolve via advance.
              </div>
            </div>}
          </div>
        );
      })()}

      {/* Document links */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:12,marginTop:4}}>
        <div style={{...UI.sectionLabel,marginBottom:8}}>Document Links</div>
        {links.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {links.map(lnk=><div key={lnk.id} style={{display:"flex",alignItems:"center",gap:4,background:"var(--accent-pill-bg)",borderRadius:6,padding:"3px 8px"}}>
            <a href={lnk.url} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"var(--accent)",textDecoration:"none",fontWeight:600}}>{lnk.label} ↗</a>
            <button onClick={()=>removeLink(lnk.id)} style={{fontSize:11,color:"var(--text-mute)",background:"none",border:"none",cursor:"pointer",padding:"0 2px",lineHeight:1}}>×</button>
          </div>)}
        </div>}
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <input value={newLinkLabel} onChange={e=>setNewLinkLabel(e.target.value)} placeholder="Label (e.g. Venue Tech Pack)" style={{...UI.input,flex:1,minWidth:120}} onKeyDown={e=>e.key==="Enter"&&addLink()}/>
          <input value={newLinkUrl} onChange={e=>setNewLinkUrl(e.target.value)} placeholder="Paste URL" style={{...UI.input,flex:2,minWidth:160}} onKeyDown={e=>e.key==="Enter"&&addLink()}/>
          <button onClick={addLink} disabled={!newLinkLabel.trim()||!newLinkUrl.trim()} style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",opacity:(!newLinkLabel.trim()||!newLinkUrl.trim())?0.4:1}}>Add</button>
        </div>
        {vg.advanceEmail&&<div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>
          <a href={`mailto:${vg.advanceEmail}`} style={{fontSize:9,color:"var(--accent)",background:"var(--accent-pill-bg)",padding:"2px 8px",borderRadius:6,textDecoration:"none",fontWeight:600}}>{vg.advanceContact||"Advance"} ✉</a>
          {vg.techContact&&vg.techContact.includes("@")&&<a href={`mailto:${vg.techContact.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]}`} style={{fontSize:9,color:"var(--success-fg)",background:"var(--success-bg)",padding:"2px 8px",borderRadius:6,textDecoration:"none",fontWeight:600}}>Tech Contact ✉</a>}
        </div>}
      </div>
    </div>
  );
}

// ── LODGING TAB ─────────────────────────────────────────────────────────────

const HOTEL_STATUS_META={
  pending:{label:"Pending",bg:"var(--warn-bg)",c:"var(--warn-fg)"},
  confirmed:{label:"Confirmed",bg:"var(--success-bg)",c:"var(--success-fg)"},
  checked_in:{label:"Checked In",bg:"var(--info-bg)",c:"var(--link)"},
  checked_out:{label:"Checked Out",bg:"var(--card-2)",c:"var(--text-2)"},
  cancelled:{label:"Cancelled",bg:"var(--danger-bg)",c:"var(--danger-fg)"},
};
const ROOM_STATUS_META={
  pending:{label:"Pending",bg:"var(--warn-bg)",c:"var(--warn-fg)"},
  confirmed:{label:"Confirmed",bg:"var(--success-bg)",c:"var(--success-fg)"},
  occupied:{label:"Occupied",bg:"var(--info-bg)",c:"var(--link)"},
  released:{label:"Released",bg:"var(--card-2)",c:"var(--text-2)"},
};

function LodgingTab(){
  const{lodging,uLodging,crew,showCrew,finance,uFin,tourDaysSorted,mobile,sel,setSel,tourStart,tourEnd}=useContext(Ctx);
  const[addOpen,setAddOpen]=useState(false);
  const[editId,setEditId]=useState(null);
  const[scanning,setScanning]=useState(false);
  const[scanMsg,setScanMsg]=useState("");
  const[pendingImport,setPendingImport]=useState([]);

  // Hotels on a given date: those whose checkIn <= date <= checkOut
  const hotelsForDate=useCallback((date)=>{
    return Object.values(lodging).filter(h=>h.checkIn<=date&&h.checkOut>=date);
  },[lodging]);

  // Badge count per day: distinct hotels covering that date
  const badgeCount=useCallback((date)=>hotelsForDate(date).length,[hotelsForDate]);

  const dayHotels=hotelsForDate(sel);

  function newHotelId(){return`hotel_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;}

  const scanLodging=async(opts={})=>{
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const googleToken=session.provider_token;
      if(!googleToken){setScanMsg("Gmail access not available — re-login with Google.");return;}
      if(opts.reset){setPendingImport([]);}
      setScanning(true);setScanMsg(opts.sweepFrom?"Historical sweep in progress…":"Scanning Gmail for hotel confirmations…");
      const resp=await fetch("/api/lodging-scan",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken,tourStart,tourEnd,sweepFrom:opts.sweepFrom||null})});
      if(resp.status===402){setScanMsg("Gmail session expired — please re-login.");setScanning(false);return;}
      if(!resp.ok){setScanMsg(`Scan error ${resp.status} — try again.`);setScanning(false);return;}
      const data=await resp.json();
      if(data.error){setScanMsg(`Error: ${data.error}`);setScanning(false);return;}
      const newLodgings=data.lodgings||[];
      const existingKeys=new Set(Object.values(lodging).map(h=>`${h.name}__${h.checkIn}`));
      const novel=newLodgings.filter(h=>!lodging[h.id]&&!existingKeys.has(`${h.name}__${h.checkIn}`));
      if(!novel.length){setScanMsg(`Scanned ${data.threadsFound} threads — no new hotels found.`);setScanning(false);return;}
      setPendingImport(novel);
      setScanMsg(`Found ${novel.length} new hotel${novel.length>1?"s":""} in ${data.threadsFound} threads.`);
    }catch(e){setScanMsg(`Scan failed: ${e.message}`);}
    setScanning(false);
  };

  const importHotel=h=>{
    uLodging(h.id,{...h,status:"pending",rooms:h.rooms||[],todos:HOTEL_TODOS_DEFAULT.map(t=>({text:t,done:false}))});
    setPendingImport(p=>p.filter(x=>x.id!==h.id));
    if(h.cost&&h.cost>0&&h.checkIn){
      const dateKey=h.checkIn;
      const existing=(finance[dateKey]?.ledgerEntries||[]).filter(e=>e.hotelId!==h.id);
      uFin(dateKey,{ledgerEntries:[...existing,{id:`lodging_${h.id}`,date:dateKey,vendor:h.name||"Hotel",amount:parseFloat(h.cost),currency:h.currency||"USD",category:"Hotel",description:h.checkOut?`${h.checkIn}–${h.checkOut} · ${h.name||"Hotel"}`:h.name||"Hotel",source:"lodging",hotelId:h.id}]});
    }
  };
  const importAll=()=>{pendingImport.forEach(h=>importHotel(h));};

  return(
    <div style={{display:"flex",flex:1,minHeight:0,height:"100%",background:"var(--bg)"}}>
      {/* Main content */}
      <div style={{flex:1,overflowY:"auto",padding:mobile?"10px 8px":"14px 16px",display:"flex",flexDirection:"column",gap:14,minWidth:0}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"var(--text)",letterSpacing:"-0.02em"}}>
              {sel?new Date(sel+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}):"Lodging"}
            </div>
            <div style={{fontSize:10,color:"var(--text-dim)",marginTop:1}}>{dayHotels.length} hotel{dayHotels.length!==1?"s":""} covering this date</div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            {scanMsg&&<span style={{fontSize:9,color:scanning?"var(--accent)":"var(--text-dim)",fontFamily:MN,maxWidth:200}}>{scanMsg}</span>}
            <button onClick={()=>scanLodging({sweepFrom:"2026-01-01"})} disabled={scanning} style={{background:scanning?"var(--border)":"var(--accent-soft)",color:scanning?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:scanning?"default":"pointer"}}>
              {scanning?"Scanning…":"Historical Sweep"}
            </button>
            <button onClick={()=>scanLodging()} disabled={scanning} style={{background:scanning?"var(--border)":"var(--accent)",color:scanning?"var(--text-dim)":"var(--card)",border:"none",borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:scanning?"default":"pointer"}}>
              {scanning?"Scanning…":"Scan Gmail"}
            </button>
            <button onClick={()=>setAddOpen(true)} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              + Add Hotel
            </button>
          </div>
        </div>

        {/* Pending import (just scanned, not yet in state) */}
        {pendingImport.length>0&&(
          <div style={{background:"var(--accent-pill-bg)",border:"1px solid var(--accent-pill-border)",borderRadius:10,padding:"10px 12px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:9,fontWeight:800,color:"var(--accent)",letterSpacing:"0.06em"}}>NEW HOTELS — REVIEW BEFORE IMPORTING</span>
              <button onClick={importAll} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import All ({pendingImport.length})</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {pendingImport.map(h=>(
                <div key={h.id} style={{background:"var(--card)",borderRadius:10,padding:"10px 12px",border:"1px solid var(--accent-pill-bg)",display:"flex",flexDirection:"column",gap:4}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
                    <div>
                      <span style={{fontSize:11,fontWeight:700,color:"var(--text)"}}>{h.name}</span>
                      {h.city&&<span style={{fontSize:10,color:"var(--text-dim)",marginLeft:6}}>{h.city}</span>}
                    </div>
                    <div style={{display:"flex",gap:5,alignItems:"center"}}>
                      {h.tid&&<a href={`https://mail.google.com/mail/u/0/#inbox/${h.tid}`} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"var(--accent)",textDecoration:"none"}}>open email ↗</a>}
                      <button onClick={()=>setPendingImport(p=>p.filter(x=>x.id!==h.id))} style={{fontSize:9,padding:"2px 8px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",cursor:"pointer"}}>Skip</button>
                      <button onClick={()=>importHotel(h)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>Import</button>
                    </div>
                  </div>
                  <div style={{fontSize:10,color:"var(--text-2)",fontFamily:MN}}>
                    {h.checkIn} → {h.checkOut}
                    {h.confirmNo&&<span style={{marginLeft:8,color:"var(--accent-soft)"}}>#{h.confirmNo}</span>}
                    {h.cost&&<span style={{marginLeft:8}}>{h.currency||"USD"} {h.cost.toLocaleString()}</span>}
                    {h.pax?.length>0&&<span style={{marginLeft:8,color:"var(--text-dim)"}}>{h.pax.join(", ")}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {dayHotels.length===0&&(
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"28px 20px",textAlign:"center",color:"var(--text-mute)",fontSize:11}}>
            No hotels assigned to this date.<br/>
            <span style={{color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>setAddOpen(true)}>+ Add a hotel</span>
          </div>
        )}

        {dayHotels.map(hotel=>(
          <HotelCard key={hotel.id} hotel={hotel} date={sel} onEdit={()=>setEditId(hotel.id)} crew={crew} uLodging={uLodging} uFin={uFin} finance={finance}/>
        ))}
      </div>

      {addOpen&&<HotelFormModal date={sel} onClose={()=>setAddOpen(false)} onSave={(h)=>{uLodging(h.id,h);setAddOpen(false);}} existingHotels={lodging}/>}
      {editId&&<HotelFormModal date={sel} hotel={lodging[editId]} onClose={()=>setEditId(null)} onSave={(h)=>{uLodging(h.id,h);setEditId(null);}} existingHotels={lodging}/>}
    </div>
  );
}

function HotelCard({hotel,date,onEdit,crew,uLodging,uFin,finance}){
  const[open,setOpen]=useState(true);
  const[newRoom,setNewRoom]=useState({crewId:"",roomNo:"",type:"Single",cost:"",notes:""});
  const[addRoomOpen,setAddRoomOpen]=useState(false);

  const meta=HOTEL_STATUS_META[hotel.status||"pending"]||HOTEL_STATUS_META.pending;
  const rooms=hotel.rooms||[];

  const totalCost=rooms.reduce((s,r)=>s+(parseFloat(r.cost)||0),0);

  function toggleTodo(i){
    const todos=(hotel.todos||HOTEL_TODOS_DEFAULT.map(t=>({text:t,done:false})));
    const next=[...todos];next[i]={...next[i],done:!next[i].done};
    uLodging(hotel.id,{...hotel,todos:next});
  }
  function initTodos(){if(!hotel.todos){uLodging(hotel.id,{...hotel,todos:HOTEL_TODOS_DEFAULT.map(t=>({text:t,done:false}))});}}

  function addRoom(){
    if(!newRoom.crewId)return;
    const r={id:`rm_${Date.now()}`,...newRoom,cost:parseFloat(newRoom.cost)||0,status:"pending",addedAt:Date.now()};
    uLodging(hotel.id,{...hotel,rooms:[...rooms,r]});
    setNewRoom({crewId:"",roomNo:"",type:"Single",cost:"",notes:""});
    setAddRoomOpen(false);
  }

  function removeRoom(id){uLodging(hotel.id,{...hotel,rooms:rooms.filter(r=>r.id!==id)});}

  function cycleRoomStatus(id){
    const order=["pending","confirmed","occupied","released"];
    const next=rooms.map(r=>{if(r.id!==id)return r;const i=order.indexOf(r.status||"pending");return{...r,status:order[(i+1)%order.length]};});
    uLodging(hotel.id,{...hotel,rooms:next});
  }

  function pushToLedger(){
    if(!totalCost)return;
    const dateKey=hotel.checkIn||date;
    const fin=finance[dateKey]||{};
    const ledger=fin.ledgerEntries||[];
    const entry={id:`lodging_${hotel.id}_${Date.now()}`,date:dateKey,vendor:hotel.name,amount:totalCost,currency:hotel.currency||"USD",category:"Hotel",description:`${rooms.length} room${rooms.length!==1?"s":""} – ${hotel.name}`,source:"lodging",hotelId:hotel.id};
    uFin(dateKey,{...fin,ledgerEntries:[...ledger.filter(e=>e.hotelId!==hotel.id),entry]});
  }

  const todos=hotel.todos||HOTEL_TODOS_DEFAULT.map(t=>({text:t,done:false}));
  const doneTodos=todos.filter(t=>t.done).length;

  return(
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
      {/* Card header */}
      <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:8,borderBottom:open?"1px solid var(--border)":"none",cursor:"pointer"}} onClick={()=>{setOpen(v=>!v);if(!hotel.todos)initTodos();}}>
        <span style={{fontSize:13}}>{open?"▾":"▸"}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontWeight:800,fontSize:13,color:"var(--text)"}}>{hotel.name||"Unnamed Hotel"}</span>
            <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:99,...meta,display:"inline-block"}}>{meta.label}</span>
            {hotel.stars&&<span style={{fontSize:10,color:"var(--warn-fg)"}}>{"★".repeat(hotel.stars)}</span>}
          </div>
          <div style={{fontSize:10,color:"var(--text-dim)",marginTop:1}}>{hotel.city&&`${hotel.city} · `}Check-in {hotel.checkIn} → Check-out {hotel.checkOut}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {totalCost>0&&<span style={{fontSize:10,fontWeight:700,color:"var(--success-fg)",fontFamily:MN}}>${totalCost.toFixed(0)}</span>}
          <button onClick={e=>{e.stopPropagation();onEdit();}} style={{background:"var(--card-2)",border:"none",borderRadius:6,padding:"4px 8px",fontSize:10,cursor:"pointer",color:"var(--text-2)"}}>Edit</button>
          <button onClick={e=>{e.stopPropagation();if(confirm(`Remove ${hotel.name}?`))uLodging(hotel.id,null);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger-fg)",fontSize:13,padding:"2px 4px"}}>×</button>
        </div>
      </div>

      {open&&(
        <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:12}}>
          {/* Details row */}
          <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:11,color:"var(--text-2)"}}>
            {hotel.address&&<span>📍 {hotel.address}</span>}
            {hotel.phone&&<span>📞 <a href={`tel:${hotel.phone}`} style={{color:"var(--accent)",textDecoration:"none"}}>{hotel.phone}</a></span>}
            {hotel.confirmNo&&<span style={{fontFamily:MN}}>Conf# <strong>{hotel.confirmNo}</strong></span>}
            {hotel.bookingRef&&<span style={{fontFamily:MN}}>Ref# <strong>{hotel.bookingRef}</strong></span>}
            {hotel.checkInTime&&<span>Check-in {hotel.checkInTime}</span>}
            {hotel.checkOutTime&&<span>Check-out {hotel.checkOutTime}</span>}
          </div>

          {/* Room assignments */}
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--text)",letterSpacing:"0.04em",textTransform:"uppercase"}}>Rooms ({rooms.length})</div>
              <button onClick={()=>setAddRoomOpen(v=>!v)} style={{background:"var(--accent-pill-bg)",color:"var(--accent)",border:"none",borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>+ Assign Room</button>
            </div>
            {rooms.length===0&&<div style={{fontSize:10,color:"var(--text-mute)",fontStyle:"italic"}}>No rooms assigned.</div>}
            {rooms.map(r=>{
              const cm=crew.find(c=>c.id===r.crewId);
              const rMeta=ROOM_STATUS_META[r.status||"pending"]||ROOM_STATUS_META.pending;
              return(
                <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid var(--card-2)",fontSize:11}}>
                  <button onClick={()=>cycleRoomStatus(r.id)} style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:99,...rMeta,border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>{rMeta.label}</button>
                  <span style={{flex:1,fontWeight:600,color:"var(--text)"}}>{cm?.name||r.crewId}</span>
                  {r.roomNo&&<span style={{fontFamily:MN,color:"var(--text-dim)"}}>#{r.roomNo}</span>}
                  <span style={{color:"var(--text-dim)"}}>{r.type}</span>
                  {r.cost>0&&<span style={{fontFamily:MN,color:"var(--success-fg)",fontWeight:700}}>${r.cost}</span>}
                  {r.notes&&<span style={{color:"var(--text-mute)",fontSize:10}}>{r.notes}</span>}
                  <button onClick={()=>removeRoom(r.id)} style={{background:"none",border:"none",color:"var(--danger-fg)",cursor:"pointer",fontSize:13,padding:"0 2px"}}>×</button>
                </div>
              );
            })}
            {addRoomOpen&&(
              <div style={{background:"var(--card-4)",border:"1px solid var(--border)",borderRadius:6,padding:"10px 10px",marginTop:6,display:"flex",flexDirection:"column",gap:7}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <select value={newRoom.crewId} onChange={e=>setNewRoom(p=>({...p,crewId:e.target.value}))} style={{flex:2,padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",fontSize:11,minWidth:120}}>
                    <option value="">Select crew member</option>
                    {crew.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input placeholder="Room #" value={newRoom.roomNo} onChange={e=>setNewRoom(p=>({...p,roomNo:e.target.value}))} style={{width:70,padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",fontSize:11,fontFamily:MN}}/>
                  <select value={newRoom.type} onChange={e=>setNewRoom(p=>({...p,type:e.target.value}))} style={{width:90,padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",fontSize:11}}>
                    {["Single","Double","Twin","Suite","King","Shared"].map(t=><option key={t}>{t}</option>)}
                  </select>
                  <input placeholder="Cost" type="number" value={newRoom.cost} onChange={e=>setNewRoom(p=>({...p,cost:e.target.value}))} style={{width:70,padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",fontSize:11,fontFamily:MN}}/>
                </div>
                <input placeholder="Notes (optional)" value={newRoom.notes} onChange={e=>setNewRoom(p=>({...p,notes:e.target.value}))} style={{padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",fontSize:11}}/>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={addRoom} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Add Room</button>
                  <button onClick={()=>setAddRoomOpen(false)} style={{background:"var(--card-2)",color:"var(--text-2)",border:"none",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* To-do checklist */}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"var(--text)",letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:5}}>Checklist ({doneTodos}/{todos.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {todos.map((t,i)=>(
                <label key={i} style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:11,color:t.done?"var(--text-mute)":"var(--text)",textDecoration:t.done?"line-through":"none"}}>
                  <input type="checkbox" checked={!!t.done} onChange={()=>toggleTodo(i)} style={{accentColor:"var(--accent)",width:13,height:13,flexShrink:0}}/>
                  {t.text}
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"var(--text)",letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:4}}>Notes</div>
            <textarea value={hotel.notes||""} onChange={e=>uLodging(hotel.id,{...hotel,notes:e.target.value})} placeholder="Parking, shuttle, special requests, room block contact…" rows={2} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:11,resize:"vertical",background:"var(--card-4)",fontFamily:"'Outfit',system-ui"}}/>
          </div>

          {/* Finance row */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:4,borderTop:"1px solid var(--card-2)"}}>
            <div style={{fontSize:11,color:"var(--text-dim)"}}>
              Total: <strong style={{color:"var(--success-fg)",fontFamily:MN}}>{hotel.currency||"USD"} {totalCost.toFixed(2)}</strong>
              {rooms.length>0&&<span style={{color:"var(--text-mute)",marginLeft:6}}>({rooms.length} room{rooms.length!==1?"s":""})</span>}
            </div>
            <button onClick={pushToLedger} disabled={!totalCost} style={{background:totalCost?"var(--success-fg)":"var(--border)",color:"#fff",border:"none",borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:totalCost?"pointer":"not-allowed"}}>↑ Add to Ledger</button>
          </div>
        </div>
      )}
    </div>
  );
}

function HotelFormModal({date,hotel,onClose,onSave,existingHotels}){
  const isEdit=!!hotel;
  const[form,setForm]=useState(hotel||{id:newHotelIdFn(),name:"",address:"",city:"",phone:"",stars:"",checkIn:date,checkOut:date,checkInTime:HOTEL_DEFAULT_CHECKIN,checkOutTime:HOTEL_DEFAULT_CHECKOUT,confirmNo:"",bookingRef:"",status:"pending",currency:"USD",notes:"",rooms:[],todos:HOTEL_TODOS_DEFAULT.map(t=>({text:t,done:false}))});
  function newHotelIdFn(){return`hotel_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;}
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:80,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"var(--card)",borderRadius:10,padding:"20px 22px",width:"100%",maxWidth:460,boxShadow:"0 24px 64px rgba(0,0,0,.18)",display:"flex",flexDirection:"column",gap:12,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontWeight:800,fontSize:13,color:"var(--text)"}}>{isEdit?"Edit Hotel":"Add Hotel"}</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"var(--text-mute)"}}>×</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 10px"}}>
          {[["name","Hotel Name","full"],["address","Address","full"],["city","City","half"],["phone","Phone","half"],["confirmNo","Confirmation #","half"],["bookingRef","Booking Ref","half"],["checkIn","Check-in Date","half"],["checkOut","Check-out Date","half"],["checkInTime","Check-in Time","half"],["checkOutTime","Check-out Time","half"]].map(([k,lbl,span])=>(
            <div key={k} style={{gridColumn:span==="full"?"1/-1":"auto"}}>
              <div style={{fontSize:9,fontWeight:700,color:"var(--text-dim)",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>{lbl}</div>
              <input value={form[k]||""} onChange={e=>f(k,e.target.value)} type={k.includes("Date")?"date":k.includes("Time")?"time":"text"} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:11,fontFamily:k==="confirmNo"||k==="bookingRef"?MN:"inherit"}}/>
            </div>
          ))}
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"var(--text-dim)",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Stars</div>
            <select value={form.stars||""} onChange={e=>f("stars",e.target.value?parseInt(e.target.value):"")} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:11}}>
              <option value="">–</option>
              {[1,2,3,4,5].map(n=><option key={n} value={n}>{"★".repeat(n)}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"var(--text-dim)",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Status</div>
            <select value={form.status||"pending"} onChange={e=>f("status",e.target.value)} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:11}}>
              {Object.entries(HOTEL_STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"var(--text-dim)",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Currency</div>
            <select value={form.currency||"USD"} onChange={e=>f("currency",e.target.value)} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:11}}>
              {["USD","EUR","GBP","CAD","AUD","PLN","CZK","SEK","NOK","DKK"].map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"var(--text-dim)",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Notes</div>
          <textarea value={form.notes||""} onChange={e=>f("notes",e.target.value)} rows={2} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:11,resize:"vertical"}}/>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"var(--card-2)",border:"none",borderRadius:6,padding:"7px 14px",fontSize:11,cursor:"pointer",color:"var(--text-2)"}}>Cancel</button>
          <button onClick={()=>onSave(form)} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"7px 16px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{isEdit?"Save Changes":"Add Hotel"}</button>
        </div>
      </div>
    </div>
  );
}

function ProdTab(){
  const{shows,sel,eventKey,production,uProd,mobile}=useContext(Ctx);
  const show=shows?.[sel];
  const data=production[eventKey]||{docs:[],items:[],issues:[],analysis:null};

  const[subTab,setSubTab]=useState("venue");
  const[uploading,setUploading]=useState(false);
  const[analyzing,setAnalyzing]=useState(false);
  const[uploadMsg,setUploadMsg]=useState("");
  const[docType,setDocType]=useState("vendor_quote");
  const[vendorName,setVendorName]=useState("");
  const[quoteRef,setQuoteRef]=useState("");
  const[deptFilter,setDeptFilter]=useState("ALL");
  const[posFilter,setPosFilter]=useState("ALL");
  const fileRef=useRef(null);

  const upd=useCallback(patch=>uProd(eventKey,{...data,...patch}),[eventKey,data,uProd]);

  const handleFile=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.type!=="application/pdf"){setUploadMsg("PDF files only");return;}
    setUploading(true);setUploadMsg(`Parsing ${file.name}…`);
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){setUploadMsg("No session");return;}
      const buf=await file.arrayBuffer();
      const b64=btoa(String.fromCharCode(...new Uint8Array(buf)));
      const resp=await fetch("/api/production",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({pdfBase64:b64,docType,vendorName:vendorName.trim()||null,quoteRef:quoteRef.trim()||null}),
      });
      const result=await resp.json();
      if(!resp.ok){setUploadMsg(result.error||"Parse failed");return;}
      const docId=`doc_${Date.now()}`;
      const newDoc={id:docId,fileName:file.name,docType,vendorName:vendorName.trim()||null,quoteRef:quoteRef.trim()||null,parsedAt:new Date().toISOString(),itemCount:result.count};
      const newItems=(result.items||[]).map(i=>({...i,doc_id:docId}));
      upd({docs:[...(data.docs||[]),newDoc],items:[...(data.items||[]),...newItems],analysis:null,issues:[]});
      setUploadMsg(`Parsed ${result.count} items from ${file.name}`);
      setVendorName("");setQuoteRef("");
      if(fileRef.current)fileRef.current.value="";
      setTimeout(()=>setUploadMsg(""),4000);
    }catch(e){setUploadMsg(`Error: ${e.message}`);}
    finally{setUploading(false);}
  };

  const runAnalysis=async()=>{
    if(!data.items?.length){setUploadMsg("Upload at least one document first");return;}
    setAnalyzing(true);setUploadMsg("Running analysis…");
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){setUploadMsg("No session");return;}
      const resp=await fetch("/api/production",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({action:"analyze",existingItems:data.items}),
      });
      const result=await resp.json();
      if(!resp.ok){setUploadMsg(result.error||"Analysis failed");return;}
      upd({issues:result.issues||[],analysis:{powerBudget:result.powerBudget,weightLedger:result.weightLedger,analyzedAt:new Date().toISOString()}});
      setUploadMsg(`Analysis complete — ${result.issues?.length||0} issues detected`);
      setSubTab("analysis");
      setTimeout(()=>setUploadMsg(""),4000);
    }catch(e){setUploadMsg(`Error: ${e.message}`);}
    finally{setAnalyzing(false);}
  };

  const overridePosition=(itemId,pos)=>{
    upd({items:(data.items||[]).map(i=>i.id===itemId?{...i,rig_position:pos}:i),analysis:null,issues:[]});
  };

  const resolveIssue=id=>{
    upd({issues:(data.issues||[]).map(i=>i.id===id?{...i,resolved:!i.resolved}:i)});
  };

  const deleteDoc=docId=>{
    upd({docs:(data.docs||[]).filter(d=>d.id!==docId),items:(data.items||[]).filter(i=>i.doc_id!==docId),analysis:null,issues:[]});
  };

  const seedManifest=()=>{
    const seeded=MANIFEST_SEED.map(i=>({...i,id:`seed_${sel}_${i.id}`,doc_id:"seed"}));
    const seedDoc={id:"seed",fileName:"EU Tour Binder (seeded)",docType:"vendor_quote",vendorName:"Neg Earth / Sonalyst / Tour Carry",quoteRef:"26-1273 | 26-0097 | v1.0.0",parsedAt:new Date().toISOString(),itemCount:seeded.length};
    upd({docs:[seedDoc],items:seeded,analysis:null,issues:[]});
  };

  const toggleIncluded=itemId=>{
    upd({items:(data.items||[]).map(i=>i.id===itemId?{...i,included:!i.included}:i),analysis:null});
  };

  const updateQty=(itemId,val)=>{
    const n=parseInt(val,10);
    if(isNaN(n)||n<0)return;
    upd({items:(data.items||[]).map(i=>i.id===itemId?{...i,qty:n}:i),analysis:null});
  };

  const exportJson=()=>{
    const blob=new Blob([JSON.stringify({show:show?.venue,date:show?.date,...data},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");
    a.href=url;a.download=`production-${show?.venue||"show"}-${show?.date||"export"}.json`.toLowerCase().replace(/\s+/g,"_");
    a.click();URL.revokeObjectURL(url);
  };

  const[showExcluded,setShowExcluded]=useState(false);
  const filteredItems=useMemo(()=>{
    let items=data.items||[];
    if(!showExcluded)items=items.filter(i=>i.included!==false);
    if(deptFilter!=="ALL")items=items.filter(i=>i.department===deptFilter);
    if(posFilter!=="ALL")items=items.filter(i=>i.rig_position===posFilter);
    return items;
  },[data.items,deptFilter,posFilter,showExcluded]);

  const groupedItems=useMemo(()=>{
    return filteredItems.reduce((acc,item)=>{
      const d=item.department||"OTHER";
      if(!acc[d])acc[d]=[];
      acc[d].push(item);
      return acc;
    },{});
  },[filteredItems]);

  const tbdCount=useMemo(()=>(data.items||[]).filter(i=>i.rig_position==="TBD").length,[data.items]);
  const openIssues=useMemo(()=>(data.issues||[]).filter(i=>!i.resolved).length,[data.issues]);

  const vg=VENUE_GRID[sel]||null;
  const rigChecks=useMemo(()=>checkRigVsVenue(VENUE_GRID[sel]||null),[sel]);
  const rigCritical=rigChecks.filter(i=>i.severity==="CRITICAL").length;
  const rigHigh=rigChecks.filter(i=>i.severity==="HIGH").length;
  const rigBadge=rigCritical>0?rigCritical:rigHigh>0?rigHigh:null;
  const rigBadgeColor=rigCritical>0?"var(--danger-fg)":"var(--warn-fg)";

  const SUB_TABS=[
    {id:"venue",label:"Venue Brief"},
    {id:"rigcheck",label:"Rig Check",badge:rigBadge,badgeColor:rigBadgeColor},
    {id:"upload",label:"Upload"},
    {id:"manifest",label:`Manifest${data.items?.length?` (${data.items.length})`:""}`,badge:tbdCount>0?tbdCount:null,badgeColor:"var(--warn-fg)"},
    {id:"analysis",label:"Analysis"},
    {id:"issues",label:`Issues${openIssues>0?` (${openIssues})`:""}`,badge:openIssues>0?openIssues:null,badgeColor:"var(--danger-fg)"},
  ];

  if(!show)return<div style={{padding:24,color:"var(--text-dim)",fontSize:11}}>Select a show to view production data.</div>;

  return(
    <div className="fi" style={{padding:"16px 20px",maxWidth:900,width:"100%",height:"calc(100vh - 115px)",overflowY:"auto"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:800,color:"var(--text)"}}>{show.venue}</div>
          <div style={{fontSize:10,color:"var(--text-dim)",fontFamily:MN}}>{show.date} · {show.city}</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {data.items?.length>0&&<button onClick={runAnalysis} disabled={analyzing} style={{fontSize:10,fontWeight:700,padding:"5px 12px",borderRadius:6,border:"none",background:analyzing?"var(--border)":"var(--accent)",color:analyzing?"var(--text-mute)":"var(--card)",cursor:analyzing?"default":"pointer"}}>{analyzing?"Analyzing…":"Run Analysis"}</button>}
          {data.items?.length>0&&<button onClick={exportJson} style={{fontSize:10,fontWeight:600,padding:"5px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-3)",color:"var(--text-2)",cursor:"pointer"}}>Export JSON</button>}
        </div>
      </div>

      {uploadMsg&&<div style={{fontSize:10,color:uploadMsg.startsWith("Error")||uploadMsg.startsWith("PDF")?"var(--danger-fg)":"var(--success-fg)",background:uploadMsg.startsWith("Error")||uploadMsg.startsWith("PDF")?"var(--danger-bg)":"var(--success-bg)",border:`1px solid ${uploadMsg.startsWith("Error")||uploadMsg.startsWith("PDF")?"var(--danger-bg)":"var(--success-bg)"}`,borderRadius:6,padding:"6px 10px",marginBottom:10,fontFamily:MN}}>{uploadMsg}</div>}

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:1,borderBottom:"1px solid var(--border)",marginBottom:12,overflowX:"auto",overflowY:"hidden",scrollbarWidth:"thin",WebkitOverflowScrolling:"touch"}}>
        {SUB_TABS.map(t=><button key={t.id} onClick={()=>setSubTab(t.id)} style={{padding:"5px 12px",fontSize:10,fontWeight:subTab===t.id?700:500,color:subTab===t.id?"var(--text)":"var(--text-dim)",background:"none",border:"none",cursor:"pointer",borderBottom:subTab===t.id?"2px solid var(--accent)":"2px solid transparent",display:"flex",alignItems:"center",gap:4,flexShrink:0,whiteSpace:"nowrap"}}>
          {t.label}{t.badge!=null&&<span style={{fontSize:8,fontWeight:800,background:t.badgeColor||"var(--accent)",color:"#fff",borderRadius:10,padding:"1px 5px"}}>{t.badge}</span>}
        </button>)}
      </div>

      {/* Venue Brief tab */}
      {subTab==="venue"&&<VenueBrief vg={vg} sel={sel} data={data} upd={upd}/>}

      {/* Rig Check tab */}
      {subTab==="rigcheck"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
        {/* Spec header */}
        <div style={{background:"var(--border)",borderRadius:10,padding:"12px 16px",color:"#fff"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:800,fontFamily:MN,color:"var(--border)"}}>BBNO$ EU TOUR RIG — {DESIGN_RIG.version}</div>
              <div style={{fontSize:9,color:"var(--text-dim)",fontFamily:MN}}>Designer: {DESIGN_RIG.drawnBy} · {DESIGN_RIG.publishedAt} · {DESIGN_RIG.file}</div>
            </div>
            <span style={{fontSize:9,fontWeight:700,padding:"3px 9px",borderRadius:6,background:"var(--card-2)",color:"var(--text-mute)",fontFamily:MN}}>~{DESIGN_RIG.req.power_kw_est} kW est.</span>
          </div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {[["Rig W",`${DESIGN_RIG.dims.rig_width_mm/1000}m`],["LED Tower H",`${DESIGN_RIG.dims.led_tower_h_mm/1000}m`],["Fly Trim",`${DESIGN_RIG.dims.fly_trim_mm/1000}m`],["Stage Depth",`${DESIGN_RIG.dims.stage_depth_mm/1000}m`],["Stage W total",`${DESIGN_RIG.dims.stage_w_total_mm/1000}m`],["Min Clear (GS)",`${DESIGN_RIG.req.min_clearance_gs_m}m`],["Min Clear (fly)",`${DESIGN_RIG.req.min_clearance_fly_m}m`],["Lasers",`${DESIGN_RIG.req.laser_count}× Class 4`]].map(([k,v])=><div key={k} style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"var(--text-mute)",textTransform:"uppercase",letterSpacing:"0.04em"}}>{k}</div>
              <div style={{fontSize:11,fontWeight:800,fontFamily:MN,color:"var(--card-3)"}}>{v}</div>
            </div>)}
          </div>
        </div>

        {/* Fixture schedule */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:12}}>
          <div style={{...UI.sectionLabel,marginBottom:8}}>Fixture Schedule (Sht-1 Symbol Key + VWX)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 40px 60px 60px 50px",gap:0,padding:"4px 8px",background:"var(--card-3)",borderRadius:"6px 6px 0 0",borderBottom:"1px solid var(--border)"}}>
            {["Fixture","Qty","W/unit","Binder","Δ"].map(h=><span key={h} style={{fontSize:8,fontWeight:800,color:"var(--text-mute)",letterSpacing:"0.04em"}}>{h}</span>)}
          </div>
          {DESIGN_RIG.fixtures.map((f,i)=>{
            const hasDelta=f.delta!=null&&f.delta!==0;
            const deltaColor=f.delta>0?"var(--danger-fg)":f.delta<0?"var(--warn-fg)":"var(--success-fg)";
            return(
              <div key={f.name} style={{display:"grid",gridTemplateColumns:"1fr 40px 60px 60px 50px",gap:0,padding:"4px 8px",background:hasDelta?"var(--danger-bg)":i%2===0?"var(--card)":"var(--card-3)",borderBottom:"1px solid var(--card-2)",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:9,fontWeight:600,color:"var(--text)"}}>{f.name}</div>
                  {f.note&&<div style={{fontSize:8,color:"var(--text-mute)",fontStyle:"italic"}}>{f.note}</div>}
                  <div style={{fontSize:8,color:"var(--text-faint)"}}>{f.dept} · {f.position} · {f.source}</div>
                </div>
                <span style={{fontSize:10,fontWeight:700,fontFamily:MN,textAlign:"center",color:f.qty==null?"var(--text-mute)":"var(--text)"}}>{f.qty??"-"}</span>
                <span style={{fontSize:9,fontFamily:MN,color:"var(--text-2)",textAlign:"right"}}>{f.power_w?`${f.power_w}W`:"—"}</span>
                <span style={{fontSize:9,fontFamily:MN,color:"var(--text-dim)",textAlign:"center"}}>{f.binder_qty??"-"}</span>
                <span style={{fontSize:10,fontWeight:700,fontFamily:MN,textAlign:"center",color:hasDelta?deltaColor:"var(--success-fg)"}}>{f.delta==null?"?":f.delta===0?"✓":f.delta>0?`+${f.delta}`:f.delta}</span>
              </div>
            );
          })}
          <div style={{padding:"4px 8px",fontSize:8,color:"var(--text-mute)"}}>Δ = design qty − binder qty · red = under-quoted · amber = over-quoted</div>
        </div>

        {/* Design vs quote discrepancies */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:12}}>
          <div style={{...UI.sectionLabel,marginBottom:8}}>Design vs Quote Discrepancies</div>
          {DESIGN_RIG.specDiscrepancies.map((disc,i)=>{
            const sv=SEV_STYLES[disc.severity]||SEV_STYLES.LOW;
            return(
              <div key={i} style={{padding:"7px 10px",borderBottom:"1px solid var(--card-2)",background:i%2===0?"var(--card)":"var(--card-3)"}}>
                <div style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:3}}>
                  <span style={{fontSize:8,fontWeight:800,padding:"1px 6px",borderRadius:10,background:sv.bg,color:sv.c,flexShrink:0}}>{disc.severity}</span>
                  <span style={{fontSize:8,fontWeight:700,color:"var(--text-dim)",flexShrink:0}}>{disc.category}</span>
                  <span style={{fontSize:9,color:"var(--text)",flex:1}}>{disc.finding}</span>
                </div>
                <div style={{fontSize:8,color:"var(--text-2)",paddingLeft:2}}><span style={{fontWeight:600}}>Action:</span> {disc.action}</div>
              </div>
            );
          })}
        </div>

      </div>}

      {/* Upload tab */}
      {subTab==="upload"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
          <div style={{...UI.sectionLabel,marginBottom:10}}>Add Document</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            {["vendor_quote","design_drawing"].map(dt=><button key={dt} onClick={()=>setDocType(dt)} style={{fontSize:10,fontWeight:700,padding:"4px 12px",borderRadius:6,border:`1.5px solid ${docType===dt?"var(--accent)":"var(--border)"}`,background:docType===dt?"var(--accent-pill-bg)":"var(--card)",color:docType===dt?"var(--accent)":"var(--text-2)",cursor:"pointer"}}>{dt==="vendor_quote"?"Vendor Quote":"Design Drawing"}</button>)}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            <input value={vendorName} onChange={e=>setVendorName(e.target.value)} placeholder="Vendor name (e.g. Neg Earth)" style={{...UI.input,flex:1,minWidth:140}} disabled={docType==="design_drawing"}/>
            <input value={quoteRef} onChange={e=>setQuoteRef(e.target.value)} placeholder="Quote ref (e.g. 26-1273)" style={{...UI.input,flex:1,minWidth:120}} disabled={docType==="design_drawing"}/>
          </div>
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"24px 16px",border:"2px dashed var(--border)",borderRadius:10,cursor:"pointer",background:"var(--card-3)",color:"var(--text-dim)",fontSize:10,fontWeight:600}}>
            <span style={{fontSize:20}}>▤</span>
            {uploading?"Uploading…":"Click to upload PDF or drag and drop"}
            <input ref={fileRef} type="file" accept="application/pdf" onChange={handleFile} style={{display:"none"}} disabled={uploading}/>
          </label>
        </div>

        {(data.docs||[]).length>0&&<div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
          <div style={{...UI.sectionLabel,marginBottom:8}}>Uploaded Documents</div>
          {(data.docs||[]).map(doc=><div key={doc.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--card-2)"}}>
            <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,background:doc.docType==="vendor_quote"?"var(--accent-pill-bg)":"var(--success-bg)",color:doc.docType==="vendor_quote"?"var(--accent)":"var(--success-fg)"}}>{doc.docType==="vendor_quote"?"QUOTE":"DESIGN"}</span>
            <span style={{fontSize:10,flex:1,color:"var(--text)"}}>{doc.fileName}</span>
            {doc.vendorName&&<span style={{fontSize:9,color:"var(--text-dim)"}}>{doc.vendorName}</span>}
            {doc.quoteRef&&<span style={{fontSize:9,color:"var(--text-mute)",fontFamily:MN}}>{doc.quoteRef}</span>}
            <span style={{fontSize:9,color:"var(--success-fg)",fontFamily:MN}}>{doc.itemCount} items</span>
            <button onClick={()=>deleteDoc(doc.id)} style={{fontSize:10,color:"var(--text-mute)",background:"none",border:"none",cursor:"pointer",padding:"0 4px"}} title="Remove document">×</button>
          </div>)}
          {data.items?.length>0&&<div style={{marginTop:12,padding:"8px 10px",background:"var(--card-3)",borderRadius:6,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:"var(--text-2)"}}>{data.items.length} total items across {data.docs.length} document(s)</span>
            {tbdCount>0&&<span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,background:"var(--warn-bg)",color:"var(--warn-fg)"}}>{tbdCount} TBD positions</span>}
            <button onClick={()=>setSubTab("manifest")} style={{marginLeft:"auto",fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-3)",color:"var(--text-2)",cursor:"pointer"}}>View Manifest →</button>
          </div>}
        </div>}

        {!data.docs?.length&&<div style={{padding:32,textAlign:"center",color:"var(--text-mute)",fontSize:10}}>
          <div style={{fontSize:24,marginBottom:8}}>▤</div>
          <div style={{fontWeight:600,marginBottom:4}}>No documents uploaded</div>
          <div>Upload vendor quote PDFs or production design drawings to generate a manifest.</div>
        </div>}
      </div>}

      {/* Manifest tab */}
      {subTab==="manifest"&&<div>
        {/* Filters */}
        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
          <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)} style={{...UI.input,fontSize:9}}>
            {PROD_DEPTS.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
          <select value={posFilter} onChange={e=>setPosFilter(e.target.value)} style={{...UI.input,fontSize:9}}>
            {["ALL","fly","ground","tower","touring_carry","TBD"].map(p=><option key={p} value={p}>{p==="ALL"?"All positions":p.toUpperCase()}</option>)}
          </select>
          {tbdCount>0&&<button onClick={()=>setPosFilter("TBD")} style={{fontSize:9,fontWeight:700,padding:"3px 9px",borderRadius:6,border:"1.5px solid var(--warn-fg)",background:"var(--warn-bg)",color:"var(--warn-fg)",cursor:"pointer"}}>▲ {tbdCount} TBD</button>}
          <button onClick={()=>setShowExcluded(v=>!v)} style={{fontSize:9,fontWeight:700,padding:"3px 9px",borderRadius:6,border:`1.5px solid ${showExcluded?"var(--accent)":"var(--border)"}`,background:showExcluded?"var(--accent-pill-bg)":"var(--card-3)",color:showExcluded?"var(--accent)":"var(--text-mute)",cursor:"pointer"}}>{showExcluded?"Show all":"Excluded hidden"}</button>
          <span style={{marginLeft:"auto",fontSize:9,color:"var(--text-mute)"}}>{(data.items||[]).filter(i=>i.included!==false).length} of {(data.items||[]).length} included</span>
        </div>

        {(data.items||[]).length===0&&VENUE_GRID[sel]&&<div style={{padding:32,textAlign:"center"}}>
          <div style={{fontSize:24,marginBottom:8}}>▤</div>
          <div style={{fontSize:11,fontWeight:600,color:"var(--text)",marginBottom:4}}>No manifest loaded</div>
          <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:16}}>Seed from the EU Tour Binder or upload vendor quote PDFs in the Upload tab.</div>
          <button onClick={seedManifest} style={{fontSize:11,fontWeight:700,padding:"8px 20px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer"}}>Load Tour Manifest</button>
        </div>}

        {(data.items||[]).length===0&&!VENUE_GRID[sel]&&<div style={{padding:32,textAlign:"center",color:"var(--text-mute)",fontSize:10}}>No items. Upload vendor quote PDFs in the Upload tab.</div>}

        {(data.items||[]).length>0&&Object.entries(groupedItems).length===0&&<div style={{padding:32,textAlign:"center",color:"var(--text-mute)",fontSize:10}}>No items match the current filters.</div>}

        {Object.entries(groupedItems).map(([dept,items])=><div key={dept} style={{marginBottom:12}}>
          <div style={{fontSize:9,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>{dept} ({items.length})</div>
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
            {/* Table header */}
            <div style={{display:"grid",gridTemplateColumns:"20px 1fr 60px 60px 60px 60px 60px 70px 70px",gap:0,borderBottom:"1px solid var(--border)",padding:"5px 8px",background:"var(--card-3)"}}>
              {["","Item","Qty","Position","Wt/u","Wt tot","Pwr/u","IP","Source"].map(h=><span key={h} style={{fontSize:8,fontWeight:800,color:"var(--text-mute)",letterSpacing:"0.04em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h}</span>)}
            </div>
            {items.map(item=>{
              const pos=item.rig_position||"TBD";
              const ps=POS_STYLES[pos]||POS_STYLES.TBD;
              const flagged=item.has_discrepancy;
              const excluded=item.included===false;
              return(
                <div key={item.id} className="rh" style={{display:"grid",gridTemplateColumns:"20px 1fr 60px 60px 60px 60px 60px 70px 70px",gap:0,padding:"5px 8px",borderBottom:"1px solid var(--card-2)",background:flagged?"var(--danger-bg)":excluded?"var(--card-3)":"var(--card)",alignItems:"center",opacity:excluded?0.45:1}}>
                  <input type="checkbox" checked={!excluded} onChange={()=>toggleIncluded(item.id)} style={{width:13,height:13,cursor:"pointer",accentColor:"var(--accent)"}}/>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:600,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:excluded?"line-through":"none"}} title={item.item_name}>{item.item_name}</div>
                    {item.model_ref&&item.model_ref!==item.item_name&&<div style={{fontSize:8,color:"var(--text-mute)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.model_ref}</div>}
                    {item.vendor_name&&<div style={{fontSize:8,color:"var(--text-dim)"}}>{item.vendor_name}{item.vendor_quote_ref&&` · ${item.vendor_quote_ref}`}</div>}
                  </div>
                  <input type="number" min={0} value={item.qty||1} onChange={e=>updateQty(item.id,e.target.value)} style={{width:48,fontSize:10,fontFamily:MN,fontWeight:600,textAlign:"center",border:"1px solid var(--border)",borderRadius:4,padding:"2px 4px",background:"var(--card-3)",color:"var(--text)",outline:"none"}}/>
                  <div style={{display:"flex",alignItems:"center"}}>
                    <select value={pos} onChange={e=>overridePosition(item.id,e.target.value)} style={{fontSize:8,fontWeight:700,padding:"2px 4px",borderRadius:4,border:`1px solid ${ps.c}`,background:ps.bg,color:ps.c,cursor:"pointer",maxWidth:56}}>
                      {["fly","ground","tower","touring_carry","TBD"].map(p=><option key={p} value={p}>{p.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <span style={{fontSize:9,fontFamily:MN,color:"var(--text-2)",textAlign:"right"}}>{item.weight_kg?`${item.weight_kg}kg`:"—"}</span>
                  <span style={{fontSize:9,fontFamily:MN,color:"var(--text-2)",textAlign:"right"}}>{item.weight_kg&&item.qty?`${Math.round(item.weight_kg*item.qty*10)/10}kg`:"—"}</span>
                  <span style={{fontSize:9,fontFamily:MN,color:"var(--text-2)",textAlign:"right"}}>{item.power_w?`${item.power_w}W`:"—"}</span>
                  <span style={{fontSize:8,fontFamily:MN,color:"var(--text-2)"}}>{item.ip_rating||"—"}</span>
                  <span style={{fontSize:8,color:item.spec_source==="fixture_specs"?"var(--success-fg)":"var(--text-mute)"}}>{item.source_type==="design_spec"?"design":"quote"}{item.spec_source==="fixture_specs"&&" ✓"}</span>
                </div>
              );
            })}
          </div>
        </div>)}
      </div>}

      {/* Analysis tab */}
      {subTab==="analysis"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
        {!data.analysis?<div style={{padding:32,textAlign:"center"}}>
          <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:12}}>Run analysis to see power budget, weight ledger, and issue detection.</div>
          {data.items?.length>0&&<button onClick={runAnalysis} disabled={analyzing} style={{fontSize:11,fontWeight:700,padding:"8px 20px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer"}}>{analyzing?"Analyzing…":"Run Analysis"}</button>}
        </div>:<>
          {/* Power Budget */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:14}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div style={{...UI.sectionLabel,margin:0}}>Power Budget</div>
              <span style={{fontSize:20,fontWeight:800,fontFamily:MN,color:data.analysis.powerBudget.total_kw>100?"var(--danger-fg)":data.analysis.powerBudget.total_kw>80?"var(--warn-fg)":"var(--success-fg)"}}>{data.analysis.powerBudget.total_kw} kW</span>
              <span style={{fontSize:9,color:"var(--text-mute)"}}>→ {data.analysis.powerBudget.recommended_minimum_kw} kW recommended minimum (30% headroom)</span>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {Object.entries(data.analysis.powerBudget.by_dept||{}).sort((a,b)=>b[1]-a[1]).map(([dept,w])=><div key={dept} style={{background:"var(--card-3)",borderRadius:6,padding:"5px 10px"}}>
                <div style={{fontSize:8,color:"var(--text-mute)",textTransform:"uppercase"}}>{dept}</div>
                <div style={{fontSize:11,fontWeight:700,fontFamily:MN,color:"var(--text)"}}>{Math.round(w/100)/10} kW</div>
              </div>)}
            </div>
            {data.analysis.powerBudget.missing_power_count>0&&<div style={{marginTop:8,fontSize:9,color:"var(--warn-fg)",background:"var(--warn-bg)",borderRadius:6,padding:"4px 8px"}}>{data.analysis.powerBudget.missing_power_count} item(s) missing power data — total may be understated</div>}
          </div>

          {/* Weight Ledger */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:14}}>
            <div style={{...UI.sectionLabel,marginBottom:10}}>Weight Ledger — Fly vs. Ground Split</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <div style={{background:"var(--accent-pill-bg)",borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--accent)",fontWeight:800,textTransform:"uppercase",marginBottom:4}}>Fly</div>
                <div style={{fontSize:20,fontWeight:800,fontFamily:MN,color:"var(--accent)"}}>{data.analysis.weightLedger.fly_kg} kg</div>
                <div style={{fontSize:9,color:"var(--accent-soft)"}}>{data.analysis.weightLedger.fly_item_count} item(s)</div>
              </div>
              <div style={{background:"var(--success-bg)",borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--success-fg)",fontWeight:800,textTransform:"uppercase",marginBottom:4}}>Ground</div>
                <div style={{fontSize:20,fontWeight:800,fontFamily:MN,color:"var(--success-fg)"}}>{data.analysis.weightLedger.ground_kg} kg</div>
                <div style={{fontSize:9,color:"var(--success-fg)"}}>{data.analysis.weightLedger.ground_item_count} item(s)</div>
              </div>
              <div style={{background:"var(--warn-bg)",borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--warn-fg)",fontWeight:800,textTransform:"uppercase",marginBottom:4}}>TBD</div>
                <div style={{fontSize:20,fontWeight:800,fontFamily:MN,color:"var(--warn-fg)"}}>{data.analysis.weightLedger.tbd_count}</div>
                <div style={{fontSize:9,color:"var(--warn-fg)"}}>items unclassified</div>
              </div>
            </div>
            {data.analysis.weightLedger.tbd_count>0&&<div style={{marginTop:8,fontSize:9,color:"var(--warn-fg)",background:"var(--warn-bg)",borderRadius:6,padding:"4px 8px"}}>Set positions in Manifest tab to complete weight split.</div>}
          </div>

          <div style={{fontSize:9,color:"var(--text-mute)",fontFamily:MN}}>Analyzed {new Date(data.analysis.analyzedAt).toLocaleString()} — re-run after position corrections</div>
        </>}
      </div>}

      {/* Issues tab */}
      {subTab==="issues"&&<div>
        {!(data.issues?.length)&&<div style={{padding:32,textAlign:"center",color:"var(--text-mute)",fontSize:10}}>
          {data.items?.length?<><div style={{marginBottom:8}}>No issues detected yet.</div><button onClick={runAnalysis} disabled={analyzing} style={{fontSize:10,fontWeight:700,padding:"5px 14px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer"}}>{analyzing?"Analyzing…":"Run Analysis"}</button></>:<div>Upload documents then run analysis to detect issues.</div>}
        </div>}
        {(data.issues||[]).map(issue=>{
          const sv=SEV_STYLES[issue.severity]||SEV_STYLES.LOW;
          return(
            <div key={issue.id} style={{background:issue.resolved?"var(--card-3)":"var(--card)",border:`1px solid ${issue.resolved?"var(--border)":sv.b}`,borderRadius:10,padding:"10px 12px",marginBottom:8,opacity:issue.resolved?0.6:1}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:4}}>
                <span style={{fontSize:8,fontWeight:800,padding:"2px 7px",borderRadius:10,background:sv.bg,color:sv.c,flexShrink:0}}>{issue.severity}</span>
                <span style={{fontSize:9,fontWeight:700,color:"var(--text-dim)",flexShrink:0}}>{issue.category}</span>
                <span style={{fontSize:9,fontWeight:700,color:"var(--text)",flex:1}}>{issue.finding}</span>
                <button onClick={()=>resolveIssue(issue.id)} style={{fontSize:8,fontWeight:700,padding:"2px 8px",borderRadius:6,border:"1px solid var(--border)",background:issue.resolved?"var(--success-bg)":"var(--card)",color:issue.resolved?"var(--success-fg)":"var(--text-2)",cursor:"pointer",flexShrink:0}}>{issue.resolved?"✓ Resolved":"Resolve"}</button>
              </div>
              {issue.impact&&<div style={{fontSize:9,color:"var(--text-dim)",marginBottom:2}}><span style={{fontWeight:600}}>Impact:</span> {issue.impact}</div>}
              {issue.action&&<div style={{fontSize:9,color:"var(--text-2)"}}><span style={{fontWeight:600}}>Action:</span> {issue.action}</div>}
            </div>
          );
        })}
        {data.issues?.length>0&&<div style={{marginTop:8,fontSize:9,color:"var(--text-mute)",fontFamily:MN}}>{data.issues.filter(i=>!i.resolved).length} open · {data.issues.filter(i=>i.resolved).length} resolved</div>}
      </div>}
    </div>
  );
}

function GuestListTab(){
  const{guestlists,uGuestlist,glTemplates,setGlTemplates,sel,setSel,eventKey,sorted,shows,mobile,crew,role}=useContext(Ctx);
  const a=useAuth();
  const by=(a?.user?.email||"unknown").toLowerCase();
  const allTemplates=useMemo(()=>[glBuiltinTemplate(),...Object.values(glTemplates||{}).sort((a,b)=>(a.name||"").localeCompare(b.name||""))],[glTemplates]);
  const[configTplId,setConfigTplId]=useState(GL_BUILTIN_TEMPLATE_ID);
  const[tplMenu,setTplMenu]=useState(false);
  const[tplSaveName,setTplSaveName]=useState("");
  const[activityOpen,setActivityOpen]=useState(false);
  const[categoriesOpen,setCategoriesOpen]=useState(false);
  const showDates=useMemo(()=>(sorted||[]).filter(s=>s.type!=="off"&&s.type!=="travel"&&s.type!=="split").map(s=>s.date),[sorted]);
  const date=sel&&shows?.[sel]?sel:(showDates[0]||sel);
  const show=shows?.[date];
  const glKey=eventKey||(sel&&shows?.[sel]?sel:(showDates[0]||sel));
  const gl=guestlists[glKey]||GL_DEFAULT_SHOW();
  const glExists=!!guestlists[glKey];
  const[addParty,setAddParty]=useState(false);
  const[partyForm,setPartyForm]=useState({name:"",role:"manager",contact:""});
  const[expandedParty,setExpandedParty]=useState(null);

  const statusMeta=GL_STATUS.find(s=>s.id===gl.status)||GL_STATUS[0];
  const parties=gl.parties||{};
  const partyList=Object.entries(parties);

  const categoryUsage=useMemo(()=>{
    const m={};
    gl.categories.forEach(c=>{m[c.id]={qty:c.qty||0,used:0,checkedIn:0,walkOn:c.walkOnQty||0};});
    partyList.forEach(([,p])=>{
      (p.entries||[]).forEach(e=>{
        if(!m[p.categoryId])return;
        const seats=1+(e.plusOne?1:0);
        m[p.categoryId].used+=seats;
        if(e.status==="checked_in")m[p.categoryId].checkedIn+=seats;
      });
    });
    return m;
  },[gl.categories,partyList]);

  const totals=useMemo(()=>{
    let allot=0,used=0,checkedIn=0;
    gl.categories.forEach(c=>{allot+=c.qty||0;});
    Object.values(categoryUsage).forEach(u=>{used+=u.used;checkedIn+=u.checkedIn;});
    return{allot,used,checkedIn};
  },[gl.categories,categoryUsage]);

  const logEntry=(kind,label,meta)=>({id:glNewId("act"),at:new Date().toISOString(),by,role,kind,label,meta:meta||null});
  const mutate=(kind,label,mut,meta)=>uGuestlist(glKey,cur=>{
    const base=typeof mut==="function"?mut(cur||GL_DEFAULT_SHOW()):{...(cur||GL_DEFAULT_SHOW()),...mut};
    return{...base,activity:glAppendActivity(base.activity,logEntry(kind,label,meta))};
  });
  const logOnly=(kind,label,meta)=>uGuestlist(glKey,cur=>({...cur,activity:glAppendActivity(cur?.activity,logEntry(kind,label,meta))}));

  function initShow(){
    const tpl=allTemplates.find(t=>t.id===configTplId)||glBuiltinTemplate();
    mutate("show.init",`Initialized from template "${tpl.name}"`,()=>glInitFromTemplate(tpl),{templateId:tpl.id,templateName:tpl.name});
  }
  function saveAsTemplate(){
    const name=(tplSaveName||`${show?.venue||"Show"} ${date}`).trim();
    if(!name)return;
    const tpl=glBuildTemplate(name,gl);
    setGlTemplates(p=>({...p,[tpl.id]:tpl}));
    mutate("template.save",`Saved template "${tpl.name}"`,{templateId:tpl.id},{templateId:tpl.id,templateName:tpl.name,categories:tpl.categories.length});
    setTplSaveName("");setTplMenu(false);
  }
  function applyTemplate(tplId){
    const tpl=allTemplates.find(t=>t.id===tplId);
    if(!tpl)return;
    if(partyList.length&&!confirm(`Apply template "${tpl.name}"? Existing categories will be replaced. Parties will be re-mapped.`))return;
    mutate("template.apply",`Applied template "${tpl.name}"`,cur=>glApplyTemplate(cur||glInitFromTemplate(tpl),tpl),{templateId:tpl.id,templateName:tpl.name});
    setTplMenu(false);
  }
  function deleteTemplate(tplId){
    const tpl=glTemplates[tplId];
    if(!tpl||!confirm(`Delete template "${tpl.name}"?`))return;
    setGlTemplates(p=>{const n={...p};delete n[tplId];return n;});
    logOnly("template.delete",`Deleted template "${tpl.name}"`,{templateId:tplId,templateName:tpl.name});
  }
  function updateCat(cid,patch){
    const prev=gl.categories.find(c=>c.id===cid);
    mutate("category.update",`Edited category ${prev?.name||cid}`,cur=>({...cur,categories:cur.categories.map(c=>c.id===cid?{...c,...patch}:c)}),{categoryId:cid,patch});
  }
  function addCategory(){
    const nc={id:glNewId("cat"),name:"New Category",side:"artist",zones:["FOH"],qty:2,walkOnQty:0};
    mutate("category.add",`Added category "${nc.name}"`,cur=>({...cur,categories:[...cur.categories,nc]}),{categoryId:nc.id});
  }
  function removeCategory(cid){
    const prev=gl.categories.find(c=>c.id===cid);
    mutate("category.remove",`Removed category "${prev?.name||cid}"`,cur=>({...cur,categories:cur.categories.filter(c=>c.id!==cid)}),{categoryId:cid});
  }
  function setStatus(s){
    const prev=gl.status;
    mutate("show.status",`Status: ${prev} → ${s}`,{status:s},{from:prev,to:s});
  }
  function setCutoff(v){mutate("show.cutoff",v?`Cutoff set ${v}`:"Cutoff cleared",{cutoffAt:v},{cutoffAt:v});}
  function setWalkOnCap(v){const n=parseInt(v)||0;mutate("show.walkOnCap",`Walk-on cap: ${n}`,{walkOnCap:n},{walkOnCap:n});}
  function setNotes(v){mutate("show.notes",`Notes updated`,{notes:v});}

  function createParty(){
    if(!partyForm.name.trim())return;
    const partyRole=GL_PARTY_ROLES.find(r=>r.id===partyForm.role)||GL_PARTY_ROLES[0];
    const pid=glNewId("party");
    const name=partyForm.name.trim();
    mutate("party.create",`Added party "${name}" (${partyRole.label})`,cur=>({...cur,parties:{...cur.parties,[pid]:{name,role:partyRole.id,side:partyRole.side,contact:partyForm.contact.trim(),categoryId:partyRole.defaultCategory,entries:[]}}}),{partyId:pid,partyName:name,role:partyRole.id});
    setPartyForm({name:"",role:"manager",contact:""});setAddParty(false);setExpandedParty(pid);
  }
  function updateParty(pid,patch){
    const prev=gl.parties[pid];
    mutate("party.update",`Edited party "${prev?.name||pid}"`,cur=>({...cur,parties:{...cur.parties,[pid]:{...cur.parties[pid],...patch}}}),{partyId:pid,patch});
  }
  function removeParty(pid){
    const prev=gl.parties[pid];
    mutate("party.remove",`Removed party "${prev?.name||pid}"`,cur=>{const n={...cur.parties};delete n[pid];return{...cur,parties:n};},{partyId:pid,partyName:prev?.name});
  }
  function addEntry(pid){
    const e={id:glNewId("e"),name:"",plusOne:false,note:"",status:"pending",isWalkOn:false};
    const party=gl.parties[pid];
    mutate("entry.add",`Added entry to "${party?.name||pid}"`,cur=>({...cur,parties:{...cur.parties,[pid]:{...cur.parties[pid],entries:[...(cur.parties[pid].entries||[]),e]}}}),{partyId:pid,entryId:e.id});
  }
  function updateEntry(pid,eid,patch){
    const party=gl.parties[pid];
    const prev=party?.entries?.find(e=>e.id===eid);
    const statusChanged=patch.status&&prev?.status!==patch.status;
    const nameChanged="name" in patch&&prev?.name!==patch.name;
    const kind=statusChanged?(patch.status==="checked_in"?"entry.checkin":"entry.status"):(nameChanged?"entry.rename":"entry.update");
    const label=statusChanged?`${prev?.name||"Guest"}: ${prev?.status||"pending"} → ${patch.status}`:(nameChanged?`Renamed entry "${prev?.name||""}" → "${patch.name}"`:`Edited entry "${prev?.name||eid}"`);
    mutate(kind,label,cur=>({...cur,parties:{...cur.parties,[pid]:{...cur.parties[pid],entries:cur.parties[pid].entries.map(e=>e.id===eid?{...e,...patch}:e)}}}),{partyId:pid,entryId:eid,patch});
  }
  function removeEntry(pid,eid){
    const party=gl.parties[pid];
    const prev=party?.entries?.find(e=>e.id===eid);
    mutate("entry.remove",`Removed entry "${prev?.name||eid}" from "${party?.name||pid}"`,cur=>({...cur,parties:{...cur.parties,[pid]:{...cur.parties[pid],entries:cur.parties[pid].entries.filter(e=>e.id!==eid)}}}),{partyId:pid,entryId:eid});
  }

  function exportDoorList(){
    const rows=[];
    partyList.forEach(([,p])=>{
      const cat=gl.categories.find(c=>c.id===p.categoryId);
      (p.entries||[]).forEach(e=>{
        rows.push({name:e.name,plusOne:e.plusOne,category:cat?.name||"",zones:cat?.zones?.join("/")||"",submittedBy:p.name,status:e.status,note:e.note});
        if(e.plusOne)rows.push({name:`${e.name} +1`,plusOne:false,category:cat?.name||"",zones:cat?.zones?.join("/")||"",submittedBy:p.name,status:e.status,note:""});
      });
    });
    rows.sort((a,b)=>a.name.localeCompare(b.name));
    const payload={show:show?.venue||"",city:show?.city||"",date,status:gl.status,cutoffAt:gl.cutoffAt,totals,door:rows};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`guestlist_${date}_${(show?.venue||"").replace(/\s+/g,"_")}.json`;a.click();URL.revokeObjectURL(url);
    logOnly("door.export",`Exported door list (${rows.length} rows)`,{rows:rows.length});
  }

  if(!show){
    return<div style={{flex:1,padding:mobile?"10px 8px":"14px 16px",color:"var(--text-dim)",fontSize:11}}>
      Select a show date from the sidebar to manage its guest list.
      {showDates.length>0&&<div style={{marginTop:8}}><button onClick={()=>setSel(showDates[0])} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Go to {showDates[0]}</button></div>}
    </div>;
  }

  return(
    <div style={{flex:1,overflowY:"auto",padding:mobile?"10px 8px":"14px 16px",display:"flex",flexDirection:"column",gap:14,minWidth:0,background:"var(--bg)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:"var(--text)",letterSpacing:"-0.02em"}}>{show.venue} · {show.city}</div>
          <div style={{fontSize:10,color:"var(--text-dim)",marginTop:1,fontFamily:MN}}>{new Date(date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"})}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          {glExists&&<>
            <span style={{fontSize:9,fontWeight:700,color:statusMeta.color,background:statusMeta.bg,border:`1px solid ${statusMeta.color}`,borderRadius:6,padding:"3px 8px",letterSpacing:"0.05em"}}>{statusMeta.label.toUpperCase()}</span>
            <select value={gl.status} onChange={e=>setStatus(e.target.value)} style={{background:"var(--card)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:6,padding:"4px 6px",fontSize:10}}>
              {GL_STATUS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button onClick={()=>setTplMenu(v=>!v)} style={{background:"transparent",color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:6,padding:"6px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>Templates</button>
            <button onClick={exportDoorList} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Export Door List</button>
          </>}
        </div>
      </div>

      {!glExists&&<div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"16px 16px",display:"flex",flexDirection:"column",gap:12}}>
        <div>
          <div style={{fontSize:11,fontWeight:800,color:"var(--text)",letterSpacing:"-0.01em"}}>Configure Guest List</div>
          <div style={{fontSize:10,color:"var(--text-dim)",marginTop:3}}>Pick a starting template. Categories and caps can be edited after init.</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1fr auto",gap:8,alignItems:"end"}}>
          <label style={{display:"flex",flexDirection:"column",gap:4}}>
            <span style={{fontSize:9,color:"var(--text-dim)",letterSpacing:"0.05em"}}>TEMPLATE</span>
            <select value={configTplId} onChange={e=>setConfigTplId(e.target.value)} style={{background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:6,padding:"7px 9px",fontSize:11}}>
              {allTemplates.map(t=><option key={t.id} value={t.id}>{t.name}{t.builtin?" · built-in":""} · {(t.categories||[]).length} cats</option>)}
            </select>
          </label>
          <button onClick={initShow} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"8px 14px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Initialize Show</button>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4,fontSize:9,color:"var(--text-mute)",fontFamily:MN}}>
          {(allTemplates.find(t=>t.id===configTplId)?.categories||[]).map(c=><span key={c.id} style={{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:4,padding:"2px 6px"}}>{c.name} · {c.qty}</span>)}
        </div>
      </div>}

      {glExists&&tplMenu&&<div style={{background:"var(--card)",border:"1px solid var(--accent)",borderRadius:10,padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
        <div style={{fontSize:10,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em"}}>TEMPLATES</div>
        <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"2fr 1fr",gap:8,alignItems:"end"}}>
          <label style={{display:"flex",flexDirection:"column",gap:4}}>
            <span style={{fontSize:9,color:"var(--text-dim)",letterSpacing:"0.05em"}}>SAVE CURRENT CONFIG AS TEMPLATE</span>
            <input value={tplSaveName} onChange={e=>setTplSaveName(e.target.value)} placeholder={`${show?.venue||"Show"} ${date}`} style={{background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:6,padding:"6px 8px",fontSize:11}}/>
          </label>
          <button onClick={saveAsTemplate} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"7px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Save as Template</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:200,overflowY:"auto"}}>
          {allTemplates.map(t=>{
            const active=gl.templateId===t.id;
            return<div key={t.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,alignItems:"center",background:active?"var(--accent-pill-bg)":"var(--bg)",border:`1px solid ${active?"var(--accent)":"var(--border)"}`,borderRadius:6,padding:"6px 8px"}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text)"}}>{t.name}{t.builtin&&<span style={{marginLeft:6,fontSize:8,color:"var(--link)",fontFamily:MN}}>BUILT-IN</span>}{active&&<span style={{marginLeft:6,fontSize:8,color:"var(--success-fg)",fontFamily:MN}}>ACTIVE</span>}</div>
                <div style={{fontSize:9,color:"var(--text-mute)",fontFamily:MN,marginTop:1}}>{(t.categories||[]).length} categories · walk-on cap {t.walkOnCap??10}</div>
              </div>
              <button onClick={()=>applyTemplate(t.id)} style={{background:"transparent",color:"var(--link)",border:"1px solid var(--accent)",borderRadius:4,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>Apply</button>
              {!t.builtin?<button onClick={()=>deleteTemplate(t.id)} style={{background:"transparent",color:"var(--text-mute)",border:"1px solid var(--border)",borderRadius:4,padding:"4px 8px",fontSize:10,cursor:"pointer"}}>Delete</button>:<span style={{width:38}}/>}
            </div>;
          })}
        </div>
      </div>}

      {glExists&&<>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          <GLMetric label="Allotment" value={totals.allot}/>
          <GLMetric label="Submitted" value={totals.used} sub={totals.allot?`${Math.round(totals.used/totals.allot*100)}%`:""}/>
          <GLMetric label="Checked In" value={totals.checkedIn}/>
          <GLMetric label="Remaining" value={Math.max(0,totals.allot-totals.used)}/>
        </div>

        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:10}}>
            <span style={{fontSize:10,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em"}}>SHOW CONFIG</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"repeat(3,1fr)",gap:10}}>
            <label style={{display:"flex",flexDirection:"column",gap:3}}>
              <span style={{fontSize:9,color:"var(--text-dim)",letterSpacing:"0.05em"}}>CUTOFF</span>
              <input type="datetime-local" value={gl.cutoffAt||""} onChange={e=>setCutoff(e.target.value)} style={{background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 7px",fontSize:11,fontFamily:MN}}/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:3}}>
              <span style={{fontSize:9,color:"var(--text-dim)",letterSpacing:"0.05em"}}>WALK-ON CAP</span>
              <input type="number" value={gl.walkOnCap??0} onChange={e=>setWalkOnCap(e.target.value)} style={{background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 7px",fontSize:11,fontFamily:MN}}/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:3}}>
              <span style={{fontSize:9,color:"var(--text-dim)",letterSpacing:"0.05em"}}>NOTES</span>
              <input type="text" value={gl.notes||""} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Venue hard cap 500" style={{background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 7px",fontSize:11}}/>
            </label>
          </div>
        </div>

        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:10}}>
            <span style={{fontSize:10,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em"}}>PARTIES · {partyList.length}</span>
            <button onClick={()=>setAddParty(v=>!v)} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer",fontWeight:700}}>{addParty?"Cancel":"+ Party"}</button>
          </div>
          {addParty&&<div style={{background:"var(--bg)",border:"1px solid var(--accent)",borderRadius:6,padding:10,marginBottom:10,display:"grid",gridTemplateColumns:mobile?"1fr":"2fr 1.2fr 2fr auto",gap:6,alignItems:"center"}}>
            <input autoFocus placeholder="Party name (e.g. Alex Gumuchian)" value={partyForm.name} onChange={e=>setPartyForm(f=>({...f,name:e.target.value}))} style={{background:"var(--card)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 7px",fontSize:11}}/>
            <select value={partyForm.role} onChange={e=>setPartyForm(f=>({...f,role:e.target.value}))} style={{background:"var(--card)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 7px",fontSize:11}}>
              {GL_PARTY_ROLES.map(r=><option key={r.id} value={r.id}>{r.label} ({r.side})</option>)}
            </select>
            <input placeholder="Contact email" value={partyForm.contact} onChange={e=>setPartyForm(f=>({...f,contact:e.target.value}))} style={{background:"var(--card)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 7px",fontSize:11,fontFamily:MN}}/>
            <button onClick={createParty} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Add</button>
          </div>}
          {partyList.length===0&&<div style={{fontSize:10,color:"var(--text-mute)",textAlign:"center",padding:"12px 8px"}}>No parties yet. Add a party to start collecting entries.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {partyList.map(([pid,p])=>{
              const cat=gl.categories.find(c=>c.id===p.categoryId);
              const used=(p.entries||[]).reduce((s,e)=>s+1+(e.plusOne?1:0),0);
              const expanded=expandedParty===pid;
              const sideColor=p.side==="venue"?"var(--info-fg)":"var(--accent-soft)";
              return<div key={pid} style={{background:"var(--bg)",border:`1px solid ${expanded?sideColor:"var(--border)"}`,borderRadius:6,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",cursor:"pointer"}} onClick={()=>setExpandedParty(expanded?null:pid)}>
                  <span style={{fontSize:8,fontWeight:800,color:sideColor,background:p.side==="venue"?"var(--info-bg)":"var(--accent-pill-bg)",border:`1px solid ${sideColor}`,borderRadius:4,padding:"1px 5px",letterSpacing:"0.06em"}}>{p.side.toUpperCase()}</span>
                  <span style={{fontSize:11,fontWeight:700,color:"var(--text)",flex:1}}>{p.name}</span>
                  <span style={{fontSize:10,color:"var(--text-dim)",fontFamily:MN}}>{cat?.name||"—"}</span>
                  <span style={{fontSize:10,color:used>(cat?.qty||0)?"var(--danger-fg)":"var(--text-dim)",fontFamily:MN}}>{used}/{cat?.qty||0}</span>
                  <span style={{fontSize:10,color:"var(--text-mute)"}}>{expanded?"▾":"▸"}</span>
                </div>
                {expanded&&<div style={{padding:"0 10px 10px 10px",display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid var(--border)"}}>
                  <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1.5fr 2fr auto",gap:6,alignItems:"center",marginTop:8}}>
                    <select value={p.categoryId||""} onChange={e=>updateParty(pid,{categoryId:e.target.value})} style={{background:"var(--card)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:6,padding:"4px 6px",fontSize:10}}>
                      {gl.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input value={p.contact||""} onChange={e=>updateParty(pid,{contact:e.target.value})} placeholder="contact email" style={{background:"var(--card)",color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:6,padding:"4px 6px",fontSize:10,fontFamily:MN}}/>
                    <button onClick={()=>{if(confirm(`Remove ${p.name}?`))removeParty(pid);}} style={{background:"transparent",color:"var(--danger-fg)",border:"1px solid var(--border)",borderRadius:6,padding:"4px 10px",fontSize:10,cursor:"pointer"}}>Remove party</button>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {(p.entries||[]).map(e=>{
                      const checked=e.status==="checked_in";
                      return<div key={e.id} style={{display:"grid",gridTemplateColumns:mobile?"1fr auto":"24px 2fr 60px 2fr 90px 24px",gap:6,alignItems:"center",background:checked?"var(--success-bg)":"var(--card)",border:`1px solid ${checked?"var(--success-fg)":"var(--border)"}`,borderRadius:6,padding:"5px 7px"}}>
                        <input type="checkbox" checked={checked} onChange={ev=>updateEntry(pid,e.id,{status:ev.target.checked?"checked_in":"pending",checkedInAt:ev.target.checked?new Date().toISOString():null})} style={{accentColor:"var(--success-fg)",cursor:"pointer"}}/>
                        <input value={e.name} onChange={ev=>updateEntry(pid,e.id,{name:ev.target.value})} placeholder="Guest name" style={{background:"transparent",color:"var(--text)",border:"none",fontSize:11,padding:2}}/>
                        <label style={{fontSize:10,color:"var(--text-dim)",display:"flex",alignItems:"center",gap:4,fontFamily:MN,cursor:"pointer"}}>
                          <input type="checkbox" checked={!!e.plusOne} onChange={ev=>updateEntry(pid,e.id,{plusOne:ev.target.checked})} style={{accentColor:"var(--accent)",cursor:"pointer"}}/>+1
                        </label>
                        <input value={e.note||""} onChange={ev=>updateEntry(pid,e.id,{note:ev.target.value})} placeholder="note (dietary, access, …)" style={{background:"transparent",color:"var(--text-2)",border:"none",fontSize:10,padding:2}}/>
                        <select value={e.status} onChange={ev=>updateEntry(pid,e.id,{status:ev.target.value})} style={{background:"var(--bg)",color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:4,padding:"2px 4px",fontSize:9}}>
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="checked_in">Checked In</option>
                          <option value="no_show">No Show</option>
                          <option value="denied">Denied</option>
                        </select>
                        <button onClick={()=>removeEntry(pid,e.id)} style={{background:"transparent",color:"var(--text-mute)",border:"none",fontSize:13,cursor:"pointer",padding:0}}>×</button>
                      </div>;
                    })}
                  </div>
                  <button onClick={()=>addEntry(pid)} style={{alignSelf:"flex-start",background:"transparent",color:"var(--accent-soft)",border:"1px dashed var(--accent)",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:600,cursor:"pointer"}}>+ Entry</button>
                </div>}
              </div>;
            })}
          </div>
        </div>

        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,cursor:"pointer"}} onClick={()=>setCategoriesOpen(v=>!v)}>
            <span style={{fontSize:10,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em"}}>CATEGORIES · {gl.categories.length}</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={e=>{e.stopPropagation();setCategoriesOpen(true);addCategory();}} style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-2)",cursor:"pointer"}}>+ Category</button>
              <span style={{fontSize:10,color:"var(--text-mute)"}}>{categoriesOpen?"▾":"▸"}</span>
            </div>
          </div>
          {categoriesOpen&&<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:6}}>
            {gl.categories.map(c=>{
              const u=categoryUsage[c.id]||{used:0,checkedIn:0};
              const over=u.used>c.qty;
              return<div key={c.id} style={{display:"grid",gridTemplateColumns:mobile?"1fr auto":"1.5fr 2fr 70px 70px 90px 24px",gap:6,alignItems:"center",background:"var(--bg)",border:`1px solid ${over?"var(--danger-fg)":"var(--border)"}`,borderRadius:6,padding:"6px 8px"}}>
                <input value={c.name} onChange={e=>updateCat(c.id,{name:e.target.value})} style={{background:"transparent",color:"var(--text)",border:"none",fontSize:11,fontWeight:600,padding:2}}/>
                <input value={(c.zones||[]).join(", ")} onChange={e=>updateCat(c.id,{zones:e.target.value.split(",").map(x=>x.trim()).filter(Boolean)})} placeholder="FOH, BS" style={{background:"transparent",color:"var(--text-2)",border:"none",fontSize:10,fontFamily:MN,padding:2}}/>
                <input type="number" value={c.qty} onChange={e=>updateCat(c.id,{qty:parseInt(e.target.value)||0})} style={{background:"var(--card)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,padding:"3px 5px",fontSize:10,fontFamily:MN,width:"100%"}}/>
                <input type="number" value={c.walkOnQty||0} onChange={e=>updateCat(c.id,{walkOnQty:parseInt(e.target.value)||0})} placeholder="WO" style={{background:"var(--card)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,padding:"3px 5px",fontSize:10,fontFamily:MN,width:"100%"}}/>
                <span style={{fontSize:10,fontFamily:MN,color:over?"var(--danger-fg)":"var(--text-dim)",textAlign:"right"}}>{u.used}/{c.qty} <span style={{color:"var(--text-mute)"}}>· {u.checkedIn}✓</span></span>
                <button onClick={()=>removeCategory(c.id)} style={{background:"transparent",color:"var(--text-mute)",border:"none",fontSize:13,cursor:"pointer",padding:0}}>×</button>
              </div>;
            })}
          </div>}
        </div>

        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,cursor:"pointer"}} onClick={()=>setActivityOpen(v=>!v)}>
            <span style={{fontSize:10,fontWeight:800,color:"var(--text-dim)",letterSpacing:"0.08em"}}>ACTIVITY · {(gl.activity||[]).length}</span>
            <span style={{fontSize:10,color:"var(--text-mute)"}}>{activityOpen?"▾":"▸"}</span>
          </div>
          {activityOpen&&<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:4,maxHeight:320,overflowY:"auto"}}>
            {(gl.activity||[]).length===0&&<div style={{fontSize:10,color:"var(--text-mute)",padding:"6px 2px"}}>No activity yet.</div>}
            {[...(gl.activity||[])].reverse().map(ev=>{
              const when=new Date(ev.at);
              const whenLabel=`${when.toLocaleDateString(undefined,{month:"short",day:"numeric"})} ${when.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}`;
              const kindColor=ev.kind?.startsWith("entry.checkin")?"var(--success-fg)":ev.kind?.startsWith("entry.remove")||ev.kind?.startsWith("party.remove")||ev.kind?.startsWith("category.remove")?"var(--danger-fg)":ev.kind?.startsWith("template")?"var(--link)":ev.kind?.startsWith("show.status")?"var(--warn-fg)":"var(--text-dim)";
              return<div key={ev.id} style={{display:"grid",gridTemplateColumns:mobile?"1fr":"90px 110px 1fr 110px",gap:8,alignItems:"center",background:"var(--bg)",border:"1px solid var(--card-2)",borderRadius:6,padding:"5px 8px",fontSize:10,fontFamily:MN}}>
                <span style={{color:"var(--text-mute)"}}>{whenLabel}</span>
                <span style={{color:kindColor,fontWeight:700,fontSize:9,letterSpacing:"0.04em"}}>{ev.kind}</span>
                <span style={{color:"var(--text-3)",fontFamily:"'Outfit',system-ui",fontSize:10}}>{ev.label}</span>
                <span style={{color:"var(--text-mute)",textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.by}{ev.role?` · ${ev.role}`:""}</span>
              </div>;
            })}
          </div>}
        </div>
      </>}
    </div>
  );
}

function GLMetric({label,value,sub}){
  return<div style={{flex:"1 1 120px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px",minWidth:110}}>
    <div style={{fontSize:9,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em"}}>{label.toUpperCase()}</div>
    <div style={{fontSize:20,fontWeight:800,color:"var(--text)",fontFamily:MN,lineHeight:1.1,marginTop:2}}>{value}{sub&&<span style={{fontSize:10,color:"var(--text-mute)",marginLeft:6}}>{sub}</span>}</div>
  </div>;
}

function AccessTab(){
  const{perms,uPerms,me}=useContext(Ctx);
  if(me?.id!=="davon")return<div style={{padding:40,textAlign:"center",fontSize:11,color:"var(--text-dim)"}}>Access denied.</div>;
  const cell={display:"flex",alignItems:"center",justifyContent:"center"};
  const colW=`repeat(${PERM_ROLES.length},80px)`;
  const gridCols=`1fr ${colW}`;
  const hdr={fontSize:8,fontWeight:800,letterSpacing:"0.08em",color:"var(--text-dim)",padding:"8px 16px",textTransform:"uppercase"};
  const resetAll=()=>{
    const fresh={};
    PERM_SCHEMA.forEach(s=>s.items.forEach(item=>{
      fresh[item.id]={};PERM_ROLES.forEach(r=>{fresh[item.id][r.id]=true;});
    }));
    PERM_ROLES.forEach(r=>{
      PERM_SCHEMA.forEach(s=>s.items.forEach(item=>{uPerms(item.id,r.id,true);}));
    });
  };
  return(
    <div style={{padding:"16px 20px",maxWidth:800}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <span style={{fontSize:13,fontWeight:800,color:"var(--text)"}}>Access Control</span>
        <span style={{fontSize:9,color:"var(--text-dim)"}}>Permissions apply to all non-admin users on next load.</span>
        <button onClick={resetAll} style={{marginLeft:"auto",fontSize:9,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:"var(--text-dim)",cursor:"pointer"}}>Reset All</button>
      </div>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
        {/* Column header */}
        <div style={{display:"grid",gridTemplateColumns:gridCols,borderBottom:"1px solid var(--border)",background:"var(--card-2)"}}>
          <div style={hdr}>Permission</div>
          {PERM_ROLES.map(r=>(
            <div key={r.id} style={{...hdr,...cell,textAlign:"center",borderLeft:"1px solid var(--border)"}}>
              {r.label}
              {r.id==="tm_td"&&<span style={{marginLeft:4,fontSize:7,color:"var(--accent)"}}>admin</span>}
            </div>
          ))}
        </div>
        {PERM_SCHEMA.map((section,si)=>(
          <React.Fragment key={section.section}>
            <div style={{display:"grid",gridTemplateColumns:gridCols,background:"var(--card-3)",borderTop:si>0?"1px solid var(--border)":undefined}}>
              <div style={{...hdr,color:"var(--text-mute)",paddingTop:6,paddingBottom:6}}>{section.section}</div>
              {PERM_ROLES.map(r=><div key={r.id} style={{borderLeft:"1px solid var(--border)"}}/>)}
            </div>
            {section.items.map((item,ii)=>{
              const isLast=ii===section.items.length-1;
              return(
                <div key={item.id} style={{display:"grid",gridTemplateColumns:gridCols,borderTop:"1px solid var(--card-3)",borderBottom:isLast?"1px solid var(--border)":undefined}}>
                  <div style={{padding:"8px 16px",fontSize:11,color:"var(--text-2)"}}>{item.label}</div>
                  {PERM_ROLES.map(r=>{
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
    </div>
  );
}
