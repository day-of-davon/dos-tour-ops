// api/rideshare-scan.js — Gmail rideshare/ground-transport receipt scraper + Claude parser.
// Mirrors lodging-scan.js: query sweep → thread cache → text batch + per-thread PDF →
// validate → scan_runs telemetry. Returns { rides: [...] } ready for the Finance ledger.
const { withTimeout } = require("./lib/utils");
const { authenticate } = require("./lib/auth");
const { gmailSearch, fetchBatched, extractBody, stripMarketingFooter, extractJson } = require("./lib/gmail");
const { postMessages } = require("./lib/anthropic");
const {
  hashBody, shouldUseCached,
  startScanRun, finishScanRun,
  getCachedThread, putCachedThread,
  bumpStopReason,
} = require("./lib/scanMemory");
const {
  collectThreadAttachments, dedupFolios,
  fetchAttachmentB64, attachmentFingerprint,
  emlAttachmentsFor, fetchEmlTexts,
} = require("./lib/attachments");
const { buildTourContextBlock } = require("./lib/tourContext");

// PDF attachment caps (chauffeur/car-service invoices arrive as PDFs).
const PDF_MAX_PER_THREAD = 2;
const PDF_MAX_PER_SCAN   = 12;
const PDF_MAX_BYTES      = 5 * 1024 * 1024;

// Forwarded-email (.eml) per-scan fetch cap. Bundle emails attach many receipts;
// each is parsed individually so the cap is generous.
const EML_MAX_PER_SCAN = 30;
const EML_PARSE_CHUNK  = 4;

// Drop food-delivery, promos, and account noise that share the rideshare senders.
const RIDESHARE_DROP = /uber\s*eats|eats\s*order|food\s*order|grubhub|doordash|% off|promo|discount|credits?\b|rate your|how was your trip\?|sign\s*up|invite|referr|newsletter|survey|receipt is ready to rate|update your|password|security/i;

function extractHeaders(thread) {
  const last = thread.messages?.[thread.messages.length - 1];
  const headers = last?.payload?.headers || [];
  const get = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  const rawParts = (thread.messages || []).map(m => extractBody(m.payload)).filter(Boolean);
  const strippedParts = rawParts.map(stripMarketingFooter);
  // 4000-char cap — ride receipts are short; fare breakdown sits near the top.
  const body = strippedParts.join("\n---\n").slice(0, 4000);
  const lastMsgMs = last?.internalDate ? Number(last.internalDate) : null;
  const allAttachments = collectThreadAttachments(thread);
  const { kept } = dedupFolios(allAttachments.filter(a => a.size <= PDF_MAX_BYTES));
  const attachments = kept.slice(0, PDF_MAX_PER_THREAD);
  const emlAttachments = emlAttachmentsFor(thread);
  return {
    id: thread.id, subject: get("Subject"), from: get("From"), date: get("Date"),
    body, lastMsgMs,
    attachments, emlAttachments,
    attachmentFingerprints: attachmentFingerprint([...attachments, ...emlAttachments]),
  };
}

// ── Query builders ───────────────────────────────────────────────────────────
function w(after, before) { return before ? `after:${after} before:${before}` : `after:${after}`; }
function gDate(d) { return d.replace(/-/g, "/"); }
function nDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return gDate(d.toISOString().slice(0, 10)); }

// High priority: branded sender + receipt-subject sweeps. Low: one broad sweep
// over the long tail of regional rideshare/taxi/chauffeur brands (maxResults=500).
function buildRideshareQueryGroups(after, before) {
  const W = w(after, before);
  const high = [
    `from:uber.com (receipt OR trip OR ride) ${W}`,
    `from:lyft.com (receipt OR ride) ${W}`,
    `subject:("your trip with Uber" OR "trip with Uber" OR "Uber receipt") ${W}`,
    `subject:("your ride with Lyft" OR "ride with Lyft" OR "Lyft receipt") ${W}`,
    `subject:("trip receipt" OR "ride receipt" OR "your fare" OR "trip with") ${W}`,
    `(Uber OR Lyft) subject:(receipt OR trip OR ride OR fare) ${W}`,
    // User-curated label — Davon files travel mail (incl. forwarded ride receipts) under "Logistics".
    `label:Logistics ${W}`,
  ];
  const low = [
    // Long-tail rideshare + taxi + chauffeur/car-service brands, one Gmail call.
    `(Uber OR Lyft OR Bolt OR Grab OR Ola OR Cabify OR "Free Now" OR Gett OR Careem OR "Yandex Go" OR Curb OR "Via Transportation" OR Alto OR Wingz OR Blacklane OR "Empire CLS" OR Carmel OR "car service" OR chauffeur OR taxi OR cab OR rideshare OR limousine) (receipt OR trip OR ride OR fare OR invoice) ${W}`,
  ];
  return { high, low };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user, error: authErr } = await authenticate(req);
  if (authErr) return res.status(authErr.status).json({ error: authErr.message });

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
    scanner: "rideshare", userId: user.id,
    params: { sweepFrom, tourStart, tourEnd, after },
  });
  const stopReasons = {};
  const errors = [];

  const { high, low } = buildRideshareQueryGroups(after, before);
  const seen = new Set();
  const CAP = 60;

  const runParallel = async (queries, maxResults) => {
    const results = await Promise.allSettled(queries.map(q => gmailSearch(googleToken, q, maxResults)));
    for (const r of results) {
      if (r.status === "fulfilled") { r.value.forEach(id => seen.add(id)); continue; }
      const msg = r.reason?.message || String(r.reason);
      if (msg.includes("401")) throw Object.assign(new Error("gmail_401"), { status: 402 });
      errors.push({ kind: "gmail_query_failed", message: msg });
    }
  };

  try {
    await withTimeout(runParallel(high, 30), 30000);
    if (seen.size < CAP * 0.8) await withTimeout(runParallel(low, 500), 15000);
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
    return res.json({ rides: [], threadsFound: 0, scanRunId: runId, threadsCached: 0, threadsParsed: 0 });
  }

  let threads = (await fetchBatched(googleToken, ids, 25)).map(extractHeaders);
  // Drop marketing/food-delivery noise before any Claude spend.
  const droppedMarketing = [];
  threads = threads.filter(t => {
    if (RIDESHARE_DROP.test(`${t.subject} ${t.from}`)) { droppedMarketing.push(t.id); return false; }
    return true;
  });
  if (droppedMarketing.length) console.log(`[rideshare-scan] dropped ${droppedMarketing.length} marketing/eats threads`);

  // Cache check (body_hash + lastMsgMs + attachment fingerprints).
  const cacheHits = [];
  const fresh = [];
  for (const t of threads) {
    const bodyHash = hashBody(t.subject, t.from, t.body);
    const cached = await getCachedThread("rideshare", t.id);
    t.bodyHash = bodyHash;
    if (shouldUseCached(cached, t.lastMsgMs, bodyHash, t.attachmentFingerprints)) {
      cacheHits.push(...(Array.isArray(cached.result) ? cached.result : []));
    } else {
      fresh.push(t);
    }
  }
  console.log(`[rideshare-scan] runId=${runId} threads=${threads.length} cached=${threads.length - fresh.length} fresh=${fresh.length}`);

  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0;
  let attachmentsScanned = 0;
  const claudeRides = [];

  const sysPrompt = `You are a rideshare/ground-transport receipt parser for concert touring operations. Extract structured ride data from email bodies AND attached invoice/receipt PDFs when present.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.

${buildTourContextBlock()}

Rules:
- Each object in rides[] is ONE completed trip (one fare). Split multi-trip receipts into separate objects.
- Skip food delivery (Uber Eats, etc.), promos, rating requests, and account notifications — these are NOT rides.
- service: "Uber" | "Lyft" | "Taxi" | "Blacklane" | "Bolt" | brand name, or "Rideshare" if unknown.
- date: trip date in YYYY-MM-DD. time: pickup time HH:MM 24-hour, or null.
- amount: total fare charged as a number only, no symbol. null if not found. Prefer the final charged total (incl. tip/fees).
- currency: ISO code (USD, EUR, GBP, CAD, AUD). Default USD only if clearly US.
- pickup / dropoff: short location text (address or place name), null if absent.
- city: city the ride occurred in, null if unclear.
- pax: rider full name(s) if shown, else empty array.
- confidence: "high" | "medium" | "low" based on how clearly fields were stated.`;

  const returnShape = `Return this exact JSON:
{
  "rides": [
    {
      "service": "Uber",
      "date": "2026-05-04",
      "time": "21:30",
      "pickup": "LAX Terminal 1",
      "dropoff": "The Wiltern",
      "city": "Los Angeles",
      "amount": 42.50,
      "currency": "USD",
      "distance": "12.4 mi",
      "rideType": "UberX",
      "confirmNo": "ABC123",
      "pax": ["Davon Johnson"],
      "confidence": "high",
      "tid": "<thread_id_from_above>"
    }
  ]
}`;

  async function callClaude(contentBlocks) {
    const { text, stopReason, usage } = await postMessages({
      maxTokens: 4096,
      system: sysPrompt,
      messages: [{ role: "user", content: contentBlocks }],
    });
    inputTokens         += usage.inputTokens;
    outputTokens        += usage.outputTokens;
    cacheReadTokens     += usage.cacheReadTokens;
    cacheCreationTokens += usage.cacheCreationTokens;
    bumpStopReason(stopReasons, stopReason);
    return { text, stopReason };
  }

  const withPdf = [];
  const textOnly = [];
  for (const t of fresh) (t.attachments?.length ? withPdf : textOnly).push(t);

  const perThreadResults = {}; // tid -> [rides]
  let lastStopReason = null;

  // ── Text-only batch ─────────────────────────────────────────────────────────
  if (textOnly.length) {
    const userPrompt = `Extract all rideshare/ground-transport trips from these email threads. Tour date range: ${tourStart} to ${tourEnd}.

${textOnly.map((t, i) => `[${i}] tid:${t.id}
Subject: ${t.subject}
From: ${t.from}
Date: ${t.date}
Body: ${t.body || ""}`).join("\n\n---\n\n")}

${returnShape}`;
    try {
      const { text, stopReason } = await callClaude([{ type: "text", text: userPrompt }]);
      lastStopReason = stopReason;
      const parsed = extractJson(text);
      const rows = Array.isArray(parsed?.rides) ? parsed.rides : [];
      for (const r of rows) (perThreadResults[r.tid] ||= []).push(r);
      console.log(`[rideshare-scan] text-batch stop=${stopReason} threads=${textOnly.length} rows=${rows.length}`);
    } catch (e) {
      errors.push({ kind: "anthropic_error", phase: "text_batch", status: e.status, detail: (e.detail || "").slice(0, 400) });
    }
  }

  // ── Per-thread PDF calls (bounded) ───────────────────────────────────────────
  for (const t of withPdf) {
    const docBlocks = [];
    const usedFiles = [];
    if (attachmentsScanned < PDF_MAX_PER_SCAN) {
      for (const a of t.attachments) {
        if (attachmentsScanned >= PDF_MAX_PER_SCAN) break;
        const b64 = await fetchAttachmentB64(googleToken, a.messageId, a.attachmentId);
        if (!b64) { errors.push({ kind: "attachment_fetch_failed", tid: t.id, filename: a.filename }); continue; }
        docBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
        usedFiles.push(a.filename);
        attachmentsScanned++;
      }
    } else {
      errors.push({ kind: "pdf_scan_cap_reached", tid: t.id });
    }
    const userPrompt = `Extract all rideshare/ground-transport trips for this thread. Tour date range: ${tourStart} to ${tourEnd}.
${docBlocks.length ? `Attached: ${usedFiles.length} PDF receipt(s). Prefer PDF totals for the fare.` : ""}
tid:${t.id}
Subject: ${t.subject}
From: ${t.from}
Date: ${t.date}
Body: ${t.body || ""}

${returnShape}`;
    try {
      const { text, stopReason } = await callClaude([...docBlocks, { type: "text", text: userPrompt }]);
      lastStopReason = stopReason;
      const parsed = extractJson(text);
      const rows = Array.isArray(parsed?.rides) ? parsed.rides : [];
      for (const r of rows) {
        if (usedFiles.length) r.sourceAttachment = { filename: usedFiles[0] };
        (perThreadResults[r.tid] ||= []).push(r);
      }
    } catch (e) {
      errors.push({ kind: "anthropic_error", phase: "pdf_thread", tid: t.id, status: e.status, detail: (e.detail || "").slice(0, 300) });
    }
  }

  // ── Forwarded .eml receipts ────────────────────────────────────────────────
  // Bundle emails attach many ride receipts as .eml files. Parse each separately
  // (chunked), attributing results to the parent thread so they cache together.
  const emlBudget = { scanned: 0 };
  for (const t of fresh) {
    if (!t.emlAttachments?.length) continue;
    const texts = await fetchEmlTexts(googleToken, t, emlBudget, { maxPerScan: EML_MAX_PER_SCAN });
    for (let i = 0; i < texts.length; i += EML_PARSE_CHUNK) {
      const chunk = texts.slice(i, i + EML_PARSE_CHUNK);
      const userPrompt = `Extract every rideshare/ground-transport trip from these forwarded receipt emails. Tour date range: ${tourStart} to ${tourEnd}. Skip food delivery (Uber Eats etc.), flights, and hotels.

${chunk.map((e, j) => `[eml ${i + j}] tid:${t.id}
File: ${e.filename}
Subject: ${e.subject}
Body: ${e.text}`).join("\n\n---\n\n")}

${returnShape}`;
      try {
        const { text, stopReason } = await callClaude([{ type: "text", text: userPrompt }]);
        lastStopReason = stopReason;
        const rows = Array.isArray(extractJson(text)?.rides) ? extractJson(text).rides : [];
        for (const r of rows) { r.tid = t.id; (perThreadResults[t.id] ||= []).push(r); }
        console.log(`[rideshare-scan] eml-batch tid=${t.id} emls=${chunk.length} rows=${rows.length}`);
      } catch (e) {
        errors.push({ kind: "anthropic_error", phase: "eml_batch", tid: t.id, status: e.status, detail: (e.detail || "").slice(0, 300) });
      }
    }
  }

  // Flatten + cache.
  for (const t of fresh) {
    const result = perThreadResults[t.id] || [];
    claudeRides.push(...result);
    await putCachedThread("rideshare", t.id, {
      lastMsgMs: t.lastMsgMs,
      bodyHash: t.bodyHash,
      result,
      stopReason: lastStopReason,
      attachmentFingerprints: t.attachmentFingerprints,
    });
  }

  const rides = [...cacheHits, ...claudeRides]
    .filter(r => r && r.date && (r.amount != null && !Number.isNaN(parseFloat(r.amount))))
    .map(r => {
      const validationFlags = [];
      if (r.date < tourStart || r.date > tourEnd) validationFlags.push("outside_tour_range");
      const amt = parseFloat(r.amount);
      return {
        id: `ride_${(r.tid || "").slice(-6)}_${(r.confirmNo || `${r.date}_${Math.round(amt * 100)}`).toString().replace(/\s/g, "").slice(0, 10)}`,
        service: r.service || "Rideshare",
        date: r.date,
        time: r.time || "",
        pickup: r.pickup || "",
        dropoff: r.dropoff || "",
        city: r.city || "",
        amount: amt,
        currency: r.currency || "USD",
        distance: r.distance || "",
        rideType: r.rideType || "",
        confirmNo: r.confirmNo || "",
        pax: Array.isArray(r.pax) ? r.pax : [],
        confidence: r.confidence || "medium",
        validationFlags,
        tid: r.tid || "",
        status: "pending",
      };
    });

  await finishScanRun(runId, {
    threadsFound: threads.length,
    threadsCached: threads.length - fresh.length,
    threadsParsed: fresh.length,
    attachmentsScanned,
    inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
    stopReasons, errors,
    startedAt,
  });

  return res.json({
    rides,
    threadsFound: threads.length,
    scanRunId: runId,
    threadsCached: threads.length - fresh.length,
    threadsParsed: fresh.length,
    attachmentsScanned,
    tokensUsed: inputTokens + outputTokens,
  });
};
