export const STATUS_STYLE={
  Landed:{bg:"var(--success-bg)",c:"var(--success-fg)",label:"Landed"},
  Departed:{bg:"var(--info-bg)",c:"var(--info-fg)",label:"Departed"},
  Scheduled:{bg:"var(--card-2)",c:"var(--text-2)",label:"Scheduled"},
  Cancelled:{bg:"var(--danger-bg)",c:"var(--danger-fg)",label:"Cancelled"},
  Delayed:{bg:"var(--warn-bg)",c:"var(--warn-fg)",label:"Delayed"},
  Unknown:{bg:"var(--card-2)",c:"var(--text-mute)",label:"—"},
};

export function statusStyle(s){return STATUS_STYLE[s]||STATUS_STYLE.Unknown;}

export const FOCUS_CARRIERS=["delta","american","united","air canada"];

export const resKey=f=>(f.pnr||f.bookingRef||f.confirmNo||f.tid||`solo_${f.id}`).toString().trim().toUpperCase();

export function computeLayoverMins(prev,next){
  if(!prev?.arr||!next?.dep)return null;
  const d1=new Date(`${prev.arrDate||prev.depDate||"2000-01-01"}T${prev.arr}`);
  const d2=new Date(`${next.depDate||"2000-01-01"}T${next.dep}`);
  if(isNaN(d1)||isNaN(d2))return null;
  const diff=Math.round((d2-d1)/60000);
  return diff>0&&diff<1440?diff:null;
}

export function fmtMins(m){if(!m)return"";return`${Math.floor(m/60)}h${String(m%60).padStart(2,"0")}m`;}

export function getJourneyType(segs){
  if(segs.length===1)return"ONE_WAY";
  const last=segs[segs.length-1],first=segs[0];
  if(segs.length===2&&(last.returnOfId||(last.to&&last.to===first.from)))return"ROUND_TRIP";
  return"MULTI_LEG";
}

export function getLegLabel(segs,i,jType){
  if(segs.length<2)return null;
  if(jType==="ROUND_TRIP")return i===0?"OUTBOUND":"RETURN";
  return`LEG ${i+1} / ${segs.length}`;
}

export const groupByReservation=list=>{
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

export const JOURNEY_BADGE={
  ONE_WAY:{label:"ONE-WAY",bg:"var(--card-2)",c:"var(--text-dim)"},
  ROUND_TRIP:{label:"ROUND TRIP",bg:"var(--info-bg)",c:"var(--info-fg,var(--link))"},
  MULTI_LEG:{label:"MULTI-LEG",bg:"var(--accent-pill-bg)",c:"var(--accent)"},
};

export function matchPaxToCrew(paxNames,crewList){
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
