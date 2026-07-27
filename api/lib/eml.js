// api/lib/eml.js — minimal RFC822/.eml text extractor for forwarded reservation
// emails (e.g. Airbnb confirmations attached to a thread as a .eml file).
// Not a full MIME parser: pulls Subject + best-effort text body, preferring
// text/plain and stripping HTML. Handles base64 / quoted-printable transfer
// encodings, multipart/alternative, and RFC 2047 encoded-word subjects.

function decodeQuotedPrintable(s) {
  const str = String(s || "").replace(/=\r?\n/g, ""); // drop soft line breaks
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(str.substr(i + 1, 2))) {
      bytes.push(parseInt(str.substr(i + 1, 2), 16));
      i += 2;
    } else {
      for (const b of Buffer.from(str[i], "utf8")) bytes.push(b); // keep multibyte intact
    }
  }
  return Buffer.from(bytes).toString("utf8"); // reassemble as UTF-8
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<br\s*\/?>(?:\s*)/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCharCode(parseInt(d, 10)); } catch { return ""; } })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function splitHeadersBody(section) {
  const m = section.match(/\r?\n\r?\n/);
  if (!m) return { rawHeaders: section, body: "" };
  return { rawHeaders: section.slice(0, m.index), body: section.slice(m.index + m[0].length) };
}

function parseHeaders(rawHeaders) {
  const unfolded = String(rawHeaders || "").replace(/\r?\n[ \t]+/g, " "); // unfold continuations
  const headers = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2];
  }
  return headers;
}

function decodeBodyByCte(body, cte) {
  const enc = (cte || "").toLowerCase();
  if (enc.includes("base64")) {
    try { return Buffer.from(String(body).replace(/\s+/g, ""), "base64").toString("utf8"); } catch { return body; }
  }
  if (enc.includes("quoted-printable")) return decodeQuotedPrintable(body);
  return body;
}

// Recursively pull text parts from a MIME section. Returns [{mime, text}].
function extractParts(section, depth = 0) {
  if (depth > 6) return [];
  const { rawHeaders, body } = splitHeadersBody(section);
  const headers = parseHeaders(rawHeaders);
  const rawCtype = headers["content-type"] || "text/plain";
  const ctype = rawCtype.toLowerCase();
  const cte = headers["content-transfer-encoding"] || "";
  // Boundary is case-sensitive — read it from the original-case header, not `ctype`.
  const boundaryMatch = rawCtype.match(/boundary="?([^";]+)"?/i);
  if (ctype.startsWith("multipart/") && boundaryMatch) {
    const b = boundaryMatch[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = body.split(new RegExp(`--${b}(?:--)?\\r?\\n?`));
    const out = [];
    for (const part of parts) { if (part.trim()) out.push(...extractParts(part, depth + 1)); }
    return out;
  }
  const decoded = decodeBodyByCte(body, cte);
  if (ctype.startsWith("text/html"))  return [{ mime: "text/html",  text: stripHtml(decoded) }];
  if (ctype.startsWith("text/plain")) return [{ mime: "text/plain", text: String(decoded).trim() }];
  return [];
}

function decodeEncodedWord(s) {
  return String(s || "").replace(/=\?[^?]+\?([BbQq])\?([^?]*)\?=/g, (_, enc, data) => {
    try {
      if (enc.toUpperCase() === "B") return Buffer.from(data, "base64").toString("utf8");
      return decodeQuotedPrintable(data.replace(/_/g, " "));
    } catch { return data; }
  });
}

// Parse a raw .eml string → { subject, text }. `cap` bounds the text length.
function extractEmlText(raw, cap = 6000) {
  try {
    const { rawHeaders } = splitHeadersBody(String(raw || ""));
    const headers = parseHeaders(rawHeaders);
    const subject = decodeEncodedWord(headers["subject"] || "");
    const parts = extractParts(String(raw || ""));
    const plain = parts.filter(p => p.mime === "text/plain" && p.text).map(p => p.text);
    const html = parts.filter(p => p.mime === "text/html" && p.text).map(p => p.text);
    const text = (plain.length ? plain.join("\n") : html.join("\n")).slice(0, cap);
    return { subject, text };
  } catch {
    return { subject: "", text: "" };
  }
}

module.exports = { extractEmlText };
