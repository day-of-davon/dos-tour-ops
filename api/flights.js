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
  const body = strippedParts.join("\n---\n").slice(0, 3000);
  const lastMsg = thread.messages?.[thread.messages.length - 1];
  const lastMsgMs = lastMsg?.internalDate ? Number(lastMsg.internalDate) : null;
  // Raw HTML (pre-strip) from all messages — needed for JSON-LD FlightReservation scanning.
  const htmlRaw = (thread.messages || [])
    .map(m => extractHtmlRaw(m.payload))
    .filter(Boolean)
    .join("\n");
  const forwardedSender = detectForwardedSender(body);
  return { id: thread.id, subject: get("Subject"), from: get("From"), date: get("Date"), lastMsgMs, body, htmlRaw, forwardedSender };
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

// Dedup flights by (flightNo + depDate + from + to). Merges pax unions so a leg
// extracted from both JSON-LD and Claude keeps all passenger names.
function dedupFlights(flights) {
  const seen = new Map();
  for (const f of flights) {
    const k = `${f.flightNo || ""}|${f.depDate || ""}|${f.from || ""}|${f.to || ""}`;
    const prev = seen.get(k);
    if (!prev) { seen.set(k, f); continue; }
    // Prefer JSON-LD as source of truth; merge pax union
    const winner = prev.source === "jsonld" ? prev : f;
    const loser  = prev.source === "jsonld" ? f : prev;
    winner.pax = [...new Set([...(winner.pax || []), ...(loser.pax || [])])];
    if (!winner.pnr && loser.pnr) winner.pnr = loser.pnr;
    if (!winner.confirmNo && loser.confirmNo) winner.confirmNo = loser.confirmNo;
    if (!winner.cost && loser.cost) { winner.cost = loser.cost; winner.currency = loser.currency; }
    seen.set(k, winner);
  }
  return [...seen.values()];
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
// Subject-line queries (high priority) — run first so their thread IDs fill the
// cap before domain queries. Catches forwarded receipts regardless of sender.
// Domain queries (low priority) — additive depth for direct emails that miss subject matches.
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
    // US carriers
    `from:(DeltaAirLines@t.delta.com) ${W}`,
    `from:(noreply@delta.com) ${W}`,
    `from:(noreply@aa.com) ${W}`,
    `from:(confirmations@aa.com) ${W}`,
    `from:(noreply@united.com) ${W}`,
    `from:(Southwest@luv.southwest.com) ${W}`,
    `from:(noreply@alaskaair.com) ${W}`,
    `from:(noreply@jetblue.com) ${W}`,
    `from:(noreply@spirit.com) ${W}`,
    `from:(noreply@flyfrontier.com) ${W}`,
    `from:(noreply@allegiantair.com) ${W}`,
    `from:(noreply@hawaiianairlines.com) ${W}`,
    // Canada
    `from:(noreply@aircanada.com) ${W}`,
    `from:(noreply@westjet.com) ${W}`,
    `from:(noreply@flyporter.com) ${W}`,
    // European full-service
    `from:(noreply@ba.com) ${W}`,
    `from:(do_not_reply@ba.com) ${W}`,
    `from:(noreply@lufthansa.com) ${W}`,
    `from:(noreply@airfrance.fr) ${W}`,
    `from:(noreply@airfrance.com) ${W}`,
    `from:(donotreply@klm.com) ${W}`,
    `from:(noreply@iberia.com) ${W}`,
    `from:(noreply@swiss.com) ${W}`,
    `from:(noreply@austrian.com) ${W}`,
    `from:(noreply@brusselsairlines.com) ${W}`,
    `from:(noreply@finnair.com) ${W}`,
    `from:(noreply@flysas.com) ${W}`,
    `from:(noreply@tap.pt) ${W}`,
    `from:(noreply@turkishairlines.com) ${W}`,
    `from:(noreply@aerlingus.com) ${W}`,
    `from:(noreply@lot.com) ${W}`,
    `from:(noreply@croatiaairlines.hr) ${W}`,
    `from:(info@airserbia.com) ${W}`,
    // European LCCs
    `from:(noreply@ryanair.com) ${W}`,
    `from:(no-reply@easyjet.com) ${W}`,
    `from:(noreply@wizzair.com) ${W}`,
    `from:(booking@norwegian.com) ${W}`,
    `from:(no-reply@norwegian.com) ${W}`,
    `from:(noreply@vueling.com) ${W}`,
    `from:(noreply@transavia.com) ${W}`,
    `from:(bookings@jet2.com) ${W}`,
    `from:(noreply@volotea.com) ${W}`,
    // Middle East / Gulf
    `from:(emirates@emails.emirates.com) ${W}`,
    `from:(noreply@emirates.com) ${W}`,
    `from:(noreply@etihad.com) ${W}`,
    `from:(noreply@qatarairways.com) ${W}`,
    `from:(noreply@flydubai.com) ${W}`,
    // Asia Pacific
    `from:(noreply@singaporeair.com) ${W}`,
    `from:(noreply@cathaypacific.com) ${W}`,
    `from:(jmb@ml.jal.co.jp) ${W}`,
    `from:(info@ana.co.jp) ${W}`,
    `from:(noreply@koreanair.com) ${W}`,
    `from:(noreply@qantas.com.au) ${W}`,
    `from:(noreply@airnewzealand.co.nz) ${W}`,
    `from:(noreply@airasia.com) ${W}`,
    // Latin America
    `from:(noreply@latam.com) ${W}`,
    `from:(noreply@avianca.com) ${W}`,
    `from:(noreply@copaair.com) ${W}`,
    // Private charters
    `from:(netjets.com) ${W}`,
    `from:(vistajet.com) ${W}`,
    `from:(wheelsup.com) ${W}`,
    `from:(flyexclusive.com) ${W}`,
    `from:(jsx.com) ${W}`,
    `("private jet" OR "charter flight") (confirmation OR itinerary OR booking) ${W}`,
    // OTA
    `from:(expedia.com) (flight OR itinerary) ${W}`,
    `from:(concur.com) (flight OR itinerary) ${W}`,
    `from:(google.com) subject:(trip) (flight OR itinerary) ${W}`,
    `from:(travelport.com) (flight OR itinerary) ${W}`,
    `from:(noreply@booking.com) (flight OR airline) ${W}`,
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
  const { runId, startedAt } = await startScanRun({
    scanner: "flights", userId: user.id,
    params: { sweepFrom, tourStart, tourEnd, after, showsCount: shows.length },
  });
  const stopReasons = {};
  const runErrors = [];
  let inputTokensTotal = 0, outputTokensTotal = 0;
  const { high, low } = buildFlightQueryGroups(after);
  const seen = new Set();
  const CAP = 100;
  const queryErrors = [];

  const runParallel = async (queries) => {
    const results = await Promise.allSettled(queries.map(q => gmailSearch(googleToken, q, 25)));
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
    // Skip low-priority sweep if high already saturated the cap — low adds 60+ queries of noise.
    if (seen.size < CAP * 0.8) await runParallel(low);
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
  try {
    threads = (await fetchBatched(googleToken, ids, 20)).map(extractHeaders);
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
  const cachedFlights = [];
  const freshThreads = [];
  for (const t of threads) {
    const bodyHash = hashBody(t.subject, t.from, t.body);
    const cached = await getCachedThread("flights", t.id);
    t.bodyHash = bodyHash;
    t.prevResult = cached?.result || null;
    if (shouldUseCached(cached, t.lastMsgMs, bodyHash, [])) {
      if (Array.isArray(cached.result)) cachedFlights.push(...cached.result);
    } else {
      freshThreads.push(t);
    }
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

Confirmation codes (critical):
- pnr: 6-character alphanumeric airline record locator / PNR (e.g. "F9OCAU", "ABC123"). Distinct from order/booking numbers.
- confirmNo: booking/order/e-ticket number if different from PNR. null if same as pnr or absent.
- Look for labels: "Confirmation Code", "Record Locator", "Booking Reference", "PNR", "E-Ticket Number", "Ticket #".
- Do NOT confuse a booking order number (e.g. "Order #28471922") with a PNR — those go in confirmNo, not pnr.

Skip hotel, train, rental car confirmations — flights and private charters only.`;

  const BATCH = 8;
  const threadBatches = [];
  for (let i = 0; i < claudeThreads.length; i += BATCH) threadBatches.push(claudeThreads.slice(i, i + BATCH));

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
      "confirmNo": null,
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
3. PNR vs confirmNo — PNR is exactly 6 alphanumeric chars (e.g. "F9OCAU"). Booking order numbers (longer or numeric-heavy) go in confirmNo.
4. Date/time — ensure depDate and arrDate match the email, especially for overnight flights where arrival date differs from departure date.
5. Multi-leg — if the email describes a connecting itinerary, each leg should be a separate record.`;

  const buildVerifyPrompt = (batch, flights) =>
    `Verify these extracted flight records against their source email threads (matched by tid).

SOURCE THREADS:
${batch.map(t => `tid:${t.id}\nSubject: ${t.subject}${t.forwardedSender ? `\nOriginal sender: ${t.forwardedSender.name}${t.forwardedSender.email ? ` <${t.forwardedSender.email}>` : ""}` : ""}\nBody: ${t.body}`).join("\n\n---\n\n")}

EXTRACTED FLIGHTS:
${JSON.stringify(flights, null, 2)}

For each flight, re-read its source thread and check every field: flightNo, from, fromCity, to, toCity, depDate, dep, arrDate, arr, pax, pnr, confirmNo, cost, currency.
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

  // Dedup BEFORE validation — a JSON-LD leg and a Claude leg for the same
  // segment should merge (JSON-LD wins for structure, Claude may carry extra pax).
  const freshMerged = dedupFlights([...jsonLdFlights, ...claudeFlights]);

  // Cache fresh results per-thread + log enhancements vs previous.
  const freshByTid = {};
  for (const f of freshMerged) (freshByTid[f.tid] ||= []).push(f);
  for (const t of freshThreads) {
    const result = freshByTid[t.id] || [];
    await putCachedThread("flights", t.id, {
      lastMsgMs: t.lastMsgMs,
      bodyHash: t.bodyHash,
      result,
      stopReason: null, // per-thread stop_reason not tracked in flights batch mode
      footerStripSaved: null,
      attachmentFingerprints: [],
    });
    if (Array.isArray(t.prevResult) && t.prevResult.length) {
      const prevByKey = Object.fromEntries(t.prevResult.map(r => [`${r.flightNo}|${r.depDate}|${r.from}|${r.to}`, r]));
      for (const f of result) {
        const key = `${f.flightNo}|${f.depDate}|${f.from}|${f.to}`;
        const prev = prevByKey[key];
        if (prev) await logEnhancement("flight", `${t.id}:${key}`, prev, f, { scanRunId: runId, source: "flights", scanner: "flights", userId: user.id, userEmail: user.email });
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

  await finishScanRun(runId, {
    threadsFound: threads.length,
    threadsCached: threads.length - freshThreads.length,
    threadsParsed: freshThreads.length,
    attachmentsScanned: 0,
    inputTokens: inputTokensTotal,
    outputTokens: outputTokensTotal,
    stopReasons,
    errors: [...runErrors, ...queryErrors.map(q => ({ kind: "gmail_query_failed", ...q }))],
    startedAt,
  });

  return res.json({
    flights,
    threadsFound: threads.length,
    freshThreads: freshIds.size,
    jsonLdThreads: jsonLdTids.size,
    claudeThreads: claudeThreads.length,
    dropped: droppedCount,
    queryErrors: queryErrors.length ? queryErrors : undefined,
    scanRunId: runId,
    threadsCached: threads.length - freshThreads.length,
    threadsParsed: freshThreads.length,
    tokensUsed: inputTokensTotal + outputTokensTotal,
  });
};
