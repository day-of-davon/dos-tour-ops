// api/food-scan.js — Gmail food-delivery receipt scraper + Claude parser.
// Mirrors rideshare-scan.js but for meals: Uber Eats, DoorDash, Grubhub, etc.
// query sweep → thread cache → text batch + per-thread PDF + .eml bundle parsing.
// Returns { meals: [...] } ready for the Finance ledger (category Meals).
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

// PDF attachment caps.
const PDF_MAX_PER_THREAD = 2;
const PDF_MAX_PER_SCAN   = 12;
const PDF_MAX_BYTES      = 5 * 1024 * 1024;

// Forwarded-email (.eml) per-scan fetch cap. Bundle emails attach many receipts.
const EML_MAX_PER_SCAN = 30;
const EML_PARSE_CHUNK  = 4;

// Drop promos, account, and rating noise — keep actual order receipts.
const FOOD_DROP = /% off|promo|discount|deal of|sale|earn|points|rewards? (program|points)|rate your|how was your (order|meal)\?|survey|newsletter|sign\s*up|invite|referr|password|verify your|welcome to|your cart|left in your cart|complete your order|hungry\?/i;

function extractHeaders(thread) {
  const last = thread.messages?.[thread.messages.length - 1];
  const headers = last?.payload?.headers || [];
  const get = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  const rawParts = (thread.messages || []).map(m => extractBody(m.payload)).filter(Boolean);
  const strippedParts = rawParts.map(stripMarketingFooter);
  // 4000-char cap — order receipts are short; total sits near the top.
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

function buildFoodQueryGroups(after, before) {
  const W = w(after, before);
  const high = [
    `subject:("Uber Eats" OR "your order" OR "order receipt" OR "order confirmation" OR "your food") (order OR receipt OR delivered OR delivery) ${W}`,
    `from:(uber.com OR doordash.com OR grubhub.com OR postmates.com OR seamless.com OR trycaviar.com OR deliveroo OR just-eat OR wolt.com) (order OR receipt OR delivered) ${W}`,
    `("Uber Eats" OR DoorDash OR Grubhub OR Postmates OR Seamless OR Caviar OR Deliveroo OR "Just Eat" OR Wolt OR ChowNow OR Toast) subject:(order OR receipt OR delivered OR "your order") ${W}`,
    // User-curated label — Davon files travel mail (incl. forwarded food receipts) under "Logistics".
    `label:Logistics ${W}`,
  ];
  const low = [
    `("Uber Eats" OR DoorDash OR Grubhub OR Postmates OR Seamless OR Caviar OR Deliveroo OR "Just Eat" OR Wolt OR ChowNow OR Toast OR Gopuff OR "Food delivery") (order OR receipt OR "total" OR delivered) ${W}`,
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
    scanner: "food", userId: user.id,
    params: { sweepFrom, tourStart, tourEnd, after },
  });
  const stopReasons = {};
  const errors = [];

  const { high, low } = buildFoodQueryGroups(after, before);
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
    return res.json({ meals: [], threadsFound: 0, scanRunId: runId, threadsCached: 0, threadsParsed: 0 });
  }

  let threads = (await fetchBatched(googleToken, ids, 25)).map(extractHeaders);
  const droppedMarketing = [];
  threads = threads.filter(t => {
    if (FOOD_DROP.test(`${t.subject} ${t.from}`)) { droppedMarketing.push(t.id); return false; }
    return true;
  });
  if (droppedMarketing.length) console.log(`[food-scan] dropped ${droppedMarketing.length} marketing threads`);

  const cacheHits = [];
  const fresh = [];
  for (const t of threads) {
    const bodyHash = hashBody(t.subject, t.from, t.body);
    const cached = await getCachedThread("food", t.id);
    t.bodyHash = bodyHash;
    if (shouldUseCached(cached, t.lastMsgMs, bodyHash, t.attachmentFingerprints)) {
      cacheHits.push(...(Array.isArray(cached.result) ? cached.result : []));
    } else {
      fresh.push(t);
    }
  }
  console.log(`[food-scan] runId=${runId} threads=${threads.length} cached=${threads.length - fresh.length} fresh=${fresh.length}`);

  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0;
  let attachmentsScanned = 0;
  const claudeMeals = [];

  const sysPrompt = `You are a food-delivery receipt parser for concert touring operations. Extract structured order data from email bodies AND attached receipt PDFs when present.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.

${buildTourContextBlock()}

Rules:
- Each object in meals[] is ONE completed food order. Split multi-order receipts into separate objects.
- Skip rideshare (Uber rides), flights, hotels, car rentals, promos, "rate your order", cart reminders, and account notifications — only actual food orders that were charged.
- service: "Uber Eats" | "DoorDash" | "Grubhub" | "Postmates" | "Seamless" | "Caviar" | "Deliveroo" | brand name.
- vendor: the restaurant/merchant name.
- date: order date in YYYY-MM-DD. time: HH:MM 24-hour or null.
- amount: total charged as a number only, no symbol (incl. tax/tip/fees). null if not found.
- currency: ISO code (USD, EUR, GBP, CAD, AUD). Default USD only if clearly US.
- city: city of delivery, null if unclear.
- items: a short summary of items ordered, or null.
- pax: person who ordered if shown, else empty array.
- confidence: "high" | "medium" | "low".`;

  const returnShape = `Return this exact JSON:
{
  "meals": [
    {
      "service": "Uber Eats",
      "vendor": "Sweetgreen",
      "date": "2026-05-04",
      "time": "19:30",
      "amount": 38.20,
      "currency": "USD",
      "city": "Los Angeles",
      "items": "2 salads, drinks",
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

  const perThreadResults = {}; // tid -> [meals]
  let lastStopReason = null;

  // ── Text-only batch ─────────────────────────────────────────────────────────
  if (textOnly.length) {
    const userPrompt = `Extract all food-delivery orders from these email threads. Tour date range: ${tourStart} to ${tourEnd}.

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
      const rows = Array.isArray(parsed?.meals) ? parsed.meals : [];
      for (const r of rows) (perThreadResults[r.tid] ||= []).push(r);
      console.log(`[food-scan] text-batch stop=${stopReason} threads=${textOnly.length} rows=${rows.length}`);
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
    const userPrompt = `Extract all food-delivery orders for this thread. Tour date range: ${tourStart} to ${tourEnd}.
${docBlocks.length ? `Attached: ${usedFiles.length} PDF receipt(s). Prefer PDF totals for the amount.` : ""}
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
      const rows = Array.isArray(parsed?.meals) ? parsed.meals : [];
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
      const userPrompt = `Extract every food-delivery order from these forwarded receipt emails. Tour date range: ${tourStart} to ${tourEnd}. Skip rideshare, flights, hotels, and car rentals.

${chunk.map((e, j) => `[eml ${i + j}] tid:${t.id}
File: ${e.filename}
Subject: ${e.subject}
Body: ${e.text}`).join("\n\n---\n\n")}

${returnShape}`;
      try {
        const { text, stopReason } = await callClaude([{ type: "text", text: userPrompt }]);
        lastStopReason = stopReason;
        const rows = Array.isArray(extractJson(text)?.meals) ? extractJson(text).meals : [];
        for (const r of rows) { r.tid = t.id; (perThreadResults[t.id] ||= []).push(r); }
        console.log(`[food-scan] eml-batch tid=${t.id} emls=${chunk.length} rows=${rows.length}`);
      } catch (e) {
        errors.push({ kind: "anthropic_error", phase: "eml_batch", tid: t.id, status: e.status, detail: (e.detail || "").slice(0, 300) });
      }
    }
  }

  // Flatten + cache.
  for (const t of fresh) {
    const result = perThreadResults[t.id] || [];
    claudeMeals.push(...result);
    await putCachedThread("food", t.id, {
      lastMsgMs: t.lastMsgMs,
      bodyHash: t.bodyHash,
      result,
      stopReason: lastStopReason,
      attachmentFingerprints: t.attachmentFingerprints,
    });
  }

  const meals = [...cacheHits, ...claudeMeals]
    .filter(r => r && r.date && (r.amount != null && !Number.isNaN(parseFloat(r.amount))))
    .map(r => {
      const validationFlags = [];
      if (r.date < tourStart || r.date > tourEnd) validationFlags.push("outside_tour_range");
      const amt = parseFloat(r.amount);
      return {
        id: `meal_${(r.tid || "").slice(-6)}_${(r.confirmNo || `${r.date}_${Math.round(amt * 100)}`).toString().replace(/\s/g, "").slice(0, 10)}`,
        service: r.service || "Food Delivery",
        vendor: r.vendor || "",
        date: r.date,
        time: r.time || "",
        amount: amt,
        currency: r.currency || "USD",
        city: r.city || "",
        items: r.items || "",
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
    meals,
    threadsFound: threads.length,
    scanRunId: runId,
    threadsCached: threads.length - fresh.length,
    threadsParsed: fresh.length,
    attachmentsScanned,
    tokensUsed: inputTokens + outputTokens,
  });
};
