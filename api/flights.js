// api/flights.js — Gmail flight confirmation scraper + Claude parser
const { createClient } = require("@supabase/supabase-js");
const { gmailSearch, fetchBatched, extractBody, stripMarketingFooter, extractHtmlRaw, extractJsonLdReservations, extractJson } = require("./lib/gmail");
const { ANTHROPIC_URL, ANTHROPIC_HEADERS, DEFAULT_MODEL } = require("./lib/anthropic");
const {
  hashBody, shouldUseCached,
  startScanRun, finishScanRun,
  getCachedThread, putCachedThread,
  logEnhancement, bumpStopReason,
} = require("./lib/scanMemory");
const {
  collectThreadAttachments, dedupFolios,
  fetchAttachmentB64, attachmentFingerprint,
} = require("./lib/attachments");

// PDF attachment caps (match lodging-scan).
const PDF_MAX_PER_THREAD = 2;
const PDF_MAX_PER_SCAN   = 20;
const PDF_MAX_BYTES      = 5 * 1024 * 1024;
const SCAN_PDFS = process.env.SCAN_PDFS_FLIGHTS === "1";

// Map a sender address/domain to a carrier label. Used for telemetry
// (which airlines deliver PDFs?) — not authoritative. Claude still extracts
// the canonical `carrier` field from content.
const CARRIER_DOMAINS = [
  [/@(?:.*\.)?delta\.com/i, "Delta"],
  [/@t\.delta\.com/i, "Delta"],
  [/@(?:.*\.)?aa\.com/i, "American"],
  [/@(?:.*\.)?united\.com/i, "United"],
  [/@(?:.*\.)?southwest\.com/i, "Southwest"],
  [/@luv\.southwest\.com/i, "Southwest"],
  [/@(?:.*\.)?alaskaair\.com/i, "Alaska"],
  [/@(?:.*\.)?jetblue\.com/i, "JetBlue"],
  [/@(?:.*\.)?spirit\.com/i, "Spirit"],
  [/@(?:.*\.)?flyfrontier\.com/i, "Frontier"],
  [/@(?:.*\.)?allegiantair\.com/i, "Allegiant"],
  [/@(?:.*\.)?hawaiianairlines\.com/i, "Hawaiian"],
  [/@(?:.*\.)?aircanada\.(?:com|ca)/i, "Air Canada"],
  [/@(?:.*\.)?westjet\.com/i, "WestJet"],
  [/@(?:.*\.)?flyporter\.com/i, "Porter"],
  [/@(?:.*\.)?ba\.com/i, "British Airways"],
  [/@(?:.*\.)?lufthansa\.com/i, "Lufthansa"],
  [/@(?:.*\.)?airfrance\.(?:com|fr)/i, "Air France"],
  [/@(?:.*\.)?klm\.com/i, "KLM"],
  [/@(?:.*\.)?iberia\.com/i, "Iberia"],
  [/@(?:.*\.)?swiss\.com/i, "Swiss"],
  [/@(?:.*\.)?austrian\.com/i, "Austrian"],
  [/@(?:.*\.)?brusselsairlines\.com/i, "Brussels Airlines"],
  [/@(?:.*\.)?finnair\.com/i, "Finnair"],
  [/@(?:.*\.)?flysas\.com/i, "SAS"],
  [/@(?:.*\.)?tap\.pt/i, "TAP Portugal"],
  [/@(?:.*\.)?turkishairlines\.com/i, "Turkish"],
  [/@(?:.*\.)?aerlingus\.com/i, "Aer Lingus"],
  [/@(?:.*\.)?lot\.com/i, "LOT"],
  [/@(?:.*\.)?ryanair\.com/i, "Ryanair"],
  [/@(?:.*\.)?easyjet\.com/i, "easyJet"],
  [/@(?:.*\.)?wizzair\.com/i, "Wizz Air"],
  [/@(?:.*\.)?norwegian\.com/i, "Norwegian"],
  [/@(?:.*\.)?vueling\.com/i, "Vueling"],
  [/@(?:.*\.)?transavia\.com/i, "Transavia"],
  [/@(?:.*\.)?jet2\.com/i, "Jet2"],
  [/@(?:.*\.)?volotea\.com/i, "Volotea"],
  [/@(?:.*\.)?emirates\.com/i, "Emirates"],
  [/@emails\.emirates\.com/i, "Emirates"],
  [/@(?:.*\.)?etihad\.com/i, "Etihad"],
  [/@(?:.*\.)?qatarairways\.com/i, "Qatar"],
  [/@(?:.*\.)?flydubai\.com/i, "flydubai"],
  [/@(?:.*\.)?singaporeair\.com/i, "Singapore"],
  [/@(?:.*\.)?cathaypacific\.com/i, "Cathay"],
  [/@(?:.*\.)?jal\.co\.jp/i, "JAL"],
  [/@(?:.*\.)?ana\.co\.jp/i, "ANA"],
  [/@(?:.*\.)?koreanair\.com/i, "Korean"],
  [/@(?:.*\.)?qantas\.com\.au/i, "Qantas"],
  [/@(?:.*\.)?airnewzealand\.co\.nz/i, "Air NZ"],
  [/@(?:.*\.)?airasia\.com/i, "AirAsia"],
  [/@(?:.*\.)?latam\.com/i, "LATAM"],
  [/@(?:.*\.)?avianca\.com/i, "Avianca"],
  [/@(?:.*\.)?copaair\.com/i, "Copa"],
  [/@(?:.*\.)?netjets\.com/i, "NetJets"],
  [/@(?:.*\.)?vistajet\.com/i, "VistaJet"],
  [/@(?:.*\.)?wheelsup\.com/i, "Wheels Up"],
  [/@(?:.*\.)?flyexclusive\.com/i, "flyExclusive"],
  [/@(?:.*\.)?jsx\.com/i, "JSX"],
  [/@(?:.*\.)?expedia\.com/i, "OTA:Expedia"],
  [/@(?:.*\.)?concur\.com/i, "OTA:Concur"],
  [/@(?:.*\.)?booking\.com/i, "OTA:Booking"],
  [/@(?:.*\.)?travelport\.com/i, "OTA:Travelport"],
];
function carrierFromSender(from) {
  if (!from) return null;
  for (const [re, label] of CARRIER_DOMAINS) if (re.test(from)) return label;
  return null;
}

// Marketing / operational-but-not-booking subject blocklist. Airlines send many
// pre/post-flight emails (seat upgrades, check-in reminders, inflight menus,
// rate-your-flight surveys, loyalty-points promos) that keyword-match our
// subject sweeps ("your flight", "flight") but contain zero booking data.
// Dropping them at header time saves a Claude call per thread and stops them
// polluting the scan cap.
const MARKETING_SUBJECT = /(what you can look forward to|look forward to on your flight|time to check[- ]in|check[- ]in (is )?(now )?open|online check[- ]in|ready to check[- ]in|pre[- ]order (your )?meal|meal service|upgrade your seat|seat upgrade|bid for (an )?upgrade|reserve your seat|choose your seat|rate your flight|how was your (flight|trip)|tell us about your (flight|trip)|survey|feedback|enjoy (your|the) flight|get ready for your (flight|trip)|preparing for your (flight|trip)|packing tips|travel tips|baggage (info|tips|reminder)|flight status update|flight delay|flight schedule change|earn (miles|points|status)|elite status|mileage (plus|statement)|frequent flyer|loyalty|skymiles|aadvantage|mileageplus|lounge access|duty[- ]free|inflight (entertainment|menu|shopping)|welcome aboard|thank you for flying|we hope you enjoyed|missed you|we[' ]?d love to have you back|exclusive (offer|deal|fare)|limited[- ]time offer|deal alert|fare sale|save \d+%|% off)/i;

function isMarketingSubject(subject) {
  return MARKETING_SUBJECT.test(String(subject || ""));
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function toGmailDate(d) { return d.replace(/-/g, "/"); }
function nDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return toGmailDate(d.toISOString().slice(0, 10));
}
// ── Thread extraction ─────────────────────────────────────────────────────────
// Detect forwarded-email wrappers and pull the inner sender. Crew often forward
// personal bookings from Davon/Olivia; outer From is the forwarder, inner From
// is the airline. Both matter.
function detectForwardedSender(body) {
  const m = body.match(/[-]{3,}\s*(?:Forwarded message|Begin forwarded message)\s*[-]{0,3}[\s\S]{0,400}?From:\s*([^\n<]*?)(?:\s*<([^>\n]+)>)?(?:[\s\n]|$)/i);
  if (!m) return null;
  const name = (m[1] || "").trim().replace(/["']/g, "");
  const email = (m[2] || "").trim();
  if (!name && !email) return null;
  return { name, email };
}

function extractHeaders(thread) {
  // Use the first message for Subject/From/Date — it's the original booking email.
  // Replies and forwarding wrappers appear as later messages and have wrong metadata.
  const first = thread.messages?.[0];
  const headers = first?.payload?.headers || [];
  const get = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  const rawParts = (thread.messages || []).map(m => extractBody(m.payload)).filter(Boolean);
  const strippedParts = rawParts.map(stripMarketingFooter);
  const rawLen = rawParts.join("").length;
  const strippedLen = strippedParts.join("").length;
  if (rawLen > strippedLen) console.log(`[flights] footer-strip tid=${thread.id}: saved ${rawLen - strippedLen} chars`);
  // Body capture: 8000 chars. Forwarded airline receipts often front-load 1-2KB
  // of Gmail "Fwd:" chrome + From/To/Date headers before the inner airline body
  // starts, so a 3KB cap was dropping leg #2 on round-trip JetBlue/Air Canada.
  // Prefer a slice starting at the forwarded-message marker when present, so the
  // airline content stays in-window instead of getting trimmed.
  const joined = strippedParts.join("\n---\n");
  const fwdMarker = joined.search(/[-]{3,}\s*(?:Forwarded message|Begin forwarded message)/i);
  const body = (fwdMarker > 0 && joined.length > 8000)
    ? joined.slice(Math.max(0, fwdMarker - 200), fwdMarker - 200 + 8000)
    : joined.slice(0, 8000);
  const lastMsg = thread.messages?.[thread.messages.length - 1];
  const lastMsgMs = lastMsg?.internalDate ? Number(lastMsg.internalDate) : null;
  // Raw HTML (pre-strip) from all messages — needed for JSON-LD FlightReservation scanning.
  const htmlRaw = (thread.messages || [])
    .map(m => extractHtmlRaw(m.payload))
    .filter(Boolean)
    .join("\n");
  const forwardedSender = detectForwardedSender(body);
  const from = get("From");

  // PDF attachments (gated). Even when gated off we collect fingerprints so
  // cache invalidation reacts to attachment changes if the flag flips later.
  let attachments = [], attachmentFingerprints = [], droppedAttachments = [], oversizedAttachments = [];
  if (SCAN_PDFS) {
    const all = collectThreadAttachments(thread);
    const { kept, dropped } = dedupFolios(all.filter(a => a.size <= PDF_MAX_BYTES));
    attachments = kept.slice(0, PDF_MAX_PER_THREAD);
    droppedAttachments = dropped;
    oversizedAttachments = all.filter(a => a.size > PDF_MAX_BYTES).map(a => ({ filename: a.filename, size: a.size }));
    attachmentFingerprints = attachmentFingerprint(attachments);
    if (droppedAttachments.length) {
      console.log(`[flights] folio_dedup_dropped tid=${thread.id}: ${droppedAttachments.map(d => d.filename).join(", ")}`);
    }
  }

  return {
    id: thread.id, subject: get("Subject"), from, date: get("Date"),
    lastMsgMs, body, htmlRaw, forwardedSender,
    carrierGuess: carrierFromSender(from),
    attachments, attachmentFingerprints, droppedAttachments, oversizedAttachments,
  };
}

// Map a schema.org FlightReservation node to our flight shape. Returns null if
// the node lacks the minimum viable fields (flight#, dep airport, arr airport).
function jsonLdToFlight(node, tid) {
  const res = node.reservationFor;
  if (!res) return null;
  // Multi-leg itineraries arrive as an array of Flight objects under reservationFor
  const flights = Array.isArray(res) ? res : [res];
  return flights.map(flight => {
    if (!flight || typeof flight !== "object") return null;
    const airline = flight.airline || {};
    const dep = flight.departureAirport || {};
    const arr = flight.arrivalAirport || {};
    const iataCode = airline.iataCode || airline.iatacode || "";
    const flightNum = flight.flightNumber || flight.flightnumber || "";
    const depIata = dep.iataCode || dep.iatacode || "";
    const arrIata = arr.iataCode || arr.iatacode || "";
    const depTime = flight.departureTime || "";
    const arrTime = flight.arrivalTime || "";
    if (!flightNum || !depIata || !arrIata) return null;
    // underName may be Person or Person[]; collect names
    const under = node.underName;
    const pax = under ? (Array.isArray(under) ? under : [under]).map(p => p?.name).filter(Boolean) : [];
    const rawStatus = String(node.reservationStatus || "").toLowerCase();
    let status = "confirmed";
    if (rawStatus.includes("cancelled") || rawStatus.includes("canceled")) status = "cancelled";
    else if (rawStatus.includes("pending")) status = "pending";
    else if (rawStatus.includes("hold")) status = "hold";
    return {
      flightNo: iataCode ? `${iataCode}${flightNum}`.replace(/\s+/g, "") : String(flightNum),
      carrier: airline.name || null,
      from: String(depIata).toUpperCase(),
      fromCity: dep.name || dep.address?.addressLocality || null,
      to: String(arrIata).toUpperCase(),
      toCity: arr.name || arr.address?.addressLocality || null,
      depDate: depTime ? String(depTime).slice(0, 10) : null,
      dep: depTime ? String(depTime).slice(11, 16) : null,
      arrDate: arrTime ? String(arrTime).slice(0, 10) : null,
      arr: arrTime ? String(arrTime).slice(11, 16) : null,
      pax,
      pnr: node.reservationNumber || null,
      confirmNo: node.reservationId && node.reservationId !== node.reservationNumber ? node.reservationId : null,
      ticketNo: node.ticketNumber || node.ticket?.ticketNumber || null,
      cost: node.totalPrice?.price ? Number(node.totalPrice.price) : (typeof node.totalPrice === "number" ? node.totalPrice : null),
      currency: node.totalPrice?.priceCurrency || null,
      tid,
      source: "jsonld",
      bookingStatus: status,
    };
  }).filter(Boolean);
}

// Heuristic: how many legs does the email likely describe?
// Round-trip JetBlue/Delta/etc. confirmations often pack 2+ legs in one email.
// If JSON-LD only surfaces 1 but body signals 2, fall through to Claude for completion.
function expectedLegCount(body) {
  if (!body) return 0;
  const s = body.toLowerCase();
  // Distinct airline flight numbers (e.g. "B6 123", "DL 154", "LH 440")
  const flightNums = new Set((body.match(/\b[A-Z]{1,3}\s?\d{2,4}\b/g) || []).filter(x => /[A-Z]/.test(x) && /\d/.test(x)));
  // Route arrows: "BOS → DUB", "BOS-JFK", "BOS to LAX"
  const arrows = (body.match(/\b[A-Z]{3}\s*(?:→|->|–|—|to|-)\s*[A-Z]{3}\b/gi) || []).length;
  // Round-trip / connection labels
  const roundTrip = /\b(outbound|return(?:ing)?|inbound|departing|connecting\s+flight|connection)\b/g;
  const roundTripHits = (s.match(roundTrip) || []).length;
  let n = Math.max(flightNums.size, arrows);
  if (roundTripHits >= 2 && n < 2) n = 2;
  return n;
}

// Two-pass dedup:
// Pass 1 — PNR + flightNo: same reservation + same leg from two sources → merge.
//   Same PNR + different flightNo = sibling legs → keep both.
// Pass 2 — quad-key (flightNo + depDate + from + to): same physical flight booked
//   separately (different PNRs or no PNR) → merge.
function dedupFlights(flights) {
  const byPnrLeg = new Map(); // "PNR|flightNo" → entry
  const byQuad   = new Map(); // "flightNo|depDate|from|to" → entry

  function prefer(a, b) {
    if (a.source === "jsonld") return { winner: a, loser: b };
    if (b.source === "jsonld") return { winner: b, loser: a };
    return { winner: a, loser: b };
  }

  function mergePair(winner, loser) {
    const paxMap = new Map();
    [...(winner.pax || []), ...(loser.pax || [])].forEach(p => {
      const k = String(p).toLowerCase();
      if (!paxMap.has(k)) paxMap.set(k, p);
    });
    winner.pax = [...paxMap.values()];
    if (!winner.pnr && loser.pnr) winner.pnr = loser.pnr;
    if (!winner.confirmNo && loser.confirmNo) winner.confirmNo = loser.confirmNo;
    if (!winner.ticketNo && loser.ticketNo) winner.ticketNo = loser.ticketNo;
    if (winner.cost == null && loser.cost != null) { winner.cost = loser.cost; winner.currency = loser.currency; }
    if (!winner.dep && loser.dep) winner.dep = loser.dep;
    if (!winner.arr && loser.arr) winner.arr = loser.arr;
    if (!winner.fromCity && loser.fromCity) winner.fromCity = loser.fromCity;
    if (!winner.toCity && loser.toCity) winner.toCity = loser.toCity;
  }

  const kept = [];
  for (const f of flights) {
    const pnrKey  = f.pnr && f.flightNo ? `${String(f.pnr).toUpperCase()}|${f.flightNo}` : null;
    const quadKey = f.flightNo && f.depDate && f.from && f.to
      ? `${f.flightNo}|${f.depDate}|${f.from}|${f.to}` : null;

    const pnrMatch  = pnrKey  ? byPnrLeg.get(pnrKey)  : null;
    const quadMatch = !pnrMatch && quadKey ? byQuad.get(quadKey) : null;

    if (pnrMatch || quadMatch) {
      const existing = pnrMatch || quadMatch;
      const { winner, loser } = prefer(existing, f);
      mergePair(winner, loser);
      if (pnrKey)  byPnrLeg.set(pnrKey, winner);
      if (quadKey) byQuad.set(quadKey, winner);
      continue;
    }

    const entry = { ...f };
    if (pnrKey)  byPnrLeg.set(pnrKey, entry);
    if (quadKey) byQuad.set(quadKey, entry);
    kept.push(entry);
  }
  return kept;
}

// Validation: a flight is keepable only if it has a PNR OR the (flightNo + depDate +
// from + to) core quartet. Drops Claude hallucinations that return partial shells.
function isValidFlight(f) {
  if (!f) return false;
  const hasPnr = f.pnr && String(f.pnr).trim().length >= 5;
  const hasCore = f.flightNo && f.depDate && f.from && f.to;
  return Boolean(hasPnr || hasCore);
}

// ── Query list ────────────────────────────────────────────────────────────────
// High priority: subject sweeps + destination queries. Run first; fill the cap
// before the low sweep. Catches forwarded receipts regardless of sender domain.
// Low priority: single broad carrier/OTA sweep (maxResults=500) replacing the
// previous 65+ from: domain queries. Fewer Gmail API calls, same effective recall
// since category:travel and subject sweeps already cover major carriers directly.
function buildFlightQueryGroups(after) {
  const W = `after:${after}`;
  const high = [
    // Gmail's ML-classified travel bucket — catches senders we've never received from
    `category:travel ${W}`,
    // Subject sweeps — catch forwarded receipts regardless of sender
    `subject:("Your Flight Receipt") ${W}`,
    `subject:("flight receipt") ${W}`,
    `subject:("flight confirmation") ${W}`,
    `subject:("your flight") ${W}`,
    `subject:("e-ticket") (flight OR airline OR airways) ${W}`,
    `subject:("boarding pass") ${W}`,
    `subject:("itinerary") (flight OR airline OR departure) ${W}`,
    `subject:("booking confirmation") (flight OR airline OR airways) ${W}`,
    `subject:("trip confirmation") (flight OR airline) ${W}`,
    `"booking reference" (flight OR departure OR arrival) ${W}`,
    `"confirmation code" (flight OR airline OR departure) ${W}`,
    // Destination-specific — tour show airports, high recall
    `(BOS OR PVD OR MHT OR BDL OR ORH OR "Boston" OR "Nashville" OR "BNA") (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(DEN OR "Denver" OR "Morrison") (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(YYZ OR YTZ OR YHM OR "Toronto" OR "Mississauga") (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(YOW OR "Ottawa") (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(BDL OR PVD OR HPN OR "Uncasville" OR "Hartford" OR "Providence") (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(LHR OR LGW OR LTN OR STN OR LCY OR Heathrow OR Gatwick OR Stansted OR Luton) (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(DUB OR Dublin OR MAN OR Manchester OR GLA OR Glasgow) (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(ZRH OR Zurich OR CGN OR Cologne OR AMS OR Amsterdam) (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(CDG OR ORY OR Paris OR MXP OR LIN OR Milan) (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(PRG OR Prague OR BER OR Berlin OR BTS OR Bratislava OR WAW OR Warsaw) (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
  ];
  const low = [
    // Carrier name sweep — full airline brand names. Body-text match catches
    // OTA and forwarded confirmations regardless of sender domain.
    `(Delta OR United OR "American Airlines" OR Southwest OR JetBlue OR "Alaska Airlines" OR "Air Canada" OR "British Airways" OR Lufthansa OR "Air France" OR "Aer Lingus" OR Ryanair OR easyJet OR KLM OR "Turkish Airlines" OR Emirates OR Etihad OR "Qatar Airways" OR "Singapore Airlines" OR "Cathay Pacific" OR Iberia OR Qantas OR LATAM OR ANA OR "Korean Air" OR "Japan Airlines") (confirmation OR receipt OR itinerary OR "e-ticket" OR "booking reference" OR confirmed OR booked) ${W}`,
    // IATA code patterns — catches confirmation emails by flight code regardless
    // of carrier branding. Common in GDS/OTA/forwarded itinerary emails.
    `("Flight DL" OR "Flight UA" OR "Flight AA" OR "Flight WN" OR "Flight B6" OR "Flight AS" OR "Flight AC" OR "Flight BA" OR "Flight LH" OR "Flight AF" OR "Flight KL" OR "Flight FR" OR "Flight U2" OR "Flight EK" OR "Flight EY" OR "Flight QR" OR "Flight TK" OR "Flight SQ" OR "Flight CX" OR "Flight IB" OR "Flight QF" OR "Flight LA" OR "Flight NH" OR "Flight KE" OR "Flight JL") ${W}`,
    // OTA flight bookings
    `(Expedia OR "Booking.com" OR Concur OR Travelport OR Hopper OR "Trip.com") (flight OR itinerary OR airline) ${W}`,
    // Ground/rail — aligned with "other travel" clause in comprehensive search string
    `(Uber OR Lyft OR Hertz OR Enterprise OR Avis OR Eurostar OR Trainline OR FlixBus OR Omio) (confirmation OR receipt OR booking OR reservation OR itinerary) ${W}`,
    // Private charters
    `("private jet" OR "charter flight") (confirmation OR itinerary OR booking) ${W}`,
  ];
  return { high, low };
}

// ── Airport → show-city map ───────────────────────────────────────────────────
const AIRPORT_CITIES = {
  BOS: ["boston", "worcester", "uncasville"], PVD: ["worcester", "boston", "uncasville"],
  MHT: ["boston"], BDL: ["worcester", "uncasville"], ORH: ["worcester"], HPN: ["uncasville", "new york"],
  DEN: ["denver", "morrison"], DUB: ["dublin"], MAN: ["manchester"], GLA: ["glasgow"], EDI: ["glasgow"],
  LHR: ["london"], LGW: ["london"], STN: ["london"], LCY: ["london"], LTN: ["london"], SEN: ["london"],
  ZRH: ["zurich"], BSL: ["zurich"], CGN: ["cologne"], DUS: ["cologne"], FRA: ["cologne"],
  AMS: ["amsterdam"], RTM: ["amsterdam"], CDG: ["paris", "chambord"], ORY: ["paris", "chambord"],
  BVA: ["paris"], TUF: ["chambord"], LYS: ["villeurbanne", "lyon"],
  MXP: ["milan"], LIN: ["milan"], BGY: ["milan"], PRG: ["prague"], BER: ["berlin"],
  BTS: ["bratislava", "vienna"], VIE: ["vienna", "bratislava"], WAW: ["warsaw"], WMI: ["warsaw"],
  YYZ: ["toronto", "mississauga"], YTZ: ["toronto", "mississauga"], YHM: ["toronto", "mississauga"],
  YOW: ["ottawa"], YUL: ["montreal"],
  JFK: ["new york"], LGA: ["new york"], EWR: ["new york"],
  LAX: ["los angeles"], BUR: ["los angeles"], LGB: ["los angeles"], SNA: ["los angeles"],
};

function cityKey(s) { return String(s || "").toLowerCase().split(",")[0].trim(); }

function buildCitySet(iata, cityStr) {
  return new Set([
    ...(AIRPORT_CITIES[(iata || "").toUpperCase()] || []),
    cityKey(cityStr),
  ].filter(Boolean));
}

// ── Show matching ─────────────────────────────────────────────────────────────
// Inbound window: arrives 0-3 days before the show.
// 3d covers crew joining early for soundcheck day or bus-join setup on EU tour.
// Outbound window: departs 0-2 days after the show (same-day or next-morning fly-out).
// When no airport code is mapped, falls back to date proximity alone.
function matchFlightToShow(flight, shows) {
  if (!Array.isArray(shows) || !shows.length || !flight.depDate) return null;
  const depDate = flight.depDate;
  const arrDate = flight.arrDate || flight.depDate;
  const arrCities = buildCitySet(flight.to, flight.toCity);
  const depCities = buildCitySet(flight.from, flight.fromCity);
  let inbound = null, outbound = null;

  for (const s of shows) {
    const sd = s.date;
    if (!sd || s.type === "off" || s.type === "travel") continue;
    const sc = cityKey(s.city);
    const arrDelta = (new Date(sd + "T12:00:00") - new Date(arrDate + "T12:00:00")) / 86400000;
    const depDelta = (new Date(depDate + "T12:00:00") - new Date(sd + "T12:00:00")) / 86400000;

    if (arrDelta >= 0 && arrDelta <= 3 && (arrCities.size === 0 || arrCities.has(sc))) {
      if (!inbound || arrDelta < inbound.delta)
        inbound = { showDate: sd, role: "inbound", showId: s.id || sd, venue: s.venue, delta: arrDelta };
    }
    if (depDelta >= 0 && depDelta <= 2 && (depCities.size === 0 || depCities.has(sc))) {
      if (!outbound || depDelta < outbound.delta)
        outbound = { showDate: sd, role: "outbound", showId: s.id || sd, venue: s.venue, delta: depDelta };
    }
  }

  const result = inbound || outbound;
  if (!result) return null;
  const { delta: _d, ...clean } = result;
  return clean;
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing auth token" });

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Invalid token" });

  const {
    googleToken,
    tourStart = "2026-04-01",
    tourEnd = "2026-06-30",
    sweepFrom = null,
    shows = [],
  } = req.body || {};
  if (!googleToken) return res.status(400).json({ error: "Missing googleToken" });

  const after = sweepFrom ? toGmailDate(sweepFrom) : nDaysAgo(90);
  const initialParams = { sweepFrom, tourStart, tourEnd, after, showsCount: shows.length };
  const { runId, startedAt } = await startScanRun({
    scanner: "flights", userId: user.id, params: initialParams,
  });
  const stopReasons = {};
  const runErrors = [];
  let inputTokensTotal = 0, outputTokensTotal = 0;
  const { high, low } = buildFlightQueryGroups(after);
  const seen = new Set();
  const CAP = 60;
  const queryErrors = [];

  const runParallel = async (queries, maxResults = 25) => {
    const results = await Promise.allSettled(queries.map(q => gmailSearch(googleToken, q, maxResults)));
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") { r.value.forEach(id => seen.add(id)); continue; }
      const msg = r.reason?.message || String(r.reason);
      if (msg.includes("401")) throw Object.assign(new Error("gmail_401"), { status: 402 });
      console.warn(`[flights] query failed: ${queries[i].slice(0, 80)} — ${msg}`);
      queryErrors.push({ query: queries[i].slice(0, 120), error: msg.slice(0, 200) });
    }
  };

  try {
    await runParallel(high);
    // Low sweep: 3 broad queries at maxResults=500, replacing the previous 65+
    // from: domain queries. Skip entirely if high already saturated the cap.
    if (seen.size < CAP * 0.8) await runParallel(low, 500);
  } catch (e) {
    if (e.status === 402) return res.status(402).json({ error: "gmail_token_expired" });
    return res.status(500).json({ error: e.message });
  }

  const ids = [...seen].slice(0, CAP);
  if (!ids.length) {
    await finishScanRun(runId, { threadsFound: 0, startedAt, errors: runErrors });
    return res.json({ flights: [], threadsFound: 0, scanRunId: runId, threadsCached: 0, threadsParsed: 0 });
  }

  let threads, freshIds;
  let marketingSkipped = 0;
  try {
    const allThreads = (await fetchBatched(googleToken, ids, 20)).map(extractHeaders);
    threads = allThreads.filter(t => {
      if (isMarketingSubject(t.subject)) {
        marketingSkipped++;
        console.log(`[flights] marketing-skip tid=${t.id}: "${(t.subject || "").slice(0, 80)}"`);
        return false;
      }
      return true;
    });
    const cutoff48h = Date.now() - 48 * 3600 * 1000;
    freshIds = new Set(
      threads
        .filter(t => {
          const ms = t.lastMsgMs ?? new Date(t.date).getTime();
          return !isNaN(ms) && ms >= cutoff48h;
        })
        .map(t => t.id)
    );
  } catch (e) {
    console.error("[flights] thread fetch error:", e.message);
    await finishScanRun(runId, { threadsFound: 0, startedAt, errors: [...runErrors, { kind: "thread_fetch", message: e.message }] });
    return res.status(500).json({ error: `Thread fetch failed: ${e.message}` });
  }

  // ── Cache check: split threads into hit (use cached flights) vs fresh (parse). ──
  // Parallel fetch: all getCachedThread calls run simultaneously instead of sequentially
  // to avoid ~50ms × N threads of serial Supabase latency.
  const cachedFlights = [];
  const freshThreads = [];
  const cacheRows = await Promise.all(threads.map(t => getCachedThread("flights", t.id)));
  for (let i = 0; i < threads.length; i++) {
    const t = threads[i];
    const cached = cacheRows[i];
    const bodyHash = hashBody(t.subject, t.from, t.body);
    t.bodyHash = bodyHash;
    t.prevResult = cached?.result || null;
    // Cache healing: if we expect ≥2 legs but cached only has fewer, treat as stale
    // so the thread is re-parsed. Fixes round-trips cached with a single leg.
    const expectedLegs = expectedLegCount(t.body);
    const cachedLegCount = Array.isArray(cached?.result) ? cached.result.length : 0;
    const underParsed = expectedLegs >= 2 && cachedLegCount < expectedLegs;
    if (!underParsed && shouldUseCached(cached, t.lastMsgMs, bodyHash, t.attachmentFingerprints)) {
      if (Array.isArray(cached.result)) cachedFlights.push(...cached.result);
    } else {
      freshThreads.push(t);
    }
    for (const d of t.droppedAttachments || []) runErrors.push({ kind: "folio_dedup_dropped", tid: t.id, filename: d.filename, reason: d.reason });
    for (const o of t.oversizedAttachments || []) runErrors.push({ kind: "pdf_oversized", tid: t.id, filename: o.filename, size: o.size });
  }
  console.log(`[flights] cache: hit=${threads.length - freshThreads.length} fresh=${freshThreads.length} runId=${runId}`);

  // ── JSON-LD fast path ───────────────────────────────────────────────────────
  // Major carriers (UA, AA, DL, LH, BA, AF, KLM, Iberia) emit schema.org
  // FlightReservation JSON-LD in their HTML bodies. Parse these directly and
  // skip Claude for matched threads — zero tokens spent, deterministic output.
  const jsonLdFlights = [];
  const jsonLdTids = new Set();   // JSON-LD covered the thread fully; skip Claude
  let jsonLdPartialTids = 0;
  for (const t of freshThreads) {
    if (!t.htmlRaw) continue;
    const reservations = extractJsonLdReservations(t.htmlRaw);
    if (!reservations.length) continue;
    const mapped = reservations.flatMap(r => jsonLdToFlight(r, t.id));
    if (!mapped.length) continue;
    jsonLdFlights.push(...mapped);
    const expected = expectedLegCount(t.body);
    if (mapped.length >= expected) {
      jsonLdTids.add(t.id);
    } else {
      jsonLdPartialTids++;
      console.log(`[flights] jsonld partial: tid=${t.id} got=${mapped.length} expected=${expected} — falling through to Claude`);
    }
  }
  const claudeThreads = freshThreads.filter(t => !jsonLdTids.has(t.id));
  console.log(`[flights] jsonld-shortcircuit: ${jsonLdTids.size} threads / ${jsonLdFlights.length} flights | partial: ${jsonLdPartialTids} | claude: ${claudeThreads.length} threads`);

  // Known crew for this tour — used to disambiguate pax names extracted in airline format.
  // Airlines print "JOHNSON/DAVON" or "NUDELMAN/DANIEL". Knowing the roster prevents
  // Claude from guessing wrong capitalization or splitting compound surnames.
  const CREW_ROSTER = [
    "Davon Johnson (TM/TD)", "Mike Sheck (PM)", "Dan Nudelman (PM)",
    "Alex Gumuchian (artist, bbno$)", "Julien Bruce (Jungle Bobby)",
    "Mat Senechal (bass/keys)", "Taylor Madrigal (DJ Tip)", "Andrew Campbell (Bishu DJ)",
    "Ruairi Matthews (FOH)", "Nick Foerster (monitors)", "Saad A. (audio/BNE)",
    "Gabe Greenwood (LD)", "Cody Leggett (lasers)", "Michael Heid (visual/set)",
    "Grace Offerdahl (merch)", "Nathan McCoy (merch dir)", "Megan Putnam (hospo/GL)",
    "O'Len Davis (content)", "Guillaume Bessette (bus driver)",
    "Olivia Mims (transport coordinator)",
  ];

  const sysPrompt = `You are a flight itinerary parser for concert touring operations. Extract structured flight segment data from email bodies.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.

MULTI-LEG IS THE DEFAULT, NOT THE EXCEPTION:
- Most booking confirmations contain 2+ legs: round-trips (outbound + return), connections (e.g. BOS→JFK→LHR = 2 legs), or multi-city. You MUST enumerate EVERY leg as a separate object in flights[].
- A round-trip email with "Departing" + "Returning" sections = 2 separate flight objects, one per direction.
- A connecting itinerary (e.g. "BOS → DUB via JFK") = 2 separate flight objects, one per segment.
- Never merge legs. Never skip legs. If the email lists 3 flight numbers, flights[] has 3 entries.
- Scan for ALL of: "Outbound", "Return", "Returning", "Departing", "Inbound", "Connection", "Layover", separate date blocks, or multiple flight number rows.

Rules:
- Each object in flights[] is one flight leg. Split multi-leg itineraries into separate objects.
- Dates: YYYY-MM-DD. Times: HH:MM 24-hour (e.g. "6:30 AM" → "06:30", "10:15 PM" → "22:15").
- IATA airport codes: 3 uppercase letters. If the email shows a city name instead of IATA, use the correct IATA code for that airport. Common: Dublin=DUB, Manchester=MAN, London Heathrow=LHR, London Gatwick=LGW, Paris CDG=CDG, Paris Orly=ORY, Amsterdam=AMS, Zurich=ZRH, Prague=PRG, Berlin=BER, Warsaw=WAW, Brussels=BRU, Milan Malpensa=MXP.
- cost: number only, no currency symbol. null if not present.
- currency: 3-letter ISO code (USD, GBP, EUR, CAD). null if not present.

Passenger extraction (critical):
- Scan the ENTIRE body for any section labeled: "Passengers", "Travelers", "Traveler", "Passenger", "Guest", "Name", or any passenger table.
- Airlines often print names in ALL-CAPS airline format: "JOHNSON/DAVON MR" → "Davon Johnson", "NUDELMAN/DANIEL" → "Daniel Nudelman", "DAVIS/OLEN Q" → "O'Len Davis". Convert to Title Case.
- Known tour crew to assist recognition: ${CREW_ROSTER.join(", ")}.
- Also check "Booked by", "Purchased by", "Primary contact" lines as fallback if no pax section found.
- For forwarded emails: content appears after "---------- Forwarded message ---------". Parse the forwarded body too — that's where the actual booking data lives.
- If a booking references multiple passengers across separate ticket rows, list all of them in pax[].
- pax: array of all passenger full names. Empty array ONLY if truly no names found anywhere.

Confirmation codes (critical — extract all three as distinct fields, each to its own key; return null if absent):

- pnr        : exactly 6 alphanumeric characters, the airline record locator.
               Labels: "Record Locator", "PNR", "Airline Booking Reference",
               "Reservation Code". Example: "F9OCAU".

- confirmNo  : the booking/order number from the channel that sold the ticket
               (airline website, Expedia, Concur, corporate tool). Usually
               6-12 chars, may be numeric or alphanumeric, distinct from pnr.
               Labels: "Confirmation Number", "Booking Reference", "Order #",
               "Itinerary Number". Example: "KL7X9M" or "1234567890".

- ticketNo   : the airline e-ticket number. 13 digits, commonly shown as
               "001-1234567890123" where 001 is the airline ticketing prefix
               (001=AA, 005=CO/UA, 006=DL, 016=UA, 020=LH, 014=AC, 027=AS,
                079=B6, 081=QF, 220=LH, 235=TK, 057=AF). Include the dash.
               Labels: "E-Ticket Number", "Ticket Number", "Ticket #".
               Do NOT put the PNR here. Do NOT put the booking ref here.
               If multiple ticket numbers exist (one per pax), take the first.

Never duplicate the same code across fields. If only one alphanumeric code is
present and it is exactly 6 chars, it is the pnr and confirmNo/ticketNo stay null.

Attached PDFs: when a PDF e-ticket, itinerary, or receipt is attached, trust
the PDF over the body text for cost, dates, flight numbers, and the three
confirmation-code fields above. E-ticket numbers almost always come from the PDF.

Skip hotel, train, rental car confirmations — flights and private charters only.`;

  // Partition fresh Claude-bound threads: withPdf go one-at-a-time with
  // document blocks; textOnly splits further into simple vs. multi-leg.
  const withPdfThreads = SCAN_PDFS ? claudeThreads.filter(t => t.attachments?.length) : [];
  const textOnlyThreads = claudeThreads.filter(t => !withPdfThreads.includes(t));

  // Pre-screen by expectedLegCount. Threads where >= 2 legs are detected upfront
  // skip the batch and go straight to isolated single-thread parsing with an
  // explicit leg-count hint — eliminating the extra Claude call the retry would
  // have cost. Retry stays as a safety net for cases this heuristic misses.
  const multiLegTextThreads = textOnlyThreads.filter(t => expectedLegCount(t.body) >= 2);
  const simpleTextThreads   = textOnlyThreads.filter(t => expectedLegCount(t.body) < 2);

  const BATCH = 6;
  const threadBatches = [];
  for (let i = 0; i < simpleTextThreads.length; i += BATCH) threadBatches.push(simpleTextThreads.slice(i, i + BATCH));

  const buildMultiLegPrompt = (t) => {
    const expected = expectedLegCount(t.body);
    return `Extract all flight segments from this single email thread. Tour date range: ${tourStart} to ${tourEnd}.

IMPORTANT: This email likely describes ${expected}+ flight legs (round-trip, connection, or multi-city). Enumerate EVERY leg without exception. Look for BOTH "Outbound/Departing" AND "Return/Returning/Inbound" sections, multiple date blocks, and multiple flight-number rows. Each leg = one object in flights[].

[0] tid:${t.id}
Subject: ${t.subject}
From: ${t.from}${t.forwardedSender ? `\nOriginal sender (from forwarded header): ${t.forwardedSender.name}${t.forwardedSender.email ? ` <${t.forwardedSender.email}>` : ""}` : ""}
Date: ${t.date}
Body: ${t.body}

Return this exact JSON:
{
  "flights": [
    {
      "flightNo": "B6123",
      "carrier": "JetBlue",
      "from": "BOS", "fromCity": "Boston",
      "to": "DUB", "toCity": "Dublin",
      "depDate": "2026-05-02", "dep": "21:55",
      "arrDate": "2026-05-03", "arr": "09:30",
      "pax": ["Grace Offerdahl"],
      "pnr": "CODGXZ", "confirmNo": null, "ticketNo": null,
      "cost": null, "currency": "USD",
      "tid": "${t.id}"
    }
  ]
}`;
  };

  const buildPrompt = (batch, offset) =>
    `Extract all flight segments from these email threads. Tour date range: ${tourStart} to ${tourEnd}.

${batch.map((t, i) => `[${i + offset}] tid:${t.id}
Subject: ${t.subject}
From: ${t.from}${t.forwardedSender ? `\nOriginal sender (from forwarded header): ${t.forwardedSender.name}${t.forwardedSender.email ? ` <${t.forwardedSender.email}>` : ""}` : ""}
Date: ${t.date}
Body: ${t.body}`).join("\n\n---\n\n")}

Return this exact JSON:
{
  "flights": [
    {
      "flightNo": "DL154",
      "carrier": "Delta",
      "from": "BOS",
      "fromCity": "Boston",
      "to": "DUB",
      "toCity": "Dublin",
      "depDate": "2026-05-02",
      "dep": "21:55",
      "arrDate": "2026-05-03",
      "arr": "09:30",
      "pax": ["Davon Johnson", "Daniel Nudelman"],
      "pnr": "F9OCAU",
      "confirmNo": "KL7X9M",
      "ticketNo": "006-1234567890",
      "cost": 648.50,
      "currency": "USD",
      "tid": "<thread_id_from_above>"
    }
  ]
}`;

  const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const callClaude = async (prompt, sys = sysPrompt, maxTokens = 4096, model = DEFAULT_MODEL) => {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
      const resp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: ANTHROPIC_HEADERS,
        body: JSON.stringify({ model, max_tokens: maxTokens, system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: prompt }] }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
        inputTokensTotal  += data.usage?.input_tokens  || 0;
        outputTokensTotal += data.usage?.output_tokens || 0;
        bumpStopReason(stopReasons, data.stop_reason);
        console.log("[flights] stop_reason:", data.stop_reason, "| model:", data.model, "| attempt:", attempt + 1);
        return extractJson(text);
      }
      const detail = await resp.text();
      lastErr = Object.assign(new Error(`Anthropic ${resp.status}`), { detail, status: resp.status });
      if (!RETRYABLE.has(resp.status)) {
        console.error(`[flights] anthropic ${resp.status} non-retryable:`, detail);
        throw lastErr;
      }
      console.warn(`[flights] anthropic ${resp.status} attempt ${attempt + 1}, retrying`);
    }
    throw lastErr;
  };

  const verifySys = `You are a flight data verifier for concert touring operations. You check extracted flight records against source emails for accuracy.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.

Focus especially on:
1. IATA codes — verify the 3-letter code matches the actual airport in the email, not just the city. London has LHR/LGW/STN/LCY; Paris has CDG/ORY; confirm which one the email specifies.
2. Passenger names — confirm names from the email body (not just the subject). Names may appear in ALL-CAPS airline format e.g. "JOHNSON/DAVON" = "Davon Johnson".
3. Three distinct code fields — verify each independently:
   - pnr: exactly 6 alphanumeric chars (e.g. "F9OCAU"). Record locator only.
   - confirmNo: booking/order number from the sales channel (6-12 chars, often numeric).
   - ticketNo: 13-digit airline e-ticket (format "001-1234567890"). Present only on e-ticket issuance emails or PDF receipts. Never put a PNR here.
   Never duplicate the same value across two fields.
4. Date/time — ensure depDate and arrDate match the email, especially for overnight flights where arrival date differs from departure date.
5. Multi-leg — if the email describes a connecting itinerary, each leg should be a separate record.`;

  const buildVerifyPrompt = (batch, flights) =>
    `Verify these extracted flight records against their source email threads (matched by tid).

SOURCE THREADS:
${batch.map(t => `tid:${t.id}\nSubject: ${t.subject}${t.forwardedSender ? `\nOriginal sender: ${t.forwardedSender.name}${t.forwardedSender.email ? ` <${t.forwardedSender.email}>` : ""}` : ""}\nBody: ${t.body}`).join("\n\n---\n\n")}

EXTRACTED FLIGHTS:
${JSON.stringify(flights, null, 2)}

For each flight, re-read its source thread and check every field: flightNo, from, fromCity, to, toCity, depDate, dep, arrDate, arr, pax, pnr, confirmNo, ticketNo, cost, currency.
If a field is wrong or missing, provide the corrected value. If correct or unknown, omit from corrections.
Set ok=false if ANY field needs correction. Set ok=true only if the record is fully accurate.

Return this exact JSON:
{
  "results": [
    {
      "tid": "<thread_id>",
      "flightNo": "<flight number for reference>",
      "ok": true,
      "corrections": {},
      "note": null
    },
    {
      "tid": "<thread_id>",
      "flightNo": "<flight number for reference>",
      "ok": false,
      "corrections": { "from": "BNA", "fromCity": "Nashville", "to": "BOS", "toCity": "Boston", "pax": ["Davon Johnson"] },
      "note": "Email shows BNA→BOS not ORD→MIA; passenger is Davon Johnson not Dan Nudelman"
    }
  ]
}`;

  // Parse a batch then immediately verify it — corrections applied before returning
  const parseAndVerifyBatch = async (batch, offset) => {
    const parsed = await callClaude(buildPrompt(batch, offset));
    const flights = Array.isArray(parsed?.flights) ? parsed.flights : [];
    if (!flights.length) return flights;

    let verifyResult;
    try {
      verifyResult = await callClaude(buildVerifyPrompt(batch, flights), verifySys, 2048, "claude-haiku-4-5-20251001");
    } catch (e) {
      console.warn("[flights] verify error:", e.message);
      return flights.map(f => ({ ...f, parseVerified: null }));
    }

    const byTid = {};
    (verifyResult?.results || []).forEach(r => { byTid[r.tid] = r; });

    return flights.map(f => {
      const v = byTid[f.tid];
      if (!v) return { ...f, parseVerified: null };
      const corrected = { ...f, ...v.corrections };
      return { ...corrected, parseVerified: v.ok, parseNote: v.note || null };
    });
  };

  // Single-thread parse+verify for pre-screened multi-leg confirmations.
  // Reuses verifySys and buildVerifyPrompt; source tagged "claude_multileg".
  const parseAndVerifyMultiLeg = async (t) => {
    const parsed = await callClaude(buildMultiLegPrompt(t));
    const flights = Array.isArray(parsed?.flights) ? parsed.flights : [];
    if (!flights.length) return [];
    let verifyResult;
    try {
      verifyResult = await callClaude(buildVerifyPrompt([t], flights), verifySys, 2048, "claude-haiku-4-5-20251001");
    } catch (e) {
      console.warn("[flights] multi-leg verify error:", e.message);
      return flights.map(f => ({ ...f, parseVerified: null }));
    }
    const byTid = {};
    (verifyResult?.results || []).forEach(r => { byTid[r.tid] = r; });
    return flights.map(f => {
      const v = byTid[f.tid];
      if (!v) return { ...f, parseVerified: null };
      return { ...f, ...v.corrections, parseVerified: v.ok, parseNote: v.note || null };
    });
  };

  let claudeFlights = [];
  if (threadBatches.length) {
    try {
      const results = await Promise.all(
        threadBatches.map((batch, i) => parseAndVerifyBatch(batch, i * BATCH))
      );
      claudeFlights = results.flat().map(f => ({ ...f, source: f.source || "claude" }));
    } catch (e) {
      console.error("[flights] anthropic error:", e.message, e.detail);
      let anthropic = null;
      try { anthropic = JSON.parse(e.detail || "")?.error || null; } catch {}
      const summary = anthropic?.message ? `${anthropic.type || "error"}: ${anthropic.message}` : e.message;
      return res.status(502).json({ error: `Anthropic request failed: ${summary}`, anthropic, detail: e.detail });
    }
  }

  if (multiLegTextThreads.length) {
    console.log(`[flights] multi-leg isolated parse: ${multiLegTextThreads.length} threads`);
    const results = await Promise.allSettled(multiLegTextThreads.map(parseAndVerifyMultiLeg));
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "fulfilled") {
        claudeFlights.push(...results[i].value.map(f => ({ ...f, source: "claude_multileg" })));
      } else {
        runErrors.push({ kind: "anthropic_error", phase: "multi_leg_parse", tid: multiLegTextThreads[i].id, detail: String(results[i].reason?.message || "").slice(0, 300) });
      }
    }
  }

  // ── Missed-leg retry ─────────────────────────────────────────────────────
  // Safety net for simpleTextThreads where expectedLegCount returned < 2 but
  // Claude actually found a multi-leg email. multiLegTextThreads already got
  // isolated parsing above and should not need this.
  const byTidCount = {};
  for (const f of claudeFlights) byTidCount[f.tid] = (byTidCount[f.tid] || 0) + 1;
  const missedThreads = simpleTextThreads.filter(t => {
    const got = byTidCount[t.id] || 0;
    const expected = expectedLegCount(t.body);
    return expected >= 2 && got < expected;
  });
  if (missedThreads.length) {
    console.log(`[flights] missed-leg retry: ${missedThreads.length} threads`);
    const retryResults = await Promise.allSettled(missedThreads.map(t => {
      const expected = expectedLegCount(t.body);
      const got = byTidCount[t.id] || 0;
      const hintedPrompt = `Extract all flight segments from this single email thread. Tour date range: ${tourStart} to ${tourEnd}.

IMPORTANT: This email describes approximately ${expected} flight legs (round-trip, connection, or multi-city). You previously returned only ${got}. Re-read the body carefully and enumerate EVERY leg. Look for BOTH "Outbound/Departing" AND "Return/Returning/Inbound" blocks. Look for multiple flight-number rows. Each leg = one object in flights[].

[0] tid:${t.id}
Subject: ${t.subject}
From: ${t.from}${t.forwardedSender ? `\nOriginal sender: ${t.forwardedSender.name}${t.forwardedSender.email ? ` <${t.forwardedSender.email}>` : ""}` : ""}
Date: ${t.date}
Body: ${t.body}

Return this exact JSON:
{
  "flights": [
    {
      "flightNo": "B6123",
      "carrier": "JetBlue",
      "from": "BOS", "fromCity": "Boston",
      "to": "DUB", "toCity": "Dublin",
      "depDate": "2026-05-02", "dep": "21:55",
      "arrDate": "2026-05-03", "arr": "09:30",
      "pax": ["Grace Offerdahl"],
      "pnr": "CODGXZ", "confirmNo": null, "ticketNo": null,
      "cost": null, "currency": "USD",
      "tid": "${t.id}"
    }
  ]
}`;
      return callClaude(hintedPrompt).then(parsed => ({ t, expected, got, parsed }));
    }));
    for (let i = 0; i < retryResults.length; i++) {
      const r = retryResults[i];
      const t = missedThreads[i];
      if (r.status === "rejected") {
        runErrors.push({ kind: "anthropic_error", phase: "missed_leg_retry", tid: t.id, detail: String(r.reason?.message || "").slice(0, 300) });
        continue;
      }
      const { expected, got, parsed } = r.value;
      const rows = Array.isArray(parsed?.flights) ? parsed.flights : [];
      const existingKeys = new Set(claudeFlights.filter(f => f.tid === t.id)
        .map(f => `${f.flightNo || ""}|${f.depDate || ""}|${f.from || ""}|${f.to || ""}`));
      let added = 0;
      for (const f of rows) {
        const k = `${f.flightNo || ""}|${f.depDate || ""}|${f.from || ""}|${f.to || ""}`;
        if (existingKeys.has(k)) continue;
        claudeFlights.push({ ...f, tid: f.tid || t.id, source: "claude_retry", parseVerified: null });
        existingKeys.add(k);
        added++;
      }
      console.log(`[flights] retry tid=${t.id} expected=${expected} got_before=${got} added=${added}`);
    }
  }

  // ── Per-thread PDF calls (sequential, bounded by scan cap) ────────────────
  let attachmentsScanned = 0;
  for (const t of withPdfThreads) {
    if (attachmentsScanned >= PDF_MAX_PER_SCAN) {
      runErrors.push({ kind: "pdf_scan_cap_reached", tid: t.id, attemptedFiles: t.attachments.length });
      // Fall back to text-only single-thread parse so we don't drop the record.
      try {
        const pdfFallback = await parseAndVerifyBatch([t], 0);
        claudeFlights.push(...pdfFallback.map(f => ({ ...f, source: f.source || "claude" })));
      } catch (e) {
        runErrors.push({ kind: "anthropic_error", phase: "pdf_fallback_text", tid: t.id, status: e.status, detail: (e.detail || "").slice(0, 300) });
      }
      continue;
    }

    const docBlocks = [];
    const usedFiles = [];
    for (const a of t.attachments) {
      if (attachmentsScanned >= PDF_MAX_PER_SCAN) break;
      const b64 = await fetchAttachmentB64(googleToken, a.messageId, a.attachmentId);
      if (!b64) { runErrors.push({ kind: "attachment_fetch_failed", tid: t.id, filename: a.filename }); continue; }
      docBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
      usedFiles.push(a.filename);
      attachmentsScanned++;
    }

    const userPrompt = `Extract all flight segments from this thread. Tour date range: ${tourStart} to ${tourEnd}.
${docBlocks.length ? `Attached: ${usedFiles.length} PDF e-ticket/itinerary/receipt(s) — ${usedFiles.join(", ")}. Trust the PDF over body text for cost, dates, pnr/confirmNo/ticketNo.` : ""}

[0] tid:${t.id}
Subject: ${t.subject}
From: ${t.from}${t.forwardedSender ? `\nOriginal sender: ${t.forwardedSender.name}${t.forwardedSender.email ? ` <${t.forwardedSender.email}>` : ""}` : ""}
Date: ${t.date}
Body: ${t.body}

Return this exact JSON:
{
  "flights": [
    {
      "flightNo": "DL154",
      "carrier": "Delta",
      "from": "BOS", "fromCity": "Boston",
      "to": "DUB", "toCity": "Dublin",
      "depDate": "2026-05-02", "dep": "21:55",
      "arrDate": "2026-05-03", "arr": "09:30",
      "pax": ["Davon Johnson"],
      "pnr": "F9OCAU", "confirmNo": "KL7X9M", "ticketNo": "006-1234567890",
      "cost": 648.50, "currency": "USD",
      "tid": "${t.id}"
    }
  ]
}`;

    try {
      const parsed = await callClaude([...docBlocks, { type: "text", text: userPrompt }]);
      const rows = Array.isArray(parsed?.flights) ? parsed.flights : [];
      for (const f of rows) {
        claudeFlights.push({
          ...f,
          tid: f.tid || t.id,
          source: "claude_pdf",
          parseVerified: null, // PDF-backed records skip Haiku verify; PDF is authoritative
          sourceAttachment: usedFiles.length ? { filename: usedFiles[0] } : null,
        });
      }
      console.log(`[flights] pdf tid=${t.id} pdfs=${docBlocks.length} rows=${rows.length}`);
    } catch (e) {
      runErrors.push({ kind: "anthropic_error", phase: "pdf_thread", tid: t.id, status: e.status, detail: (e.detail || "").slice(0, 300) });
    }
  }

  // Dedup BEFORE validation — a JSON-LD leg and a Claude leg for the same
  // segment should merge (JSON-LD wins for structure, Claude may carry extra pax).
  const freshMerged = dedupFlights([...jsonLdFlights, ...claudeFlights]);

  // Cache fresh results per-thread + log enhancements vs previous.
  const freshByTid = {};
  for (const f of freshMerged) (freshByTid[f.tid] ||= []).push(f);
  // Fire-and-forget cache writes — don't await, avoids blocking the response.
  for (const t of freshThreads) {
    const result = freshByTid[t.id] || [];
    putCachedThread("flights", t.id, {
      lastMsgMs: t.lastMsgMs,
      bodyHash: t.bodyHash,
      result,
      stopReason: null,
      footerStripSaved: null,
      attachmentFingerprints: t.attachmentFingerprints || [],
    }).catch(e => console.warn("[flights] putCachedThread failed:", t.id, e.message));
    if (Array.isArray(t.prevResult) && t.prevResult.length) {
      const prevByKey = Object.fromEntries(t.prevResult.map(r => [`${r.flightNo}|${r.depDate}|${r.from}|${r.to}`, r]));
      for (const f of result) {
        const key = `${f.flightNo}|${f.depDate}|${f.from}|${f.to}`;
        const prev = prevByKey[key];
        if (prev) logEnhancement("flight", `${t.id}:${key}`, prev, f, { scanRunId: runId, source: "flights", scanner: "flights", userId: user.id, userEmail: user.email })
          .catch(() => {});
      }
    }
  }

  const merged = dedupFlights([...cachedFlights, ...freshMerged]);

  // Validation: drop flights lacking both a usable PNR and the core identifier
  // quartet (flightNo + depDate + from + to). Catches Claude hallucinations and
  // partial JSON-LD nodes that reference a flight without actually describing one.
  const validFlights = merged.filter(isValidFlight);
  const droppedCount = merged.length - validFlights.length;

  console.log("[flights] threads:", threads.length, "| jsonld:", jsonLdFlights.length, "| claude:", claudeFlights.length, "| merged:", merged.length, "| dropped:", droppedCount, "| kept:", validFlights.length, "| after:", after);

  const flights = validFlights.map(f => {
    const showMatch = matchFlightToShow(f, shows);
    return {
      ...f,
      id: `fl_${(f.tid || "").slice(-6)}_${(f.flightNo || "").replace(/\s/g, "") || Math.random().toString(36).slice(2, 6)}`,
      status: "pending",
      fresh48h: freshIds.has(f.tid) ? true : undefined,
      suggestedShowDate: showMatch?.showDate || null,
      suggestedRole: showMatch?.role || null,
      suggestedVenue: showMatch?.venue || null,
    };
  });

  // Airline-attachment telemetry: one row per thread showing carrier guess +
  // whether it carried a PDF. Retrospective query answers "does United ship
  // PDFs?" without a new table — just read scan_runs.params.perThread.
  const perThread = threads.map(t => ({
    tid: t.id,
    carrierGuess: t.carrierGuess || null,
    hadPdf: (t.attachments?.length || 0) > 0,
    pdfCount: t.attachments?.length || 0,
  }));

  // Merge perThread telemetry back into scan_runs.params. Single update,
  // no select — we still have initialParams in scope so we can rebuild the
  // merged object without a round-trip (critical for staying under the
  // 60s Vercel function budget).
  if (runId) {
    supabase.from("scan_runs")
      .update({ params: { ...initialParams, perThread } })
      .eq("id", runId)
      .then(({ error }) => { if (error) console.warn("[flights] perThread write failed:", error.message); });
  }

  await finishScanRun(runId, {
    threadsFound: threads.length,
    threadsCached: threads.length - freshThreads.length,
    threadsParsed: freshThreads.length,
    attachmentsScanned,
    inputTokens: inputTokensTotal,
    outputTokens: outputTokensTotal,
    stopReasons,
    errors: [...runErrors, ...queryErrors.map(q => ({ kind: "gmail_query_failed", ...q }))],
    startedAt,
  });

  return res.json({
    flights,
    scannedAt: new Date().toISOString(),
    threadsFound: threads.length,
    freshThreads: freshIds.size,
    jsonLdThreads: jsonLdTids.size,
    claudeThreads: claudeThreads.length,
    dropped: droppedCount,
    queryErrors: queryErrors.length ? queryErrors : undefined,
    scanRunId: runId,
    threadsCached: threads.length - freshThreads.length,
    threadsParsed: freshThreads.length,
    attachmentsScanned,
    marketingSkipped,
    tokensUsed: inputTokensTotal + outputTokensTotal,
  });
};
