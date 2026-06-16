// api/car-rental-scan.js — Gmail car-rental confirmation scraper + Claude parser.
// Mirrors rideshare-scan.js: query sweep → thread cache → text batch + per-thread
// PDF + .eml bundle parsing → validate → scan_runs telemetry.
// Returns { rentals: [...] } ready for the Finance ledger.
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

// PDF attachment caps (rental agreements / statements arrive as PDFs).
const PDF_MAX_PER_THREAD = 2;
const PDF_MAX_PER_SCAN   = 12;
const PDF_MAX_BYTES      = 5 * 1024 * 1024;

// Forwarded-email (.eml) per-scan fetch cap. Bundle emails attach many receipts.
const EML_MAX_PER_SCAN = 30;
const EML_PARSE_CHUNK  = 4;

// Drop loyalty/promo/account noise that shares the rental senders.
const RENTAL_DROP = /points|loyalty|rewards? (program|points)|% off|promo|deal|sale|upgrade your|earn|survey|rate your|newsletter|sign\s*up|password|verify your|welcome to/i;

function extractHeaders(thread) {
  const last = thread.messages?.[thread.messages.length - 1];
  const headers = last?.payload?.headers || [];
  const get = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  const rawParts = (thread.messages || []).map(m => extractBody(m.payload)).filter(Boolean);
  const strippedParts = rawParts.map(stripMarketingFooter);
  // 5000-char cap — rental statements bury the total/charges near the bottom.
  const body = strippedParts.join("\n---\n").slice(0, 5000);
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

function buildRentalQueryGroups(after, before) {
  const W = w(after, before);
  const high = [
    `from:(hertz.com OR enterprise.com OR avis.com OR budget.com OR nationalcar.com OR alamo.com OR sixt.com OR europcar.com OR turo.com) (rental OR reservation OR confirmation OR receipt OR agreement OR statement) ${W}`,
    `subject:("rental confirmation" OR "rental agreement" OR "rental receipt" OR "statement of charges" OR "car rental" OR "e-return" OR "your reservation") (car OR rental OR vehicle OR pickup OR pick-up) ${W}`,
    `subject:("rental" OR "reservation") (Hertz OR Enterprise OR Avis OR Budget OR National OR Alamo OR Sixt OR Europcar OR Dollar OR Thrifty OR Turo) ${W}`,
    // User-curated label — Davon files travel mail (incl. forwarded rental receipts) under "Logistics".
    `label:Logistics ${W}`,
  ];
  const low = [
    `(Hertz OR Enterprise OR Avis OR Budget OR "National Car" OR Alamo OR Sixt OR Europcar OR Dollar OR Thrifty OR Payless OR "Fox Rent" OR Turo OR Zipcar OR SilverCar OR Kemwel) (rental OR reservation OR confirmation OR receipt OR agreement OR "statement of charges") ${W}`,
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
    scanner: "car-rental", userId: user.id,
    params: { sweepFrom, tourStart, tourEnd, after },
  });
  const stopReasons = {};
  const errors = [];

  const { high, low } = buildRentalQueryGroups(after, before);
  const seen = new Set();
  const CAP = 50;

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
    await withTimeout(runParallel(high, 25), 30000);
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
    return res.json({ rentals: [], threadsFound: 0, scanRunId: runId, threadsCached: 0, threadsParsed: 0 });
  }

  let threads = (await fetchBatched(googleToken, ids, 25)).map(extractHeaders);
  const droppedMarketing = [];
  threads = threads.filter(t => {
    if (RENTAL_DROP.test(`${t.subject} ${t.from}`)) { droppedMarketing.push(t.id); return false; }
    return true;
  });
  if (droppedMarketing.length) console.log(`[car-rental-scan] dropped ${droppedMarketing.length} marketing threads`);

  const cacheHits = [];
  const fresh = [];
  for (const t of threads) {
    const bodyHash = hashBody(t.subject, t.from, t.body);
    const cached = await getCachedThread("car-rental", t.id);
    t.bodyHash = bodyHash;
    if (shouldUseCached(cached, t.lastMsgMs, bodyHash, t.attachmentFingerprints)) {
      cacheHits.push(...(Array.isArray(cached.result) ? cached.result : []));
    } else {
      fresh.push(t);
    }
  }
  console.log(`[car-rental-scan] runId=${runId} threads=${threads.length} cached=${threads.length - fresh.length} fresh=${fresh.length}`);

  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0;
  let attachmentsScanned = 0;
  const claudeRentals = [];

  const sysPrompt = `You are a car-rental confirmation parser for concert touring operations. Extract structured rental data from email bodies AND attached agreement/statement PDFs when present.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.

${buildTourContextBlock()}

Rules:
- Each object in rentals[] is ONE rental contract (one vehicle, one pickup→dropoff).
- Skip rideshare (Uber/Lyft), flights, hotels, food delivery, loyalty/promo, and account notifications — only actual car rentals.
- company: "Hertz" | "Enterprise" | "Avis" | "Budget" | "National" | "Sixt" | "Turo" | brand name.
- pickupDate / dropoffDate: YYYY-MM-DD. pickupTime: HH:MM 24-hour or null.
- amount: total charged as a number only, no symbol. null if not found. When a PDF statement is attached, prefer its final total (post-tax, post-fuel/extras).
- currency: ISO code (USD, EUR, GBP, CAD, AUD). Default USD only if clearly US.
- pickupLocation / dropoffLocation: short location text (airport code or place name), null if absent.
- city: city of pickup, null if unclear. vehicle: car class/model if shown, else null.
- confirmNo: reservation / confirmation / record number.
- pax: renter full name(s) if shown, else empty array.
- confidence: "high" | "medium" | "low".`;

  const returnShape = `Return this exact JSON:
{
  "rentals": [
    {
      "company": "Hertz",
      "pickupDate": "2026-05-04",
      "pickupTime": "10:00",
      "dropoffDate": "2026-05-07",
      "pickupLocation": "LAX",
      "dropoffLocation": "LAX",
      "city": "Los Angeles",
      "amount": 312.40,
      "currency": "USD",
      "vehicle": "Full-size SUV",
      "confirmNo": "K1234567",
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

  const perThreadResults = {}; // tid -> [rentals]
  let lastStopReason = null;

  // ── Text-only batch ─────────────────────────────────────────────────────────
  if (textOnly.length) {
    const userPrompt = `Extract all car rentals from these email threads. Tour date range: ${tourStart} to ${tourEnd}.

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
      const rows = Array.isArray(parsed?.rentals) ? parsed.rentals : [];
      for (const r of rows) (perThreadResults[r.tid] ||= []).push(r);
      console.log(`[car-rental-scan] text-batch stop=${stopReason} threads=${textOnly.length} rows=${rows.length}`);
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
    const userPrompt = `Extract all car rentals for this thread. Tour date range: ${tourStart} to ${tourEnd}.
${docBlocks.length ? `Attached: ${usedFiles.length} PDF agreement/statement(s). Prefer PDF totals for the amount.` : ""}
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
      const rows = Array.isArray(parsed?.rentals) ? parsed.rentals : [];
      for (const r of rows) {
        if (usedFiles.length) r.sourceAttachment = { filename: usedFiles[0] };
        (perThreadResults[r.tid] ||= []).push(r);
      }
    } catch (e) {
      errors.push({ kind: "anthropic_error", phase: "pdf_thread", tid: t.id, status: e.status, detail: (e.detail || "").slice(0, 300) });
    }
  }

  // ── Forwarded .eml receipts ────────────────────────────────────────────────
  const emlBudget = { scanned: 0 };
  for (const t of fresh) {
    if (!t.emlAttachments?.length) continue;
    const texts = await fetchEmlTexts(googleToken, t, emlBudget, { maxPerScan: EML_MAX_PER_SCAN });
    for (let i = 0; i < texts.length; i += EML_PARSE_CHUNK) {
      const chunk = texts.slice(i, i + EML_PARSE_CHUNK);
      const userPrompt = `Extract every car rental from these forwarded receipt emails. Tour date range: ${tourStart} to ${tourEnd}. Skip rideshare, flights, hotels, and food delivery.

${chunk.map((e, j) => `[eml ${i + j}] tid:${t.id}
File: ${e.filename}
Subject: ${e.subject}
Body: ${e.text}`).join("\n\n---\n\n")}

${returnShape}`;
      try {
        const { text, stopReason } = await callClaude([{ type: "text", text: userPrompt }]);
        lastStopReason = stopReason;
        const rows = Array.isArray(extractJson(text)?.rentals) ? extractJson(text).rentals : [];
        for (const r of rows) { r.tid = t.id; (perThreadResults[t.id] ||= []).push(r); }
        console.log(`[car-rental-scan] eml-batch tid=${t.id} emls=${chunk.length} rows=${rows.length}`);
      } catch (e) {
        errors.push({ kind: "anthropic_error", phase: "eml_batch", tid: t.id, status: e.status, detail: (e.detail || "").slice(0, 300) });
      }
    }
  }

  // Flatten + cache.
  for (const t of fresh) {
    const result = perThreadResults[t.id] || [];
    claudeRentals.push(...result);
    await putCachedThread("car-rental", t.id, {
      lastMsgMs: t.lastMsgMs,
      bodyHash: t.bodyHash,
      result,
      stopReason: lastStopReason,
      attachmentFingerprints: t.attachmentFingerprints,
    });
  }

  const rentals = [...cacheHits, ...claudeRentals]
    .filter(r => r && r.pickupDate && (r.amount != null && !Number.isNaN(parseFloat(r.amount))))
    .map(r => {
      const validationFlags = [];
      if (r.pickupDate < tourStart || r.pickupDate > tourEnd) validationFlags.push("outside_tour_range");
      const amt = parseFloat(r.amount);
      return {
        id: `car_${(r.tid || "").slice(-6)}_${(r.confirmNo || `${r.pickupDate}_${Math.round(amt * 100)}`).toString().replace(/\s/g, "").slice(0, 10)}`,
        company: r.company || "Car Rental",
        pickupDate: r.pickupDate,
        pickupTime: r.pickupTime || "",
        dropoffDate: r.dropoffDate || "",
        pickupLocation: r.pickupLocation || "",
        dropoffLocation: r.dropoffLocation || "",
        city: r.city || "",
        amount: amt,
        currency: r.currency || "USD",
        vehicle: r.vehicle || "",
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
    rentals,
    threadsFound: threads.length,
    scanRunId: runId,
    threadsCached: threads.length - fresh.length,
    threadsParsed: fresh.length,
    attachmentsScanned,
    tokensUsed: inputTokens + outputTokens,
  });
};
