// api/flights.js — Gmail flight confirmation scraper + Claude parser
const { withTimeout } = require("./lib/utils");
const { authenticate } = require("./lib/auth");
const { gmailSearch, fetchBatched, extractBody, stripMarketingFooter, extractHtmlRaw, extractJsonLdReservations, extractJson } = require("./lib/gmail");
const { DEFAULT_MODEL, postMessages } = require("./lib/anthropic");
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
const { TOUR_CONTEXT, buildTourContextBlock, crewDisplayList } = require("./lib/tourContext");
const {
  buildSynonymBlock, buildConfidenceRubric, buildStopwordRule,
  validateCommon, normalizePerson, shortenAirport, hasStopword,
  isPnr, isConfirmNo, isTicketNo, isInTourDateRange,
} = require("./lib/parsePrimitives");

// PDF attachment caps. Keep in sync with lodging-scan.js — both scanners share the
// per-scan budget so one scan type can't starve the other on large mailboxes.
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
  // 8000-char body cap. On forwarded receipts, slice from the "Forwarded message"
  // marker so the airline body (not the Gmail fwd chrome) stays in-window for Claude.
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

// Post-dedup validation pass. Emits validationFlags[] per flight. Additive —
// does not drop records (isValidFlight already does that). Also applies the
// shortenAirport normalizer and common guards (UI-chrome / date-range / code-
// format) from parsePrimitives. Cross-flight checks (short_layover,
// pax_overlap, orphan_return, arr_before_dep) run as a second pass.
function validateFlights(flights, { tourStart, tourEnd } = {}) {
  if (!Array.isArray(flights)) return flights;

  // Pass 1: per-flight common guards + airport IATA extraction
  const out = flights.map(f => {
    const fixed = { ...f };
    if (fixed.from) fixed.from = shortenAirport(fixed.from);
    if (fixed.to)   fixed.to   = shortenAirport(fixed.to);
    const { flags, fixed: cleaned } = validateCommon(fixed, {
      tourStart, tourEnd,
      dateKeys: ["depDate", "arrDate"],
      codeKeys: { pnr: "pnr", confirmNo: "confirmNo", ticketNo: "ticketNo" },
      stopwordKeys: ["from", "to", "fromCity", "toCity", "pax"],
    });
    return {
      ...cleaned,
      validationFlags: Array.isArray(f.validationFlags) ? [...f.validationFlags, ...flags] : [...flags],
    };
  });

  // Pass 2: cross-flight sanity
  // arr_before_dep — fatal-ish timing bug from an OCR or timezone mishap
  for (const f of out) {
    if (f.depDate && f.dep && f.arrDate && f.arr) {
      const dep = new Date(`${f.depDate}T${f.dep}:00`);
      const arr = new Date(`${f.arrDate}T${f.arr}:00`);
      if (!isNaN(dep.getTime()) && !isNaN(arr.getTime()) && arr < dep) {
        f.validationFlags.push("arr_before_dep");
      }
    }
  }

  // short_layover — same-journey connection with <45 min at the interchange airport
  const byJourney = {};
  for (const f of out) {
    const k = f.journeyRef || f.pnr;
    if (!k) continue;
    (byJourney[k] ||= []).push(f);
  }
  for (const legs of Object.values(byJourney)) {
    if (legs.length < 2) continue;
    legs.sort((a, b) => {
      const da = `${a.depDate || ""}T${a.dep || "00:00"}`;
      const db = `${b.depDate || ""}T${b.dep || "00:00"}`;
      return da.localeCompare(db);
    });
    for (let i = 1; i < legs.length; i++) {
      const prev = legs[i - 1];
      const curr = legs[i];
      if (!prev.arrDate || !prev.arr || !curr.depDate || !curr.dep) continue;
      if (prev.to !== curr.from) continue;
      const prevArr = new Date(`${prev.arrDate}T${prev.arr}:00`);
      const currDep = new Date(`${curr.depDate}T${curr.dep}:00`);
      const minutes = (currDep - prevArr) / 60000;
      if (minutes >= 0 && minutes < 45) {
        curr.validationFlags.push("short_layover");
      }
    }
  }

  // pax_overlap — same pax name on two flights whose [dep, arr] windows overlap
  const windows = out.map(f => {
    const dep = f.depDate && f.dep ? new Date(`${f.depDate}T${f.dep}:00`) : null;
    const arr = f.arrDate && f.arr ? new Date(`${f.arrDate}T${f.arr}:00`) : null;
    return { f, dep, arr, pax: new Set((f.pax || []).map(p => String(p).toLowerCase().trim())) };
  });
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i], b = windows[j];
      if (!a.dep || !a.arr || !b.dep || !b.arr) continue;
      const overlap = a.dep < b.arr && b.dep < a.arr;
      if (!overlap) continue;
      const shared = [...a.pax].some(p => p && b.pax.has(p));
      if (shared) {
        a.f.validationFlags.push("pax_overlap");
        b.f.validationFlags.push("pax_overlap");
      }
    }
  }

  // orphan_return — returnOfId points to a tid#idx that isn't in the result set
  const idSet = new Set();
  out.forEach((f, i) => idSet.add(`${f.tid}#${i}`));
  for (const f of out) {
    if (f.returnOfId && !idSet.has(f.returnOfId)) {
      f.validationFlags.push("orphan_return");
    }
  }

  // Dedup flags array on each flight
  for (const f of out) {
    f.validationFlags = [...new Set(f.validationFlags)];
  }
  return out;
}

// ── Cancellation / rebooking supersede ───────────────────────────────────────
// Detects when a newer email cancels or replaces an earlier booking with the
// same PNR/confirmNo. Mutates in place; returns the same array.
// Guard: only supersedes when flightNo or dep time/date actually differ —
// avoids false-positives on seat-change and status update emails.
function supersedeFlights(flights, threads) {
  const CANCEL_RE = /cancel|changed|updated|rebooked|rebooking/i;
  const tidMeta = new Map((threads || []).map(t => [
    t.id,
    { ms: t.lastMsgMs || 0, subject: (t.subject || "").toLowerCase() },
  ]));

  const groups = new Map();
  for (const f of flights) {
    const key = f.pnr || f.confirmNo
      || (f.flightNo && f.from && f.to ? `${f.flightNo}|${f.from}|${f.to}` : null);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => (tidMeta.get(a.tid)?.ms || 0) - (tidMeta.get(b.tid)?.ms || 0));

    for (let i = group.length - 1; i >= 1; i--) {
      const newer = group[i];
      const meta = tidMeta.get(newer.tid) || {};
      const isCancelOrChange = CANCEL_RE.test(meta.subject || "")
        || newer.status === "cancelled"
        || newer.status === "changed";
      if (!isCancelOrChange) continue;

      for (let j = 0; j < i; j++) {
        const older = group[j];
        if (older.supersededBy) continue;
        const sameRoute = older.from === newer.from && older.to === newer.to;
        const detailsDiffer = older.flightNo !== newer.flightNo
          || older.dep !== newer.dep
          || older.depDate !== newer.depDate;
        if (sameRoute && detailsDiffer) {
          older.supersededBy = newer.tid;
          if (!newer.supersedes) newer.supersedes = older.tid;
          newer.status = (meta.subject || "").includes("cancel") || newer.status === "cancelled"
            ? "cancelled" : "changed";
        }
      }
    }
  }

  return flights;
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
    // "itinerary and receipt" — AA format. subject:("itinerary and receipt") fails (Gmail treats "and" as operator)
    `subject:itinerary subject:receipt ${W}`,
    `subject:("your itinerary") ${W}`,
    `from:(@aa.com) (itinerary OR receipt OR confirmation) ${W}`,
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

  const { user, supabase, error: authErr } = await authenticate(req);
  if (authErr) return res.status(authErr.status).json({ error: authErr.message });

  const {
    googleToken,
    tourStart = "2026-04-01",
    tourEnd = "2026-06-30",
    sweepFrom = null,
    shows = [],
    force = false,
    forcePayMethod = false,
  } = req.body || {};
  if (!googleToken) return res.status(400).json({ error: "Missing googleToken" });

  const after = sweepFrom ? toGmailDate(sweepFrom) : nDaysAgo(365);
  const initialParams = { sweepFrom, tourStart, tourEnd, after, showsCount: shows.length };
  const { runId, startedAt } = await startScanRun({
    scanner: "flights", userId: user.id, params: initialParams,
  });
  const stopReasons = {};
  const runErrors = [];
  let inputTokensTotal = 0, outputTokensTotal = 0, cacheReadTokensTotal = 0, cacheCreationTokensTotal = 0;
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
    await withTimeout(runParallel(high), 30000);
    // Low sweep: 3 broad queries at maxResults=500, replacing the previous 65+
    // from: domain queries. Skip entirely if high already saturated the cap.
    if (seen.size < CAP * 0.8) await withTimeout(runParallel(low, 500), 15000);
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
    // forcePayMethod: re-parse threads where all cached flights lack payMethod.
    // Bypass JSON-LD shortcircuit too — payment info is in body text, not schema.org.
    const missingPayMethod = forcePayMethod && Array.isArray(cached?.result) && cached.result.length > 0
      && cached.result.every(r => r.payMethod == null || r.payMethod === "");
    if (!force && !missingPayMethod && !underParsed && shouldUseCached(cached, t.lastMsgMs, bodyHash, t.attachmentFingerprints)) {
      if (Array.isArray(cached.result)) cachedFlights.push(...cached.result);
    } else {
      if (missingPayMethod) t.forcedForPayMethod = true;
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
    if (mapped.length >= expected && !t.forcedForPayMethod) {
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
  // Sourced from api/lib/tourContext.js so all scanners share one roster.
  const CREW_ROSTER = crewDisplayList();

  const sysPrompt = `You are a flight itinerary parser for concert touring operations. Extract structured flight segment data from email bodies.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.

═══ TOUR CONTEXT ═══
${buildTourContextBlock()}

${buildStopwordRule()}

${buildSynonymBlock()}

${buildConfidenceRubric()}

═══ AIRLINE-AGNOSTIC ═══
Parse ANY carrier including unfamiliar ones. Do not skip a leg because the format is unusual. If fields are ambiguous, fill what's clear, null the rest, and lower confidence.

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
- payMethod: card or payment method used. Look for "charged to", "payment method", "card ending in", "Visa", "Mastercard", "Amex", "American Express" followed by last 4 digits. Format as "Amex 4567" or "Visa 1234". null if not present.

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

Sequencing fields (optional — fill when inferable from the email):
- journeyRef     : the shared reference that ties all legs of ONE purchase together.
                   Use the PNR if present, otherwise the booking/confirmation number.
                   All legs of a round-trip or multi-city itinerary MUST share the same
                   journeyRef. If only one leg appears in the email, still set it.
- connectionOfId : when two legs chain geographically through an intermediate airport
                   (A→B arr followed same-day by B→C dep), set this on the downstream
                   leg. Use the tid suffixed with the leg index, e.g. "\${tid}#0" points
                   at the first leg, "\${tid}#1" at the second. Null when not a connection.
- returnOfId     : when the booking is a round-trip and this leg is the return half,
                   set this to the outbound leg's synthetic id ("\${tid}#0"). Null on
                   the outbound leg itself and on one-way bookings.
- layoverMinutes : on a connecting (downstream) leg, the minutes between the prior
                   leg's arr and this leg's dep at the interchange airport. Null when
                   not a connection.

Attached PDFs: when a PDF e-ticket, itinerary, or receipt is attached, trust
the PDF over the body text for cost, dates, flight numbers, and the three
confirmation-code fields above. E-ticket numbers almost always come from the PDF.

═══ FARE / SEAT / DURATION ═══
- fareClass ∈ {"economy","premium_economy","business","first"} | null.
  "Main Cabin"/"Economy"/"Basic Economy"/"Saver" → economy.
  "Premium Economy"/"Premium Select" → premium_economy.
  "Business"/"Club World"/"Polaris"/"BusinessFirst" → business.
  "First"/"La Première"/"Suites" → first.
- cabin: single-letter booking class (Y, W, J, F, I, D, C, etc.) if shown, else null.
- seat: "14A" format if pre-assigned in this email, else null.
- durationMinutes: integer total flight time if shown ("6h 45m" → 405), else null.
- operator: the carrier printed in "operated by" or codeshare line, else null.
- status ∈ {"confirmed","cancelled","changed","pending"}:
    "cancelled" if subject/body contains: Cancelled, Canceled, Annullé, Annulliert, Cancelación.
    "changed" if: Schedule Change, Itinerary Update, Rebooked, Flight Changed.
    "pending" if: Hold, On Request, Waitlist, Pending Payment.
    Otherwise "confirmed".

═══ OUTPUT REQUIREMENTS ═══
Every flight object MUST include these fields (null/empty when absent):
- confidence: "high"|"med"|"low"
- parseNotes: string|null (one sentence when med/low, else null)
- validationFlags: [] (leave empty; the server fills this post-parse)
- fareClass, cabin, seat, durationMinutes, operator, status

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
      "payMethod": null,
      "fareClass": "economy", "cabin": "Y", "seat": null, "durationMinutes": 395,
      "operator": null, "status": "confirmed",
      "journeyRef": "CODGXZ", "connectionOfId": null, "returnOfId": null, "layoverMinutes": null,
      "confidence": "high", "parseNotes": null, "validationFlags": [],
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
Body: ${t.body || ""}`).join("\n\n---\n\n")}

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
      "payMethod": "Amex 4567",
      "fareClass": "economy",
      "cabin": "Y",
      "seat": null,
      "durationMinutes": 395,
      "operator": null,
      "status": "confirmed",
      "journeyRef": "F9OCAU",
      "connectionOfId": null,
      "returnOfId": null,
      "layoverMinutes": null,
      "confidence": "high",
      "parseNotes": null,
      "validationFlags": [],
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
      try {
        const { text, stopReason, model: respModel, usage } = await postMessages({
          model, maxTokens, system: sys, messages: [{ role: "user", content: prompt }],
        });
        inputTokensTotal         += usage.inputTokens;
        outputTokensTotal        += usage.outputTokens;
        cacheReadTokensTotal     += usage.cacheReadTokens;
        cacheCreationTokensTotal += usage.cacheCreationTokens;
        bumpStopReason(stopReasons, stopReason);
        console.log("[flights] stop_reason:", stopReason, "| model:", respModel, "| attempt:", attempt + 1);
        return extractJson(text);
      } catch (e) {
        lastErr = e;
        if (!RETRYABLE.has(e.status)) {
          console.error(`[flights] anthropic ${e.status} non-retryable:`, e.detail);
          throw e;
        }
        console.warn(`[flights] anthropic ${e.status} attempt ${attempt + 1}, retrying`);
      }
    }
    throw lastErr;
  };


  const parseAndVerifyBatch = async (batch, offset) => {
    const parsed = await callClaude(buildPrompt(batch, offset));
    return Array.isArray(parsed?.flights) ? parsed.flights : [];
  };

  const parseAndVerifyMultiLeg = async (t) => {
    const parsed = await callClaude(buildMultiLegPrompt(t));
    return Array.isArray(parsed?.flights) ? parsed.flights : [];
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
      try { anthropic = JSON.parse(e.detail || "")?.error || null; } catch (pe) { console.warn("[flights] anthropic error detail not JSON:", pe.message); }
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
  const MISSED_RETRY_CAP = 5;
  const byTidCount = {};
  for (const f of claudeFlights) byTidCount[f.tid] = (byTidCount[f.tid] || 0) + 1;
  const allMissedThreads = simpleTextThreads.filter(t => {
    const got = byTidCount[t.id] || 0;
    const expected = expectedLegCount(t.body);
    return expected >= 2 && got < expected;
  });
  const missedThreads = allMissedThreads.slice(0, MISSED_RETRY_CAP);
  if (allMissedThreads.length > MISSED_RETRY_CAP) {
    console.log(`[flights] missed-leg retry capped: ${allMissedThreads.length} → ${MISSED_RETRY_CAP}`);
    runErrors.push({ kind: "retry_cap", total: allMissedThreads.length, capped: allMissedThreads.length - MISSED_RETRY_CAP });
  }
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
      "payMethod": null,
      "fareClass": "economy", "cabin": "Y", "seat": null, "durationMinutes": 395,
      "operator": null, "status": "confirmed",
      "journeyRef": "CODGXZ", "connectionOfId": null, "returnOfId": null, "layoverMinutes": null,
      "confidence": "high", "parseNotes": null, "validationFlags": [],
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
      if ((t.body || "").length >= 300) {
        try {
          const pdfFallback = await parseAndVerifyBatch([t], 0);
          claudeFlights.push(...pdfFallback.map(f => ({ ...f, source: f.source || "claude" })));
        } catch (e) {
          runErrors.push({ kind: "anthropic_error", phase: "pdf_fallback_text", tid: t.id, status: e.status, detail: (e.detail || "").slice(0, 300) });
        }
      } else {
        console.log(`[flights] pdf cap fallback skipped tid=${t.id}: body too short (${(t.body || "").length} chars)`);
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

    if (docBlocks.length === 0) {
      if ((t.body || "").length >= 300) {
        try {
          const pdfFallback = await parseAndVerifyBatch([t], 0);
          claudeFlights.push(...pdfFallback.map(f => ({ ...f, source: f.source || "claude" })));
        } catch (e) {
          runErrors.push({ kind: "anthropic_error", phase: "pdf_thread", tid: t.id, status: e.status, detail: (e.detail || "").slice(0, 300) });
        }
      } else {
        console.log(`[flights] pdf fetch failed + short body, skipping tid=${t.id}`);
      }
      continue;
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
      "fareClass": "economy", "cabin": "Y", "seat": null, "durationMinutes": 395,
      "operator": null, "status": "confirmed",
      "journeyRef": "F9OCAU", "connectionOfId": null, "returnOfId": null, "layoverMinutes": null,
      "confidence": "high", "parseNotes": null, "validationFlags": [],
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

  // Post-parse validation pass: emits validationFlags[] per flight (additive,
  // non-fatal) and normalizes airport strings. Runs on the kept set so flags
  // reflect the final payload the UI sees.
  const validatedFlights = validateFlights(validFlights, { tourStart, tourEnd });

  // Crew normalization: map raw pax strings to stable {crewId, displayName}
  // against the shared TOUR_CONTEXT roster. Preserves raw pax[] intact.
  const roster = TOUR_CONTEXT.crew;
  for (const f of validatedFlights) {
    const rawPax = Array.isArray(f.pax) ? f.pax : [];
    f.paxNormalized = rawPax.map(raw => ({ raw, ...normalizePerson(raw, roster) }));
  }

  // Cancellation / rebooking supersede pass. Runs after crew normalization so
  // paxNormalized is already populated. Mutates validatedFlights in place.
  supersedeFlights(validatedFlights, threads);
  const supersededCount = validatedFlights.filter(f => f.supersededBy).length;

  const flaggedCount = validatedFlights.filter(f => (f.validationFlags || []).length).length;
  console.log("[flights] threads:", threads.length, "| jsonld:", jsonLdFlights.length, "| claude:", claudeFlights.length, "| merged:", merged.length, "| dropped:", droppedCount, "| kept:", validFlights.length, "| flagged:", flaggedCount, "| superseded:", supersededCount, "| after:", after);

  const flights = validatedFlights.map(f => {
    const showMatch = matchFlightToShow(f, shows);
    return {
      ...f,
      id: `fl_${(f.tid || "").slice(-6)}_${String(f.flightNo || "").replace(/\s/g, "") || Math.random().toString(36).slice(2, 6)}`,
      status: (f.status === "cancelled" || f.status === "changed") ? f.status : "pending",
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
    cacheReadTokens: cacheReadTokensTotal,
    cacheCreationTokens: cacheCreationTokensTotal,
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
