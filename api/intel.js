// api/intel.js — Vercel serverless function
const { createClient } = require("@supabase/supabase-js");
const { gmailSearch, gmailGetThread, decodeB64, extractBody, stripMarketingFooter, extractJson } = require("./lib/gmail");
const { ANTHROPIC_URL, ANTHROPIC_HEADERS, DEFAULT_MODEL } = require("./lib/anthropic");
const { startScanRun, finishScanRun, bumpStopReason } = require("./lib/scanMemory");

const CACHE_TTL_MINUTES = 60;

// ── Tour context (injected into prompts for accurate owner routing + classification) ──
const TOUR_CONTEXT = {
  artist: "bbno$",
  tour: "Internet Explorer Tour",
  tm: "Davon Johnson (d.johnson@dayofshow.net)",
  crew: [
    "Davon Johnson — TM/TD",
    "Mike Sheck — PM Advance (mikesheck@l7touring.com)",
    "Dan Nudelman — PM On-site (dan@noodle.management)",
    "Sam Alavi — Artist Relations (sam@rightclick.gg)",
    "Matt Adler — Wasserman agent (madler@the.team)",
    "Ruairi Matthews — FOH Audio (ruairim@magentasound.ca)",
    "Alex Gumuchian — Headliner (bbno$)",
    "Grace Offerdahl — Merch",
    "Megan Putnam — Hospo/GL",
    "Olivia Mims — Transport Coordinator",
    "Tony Yacowar — CPA (tyacowar@dmcl.ca)",
  ],
  vendors: [
    "Pieter Smit — EU nightliner bus (nightliner@pietersmit.com, contact: Toby Jansen)",
    "Fly By Nite — EU truck/freight (job 56714, contact: Fiona Nolan)",
    "Neg Earth — LX/VX production (contact: Alex Griffiths)",
    "TSL Lighting — LX quote J38723 (contact: Gemma Jaques)",
    "BNP — local production vendor (Red Rocks)",
  ],
  ownerMap: "DAVON=Davon Johnson, SHECK=Mike Sheck (advance/promoter comms), DAN=Dan Nudelman (on-site/production), MANAGEMENT=Sam Alavi/Matt Adler/Wasserman, VENDOR=external vendors, CREW=tour crew members, ACCOUNTANT=Tony Yacowar",
};

// Extended window to 90d — EU tour bookings made Jan/Feb are within this range.
const EXTRA_QUERIES = [
  `from:(DeltaAirLines@t.delta.com) newer_than:90d`,
  `from:(notification@notification.aircanada.ca) newer_than:90d`,
  `from:(no-reply@info.email.aa.com) newer_than:90d`,
  `from:(Receipts@united.com) newer_than:90d`,
  `from:(noreply@ba.com) newer_than:90d`,
  `from:(do_not_reply@ba.com) newer_than:90d`,
  `from:(noreply@aerlingus.com) newer_than:90d`,
  `from:(noreply@ryanair.com) newer_than:90d`,
  `from:(no-reply@easyjet.com) newer_than:90d`,
  `from:(noreply@lufthansa.com) newer_than:90d`,
  `from:(noreply@airfrance.fr) newer_than:90d`,
  `from:(donotreply@klm.com) newer_than:90d`,
  `from:(noreply.com) newer_than:30d`,
  `from:(noreply@uber.com) newer_than:30d`,
  `subject:settlement newer_than:45d`,
  `subject:"flight receipt" newer_than:90d`,
  `subject:"booking confirmation" (flight OR airline) newer_than:90d`,
  `subject:"travel itinerary" newer_than:90d`,
  `"pieter smit" newer_than:180d`,
  `"fly by nite" OR "flybynite" newer_than:180d`,
  `"neg earth" newer_than:180d`,
  `"tsl lighting" newer_than:180d`,
  `subject:(immigration OR "work permit" OR carnet) newer_than:90d`,
  `(DUB OR MAN OR GLA OR LHR OR ZRH OR AMS OR CDG OR PRG OR BER OR WAW) (confirmation OR receipt OR itinerary) newer_than:90d`,
];

function buildTourContextBlock() {
  return `Tour: ${TOUR_CONTEXT.tour} by ${TOUR_CONTEXT.artist}.
TM: ${TOUR_CONTEXT.tm}.
Crew: ${TOUR_CONTEXT.crew.join("; ")}.
Vendors: ${TOUR_CONTEXT.vendors.join("; ")}.
Owner routing: ${TOUR_CONTEXT.ownerMap}.`;
}

function extractHeaders(thread) {
  // Use first message for Subject/From — replies and forwards skew metadata.
  const firstMsg = thread.messages?.[0];
  const headers = firstMsg?.payload?.headers || [];
  const get = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  const rawParts = (thread.messages || []).map((m) => extractBody(m.payload)).filter(Boolean);
  const strippedParts = rawParts.map(stripMarketingFooter);
  const rawLen = rawParts.join("").length;
  const strippedLen = strippedParts.join("").length;
  if (rawLen > strippedLen) console.log(`[intel] footer-strip tid=${thread.id}: saved ${rawLen - strippedLen} chars`);
  const body = strippedParts.join("\n---\n").slice(0, 5000); // was 1800 — too short for flight receipts and multi-message threads
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

const FLIGHT_SENDERS = [
  /@t\.delta\.com/i, /deltaairlines@/i, /receipts@united\.com/i, /no-?reply@.*united/i,
  /no-?reply@info\.email\.aa\.com/i, /notification@.*aircanada/i, /noreply@.*aa\.com/i,
  /receipts@southwest/i, /noreply@ba\.com/i, /do_not_reply@ba\.com/i, /noreply@lufthansa/i,
  /noreply@airfrance/i, /donotreply@klm/i, /noreply@aerlingus/i, /noreply@ryanair/i,
  /no-reply@easyjet/i, /noreply@wizzair/i, /booking@norwegian/i, /noreply@swiss/i,
  /noreply@lot\.com/i, /noreply@iberia/i,
];

const SETTLEMENT_SUBJECT = [
  /settlement/i, /box\s*office\s*report/i, /payout/i, /gross\s*receipts/i,
  /nightly\s*report/i, /final\s*count/i, /deal\s*memo/i, /show\s*report/i,
];

const FLIGHT_SUBJECT = [
  /your\s+flight\s+receipt/i, /booking\s+confirmation/i, /flight\s+receipt/i,
  /e-?ticket/i, /time\s+to\s+check\s+in/i, /it'?s\s+time\s+to\s+check\s+in/i,
  /trip\s+(confirmation|details)/i, /your\s+.*trip\s+details/i, /reservation\s+confirmed/i,
  /your\s+purchase\s+with\s+united/i, /flight.*receipt/i, /thanks\s+for\s+your\s+purchase/i,
  /itinerary\s+(confirmation|receipt)/i, /travel\s+itinerary/i,
];

const FLIGHT_NOISE_SUBJECT = [
  /check\s*in\s*(is\s*)?open/i, /time\s+to\s+check\s+in/i, /it'?s\s+time\s+to\s+check\s+in/i,
  /you'?ve\s+been\s+upgraded/i, /menu\s+for\s+your.*flight/i, /important\s+notice\s+about\s+your\s+bag/i,
  /gate\s+change/i, /skymiles\s+account\s+has\s+been\s+updated/i, /welcome.*sky\s+club/i,
  /miles?\s+(earned|credited|summary)/i, /your\s+(credit\s+card|rewards)\s+statement/i,
];

const ACTION_REQUIRED_PATTERNS = [
  /please\s+(sign|fill\s+out|complete|return|confirm|respond|approve)/i,
  /sign\s+and\s+return/i, /do\s+we\s+know/i, /any\s+update\s+on/i,
  /checking\s+(back|in\s+here)/i, /following\s+up/i, /just\s+a\s+reminder/i,
  /bumping\s+this/i, /needed\s+by/i, /deadline/i, /awaiting\s+your/i,
  /please\s+fill\s+out/i, /wanted\s+to\s+check\s+in/i,
  /outstanding/i, /overdue/i, /urgent/i, /asap/i, /time\s*sensitive/i,
];

// EU touring vendor / production patterns not covered by generic patterns
const EU_TOURING_SUBJECT = [
  /pieter\s*smit/i, /nightliner/i, /fly\s*by\s*nite/i, /neg\s*earth/i, /tsl\s*lighting/i,
  /immigration\s*(form|permit|clearance)/i, /work\s*permit/i, /visa\s*(application|approval)/i,
  /carnets?/i, /ata\s*carnet/i, /customs\s*clearance/i,
  /backline/i, /rigging/i, /pyro/i,
  /hotel\s*(confirmation|reservation|voucher)/i, /room\s*block/i,
  /ground\s*(transport|transfer)/i, /coach\s+(hire|charter)/i,
];

function classifyThread(subject, from) {
  const s = subject || ""; const f = from || "";
  if (SETTLEMENT_SUBJECT.some(p => p.test(s))) return "SETTLEMENT";
  if (FLIGHT_SENDERS.some(p => p.test(f)) || FLIGHT_SUBJECT.some(p => p.test(s))) return "CREW_FLIGHT";
  if (/merch|merchandise|t-?shirt|inventory/i.test(s)) return "MERCH";
  if (/guest\s*list|comp\s+list|box\s+office/i.test(s)) return "GUEST_LIST";
  if (/advance|rider|stage\s+plot|catering|load.?in|crew\s+call|show\s+day/i.test(s)) return "ADVANCE";
  if (/production|lighting|backline|rigging|pyro|load\s+out|tech\s+spec/i.test(s)) return "PRODUCTION";
  if (/immigration|permit|visa|customs|carnet|work\s+permit/i.test(s)) return "LEGAL";
  if (/hotel|accommodation|room\s+block/i.test(s)) return "LOGISTICS";
  if (/ground\s+transport|transfer|coach|nightliner|truck|freight/i.test(s)) return "LOGISTICS";
  if (EU_TOURING_SUBJECT.some(p => p.test(s))) return "PRODUCTION";
  if (/invoice|payment|wire|bank|ach|remittance/i.test(s)) return "FINANCE";
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
  // Also try PNR-based dedup — 6-char alphanum codes in subject are usually PNRs
  const pnrMatch = (subject || "").match(/\b([A-Z0-9]{6})\b/);
  const pnr = pnrMatch ? pnrMatch[1].toLowerCase() : "";
  // Prefer PNR key when available (most reliable dedup signal)
  if (pnr && pnr !== "flight" && pnr !== "ticket") return `pnr__${pnr}`;
  return `${name}__${dep}__${route}`;
}

function deduplicateFlights(threads) {
  const groups = {}; const standalone = [];
  for (const t of threads) {
    if (isFlightNoise(t.subject)) continue;
    const key = extractFlightKey(t.subject, t.bodySnippet);
    if (key === "____" || key === "pnr__") { standalone.push(t); continue; }
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  const kept = [...standalone];
  for (const group of Object.values(groups)) {
    group.sort((a, b) => {
      const aR = /receipt|confirmation|booking|itinerary/i.test(a.subject) ? 0 : 1;
      const bR = /receipt|confirmation|booking|itinerary/i.test(b.subject) ? 0 : 1;
      return aR - bR;
    });
    kept.push({ ...group[0], _dedupedFrom: group.length });
  }
  return kept;
}

function detectActionSignal(subject, snippet) {
  const combined = (subject || "") + " " + (snippet || "").slice(0, 400);
  for (const p of ACTION_REQUIRED_PATTERNS) {
    if (p.test(combined)) return p.source.replace(/\\s\+/g, "_").replace(/[^a-z_]/gi, "").toLowerCase().slice(0, 30);
  }
  return null;
}

function bucketActionItem(signal, category, dateStr) {
  const ageHours = (Date.now() - new Date(dateStr).getTime()) / 3600000;
  const s = signal || "";
  if (category === "LEGAL" || /urgent|asap|deadline|overdue|time.?sensitive|needed_by/.test(s)) return "urgent";
  if (/please_sign|sign_and_return|awaiting_your|please_fill|please_complete|please_return|please_confirm|please_respond/.test(s)) return "input";
  if (/following_up|checking_back|bumping|any_update|checking_in_here|do_we_know/.test(s)) return "standing_by";
  if (ageHours < 60) return "fresh";
  return "active";
}

const TRANSACTIONAL_SUBJECT = /confirmation|confirmed|reservation|your\s+stay|booking\s+ref|e-?ticket|itinerary|receipt|check-in\s+(is\s+)?open|time\s+to\s+check/i;
const CAT_PRI = { LEGAL: 0, ADVANCE: 1, PRODUCTION: 2, FINANCE: 3, MERCH: 4, LOGISTICS: 5, GUEST_LIST: 6, MISC: 7 };

function matchShow(thread, shows) {
  const combined = ((thread.subject || "") + " " + (thread.bodySnippet || "")).toLowerCase();
  let best = null; let bestScore = 0;
  for (const show of shows) {
    let score = 0;
    const venue = (show.venue || "").toLowerCase().replace(/['']/g, "");
    const city = (show.city || "").toLowerCase().split(",")[0].trim();
    const promoter = (show.promoter || "").toLowerCase();
    const country = (show.country || "").toLowerCase();

    // Venue match (strongest signal)
    if (venue.length > 4 && combined.includes(venue)) score += 10;
    else { for (const w of venue.split(/\s+/).filter(w => w.length > 3)) { if (combined.includes(w)) score += 2; } }

    // City match
    if (city.length > 3 && combined.includes(city)) score += 4;

    // Promoter match
    if (promoter.length > 3) {
      const promoterWords = promoter.split(/[/,\s]+/).filter(w => w.length > 4);
      for (const w of promoterWords) { if (combined.includes(w)) score += 3; }
    }

    // Country code match (useful for EU shows)
    if (country.length === 2 && combined.includes(country)) score += 1;

    // Temporal proximity
    const threadMs = new Date(thread.date).getTime();
    if (!isNaN(threadMs)) {
      const showMs = new Date(show.date + "T12:00:00").getTime();
      const diff = Math.abs((showMs - threadMs) / 86400000);
      if (diff <= 7) score += 3;
      else if (diff <= 21) score += 2;
      else if (diff <= 45) score += 1;
    }

    // Lower threshold from 5 to 4 — better recall, still filters pure noise
    if (score > bestScore) { bestScore = score; best = show; }
  }
  return bestScore >= 4 ? best : null;
}

async function handleBulkFetch(req, res, user, supabase) {
  const { googleToken, forceRefresh, shows: showsArr, userEmail } = req.body || {};
  if (!googleToken) return res.status(400).json({ error: "Missing googleToken" });
  const BULK_ID = "__bulk__";

  if (!forceRefresh) {
    const { data: cached } = await supabase.from("intel_cache").select("intel, cached_at").eq("user_id", user.id).eq("show_id", BULK_ID).single();
    if (cached) {
      const ageMin = (Date.now() - new Date(cached.cached_at).getTime()) / 60000;
      if (ageMin < CACHE_TTL_MINUTES) {
        return res.json({ ...cached.intel, fromCache: true });
      }
    }
  }

  let threadIds = [];
  try {
    const [labelIds, ...extraResults] = await Promise.all([
      gmailSearch(googleToken, "label:bbno$", 60),
      ...EXTRA_QUERIES.map(q => gmailSearch(googleToken, q, 25).catch(() => [])),
    ]);
    threadIds = [...new Set([...labelIds, ...extraResults.flat()])];
  } catch (e) {
    if (e.message.includes("401") || e.message.includes("403")) return res.status(402).json({ error: "gmail_token_expired" });
    return res.status(502).json({ error: e.message });
  }

  let rawThreads;
  try {
    rawThreads = (await Promise.all(threadIds.map(id => gmailGetThread(googleToken, id).catch(() => null)))).filter(Boolean).map(t => {
      const h = extractHeaders(t);
      return { ...h, bodySnippet: (h.bodySnippet || "").slice(0, 800) };
    });
  } catch (e) {
    console.error("[bulkFetch] thread fetch error:", e.message);
    return res.status(502).json({ error: e.message });
  }

  const shows = Array.isArray(showsArr) ? showsArr : [];
  const classified = rawThreads.map(t => ({ ...t, category: classifyThread(t.subject, t.from), _show: matchShow(t, shows) }));

  const byShow = {};
  const threadPool = {};
  for (const t of classified) {
    threadPool[t.id] = t;
    const showId = t._show ? `${t._show.venue}__${t._show.date}`.toLowerCase().replace(/\s+/g, "_") : null;
    if (showId) {
      if (!byShow[showId]) byShow[showId] = [];
      byShow[showId].push(t.id);
    }
  }

  // Compute labelScan output arrays from already-classified threads
  const senderCounts = {};
  for (const t of classified) { const k = (t.from || "").toLowerCase().replace(/\s+/g, ""); senderCounts[k] = (senderCounts[k] || 0) + 1; }

  const settlements = []; const crewFlightsRaw = []; const advanceItems = []; const actionRequired = [];
  const dedupedFlights = deduplicateFlights(classified.filter(t => t.category === "CREW_FLIGHT"));
  const keptFlightIds = new Set(dedupedFlights.map(t => t.id));

  for (const t of classified) {
    if (t.category === "CREW_FLIGHT" && !keptFlightIds.has(t.id)) continue;
    const showId = t._show ? `${t._show.venue}__${t._show.date}`.toLowerCase().replace(/\s+/g, "_") : null;
    const base = { id: t.id, subject: t.subject, from: t.from, date: t.date, snippet: (t.bodySnippet || "").slice(0, 200), showId, category: t.category };
    if (t.category === "SETTLEMENT") settlements.push(base);
    else if (t.category === "CREW_FLIGHT") crewFlightsRaw.push(base);
    else if (["ADVANCE","PRODUCTION","MERCH","LEGAL","GUEST_LIST","LOGISTICS","FINANCE"].includes(t.category)) advanceItems.push({ ...base, category: t.category });
    const isTransactional = t.category === "CREW_FLIGHT" ||
      TRANSACTIONAL_SUBJECT.test(t.subject || "");
    const signal = detectActionSignal(t.subject, t.bodySnippet);
    const senderKey = (t.from || "").toLowerCase().replace(/\s+/g, "");
    if (!isTransactional || signal) {
      if (signal || senderCounts[senderKey] >= 2) {
        actionRequired.push({ ...base, signal: signal || "repeat_sender", bucket: bucketActionItem(signal || "repeat_sender", t.category, t.date) });
      }
    }
  }

  actionRequired.sort((a, b) => {
    const pa = CAT_PRI[a.category] ?? 8; const pb = CAT_PRI[b.category] ?? 8;
    if (pa !== pb) return pa - pb;
    return new Date(b.date) - new Date(a.date);
  });

  const payload = { byShow, threadPool, settlements, crewFlights: crewFlightsRaw, advanceItems, actionRequired, threadCount: threadIds.length, labelThreadsFound: threadIds.length, scannedAt: new Date().toISOString() };

  await supabase.from("intel_cache").upsert(
    { user_id: user.id, show_id: BULK_ID, intel: payload, gmail_threads_found: threadIds.length, cached_at: new Date().toISOString(), is_shared: false, user_email: userEmail || null },
    { onConflict: "user_id,show_id" }
  );

  return res.json({ ...payload, fromCache: false });
}

async function handleLabelScan(req, res, user, supabase) {
  const { googleToken, forceRefresh, shows: showsArr, userEmail } = req.body || {};
  if (!googleToken) return res.status(400).json({ error: "Missing googleToken" });
  const LABEL_SCAN_ID = "__label_scan";
  const { runId, startedAt } = await startScanRun({ scanner: "intel", userId: user.id, params: { mode: "labelScan", forceRefresh: !!forceRefresh } });

  if (!forceRefresh) {
    const { data: cached } = await supabase.from("intel_cache").select("intel, cached_at").eq("user_id", user.id).eq("show_id", LABEL_SCAN_ID).single();
    if (cached) {
      const ageMin = (Date.now() - new Date(cached.cached_at).getTime()) / 60000;
      if (ageMin < CACHE_TTL_MINUTES) {
        await finishScanRun(runId, { threadsFound: 0, threadsCached: cached.intel?.labelThreadsFound || 0, startedAt });
        return res.json({ ...cached.intel, fromCache: true });
      }
    }
  }


  let threadIds = [];
  try {
    const [labelIds, ...extraResults] = await Promise.all([
      gmailSearch(googleToken, "label:bbno$", 60), // bumped from 50
      ...EXTRA_QUERIES.map(q => gmailSearch(googleToken, q, 25).catch(() => [])),
    ]);
    threadIds = [...new Set([...labelIds, ...extraResults.flat()])];
  } catch (e) {
    if (e.message.includes("401") || e.message.includes("403")) return res.status(402).json({ error: "gmail_token_expired" });
    return res.status(502).json({ error: e.message });
  }

  let rawThreads;
  try {
    rawThreads = (await Promise.all(threadIds.map(id => gmailGetThread(googleToken, id).catch(() => null)))).filter(Boolean).map(t => {
      const h = extractHeaders(t);
      return { ...h, bodySnippet: (h.bodySnippet || "").slice(0, 800) };
    });
  } catch (e) {
    console.error("[labelScan] thread fetch error:", e.message);
    return res.status(502).json({ error: `Gmail thread fetch failed: ${e.message}` });
  }

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
    const base = { id: t.id, subject: t.subject, from: t.from, date: t.date, snippet: (t.bodySnippet || "").slice(0, 200), showId, category: t.category };
    if (t.category === "SETTLEMENT") settlements.push(base);
    else if (t.category === "CREW_FLIGHT") crewFlightsRaw.push(base);
    else if (["ADVANCE","PRODUCTION","MERCH","LEGAL","GUEST_LIST","LOGISTICS","FINANCE"].includes(t.category)) advanceItems.push({ ...base, category: t.category });
    // Skip transactional confirmations (flight receipts, hotel bookings) unless a genuine action signal is present
    const isTransactional = t.category === "CREW_FLIGHT" ||
      TRANSACTIONAL_SUBJECT.test(t.subject || "");
    const signal = detectActionSignal(t.subject, t.bodySnippet);
    const senderKey = (t.from || "").toLowerCase().replace(/\s+/g, "");
    if (!isTransactional || signal) {
      if (signal || senderCounts[senderKey] >= 2) {
        actionRequired.push({ ...base, signal: signal || "repeat_sender", bucket: bucketActionItem(signal || "repeat_sender", t.category, t.date) });
      }
    }
  }

  actionRequired.sort((a, b) => {
    const pa = CAT_PRI[a.category] ?? 8; const pb = CAT_PRI[b.category] ?? 8;
    if (pa !== pb) return pa - pb;
    return new Date(b.date) - new Date(a.date);
  });

  const payload = { byShow, settlements, crewFlights: crewFlightsRaw, advanceItems, actionRequired, labelThreadsFound: threadIds.length, scannedAt: new Date().toISOString() };

  await supabase.from("intel_cache").upsert(
    { user_id: user.id, show_id: LABEL_SCAN_ID, intel: payload, gmail_threads_found: threadIds.length, cached_at: new Date().toISOString(), is_shared: false, user_email: userEmail || null },
    { onConflict: "user_id,show_id" }
  );

  await finishScanRun(runId, { threadsFound: threadIds.length, threadsParsed: classified.length, startedAt });
  return res.json({ ...payload, fromCache: false, scanRunId: runId });
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
  if (action === "bulkFetch") return handleBulkFetch(req, res, user, supabase);
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

  const { runId, startedAt } = await startScanRun({
    scanner: "intel", userId: user.id,
    params: { mode: "perShow", showId, showVenue: show.venue, showDate: show.date, forceRefresh: !!forceRefresh },
  });
  const stopReasons = {};

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
        await finishScanRun(runId, { threadsFound: cached.gmail_threads_found || 0, threadsCached: cached.gmail_threads_found || 0, startedAt });
        return res.json({
          intel: cached.intel,
          gmailThreadsFound: cached.gmail_threads_found,
          isShared: cached.is_shared,
          sharedByOthers: sharedByOthers || [],
          fromCache: true,
          cachedAt: cached.cached_at,
          scanRunId: runId,
        });
      }
    }
  }

  // ── Check bulk cache first — skip Gmail if threads already fetched ────────────
  let threads = null;
  let fromBulkCache = false;
  {
    const { data: bulk } = await supabase.from("intel_cache").select("intel, cached_at").eq("user_id", user.id).eq("show_id", "__bulk__").single();
    if (bulk) {
      const ageMin = (Date.now() - new Date(bulk.cached_at).getTime()) / 60000;
      if (ageMin < CACHE_TTL_MINUTES) {
        const bulkThreadIds = bulk.intel?.byShow?.[showId];
        const threadPool = bulk.intel?.threadPool || {};
        if (bulkThreadIds?.length) {
          const resolved = bulkThreadIds.map(id => threadPool[id]).filter(Boolean);
          if (resolved.length) {
            const capped = resolved.slice(0, 20);
            console.log(`[intel] bulk cache hit for ${showId}: ${capped.length}/${resolved.length} threads`);
            threads = capped.map(t => ({ ...t, bodySnippet: (t.bodySnippet || "").slice(0, 1200) }));
            fromBulkCache = true;
          }
        }
      }
    }
  }

  // ── Build per-show Gmail queries (skipped when bulk cache provides threads) ──
  if (!threads) {
    const promoterWords = (show.promoter || "")
      .split(/[/,\s]+/)
      .map(w => w.trim())
      .filter(w => w.length > 4 && !/^(the|and|llc|inc|ltd)$/i.test(w));

    const queries = [
      `"${show.venue}" newer_than:45d`,
      `"${show.city}" "bbno$" newer_than:45d`,
      `"bbno$" "${show.venue}" newer_than:45d`,
      `"bbno" "${show.venue}" newer_than:45d`,
      `"Internet Explorer" "${show.city}" newer_than:45d`,
      `"${show.city}" newer_than:45d`,
      ...(promoterWords.length ? [`"${promoterWords[0]}" "${show.city}" newer_than:45d`] : []),
      ...(show.date ? [`"${show.date}" (bbno OR "${show.city}" OR "${show.venue}") newer_than:60d`] : []),
      ...(show.country && show.country !== "US" ? [`"${show.venue}" newer_than:90d`] : []),
    ].filter(Boolean);

    const seenIds = new Set();
    const results = await Promise.allSettled(queries.map(q => gmailSearch(googleToken, q, 20)));
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "fulfilled") {
        results[i].value.forEach(id => seenIds.add(id));
      } else {
        const msg = results[i].reason?.message || "";
        if (msg.includes("401") || msg.includes("403")) return res.status(402).json({ error: "gmail_token_expired" });
        console.warn("[intel] query failed:", queries[i].slice(0, 80), msg);
      }
    }

    const ids = [...seenIds].slice(0, 20);
    try {
      threads = (await Promise.all(ids.map((id) => gmailGetThread(googleToken, id).catch(() => null))))
        .filter(Boolean)
        .map(extractHeaders)
        .map((t) => ({ ...t, bodySnippet: (t.bodySnippet || "").slice(0, 1200) }));
    } catch (e) {
      return res.status(502).json({ error: `Gmail thread fetch failed: ${e.message}` });
    }
  }

  // ── Claude system prompt (tour-context-aware) ─────────────────────────────
  const sysPrompt = `You are an email intelligence parser for concert touring operations. You work for Davon Johnson, Tour Manager at Day of Show, LLC.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.

${buildTourContextBlock()}

Intent categories:
- ADVANCE: advance checklist items, rider, stage plot, catering, production specs
- PRODUCTION: lighting, backline, rigging, pyro, tech specs, load-in coordination
- SETTLEMENT: box office reports, payouts, deal memos, final counts, gross receipts
- LOGISTICS: ground transport, hotel confirmations, bus/truck routing, transfers
- LEGAL: immigration forms, work permits, visas, ATA carnets, customs
- FINANCE: invoices, wire transfers, payment confirmations, ACH, bank details
- MERCH: merchandise orders, inventory, sales reports
- MEDIA: press, photography, credentials, social
- GUEST_LIST: comps, guest list submissions, VIP
- ADMIN: contracts, NDAs, general admin

Owner routing rules:
- SHECK: promoter advance emails, venue production, technical riders, doors/curfew
- DAN: on-site production, load-in coordination, crew logistics
- DAVON: TM-directed items, artist-facing, finance approvals, settlements
- MANAGEMENT: artist bookings, agent communications (Wasserman), deal terms
- VENDOR: external production vendors (Pieter Smit, Fly By Nite, Neg Earth, TSL, BNP)
- CREW: individual crew member logistics (Ruairi, Gabe, Grace, etc.)
- ACCOUNTANT: invoices, tax documents, financial records (Tony Yacowar)

Priority rules:
- CRITICAL: show is <10 days away, or involves immigration/legal with hard deadlines
- HIGH: show <48h away, or item is blocking advance checklist
- MEDIUM: standard advance items, 2-4 weeks out
- LOW: FYI threads, resolved items, informational

Time extraction: Convert all times to 24h HH:MM format. "7pm" → "19:00", "6:30 AM" → "06:30". Common EU show times: doors 19:00, curfew 23:00.`;

  const userPrompt = `Parse Gmail threads for show: ${show.venue} in ${show.city} on ${show.date}${show.promoter ? ` (Promoter: ${show.promoter})` : ""}${show.country ? ` [${show.country}]` : ""}. Artist: ${TOUR_CONTEXT.artist} — ${TOUR_CONTEXT.tour}.

For each thread: classify intent, identify current status, extract sender name, and write a concise action snippet (≤120 chars).
Extract follow-up actions with the correct owner (based on crew/owner routing above), priority, and deadline.
Extract all contacts (name, role, email) from signatures and sender lines.
Extract every time mention that maps to a show-day field. Fields: doors, curfew, busArrive, crewCall, venueAccess, mgTime, soundcheck, set.

Thread data:
${JSON.stringify(threads.map(t => ({ id: t.id, subject: t.subject, from: t.from, date: t.date, body: t.bodySnippet })))}

Return this exact JSON:
{
  "threads": [{"id":"t1","tid":"<thread_id>","subject":"<subject>","from":"<sender_name>","intent":"<INTENT>","status":"<STATUS>","date":"<Mon DD>","snippet":"<<=120 chars>"}],
  "followUps": [{"action":"<action>","owner":"<OWNER>","priority":"<PRIORITY>","deadline":"<Mon DD or null>"}],
  "showContacts": [{"name":"<n>","role":"<role>","email":"<email or null>"}],
  "schedule": [{"time":"<HH:MM 24h>","item":"<short label>","field":"<doors|curfew|busArrive|crewCall|venueAccess|mgTime|soundcheck|set>","tid":"<thread_id>"}],
  "lastRefreshed": "${new Date().toISOString()}"
}`;

  const anthropicBody = JSON.stringify({
    model: DEFAULT_MODEL,
    max_tokens: 8192,
    system: [{ type: "text", text: sysPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });

  const callAnthropic = async () => fetch(ANTHROPIC_URL, { method: "POST", headers: ANTHROPIC_HEADERS, body: anthropicBody });

  let anthropicResp;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      anthropicResp = await callAnthropic();
    } catch (e) {
      console.error("[intel] Anthropic fetch network error (attempt", attempt + 1, "):", e.message);
      if (attempt === 0) { await new Promise(r => setTimeout(r, 2000)); continue; }
      return res.status(502).json({ error: `Anthropic fetch failed: ${e.message}` });
    }
    if (anthropicResp.ok) break;
    let errBody = "";
    try { errBody = await anthropicResp.text(); } catch {}
    console.error("[intel] Anthropic non-ok (attempt", attempt + 1, "):", anthropicResp.status, errBody.slice(0, 300));
    if ((anthropicResp.status === 429 || anthropicResp.status === 529) && attempt === 0) {
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }
    return res.status(502).json({ error: `Anthropic error: ${anthropicResp.status}`, detail: errBody });
  }

  let anthropicData;
  try {
    anthropicData = await anthropicResp.json();
  } catch (e) {
    console.error("[intel] Anthropic response parse error:", e.message);
    return res.status(502).json({ error: `Anthropic response parse failed: ${e.message}` });
  }
  const inputTokens         = anthropicData.usage?.input_tokens                || 0;
  const outputTokens        = anthropicData.usage?.output_tokens               || 0;
  const cacheReadTokens     = anthropicData.usage?.cache_read_input_tokens     || 0;
  const cacheCreationTokens = anthropicData.usage?.cache_creation_input_tokens || 0;
  bumpStopReason(stopReasons, anthropicData.stop_reason);

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
    await finishScanRun(runId, { threadsFound: threads.length, threadsParsed: threads.length, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, stopReasons, errors: [{ kind: "parse_failed", stop_reason: anthropicData.stop_reason }], startedAt });
    return res.json({
      intel: null,
      gmailThreadsFound: threads.length,
      fromCache: false,
      debug: { stopReason: anthropicData.stop_reason, rawText: textContent.slice(0, 800) },
      scanRunId: runId,
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

  await finishScanRun(runId, { threadsFound: threads.length, threadsParsed: threads.length, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, stopReasons, startedAt });

  return res.json({
    intel,
    gmailThreadsFound: threads.length,
    isShared: existing?.is_shared ?? false,
    sharedByOthers: sharedByOthers || [],
    fromCache: false,
    fromBulkCache,
    scanRunId: runId,
    tokensUsed: inputTokens + outputTokens,
  });
};
