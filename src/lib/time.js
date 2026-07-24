export const hhmmToMin=s=>{if(!s)return null;const[h,m]=s.split(":").map(Number);return isNaN(h)||isNaN(m)?null:h*60+m;};

export const subtractMinutes=(hhmm,mins)=>{
  const t=hhmmToMin(hhmm);if(t==null)return"";
  const diff=t-mins;
  if(diff<0){const d=1440+diff;return`${String(Math.floor(d/60)).padStart(2,"0")}:${String(d%60).padStart(2,"0")}*`;}
  return`${String(Math.floor(diff/60)).padStart(2,"0")}:${String(diff%60).padStart(2,"0")}`;
};

export const daysBetween=(a,b)=>{
  if(!a||!b)return 0;
  return Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/86400000);
};

export const toM=(h,m=0)=>h*60+m;

export const fmt=mins=>{if(mins==null)return"--";const n=((mins%1440)+1440)%1440,h=Math.floor(n/60),m=n%60,p=h>=12?"p":"a",h12=h===0?12:h>12?h-12:h;return`${h12}:${String(m).padStart(2,"0")}${p}`;};

export const pM=str=>{if(!str)return null;const m=str.match(/^(\d{1,2}):(\d{2})\s*(a|p|am|pm)?$/i);if(!m)return null;let h=parseInt(m[1]);const mi=parseInt(m[2]),pe=(m[3]||"a").toLowerCase();if(pe.startsWith("p")&&h<12)h+=12;if(pe.startsWith("a")&&h===12)h=0;return h*60+mi;};

export const dU=d=>Math.ceil((new Date(d+"T12:00:00")-new Date())/86400000);

export const fD=d=>new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});

export const fW=d=>new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"});

export const fFull=d=>new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});

export const fmt24=(mins)=>{const t=((mins%1440)+1440)%1440;const h=Math.floor(t/60);const m=Math.round(t%60);return`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;};

export const fmtDur=(mins)=>{if(mins<60)return`${mins}min`;const h=mins/60;const r=Math.round(h*2)/2;return`${r}h`;};
