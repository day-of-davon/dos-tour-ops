// export.js — Transform DOS data → Master Tour native schema.
// Produces a JSON structure that mirrors MT's entity model exactly:
//   Event → contacts[], promoter
//   Event.travel → air[], ground[]
// Date/time strings are in the format MT's input fields expect.

import { showsToSync, promoterName, showContacts, airSegments, groundSegments } from './map.js';

// "2026-05-04" → "05/04/2026"
function mtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

// "08:30" or "2026-05-04T08:30:00" → "8:30 AM"
function mtTime(val) {
  if (!val) return '';
  const timePart = String(val).includes('T') ? val.split('T')[1] : val;
  let [h, min] = timePart.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${String(min).padStart(2, '0')} ${ampm}`;
}

// Flights that depart or arrive on a given date (±0).
function flightsForDate(segments, date) {
  return segments.filter(f => f.depDate === date || f.arrDate === date);
}

// Build one MT Event object from a DOS show + relevant flights.
function buildEvent(show, airSegs, groundSegs) {
  const date = show.date;

  const air = flightsForDate(airSegs, date).map(f => ({
    // MT Travel > Day Travel > AIR fields (in input order)
    party:       (f.pax || []).join(', '),
    airline:     f.carrier   || '',
    flightNo:    f.flightNo  || '',
    depAirport:  f.from      || '',
    depCity:     f.fromCity  || '',
    depDate:     mtDate(f.depDate),
    depTime:     mtTime(f.dep),
    arrAirport:  f.to        || '',
    arrCity:     f.toCity    || '',
    arrDate:     mtDate(f.arrDate || f.depDate),
    arrTime:     mtTime(f.arr),
    confirmNo:   f.confirmNo || f.pnr || '',
    cost:        f.cost      != null ? f.cost : '',
    currency:    f.currency  || 'USD',
    // Internal refs — not written to MT but useful for reconciliation
    _id:         f.id,
    _status:     f.status,
  }));

  const ground = flightsForDate(groundSegs, date).map(s => ({
    // MT Travel > Day Travel > GROUND fields
    party:       (s.pax || []).join(', '),
    origin:      s.from   || s.fromCity || '',
    destination: s.to     || s.toCity   || '',
    depTime:     mtTime(s.dep),
    arrTime:     mtTime(s.arr),
    detail:      s.detail || s.notes    || '',
    _id:         s.id,
  }));

  const contacts = showContacts(show).map(c => ({
    // MT Event > OVERVIEW > Key Contacts fields
    name:  c.name,
    role:  c.role,
    phone: c.phone,
    email: c.email,
  }));

  // Promoter: "MCD / Zach Desmond" → name="MCD", rep="Zach Desmond"
  const rawPromoter = show.promoter || '';
  const [promoterCompany, promoterRep] = rawPromoter.includes('/')
    ? rawPromoter.split('/').map(s => s.trim())
    : [rawPromoter.trim(), ''];

  return {
    // MT Event core fields
    date,
    venue:   show.venue,
    city:    show.city    || '',
    country: show.country || '',
    type:    show.type    || 'show',

    // MT Event > PROMOTER tab
    promoter: {
      company: promoterCompany,
      rep:     promoterRep,
    },

    // MT Event > OVERVIEW > Key Contacts
    contacts,

    // MT Event > Travel tab
    travel: { air, ground },
  };
}

// Main export: returns full MT-native payload.
export function buildMTExport(showsRaw, flightsRaw) {
  const shows  = showsToSync(showsRaw);
  const air    = airSegments(flightsRaw);
  const ground = groundSegments(flightsRaw);

  // Also include travel-day and off-day rows (no venue, but flights may attach)
  const allDays = Object.values(showsRaw)
    .filter(s => s?.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const events = allDays.map(day => buildEvent(day, air, ground));

  // Orphaned flights — not linked to any day in the shows object
  const coveredDates = new Set(allDays.map(d => d.date));
  const orphanAir = air.filter(f => !coveredDates.has(f.depDate) && !coveredDates.has(f.arrDate));
  const orphanGround = ground.filter(s => !coveredDates.has(s.depDate));

  return {
    exportedAt: new Date().toISOString(),
    schema: 'master-tour-v1',
    counts: {
      events:    events.length,
      shows:     events.filter(e => e.type === 'show').length,
      travelDays: events.filter(e => e.type === 'travel').length,
      air:       air.length,
      ground:    ground.length,
      orphanAir: orphanAir.length,
    },
    events,
    orphanFlights: {
      air:    orphanAir.map(f => ({ ...buildEvent({ date: f.depDate, venue: '', city: '' }, [f], []) }.travel.air[0])),
      ground: orphanGround.map(s => ({ ...buildEvent({ date: s.depDate, venue: '', city: '' }, [], [s]) }.travel.ground[0])),
    },
  };
}
