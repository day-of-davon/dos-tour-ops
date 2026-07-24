// api/flight-status.js — Vercel serverless: AeroDataBox live flight status
const { authenticate } = require("./lib/auth");

const AERODATABOX_KEY = process.env.AERODATABOX_API_KEY;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — don't hammer the API

// In-memory cache per serverless instance (best-effort; not shared across instances)
const cache = {};

async function fetchFlightStatus(flightNo, depDate) {
  const cacheKey = `${flightNo}__${depDate}`;
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  // AeroDataBox: GET /v2/flights/{flightNumber}/{depDate}
  // depDate format: YYYY-MM-DD
  const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNo)}/${depDate}`;
  const resp = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": AERODATABOX_KEY,
      "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
    },
  });

  if (resp.status === 404) return null; // flight not found
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`AeroDataBox ${resp.status}: ${txt.slice(0, 200)}`);
  }

  const raw = await resp.json();
  // API returns an array of matching flights (handles codeshares)
  const flights = Array.isArray(raw) ? raw : [raw];
  if (!flights.length) return null;

  const f = flights[0];
  const dep = f.departure || {};
  const arr = f.arrival || {};

  const data = {
    flightNo,
    depDate,
    status: f.status || "unknown",            // Landed / Departed / Scheduled / Cancelled / Delayed
    depActual: dep.actualTimeLocal?.slice(11, 16) || dep.revisedTimeLocal?.slice(11, 16) || null,
    depScheduled: dep.scheduledTimeLocal?.slice(11, 16) || null,
    depGate: dep.gate || null,
    depTerminal: dep.terminal || null,
    depAirport: dep.airport?.iata || null,
    arrActual: arr.actualTimeLocal?.slice(11, 16) || arr.revisedTimeLocal?.slice(11, 16) || null,
    arrScheduled: arr.scheduledTimeLocal?.slice(11, 16) || null,
    arrGate: arr.gate || null,
    arrTerminal: arr.terminal || null,
    arrAirport: arr.airport?.iata || null,
    delayMinutes: dep.delay ?? arr.delay ?? null,
    aircraft: f.aircraft?.model || null,
    fetchedAt: new Date().toISOString(),
  };

  cache[cacheKey] = { at: Date.now(), data };
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user, error: authErr } = await authenticate(req);
  if (authErr) return res.status(authErr.status).json({ error: authErr.message });

  if (!AERODATABOX_KEY) return res.status(503).json({ error: "Flight status API not configured" });

  // Accept either a single flight or a batch
  const { flightNo, depDate, flights } = req.body || {};

  if (flights && Array.isArray(flights)) {
    // Batch: [{ flightNo, depDate }, ...]
    const results = await Promise.allSettled(
      flights.map(({ flightNo: fn, depDate: dd }) => fetchFlightStatus(fn, dd))
    );
    const statuses = {};
    flights.forEach(({ flightNo: fn, depDate: dd }, i) => {
      const r = results[i];
      statuses[`${fn}__${dd}`] = r.status === "fulfilled" ? r.value : { error: r.reason?.message };
    });
    return res.json({ statuses });
  }

  if (!flightNo || !depDate) return res.status(400).json({ error: "Missing flightNo or depDate" });

  try {
    const status = await fetchFlightStatus(flightNo, depDate);
    if (!status) return res.json({ status: null, notFound: true });
    return res.json({ status });
  } catch (e) {
    console.error("[flight-status] error:", e.message);
    return res.status(502).json({ error: e.message });
  }
};
