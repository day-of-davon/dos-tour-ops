// api/lib/receiptStore.js — persist receipt source files to Supabase Storage.
// Uploads use the admin client (service key), so they bypass Storage RLS; reads
// are handed out as short-lived signed URLs via api/receipt-url.js.
const RECEIPT_BUCKET = "receipts";

function safeName(name) {
  return (name || "receipt").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

// Hard cap on a single upload so a slow Storage backend can never dominate a
// scan's serverless time budget. Receipt capture is best-effort: on timeout we
// drop the copy rather than risk a 504 on the whole scan.
const UPLOAD_TIMEOUT_MS = 8000;

// Store one file. `b64` is the raw base64 (no data: prefix). Returns the object
// path on success, or null on failure/timeout (never throws — best-effort).
async function storeReceipt(supabase, { b64, contentType, filename, userId, stamp }) {
  if (!b64) return null;
  try {
    const buffer = Buffer.from(b64, "base64");
    if (!buffer.length) return null;
    const year = (stamp ? new Date(stamp) : new Date()).getUTCFullYear();
    const path = `${userId}/${year}/${stamp || Date.now()}-${safeName(filename)}`;
    const upload = supabase.storage
      .from(RECEIPT_BUCKET)
      .upload(path, buffer, { contentType: contentType || "application/octet-stream", upsert: true });
    const { error } = await Promise.race([
      upload,
      new Promise(resolve => setTimeout(() => resolve({ error: { message: `upload_timeout_${UPLOAD_TIMEOUT_MS}ms` } }), UPLOAD_TIMEOUT_MS)),
    ]);
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
