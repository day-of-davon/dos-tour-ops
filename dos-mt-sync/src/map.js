// DOS data → normalized shape consumed by sync modules.

// Filter shows to only those with type="show" (skip off-days, travel days).
export function showsToSync(showsObj) {
  return Object.values(showsObj)
    .filter(s => s && s.type === 'show' && s.date && s.venue)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Promoter string from DOS show → plain company name for MT.
// DOS stores "MCD / Zach Desmond" or "LN UK / Kiarn Eslami".
// MT wants a company name; strip the rep name after " / ".
export function promoterName(show) {
  if (!show.promoter) return null;
  return show.promoter.split('/')[0].trim();
}

// Advance contacts on a show → MT Key Contact shape.
export function showContacts(show) {
  return (show.advance || [])
    .filter(c => c && c.name)
    .map(c => ({
      name:  c.name,
      role:  c.role  || '',
      phone: c.phone || '',
      email: c.email || '',
    }));
}

// Raw flights object → array of air segments only, sorted by depDate.
export function airSegments(flightsObj) {
  return Object.values(flightsObj)
    .filter(s => s && (s.type === 'air' || s.flightNo || s.carrier))
    .sort((a, b) => (a.depDate || '').localeCompare(b.depDate || ''));
}

// Raw flights object → array of ground segments only.
export function groundSegments(flightsObj) {
  return Object.values(flightsObj)
    .filter(s => s && s.type === 'ground' && !s.flightNo)
    .sort((a, b) => (a.depDate || '').localeCompare(b.depDate || ''));
}

// Find the show date a flight belongs to (departure side).
// Returns the show object or null.
export function matchShowForFlight(flight, showsObj) {
  const date = flight.depDate;
  if (!date) return null;
  if (showsObj[date]) return showsObj[date];
  // Check ±1 day (overnight legs)
  const d = new Date(date + 'T12:00:00');
  for (const offset of [-1, 1]) {
    const adj = new Date(d);
    adj.setDate(adj.getDate() + offset);
    const key = adj.toISOString().slice(0, 10);
    if (showsObj[key]) return showsObj[key];
  }
  return null;
}
