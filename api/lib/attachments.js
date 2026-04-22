// attachments.js — Gmail PDF attachment discovery, fetch, and folio dedup.
// Used by scanners that feed PDFs into Claude's document content block.
//
// Dedup is Marriott-folio-shaped: hotels routinely send multiple folio
// receipts in the same thread (Folio_5526.pdf, Folio_5534.pdf, ...); only
// the newest is meaningful. Generalized normalizer covers invoice, receipt,
// confirmation patterns too.

// Walk a Gmail message payload tree. Collect every PDF-looking attachment
// part with enough metadata to fetch + dedup later.
function walkAttachments(message) {
  const out = [];
  const messageId = message.id;
  const internalDate = message.internalDate ? Number(message.internalDate) : 0;
  const queue = [message.payload];
  while (queue.length) {
    const p = queue.shift();
    if (!p) continue;
    if (p.parts) queue.push(...p.parts);
    const mime = (p.mimeType || "").toLowerCase();
    const name = p.filename || "";
    const isPdf = mime === "application/pdf" || /\.pdf$/i.test(name);
    if (!isPdf) continue;
    if (!p.body?.attachmentId) continue;
    out.push({
      messageId,
      attachmentId: p.body.attachmentId,
      filename: name || "unnamed.pdf",
      mimeType: mime || "application/pdf",
      size: p.body.size || 0,
      internalDate,
    });
  }
  return out;
}

// Collect PDFs across every message in a thread.
function collectThreadAttachments(thread) {
  if (!thread?.messages) return [];
  return thread.messages.flatMap(m => walkAttachments(m));
}

// Normalize a filename into a stable "folio key" for grouping.
// Strips extension, trailing dates, sequence numbers, copy suffixes, timestamps.
function normalizeFolioKey(filename) {
  let s = String(filename || "").toLowerCase();
  s = s.replace(/\.pdf$/i, "");
  s = s.replace(/[_\- ]+\d{4,}.*$/, "");        // Folio_5526 -> Folio
  s = s.replace(/[_\- ]*\(\d+\)\s*$/, "");      // Receipt (2) -> Receipt
  s = s.replace(/[_\- ]*v\d+\s*$/i, "");        // Invoice_v2  -> Invoice
  s = s.replace(/[_\- ]*copy\s*\d*\s*$/i, "");  // copy / Copy 3
  s = s.replace(/[_\- ]*final\s*$/i, "");
  s = s.replace(/[_\-]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s || "pdf";
}

// Marriott-style folio dedup. Group attachments by normalized key;
// within each group, keep the attachment from the message with the newest
// internalDate. Tie-break on filename desc so later sequence number wins.
//
// Returns { kept: [...], dropped: [{filename, reason}] } so callers can
// log what was discarded.
function dedupFolios(attachments) {
  const groups = {};
  for (const a of attachments || []) {
    const key = normalizeFolioKey(a.filename);
    (groups[key] ||= []).push(a);
  }
  const kept = [];
  const dropped = [];
  for (const [key, group] of Object.entries(groups)) {
    if (group.length === 1) { kept.push(group[0]); continue; }
    group.sort((x, y) => {
      if (y.internalDate !== x.internalDate) return y.internalDate - x.internalDate;
      return (y.filename || "").localeCompare(x.filename || "");
    });
    kept.push(group[0]);
    for (const d of group.slice(1)) {
      dropped.push({ filename: d.filename, reason: `folio_dedup_key=${key} kept=${group[0].filename}` });
    }
  }
  // Deterministic order: newest first overall.
  kept.sort((x, y) => y.internalDate - x.internalDate);
  return { kept, dropped };
}

// Fetch an attachment's base64 body. Gmail returns URL-safe base64; Claude's
// document API accepts standard base64 (both work in practice, but normalize
// anyway to match other api/parse-*.js handlers).
async function fetchAttachmentB64(token, messageId, attachmentId) {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) { console.warn(`[attachments] fetch ${r.status} for ${attachmentId}`); return null; }
  const { data } = await r.json();
  if (!data) return null;
  return String(data).replace(/-/g, "+").replace(/_/g, "/");
}

// Fingerprint for cache invalidation. Stable across scans unless the thread
// gains/loses an attachment or a file's size changes.
function attachmentFingerprint(attachments) {
  return (attachments || [])
    .map(a => `${a.filename}|${a.size}|${a.attachmentId}`)
    .sort();
}

module.exports = {
  walkAttachments,
  collectThreadAttachments,
  normalizeFolioKey,
  dedupFolios,
  fetchAttachmentB64,
  attachmentFingerprint,
};
