// scanMemory.js — shared memory + history for Gmail scanners.
// Persists scan_runs (per-invocation metadata) and scan_thread_cache (per-thread
// memoization). All writes use SUPABASE_SERVICE_KEY — called from api/* only.

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const TEAM_ID = "dos-bbno-2026";

// Per-million-token pricing in cents. claude-sonnet-4-* family.
// Keep synced with https://www.anthropic.com/pricing — good enough for internal dashboards.
const PRICE_PER_MTOK = {
  input_cents: 300,             // $3/Mtok fresh input
  output_cents: 1500,           // $15/Mtok output
  cache_creation_cents: 375,    // $3.75/Mtok cache write (1.25x input)
  cache_read_cents: 30,         // $0.30/Mtok cache read (0.1x input)
};

function client() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function hashBody(subject, from, body) {
  return crypto
    .createHash("sha256")
    .update(`${subject || ""}\n${from || ""}\n${body || ""}`)
    .digest("hex");
}

function fingerprintAttachments(list) {
  // [{filename,size,attachmentId,internalDate}] -> stable signature for cache invalidation.
  return (list || [])
    .map(a => `${a.filename || ""}|${a.size || 0}|${a.attachmentId || ""}`)
    .sort();
}

function shouldUseCached(cacheRow, lastMsgMs, bodyHash, attachmentFingerprints = []) {
  if (!cacheRow) return false;
  if (cacheRow.body_hash !== bodyHash) return false;
  if (lastMsgMs && cacheRow.last_msg_ms !== lastMsgMs) return false;
  const prev = JSON.stringify(cacheRow.attachment_fingerprints || []);
  const curr = JSON.stringify(attachmentFingerprints || []);
  if (prev !== curr) return false;
  return true;
}

function computeCostCents(inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0) {
  const inC       = (inputTokens         * PRICE_PER_MTOK.input_cents)           / 1_000_000;
  const outC      = (outputTokens        * PRICE_PER_MTOK.output_cents)          / 1_000_000;
  const readC     = (cacheReadTokens     * PRICE_PER_MTOK.cache_read_cents)      / 1_000_000;
  const createC   = (cacheCreationTokens * PRICE_PER_MTOK.cache_creation_cents)  / 1_000_000;
  return Math.round(inC + outC + readC + createC);
}

async function startScanRun({ scanner, userId, params = {} }) {
  const sb = client();
  const { data, error } = await sb
    .from("scan_runs")
    .insert({ scanner, user_id: userId, team_id: TEAM_ID, params })
    .select("id, started_at")
    .single();
  if (error) { console.warn("[scanMemory] startScanRun:", error.message); return { runId: null, startedAt: Date.now() }; }
  return { runId: data.id, startedAt: new Date(data.started_at).getTime() };
}

async function finishScanRun(runId, stats) {
  if (!runId) return;
  const sb = client();
  const {
    threadsFound = 0, threadsCached = 0, threadsParsed = 0,
    attachmentsScanned = 0,
    inputTokens = 0, outputTokens = 0,
    cacheReadTokens = 0, cacheCreationTokens = 0,
    stopReasons = {}, errors = [],
    startedAt = null,
  } = stats || {};
  const finished = new Date();
  const duration = startedAt ? finished.getTime() - startedAt : null;
  const costCents = computeCostCents(inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);
  if (cacheReadTokens || cacheCreationTokens) {
    const savedCents = Math.round((cacheReadTokens * (PRICE_PER_MTOK.input_cents - PRICE_PER_MTOK.cache_read_cents)) / 1_000_000);
    console.log(`[scanMemory] cache: read=${cacheReadTokens} created=${cacheCreationTokens} saved≈$${(savedCents / 100).toFixed(4)}`);
  }
  const { error } = await sb.from("scan_runs").update({
    finished_at: finished.toISOString(),
    duration_ms: duration,
    threads_found: threadsFound,
    threads_cached: threadsCached,
    threads_parsed: threadsParsed,
    attachments_scanned: attachmentsScanned,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: cacheReadTokens,
    cache_creation_tokens: cacheCreationTokens,
    cost_cents: costCents,
    stop_reasons: stopReasons,
    errors,
  }).eq("id", runId);
  if (error) console.warn("[scanMemory] finishScanRun:", error.message);
}

async function getCachedThread(scanner, threadId) {
  const sb = client();
  const { data, error } = await sb
    .from("scan_thread_cache")
    .select("*")
    .eq("scanner", scanner)
    .eq("thread_id", threadId)
    .maybeSingle();
  if (error) { console.warn("[scanMemory] getCachedThread:", error.message); return null; }
  return data || null;
}

async function putCachedThread(scanner, threadId, payload) {
  const sb = client();
  const row = {
    scanner, thread_id: threadId, team_id: TEAM_ID,
    last_msg_ms: payload.lastMsgMs || null,
    body_hash: payload.bodyHash || null,
    result: payload.result ?? null,
    stop_reason: payload.stopReason || null,
    footer_strip_saved_chars: payload.footerStripSaved ?? null,
    attachment_fingerprints: payload.attachmentFingerprints || [],
    parsed_at: new Date().toISOString(),
  };
  const { error } = await sb
    .from("scan_thread_cache")
    .upsert(row, { onConflict: "scanner,thread_id" });
  if (error) console.warn("[scanMemory] putCachedThread:", error.message);
}

// Diff old vs new, return only fields whose value changed (ignoring null-to-null).
function diffRecord(before, after) {
  const b = before || {}, a = after || {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changed = {};
  for (const k of keys) {
    const bv = b[k], av = a[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) changed[k] = { before: bv ?? null, after: av ?? null };
  }
  return changed;
}

async function logEnhancement(entityType, entityId, before, after, meta = {}) {
  const diff = diffRecord(before, after);
  if (!Object.keys(diff).length) return; // no-op if nothing changed
  const sb = client();
  const action = before ? "enhanced" : "created";
  const { error } = await sb.from("audit_log").insert({
    user_id: meta.userId || null,
    user_email: meta.userEmail || null,
    team_id: TEAM_ID,
    entity_type: entityType,
    entity_id: String(entityId),
    action,
    before_value: before || null,
    after_value: after || null,
    metadata: { ...(meta || {}), diff, source: meta.source || "scanner" },
  });
  if (error) console.warn("[scanMemory] logEnhancement:", error.message);
}

// Convenience: merge a per-scanner stop_reason into a histogram object.
function bumpStopReason(map, reason) {
  if (!reason) return map;
  map[reason] = (map[reason] || 0) + 1;
  return map;
}

module.exports = {
  TEAM_ID,
  hashBody,
  fingerprintAttachments,
  shouldUseCached,
  computeCostCents,
  startScanRun,
  finishScanRun,
  getCachedThread,
  putCachedThread,
  logEnhancement,
  diffRecord,
  bumpStopReason,
};
