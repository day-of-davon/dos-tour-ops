// api/intel.js — Vercel serverless function
const { createClient } = require("@supabase/supabase-js");
const { gmailSearch, gmailGetThread, decodeB64, extractBody, extractJson } = require("./lib/gmail");
const { ANTHROPIC_URL, ANTHROPIC_HEADERS, DEFAULT_MODEL } = require("./lib/anthropic");

const CACHE_TTL_MINUTES = 60;

function extractHeaders(thread) {
  const lastMsg = thread.messages?.[thread.messages.length - 1];
  const headers = lastMsg?.payload?.headers || [];
  const get = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  const body = (thread.messages || [])
    .map((m) => extractBody(m.payload))
    .filter(Boolean)
    .join("\n---\n")
    .slice(0, 1800);
  return {
    id: thread.id,
    subject: get("Subject"),
    from: get("From").replace(/<.*?>/, "").trim(),
    date: get("Date"),
    messageCount: thread.messages?.length || 1,
    bodySnippet: body,
  };
}

// ── Label scan helpers ───────────────────────────────────────────────────────

const FLIGHT_SENDERS = [/@t\.delta\.com/i, /deltaairlines@/i, /receipts@united\.com/i, /no-?reply@.*united/i, /no-?reply@info\.email\.aa\.com/i, /notification@.*aircanada/i, /noreply@.*aa\.com/i, /receipts@southwest/i];
const SETTLEMENT_SUBJECT = [/settlement/i, /box\s*office\s*report/i, /payout/i, /gross\s*receipts/i, /nightly\s*report/i, /final\s*count/i];
const FLIGHT_SUBJECT = [/your\s+flight\s+receipt/i, /booking\s+confirmation/i, /flight\s+receipt/i, /e-?ticket/i, /time\s+to\s+check\s+in/i, /it'?s\s+time\s+to\s+check\s+in/i, /trip\s+(confirmation|details)/i, /your\s+.*trip\s+details/i, /reservation\s+confirmed/i, /your\s+purchase\s+with\s+united/i, /flight.*receipt/i, /thanks\s+for\s+your\s+purchase/i];
const FLIGHT_NOISE_SUBJECT = [/check\s*in\s*(is\s*)?open/i, /time\s+to\s+check\s+in/i, /it'?s\s+time\s+to\s+check\s+in/i, /you'?ve\s+been\s+upgraded/i, /menu\s+for\s+your.*flight/i, /important\s+notice\s+about\s+your\s+bag/i, /gate\s+change/i, /skymiles\s+account\s+has\s+been\s+updated/i, /welcome.*sky\s+club/i];
const ACTION_REQUIRED_PATTERNS = [/please\s+(sign|fill\s+out|complete|return|confirm|respond|approve)/i, /sign\s+and\s+return/i, /do\s+we\s+know/i, /any\s+update\s+on/i, /checking\s+(back|in\s+here)/i, /following\s+up/i, /just\s+a\s+reminder/i, /bumping\s+this/i, /needed\s+by/i, /deadline/i, /awaiting\s+your/i, /please\s+fill\s+out/i, /wanted\s+to\s+check\s+in/i];

function classifyThread(subject, from) {
  const s = subject || ""; const f = from || "";
  if (SETTLEMENT_SUBJECT.some(p => p.test(s))) return "SETTLEMENT";
  if (FLIGHT_SENDERS.some(p => p.test(f)) || FLIGHT_SUBJECT.some(p => p.test(s))) return "CREW_FLIGHT";
  if (/merch|merchandise/i.test(s)) return "MERCH";
  if (/guest\s*list|comp\s+list|box\s+office/i.test(s)) return "GUEST_LIST";
  if (/advance|rider|stage\s+plot|catering|load.?in|crew\s+call|show\s+day/i.test(s)) return "ADVANCE";
  if (/production|lighting|backline|rigging|pyro|load\s+out/i.test(s)) return "PRODUCTION";
  if (/immigration|permit|visa|customs/i.test(s)) return "LEGAL";
  return "MISC";
}

function isFlightNoise(subject) {
  return FLIGHT_NOISE_SUBJECT.some(p => p.test(subject || ""));
}

function extractFlightKey(subject, snippet) {
  const combined = (subject || "") + " " + (snippet || "");
  const nameMatch = combined.match(/(?:Hi|Dear|Hello)[,\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  const travMatch = combined.match(/(?:Traveler|Passenger):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  const name = (nameMatch || travMatch)?.[1]?.toLowerCase().replace(/\s+/g, "_") || "";
  const dateMatch = combined.match(/\b(\d{2}(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2})\b/i) ||
    combined.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+\d{4})?/i);
  const dep = dateMatch?.[0]?.toLowerCase().replace(/\s+/g, "") || "";
  const routeMatch = (subject || "").match(/\b([A-Z]{3})\s*[→>\-–]+\s*([A-Z]{3})\b/);
  const route = routeMatch ? `${routeMatch[1]}_${routeMatch[2]}`.toLowerCase() : "";
  return `${name}__${dep}__${route}`;
}

function deduplicateFlights(threads) {
  const groups = {}; const standalone = [];
  for (const t of threads) {
    if (isFlightNoise(t.subject)) continue;
    const key = extractFlightKey(t.subject, t.bodySnippet);
    if (key === "____") { standalone.push(t); continue; }
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  const kept = [...standalone];
  for (const group of Object.values(groups)) {
    group.sort((a, b) => {
      const aR = /receipt|confirmation|booking/i.test(a.subject) ? 0 : 1;
      const bR = /receipt|confirmation|booking/i.test(b.subject) ? 0 : 1;
      return aR - bR;
    });
    kept.push({ ...group[0], _dedupedFrom: group.length });
  }
  return kept;
}

function detectActionSignal(subject, snippet) {
  const combined = (subject || "") + " " + (snippet || "").slice(0, 300);
  for (const p of ACTION_REQUIRED_PATTERNS) {
    if (p.test(combined)) return p.source.replace(/\\s\+/g, "_").replace(/[^a-z_]/gi, "").toLowerCase().slice(0, 30);
  }
  return null;
}

function matchShow(thread, shows) {
  const combined = ((thread.subject || "") + " " + (thread.bodySnippet || "")).toLowerCase();
  let best = null; let bestScore = 0;
  for (const show of shows) {
    let score = 0;
    const venue = (show.venue || "").toLowerCase().replace(/['']/g, "");
    const city = (show.city || "").toLowerCase().split(",")[0].trim();
    if (venue.length > 4 && combined.includes(venue)) score += 8;
    else { for (const w of venue.split(/\s+/).filter(w => w.length > 3)) { if (combined.includes(w)) score += 2; } }
    if (city.length > 3 && combined.includes(city)) score += 3;
    const threadMs = new Date(thread.date).getTime();
    if (!isNaN(threadMs)) {
      const showMs = new Date(show.date + "T12:00:00").getTime();
      const diff = Math.abs((showMs - threadMs) / 86400000);
      if (diff <= 14) score += 2; if (diff <= 3) score += 3;
    }
    if (score > bestScore) { bestScore = score; best = show; }
  }
  return bestScore >= 5 ? best : null;
}

async function handleLabelScan(req, res, user, supabase) {
  const { googleToken, forceRefresh, shows: showsArr, userEmail } = req.body || {};
  if (!googleToken) return res.status(400).json({ error: "Missing googleToken" });
  const LABEL_SCAN_ID = "__label_scan";

  if (!forceRefresh) {
    const { data: cached } = await supabase.from("intel_cache").select("intel, cached_at").eq("user_id", user.id).eq("show_id", LABEL_SCAN_ID).single();
    if (cached) {
      const ageMin = (Date.now() - new Date(cached.cached_at).getTime()) / 60000;
      if (ageMin < CACHE_TTL_MINUTES) return res.json({ ...cached.intel, fromCache: true });
    }
  }

  // Queries beyond label:bbno$ — airlines rarely label their receipts
  const EXTRA_QUERIES = [
    `from:(DeltaAirLines@t.delta.com) newer_than:60d`,
    `from:(notification@notification.aircanada.ca) newer_than:60d`,
    `from:(no-reply@info.email.aa.com) newer_than:60d`,
    `from:(Receipts@united.com) newer_than:60d`,
    `from:(noreply@uber.com) newer_than:30d`,
    `subject:settlement newer_than:30d`,
    `subject:"flight receipt" newer_than:60d`,
    `subject:"booking confirmation" (flight OR airline) newer_than:60d`,
  ];

  let threadIds = [];
  try {
    const [labelIds, ...extraResults] = await Promise.all([
      gmailSearch(googleToken, "label:bbno$", 50),
      ...EXTRA_QUERIES.map(q => gmailSearch(googleToken, q, 20).catch(() => [])),
    ]);
    threadIds = [...new Set([...labelIds, ...extraResults.flat()])];
  } catch (e) {
    if (e.message.includes("401") || e.message.includes("403")) return res.status(402).json({ error: "gmail_token_expired" });
    return res.status(502).json({ error: e.message });
  }

  const rawThreads = (await Promise.all(threadIds.map(id => gmailGetThread(googleToken, id)))).filter(Boolean).map(t => {
    const h = extractHeaders(t);
    return { ...h, bodySnippet: (h.bodySnippet || "").slice(0, 400) };
  });

  const shows = Array.isArray(showsArr) ? showsArr : [];
  const classified = rawThreads.map(t => ({ ...t, category: classifyThread(t.subject, t.from), _show: matchShow(t, shows) }));

  const senderCounts = {};
  for (const t of classified) { const k = (t.from || "").toLowerCase().replace(/\s+/g, ""); senderCounts[k] = (senderCounts[k] || 0) + 1; }

  const byShow = {}; const settlements = []; const crewFlightsRaw = []; const advanceItems = []; const actionRequired = [];
  const dedupedFlights = deduplicateFlights(classified.filter(t => t.category === "CREW_FLIGHT"));
  const keptFlightIds = new Set(dedupedFlights.map(t => t.id));

  for (const t of classified) {
    if (t.category === "CREW_FLIGHT" && !keptFlightIds.has(t.id)) continue;
    const showId = t._show ? `${t._show.venue}__${t._show.date}`.toLowerCase().replace(/\s+/g, "_") : null;
    if (showId) { if (!byShow[showId]) byShow[showId] = []; byShow[showId].push(t.id); }
    const base = { id: t.id, subject: t.subject, from: t.from, date: t.date, snippet: (t.bodySnippet || "").slice(0, 160), showId };
    if (t.category === "SETTLEMENT") settlements.push(base);
    else if (t.category === "CREW_FLIGHT") crewFlightsRaw.push(base);
    else if (["ADVANCE","PRODUCTION","MERCH","LEGAL","GUEST_LIST"].includes(t.category)) advanceItems.push({ ...base, category: t.category });
    const signal = detectActionSignal(t.subject, t.bodySnippet);
    const senderKey = (t.from || "").toLowerCase().replace(/\s+/g, "");
    if (signal || senderCounts[senderKey] >= 2) actionRequired.push({ ...base, signal: signal || "repeat_sender" });
  }

  const payload = { byShow, settlements, crewFlights: crewFlightsRaw, advanceItems, actionRequired, labelThreadsFound: threadIds.length, scannedAt: new Date().toISOString() };

  await supabase.from("intel_cache").upsert(
    { user_id: user.id, show_id: LABEL_SCAN_ID, intel: payload, gmail_threads_found: threadIds.length, cached_at: new Date().toISOString(), is_shared: false, user_email: userEmail || null },
    { onConflict: "user_id,show_id" }
  );

  return res.json({ ...payload, fromCache: false });
}

// ── Main handler ─────────────────────────────────────────────────────────────

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

  const { show, googleToken, forceRefresh, userEmail, action, isShared } = req.body || {};
  if (action === "labelScan") return handleLabelScan(req, res, user, supabase);
  if (!show) return res.status(400).json({ error: "Missing show" });

  const showId = `${show.venue}__${show.date}`.toLowerCase().replace(/\s+/g, "_");

  // ── Toggle share without re-scraping ────────────────────────────────────────
  if (action === "toggleShare") {
    await supabase
      .from("intel_cache")
      .update({ is_shared: !!isShared })
      .eq("user_id", user.id)
      .eq("show_id", showId);
    return res.json({ ok: true, isShared: !!isShared });
  }

  if (!googleToken) return res.status(400).json({ error: "Missing googleToken" });

  // ── Fetch user's own cache ───────────────────────────────────────────────────
  if (!forceRefresh) {
    const { data: cached } = await supabase
      .from("intel_cache")
      .select("intel, gmail_threads_found, cached_at, is_shared")
      .eq("user_id", user.id)
      .eq("show_id", showId)
      .single();

    if (cached) {
      const ageMinutes = (Date.now() - new Date(cached.cached_at).getTime()) / 60000;
      if (ageMinutes < CACHE_TTL_MINUTES) {
        const { data: sharedByOthers } = await supabase
          .from("intel_cache")
          .select("intel, user_email, cached_at")
          .eq("show_id", showId)
          .eq("is_shared", true)
          .neq("user_id", user.id);
        return res.json({
          intel: cached.intel,
          gmailThreadsFound: cached.gmail_threads_found,
          isShared: cached.is_shared,
          sharedByOthers: sharedByOthers || [],
          fromCache: true,
          cachedAt: cached.cached_at,
        });
      }
    }
  }

  const queries = [
    `"${show.venue}" newer_than:30d`,
    `"${show.city}" newer_than:30d`,
    `"bbno$" "${show.city}" newer_than:30d`,
    `"bbno$" "${show.venue}" newer_than:30d`,
    `"bbno" "${show.venue}" newer_than:30d`,
    `"bbno" "${show.city}" newer_than:30d`,
  ];

  const seenIds = new Set();
  for (const q of queries) {
    try {
      const ids = await gmailSearch(googleToken, q, 15);
      ids.forEach((id) => seenIds.add(id));
    } catch (e) {
      console.error("Gmail search error:", e.message);
      if (e.message.includes("401")) return res.status(402).json({ error: "gmail_token_expired" });
    }
  }

  const ids = [...seenIds].slice(0, 8);
  const threads = (await Promise.all(ids.map((id) => gmailGetThread(googleToken, id))))
    .filter(Boolean)
    .map(extractHeaders)
    .map((t) => ({ ...t, bodySnippet: (t.bodySnippet || "").slice(0, 400) }));

  const sysPrompt = `You are an email intelligence parser for concert touring operations. You work for Davon Johnson, Tour Manager at Day of Show, LLC.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.
Intent categories: ADVANCE, PRODUCTION, SETTLEMENT, LOGISTICS, LEGAL, FINANCE, MERCH, MEDIA, GUEST_LIST, ADMIN, CATERING
Owner codes: DAVON, SHECK, DAN, MANAGEMENT, VENDOR, CREW, ACCOUNTANT
Priority: CRITICAL (show <10d), HIGH (<48h), MEDIUM, LOW
Status phrases: AWAITING RESPONSE, DRAFT READY, CONFIRMED, NEEDS DECISION, PENDING VENDOR, SENT, OVERDUE, RESOLVED`;

  const userPrompt = `Here are Gmail threads (incl. body excerpts) for show: ${show.venue} in ${show.city} on ${show.date} (artist: ${show.artist}).
Thread data:
${JSON.stringify(threads, null, 2)}
For each thread, classify intent, current status, and sender name. Provide a short snippet (<= 100 chars). Be concise — no verbose descriptions.
Generate follow-up action items with owner, priority, and deadline.
Extract key contacts (name, role, email).
Extract every time mention with the field it applies to and the source thread id. Allowed fields: doors, curfew, busArrive, crewCall, venueAccess, mgTime, soundcheck, set.
Return this exact JSON:
{
  "threads": [{"id":"t1","tid":"<thread_id>","subject":"<subject>","from":"<sender_name>","intent":"<INTENT>","status":"<STATUS>","date":"<Mon DD>","snippet":"<<=200 chars>"}],
  "followUps": [{"action":"<action>","owner":"<OWNER>","priority":"<PRIORITY>","deadline":"<Mon DD>"}],
  "showContacts": [{"name":"<n>","role":"<role>","email":"<email>"}],
  "schedule": [{"time":"<HH:MM or 7pm>","item":"<short label>","field":"<doors|curfew|busArrive|crewCall|venueAccess|mgTime|soundcheck|set>","tid":"<thread_id>"}],
  "lastRefreshed": "${new Date().toISOString()}"
}`;

  const anthropicResp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: ANTHROPIC_HEADERS,
    body: JSON.stringify({
      model: DEFAULT_MODEL,
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

  const textContent = (anthropicData.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  console.log("[intel] stop_reason:", anthropicData.stop_reason, "| text length:", textContent.length);
  console.log("[intel] raw (first 600):", textContent.slice(0, 600));

  // When max_tokens truncates mid-JSON, salvage complete objects from each array key
  function salvageArray(text, key) {
    const match = text.match(new RegExp(`"${key}"\\s*:\\s*\\[`));
    if (!match) return [];
    const items = [];
    let depth = 0, objStart = -1, inStr = false, esc = false;
    for (let i = match.index + match[0].length - 1; i < text.length; i++) {
      const c = text[i];
      if (esc) { esc = false; continue; }
      if (c === "\\" && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") { if (depth === 0) objStart = i; depth++; }
      else if (c === "}") {
        depth--;
        if (depth === 0 && objStart !== -1) {
          try { items.push(JSON.parse(text.slice(objStart, i + 1))); } catch {}
          objStart = -1;
        }
      } else if (c === "]" && depth === 0) break;
    }
    return items;
  }

  let intel = extractJson(textContent);

  // Validate shape
  if (intel && !Array.isArray(intel.threads)) {
    console.error("[intel] parsed but missing threads array, keys:", Object.keys(intel));
    intel = null;
  }

  // Partial recovery for max_tokens truncation
  if (!intel && anthropicData.stop_reason === "max_tokens") {
    const threads   = salvageArray(textContent, "threads");
    const followUps = salvageArray(textContent, "followUps");
    const showContacts = salvageArray(textContent, "showContacts");
    const schedule  = salvageArray(textContent, "schedule");
    if (threads.length > 0 || followUps.length > 0) {
      intel = { threads, followUps, showContacts, schedule, lastRefreshed: new Date().toISOString(), _partial: true };
      console.log(`[intel] partial recovery: ${threads.length} threads, ${followUps.length} followUps`);
    }
  }

  if (!intel) {
    console.error("[intel] parse failed. stop_reason:", anthropicData.stop_reason, "| raw:", textContent.slice(0, 1000));
    return res.json({
      intel: null,
      gmailThreadsFound: threads.length,
      fromCache: false,
      debug: { stopReason: anthropicData.stop_reason, rawText: textContent.slice(0, 800) },
    });
  }

  // Preserve existing is_shared flag on refresh
  const { data: existing } = await supabase
    .from("intel_cache")
    .select("is_shared")
    .eq("user_id", user.id)
    .eq("show_id", showId)
    .single();

  await supabase.from("intel_cache").upsert(
    {
      user_id: user.id,
      show_id: showId,
      intel,
      gmail_threads_found: threads.length,
      cached_at: new Date().toISOString(),
      is_shared: existing?.is_shared ?? false,
      user_email: userEmail || null,
    },
    { onConflict: "user_id,show_id" }
  );

  const { data: sharedByOthers } = await supabase
    .from("intel_cache")
    .select("intel, user_email, cached_at")
    .eq("show_id", showId)
    .eq("is_shared", true)
    .neq("user_id", user.id);

  return res.json({
    intel,
    gmailThreadsFound: threads.length,
    isShared: existing?.is_shared ?? false,
    sharedByOthers: sharedByOthers || [],
    fromCache: false,
  });
};
