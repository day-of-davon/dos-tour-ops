export const flightItinKey=f=>f.confirmNo||f.pnr||f.bookingRef||((f.pax||[]).slice().sort().join("|")||f.id);

export const flightDedupKey=f=>{
  const fn=f.flightNo||f.carrier,fr=f.from,to=f.to,dd=f.depDate;
  if(fn&&fr&&to&&dd)return`${fn}__${fr}__${to}__${dd}`;
  return f.pnr||f.confirmNo||f.bookingRef||f.tid||f.id;
};

export const normFlightNo=s=>String(s||'').trim().toUpperCase().replace(/\s+/g,'');

export const isJunkFlightNo=fn=>!fn||/^(UNKNOWN|AC)$/.test(normFlightNo(fn));

export const flightRichness=f=>{
  const n=Object.values(f).filter(v=>v!=null&&v!==''&&!(Array.isArray(v)&&!v.length)).length;
  return n+(f.pnr?5:0)+((f.pax||[]).length?3:0)+(isJunkFlightNo(f.flightNo)?-50:0);
};

export function cleanFlightsObj(raw){
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

export const FLIGHT_ENRICH_FIELDS=["flightNo","carrier","from","fromCity","to","toCity","depDate","dep","arrDate","arr","cost","currency","pnr","confirmNo","ticketNo","bookingStatus","payMethod"];

export const enrichFlight=(existing,fresh)=>{
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

export const findFlightMatch=(cur,f)=>{
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

export const tagFlightRoles=(deps,arrs)=>{
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

export const CITY_AIRPORTS={
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

export const AIRPORT_TO_CITIES={};

export const cityKey=c=>String(c||"").toLowerCase().split(",")[0].trim();

export const matchShowByAirport=(iata,flightCity,flightDate,shows,direction)=>{
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

export const findItineraryLegs=(f,allFlightsObj)=>{
  const key=flightItinKey(f);
  return Object.values(allFlightsObj)
    .filter(x=>flightItinKey(x)===key)
    .sort((a,b)=>`${a.depDate||""} ${a.dep||""}`.localeCompare(`${b.depDate||""} ${b.dep||""}`));
};

export const legGapMinutes=(prev,next)=>{
  if(!prev?.arrDate||!prev?.arr||!next?.depDate||!next?.dep)return null;
  const a=new Date(`${prev.arrDate}T${prev.arr}:00`).getTime();
  const d=new Date(`${next.depDate}T${next.dep}:00`).getTime();
  if(isNaN(a)||isNaN(d))return null;
  return Math.round((d-a)/60000);
};

export const validateConnections=(legs)=>{
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

export const findReturnLeg=(f,allFlightsObj)=>{
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

export const flightToLeg=f=>({
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
