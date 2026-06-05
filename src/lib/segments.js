import { T } from "../styles/tokens";
import { HOTEL_DEFAULT_CHECKIN, HOTEL_DEFAULT_CHECKOUT } from "./constants";
import { cityKey } from "./flights";
import { hhmmToMin } from "./time";
import { BUS_DATA_MAP } from "./tour-data";

export const buildDayTimeline=(date,daySegs,lodging)=>{
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

export const SEG_META={
  air:   {label:"Flight",  icon:"✈", color:T.link, bg:"var(--info-bg)", border:"var(--info-bg)"},
  ground:{label:"Ground",  icon:"🚗", color:T.warnFg, bg:"var(--warn-bg)", border:"var(--warn-bg)"},
  bus:   {label:"Bus",     icon:"🚌", color:"var(--info-fg)", bg:"var(--info-bg)", border:"var(--info-bg)"},
  rail:  {label:"Rail",    icon:"🚆", color:T.successFg, bg:"var(--success-bg)", border:"var(--success-fg)"},
  sea:   {label:"Sea",     icon:"⛴", color:"var(--info-fg)", bg:"var(--info-bg)", border:"var(--info-fg)"},
  hotel: {label:"Hotel",   icon:"🏨", color:T.accent, bg:"var(--accent-pill-bg)", border:"var(--accent-pill-border)"},
};

export const segType=s=>s?.type||(s?.flightNo||s?.carrier?"air":"ground");

export const segMeta=s=>SEG_META[segType(s)]||SEG_META.air;

export const AIRPORT_BUFFERS={
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

export const airportBufferMin=(iata,hasBag=true)=>{
  const b=AIRPORT_BUFFERS[(iata||"").toUpperCase()]||AIRPORT_BUFFERS.__default;
  return hasBag?b.bag:b.carry;
};

export const lodgingModeFor=(date,tourDaysObj)=>{
  const td=tourDaysObj?.[date];
  const bus=td?.bus||BUS_DATA_MAP[date];
  if(!bus)return"hotel";
  // Days marked explicitly "off" outside the bus window don't count.
  if(td?.type==="off"&&!bus)return"hotel";
  return"bus";
};
