// api/flights.js — Gmail flight confirmation scraper + Claude parser
const { createClient } = require("@supabase/supabase-js");
const { gmailSearch, fetchBatched, extractBody, extractJson } = require("./lib/gmail");

// ── Date helpers ──────────────────────────────────────────────────────────────
function toGmailDate(d) { return d.replace(/-/g, "/"); }
function nDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return toGmailDate(d.toISOString().slice(0, 10));
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Thread extraction ─────────────────────────────────────────────────────────
function extractHeaders(thread) {
  // Use the first message for Subject/From/Date — it's the original booking email.
  // Replies and forwarding wrappers appear as later messages and have wrong metadata.
  const first = thread.messages?.[0];
  const headers = first?.payload?.headers || [];
  const get = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  const body = (thread.messages || [])
    .map(m => extractBody(m.payload))
    .filter(Boolean)
    .join("\n---\n")
    .slice(0, 2000);
  return { id: thread.id, subject: get("Subject"), from: get("From"), date: get("Date"), body };
}

// ── Query list ────────────────────────────────────────────────────────────────
// Subject-line queries lead — they catch forwarded receipts regardless of sender.
// Carrier from: queries are additive depth for direct emails that miss subject matches.
function buildFlightQueries(after) {
  const W = `after:${after}`;
  return [
    // Forwarded receipts + broad subject sweeps
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

    // Destination-specific catches — show city airports
    `(BOS OR PVD OR MHT OR BDL OR ORH OR "Boston" OR "Worcester") (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(DEN OR "Denver" OR "Morrison") (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(YYZ OR YTZ OR YHM OR "Toronto" OR "Mississauga") (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(YOW OR "Ottawa") (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(BDL OR PVD OR HPN OR "Uncasville" OR "Hartford" OR "Providence") (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(LHR OR LGW OR LTN OR STN OR LCY OR Heathrow OR Gatwick OR Stansted OR Luton) (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(DUB OR Dublin OR MAN OR Manchester OR GLA OR Glasgow) (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(ZRH OR Zurich OR CGN OR Cologne OR AMS OR Amsterdam) (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(CDG OR ORY OR Paris OR MXP OR LIN OR Milan) (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,
    `(PRG OR Prague OR BER OR Berlin OR BTS OR Bratislava OR WAW OR Warsaw) (confirmation OR receipt OR itinerary OR "e-ticket") (flight OR airline) ${W}`,

    // OTA
    `from:(expedia.com) (flight OR itinerary) ${W}`,
    `from:(concur.com) (flight OR itinerary) ${W}`,
    `from:(google.com) subject:(trip) (flight OR itinerary) ${W}`,
    `from:(travelport.com) (flight OR itinerary) ${W}`,
    `from:(noreply@booking.com) (flight OR airline) ${W}`,
  ];
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
// Inbound window: arrives 0-2 days before the show (day-before travel is common).
// Outbound window: departs 0-2 days after the show.
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

    if (arrDelta >= 0 && arrDelta <= 2 && (arrCities.size === 0 || arrCities.has(sc))) {
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
  const queries = buildFlightQueries(after);
  const seen = new Set();

  try {
    // Fire all queries concurrently — Gmail handles fan-out fine and this saves ~4-6s vs batching
    let threw402 = false;
    await Promise.all(queries.map(async q => {
      if (threw402) return;
      try {
        const ids = await gmailSearch(googleToken, q, 25);
        ids.forEach(id => seen.add(id));
      } catch (e) {
        console.error("[flights] search error:", e.message);
        if (e.message.includes("401")) { threw402 = true; throw Object.assign(new Error("gmail_401"), { status: 402 }); }
      }
    }));
    if (threw402) return res.status(402).json({ error: "gmail_token_expired" });
  } catch (e) {
    if (e.status === 402) return res.status(402).json({ error: "gmail_token_expired" });
    return res.status(500).json({ error: e.message });
  }

  const ids = [...seen].slice(0, 50);
  if (!ids.length) return res.json({ flights: [], threadsFound: 0 });

  let threads, freshIds;
  try {
    threads = (await fetchBatched(googleToken, ids, 50)).map(extractHeaders);
    const cutoff48h = Date.now() - 48 * 3600 * 1000;
    freshIds = new Set(
      threads
        .filter(t => { const ms = new Date(t.date).getTime(); return !isNaN(ms) && ms >= cutoff48h; })
        .map(t => t.id)
    );
  } catch (e) {
    console.error("[flights] thread fetch error:", e.message);
    return res.status(500).json({ error: `Thread fetch failed: ${e.message}` });
  }

  const sysPrompt = `You are a flight itinerary parser for concert touring operations. Extract structured flight segment data from email bodies.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.

Rules:
- Each object in flights[] is one flight leg. Split multi-leg itineraries into separate objects.
- Dates: YYYY-MM-DD. Times: HH:MM 24-hour (e.g. "6:30 AM" → "06:30", "10:15 PM" → "22:15").
- IATA airport codes preferred (3 uppercase letters). Fall back to city name if code absent.
- cost: number only, no symbol. null if not present.
- currency: 3-letter ISO code (USD, GBP, EUR, CAD). null if not present.

Passenger extraction (critical):
- Scan the ENTIRE body for any section labeled: "Passengers", "Travelers", "Traveler", "Passenger", "Guest", "Name", or any passenger table.
- Airlines often print names in ALL-CAPS airline format: "JOHNSON/DAVON MR" → "Davon Johnson", "NUDELMAN/DANIEL" → "Daniel Nudelman", "DAVIS/OLEN Q" → "Olen Q Davis". Convert to Title Case.
- Also check "Booked by", "Purchased by", "Primary contact" lines as fallback if no pax section exists.
- For forwarded emails: the original booking content may appear after "---------- Forwarded message ---------" or "Begin forwarded message". Parse the forwarded body too.
- pax: array of all passenger full names. Empty array only if truly no names found.

Confirmation codes (critical):
- pnr: 6-character alphanumeric airline record locator / PNR (e.g. "F9OCAU", "ABC123"). Distinct from order/booking numbers.
- confirmNo: booking/order/e-ticket number if different from PNR. null if same as pnr or absent.
- Look for labels: "Confirmation Code", "Record Locator", "Booking Reference", "PNR", "E-Ticket Number", "Ticket #".

Skip hotel, train, rental car confirmations — flights and private charters only.`;

  const BATCH = 25;
  const threadBatches = [];
  for (let i = 0; i < threads.length; i += BATCH) threadBatches.push(threads.slice(i, i + BATCH));

  const buildPrompt = (batch, offset) =>
    `Extract all flight segments from these email threads. Tour date range: ${tourStart} to ${tourEnd}.

${batch.map((t, i) => `[${i + offset}] tid:${t.id}
Subject: ${t.subject}
From: ${t.from}
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

  const callClaude = async (prompt) => {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: sysPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) throw Object.assign(new Error(`Anthropic ${resp.status}`), { detail: await resp.text() });
    const data = await resp.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    console.log("[flights] stop_reason:", data.stop_reason, "| model:", data.model);
    return extractJson(text);
  };

  let rawFlights = [];
  try {
    const results = await Promise.all(
      threadBatches.map((batch, i) => callClaude(buildPrompt(batch, i * BATCH)))
    );
    rawFlights = results.flatMap(r => Array.isArray(r?.flights) ? r.flights : []);
  } catch (e) {
    console.error("[flights] anthropic error:", e.message);
    return res.status(502).json({ error: `Anthropic request failed: ${e.message}`, detail: e.detail });
  }

  console.log("[flights] threads:", threads.length, "| batches:", threadBatches.length, "| raw:", rawFlights.length, "| after:", after);

  const flights = rawFlights
    .filter(f => f.flightNo || f.carrier)
    .map(f => {
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

  return res.json({ flights, threadsFound: threads.length, freshThreads: freshIds.size });
};
