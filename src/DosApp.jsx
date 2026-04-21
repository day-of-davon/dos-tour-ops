import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { useAuth } from "./components/AuthGate.jsx";
import { supabase } from "./lib/supabase";

// DOS TOUR OPS v7.0 — Day of Show, LLC
// Client-first · All dept advance lanes · Custom + editable items · Full settlement

const SK={SHOWS:"dos-v7-shows",ROS:"dos-v7-ros",ADVANCES:"dos-v7-advances",FINANCE:"dos-v7-finance",SETTINGS:"dos-v7-settings",CREW:"dos-v7-crew",PRODUCTION:"dos-v7-production",FLIGHTS:"dos-v7-flights",LODGING:"dos-v7-lodging"};
const hhmmToMin=s=>{if(!s)return null;const[h,m]=s.split(":").map(Number);return isNaN(h)||isNaN(m)?null:h*60+m;};
// Group same-day flight legs by itinerary (confirmNo / bookingRef / pax signature) and tag
// each with role: final leg of a multi-leg chain = "arr", all prior legs = "dep". Single-leg
// groups stay "dep". Overnight arrivals (arrs) are always "arr".
const flightItinKey=f=>f.confirmNo||f.bookingRef||((f.pax||[]).slice().sort().join("|")||f.id);
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
  air:   {label:"Flight",  icon:"✈", color:"#1E40AF", bg:"#DBEAFE", border:"#BFDBFE"},
  ground:{label:"Ground",  icon:"🚗", color:"#B45309", bg:"#FEF3C7", border:"#FDE68A"},
  bus:   {label:"Bus",     icon:"🚌", color:"#1D4ED8", bg:"#DBEAFE", border:"#BFDBFE"},
  rail:  {label:"Rail",    icon:"🚆", color:"#065F46", bg:"#D1FAE5", border:"#6EE7B7"},
  sea:   {label:"Sea",     icon:"⛴", color:"#0E7490", bg:"#CFFAFE", border:"#67E8F9"},
  hotel: {label:"Hotel",   icon:"🏨", color:"#5B21B6", bg:"#EDE9FE", border:"#C4B5FD"},
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
  {id:"bbn",name:"bbno$",type:"artist",status:"active",color:"#5B21B6",short:"BBN"},
  {id:"wkn",name:"Wakaan",type:"festival",status:"active",color:"#065F46",short:"WKN"},
  {id:"bwc",name:"Beyond Wonderland",type:"festival",status:"active",color:"#1E40AF",short:"BWC"},
  {id:"elm",name:"Elements",type:"festival",status:"active",color:"#92400E",short:"ELM"},
];
const CM=CLIENTS.reduce((a,c)=>{a[c.id]=c;return a},{});
// Only these users can see festival clients in the selector
const FESTIVAL_ACCESS_EMAILS=["d.johnson@dayofshow.net","olivia@dayofshow.net"];
const ROLES=[{id:"tm",label:"TM",c:"#5B21B6"},{id:"production",label:"PROD",c:"#92400E"},{id:"hospitality",label:"HOSPO",c:"#065F46"},{id:"transport",label:"TRANSPORT",c:"#1E40AF"}];
const TABS=[{id:"advance",label:"Advance",icon:"◎"},{id:"ros",label:"Schedule",icon:"▦"},{id:"transport",label:"Transport",icon:"◈"},{id:"finance",label:"Finance",icon:"◐"},{id:"crew",label:"Crew",icon:"◇"},{id:"lodging",label:"Lodging",icon:"⌂"},{id:"production",label:"Production",icon:"▤"}];
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
  expandPanel:{background:"#faf9f6",borderLeft:"3px solid #5B21B6",padding:"10px 14px 12px"},
  expandBtn:(open,accent="#5B21B6")=>({background:open?"#0f172a":accent,border:"none",borderRadius:6,color:"#fff",fontSize:10,padding:"4px 11px",cursor:"pointer",fontWeight:700}),
  sectionLabel:{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6},
  input:{background:"#fff",border:"1px solid #d6d3cd",borderRadius:5,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:"'Outfit',system-ui"},
};

const DEPTS=[
  {id:"all",label:"All",color:"#475569",bg:"#f1f5f9"},
  {id:"artist_team",label:"Artist Team",color:"#5B21B6",bg:"#EDE9FE"},
  {id:"venue",label:"Venue / Promoter",color:"#065F46",bg:"#D1FAE5"},
  {id:"ar_hospo",label:"AR / Hospo",color:"#047857",bg:"#ECFDF5"},
  {id:"transport",label:"Transport",color:"#1E40AF",bg:"#DBEAFE"},
  {id:"production",label:"Production",color:"#B45309",bg:"#FEF3C7"},
  {id:"vendors",label:"Vendors",color:"#7C3AED",bg:"#F5F3FF"},
  {id:"site_ops",label:"Site Ops",color:"#0E7490",bg:"#ECFEFF"},
  {id:"quartermaster",label:"Quartermaster",color:"#64748b",bg:"#f8fafc"},
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
  pending:{l:"Pending",c:"#64748b",b:"#f1f5f9"},
  sent:{l:"Sent",c:"#334155",b:"#e2e8f0"},
  received:{l:"Received",c:"#334155",b:"#e2e8f0"},
  in_progress:{l:"In Progress",c:"#1E40AF",b:"#DBEAFE"},
  respond:{l:"Respond",c:"#92400E",b:"#FEF3C7"},
  follow_up:{l:"Follow Up",c:"#92400E",b:"#FEF3C7"},
  escalate:{l:"Escalate",c:"#B91C1C",b:"#FEE2E2"},
  confirmed:{l:"Confirmed",c:"#047857",b:"#D1FAE5"},
  na:{l:"N/A",c:"#94a3b8",b:"#f5f5f4"},
  // Back-compat
  responded:{l:"In Progress",c:"#1E40AF",b:"#DBEAFE"},
};
const TEAM_MEMBERS=[
  {id:"davon",label:"Davon",initials:"DJ"},
  {id:"olivia",label:"Olivia",initials:"OM"},
];
const SC_CYCLE=["pending","in_progress","confirmed"];
const SC_ORDER=["pending","in_progress","sent","received","respond","follow_up","escalate","confirmed","na"];
const PRE_STAGES=[{id:"contract_received",l:"Contract Received"},{id:"estimate_received",l:"Pre-Show Estimate"},{id:"guarantee_confirmed",l:"Guarantee Confirmed"}];
const POST_STAGES=[{id:"expenses_reviewed",l:"Expenses Reviewed"},{id:"disputes_resolved",l:"Disputes Resolved"},{id:"payment_initiated",l:"Payment Initiated"},{id:"wire_ref_confirmed",l:"Wire Ref # Confirmed",req:true},{id:"signed_sheet",l:"Signed Sheet Received",req:true}];

const toM=(h,m=0)=>h*60+m;
const fmt=mins=>{if(mins==null)return"--";const n=((mins%1440)+1440)%1440,h=Math.floor(n/60),m=n%60,p=h>=12?"p":"a",h12=h===0?12:h>12?h-12:h;return`${h12}:${String(m).padStart(2,"0")}${p}`;};
const pM=str=>{if(!str)return null;const m=str.match(/^(\d{1,2}):(\d{2})\s*(a|p|am|pm)?$/i);if(!m)return null;let h=parseInt(m[1]);const mi=parseInt(m[2]),pe=(m[3]||"a").toLowerCase();if(pe.startsWith("p")&&h<12)h+=12;if(pe.startsWith("a")&&h===12)h=0;return h*60+mi;};
const dU=d=>Math.ceil((new Date(d+"T12:00:00")-new Date())/86400000);
const fD=d=>new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});
const fW=d=>new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"});
const fFull=d=>new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
const sG=async k=>{try{const r=await window.storage.get(k);return r?JSON.parse(r.value):null}catch{return null}};
const sS=async(k,v)=>{try{await window.storage.set(k,JSON.stringify(v));return true}catch{return false}};

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
  {id:"bus_arrive",label:"BUS ARRIVES",duration:0,phase:"bus_in",type:"bus",color:"#1D4ED8",roles:["tm","transport"],note:"32A 3-phase power",isAnchor:true,anchorKey:"busArrive"},
  {id:"venue_access",label:"Venue Access",duration:0,phase:"pre",type:"access",color:"#475569",roles:["tm","production"],note:"Per advance",isAnchor:true,anchorKey:"venueAccess"},
  {id:"crew_call",label:"CREW CALL",duration:0,phase:"pre",type:"crew",color:"#92400E",roles:["tm","production"],note:"Local + tour crew",isAnchor:true,anchorKey:"crewCall"},
  {id:"loadin",label:"Load In",duration:240,phase:"pre",type:"setup",color:"#B45309",roles:["tm","production"],note:"FOH, mons, LD, LED, lasers, merch"},
  {id:"sc_bbno",label:"SC: bbno$",duration:60,phase:"pre",type:"soundcheck",color:"#6D28D9",roles:["tm","production"],note:"Full band check"},
  {id:"sc_jb",label:"SC: Jungle Bobby",duration:30,phase:"pre",type:"soundcheck",color:"#7C3AED",roles:["tm","production"],note:"Support act"},
  {id:"security",label:"Security Meeting",duration:30,phase:"pre",type:"meeting",color:"#B91C1C",roles:["tm"],note:"Barricade, pit, artist security"},
  {id:"mg_checkin",label:"M&G Check In",duration:30,phase:"mg",type:"mg",color:"#047857",roles:["tm","hospitality"],note:"Always before M&G."},
  {id:"mg",label:"Meet & Greet",duration:120,phase:"mg",type:"mg",color:"#065F46",roles:["tm","hospitality"],note:"Fan experience",isAnchor:true,anchorKey:"mgTime"},
  {id:"doors_early",label:"Doors: Early Entry",duration:30,phase:"doors",type:"doors",color:"#15803D",roles:["tm","hospitality"],note:"VIP / early entry"},
  {id:"doors_ga",label:"Doors: GA",duration:0,phase:"doors",type:"doors",color:"#166534",roles:["tm","hospitality"],note:"General admission",isAnchor:true,anchorKey:"doors"},
  {id:"bishu",label:"Bishu DJ Set",duration:15,phase:"show",type:"performance",color:"#6D28D9",roles:["tm","production"],note:"Opening DJ"},
  {id:"jungle_bobby",label:"Jungle Bobby",duration:30,phase:"show",type:"performance",color:"#5B21B6",roles:["tm","production"],note:"Support set"},
  {id:"changeover",label:"Changeover",duration:15,phase:"show",type:"changeover",color:"#475569",roles:["tm","production"],note:"Stage flip"},
  {id:"bbno_set",label:"bbno$ HEADLINE SET",duration:105,phase:"show",type:"headline",color:"#B91C1C",roles:["tm","production"],note:"Internet Explorer Tour"},
  {id:"curfew",label:"CURFEW",duration:0,phase:"curfew",type:"curfew",color:"#7F1D1D",roles:["tm"],note:"House lights",isAnchor:true,anchorKey:"curfew"},
  {id:"crew_cb",label:"Crew Call Back",duration:0,phase:"post",type:"crew",color:"#92400E",roles:["tm","production"],note:"30min before set ends",offsetRef:"bbno_set_end",offsetMin:-30},
  {id:"loadout",label:"Load Out",duration:120,phase:"post",type:"setup",color:"#78350F",roles:["tm","production"],note:"Gear to truck/trailer"},
  {id:"settlement",label:"Settlement",duration:60,phase:"post",type:"business",color:"#854D0E",roles:["tm"],note:"30min after headline ends",offsetRef:"bbno_set_end",offsetMin:30},
  {id:"showers",label:"Showers / Wind Down",duration:45,phase:"post",type:"crew",color:"#475569",roles:["tm","transport"]},
  {id:"clear",label:"Clear Venue",duration:30,phase:"post",type:"bus",color:"#334155",roles:["tm","transport"],note:"Final walk, bus loaded"},
  {id:"bus_depart",label:"BUS DEPARTS",duration:0,phase:"post",type:"bus",color:"#1D4ED8",roles:["tm","transport"],note:"Next city. Crew sleeps."},
];

const RRX_ROS=()=>[
  {id:"bus_arrive",label:"BUS ARRIVES",duration:0,phase:"bus_in",type:"bus",color:"#1D4ED8",roles:["tm","transport"],note:"Red Rocks loading dock",isAnchor:true,anchorKey:"busArrive"},
  {id:"venue_access",label:"Venue Access",duration:0,phase:"pre",type:"access",color:"#475569",roles:["tm","production"],note:"Per AEG advance",isAnchor:true,anchorKey:"venueAccess"},
  {id:"crew_call",label:"CREW CALL",duration:0,phase:"pre",type:"crew",color:"#92400E",roles:["tm","production"],note:"BNP + tour crew",isAnchor:true,anchorKey:"crewCall"},
  {id:"loadin",label:"Load In",duration:240,phase:"pre",type:"setup",color:"#B45309",roles:["tm","production"],note:"BNP: audio, video, lighting"},
  {id:"programming",label:"Programming",duration:90,phase:"pre",type:"setup",color:"#0E7490",roles:["tm","production"],note:"LX, VX, Laser. MA3, Depense R4."},
  {id:"sc_bbno",label:"SC: bbno$",duration:60,phase:"pre",type:"soundcheck",color:"#6D28D9",roles:["tm","production"]},
  {id:"sc_ot",label:"SC: Oliver Tree",duration:45,phase:"pre",type:"soundcheck",color:"#7C3AED",roles:["tm","production"]},
  {id:"sc_kaarijaa",label:"SC: Käärijä",duration:30,phase:"pre",type:"soundcheck",color:"#8B5CF6",roles:["tm","production"]},
  {id:"sc_yngmartyr",label:"SC: YNG Martyr",duration:25,phase:"pre",type:"soundcheck",color:"#9333EA",roles:["tm","production"]},
  {id:"sc_jb",label:"SC: Jungle Bobby",duration:20,phase:"pre",type:"soundcheck",color:"#A855F7",roles:["tm","production"]},
  {id:"security",label:"Security Meeting",duration:30,phase:"pre",type:"meeting",color:"#B91C1C",roles:["tm"]},
  {id:"mg_checkin",label:"M&G Check In",duration:30,phase:"mg",type:"mg",color:"#047857",roles:["tm","hospitality"]},
  {id:"mg",label:"Meet & Greet",duration:120,phase:"mg",type:"mg",color:"#065F46",roles:["tm","hospitality"],isAnchor:true,anchorKey:"mgTime"},
  {id:"doors_early",label:"Doors: Early Entry",duration:30,phase:"doors",type:"doors",color:"#15803D",roles:["tm","hospitality"]},
  {id:"doors_ga",label:"Doors",duration:0,phase:"doors",type:"doors",color:"#166534",roles:["tm","hospitality"],isAnchor:true,anchorKey:"doors"},
  {id:"jungle_bobby_s",label:"Jungle Bobby",duration:30,phase:"show",type:"performance",color:"#5B21B6",roles:["tm","production"]},
  {id:"co1",label:"Changeover 1",duration:5,phase:"show",type:"changeover",color:"#475569",roles:["tm","production"]},
  {id:"yng_martyr",label:"YNG Martyr",duration:40,phase:"show",type:"performance",color:"#6D28D9",roles:["tm","production"]},
  {id:"co2",label:"Changeover 2",duration:5,phase:"show",type:"changeover",color:"#475569",roles:["tm","production"]},
  {id:"kaarijaa_set",label:"Käärijä",duration:50,phase:"show",type:"performance",color:"#7C3AED",roles:["tm","production"]},
  {id:"co3",label:"Changeover 3",duration:5,phase:"show",type:"changeover",color:"#475569",roles:["tm","production"]},
  {id:"oliver_tree",label:"Oliver Tree",duration:50,phase:"show",type:"performance",color:"#8B5CF6",roles:["tm","production"]},
  {id:"co4",label:"Changeover 4",duration:10,phase:"show",type:"changeover",color:"#475569",roles:["tm","production"]},
  {id:"bbno_set",label:"bbno$ HEADLINE SET",duration:105,phase:"show",type:"headline",color:"#B91C1C",roles:["tm","production"]},
  {id:"curfew",label:"CURFEW (HARD)",duration:0,phase:"curfew",type:"curfew",color:"#7F1D1D",roles:["tm"],isAnchor:true,anchorKey:"curfew"},
  {id:"crew_cb",label:"Crew Call Back",duration:0,phase:"post",type:"crew",color:"#92400E",roles:["tm","production"],offsetRef:"bbno_set_end",offsetMin:-30},
  {id:"loadout",label:"Load Out",duration:120,phase:"post",type:"setup",color:"#78350F",roles:["tm","production"]},
  {id:"settlement",label:"Settlement",duration:60,phase:"post",type:"business",color:"#854D0E",roles:["tm"],offsetRef:"bbno_set_end",offsetMin:30},
  {id:"showers",label:"Showers / Wind Down",duration:45,phase:"post",type:"crew",color:"#475569",roles:["tm","transport"]},
  {id:"clear",label:"Clear Venue",duration:30,phase:"post",type:"bus",color:"#334155",roles:["tm","transport"]},
  {id:"bus_depart",label:"BUS DEPARTS",duration:0,phase:"post",type:"bus",color:"#1D4ED8",roles:["tm","transport"]},
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
      {id:"worcester",label:"Worcester Show",location:"Worcester, MA",event:"WPI — Pretty Polly",type:"show",color:"#047857",bg:"#D1FAE5",crew:["ag","jb","mse","tip","ac","rm"],note:"Performing crew. Advance past due."},
      {id:"eu_prog",label:"EU Programming",location:"En Route / Europe",event:"Pre-tour advance + logistics",type:"travel",color:"#1E40AF",bg:"#DBEAFE",crew:["dj","ms","dn"],note:"TM + PM advance work ahead of Dublin Day 1."}
    ]
  }
};

const Ctx=createContext(null);

function useMobile(bp=640){
  const[m,setM]=useState(typeof window!=="undefined"&&window.innerWidth<=bp);
  useEffect(()=>{const h=()=>setM(window.innerWidth<=bp);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[bp]);
  return m;
}

const PK={NOTES_PRIV:"dos-v7-notes-private",CHECKLIST_PRIV:"dos-v7-checklist-private",INTEL:"dos-v7-intel"};
const showIdFor=(s)=>`${s.venue}__${s.date}`.toLowerCase().replace(/\s+/g,"_");
const gmailUrl=(tid)=>`https://mail.google.com/mail/u/0/#all/${tid}`;
const STOP=new Set(["the","a","an","of","to","for","and","or","is","on","in","with","your","we","please","be","at","by","from","are","this","that"]);
const tokens=(s)=>(String(s||"").toLowerCase().match(/[a-z0-9]{3,}/g)||[]).filter(w=>!STOP.has(w));
function matchScore(itemText,thread){
  const a=new Set(tokens(itemText));const b=new Set([...tokens(thread.subject),...tokens(thread.from)]);
  if(!a.size||!b.size)return 0;let hit=0;a.forEach(w=>{if(b.has(w))hit++;});
  return hit/Math.min(a.size,b.size);
}
const confOf=(s)=>s>=0.6?"high":s>=0.35?"medium":s>=0.18?"low":null;
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
const sGP=async k=>{try{const r=await window.storage.getPrivate(k);return r?JSON.parse(r.value):null}catch{return null}};
const sSP=async(k,v)=>{try{await window.storage.setPrivate(k,JSON.stringify(v));return true}catch{return false}};

export default function App(){
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
  const[refreshing,setRefreshing]=useState(null);
  const[crew,setCrew]=useState(DEFAULT_CREW);
  const[showCrew,setShowCrew]=useState({});
  const[production,setProduction]=useState({});
  const[tabOrder,setTabOrder]=useState(null);
  const[flights,setFlights]=useState({});
  const[lodging,setLodging]=useState({});
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
  const mobile=useMobile();
  const st=useRef(null);const stp=useRef(null);

  useEffect(()=>{(async()=>{
    const[s,r,a,f,se,cr,pr,fl,lo]=await Promise.all([sG(SK.SHOWS),sG(SK.ROS),sG(SK.ADVANCES),sG(SK.FINANCE),sG(SK.SETTINGS),sG(SK.CREW),sG(SK.PRODUCTION),sG(SK.FLIGHTS),sG(SK.LODGING)]);
    const init=ALL_SHOWS.reduce((acc,sh)=>{acc[sh.date]={...sh,doorsConfirmed:false,curfewConfirmed:false,busArriveConfirmed:false,crewCallConfirmed:false,venueAccessConfirmed:false,mgTimeConfirmed:false,etaSource:"schedule",lastModified:Date.now()};return acc;},{});
    const merged={...init};if(s)Object.keys(s).forEach(k=>{if(merged[k])merged[k]={...merged[k],...s[k]};});
    setShows(merged);setRos(r||{});setAdvances(a||{});setFinance(f||{});
    if(se?.role)setRole(se.role);if(se?.tab&&se.tab!=="dashboard")setTab(se.tab);if(se?.sel)setSel(se.sel);if(se?.aC)setAC(se.aC);
    if(Array.isArray(se?.tabOrder))setTabOrder(se.tabOrder);
    if(se?.showOffDays!==undefined)setShowOffDays(se.showOffDays);
    if(se?.sidebarOpen!==undefined)setSidebarOpen(se.sidebarOpen);
    if(cr?.crew)setCrew(cr.crew);if(cr?.showCrew)setShowCrew(cr.showCrew);
    setProduction(pr||{});setFlights(fl||{});setLodging(lo||{});
    const[np,cp,it]=await Promise.all([sGP(PK.NOTES_PRIV),sGP(PK.CHECKLIST_PRIV),sGP(PK.INTEL)]);
    setNotesPriv(np||{});setCheckPriv(cp||{});setIntel(it||{});
    setLoaded(true);
  })()},[]);

  useEffect(()=>{if(!loaded)return;if(stp.current)clearTimeout(stp.current);stp.current=setTimeout(()=>{sSP(PK.NOTES_PRIV,notesPriv);sSP(PK.CHECKLIST_PRIV,checkPriv);sSP(PK.INTEL,intel);},600);},[notesPriv,checkPriv,intel,loaded]);
  const uNotesPriv=useCallback((d,arr)=>setNotesPriv(p=>({...p,[d]:arr})),[]);
  const uCheckPriv=useCallback((d,arr)=>setCheckPriv(p=>({...p,[d]:arr})),[]);

  useEffect(()=>{if(!undoToast)return;const t=setTimeout(()=>setUndoToast(null),30000);return()=>clearTimeout(t);},[undoToast]);
  const pushUndo=useCallback((label,undo)=>setUndoToast({label,undo,ts:Date.now()}),[]);

  const refreshIntel=useCallback(async(show,force=false)=>{
    if(refreshing)return;
    const sid=showIdFor(show);
    setRefreshing(sid);setRefreshMsg(`Scanning Gmail for ${show.venue}…`);
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){setRefreshMsg("No active session");return;}
      const googleToken=session.provider_token;
      if(!googleToken){setRefreshMsg("Gmail token missing — sign out and back in");return;}
      const resp=await fetch("/api/intel",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({show,googleToken,forceRefresh:force,userEmail:session.user?.email})});
      if(!resp.ok){const err=await resp.json().catch(()=>({}));setRefreshMsg(err.error==="gmail_token_expired"?"Gmail token expired — re-sign in":`Error: ${resp.status}`);return;}
      const data=await resp.json();const ni=data.intel;
      if(!ni||!ni.threads){
        const hint=data.debug?.stopReason==="max_tokens"?" (response truncated — too many threads)":data.debug?.rawText?` — raw: ${data.debug.rawText.slice(0,120)}`:"";
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
        const newTodos=(ni.followUps||[]).map(f=>({id:`t${Date.now()}_${Math.random().toString(36).slice(2,7)}`,text:f.action,owner:f.owner,priority:f.priority,deadline:f.deadline,threadTid:null,done:false,ts:Date.now()}));
        const existingTexts=new Set((existing.todos||[]).map(t=>t.text));
        const todos=[...(existing.todos||[]),...newTodos.filter(t=>!existingTexts.has(t.text))];
        return{...p,[sid]:{threads,followUps:ni.followUps||[],showContacts:contacts,schedule:ni.schedule||existing.schedule||[],todos,matches:existing.matches||[],dismissedFlags:existing.dismissedFlags||[],lastRefreshed:new Date().toISOString(),isShared:data.isShared||false,sharedByOthers:data.sharedByOthers||[]}};
      });
      setRefreshMsg(`${show.venue}: ${data.gmailThreadsFound||0} threads`);
      setTimeout(()=>setRefreshMsg(""),3500);
    }catch(e){setRefreshMsg(`Refresh failed: ${e.message}`);}
    finally{setRefreshing(null);}
  },[refreshing]);

  const toggleIntelShare=useCallback(async(show,share)=>{
    const sid=showIdFor(show);
    const{data:{session}}=await supabase.auth.getSession();
    if(!session)return;
    await fetch("/api/intel",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:"toggleShare",show,isShared:share})});
    setIntel(p=>({...p,[sid]:{...(p[sid]||{}),isShared:share}}));
  },[]);

  const save=useCallback(()=>{
    if(!loaded)return;if(st.current)clearTimeout(st.current);
    st.current=setTimeout(async()=>{setSs("saving");await Promise.all([sS(SK.SHOWS,shows),sS(SK.ROS,ros),sS(SK.ADVANCES,advances),sS(SK.FINANCE,finance),sS(SK.SETTINGS,{role,tab,sel,aC,tabOrder,showOffDays,sidebarOpen}),sS(SK.CREW,{crew,showCrew}),sS(SK.PRODUCTION,production),sS(SK.FLIGHTS,flights),sS(SK.LODGING,lodging)]);setSs("saved");setTimeout(()=>setSs(""),1500);},600);
  },[loaded,shows,ros,advances,finance,role,tab,sel,aC,crew,showCrew,production,flights,lodging,showOffDays,sidebarOpen]);
  useEffect(()=>{save();},[shows,ros,advances,finance,role,tab,sel,aC,crew,showCrew,production,tabOrder,flights,lodging,showOffDays,sidebarOpen]);
  useEffect(()=>{const h=e=>{if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setCmd(v=>!v);}if(e.key==="Escape")setCmd(false);};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[]);

  const uShow=useCallback((d,u)=>setShows(p=>({...p,[d]:{...p[d],...u,lastModified:Date.now()}})),[]);
  const uRos=useCallback((d,b)=>setRos(p=>{const n={...p};if(b)n[d]=b;else delete n[d];return n;}),[]);
  const uAdv=useCallback((d,u)=>setAdvances(p=>({...p,[d]:{...(p[d]||{}),...u}})),[]);
  const uFin=useCallback((d,u)=>setFinance(p=>({...p,[d]:{...(p[d]||{}),...u}})),[]);
  const uProd=useCallback((d,u)=>setProduction(p=>({...p,[d]:{...(p[d]||{}),...u}})),[]);
  const uFlight=useCallback((id,seg)=>setFlights(p=>{if(!seg){const n={...p};delete n[id];return n;}return{...p,[id]:seg};}),[]);
  const uLodging=useCallback((id,data)=>setLodging(p=>{if(!data){const n={...p};delete n[id];return n;}return{...p,[id]:data};}),[]);
  const gRos=useCallback(d=>{if(ros[d])return ros[d];if(CUSTOM_ROS_MAP[d])return CUSTOM_ROS_MAP[d]();const sh=shows?.[d];if(sh?.type==="off"||sh?.type==="travel")return [];return DEFAULT_ROS();},[ros,shows]);
  const sorted=useMemo(()=>shows?Object.values(shows).sort((a,b)=>a.date.localeCompare(b.date)):[], [shows]);
  const next=useMemo(()=>{const t=new Date().toISOString().slice(0,10);return sorted.find(s=>s.date>=t)||sorted[0];},[sorted]);
  const cShows=useMemo(()=>sorted.filter(s=>s.clientId===aC),[sorted,aC]);

  // Tour days: real shows + synthesized travel/off/split days for Apr 16–May 31 window.
  // Keyed by ISO date. Real shows win; synthetic fill for bus moves + off days.
  const tourDays=useMemo(()=>{
    const m={};
    (sorted||[]).forEach(s=>{
      m[s.date]={date:s.date,type:s.type||"show",show:s,bus:BUS_DATA_MAP[s.date]||null,split:SPLIT_DAYS[s.date]||null,synthetic:false,city:s.city,venue:s.venue,clientId:s.clientId};
    });
    const end=new Date('2026-05-31T12:00:00');
    for(let d=new Date('2026-04-16T12:00:00');d<=end;d.setDate(d.getDate()+1)){
      const iso=d.toISOString().slice(0,10);
      const bus=BUS_DATA_MAP[iso]||null;
      const split=SPLIT_DAYS[iso]||null;
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
  },[sorted]);
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

  if(!loaded||!shows)return(<div style={{background:"#F5F3EF",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',system-ui"}}><div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,color:"#0f172a",letterSpacing:"-0.03em"}}>DOS</div><div style={{fontSize:10,color:"#64748b",marginTop:3,fontFamily:MN}}>v7.0 loading...</div></div></div>);

  return(
    <Ctx.Provider value={{shows,uShow,ros,uRos,gRos,advances,uAdv,finance,uFin,sel,setSel,role,setRole,tab,setTab,sorted,cShows,next,setCmd,aC,setAC,notesPriv,uNotesPriv,checkPriv,uCheckPriv,mobile,setExp,intel,setIntel,refreshIntel,toggleIntelShare,refreshing,refreshMsg,pushUndo,undoToast,setUndoToast,crew,setCrew,showCrew,setShowCrew,dateMenu,setDateMenu,production,uProd,tourDays,tourDaysSorted,orderedTabs,reorderTabs,selEventId,setSelEventId,flights,uFlight,uploadOpen,setUploadOpen,lodging,uLodging,showOffDays,setShowOffDays,sidebarOpen,setSidebarOpen}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body,#root{width:100%;max-width:100vw;overflow-x:hidden}.br,.rh{min-width:0}.br>div,.rh>div{min-width:0;overflow:hidden;text-overflow:ellipsis}body{background:#F5F3EF}img,svg,video{max-width:100%;height:auto}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:3px}@keyframes fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}.fi{animation:fi .18s ease forwards}.br:hover{background:#f0ede8!important}.rh:hover{background:#f8f7f5!important}`}</style>
      <div style={{fontFamily:"'Outfit',system-ui",background:"#F5F3EF",color:"#0f172a",minHeight:"100vh",width:"100%",maxWidth:"100vw",overflowX:"hidden",display:"flex",flexDirection:"column"}}>
        <TopBar ss={ss}/>
        <div style={{flex:1,display:"flex",flexDirection:"row",minWidth:0,width:"100%",maxWidth:900,overflowX:"hidden"}}>
          <NavSidebar/>
          <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflowX:"hidden"}}>
            {tab==="advance"&&<AdvTab/>}{tab==="ros"&&<ScheduleTab/>}{tab==="transport"&&<TransTab/>}{tab==="finance"&&<FinTab/>}{tab==="crew"&&<CrewTab/>}{tab==="lodging"&&<LodgingTab/>}{tab==="production"&&<ProdTab/>}
          </div>
        </div>
        {cmd&&<CmdP/>}
        {exp&&<ExportModal onClose={()=>setExp(false)}/>}
        {dateMenu&&<DateDrawer onClose={()=>setDateMenu(false)}/>}
        {uploadOpen&&<FileUploadModal onClose={()=>setUploadOpen(false)}/>}
        {undoToast&&<div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:"#0f172a",color:"#fff",borderRadius:8,padding:"8px 14px",display:"flex",alignItems:"center",gap:10,fontSize:11,boxShadow:"0 8px 24px rgba(0,0,0,.2)",zIndex:90}}>
          <span>{undoToast.label}</span>
          <button onClick={()=>{undoToast.undo();setUndoToast(null);}} style={{background:"#5B21B6",border:"none",borderRadius:5,color:"#fff",fontSize:10,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>Undo</button>
          <button onClick={()=>setUndoToast(null)} style={{background:"none",border:"none",color:"#94a3b8",fontSize:14,cursor:"pointer"}}>×</button>
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
    <div onClick={e=>e.stopPropagation()} style={{width:520,maxWidth:"100%",background:"#fff",borderRadius:12,border:"1px solid #d6d3cd",padding:18,fontFamily:"'Outfit',system-ui"}}>
      <div style={{display:"flex",gap:4,marginBottom:10}}>
        {["export","import"].map(m=><button key={m} onClick={()=>setMode(m)} style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:6,border:"none",background:mode===m?"#5B21B6":"#f5f3ef",color:mode===m?"#fff":"#64748b",cursor:"pointer"}}>{m.toUpperCase()}</button>)}
        <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"#64748b",fontSize:16}}>×</button>
      </div>
      {mode==="export"?(<><div style={{fontSize:11,color:"#64748b",marginBottom:6}}>Shared snapshot (shows, ROS, advances, finance, settings).</div>
        <pre style={{background:"#f5f3ef",padding:10,borderRadius:6,fontSize:9,fontFamily:MN,maxHeight:300,overflow:"auto"}}>{JSON.stringify(snapshot,null,2).slice(0,4000)}{JSON.stringify(snapshot).length>4000&&"\n…"}</pre>
        <button onClick={dl} style={{marginTop:8,background:"#5B21B6",border:"none",borderRadius:6,color:"#fff",fontSize:11,padding:"6px 14px",cursor:"pointer",fontWeight:700}}>Download JSON</button></>):(
        <><div style={{fontSize:11,color:"#64748b",marginBottom:6}}>Paste JSON to restore shared state.</div>
          <textarea value={txt} onChange={e=>setTxt(e.target.value)} placeholder="{...}" rows={10} style={{width:"100%",fontFamily:MN,fontSize:9,padding:8,border:"1px solid #d6d3cd",borderRadius:6,resize:"vertical"}}/>
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}>
            <button onClick={imp} disabled={!txt.trim()} style={{background:"#5B21B6",border:"none",borderRadius:6,color:"#fff",fontSize:11,padding:"6px 14px",cursor:txt.trim()?"pointer":"default",fontWeight:700,opacity:txt.trim()?1:.5}}>Restore</button>
            {msg&&<span style={{fontSize:10,color:msg.startsWith("Error")?"#B91C1C":"#047857"}}>{msg}</span>}
          </div></>)}
    </div></div>;
}

function StatusBtn({status,setStatus,mobile}){
  const[open,setOpen]=useState(false);const s=SC[status]||SC.pending;const ref=useRef(null);const lp=useRef(null);
  useEffect(()=>{if(!open)return;const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[open]);
  const cycle=()=>{const i=SC_CYCLE.indexOf(status);setStatus(SC_CYCLE[(i+1)%SC_CYCLE.length]||SC_CYCLE[0]);};
  const onClick=e=>{if(mobile){setOpen(true);return;}cycle();};
  const onCtx=e=>{e.preventDefault();setOpen(true);};
  const onDown=e=>{if(mobile)return;lp.current=setTimeout(()=>setOpen(true),400);};
  const onUp=()=>{if(lp.current){clearTimeout(lp.current);lp.current=null;}};
  const caretClick=e=>{e.stopPropagation();e.preventDefault();setOpen(v=>!v);};
  const tip=mobile?`${s.l} — tap to change`:`${s.l} — click to cycle, caret or right-click for all options`;
  return <div ref={ref} style={{position:"relative",flexShrink:0,display:"inline-flex"}}>
    <button title={tip} onClick={onClick} onContextMenu={onCtx} onMouseDown={onDown} onMouseUp={onUp} onMouseLeave={onUp} onTouchStart={onDown} onTouchEnd={onUp}
      style={{fontSize:mobile?10:9,padding:mobile?"5px 9px":"3px 8px",borderTopLeftRadius:5,borderBottomLeftRadius:5,borderTopRightRadius:0,borderBottomRightRadius:0,border:"none",borderRight:`1px solid ${s.c}26`,cursor:"pointer",fontWeight:700,background:s.b,color:s.c,minWidth:mobile?82:78,minHeight:mobile?28:undefined}}>{s.l}</button>
    <button title="Open all status options" aria-label="Open status menu" onClick={caretClick}
      style={{fontSize:mobile?10:9,padding:mobile?"5px 7px":"3px 6px",borderTopRightRadius:5,borderBottomRightRadius:5,borderTopLeftRadius:0,borderBottomLeftRadius:0,border:"none",cursor:"pointer",fontWeight:800,background:s.b,color:s.c,minHeight:mobile?28:undefined,opacity:.75}}>▾</button>
    {open&&<div style={{position:"absolute",top:"100%",right:0,marginTop:3,background:"#fff",border:"1px solid #d6d3cd",borderRadius:7,boxShadow:"0 6px 20px rgba(0,0,0,.1)",zIndex:50,padding:3,minWidth:130}}>
      {SC_ORDER.map(k=>{const v=SC[k];return <button key={k} onClick={()=>{setStatus(k);setOpen(false);}} style={{display:"block",width:"100%",textAlign:"left",padding:mobile?"7px 10px":"4px 8px",fontSize:mobile?11:10,border:"none",background:status===k?v.b:"transparent",color:v.c,cursor:"pointer",borderRadius:4,fontWeight:600}}>{v.l}</button>;})}
    </div>}
  </div>;
}

function IntelSection({title,count,children,actions}){
  const[open,setOpen]=useState(true);
  return(
    <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,overflow:"hidden"}}>
      <div onClick={()=>setOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",cursor:"pointer",borderBottom:open?"1px solid #ebe8e3":"none"}}>
        <span style={{fontSize:10,color:"#64748b",width:10}}>{open?"▾":"▸"}</span>
        <span style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em"}}>{title}</span>
        {count!=null&&<span style={{fontSize:9,color:"#94a3b8",fontFamily:MN}}>({count})</span>}
        <span style={{marginLeft:"auto",display:"flex",gap:6}} onClick={e=>e.stopPropagation()}>{actions}</span>
      </div>
      {open&&<div style={{padding:"8px 12px 10px"}}>{children}</div>}
    </div>
  );
}

const STATUS_STYLE={
  Landed:{bg:"#D1FAE5",c:"#047857",label:"Landed"},
  Departed:{bg:"#DBEAFE",c:"#1D4ED8",label:"Departed"},
  Scheduled:{bg:"#F1F5F9",c:"#475569",label:"Scheduled"},
  Cancelled:{bg:"#FEE2E2",c:"#B91C1C",label:"Cancelled"},
  Delayed:{bg:"#FEF3C7",c:"#92400E",label:"Delayed"},
  Unknown:{bg:"#F1F5F9",c:"#94a3b8",label:"—"},
};
function statusStyle(s){return STATUS_STYLE[s]||STATUS_STYLE.Unknown;}

// Chips editor for a flight's passenger list. Click the PAX field to enter edit mode;
// remove with ×, add with input (datalist autocomplete from current crew roster).
// A green check appears on chips whose first name matches a known crew member.
function PaxEditor({pax,crew,onSave}){
  const[editing,setEditing]=useState(false);
  const[draft,setDraft]=useState(pax||[]);
  const[newName,setNewName]=useState("");
  const inputRef=useRef(null);
  const open=()=>{setDraft(pax||[]);setNewName("");setEditing(true);setTimeout(()=>inputRef.current?.focus(),0);};
  const cancel=()=>{setEditing(false);};
  const save=()=>{const cleaned=draft.map(s=>s.trim()).filter(Boolean);onSave(cleaned);setEditing(false);};
  const add=()=>{
    const v=newName.trim();if(!v)return;
    if(draft.some(n=>n.toLowerCase()===v.toLowerCase())){setNewName("");return;}
    setDraft(p=>[...p,v]);setNewName("");
  };
  const remove=i=>setDraft(p=>p.filter((_,idx)=>idx!==i));
  const findMatch=name=>(crew||[]).find(c=>c.name&&c.name.toLowerCase().includes(name.split(" ")[0].toLowerCase()));
  if(!editing){
    return(
      <div onClick={open} title="Click to edit passengers" style={{cursor:"pointer",minWidth:120}}>
        <div style={{fontSize:8,color:"#94a3b8",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>PAX <span style={{color:"#5B21B6",fontSize:9}}>✎</span></div>
        <div style={{fontSize:10,color:pax?.length?"#0f172a":"#94a3b8",fontStyle:pax?.length?"normal":"italic"}}>{pax?.length?pax.join(", "):"add passengers"}</div>
      </div>
    );
  }
  const dlId=`pax-dl-${Math.random().toString(36).slice(2,7)}`;
  return(
    <div style={{flexBasis:"100%",padding:"8px 10px",background:"#EDE9FE",border:"1px solid #C4B5FD",borderRadius:7,display:"flex",flexDirection:"column",gap:6}}>
      <div style={{fontSize:8,color:"#5B21B6",fontWeight:800,letterSpacing:"0.06em"}}>EDIT PAX · green = crew match</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4,minHeight:20}}>
        {draft.map((name,i)=>{const m=findMatch(name);return(
          <span key={i} style={{fontSize:10,padding:"3px 5px 3px 9px",borderRadius:14,background:m?"#D1FAE5":"#FEF3C7",color:m?"#047857":"#92400E",display:"inline-flex",alignItems:"center",gap:5,fontWeight:600,border:`1px solid ${m?"#6EE7B7":"#FDE68A"}`}}>
            {name}{m&&<span title={`Matches ${m.name}`} style={{fontSize:7,opacity:.7}}>✓</span>}
            <button onClick={()=>remove(i)} style={{background:"rgba(0,0,0,.08)",border:"none",cursor:"pointer",fontSize:11,lineHeight:1,padding:"0 5px 1px",borderRadius:"50%",color:"inherit"}}>×</button>
          </span>);})}
        {draft.length===0&&<span style={{fontSize:9,color:"#94a3b8",fontStyle:"italic"}}>no passengers yet</span>}
      </div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        <input ref={inputRef} value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add();}else if(e.key==="Escape"){e.preventDefault();cancel();}}} list={dlId} placeholder="Add pax name (enter to add)" style={{flex:1,minWidth:140,fontSize:10,padding:"5px 8px",border:"1px solid #d6d3cd",borderRadius:5,outline:"none",fontFamily:"'Outfit',system-ui"}}/>
        <datalist id={dlId}>{(crew||[]).map(c=><option key={c.id} value={c.name}/>)}</datalist>
        <button onClick={add} disabled={!newName.trim()} style={{fontSize:9,padding:"4px 10px",borderRadius:5,border:"none",background:newName.trim()?"#5B21B6":"#e5e7eb",color:newName.trim()?"#fff":"#94a3b8",cursor:newName.trim()?"pointer":"default",fontWeight:700}}>+ Add</button>
        <button onClick={save} style={{fontSize:9,padding:"4px 12px",borderRadius:5,border:"none",background:"#047857",color:"#fff",cursor:"pointer",fontWeight:700}}>Save</button>
        <button onClick={cancel} style={{fontSize:9,padding:"4px 10px",borderRadius:5,border:"1px solid #d6d3cd",background:"#fff",color:"#64748b",cursor:"pointer",fontWeight:600}}>Cancel</button>
      </div>
    </div>
  );
}

function FlightCard({f,actions,liveStatus,onRefreshStatus,refreshing,onUpdatePax,crew}){
  const st=liveStatus?statusStyle(liveStatus.status):null;
  const delayed=liveStatus?.delayMinutes>0;
  const isFresh=!!f.fresh48h;
  return(
    <div style={{background:"#fff",border:`1px solid ${isFresh?"#5B21B6":st&&delayed?"#FCD34D":st?.c==="#B91C1C"?"#FCA5A5":"#d6d3cd"}`,borderRadius:9,padding:"10px 12px",display:"flex",flexDirection:"column",gap:6,boxShadow:isFresh?"0 0 0 2px #EDE9FE":undefined}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <div style={{fontFamily:MN,fontSize:13,fontWeight:800,color:"#1E40AF"}}>{f.from}<span style={{fontSize:10,color:"#94a3b8",fontWeight:400,padding:"0 5px"}}>→</span>{f.to}</div>
        <div style={{fontSize:10,fontWeight:700,color:"#0f172a"}}>{f.flightNo||f.carrier}</div>
        {f.carrier&&f.flightNo&&<div style={{fontSize:9,color:"#64748b"}}>{f.carrier}</div>}
        {isFresh&&<span title="Booked within the last 48 hours" style={{fontSize:8,padding:"2px 6px",borderRadius:8,background:"#EDE9FE",color:"#5B21B6",fontWeight:800,letterSpacing:"0.06em"}}>NEW · 48H</span>}
        {st&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:8,background:st.bg,color:st.c,fontWeight:700}}>{st.label}{delayed?` +${liveStatus.delayMinutes}m`:""}</span>}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
          {onRefreshStatus&&<button onClick={onRefreshStatus} disabled={refreshing} title="Refresh live status" style={{background:"none",border:"none",cursor:refreshing?"default":"pointer",fontSize:10,color:refreshing?"#94a3b8":"#5B21B6",padding:0,lineHeight:1}}>{refreshing?"⟳":"⟳"}</button>}
          <div style={{fontSize:9,fontFamily:MN,color:"#475569",fontWeight:600}}>{f.depDate}{f.dep?` · ${f.dep}`:""}{f.arr?`–${f.arr}`:""}</div>
        </div>
      </div>
      {liveStatus&&(
        <div style={{display:"flex",gap:12,padding:"5px 8px",background:st.bg,borderRadius:6,flexWrap:"wrap"}}>
          {liveStatus.depActual&&<div><div style={{fontSize:7,color:st.c,fontWeight:700}}>ACT DEP</div><div style={{fontFamily:MN,fontSize:10,fontWeight:800,color:st.c}}>{liveStatus.depActual}{liveStatus.depGate?` · Gate ${liveStatus.depGate}`:""}</div></div>}
          {liveStatus.arrActual&&<div><div style={{fontSize:7,color:st.c,fontWeight:700}}>ACT ARR</div><div style={{fontFamily:MN,fontSize:10,fontWeight:800,color:st.c}}>{liveStatus.arrActual}{liveStatus.arrGate?` · Gate ${liveStatus.arrGate}`:""}</div></div>}
          {!liveStatus.depActual&&liveStatus.depScheduled&&<div><div style={{fontSize:7,color:st.c,fontWeight:700}}>SCH DEP</div><div style={{fontFamily:MN,fontSize:10,color:st.c}}>{liveStatus.depScheduled}{liveStatus.depGate?` · Gate ${liveStatus.depGate}`:""}</div></div>}
          {!liveStatus.arrActual&&liveStatus.arrScheduled&&<div><div style={{fontSize:7,color:st.c,fontWeight:700}}>SCH ARR</div><div style={{fontFamily:MN,fontSize:10,color:st.c}}>{liveStatus.arrScheduled}{liveStatus.arrGate?` · Gate ${liveStatus.arrGate}`:""}</div></div>}
          {liveStatus.aircraft&&<div><div style={{fontSize:7,color:st.c,fontWeight:700}}>AIRCRAFT</div><div style={{fontSize:9,color:st.c}}>{liveStatus.aircraft}</div></div>}
          {liveStatus.fetchedAt&&<div style={{marginLeft:"auto"}}><div style={{fontSize:7,color:"#94a3b8"}}>updated {new Date(liveStatus.fetchedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div></div>}
        </div>
      )}
      <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>
        {f.fromCity&&<div><div style={{fontSize:8,color:"#94a3b8",fontWeight:600}}>FROM</div><div style={{fontSize:10,color:"#0f172a"}}>{f.fromCity}</div></div>}
        {f.toCity&&<div><div style={{fontSize:8,color:"#94a3b8",fontWeight:600}}>TO</div><div style={{fontSize:10,color:"#0f172a"}}>{f.toCity}</div></div>}
        {onUpdatePax
          ?<PaxEditor pax={f.pax||[]} crew={crew} onSave={onUpdatePax}/>
          :(f.pax?.length>0&&<div><div style={{fontSize:8,color:"#94a3b8",fontWeight:600}}>PAX</div><div style={{fontSize:10,color:"#0f172a"}}>{f.pax.join(", ")}</div></div>)}
        {f.confirmNo&&<div><div style={{fontSize:8,color:"#94a3b8",fontWeight:600}}>CONF #</div><div style={{fontFamily:MN,fontSize:10,color:"#0f172a",fontWeight:700}}>{f.confirmNo}</div></div>}
        {f.cost&&<div><div style={{fontSize:8,color:"#94a3b8",fontWeight:600}}>COST</div><div style={{fontFamily:MN,fontSize:10,color:"#047857",fontWeight:700}}>{f.currency||"$"}{f.cost}</div></div>}
      </div>
      {actions&&<div style={{display:"flex",gap:5,paddingTop:4,borderTop:"1px solid #f5f3ef"}}>{actions}</div>}
    </div>
  );
}

function FlightsSection(){
  const{flights,uFlight,uRos,gRos,uFin,finance,crew,setShowCrew,shows}=useContext(Ctx);
  const a=useAuth();
  const[scanning,setScanning]=useState(false);
  const[scanMsg,setScanMsg]=useState("");
  const[pendingImport,setPendingImport]=useState([]); // scanned but not yet in state
  const[confirmingId,setConfirmingId]=useState(null);

  const allFlights=Object.values(flights).sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||0);
  const pending=allFlights.filter(f=>f.status==="pending");
  const confirmed=allFlights.filter(f=>f.status==="confirmed");

  const scanFlights=async()=>{
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const googleToken=session.provider_token;
      if(!googleToken){setScanMsg("Gmail access not available — re-login with Google.");return;}
      setScanning(true);setScanMsg("Scanning Gmail for flight confirmations…");
      const resp=await fetch("/api/flights",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken,tourStart:"2026-04-01",tourEnd:"2026-06-30"})});
      if(resp.status===402){setScanMsg("Gmail session expired — please re-login.");setScanning(false);return;}
      const data=await resp.json();
      if(data.error){setScanMsg(`Error: ${data.error}`);setScanning(false);return;}
      const newFlights=data.flights||[];
      // Merge: skip flights already in state (by id), also skip if same flightNo+depDate exists
      const existingKeys=new Set(Object.values(flights).map(f=>`${f.flightNo}__${f.depDate}`));
      const novel=newFlights.filter(f=>!flights[f.id]&&!existingKeys.has(`${f.flightNo}__${f.depDate}`));
      const freshCount=novel.filter(f=>f.fresh48h).length;
      const freshTag=freshCount?` (${freshCount} from last 48h)`:"";
      if(!novel.length){setScanMsg(`Scanned ${data.threadsFound} threads${data.freshThreads?` (${data.freshThreads} from last 48h)`:""} — no new flights found.`);setScanning(false);return;}
      setPendingImport(novel);
      setScanMsg(`Found ${novel.length} new flight${novel.length>1?"s":""}${freshTag} in ${data.threadsFound} threads.`);
    }catch(e){setScanMsg(`Scan failed: ${e.message}`);}
    setScanning(false);
  };

  const importFlight=f=>{
    uFlight(f.id,{...f,status:"pending"});
    setPendingImport(p=>p.filter(x=>x.id!==f.id));
  };
  const importAll=()=>{pendingImport.forEach(f=>uFlight(f.id,{...f,status:"pending"}));setPendingImport([]);};

  const confirmFlight=f=>{
    setConfirmingId(f.id);
    // Mark confirmed in flights store
    uFlight(f.id,{...f,status:"confirmed",confirmedAt:new Date().toISOString()});

    // Schedule: dep item
    const depMin=hhmmToMin(f.dep);
    // Flights float independently on the day view — no ROS anchoring

    // Finance: flight expense on dep date
    if(f.cost&&f.cost>0){
      const existing=finance[f.depDate]?.flightExpenses||[];
      uFin(f.depDate,{flightExpenses:[...existing.filter(e=>e.flightId!==f.id),{flightId:f.id,label:`${f.flightNo||f.carrier} ${f.from}→${f.to}`,amount:f.cost,currency:f.currency||"USD",pax:f.pax||[],carrier:f.carrier}]});
    }

    // Crew: match pax names → populate inbound + outbound legs
    if(f.pax?.length&&crew?.length){
      const leg={id:`leg_${f.id}`,flight:f.flightNo||"",carrier:f.carrier||"",from:f.from,fromCity:f.fromCity||f.from,to:f.to,toCity:f.toCity||f.to,depart:f.dep,arrive:f.arr,conf:f.confirmNo||f.bookingRef||"",status:"confirmed",flightId:f.id};
      f.pax.forEach(name=>{
        if(!name)return;
        const fname=name.split(" ")[0].toLowerCase();
        const match=crew.find(c=>c.name&&c.name.toLowerCase().includes(fname));
        if(!match)return;
        const arrD=f.arrDate||f.depDate;
        const depD=f.depDate;
        const sameDay=arrD===depD;
        setShowCrew(p=>{
          const cur=p[arrD]?.[match.id]||{};
          const ex=(cur.inbound||[]).filter(l=>l.flightId!==f.id);
          return{...p,[arrD]:{...p[arrD],[match.id]:{...cur,attending:true,inboundMode:"fly",inboundConfirmed:true,inboundDate:arrD,inboundTime:f.arr||"",inbound:[...ex,leg]}}};
        });
        if(!sameDay){
          setShowCrew(p=>{
            const cur=p[depD]?.[match.id]||{};
            const ex=(cur.outbound||[]).filter(l=>l.flightId!==f.id);
            return{...p,[depD]:{...p[depD],[match.id]:{...cur,attending:true,outboundMode:"fly",outboundDate:depD,outboundTime:f.dep||"",outbound:[...ex,leg]}}};
          });
        }
      });
    }
    setTimeout(()=>setConfirmingId(null),1200);
  };

  const dismissFlight=id=>uFlight(id,{...flights[id],status:"dismissed"});
  const deleteFlight=id=>uFlight(id,null);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {/* Header */}
      <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:10,fontWeight:800,color:"#1E40AF",letterSpacing:"0.06em"}}>✈ FLIGHTS</span>
        <span style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:"#DBEAFE",color:"#1E40AF",fontWeight:700}}>{confirmed.length} confirmed · {pending.length} pending</span>
        {scanMsg&&<span style={{fontSize:9,color:scanning?"#5B21B6":"#64748b",fontFamily:MN}}>{scanMsg}</span>}
        <button onClick={scanFlights} disabled={scanning} style={{marginLeft:"auto",background:scanning?"#ebe8e3":"#1E40AF",color:scanning?"#64748b":"#fff",border:"none",borderRadius:6,fontSize:10,padding:"4px 11px",cursor:scanning?"default":"pointer",fontWeight:700}}>{scanning?"Scanning…":"Scan Gmail"}</button>
      </div>

      {/* Pending import (just scanned, not yet in state) */}
      {pendingImport.length>0&&(
        <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:10,padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:9,fontWeight:800,color:"#1E40AF",letterSpacing:"0.06em"}}>NEW — REVIEW BEFORE IMPORTING</span>
            <button onClick={importAll} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"none",background:"#1E40AF",color:"#fff",cursor:"pointer",fontWeight:700}}>Import All ({pendingImport.length})</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {pendingImport.map(f=>(
              <FlightCard key={f.id} f={f} crew={crew} onUpdatePax={newPax=>setPendingImport(p=>p.map(x=>x.id===f.id?{...x,pax:(newPax||[]).map(s=>String(s||"").trim()).filter(Boolean)}:x))} actions={<>
                <button onClick={()=>importFlight(f)} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"none",background:"#1E40AF",color:"#fff",cursor:"pointer",fontWeight:700}}>Import</button>
                <button onClick={()=>setPendingImport(p=>p.filter(x=>x.id!==f.id))} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"1px solid #d6d3cd",background:"transparent",color:"#64748b",cursor:"pointer"}}>Skip</button>
                {f.tid&&<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"#1E40AF",textDecoration:"none",marginLeft:"auto"}}>open email ↗</a>}
              </>}/>
            ))}
          </div>
        </div>
      )}

      {/* Pending confirmation */}
      {pending.length>0&&(
        <IntelSection title="PENDING CONFIRMATION" count={pending.length}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {pending.map(f=>{
              const isConf=confirmingId===f.id;
              return(
                <FlightCard key={f.id} f={f} crew={crew} onUpdatePax={newPax=>uFlight(f.id,{...f,pax:(newPax||[]).map(s=>String(s||"").trim()).filter(Boolean)})} actions={<>
                  <button onClick={()=>confirmFlight(f)} disabled={isConf} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"none",background:isConf?"#047857":"#1E40AF",color:"#fff",cursor:isConf?"default":"pointer",fontWeight:700}}>{isConf?"✓ Synced!":"Confirm + Sync"}</button>
                  <button onClick={()=>dismissFlight(f.id)} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"1px solid #d6d3cd",background:"transparent",color:"#64748b",cursor:"pointer"}}>Dismiss</button>
                  {f.tid&&<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"#1E40AF",textDecoration:"none",marginLeft:"auto"}}>email ↗</a>}
                </>}/>
              );
            })}
          </div>
        </IntelSection>
      )}

      {/* Confirmed */}
      {confirmed.length>0&&(
        <IntelSection title="CONFIRMED" count={confirmed.length}>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {confirmed.map(f=>(
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:7}}>
                <span style={{fontSize:9,color:"#047857",fontWeight:800,fontFamily:MN,flexShrink:0}}>{f.depDate}</span>
                <span style={{fontSize:11,fontWeight:700,color:"#0f172a",fontFamily:MN,flexShrink:0}}>{f.from}→{f.to}</span>
                <span style={{fontSize:10,color:"#475569",flexShrink:0}}>{f.flightNo||f.carrier}</span>
                {f.dep&&<span style={{fontSize:9,fontFamily:MN,color:"#64748b"}}>{f.dep}</span>}
                <span style={{fontSize:9,color:"#64748b",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(f.pax||[]).join(", ")}</span>
                <span style={{fontSize:9,color:"#047857",fontWeight:700,flexShrink:0}}>✓</span>
                <button onClick={()=>deleteFlight(f.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:12,flexShrink:0}}>×</button>
              </div>
            ))}
          </div>
        </IntelSection>
      )}

      {allFlights.length===0&&pendingImport.length===0&&(
        <div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic",padding:"4px 0"}}>No flights yet. Click "Scan Gmail" to import from confirmation emails.</div>
      )}
    </div>
  );
}

function IntelPanel(){
  const{sel,shows,intel,refreshIntel,toggleIntelShare,refreshing,refreshMsg,setIntel,uShow}=useContext(Ctx);
  const show=shows[sel];const sid=show?showIdFor(show):"";const data=intel[sid]||{};
  const upd=patch=>setIntel(p=>({...p,[sid]:{...(p[sid]||{}),...patch}}));
  const toggleTodo=id=>upd({todos:(data.todos||[]).map(t=>t.id===id?{...t,done:!t.done}:t)});
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
    <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <span style={{fontSize:10,fontWeight:800,color:"#5B21B6",letterSpacing:"0.06em"}}>GMAIL INTEL</span>
      <span style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:"#f1f5f9",color:"#64748b",fontWeight:600,letterSpacing:"0.04em"}}>PRIVATE</span>
      {data.lastRefreshed&&<span style={{fontSize:9,color:"#94a3b8",fontFamily:MN}}>last: {new Date(data.lastRefreshed).toLocaleString()}</span>}
      <span style={{marginLeft:"auto",fontSize:9,color:"#64748b"}}>{(data.threads||[]).length} threads · {(data.todos||[]).length} to-dos</span>
      <button onClick={()=>toggleIntelShare(show,!shared)} style={{background:shared?"#D1FAE5":"#f1f5f9",color:shared?"#065F46":"#475569",border:`1px solid ${shared?"#6EE7B7":"#d6d3cd"}`,borderRadius:6,fontSize:9,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>{shared?"Shared with team":"Share with team"}</button>
      <button onClick={()=>refreshIntel(show,true)} disabled={!!refreshing} style={{background:refreshing?"#ebe8e3":"#5B21B6",color:refreshing?"#64748b":"#fff",border:"none",borderRadius:6,fontSize:10,padding:"4px 11px",cursor:refreshing?"default":"pointer",fontWeight:700}}>{busy?"Scanning…":"Refresh Intel"}</button>
    </div>
    {refreshMsg&&<div style={{fontSize:10,color:"#5B21B6",fontFamily:MN}}>{refreshMsg}</div>}
    <IntelSection title="SCHEDULE INCONSISTENCIES" count={scheduleFlags.length+(data.manualFlags||[]).length} actions={<button onClick={addManualFlag} style={{...UI.expandBtn(false,"#92400E"),fontSize:9}}>+ Add</button>}>
      {scheduleFlags.length===0&&(data.manualFlags||[]).length===0?<div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>No inconsistencies.</div>:
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {scheduleFlags.map(f=>{const isC=f.severity==="CONFLICT";const col=isC?"#B91C1C":"#92400E";const bg=isC?"#FEE2E2":"#FEF3C7";
          const confirmPlatform=()=>dismissFlag(f.key);
          const confirmEmail=()=>{uShow(sel,{[f.field]:f.emailValMinutes,[f.field+"Confirmed"]:true});dismissFlag(f.key);};
          const markBadMatch=()=>dismissFlag(f.key);
          return <div key={f.key} style={{border:`1px solid ${col}40`,background:bg,borderRadius:7,padding:"7px 9px",display:"flex",flexDirection:"column",gap:4}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:col,color:"#fff",fontWeight:800}}>{f.severity}</span>
              <span style={{fontSize:11,fontWeight:700,color:"#0f172a"}}>{f.label}</span>
              <span style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}>
                {f.threadTid&&<a href={gmailUrl(f.threadTid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:col,textDecoration:"none",fontWeight:600}}>open ↗</a>}
              </span>
            </div>
            <div style={{fontSize:10,fontFamily:MN,color:"#0f172a"}}>platform: <span style={{fontWeight:600}}>{f.platform}</span> · email: <span style={{fontWeight:600}}>{f.emailVal}</span></div>
            <div style={{fontSize:9,color:"#64748b",fontStyle:"italic"}}>{f.snippet}</div>
            <div style={{display:"flex",gap:5,marginTop:2}}>
              <button onClick={confirmPlatform} title="Platform time is correct — dismiss flag" style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:"1px solid #CBD5E1",background:"#f1f5f9",color:"#334155",cursor:"pointer",fontWeight:700}}>Platform correct</button>
              <button onClick={confirmEmail} title="Email time is correct — update show and dismiss" style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:`1px solid ${col}60`,background:isC?"#FEE2E2":"#FEF3C7",color:col,cursor:"pointer",fontWeight:700}}>Use email time</button>
              <button onClick={markBadMatch} title="Low confidence — comparison is improperly formed or imprecise" style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#94a3b8",cursor:"pointer",fontWeight:600}}>Bad match</button>
            </div>
          </div>;
        })}
        {(data.manualFlags||[]).map(f=><div key={f.key} style={{border:"1px solid #d6d3cd",background:"#faf9f6",borderRadius:7,padding:"7px 9px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr 28px",gap:6,alignItems:"center"}}>
          <input value={f.label} onChange={e=>updManualFlag(f.key,{label:e.target.value})} placeholder="Label" style={UI.input}/>
          <input value={f.platform} onChange={e=>updManualFlag(f.key,{platform:e.target.value})} placeholder="Platform" style={UI.input}/>
          <input value={f.emailVal} onChange={e=>updManualFlag(f.key,{emailVal:e.target.value})} placeholder="Email value" style={UI.input}/>
          <button onClick={()=>delManualFlag(f.key)} style={{background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:14}}>×</button>
        </div>)}
      </div>}
    </IntelSection>
    <IntelSection title="TO-DOS (PRIVATE)" count={(data.todos||[]).length} actions={<button onClick={addTodo} style={{...UI.expandBtn(false,"#5B21B6"),fontSize:9}}>+ Add</button>}>
      {(data.todos||[]).length===0?<div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>No action items yet.</div>:
        (data.todos||[]).map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #f5f3ef"}}>
          <input type="checkbox" checked={!!t.done} onChange={()=>toggleTodo(t.id)}/>
          <span style={{fontSize:10,flex:1,color:t.done?"#94a3b8":"#0f172a",textDecoration:t.done?"line-through":"none"}}>{t.text}</span>
          {t.priority&&<span style={{fontSize:7,padding:"1px 5px",borderRadius:3,background:t.priority==="CRITICAL"?"#FEE2E2":t.priority==="HIGH"?"#FEF3C7":"#f1f5f9",color:t.priority==="CRITICAL"?"#B91C1C":t.priority==="HIGH"?"#92400E":"#64748b",fontWeight:700}}>{t.priority}</span>}
          {t.threadTid&&<a href={gmailUrl(t.threadTid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"#5B21B6",textDecoration:"none"}}>↗</a>}
          <button onClick={()=>delTodo(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:12}}>×</button>
        </div>)}
    </IntelSection>
    <IntelSection title="THREADS (PRIVATE)" count={(data.threads||[]).length} actions={<button onClick={addThread} style={{...UI.expandBtn(false,"#5B21B6"),fontSize:9}}>+ Add</button>}>
      {(data.threads||[]).length===0?<div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>No threads.</div>:
        data.threads.map(t=><div key={t.tid} style={{display:"grid",gridTemplateColumns:"1fr auto auto 28px",gap:8,padding:"5px 0",borderBottom:"1px solid #f5f3ef",fontSize:10,alignItems:"center"}}>
          {t.manual?<input value={t.subject||""} onChange={e=>upd({threads:data.threads.map(x=>x.tid===t.tid?{...x,subject:e.target.value}:x)})} placeholder="Subject" style={UI.input}/>:
            <a href={gmailUrl(t.tid)} target="_blank" rel="noopener noreferrer" style={{color:"#0f172a",textDecoration:"none",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><span style={{fontWeight:600}}>{t.subject||"(no subject)"}</span> <span style={{color:"#64748b",fontSize:9}}>· {t.from}</span></a>}
          <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:"#EDE9FE",color:"#5B21B6",fontWeight:700}}>{t.intent||"?"}</span>
          <span style={{fontSize:8,color:"#94a3b8",fontFamily:MN}}>{t.date}</span>
          <button onClick={()=>delThread(t.tid)} style={{background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:12}}>×</button>
        </div>)}
    </IntelSection>
    <IntelSection title="FOLLOW-UPS" count={(data.followUps||[]).length} actions={<button onClick={addFollowUp} style={{...UI.expandBtn(false,"#5B21B6"),fontSize:9}}>+ Add</button>}>
      {(data.followUps||[]).length===0?<div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>No follow-ups.</div>:
        data.followUps.map((f,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 100px 80px 100px 28px",gap:8,padding:"5px 0",borderBottom:"1px solid #f5f3ef",fontSize:10,alignItems:"center"}}>
          {f.manual?<input value={f.action||""} onChange={e=>upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,action:e.target.value}:x)})} placeholder="Action" style={UI.input}/>:<span>{f.action}</span>}
          {f.manual?<input value={f.owner||""} onChange={e=>upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,owner:e.target.value}:x)})} placeholder="Owner" style={UI.input}/>:<span style={{fontSize:8,color:"#64748b"}}>{f.owner}</span>}
          {f.manual?<select value={f.priority||"MED"} onChange={e=>upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,priority:e.target.value}:x)})} style={UI.input}><option>CRITICAL</option><option>HIGH</option><option>MED</option><option>LOW</option></select>:<span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:f.priority==="CRITICAL"?"#FEE2E2":"#f1f5f9",color:f.priority==="CRITICAL"?"#B91C1C":"#64748b",fontWeight:700}}>{f.priority}</span>}
          {f.manual?<input value={f.deadline||""} onChange={e=>upd({followUps:data.followUps.map((x,idx)=>idx===i?{...x,deadline:e.target.value}:x)})} placeholder="YYYY-MM-DD" style={UI.input}/>:<span style={{fontSize:8,color:"#94a3b8",fontFamily:MN}}>{f.deadline}</span>}
          <button onClick={()=>delFollowUp(i)} style={{background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:12}}>×</button>
        </div>)}
    </IntelSection>
    {(data.showContacts||[]).length>0&&<div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"10px 12px"}}>
      <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em",marginBottom:6}}>CONTACTS</div>
      {data.showContacts.map((c,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8,padding:"4px 0",borderBottom:"1px solid #f5f3ef",fontSize:10}}>
        <span style={{fontWeight:600}}>{c.name}</span><span style={{color:"#64748b"}}>{c.role}</span>
        {c.email&&<a href={`mailto:${c.email}`} style={{color:"#5B21B6",fontSize:9,textDecoration:"none"}}>{c.email}</a>}
      </div>)}
    </div>}
    {(data.sharedByOthers||[]).map((s,i)=>{
      const label=s.user_email||"teammate";const d=s.intel||{};
      return <div key={i} style={{border:"1px solid #6EE7B7",borderRadius:10,padding:"10px 12px",background:"#F0FDF4"}}>
        <div style={{fontSize:9,fontWeight:800,color:"#065F46",letterSpacing:"0.06em",marginBottom:8}}>SHARED BY {label.toUpperCase()} · {new Date(s.cached_at).toLocaleDateString()}</div>
        {(d.followUps||[]).length>0&&<div>
          <div style={{fontSize:8,fontWeight:700,color:"#64748b",marginBottom:4}}>FOLLOW-UPS ({d.followUps.length})</div>
          {d.followUps.map((f,fi)=><div key={fi} style={{display:"grid",gridTemplateColumns:"1fr 80px 70px 80px",gap:8,padding:"4px 0",borderBottom:"1px solid #D1FAE5",fontSize:10,alignItems:"center"}}>
            <span>{f.action}</span>
            <span style={{fontSize:8,color:"#64748b"}}>{f.owner}</span>
            <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:f.priority==="CRITICAL"?"#FEE2E2":"#f1f5f9",color:f.priority==="CRITICAL"?"#B91C1C":"#64748b",fontWeight:700}}>{f.priority}</span>
            <span style={{fontSize:8,color:"#94a3b8",fontFamily:MN}}>{f.deadline}</span>
          </div>)}
        </div>}
      </div>;
    })}
    <FlightsSection/>
  </div>;
}

function NotesPanel(){
  const{sel,advances,uAdv,notesPriv,uNotesPriv,pushUndo}=useContext(Ctx);
  const[tabN,setTabN]=useState("public");const[txt,setTxt]=useState("");
  const shared=advances[sel]?.sharedNotes||[];const priv=notesPriv[sel]||[];
  const list=tabN==="public"?shared:priv;
  const add=()=>{if(!txt.trim())return;const n={id:`n${Date.now()}`,text:txt.trim(),ts:Date.now()};
    if(tabN==="public")uAdv(sel,{sharedNotes:[...shared,n]});else uNotesPriv(sel,[...priv,n]);
    setTxt("");};
  const del=id=>{if(tabN==="public"){const prev=shared;uAdv(sel,{sharedNotes:shared.filter(n=>n.id!==id)});pushUndo("Note deleted.",()=>uAdv(sel,{sharedNotes:prev}));}else{const prev=priv;uNotesPriv(sel,priv.filter(n=>n.id!==id));pushUndo("Note deleted.",()=>uNotesPriv(sel,prev));}};
  return <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"10px 12px"}}>
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
      <span style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em"}}>NOTES</span>
      <div style={{display:"flex",gap:2,marginLeft:"auto",background:"#f5f3ef",borderRadius:6,padding:2}}>
        {["public","private"].map(m=><button key={m} onClick={()=>setTabN(m)} style={{fontSize:8,padding:"2px 8px",borderRadius:4,border:"none",cursor:"pointer",background:tabN===m?"#fff":"transparent",color:tabN===m?"#0f172a":"#64748b",fontWeight:700,textTransform:"uppercase"}}>{m}</button>)}
      </div>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:6}}>
      {list.length===0&&<div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>No {tabN} notes yet.</div>}
      {list.map(n=><div key={n.id} style={{display:"flex",gap:6,padding:"5px 7px",background:"#f5f3ef",borderRadius:5}}>
        <span style={{fontSize:10,color:"#0f172a",flex:1,whiteSpace:"pre-wrap"}}>{n.text}</span>
        <span style={{fontSize:8,color:"#94a3b8",fontFamily:MN}}>{new Date(n.ts).toLocaleDateString()}</span>
        <button onClick={()=>del(n.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:11}}>×</button>
      </div>)}
    </div>
    <div style={{display:"flex",gap:5}}>
      <input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder={`Add ${tabN} note…`}
        style={{flex:1,background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:5,fontSize:10,padding:"4px 7px",outline:"none"}}/>
      <button onClick={add} style={{background:tabN==="public"?"#5B21B6":"#334155",border:"none",borderRadius:5,color:"#fff",fontSize:10,padding:"4px 12px",cursor:"pointer",fontWeight:700}}>Add</button>
    </div>
  </div>;
}

function SignOut(){
  const a=useAuth();const user=a?.user;if(!user)return null;
  const initial=(user.email||"?").trim()[0].toUpperCase();
  return <button title={user.email} onClick={()=>supabase.auth.signOut()} style={{width:22,height:22,borderRadius:"50%",background:"#5B21B6",color:"#fff",fontSize:10,fontWeight:700,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>{initial}</button>;
}

// ── NAV SIDEBAR ──────────────────────────────────────────────────────────────

function NavSidebar(){
  const{sidebarOpen,sel,setSel,sorted,tourDaysSorted,shows,uShow,advances,aC,setTab,next,tourDays,showOffDays,setShowOffDays}=useContext(Ctx);
  const[newDate,setNewDate]=useState("");
  const[newType,setNewType]=useState("off");
  const today=new Date().toISOString().slice(0,10);

  // Merge tour days + non-tour shows, filter off/travel per toggle
  const rows=useMemo(()=>{
    const tourIds=new Set((tourDaysSorted||[]).map(d=>d.date));
    const extras=(sorted||[]).filter(s=>!tourIds.has(s.date)).map(s=>({date:s.date,type:s.type||"show",show:s,city:s.city,venue:s.venue,synthetic:false}));
    const all=[...(tourDaysSorted||[]),...extras].sort((a,b)=>a.date.localeCompare(b.date));
    if(!showOffDays)return all.filter(d=>d.type!=="off"&&d.type!=="travel");
    return all;
  },[tourDaysSorted,sorted,showOffDays]);

  const pendingCount=d=>{const adv=advances[d]||{};const items=adv.items||{};const custom=adv.customItems||[];return[...AT,...custom].filter(t=>(items[t.id]?.status||"pending")==="pending").length;};

  const flags=useMemo(()=>{const f=[];sorted.forEach(s=>{if(s.notes?.includes("⚠ Immigration")&&dU(s.date)<45)f.push({type:"CRITICAL",msg:`FR immigration — ${s.city}`,date:s.date});if(s.notes?.includes("⚠ Insurance"))f.push({type:"CRITICAL",msg:"Tour insurance — $0",date:s.date});});return f.slice(0,3);},[sorted]);

  const add=()=>{
    if(!newDate||shows[newDate])return;
    uShow(newDate,{date:newDate,clientId:aC,type:newType,city:newType==="travel"?"Travel":"Off Day",venue:newType==="travel"?"Travel Day":"Off Day",country:"",region:"",promoter:"",advance:[],doors:0,curfew:0,busArrive:0,crewCall:0,venueAccess:0,mgTime:0,notes:""});
    setSel(newDate);setNewDate("");
  };

  // Scroll selected date into view
  const listRef=useRef(null);
  const selRef=useRef(null);
  useEffect(()=>{if(selRef.current&&listRef.current){selRef.current.scrollIntoView({block:"nearest",behavior:"smooth"});};},[sel,sidebarOpen]);

  const typeColor=t=>t==="travel"?{bg:"#DBEAFE",c:"#1E40AF"}:t==="off"?{bg:"#F1F5F9",c:"#94a3b8"}:t==="split"?{bg:"#FEF3C7",c:"#92400E"}:{bg:"#D1FAE5",c:"#047857"};

  if(!sidebarOpen)return null;

  return(
    <div style={{width:200,flexShrink:0,background:"#fff",borderRight:"1px solid #d6d3cd",display:"flex",flexDirection:"column",height:"100%",minHeight:0,overflow:"hidden"}}>
      {/* Mini stats */}
      {next&&(
        <div style={{padding:"10px 12px 8px",borderBottom:"1px solid #ebe8e3"}}>
          <div style={{fontSize:9,fontWeight:700,color:"#94a3b8",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Next Show</div>
          <div style={{fontSize:12,fontWeight:800,color:"#0f172a",lineHeight:1.2}}>{next.city}</div>
          <div style={{fontSize:9,color:"#64748b",marginTop:1}}>{fD(next.date)} · <span style={{color:"#5B21B6",fontWeight:700,fontFamily:MN}}>{dU(next.date)}d</span></div>
        </div>
      )}
      {/* Flags */}
      {flags.length>0&&(
        <div style={{padding:"6px 10px",borderBottom:"1px solid #ebe8e3",display:"flex",flexDirection:"column",gap:3}}>
          {flags.map((f,i)=>(
            <div key={i} onClick={()=>{if(f.date)setSel(f.date);}} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 6px",background:"#FEE2E2",borderRadius:5,cursor:f.date?"pointer":"default",borderLeft:"2px solid #B91C1C"}}>
              <span style={{fontSize:7,fontWeight:800,color:"#B91C1C",fontFamily:MN,flexShrink:0}}>!</span>
              <span style={{fontSize:9,color:"#991B1B",fontWeight:600,lineHeight:1.2}}>{f.msg}</span>
            </div>
          ))}
        </div>
      )}
      {/* Off/travel toggle */}
      <div style={{padding:"7px 12px",borderBottom:"1px solid #ebe8e3",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:9,fontWeight:600,color:"#64748b"}}>Off / travel days</span>
        <button onClick={()=>setShowOffDays(v=>!v)} style={{position:"relative",width:28,height:16,borderRadius:99,border:"none",cursor:"pointer",background:showOffDays?"#5B21B6":"#d6d3cd",padding:0,transition:"background 0.2s",flexShrink:0}}>
          <span style={{position:"absolute",top:2,left:showOffDays?14:2,width:12,height:12,borderRadius:99,background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
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
          const urgColor=days<=7?"#B91C1C":days<=14?"#92400E":days<=21?"#1E40AF":"#94a3b8";
          const dateStr=new Date(d.date+"T12:00:00");
          const mo=dateStr.toLocaleString("en-US",{month:"short"});
          const dt=dateStr.getDate();
          const wd=dateStr.toLocaleString("en-US",{weekday:"short"});
          return(
            <div key={d.date} ref={isSel?selRef:null} onClick={()=>setSel(d.date)} className="rh" style={{display:"flex",alignItems:"center",gap:0,padding:"6px 10px 6px 0",cursor:"pointer",background:isSel?"#EDE9FE":"transparent",borderLeft:isSel?"3px solid #5B21B6":"3px solid transparent",opacity:isOff?0.7:1}}>
              <div style={{width:46,flexShrink:0,textAlign:"center"}}>
                <div style={{fontSize:8,fontWeight:700,color:isSel?"#5B21B6":"#94a3b8",fontFamily:MN,letterSpacing:"0.04em"}}>{wd.toUpperCase()}</div>
                <div style={{fontSize:14,fontWeight:800,color:isSel?"#5B21B6":"#0f172a",lineHeight:1}}>{dt}</div>
                <div style={{fontSize:8,color:isSel?"#7C3AED":"#94a3b8"}}>{mo}</div>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:1}}>
                  <span style={{fontSize:10,fontWeight:600,color:isSel?"#3730A3":"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.city||d.venue||"—"}</span>
                  {!isOff&&<span style={{fontSize:7,padding:"1px 4px",borderRadius:99,fontWeight:700,...tc,flexShrink:0}}>{d.type==="show"?"▶":"⇢"}</span>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  {pc>0&&<span style={{fontSize:7,fontFamily:MN,color:"#92400E",fontWeight:700}}>{pc} open</span>}
                  {d.type==="show"&&days>=0&&<span style={{fontSize:7,fontFamily:MN,color:urgColor,fontWeight:700}}>{days}d</span>}
                  {isOff&&<span style={{fontSize:7,color:"#94a3b8",fontStyle:"italic"}}>{d.type}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Add date */}
      <div style={{padding:"8px 10px",borderTop:"1px solid #ebe8e3",display:"flex",flexDirection:"column",gap:5}}>
        <div style={{display:"flex",gap:4}}>
          <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} style={{...UI.input,flex:1,fontFamily:MN,padding:"4px 5px",fontSize:10,minWidth:0}}/>
          <select value={newType} onChange={e=>setNewType(e.target.value)} style={{...UI.input,padding:"4px 5px",fontSize:10,width:64}}>
            <option value="off">Off</option>
            <option value="travel">Travel</option>
          </select>
        </div>
        <button onClick={add} disabled={!newDate||!!shows[newDate]} style={{...UI.expandBtn(false,"#047857"),fontSize:9,padding:"4px 0",width:"100%",opacity:(!newDate||shows[newDate])?0.4:1}}>+ Add Date</button>
      </div>
    </div>
  );
}

function TopBar({ss}){
  const{tab,setTab,role,setRole,setCmd,next,aC,setAC,setExp,sel,setSel,shows,sorted,tourDaysSorted,orderedTabs,reorderTabs,setUploadOpen,sidebarOpen,setSidebarOpen,showOffDays,mobile}=useContext(Ctx);
  const[dragId,setDragId]=useState(null);
  const[overId,setOverId]=useState(null);
  const a=useAuth();const userEmail=(a?.user?.email||"").toLowerCase();
  const curClient=CM[aC];
  const canSeeFestivals=FESTIVAL_ACCESS_EMAILS.some(e=>e.toLowerCase()===userEmail);
  const activeClients=CLIENTS.filter(c=>c.status==="active"&&(c.type!=="festival"||canSeeFestivals));
  React.useEffect(()=>{if(!activeClients.find(c=>c.id===aC))setAC("bbn");},[canSeeFestivals]);
  const stepBtn={background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:5,color:"#475569",fontSize:11,padding:mobile?"5px 8px":"3px 7px",cursor:"pointer",fontWeight:700,minHeight:mobile?30:undefined,lineHeight:1};
  const stepList=useMemo(()=>{
    const tourIds=new Set((tourDaysSorted||[]).map(d=>d.date));
    const extras=(sorted||[]).filter(s=>!tourIds.has(s.date)).map(s=>({date:s.date,type:s.type||"show"}));
    const all=[...(tourDaysSorted||[]).map(d=>({date:d.date,type:d.type})),...extras].sort((a,b)=>a.date.localeCompare(b.date));
    return showOffDays?all:all.filter(d=>d.type!=="off"&&d.type!=="travel");
  },[tourDaysSorted,sorted,showOffDays]);
  const curIdx=stepList.findIndex(d=>d.date===sel);
  const stepDate=dir=>{if(curIdx<0)return;const ni=curIdx+dir;if(ni<0||ni>=stepList.length)return;setSel(stepList[ni].date);};
  const canPrev=curIdx>0;const canNext=curIdx>=0&&curIdx<stepList.length-1;
  return(
    <div style={{borderBottom:"1px solid #d6d3cd",background:"#fff",width:"100%",maxWidth:"100%",overflowX:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 20px 5px",minWidth:0,gap:8,width:"100%",maxWidth:900}}>
        <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flexShrink:1,overflow:"hidden"}}>
          <span style={{fontSize:16,fontWeight:800,color:"#0f172a",letterSpacing:"-0.03em",flexShrink:0}}>DOS</span>
          <span style={{fontSize:8,color:"#94a3b8",fontWeight:600}}>v7.0</span>
          <button onClick={()=>setSidebarOpen(v=>!v)} title="Toggle nav menu" style={{fontSize:12,padding:"3px 7px",borderRadius:5,border:"1px solid #d6d3cd",background:sidebarOpen?"#0f172a":"#f5f3ef",color:sidebarOpen?"#fff":"#475569",cursor:"pointer",flexShrink:0}}>☰</button>
          <div style={{display:"flex",alignItems:"center",gap:0,flexShrink:0}}>
            <button onClick={()=>stepDate(-1)} disabled={!canPrev} title="Previous date" style={{fontSize:11,padding:"2px 7px",borderRadius:"5px 0 0 5px",border:"1px solid #d6d3cd",borderRight:"none",background:canPrev?"#f5f3ef":"#faf9f7",color:canPrev?"#0f172a":"#c4bfb6",cursor:canPrev?"pointer":"default"}}>‹</button>
            <button onClick={()=>stepDate(1)} disabled={!canNext} title="Next date" style={{fontSize:11,padding:"2px 7px",borderRadius:"0 5px 5px 0",border:"1px solid #d6d3cd",background:canNext?"#f5f3ef":"#faf9f7",color:canNext?"#0f172a":"#c4bfb6",cursor:canNext?"pointer":"default"}}>›</button>
          </div>
          {next&&<span style={{fontSize:10,fontFamily:MN,color:"#5B21B6",fontWeight:600}}>{next.city} {fD(next.date)} · {dU(next.date)}d</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,minWidth:0,maxWidth:"100%"}}>
          {ss&&<span style={{fontSize:9,color:ss==="saved"?"#047857":"#94a3b8",fontFamily:MN,fontWeight:600}}>{ss==="saving"?"saving...":"saved ✓"}</span>}
          <div style={{display:"flex",gap:1,background:"#ebe8e3",borderRadius:7,padding:2}}>
            {ROLES.map(r=><button key={r.id} onClick={()=>setRole(r.id)} style={{fontSize:9,fontWeight:role===r.id?700:500,padding:"3px 8px",borderRadius:5,border:"none",cursor:"pointer",background:role===r.id?"#fff":"transparent",color:role===r.id?r.c:"#64748b",boxShadow:role===r.id?"0 1px 3px rgba(0,0,0,.1)":"none"}}>{r.label}</button>)}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:mobile?4:8,flexShrink:0,minWidth:0,maxWidth:"100%"}}>
          {ss&&!mobile&&<span style={{fontSize:9,color:ss==="saved"?"#047857":"#94a3b8",fontFamily:MN,fontWeight:600}}>{ss==="saving"?"saving...":"saved ✓"}</span>}
          {!mobile&&<div style={{display:"flex",gap:1,background:"#ebe8e3",borderRadius:7,padding:2}}>
            {ROLES.map(r=><button key={r.id} onClick={()=>setRole(r.id)} style={{fontSize:9,fontWeight:role===r.id?700:500,padding:"3px 8px",borderRadius:5,border:"none",cursor:"pointer",background:role===r.id?"#fff":"transparent",color:role===r.id?r.c:"#64748b",boxShadow:role===r.id?"0 1px 3px rgba(0,0,0,.1)":"none"}}>{r.label}</button>)}
          </div>}
          <button onClick={()=>setUploadOpen(true)} title="Upload document" style={{background:"#ebe8e3",border:"1px solid #d6d3cd",borderRadius:5,color:"#475569",fontSize:mobile?11:9,padding:mobile?"5px 9px":"3px 8px",cursor:"pointer",fontFamily:MN,fontWeight:600,minHeight:mobile?30:undefined}}>{mobile?"↑":"↑ Upload"}</button>
          <button onClick={()=>setExp(true)} title="Export / Import" style={{background:"#ebe8e3",border:"1px solid #d6d3cd",borderRadius:5,color:"#475569",fontSize:mobile?11:9,padding:mobile?"5px 9px":"3px 8px",cursor:"pointer",fontFamily:MN,fontWeight:600,minHeight:mobile?30:undefined}}>⇅</button>
          <button onClick={()=>setCmd(true)} title="Command palette (⌘K)" style={{background:"#ebe8e3",border:"1px solid #d6d3cd",borderRadius:5,color:"#475569",fontSize:mobile?11:9,padding:mobile?"5px 9px":"3px 8px",cursor:"pointer",fontFamily:MN,fontWeight:600,minHeight:mobile?30:undefined}}>{mobile?"⌘":"⌘K"}</button>
          <SignOut/>
        </div>
      </div>
      <div style={{padding:mobile?"3px 12px 5px":"3px 20px 5px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <select value={aC} onChange={e=>setAC(e.target.value)} style={{fontSize:mobile?11:10,padding:mobile?"5px 12px":"3px 9px",borderRadius:20,border:`1.5px solid ${curClient?.color||"#d6d3cd"}`,background:curClient?`${curClient.color}14`:"#fff",color:curClient?.color||"#475569",fontFamily:"'Outfit',system-ui",fontWeight:700,cursor:"pointer",minHeight:mobile?30:undefined}}>
          {activeClients.map(c=><option key={c.id} value={c.id} style={{color:"#0f172a",fontWeight:500}}>● {c.name} · {c.type==="festival"?"FEST":"ARTIST"}</option>)}
        </select>
        {mobile&&<div style={{display:"flex",gap:1,background:"#ebe8e3",borderRadius:7,padding:2,marginLeft:"auto"}}>
          {ROLES.map(r=><button key={r.id} onClick={()=>setRole(r.id)} style={{fontSize:10,fontWeight:role===r.id?700:500,padding:"4px 8px",borderRadius:5,border:"none",cursor:"pointer",background:role===r.id?"#fff":"transparent",color:role===r.id?r.c:"#64748b",boxShadow:role===r.id?"0 1px 3px rgba(0,0,0,.1)":"none"}}>{r.label}</button>)}
        </div>}
        {mobile&&ss&&<span style={{fontSize:9,color:ss==="saved"?"#047857":"#94a3b8",fontFamily:MN,fontWeight:600}}>{ss==="saving"?"saving...":"saved ✓"}</span>}
      </div>
      <div style={{display:"flex",padding:mobile?"0 12px":"0 20px",width:"100%",maxWidth:900,overflowX:"auto",overflowY:"hidden",scrollbarWidth:"thin",WebkitOverflowScrolling:"touch"}}>
        {(orderedTabs||TABS).map(t=>{
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
              style={{padding:mobile?"9px 13px":"6px 12px",fontSize:mobile?12:11,fontWeight:tab===t.id?700:500,color:t.disabled?"#c4bfb6":tab===t.id?"#0f172a":"#64748b",background:isOver?"#EDE9FE":"none",border:"none",cursor:t.disabled?"default":mobile?"pointer":isDrag?"grabbing":"grab",borderBottom:tab===t.id?"2px solid #5B21B6":isOver?"2px solid #5B21B6":"2px solid transparent",display:"flex",alignItems:"center",gap:5,flexShrink:0,whiteSpace:"nowrap",opacity:isDrag?0.4:1,transition:"opacity .1s,background .1s",userSelect:"none",minHeight:mobile?40:undefined}}
            >
              <span style={{fontSize:mobile?12:10}}>{t.icon}</span>{t.label}{t.soon&&<span style={{fontSize:7,color:"#c4bfb6"}}>soon</span>}
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
  const[filter,setFilter]=useState("all");
  const add=()=>{
    if(!newDate||shows[newDate])return;
    uShow(newDate,{date:newDate,clientId:aC,type:newType,city:newType==="travel"?"Travel":"Off Day",venue:newType==="travel"?"Travel Day":"Off Day",country:"",region:"",promoter:"",advance:[],doors:0,curfew:0,busArrive:0,crewCall:0,venueAccess:0,mgTime:0,notes:""});
    setSel(newDate);setNewDate("");onClose();
  };
  const drawerLabel=useMemo(()=>{
    if(!sel)return"DATES";
    const td=tourDays?.[sel];const sh=shows?.[sel];
    if(sh&&(sh.type==="travel"||sh.type==="off")){const r=td?.bus?.route;return r?r:sh.city||sh.type.toUpperCase();}
    if(sh)return sh.city||sh.venue||fD(sel);
    if(td){if(td.type==="travel"&&td.bus?.route)return td.bus.route;if(td.type==="split")return"Split Day";if(td.type==="off")return"Off";}
    return fD(sel);
  },[sel,tourDays,shows]);
  const typeStyle=t=>t==="travel"?{bg:"#DBEAFE",c:"#1E40AF",l:"Travel"}:t==="off"?{bg:"#F5F3EF",c:"#94a3b8",l:"Off"}:t==="split"?{bg:"#FEF3C7",c:"#92400E",l:"Split"}:t==="show"?{bg:"#D1FAE5",c:"#047857",l:"Show"}:null;
  // Merge tour days with non-tour shows (post-EU shows, festivals). Use tourDays for Apr16-May31, fall back to sorted for everything else.
  const rows=useMemo(()=>{
    const tourIds=new Set((tourDaysSorted||[]).map(d=>d.date));
    const extras=(sorted||[]).filter(s=>!tourIds.has(s.date)).map(s=>({date:s.date,type:s.type||"show",show:s,city:s.city,venue:s.venue}));
    const all=[...(tourDaysSorted||[]),...extras].sort((a,b)=>a.date.localeCompare(b.date));
    if(filter==="all")return all;
    return all.filter(d=>d.type===filter);
  },[tourDaysSorted,sorted,filter]);
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.3)",zIndex:80,display:"flex",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:320,maxWidth:"90vw",height:"100%",background:"#fff",boxShadow:"-4px 0 16px rgba(0,0,0,0.12)",display:"flex",flexDirection:"column",fontFamily:"'Outfit',system-ui"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #ebe8e3",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,fontWeight:800,letterSpacing:"0.06em",color:"#0f172a"}}>{drawerLabel}</span>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#64748b"}}>×</button>
        </div>
        <div style={{padding:"10px 16px",borderBottom:"1px solid #ebe8e3",display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} style={{...UI.input,fontFamily:MN,padding:"5px 8px"}}/>
          <select value={newType} onChange={e=>setNewType(e.target.value)} style={{...UI.input,padding:"5px 8px"}}>
            <option value="off">Off Day</option>
            <option value="travel">Travel Day</option>
          </select>
          <button onClick={add} disabled={!newDate||!!shows[newDate]} style={{...UI.expandBtn(false,"#047857"),opacity:(!newDate||shows[newDate])?0.4:1}}>+ Add</button>
        </div>
        <div style={{padding:"6px 12px",borderBottom:"1px solid #ebe8e3",display:"flex",gap:4,flexWrap:"wrap"}}>
          {[["all","All"],["show","Show"],["travel","Travel"],["off","Off"],["split","Split"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)} style={{padding:"2px 8px",fontSize:9,fontWeight:700,borderRadius:10,border:`1px solid ${filter===v?"#5B21B6":"#d6d3cd"}`,background:filter===v?"#EDE9FE":"#fff",color:filter===v?"#5B21B6":"#64748b",cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        <div style={{flex:1,overflow:"auto",padding:"6px 8px"}}>
          {rows.map(d=>{const isSel=d.date===sel;const ts=typeStyle(d.type);const isDim=d.type==="off";return(
            <div key={d.date} onClick={()=>{setSel(d.date);onClose();}} className="rh" style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:7,cursor:"pointer",background:isSel?"#EDE9FE":"transparent",borderLeft:isSel?"3px solid #5B21B6":"3px solid transparent",opacity:isDim?0.65:1}}>
              <div style={{fontFamily:MN,fontSize:10,fontWeight:700,color:isSel?"#5B21B6":"#475569",width:48,flexShrink:0}}>{fD(d.date)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:600,color:"#0f172a",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.city||"—"}</div>
                <div style={{fontSize:9,color:"#64748b",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.venue}{d.bus?.note?` · ${d.bus.note}`:""}</div>
              </div>
              {ts?<span style={{fontSize:8,padding:"2px 6px",borderRadius:10,background:ts.bg,color:ts.c,fontWeight:700,flexShrink:0}}>{ts.l}</span>:null}
            </div>);})}
        </div>
      </div>
    </div>
  );
}

function Dash(){
  const{sorted,cShows,next,setTab,setSel,advances,aC,mobile}=useContext(Ctx);
  const client=CM[aC];const today=new Date().toISOString().slice(0,10);
  const upcoming=cShows.filter(s=>s.date>=today).slice(0,10);

  const flags=useMemo(()=>{const f=[];sorted.forEach(s=>{if(s.notes?.includes("⚠ Immigration")&&dU(s.date)<45)f.push({type:"CRITICAL",msg:`Immigration outstanding — ${s.city} ${fD(s.date)}`,cId:s.clientId});if(s.notes?.includes("settlement slow")&&dU(s.date)<90)f.push({type:"HIGH",msg:`Settlement risk — ${s.venue}`,cId:s.clientId});});return f;},[sorted]);

  const pendingCount=d=>{const adv=advances[d]||{};const items=adv.items||{};const custom=adv.customItems||[];return [...AT,...custom].filter(t=>(items[t.id]?.status||"pending")==="pending").length;};

  return(
    <div className="fi" style={{padding:mobile?"10px 10px 24px":"14px 20px 30px",maxWidth:900}}>
      {flags.slice(0,3).map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",background:f.type==="CRITICAL"?"#FEE2E2":"#FEF3C7",borderRadius:8,marginBottom:4,borderLeft:`3px solid ${f.type==="CRITICAL"?"#B91C1C":"#92400E"}`}}><span style={{fontSize:9,fontWeight:800,color:f.type==="CRITICAL"?"#B91C1C":"#92400E",fontFamily:MN}}>{f.type}</span><span style={{fontSize:11,color:"#0f172a",fontWeight:600}}>{f.msg}</span><span style={{fontSize:8,color:"#64748b",fontFamily:MN,marginLeft:"auto"}}>{CM[f.cId]?.short}</span></div>)}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,margin:"10px 0 14px"}}>
        {[{l:"Next Show",v:next?.city||"--",s:next?`${dU(next.date)}d`:"",c:client.color},{l:`${client.name} Shows`,v:cShows.length,s:"total",c:"#0f172a"},{l:"Open Advances",v:upcoming.filter(s=>pendingCount(s.date)>0).length,s:"pending",c:"#92400E"}].map((s,i)=><div key={i} style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"12px 14px"}}><div style={{fontSize:9,color:"#64748b",marginBottom:2,fontWeight:600}}>{s.l}</div><div style={{fontSize:20,fontWeight:800,color:s.c,fontFamily:MN}}>{s.v}</div><div style={{fontSize:9,color:"#94a3b8",fontFamily:MN,marginTop:1}}>{s.s}</div></div>)}
      </div>
      <div style={{fontSize:9,fontWeight:800,color:client.color,letterSpacing:"0.1em",marginBottom:5}}>{client.name.toUpperCase()} — UPCOMING</div>
      <div style={{display:"flex",flexDirection:"column",gap:3}}>
        {upcoming.map(show=>{const days=dU(show.date),uc=days<=7?"#B91C1C":days<=14?"#92400E":days<=21?"#1E40AF":"#c4bfb6";const pc=pendingCount(show.date);
          return(<div key={show.date} onClick={()=>{setSel(show.date);setTab("ros");}} className="br rh" style={{display:"grid",gridTemplateColumns:"34px 58px 1fr auto 54px 30px",alignItems:"center",gap:6,padding:"9px 12px",background:"#fff",border:"1px solid #d6d3cd",borderRadius:9,cursor:"pointer",borderLeft:`3px solid ${uc}`}}>
            <div style={{fontFamily:MN,fontSize:9,color:"#64748b"}}>{fW(show.date)}</div>
            <div style={{fontFamily:MN,fontSize:10,color:"#5B21B6",fontWeight:700}}>{fD(show.date)}</div>
            <div><div style={{fontSize:11,fontWeight:700}}>{show.city}</div><div style={{fontSize:9,color:"#64748b"}}>{show.venue}</div></div>
            <div style={{display:"flex",gap:3}}>{pc>0&&<span style={{fontSize:8,padding:"2px 5px",borderRadius:3,background:"#FEF3C7",color:"#92400E",fontWeight:700,fontFamily:MN}}>{pc} open</span>}{show.notes?.includes("⚠")&&<span>⚠</span>}</div>
            <div style={{fontFamily:MN,fontSize:9,fontWeight:600,color:show.doorsConfirmed?"#047857":"#92400E",textAlign:"right"}}>{fmt(show.doors)}{show.doorsConfirmed?" ✓":" ?"}</div>
            <div style={{fontFamily:MN,fontSize:11,fontWeight:800,color:uc,textAlign:"right"}}>{days}d</div>
          </div>);
        })}
      </div>
      <button onClick={()=>setTab("advance")} style={{marginTop:10,background:client.color,border:"none",borderRadius:7,color:"#fff",fontSize:11,padding:"8px 16px",cursor:"pointer",fontWeight:700}}>Open Advance Tracker →</button>
    </div>
  );
}

function AdvTab(){
  const{shows,cShows,advances,uAdv,sel,setSel,aC,mobile,checkPriv,uCheckPriv,intel,setIntel,pushUndo}=useContext(Ctx);
  const a=useAuth();const meEmail=a?.user?.email||"unknown";
  const[openDone,setOpenDone]=useState({});
  useEffect(()=>setOpenDone({}),[sel]);
  const client=CM[aC];const today=new Date().toISOString().slice(0,10);
  const upcoming=cShows.filter(s=>s.date>=today);
  const[activeDept,setActiveDept]=useState("all");
  const[showEmail,setShowEmail]=useState(false);
  const[showIntel,setShowIntel]=useState(false);
  const[emailDept,setEmailDept]=useState("all");
  const[addingDept,setAddingDept]=useState(null);
  const[newQ,setNewQ]=useState("");
  const[newDir,setNewDir]=useState("bilateral");
  const[newScope,setNewScope]=useState("public");
  const[editId,setEditId]=useState(null);
  const[editQ,setEditQ]=useState("");

  const show=shows[sel];
  const adv=advances[sel]||{};
  const items=adv.items||{};
  const customItems=adv.customItems||[];
  const overrides=adv.itemOverrides||{};

  const privList=checkPriv[sel]||[];
  const allItems=useMemo(()=>[...AT,...customItems,...privList],[customItems,privList]);
  const getQ=item=>overrides[item.id]?.q||item.q;
  const getStatus=id=>{const it=allItems.find(x=>x.id===id);if(it?.private)return it.status||"pending";return items[id]?.status||"pending";};
  const setStatus=(id,status)=>{const it=allItems.find(x=>x.id===id);
    const meta=status==="confirmed"?{confirmedBy:meEmail,confirmedAt:new Date().toISOString()}:{confirmedBy:null,confirmedAt:null};
    if(it?.private)uCheckPriv(sel,privList.map(p=>p.id===id?{...p,status,...meta}:p));
    else uAdv(sel,{items:{...items,[id]:{...items[id],status,...meta}}});};
  const setOverride=(id,q)=>uAdv(sel,{itemOverrides:{...overrides,[id]:{...overrides[id],q}}});
  const deleteCustom=id=>{const it=allItems.find(x=>x.id===id);if(!it)return;
    if(it.private){const prev=privList;uCheckPriv(sel,privList.filter(c=>c.id!==id));pushUndo(`Deleted "${(it.q||"").slice(0,40)}"`,()=>uCheckPriv(sel,prev));}
    else{const prev=customItems;uAdv(sel,{customItems:customItems.filter(c=>c.id!==id)});pushUndo(`Deleted "${(it.q||"").slice(0,40)}"`,()=>uAdv(sel,{customItems:prev}));}};
  const addCustom=dept=>{if(!newQ.trim())return;const it={id:`c${Date.now()}`,dept,dir:newDir,q:newQ.trim(),custom:true};if(newScope==="private"){uCheckPriv(sel,[...privList,{...it,private:true,status:"pending"}]);}else{uAdv(sel,{customItems:[...customItems,it]});}setNewQ("");setNewDir("bilateral");setNewScope("public");setAddingDept(null);};

  const itemDependents=adv.itemDependents||{};
  const getDependents=id=>itemDependents[id]||[];
  const toggleDependent=(id,memberId)=>{
    const cur=itemDependents[id]||[];
    const next=cur.includes(memberId)?cur.filter(x=>x!==memberId):[...cur,memberId];
    uAdv(sel,{itemDependents:{...itemDependents,[id]:next}});
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
      if(c&&best){const k=`${item.id}__${best.tid}`;if(!dismissed.has(k))out.push({itemId:item.id,threadTid:best.tid,subject:best.subject,from:best.from,confidence:c,key:k});}
    });
    return out;
  },[allItems,intel,sid,items,privList]);
  const matchFor=(id)=>matches.find(m=>m.itemId===id);

  const confirmMatch=(m)=>{
    const prev=getStatus(m.itemId);
    setStatus(m.itemId,"confirmed");
    setIntel(p=>({...p,[sid]:{...(p[sid]||{}),dismissedMatches:[...(p[sid]?.dismissedMatches||[]),m.key]}}));
    pushUndo("Item confirmed.",()=>{setStatus(m.itemId,prev);setIntel(p=>({...p,[sid]:{...(p[sid]||{}),dismissedMatches:(p[sid]?.dismissedMatches||[]).filter(k=>k!==m.key)}}));});
  };

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

  if(!show)return<div style={{padding:40,textAlign:"center",color:"#64748b"}}>Select a show.</div>;

  return(
    <div className="fi" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 115px)",position:"relative"}}>
      <div style={{padding:"5px 20px",borderBottom:"1px solid #d6d3cd",background:"#fff",display:"flex",gap:2,overflowX:"auto",flexShrink:0}}>
        {upcoming.slice(0,14).map(s=>{const isSel=s.date===sel;const adv2=advances[s.date]||{};const p2=[...AT,...(adv2.customItems||[])].filter(t=>((adv2.items||{})[t.id]?.status||"pending")==="pending").length;
          return(<button key={s.date} onClick={()=>setSel(s.date)} style={{flexShrink:0,padding:"3px 9px",borderRadius:6,border:isSel?`2px solid ${client.color}`:"1px solid #d6d3cd",background:isSel?"#fff":"#f5f3ef",color:isSel?"#0f172a":"#64748b",fontSize:9,fontWeight:isSel?700:500,cursor:"pointer",position:"relative"}}>
            <div style={{fontFamily:MN,fontSize:9}}>{fD(s.date)}</div><div style={{fontSize:8}}>{s.city}</div>
            <div style={{position:"absolute",top:1,right:1,width:5,height:5,borderRadius:"50%",background:p2===0?"#047857":p2<10?"#F59E0B":"#B91C1C"}}/>
          </button>);})}
      </div>
      <div style={{padding:"6px 20px",borderBottom:"1px solid #ebe8e3",background:"#fff",display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,fontSize:12}}>{show.venue}</span>
        <span style={{fontSize:11,color:"#64748b"}}>{show.city} · {fFull(sel)}</span>
        <span style={{fontSize:9,padding:"2px 7px",borderRadius:12,background:totalPending===0?"#D1FAE5":"#FEF3C7",color:totalPending===0?"#047857":"#92400E",fontWeight:700}}>{totalPending===0?"Complete":`${totalPending} pending`}</span>
        <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}>
          {!showEmail&&!showIntel?<>
            <select value={emailDept} onChange={e=>setEmailDept(e.target.value)} style={{fontSize:9,padding:"3px 6px",borderRadius:5,border:"1px solid #d6d3cd",background:"#f5f3ef",color:"#0f172a",cursor:"pointer"}}>
              {DEPTS.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <button onClick={()=>setShowEmail(true)} style={{background:"#5B21B6",border:"none",borderRadius:6,color:"#fff",fontSize:10,padding:"4px 11px",cursor:"pointer",fontWeight:700}}>Generate Email</button>
            <button onClick={()=>setShowIntel(true)} style={{background:"#0f172a",border:"none",borderRadius:6,color:"#fff",fontSize:10,padding:"4px 11px",cursor:"pointer",fontWeight:700}}>Intel</button>
          </>:<button onClick={()=>{setShowEmail(false);setShowIntel(false);}} style={{background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:6,color:"#475569",fontSize:10,padding:"4px 10px",cursor:"pointer",fontWeight:600}}>← Checklist</button>}
        </div>
      </div>
      {!showEmail&&<div style={{padding:"4px 20px",borderBottom:"1px solid #ebe8e3",background:"#fafaf9",display:"flex",gap:2,overflowX:"auto",flexShrink:0}}>
        {DEPTS.map(d=>{const isA=activeDept===d.id;const cnt=d.id==="all"?null:deptCounts[d.id];
          return(<button key={d.id} onClick={()=>setActiveDept(d.id)} style={{flexShrink:0,padding:"3px 10px",borderRadius:20,border:isA?`1.5px solid ${d.color}`:"1px solid #d6d3cd",background:isA?d.bg:"transparent",color:isA?d.color:"#64748b",fontSize:9,fontWeight:isA?700:500,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
            {d.label}
            {cnt&&cnt.pending>0&&<span style={{fontSize:7,background:d.color,color:"#fff",borderRadius:10,padding:"1px 4px",fontWeight:700}}>{cnt.pending}</span>}
          </button>);
        })}
      </div>}
      <div style={{flex:1,overflow:"auto",padding:"10px 20px 30px"}}>
        {showIntel?<IntelPanel/>:showEmail?(
          <div>
            <div style={{fontSize:10,color:"#64748b",marginBottom:6,fontWeight:600}}>ADVANCE EMAIL — {DM[emailDept]?.label?.toUpperCase()||"ALL DEPTS"}</div>
            <pre style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"14px",fontSize:9,fontFamily:MN,color:"#0f172a",lineHeight:1.7,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{genEmail()}</pre>
            <button onClick={()=>navigator.clipboard.writeText(genEmail())} style={{marginTop:8,background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:5,color:"#0f172a",fontSize:10,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>Copy</button>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
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
                  const col=m.confidence==="high"?"#047857":m.confidence==="medium"?"#92400E":"#64748b";
                  const bg=m.confidence==="high"?"#D1FAE5":m.confidence==="medium"?"#FEF3C7":"#f1f5f9";
                  return <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <a href={gmailUrl(m.threadTid)} target="_blank" rel="noopener noreferrer" title={`${m.subject} — ${m.from}`} style={{fontSize:7,padding:"2px 5px",borderRadius:3,background:bg,color:col,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>email · {m.confidence}</a>
                    <button onClick={()=>confirmMatch(m)} style={{fontSize:8,padding:"2px 7px",borderRadius:4,border:"none",background:"#047857",color:"#fff",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>Confirm</button>
                  </div>;
                })();
                return(
                  <div key={item.id} style={{display:"grid",gridTemplateColumns:"18px 1fr auto auto",gap:"0 8px",padding:"8px 14px",borderBottom:idx<arr.length-1?"1px solid #f5f3ef":"none",background:isEditing?"#FFFBEB":"transparent",opacity:muted?0.7:1,alignItems:"start"}}>
                    <span style={{fontFamily:MN,fontSize:8,color:"#94a3b8",paddingTop:3,textAlign:"right"}}>{idx+1}.</span>
                    <div style={{minWidth:0}}>
                      {isEditing?(
                        <input autoFocus value={editQ} onChange={e=>setEditQ(e.target.value)}
                          onBlur={()=>{setOverride(item.id,editQ);setEditId(null);}}
                          onKeyDown={e=>{if(e.key==="Enter"){setOverride(item.id,editQ);setEditId(null);}if(e.key==="Escape")setEditId(null);}}
                          style={{width:"100%",background:"#fff",border:`1.5px solid ${dept.color}`,borderRadius:4,color:"#0f172a",fontSize:10,padding:"3px 7px",outline:"none"}}/>
                      ):(
                        <div style={{display:"flex",alignItems:"flex-start",gap:4}}>
                          <span style={{fontSize:10,color:status==="na"?"#94a3b8":"#0f172a",fontWeight:500,lineHeight:1.5,flex:1,textDecoration:status==="na"?"line-through":"none"}}>{q}</span>
                          {canEdit&&!isEditing&&<button onClick={()=>{setEditId(item.id);setEditQ(q);}} style={{flexShrink:0,background:"none",border:"none",cursor:"pointer",color:"#cbd5e1",fontSize:11,padding:"0 2px",lineHeight:1.5}} title="Edit item">✎</button>}
                          {isCustom&&<button onClick={()=>deleteCustom(item.id)} style={{flexShrink:0,background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:13,padding:"0 2px",lineHeight:1.5}} title="Delete">×</button>}
                        </div>
                      )}
                      {status==="confirmed"&&meta.confirmedBy&&<div style={{fontSize:8,color:"#94a3b8",marginTop:1,fontFamily:MN}}>✓ {meta.confirmedBy} · {fmtAudit(meta.confirmedAt)}</div>}
                      <div style={{display:"flex",alignItems:"center",gap:3,marginTop:4,flexWrap:"wrap"}}>
                        <span style={{fontSize:7,padding:"1px 5px",borderRadius:3,background:item.dir==="we_provide"?"#EDE9FE":item.dir==="they_provide"?"#D1FAE5":"#f1f5f9",color:item.dir==="we_provide"?"#5B21B6":item.dir==="they_provide"?"#065F46":"#475569",fontWeight:600}}>{item.dir==="we_provide"?"We":"They"}</span>
                        {item.locked&&<span style={{fontSize:7,color:"#94a3b8",fontFamily:MN}}>🔒</span>}
                        {isCustom&&<span style={{fontSize:7,color:dept.color,fontWeight:700}}>custom</span>}
                        {item.private&&<span style={{fontSize:7,color:"#334155",fontWeight:700,background:"#e2e8f0",padding:"1px 4px",borderRadius:3}}>private</span>}
                        {!item.private&&<span style={{color:"#e2e8f0",fontSize:8,margin:"0 1px"}}>·</span>}
                        {!item.private&&TEAM_MEMBERS.map(m=>{const active=getDependents(item.id).includes(m.id);return(
                          <button key={m.id} onClick={()=>toggleDependent(item.id,m.id)} title={`${active?"Remove":"Mark"} ${m.label} as dependent`}
                            style={{fontSize:7,padding:"1px 5px",borderRadius:3,fontWeight:700,cursor:"pointer",border:"none",
                              background:active?"#FEF3C7":"#f1f5f9",color:active?"#92400E":"#94a3b8"}}>{m.initials}</button>
                        );})}
                      </div>
                    </div>
                    <div style={{paddingTop:1}}>{emailMatch}</div>
                    <div style={{paddingTop:1}}><StatusBtn status={status} setStatus={(ns)=>setStatus(item.id,ns)} mobile={mobile}/></div>
                  </div>
                );
              };
              return(
                <div key={dept.id} style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,overflow:"hidden"}}>
                  <div style={{padding:"8px 14px",background:dept.bg,display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid #d6d3cd"}}>
                    <span style={{fontSize:9,fontWeight:800,letterSpacing:"0.07em",color:dept.color}}>{dept.label.toUpperCase()}</span>
                    {pending>0&&<span style={{fontSize:8,color:dept.color,fontFamily:MN,fontWeight:700}}>{pending} pending</span>}
                    <span style={{fontSize:8,color:"#94a3b8",marginLeft:"auto"}}>{dPending.length} open · {dDone.length} done</span>
                  </div>
                  <div>
                    {dPending.map((item,idx)=>renderRow(item,idx,dPending,false))}
                    {dDone.length>0&&<div style={{borderTop:"1px solid #f5f3ef"}}>
                      <button onClick={()=>setOpenDone(p=>({...p,[dept.id]:!p[dept.id]}))} style={{width:"100%",textAlign:"left",padding:"6px 14px",background:"#fafaf9",border:"none",cursor:"pointer",fontSize:9,fontWeight:700,color:"#047857",letterSpacing:"0.06em",display:"flex",alignItems:"center",gap:6}}>
                        <span>✓ Confirmed ({dDone.length})</span>
                        <span style={{marginLeft:"auto",color:"#94a3b8"}}>{openDone[dept.id]?"▾":"▸"}</span>
                      </button>
                      {openDone[dept.id]&&<div>{dDone.map((item,idx)=>renderRow(item,idx,dDone,true))}</div>}
                    </div>}
                    {addingDept===dept.id?(
                      <div style={{padding:"8px 14px",borderTop:"1px solid #f5f3ef",background:"#fafaf9"}}>
                        <input autoFocus placeholder="Describe the advance item..." value={newQ} onChange={e=>setNewQ(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addCustom(dept.id);if(e.key==="Escape")setAddingDept(null);}} style={{width:"100%",background:"#fff",border:`1.5px solid ${dept.color}`,borderRadius:5,color:"#0f172a",fontSize:10,padding:"5px 8px",outline:"none",marginBottom:5}}/>
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          <select value={newDir} onChange={e=>setNewDir(e.target.value)} style={{fontSize:9,padding:"3px 5px",borderRadius:4,border:"1px solid #d6d3cd",background:"#fff"}}>
                            <option value="we_provide">We provide</option><option value="they_provide">They provide</option><option value="bilateral">Bilateral</option>
                          </select>
                          <select value={newScope} onChange={e=>setNewScope(e.target.value)} style={{fontSize:9,padding:"3px 5px",borderRadius:4,border:"1px solid #d6d3cd",background:"#fff"}}>
                            <option value="public">Public</option><option value="private">Private</option>
                          </select>
                          <button onClick={()=>addCustom(dept.id)} style={{background:dept.color,border:"none",borderRadius:4,color:"#fff",fontSize:9,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>Add</button>
                          <button onClick={()=>{setAddingDept(null);setNewQ("");}} style={{background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:4,color:"#64748b",fontSize:9,padding:"3px 8px",cursor:"pointer"}}>Cancel</button>
                        </div>
                      </div>
                    ):(
                      <div style={{padding:"5px 14px",borderTop:"1px solid #f5f3ef"}}>
                        <button onClick={()=>setAddingDept(dept.id)} style={{background:"none",border:`1px dashed ${dept.color}50`,borderRadius:5,color:dept.color,fontSize:9,padding:"3px 10px",cursor:"pointer",fontWeight:600,width:"100%",textAlign:"left"}}>+ Add custom {DM[dept.id]?.label} item</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <NotesPanel/>
            <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:9,fontWeight:700,color:"#64748b",marginBottom:6,letterSpacing:"0.06em"}}>THREAD & NOTES</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <div><div style={{fontSize:9,color:"#64748b",marginBottom:2}}>Gmail thread link</div><input defaultValue={adv.threadLink||""} onBlur={e=>uAdv(sel,{threadLink:e.target.value})} placeholder="https://mail.google.com/..." style={{width:"100%",background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:5,color:"#0f172a",fontSize:10,fontFamily:MN,padding:"4px 7px",outline:"none"}}/></div>
                <div><div style={{fontSize:9,color:"#64748b",marginBottom:2}}>Notes</div><textarea defaultValue={adv.notes||""} onBlur={e=>uAdv(sel,{notes:e.target.value})} placeholder="Open issues, follow-ups..." rows={2} style={{width:"100%",background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:5,color:"#0f172a",fontSize:10,padding:"4px 7px",outline:"none",resize:"vertical",fontFamily:"inherit"}}/></div>
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
      <label style={{fontSize:9,fontWeight:700,color:"#64748b",display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
        <input type="checkbox" checked={b.anchorStartAt!=null} onChange={e=>toggle("anchorStartAt",e.target.checked)}/>Start
      </label>
      {b.anchorStartAt!=null&&<input type="text" placeholder="7:00p" defaultValue={typeof b.anchorStartAt==="number"?fmt(b.anchorStartAt):b.anchorStartAt} onBlur={e=>{const m=pM(e.target.value);if(m!=null)setBF(b.id,"anchorStartAt",m);}} style={{...UI.input,fontFamily:MN,width:70}}/>}
      <label style={{fontSize:9,fontWeight:700,color:"#64748b",display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
        <input type="checkbox" checked={b.anchorEndAt!=null} onChange={e=>toggle("anchorEndAt",e.target.checked)}/>End
      </label>
      {b.anchorEndAt!=null&&<input type="text" placeholder="8:00p" defaultValue={typeof b.anchorEndAt==="number"?fmt(b.anchorEndAt):b.anchorEndAt} onBlur={e=>{const m=pM(e.target.value);if(m!=null)setBF(b.id,"anchorEndAt",m);}} style={{...UI.input,fontFamily:MN,width:70}}/>}
    </div>
  );
}

function FlightDayStrip({sel}){
  const{flights,uFlight,lodging,setTab}=useContext(Ctx);
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
      const resp=await fetch("/api/flights",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken,tourStart:"2026-04-01",tourEnd:"2026-06-30"})});
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
    <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:10,marginBottom:10,overflow:"hidden"}}>
      <div onClick={()=>setOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",userSelect:"none"}}>
        <span style={{fontSize:10,fontWeight:800,color:"#1E40AF",letterSpacing:"0.06em"}}>✈ FLIGHTS</span>
        {deps.length>0&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:8,background:"#DBEAFE",color:"#1E40AF",fontWeight:700}}>{deps.length} DEP</span>}
        {arrs.length>0&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:8,background:"#D1FAE5",color:"#047857",fontWeight:700}}>{arrs.length} ARR</span>}
        {stripMsg&&<span style={{fontSize:9,color:"#64748b",fontFamily:MN,marginLeft:4}}>{stripMsg}</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
          {hasAny>0&&<button onClick={refreshTimes} disabled={refreshing} style={{fontSize:9,padding:"2px 8px",borderRadius:5,border:"1px solid #93C5FD",background:refreshing?"#DBEAFE":"#fff",color:"#1E40AF",cursor:refreshing?"default":"pointer",fontWeight:700,flexShrink:0}}>{refreshing?"…":"↻ Times"}</button>}
          <button onClick={scanFlights} disabled={scanning} style={{fontSize:9,padding:"2px 8px",borderRadius:5,border:"none",background:scanning?"#DBEAFE":"#1E40AF",color:scanning?"#1E40AF":"#fff",cursor:scanning?"default":"pointer",fontWeight:700,flexShrink:0}}>{scanning?"Scanning…":"Scan Gmail"}</button>
        </div>
        <span style={{fontSize:10,color:"#93C5FD",flexShrink:0}}>{open?"▾":"▸"}</span>
      </div>
      {/* Lodging summary row (always visible) */}
      {(()=>{const checkIns=Object.values(lodging||{}).filter(h=>h.checkIn===sel);const checkOuts=Object.values(lodging||{}).filter(h=>h.checkOut===sel);const staying=Object.values(lodging||{}).filter(h=>h.checkIn<sel&&h.checkOut>sel);const all=[...checkIns,...checkOuts,...staying];if(!all.length)return null;return(
        <div onClick={()=>setTab("lodging")} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",borderTop:"1px solid #BBF7D0",background:"#F0FDF4",cursor:"pointer",flexWrap:"wrap"}}>
          <span style={{fontSize:9,fontWeight:800,color:"#047857",letterSpacing:"0.06em"}}>⌂ LODGING</span>
          {checkIns.map(h=><span key={h.id} style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:"#047857",color:"#fff",fontWeight:700}}>↓ {h.name}{h.checkInTime?` ${h.checkInTime}`:""}</span>)}
          {checkOuts.map(h=><span key={h.id} style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:"#94a3b8",color:"#fff",fontWeight:700}}>↑ {h.name}{h.checkOutTime?` ${h.checkOutTime}`:""}</span>)}
          {staying.map(h=><span key={h.id} style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:"#D1FAE5",color:"#065F46",fontWeight:600,border:"1px solid #A7F3D0"}}>● {h.name}</span>)}
        </div>
      );})()}
      {open&&(
        <div style={{borderTop:"1px solid #BFDBFE",display:"flex",flexDirection:"column",gap:0}}>
          {tagFlightRoles(deps,arrs).map(({f,role},i,arr)=>{
            const isDep=role==="dep";
            const sameDay=f.depDate===f.arrDate;
            const live=liveStatuses[f.id];
            const liveStyle=live?.status==="Cancelled"?{background:"#FEF2F2",borderColor:"#FECACA"}:live?.status==="Delayed"?{background:"#FFFBEB",borderColor:"#FDE68A"}:{};
            return(
              <div key={f.id} style={{padding:"10px 14px",borderBottom:i<arr.length-1?"1px solid #DBEAFE":"none",display:"grid",gridTemplateColumns:"auto 1fr auto",gap:"6px 12px",alignItems:"start",...liveStyle}}>
                {/* Left: type badge */}
                <div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"center",paddingTop:1}}>
                  <span style={{fontSize:7,fontWeight:800,padding:"2px 5px",borderRadius:4,background:isDep?"#1E40AF":"#047857",color:"#fff",letterSpacing:"0.06em"}}>{isDep?"DEP":"ARR"}</span>
                  {live?.status&&<span style={{fontSize:7,fontWeight:700,padding:"1px 4px",borderRadius:3,...(STATUS_STYLE[live.status]||STATUS_STYLE.Unknown),background:(STATUS_STYLE[live.status]||STATUS_STYLE.Unknown).bg,color:(STATUS_STYLE[live.status]||STATUS_STYLE.Unknown).c}}>{(STATUS_STYLE[live.status]||STATUS_STYLE.Unknown).label}</span>}
                </div>
                {/* Center: flight info */}
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:3}}>
                    <span style={{fontFamily:MN,fontSize:13,fontWeight:800,color:"#1E40AF"}}>{f.from}<span style={{fontSize:10,color:"#93C5FD",fontWeight:400,padding:"0 4px"}}>→</span>{f.to}</span>
                    <span style={{fontSize:10,fontWeight:700,color:"#1D4ED8"}}>{f.flightNo||f.carrier}</span>
                    {f.carrier&&f.flightNo&&<span style={{fontSize:9,color:"#64748b"}}>{f.carrier}</span>}
                    {f.confirmNo&&<span style={{fontFamily:MN,fontSize:8,color:"#94a3b8"}}>#{f.confirmNo}</span>}
                  </div>
                  {f.pax?.length>0&&<div style={{fontSize:9,color:"#475569",marginBottom:live?3:0}}>{f.pax.join(", ")}</div>}
                  {live&&<div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:9,color:"#475569"}}>
                    {live.depActual&&<span>Actual dep: <strong style={{fontFamily:MN}}>{live.depActual}</strong></span>}
                    {live.arrActual&&<span>Actual arr: <strong style={{fontFamily:MN}}>{live.arrActual}</strong></span>}
                    {live.depGate&&<span>Gate: <strong>{live.depGate}</strong></span>}
                    {live.depTerminal&&<span>T<strong>{live.depTerminal}</strong></span>}
                    {live.delayMinutes>0&&<span style={{color:"#B45309",fontWeight:700}}>+{live.delayMinutes}m delay</span>}
                    {live.aircraft&&<span style={{color:"#94a3b8"}}>{live.aircraft}</span>}
                  </div>}
                </div>
                {/* Right: times */}
                <div style={{textAlign:"right"}}>
                  <div style={{display:"flex",flexDirection:"column",gap:2,alignItems:"flex-end"}}>
                    {f.dep&&<div style={{display:"flex",alignItems:"center",gap:5}}>
                      <span style={{fontSize:8,color:"#1E40AF",fontWeight:700}}>DEP</span>
                      <span style={{fontFamily:MN,fontSize:12,fontWeight:800,color:live?.depActual&&live.depActual!==f.dep?"#B45309":"#1E40AF"}}>{live?.depActual||f.dep}</span>
                      {live?.depActual&&live.depActual!==f.dep&&<span style={{fontFamily:MN,fontSize:9,color:"#94a3b8",textDecoration:"line-through"}}>{f.dep}</span>}
                    </div>}
                    {f.arr&&<div style={{display:"flex",alignItems:"center",gap:5}}>
                      <span style={{fontSize:8,color:"#047857",fontWeight:700}}>ARR{!sameDay?` ${f.arrDate?.slice(5)}`:""}</span>
                      <span style={{fontFamily:MN,fontSize:12,fontWeight:800,color:live?.arrActual&&live.arrActual!==f.arr?"#B45309":"#047857"}}>{live?.arrActual||f.arr}</span>
                      {live?.arrActual&&live.arrActual!==f.arr&&<span style={{fontFamily:MN,fontSize:9,color:"#94a3b8",textDecoration:"line-through"}}>{f.arr}</span>}
                    </div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DayScheduleView({show,bus,split,sel}){
  const{uShow,uRos,gRos,shows,aC,flights,lodging,setTab}=useContext(Ctx);
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
    // Flights — tag last leg of a multi-leg same-day chain as "arr" (see tagFlightRoles)
    const dayDeps=Object.values(flights).filter(f=>f.status==="confirmed"&&f.depDate===sel);
    const dayArrs=Object.values(flights).filter(f=>f.status==="confirmed"&&f.arrDate===sel&&f.arrDate!==f.depDate);
    tagFlightRoles(dayDeps,dayArrs).forEach(({f,role})=>{
      const isArrOnly=role==="arr"&&f.arrDate===sel&&f.arrDate!==f.depDate;
      items.push({type:"flight",id:isArrOnly?`${f.id}_arr`:f.id,sortMin:(isArrOnly?hhmmToMin(f.arr):hhmmToMin(f.dep))??-1,f,role});
    });
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
  },[isTravel,bus,flights,lodging,sel,dayItems]);

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
    const nb={id:`item_${Date.now()}`,label:newItem.label.trim(),time:newItem.time,startMin:tMin,notes:newItem.notes,type:"custom",isDayItem:true,color:"#5B21B6",phase:"pre",duration:60,roles:["tm","pm","ld","driver"]};
    uRos(sel,[...allItems,nb]);
    setNewItem({time:"",label:"",notes:""});setAddingItem(false);
  };
  const removeItem=id=>uRos(sel,allItems.filter(b=>b.id!==id));
  const updateItem=(id,patch)=>uRos(sel,allItems.map(b=>b.id===id?{...b,...patch,startMin:patch.time!==undefined?pM(patch.time):b.startMin}:b));

  return(
    <div className="fi" style={{padding:"16px 20px",maxWidth:680}}>
      <FlightDayStrip sel={sel}/>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:800,color:"#0f172a",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {isTravel?(bus?.route||show.city||"Travel Day"):isSplit?"Split Day":(show.city||"Rest Day")}
          </div>
          <div style={{fontSize:10,color:"#64748b",fontFamily:MN}}>{fFull(sel)}</div>
        </div>
        <button onClick={()=>setEditDay(v=>!v)} style={{fontSize:9,padding:"3px 8px",borderRadius:5,border:`1px solid ${editDay?"#5B21B6":"#d6d3cd"}`,background:editDay?"#EDE9FE":"#f5f3ef",color:editDay?"#5B21B6":"#475569",cursor:"pointer",fontWeight:600,flexShrink:0}}>✏ Edit</button>
        <div style={{fontSize:8,fontWeight:800,padding:"3px 9px",borderRadius:6,background:isTravel?"#DBEAFE":isSplit?"#FEF3C7":"#F1F5F9",color:isTravel?"#1E40AF":isSplit?"#92400E":"#64748b",letterSpacing:"0.06em",flexShrink:0}}>
          {isTravel?"TRAVEL":isSplit?"SPLIT":"OFF"}
        </div>
      </div>

      {/* Edit panel */}
      {editDay&&(
        <div style={{background:"#F8FAFC",border:"1px solid #d6d3cd",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
          <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.08em",marginBottom:10}}>EDIT DAY</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
            <div>
              <div style={{fontSize:8,color:"#64748b",fontWeight:600,marginBottom:3}}>CITY / LOCATION</div>
              <input value={dayCity} onChange={e=>setDayCity(e.target.value)} placeholder="e.g. Amsterdam" style={{...UI.input,width:"100%"}}/>
            </div>
            <div>
              <div style={{fontSize:8,color:"#64748b",fontWeight:600,marginBottom:3}}>VENUE / NOTE</div>
              <input value={dayVenue} onChange={e=>setDayVenue(e.target.value)} placeholder="e.g. Hotel Okura" style={{...UI.input,width:"100%"}}/>
            </div>
          </div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:8,color:"#64748b",fontWeight:600,marginBottom:3}}>TYPE</div>
            <select value={dayType} onChange={e=>setDayType(e.target.value)} style={{...UI.input}}>
              <option value="off">Off Day</option>
              <option value="travel">Travel Day</option>
            </select>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={saveDayInfo} style={{fontSize:9,padding:"4px 10px",borderRadius:5,border:"none",background:"#047857",color:"#fff",cursor:"pointer",fontWeight:700}}>Save</button>
            <button onClick={convertToShow} style={{fontSize:9,padding:"4px 10px",borderRadius:5,border:"1px solid #d6d3cd",background:"#f5f3ef",color:"#0f172a",cursor:"pointer",fontWeight:600}}>↑ Convert to Show Day</button>
            <button onClick={()=>setEditDay(false)} style={{fontSize:9,padding:"4px 10px",borderRadius:5,border:"1px solid #d6d3cd",background:"transparent",color:"#64748b",cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Split card */}
      {split&&(
        <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
          <div style={{fontSize:9,fontWeight:800,color:"#92400E",letterSpacing:"0.08em",marginBottom:8}}>SPLIT PARTY — {split.parties.length} GROUPS</div>
          {split.parties.map(p=>(
            <div key={p.id} style={{marginBottom:8,padding:"8px 10px",background:p.bg,borderRadius:7,border:`1px solid ${p.color}30`}}>
              <div style={{fontSize:10,fontWeight:700,color:p.color,marginBottom:3}}>{p.label} <span style={{fontWeight:400,color:"#64748b"}}>· {p.location}</span></div>
              <div style={{fontSize:9,color:"#64748b",marginBottom:6}}>{p.event}</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {p.crew.map(cid=>{const c=DEFAULT_CREW.find(x=>x.id===cid);return c?(<span key={cid} style={{fontSize:8,padding:"2px 8px",borderRadius:12,background:"#fff",border:`1px solid ${p.color}40`,color:p.color,fontWeight:600}}>{c.name.split(" ")[0]} <span style={{fontWeight:400,opacity:0.7,fontSize:7}}>({c.role.split(" (")[0].split("/")[0].trim()})</span></span>):null;})}
              </div>
              {p.note&&<div style={{fontSize:8,color:"#64748b",marginTop:5,fontStyle:"italic"}}>{p.note}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Unified timeline: bus + flights + schedule items */}
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.08em"}}>TIMELINE{timeline.length>0?` · ${timeline.length}`:""}</div>
          <button onClick={()=>setAddingItem(true)} style={{fontSize:9,padding:"3px 8px",borderRadius:5,border:"1px solid #5B21B6",background:"#EDE9FE",color:"#5B21B6",cursor:"pointer",fontWeight:700}}>+ Add Item</button>
        </div>
        {addingItem&&(
          <div style={{background:"#F8FAFC",border:"1px solid #d6d3cd",borderRadius:8,padding:"10px 12px",marginBottom:8}}>
            <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
              <input placeholder="Time (e.g. 2:00p)" value={newItem.time} onChange={e=>setNewItem(p=>({...p,time:e.target.value}))} style={{...UI.input,width:110,fontFamily:MN}}/>
              <input placeholder="Label" value={newItem.label} onChange={e=>setNewItem(p=>({...p,label:e.target.value}))} style={{...UI.input,flex:1,minWidth:140}}/>
            </div>
            <input placeholder="Notes (optional)" value={newItem.notes} onChange={e=>setNewItem(p=>({...p,notes:e.target.value}))} style={{...UI.input,width:"100%",marginBottom:6,boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:6}}>
              <button onClick={addItem} style={{fontSize:9,padding:"4px 10px",borderRadius:5,border:"none",background:"#5B21B6",color:"#fff",cursor:"pointer",fontWeight:700}}>Add</button>
              <button onClick={()=>{setAddingItem(false);setNewItem({time:"",label:"",notes:""});}} style={{fontSize:9,padding:"4px 10px",borderRadius:5,border:"1px solid #d6d3cd",background:"transparent",color:"#64748b",cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {timeline.map(entry=>{
            if(entry.type==="bus"){
              const{bus:b,depMin,arrMin}=entry;
              return(
                <div key="bus" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"10px 12px",background:"#fff",border:"1px solid #d6d3cd",borderRadius:8}}>
                  <div style={{width:44,flexShrink:0,textAlign:"right"}}>
                    {depMin!=null&&<div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:"#1E40AF"}}>{fmt(depMin)}</div>}
                    {arrMin!=null&&<div style={{fontFamily:MN,fontSize:9,color:"#64748b"}}>{fmt(arrMin)}</div>}
                  </div>
                  <div style={{width:3,alignSelf:"stretch",background:"#1E40AF",borderRadius:2,opacity:0.4,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <span style={{fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:3,background:"#DBEAFE",color:"#1E40AF",letterSpacing:"0.04em"}}>BUS</span>
                      <span style={{fontSize:11,fontWeight:700,color:"#0f172a"}}>{b.route}</span>
                      {b.flag==="⚠"&&<span style={{fontSize:9,color:"#DC2626"}}>⚠</span>}
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {b.km&&<span style={{fontSize:9,color:"#64748b"}}>{b.km} km</span>}
                      {b.drive&&b.drive!=="—"&&<span style={{fontSize:9,color:"#64748b"}}>{b.drive} drive</span>}
                      {b.day&&<span style={{fontFamily:MN,fontSize:8,color:"#94a3b8"}}>Day {b.day}/30</span>}
                    </div>
                    {b.flag==="⚠"&&b.note&&<div style={{fontSize:9,color:"#DC2626",marginTop:3,fontWeight:600}}>{b.note}</div>}
                    {b.note&&b.flag!=="⚠"&&<div style={{fontSize:9,color:"#94a3b8",marginTop:2,fontStyle:"italic"}}>{b.note}</div>}
                  </div>
                </div>
              );
            }
            if(entry.type==="flight"){
              const{f,role}=entry;
              const isDep=role==="dep";
              const sameDay=f.depDate===f.arrDate;
              return(
                <div key={entry.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"10px 12px",background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8}}>
                  <div style={{width:44,flexShrink:0,textAlign:"right"}}>
                    {isDep&&f.dep&&<div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:"#1E40AF"}}>{f.dep}</div>}
                    {isDep&&f.arr&&<div style={{fontFamily:MN,fontSize:9,color:"#047857"}}>{f.arr}{!sameDay?` (${f.arrDate?.slice(5)})`:""}</div>}
                    {!isDep&&f.arr&&<div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:"#047857"}}>{f.arr}</div>}
                  </div>
                  <div style={{width:3,alignSelf:"stretch",background:isDep?"#1E40AF":"#047857",borderRadius:2,opacity:0.5,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                      <span style={{fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:3,background:isDep?"#1E40AF":"#047857",color:"#fff",letterSpacing:"0.04em"}}>{isDep?"✈ DEP":"✈ ARR"}</span>
                      <span style={{fontFamily:MN,fontSize:11,fontWeight:800,color:"#1E40AF"}}>{f.from}<span style={{fontWeight:400,color:"#93C5FD",padding:"0 3px"}}>→</span>{f.to}</span>
                      <span style={{fontSize:10,fontWeight:700,color:"#1D4ED8"}}>{f.flightNo||f.carrier}</span>
                      {f.carrier&&f.flightNo&&<span style={{fontSize:9,color:"#64748b"}}>{f.carrier}</span>}
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {f.pax?.length>0&&<span style={{fontSize:9,color:"#475569"}}>{f.pax.join(", ")}</span>}
                      {f.confirmNo&&<span style={{fontFamily:MN,fontSize:8,color:"#94a3b8"}}>#{f.confirmNo}</span>}
                      {f.fromCity&&isDep&&<span style={{fontSize:9,color:"#64748b"}}>{f.fromCity}</span>}
                      {f.toCity&&<span style={{fontSize:9,color:"#64748b"}}>{isDep?"→ ":""}{f.toCity}</span>}
                    </div>
                  </div>
                </div>
              );
            }
            if(entry.type==="lodging_in"||entry.type==="lodging_out"){
              const{h,t,type:lt}=entry;const isIn=lt==="lodging_in";
              const rooms=(h.rooms||[]).length;
              return(
                <div key={entry.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"9px 12px",background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,cursor:"pointer"}} onClick={()=>setTab("lodging")}>
                  <div style={{width:44,flexShrink:0,textAlign:"right"}}>
                    <div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:isIn?"#047857":"#64748b"}}>{t}</div>
                  </div>
                  <div style={{width:3,alignSelf:"stretch",background:isIn?"#047857":"#94a3b8",borderRadius:2,opacity:0.5,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                      <span style={{fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:3,background:isIn?"#047857":"#94a3b8",color:"#fff",letterSpacing:"0.04em"}}>{isIn?"CHECK IN":"CHECK OUT"}</span>
                      <span style={{fontSize:11,fontWeight:700,color:"#0f172a"}}>{h.name}</span>
                      {h.city&&<span style={{fontSize:9,color:"#64748b"}}>{h.city}</span>}
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {rooms>0&&<span style={{fontSize:9,color:"#475569"}}>{rooms} room{rooms!==1?"s":""}</span>}
                      {h.confirmNo&&<span style={{fontFamily:MN,fontSize:8,color:"#94a3b8"}}>#{h.confirmNo}</span>}
                    </div>
                  </div>
                </div>
              );
            }
            // type === "item"
            const item=entry.b;const isEditing=editItemId===item.id;
            return(
              <div key={item.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 10px",background:"#fff",border:`1px solid ${isEditing?"#5B21B6":"#d6d3cd"}`,borderRadius:8}}>
                {isEditing?(
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:5}}>
                    <div style={{display:"flex",gap:5}}>
                      <input defaultValue={item.time||""} onChange={e=>updateItem(item.id,{time:e.target.value})} placeholder="Time" style={{...UI.input,width:100,fontFamily:MN}}/>
                      <input defaultValue={item.label} onChange={e=>updateItem(item.id,{label:e.target.value})} placeholder="Label" style={{...UI.input,flex:1}}/>
                    </div>
                    <input defaultValue={item.notes||""} onChange={e=>updateItem(item.id,{notes:e.target.value})} placeholder="Notes" style={{...UI.input,width:"100%",boxSizing:"border-box"}}/>
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>setEditItemId(null)} style={{fontSize:9,padding:"3px 8px",borderRadius:5,border:"none",background:"#5B21B6",color:"#fff",cursor:"pointer",fontWeight:700}}>Done</button>
                      <button onClick={()=>{removeItem(item.id);setEditItemId(null);}} style={{fontSize:9,padding:"3px 8px",borderRadius:5,border:"1px solid #FECACA",background:"#FEF2F2",color:"#DC2626",cursor:"pointer"}}>Delete</button>
                    </div>
                  </div>
                ):(
                  <>
                    <div style={{fontFamily:MN,fontSize:11,fontWeight:700,color:"#5B21B6",width:44,flexShrink:0,paddingTop:1,textAlign:"right"}}>{item.startMin!=null?fmt(item.startMin):item.time||"—"}</div>
                    <div style={{width:3,height:32,background:"#5B21B6",borderRadius:2,flexShrink:0,opacity:0.5,alignSelf:"center"}}/>
                    <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setEditItemId(item.id)}>
                      <div style={{fontSize:11,fontWeight:600,color:"#0f172a"}}>{item.label}</div>
                      {item.notes&&<div style={{fontSize:9,color:"#64748b",marginTop:2}}>{item.notes}</div>}
                    </div>
                    <button onClick={()=>setEditItemId(item.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:11,padding:"0 2px",flexShrink:0}}>✏</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {timeline.length===0&&!addingItem&&(
          <div style={{padding:"18px 0",textAlign:"center",background:"#F8FAFC",border:"1px dashed #d6d3cd",borderRadius:8}}>
            <div style={{fontSize:10,color:"#94a3b8"}}>No items. Add meals, check-ins, promo events, etc.</div>
          </div>
        )}
      </div>

      {/* Off-day empty state when no items, no bus, no split */}
      {!isTravel&&!split&&timeline.length===0&&!addingItem&&(
        <div style={{padding:"24px 0",textAlign:"center"}}>
          <div style={{fontSize:20,marginBottom:6,opacity:0.25}}>◌</div>
          <div style={{fontSize:11,fontWeight:600,color:"#0f172a",marginBottom:3}}>Rest Day</div>
          <div style={{fontSize:9,color:"#94a3b8"}}>Nothing scheduled. Add items above or convert to a show day.</div>
        </div>
      )}

      {/* Notes */}
      <div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.08em"}}>NOTES</div>
          <button onClick={()=>{if(editNotes)saveNotes();else{setNotesVal(show.notes||"");setEditNotes(true);}}} style={{fontSize:9,padding:"3px 8px",borderRadius:5,border:`1px solid ${editNotes?"#5B21B6":"#d6d3cd"}`,background:editNotes?"#EDE9FE":"#f5f3ef",color:editNotes?"#5B21B6":"#475569",cursor:"pointer",fontWeight:600}}>
            {editNotes?"Save":"Edit"}
          </button>
        </div>
        {editNotes?(
          <textarea value={notesVal} onChange={e=>setNotesVal(e.target.value)} placeholder="Notes for this day..." rows={3} style={{...UI.input,width:"100%",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit",lineHeight:1.5}}/>
        ):notesVal?(
          <div style={{background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:7,padding:"8px 12px",fontSize:9,color:"#92400E",fontWeight:500}}>{notesVal}</div>
        ):(
          <div style={{fontSize:9,color:"#94a3b8",fontStyle:"italic"}}>No notes.</div>
        )}
      </div>
    </div>
  );
}

// Router: dispatches to ROSTab for show days, DayScheduleView for off/travel/split days.
// Separating into sibling components keeps React hook order stable when switching day types.
function ScheduleTab(){
  const{shows,sel,tourDays}=useContext(Ctx);
  const show=shows[sel];
  const td=tourDays?.[sel];
  const isNonShow=(show&&(show.type==="off"||show.type==="travel"))||(td&&(td.type==="off"||td.type==="travel"||td.type==="split"));
  if(isNonShow){
    const effShow=show||{type:td.type,notes:td.bus?.note};
    return <DayScheduleView show={effShow} bus={BUS_DATA_MAP[sel]||td?.bus||null} split={SPLIT_DAYS[sel]||td?.split||null} sel={sel}/>;
  }
  if(!show)return <div style={{padding:40,textAlign:"center",color:"#64748b",fontSize:11}}>No event scheduled for this date.</div>;
  return <ROSTab/>;
}

function EventSwitcher({show,sel}){
  const{selEventId,setSelEventId,uShow}=useContext(Ctx);
  const[adding,setAdding]=useState(false);
  const[newName,setNewName]=useState("");
  const[delId,setDelId]=useState(null);
  const subEvents=show.subEvents||[];
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
  if(subEvents.length===0&&!adding)return(
    <div style={{padding:"4px 20px",borderBottom:"1px solid #ebe8e3",background:"#fff",display:"flex",alignItems:"center",gap:6}}>
      <span style={{fontSize:9,color:"#94a3b8",fontStyle:"italic"}}>Single event day</span>
      <button onClick={()=>setAdding(true)} style={{fontSize:9,padding:"2px 8px",borderRadius:5,border:"1px dashed #94a3b8",background:"transparent",color:"#64748b",cursor:"pointer",fontWeight:600,marginLeft:"auto"}}>+ Add Event</button>
    </div>
  );
  return(
    <div style={{padding:"0 20px",borderBottom:"1px solid #ebe8e3",background:"#fff",display:"flex",alignItems:"center",gap:2,overflowX:"auto",scrollbarWidth:"none"}}>
      {/* Main event tab */}
      <button onClick={()=>setSelEventId(null)} style={{padding:"6px 12px",fontSize:11,fontWeight:!selEventId?700:500,color:!selEventId?"#0f172a":"#64748b",border:"none",borderBottom:!selEventId?"2px solid #0f172a":"2px solid transparent",background:"none",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
        {show.venue||"Main"}
      </button>
      {/* Sub-event tabs */}
      {subEvents.map(ev=>{
        const isA=selEventId===ev.id;
        return(
          <div key={ev.id} style={{display:"flex",alignItems:"center",flexShrink:0}}>
            <button onClick={()=>setSelEventId(ev.id)} style={{padding:"6px 10px",fontSize:11,fontWeight:isA?700:500,color:isA?"#5B21B6":"#64748b",border:"none",borderBottom:isA?"2px solid #5B21B6":"2px solid transparent",background:"none",cursor:"pointer",whiteSpace:"nowrap"}}>
              {ev.name}
            </button>
            <button onClick={()=>setDelId(delId===ev.id?null:ev.id)} style={{background:"none",border:"none",color:"#cbd5e1",fontSize:12,cursor:"pointer",padding:"0 2px",lineHeight:1}}>×</button>
            {delId===ev.id&&<span style={{fontSize:9,display:"flex",alignItems:"center",gap:4}}>
              <button onClick={()=>removeEvent(ev.id)} style={{fontSize:9,padding:"2px 6px",borderRadius:4,border:"none",background:"#FEF2F2",color:"#DC2626",cursor:"pointer",fontWeight:700}}>Delete</button>
              <button onClick={()=>setDelId(null)} style={{fontSize:9,padding:"2px 6px",borderRadius:4,border:"1px solid #d6d3cd",background:"transparent",color:"#64748b",cursor:"pointer"}}>Cancel</button>
            </span>}
          </div>
        );
      })}
      {/* Add new event */}
      {adding?(
        <div style={{display:"flex",alignItems:"center",gap:5,marginLeft:4,flexShrink:0}}>
          <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addEvent();if(e.key==="Escape"){setAdding(false);setNewName("");}}} placeholder="Event name" style={{...UI.input,width:130,fontSize:10}}/>
          <button onClick={addEvent} style={{fontSize:9,padding:"3px 8px",borderRadius:5,border:"none",background:"#5B21B6",color:"#fff",cursor:"pointer",fontWeight:700}}>Add</button>
          <button onClick={()=>{setAdding(false);setNewName("");}} style={{fontSize:9,padding:"3px 8px",borderRadius:5,border:"1px solid #d6d3cd",background:"transparent",color:"#64748b",cursor:"pointer"}}>✕</button>
        </div>
      ):(
        <button onClick={()=>setAdding(true)} style={{padding:"4px 10px",fontSize:9,fontWeight:700,color:"#64748b",border:"none",borderBottom:"2px solid transparent",background:"none",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,marginLeft:4}}>+ Event</button>
      )}
    </div>
  );
}

function ROSTab(){
  const{shows,uShow,gRos,uRos,ros,sel,setSel,cShows,role,aC,selEventId,setSelEventId}=useContext(Ctx);
  const[editB,setEditB]=useState(null);const[dOver,setDOver]=useState(null);
  const dId=useRef(null);const client=CM[aC];const show=shows[sel];
  // Sub-event support: use compound ROS key when a sub-event is selected
  const subEvent=selEventId?(show?.subEvents||[]).find(e=>e.id===selEventId)||null:null;
  const effShow=subEvent||show;
  const rosKey=selEventId?`${sel}_${selEventId}`:sel;
  const blocks=gRos(rosKey);
  if(!show)return null;
  const today=new Date().toISOString().slice(0,10);const upcoming=cShows.filter(s=>s.date>=today);

  const times=useMemo(()=>{
    const t={};const{doors,curfew,busArrive,crewCall,venueAccess,mgTime}=effShow;
    t.bus_arrive={s:busArrive,e:busArrive};t.venue_access={s:venueAccess,e:venueAccess};t.crew_call={s:crewCall,e:crewCall};
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
    for(const b of post){if(b.offsetRef==="bbno_set_end"){t[b.id]={s:hE+(b.offsetMin||0),e:hE+(b.offsetMin||0)+b.duration};continue;}t[b.id]={s:c,e:c+b.duration};c+=b.duration;}
    return t;
  },[effShow,blocks]);

  const setDur=(id,dur)=>uRos(rosKey,blocks.map(b=>b.id===id?{...b,duration:Math.max(0,dur)}:b));
  const setBF=(id,field,val)=>uRos(rosKey,blocks.map(b=>b.id===id?{...b,[field]:val}:b));
  const addBlock=phase=>{const nb={id:`custom_${Date.now()}`,label:"New Block",duration:30,phase,type:"custom",color:"#5B21B6",roles:["tm"]};const idx=blocks.map((b,i)=>b.phase===phase?i:-1).filter(i=>i>=0).pop();const next=[...blocks];if(idx==null)next.push(nb);else next.splice(idx+1,0,nb);uRos(rosKey,next);setEditB(nb.id);};
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
  const hl=b=>AB.has(b.id)||role==="tm"||b.roles?.includes(role);
  const AMAP={busArrive:"Bus Arrival",venueAccess:"Venue Access",crewCall:"Crew Call",mgTime:"M&G",doors:"Doors",curfew:"Curfew"};
  const isCustom=!subEvent&&!!CUSTOM_ROS_MAP[sel];

  if(show.type==="off"||show.type==="travel"){
    return <DayScheduleView show={show} bus={BUS_DATA_MAP[sel]||null} split={SPLIT_DAYS[sel]||null} sel={sel}/>;
  }

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
        style={{position:"relative",display:"flex",alignItems:"center",gap:8,padding:isA?"10px 14px":"7px 14px",background:isDT?"#ede9fe":"#fff",border:isA?`2px solid ${b.color}50`:isE?`1px solid ${b.color}`:"1px solid #d6d3cd",borderRadius:isA?12:8,cursor:canD?"grab":canE?"pointer":"default",opacity:hi?1:0.22,transition:"border .12s ease,background .12s ease",boxShadow:isA?"0 2px 6px rgba(0,0,0,.06)":"none",minHeight:isA?undefined:Math.max(32,Math.min(180,b.duration*0.8))}}>
        {!isA&&b.duration>0&&<div onMouseDown={e=>startResize(b,"top",e)} title="Drag to shift start" style={{position:"absolute",top:-3,left:8,right:8,height:6,cursor:"ns-resize",zIndex:2}}/>}
        {!isA&&b.duration>0&&<div onMouseDown={e=>startResize(b,"bottom",e)} title="Drag to change duration" style={{position:"absolute",bottom:-3,left:8,right:8,height:6,cursor:"ns-resize",zIndex:2}}/>}
        {canD?<div style={{color:"#94a3b8",fontSize:14,cursor:"grab",userSelect:"none",width:16,flexShrink:0,textAlign:"center"}}>⋮⋮</div>:<div style={{width:16,flexShrink:0}}/>}
        <div style={{width:54,fontFamily:MN,fontSize:12,color:isA?b.color:"#475569",fontWeight:isA?800:500,textAlign:"right",flexShrink:0}}>{fmt(t.s)}</div>
        <div style={{width:4,height:isA?28:20,background:b.color,borderRadius:2,flexShrink:0,opacity:isA?1:.5}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:isA?13:12,fontWeight:isA?800:600,color:isA?b.color:"#0f172a",display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
            {b.label}
            {isA&&cK&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:4,fontWeight:800,background:isC?"#d1fae5":"#fef3c7",color:isC?"#047857":"#92400E"}}>{isC?"CONFIRMED":"UNCONFIRMED"}</span>}
            {b.id==="curfew"&&sel==="2026-04-16"&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:4,fontWeight:800,background:"#fecaca",color:"#7F1D1D"}}>HARD</span>}
          </div>
          {b.note&&<div style={{fontSize:9,color:"#64748b",marginTop:1}}>{b.note}</div>}
        </div>
        {b.duration>0&&!isA&&b.id!=="mg_checkin"&&<div style={{fontFamily:MN,fontSize:10,color:"#475569",background:"#f5f3ef",padding:"3px 7px",borderRadius:4,flexShrink:0,border:"1px solid #d6d3cd",fontWeight:600}}>{`${b.duration}m`}</div>}
        {b.duration>0&&<div style={{width:46,fontFamily:MN,fontSize:9,color:"#94a3b8",textAlign:"right",flexShrink:0}}>{fmt(t.e)}</div>}
        {cK&&<button onClick={e=>{e.stopPropagation();uEffShow({[cK]:!isC});}} title={isC?"Confirmed":"Mark confirmed"} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:isC?"#047857":"#cbd5e1",padding:"2px 4px",flexShrink:0}}>{isC?"✓":"○"}</button>}
        {canE&&<button onClick={e=>{e.stopPropagation();setEditB(isE?null:b.id);}} title="Edit" style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:isE?"#0f172a":"#94a3b8",padding:"2px 6px",flexShrink:0,fontWeight:700,letterSpacing:1}}>{isE?"×":"⋯"}</button>}
      </div>
      {isE&&canE&&(
        <div style={{...UI.expandPanel,borderLeftColor:b.color,marginTop:-2,marginBottom:4,borderRadius:"0 0 8px 8px"}} onClick={e=>e.stopPropagation()}>
          {isA&&b.anchorKey?(
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <label style={{fontSize:9,fontWeight:700,color:"#64748b"}}>{AMAP[b.anchorKey]} TIME</label>
              <input type="text" placeholder="7:00p" defaultValue={fmt(effShow[b.anchorKey])} onKeyDown={e=>{if(e.key==="Enter"){setAnc(b.anchorKey,e.target.value);setEditB(null);}if(e.key==="Escape")setEditB(null);}} onBlur={e=>setAnc(b.anchorKey,e.target.value)} style={{...UI.input,fontFamily:MN,width:80,fontWeight:700}}/>
              <button onClick={()=>uEffShow({[b.anchorKey+"Confirmed"]:!isC})} style={UI.expandBtn(false,isC?"#047857":"#92400E")}>{isC?"✓ Confirmed":"Mark Confirmed"}</button>
              <label style={{fontSize:9,fontWeight:700,color:"#64748b",display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}><input type="checkbox" checked={!!b.isAnchor} onChange={e=>setBF(b.id,"isAnchor",e.target.checked)}/>Anchor</label>
              <button onClick={()=>removeBlock(b.id)} style={{marginLeft:"auto",background:"none",border:"none",color:"#B91C1C",fontSize:10,cursor:"pointer",fontWeight:700}}>Remove block</button>
              {b.isAnchor&&<AnchorTimes b={b} setBF={setBF}/>}
              <span style={{flexBasis:"100%",fontSize:9,color:"#94a3b8"}}>Enter = save · Esc = close</span>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr",gap:8,alignItems:"center"}}>
              <div>
                <div style={{fontSize:8,color:"#64748b",fontWeight:700,marginBottom:2}}>DURATION</div>
                <input type="number" min="0" max="480" step="5" value={b.duration} onChange={e=>setDur(b.id,parseInt(e.target.value)||0)} style={{...UI.input,fontFamily:MN,width:70,textAlign:"center"}}/>
              </div>
              <div>
                <div style={{fontSize:8,color:"#64748b",fontWeight:700,marginBottom:2}}>LABEL</div>
                <input type="text" value={b.label} onChange={e=>setBF(b.id,"label",e.target.value)} style={{...UI.input,width:"100%"}}/>
              </div>
              <div>
                <div style={{fontSize:8,color:"#64748b",fontWeight:700,marginBottom:2}}>NOTE</div>
                <input type="text" value={b.note||""} onChange={e=>setBF(b.id,"note",e.target.value)} placeholder="Optional note" style={{...UI.input,width:"100%"}}/>
              </div>
              <div style={{gridColumn:"1 / -1",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <label style={{fontSize:9,fontWeight:700,color:"#64748b",display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}><input type="checkbox" checked={!!b.isAnchor} onChange={e=>setBF(b.id,"isAnchor",e.target.checked)}/>Anchor</label>
                {b.isAnchor&&<AnchorTimes b={b} setBF={setBF}/>}
                <button onClick={()=>removeBlock(b.id)} style={{marginLeft:"auto",background:"none",border:"none",color:"#B91C1C",fontSize:10,cursor:"pointer",fontWeight:700}}>Remove block</button>
              </div>
            </div>
          )}
        </div>
      )}
      </React.Fragment>
    );
  };

  const phases=[{k:"bus_in",l:"BUS ARRIVAL",s:"Anchor"},{k:"pre",l:"PRE-SHOW",s:"Forward from Crew Call"},{k:"mg",l:"MEET & GREET",s:"Anchor"},{k:"doors",l:"DOORS",s:"Contract anchor"},{k:"show",l:"SHOW",s:"Doors +60min"},{k:"curfew",l:"CURFEW",s:sel==="2026-04-16"?"HARD":"Contract anchor"},{k:"post",l:"POST-SHOW",s:"Relative to set end"}];

  return(
    <div className="fi" style={{display:"flex",flexDirection:"column"}}>
      {/* Event switcher — always visible on show days */}
      <EventSwitcher show={show} sel={sel}/>
      <div style={{padding:"6px 20px",borderBottom:"1px solid #ebe8e3",background:"#fff",display:"flex",gap:10,flexWrap:"wrap",fontSize:11,flexShrink:0,alignItems:"center"}}>
        <span style={{fontWeight:700}}>{effShow.venue}</span><span style={{color:"#475569",fontSize:10}}>{effShow.promoter}</span>
        {isCustom&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:"#ede9fe",color:"#5B21B6",fontWeight:700}}>Custom ROS</span>}
        {subEvent&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:"#EDE9FE",color:"#5B21B6",fontWeight:700}}>{subEvent.name}</span>}
        {effShow.notes&&<span style={{color:"#92400E",fontWeight:600,fontSize:9}}>{effShow.notes}</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <button onClick={()=>uEffShow({busSkip:!effShow.busSkip})} title="Toggle Bus Arrival" style={{background:effShow.busSkip?"#f5f3ef":"#DBEAFE",border:`1px solid ${effShow.busSkip?"#d6d3cd":"#1E40AF"}`,borderRadius:5,color:effShow.busSkip?"#94a3b8":"#1E40AF",fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:700}}>{effShow.busSkip?"+ Bus":"✓ Bus"}</button>
          <button onClick={()=>uEffShow({mgSkip:!effShow.mgSkip})} title="Toggle Meet & Greet" style={{background:effShow.mgSkip?"#f5f3ef":"#D1FAE5",border:`1px solid ${effShow.mgSkip?"#d6d3cd":"#065F46"}`,borderRadius:5,color:effShow.mgSkip?"#94a3b8":"#065F46",fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:700}}>{effShow.mgSkip?"+ M&G":"✓ M&G"}</button>
          <button onClick={()=>{uRos(rosKey,null);setEditB(null);}} style={{background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:5,color:"#64748b",fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:600}}>Reset</button>
        </div>
      </div>
      <div style={{padding:"10px 20px 30px",background:"#F5F3EF"}}>
        <FlightDayStrip sel={sel}/>
        {phases.filter(ph=>!(ph.k==="mg"&&effShow.mgSkip)&&!(ph.k==="bus_in"&&effShow.busSkip)).map(ph=>{const pb=blocks.filter(b=>ph.k==="bus_in"?b.phase==="bus_in":ph.k==="curfew"?b.id==="curfew":ph.k==="doors"?b.phase==="doors":ph.k==="mg"?b.phase==="mg":b.phase===ph.k);const canAdd=!["bus_in","curfew","doors","mg"].includes(ph.k);
          return(<div key={ph.k} style={{marginBottom:6}}><div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0 3px"}}><div style={{fontSize:9,fontWeight:800,letterSpacing:"0.1em",color:"#64748b"}}>{ph.l}</div><div style={{flex:1,height:1,background:"#d6d3cd"}}/><div style={{fontSize:8,color:"#94a3b8",fontStyle:"italic"}}>{ph.s}</div>{canAdd&&<button onClick={()=>addBlock(ph.k)} title="Add block" style={{background:"none",border:"1px dashed #cbd5e1",borderRadius:5,color:"#64748b",fontSize:9,padding:"2px 8px",cursor:"pointer",fontWeight:700}}>+ Block</button>}</div><div style={{display:"flex",flexDirection:"column",gap:3}}>{pb.map(b=>renderB(b))}</div>{!pb.length&&canAdd&&<div style={{fontSize:9,color:"#94a3b8",fontStyle:"italic",padding:"4px 0"}}>No blocks — click + Block to add.</div>}</div>);
        })}
        <div style={{marginTop:12,padding:"12px 14px",background:"#fff",border:"1px solid #d6d3cd",borderRadius:12,display:"flex",gap:12,flexWrap:"wrap"}}>
          {[{l:"Bus ETA",v:fmt(effShow.busArrive),c:"#1E40AF",hide:effShow.busSkip},{l:"Crew Call",v:fmt(effShow.crewCall),c:"#92400E"},{l:"M&G",v:fmt(effShow.mgTime),c:"#065F46",hide:effShow.mgSkip},{l:"Doors",v:fmt(effShow.doors),c:"#166534"},{l:"Headline",v:times.bbno_set?`${fmt(times.bbno_set.s)}–${fmt(times.bbno_set.e)}`:"--",c:"#B91C1C"},{l:"Settlement",v:times.settlement?fmt(times.settlement.s):"--",c:"#854D0E"},{l:"Curfew",v:fmt(effShow.curfew),c:"#7F1D1D"},{l:"Bus Out",v:times.bus_depart?fmt(times.bus_depart.s):"--",c:"#1E40AF",hide:effShow.busSkip}].filter(s=>!s.hide).map((s,i)=><div key={i}><div style={{fontSize:8,color:"#64748b",marginBottom:1,fontWeight:600}}>{s.l}</div><div style={{fontFamily:MN,fontSize:12,color:s.c,fontWeight:800}}>{s.v}</div></div>)}
        </div>
      </div>
    </div>
  );
}

function TourCalendar(){
  const{setSel,setTab}=useContext(Ctx);
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
      const split=SPLIT_DAYS[iso];
      let type="off";
      if(split)type="split";
      else if(show||(bus&&bus.show))type="show";
      else if(bus)type="travel";
      result.push({iso,bus,show,split,type});
    }
    return result;
  },[busMap,showMap]);
  const TS={
    show:{l:"SHOW",c:"#047857",b:"#D1FAE5"},
    travel:{l:"TRAVEL",c:"#1E40AF",b:"#DBEAFE"},
    off:{l:"OFF",c:"#64748b",b:"#F1F5F9"},
    split:{l:"SPLIT",c:"#92400E",b:"#FEF3C7"},
  };
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
        {[
          {l:"Shows",v:days.filter(d=>d.type==="show").length,c:"#047857",b:"#D1FAE5"},
          {l:"Travel Days",v:days.filter(d=>d.type==="travel").length,c:"#1E40AF",b:"#DBEAFE"},
          {l:"Off Days",v:days.filter(d=>d.type==="off").length,c:"#64748b",b:"#F1F5F9"},
          {l:"Split Days",v:days.filter(d=>d.type==="split").length,c:"#92400E",b:"#FEF3C7"},
        ].map((s,i)=>(
          <div key={i} style={{background:s.b,border:`1px solid ${s.c}30`,borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontSize:9,color:s.c,fontWeight:700,marginBottom:2}}>{s.l}</div>
            <div style={{fontFamily:MN,fontSize:16,fontWeight:800,color:s.c}}>{s.v}</div>
          </div>
        ))}
      </div>
      <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,overflow:"hidden"}}>
        {days.map((d,i)=>{
          const ts=TS[d.type]||TS.off;
          const isOff=d.type==="off";
          const isSplit=d.type==="split";
          const isExp=expRows[d.iso];
          const hasFlag=(d.bus?.flag==="⚠")||(d.show?.notes||"").includes("⚠");
          const canExpand=isSplit||hasFlag;
          return(
            <div key={d.iso} style={{borderBottom:i<days.length-1?"1px solid #f5f3ef":"none"}}>
              <div
                onClick={()=>openDay(d.iso)}
                className="rh"
                style={{display:"grid",gridTemplateColumns:"76px 58px 1fr auto",alignItems:"center",gap:8,padding:isOff?"5px 12px":"8px 12px",background:d.type==="show"?"#F9FAFB":d.type==="travel"?"#F8FAFF":d.type==="split"?"#FFFBEB":"#fff",cursor:"pointer",opacity:isOff?0.65:1}}
              >
                <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                  <span style={{fontFamily:MN,fontSize:isOff?9:10,fontWeight:isOff?400:700,color:ts.c}}>{fD(d.iso)}</span>
                  <span style={{fontSize:8,color:"#94a3b8"}}>{fW(d.iso)}</span>
                </div>
                <div style={{background:ts.b,color:ts.c,fontSize:8,fontWeight:800,padding:"2px 6px",borderRadius:4,textAlign:"center",letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{ts.l}</div>
                <div style={{minWidth:0,overflow:"hidden"}}>
                  {d.type==="show"&&(
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:10,fontWeight:600,color:"#0f172a"}}>{d.show?.venue||d.bus?.venue}</span>
                      <span style={{fontSize:9,color:"#64748b"}}>— {d.show?.city}</span>
                      {d.show?.notes&&<span style={{fontSize:9,color:"#92400E"}}>{d.show.notes}</span>}
                      {d.show?.promoter&&<span style={{fontSize:8,color:"#94a3b8",fontStyle:"italic"}}>{d.show.promoter}</span>}
                    </div>
                  )}
                  {d.type==="travel"&&(
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:10,color:"#0f172a",fontWeight:500}}>{d.bus?.route}</span>
                      {d.bus?.km>0&&<span style={{fontFamily:MN,fontSize:9,color:"#64748b"}}>{d.bus.km}km</span>}
                      <span style={{fontFamily:MN,fontSize:9,color:"#64748b"}}>{d.bus?.drive}</span>
                      {d.bus?.dep!=="—"&&<span style={{fontFamily:MN,fontSize:9,color:"#475569"}}>↑{d.bus.dep}</span>}
                      {d.bus?.arr!=="—"&&<span style={{fontFamily:MN,fontSize:9,color:"#475569"}}>↓{d.bus.arr}</span>}
                      {d.bus?.note&&<span style={{fontSize:9,color:"#94a3b8"}}>{d.bus.note}</span>}
                    </div>
                  )}
                  {d.type==="off"&&<span style={{fontSize:9,color:"#94a3b8"}}>—</span>}
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
              {isSplit&&isExp&&(
                <div style={{padding:"0 12px 10px",background:"#FFFBEB",borderTop:"1px solid #FDE68A"}}>
                  {d.split.parties.map(p=>(
                    <div key={p.id} style={{marginTop:8,padding:"8px 10px",background:p.bg,borderRadius:7,border:`1px solid ${p.color}30`}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,fontWeight:800,color:p.color}}>{p.label}</span>
                        <span style={{fontSize:9,color:"#94a3b8"}}>·</span>
                        <span style={{fontSize:9,color:"#64748b"}}>{p.location}</span>
                        <span style={{fontSize:9,color:"#94a3b8"}}>·</span>
                        <span style={{fontSize:9,color:"#64748b"}}>{p.event}</span>
                      </div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:p.note?4:0}}>
                        {p.crew.map(cid=>{const c=crewById[cid];return c?(
                          <span key={cid} style={{fontSize:8,padding:"2px 8px",borderRadius:12,background:"#fff",border:`1px solid ${p.color}40`,color:p.color,fontWeight:600}}>
                            {c.name.split(" ")[0]} <span style={{fontWeight:400,opacity:0.7,fontSize:7}}>({c.role.split(" (")[0].split("/")[0].trim()})</span>
                          </span>
                        ):null;})}
                      </div>
                      {p.note&&<div style={{fontSize:9,color:"#64748b",fontStyle:"italic"}}>{p.note}</div>}
                    </div>
                  ))}
                </div>
              )}
              {!isSplit&&hasFlag&&isExp&&d.show?.notes&&(
                <div style={{padding:"6px 12px 8px",background:"#FEF3C7",borderTop:"1px solid #FDE68A",fontSize:9,color:"#92400E"}}>{d.show.notes}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FlightsListView(){
  const{flights,uFlight,uRos,gRos,uFin,finance,crew,setShowCrew,setSel,setTab,sorted}=useContext(Ctx);
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
  const confirmed=allFlights.filter(f=>f.status==="confirmed").sort((a,b)=>a.depDate?.localeCompare(b.depDate||"")||a.dep?.localeCompare(b.dep||"")||0);
  const byDate=confirmed.reduce((m,f)=>{(m[f.depDate]||(m[f.depDate]=[])).push(f);return m;},{});
  const dates=Object.keys(byDate).sort();

  const scanFlights=async()=>{
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session)return;
      const googleToken=session.provider_token;
      if(!googleToken){setScanMsg("Gmail access not available — re-login with Google.");return;}
      setScanning(true);setScanMsg("Scanning Gmail…");
      const resp=await fetch("/api/flights",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken,tourStart:"2026-04-01",tourEnd:"2026-06-30"})});
      if(resp.status===402){setScanMsg("Gmail session expired — re-login.");setScanning(false);return;}
      const data=await resp.json();
      if(data.error){setScanMsg(`Error: ${data.error}`);setScanning(false);return;}
      const existingKeys=new Set(allFlights.map(f=>`${f.flightNo}__${f.depDate}`));
      const novel=(data.flights||[]).filter(f=>!flights[f.id]&&!existingKeys.has(`${f.flightNo}__${f.depDate}`));
      const freshCount=novel.filter(f=>f.fresh48h).length;
      const freshTag=freshCount?` (${freshCount} from last 48h)`:"";
      if(!novel.length){setScanMsg(`Scanned ${data.threadsFound} threads${data.freshThreads?` (${data.freshThreads} from last 48h)`:""} — no new flights.`);setScanning(false);return;}
      setPendingImport(novel);
      setScanMsg(`Found ${novel.length} new flight${novel.length>1?"s":""}${freshTag} in ${data.threadsFound} threads.`);
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
      const fname=name.split(" ")[0].toLowerCase();
      const match=crew.find(c=>c.name&&c.name.toLowerCase().includes(fname));
      if(!match)return;
      if(inShow){
        setShowCrew(p=>{
          const cur=p[inShow.date]?.[match.id]||{};
          const flightIds=new Set(allLegObjs.map(l=>l.flightId));
          const existing=(cur.inbound||[]).filter(l=>!flightIds.has(l.flightId));
          return{...p,[inShow.date]:{...p[inShow.date],[match.id]:{
            ...cur,attending:true,inboundMode:"fly",inboundConfirmed:true,
            inboundDate:lastLeg.arrDate||lastLeg.depDate,inboundTime:lastLeg.arr||"",
            inbound:[...existing,...allLegObjs]
          }}};
        });
      }
      if(outShow){
        setShowCrew(p=>{
          const cur=p[outShow.date]?.[match.id]||{};
          const flightIds=new Set(allLegObjs.map(l=>l.flightId));
          const existing=(cur.outbound||[]).filter(l=>!flightIds.has(l.flightId));
          return{...p,[outShow.date]:{...p[outShow.date],[match.id]:{
            ...cur,attending:true,outboundMode:"fly",outboundConfirmed:true,
            outboundDate:firstLeg.depDate,outboundTime:firstLeg.dep||"",
            outbound:[...existing,...allLegObjs]
          }}};
        });
      }
      // Fallback: no geographic match anywhere — use arrival date as show key (old behavior).
      if(!inShow&&!outShow){
        const arrD=f.arrDate||f.depDate;
        setShowCrew(p=>{
          const cur=p[arrD]?.[match.id]||{};
          const ex=(cur.inbound||[]).filter(l=>l.flightId!==f.id);
          return{...p,[arrD]:{...p[arrD],[match.id]:{
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
    // Flights float independently on the day view — no ROS anchoring
    if(f.cost&&f.cost>0){
      const existing=finance[f.depDate]?.flightExpenses||[];
      uFin(f.depDate,{flightExpenses:[...existing.filter(e=>e.flightId!==f.id),{flightId:f.id,label:`${f.flightNo||f.carrier} ${f.from}→${f.to}`,amount:f.cost,currency:f.currency||"USD",pax:f.pax||[],carrier:f.carrier}]});
    }
    // Include this newly-confirmed flight in the itinerary pool (it may not be in flights yet).
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
        const fname=name.split(" ")[0].toLowerCase();
        const match=(crew||[]).find(c=>c.name&&c.name.toLowerCase().includes(fname));
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
    }catch{}
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
    }catch{}
    setRefreshingAll(false);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {/* Scan bar */}
      <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:10,fontWeight:800,color:"#1E40AF",letterSpacing:"0.06em"}}>✈ FLIGHTS</span>
        <span style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:"#DBEAFE",color:"#1E40AF",fontWeight:700}}>{confirmed.length} confirmed · {pending.length} pending</span>
        {scanMsg&&<span style={{fontSize:9,color:scanning?"#5B21B6":"#64748b",fontFamily:MN}}>{scanMsg}</span>}
        {reassignMsg&&<span style={{fontSize:9,color:"#065F46",fontFamily:MN,fontWeight:600}}>{reassignMsg}</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
          {confirmed.length>0&&<button onClick={reassignAllFlights} title="Re-match all confirmed flights to tour shows by airport proximity + date window" style={{background:"#f5f3ef",color:"#065F46",border:"1px solid #6EE7B7",borderRadius:6,fontSize:10,padding:"5px 12px",cursor:"pointer",fontWeight:700}}>⟲ Re-match to Shows</button>}
          {confirmed.length>0&&<button onClick={refreshAllStatus} disabled={refreshingAll} style={{background:refreshingAll?"#ebe8e3":"#f5f3ef",color:refreshingAll?"#94a3b8":"#5B21B6",border:"1px solid #d6d3cd",borderRadius:6,fontSize:10,padding:"5px 12px",cursor:refreshingAll?"default":"pointer",fontWeight:700}}>{refreshingAll?"Refreshing…":"⟳ Refresh Status"}</button>}
          <button onClick={scanFlights} disabled={scanning} style={{background:scanning?"#ebe8e3":"#1E40AF",color:scanning?"#64748b":"#fff",border:"none",borderRadius:6,fontSize:10,padding:"5px 14px",cursor:scanning?"default":"pointer",fontWeight:700}}>{scanning?"Scanning…":"Scan Gmail for Flights"}</button>
        </div>
      </div>

      {/* Pending import */}
      {pendingImport.length>0&&(
        <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:10,padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:9,fontWeight:800,color:"#1E40AF",letterSpacing:"0.06em"}}>NEW — REVIEW BEFORE IMPORTING</span>
            <button onClick={importAll} style={{fontSize:9,padding:"3px 10px",borderRadius:5,border:"none",background:"#1E40AF",color:"#fff",cursor:"pointer",fontWeight:700}}>Import All ({pendingImport.length})</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {pendingImport.map(f=>(
              <FlightCard key={f.id} f={f} crew={crew} onUpdatePax={newPax=>updatePendingImportPax(f,newPax)} actions={<>
                <button onClick={()=>importFlight(f)} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"none",background:"#1E40AF",color:"#fff",cursor:"pointer",fontWeight:700}}>Import</button>
                <button onClick={()=>setPendingImport(p=>p.filter(x=>x.id!==f.id))} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"1px solid #d6d3cd",background:"transparent",color:"#64748b",cursor:"pointer"}}>Skip</button>
                {f.tid&&<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"#1E40AF",textDecoration:"none",marginLeft:"auto"}}>open email ↗</a>}
              </>}/>
            ))}
          </div>
        </div>
      )}

      {/* Pending confirmation */}
      {pending.length>0&&(
        <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.08em",marginBottom:8}}>PENDING CONFIRMATION <span style={{background:"#FEF3C7",color:"#92400E",borderRadius:8,padding:"1px 6px",fontWeight:700,fontSize:8}}>{pending.length}</span></div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {pending.map(f=>{const isConf=confirmingId===f.id;return(
              <FlightCard key={f.id} f={f} crew={crew} onUpdatePax={newPax=>updatePax(f,newPax)} actions={<>
                <button onClick={()=>confirmFlight(f)} disabled={isConf} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"none",background:isConf?"#047857":"#1E40AF",color:"#fff",cursor:isConf?"default":"pointer",fontWeight:700}}>{isConf?"✓ Synced!":"Confirm + Sync"}</button>
                <button onClick={()=>uFlight(f.id,{...f,status:"dismissed"})} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"1px solid #d6d3cd",background:"transparent",color:"#64748b",cursor:"pointer"}}>Dismiss</button>
                {f.tid&&<a href={gmailUrl(f.tid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"#1E40AF",textDecoration:"none",marginLeft:"auto"}}>email ↗</a>}
              </>}/>
            );})}
          </div>
        </div>
      )}

      {/* Confirmed list */}
      {confirmed.length>0?(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {dates.map(date=>(
            <div key={date}>
              <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.08em",marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>goToSchedule(date)} style={{background:"none",border:"none",padding:0,cursor:"pointer",fontSize:9,fontWeight:800,color:"#5B21B6",letterSpacing:"0.08em",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:2}}>{fFull(date)}</button>
                <div style={{flex:1,height:1,background:"#d6d3cd"}}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {byDate[date].map(f=>{
                  const legs=findItineraryLegs(f,flights);
                  const firstLeg=legs[0]||f;const lastLeg=legs[legs.length-1]||f;
                  const inShow=matchShowByAirport(lastLeg.to,lastLeg.toCity,lastLeg.arrDate||lastLeg.depDate,sorted||[],"inbound");
                  const outShow=matchShowByAirport(firstLeg.from,firstLeg.fromCity,firstLeg.depDate,sorted||[],"outbound");
                  const matchBadge=(show,label,bg,c)=>show?<button onClick={()=>goToSchedule(show.date)} title={`${label} match: ${show.venue}`} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:`1px solid ${c}40`,background:bg,color:c,cursor:"pointer",fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}><span style={{fontSize:7,letterSpacing:"0.06em"}}>{label}</span>{show.city}<span style={{fontFamily:MN,fontSize:8,opacity:.7}}>{fD(show.date)}</span></button>:null;
                  return(
                    <FlightCard key={f.id} f={f}
                      crew={crew}
                      onUpdatePax={newPax=>updatePax(f,newPax)}
                      liveStatus={liveStatuses[f.id]||null}
                      refreshing={refreshingId===f.id}
                      onRefreshStatus={f.flightNo?()=>refreshStatus(f):null}
                      actions={<>
                        {matchBadge(outShow,"← OUT","#FEF3C7","#92400E")}
                        {matchBadge(inShow,"IN →","#D1FAE5","#047857")}
                        {!inShow&&!outShow&&<span style={{fontSize:9,color:"#94a3b8",fontStyle:"italic"}}>No show match — add city to airport table to match.</span>}
                        <button onClick={()=>goToSchedule(f.depDate)} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"1px solid #BFDBFE",background:"#EFF6FF",color:"#1E40AF",cursor:"pointer",fontWeight:700}}>→ Schedule {f.depDate?.slice(5)}</button>
                        {f.arrDate&&f.arrDate!==f.depDate&&<button onClick={()=>goToSchedule(f.arrDate)} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"1px solid #BFDBFE",background:"#EFF6FF",color:"#1E40AF",cursor:"pointer",fontWeight:700}}>→ Arr {f.arrDate?.slice(5)}</button>}
                        <button onClick={()=>uFlight(f.id,{...f,status:"dismissed"})} style={{marginLeft:"auto",fontSize:9,padding:"3px 9px",borderRadius:5,border:"1px solid #d6d3cd",background:"transparent",color:"#94a3b8",cursor:"pointer"}}>Remove</button>
                      </>}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ):(pendingImport.length===0&&pending.length===0&&(
        <div style={{padding:"40px 0",textAlign:"center",color:"#94a3b8"}}><div style={{fontSize:22,marginBottom:8,opacity:0.25}}>✈</div><div style={{fontSize:11}}>No flights yet.</div><div style={{fontSize:10,marginTop:4}}>Hit "Scan Gmail for Flights" above to import from email.</div></div>
      ))}
    </div>
  );
}

// Per-date aggregated view of all travel segments (flights + ground transfers + bus + rail + hotel check-ins).
// Master Tour-style: chronological list on the left, editor drawer on the right. The currently-selected show
// date (sel) drives what's displayed; header shows a prev/next stepper and jumps to the Travel Dates menu.
function TravelDayView(){
  const{flights,uFlight,sel,setSel,setDateMenu,shows,sorted,tourDaysSorted,crew,setShowCrew,showCrew,mobile,pushUndo}=useContext(Ctx);
  const[activeId,setActiveId]=useState(null);
  const[addType,setAddType]=useState(null);
  const[travelNotes,setTravelNotes]=useState("");
  const curShow=shows?.[sel];
  const curDay=(tourDaysSorted||[]).find(d=>d.date===sel);
  const title=curShow?.venue||curShow?.city||(curDay?.type==="travel"?"Travel Day":curDay?.type==="split"?"Split Day":curDay?.type==="off"?"Off Day":"—");
  const subTitle=curShow?curShow.city:(curDay?.city||"");

  // All non-dismissed segments touching sel (depDate === sel OR arrDate === sel).
  const daySegs=useMemo(()=>{
    return Object.values(flights||{})
      .filter(s=>s&&s.status!=="dismissed")
      .filter(s=>s.depDate===sel||s.arrDate===sel)
      .map(s=>{
        const isDep=s.depDate===sel;
        const isArrOnly=s.arrDate===sel&&s.arrDate!==s.depDate;
        const sortMin=(isArrOnly?hhmmToMin(s.arr):hhmmToMin(s.dep))??0;
        return{...s,_role:isArrOnly?"arr":"dep",_sort:sortMin};
      })
      .sort((a,b)=>a._sort-b._sort);
  },[flights,sel]);

  const active=daySegs.find(s=>s.id===activeId)||null;

  // Add a new segment (local-only until first save; uses timestamp-based id).
  const handleAdd=(type)=>{
    const id=`${type==="air"?"fl":"seg"}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
    const base={id,type,status:"confirmed",depDate:sel,arrDate:sel,dep:"",arr:"",from:"",to:"",fromCity:"",toCity:"",pax:[]};
    const seed=type==="ground"?{...base,mode:"uber"}:type==="hotel"?{...base,hotelName:"",arr:"15:00",dep:"11:00"}:base;
    uFlight(id,seed);
    setActiveId(id);setAddType(null);
  };

  const pax=(seg)=>(seg?.pax||[]).filter(Boolean);
  const paxMatch=name=>(crew||[]).find(c=>c.name&&c.name.toLowerCase().includes(String(name).split(" ")[0].toLowerCase()));

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12,minHeight:0}}>
      {/* Header */}
      <div style={{background:"linear-gradient(90deg,#1E1B4B 0%,#312E81 100%)",borderRadius:10,padding:"14px 18px",color:"#fff",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:18,fontWeight:800,letterSpacing:"-0.02em"}}>{title}</div>
          <div style={{fontSize:11,color:"#C7D2FE",marginTop:2}}>{subTitle}</div>
          <div style={{fontSize:9,fontFamily:MN,color:"#A5B4FC",marginTop:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Travel Notes</div>
          <textarea value={travelNotes} onChange={e=>setTravelNotes(e.target.value)} placeholder="Notes for today's travel (scratchpad, not persisted yet)" rows={2} style={{marginTop:4,width:"100%",minWidth:220,maxWidth:560,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:6,padding:"6px 9px",color:"#fff",fontSize:10,fontFamily:"'Outfit',system-ui",resize:"vertical",outline:"none"}}/>
        </div>
        <div style={{textAlign:"right",fontSize:11,color:"#C7D2FE",flexShrink:0}}>
          <div style={{fontWeight:700,fontSize:12,color:"#fff"}}>{fFull(sel)}</div>
          <div style={{fontSize:10,marginTop:2,letterSpacing:"0.04em",textTransform:"uppercase",color:"#A5B4FC"}}>{curDay?.type==="travel"?"Travel Day":curDay?.type==="split"?"Split Day":curDay?.type==="off"?"Off Day":"Show Day"}</div>
          <button onClick={()=>setDateMenu(true)} style={{marginTop:8,background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",fontSize:10,padding:"4px 10px",borderRadius:5,cursor:"pointer",fontWeight:700}}>☰ Change Day</button>
        </div>
      </div>

      {/* Add bar */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em"}}>ADD SEGMENT</span>
        {[["air","✈ Flight"],["ground","🚗 Ground"],["bus","🚌 Bus"],["rail","🚆 Rail"],["hotel","🏨 Hotel"]].map(([k,l])=>(
          <button key={k} onClick={()=>handleAdd(k)} style={{fontSize:10,padding:"4px 11px",borderRadius:6,border:`1px solid ${SEG_META[k].border}`,background:SEG_META[k].bg,color:SEG_META[k].color,cursor:"pointer",fontWeight:700}}>{l}</button>
        ))}
        <span style={{marginLeft:"auto",fontSize:9,color:"#94a3b8",fontFamily:MN}}>{daySegs.length} segment{daySegs.length===1?"":"s"} on {fD(sel)}</span>
      </div>

      {/* Day list + drawer */}
      <div style={{display:"flex",gap:12,flexWrap:mobile?"wrap":"nowrap",minHeight:0}}>
        {/* Left: day list */}
        <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:6}}>
          {daySegs.length===0&&(
            <div style={{padding:"28px 0",textAlign:"center",background:"#fff",border:"1px dashed #d6d3cd",borderRadius:10}}>
              <div style={{fontSize:22,marginBottom:6,opacity:0.25}}>◌</div>
              <div style={{fontSize:11,fontWeight:600,color:"#0f172a",marginBottom:3}}>No travel on this day</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>Use the buttons above to add a flight, ground transfer, or hotel check-in.</div>
            </div>
          )}
          {daySegs.map(s=>{
            const m=segMeta(s);const isActive=s.id===activeId;
            const timeLabel=s._role==="arr"?`Arr ${s.arr||"—"}`:`${s.dep||"—"}${s.arr?` – ${s.arr}`:""}`;
            const routeLabel=segType(s)==="hotel"?(s.hotelName||s.to||"Hotel"):`${s.from||"—"}${s.to?` → ${s.to}`:""}`;
            const detail=segType(s)==="air"?`${s.flightNo||""} ${s.carrier||""}`.trim():segType(s)==="ground"?`${s.mode||"drive"}${s.provider?` · ${s.provider}`:""}`:segType(s)==="hotel"?(s.hotelName||""):(s.carrier||s.mode||"");
            const paxList=pax(s);
            return(
              <div key={s.id} onClick={()=>setActiveId(s.id)} className="rh" style={{display:"grid",gridTemplateColumns:"20px auto 1fr auto",gap:10,padding:"9px 12px",background:"#fff",border:`1px solid ${isActive?m.border:"#d6d3cd"}`,borderLeft:`3px solid ${m.color}`,borderRadius:9,cursor:"pointer",boxShadow:isActive?"0 0 0 2px #EDE9FE":undefined}}>
                <div style={{fontSize:14,lineHeight:1,paddingTop:2}}>{m.icon}</div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2,flexShrink:0,minWidth:90}}>
                  {paxList.length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {paxList.slice(0,3).map((n,i)=>{const mch=paxMatch(n);return(
                      <span key={i} style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:mch?"#D1FAE5":"#f1f5f9",color:mch?"#047857":"#475569",fontWeight:700,letterSpacing:"0.02em"}}>{String(n).split(" ")[0].toUpperCase()}</span>
                    );})}
                    {paxList.length>3&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:"#f1f5f9",color:"#64748b",fontWeight:700}}>+{paxList.length-3}</span>}
                  </div>}
                  <div style={{fontFamily:MN,fontSize:10,fontWeight:700,color:m.color}}>{timeLabel}</div>
                </div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{routeLabel}</div>
                  {detail&&<div style={{fontSize:9,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{detail}</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                  {s._role==="arr"&&<span style={{fontSize:7,padding:"2px 5px",borderRadius:3,background:"#D1FAE5",color:"#047857",fontWeight:800,letterSpacing:"0.06em"}}>ARR</span>}
                  {s.fresh48h&&<span style={{fontSize:7,padding:"2px 5px",borderRadius:3,background:"#EDE9FE",color:"#5B21B6",fontWeight:800,letterSpacing:"0.06em"}}>NEW</span>}
                  <button onClick={e=>{e.stopPropagation();if(confirm(`Delete this ${m.label.toLowerCase()}?`)){const prev={...s};uFlight(s.id,{...s,status:"dismissed"});pushUndo(`${m.label} deleted.`,()=>uFlight(s.id,prev));if(activeId===s.id)setActiveId(null);}}} title="Delete segment" style={{background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:13,lineHeight:1,padding:"0 4px"}}>×</button>
                </div>
              </div>
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
  const inp={background:"#fff",border:"1px solid #d6d3cd",borderRadius:5,fontSize:11,padding:"5px 8px",outline:"none",fontFamily:"'Outfit',system-ui",width:"100%",boxSizing:"border-box"};
  const lab={fontSize:8,fontWeight:700,color:"#64748b",letterSpacing:"0.06em",marginBottom:3,textTransform:"uppercase"};
  const sub=(label,children)=>(<div style={{display:"flex",flexDirection:"column",gap:0,minWidth:0}}><div style={lab}>{label}</div>{children}</div>);

  return(
    <div style={{width:380,maxWidth:"100%",flexShrink:0,background:"#fff",border:`1px solid ${m.border}`,borderRadius:10,padding:12,display:"flex",flexDirection:"column",gap:10,alignSelf:"flex-start",position:"sticky",top:0}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:16}}>{m.icon}</span>
        <div style={{fontSize:13,fontWeight:800,color:m.color,letterSpacing:"-0.01em"}}>{m.label}</div>
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          {[["confirmed","Confirmed","#047857","#D1FAE5"],["pending","Pending","#92400E","#FEF3C7"]].map(([v,l,c,bg])=>(
            <button key={v} onClick={()=>setField("status",v)} style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"none",cursor:"pointer",fontWeight:700,background:seg.status===v?bg:"#f5f3ef",color:seg.status===v?c:"#64748b"}}>{l}</button>
          ))}
          <button onClick={onClose} title="Close" style={{background:"none",border:"none",cursor:"pointer",color:"#64748b",fontSize:16,lineHeight:1}}>×</button>
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
        <div style={{background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:7,padding:"8px 10px",fontSize:10}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontSize:9,fontWeight:800,color:"#92400E",letterSpacing:"0.06em"}}>AIRPORT PICKUP</span>
            <span style={{marginLeft:"auto",display:"flex",gap:2,background:"#fff",padding:2,borderRadius:5}}>
              {[[true,"With bag"],[false,"Carry-on"]].map(([v,l])=>(
                <button key={String(v)} onClick={()=>setHasBag(v)} style={{fontSize:8,padding:"2px 7px",borderRadius:3,border:"none",background:hasBag===v?"#92400E":"transparent",color:hasBag===v?"#fff":"#92400E",cursor:"pointer",fontWeight:700}}>{l}</button>
              ))}
            </span>
          </div>
          {suggestion.match?(
            <>
              <div style={{color:"#78350F"}}>
                Matched outbound <strong style={{fontFamily:MN}}>{suggestion.match.flightNo||suggestion.match.carrier}</strong> departing <strong style={{fontFamily:MN}}>{suggestion.airport}</strong> at <strong style={{fontFamily:MN}}>{suggestion.match.dep}</strong>. Arrive airport by <strong style={{fontFamily:MN,fontSize:11}}>{suggestion.arriveBy}</strong> ({suggestion.buffer} min buffer).
              </div>
              <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                <button onClick={()=>{setField("arr",suggestion.arriveBy?.replace("*",""));if(!seg.arrDate)setField("arrDate",seg.depDate);}} style={{fontSize:9,padding:"4px 10px",borderRadius:5,border:"none",background:"#92400E",color:"#fff",cursor:"pointer",fontWeight:700}}>Set arrival = {suggestion.arriveBy}</button>
                {(seg.pax||[]).length===0&&suggestion.match.pax?.length>0&&<button onClick={()=>setField("pax",suggestion.match.pax)} style={{fontSize:9,padding:"4px 10px",borderRadius:5,border:"1px solid #FDE68A",background:"#fff",color:"#92400E",cursor:"pointer",fontWeight:700}}>Copy pax from flight ({suggestion.match.pax.length})</button>}
              </div>
            </>
          ):(
            <div style={{color:"#78350F"}}>
              {suggestion.airport} buffer: <strong>{suggestion.buffer} min</strong> before scheduled dep. No matching outbound flight found in the travel day — set pax, or add the flight first.
            </div>
          )}
          <div style={{marginTop:4,fontSize:9,color:"#a16207",fontStyle:"italic"}}>Override manually if local traffic or pickup window differs.</div>
        </div>
      )}

      {/* Pax */}
      <div>
        <div style={lab}>Passengers</div>
        <PaxEditor pax={seg.pax||[]} crew={crew} onSave={newPax=>setField("pax",(newPax||[]).map(s=>String(s||"").trim()).filter(Boolean))}/>
      </div>

      {/* Notes + confirm# + cost */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {sub("Confirm #",<input value={seg.confirmNo||""} onChange={e=>setField("confirmNo",e.target.value)} style={{...inp,fontFamily:MN}}/>)}
        {sub("Cost",<input type="number" value={seg.cost||""} onChange={e=>setField("cost",Number(e.target.value)||"")} placeholder="0.00" style={inp}/>)}
      </div>
      {sub("Notes",<textarea value={seg.notes||""} onChange={e=>setField("notes",e.target.value)} rows={2} placeholder="Dispatch instructions, pickup location, etc." style={{...inp,resize:"vertical",minHeight:50}}/>)}
    </div>
  );
}

function TransTab(){
  const{flights,sel}=useContext(Ctx);
  const[view,setView]=useState("travel");
  const confirmedCount=Object.values(flights).filter(f=>f.status==="confirmed").length;
  const daySegCount=Object.values(flights).filter(s=>s.status!=="dismissed"&&(s.depDate===sel||s.arrDate===sel)).length;
  return(
    <div className="fi" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 115px)"}}>
      <div style={{padding:"7px 20px",borderBottom:"1px solid #d6d3cd",background:"#fff",display:"flex",gap:6,flexShrink:0,alignItems:"center",flexWrap:"wrap"}}>
        {[["travel",`Travel Day${daySegCount>0?` (${daySegCount})`:""}`],["calendar","Tour Calendar"],["bus","EU Bus Schedule"],["flights",`✈ Flights${confirmedCount>0?` (${confirmedCount})`:""}`],["festival","Festival Dispatch"]].map(([v,l])=>(
          <button key={v} onClick={()=>setView(v)} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #d6d3cd",background:view===v?"#5B21B6":"#f5f3ef",color:view===v?"#fff":"#64748b",fontSize:10,fontWeight:700,cursor:"pointer"}}>{l}</button>
        ))}
        {view==="bus"&&<div style={{marginLeft:"auto",fontFamily:MN,fontSize:8,color:"#94a3b8"}}>Pieter Smit T26-021201 · 8,970 km · 31 days</div>}
        {view==="calendar"&&<div style={{marginLeft:"auto",fontFamily:MN,fontSize:8,color:"#94a3b8"}}>Apr 16 – May 31 · Internet Explorer EU 2026</div>}
      </div>
      <div style={{flex:1,overflow:"auto",padding:"12px 20px 30px"}}>
        {view==="travel"&&<TravelDayView/>}
        {view==="calendar"&&<TourCalendar/>}
        {view==="bus"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
              {[{l:"Total KM",v:"8,970"},{l:"Shows",v:"17"},{l:"Drive Days",v:"13"},{l:"HOS Flags",v:"3"}].map((s,i)=><div key={i} style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:9,color:"#64748b",fontWeight:600,marginBottom:2}}>{s.l}</div><div style={{fontFamily:MN,fontSize:16,fontWeight:800}}>{s.v}</div></div>)}
            </div>
            <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,overflow:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:580}}>
                <thead><tr style={{background:"#f5f3ef"}}>{["#","Date","DOW","Route","KM","Drive","Dep","Arr","Show","⚠","Notes"].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"left",fontSize:8,fontWeight:700,color:"#64748b",letterSpacing:"0.05em",borderBottom:"1px solid #d6d3cd",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                <tbody>
                  {BUS_DATA.map(d=><tr key={d.day} style={{background:d.show?"#F0FDF4":"#fff",borderBottom:"1px solid #f5f3ef"}}>
                    <td style={{padding:"4px 8px",fontFamily:MN,fontSize:9,color:"#94a3b8"}}>{d.day}</td>
                    <td style={{padding:"4px 8px",fontFamily:MN,fontSize:9,fontWeight:700,color:d.show?"#047857":"#0f172a"}}>{d.date}</td>
                    <td style={{padding:"4px 8px",fontSize:9,color:"#64748b"}}>{d.dow}</td>
                    <td style={{padding:"4px 8px",fontSize:9,maxWidth:160}}>{d.show?<span style={{fontWeight:600,color:"#047857"}}>{d.venue}</span>:d.route}</td>
                    <td style={{padding:"4px 8px",fontFamily:MN,fontSize:9,color:"#475569"}}>{d.km||"—"}</td>
                    <td style={{padding:"4px 8px",fontFamily:MN,fontSize:9,color:d.flag==="⚠"?"#B91C1C":"#0f172a",fontWeight:d.flag?"700":"400"}}>{d.drive}</td>
                    <td style={{padding:"4px 8px",fontFamily:MN,fontSize:9,color:"#64748b"}}>{d.dep}</td>
                    <td style={{padding:"4px 8px",fontFamily:MN,fontSize:9,color:"#64748b"}}>{d.arr}</td>
                    <td style={{padding:"4px 8px",fontSize:9,color:"#047857"}}>{d.show?"✓":""}</td>
                    <td style={{padding:"4px 8px",fontSize:11}}>{d.flag}</td>
                    <td style={{padding:"4px 8px",fontSize:9,color:"#94a3b8",maxWidth:130}}>{d.note}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {view==="flights"&&<FlightsListView/>}
        {view==="festival"&&(
          <div style={{padding:"40px 0",textAlign:"center",color:"#64748b"}}><div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Festival Dispatch</div><div style={{fontSize:11,color:"#94a3b8"}}>Olivia manages driver pool for Beyond Wonderland and Wakaan.<br/>Payout log is in Finance → Payment Batch.</div></div>
        )}
      </div>
    </div>
  );
}

function FinLedger(){
  const{shows,finance,flights,setUploadOpen}=useContext(Ctx);
  const[filterCat,setFilterCat]=useState("all");
  const[filterCur,setFilterCur]=useState("all");
  const[sortCol,setSortCol]=useState("date");
  const[sortDir,setSortDir]=useState(1);

  const rows=useMemo(()=>{
    const out=[];
    Object.entries(finance).forEach(([date,fin])=>{
      if(!fin)return;
      const show=shows[date];
      const showLabel=show?`${show.city||""} — ${show.venue||""}`.replace(/^ — |—\s*$/,"").trim():fD(date);
      // Flight expenses
      (fin.flightExpenses||[]).forEach(fe=>{
        if(!fe.amount&&fe.amount!==0)return;
        out.push({id:fe.flightId||`fe_${date}_${Math.random()}`,date,show:showLabel,cat:"Flight",desc:fe.label||"",payee:(fe.pax||[]).join(", ")||"—",amount:parseFloat(fe.amount||0),currency:fe.currency||"USD",status:"confirmed",ref:fe.carrier||""});
      });
      // Payouts
      (fin.payouts||[]).forEach(p=>{
        out.push({id:p.id||`po_${date}_${Math.random()}`,date,show:showLabel,cat:"Payout",desc:`${p.dept||""}${p.role?` · ${p.role}`:""}`,payee:p.name||"—",amount:parseFloat(p.amount||0),currency:p.currency||"USD",status:p.status||"pending",ref:p.method||""});
      });
      // Settlement amount
      if(fin.settlementAmount&&parseFloat(fin.settlementAmount)>0){
        out.push({id:`sa_${date}`,date,show:showLabel,cat:"Settlement",desc:"Settlement payment",payee:"—",amount:parseFloat(fin.settlementAmount),currency:"USD",status:fin.stages?.payment_initiated?"confirmed":"pending",ref:fin.wireRef||""});
      }
    });
    return out;
  },[finance,shows]);

  const cats=[...new Set(rows.map(r=>r.cat))].sort();
  const curs=[...new Set(rows.map(r=>r.currency))].sort();

  const filtered=rows.filter(r=>(filterCat==="all"||r.cat===filterCat)&&(filterCur==="all"||r.currency===filterCur));

  const sorted=[...filtered].sort((a,b)=>{
    let va=a[sortCol],vb=b[sortCol];
    if(sortCol==="amount"){va=a.amount;vb=b.amount;}
    if(typeof va==="string")va=va.toLowerCase();
    if(typeof vb==="string")vb=vb.toLowerCase();
    return va<vb?-sortDir:va>vb?sortDir:0;
  });

  const totals=filtered.reduce((m,r)=>{m[r.currency]=(m[r.currency]||0)+r.amount;return m;},{});

  const th=(label,col)=>{
    const active=sortCol===col;
    return <th onClick={()=>{if(active)setSortDir(d=>-d);else{setSortCol(col);setSortDir(1);}}} style={{padding:"6px 8px",textAlign:"left",fontSize:8,fontWeight:700,color:active?"#5B21B6":"#64748b",letterSpacing:"0.05em",borderBottom:"1px solid #d6d3cd",cursor:"pointer",whiteSpace:"nowrap",userSelect:"none",background:"#f5f3ef"}}>
      {label}{active?sortDir===1?" ↑":" ↓":""}
    </th>;
  };

  const CAT_COLOR={Flight:{bg:"#DBEAFE",c:"#1E40AF"},Payout:{bg:"#EDE9FE",c:"#5B21B6"},Settlement:{bg:"#D1FAE5",c:"#047857"}};

  return(
    <div style={{flex:1,overflow:"auto",padding:"14px 20px 30px",display:"flex",flexDirection:"column",gap:12}}>
      {/* Filters + totals bar */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em"}}>CATEGORY</span>
        {["all",...cats].map(c=><button key={c} onClick={()=>setFilterCat(c)} style={{fontSize:9,padding:"3px 9px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,background:filterCat===c?"#0f172a":"#f1f5f9",color:filterCat===c?"#fff":"#475569"}}>{c==="all"?"All":c}</button>)}
        <span style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em",marginLeft:8}}>CURRENCY</span>
        {["all",...curs].map(c=><button key={c} onClick={()=>setFilterCur(c)} style={{fontSize:9,padding:"3px 9px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,background:filterCur===c?"#0f172a":"#f1f5f9",color:filterCur===c?"#fff":"#475569"}}>{c==="all"?"All":c}</button>)}
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {Object.entries(totals).map(([cur,amt])=><span key={cur} style={{fontSize:11,fontWeight:800,fontFamily:MN,color:"#0f172a"}}>{cur} {amt.toFixed(2)}</span>)}
          <button onClick={()=>setUploadOpen(true)} style={{fontSize:9,padding:"3px 10px",borderRadius:6,border:"none",background:"#5B21B6",color:"#fff",cursor:"pointer",fontWeight:700}}>↑ Upload</button>
        </div>
      </div>
      {sorted.length===0?(
        <div style={{textAlign:"center",padding:"40px 0",color:"#94a3b8",fontSize:11}}>No expenses logged.</div>
      ):(
        <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{[["date","Date"],["show","Show"],["cat","Category"],["payee","Payee"],["desc","Description"],["amount","Amount"],["currency","Curr"],["status","Status"],["ref","Ref"]].map(([col,label])=>th(label,col))}</tr></thead>
            <tbody>
              {sorted.map((r,i)=>{
                const cc=CAT_COLOR[r.cat]||{bg:"#f1f5f9",c:"#475569"};
                return(
                  <tr key={r.id} style={{borderBottom:"1px solid #f5f3ef",background:i%2===0?"#fff":"#fafaf9"}}>
                    <td style={{padding:"6px 8px",fontFamily:MN,fontSize:9,color:"#64748b",whiteSpace:"nowrap"}}>{r.date}</td>
                    <td style={{padding:"6px 8px",fontSize:10,color:"#0f172a",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.show}</td>
                    <td style={{padding:"6px 8px"}}><span style={{fontSize:8,padding:"2px 6px",borderRadius:4,fontWeight:700,background:cc.bg,color:cc.c}}>{r.cat}</span></td>
                    <td style={{padding:"6px 8px",fontSize:10,fontWeight:600,color:"#0f172a"}}>{r.payee}</td>
                    <td style={{padding:"6px 8px",fontSize:9,color:"#64748b",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.desc}</td>
                    <td style={{padding:"6px 8px",fontFamily:MN,fontSize:11,fontWeight:700,color:"#0f172a",textAlign:"right"}}>{r.amount.toFixed(2)}</td>
                    <td style={{padding:"6px 8px",fontSize:9,color:"#64748b"}}>{r.currency}</td>
                    <td style={{padding:"6px 8px"}}><span style={{fontSize:8,padding:"2px 5px",borderRadius:3,fontWeight:700,background:r.status==="confirmed"?"#D1FAE5":"#FEF3C7",color:r.status==="confirmed"?"#047857":"#92400E"}}>{r.status}</span></td>
                    <td style={{padding:"6px 8px",fontFamily:MN,fontSize:8,color:"#94a3b8"}}>{r.ref||"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{padding:"8px 12px",background:"#f5f3ef",borderTop:"1px solid #d6d3cd",display:"flex",gap:16,flexWrap:"wrap"}}>
            {Object.entries(totals).map(([cur,amt])=>(
              <div key={cur} style={{fontSize:9}}>
                <span style={{color:"#64748b",fontWeight:700}}>{cur} total: </span>
                <span style={{fontFamily:MN,fontWeight:800,color:"#0f172a"}}>{amt.toFixed(2)}</span>
                <span style={{color:"#94a3b8",marginLeft:5}}>({filtered.filter(r=>r.currency===cur).length} entries)</span>
              </div>
            ))}
            <span style={{marginLeft:"auto",fontSize:9,color:"#94a3b8"}}>{sorted.length} rows</span>
          </div>
        </div>
      )}
    </div>
  );
}

function FinTab(){
  const{shows,cShows,finance,uFin,pushUndo}=useContext(Ctx);
  const today=new Date().toISOString().slice(0,10);
  const[finView,setFinView]=useState("settlement");
  const[selS,setSelS]=useState(null);
  const[addP,setAddP]=useState(false);
  const[pForm,setPForm]=useState({name:"",role:"",dept:"Drivers",amount:"",currency:"USD",method:"Wire",status:"pending"});
  const allS=[...cShows.filter(s=>s.date<today).slice(-3).reverse(),...cShows.filter(s=>s.date>=today)].slice(0,22);
  const show=selS?shows[selS]:null;
  const fin=selS?finance[selS]||{}:{};
  const stages=fin.stages||{};
  const payouts=fin.payouts||[];
  const toggleStage=id=>uFin(selS,{stages:{...stages,[id]:!stages[id]}});
  const done=["wire_ref_confirmed","signed_sheet","payment_initiated"].every(id=>stages[id]);
  const addPayout=()=>{if(!selS||!pForm.name||!pForm.amount)return;uFin(selS,{payouts:[...payouts,{...pForm,id:`p${Date.now()}`,date:today}]});setPForm({name:"",role:"",dept:"Drivers",amount:"",currency:"USD",method:"Wire",status:"pending"});setAddP(false);};
  const currencies=[...new Set(payouts.map(p=>p.currency))];
  const batchTotal=cur=>payouts.filter(p=>p.currency===cur).reduce((s,p)=>s+parseFloat(p.amount||0),0).toFixed(2);
  const curStatus=!selS?"":done?"settled":stages["payment_initiated"]?"in_progress":"pending";

  return(
    <div className="fi" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 115px)"}}>
      {/* Sub-tab bar */}
      <div style={{display:"flex",gap:0,borderBottom:"1px solid #d6d3cd",background:"#fff",flexShrink:0,padding:"0 16px"}}>
        {[["settlement","Settlement"],["ledger","Ledger"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFinView(v)} style={{padding:"8px 16px",fontSize:11,fontWeight:finView===v?700:500,color:finView===v?"#0f172a":"#64748b",border:"none",borderBottom:finView===v?"2px solid #0f172a":"2px solid transparent",background:"none",cursor:"pointer",letterSpacing:"0.01em"}}>{l}</button>
        ))}
      </div>
      {finView==="ledger"&&<FinLedger/>}
      {finView==="settlement"&&<div style={{display:"flex",flex:1,overflow:"hidden"}}>
      <div style={{width:195,borderRight:"1px solid #d6d3cd",background:"#fff",overflow:"auto",flexShrink:0}}>
        <div style={{padding:"7px 12px",fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.08em",borderBottom:"1px solid #ebe8e3"}}>SHOWS</div>
        {allS.map(s=>{const f=finance[s.date]||{};const st2=f.stages||{};const ok=["wire_ref_confirmed","signed_sheet","payment_initiated"].every(id=>st2[id]);const ip=st2["payment_initiated"];const past=s.date<today;const isSel=selS===s.date;
          return(<div key={s.date} onClick={()=>setSelS(s.date)} className="br rh" style={{padding:"7px 12px",cursor:"pointer",borderBottom:"1px solid #f5f3ef",background:isSel?"#f5f3ef":"transparent"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:1}}>
              <span style={{fontFamily:MN,fontSize:9,color:"#64748b"}}>{fD(s.date)}</span>
              <span style={{fontSize:7,padding:"1px 4px",borderRadius:3,background:ok?"#D1FAE5":ip?"#DBEAFE":"#FEF3C7",color:ok?"#047857":ip?"#1E40AF":"#92400E",fontWeight:700}}>{ok?"Done":ip?"Active":"Pending"}</span>
            </div>
            <div style={{fontSize:10,fontWeight:600,color:past?"#94a3b8":"#0f172a"}}>{s.city}</div>
            <div style={{fontSize:9,color:"#94a3b8"}}>{s.venue}</div>
          </div>);
        })}
      </div>
      <div style={{flex:1,overflow:"auto",padding:"14px 20px 30px"}}>
        {!selS?(<div style={{textAlign:"center",padding:"40px 0",color:"#94a3b8"}}><div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Finance</div><div style={{fontSize:11}}>Select a show.</div></div>):(
          <div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:14,fontWeight:800}}>{show?.city} — {show?.venue}</div>
              <div style={{fontSize:10,color:"#64748b",fontFamily:MN,marginTop:1}}>{fFull(selS)}</div>
              {done&&<div style={{marginTop:6,display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",background:"#D1FAE5",borderRadius:8,fontSize:10,fontWeight:800,color:"#047857"}}>SETTLEMENT DONE ✓</div>}
            </div>
            <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"14px",marginBottom:10}}>
              <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.08em",marginBottom:10}}>SETTLEMENT PIPELINE</div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:8,fontWeight:700,color:"#64748b",marginBottom:4,letterSpacing:"0.06em"}}>PRE-EVENT</div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {PRE_STAGES.map(s=><div key={s.id} onClick={()=>toggleStage(s.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:7,border:"1px solid #d6d3cd",background:stages[s.id]?"#F0FDF4":"#fff",cursor:"pointer"}}>
                    <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${stages[s.id]?"#047857":"#d6d3cd"}`,background:stages[s.id]?"#047857":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{stages[s.id]&&<span style={{color:"#fff",fontSize:11,lineHeight:1}}>✓</span>}</div>
                    <span style={{fontSize:11,color:"#0f172a",fontWeight:stages[s.id]?600:400}}>{s.l}</span>
                  </div>)}
                </div>
              </div>
              <div>
                <div style={{fontSize:8,fontWeight:700,color:"#64748b",marginBottom:4,letterSpacing:"0.06em"}}>POST-EVENT</div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {POST_STAGES.map(s=>{const isDone=stages[s.id];return(
                    <div key={s.id} onClick={()=>toggleStage(s.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:7,border:`1px solid ${s.req?"#d97706":"#d6d3cd"}`,background:isDone?"#F0FDF4":"#fff",cursor:"pointer"}}>
                      <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${isDone?"#047857":s.req?"#d97706":"#d6d3cd"}`,background:isDone?"#047857":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{isDone&&<span style={{color:"#fff",fontSize:11,lineHeight:1}}>✓</span>}</div>
                      <span style={{fontSize:11,color:"#0f172a",fontWeight:isDone?600:400,flex:1}}>{s.l}</span>
                      {s.req&&!isDone&&<span style={{fontSize:8,color:"#d97706",fontWeight:700}}>required</span>}
                    </div>
                  );})}
                </div>
              </div>
              {!done&&stages["payment_initiated"]&&<div style={{marginTop:8,padding:"7px 10px",background:"#FEF3C7",borderRadius:7,fontSize:10,color:"#92400E",fontWeight:600}}>Wire ref # and signed settlement sheet both required to mark as done.</div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginTop:10}}>
                {[{l:"Wire Ref #",k:"wireRef",ph:"REF-20260520"},{l:"Wire Date",k:"wireDate",ph:"2026-05-22"},{l:"Settlement Amount",k:"settlementAmount",ph:"0.00"}].map(f=><div key={f.k}><div style={{fontSize:9,color:"#64748b",marginBottom:2}}>{f.l}</div><input defaultValue={fin[f.k]||""} onBlur={e=>{const v=e.target.value;const prev=fin[f.k]||"";if(v===prev)return;uFin(selS,{[f.k]:v});pushUndo(`${f.l} updated.`,()=>uFin(selS,{[f.k]:prev}));}} placeholder={f.ph} style={{width:"100%",background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:5,color:"#0f172a",fontSize:10,fontFamily:MN,padding:"4px 6px",outline:"none"}}/></div>)}
              </div>
              <div style={{marginTop:7}}><div style={{fontSize:9,color:"#64748b",marginBottom:2}}>Settlement Notes</div><textarea defaultValue={fin.notes||""} onBlur={e=>{const v=e.target.value;const prev=fin.notes||"";if(v===prev)return;uFin(selS,{notes:v});pushUndo("Settlement notes updated.",()=>uFin(selS,{notes:prev}));}} placeholder="Deductions, disputes, bonus splits..." rows={2} style={{width:"100%",background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:5,color:"#0f172a",fontSize:10,padding:"4px 6px",outline:"none",resize:"vertical",fontFamily:"inherit"}}/></div>
            </div>
            {(fin.flightExpenses||[]).length>0&&<div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"14px",marginBottom:10}}>
              <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.08em",marginBottom:8}}>FLIGHT EXPENSES</div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:"#f5f3ef"}}>{["Flight","Route","Carrier","Pax","Amount","Curr"].map(h=><th key={h} style={{padding:"5px 7px",textAlign:"left",fontSize:8,fontWeight:700,color:"#64748b",letterSpacing:"0.05em",borderBottom:"1px solid #d6d3cd"}}>{h}</th>)}</tr></thead>
                <tbody>{(fin.flightExpenses||[]).map((fe,i)=><tr key={fe.flightId||i} style={{borderBottom:"1px solid #f5f3ef"}}>
                  <td style={{padding:"5px 7px",fontFamily:MN,fontSize:9,fontWeight:700}}>{fe.label?.split(" ")[0]||"—"}</td>
                  <td style={{padding:"5px 7px",fontSize:10}}>{fe.label?.split(" ").slice(1).join(" ")||"—"}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:"#475569"}}>{fe.carrier||"—"}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:"#64748b"}}>{(fe.pax||[]).join(", ")||"—"}</td>
                  <td style={{padding:"5px 7px",fontFamily:MN,fontSize:10,fontWeight:700,color:fe.amount?"#0f172a":"#94a3b8"}}>{fe.amount!=null?fe.amount:"—"}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:"#64748b"}}>{fe.currency||"—"}</td>
                </tr>)}
                </tbody>
              </table>
              {[...new Set((fin.flightExpenses||[]).map(fe=>fe.currency).filter(Boolean))].map(cur=>{const t=(fin.flightExpenses||[]).filter(fe=>fe.currency===cur&&fe.amount!=null).reduce((s,fe)=>s+parseFloat(fe.amount||0),0);return t>0?<div key={cur} style={{marginTop:6,padding:"5px 8px",background:"#EFF6FF",borderRadius:5,fontSize:9,color:"#1E40AF"}}><span style={{fontWeight:700}}>Flight total {cur}: </span><span style={{fontFamily:MN,fontWeight:700}}>{t.toFixed(2)}</span></div>:null;})}
            </div>}
            <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"14px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div>
                  <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.08em"}}>PAYMENT BATCH</div>
                  <div style={{marginTop:2}}>{currencies.map(cur=><span key={cur} style={{fontSize:9,fontFamily:MN,fontWeight:700,color:"#0f172a",marginRight:10}}>{cur} {batchTotal(cur)}</span>)}</div>
                </div>
                <button onClick={()=>setAddP(v=>!v)} style={{fontSize:9,padding:"4px 10px",borderRadius:5,border:"none",cursor:"pointer",fontWeight:700,background:"#5B21B6",color:"#fff"}}>+ Add Payout</button>
              </div>
              {addP&&<div style={{background:"#f5f3ef",borderRadius:8,padding:"10px",marginBottom:10}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 70px 65px 70px 80px",gap:5,marginBottom:5}}>
                  <input placeholder="Payee name" value={pForm.name} onChange={e=>setPForm(p=>({...p,name:e.target.value}))} style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
                  <input placeholder="Amount" value={pForm.amount} onChange={e=>setPForm(p=>({...p,amount:e.target.value}))} style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:MN}}/>
                  <select value={pForm.currency} onChange={e=>setPForm(p=>({...p,currency:e.target.value}))} style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
                    {["USD","CAD","GBP","EUR"].map(c=><option key={c}>{c}</option>)}
                  </select>
                  <select value={pForm.method} onChange={e=>setPForm(p=>({...p,method:e.target.value}))} style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
                    {["Wire","ACH","Check"].map(m=><option key={m}>{m}</option>)}
                  </select>
                  <select value={pForm.dept} onChange={e=>setPForm(p=>({...p,dept:e.target.value}))} style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:4,fontSize:10,padding:"4px 5px",outline:"none"}}>
                    {["Drivers","AR Staff","Production","Vendors","Site Ops","Quartermaster","Other"].map(d=><option key={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",gap:5}}>
                  <input placeholder="Role / position" value={pForm.role} onChange={e=>setPForm(p=>({...p,role:e.target.value}))} style={{flex:1,background:"#fff",border:"1px solid #d6d3cd",borderRadius:4,fontSize:10,padding:"4px 6px",outline:"none"}}/>
                  <button onClick={addPayout} style={{background:"#047857",border:"none",borderRadius:4,color:"#fff",fontSize:10,padding:"4px 12px",cursor:"pointer",fontWeight:700}}>Add</button>
                  <button onClick={()=>setAddP(false)} style={{background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:4,color:"#64748b",fontSize:10,padding:"4px 8px",cursor:"pointer"}}>Cancel</button>
                </div>
              </div>}
              {payouts.length>0?(<table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:"#f5f3ef"}}>{["Name","Role","Dept","Amount","Curr","Method","Status","Date"].map(h=><th key={h} style={{padding:"5px 7px",textAlign:"left",fontSize:8,fontWeight:700,color:"#64748b",letterSpacing:"0.05em",borderBottom:"1px solid #d6d3cd"}}>{h}</th>)}</tr></thead>
                <tbody>{payouts.map((p,i)=><tr key={p.id||i} style={{borderBottom:"1px solid #f5f3ef"}}>
                  <td style={{padding:"5px 7px",fontSize:10,fontWeight:600}}>{p.name}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:"#475569"}}>{p.role}</td>
                  <td style={{padding:"5px 7px",fontSize:8}}><span style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:3,color:"#475569",fontWeight:600}}>{p.dept}</span></td>
                  <td style={{padding:"5px 7px",fontFamily:MN,fontSize:10,fontWeight:700}}>{p.amount}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:"#64748b"}}>{p.currency}</td>
                  <td style={{padding:"5px 7px",fontSize:9,color:"#64748b"}}>{p.method}</td>
                  <td style={{padding:"5px 7px"}}><span style={{fontSize:8,padding:"2px 5px",borderRadius:3,background:p.status==="confirmed"?"#D1FAE5":"#FEF3C7",color:p.status==="confirmed"?"#047857":"#92400E",fontWeight:700}}>{p.status}</span></td>
                  <td style={{padding:"5px 7px",fontFamily:MN,fontSize:9,color:"#94a3b8"}}>{p.date}</td>
                </tr>)}</tbody>
              </table>):<div style={{fontSize:11,color:"#94a3b8",textAlign:"center",padding:"14px 0"}}>No payouts logged.</div>}
              {payouts.length>0&&currencies.map(cur=><div key={cur} style={{marginTop:8,padding:"6px 10px",background:"#f8f7f5",borderRadius:6,fontSize:9,color:"#475569"}}><span style={{fontWeight:700}}>Batch total {cur}: </span><span style={{fontFamily:MN,fontWeight:700,color:"#0f172a"}}>{batchTotal(cur)}</span><span style={{marginLeft:8,color:"#94a3b8"}}>({payouts.filter(p=>p.currency===cur).length} payees)</span></div>)}
            </div>
          </div>
        )}
      </div>
      </div>}
    </div>
  );
}

const DOC_TYPE_META={
  RECEIPT:{label:"Receipt",bg:"#FEF3C7",c:"#92400E",icon:"🧾"},
  INVOICE:{label:"Invoice",bg:"#FEF3C7",c:"#92400E",icon:"📋"},
  FLIGHT_CONFIRMATION:{label:"Flight Confirmation",bg:"#DBEAFE",c:"#1E40AF",icon:"✈"},
  TRAVEL_ITINERARY:{label:"Travel Itinerary",bg:"#DBEAFE",c:"#1E40AF",icon:"🗺"},
  SHOW_CONTRACT:{label:"Show Contract",bg:"#D1FAE5",c:"#047857",icon:"📄"},
  VENUE_TECH_PACK:{label:"Venue Tech Pack",bg:"#EDE9FE",c:"#5B21B6",icon:"🔧"},
  EXPENSE_REPORT:{label:"Expense Report",bg:"#FEF3C7",c:"#92400E",icon:"📊"},
  UNKNOWN:{label:"Unknown",bg:"#F1F5F9",c:"#64748b",icon:"?"},
};

function FileUploadModal({onClose}){
  const{uFin,uFlight,uShow,uProd,setSel,setTab,sel,aC,shows,flights,finance}=useContext(Ctx);
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
    uProd(sel,{techPackData:result.techPack,techPackContacts:result.contacts||[],techPackFile:file?.name,techPackAt:new Date().toISOString()});
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
  const box={width:520,maxWidth:"96vw",maxHeight:"80vh",overflow:"auto",background:"#fff",border:"1px solid #d6d3cd",borderRadius:16,boxShadow:"0 25px 60px rgba(0,0,0,.18)",display:"flex",flexDirection:"column"};
  const inp2={background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:5,fontSize:10,padding:"4px 6px",outline:"none",width:"100%",fontFamily:"'Outfit',system-ui"};

  return(
    <div onClick={onClose} style={overlay}>
      <div onClick={e=>e.stopPropagation()} style={box}>
        {/* Header */}
        <div style={{padding:"14px 18px 10px",borderBottom:"1px solid #ebe8e3",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <span style={{fontSize:12,fontWeight:800,color:"#0f172a"}}>↑ Upload Document</span>
          <span style={{fontSize:9,color:"#94a3b8",marginLeft:2}}>PDF · DOCX · XLSX</span>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:18,lineHeight:1}}>×</button>
        </div>

        {/* Drop zone */}
        {!result&&!parsing&&(
          <div
            onDragOver={e=>{e.preventDefault();setDragging(true);}}
            onDragLeave={()=>setDragging(false)}
            onDrop={onDrop}
            onClick={()=>fileRef.current?.click()}
            style={{margin:"16px 18px",border:`2px dashed ${dragging?"#5B21B6":"#d6d3cd"}`,borderRadius:12,padding:"32px 20px",textAlign:"center",cursor:"pointer",background:dragging?"#F5F3FF":"#fafaf9",transition:"all .15s"}}
          >
            <div style={{fontSize:28,marginBottom:8}}>📄</div>
            <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:4}}>Drop a file or click to browse</div>
            <div style={{fontSize:10,color:"#94a3b8"}}>PDF, DOCX, or XLSX — receipts, contracts, tech packs, itineraries, expense reports</div>
            <input ref={fileRef} type="file" accept={ACCEPT} style={{display:"none"}} onChange={e=>handleFile(e.target.files?.[0])}/>
          </div>
        )}

        {/* Parsing state */}
        {parsing&&(
          <div style={{padding:"40px 18px",textAlign:"center"}}>
            <div style={{fontSize:24,marginBottom:10}}>⏳</div>
            <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:4}}>Parsing {file?.name}…</div>
            <div style={{fontSize:10,color:"#94a3b8"}}>Claude is reading and classifying your document.</div>
          </div>
        )}

        {/* Error */}
        {error&&!parsing&&(
          <div style={{margin:"0 18px 14px",padding:"8px 12px",background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:7,fontSize:10,color:"#B91C1C"}}>{error}</div>
        )}

        {/* Result */}
        {result&&!parsing&&(
          <div style={{padding:"14px 18px 20px",display:"flex",flexDirection:"column",gap:12}}>
            {/* Type badge + summary */}
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              <span style={{fontSize:18,flexShrink:0}}>{meta.icon}</span>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontSize:10,fontWeight:800,padding:"2px 9px",borderRadius:10,background:meta.bg,color:meta.c}}>{meta.label}</span>
                  <span style={{fontSize:9,color:"#94a3b8"}}>{Math.round((result.confidence||0)*100)}% confidence</span>
                  <button onClick={()=>{setResult(null);setFile(null);setError("");setApplied("");}} style={{marginLeft:"auto",fontSize:9,color:"#5B21B6",background:"none",border:"none",cursor:"pointer",fontWeight:700}}>↩ Re-upload</button>
                </div>
                <div style={{fontSize:11,color:"#0f172a",fontWeight:500}}>{result.summary}</div>
                {file&&<div style={{fontSize:9,color:"#94a3b8",marginTop:2}}>{file.name}</div>}
              </div>
            </div>

            {/* RECEIPT / INVOICE preview */}
            {isReceipt&&result.receipt&&(
              <div style={{background:"#f5f3ef",borderRadius:8,padding:"10px 12px",display:"flex",flexDirection:"column",gap:6}}>
                {[["Vendor",result.receipt.vendor],["Date",result.receipt.date],["Amount",result.receipt.amount!=null?`${result.receipt.amount} ${result.receipt.currency||""}`:null],["Category",result.receipt.category],["Description",result.receipt.description],["Reference",result.receipt.referenceNo]].filter(([,v])=>v).map(([k,v])=>(
                  <div key={k} style={{display:"flex",gap:10,fontSize:10}}><span style={{color:"#64748b",minWidth:80,fontWeight:600}}>{k}</span><span style={{color:"#0f172a"}}>{v}</span></div>
                ))}
                <div style={{display:"flex",gap:8,alignItems:"center",marginTop:4}}>
                  <span style={{fontSize:9,color:"#64748b",fontWeight:600}}>Apply to date</span>
                  <input type="date" value={showDateOverride||result.receipt.date||sel} onChange={e=>setShowDateOverride(e.target.value)} style={{...inp2,width:130}}/>
                </div>
              </div>
            )}

            {/* FLIGHT preview */}
            {isFlight&&result.flights?.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {result.flights.map((f,i)=>(
                  <div key={i} style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:7,padding:"8px 10px",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:9,fontWeight:800,padding:"2px 5px",borderRadius:3,background:"#1E40AF",color:"#fff",flexShrink:0}}>{f.flightNo||f.carrier}</span>
                    <span style={{fontSize:10,color:"#0f172a",flex:1}}>{f.fromCity||f.from} → {f.toCity||f.to}</span>
                    <span style={{fontFamily:MN,fontSize:9,color:"#64748b",whiteSpace:"nowrap"}}>{f.depDate} {f.dep}</span>
                    {f.pax?.length>0&&<span style={{fontSize:9,color:"#94a3b8"}}>{f.pax.join(", ")}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* CONTRACT preview */}
            {isContract&&result.show&&(
              <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,padding:"10px 12px",display:"flex",flexDirection:"column",gap:5}}>
                {[["Date",result.show.date],["Venue",result.show.venue],["City",result.show.city],["Promoter",result.show.promoter],["Guarantee",result.show.guarantee],["Capacity",result.show.capacity],["Doors",result.show.doors],["Curfew",result.show.curfew]].filter(([,v])=>v).map(([k,v])=>(
                  <div key={k} style={{display:"flex",gap:10,fontSize:10}}><span style={{color:"#064E3B",minWidth:80,fontWeight:600}}>{k}</span><span style={{color:"#0f172a"}}>{String(v)}</span></div>
                ))}
                {result.contacts?.length>0&&<div style={{marginTop:4,fontSize:9,color:"#047857",fontWeight:700}}>{result.contacts.length} contact{result.contacts.length>1?"s":""} found</div>}
              </div>
            )}

            {/* TECH PACK preview */}
            {isTechPack&&result.techPack&&(
              <div style={{background:"#F5F3FF",border:"1px solid #DDD6FE",borderRadius:8,padding:"10px 12px",display:"flex",flexDirection:"column",gap:5}}>
                {[["Venue",result.techPack.venueName],["City",result.techPack.city],["Stage",result.techPack.stageDimensions],["Rigging",result.techPack.riggingPoints],["Power",result.techPack.powerSpec],["Load-in",result.techPack.loadIn],["Curfew",result.techPack.curfew]].filter(([,v])=>v).map(([k,v])=>(
                  <div key={k} style={{display:"flex",gap:10,fontSize:10}}><span style={{color:"#5B21B6",minWidth:80,fontWeight:600}}>{k}</span><span style={{color:"#0f172a"}}>{v}</span></div>
                ))}
                {result.techPack.notes&&<div style={{fontSize:9,color:"#64748b",marginTop:2}}>{result.techPack.notes}</div>}
              </div>
            )}

            {/* EXPENSE REPORT preview */}
            {isExpense&&result.expenses?.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:160,overflow:"auto"}}>
                {result.expenses.map((e,i)=>(
                  <div key={i} style={{background:"#f5f3ef",borderRadius:5,padding:"5px 8px",display:"flex",gap:8,alignItems:"center",fontSize:9}}>
                    <span style={{fontFamily:MN,fontWeight:700,color:"#0f172a",minWidth:60}}>{e.amount} {e.currency}</span>
                    <span style={{flex:1,color:"#475569"}}>{e.vendor}</span>
                    <span style={{color:"#94a3b8"}}>{e.date}</span>
                    <span style={{color:"#64748b"}}>{e.category}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Applied confirmation */}
            {applied&&<div style={{padding:"7px 10px",background:"#D1FAE5",border:"1px solid #6EE7B7",borderRadius:7,fontSize:10,color:"#047857",fontWeight:700}}>✓ {applied}</div>}

            {/* Action buttons */}
            {!applied&&(
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {isReceipt&&result.receipt?.amount!=null&&(
                  <button onClick={applyReceipt} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"#92400E",color:"#fff",cursor:"pointer",fontWeight:700}}>Add to Ledger</button>
                )}
                {isFlight&&result.flights?.length>0&&(
                  <button onClick={applyFlights} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"#1E40AF",color:"#fff",cursor:"pointer",fontWeight:700}}>Import {result.flights.length} Flight{result.flights.length>1?"s":""}</button>
                )}
                {isContract&&result.show?.date&&(
                  <button onClick={applyContract} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"#047857",color:"#fff",cursor:"pointer",fontWeight:700}}>Create Show</button>
                )}
                {isTechPack&&result.techPack&&(
                  <button onClick={applyTechPack} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"#5B21B6",color:"#fff",cursor:"pointer",fontWeight:700}}>Apply to Production</button>
                )}
                {isExpense&&result.expenses?.length>0&&(
                  <button onClick={applyExpenseReport} disabled={applying} style={{fontSize:10,padding:"5px 14px",borderRadius:6,border:"none",background:"#92400E",color:"#fff",cursor:"pointer",fontWeight:700}}>Import {result.expenses.length} Expenses</button>
                )}
                <button onClick={onClose} style={{fontSize:10,padding:"5px 12px",borderRadius:6,border:"1px solid #d6d3cd",background:"transparent",color:"#64748b",cursor:"pointer"}}>Close</button>
              </div>
            )}
            {applied&&<button onClick={onClose} style={{fontSize:10,padding:"5px 12px",borderRadius:6,border:"1px solid #d6d3cd",background:"transparent",color:"#64748b",cursor:"pointer",width:"fit-content"}}>Done</button>}
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
    const a=[{type:"action",id:"open_now",label:"Go to Now",sub:"Dashboard / next 72h",icon:"◉",run:()=>setTab("dashboard")},
      {type:"action",id:"open_advance",label:"Open Advance tracker",sub:"current show",icon:"◎",run:()=>setTab("advance")},
      {type:"action",id:"open_ros",label:"Open Schedule",sub:"ROS for current show",icon:"▦",run:()=>setTab("ros")},
      {type:"action",id:"open_transport",label:"Open Transport",sub:"bus + dispatch",icon:"◈",run:()=>setTab("transport")},
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
    if(item.type==="client"){setAC(item.id);setTab("dashboard");}
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
      <div onClick={e=>e.stopPropagation()} style={{width:440,maxWidth:"100%",background:"#fff",border:"1px solid #d6d3cd",borderRadius:16,boxShadow:"0 25px 60px rgba(0,0,0,.15)",overflow:"hidden"}}>
        <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search shows, views, actions..." onKeyDown={onKey} style={{width:"100%",padding:mobile?"16px 18px":"14px 18px",background:"transparent",border:"none",borderBottom:"1px solid #ebe8e3",color:"#0f172a",fontSize:mobile?16:14,outline:"none",fontWeight:500}}/>
        <div ref={listRef} style={{maxHeight:360,overflow:"auto"}}>
          {res.length===0&&<div style={{padding:"22px 18px",textAlign:"center",fontSize:11,color:"#94a3b8"}}>No matches. Press <kbd style={{fontFamily:MN,fontSize:10,padding:"1px 5px",background:"#f1f5f9",borderRadius:3}}>Esc</kbd> to close.</div>}
          {res.map((r,i)=>{const active=i===sel1;return <div key={`${r.type}-${r.id}-${i}`} data-idx={i} onClick={()=>go(r)} onMouseEnter={()=>setSel1(i)} style={{padding:mobile?"12px 18px":"10px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,background:active?"#EDE9FE":"transparent",borderBottom:"1px solid #f5f3ef",borderLeft:active?"3px solid #5B21B6":"3px solid transparent"}}>
            <span style={{fontSize:11,color:active?"#5B21B6":"#64748b",width:16,fontFamily:MN,fontWeight:700}}>{r.type==="tab"||r.type==="action"?r.icon:r.type==="client"?CM[r.id]?.short||"●":fW(r.id)}</span>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:mobile?13:12,color:"#0f172a",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>{r.sub&&<div style={{fontSize:10,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.sub}</div>}</div>
            {r.cId&&<div style={{width:7,height:7,borderRadius:"50%",background:CM[r.cId]?.color||"#94a3b8"}}/>}
            <span style={{fontSize:8,color:active?"#5B21B6":"#94a3b8",fontFamily:MN,letterSpacing:"0.04em",textTransform:"uppercase"}}>{r.type}</span>
          </div>;})}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"7px 14px",borderTop:"1px solid #ebe8e3",background:"#faf9f6",fontSize:9,color:"#64748b",fontFamily:MN}}>
          <span><kbd style={{fontFamily:MN,padding:"1px 5px",background:"#fff",border:"1px solid #d6d3cd",borderRadius:3}}>↑↓</kbd> navigate</span>
          <span><kbd style={{fontFamily:MN,padding:"1px 5px",background:"#fff",border:"1px solid #d6d3cd",borderRadius:3}}>↵</kbd> select</span>
          <span><kbd style={{fontFamily:MN,padding:"1px 5px",background:"#fff",border:"1px solid #d6d3cd",borderRadius:3}}>esc</kbd> close</span>
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
    ok:{bg:"#D1FAE5",c:"#047857",bd:"#6EE7B7"},
    missing:{bg:"#FEF3C7",c:"#92400E",bd:"#FDE68A"},
    na:{bg:"#f1f5f9",c:"#94a3b8",bd:"#e2e8f0"},
    unknown:{bg:"#EDE9FE",c:"#5B21B6",bd:"#C4B5FD"},
  }[s]||{bg:"#f1f5f9",c:"#94a3b8",bd:"#e2e8f0"});
  const stateLabel={"bus-mid":"ON BUS","bus-join":"BUS JOIN","bus-leave":"BUS LEAVE","bus-solo":"BUS · SOLO","fly-one-off":"FLY · HOTEL"}[state]||"";
  const missing=slots.filter(s=>s.state==="missing").length;
  return(
    <div style={{display:"inline-flex",alignItems:"center",gap:4,flexWrap:"wrap"}} title={`${stateLabel}${missing?` — ${missing} missing`:""}`}>
      {!compact&&<span style={{fontSize:7,padding:"1px 5px",borderRadius:3,background:state==="fly-one-off"?"#EDE9FE":"#DBEAFE",color:state==="fly-one-off"?"#5B21B6":"#1E40AF",fontWeight:800,letterSpacing:"0.06em"}}>{stateLabel}</span>}
      {slots.map(s=>{const col=color(s.state);return(
        <button key={s.key} onClick={e=>{e.stopPropagation();onJump?.(s);}} title={`${s.label} — ${s.state==="ok"?"confirmed":s.state==="missing"?"missing":s.state==="unknown"?"not tracked":"not applicable"}`} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:compact?9:10,padding:compact?"2px 5px":"2px 7px",borderRadius:10,border:`1px solid ${col.bd}`,background:col.bg,color:col.c,cursor:"pointer",fontWeight:700,lineHeight:1}}>
          <span style={{fontSize:compact?9:10}}>{s.icon}</span>
          {s.state==="ok"&&<span style={{fontSize:7}}>✓</span>}
          {s.state==="missing"&&<span style={{fontSize:7}}>○</span>}
        </button>);})}
    </div>
  );
}

function CrewTab(){
  const{sel,setSel,shows,tourDaysSorted,tourDays,crew,setCrew,showCrew,setShowCrew,mobile,pushUndo,flights,lodging,setTab}=useContext(Ctx);
  const[panel,setPanel]=useState(null);
  const[editMode,setEditMode]=useState(false);
  const[flightPicker,setFlightPicker]=useState(null); // {crewId, dir}
  const show=shows[sel];
  const today=new Date().toISOString().slice(0,10);
  const sc=showCrew[sel]||{};
  const uid=()=>Math.random().toString(36).slice(2,9);

  // Nearest prior date with any crew data
  const prevDate=useMemo(()=>{
    const candidates=Object.keys(showCrew).filter(d=>d<sel&&Object.keys(showCrew[d]||{}).length>0).sort();
    return candidates[candidates.length-1]||null;
  },[sel,showCrew]);
  const prevCrew=prevDate?showCrew[prevDate]:null;
  const isInheriting=!showCrew[sel]&&!!prevCrew;

  const copyFromPrev=()=>{
    if(!prevCrew)return;
    setShowCrew(p=>({...p,[sel]:{...prevCrew}}));
  };

  const getCD=(crewId)=>{
    const d=sc[crewId]||(isInheriting?prevCrew?.[crewId]:null)||{};
    const legacy=d.travelMode||"bus";
    return{attending:false,inboundMode:legacy,outboundMode:legacy,inboundConfirmed:false,outboundConfirmed:false,inbound:[],outbound:[],inboundDate:"",inboundTime:"",inboundNotes:"",outboundDate:"",outboundTime:"",outboundNotes:"",parkingReq:"none",...d,travelMode:undefined};
  };
  const updateSC=(crewId,patch)=>setShowCrew(p=>({...p,[sel]:{...p[sel],[crewId]:{...getCD(crewId),...patch}}}));
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
  const assignFlight=(crewId,dir,f)=>{
    const leg={id:`leg_${f.id}`,flight:f.flightNo||"",carrier:f.carrier||"",from:f.from,fromCity:f.fromCity||f.from,to:f.to,toCity:f.toCity||f.to,depart:f.dep,arrive:f.arr,conf:f.confirmNo||f.bookingRef||"",status:"confirmed",flightId:f.id};
    const confKey=dir==="inbound"?"inboundConfirmed":"outboundConfirmed";
    const dateKey=dir==="inbound"?"inboundDate":"outboundDate";
    const timeKey=dir==="inbound"?"inboundTime":"outboundTime";
    const timeVal=dir==="inbound"?f.arr:f.dep;
    const dateVal=dir==="inbound"?(f.arrDate||sel):f.depDate;
    setShowCrew(p=>{
      const cur=p[sel]?.[crewId]||{};
      const ex=(cur[dir]||[]).filter(l=>l.flightId!==f.id);
      return{...p,[sel]:{...p[sel],[crewId]:{...cur,attending:true,inboundMode:dir==="inbound"?cur.inboundMode||"fly":cur.inboundMode,outboundMode:dir==="outbound"?cur.outboundMode||"fly":cur.outboundMode,[dir]:[...ex,leg],[confKey]:true,[dateKey]:dateVal,[timeKey]:timeVal||""}}};
    });
    setFlightPicker(null);
  };
  const unassignFlight=(crewId,dir,flightId)=>{
    setShowCrew(p=>{
      const cur=p[sel]?.[crewId]||{};
      return{...p,[sel]:{...p[sel],[crewId]:{...cur,[dir]:(cur[dir]||[]).filter(l=>l.flightId!==flightId)}}};
    });
  };

  const attending=crew.filter(c=>getCD(c.id).attending);
  // Per-crew attending dates across the whole tour, sorted. Used to classify
  // bus-mid vs bus-join vs bus-leave for the lifecycle pills.
  const attendingDatesByCrew=useMemo(()=>{
    const m={};
    Object.entries(showCrew||{}).forEach(([d,perCrew])=>{
      Object.entries(perCrew||{}).forEach(([cid,rec])=>{
        if(rec?.attending){(m[cid]=m[cid]||[]).push(d);}
      });
    });
    Object.keys(m).forEach(k=>m[k].sort());
    return m;
  },[showCrew]);
  const jumpToTravelDay=(date)=>{setSel(date);setTab("transport");};
  const panelCrew=panel?crew.find(c=>c.id===panel.crewId):null;
  const panelCD=panel?getCD(panel.crewId):null;

  const TRAVEL_MODES=["bus","fly","local","vendor","drive"];
  const LEG_STATUS=["pending","confirmed","cancelled"];
  const inp={background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:5,fontSize:10,padding:"4px 6px",outline:"none",width:"100%",fontFamily:"'Outfit',system-ui"};
  const btn=(bg="#5B21B6",col="#fff")=>({background:bg,border:"none",borderRadius:6,color:col,fontSize:10,padding:"4px 11px",cursor:"pointer",fontWeight:700});

  const dateLabel=(d)=>{const s=shows[d];const td=tourDaysSorted.find(x=>x.date===d);if(s)return s.city||s.venue||fD(d);if(td?.type==="travel"&&td?.bus?.route)return td.bus.route;return fD(d);};
  const dayType=(d)=>{const s=shows[d];if(s)return s.type||"show";const td=tourDaysSorted.find(x=>x.date===d);return td?.type||"off";};

  return(
    <div className="fi" style={{display:"flex",height:"calc(100vh - 115px)"}}>
      {/* Date sidebar */}
      <div style={{width:190,borderRight:"1px solid #d6d3cd",background:"#fff",overflow:"auto",flexShrink:0}}>
        <div style={{padding:"7px 12px",fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.08em",borderBottom:"1px solid #ebe8e3"}}>DATES</div>
        {tourDaysSorted.map(td=>{
          const d=td.date;const isSel=sel===d;
          const hasData=!!showCrew[d]&&Object.keys(showCrew[d]).length>0;
          const isShow=dayType(d)==="show";
          const att=hasData?Object.values(showCrew[d]).filter(x=>x.attending).length:0;
          return(
            <div key={d} onClick={()=>setSel(d)} className="br rh" style={{padding:"7px 12px",cursor:"pointer",borderBottom:"1px solid #f5f3ef",background:isSel?"#f5f3ef":"transparent",borderLeft:isSel?"3px solid #5B21B6":"3px solid transparent"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:1}}>
                <span style={{fontFamily:MN,fontSize:9,color:"#64748b"}}>{fD(d)}</span>
                {att>0&&<span style={{fontSize:7,padding:"1px 4px",borderRadius:3,background:"#EDE9FE",color:"#5B21B6",fontWeight:700}}>{att}</span>}
              </div>
              <div style={{fontSize:10,fontWeight:600,color:isShow?"#0f172a":"#94a3b8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{dateLabel(d)}</div>
              <div style={{fontSize:8,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.04em"}}>{isShow?"Show":dayType(d)}</div>
            </div>
          );
        })}
      </div>

      {/* Main panel */}
      <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{padding:"6px 20px",borderBottom:"1px solid #ebe8e3",background:"#fff",display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,fontSize:12}}>{show?.venue||dateLabel(sel)}</span>
        <span style={{fontSize:11,color:"#64748b"}}>{show?.city||""}{show?.city?" · ":""}{fFull(sel)}</span>
        <span style={{fontSize:9,padding:"2px 7px",borderRadius:12,background:"#EDE9FE",color:"#5B21B6",fontWeight:700}}>{attending.length} attending</span>
        <div style={{marginLeft:"auto",display:"flex",gap:5}}>
          <button onClick={()=>setTab("transport")} title="Open per-date travel view for all crew" style={{...btn("#f5f3ef","#5B21B6"),border:"1px solid #c4b5fd"}}>🧭 Travel Day →</button>
          <button onClick={()=>setEditMode(v=>!v)} style={btn(editMode?"#0f172a":"#f5f3ef",editMode?"#fff":"#475569")}>{editMode?"Done Editing":"Edit Roster"}</button>
          <button onClick={addMember} style={btn()}>+ Add</button>
        </div>
      </div>
      {isInheriting&&prevDate&&(
        <div style={{margin:"10px 20px 0",padding:"7px 12px",background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,display:"flex",alignItems:"center",gap:8,fontSize:9}}>
          <span style={{color:"#92400E"}}>Showing crew carried from <strong>{fFull(prevDate)}</strong> — no data saved for this date yet.</span>
          <button onClick={copyFromPrev} style={{marginLeft:"auto",fontSize:9,padding:"3px 9px",borderRadius:5,border:"none",background:"#F59E0B",color:"#fff",cursor:"pointer",fontWeight:700,flexShrink:0}}>Copy to {fD(sel)}</button>
        </div>
      )}
      <div style={{padding:"10px 20px 30px",display:"flex",flexDirection:"column",gap:10}}>
        {/* Roster */}
        <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:mobile?"28px 1fr 54px 56px":"28px 1fr 170px 54px 56px",gap:8,padding:"6px 14px",borderBottom:"1px solid #ebe8e3",fontSize:9,fontWeight:700,color:"#64748b",letterSpacing:"0.06em",textTransform:"uppercase"}}>
            <div/><div>Name / Role</div>{!mobile&&<div>Travel</div>}<div>Park</div><div/>
          </div>
          {crew.map(c=>{
            const cd=getCD(c.id);
            const isOpen=panel?.crewId===c.id;
            const MB=(mode,conf)=>{
              const isFly=mode==="fly";
              return <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:7,padding:"1px 5px",borderRadius:3,fontWeight:700,background:isFly?"#EDE9FE":"#f1f5f9",color:isFly?"#5B21B6":"#475569",textTransform:"uppercase"}}>{mode.slice(0,3)}</span>
                <span style={{fontSize:7,padding:"1px 6px",borderRadius:3,fontWeight:700,background:conf?"#D1FAE5":"#FEE2E2",color:conf?"#047857":"#B91C1C"}}>{conf?"Confirmed":"Unconfirmed"}</span>
              </span>;
            };
            return(
            <React.Fragment key={c.id}>
              <div style={{display:"grid",gridTemplateColumns:mobile?"28px 1fr 54px 56px":"28px 1fr 170px 54px 56px",gap:8,padding:"8px 14px",borderBottom:isOpen?"none":"1px solid #f5f3ef",alignItems:"center"}}>
                <div onClick={()=>toggleAttending(c.id)} style={{width:20,height:20,borderRadius:4,border:`2px solid ${cd.attending?"#047857":"#d6d3cd"}`,background:cd.attending?"#047857":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:700,flexShrink:0}}>{cd.attending?"✓":""}</div>
                {editMode?(
                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    <input value={c.name} onChange={e=>updateMember(c.id,"name",e.target.value)} placeholder="Name" style={{...inp,flex:1}}/>
                    <input value={c.role} onChange={e=>updateMember(c.id,"role",e.target.value)} placeholder="Role" style={{...inp,flex:1}}/>
                    <input value={c.email} onChange={e=>updateMember(c.id,"email",e.target.value)} placeholder="Email" style={{...inp,flex:1}}/>
                    <button onClick={()=>removeMember(c.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:14,flexShrink:0}}>×</button>
                  </div>
                ):(
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:12,color:cd.attending?"#0f172a":"#94a3b8"}}>{c.name||<span style={{color:"#94a3b8"}}>New member</span>}</div>
                    <div style={{fontSize:10,color:"#64748b"}}>{c.role}</div>
                    {cd.attending&&(()=>{
                      const attDates=attendingDatesByCrew[c.id]||[sel];
                      const state=crewLifecycleState(c.id,sel,attDates,tourDays);
                      const slots=crewLifecycleSlots({state,crewId:c.id,crew,date:sel,showCrew,flights,lodging});
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
                    })()}
                  </div>
                )}
                {!mobile&&<div>{cd.attending
                  ?<div style={{display:"flex",flexDirection:"column",gap:4}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:8,color:"#94a3b8",width:18}}>In</span>{MB(cd.inboundMode,cd.inboundConfirmed)}</div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:8,color:"#94a3b8",width:18}}>Out</span>{MB(cd.outboundMode,cd.outboundConfirmed)}</div>
                    </div>
                  :<span style={{fontSize:9,color:"#d6d3cd"}}>—</span>}
                </div>}
                <div>{cd.attending
                  ?<button onClick={()=>cycleParkingReq(c.id)} style={{fontSize:8,padding:"2px 6px",borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,
                      background:cd.parkingReq==="confirmed"?"#D1FAE5":cd.parkingReq==="requested"?"#FEF3C7":"#f1f5f9",
                      color:cd.parkingReq==="confirmed"?"#047857":cd.parkingReq==="requested"?"#92400E":"#94a3b8"}}>
                    {cd.parkingReq==="confirmed"?"✓ P":cd.parkingReq==="requested"?"Req":"—"}
                  </button>
                  :<span/>}
                </div>
                <div>{cd.attending&&<button onClick={()=>setPanel(isOpen?null:{crewId:c.id})} style={{...UI.expandBtn(isOpen),fontSize:9,padding:"3px 8px"}}>{isOpen?"▾":"▸"}</button>}</div>
              </div>
              {isOpen&&(
                <div style={{background:"#fafaf9",borderTop:"1px solid #f5f3ef",borderBottom:"1px solid #f5f3ef",padding:"12px 14px",display:"flex",flexDirection:"column",gap:12}}>
                  {/* Lodging badge */}
                  {(()=>{const crewHotels=Object.values(lodging).filter(h=>h.checkIn<=sel&&h.checkOut>=sel&&(h.rooms||[]).some(r=>r.crewId===c.id));return crewHotels.length>0&&(<div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"5px 8px",background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:7}}>
                    <span style={{fontSize:9,fontWeight:700,color:"#1E40AF",letterSpacing:"0.04em"}}>LODGING</span>
                    {crewHotels.map(h=>{const room=(h.rooms||[]).find(r=>r.crewId===c.id);return(<span key={h.id} style={{fontSize:11,color:"#0f172a",fontWeight:600}}>{h.name}{room?.roomNo&&<span style={{fontFamily:MN,color:"#64748b",marginLeft:4}}>#{room.roomNo}</span>}{room?.type&&<span style={{color:"#94a3b8",fontSize:9,marginLeft:4}}>{room.type}</span>}</span>);})}
                    <button onClick={()=>setTab("lodging")} style={{marginLeft:"auto",fontSize:9,padding:"2px 7px",borderRadius:5,border:"none",background:"#3B82F6",color:"#fff",cursor:"pointer",fontWeight:700}}>→ Lodging</button>
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
                          <span style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em"}}>{dirLabel.toUpperCase()}</span>
                          <select value={mode} onChange={e=>dir==="inbound"?setInboundMode(c.id,e.target.value):setOutboundMode(c.id,e.target.value)} style={{...inp,width:"auto",padding:"2px 6px",fontSize:9}}>
                            {TRAVEL_MODES.map(m=><option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
                          </select>
                          <button onClick={()=>updateSC(c.id,{[confKey]:!conf})} style={{fontSize:9,padding:"2px 9px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,marginLeft:"auto",
                            background:conf?"#D1FAE5":"#FEF3C7",color:conf?"#047857":"#92400E"}}>
                            {conf?"✓ Confirmed":"Unconfirmed"}
                          </button>
                        </div>
                        {mode==="fly"?(
                          <div style={{display:"flex",flexDirection:"column",gap:6}}>
                            {(cd[dir]||[]).map(leg=>{
                              const isAssigned=!!leg.flightId;
                              return isAssigned?(
                                <div key={leg.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#EDE9FE",borderRadius:6,border:"1px solid #c4b5fd"}}>
                                  <span style={{fontSize:9,fontWeight:700,color:"#5B21B6",whiteSpace:"nowrap"}}>✈ {leg.flight||"—"}</span>
                                  <span style={{fontSize:9,color:"#475569",flex:1}}>{leg.fromCity||leg.from} → {leg.toCity||leg.to}</span>
                                  {leg.depart&&<span style={{fontSize:9,fontFamily:MN,color:"#64748b",whiteSpace:"nowrap"}}>{leg.depart}{leg.arrive?` → ${leg.arrive}`:""}</span>}
                                  {leg.conf&&<span style={{fontSize:8,color:"#94a3b8",fontFamily:MN,whiteSpace:"nowrap"}}>#{leg.conf}</span>}
                                  <button onClick={()=>unassignFlight(c.id,dir,leg.flightId)} style={{background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:13,padding:0,flexShrink:0,lineHeight:1}}>×</button>
                                </div>
                              ):(
                                <div key={leg.id} style={{display:"grid",gridTemplateColumns:"1fr 70px 70px 90px 90px 80px 24px",gap:4,alignItems:"center"}}>
                                  {[["flight","Flight #"],["from","From"],["to","To"],["depart","Depart"],["arrive","Arrive"]].map(([k,ph])=>(
                                    <input key={k} placeholder={ph} value={leg[k]} onChange={e=>updateLeg(c.id,dir,leg.id,k,e.target.value)} style={inp}/>
                                  ))}
                                  <select value={leg.status} onChange={e=>updateLeg(c.id,dir,leg.id,"status",e.target.value)} style={{...inp,padding:"3px 4px",fontSize:9}}>
                                    {LEG_STATUS.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                                  </select>
                                  <button onClick={()=>removeLeg(c.id,dir,leg.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:13,padding:0}}>×</button>
                                </div>
                              );
                            })}
                            {/* Flight picker dropdown */}
                            {flightPicker?.crewId===c.id&&flightPicker?.dir===dir?(
                              <div style={{background:"#fff",border:"1px solid #c4b5fd",borderRadius:8,overflow:"hidden",boxShadow:"0 4px 16px rgba(0,0,0,0.10)"}}>
                                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderBottom:"1px solid #ebe8e3",background:"#f5f3ef"}}>
                                  <span style={{fontSize:9,fontWeight:800,color:"#5B21B6",letterSpacing:"0.06em"}}>ASSIGN FLIGHT — {dir==="inbound"?"ARRIVALS":"DEPARTURES"} {fD(sel)}</span>
                                  <button onClick={()=>setFlightPicker(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:14,padding:0,lineHeight:1}}>×</button>
                                </div>
                                {flightsForDir(dir).length===0?(
                                  <div style={{padding:"12px 10px",fontSize:10,color:"#94a3b8",textAlign:"center"}}>No confirmed {dir==="inbound"?"arrivals":"departures"} on {fD(sel)}.<br/><span style={{fontSize:9}}>Scan Gmail for flights in Transport tab.</span></div>
                                ):flightsForDir(dir).map(f=>{
                                  const alreadyAssigned=(cd[dir]||[]).some(l=>l.flightId===f.id);
                                  return(
                                    <div key={f.id} onClick={()=>!alreadyAssigned&&assignFlight(c.id,dir,f)} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",borderBottom:"1px solid #f5f3ef",cursor:alreadyAssigned?"default":"pointer",background:alreadyAssigned?"#f5f3ef":"#fff",opacity:alreadyAssigned?0.6:1}} className="rh">
                                      <span style={{fontSize:10,fontWeight:700,color:"#5B21B6",minWidth:60}}>{f.flightNo||f.carrier}</span>
                                      <span style={{fontSize:10,flex:1,color:"#0f172a"}}>{f.fromCity||f.from} → {f.toCity||f.to}</span>
                                      <span style={{fontSize:9,fontFamily:MN,color:"#64748b"}}>{f.dep} → {f.arr}</span>
                                      {f.pax?.length>0&&<span style={{fontSize:8,color:"#94a3b8"}}>{f.pax.join(", ")}</span>}
                                      {alreadyAssigned?<span style={{fontSize:8,color:"#047857",fontWeight:700}}>✓ Assigned</span>:<span style={{fontSize:9,color:"#5B21B6",fontWeight:700}}>Assign →</span>}
                                    </div>
                                  );
                                })}
                                <div style={{padding:"6px 10px",borderTop:"1px solid #ebe8e3",background:"#f5f3ef"}}>
                                  <button onClick={()=>addLeg(c.id,dir)} style={{...btn("#64748b"),fontSize:8,padding:"2px 8px"}}>+ Enter manually</button>
                                </div>
                              </div>
                            ):(
                              <div style={{display:"flex",gap:6}}>
                                <button onClick={()=>setFlightPicker({crewId:c.id,dir})} style={{...btn("#5B21B6"),fontSize:9,padding:"3px 10px"}}>✈ Assign Flight</button>
                                <button onClick={()=>addLeg(c.id,dir)} style={{...btn("#64748b"),fontSize:9,padding:"3px 9px"}}>+ Manual</button>
                              </div>
                            )}
                          </div>
                        ):(
                          <div style={{display:"grid",gridTemplateColumns:"130px 100px 1fr",gap:6,alignItems:"center"}}>
                            <input type="date" value={cd[dateKey]} onChange={e=>updateSC(c.id,{[dateKey]:e.target.value})} style={inp}/>
                            <input type="time" value={cd[timeKey]} onChange={e=>updateSC(c.id,{[timeKey]:e.target.value})} style={inp}/>
                            <input value={cd[notesKey]} onChange={e=>updateSC(c.id,{[notesKey]:e.target.value})} placeholder={dir==="inbound"?"Pickup / meet point…":"Drop-off / instructions…"} style={inp}/>
                          </div>
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
          <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em",marginBottom:8}}>ATTENDING ({attending.length})</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {attending.map(c=>{const cd=getCD(c.id);const hasFly=cd.inboundMode==="fly"||cd.outboundMode==="fly";const sameMode=cd.inboundMode===cd.outboundMode;const bothConfirmed=cd.inboundConfirmed&&cd.outboundConfirmed;const noneConfirmed=!cd.inboundConfirmed&&!cd.outboundConfirmed;return(
                <span key={c.id} style={{fontSize:10,padding:"3px 9px",borderRadius:20,background:hasFly?"#EDE9FE":"#f1f5f9",color:hasFly?"#5B21B6":"#475569",fontWeight:600,border:`1px solid ${bothConfirmed?"#6EE7B7":noneConfirmed?"#FDE68A":"#e2e8f0"}`}}>
                  {c.name} <span style={{opacity:0.6,fontSize:8,textTransform:"uppercase"}}>{sameMode?cd.inboundMode:`${cd.inboundMode}→${cd.outboundMode}`}</span>{bothConfirmed&&<span style={{fontSize:8,color:"#047857",marginLeft:3}}>✓</span>}
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

function PH({label}){return<div className="fi" style={{padding:40,textAlign:"center",color:"#64748b"}}><div style={{fontSize:14,fontWeight:700,marginBottom:6,color:"#475569"}}>{label}</div><div style={{fontSize:11}}>Coming in a future phase.</div></div>;}

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
const SEV_STYLES={CRITICAL:{bg:"#FEF2F2",c:"#DC2626",b:"#FECACA"},HIGH:{bg:"#FFF7ED",c:"#C2410C",b:"#FED7AA"},MEDIUM:{bg:"#FEFCE8",c:"#A16207",b:"#FEF08A"},LOW:{bg:"#F0FDF4",c:"#166534",b:"#BBF7D0"}};
const POS_STYLES={fly:{bg:"#EDE9FE",c:"#5B21B6"},ground:{bg:"#DCFCE7",c:"#166534"},tower:{bg:"#FEF3C7",c:"#92400E"},touring_carry:{bg:"#DBEAFE",c:"#1E40AF"},TBD:{bg:"#F1F5F9",c:"#64748b"}};

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
    <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:6,padding:"4px 0",borderBottom:"1px solid #f1f5f9",alignItems:"flex-start"}}>
      <span style={{fontSize:9,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.05em",paddingTop:1}}>{label}</span>
      <span style={{fontSize:10,color:isWarn?"#C2410C":"#0f172a",lineHeight:1.4}}>{value}</span>
    </div>
  );
}

function VBSection({title,children,accent}){
  const[open,setOpen]=useState(true);
  return(
    <div style={{background:"#fff",border:`1px solid ${accent||"#d6d3cd"}`,borderRadius:8,overflow:"hidden",marginBottom:8}}>
      <div onClick={()=>setOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",cursor:"pointer",background:accent?`${accent}18`:"#f8f7f5",borderBottom:open?"1px solid #ebe8e3":"none"}}>
        <span style={{fontSize:9,color:"#64748b"}}>{open?"▾":"▸"}</span>
        <span style={{fontSize:9,fontWeight:800,color:accent||"#475569",letterSpacing:"0.06em",textTransform:"uppercase"}}>{title}</span>
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
    <div style={{padding:32,textAlign:"center",color:"#94a3b8",fontSize:10}}>
      <div style={{fontSize:22,marginBottom:8}}>▤</div>
      <div style={{fontWeight:600,marginBottom:4}}>No venue brief on file</div>
      <div>This show date is not in the EU tour binder. Add document links below or upload vendor quotes.</div>
      <div style={{marginTop:16,background:"#fff",border:"1px solid #d6d3cd",borderRadius:8,padding:12,textAlign:"left"}}>
        <div style={{...UI.sectionLabel,marginBottom:8}}>Document Links</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          <input value={newLinkLabel} onChange={e=>setNewLinkLabel(e.target.value)} placeholder="Label (e.g. Venue Tech Pack)" style={{...UI.input,flex:1,minWidth:120}}/>
          <input value={newLinkUrl} onChange={e=>setNewLinkUrl(e.target.value)} placeholder="URL" style={{...UI.input,flex:2,minWidth:160}}/>
          <button onClick={addLink} disabled={!newLinkLabel.trim()||!newLinkUrl.trim()} style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:5,border:"none",background:"#5B21B6",color:"#fff",cursor:"pointer",opacity:(!newLinkLabel.trim()||!newLinkUrl.trim())?0.4:1}}>Add</button>
        </div>
      </div>
    </div>
  );

  const hasWarn=s=>s&&(s.startsWith("⚠")||s.includes("CRITICAL")||s.includes("NOT permitted")||s.includes("NO "));

  return(
    <div className="fi">
      {/* Flags banner */}
      {vg.flags&&<div style={{background:hasWarn(vg.flags)?"#FEF2F2":"#FEF3C7",border:`1px solid ${hasWarn(vg.flags)?"#FECACA":"#FDE68A"}`,borderRadius:7,padding:"8px 12px",marginBottom:10,fontSize:10,color:hasWarn(vg.flags)?"#991B1B":"#92400E",lineHeight:1.5}}><span style={{fontWeight:800}}>FLAGS: </span>{vg.flags}</div>}

      <div style={{display:"grid",gridTemplateColumns:window.innerWidth>600?"1fr 1fr":"1fr",gap:0}}>
        <div style={{paddingRight:6}}>
          {/* Venue info */}
          <VBSection title="Venue" accent="#1E40AF">
            <VBRow label="Capacity" value={vg.capacity?.toLocaleString()}/>
            <VBRow label="Address" value={vg.address}/>
            <VBRow label="Design Ver" value={vg.designVer}/>
            <VBRow label="Advance" value={vg.advanceContact&&`${vg.advanceContact}${vg.advanceEmail?` — `+vg.advanceEmail:""}`}/>
            <VBRow label="Tech Contact" value={vg.techContact}/>
          </VBSection>

          {/* Load */}
          <VBSection title="Load Dock / In-Out" accent="#065F46">
            <VBRow label="Load Dock" value={vg.loadDock}/>
            <VBRow label="Load In/Out" value={vg.loadIn}/>
          </VBSection>

          {/* Stage */}
          <VBSection title="Stage & Rigging" accent="#5B21B6">
            <VBRow label="Stage Dims" value={vg.stageDims}/>
            <VBRow label="Rigging" value={vg.rigging}/>
            <VBRow label="Rigging Notes" value={vg.riggingNotes}/>
          </VBSection>

          {/* Power */}
          <VBSection title="Venue Power" accent="#B45309">
            <VBRow label="Power" value={vg.venuePower} warn={hasWarn(vg.venuePower)}/>
            <VBRow label="Bus/Shore" value={vg.busPower} warn={hasWarn(vg.busPower)}/>
            <VBRow label="Sound Limit" value={vg.soundLimit}/>
          </VBSection>
        </div>

        <div style={{paddingLeft:6}}>
          {/* LED */}
          <VBSection title="LED / Video" accent="#0E7490">
            <VBRow label="LED Notes" value={vg.ledNotes} warn={hasWarn(vg.ledNotes)}/>
          </VBSection>

          {/* LX */}
          <VBSection title="Lighting" accent="#7C3AED">
            <VBRow label="LX Notes" value={vg.lxNotes}/>
          </VBSection>

          {/* Audio */}
          <VBSection title="Audio" accent="#047857">
            <VBRow label="Audio Notes" value={vg.audioNotes} warn={hasWarn(vg.audioNotes)}/>
          </VBSection>

          {/* SFX */}
          <VBSection title="SFX & Compliance" accent="#DC2626">
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
          <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:12,marginBottom:8,marginTop:4}}>
            <div style={{...UI.sectionLabel,marginBottom:4}}>Venue Compatibility — {vg.venue}</div>
            <div style={{fontSize:9,color:"#64748b",marginBottom:8}}>
              {[vg.stageDims&&`Stage: ${vg.stageDims.slice(0,80)}`,vg.rigging&&`Rigging: ${vg.rigging.slice(0,60)}`].filter(Boolean).map((s,i)=><div key={i} style={{fontFamily:MN}}>{s}</div>)}
            </div>
            {rigChecks.length===0&&<div style={{padding:"16px 0",textAlign:"center"}}>
              <div style={{fontSize:22,marginBottom:4}}>✓</div>
              <div style={{fontSize:11,fontWeight:700,color:"#047857"}}>No compatibility issues detected</div>
              <div style={{fontSize:9,color:"#94a3b8",marginTop:4}}>Parameters on file are compatible with touring rig. Advance TBC items per fields above.</div>
            </div>}
            {rigChecks.length>0&&<div style={{display:"flex",flexDirection:"column",gap:6}}>
              {[...rigChecks].sort((a,b)=>({CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3}[a.severity]-{CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3}[b.severity])).map(issue=>{
                const sv=SEV_STYLES[issue.severity]||SEV_STYLES.LOW;
                return(
                  <div key={issue.id} style={{background:issue.severity==="CRITICAL"?"#FEF2F2":issue.severity==="HIGH"?"#FFF7ED":"#fff",border:`1px solid ${sv.b}`,borderRadius:8,padding:"8px 10px"}}>
                    <div style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:3}}>
                      <span style={{fontSize:8,fontWeight:800,padding:"1px 6px",borderRadius:8,background:sv.bg,color:sv.c,flexShrink:0}}>{issue.severity}</span>
                      <span style={{fontSize:8,fontWeight:700,color:"#64748b",flexShrink:0}}>{issue.category}</span>
                      <span style={{fontSize:9,fontWeight:600,color:"#0f172a",flex:1}}>{issue.finding}</span>
                    </div>
                    <div style={{fontSize:8,color:"#475569"}}><span style={{fontWeight:600}}>Action:</span> {issue.action}</div>
                  </div>
                );
              })}
              <div style={{fontSize:8,color:"#94a3b8",fontFamily:MN,marginTop:2}}>
                {rigCritical>0&&<span style={{color:"#DC2626",fontWeight:700,marginRight:6}}>{rigCritical} CRITICAL</span>}
                {rigHigh>0&&<span style={{color:"#C2410C",fontWeight:700,marginRight:6}}>{rigHigh} HIGH</span>}
                Based on venue data on file. Some flags may resolve via advance.
              </div>
            </div>}
          </div>
        );
      })()}

      {/* Document links */}
      <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:8,padding:12,marginTop:4}}>
        <div style={{...UI.sectionLabel,marginBottom:8}}>Document Links</div>
        {links.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {links.map(lnk=><div key={lnk.id} style={{display:"flex",alignItems:"center",gap:4,background:"#EDE9FE",borderRadius:5,padding:"3px 8px"}}>
            <a href={lnk.url} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"#5B21B6",textDecoration:"none",fontWeight:600}}>{lnk.label} ↗</a>
            <button onClick={()=>removeLink(lnk.id)} style={{fontSize:11,color:"#94a3b8",background:"none",border:"none",cursor:"pointer",padding:"0 2px",lineHeight:1}}>×</button>
          </div>)}
        </div>}
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <input value={newLinkLabel} onChange={e=>setNewLinkLabel(e.target.value)} placeholder="Label (e.g. Venue Tech Pack)" style={{...UI.input,flex:1,minWidth:120}} onKeyDown={e=>e.key==="Enter"&&addLink()}/>
          <input value={newLinkUrl} onChange={e=>setNewLinkUrl(e.target.value)} placeholder="Paste URL" style={{...UI.input,flex:2,minWidth:160}} onKeyDown={e=>e.key==="Enter"&&addLink()}/>
          <button onClick={addLink} disabled={!newLinkLabel.trim()||!newLinkUrl.trim()} style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:5,border:"none",background:"#5B21B6",color:"#fff",cursor:"pointer",opacity:(!newLinkLabel.trim()||!newLinkUrl.trim())?0.4:1}}>Add</button>
        </div>
        {vg.advanceEmail&&<div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>
          <a href={`mailto:${vg.advanceEmail}`} style={{fontSize:9,color:"#5B21B6",background:"#EDE9FE",padding:"2px 8px",borderRadius:5,textDecoration:"none",fontWeight:600}}>{vg.advanceContact||"Advance"} ✉</a>
          {vg.techContact&&vg.techContact.includes("@")&&<a href={`mailto:${vg.techContact.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]}`} style={{fontSize:9,color:"#065F46",background:"#D1FAE5",padding:"2px 8px",borderRadius:5,textDecoration:"none",fontWeight:600}}>Tech Contact ✉</a>}
        </div>}
      </div>
    </div>
  );
}

// ── LODGING TAB ─────────────────────────────────────────────────────────────

const HOTEL_STATUS_META={
  pending:{label:"Pending",bg:"#FEF3C7",c:"#92400E"},
  confirmed:{label:"Confirmed",bg:"#D1FAE5",c:"#047857"},
  checked_in:{label:"Checked In",bg:"#DBEAFE",c:"#1E40AF"},
  checked_out:{label:"Checked Out",bg:"#F1F5F9",c:"#475569"},
  cancelled:{label:"Cancelled",bg:"#FEE2E2",c:"#991B1B"},
};
const ROOM_STATUS_META={
  pending:{label:"Pending",bg:"#FEF3C7",c:"#92400E"},
  confirmed:{label:"Confirmed",bg:"#D1FAE5",c:"#047857"},
  occupied:{label:"Occupied",bg:"#DBEAFE",c:"#1E40AF"},
  released:{label:"Released",bg:"#F1F5F9",c:"#475569"},
};
const HOTEL_TODOS_DEFAULT=["Confirm room block","Collect confirmation #","Share room list with crew","Arrange early check-in (if needed)","Confirm late check-out","Collect receipt","Verify billing address"];

function LodgingTab(){
  const{lodging,uLodging,crew,showCrew,finance,uFin,tourDaysSorted,mobile,sel,setSel}=useContext(Ctx);
  const[addOpen,setAddOpen]=useState(false);
  const[editId,setEditId]=useState(null);

  // Hotels on a given date: those whose checkIn <= date <= checkOut
  const hotelsForDate=useCallback((date)=>{
    return Object.values(lodging).filter(h=>h.checkIn<=date&&h.checkOut>=date);
  },[lodging]);

  // Badge count per day: distinct hotels covering that date
  const badgeCount=useCallback((date)=>hotelsForDate(date).length,[hotelsForDate]);

  const dayHotels=hotelsForDate(sel);

  function newHotelId(){return`hotel_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;}

  return(
    <div style={{display:"flex",flex:1,minHeight:0,height:"100%",background:"#F5F3EF"}}>
      {/* Date sidebar */}
      <div style={{width:mobile?60:130,flexShrink:0,borderRight:"1px solid #e2e0dc",overflowY:"auto",background:"#faf9f7",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"10px 8px 4px",fontSize:9,fontWeight:700,color:"#94a3b8",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:MN}}>Dates</div>
        {tourDaysSorted.map(day=>{
          const cnt=badgeCount(day.date);
          const isSel=day.date===sel;
          const d=new Date(day.date+"T12:00:00");
          const mo=d.toLocaleString("en-US",{month:"short"});
          const dt=d.getDate();
          const wd=d.toLocaleString("en-US",{weekday:"short"}).toUpperCase();
          return(
            <button key={day.date} onClick={()=>setSel(day.date)} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"7px 4px",background:isSel?"#EDE9FE":"transparent",border:"none",cursor:"pointer",borderLeft:isSel?"3px solid #5B21B6":"3px solid transparent",transition:"background 0.12s",position:"relative"}}>
              <div style={{fontSize:9,fontWeight:700,color:isSel?"#5B21B6":"#94a3b8",fontFamily:MN,letterSpacing:"0.06em"}}>{wd}</div>
              <div style={{fontSize:16,fontWeight:800,color:isSel?"#5B21B6":"#0f172a",lineHeight:1.1}}>{dt}</div>
              {!mobile&&<div style={{fontSize:9,color:isSel?"#7C3AED":"#64748b"}}>{mo}</div>}
              {cnt>0&&<div style={{position:"absolute",top:4,right:6,background:"#5B21B6",color:"#fff",borderRadius:99,fontSize:8,fontWeight:800,minWidth:14,height:14,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",fontFamily:MN}}>{cnt}</div>}
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <div style={{flex:1,overflowY:"auto",padding:mobile?"10px 8px":"14px 16px",display:"flex",flexDirection:"column",gap:14,minWidth:0}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:"#0f172a",letterSpacing:"-0.02em"}}>
              {sel?new Date(sel+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}):"Lodging"}
            </div>
            <div style={{fontSize:10,color:"#64748b",marginTop:1}}>{dayHotels.length} hotel{dayHotels.length!==1?"s":""} covering this date</div>
          </div>
          <button onClick={()=>setAddOpen(true)} style={{background:"#5B21B6",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            + Add Hotel
          </button>
        </div>

        {dayHotels.length===0&&(
          <div style={{background:"#fff",border:"1px solid #e2e0dc",borderRadius:10,padding:"28px 20px",textAlign:"center",color:"#94a3b8",fontSize:11}}>
            No hotels assigned to this date.<br/>
            <span style={{color:"#5B21B6",cursor:"pointer",fontWeight:600}} onClick={()=>setAddOpen(true)}>+ Add a hotel</span>
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
    <div style={{background:"#fff",border:"1px solid #e2e0dc",borderRadius:10,overflow:"hidden"}}>
      {/* Card header */}
      <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:8,borderBottom:open?"1px solid #e2e0dc":"none",cursor:"pointer"}} onClick={()=>{setOpen(v=>!v);if(!hotel.todos)initTodos();}}>
        <span style={{fontSize:13}}>{open?"▾":"▸"}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontWeight:800,fontSize:13,color:"#0f172a"}}>{hotel.name||"Unnamed Hotel"}</span>
            <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:99,...meta,display:"inline-block"}}>{meta.label}</span>
            {hotel.stars&&<span style={{fontSize:10,color:"#F59E0B"}}>{"★".repeat(hotel.stars)}</span>}
          </div>
          <div style={{fontSize:10,color:"#64748b",marginTop:1}}>{hotel.city&&`${hotel.city} · `}Check-in {hotel.checkIn} → Check-out {hotel.checkOut}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {totalCost>0&&<span style={{fontSize:10,fontWeight:700,color:"#047857",fontFamily:MN}}>${totalCost.toFixed(0)}</span>}
          <button onClick={e=>{e.stopPropagation();onEdit();}} style={{background:"#F1F5F9",border:"none",borderRadius:5,padding:"4px 8px",fontSize:10,cursor:"pointer",color:"#475569"}}>Edit</button>
          <button onClick={e=>{e.stopPropagation();if(confirm(`Remove ${hotel.name}?`))uLodging(hotel.id,null);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontSize:14,padding:"2px 4px"}}>×</button>
        </div>
      </div>

      {open&&(
        <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:12}}>
          {/* Details row */}
          <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:11,color:"#475569"}}>
            {hotel.address&&<span>📍 {hotel.address}</span>}
            {hotel.phone&&<span>📞 <a href={`tel:${hotel.phone}`} style={{color:"#5B21B6",textDecoration:"none"}}>{hotel.phone}</a></span>}
            {hotel.confirmNo&&<span style={{fontFamily:MN}}>Conf# <strong>{hotel.confirmNo}</strong></span>}
            {hotel.bookingRef&&<span style={{fontFamily:MN}}>Ref# <strong>{hotel.bookingRef}</strong></span>}
            {hotel.checkInTime&&<span>Check-in {hotel.checkInTime}</span>}
            {hotel.checkOutTime&&<span>Check-out {hotel.checkOutTime}</span>}
          </div>

          {/* Room assignments */}
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <div style={{fontSize:10,fontWeight:700,color:"#0f172a",letterSpacing:"0.04em",textTransform:"uppercase"}}>Rooms ({rooms.length})</div>
              <button onClick={()=>setAddRoomOpen(v=>!v)} style={{background:"#EDE9FE",color:"#5B21B6",border:"none",borderRadius:5,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>+ Assign Room</button>
            </div>
            {rooms.length===0&&<div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>No rooms assigned.</div>}
            {rooms.map(r=>{
              const cm=crew.find(c=>c.id===r.crewId);
              const rMeta=ROOM_STATUS_META[r.status||"pending"]||ROOM_STATUS_META.pending;
              return(
                <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #f1f0ee",fontSize:11}}>
                  <button onClick={()=>cycleRoomStatus(r.id)} style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:99,...rMeta,border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>{rMeta.label}</button>
                  <span style={{flex:1,fontWeight:600,color:"#0f172a"}}>{cm?.name||r.crewId}</span>
                  {r.roomNo&&<span style={{fontFamily:MN,color:"#64748b"}}>#{r.roomNo}</span>}
                  <span style={{color:"#64748b"}}>{r.type}</span>
                  {r.cost>0&&<span style={{fontFamily:MN,color:"#047857",fontWeight:700}}>${r.cost}</span>}
                  {r.notes&&<span style={{color:"#94a3b8",fontSize:10}}>{r.notes}</span>}
                  <button onClick={()=>removeRoom(r.id)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:13,padding:"0 2px"}}>×</button>
                </div>
              );
            })}
            {addRoomOpen&&(
              <div style={{background:"#faf9f7",border:"1px solid #e2e0dc",borderRadius:7,padding:"10px 10px",marginTop:6,display:"flex",flexDirection:"column",gap:7}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <select value={newRoom.crewId} onChange={e=>setNewRoom(p=>({...p,crewId:e.target.value}))} style={{flex:2,padding:"4px 6px",borderRadius:5,border:"1px solid #e2e0dc",fontSize:11,minWidth:120}}>
                    <option value="">Select crew member</option>
                    {crew.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input placeholder="Room #" value={newRoom.roomNo} onChange={e=>setNewRoom(p=>({...p,roomNo:e.target.value}))} style={{width:70,padding:"4px 6px",borderRadius:5,border:"1px solid #e2e0dc",fontSize:11,fontFamily:MN}}/>
                  <select value={newRoom.type} onChange={e=>setNewRoom(p=>({...p,type:e.target.value}))} style={{width:90,padding:"4px 6px",borderRadius:5,border:"1px solid #e2e0dc",fontSize:11}}>
                    {["Single","Double","Twin","Suite","King","Shared"].map(t=><option key={t}>{t}</option>)}
                  </select>
                  <input placeholder="Cost" type="number" value={newRoom.cost} onChange={e=>setNewRoom(p=>({...p,cost:e.target.value}))} style={{width:70,padding:"4px 6px",borderRadius:5,border:"1px solid #e2e0dc",fontSize:11,fontFamily:MN}}/>
                </div>
                <input placeholder="Notes (optional)" value={newRoom.notes} onChange={e=>setNewRoom(p=>({...p,notes:e.target.value}))} style={{padding:"4px 6px",borderRadius:5,border:"1px solid #e2e0dc",fontSize:11}}/>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={addRoom} style={{background:"#5B21B6",color:"#fff",border:"none",borderRadius:5,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Add Room</button>
                  <button onClick={()=>setAddRoomOpen(false)} style={{background:"#F1F5F9",color:"#475569",border:"none",borderRadius:5,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* To-do checklist */}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#0f172a",letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:5}}>Checklist ({doneTodos}/{todos.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {todos.map((t,i)=>(
                <label key={i} style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:11,color:t.done?"#94a3b8":"#0f172a",textDecoration:t.done?"line-through":"none"}}>
                  <input type="checkbox" checked={!!t.done} onChange={()=>toggleTodo(i)} style={{accentColor:"#5B21B6",width:13,height:13,flexShrink:0}}/>
                  {t.text}
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#0f172a",letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:4}}>Notes</div>
            <textarea value={hotel.notes||""} onChange={e=>uLodging(hotel.id,{...hotel,notes:e.target.value})} placeholder="Parking, shuttle, special requests, room block contact…" rows={2} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #e2e0dc",fontSize:11,resize:"vertical",background:"#faf9f7",fontFamily:"'Outfit',system-ui"}}/>
          </div>

          {/* Finance row */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:4,borderTop:"1px solid #f1f0ee"}}>
            <div style={{fontSize:11,color:"#64748b"}}>
              Total: <strong style={{color:"#047857",fontFamily:MN}}>{hotel.currency||"USD"} {totalCost.toFixed(2)}</strong>
              {rooms.length>0&&<span style={{color:"#94a3b8",marginLeft:6}}>({rooms.length} room{rooms.length!==1?"s":""})</span>}
            </div>
            <button onClick={pushToLedger} disabled={!totalCost} style={{background:totalCost?"#047857":"#e2e0dc",color:"#fff",border:"none",borderRadius:5,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:totalCost?"pointer":"not-allowed"}}>↑ Add to Ledger</button>
          </div>
        </div>
      )}
    </div>
  );
}

function HotelFormModal({date,hotel,onClose,onSave,existingHotels}){
  const isEdit=!!hotel;
  const[form,setForm]=useState(hotel||{id:newHotelIdFn(),name:"",address:"",city:"",phone:"",stars:"",checkIn:date,checkOut:date,checkInTime:"15:00",checkOutTime:"12:00",confirmNo:"",bookingRef:"",status:"pending",currency:"USD",notes:"",rooms:[],todos:HOTEL_TODOS_DEFAULT.map(t=>({text:t,done:false}))});
  function newHotelIdFn(){return`hotel_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;}
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:80,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:12,padding:"20px 22px",width:"100%",maxWidth:460,boxShadow:"0 24px 64px rgba(0,0,0,.18)",display:"flex",flexDirection:"column",gap:12,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>{isEdit?"Edit Hotel":"Add Hotel"}</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#94a3b8"}}>×</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 10px"}}>
          {[["name","Hotel Name","full"],["address","Address","full"],["city","City","half"],["phone","Phone","half"],["confirmNo","Confirmation #","half"],["bookingRef","Booking Ref","half"],["checkIn","Check-in Date","half"],["checkOut","Check-out Date","half"],["checkInTime","Check-in Time","half"],["checkOutTime","Check-out Time","half"]].map(([k,lbl,span])=>(
            <div key={k} style={{gridColumn:span==="full"?"1/-1":"auto"}}>
              <div style={{fontSize:9,fontWeight:700,color:"#64748b",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>{lbl}</div>
              <input value={form[k]||""} onChange={e=>f(k,e.target.value)} type={k.includes("Date")?"date":k.includes("Time")?"time":"text"} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #e2e0dc",fontSize:11,fontFamily:k==="confirmNo"||k==="bookingRef"?MN:"inherit"}}/>
            </div>
          ))}
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Stars</div>
            <select value={form.stars||""} onChange={e=>f("stars",e.target.value?parseInt(e.target.value):"")} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #e2e0dc",fontSize:11}}>
              <option value="">–</option>
              {[1,2,3,4,5].map(n=><option key={n} value={n}>{"★".repeat(n)}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Status</div>
            <select value={form.status||"pending"} onChange={e=>f("status",e.target.value)} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #e2e0dc",fontSize:11}}>
              {Object.entries(HOTEL_STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Currency</div>
            <select value={form.currency||"USD"} onChange={e=>f("currency",e.target.value)} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #e2e0dc",fontSize:11}}>
              {["USD","EUR","GBP","CAD","AUD","PLN","CZK","SEK","NOK","DKK"].map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"#64748b",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Notes</div>
          <textarea value={form.notes||""} onChange={e=>f("notes",e.target.value)} rows={2} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #e2e0dc",fontSize:11,resize:"vertical"}}/>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"#F1F5F9",border:"none",borderRadius:6,padding:"7px 14px",fontSize:11,cursor:"pointer",color:"#475569"}}>Cancel</button>
          <button onClick={()=>onSave(form)} style={{background:"#5B21B6",color:"#fff",border:"none",borderRadius:6,padding:"7px 16px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{isEdit?"Save Changes":"Add Hotel"}</button>
        </div>
      </div>
    </div>
  );
}

function ProdTab(){
  const{shows,sel,production,uProd,mobile}=useContext(Ctx);
  const show=shows?.[sel];
  const data=production[sel]||{docs:[],items:[],issues:[],analysis:null};

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

  const upd=useCallback(patch=>uProd(sel,{...data,...patch}),[sel,data,uProd]);

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
  const rigBadgeColor=rigCritical>0?"#DC2626":"#C2410C";

  const SUB_TABS=[
    {id:"venue",label:"Venue Brief"},
    {id:"rigcheck",label:"Rig Check",badge:rigBadge,badgeColor:rigBadgeColor},
    {id:"upload",label:"Upload"},
    {id:"manifest",label:`Manifest${data.items?.length?` (${data.items.length})`:""}`,badge:tbdCount>0?tbdCount:null,badgeColor:"#92400E"},
    {id:"analysis",label:"Analysis"},
    {id:"issues",label:`Issues${openIssues>0?` (${openIssues})`:""}`,badge:openIssues>0?openIssues:null,badgeColor:"#DC2626"},
  ];

  if(!show)return<div style={{padding:24,color:"#64748b",fontSize:11}}>Select a show to view production data.</div>;

  return(
    <div className="fi" style={{padding:"16px 20px",maxWidth:900,width:"100%"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>{show.venue}</div>
          <div style={{fontSize:10,color:"#64748b",fontFamily:MN}}>{show.date} · {show.city}</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {data.items?.length>0&&<button onClick={runAnalysis} disabled={analyzing} style={{fontSize:10,fontWeight:700,padding:"5px 12px",borderRadius:6,border:"none",background:analyzing?"#e2e8f0":"#5B21B6",color:analyzing?"#94a3b8":"#fff",cursor:analyzing?"default":"pointer"}}>{analyzing?"Analyzing…":"Run Analysis"}</button>}
          {data.items?.length>0&&<button onClick={exportJson} style={{fontSize:10,fontWeight:600,padding:"5px 10px",borderRadius:6,border:"1px solid #d6d3cd",background:"#f5f3ef",color:"#475569",cursor:"pointer"}}>Export JSON</button>}
        </div>
      </div>

      {uploadMsg&&<div style={{fontSize:10,color:uploadMsg.startsWith("Error")||uploadMsg.startsWith("PDF")?"#DC2626":"#047857",background:uploadMsg.startsWith("Error")||uploadMsg.startsWith("PDF")?"#FEF2F2":"#F0FDF4",border:`1px solid ${uploadMsg.startsWith("Error")||uploadMsg.startsWith("PDF")?"#FECACA":"#BBF7D0"}`,borderRadius:6,padding:"6px 10px",marginBottom:10,fontFamily:MN}}>{uploadMsg}</div>}

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:1,borderBottom:"1px solid #d6d3cd",marginBottom:12,overflowX:"auto",overflowY:"hidden",scrollbarWidth:"thin",WebkitOverflowScrolling:"touch"}}>
        {SUB_TABS.map(t=><button key={t.id} onClick={()=>setSubTab(t.id)} style={{padding:"5px 12px",fontSize:10,fontWeight:subTab===t.id?700:500,color:subTab===t.id?"#0f172a":"#64748b",background:"none",border:"none",cursor:"pointer",borderBottom:subTab===t.id?"2px solid #5B21B6":"2px solid transparent",display:"flex",alignItems:"center",gap:4,flexShrink:0,whiteSpace:"nowrap"}}>
          {t.label}{t.badge!=null&&<span style={{fontSize:8,fontWeight:800,background:t.badgeColor||"#5B21B6",color:"#fff",borderRadius:10,padding:"1px 5px"}}>{t.badge}</span>}
        </button>)}
      </div>

      {/* Venue Brief tab */}
      {subTab==="venue"&&<VenueBrief vg={vg} sel={sel} data={data} upd={upd}/>}

      {/* Rig Check tab */}
      {subTab==="rigcheck"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
        {/* Spec header */}
        <div style={{background:"#0f172a",borderRadius:10,padding:"12px 16px",color:"#fff"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:800,fontFamily:MN,color:"#e2e8f0"}}>BBNO$ EU TOUR RIG — {DESIGN_RIG.version}</div>
              <div style={{fontSize:9,color:"#64748b",fontFamily:MN}}>Designer: {DESIGN_RIG.drawnBy} · {DESIGN_RIG.publishedAt} · {DESIGN_RIG.file}</div>
            </div>
            <span style={{fontSize:9,fontWeight:700,padding:"3px 9px",borderRadius:6,background:"#1e293b",color:"#94a3b8",fontFamily:MN}}>~{DESIGN_RIG.req.power_kw_est} kW est.</span>
          </div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {[["Rig W",`${DESIGN_RIG.dims.rig_width_mm/1000}m`],["LED Tower H",`${DESIGN_RIG.dims.led_tower_h_mm/1000}m`],["Fly Trim",`${DESIGN_RIG.dims.fly_trim_mm/1000}m`],["Stage Depth",`${DESIGN_RIG.dims.stage_depth_mm/1000}m`],["Stage W total",`${DESIGN_RIG.dims.stage_w_total_mm/1000}m`],["Min Clear (GS)",`${DESIGN_RIG.req.min_clearance_gs_m}m`],["Min Clear (fly)",`${DESIGN_RIG.req.min_clearance_fly_m}m`],["Lasers",`${DESIGN_RIG.req.laser_count}× Class 4`]].map(([k,v])=><div key={k} style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.04em"}}>{k}</div>
              <div style={{fontSize:12,fontWeight:800,fontFamily:MN,color:"#f8fafc"}}>{v}</div>
            </div>)}
          </div>
        </div>

        {/* Fixture schedule */}
        <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:12}}>
          <div style={{...UI.sectionLabel,marginBottom:8}}>Fixture Schedule (Sht-1 Symbol Key + VWX)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 40px 60px 60px 50px",gap:0,padding:"4px 8px",background:"#f8f7f5",borderRadius:"6px 6px 0 0",borderBottom:"1px solid #e2e8f0"}}>
            {["Fixture","Qty","W/unit","Binder","Δ"].map(h=><span key={h} style={{fontSize:8,fontWeight:800,color:"#94a3b8",letterSpacing:"0.04em"}}>{h}</span>)}
          </div>
          {DESIGN_RIG.fixtures.map((f,i)=>{
            const hasDelta=f.delta!=null&&f.delta!==0;
            const deltaColor=f.delta>0?"#DC2626":f.delta<0?"#C2410C":"#047857";
            return(
              <div key={f.name} style={{display:"grid",gridTemplateColumns:"1fr 40px 60px 60px 50px",gap:0,padding:"4px 8px",background:hasDelta?"#FEF2F2":i%2===0?"#fff":"#fafafa",borderBottom:"1px solid #f1f5f9",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:9,fontWeight:600,color:"#0f172a"}}>{f.name}</div>
                  {f.note&&<div style={{fontSize:7,color:"#94a3b8",fontStyle:"italic"}}>{f.note}</div>}
                  <div style={{fontSize:7,color:"#b0b8c8"}}>{f.dept} · {f.position} · {f.source}</div>
                </div>
                <span style={{fontSize:10,fontWeight:700,fontFamily:MN,textAlign:"center",color:f.qty==null?"#94a3b8":"#0f172a"}}>{f.qty??"-"}</span>
                <span style={{fontSize:9,fontFamily:MN,color:"#475569",textAlign:"right"}}>{f.power_w?`${f.power_w}W`:"—"}</span>
                <span style={{fontSize:9,fontFamily:MN,color:"#64748b",textAlign:"center"}}>{f.binder_qty??"-"}</span>
                <span style={{fontSize:10,fontWeight:700,fontFamily:MN,textAlign:"center",color:hasDelta?deltaColor:"#047857"}}>{f.delta==null?"?":f.delta===0?"✓":f.delta>0?`+${f.delta}`:f.delta}</span>
              </div>
            );
          })}
          <div style={{padding:"4px 8px",fontSize:8,color:"#94a3b8"}}>Δ = design qty − binder qty · red = under-quoted · amber = over-quoted</div>
        </div>

        {/* Design vs quote discrepancies */}
        <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:12}}>
          <div style={{...UI.sectionLabel,marginBottom:8}}>Design vs Quote Discrepancies</div>
          {DESIGN_RIG.specDiscrepancies.map((disc,i)=>{
            const sv=SEV_STYLES[disc.severity]||SEV_STYLES.LOW;
            return(
              <div key={i} style={{padding:"7px 10px",borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#fafafa"}}>
                <div style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:3}}>
                  <span style={{fontSize:8,fontWeight:800,padding:"1px 6px",borderRadius:8,background:sv.bg,color:sv.c,flexShrink:0}}>{disc.severity}</span>
                  <span style={{fontSize:8,fontWeight:700,color:"#64748b",flexShrink:0}}>{disc.category}</span>
                  <span style={{fontSize:9,color:"#0f172a",flex:1}}>{disc.finding}</span>
                </div>
                <div style={{fontSize:8,color:"#475569",paddingLeft:2}}><span style={{fontWeight:600}}>Action:</span> {disc.action}</div>
              </div>
            );
          })}
        </div>

      </div>}

      {/* Upload tab */}
      {subTab==="upload"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:16}}>
          <div style={{...UI.sectionLabel,marginBottom:10}}>Add Document</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            {["vendor_quote","design_drawing"].map(dt=><button key={dt} onClick={()=>setDocType(dt)} style={{fontSize:10,fontWeight:700,padding:"4px 12px",borderRadius:6,border:`1.5px solid ${docType===dt?"#5B21B6":"#d6d3cd"}`,background:docType===dt?"#EDE9FE":"#fff",color:docType===dt?"#5B21B6":"#475569",cursor:"pointer"}}>{dt==="vendor_quote"?"Vendor Quote":"Design Drawing"}</button>)}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            <input value={vendorName} onChange={e=>setVendorName(e.target.value)} placeholder="Vendor name (e.g. Neg Earth)" style={{...UI.input,flex:1,minWidth:140}} disabled={docType==="design_drawing"}/>
            <input value={quoteRef} onChange={e=>setQuoteRef(e.target.value)} placeholder="Quote ref (e.g. 26-1273)" style={{...UI.input,flex:1,minWidth:120}} disabled={docType==="design_drawing"}/>
          </div>
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"24px 16px",border:"2px dashed #d6d3cd",borderRadius:8,cursor:"pointer",background:"#fafaf8",color:"#64748b",fontSize:10,fontWeight:600}}>
            <span style={{fontSize:20}}>▤</span>
            {uploading?"Uploading…":"Click to upload PDF or drag and drop"}
            <input ref={fileRef} type="file" accept="application/pdf" onChange={handleFile} style={{display:"none"}} disabled={uploading}/>
          </label>
        </div>

        {(data.docs||[]).length>0&&<div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:16}}>
          <div style={{...UI.sectionLabel,marginBottom:8}}>Uploaded Documents</div>
          {(data.docs||[]).map(doc=><div key={doc.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
            <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,background:doc.docType==="vendor_quote"?"#EDE9FE":"#DCFCE7",color:doc.docType==="vendor_quote"?"#5B21B6":"#166534"}}>{doc.docType==="vendor_quote"?"QUOTE":"DESIGN"}</span>
            <span style={{fontSize:10,flex:1,color:"#0f172a"}}>{doc.fileName}</span>
            {doc.vendorName&&<span style={{fontSize:9,color:"#64748b"}}>{doc.vendorName}</span>}
            {doc.quoteRef&&<span style={{fontSize:9,color:"#94a3b8",fontFamily:MN}}>{doc.quoteRef}</span>}
            <span style={{fontSize:9,color:"#047857",fontFamily:MN}}>{doc.itemCount} items</span>
            <button onClick={()=>deleteDoc(doc.id)} style={{fontSize:10,color:"#94a3b8",background:"none",border:"none",cursor:"pointer",padding:"0 4px"}} title="Remove document">×</button>
          </div>)}
          {data.items?.length>0&&<div style={{marginTop:12,padding:"8px 10px",background:"#F8FAFC",borderRadius:6,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:"#475569"}}>{data.items.length} total items across {data.docs.length} document(s)</span>
            {tbdCount>0&&<span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,background:"#FEF3C7",color:"#92400E"}}>{tbdCount} TBD positions</span>}
            <button onClick={()=>setSubTab("manifest")} style={{marginLeft:"auto",fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:5,border:"1px solid #d6d3cd",background:"#f5f3ef",color:"#475569",cursor:"pointer"}}>View Manifest →</button>
          </div>}
        </div>}

        {!data.docs?.length&&<div style={{padding:32,textAlign:"center",color:"#94a3b8",fontSize:10}}>
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
          {tbdCount>0&&<button onClick={()=>setPosFilter("TBD")} style={{fontSize:9,fontWeight:700,padding:"3px 9px",borderRadius:5,border:"1.5px solid #C2410C",background:"#FFF7ED",color:"#C2410C",cursor:"pointer"}}>▲ {tbdCount} TBD</button>}
          <button onClick={()=>setShowExcluded(v=>!v)} style={{fontSize:9,fontWeight:700,padding:"3px 9px",borderRadius:5,border:`1.5px solid ${showExcluded?"#5B21B6":"#d6d3cd"}`,background:showExcluded?"#EDE9FE":"#f8f7f5",color:showExcluded?"#5B21B6":"#94a3b8",cursor:"pointer"}}>{showExcluded?"Show all":"Excluded hidden"}</button>
          <span style={{marginLeft:"auto",fontSize:9,color:"#94a3b8"}}>{(data.items||[]).filter(i=>i.included!==false).length} of {(data.items||[]).length} included</span>
        </div>

        {(data.items||[]).length===0&&VENUE_GRID[sel]&&<div style={{padding:32,textAlign:"center"}}>
          <div style={{fontSize:24,marginBottom:8}}>▤</div>
          <div style={{fontSize:11,fontWeight:600,color:"#0f172a",marginBottom:4}}>No manifest loaded</div>
          <div style={{fontSize:10,color:"#64748b",marginBottom:16}}>Seed from the EU Tour Binder or upload vendor quote PDFs in the Upload tab.</div>
          <button onClick={seedManifest} style={{fontSize:11,fontWeight:700,padding:"8px 20px",borderRadius:7,border:"none",background:"#5B21B6",color:"#fff",cursor:"pointer"}}>Load Tour Manifest</button>
        </div>}

        {(data.items||[]).length===0&&!VENUE_GRID[sel]&&<div style={{padding:32,textAlign:"center",color:"#94a3b8",fontSize:10}}>No items. Upload vendor quote PDFs in the Upload tab.</div>}

        {(data.items||[]).length>0&&Object.entries(groupedItems).length===0&&<div style={{padding:32,textAlign:"center",color:"#94a3b8",fontSize:10}}>No items match the current filters.</div>}

        {Object.entries(groupedItems).map(([dept,items])=><div key={dept} style={{marginBottom:12}}>
          <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>{dept} ({items.length})</div>
          <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:8,overflow:"hidden"}}>
            {/* Table header */}
            <div style={{display:"grid",gridTemplateColumns:"20px 1fr 60px 60px 60px 60px 60px 70px 70px",gap:0,borderBottom:"1px solid #ebe8e3",padding:"5px 8px",background:"#f8f7f5"}}>
              {["","Item","Qty","Position","Wt/u","Wt tot","Pwr/u","IP","Source"].map(h=><span key={h} style={{fontSize:8,fontWeight:800,color:"#94a3b8",letterSpacing:"0.04em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h}</span>)}
            </div>
            {items.map(item=>{
              const pos=item.rig_position||"TBD";
              const ps=POS_STYLES[pos]||POS_STYLES.TBD;
              const flagged=item.has_discrepancy;
              const excluded=item.included===false;
              return(
                <div key={item.id} className="rh" style={{display:"grid",gridTemplateColumns:"20px 1fr 60px 60px 60px 60px 60px 70px 70px",gap:0,padding:"5px 8px",borderBottom:"1px solid #f1f5f9",background:flagged?"#FEF2F2":excluded?"#fafafa":"#fff",alignItems:"center",opacity:excluded?0.45:1}}>
                  <input type="checkbox" checked={!excluded} onChange={()=>toggleIncluded(item.id)} style={{width:13,height:13,cursor:"pointer",accentColor:"#5B21B6"}}/>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:600,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:excluded?"line-through":"none"}} title={item.item_name}>{item.item_name}</div>
                    {item.model_ref&&item.model_ref!==item.item_name&&<div style={{fontSize:8,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.model_ref}</div>}
                    {item.vendor_name&&<div style={{fontSize:8,color:"#64748b"}}>{item.vendor_name}{item.vendor_quote_ref&&` · ${item.vendor_quote_ref}`}</div>}
                  </div>
                  <input type="number" min={0} value={item.qty||1} onChange={e=>updateQty(item.id,e.target.value)} style={{width:48,fontSize:10,fontFamily:MN,fontWeight:600,textAlign:"center",border:"1px solid #e2e8f0",borderRadius:4,padding:"2px 4px",background:"#f8f7f5",color:"#0f172a",outline:"none"}}/>
                  <div style={{display:"flex",alignItems:"center"}}>
                    <select value={pos} onChange={e=>overridePosition(item.id,e.target.value)} style={{fontSize:8,fontWeight:700,padding:"2px 4px",borderRadius:4,border:`1px solid ${ps.c}`,background:ps.bg,color:ps.c,cursor:"pointer",maxWidth:56}}>
                      {["fly","ground","tower","touring_carry","TBD"].map(p=><option key={p} value={p}>{p.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <span style={{fontSize:9,fontFamily:MN,color:"#475569",textAlign:"right"}}>{item.weight_kg?`${item.weight_kg}kg`:"—"}</span>
                  <span style={{fontSize:9,fontFamily:MN,color:"#475569",textAlign:"right"}}>{item.weight_kg&&item.qty?`${Math.round(item.weight_kg*item.qty*10)/10}kg`:"—"}</span>
                  <span style={{fontSize:9,fontFamily:MN,color:"#475569",textAlign:"right"}}>{item.power_w?`${item.power_w}W`:"—"}</span>
                  <span style={{fontSize:8,fontFamily:MN,color:"#475569"}}>{item.ip_rating||"—"}</span>
                  <span style={{fontSize:8,color:item.spec_source==="fixture_specs"?"#047857":"#94a3b8"}}>{item.source_type==="design_spec"?"design":"quote"}{item.spec_source==="fixture_specs"&&" ✓"}</span>
                </div>
              );
            })}
          </div>
        </div>)}
      </div>}

      {/* Analysis tab */}
      {subTab==="analysis"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
        {!data.analysis?<div style={{padding:32,textAlign:"center"}}>
          <div style={{fontSize:10,color:"#64748b",marginBottom:12}}>Run analysis to see power budget, weight ledger, and issue detection.</div>
          {data.items?.length>0&&<button onClick={runAnalysis} disabled={analyzing} style={{fontSize:11,fontWeight:700,padding:"8px 20px",borderRadius:7,border:"none",background:"#5B21B6",color:"#fff",cursor:"pointer"}}>{analyzing?"Analyzing…":"Run Analysis"}</button>}
        </div>:<>
          {/* Power Budget */}
          <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:14}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div style={{...UI.sectionLabel,margin:0}}>Power Budget</div>
              <span style={{fontSize:18,fontWeight:800,fontFamily:MN,color:data.analysis.powerBudget.total_kw>100?"#DC2626":data.analysis.powerBudget.total_kw>80?"#C2410C":"#047857"}}>{data.analysis.powerBudget.total_kw} kW</span>
              <span style={{fontSize:9,color:"#94a3b8"}}>→ {data.analysis.powerBudget.recommended_minimum_kw} kW recommended minimum (30% headroom)</span>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {Object.entries(data.analysis.powerBudget.by_dept||{}).sort((a,b)=>b[1]-a[1]).map(([dept,w])=><div key={dept} style={{background:"#f8f7f5",borderRadius:6,padding:"5px 10px"}}>
                <div style={{fontSize:8,color:"#94a3b8",textTransform:"uppercase"}}>{dept}</div>
                <div style={{fontSize:11,fontWeight:700,fontFamily:MN,color:"#0f172a"}}>{Math.round(w/100)/10} kW</div>
              </div>)}
            </div>
            {data.analysis.powerBudget.missing_power_count>0&&<div style={{marginTop:8,fontSize:9,color:"#92400E",background:"#FEF3C7",borderRadius:5,padding:"4px 8px"}}>{data.analysis.powerBudget.missing_power_count} item(s) missing power data — total may be understated</div>}
          </div>

          {/* Weight Ledger */}
          <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:14}}>
            <div style={{...UI.sectionLabel,marginBottom:10}}>Weight Ledger — Fly vs. Ground Split</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <div style={{background:"#EDE9FE",borderRadius:8,padding:"10px 14px",textAlign:"center"}}>
                <div style={{fontSize:8,color:"#5B21B6",fontWeight:800,textTransform:"uppercase",marginBottom:4}}>Fly</div>
                <div style={{fontSize:20,fontWeight:800,fontFamily:MN,color:"#5B21B6"}}>{data.analysis.weightLedger.fly_kg} kg</div>
                <div style={{fontSize:9,color:"#7C3AED"}}>{data.analysis.weightLedger.fly_item_count} item(s)</div>
              </div>
              <div style={{background:"#DCFCE7",borderRadius:8,padding:"10px 14px",textAlign:"center"}}>
                <div style={{fontSize:8,color:"#166534",fontWeight:800,textTransform:"uppercase",marginBottom:4}}>Ground</div>
                <div style={{fontSize:20,fontWeight:800,fontFamily:MN,color:"#166534"}}>{data.analysis.weightLedger.ground_kg} kg</div>
                <div style={{fontSize:9,color:"#166534"}}>{data.analysis.weightLedger.ground_item_count} item(s)</div>
              </div>
              <div style={{background:"#FEF3C7",borderRadius:8,padding:"10px 14px",textAlign:"center"}}>
                <div style={{fontSize:8,color:"#92400E",fontWeight:800,textTransform:"uppercase",marginBottom:4}}>TBD</div>
                <div style={{fontSize:20,fontWeight:800,fontFamily:MN,color:"#92400E"}}>{data.analysis.weightLedger.tbd_count}</div>
                <div style={{fontSize:9,color:"#92400E"}}>items unclassified</div>
              </div>
            </div>
            {data.analysis.weightLedger.tbd_count>0&&<div style={{marginTop:8,fontSize:9,color:"#92400E",background:"#FEF3C7",borderRadius:5,padding:"4px 8px"}}>Set positions in Manifest tab to complete weight split.</div>}
          </div>

          <div style={{fontSize:9,color:"#94a3b8",fontFamily:MN}}>Analyzed {new Date(data.analysis.analyzedAt).toLocaleString()} — re-run after position corrections</div>
        </>}
      </div>}

      {/* Issues tab */}
      {subTab==="issues"&&<div>
        {!(data.issues?.length)&&<div style={{padding:32,textAlign:"center",color:"#94a3b8",fontSize:10}}>
          {data.items?.length?<><div style={{marginBottom:8}}>No issues detected yet.</div><button onClick={runAnalysis} disabled={analyzing} style={{fontSize:10,fontWeight:700,padding:"5px 14px",borderRadius:6,border:"none",background:"#5B21B6",color:"#fff",cursor:"pointer"}}>{analyzing?"Analyzing…":"Run Analysis"}</button></>:<div>Upload documents then run analysis to detect issues.</div>}
        </div>}
        {(data.issues||[]).map(issue=>{
          const sv=SEV_STYLES[issue.severity]||SEV_STYLES.LOW;
          return(
            <div key={issue.id} style={{background:issue.resolved?"#f8f7f5":"#fff",border:`1px solid ${issue.resolved?"#e2e8f0":sv.b}`,borderRadius:8,padding:"10px 12px",marginBottom:8,opacity:issue.resolved?0.6:1}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:4}}>
                <span style={{fontSize:8,fontWeight:800,padding:"2px 7px",borderRadius:10,background:sv.bg,color:sv.c,flexShrink:0}}>{issue.severity}</span>
                <span style={{fontSize:9,fontWeight:700,color:"#64748b",flexShrink:0}}>{issue.category}</span>
                <span style={{fontSize:9,fontWeight:700,color:"#0f172a",flex:1}}>{issue.finding}</span>
                <button onClick={()=>resolveIssue(issue.id)} style={{fontSize:8,fontWeight:700,padding:"2px 8px",borderRadius:5,border:"1px solid #d6d3cd",background:issue.resolved?"#F0FDF4":"#fff",color:issue.resolved?"#047857":"#475569",cursor:"pointer",flexShrink:0}}>{issue.resolved?"✓ Resolved":"Resolve"}</button>
              </div>
              {issue.impact&&<div style={{fontSize:9,color:"#64748b",marginBottom:2}}><span style={{fontWeight:600}}>Impact:</span> {issue.impact}</div>}
              {issue.action&&<div style={{fontSize:9,color:"#475569"}}><span style={{fontWeight:600}}>Action:</span> {issue.action}</div>}
            </div>
          );
        })}
        {data.issues?.length>0&&<div style={{marginTop:8,fontSize:9,color:"#94a3b8",fontFamily:MN}}>{data.issues.filter(i=>!i.resolved).length} open · {data.issues.filter(i=>i.resolved).length} resolved</div>}
      </div>}
    </div>
  );
}
