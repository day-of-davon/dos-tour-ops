// api/parse-pdf.js — PDF import for show details, contacts, deal terms
const { authenticate } = require("./lib/auth");
const { extractJson } = require("./lib/gmail");
const { postMessages } = require("./lib/anthropic");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user, error: authErr } = await authenticate(req);
  if (authErr) return res.status(authErr.status).json({ error: authErr.message });

  const { pdfBase64, filename } = req.body || {};
  if (!pdfBase64) return res.status(400).json({ error: "Missing pdfBase64" });

  const sysPrompt = `You are a touring industry document parser for Davon Johnson, Tour Manager at Day of Show, LLC.
Extract structured data from concert contracts, offers, deal memos, and advance sheets.
Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.`;

  const userPrompt = `Parse this document and extract all available information.

Return this exact JSON structure (use null for missing fields, empty arrays if none found):
{
  "show": {
    "date": "<YYYY-MM-DD or null>",
    "venue": "<venue name or null>",
    "city": "<City, STATE/COUNTRY or null>",
    "artist": "<artist name or null>",
    "status": "<TBD>"
  },
  "contacts": [
    {
      "name": "<full name>",
      "role": "<title or role>",
      "email": "<email or null>",
      "phone": "<phone or null>",
      "company": "<company or null>"
    }
  ],
  "dealTerms": {
    "guarantee": "<dollar amount or null>",
    "backend": "<backend percentage or null>",
    "walkout": "<walkout or null>",
    "capacity": "<venue capacity or null>",
    "ticketPrice": "<ticket price range or null>",
    "copromoter": "<co-promoter split or null>",
    "deposit": "<deposit amount and due date or null>",
    "production": "<production notes or null>",
    "catering": "<catering allowance or null>",
    "hospitality": "<hospitality notes or null>",
    "merch": "<merch split or null>",
    "parking": "<parking or null>",
    "guestList": "<guest list allotment or null>",
    "curfew": "<curfew time or null>",
    "notes": "<any other material deal points>"
  },
  "documentType": "<CONTRACT | OFFER | DEAL_MEMO | ADVANCE_SHEET | RIDER | OTHER>"
}`;

  let textContent, usage, stopReason;
  try {
    ({ text: textContent, stopReason, usage } = await postMessages({
      system: sysPrompt,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: userPrompt },
        ],
      }],
    }));
  } catch (e) {
    return res.status(502).json({ error: `Anthropic error: ${e.status}`, detail: e.detail });
  }
  const { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens } = usage;
  console.log(`[parse-pdf] tokens: in=${inputTokens} out=${outputTokens} cache_read=${cacheReadTokens} cache_create=${cacheCreationTokens} stop=${stopReason}`);

  const parsed = extractJson(textContent);
  if (!parsed) return res.status(422).json({ error: "Could not parse document", raw: textContent });

  return res.json({ parsed, filename, tokensUsed: inputTokens + outputTokens });
};
