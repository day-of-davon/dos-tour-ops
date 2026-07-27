// api/monitoring.js — Sentry tunnel.
//
// Browsers with ad/privacy blockers (uBlock, Brave Shields, Ghostery, Safari ITP)
// block requests to *.ingest.sentry.io, so client-side error reports silently
// never arrive. The SDK is configured with `tunnel: "/api/monitoring"`, which
// sends envelopes to THIS same-origin route instead — your own domain can't be
// blocked — and this function forwards them to Sentry. Result: real users' crash
// reports actually reach you, not just yours with extensions off.
//
// Security: only envelopes whose DSN matches OUR project are forwarded, so this
// endpoint can't be abused as an open relay to spam arbitrary Sentry projects.
// The host and project id are public — they're already in the client bundle.

const SENTRY_HOST = "o4511632242900992.ingest.us.sentry.io";
const SENTRY_PROJECT_IDS = ["4511632257253377"];

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // Envelope is application/x-sentry-envelope (newline-delimited, not JSON).
    // Keep the raw bytes intact for forwarding; only decode the header line to
    // validate. req.body when Vercel populated it, else drain the stream.
    let raw;
    if (Buffer.isBuffer(req.body)) raw = req.body;
    else if (typeof req.body === "string") raw = Buffer.from(req.body, "utf8");
    else {
      const chunks = [];
      for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      raw = Buffer.concat(chunks);
    }

    const text = raw.toString("utf8");
    const nl = text.indexOf("\n");
    const header = JSON.parse(nl === -1 ? text : text.slice(0, nl));
    const dsn = new URL(header.dsn);
    const projectId = dsn.pathname.replace(/^\//, "");

    if (dsn.hostname !== SENTRY_HOST || !SENTRY_PROJECT_IDS.includes(projectId)) {
      return res.status(403).json({ error: "Invalid Sentry DSN" });
    }

    const upstream = await fetch(`https://${SENTRY_HOST}/api/${projectId}/envelope/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: raw,
    });

    // Mirror upstream status so the SDK sees rate-limit / accept responses.
    return res.status(upstream.status).end();
  } catch (e) {
    // Never let a tunnel failure surface into the app.
    return res.status(500).json({ error: "tunnel_error" });
  }
};
