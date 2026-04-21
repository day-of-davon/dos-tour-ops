// api/flights.js — Gmail flight confirmation scraper + Claude parser
const { createClient } = require("@supabase/supabase-js");

// ── Gmail helpers ────────────────────────────────────────────────────────────
async function gmailSearch(token, query, max = 20) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/threads");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", max);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Gmail ${r.status}: ${await r.text()}`);
  return ((await r.json()).threads || []).map(t => t.id);
}

async function gmailGetThread(token, id) {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) return null;
  return r.json();
}

// Batch thread fetches to avoid Gmail 429s (10 at a time, 150ms pause between batches)
async function fetchBatched(token, ids, batchSize = 15) {
  const out = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = await Promise.all(ids.slice(i, i + batchSize).map(id => gmailGetThread(token, id)));
    out.push(...batch.filter(Boolean));
    if (i + batchSize < ids.length) await new Promise(r => setTimeout(r, 80));
  }
  return out;
}

function decodeB64(s) {
  try { return Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"); }
  catch { return ""; }
}

function extractBody(payload) {
  if (!payload) return "";
  const parts = [payload];
  let text = "", html = "";
  while (parts.length) {
    const p = parts.shift();
    if (p.parts) parts.push(...p.parts);
    const data = p.body?.data;
    if (!data) continue;
    if (p.mimeType === "text/plain") text += decodeB64(data) + "\n";
    else if (p.mimeType === "text/html" && !text) html += decodeB64(data) + "\n";
  }
  const out = text || html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return out.replace(/\s+/g, " ").trim();
}

function extractHeaders(thread) {
  const last = thread.messages?.[thread.messages.length - 1];
  const headers = last?.payload?.headers || [];
  const get = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  const body = (thread.messages || [])
    .map(m => extractBody(m.payload))
    .filter(Boolean)
    .join("\n---\n")
    .slice(0, 2200);
  return { id: thread.id, subject: get("Subject"), from: get("From"), date: get("Date"), body };
}

function extractJson(text) {
  try { return JSON.parse(text.trim()); } catch {}
  const fenced = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(fenced); } catch {}
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") { if (start === -1) start = i; depth++; }
    else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) { try { return JSON.parse(text.slice(start, i + 1)); } catch {} start = -1; }
    }
  }
  return null;
}

// ── Query builders ───────────────────────────────────────────────────────────
function w(after, before) {
  return before ? `after:${after} before:${before}` : `after:${after}`;
}

// Convert YYYY-MM-DD to YYYY/MM/DD for Gmail
function gDate(d) { return d.replace(/-/g, "/"); }

function nDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return gDate(d.toISOString().slice(0, 10));
}

function buildFlightQueries(after, before) {
  const W = w(after, before);
  return [
    // ── Broad flight sweeps ────────────────────────────────────────────────
    `subject:("flight confirmation") ${W}`,
    `subject:("e-ticket") (flight OR airline OR airways) ${W}`,
    `subject:("itinerary") (flight OR airline OR departure) ${W}`,
    `subject:("boarding pass") ${W}`,
    `subject:("booking confirmation") (flight OR airline OR airways) ${W}`,
    `subject:("your flight") ${W}`,
    `"booking reference" (flight OR departure OR arrival) ${W}`,
    `"confirmation code" (flight OR airline OR departure) ${W}`,

    // ── US Major carriers ──────────────────────────────────────────────────
    `from:(DeltaAirLines@t.delta.com) ${W}`,
    `from:(noreply@delta.com) ${W}`,
    `from:(noreply@aa.com) ${W}`,
    `from:(confirmations@aa.com) ${W}`,
    `from:(noreply@united.com) ${W}`,
    `from:(Southwest@luv.southwest.com) ${W}`,
    `from:(SouthwestAirlines@luv.southwest.com) ${W}`,
    `from:(noreply@alaskaair.com) ${W}`,
    `from:(reservations@alaskaair.com) ${W}`,
    `from:(noreply@jetblue.com) ${W}`,
    `from:(noreply@spirit.com) ${W}`,
    `from:(noreply@flyfrontier.com) ${W}`,
    `from:(noreply@allegiantair.com) ${W}`,
    `from:(noreply@hawaiianairlines.com) ${W}`,
    `from:(SkyWest@luv.southwest.com) ${W}`,

    // ── Canada ────────────────────────────────────────────────────────────
    `from:(noreply@aircanada.com) ${W}`,
    `from:(noreply@westjet.com) ${W}`,
    `from:(noreply@flyporter.com) ${W}`,

    // ── European full-service ──────────────────────────────────────────────
    `from:(noreply@ba.com) ${W}`,
    `from:(customerrelations@ba.com) ${W}`,
    `from:(do_not_reply@ba.com) ${W}`,
    `from:(noreply@lufthansa.com) ${W}`,
    `from:(noreply@miles-and-more.com) ${W}`,
    `from:(noreply@airfrance.fr) ${W}`,
    `from:(noreply@airfrance.com) ${W}`,
    `from:(donotreply@klm.com) ${W}`,
    `from:(booking@klm.com) ${W}`,
    `from:(noreply@iberia.com) ${W}`,
    `from:(noreply@swiss.com) ${W}`,
    `from:(noreply@austrian.com) ${W}`,
    `from:(noreply@brusselsairlines.com) ${W}`,
    `from:(noreply@finnair.com) ${W}`,
    `from:(noreply@flysas.com) ${W}`,
    `from:(noreply@sas.se) ${W}`,
    `from:(noreply@tap.pt) ${W}`,
    `from:(noreply@turkishairlines.com) ${W}`,
    `from:(thy@thy.com) ${W}`,
    `from:(noreply@aerlingus.com) ${W}`,
    `from:(noreply@lot.com) ${W}`,
    `from:(noreply@croatiaairlines.hr) ${W}`,
    `from:(info@airserbia.com) ${W}`,

    // ── European LCCs ─────────────────────────────────────────────────────
    `from:(noreply@ryanair.com) ${W}`,
    `from:(no-reply@easyjet.com) ${W}`,
    `from:(noreply@wizzair.com) ${W}`,
    `from:(booking@norwegian.com) ${W}`,
    `from:(no-reply@norwegian.com) ${W}`,
    `from:(noreply@vueling.com) ${W}`,
    `from:(noreply@transavia.com) ${W}`,
    `from:(bookings@jet2.com) ${W}`,
    `from:(noreply@flybe.com) ${W}`,
    `from:(noreply@volotea.com) ${W}`,

    // ── Middle East / Gulf ─────────────────────────────────────────────────
    `from:(emirates@emails.emirates.com) ${W}`,
    `from:(noreply@emirates.com) ${W}`,
    `from:(etihad@etihad.com) ${W}`,
    `from:(noreply@etihad.com) ${W}`,
    `from:(noreply@qatarairways.com) ${W}`,
    `from:(noreply@flydubai.com) ${W}`,
    `from:(noreply@airarabia.com) ${W}`,

    // ── Asia Pacific ──────────────────────────────────────────────────────
    `from:(noreply@singaporeair.com) ${W}`,
    `from:(noreply@cathaypacific.com) ${W}`,
    `from:(jmb@ml.jal.co.jp) ${W}`,
    `from:(info@ana.co.jp) ${W}`,
    `from:(noreply@koreanair.com) ${W}`,
    `from:(noreply@qantas.com.au) ${W}`,
    `from:(noreply@airnewzealand.co.nz) ${W}`,
    `from:(noreply@airasia.com) ${W}`,
    `from:(noreply@scoot.com) ${W}`,

    // ── Latin America ─────────────────────────────────────────────────────
    `from:(noreply@latam.com) ${W}`,
    `from:(noreply@avianca.com) ${W}`,
    `from:(noreply@copaair.com) ${W}`,

    // ── Private charters & fractional ─────────────────────────────────────
    `from:(netjets.com) ${W}`,
    `from:(vistajet.com) ${W}`,
    `from:(wheelsup.com) ${W}`,
    `from:(flyexclusive.com) ${W}`,
    `from:(surfair.com) ${W}`,
    `from:(jsx.com) ${W}`,
    `from:(privatefly.com) ${W}`,
    `"netjets" (confirmation OR booking OR flight OR itinerary) ${W}`,
    `"vistajet" (confirmation OR booking OR flight OR itinerary) ${W}`,
    `"wheels up" (confirmation OR booking OR flight OR itinerary) ${W}`,
    `("private jet" OR "charter flight" OR "private charter") (confirmation OR itinerary OR booking) ${W}`,

    // ── OTA flight bookings ───────────────────────────────────────────────
    `from:(expedia.com) (flight OR airline OR itinerary) ${W}`,
    `from:(kayak.com) (flight OR itinerary) ${W}`,
    `from:(google.com) subject:(trip) (flight OR itinerary) ${W}`,
    `from:(travelport.com) (flight OR itinerary) ${W}`,
    `from:(concur.com) (flight OR airline OR itinerary) ${W}`,
    `from:(noreply@booking.com) (flight OR airline) ${W}`,
  ];
}

// ── Per-carrier focus queries (extra depth for priority carriers) ────────────
const FOCUS_QUERIES = {
  delta: [
    `from:(DeltaAirLines@t.delta.com)`,
    `from:(noreply@delta.com)`,
    `"delta air lines" (confirmation OR itinerary OR "e-ticket" OR "boarding pass")`,
    `subject:(delta) (flight OR confirmation OR itinerary)`,
  ],
  american: [
    `from:(noreply@aa.com)`,
    `from:(confirmations@aa.com)`,
    `"american airlines" (confirmation OR itinerary OR "e-ticket" OR "boarding pass")`,
    `subject:("american airlines") (flight OR confirmation OR itinerary)`,
  ],
  united: [
    `from:(noreply@united.com)`,
    `"united airlines" (confirmation OR itinerary OR "e-ticket" OR "boarding pass")`,
    `subject:(united) (flight OR confirmation OR itinerary)`,
  ],
  "air canada": [
    `from:(noreply@aircanada.com)`,
    `"air canada" (confirmation OR itinerary OR "e-ticket" OR "boarding pass")`,
    `subject:("air canada") (flight OR confirmation OR itinerary)`,
  ],
};

// Day-offset show matching: outbound departs day after show, inbound arrives same day or day before
function matchFlightToShow(flight, shows) {
  if (!Array.isArray(shows) || !shows.length) return null;
  const depDate = flight.depDate; // YYYY-MM-DD
  const arrDate = flight.arrDate || flight.depDate;
  let best = null;
  for (const s of shows) {
    const sd = s.date; // YYYY-MM-DD
    if (!sd) continue;
    // Outbound: flight departs the day after show
    if (depDate === addDays(sd, 1)) return { showDate: sd, role: "outbound", showId: s.id || sd, venue: s.venue };
    // Inbound: flight arrives same day or day before show
    if (arrDate === sd || arrDate === addDays(sd, -1)) {
      best = { showDate: sd, role: "inbound", showId: s.id || sd, venue: s.venue };
    }
  }
  return best;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

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
    focus = [],
    sweepFrom = null,   // "2026-01-01" triggers historical mode
    shows = [],
  } = req.body || {};
  if (!googleToken) return res.status(400).json({ error: "Missing googleToken" });

  const after = sweepFrom ? gDate(sweepFrom) : nDaysAgo(90);
  const before = null; // open-ended

  // Focus carriers — high-cap queries run first
  const focusQueries = focus.flatMap(k => {
    const base = FOCUS_QUERIES[String(k).toLowerCase()] || [];
    return base.map(q => `${q} after:${after}`);
  });

  // Broad + carrier queries anchored to after date
  const allCarrierQueries = buildFlightQueries(after, before);

  // Collect thread IDs — focus first, then broad carrier sweep
  const seen = new Set();

  async function runQueries(queries, cap = 25, parallelism = 6) {
    for (let i = 0; i < queries.length; i += parallelism) {
      await Promise.all(queries.slice(i, i + parallelism).map(async q => {
        try {
          const ids = await gmailSearch(googleToken, q, cap);
          ids.forEach(id => seen.add(id));
        } catch (e) {
          console.error("[flights] search error:", e.message);
          if (e.message.includes("401")) throw Object.assign(new Error("gmail_401"), { status: 402 });
        }
      }));
    }
  }

  try {
    await runQueries(focusQueries, 30, 6);
    await runQueries(allCarrierQueries, 20, 6);
  } catch (e) {
    if (e.status === 402) return res.status(402).json({ error: "gmail_token_expired" });
    return res.status(500).json({ error: e.message });
  }

  const ids = [...seen].slice(0, 40);
  if (!ids.length) return res.json({ flights: [], threadsFound: 0 });

  let threads, freshIds;
  try {
    threads = (await fetchBatched(googleToken, ids)).map(extractHeaders);
    const cutoff48h = Date.now() - 48 * 3600 * 1000;
    freshIds = new Set(threads.filter(t => {
      const ms = t.date ? new Date(t.date).getTime() : NaN;
      return !isNaN(ms) && ms >= cutoff48h;
    }).map(t => t.id));
  } catch (e) {
    console.error("[flights] thread fetch error:", e.message);
    return res.status(500).json({ error: `Thread fetch failed: ${e.message}` });
  }

  const sysPrompt = `You are a flight itinerary parser for concert touring operations. Extract structured flight segment data from email bodies.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.
Rules:
- Each object in flights[] represents one flight leg (not a round trip — split into two objects)
- Dates: YYYY-MM-DD format
- Times: HH:MM 24-hour format. Convert "6:30 AM" → "06:30", "10:15 PM" → "22:15"
- IATA codes preferred (3 uppercase letters). If not available, use the city name
- cost: number only, no currency symbol. null if not found
- pax: array of passenger full names as strings. Empty array if not found
- Include private charter and fractional jet flights (NetJets, VistaJet, Wheels Up, etc.)
- Skip hotel, train, or rental car confirmations — flights only`;

  const userPrompt = `Extract all flight segments from these email threads. Tour date range: ${tourStart} to ${tourEnd}.

${threads.map((t, i) => `[${i}] tid:${t.id}
Subject: ${t.subject}
From: ${t.from}
Date: ${t.date}
Body: ${t.body.slice(0, 800)}`).join("\n\n---\n\n")}

Return this exact JSON:
{
  "flights": [
    {
      "flightNo": "FR1234",
      "carrier": "Ryanair",
      "from": "DUB",
      "fromCity": "Dublin",
      "to": "AMS",
      "toCity": "Amsterdam",
      "depDate": "2026-05-04",
      "dep": "06:30",
      "arrDate": "2026-05-04",
      "arr": "09:45",
      "pax": ["Davon Johnson"],
      "confirmNo": "ABC123",
      "bookingRef": "XYZ789",
      "cost": 245.00,
      "currency": "GBP",
      "tid": "<thread_id_from_above>"
    }
  ]
}`;

  let anthropicData;
  try {
    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: sysPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!anthropicResp.ok) {
      const err = await anthropicResp.text();
      return res.status(502).json({ error: `Anthropic error: ${anthropicResp.status}`, detail: err });
    }
    anthropicData = await anthropicResp.json();
  } catch (e) {
    console.error("[flights] anthropic error:", e.message);
    return res.status(502).json({ error: `Anthropic request failed: ${e.message}` });
  }

  const textContent = (anthropicData.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  console.log("[flights] stop_reason:", anthropicData.stop_reason, "| threads:", threads.length, "| sweep:", sweepFrom || "14d");

  const parsed = extractJson(textContent);
  const rawFlights = Array.isArray(parsed?.flights) ? parsed.flights : [];

  const flights = rawFlights
    .filter(f => f.flightNo || f.carrier)
    .map(f => {
      const fromFresh = freshIds.has(f.tid);
      const showMatch = matchFlightToShow(f, shows);
      return {
        ...f,
        id: `fl_${(f.tid || "").slice(-6)}_${(f.flightNo || "").replace(/\s/g, "") || Math.random().toString(36).slice(2, 6)}`,
        status: "pending",
        fresh48h: fromFresh || undefined,
        suggestedShowDate: showMatch?.showDate || null,
        suggestedRole: showMatch?.role || null,
        suggestedVenue: showMatch?.venue || null,
      };
    });

  return res.json({
    flights,
    threadsFound: threads.length,
    freshThreads: freshIds.size,
  });
};
