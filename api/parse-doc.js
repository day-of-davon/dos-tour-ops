// api/parse-doc.js — Unified document triage + extraction
// Handles PDF (pdf-parse text extraction), DOCX (mammoth), XLSX (xlsx→CSV)
// Returns { docType, confidence, summary, receipt, flights, show, contacts, techPack, expenses }
const { createClient } = require("@supabase/supabase-js");
const { extractJson } = require("./lib/gmail");
const { ANTHROPIC_URL, ANTHROPIC_HEADERS, DEFAULT_MODEL } = require("./lib/anthropic");

let mammoth, xlsxLib, pdfParse;
try { mammoth = require("mammoth"); } catch {}
try { xlsxLib = require("xlsx"); } catch {}
try { pdfParse = require("pdf-parse"); } catch {}

function buildVerifyPrompt(parsed, sourceExcerpt) {
  const sourceBlock = sourceExcerpt
    ? `\n\nSOURCE EXCERPT (first 2000 chars):\n${sourceExcerpt}`
    : "";
  return `Verify this extracted touring-operations data for internal consistency and obvious errors.${sourceBlock}

EXTRACTED DATA:
${JSON.stringify(parsed)}

Return this exact JSON:
{
  "ok": true,
  "note": null,
  "corrections": {}
}

If any fields are wrong, set ok=false, describe the issue in note, and put corrected values in corrections using the same structure as the extracted data (e.g. corrections.receipt.amount, corrections.flights[0].from, corrections.show.date). Only include fields that need correction.`;
}

const SYS = `You are a touring industry document parser for Davon Johnson, Tour Manager at Day of Show, LLC.
Classify and extract structured data from any uploaded document related to concert touring operations.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.`;

const PROMPT = (filename, contextDate) => `Classify this document and extract all structured touring-operations data.
Filename: "${filename}"${contextDate ? `\nCurrent show context date: ${contextDate}` : ""}

Document classes:
- RECEIPT: hotel, meals, transport, equipment, or expense receipt / invoice for a single purchase
- INVOICE: vendor invoice (multiple line items or awaiting payment)
- FLIGHT_CONFIRMATION: airline booking confirmation, e-ticket, boarding pass
- TRAVEL_ITINERARY: multi-segment itinerary (flights + possibly hotels)
- SHOW_CONTRACT: concert contract, offer letter, deal memo
- VENUE_TECH_PACK: venue technical spec sheet, production rider, stage plot, house rig document
- EXPENSE_REPORT: multi-line expense sheet, per-diem report, settlement backup
- UNKNOWN

Return ONLY this JSON (null for missing fields, empty arrays when none found):
{
  "docType": "<class>",
  "confidence": <0.0-1.0>,
  "summary": "<one sentence describing what this document is>",
  "receipt": {
    "vendor": "<company or merchant>",
    "date": "<YYYY-MM-DD or null>",
    "amount": <number or null>,
    "currency": "<USD|EUR|GBP|CAD|AUD or null>",
    "category": "<Hotel|Meals|Transport|Equipment|Production|Venue|Merch|Other>",
    "description": "<brief line-item description>",
    "referenceNo": "<invoice or receipt number or null>",
    "payee": "<person who incurred expense or null>",
    "crewMembers": ["<name>"]
  },
  "flights": [
    {
      "flightNo": "<e.g. FR1234 or null>",
      "carrier": "<airline name>",
      "from": "<IATA 3-letter or city>",
      "fromCity": "<full city name>",
      "to": "<IATA or city>",
      "toCity": "<full city name>",
      "depDate": "<YYYY-MM-DD>",
      "dep": "<HH:MM 24h>",
      "arrDate": "<YYYY-MM-DD>",
      "arr": "<HH:MM 24h>",
      "pax": ["<passenger full name>"],
      "confirmNo": "<confirmation number or null>",
      "bookingRef": "<booking reference or null>",
      "cost": <number or null>,
      "currency": "<currency or null>"
    }
  ],
  "show": {
    "date": "<YYYY-MM-DD or null>",
    "venue": "<venue name or null>",
    "city": "<City, COUNTRY or null>",
    "artist": "<artist name or null>",
    "promoter": "<promoter company or null>",
    "guarantee": "<e.g. $15,000 or null>",
    "capacity": <number or null>,
    "doors": "<HH:MM or null>",
    "curfew": "<HH:MM or null>",
    "deposit": "<deposit amount and due date or null>",
    "merch": "<merch split or null>",
    "notes": "<key deal points summary or null>"
  },
  "contacts": [
    { "name": "<full name>", "role": "<title or role>", "email": "<email or null>", "phone": "<phone or null>", "company": "<company or null>" }
  ],
  "techPack": {
    "venueName": "<venue name or null>",
    "city": "<city or null>",
    "stageDimensions": "<e.g. 40ft wide x 32ft deep or null>",
    "stageHeight": "<height in inches/cm or null>",
    "riggingPoints": "<count and weight rating or null>",
    "houseRig": "<house rig description or null>",
    "powerSpec": "<3-phase spec or null>",
    "loadIn": "<load-in time or null>",
    "curfew": "<hard curfew or null>",
    "notes": "<key technical notes>"
  },
  "expenses": [
    {
      "date": "<YYYY-MM-DD or null>",
      "vendor": "<merchant or vendor>",
      "amount": <number>,
      "currency": "<currency>",
      "category": "<Hotel|Meals|Transport|Equipment|Production|Venue|Merch|Other>",
      "description": "<description>",
      "payee": "<person or null>"
    }
  ]
}`;

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

  const { fileBase64, mimeType = "", filename = "", contextDate } = req.body || {};
  if (!fileBase64) return res.status(400).json({ error: "Missing fileBase64" });

  const name = filename.toLowerCase();
  const isPdf = mimeType === "application/pdf" || name.endsWith(".pdf");
  const isDocx = mimeType.includes("wordprocessingml") || name.endsWith(".docx");
  const isXlsx = mimeType.includes("spreadsheetml") || name.endsWith(".xlsx") || name.endsWith(".xls");

  let extractedText = null;

  try {
    if (isPdf && pdfParse) {
      const buf = Buffer.from(fileBase64, "base64");
      const result = await pdfParse(buf);
      extractedText = result.text.slice(0, 14000);
    } else if (isPdf) {
      extractedText = "[PDF extraction unavailable — pdf-parse not loaded]";
    } else if (isDocx && mammoth) {
      const buf = Buffer.from(fileBase64, "base64");
      const result = await mammoth.extractRawText({ buffer: buf });
      extractedText = result.value.slice(0, 14000);
    } else if (isXlsx && xlsxLib) {
      const buf = Buffer.from(fileBase64, "base64");
      const wb = xlsxLib.read(buf, { type: "buffer" });
      const sheets = wb.SheetNames.map(n => `=== ${n} ===\n${xlsxLib.utils.sheet_to_csv(wb.Sheets[n])}`);
      extractedText = sheets.join("\n\n").slice(0, 14000);
    } else {
      extractedText = Buffer.from(fileBase64, "base64").toString("utf-8").slice(0, 14000);
    }
  } catch (e) {
    console.error("[parse-doc] extraction error:", e.message);
    extractedText = `[Extraction failed: ${e.message}]`;
  }

  const userPromptText = PROMPT(filename, contextDate);

  const messages = [{ role: "user", content: `${userPromptText}\n\nDOCUMENT CONTENT:\n${extractedText}` }];

  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0;
  const callClaude = async (sys, msgs, maxTokens = 4096) => {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: ANTHROPIC_HEADERS,
      body: JSON.stringify({ model: DEFAULT_MODEL, max_tokens: maxTokens, system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }], messages: msgs }),
    });
    if (!resp.ok) throw Object.assign(new Error(`Anthropic ${resp.status}`), { detail: await resp.text() });
    const data = await resp.json();
    inputTokens         += data.usage?.input_tokens                || 0;
    outputTokens        += data.usage?.output_tokens               || 0;
    cacheReadTokens     += data.usage?.cache_read_input_tokens     || 0;
    cacheCreationTokens += data.usage?.cache_creation_input_tokens || 0;
    console.log(`[parse-doc] stop=${data.stop_reason} in=${data.usage?.input_tokens} out=${data.usage?.output_tokens} cache_read=${data.usage?.cache_read_input_tokens}`);
    return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  };

  let rawText;
  try {
    rawText = await callClaude(SYS, messages);
  } catch (e) {
    return res.status(502).json({ error: `Anthropic error: ${e.message}`, detail: e.detail });
  }

  const parsed = extractJson(rawText);
  if (!parsed) return res.status(422).json({ error: "Could not parse response", raw: rawText.slice(0, 600) });

  // Verification pass — re-check extracted fields against source document
  const VERIFY_SYS = `You are a document data verifier. You check extracted structured data against the source document for accuracy.
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.`;

  // Verification uses extracted JSON + a brief source excerpt only — no full document re-send.
  const sourceExcerpt = (extractedText || "").slice(0, 2000);
  const verifyMsgs = [{ role: "user", content: buildVerifyPrompt(parsed, sourceExcerpt) }];

  let verified = parsed;
  try {
    const verifyText = await callClaude(VERIFY_SYS, verifyMsgs, 2048);
    const verifyResult = extractJson(verifyText);
    if (verifyResult) {
      // Apply field-level corrections
      if (verifyResult.corrections) {
        if (verifyResult.corrections.receipt && parsed.receipt)
          verified = { ...verified, receipt: { ...parsed.receipt, ...verifyResult.corrections.receipt } };
        if (verifyResult.corrections.flights && Array.isArray(verifyResult.corrections.flights))
          verified = { ...verified, flights: verifyResult.corrections.flights };
        if (verifyResult.corrections.show && parsed.show)
          verified = { ...verified, show: { ...parsed.show, ...verifyResult.corrections.show } };
      }
      verified = { ...verified, parseVerified: verifyResult.ok !== false, parseNote: verifyResult.note || null };
    }
  } catch (e) {
    console.warn("[parse-doc] verify error:", e.message);
    verified = { ...parsed, parseVerified: null };
  }

  console.log(`[parse-doc] total tokens: in=${inputTokens} out=${outputTokens} cache_read=${cacheReadTokens} cache_create=${cacheCreationTokens}`);
  return res.json({ ...verified, filename, tokensUsed: inputTokens + outputTokens });
};
