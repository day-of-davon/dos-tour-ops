// api/lodging-scan.js — Gmail hotel confirmation scraper + Claude parser
const { createClient } = require("@supabase/supabase-js");
const { gmailSearch, gmailGetThread, fetchBatched, extractBody, extractJson } = require("./lib/gmail");

function extractHeaders(thread) {
  const last = thread.messages?.[thread.messages.length - 1];
  const headers = last?.payload?.headers || [];
  const get = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  const body = (thread.messages || [])
    .map(m => extractBody(m.payload))
    .filter(Boolean)
    .join("\n---\n")
    .slice(0, 2000);
  return { id: thread.id, subject: get("Subject"), from: get("From"), date: get("Date"), body };
}

// ── Query builders ───────────────────────────────────────────────────────────
function w(after, before) {
  return before ? `after:${after} before:${before}` : `after:${after}`;
}

function gDate(d) { return d.replace(/-/g, "/"); }

function nDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return gDate(d.toISOString().slice(0, 10));
}

function buildLodgingQueries(after, before) {
  const W = w(after, before);
  return [
    // ── Broad hotel sweeps ─────────────────────────────────────────────────
    `subject:("hotel confirmation") ${W}`,
    `subject:("reservation confirmation") (hotel OR inn OR suite OR resort OR lodge) ${W}`,
    `subject:("booking confirmation") (hotel OR inn OR suite OR resort OR lodge OR airbnb OR vrbo) ${W}`,
    `subject:("check-in") (hotel OR inn OR suite OR resort OR reservation) ${W}`,
    `subject:("your stay") ${W}`,
    `subject:("room reservation") ${W}`,
    `"confirmation number" (hotel OR inn OR suite OR resort OR lodge OR check-in OR check-out) ${W}`,
    `"reservation number" (hotel OR inn OR suite OR resort OR check-in) ${W}`,
    `(check-in OR "check in") (check-out OR "check out") (hotel OR inn OR suite OR resort OR lodge) (confirmation OR booking OR reservation) ${W}`,

    // ── Global hotel chains ────────────────────────────────────────────────
    `from:(marriott.com) ${W}`,
    `from:(starwoodhotels.com) ${W}`,
    `from:(spg.com) ${W}`,
    `from:(hilton.com) ${W}`,
    `from:(conradhotels.com) ${W}`,
    `from:(waldorfastoria.com) ${W}`,
    `from:(doubletree.com) ${W}`,
    `from:(hamptoninn.com) ${W}`,
    `from:(curio.hilton.com) ${W}`,
    `from:(hyatt.com) ${W}`,
    `from:(andaz.com) ${W}`,
    `from:(parkhotelgroup.com) ${W}`,
    `from:(ihg.com) ${W}`,
    `from:(intercontinental.com) ${W}`,
    `from:(holidayinn.com) ${W}`,
    `from:(crowneplaza.com) ${W}`,
    `from:(kimptonhotels.com) ${W}`,
    `from:(bestwestern.com) ${W}`,
    `from:(wyndhamhotels.com) ${W}`,
    `from:(radissonhotels.com) ${W}`,
    `from:(choicehotels.com) ${W}`,
    `from:(accor.com) ${W}`,
    `from:(novotel.com) ${W}`,
    `from:(sofitel.com) ${W}`,
    `from:(ibis.com) ${W}`,
    `from:(mgmresorts.com) ${W}`,
    `from:(caesars.com) ${W}`,
    `from:(fourseasons.com) ${W}`,
    `from:(ritzcarton.com) ${W}`,
    `from:(sbe.com) ${W}`,

    // ── European hotel groups ──────────────────────────────────────────────
    `from:(nhhotel.com) ${W}`,
    `from:(nh-hotels.com) ${W}`,
    `from:(melia.com) ${W}`,
    `from:(meliá.com) ${W}`,
    `from:(barcelo.com) ${W}`,
    `from:(room-mate.com) ${W}`,
    `from:(citizenm.com) ${W}`,
    `from:(designhotels.com) ${W}`,
    `from:(suitepads.com) ${W}`,
    `from:(valkhotels.com) ${W}`,
    `from:(motelone.com) ${W}`,
    `from:(ahotels.com) ${W}`,
    `from:(vicohotels.com) ${W}`,
    `from:(campanile.com) ${W}`,
    `from:(premierinn.com) ${W}`,
    `from:(travelodge.co.uk) ${W}`,

    // ── OTA hotel bookings ─────────────────────────────────────────────────
    `from:(booking.com) (reservation OR confirmation OR check-in) ${W}`,
    `from:(expedia.com) (hotel OR inn OR suite OR resort OR lodge OR reservation) ${W}`,
    `from:(hotels.com) ${W}`,
    `from:(priceline.com) (hotel OR reservation OR confirmation) ${W}`,
    `from:(hotwire.com) (hotel OR reservation) ${W}`,
    `from:(tripadvisor.com) (hotel OR reservation OR confirmation) ${W}`,
    `from:(agoda.com) (hotel OR reservation OR confirmation) ${W}`,
    `from:(hostelworld.com) ${W}`,
    `from:(kayak.com) (hotel OR reservation) ${W}`,
    `from:(google.com) subject:(trip) (hotel OR lodging OR accommodation) ${W}`,
    `from:(concur.com) (hotel OR lodging OR accommodation) ${W}`,
    `from:(netsuite.com) (hotel OR lodging OR accommodation) ${W}`,

    // ── Short-term rental ──────────────────────────────────────────────────
    `from:(airbnb.com) ${W}`,
    `from:(vrbo.com) ${W}`,
    `from:(homeaway.com) ${W}`,
    `from:(vacasa.com) ${W}`,

    // ── Tour-industry room blocks ──────────────────────────────────────────
    `"room block" (confirmation OR booking OR reservation) ${W}`,
    `"room list" (hotel OR confirmation OR reservation) ${W}`,
    `"group reservation" (hotel OR inn OR resort OR lodge) ${W}`,
    `"tour accommodation" OR "band hotel" OR "crew hotel" (confirmation OR booking) ${W}`,
    `"promoter accommodation" OR "artist accommodation" (hotel OR inn OR confirmation) ${W}`,
  ];
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
    sweepFrom = null,   // "2026-01-01" triggers historical mode
  } = req.body || {};
  if (!googleToken) return res.status(400).json({ error: "Missing googleToken" });

  const after = sweepFrom ? gDate(sweepFrom) : nDaysAgo(14);
  const before = null;

  const allQueries = buildLodgingQueries(after, before);

  const seen = new Set();

  async function runQueries(queries, cap = 25) {
    for (const q of queries) {
      try {
        const ids = await gmailSearch(googleToken, q, cap);
        ids.forEach(id => seen.add(id));
      } catch (e) {
        console.error("[lodging-scan] search error:", e.message);
        if (e.message.includes("401")) throw Object.assign(new Error("gmail_401"), { status: 402 });
      }
    }
  }

  try {
    await runQueries(allQueries, 25);
  } catch (e) {
    if (e.status === 402) return res.status(402).json({ error: "gmail_token_expired" });
    return res.status(500).json({ error: e.message });
  }

  const ids = [...seen].slice(0, 100);
  if (!ids.length) return res.json({ lodgings: [], threadsFound: 0 });

  const threads = (await fetchBatched(googleToken, ids)).map(extractHeaders);

  const sysPrompt = `You are a hotel/accommodation confirmation parser for concert touring operations. Extract structured lodging data from email bodies.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.
Rules:
- Each object in lodgings[] represents one distinct hotel/property stay (not per-room)
- Dates: YYYY-MM-DD format
- Times: HH:MM 24-hour format
- cost: total cost as number only, no currency symbol. null if not found
- pax: array of guest full names. Empty array if not found
- Skip flight, car rental, or non-accommodation confirmations`;

  const userPrompt = `Extract all hotel/accommodation reservations from these email threads. Tour date range: ${tourStart} to ${tourEnd}.

${threads.map((t, i) => `[${i}] tid:${t.id}
Subject: ${t.subject}
From: ${t.from}
Date: ${t.date}
Body: ${t.body.slice(0, 1400)}`).join("\n\n---\n\n")}

Return this exact JSON:
{
  "lodgings": [
    {
      "name": "Hotel Name",
      "address": "123 Main St",
      "city": "Amsterdam",
      "phone": "+31 20 123 4567",
      "checkIn": "2026-05-04",
      "checkOut": "2026-05-06",
      "checkInTime": "15:00",
      "checkOutTime": "12:00",
      "confirmNo": "ABC123456",
      "bookingRef": "XYZ789",
      "cost": 420.00,
      "currency": "EUR",
      "pax": ["Davon Johnson"],
      "stars": 4,
      "notes": "Non-smoking, king bed requested",
      "tid": "<thread_id_from_above>"
    }
  ]
}`;

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

  const anthropicData = await anthropicResp.json();
  const textContent = (anthropicData.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  console.log("[lodging-scan] stop_reason:", anthropicData.stop_reason, "| threads:", threads.length, "| sweep:", sweepFrom || "14d");

  const parsed = extractJson(textContent);
  const rawLodgings = Array.isArray(parsed?.lodgings) ? parsed.lodgings : [];

  const lodgings = rawLodgings
    .filter(h => h.name && h.checkIn && h.checkOut)
    .map(h => ({
      ...h,
      id: `hotel_${(h.tid || "").slice(-6)}_${(h.confirmNo || Math.random().toString(36).slice(2, 6)).replace(/\s/g, "").slice(0, 8)}`,
      status: "pending",
      rooms: [],
      todos: [],
    }));

  return res.json({ lodgings, threadsFound: threads.length });
};
