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
  return null;
}

module.exports = { gmailSearch, gmailGetThread, fetchBatched, decodeB64, extractBody, extractJson };
