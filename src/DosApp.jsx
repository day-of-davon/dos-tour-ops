import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { useAuth } from "./components/AuthGate.jsx";
import { supabase } from "./lib/supabase";

// DOS TOUR OPS v7.0 — Day of Show, LLC
// Client-first · All dept advance lanes · Custom + editable items · Full settlement

const SK={SHOWS:"dos-v7-shows",ROS:"dos-v7-ros",ADVANCES:"dos-v7-advances",FINANCE:"dos-v7-finance",SETTINGS:"dos-v7-settings"};
const MN="'JetBrains Mono',monospace";

const CLIENTS=[
  {id:"bbn",name:"bbno$",type:"artist",status:"active",color:"#5B21B6",short:"BBN"},
  {id:"wkn",name:"Wakaan",type:"festival",status:"active",color:"#065F46",short:"WKN"},
  {id:"bwc",name:"Beyond Wonderland",type:"festival",status:"active",color:"#1E40AF",short:"BWC"},
  {id:"elm",name:"Elements",type:"festival",status:"active",color:"#92400E",short:"ELM"},
];
const CM=CLIENTS.reduce((a,c)=>{a[c.id]=c;return a},{});
const ROLES=[{id:"tm",label:"TM",c:"#5B21B6"},{id:"production",label:"PROD",c:"#92400E"},{id:"hospitality",label:"HOSPO",c:"#065F46"},{id:"transport",label:"TRANSPORT",c:"#1E40AF"}];
const TABS=[{id:"dashboard",label:"Dashboard",icon:"◉"},{id:"advance",label:"Advance",icon:"◎"},{id:"ros",label:"Show Day",icon:"▦"},{id:"transport",label:"Transport",icon:"◈"},{id:"finance",label:"Finance",icon:"◐"},{id:"crew",label:"Crew",icon:"◇",disabled:true,soon:true}];
const AB=new Set(["bus_arrive","doors_early","doors_ga","clear","bus_depart"]);

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
  const out=[];const s=String(str||"");
  const re=/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)?\b/g;
  let m;while((m=re.exec(s))){
    let h=parseInt(m[1],10);const min=parseInt(m[2]||"0",10);const ap=(m[3]||"").toLowerCase();
    if(ap==="pm"&&h<12)h+=12;if(ap==="am"&&h===12)h=0;
    if(h<0||h>23||min<0||min>59)continue;
    if(!ap&&!m[2]&&(h<5||h>23))continue;
    out.push({minutes:h*60+min,index:m.index,token:m[0]});
  }
  return out;
}
function parseTimeStr(s){const t=parseAllTimes(s);return t.length?t[0].minutes:null;}
function fmtMin(m){if(m==null||m===0)return"—";const h=Math.floor(m/60),mm=m%60;const ap=h>=12?"PM":"AM";const h12=((h+11)%12)+1;return `${h12}:${String(mm).padStart(2,"0")} ${ap}`;}
const fmtAudit=(iso)=>{if(!iso)return"";const d=new Date(iso);const M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];const h=d.getHours();const ap=h>=12?"pm":"am";const h12=((h+11)%12)+1;return `${M[d.getMonth()]} ${d.getDate()}, ${h12}:${String(d.getMinutes()).padStart(2,"0")}${ap}`;};
const sGP=async k=>{try{const r=await window.storage.getPrivate(k);return r?JSON.parse(r.value):null}catch{return null}};
const sSP=async(k,v)=>{try{await window.storage.setPrivate(k,JSON.stringify(v));return true}catch{return false}};

export default function App(){
  const[tab,setTab]=useState("dashboard");
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
  const[refreshMsg,setRefreshMsg]=useState("");
  const[exp,setExp]=useState(false);
  const[undoToast,setUndoToast]=useState(null);
  const mobile=useMobile();
  const st=useRef(null);const stp=useRef(null);

  useEffect(()=>{(async()=>{
    const[s,r,a,f,se]=await Promise.all([sG(SK.SHOWS),sG(SK.ROS),sG(SK.ADVANCES),sG(SK.FINANCE),sG(SK.SETTINGS)]);
    const init=ALL_SHOWS.reduce((acc,sh)=>{acc[sh.date]={...sh,doorsConfirmed:false,curfewConfirmed:false,busArriveConfirmed:false,crewCallConfirmed:false,venueAccessConfirmed:false,mgTimeConfirmed:false,etaSource:"schedule",lastModified:Date.now()};return acc;},{});
    const merged={...init};if(s)Object.keys(s).forEach(k=>{if(merged[k])merged[k]={...merged[k],...s[k]};});
    setShows(merged);setRos(r||{});setAdvances(a||{});setFinance(f||{});
    if(se?.role)setRole(se.role);if(se?.tab)setTab(se.tab);if(se?.sel)setSel(se.sel);if(se?.aC)setAC(se.aC);
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
      const resp=await fetch("/api/intel",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({show,googleToken,forceRefresh:force})});
      if(!resp.ok){const err=await resp.json().catch(()=>({}));setRefreshMsg(err.error==="gmail_token_expired"?"Gmail token expired — re-sign in":`Error: ${resp.status}`);return;}
      const data=await resp.json();const ni=data.intel;
      if(!ni||!ni.threads){setRefreshMsg("No structured intel returned");return;}
      setIntel(p=>{
        const existing=p[sid]||{};
        const seenT=new Set();
        const threads=[...(ni.threads||[]),...(existing.threads||[])].filter(t=>{if(seenT.has(t.tid))return false;seenT.add(t.tid);return true;});
        const seenE=new Set();
        const contacts=[...(ni.showContacts||[]),...(existing.showContacts||[])].filter(c=>{const k=(c.email||c.name||"").toLowerCase();if(seenE.has(k))return false;seenE.add(k);return true;});
        const newTodos=(ni.followUps||[]).map(f=>({id:`t${Date.now()}_${Math.random().toString(36).slice(2,7)}`,text:f.action,owner:f.owner,priority:f.priority,deadline:f.deadline,threadTid:null,done:false,ts:Date.now()}));
        const existingTexts=new Set((existing.todos||[]).map(t=>t.text));
        const todos=[...(existing.todos||[]),...newTodos.filter(t=>!existingTexts.has(t.text))];
        return{...p,[sid]:{threads,followUps:ni.followUps||[],showContacts:contacts,schedule:ni.schedule||existing.schedule||[],todos,matches:existing.matches||[],dismissedFlags:existing.dismissedFlags||[],lastRefreshed:new Date().toISOString()}};
      });
      setRefreshMsg(`${show.venue}: ${data.gmailThreadsFound||0} threads`);
      setTimeout(()=>setRefreshMsg(""),3500);
    }catch(e){setRefreshMsg(`Refresh failed: ${e.message}`);}
    finally{setRefreshing(null);}
  },[refreshing]);

  const save=useCallback(()=>{
    if(!loaded)return;if(st.current)clearTimeout(st.current);
    st.current=setTimeout(async()=>{setSs("saving");await Promise.all([sS(SK.SHOWS,shows),sS(SK.ROS,ros),sS(SK.ADVANCES,advances),sS(SK.FINANCE,finance),sS(SK.SETTINGS,{role,tab,sel,aC})]);setSs("saved");setTimeout(()=>setSs(""),1500);},600);
  },[loaded,shows,ros,advances,finance,role,tab,sel,aC]);
  useEffect(()=>{save();},[shows,ros,advances,finance,role,tab,sel,aC]);
  useEffect(()=>{const h=e=>{if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setCmd(v=>!v);}if(e.key==="Escape")setCmd(false);};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[]);

  const uShow=useCallback((d,u)=>setShows(p=>({...p,[d]:{...p[d],...u,lastModified:Date.now()}})),[]);
  const uRos=useCallback((d,b)=>setRos(p=>{const n={...p};if(b)n[d]=b;else delete n[d];return n;}),[]);
  const uAdv=useCallback((d,u)=>setAdvances(p=>({...p,[d]:{...(p[d]||{}),...u}})),[]);
  const uFin=useCallback((d,u)=>setFinance(p=>({...p,[d]:{...(p[d]||{}),...u}})),[]);
  const gRos=useCallback(d=>{if(ros[d])return ros[d];if(CUSTOM_ROS_MAP[d])return CUSTOM_ROS_MAP[d]();return DEFAULT_ROS();},[ros]);
  const sorted=useMemo(()=>shows?Object.values(shows).sort((a,b)=>a.date.localeCompare(b.date)):[], [shows]);
  const next=useMemo(()=>{const t=new Date().toISOString().slice(0,10);return sorted.find(s=>s.date>=t)||sorted[0];},[sorted]);
  const cShows=useMemo(()=>sorted.filter(s=>s.clientId===aC),[sorted,aC]);

  if(!loaded||!shows)return(<div style={{background:"#F5F3EF",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',system-ui"}}><div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,color:"#0f172a",letterSpacing:"-0.03em"}}>DOS</div><div style={{fontSize:10,color:"#64748b",marginTop:3,fontFamily:MN}}>v7.0 loading...</div></div></div>);

  return(
    <Ctx.Provider value={{shows,uShow,ros,uRos,gRos,advances,uAdv,finance,uFin,sel,setSel,role,setRole,tab,setTab,sorted,cShows,next,setCmd,aC,setAC,notesPriv,uNotesPriv,checkPriv,uCheckPriv,mobile,setExp,intel,setIntel,refreshIntel,refreshing,refreshMsg,pushUndo,undoToast,setUndoToast}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body,#root{width:100%;max-width:100vw;overflow-x:hidden}.br,.rh{min-width:0}.br>div,.rh>div{min-width:0;overflow:hidden;text-overflow:ellipsis}body{background:#F5F3EF}img,svg,video{max-width:100%;height:auto}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:3px}@keyframes fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}.fi{animation:fi .18s ease forwards}.br:hover{background:#f0ede8!important}.rh:hover{background:#f8f7f5!important}`}</style>
      <div style={{fontFamily:"'Outfit',system-ui",background:"#F5F3EF",color:"#0f172a",minHeight:"100vh",width:"100%",maxWidth:"100vw",overflowX:"hidden",display:"flex",flexDirection:"column"}}>
        <TopBar ss={ss}/>
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,width:"100%",maxWidth:900,overflowX:"hidden"}}>
          {tab==="dashboard"&&<Dash/>}{tab==="advance"&&<AdvTab/>}{tab==="ros"&&<ROSTab/>}{tab==="transport"&&<TransTab/>}{tab==="finance"&&<FinTab/>}{tab==="crew"&&<PH label="Crew"/>}
        </div>
        {cmd&&<CmdP/>}
        {exp&&<ExportModal onClose={()=>setExp(false)}/>}
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
  return <div ref={ref} style={{position:"relative",flexShrink:0}}>
    <button onClick={onClick} onContextMenu={onCtx} onMouseDown={onDown} onMouseUp={onUp} onMouseLeave={onUp} onTouchStart={onDown} onTouchEnd={onUp}
      style={{fontSize:9,padding:"3px 9px",borderRadius:5,border:"none",cursor:"pointer",fontWeight:700,background:s.b,color:s.c,minWidth:78}}>{s.l}</button>
    {open&&<div style={{position:"absolute",top:"100%",right:0,marginTop:3,background:"#fff",border:"1px solid #d6d3cd",borderRadius:7,boxShadow:"0 6px 20px rgba(0,0,0,.1)",zIndex:50,padding:3,minWidth:120}}>
      {SC_ORDER.map(k=>{const v=SC[k];return <button key={k} onClick={()=>{setStatus(k);setOpen(false);}} style={{display:"block",width:"100%",textAlign:"left",padding:"4px 8px",fontSize:10,border:"none",background:status===k?v.b:"transparent",color:v.c,cursor:"pointer",borderRadius:4,fontWeight:600}}>{v.l}</button>;})}
    </div>}
  </div>;
}

function IntelPanel(){
  const{sel,shows,intel,refreshIntel,refreshing,refreshMsg,setIntel}=useContext(Ctx);
  const show=shows[sel];const sid=show?showIdFor(show):"";const data=intel[sid]||{};
  const toggleTodo=id=>setIntel(p=>({...p,[sid]:{...(p[sid]||{}),todos:(p[sid]?.todos||[]).map(t=>t.id===id?{...t,done:!t.done}:t)}}));
  const delTodo=id=>setIntel(p=>({...p,[sid]:{...(p[sid]||{}),todos:(p[sid]?.todos||[]).filter(t=>t.id!==id)}}));
  const dismissFlag=k=>setIntel(p=>({...p,[sid]:{...(p[sid]||{}),dismissedFlags:[...((p[sid]||{}).dismissedFlags||[]),k]}}));
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
      out.push({key,field:fld.field,label:fld.label,platform:cur?fmtMin(cur):"(not set)",emailVal:fmtMin(emailVal),snippet,threadTid,severity});
    };
    const fldByName=Object.fromEntries(FIELD_KEYS.map(f=>[f.field,f]));
    (data.schedule||[]).forEach((s,i)=>{
      const fld=fldByName[s.field];const corpus=`${s.time||""} ${s.item||""}`;const times=parseAllTimes(corpus);
      if(fld&&times.length){
        times.forEach(t=>addFlag(`sch_${fld.field}_${t.minutes}_${i}`,fld,t.minutes,corpus.trim(),s.tid||null));
      } else if(times.length){
        const text=String(s.item||"").toLowerCase();const guess=FIELD_KEYS.find(f=>f.keys.some(k=>text.includes(k)));
        if(guess)times.forEach(t=>addFlag(`sch_${guess.field}_${t.minutes}_${i}`,guess,t.minutes,corpus.trim(),s.tid||null));
      }
    });
    (data.threads||[]).forEach(t=>{
      const corpus=`${t.subject||""}\n${t.bodySnippet||t.snippet||""}`;
      const lower=corpus.toLowerCase();const times=parseAllTimes(corpus);if(!times.length)return;
      times.forEach(tm=>{
        let best=null,bestDist=Infinity;
        FIELD_KEYS.forEach(fld=>{
          fld.keys.forEach(k=>{const idx=lower.indexOf(k);if(idx<0)return;const d=Math.abs(idx-tm.index);if(d<bestDist){bestDist=d;best=fld;}});
        });
        if(!best||bestDist>80)return;
        const start=Math.max(0,tm.index-30),end=Math.min(corpus.length,tm.index+60);
        addFlag(`th_${best.field}_${tm.minutes}_${t.tid}_${tm.index}`,best,tm.minutes,corpus.slice(start,end).trim(),t.tid);
      });
    });
    return out;
  },[data,show]);
  if(!show)return null;const busy=refreshing===sid;
  return <div style={{display:"flex",flexDirection:"column",gap:8}}>
    <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <span style={{fontSize:10,fontWeight:800,color:"#5B21B6",letterSpacing:"0.06em"}}>GMAIL INTEL</span>
      {data.lastRefreshed&&<span style={{fontSize:9,color:"#94a3b8",fontFamily:MN}}>last: {new Date(data.lastRefreshed).toLocaleString()}</span>}
      <span style={{marginLeft:"auto",fontSize:9,color:"#64748b"}}>{(data.threads||[]).length} threads · {(data.todos||[]).length} to-dos</span>
      <button onClick={()=>refreshIntel(show,true)} disabled={!!refreshing} style={{background:refreshing?"#ebe8e3":"#5B21B6",color:refreshing?"#64748b":"#fff",border:"none",borderRadius:6,fontSize:10,padding:"4px 11px",cursor:refreshing?"default":"pointer",fontWeight:700}}>{busy?"Scanning…":"Refresh Intel"}</button>
    </div>
    {refreshMsg&&<div style={{fontSize:10,color:"#5B21B6",fontFamily:MN}}>{refreshMsg}</div>}
    {scheduleFlags.length>0&&<div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"10px 12px"}}>
      <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em",marginBottom:8}}>SCHEDULE INCONSISTENCIES ({scheduleFlags.length})</div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {scheduleFlags.map(f=>{const isC=f.severity==="CONFLICT";const col=isC?"#B91C1C":"#92400E";const bg=isC?"#FEE2E2":"#FEF3C7";
          return <div key={f.key} style={{border:`1px solid ${col}40`,background:bg,borderRadius:7,padding:"7px 9px",display:"flex",flexDirection:"column",gap:4}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:col,color:"#fff",fontWeight:800}}>{f.severity}</span>
              <span style={{fontSize:11,fontWeight:700,color:"#0f172a"}}>{f.label}</span>
              <span style={{marginLeft:"auto",display:"flex",gap:5}}>
                {f.threadTid&&<a href={gmailUrl(f.threadTid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:col,textDecoration:"none",fontWeight:600}}>open ↗</a>}
                <button onClick={()=>dismissFlag(f.key)} style={{background:"none",border:"none",cursor:"pointer",color:col,fontSize:14,padding:0}}>×</button>
              </span>
            </div>
            <div style={{fontSize:10,fontFamily:MN,color:"#0f172a"}}>platform: <span style={{fontWeight:600}}>{f.platform}</span> · email: <span style={{fontWeight:600}}>{f.emailVal}</span></div>
            <div style={{fontSize:9,color:"#64748b",fontStyle:"italic"}}>{f.snippet}</div>
          </div>;
        })}
      </div>
    </div>}
    <div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"10px 12px"}}>
      <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em",marginBottom:6}}>TO-DOS (PRIVATE)</div>
      {(data.todos||[]).length===0?<div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>No action items yet. Refresh Intel.</div>:
        (data.todos||[]).map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #f5f3ef"}}>
          <input type="checkbox" checked={!!t.done} onChange={()=>toggleTodo(t.id)}/>
          <span style={{fontSize:10,flex:1,color:t.done?"#94a3b8":"#0f172a",textDecoration:t.done?"line-through":"none"}}>{t.text}</span>
          {t.priority&&<span style={{fontSize:7,padding:"1px 5px",borderRadius:3,background:t.priority==="CRITICAL"?"#FEE2E2":t.priority==="HIGH"?"#FEF3C7":"#f1f5f9",color:t.priority==="CRITICAL"?"#B91C1C":t.priority==="HIGH"?"#92400E":"#64748b",fontWeight:700}}>{t.priority}</span>}
          {t.threadTid&&<a href={gmailUrl(t.threadTid)} target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"#5B21B6",textDecoration:"none"}}>↗</a>}
          <button onClick={()=>delTodo(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:12}}>×</button>
        </div>)}
    </div>
    {(data.threads||[]).length>0&&<div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"10px 12px"}}>
      <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em",marginBottom:6}}>THREADS</div>
      {data.threads.map(t=><a key={t.tid} href={gmailUrl(t.tid)} target="_blank" rel="noopener noreferrer" style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,padding:"5px 0",borderBottom:"1px solid #f5f3ef",fontSize:10,color:"#0f172a",textDecoration:"none"}}>
        <span><span style={{fontWeight:600}}>{t.subject||"(no subject)"}</span> <span style={{color:"#64748b",fontSize:9}}>· {t.from}</span></span>
        <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:"#EDE9FE",color:"#5B21B6",fontWeight:700}}>{t.intent||"?"}</span>
        <span style={{fontSize:8,color:"#94a3b8",fontFamily:MN}}>{t.date}</span>
      </a>)}
    </div>}
    {(data.followUps||[]).length>0&&<div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"10px 12px"}}>
      <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em",marginBottom:6}}>FOLLOW-UPS</div>
      {data.followUps.map((f,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto auto auto",gap:8,padding:"5px 0",borderBottom:"1px solid #f5f3ef",fontSize:10}}>
        <span>{f.action}</span><span style={{fontSize:8,color:"#64748b"}}>{f.owner}</span>
        <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:f.priority==="CRITICAL"?"#FEE2E2":"#f1f5f9",color:f.priority==="CRITICAL"?"#B91C1C":"#64748b",fontWeight:700}}>{f.priority}</span>
        <span style={{fontSize:8,color:"#94a3b8",fontFamily:MN}}>{f.deadline}</span>
      </div>)}
    </div>}
    {(data.showContacts||[]).length>0&&<div style={{background:"#fff",border:"1px solid #d6d3cd",borderRadius:10,padding:"10px 12px"}}>
      <div style={{fontSize:9,fontWeight:800,color:"#64748b",letterSpacing:"0.06em",marginBottom:6}}>CONTACTS</div>
      {data.showContacts.map((c,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8,padding:"4px 0",borderBottom:"1px solid #f5f3ef",fontSize:10}}>
        <span style={{fontWeight:600}}>{c.name}</span><span style={{color:"#64748b"}}>{c.role}</span>
        {c.email&&<a href={`mailto:${c.email}`} style={{color:"#5B21B6",fontSize:9,textDecoration:"none"}}>{c.email}</a>}
      </div>)}
    </div>}
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

function TopBar({ss}){
  const{tab,setTab,role,setRole,setCmd,next,aC,setAC,setExp,sorted,sel,setSel}=useContext(Ctx);
  const activeClients=CLIENTS.filter(c=>c.status==="active");
  return(
    <div style={{borderBottom:"1px solid #d6d3cd",background:"#fff",width:"100%",maxWidth:"100%",overflowX:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 20px 5px",minWidth:0,gap:8,width:"100%",maxWidth:900}}>
        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0,flexShrink:1,overflow:"hidden"}}>
          <span style={{fontSize:16,fontWeight:800,color:"#0f172a",letterSpacing:"-0.03em",flexShrink:0}}>DOS</span>
          <span style={{fontSize:8,color:"#94a3b8",fontWeight:600}}>v7.0</span>
          {next&&<span style={{fontSize:10,fontFamily:MN,color:"#5B21B6",fontWeight:600,marginLeft:4}}>{next.city} {fD(next.date)} · {dU(next.date)}d</span>}
          <select value={sel} onChange={e=>setSel(e.target.value)} title="Jump to show" style={{fontSize:9,padding:"3px 6px",borderRadius:5,border:"1px solid #d6d3cd",background:"#f5f3ef",color:"#0f172a",fontFamily:MN,fontWeight:600,cursor:"pointer",maxWidth:200}}>
            {sorted.map(s=><option key={s.date} value={s.date}>{fD(s.date)} · {s.city} · {s.venue}</option>)}
          </select>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,minWidth:0,maxWidth:"100%"}}>
          {ss&&<span style={{fontSize:9,color:ss==="saved"?"#047857":"#94a3b8",fontFamily:MN,fontWeight:600}}>{ss==="saving"?"saving...":"saved ✓"}</span>}
          <div style={{display:"flex",gap:1,background:"#ebe8e3",borderRadius:7,padding:2}}>
            {ROLES.map(r=><button key={r.id} onClick={()=>setRole(r.id)} style={{fontSize:9,fontWeight:role===r.id?700:500,padding:"3px 8px",borderRadius:5,border:"none",cursor:"pointer",background:role===r.id?"#fff":"transparent",color:role===r.id?r.c:"#64748b",boxShadow:role===r.id?"0 1px 3px rgba(0,0,0,.1)":"none"}}>{r.label}</button>)}
          </div>
          <button onClick={()=>setExp(true)} title="Export / Import" style={{background:"#ebe8e3",border:"1px solid #d6d3cd",borderRadius:5,color:"#475569",fontSize:9,padding:"3px 8px",cursor:"pointer",fontFamily:MN,fontWeight:600}}>⇅</button>
          <button onClick={()=>setCmd(true)} style={{background:"#ebe8e3",border:"1px solid #d6d3cd",borderRadius:5,color:"#475569",fontSize:9,padding:"3px 8px",cursor:"pointer",fontFamily:MN,fontWeight:600}}>⌘K</button>
          <SignOut/>
        </div>
      </div>
      <div style={{display:"flex",gap:2,padding:"3px 20px 4px",overflowX:"auto",width:"100%",maxWidth:900}}>
        {activeClients.map(c=>{const isA=c.id===aC;return(<button key={c.id} onClick={()=>setAC(c.id)} style={{flexShrink:0,padding:"2px 10px",borderRadius:20,border:isA?`1.5px solid ${c.color}`:"1px solid #d6d3cd",background:isA?`${c.color}14`:"transparent",color:isA?c.color:"#64748b",fontSize:9,fontWeight:isA?700:500,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><div style={{width:5,height:5,borderRadius:"50%",background:isA?c.color:"#d6d3cd"}}/>{c.name}<span style={{fontSize:7,opacity:0.5}}>{c.type==="festival"?"FEST":"ARTIST"}</span></button>);})}
      </div>
      <div style={{display:"flex",padding:"0 20px",width:"100%",maxWidth:900}}>
        {TABS.map(t=><button key={t.id} onClick={()=>!t.disabled&&setTab(t.id)} style={{padding:"6px 12px",fontSize:11,fontWeight:tab===t.id?700:500,color:t.disabled?"#c4bfb6":tab===t.id?"#0f172a":"#64748b",background:"none",border:"none",cursor:t.disabled?"default":"pointer",borderBottom:tab===t.id?"2px solid #5B21B6":"2px solid transparent",display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10}}>{t.icon}</span>{t.label}{t.soon&&<span style={{fontSize:7,color:"#c4bfb6"}}>soon</span>}</button>)}
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
                return(
                  <div key={item.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 14px",borderBottom:idx<arr.length-1?"1px solid #f5f3ef":"none",background:isEditing?"#FFFBEB":"transparent",opacity:muted?0.7:1}}>
                    <span style={{fontFamily:MN,fontSize:8,color:"#94a3b8",width:16,flexShrink:0,marginTop:2}}>{idx+1}.</span>
                    <div style={{flex:1,minWidth:0}}>
                      {isEditing?(
                        <input autoFocus value={editQ} onChange={e=>setEditQ(e.target.value)}
                          onBlur={()=>{setOverride(item.id,editQ);setEditId(null);}}
                          onKeyDown={e=>{if(e.key==="Enter"){setOverride(item.id,editQ);setEditId(null);}if(e.key==="Escape")setEditId(null);}}
                          style={{width:"100%",background:"#fff",border:`1.5px solid ${dept.color}`,borderRadius:4,color:"#0f172a",fontSize:10,padding:"3px 7px",outline:"none"}}/>
                      ):(
                        <div style={{display:"flex",alignItems:"flex-start",gap:4}}>
                          <span style={{fontSize:10,color:status==="na"?"#94a3b8":"#0f172a",fontWeight:500,lineHeight:1.4,flex:1,textDecoration:status==="na"?"line-through":"none"}}>{q}</span>
                          {canEdit&&!isEditing&&<button onClick={()=>{setEditId(item.id);setEditQ(q);}} style={{flexShrink:0,background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:11,padding:"0 2px",lineHeight:1}} title="Edit item">✎</button>}
                          {isCustom&&<button onClick={()=>deleteCustom(item.id)} style={{flexShrink:0,background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:13,padding:"0 2px",lineHeight:1}} title="Delete">×</button>}
                        </div>
                      )}
                      {status==="confirmed"&&meta.confirmedBy&&<div style={{fontSize:8,color:"#94a3b8",marginTop:2,fontFamily:MN}}>✓ {meta.confirmedBy} · {fmtAudit(meta.confirmedAt)}</div>}
                      <div style={{display:"flex",alignItems:"center",gap:4,marginTop:3}}>
                        <span style={{fontSize:7,padding:"1px 5px",borderRadius:3,background:item.dir==="we_provide"?"#EDE9FE":item.dir==="they_provide"?"#D1FAE5":"#f1f5f9",color:item.dir==="we_provide"?"#5B21B6":item.dir==="they_provide"?"#065F46":"#475569",fontWeight:600}}>{item.dir==="we_provide"?"We provide":item.dir==="they_provide"?"They provide":"Bilateral"}</span>
                        {item.locked&&<span style={{fontSize:8,color:"#94a3b8"}}>🔒 locked</span>}
                        {isCustom&&<span style={{fontSize:7,color:dept.color,fontWeight:700}}>custom</span>}
                        {item.private&&<span style={{fontSize:7,color:"#334155",fontWeight:700,background:"#e2e8f0",padding:"1px 4px",borderRadius:3}}>private</span>}
                      </div>
                    </div>
                    {(()=>{const m=matchFor(item.id);if(!m)return null;
                      const col=m.confidence==="high"?"#047857":m.confidence==="medium"?"#92400E":"#64748b";
                      const bg=m.confidence==="high"?"#D1FAE5":m.confidence==="medium"?"#FEF3C7":"#f1f5f9";
                      return <div style={{display:"flex",alignItems:"center",gap:4,marginRight:6,flexShrink:0}}>
                        <a href={gmailUrl(m.threadTid)} target="_blank" rel="noopener noreferrer" title={`${m.subject} — ${m.from}`} style={{fontSize:7,padding:"2px 5px",borderRadius:3,background:bg,color:col,fontWeight:700,textDecoration:"none"}}>email · {m.confidence}</a>
                        <button onClick={()=>confirmMatch(m)} style={{fontSize:8,padding:"2px 7px",borderRadius:4,border:"none",background:"#047857",color:"#fff",cursor:"pointer",fontWeight:700}}>Confirm</button>
                      </div>;})()}
                    <StatusBtn status={status} setStatus={(ns)=>setStatus(item.id,ns)} mobile={mobile}/>
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

function ROSTab(){
  const{shows,uShow,gRos,uRos,ros,sel,setSel,cShows,role,aC}=useContext(Ctx);
  const[editB,setEditB]=useState(null);const[editA,setEditA]=useState(null);const[dOver,setDOver]=useState(null);
  const dId=useRef(null);const client=CM[aC];const show=shows[sel];const blocks=gRos(sel);if(!show)return null;
  const today=new Date().toISOString().slice(0,10);const upcoming=cShows.filter(s=>s.date>=today);

  const times=useMemo(()=>{
    const t={};const{doors,curfew,busArrive,crewCall,venueAccess,mgTime}=show;
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
  },[show,blocks]);

  const setDur=(id,dur)=>uRos(sel,blocks.map(b=>b.id===id?{...b,duration:Math.max(0,dur)}:b));
  const reorder=(fid,tid)=>{const fi=blocks.findIndex(b=>b.id===fid),ti=blocks.findIndex(b=>b.id===tid);if(fi<0||ti<0||blocks[fi].phase!==blocks[ti].phase||blocks[fi].isAnchor||blocks[ti].isAnchor)return;const n=[...blocks];const[m]=n.splice(fi,1);n.splice(ti,0,m);const ciI=n.findIndex(b=>b.id==="mg_checkin"),mgI=n.findIndex(b=>b.id==="mg");if(ciI>=0&&mgI>=0&&ciI>mgI){const[ci]=n.splice(ciI,1);n.splice(mgI,0,ci);}uRos(sel,n);};
  const setAnc=(key,str)=>{const m=pM(str);if(m===null)return;uShow(sel,{[key]:m,[key+"Confirmed"]:true});setEditA(null);};
  const hl=b=>AB.has(b.id)||role==="tm"||b.roles?.includes(role);
  const AMAP={busArrive:"Bus Arrival",venueAccess:"Venue Access",crewCall:"Crew Call",mgTime:"M&G",doors:"Doors",curfew:"Curfew"};
  const isCustom=!!CUSTOM_ROS_MAP[sel];

  const renderB=b=>{
    const t=times[b.id];if(!t)return null;
    const isA=b.isAnchor,hi=hl(b),isE=editB===b.id,isDT=dOver===b.id;
    const canD=!isA&&b.id!=="doors_early"&&b.id!=="mg_checkin";
    const cK=b.anchorKey?b.anchorKey+"Confirmed":null;const isC=cK?show[cK]:false;
    return(
      <div key={b.id} draggable={canD}
        onDragStart={e=>{dId.current=b.id;e.dataTransfer.effectAllowed="move";}}
        onDragOver={e=>{e.preventDefault();if(dId.current&&dId.current!==b.id)setDOver(b.id);}}
        onDrop={e=>{e.preventDefault();if(dId.current&&dId.current!==b.id)reorder(dId.current,b.id);dId.current=null;setDOver(null);}}
        onDragEnd={()=>{dId.current=null;setDOver(null);}}
        onClick={()=>!isA&&b.id!=="mg_checkin"&&setEditB(isE?null:b.id)} className="br"
        style={{display:"flex",alignItems:"center",gap:8,padding:isA?"10px 14px":"7px 14px",background:isDT?"#ede9fe":"#fff",border:isA?`2px solid ${b.color}50`:isE?`1px solid ${b.color}`:"1px solid #d6d3cd",borderRadius:isA?12:8,cursor:canD?"grab":"default",opacity:hi?1:0.22,transition:"all .12s ease",boxShadow:isA?"0 2px 6px rgba(0,0,0,.06)":"none"}}>
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
        {b.duration>0&&!isA&&b.id!=="mg_checkin"&&<div onClick={e=>e.stopPropagation()} style={{fontFamily:MN,fontSize:10,color:"#475569",background:"#f5f3ef",padding:"3px 7px",borderRadius:4,flexShrink:0,cursor:"pointer",border:"1px solid #d6d3cd",fontWeight:600}}>{isE?<input type="number" min="0" max="480" step="5" defaultValue={b.duration} autoFocus onBlur={e=>{setDur(b.id,parseInt(e.target.value)||0);setEditB(null);}} onKeyDown={e=>{if(e.key==="Enter"){setDur(b.id,parseInt(e.target.value)||0);setEditB(null);}}} style={{width:44,background:"#fff",border:`1px solid ${b.color}`,borderRadius:4,color:"#0f172a",fontSize:10,fontFamily:"inherit",padding:"2px 4px",textAlign:"center"}}/>:`${b.duration}m`}</div>}
        {b.duration>0&&<div style={{width:46,fontFamily:MN,fontSize:9,color:"#94a3b8",textAlign:"right",flexShrink:0}}>{fmt(t.e)}</div>}
        {isA&&<button onClick={e=>{e.stopPropagation();setEditA(editA===b.id?null:b.id);}} style={{background:"#f5f3ef",border:`1px solid ${b.color}40`,borderRadius:6,color:b.color,fontSize:9,padding:"3px 7px",cursor:"pointer",flexShrink:0,fontWeight:700}}>Edit</button>}
      </div>
    );
  };

  const phases=[{k:"bus_in",l:"BUS ARRIVAL",s:"Anchor"},{k:"pre",l:"PRE-SHOW",s:"Forward from Crew Call"},{k:"mg",l:"MEET & GREET",s:"Anchor"},{k:"doors",l:"DOORS",s:"Contract anchor"},{k:"show",l:"SHOW",s:"Doors +60min"},{k:"curfew",l:"CURFEW",s:sel==="2026-04-16"?"HARD":"Contract anchor"},{k:"post",l:"POST-SHOW",s:"Relative to set end"}];

  return(
    <div className="fi" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 115px)"}}>
      <div style={{padding:"5px 20px",borderBottom:"1px solid #d6d3cd",background:"#fff",display:"flex",gap:2,overflowX:"auto",flexShrink:0}}>
        {upcoming.slice(0,12).map(s=>{const isSel=s.date===sel;const hasCust=!!CUSTOM_ROS_MAP[s.date];const hasOv=!!ros[s.date];
          return(<button key={s.date} onClick={()=>setSel(s.date)} style={{flexShrink:0,padding:"3px 9px",borderRadius:6,border:isSel?`2px solid ${client.color}`:"1px solid #d6d3cd",background:isSel?"#fff":"#f5f3ef",color:isSel?"#0f172a":"#64748b",fontSize:9,fontWeight:isSel?700:500,cursor:"pointer",position:"relative"}}>
            <div style={{fontFamily:MN,fontSize:9}}>{fD(s.date)}</div><div style={{fontSize:8}}>{s.city}</div>
            {(hasCust||hasOv)&&<div style={{position:"absolute",top:1,right:1,width:5,height:5,borderRadius:"50%",background:hasCust?"#5B21B6":"#047857"}}/>}
          </button>);})}
      </div>
      <div style={{padding:"6px 20px",borderBottom:"1px solid #ebe8e3",background:"#fff",display:"flex",gap:10,flexWrap:"wrap",fontSize:11,flexShrink:0,alignItems:"center"}}>
        <span style={{fontWeight:700}}>{show.venue}</span><span style={{color:"#475569",fontSize:10}}>{show.promoter}</span>
        {isCustom&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:4,background:"#ede9fe",color:"#5B21B6",fontWeight:700}}>Custom ROS</span>}
        {show.notes&&<span style={{color:"#92400E",fontWeight:600,fontSize:9}}>{show.notes}</span>}
        <div style={{marginLeft:"auto"}}><button onClick={()=>{uRos(sel,null);setEditB(null);}} style={{background:"#f5f3ef",border:"1px solid #d6d3cd",borderRadius:5,color:"#64748b",fontSize:9,padding:"3px 9px",cursor:"pointer",fontWeight:600}}>Reset</button></div>
      </div>
      {editA&&(()=>{const bl=blocks.find(b=>b.id===editA);const ak=bl?.anchorKey;if(!ak)return null;return(<div style={{padding:"6px 20px",background:"#FFFBEB",borderBottom:"1px solid #FDE68A",display:"flex",alignItems:"center",gap:10,flexShrink:0}}><span style={{fontSize:11,color:"#78350F",fontWeight:700}}>Editing {AMAP[ak]}:</span><input type="text" placeholder="7:00p" defaultValue={fmt(show[ak])} autoFocus onKeyDown={e=>{if(e.key==="Enter")setAnc(ak,e.target.value);if(e.key==="Escape")setEditA(null);}} style={{background:"#fff",border:"2px solid #92400E",borderRadius:5,color:"#0f172a",fontSize:12,fontFamily:MN,padding:"3px 9px",width:70,fontWeight:700}}/><span style={{fontSize:9,color:"#64748b"}}>Enter = save · Esc = cancel</span></div>);})()}
      <div style={{flex:1,overflow:"auto",padding:"10px 20px 30px",background:"#F5F3EF"}}>
        {phases.map(ph=>{const pb=blocks.filter(b=>ph.k==="bus_in"?b.phase==="bus_in":ph.k==="curfew"?b.id==="curfew":ph.k==="doors"?b.phase==="doors":ph.k==="mg"?b.phase==="mg":b.phase===ph.k);if(!pb.length)return null;
          return(<div key={ph.k} style={{marginBottom:6}}><div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0 3px"}}><div style={{fontSize:9,fontWeight:800,letterSpacing:"0.1em",color:"#64748b"}}>{ph.l}</div><div style={{flex:1,height:1,background:"#d6d3cd"}}/><div style={{fontSize:8,color:"#94a3b8",fontStyle:"italic"}}>{ph.s}</div></div><div style={{display:"flex",flexDirection:"column",gap:3}}>{pb.map(b=>renderB(b))}</div></div>);
        })}
        <div style={{marginTop:12,padding:"12px 14px",background:"#fff",border:"1px solid #d6d3cd",borderRadius:12,display:"flex",gap:12,flexWrap:"wrap"}}>
          {[{l:"Bus ETA",v:fmt(show.busArrive),c:"#1E40AF"},{l:"Crew Call",v:fmt(show.crewCall),c:"#92400E"},{l:"M&G",v:fmt(show.mgTime),c:"#065F46"},{l:"Doors",v:fmt(show.doors),c:"#166534"},{l:"Headline",v:times.bbno_set?`${fmt(times.bbno_set.s)}–${fmt(times.bbno_set.e)}`:"--",c:"#B91C1C"},{l:"Settlement",v:times.settlement?fmt(times.settlement.s):"--",c:"#854D0E"},{l:"Curfew",v:fmt(show.curfew),c:"#7F1D1D"},{l:"Bus Out",v:times.bus_depart?fmt(times.bus_depart.s):"--",c:"#1E40AF"}].map((s,i)=><div key={i}><div style={{fontSize:8,color:"#64748b",marginBottom:1,fontWeight:600}}>{s.l}</div><div style={{fontFamily:MN,fontSize:12,color:s.c,fontWeight:800}}>{s.v}</div></div>)}
        </div>
      </div>
    </div>
  );
}

function TransTab(){
  const[view,setView]=useState("bus");
  return(
    <div className="fi" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 115px)"}}>
      <div style={{padding:"7px 20px",borderBottom:"1px solid #d6d3cd",background:"#fff",display:"flex",gap:6,flexShrink:0,alignItems:"center"}}>
        {["bus","festival"].map(v=><button key={v} onClick={()=>setView(v)} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #d6d3cd",background:view===v?"#5B21B6":"#f5f3ef",color:view===v?"#fff":"#64748b",fontSize:10,fontWeight:700,cursor:"pointer"}}>{v==="bus"?"EU Bus Schedule":"Festival Dispatch"}</button>)}
        {view==="bus"&&<div style={{marginLeft:"auto",fontFamily:MN,fontSize:8,color:"#94a3b8"}}>Pieter Smit T26-021201 · 8,970 km · 31 days</div>}
      </div>
      <div style={{flex:1,overflow:"auto",padding:"12px 20px 30px"}}>
        {view==="bus"?(
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
        ):(
          <div style={{padding:"40px 0",textAlign:"center",color:"#64748b"}}><div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Festival Dispatch</div><div style={{fontSize:11,color:"#94a3b8"}}>Olivia manages driver pool for Beyond Wonderland and Wakaan.<br/>Payout log is in Finance → Payment Batch.</div></div>
        )}
      </div>
    </div>
  );
}

function FinTab(){
  const{shows,cShows,finance,uFin,pushUndo}=useContext(Ctx);
  const today=new Date().toISOString().slice(0,10);
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
    <div className="fi" style={{display:"flex",height:"calc(100vh - 115px)"}}>
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
    </div>
  );
}

function CmdP(){
  const{sorted,setSel,setTab,setCmd,setAC}=useContext(Ctx);
  const[q,setQ]=useState("");const ref=useRef(null);
  useEffect(()=>{ref.current?.focus();},[]);
  const res=useMemo(()=>{const ql=q.toLowerCase().trim();if(!ql)return[...TABS.filter(t=>!t.disabled).map(t=>({type:"tab",id:t.id,label:t.label,icon:t.icon})),...sorted.slice(0,5).map(s=>({type:"show",id:s.date,label:`${fD(s.date)} ${s.city}`,sub:s.venue,cId:s.clientId}))];const it=[];TABS.forEach(t=>{if(!t.disabled&&t.label.toLowerCase().includes(ql))it.push({type:"tab",id:t.id,label:t.label,icon:t.icon});});CLIENTS.forEach(c=>{if(c.name.toLowerCase().includes(ql))it.push({type:"client",id:c.id,label:c.name,sub:c.type});});sorted.forEach(s=>{if(s.city.toLowerCase().includes(ql)||s.venue.toLowerCase().includes(ql)||s.date.includes(ql))it.push({type:"show",id:s.date,label:`${fD(s.date)} ${s.city}`,sub:s.venue,cId:s.clientId});});return it.slice(0,12);},[q,sorted]);
  const go=item=>{if(item.type==="tab")setTab(item.id);if(item.type==="show"){setSel(item.id);if(item.cId)setAC(item.cId);setTab("ros");}if(item.type==="client"){setAC(item.id);setTab("dashboard");}setCmd(false);};
  return(
    <div onClick={()=>setCmd(false)} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.25)",backdropFilter:"blur(6px)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:100,zIndex:1000}}>
      <div onClick={e=>e.stopPropagation()} style={{width:400,background:"#fff",border:"1px solid #d6d3cd",borderRadius:16,boxShadow:"0 25px 60px rgba(0,0,0,.15)",overflow:"hidden"}}>
        <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search shows, clients, views..." onKeyDown={e=>{if(e.key==="Escape")setCmd(false);if(e.key==="Enter"&&res.length)go(res[0]);}} style={{width:"100%",padding:"14px 18px",background:"transparent",border:"none",borderBottom:"1px solid #ebe8e3",color:"#0f172a",fontSize:14,outline:"none",fontWeight:500}}/>
        <div style={{maxHeight:320,overflow:"auto"}}>
          {res.map((r,i)=><div key={`${r.type}-${r.id}-${i}`} onClick={()=>go(r)} style={{padding:"10px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,background:i===0?"#f5f3ef":"transparent",borderBottom:"1px solid #f5f3ef"}}>
            <span style={{fontSize:10,color:"#64748b",width:16,fontFamily:MN}}>{r.type==="tab"?r.icon:r.type==="client"?CM[r.id]?.short||"●":fW(r.id)}</span>
            <div style={{flex:1}}><div style={{fontSize:12,color:"#0f172a",fontWeight:600}}>{r.label}</div>{r.sub&&<div style={{fontSize:9,color:"#64748b"}}>{r.sub}</div>}</div>
            {r.cId&&<div style={{width:7,height:7,borderRadius:"50%",background:CM[r.cId]?.color||"#94a3b8"}}/>}
            <span style={{fontSize:8,color:"#94a3b8",fontFamily:MN}}>{r.type}</span>
          </div>)}
        </div>
      </div>
    </div>
  );
}

function PH({label}){return<div className="fi" style={{padding:40,textAlign:"center",color:"#64748b"}}><div style={{fontSize:14,fontWeight:700,marginBottom:6,color:"#475569"}}>{label}</div><div style={{fontSize:11}}>Coming in a future phase.</div></div>;}
