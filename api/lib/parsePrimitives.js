// api/lib/parsePrimitives.js — shared parser guards + prompt blocks for all scanners
// Used by api/flights.js, api/intel.js, api/lodging-scan.js. Additive-only:
// returns validation flags that callers can emit into their own payloads.

// ── Stopwords (ported from Buchner emailparser.py lines 241-248) ──────────────
// Tokens that indicate a field was scraped from UI chrome / marketing copy
// rather than real booking data. If any appears inside from/to/pax/guest/venue,
// emit "ui_chrome_leakage" and null the offending field.
const STOPWORDS = [
  "manage flight", "manage booking", "manage reservation",
  "airport lounges", "total estimated cost", "estimated total",
  "book now", "see deal", "take this survey", "rate your flight",
  "enjoy", "experience", "entertainment", "footer", "awards",
  "callout panel", "right column", "award miles",
  "foreign affairs", "security", "requires approval",
  "www.", "http://", "https://", "click here",
];

// Month names (English, Spanish, German, French) — if a pax/airport value is
// ONLY a month name, it's a table-leak from a date column header.
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  "januar", "februar", "märz", "mai", "juni", "juli",
  "oktober", "dezember",
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function hasStopword(value) {
  if (!value || typeof value !== "string") return false;
  const v = value.toLowerCase();
  if (v.includes("@") || v.includes("#")) return true;
  if (MONTH_NAMES.includes(v.trim())) return true;
  return STOPWORDS.some(s => v.includes(s));
}

// ── Code-format validators (ported from Buchner lines 302-315) ────────────────
const PNR_RE       = /^[A-Z0-9]{6}$/;
const CONFIRMNO_RE = /^[A-Z0-9]{6,12}$/;
const TICKETNO_RE  = /^\d{3}-?\d{10}$/;

function isPnr(s)       { return typeof s === "string" && PNR_RE.test(s.trim().toUpperCase()); }
function isConfirmNo(s) { return typeof s === "string" && CONFIRMNO_RE.test(s.trim().toUpperCase()); }
function isTicketNo(s)  { return typeof s === "string" && TICKETNO_RE.test(s.trim().replace(/\s/g, "")); }

// ── Date range guard (ported from Buchner lines 115-117) ──────────────────────
// Dates outside [tourStart - 180d, tourEnd + 180d] are almost certainly
// hallucinations or year-parse errors (e.g., "2025" read as "2035").
function isInTourDateRange(dateStr, tourStart, tourEnd, bufferDays = 180) {
  if (!dateStr) return true;  // null is ok; caller decides separately whether it's required
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const lo = new Date(tourStart); lo.setDate(lo.getDate() - bufferDays);
  const hi = new Date(tourEnd);   hi.setDate(hi.getDate() + bufferDays);
  return d >= lo && d <= hi;
}

// ── IATA extraction (ported from Buchner shortenAirport lines 66-78) ──────────
// "Paris Charles de Gaulle (CDG)" → "CDG". Leaves pure 3-letter codes alone.
function shortenAirport(value) {
  if (!value || typeof value !== "string") return value;
  const trimmed = value.trim();
  if (/^[A-Z]{3}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/\(([A-Z]{3})\)\s*$/);
  return m ? m[1] : trimmed;
}

// ── Person normalization (crew/vendor roster matching) ────────────────────────
// Returns { crewId, displayName } when the raw string likely names a known
// person; otherwise { crewId: null, displayName: <original> }.
// Match: exact surname + first-initial match, or Levenshtein ≤ 2 on full name.
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

// Airline "LASTNAME/FIRSTNAME [TITLE]" → "Firstname Lastname"
function unairline(raw) {
  if (!raw || typeof raw !== "string") return raw || "";
  const s = raw.trim().replace(/\s+(MR|MRS|MS|MISS|DR|MSTR)$/i, "");
  if (s.includes("/")) {
    const [last, first] = s.split("/").map(x => x.trim());
    if (last && first) {
      const titleCase = w => w.split(/(\s|-)/).map(p => p && p[0] ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p).join("");
      return `${titleCase(first)} ${titleCase(last)}`;
    }
  }
  return s;
}

function normalizePerson(rawName, roster) {
  const displayName = unairline(rawName);
  if (!roster || !roster.length) return { crewId: null, displayName };

  const name = displayName.toLowerCase();
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return { crewId: null, displayName };

  const first = parts[0];
  const last  = parts[parts.length - 1];

  // Pass 1: exact surname + first-initial match
  for (const c of roster) {
    if (c.last.toLowerCase() === last && c.first.toLowerCase()[0] === first[0]) {
      return { crewId: c.id, displayName: `${c.first} ${c.last}` };
    }
  }

  // Pass 2: full-name Levenshtein ≤ 2
  for (const c of roster) {
    const full = `${c.first} ${c.last}`.toLowerCase();
    if (levenshtein(name, full) <= 2) {
      return { crewId: c.id, displayName: `${c.first} ${c.last}` };
    }
  }

  return { crewId: null, displayName };
}

// ── Prompt blocks (shared across scanner sysPrompts) ──────────────────────────

function buildSynonymBlock() {
  return `Header synonyms across languages you may encounter:
- departure:  departs | departure | salida | abflug | départ | partenza
- arrival:    arrives | arrival | llegada | ankunft | arrivée | arrivo
- flight no:  flight | vuelo № | flugnummer | numéro de vol | volo
- booking:    booking id | booking number | código de reserva | código de reservación | buchungsnummer | numéro de réservation | PNR #
- eticket:    eticket number | e-ticket # | nº billete electrónico | e-ticket-nr | numéro de billet
- check-in:   check-in | registro | anreise | arrivée (hotel)
- check-out:  check-out | salida | abreise | départ (hotel)`;
}

function buildConfidenceRubric() {
  return `Confidence rubric — set "confidence" on every object:
- high : all core identifier + timing fields present and unambiguous.
- med  : 1-2 fields missing or ambiguous, but the record is keepable.
- low  : core timing/routing ambiguous; OCR-garbled; conflicting values across body and attachment.
When confidence is med or low, set "parseNotes" to a single sentence explaining WHY (e.g. "No PNR present; only order number found" or "Body and PDF disagree on arrival time").
When confidence is high, set "parseNotes" to null.`;
}

function buildStopwordRule() {
  return `Anti-chrome rule: NEVER populate a passenger, guest, airport, or venue
field with UI chrome like "Manage flight", "Airport Lounges", "Total estimated
cost", "Book now", "here", "Click here", email addresses, URLs, or standalone
month names. If the only candidate string in a field is UI chrome, leave that
field null and lower confidence.`;
}

// ── Common post-parse validator ───────────────────────────────────────────────
// Runs per-record checks shared across scanners. Returns { flags, fixed } where
// `flags` is the validationFlags array to emit and `fixed` is a shallow copy of
// the input with null'd fields for fatal cases. Caller decides whether to drop.
function validateCommon(obj, opts = {}) {
  const { tourStart, tourEnd, dateKeys = [], codeKeys = {}, stopwordKeys = [] } = opts;
  const flags = [];
  const fixed = { ...obj };

  // Stopword / UI-chrome leakage
  for (const k of stopwordKeys) {
    const v = obj[k];
    if (Array.isArray(v)) {
      const cleaned = v.filter(x => !hasStopword(x));
      if (cleaned.length !== v.length) {
        flags.push("ui_chrome_leakage");
        fixed[k] = cleaned;
      }
    } else if (hasStopword(v)) {
      flags.push("ui_chrome_leakage");
      fixed[k] = null;
    }
  }

  // Date-range guard
  if (tourStart && tourEnd) {
    for (const k of dateKeys) {
      if (obj[k] && !isInTourDateRange(obj[k], tourStart, tourEnd)) {
        flags.push("date_out_of_range");
        fixed[k] = null;
      }
    }
  }

  // Code-format checks (keys: {pnr: obj.pnrField, confirmNo: ..., ticketNo: ...})
  if (codeKeys.pnr && obj[codeKeys.pnr] && !isPnr(obj[codeKeys.pnr])) {
    flags.push("code_format_mismatch");
  }
  if (codeKeys.confirmNo && obj[codeKeys.confirmNo] && !isConfirmNo(obj[codeKeys.confirmNo])) {
    flags.push("code_format_mismatch");
  }
  if (codeKeys.ticketNo && obj[codeKeys.ticketNo] && !isTicketNo(obj[codeKeys.ticketNo])) {
    flags.push("code_format_mismatch");
  }

  return { flags: [...new Set(flags)], fixed };
}

module.exports = {
  STOPWORDS, MONTH_NAMES,
  hasStopword,
  isPnr, isConfirmNo, isTicketNo,
  isInTourDateRange,
  shortenAirport,
  normalizePerson, unairline, levenshtein,
  buildSynonymBlock, buildConfidenceRubric, buildStopwordRule,
  validateCommon,
};
