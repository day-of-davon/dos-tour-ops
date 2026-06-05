import { T } from "../styles/tokens";

export const showIdFor=(s)=>`${s.venue}__${s.date}`.toLowerCase().replace(/\s+/g,"_");

export const gmailUrl=(tid)=>`https://mail.google.com/mail/u/0/#all/${tid}`;

export const STOP=new Set(["the","a","an","of","to","for","and","or","is","on","in","with","your","we","please","be","at","by","from","are","this","that"]);

export const tokens=(s)=>(String(s||"").toLowerCase().match(/[a-z0-9]{3,}/g)||[]).filter(w=>!STOP.has(w));

export function textSimilar(a,b){
  const ta=tokens(a),tb=tokens(b);
  if(!ta.length||!tb.length)return false;
  const sa=new Set(ta),sb=new Set(tb);
  const na=String(a||"").toLowerCase().trim(),nb=String(b||"").toLowerCase().trim();
  if(na===nb)return true;
  if(na.includes(nb)||nb.includes(na))return true;
  const shared=[...sa].filter(w=>sb.has(w)).length;
  return shared/Math.min(sa.size,sb.size)>=0.75;
}

export function deduplicateIntel(data){
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

export function matchScore(itemText,thread){
  const a=new Set(tokens(itemText));const b=new Set([...tokens(thread.subject),...tokens(thread.from)]);
  if(!a.size||!b.size)return 0;let hit=0;a.forEach(w=>{if(b.has(w))hit++;});
  return hit/Math.min(a.size,b.size);
}

export const confOf=(s)=>s>=0.6?"high":s>=0.35?"medium":s>=0.18?"low":null;

export function suggestStatusFromThread(thread,currentStatus){
  const txt=((thread.subject||"")+" "+(thread.snippet||thread.bodySnippet||"")).toLowerCase();
  if(/\b(urgent|asap|overdue|time\s*sensitive|escalat)/.test(txt))return{status:"escalate",reason:"urgency keyword"};
  if(/\b(confirmed|approved|signed\s*off|all\s*set|locked\s*in|good\s*to\s*go)\b/.test(txt))return{status:"confirmed",reason:"confirmation keyword"};
  if(/\b(received|got\s*it|thanks\s*for\s*sending|in\s*hand)\b/.test(txt))return{status:"received",reason:"receipt keyword"};
  if(/\b(following\s*up|checking\s*in|bumping|any\s*update|just\s*a\s*reminder|awaiting)\b/.test(txt))return{status:"follow_up",reason:"follow-up keyword"};
  if(/\b(please\s*(respond|reply|confirm|sign|complete|fill)|needs?\s*response|your\s*input)\b/.test(txt))return{status:"respond",reason:"response requested"};
  if(currentStatus==="pending")return{status:"in_progress",reason:"thread matched"};
  return null;
}

export const FIELD_KEYS=[
  {field:"doors",keys:["doors","door"],label:"Doors"},
  {field:"curfew",keys:["curfew"],label:"Curfew"},
  {field:"busArrive",keys:["bus arrival","bus arrive","bus"],label:"Bus Arrival"},
  {field:"crewCall",keys:["crew call","crewcall"],label:"Crew Call"},
  {field:"venueAccess",keys:["venue access","load in","load-in","loadin"],label:"Venue Access"},
  {field:"mgTime",keys:["meet & greet","m&g","meet and greet"," mg "],label:"M&G"},
];

export function parseAllTimes(str){
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

export function parseTimeStr(s){const t=parseAllTimes(s);return t.length?t[0].minutes:null;}

export function fmtMin(m){if(m==null||m===0)return"—";const h=Math.floor(m/60),mm=m%60;const ap=h>=12?"PM":"AM";const h12=((h+11)%12)+1;return `${h12}:${String(mm).padStart(2,"0")} ${ap}`;}

export const fmtAudit=(iso)=>{if(!iso)return"";const d=new Date(iso);const M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];const h=d.getHours();const ap=h>=12?"pm":"am";const h12=((h+11)%12)+1;return `${M[d.getMonth()]} ${d.getDate()}, ${h12}:${String(d.getMinutes()).padStart(2,"0")}${ap}`;};

export const DRIVE_FLAG_STYLE={
  danger:{c:"var(--danger-fg)",bg:"var(--danger-bg)"},
  warn:{c:"var(--warn-fg)",bg:"var(--warn-bg)"},
  info:{c:"var(--info-fg)",bg:"var(--info-bg)"},
  accent:{c:"var(--accent)",bg:"var(--accent-pill-bg)"},
  mute:{c:T.textDim,bg:"var(--card-2)"},
};

export function computeDriveFlags(entry){
  if(!entry)return [];
  const out=[];
  const note=String(entry.note||"");
  const route=String(entry.route||"");
  const arr=String(entry.arr||"");
  const driveStr=String(entry.drive||"");
  const driveH=parseFloat(driveStr.replace(/[^0-9.]/g,""));
  if(entry.flag==="⚠")out.push({id:"warn",label:"FLAGGED",sev:"danger"});
  if(!isNaN(driveH)&&driveH>0){
    if(driveH>=11)out.push({id:"drv",label:`${driveH}h DRIVE`,sev:"danger"});
    else if(driveH>=10)out.push({id:"drv",label:`${driveH}h DRIVE`,sev:"warn"});
    else if(driveH>=8)out.push({id:"drv",label:`${driveH}h DRIVE`,sev:"info"});
  }
  if(/\bDD\b/.test(note))out.push({id:"dd",label:"DD REQUIRED",sev:"warn"});
  if(/EC561/.test(note))out.push({id:"ec",label:"EC561 BREAK",sev:"info"});
  if(/Le Shuttle|ferry/i.test(note)||/ferry/i.test(route))out.push({id:"fy",label:"FERRY",sev:"accent"});
  if(/CRITICAL/.test(note))out.push({id:"cr",label:"CRITICAL",sev:"danger"});
  if(/Immigration/i.test(note))out.push({id:"im",label:"IMMIGRATION",sev:"danger"});
  if(/Deadhead/i.test(note)||/multi-day/i.test(arr))out.push({id:"dh",label:"DEADHEAD",sev:"mute"});
  const rp=note.match(/(\d+)h RP\b/);
  if(rp&&parseInt(rp[1])<=9)out.push({id:"rp",label:`${rp[1]}h RP`,sev:"warn"});
  if(entry.show&&!isNaN(driveH)&&driveH>0)out.push({id:"sd",label:"SHOW-DAY ARR",sev:"warn"});
  return out;
}
