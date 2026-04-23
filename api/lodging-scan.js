// api/lodging-scan.js — Gmail hotel confirmation scraper + Claude parser
const { withTimeout } = require("./lib/utils");
const { authenticate } = require("./lib/auth");
const { gmailSearch, fetchBatched, extractBody, stripMarketingFooter, extractJson } = require("./lib/gmail");
const { postMessages } = require("./lib/anthropic");
const {
  hashBody, shouldUseCached,
  startScanRun, finishScanRun,
  getCachedThread, putCachedThread,
  logEnhancement, bumpStopReason,
} = require("./lib/scanMemory");
const {
  collectThreadAttachments, dedupFolios,
  fetchAttachmentB64, attachmentFingerprint,
} = require("./lib/attachments");
const { buildTourContextBlock } = require("./lib/tourContext");
const { buildSynonymBlock, buildConfidenceRubric, buildStopwordRule, validateCommon } = require("./lib/parsePrimitives");

// PDF attachment caps.
const PDF_MAX_PER_THREAD = 2;
const PDF_MAX_PER_SCAN   = 20;
const PDF_MAX_BYTES      = 5 * 1024 * 1024;

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
  // 6000-char cap. Hotel confirmations bury total/tax, cancellation policy, and
  // room details near the bottom. 1400 was truncating folio totals on Marriott
  // and IHG forwards; raised to match flights/intel extractHeaders.
  const body = strippedParts.join("\n---\n").slice(0, 6000);
  const lastMsgMs = last?.internalDate ? Number(last.internalDate) : null;
  // Attachments: walk tree, dedup Marriott-style (folio_NNNN, Receipt (2), etc.)
  const allAttachments = collectThreadAttachments(thread);
  const { kept: dedupedAttachments, dropped: droppedAttachments } =
    dedupFolios(allAttachments.filter(a => a.size <= PDF_MAX_BYTES));
  const attachments = dedupedAttachments.slice(0, PDF_MAX_PER_THREAD);
  if (droppedAttachments.length) {
    console.log(`[lodging] folio_dedup_dropped tid=${thread.id}: ${droppedAttachments.map(d => d.filename).join(", ")}`);
  }
  const oversized = allAttachments.filter(a => a.size > PDF_MAX_BYTES).map(a => ({ filename: a.filename, size: a.size }));
  return {
    id: thread.id, subject: get("Subject"), from: get("From"), date: get("Date"),
    body, lastMsgMs, footerStripSaved,
    attachments,
    attachmentFingerprints: attachmentFingerprint(attachments),
    droppedAttachments,
    oversizedAttachments: oversized,
  };
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

// High priority: subject/keyword sweeps + touring-specific terms. Run first.
// Low priority: single brand-name sweep (maxResults=500) replacing 55+ from:
// domain queries. Same effective recall, one Gmail API call instead of 55.
function buildLodgingQueryGroups(after, before) {
  const W = w(after, before);
  const high = [
    // Subject sweeps
    `subject:("hotel confirmation") ${W}`,
    `subject:("reservation confirmation") (hotel OR inn OR suite OR resort OR lodge) ${W}`,
    `subject:("booking confirmation") (hotel OR inn OR suite OR resort OR lodge OR airbnb OR vrbo) ${W}`,
    `subject:("check-in") (hotel OR inn OR suite OR resort OR reservation) ${W}`,
    `subject:("your stay") ${W}`,
    `subject:("room reservation") ${W}`,
    `"confirmation number" (hotel OR inn OR suite OR resort OR lodge OR check-in OR check-out) ${W}`,
    `"reservation number" (hotel OR inn OR suite OR resort OR check-in) ${W}`,
    `(check-in OR "check in") (check-out OR "check out") (hotel OR inn OR suite OR resort OR lodge) (confirmation OR booking OR reservation) ${W}`,
    // Touring-specific
    `"room block" (confirmation OR booking OR reservation) ${W}`,
    `"room list" (hotel OR confirmation OR reservation) ${W}`,
    `"group reservation" (hotel OR inn OR resort OR lodge) ${W}`,
    `"tour accommodation" OR "band hotel" OR "crew hotel" (confirmation OR booking) ${W}`,
    `"promoter accommodation" OR "artist accommodation" (hotel OR inn OR confirmation) ${W}`,
  ];
  const low = [
    // Hotel brand name sweep — includes loyalty program names (Bonvoy) and
    // sub-brands (Sheraton, Westin, W Hotels, Hampton Inn, DoubleTree, Aloft,
    // Andaz, Pullman) that parent-brand queries miss. maxResults=500 replaces
    // 55+ from: domain queries with one Gmail API call.
    `(Marriott OR Bonvoy OR Sheraton OR Westin OR "W Hotels" OR "Ritz-Carlton" OR "Four Seasons" OR Hilton OR "Hampton Inn" OR DoubleTree OR Aloft OR Hyatt OR Andaz OR IHG OR InterContinental OR "Holiday Inn" OR "Crowne Plaza" OR Kimpton OR Accor OR Novotel OR Sofitel OR Ibis OR Pullman OR "Best Western" OR Wyndham OR Radisson OR citizenM OR "Premier Inn" OR Travelodge OR "NH Hotels" OR Melia OR Barcelo OR MGM OR Caesars OR "Design Hotels" OR "Motel One") (confirmation OR reservation OR "your stay" OR "check-in" OR booking) ${W}`,
    // OTA lodging bookings
    `("Booking.com" OR Expedia OR "Hotels.com" OR Priceline OR Hotwire OR Agoda OR Airbnb OR VRBO OR HomeAway OR Vacasa OR Kayak OR Hopper OR "Trip.com" OR Hostelworld OR Concur) (hotel OR reservation OR confirmation OR "your stay" OR "check-in") ${W}`,
  ];
  return { high, low };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user, supabase, error: authErr } = await authenticate(req);
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
    scanner: "lodging", userId: user.id,
    params: { sweepFrom, tourStart, tourEnd, after },
  });
  const stopReasons = {};
  const errors = [];

  const { high, low } = buildLodgingQueryGroups(after, before);
  const seen = new Set();
  const CAP = 50;

  const runParallel = async (queries, maxResults) => {
    const results = await Promise.allSettled(queries.map(q => gmailSearch(googleToken, q, maxResults)));
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
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
    return res.json({ lodgings: [], threadsFound: 0, scanRunId: runId, threadsCached: 0, threadsParsed: 0 });
  }

  const threads = (await fetchBatched(googleToken, ids, 25)).map(extractHeaders);

  // Cache check (body_hash + lastMsgMs + attachment fingerprints).
  const cacheHits = [];
  const fresh = [];
  for (const t of threads) {
    const bodyHash = hashBody(t.subject, t.from, t.body);
    const cached = await getCachedThread("lodging", t.id);
    t.bodyHash = bodyHash;
    t.prevResult = cached?.result || null;
    if (shouldUseCached(cached, t.lastMsgMs, bodyHash, t.attachmentFingerprints)) {
      cacheHits.push(...(Array.isArray(cached.result) ? cached.result : []));
    } else {
      fresh.push(t);
    }
    for (const d of t.droppedAttachments || []) errors.push({ kind: "folio_dedup_dropped", tid: t.id, filename: d.filename, reason: d.reason });
    for (const o of t.oversizedAttachments || []) errors.push({ kind: "pdf_oversized", tid: t.id, filename: o.filename, size: o.size });
  }
  console.log(`[lodging-scan] runId=${runId} threads=${threads.length} cached=${threads.length - fresh.length} fresh=${fresh.length}`);

  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0;
  let attachmentsScanned = 0;
  let claudeLodgings = [];

  const sysPrompt = `You are a hotel/accommodation confirmation parser for concert touring operations. Extract structured lodging data from email bodies AND attached folio/receipt PDFs when present.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.

${buildTourContextBlock()}

${buildSynonymBlock()}

${buildConfidenceRubric()}

${buildStopwordRule()}

Rules:
- Each object in lodgings[] represents one distinct hotel/property stay (not per-room)
- Dates: YYYY-MM-DD format
- Times: HH:MM 24-hour format
- cost: total cost as number only, no currency symbol. null if not found. When a folio PDF is attached, prefer the PDF's final total (post-tax, post-incidentals) over body estimates.
- pax: array of guest full names. Empty array if not found
- When a PDF is attached: trust it over the body text for cost, dates, confirmation numbers, and room type. Body text often shows the initial reservation; folios show actual charges.
- Skip flight, car rental, or non-accommodation confirmations
- validationFlags: leave as [] — the server fills this post-parse`;

  const returnShape = `Return this exact JSON:
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
      "roomType": "King Deluxe",
      "notes": "Non-smoking, king bed requested",
      "confidence": "high",
      "parseNotes": null,
      "validationFlags": [],
      "tid": "<thread_id_from_above>"
    }
  ]
}`;

  // Helper: one Claude call, record tokens + stop_reason.
  async function callClaude(contentBlocks) {
    const { text, stopReason, usage } = await postMessages({
      maxTokens: 8192,
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

  // Partition fresh threads: with-PDFs go one-at-a-time (per-thread document
  // content); without go through the original batched text-only prompt.
  const withPdf = [];
  const textOnly = [];
  for (const t of fresh) (t.attachments?.length ? withPdf : textOnly).push(t);

  const perThreadResults = {}; // tid -> [lodgings]
  let lastStopReason = null;

  // ── Text-only batch (unchanged shape) ──────────────────────────────────────
  if (textOnly.length) {
    const userPrompt = `Extract all hotel/accommodation reservations from these email threads. Tour date range: ${tourStart} to ${tourEnd}.

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
      const rows = Array.isArray(parsed?.lodgings) ? parsed.lodgings : [];
      for (const h of rows) (perThreadResults[h.tid] ||= []).push(h);
      console.log(`[lodging-scan] text-batch stop=${stopReason} threads=${textOnly.length} rows=${rows.length}`);
    } catch (e) {
      errors.push({ kind: "anthropic_error", phase: "text_batch", status: e.status, detail: (e.detail || "").slice(0, 500) });
    }
  }

  // ── Per-thread PDF calls (bounded by scan cap) ─────────────────────────────
  for (const t of withPdf) {
    if (attachmentsScanned >= PDF_MAX_PER_SCAN) {
      errors.push({ kind: "pdf_scan_cap_reached", tid: t.id, attemptedFiles: t.attachments.length });
      if ((t.body || "").length >= 300) {
        try {
          const userPrompt = `Extract all hotel/accommodation reservations from this thread. Tour date range: ${tourStart} to ${tourEnd}.
tid:${t.id}
Subject: ${t.subject}
From: ${t.from}
Date: ${t.date}
Body: ${t.body || ""}

${returnShape}`;
          const { text, stopReason } = await callClaude([{ type: "text", text: userPrompt }]);
          lastStopReason = stopReason;
          const parsed = extractJson(text);
          const rows = Array.isArray(parsed?.lodgings) ? parsed.lodgings : [];
          for (const h of rows) (perThreadResults[h.tid] ||= []).push(h);
        } catch (e) {
          errors.push({ kind: "anthropic_error", phase: "fallback_text", tid: t.id, status: e.status, detail: (e.detail || "").slice(0, 300) });
        }
      } else {
        console.log(`[lodging-scan] pdf cap fallback skipped tid=${t.id}: body too short (${(t.body || "").length} chars)`);
      }
      continue;
    }

    // Fetch up to PDF_MAX_PER_THREAD attachments (already dedup+size-filtered).
    const docBlocks = [];
    const usedFiles = [];
    for (const a of t.attachments) {
      if (attachmentsScanned >= PDF_MAX_PER_SCAN) break;
      const b64 = await fetchAttachmentB64(googleToken, a.messageId, a.attachmentId);
      if (!b64) { errors.push({ kind: "attachment_fetch_failed", tid: t.id, filename: a.filename }); continue; }
      docBlocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: b64 },
      });
      usedFiles.push(a.filename);
      attachmentsScanned++;
    }

    if (docBlocks.length === 0) {
      if ((t.body || "").length >= 300) {
        try {
          const userPrompt = `Extract all hotel/accommodation reservations from this thread. Tour date range: ${tourStart} to ${tourEnd}.
tid:${t.id}
Subject: ${t.subject}
From: ${t.from}
Date: ${t.date}
Body: ${t.body || ""}

${returnShape}`;
          const { text, stopReason } = await callClaude([{ type: "text", text: userPrompt }]);
          lastStopReason = stopReason;
          const parsed = extractJson(text);
          const rows = Array.isArray(parsed?.lodgings) ? parsed.lodgings : [];
          for (const h of rows) (perThreadResults[h.tid] ||= []).push(h);
        } catch (e) {
          errors.push({ kind: "anthropic_error", phase: "pdf_thread", tid: t.id, status: e.status, detail: (e.detail || "").slice(0, 300) });
        }
      } else {
        console.log(`[lodging-scan] pdf fetch failed + short body, skipping tid=${t.id}`);
      }
      continue;
    }

    const userPrompt = `Extract all hotel/accommodation reservations for this thread. Tour date range: ${tourStart} to ${tourEnd}.
${docBlocks.length ? `Attached: ${usedFiles.length} PDF folio/receipt(s) — ${usedFiles.join(", ")}. Prefer PDF totals for cost; use body for context.` : ""}

tid:${t.id}
Subject: ${t.subject}
From: ${t.from}
Date: ${t.date}
Body: ${t.body || ""}

${returnShape}`;
    try {
      const { text, stopReason } = await callClaude([
        ...docBlocks,
        { type: "text", text: userPrompt },
      ]);
      lastStopReason = stopReason;
      const parsed = extractJson(text);
      const rows = Array.isArray(parsed?.lodgings) ? parsed.lodgings : [];
      for (const h of rows) {
        if (usedFiles.length) h.sourceAttachment = { filename: usedFiles[0] };
        (perThreadResults[h.tid] ||= []).push(h);
      }
      console.log(`[lodging-scan] pdf tid=${t.id} pdfs=${docBlocks.length} stop=${stopReason} rows=${rows.length}`);
    } catch (e) {
      errors.push({ kind: "anthropic_error", phase: "pdf_thread", tid: t.id, status: e.status, detail: (e.detail || "").slice(0, 300) });
    }
  }

  // Flatten + cache + enhancement log.
  for (const t of fresh) {
    const result = perThreadResults[t.id] || [];
    claudeLodgings.push(...result);
    await putCachedThread("lodging", t.id, {
      lastMsgMs: t.lastMsgMs,
      bodyHash: t.bodyHash,
      result,
      stopReason: lastStopReason,
      footerStripSaved: t.footerStripSaved,
      attachmentFingerprints: t.attachmentFingerprints,
    });
    if (Array.isArray(t.prevResult) && t.prevResult.length) {
      const prevByKey = Object.fromEntries(t.prevResult.map(r => [`${t.id}:${r.confirmNo || r.name}`, r]));
      for (const h of result) {
        const key = `${t.id}:${h.confirmNo || h.name}`;
        const prev = prevByKey[key];
        if (prev) await logEnhancement("lodging", key, prev, h, { scanRunId: runId, source: "lodging-scan", scanner: "lodging", userId: user.id, userEmail: user.email });
      }
    }
  }

  const rawLodgings = [...cacheHits, ...claudeLodgings];

  const lodgings = rawLodgings
    .filter(h => h.name && h.checkIn && h.checkOut)
    .map(h => {
      const { flags, fixed } = validateCommon(h, {
        tourStart, tourEnd,
        dateKeys: ["checkIn", "checkOut"],
        stopwordKeys: ["name", "city", "pax"],
        codeKeys: { confirmNo: "confirmNo" },
      });
      const merged = { ...fixed, validationFlags: [...new Set([...(h.validationFlags || []), ...flags])] };
      return {
        ...merged,
        id: `hotel_${(h.tid || "").slice(-6)}_${(h.confirmNo || Math.random().toString(36).slice(2, 6)).replace(/\s/g, "").slice(0, 8)}`,
        status: "pending",
        rooms: [],
        todos: [],
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
    lodgings,
    threadsFound: threads.length,
    scanRunId: runId,
    threadsCached: threads.length - fresh.length,
    threadsParsed: fresh.length,
    attachmentsScanned,
    tokensUsed: inputTokens + outputTokens,
  });
};
