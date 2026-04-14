// api/intel.js — Vercel serverless function
const { createClient } = require("@supabase/supabase-js");

const CACHE_TTL_MINUTES = 60;

async function gmailSearch(googleToken, query, maxResults = 20) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/threads");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", maxResults);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${googleToken}` } });
  if (!r.ok) { const err = await r.text(); throw new Error(`Gmail search failed (${r.status}): ${err}`); }
  const data = await r.json();
  return (data.threads || []).map((t) => t.id);
}

async function gmailGetThread(googleToken, threadId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${googleToken}` } });
  if (!r.ok) return null;
  return r.json();
}

function decodeB64(s) {
  try { return Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"); } catch { return ""; }
}

function extractBody(payload) {
  if (!payload) return "";
  const parts = [payload];
  let text = ""; let html = "";
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

  const { show, googleToken, forceRefresh } = req.body || {};
  if (!show || !googleToken) return res.status(400).json({ error: "Missing show or googleToken" });

  const showId = `${show.venue}__${show.date}`.toLowerCase().replace(/\s+/g, "_");

  if (!forceRefresh) {
    const { data: cached } = await supabase
      .from("intel_cache")
      .select("intel, gmail_threads_found, cached_at")
      .eq("show_id", showId)
      .single();

    if (cached) {
      const ageMinutes = (Date.now() - new Date(cached.cached_at).getTime()) / 60000;
      if (ageMinutes < CACHE_TTL_MINUTES) {
        return res.json({
          intel: cached.intel,
          gmailThreadsFound: cached.gmail_threads_found,
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

  const textContent = (anthropicData.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  console.log("[intel] stop_reason:", anthropicData.stop_reason, "| text length:", textContent.length);
  console.log("[intel] raw (first 600):", textContent.slice(0, 600));

  // Extract outermost JSON object using bracket counting
  function extractJson(text) {
    try { return JSON.parse(text.trim()); } catch {}
    const fenced = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    try { return JSON.parse(fenced); } catch {}
    let depth = 0, start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "{") { if (start === -1) start = i; depth++; }
      else if (text[i] === "}") {
        depth--;
        if (depth === 0 && start !== -1) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch {}
          start = -1;
        }
      }
    }
    return null;
  }

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

  await supabase.from("intel_cache").upsert({
    show_id: showId,
    intel,
    gmail_threads_found: threads.length,
    cached_at: new Date().toISOString(),
  });

  return res.json({ intel, gmailThreadsFound: threads.length, fromCache: false });
};
