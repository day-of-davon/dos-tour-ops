// api/flights.js — Vercel serverless: Gmail flight confirmation scrape + Claude parse
const { createClient } = require("@supabase/supabase-js");

async function gmailSearch(token, query, max = 12) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/threads");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", max);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Gmail ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return (d.threads || []).map(t => t.id);
}

async function gmailGetThread(token, id) {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) return null;
  return r.json();
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

  const { googleToken, tourStart = "2026-04-01", tourEnd = "2026-06-30" } = req.body || {};
  if (!googleToken) return res.status(400).json({ error: "Missing googleToken" });

  const queries = [
    `subject:(flight confirmation) newer_than:365d`,
    `subject:(e-ticket) newer_than:365d`,
    `subject:(itinerary) (flight OR airline OR airways) newer_than:365d`,
    `subject:(booking confirmation) (flight OR airline OR airways) newer_than:365d`,
    `subject:(travel confirmation) (flight OR airline) newer_than:365d`,
    `from:(noreply@ryanair.com) newer_than:365d`,
    `from:(no-reply@easyjet.com) newer_than:365d`,
    `from:(donotreply@klm.com) OR from:(booking@klm.com) newer_than:365d`,
    `from:(noreply@lufthansa.com) newer_than:365d`,
    `from:(noreply@aerlingus.com) newer_than:365d`,
    `from:(noreply@ba.com) OR from:(customerrelations@ba.com) newer_than:365d`,
    `from:(noreply@united.com) newer_than:365d`,
    `from:(DeltaAirLines@t.delta.com) newer_than:365d`,
    `"booking reference" (flight OR departure OR arrival) newer_than:365d`,
    `subject:(your flight) (confirmation OR booking OR itinerary) newer_than:365d`,
  ];

  const seenIds = new Set();
  for (const q of queries) {
    try {
      const ids = await gmailSearch(googleToken, q, 20);
      ids.forEach(id => seenIds.add(id));
    } catch (e) {
      console.error("[flights] search error:", e.message);
      if (e.message.includes("401")) return res.status(402).json({ error: "gmail_token_expired" });
    }
  }

  const ids = [...seenIds].slice(0, 40);
  if (!ids.length) return res.json({ flights: [], threadsFound: 0 });

  const threads = (await Promise.all(ids.map(id => gmailGetThread(googleToken, id))))
    .filter(Boolean)
    .map(extractHeaders);

  const sysPrompt = `You are a flight itinerary parser for concert touring operations. Extract structured flight segment data from email bodies.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.
Rules:
- Each object in flights[] represents one flight leg (not a round trip — split into two objects)
- Dates: YYYY-MM-DD format
- Times: HH:MM 24-hour format. Convert "6:30 AM" → "06:30", "10:15 PM" → "22:15"
- IATA codes preferred (3 uppercase letters). If not available, use the city name
- cost: number only, no currency symbol. null if not found
- pax: array of passenger full names as strings. Empty array if not found
- Skip hotel, train, or rental car confirmations — flights only`;

  const userPrompt = `Extract all flight segments from these email threads. Tour date range: ${tourStart} to ${tourEnd}.

${threads.map((t, i) => `[${i}] tid:${t.id}
Subject: ${t.subject}
From: ${t.from}
Date: ${t.date}
Body: ${t.body.slice(0, 1400)}`).join("\n\n---\n\n")}

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
  console.log("[flights] stop_reason:", anthropicData.stop_reason, "| text len:", textContent.length);

  const parsed = extractJson(textContent);
  const rawFlights = Array.isArray(parsed?.flights) ? parsed.flights : [];

  const flights = rawFlights
    .filter(f => f.flightNo || f.carrier)
    .map(f => ({
      ...f,
      id: `fl_${(f.tid || "").slice(-6)}_${(f.flightNo || "").replace(/\s/g, "") || Math.random().toString(36).slice(2, 6)}`,
      status: "pending",
    }));

  return res.json({ flights, threadsFound: threads.length });
};
