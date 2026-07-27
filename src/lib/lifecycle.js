import { lodgingModeFor, segType } from "./segments";
import { daysBetween } from "./time";

export const crewLifecycleState=(crewId,date,attendingDates,tourDaysObj)=>{
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

export const crewLifecycleSlots=({state,crewId,crew,date,showCrew,flights,lodging})=>{
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
