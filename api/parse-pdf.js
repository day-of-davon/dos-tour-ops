// api/parse-pdf.js — PDF import for show details, contacts, deal terms
const { createClient } = require("@supabase/supabase-js");
const { ANTHROPIC_URL, ANTHROPIC_HEADERS, DEFAULT_MODEL } = require("./lib/anthropic");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing auth token" });

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Invalid token" });

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

  const anthropicResp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: ANTHROPIC_HEADERS,
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      system: [{ type: "text", text: sysPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          { type: "text", text: userPrompt },
        ],
      }],
    }),
  });

  if (!anthropicResp.ok) {
    const err = await anthropicResp.text();
    return res.status(502).json({ error: `Anthropic error: ${anthropicResp.status}`, detail: err });
  }

  const anthropicData = await anthropicResp.json();
  const inputTokens = anthropicData.usage?.input_tokens || 0;
  const outputTokens = anthropicData.usage?.output_tokens || 0;
  const cacheReadTokens = anthropicData.usage?.cache_read_input_tokens || 0;
  const cacheCreationTokens = anthropicData.usage?.cache_creation_input_tokens || 0;
  console.log(`[parse-pdf] tokens: in=${inputTokens} out=${outputTokens} cache_read=${cacheReadTokens} cache_create=${cacheCreationTokens} stop=${anthropicData.stop_reason}`);
  const textContent = (anthropicData.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let parsed = null;
  try {
    parsed = JSON.parse(textContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
  } catch {
    const m = textContent.match(/\{[\s\S]*"show"[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }

  if (!parsed) return res.status(422).json({ error: "Could not parse document", raw: textContent });

  return res.json({ parsed, filename, tokensUsed: inputTokens + outputTokens });
};
