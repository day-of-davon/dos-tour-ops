import { T } from "../styles/tokens";

export const describeScanError=body=>{
  if(!body)return "";
  try{
    const p=JSON.parse(body);
    if(p?.anthropic?.message)return`${p.anthropic.type||"error"}: ${p.anthropic.message}`.slice(0,400);
    if(p?.error)return String(p.error).slice(0,400);
  }catch{}
  return String(body).slice(0,400);
};

export const MN="'JetBrains Mono',monospace";

export const CLIENTS=[
  {id:"bbn",name:"bbno$",type:"artist",status:"active",color:T.accent,short:"BBN"},
  {id:"wkn",name:"Wakaan",type:"festival",status:"active",color:T.successFg,short:"WKN"},
  {id:"bwc",name:"Beyond Wonderland",type:"festival",status:"active",color:T.link,short:"BWC"},
  {id:"elm",name:"Elements",type:"festival",status:"active",color:T.warnFg,short:"ELM"},
];

export const CM=CLIENTS.reduce((a,c)=>{a[c.id]=c;return a},{});

export const isClientOwner=(me,clientId)=>!!(me?.primary||[]).includes(clientId);

export const ROLES=[{id:"tm_td",label:"TM/TD",c:"var(--accent)"},{id:"internal",label:"Internal",c:"var(--warn-fg)"},{id:"viewer",label:"Viewer",c:"var(--text-dim)"}];

export const TABS=[{id:"dash",label:"Dashboard",icon:"⊞"},{id:"cross",label:"Cross-tour",icon:"❖"},{id:"advance",label:"Advance",icon:"◎"},{id:"guestlist",label:"Guest List",icon:"◉"},{id:"ros",label:"Schedule",icon:"▦"},{id:"transport",label:"Logistics",icon:"◈"},{id:"finance",label:"Finance",icon:"◐"},{id:"crew",label:"Crew",icon:"◇"},{id:"lodging",label:"Lodging",icon:"⌂"},{id:"production",label:"Production",icon:"▤"},{id:"notes",label:"Notes",icon:"◫"},{id:"access",label:"Access",icon:"⊙"}];

// ── Touring legs ────────────────────────────────────────────────────────────
// The per-show `region` tag is unreliable as a leg key: "festival" alone covers
// Bonnaroo (NA), Sziget/Superbloom (EU) and Wakaan/Elements (standalone). But
// `country` and `clientId` are clean. So: bbno$ dates split by continent, and
// every non-bbno$ client (Wakaan, Elements, Beyond Wonderland) is the festival book.
export const NA_COUNTRIES=new Set(["US","CA","MX"]);
export const LEG_ORDER=["na","eu","fest"];
export const LEG_META={
  na:  {label:"NA summer",short:"NA",  color:"#1D9E75"},
  eu:  {label:"EU summer",short:"EU",  color:"#378ADD"},
  fest:{label:"Festivals",short:"FEST",color:"#7F77DD"},
};
export const legOf=s=>{
  if(!s)return"na";
  if(s.clientId&&s.clientId!=="bbn")return"fest";
  return NA_COUNTRIES.has(s.country)?"na":"eu";
};
// Cross-cutting risks not attached to any single show, so the show-anchored tabs
// have nowhere to put them. Seeded from TOUR.md.
// TODO: move to a `dos-v7-portfolio-flags` shared storage key so it stays live.
export const PORTFOLIO_FLAGS=[
  {level:"critical",label:"Insurance $0",sub:"blocks all legs — route to Sam/Sandro"},
  {level:"warn",label:"CRA Reg 105 waivers · 5 CA shows",sub:"Mississauga deadline passed"},
  {level:"warn",label:"Wasserman UK FEU cert",sub:"holds Glasgow settlement"},
];

export const COMMENT_TARGETS={
  dash:["Overview cards","Upcoming shows","Open items","Intel panel"],
  advance:["Checklist items","Status pills","Contacts","Notes","Intel threads"],
  guestlist:["Parties panel","Categories","Templates","Activity log"],
  ros:["ROS timeline","Anchor blocks","Block editor"],
  transport:["Bus schedule","Driver dispatch","Ground transport"],
  finance:["Settlement table","Wire tracker","Payout log","Ledger"],
  crew:["Crew roster","Split-day picker"],
  lodging:["Room blocks","Scan panel","Todos"],
  production:["Doc ingest","Equipment list"],
  access:["Role selector","Permissions matrix","Comments review"],
};

export const COMMENT_CATEGORIES=[
  {id:"bug",label:"Bug",color:"var(--danger-fg)"},
  {id:"feature",label:"Feature request",color:T.accent},
  {id:"ux",label:"UX issue",color:T.warnFg},
  {id:"fix",label:"Fix needed",color:T.link},
];

export const COMMENT_STATUSES=[
  {id:"open",label:"Open",color:T.textDim},
  {id:"reviewed",label:"Reviewed",color:T.link},
  {id:"planned",label:"Planned",color:T.accent},
  {id:"done",label:"Done",color:T.successFg},
  {id:"wontfix",label:"Won't fix",color:T.textMute},
];

export const ADMIN_EMAIL="d.johnson@dayofshow.net";

export const SESSION_ID=Math.random().toString(36).slice(2,9);

export const PERM_ROLES=[
  {id:"tm_td",label:"TM/TD"},
  {id:"internal",label:"Internal"},
  {id:"viewer",label:"Viewer"},
];

export const PERM_SCHEMA=[
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

export const DEFAULT_PERMS=(()=>{const p={};PERM_SCHEMA.forEach(s=>s.items.forEach(item=>{p[item.id]={};PERM_ROLES.forEach(r=>{p[item.id][r.id]=true;});}));return p;})();

export const DEFAULT_CREW=[
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

export const AB=new Set(["bus_arrive","doors_early","doors_ga","clear","bus_depart"]);

export const UI={
  expandPanel:{background:"var(--card-4)",borderLeft:"3px solid var(--accent)",padding:"10px 14px 12px"},
  expandBtn:(open,accent="var(--accent)")=>({background:open?"var(--accent)":accent,border:"none",borderRadius:6,color:"#fff",fontSize:10,padding:"4px 11px",cursor:"pointer",fontWeight:700}),
  sectionLabel:{fontSize:9,fontWeight:800,color:T.textDim,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6},
  input:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:"'Outfit',system-ui"},
};

export const DEPTS=[
  {id:"all",label:"All",color:T.text2,bg:"var(--card-2)"},
  {id:"artist_team",label:"Artist Team",color:T.accent,bg:"var(--accent-pill-bg)"},
  {id:"venue",label:"Venue / Promoter",color:T.successFg,bg:"var(--success-bg)"},
  {id:"ar_hospo",label:"AR / Hospo",color:T.successFg,bg:"var(--success-bg)"},
  {id:"transport",label:"Transport",color:T.link,bg:"var(--info-bg)"},
  {id:"production",label:"Production",color:T.warnFg,bg:"var(--warn-bg)"},
  {id:"vendors",label:"Vendors",color:"var(--accent-soft)",bg:"var(--accent-pill-bg)"},
  {id:"site_ops",label:"Site Ops",color:"var(--info-fg)",bg:"var(--info-bg)"},
  {id:"quartermaster",label:"Quartermaster",color:T.textDim,bg:"var(--card-3)"},
];

export const DM=DEPTS.reduce((a,d)=>{a[d.id]=d;return a},{});

export const AT=[
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

export const SC={
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

export const SC_CYCLE=["pending","in_progress","confirmed"];

export const SC_ORDER=["pending","in_progress","sent","received","respond","follow_up","escalate","confirmed","na"];

export const IMM_TYPES=[
  {id:"work_permit",l:"Work Permit"},
  {id:"visa",l:"Visa"},
  {id:"withholding",l:"Withholding / Tax"},
  {id:"customs",l:"Customs / Carnet"},
  {id:"other",l:"Other"},
];

export const IMM_STATUS=[
  {id:"not_started",l:"Not Started",c:"var(--text-dim)",b:"var(--muted-bg)"},
  {id:"in_progress",l:"In Progress",c:"var(--link)",b:"var(--info-bg)"},
  {id:"submitted",l:"Submitted",c:"var(--warn-fg)",b:"var(--warn-bg)"},
  {id:"received",l:"Received",c:"var(--accent)",b:"var(--accent-pill-bg)"},
  {id:"approved",l:"Approved",c:"var(--success-fg)",b:"var(--success-bg)"},
  {id:"rejected",l:"Rejected",c:"var(--danger-fg)",b:"var(--danger-bg)"},
  {id:"na",l:"N/A",c:"var(--text-mute)",b:"var(--muted-bg)"},
];

export const PRE_STAGES=[{id:"contract_received",l:"Contract Received"},{id:"estimate_received",l:"Pre-Show Estimate"},{id:"guarantee_confirmed",l:"Guarantee Confirmed"}];

export const POST_STAGES=[{id:"expenses_reviewed",l:"Expenses Reviewed"},{id:"disputes_resolved",l:"Disputes Resolved"},{id:"payment_initiated",l:"Payment Initiated"},{id:"wire_ref_confirmed",l:"Wire Ref # Confirmed",req:true},{id:"signed_sheet",l:"Signed Sheet Received",req:true}];

export const FIN_EVENT_TYPES=[
  {id:"settlement",l:"Settlement",c:"var(--success-fg)",b:"var(--success-bg)"},
  {id:"wire",l:"Wire",c:"var(--link)",b:"var(--info-bg)"},
  {id:"withholding",l:"Withholding",c:"var(--warn-fg)",b:"var(--warn-bg)"},
  {id:"merch",l:"Merch",c:"var(--accent)",b:"var(--accent-pill-bg)"},
  {id:"vip",l:"VIP",c:"var(--link)",b:"var(--info-bg)"},
  {id:"reconciliation",l:"Reconciliation",c:"var(--text-2)",b:"var(--muted-bg)"},
  {id:"other",l:"Other",c:"var(--text-dim)",b:"var(--muted-bg)"},
];

export const FIN_EVENT_STATUS=[
  {id:"pending",l:"Pending",c:"var(--text-dim)",b:"var(--muted-bg)"},
  {id:"in_progress",l:"In Progress",c:"var(--link)",b:"var(--info-bg)"},
  {id:"confirmed",l:"Confirmed",c:"var(--success-fg)",b:"var(--success-bg)"},
  {id:"disputed",l:"Disputed",c:"var(--danger-fg)",b:"var(--danger-bg)"},
];
