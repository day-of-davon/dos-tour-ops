export const icsEsc=s=>String(s||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");

export const icsDate=iso=>iso.replace(/-/g,"");

export const icsAddDay=iso=>{const d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+1);return d.toISOString().slice(0,10).replace(/-/g,"");};

export const buildICS=(events,calName)=>{
  const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Day of Show//Tour Ops//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH",`X-WR-CALNAME:${icsEsc(calName||"Tour")}`];
  events.forEach(ev=>{
    if(!ev?.date)return;
    lines.push("BEGIN:VEVENT",`UID:dos-${ev.date}-${(ev.uidSuffix||ev.kind||"day")}@dayofshow`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${icsDate(ev.date)}`,`DTEND;VALUE=DATE:${icsAddDay(ev.date)}`,`SUMMARY:${icsEsc(ev.summary||ev.date)}`);
    if(ev.location)lines.push(`LOCATION:${icsEsc(ev.location)}`);
    if(ev.description)lines.push(`DESCRIPTION:${icsEsc(ev.description)}`);
    if(ev.url)lines.push(`URL:${icsEsc(ev.url)}`);
    lines.push("TRANSP:TRANSPARENT","END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
};

export const downloadICS=(filename,content)=>{
  const blob=new Blob([content],{type:"text/calendar;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
