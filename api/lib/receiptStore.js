// api/lib/receiptStore.js — persist receipt source files to Supabase Storage.
// Uploads use the admin client (service key), so they bypass Storage RLS; reads
// are handed out as short-lived signed URLs via api/receipt-url.js.
const RECEIPT_BUCKET = "receipts";

function safeName(name) {
  return (name || "receipt").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

// Store one file. `b64` is the raw base64 (no data: prefix). Returns the object
// path on success, or null on failure (never throws — receipt capture is best-effort).
async function storeReceipt(supabase, { b64, contentType, filename, userId, stamp }) {
  if (!b64) return null;
  try {
    const buffer = Buffer.from(b64, "base64");
    if (!buffer.length) return null;
    const year = (stamp ? new Date(stamp) : new Date()).getUTCFullYear();
    const path = `${userId}/${year}/${stamp || Date.now()}-${safeName(filename)}`;
    const { error } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .upload(path, buffer, { contentType: contentType || "application/octet-stream", upsert: true });
    if (error) { console.error("[receiptStore] upload:", error.message); return null; }
    return path;
  } catch (e) {
    console.error("[receiptStore] storeReceipt:", e.message);
    return null;
  }
}

async function signReceipt(supabase, path, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, expiresIn);
  if (error) { console.error("[receiptStore] sign:", error.message); return null; }
  return data?.signedUrl || null;
}

module.exports = { RECEIPT_BUCKET, storeReceipt, signReceipt };
