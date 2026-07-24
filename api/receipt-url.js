// api/receipt-url.js — mint a short-lived signed URL for a stored receipt file.
// The ledger persists only the object path; this hands out a viewable URL on click.
const { authenticate } = require("./lib/auth");
const { signReceipt } = require("./lib/receiptStore");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user, supabase, error: authErr } = await authenticate(req);
  if (authErr) return res.status(authErr.status).json({ error: authErr.message });

  const { path } = req.body || {};
  if (!path || typeof path !== "string") return res.status(400).json({ error: "Missing path" });
  // Defensive: keep within the receipts namespace; no traversal.
  if (path.includes("..") || path.startsWith("/")) return res.status(400).json({ error: "Invalid path" });

  const url = await signReceipt(supabase, path, 3600);
  if (!url) return res.status(404).json({ error: "Receipt not found" });
  return res.json({ url, expiresIn: 3600, user: user.email });
};
