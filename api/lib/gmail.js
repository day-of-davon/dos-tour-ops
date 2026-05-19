// Shared Gmail + JSON helpers used by flights.js, intel.js, lodging-scan.js.
// All functions are stateless and require a valid Google OAuth token.

async function gmailSearch(token, query, max = 25) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/threads");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", max);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Gmail ${r.status}: ${await r.text()}`);
  return ((await r.json()).threads || []).map(t => t.id);
}

async function gmailGetThread(token, id) {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) return null;
  return r.json();
}

async function fetchBatched(token, ids, batchSize = 20) {
  const out = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = await Promise.all(
      ids.slice(i, i + batchSize).map(id => gmailGetThread(token, id))
    );
    out.push(...batch.filter(Boolean));
  }
  return out;
}

function decodeB64(s) {
  try {
    return Buffer.from(
      String(s || "").replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf-8");
  } catch { return ""; }
}

// Walks a Gmail message payload tree, preferring text/plain over text/html.
// Returns plain text with HTML stripped. No length cap — callers slice as needed.
function extractBody(payload) {
  if (!payload) return "";
  const parts = [payload];
  let text = "", html = "";
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

// Trim marketing footers from already-stripped body text. Two phases:
//  A) truncate at the first strong footer anchor, but only if the anchor
//     appears in the second half of the body (avoids chopping legit content
//     that happens to mention "unsubscribe" in a signature).
//  B) line-level scrub: drop tracking URLs, social rows, visual dividers.
// Safe default: if nothing matches, body passes through unchanged.
function stripMarketingFooter(body) {
  if (!body || typeof body !== "string") return body || "";
  const anchors = [
    /\bunsubscribe\b/i,
    /manage\s+(your\s+)?(email\s+)?preferences/i,
    /you\s+(are\s+)?receiv(ed|ing)\s+this\s+(email\s+)?because/i,
    /this\s+email\s+was\s+sent\s+to/i,
    /view\s+(this\s+email\s+)?in\s+(your\s+)?browser/i,
    /©\s*(\d{4})?\s+[A-Z]/,
    /privacy\s+policy\s*[|·•]\s*terms/i,
    /follow\s+us\s+on\s+(facebook|instagram|twitter|x|tiktok|linkedin)/i,
    /download\s+(our|the)\s+app/i,
  ];
  const half = Math.floor(body.length / 2);
  let cutAt = body.length;
  for (const re of anchors) {
    const m = re.exec(body);
    if (m && m.index >= half && m.index < cutAt) cutAt = m.index;
  }
  let out = body.slice(0, cutAt);

  // Phase B: split on whitespace-run into pseudo-lines (body is already collapsed).
  // Since extractBody collapses whitespace, split on sentence-ish boundaries + drop junk tokens.
  out = out.replace(/https?:\/\/\S*(?:utm_|\/track\/|\/click\?|\/c\/|mkt\.|email\.)[^\s]*/gi, "");
  out = out.replace(/\b(facebook|instagram|twitter|tiktok|linkedin|youtube)\s*[|·•]\s*(facebook|instagram|twitter|tiktok|linkedin|youtube)(\s*[|·•]\s*\w+)*/gi, "");
  out = out.replace(/\s[|·•—]{2,}\s/g, " ");
  return out.replace(/\s+/g, " ").trim();
}

// Returns raw HTML body parts concatenated (pre-strip). Used by JSON-LD scanners
// that need to see <script type="application/ld+json"> blocks intact.
function extractHtmlRaw(payload) {
  if (!payload) return "";
  const parts = [payload];
  let html = "";
  while (parts.length) {
    const p = parts.shift();
    if (p.parts) parts.push(...p.parts);
    const data = p.body?.data;
    if (!data) continue;
    if (p.mimeType === "text/html") html += decodeB64(data) + "\n";
  }
  return html;
}

// Extract schema.org FlightReservation blocks from HTML. Returns array of
// parsed reservation objects (may include @graph-wrapped or array payloads).
function extractJsonLdReservations(html) {
  if (!html) return [];
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node["@graph"])) queue.push(...node["@graph"]);
      const t = node["@type"];
      const isFlightRes = t === "FlightReservation" || (Array.isArray(t) && t.includes("FlightReservation"));
      if (isFlightRes) out.push(node);
    }
  }
  return out;
}

// Extracts the first valid JSON object from a Claude response that may contain
// markdown fences or leading prose.
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
  // Array fallback for responses that return [...] rather than {...}
  const arrayMatch = fenced.match(/\[[\s\S]*\]/);
  if (arrayMatch) { try { return JSON.parse(arrayMatch[0]); } catch {} }
  return null;
}

module.exports = { gmailSearch, gmailGetThread, fetchBatched, decodeB64, extractBody, stripMarketingFooter, extractHtmlRaw, extractJsonLdReservations, extractJson };
