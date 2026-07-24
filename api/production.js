// api/production.js — Production Intelligence Engine (PIE)
// Parses vendor quote PDFs + design drawings via Claude API
// Returns enriched manifest items + discrepancy analysis

const { authenticate } = require("./lib/auth");
const { extractJson } = require("./lib/gmail");
const { HEAVY_MODEL, postMessages } = require("./lib/anthropic");

const QUOTE_PROMPT = `Extract equipment line items from this vendor production quote PDF.
Return ONLY a JSON array. No preamble, no markdown fences.

Each object:
{
  "department": "LIGHTING"|"VIDEO"|"AUDIO"|"LASERS"|"POWER_DISTRO"|"STAGING"|"TRANSPORT"|"SFX"|"OTHER",
  "item_name": "exact text from quote",
  "model_ref": "manufacturer model name if identifiable, else null",
  "qty": number or null,
  "unit_cost": number or null,
  "total_cost": number or null,
  "currency": "GBP"|"USD"|"EUR"|null,
  "notes": "any spec notes or null",
  "is_crew": false,
  "is_package": false,
  "vendor_quote_ref": "quote number if visible or null"
}

Rules:
- Skip crew and labour lines entirely.
- Lump-sum packages with no unit breakdown: is_package true, qty 1.
- Preserve exact item names from the document.
- Transport line items: department TRANSPORT.
- Package with no qty: set qty 1.`;

const DESIGN_PROMPT = `Read this production design drawing PDF.
Find the Symbol Key or Legend listing fixture types, quantities, and positions.
Return ONLY a JSON array. No preamble, no markdown fences.

Each object:
{
  "department": "LIGHTING"|"VIDEO"|"LASERS"|"STAGING"|"TRUSS"|"AUDIO",
  "item_name": "exact label from symbol key",
  "model_name": "manufacturer model if stated, else null",
  "qty": number,
  "power_w": number or null,
  "rig_position": "fly"|"ground"|"tower"|"floor"|"TBD",
  "position_notes": "e.g. 3 per side, overhead truss, front truss or null",
  "notes": "any annotation or null"
}

Focus on: fixture counts, model names, power annotations, rigging positions.
If fixtures appear on towers in elevation views: rig_position = "tower".
Towers are ground-positioned structures — do not classify as fly.`;

// Pre-seeded fixture specs (weight kg, power W, IP, typical position)
const SPECS = {
  "ayrton diablo":       { weight_kg:21.8,  power_w:550,  ip_rating:"IP20", typical_position:"fly" },
  "ayrton diablo s":     { weight_kg:21.8,  power_w:550,  ip_rating:"IP20", typical_position:"fly" },
  "ayrton perseo":       { weight_kg:26.0,  power_w:520,  ip_rating:"IP65", typical_position:"fly" },
  "glp jdc2":            { weight_kg:24.0,  power_w:1500, ip_rating:"IP65", typical_position:"fly" },
  "acme pixel line":     { weight_kg:4.5,   power_w:420,  ip_rating:"IP66", typical_position:"fly" },
  "roe carbon cb5":      { weight_kg:13.9,  power_w:400,  ip_rating:"IP65", typical_position:"fly" },
  "roe cb5":             { weight_kg:13.9,  power_w:400,  ip_rating:"IP65", typical_position:"fly" },
  "brompton s4":         { weight_kg:5.0,   power_w:250,  ip_rating:null,   typical_position:"fly" },
  "kvant ld33":          { weight_kg:37.0,  power_w:900,  ip_rating:"IP54", typical_position:"ground" },
  "pk sound t10":        { weight_kg:47.6,  power_w:3000, ip_rating:"IP42", typical_position:"fly" },
  "pk sound t218":       { weight_kg:104.0, power_w:4000, ip_rating:"IP42", typical_position:"ground" },
  "look solutions unique": { weight_kg:14.0, power_w:500, ip_rating:null,   typical_position:"ground" },
  "tyler truss gt":      { weight_kg:9.0,   power_w:null, ip_rating:null,   typical_position:"fly" },
  "grandma3":            { weight_kg:12.0,  power_w:300,  ip_rating:null,   typical_position:"ground" },
  "grand ma3":           { weight_kg:12.0,  power_w:300,  ip_rating:null,   typical_position:"ground" },
  "martin mac viper":    { weight_kg:21.6,  power_w:1000, ip_rating:"IP20", typical_position:"fly" },
  "robe pointe":         { weight_kg:10.4,  power_w:520,  ip_rating:"IP20", typical_position:"fly" },
  "astera ax1":          { weight_kg:0.3,   power_w:12,   ip_rating:"IP65", typical_position:"either" },
  "sgm g7 beam":         { weight_kg:18.0,  power_w:500,  ip_rating:"IP65", typical_position:"fly" },
};

function enrichItem(item) {
  const key = ((item.item_name || "") + " " + (item.model_ref || "")).toLowerCase();
  for (const [specKey, specs] of Object.entries(SPECS)) {
    if (key.includes(specKey)) {
      return { ...item, ...specs, spec_source: "fixture_specs" };
    }
  }
  return item;
}

function classifyPosition(item, designItem) {
  if (item.manual_position) return item.manual_position;
  if (designItem?.rig_position && designItem.rig_position !== "TBD") return designItem.rig_position;

  const name = (item.item_name || "").toLowerCase();
  if (name.includes("subwoofer") || name.includes("t218") || name.match(/\bsub\b/)) return "ground";
  if (name.includes("hoist") || name.includes("chain motor")) return "fly";
  if (name.includes("tower")) return "ground";
  if (name.includes("truss") && !name.includes("tower")) return "fly";
  if (name.includes("laser")) return "ground";

  const tp = item.typical_position;
  if (tp && tp !== "either") return tp;
  return "TBD";
}

function detectDiscrepancies(quoteItems, designItems) {
  const issues = [];
  let n = 1;

  for (const di of designItems) {
    const diName = (di.model_name || di.item_name || "").toLowerCase();
    const diWords = diName.split(/\s+/).filter(w => w.length > 2);

    const matches = quoteItems.filter(qi => {
      if (qi.department !== di.department && di.department !== "TRUSS") return false;
      const qName = (qi.item_name || "").toLowerCase();
      return diWords.some(w => qName.includes(w));
    });

    if (matches.length === 0 && !di.is_package) {
      issues.push({
        id: `iss_${n}`, issue_number: n++, severity: "CRITICAL",
        category: "VENDOR GAP",
        finding: `${di.item_name} (${di.qty || "?"}x, ${di.department}) specified in design drawings — no vendor supply found`,
        impact: "Equipment unconfirmed for show",
        action: "Source vendor before advancing",
        resolved: false,
      });
    } else if (matches.length > 0 && di.qty && matches[0].qty && matches[0].qty !== di.qty && !matches[0].is_package) {
      issues.push({
        id: `iss_${n}`, issue_number: n++, severity: "HIGH",
        category: "QUANTITY MISMATCH",
        finding: `${di.item_name}: design shows ${di.qty}, quote shows ${matches[0].qty}`,
        impact: "Power/weight budgets may be inaccurate",
        action: "Confirm final quantity with vendor and PM",
        resolved: false,
      });
    }
  }

  for (const qi of quoteItems.filter(i => i.is_package)) {
    issues.push({
      id: `iss_${n}`, issue_number: n++, severity: "MEDIUM",
      category: "PACKAGE ONLY",
      finding: `${qi.item_name} (${qi.vendor_name || "vendor"}) is a lump-sum — no itemised breakdown`,
      impact: "Power and weight contribution unknown",
      action: "Request itemised spec from vendor",
      resolved: false,
    });
  }

  return issues;
}

function calcPowerBudget(items) {
  const byDept = {};
  let totalW = 0;
  let missingPower = 0;

  for (const item of items) {
    if (item.is_crew || item.department === "TRANSPORT" || item.department === "STAGING") continue;
    const w = (item.power_w || 0) * (item.qty || 1);
    totalW += w;
    const d = item.department || "OTHER";
    byDept[d] = (byDept[d] || 0) + w;
    if (!item.power_w && !item.is_package) missingPower++;
  }

  const totalKw = Math.round(totalW / 100) / 10;
  return {
    total_w: totalW, total_kw: totalKw,
    by_dept: byDept,
    recommended_minimum_kw: Math.ceil(totalKw * 1.30),
    missing_power_count: missingPower,
  };
}

function calcWeightLedger(items) {
  let flyKg = 0, groundKg = 0, tbd = 0;
  let flyCount = 0, groundCount = 0;

  for (const item of items) {
    if (!item.weight_kg) continue;
    const kg = item.weight_kg * (item.qty || 1);
    const pos = item.rig_position;
    if (pos === "fly" || pos === "touring_carry") { flyKg += kg; flyCount++; }
    else if (pos === "ground" || pos === "tower") { groundKg += kg; groundCount++; }
    else tbd++;
  }

  return {
    fly_kg: Math.round(flyKg * 10) / 10,
    ground_kg: Math.round(groundKg * 10) / 10,
    fly_item_count: flyCount,
    ground_item_count: groundCount,
    tbd_count: tbd,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user, error: authErr } = await authenticate(req);
  if (authErr) return res.status(authErr.status).json({ error: authErr.message });

  const { action, pdfBase64, docType, vendorName, quoteRef, existingItems, designItems } = req.body || {};

  // Analysis action — runs on already-parsed items
  if (action === "analyze") {
    const allItems = existingItems || [];
    const issues = detectDiscrepancies(
      allItems.filter(i => i.source_type === "quote"),
      designItems || allItems.filter(i => i.source_type === "design_spec")
    );
    const powerBudget = calcPowerBudget(allItems);
    const weightLedger = calcWeightLedger(allItems);

    if (powerBudget.total_kw > 80) {
      issues.push({
        id: "iss_pw", issue_number: issues.length + 1, severity: "CRITICAL",
        category: "POWER BUDGET",
        finding: `Total draw ${powerBudget.total_kw} kW exceeds typical EU club supply (~80-100 kW). Minimum recommended: ${powerBudget.recommended_minimum_kw} kW.`,
        impact: "Generator required at most venues",
        action: "Confirm power supply per city; flag generator requirement in advance",
        resolved: false,
      });
    }
    if (powerBudget.missing_power_count > 0) {
      issues.push({
        id: "iss_mp", issue_number: issues.length + 1, severity: "HIGH",
        category: "POWER DATA MISSING",
        finding: `${powerBudget.missing_power_count} item(s) have no power draw data — total may be understated`,
        impact: "Power budget incomplete",
        action: "Confirm power specs with vendors or enrich from fixture DB",
        resolved: false,
      });
    }

    return res.json({ issues, powerBudget, weightLedger });
  }

  // PDF parse action
  if (!pdfBase64 || !docType) return res.status(400).json({ error: "Missing pdfBase64 or docType" });
  if (!["vendor_quote", "design_drawing"].includes(docType)) {
    return res.status(400).json({ error: "docType must be vendor_quote or design_drawing" });
  }

  const prompt = docType === "vendor_quote" ? QUOTE_PROMPT : DESIGN_PROMPT;

  let textContent, usage, stopReason;
  try {
    ({ text: textContent, stopReason, usage } = await postMessages({
      model: HEAVY_MODEL,
      maxTokens: 2048,
      system: "You are a production document parser for concert touring. Return ONLY valid JSON arrays. No markdown, no backticks, no preamble.",
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: prompt },
        ],
      }],
    }));
  } catch (e) {
    return res.status(502).json({ error: `Claude API error ${e.status}`, detail: e.detail });
  }
  const { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens } = usage;
  console.log(`[production] tokens: in=${inputTokens} out=${outputTokens} cache_read=${cacheReadTokens} cache_create=${cacheCreationTokens} stop=${stopReason}`);
  const parsed = extractJson(textContent);

  if (!Array.isArray(parsed)) {
    return res.status(422).json({ error: "Could not parse document", raw: textContent.slice(0, 600) });
  }

  const ts = Date.now();
  const enriched = parsed
    .filter(i => !i.is_crew)
    .map((item, idx) => {
      const enrichedItem = enrichItem({
        ...item,
        vendor_name: vendorName || null,
        vendor_quote_ref: quoteRef || null,
      });
      return {
        id: `item_${ts}_${idx}`,
        department: (enrichedItem.department || "OTHER").toUpperCase(),
        item_name: enrichedItem.item_name || enrichedItem.model_name || "Unknown",
        model_ref: enrichedItem.model_ref || enrichedItem.model_name || null,
        qty: enrichedItem.qty || 1,
        unit_cost: enrichedItem.unit_cost || null,
        total_cost: enrichedItem.total_cost || null,
        currency: enrichedItem.currency || null,
        weight_kg: enrichedItem.weight_kg || null,
        power_w: enrichedItem.power_w || null,
        ip_rating: enrichedItem.ip_rating || null,
        rig_position: classifyPosition(enrichedItem, null),
        position_note: enrichedItem.position_notes || null,
        is_package: enrichedItem.is_package || false,
        notes: enrichedItem.notes || null,
        spec_source: enrichedItem.spec_source || "quote",
        vendor_name: vendorName || null,
        vendor_quote_ref: quoteRef || null,
        source_type: docType === "vendor_quote" ? "quote" : "design_spec",
        visible_venue: !(enrichedItem.unit_cost || enrichedItem.total_cost),
      };
    });

  return res.json({ items: enriched, docType, vendorName, quoteRef, count: enriched.length, tokensUsed: inputTokens + outputTokens });
};
