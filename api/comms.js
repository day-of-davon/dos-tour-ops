// api/comms.js — dos-comms-intelligence: draft a reply-all for a Gmail thread
const { authenticate } = require("./lib/auth");
const { gmailGetThread, extractBody, stripMarketingFooter } = require("./lib/gmail");
const { postMessages, DEFAULT_MODEL } = require("./lib/anthropic");
const { buildTourContextBlock } = require("./lib/tourContext");

const MY_EMAIL = "d.johnson@dayofshow.net";

function getHeaders(msg) {
  const headers = msg?.payload?.headers || [];
  const get = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  return {
    subject: get("Subject"),
    from: get("From"),
    to: get("To"),
    cc: get("Cc"),
    date: get("Date"),
  };
}

// Pull display name + address from a raw header value like "Name <email@x.com>"
function parseAddresses(raw) {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { error } = await authenticate(req);
  if (error) return res.status(error.status).json({ error: error.message });

  const { tid, show, googleToken, userEmail } = req.body || {};
  if (!tid) return res.status(400).json({ error: "Missing tid" });
  if (!googleToken) return res.status(400).json({ error: "Missing googleToken" });

  let thread;
  try {
    thread = await gmailGetThread(googleToken, tid);
  } catch (e) {
    if (e.message?.includes("401") || e.message?.includes("403"))
      return res.status(402).json({ error: "gmail_token_expired" });
    throw e;
  }
  if (!thread) return res.status(404).json({ error: "Thread not found or not accessible" });

  const messages = thread.messages || [];
  if (!messages.length) return res.status(422).json({ error: "Thread has no messages" });

  const firstHeaders = getHeaders(messages[0]);
  const lastHeaders = getHeaders(messages[messages.length - 1]);

  // Collect all participants for reply-all, deduped, excluding self
  const participantSet = new Set();
  for (const msg of messages) {
    const h = getHeaders(msg);
    [...parseAddresses(h.from), ...parseAddresses(h.to), ...parseAddresses(h.cc)].forEach((addr) => {
      if (addr && !addr.toLowerCase().includes(MY_EMAIL)) participantSet.add(addr);
    });
  }

  // Build thread transcript — most recent 8 messages, 2500 chars each
  const transcript = messages
    .slice(-8)
    .map((msg, i) => {
      const h = getHeaders(msg);
      const body = stripMarketingFooter(extractBody(msg.payload)).slice(0, 2500);
      return `--- Message ${i + 1} (${h.date}) ---\nFrom: ${h.from}\nTo: ${h.to}${h.cc ? `\nCc: ${h.cc}` : ""}\n\n${body}`;
    })
    .join("\n\n");

  // Show context block
  const showBlock = show
    ? `Current show: ${[show.venue, show.city, show.country].filter(Boolean).join(", ")} on ${show.date || "TBD"}. Client: ${show.client || show.clientId || "bbno$"}.`
    : "";

  const system = `You are Davon Johnson, Tour Manager / Tour Director for bbno$'s Internet Explorer Tour, writing on behalf of Day of Show, LLC.
Your email: ${MY_EMAIL}. Always reply in first person as Davon.

${buildTourContextBlock()}
${showBlock}

Draft a reply-all email responding to the thread below. Follow these rules:
- Lead with the answer or confirmation. Reasoning and context follow.
- Address every open question or action item in the most recent message.
- Professional but direct. Match the register of the thread — if they're brief, be brief.
- Do NOT include To:, Cc:, or Subject: headers. Return only the email body, starting with the salutation.
- Sign off as:
  Davon Johnson
  Tour Manager | Day of Show, LLC
  d.johnson@dayofshow.net | 337.326.0041`;

  let result;
  try {
    result = await postMessages({
      model: DEFAULT_MODEL,
      maxTokens: 1024,
      system,
      messages: [{ role: "user", content: `Thread:\n\n${transcript}\n\nDraft a reply-all to this thread.` }],
    });
  } catch (e) {
    console.error("[comms] Claude error:", e.message, e.detail);
    return res.status(502).json({ error: "Draft generation failed", detail: e.message });
  }

  return res.status(200).json({
    draft: result.text.trim(),
    subject: firstHeaders.subject ? `Re: ${firstHeaders.subject.replace(/^(Re:\s*)+/i, "")}` : "Re: (no subject)",
    participants: [...participantSet],
    replyTo: lastHeaders.from || firstHeaders.from,
    usage: result.usage,
  });
};
