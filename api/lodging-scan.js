// api/lodging-scan.js — Gmail hotel confirmation scraper + Claude parser
const { createClient } = require("@supabase/supabase-js");
const { gmailSearch, fetchBatched, extractBody, stripMarketingFooter, extractJson } = require("./lib/gmail");
const { ANTHROPIC_URL, ANTHROPIC_HEADERS, DEFAULT_MODEL } = require("./lib/anthropic");
const {
  hashBody, shouldUseCached,
  startScanRun, finishScanRun,
  getCachedThread, putCachedThread,
  logEnhancement, bumpStopReason,
} = require("./lib/scanMemory");

function extractHeaders(thread) {
  const last = thread.messages?.[thread.messages.length - 1];
  const headers = last?.payload?.headers || [];
  const get = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  const rawParts = (thread.messages || []).map(m => extractBody(m.payload)).filter(Boolean);
  const strippedParts = rawParts.map(stripMarketingFooter);
  const rawLen = rawParts.join("").length;
  const strippedLen = strippedParts.join("").length;
  const footerStripSaved = Math.max(0, rawLen - strippedLen);
  if (footerStripSaved) console.log(`[lodging] footer-strip tid=${thread.id}: saved ${footerStripSaved} chars`);
  const body = strippedParts.join("\n---\n").slice(0, 1400);
  const lastMsgMs = last?.internalDate ? Number(last.internalDate) : null;
  return { id: thread.id, subject: get("Subject"), from: get("From"), date: get("Date"), body, lastMsgMs, footerStripSaved };
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
    `subject:("hotel confirmation") ${W}`,
    `subject:("reservation confirmation") (hotel OR inn OR suite OR resort OR lodge) ${W}`,
    `subject:("booking confirmation") (hotel OR inn OR suite OR resort OR lodge OR airbnb OR vrbo) ${W}`,
    `subject:("check-in") (hotel OR inn OR suite OR resort OR reservation) ${W}`,
    `subject:("your stay") ${W}`,
    `subject:("room reservation") ${W}`,
    `"confirmation number" (hotel OR inn OR suite OR resort OR lodge OR check-in OR check-out) ${W}`,
    `"reservation number" (hotel OR inn OR suite OR resort OR check-in) ${W}`,
    `(check-in OR "check in") (check-out OR "check out") (hotel OR inn OR suite OR resort OR lodge) (confirmation OR booking OR reservation) ${W}`,
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
    `from:(airbnb.com) ${W}`,
    `from:(vrbo.com) ${W}`,
    `from:(homeaway.com) ${W}`,
    `from:(vacasa.com) ${W}`,
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
    sweepFrom = null,
  } = req.body || {};
  if (!googleToken) return res.status(400).json({ error: "Missing googleToken" });

  const after = sweepFrom ? gDate(sweepFrom) : nDaysAgo(14);
  const before = null;

  const { runId, startedAt } = await startScanRun({
    scanner: "lodging", userId: user.id,
    params: { sweepFrom, tourStart, tourEnd, after },
  });
  const stopReasons = {};
  const errors = [];

  const allQueries = buildLodgingQueries(after, before);
  const seen = new Set();
  const CAP = 50;

  try {
    const results = await Promise.allSettled(allQueries.map(q => gmailSearch(googleToken, q, 25)));
    for (const r of results) {
      if (r.status === "fulfilled") r.value.forEach(id => seen.add(id));
      else if (r.reason?.message?.includes("401")) throw Object.assign(new Error("gmail_401"), { status: 402 });
      else if (r.status === "rejected") errors.push({ kind: "gmail_query_failed", message: String(r.reason?.message || r.reason) });
    }
  } catch (e) {
    if (e.status === 402) {
      await finishScanRun(runId, { threadsFound: 0, errors: [...errors, { kind: "gmail_token_expired" }], startedAt });
      return res.status(402).json({ error: "gmail_token_expired" });
    }
    await finishScanRun(runId, { errors: [...errors, { kind: "fatal", message: e.message }], startedAt });
    return res.status(500).json({ error: e.message });
  }

  const ids = [...seen].slice(0, CAP);
  if (!ids.length) {
    await finishScanRun(runId, { threadsFound: 0, errors, startedAt });
    return res.json({ lodgings: [], threadsFound: 0, scanRunId: runId, threadsCached: 0, threadsParsed: 0 });
  }

  const threads = (await fetchBatched(googleToken, ids, 25)).map(extractHeaders);

  // Cache check.
  const cacheHits = [];
  const fresh = [];
  for (const t of threads) {
    const bodyHash = hashBody(t.subject, t.from, t.body);
    const cached = await getCachedThread("lodging", t.id);
    t.bodyHash = bodyHash;
    t.prevResult = cached?.result || null;
    if (shouldUseCached(cached, t.lastMsgMs, bodyHash, [])) {
      cacheHits.push(...(Array.isArray(cached.result) ? cached.result : []));
    } else {
      fresh.push(t);
    }
  }
  console.log(`[lodging-scan] runId=${runId} threads=${threads.length} cached=${threads.length - fresh.length} fresh=${fresh.length}`);

  let inputTokens = 0, outputTokens = 0;
  let claudeLodgings = [];
  if (fresh.length) {
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

${fresh.map((t, i) => `[${i}] tid:${t.id}
Subject: ${t.subject}
From: ${t.from}
Date: ${t.date}
Body: ${t.body}`).join("\n\n---\n\n")}

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

    const anthropicResp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: ANTHROPIC_HEADERS,
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 8192,
        system: [{ type: "text", text: sysPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicResp.ok) {
      const err = await anthropicResp.text();
      errors.push({ kind: "anthropic_error", status: anthropicResp.status, detail: err.slice(0, 500) });
      await finishScanRun(runId, { threadsFound: threads.length, threadsCached: cacheHits.length, threadsParsed: 0, errors, stopReasons, startedAt });
      return res.status(502).json({ error: `Anthropic error: ${anthropicResp.status}`, detail: err });
    }

    const anthropicData = await anthropicResp.json();
    inputTokens = anthropicData.usage?.input_tokens || 0;
    outputTokens = anthropicData.usage?.output_tokens || 0;
    bumpStopReason(stopReasons, anthropicData.stop_reason);
    const textContent = (anthropicData.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    console.log(`[lodging-scan] stop_reason=${anthropicData.stop_reason} fresh=${fresh.length} in=${inputTokens} out=${outputTokens}`);

    const parsed = extractJson(textContent);
    claudeLodgings = Array.isArray(parsed?.lodgings) ? parsed.lodgings : [];

    // Cache results per-thread + log enhancements.
    const byTid = {};
    for (const h of claudeLodgings) {
      (byTid[h.tid] ||= []).push(h);
    }
    for (const t of fresh) {
      const result = byTid[t.id] || [];
      await putCachedThread("lodging", t.id, {
        lastMsgMs: t.lastMsgMs,
        bodyHash: t.bodyHash,
        result,
        stopReason: anthropicData.stop_reason,
        footerStripSaved: t.footerStripSaved,
        attachmentFingerprints: [],
      });
      // Enhancement log vs previous cached result.
      if (Array.isArray(t.prevResult) && t.prevResult.length) {
        const prevById = Object.fromEntries(t.prevResult.map(r => [`${t.id}:${r.confirmNo || r.name}`, r]));
        for (const h of result) {
          const key = `${t.id}:${h.confirmNo || h.name}`;
          const prev = prevById[key];
          if (prev) await logEnhancement("lodging", key, prev, h, { scanRunId: runId, source: "lodging-scan", scanner: "lodging", userId: user.id, userEmail: user.email });
        }
      }
    }
  }

  const rawLodgings = [...cacheHits, ...claudeLodgings];

  const lodgings = rawLodgings
    .filter(h => h.name && h.checkIn && h.checkOut)
    .map(h => ({
      ...h,
      id: `hotel_${(h.tid || "").slice(-6)}_${(h.confirmNo || Math.random().toString(36).slice(2, 6)).replace(/\s/g, "").slice(0, 8)}`,
      status: "pending",
      rooms: [],
      todos: [],
    }));

  await finishScanRun(runId, {
    threadsFound: threads.length,
    threadsCached: threads.length - fresh.length,
    threadsParsed: fresh.length,
    attachmentsScanned: 0,
    inputTokens, outputTokens,
    stopReasons, errors,
    startedAt,
  });

  return res.json({
    lodgings,
    threadsFound: threads.length,
    scanRunId: runId,
    threadsCached: threads.length - fresh.length,
    threadsParsed: fresh.length,
    tokensUsed: inputTokens + outputTokens,
  });
};
