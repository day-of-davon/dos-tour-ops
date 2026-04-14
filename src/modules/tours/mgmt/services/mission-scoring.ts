/**
 * DOS Tour Module — Mission Scoring Engine
 * @module tours/mgmt/services/mission-scoring
 *
 * Urgency scoring, gap detection, intent classification, and owner routing.
 * Extracted from artifact v6.8 (lines 88-91, 317-332, 499-523).
 * Zero React, zero storage, zero side effects.
 *
 * Scoring model:
 *   URGENCY = f(tier, days_waiting, days_to_deadline, action_owner, thread_status)
 *   Touring (Tier 1):
 *     CRITICAL: show <10d AND unresolved, OR waited >5d
 *     HIGH: show 10-21d AND needs response, OR waited >3d
 *     MEDIUM: show 21+d, needs response
 *     LOW: awareness, being handled by others
 */

import type {
  Gap,
  UrgencyLevel,
  Intent,
  Owner,
  MissionItem,
  TourShow,
  CrewAssignment,
} from "../schema";
import { daysUntil } from "./ros-engine";

// ──────────────────────────────────────────────
// Urgency Scoring
// ──────────────────────────────────────────────

export interface UrgencyMeta {
  id: UrgencyLevel;
  label: string;
  color: string;
  bg: string;
  border: string;
}

export const URGENCY_LEVELS: UrgencyMeta[] = [
  { id: "critical", label: "CRITICAL", color: "#991B1B", bg: "#FEF2F2", border: "#FECACA" },
  { id: "high",     label: "HIGH",     color: "#92400E", bg: "#FFFBEB", border: "#FDE68A" },
  { id: "medium",   label: "MEDIUM",   color: "#1E40AF", bg: "#EFF6FF", border: "#BFDBFE" },
  { id: "low",      label: "LOW",      color: "#475569", bg: "#F8FAFC", border: "#E2E8F0" },
];

/** Look up urgency metadata by ID. Falls back to LOW. */
export function getUrgencyMeta(id: string): UrgencyMeta {
  return URGENCY_LEVELS.find((u) => u.id === id) ?? URGENCY_LEVELS[3];
}

/**
 * Score urgency for a mission item based on show proximity and wait time.
 *
 * @param showDate - ISO date of related show (null if not show-specific)
 * @param created - ISO datetime when the item was created
 * @param owner - Who owns the action
 * @returns Recommended urgency level
 */
export function scoreUrgency(
  showDate: string | null,
  created: string,
  owner: string,
): UrgencyLevel {
  const daysWaiting = Math.round(
    (Date.now() - new Date(created).getTime()) / 86400000,
  );

  if (showDate) {
    const daysOut = daysUntil(showDate);

    // Show-date-driven urgency
    if (daysOut <= 10 || daysWaiting > 5) return "critical";
    if (daysOut <= 21 || daysWaiting > 3) return "high";
    if (daysOut <= 42) return "medium";
    return "low";
  }

  // Non-show items: urgency by wait time
  if (daysWaiting > 5) return "critical";
  if (daysWaiting > 3) return "high";
  if (daysWaiting > 1) return "medium";
  return "low";
}

// ──────────────────────────────────────────────
// Gap Detection
// ──────────────────────────────────────────────

export interface GapDetectionInput {
  shows: Array<{
    date: string;
    city: string;
    venue: string;
    country: string;
    doors_confirmed: boolean;
    curfew_confirmed: boolean;
    advance_status: string;
    notes?: string | null;
  }>;
  crewAssignments?: Record<string, CrewAssignment[]>;
  /** Known static gaps to always include. */
  knownGaps?: Array<{ type: "crit" | "warn"; message: string }>;
}

/**
 * Auto-detect operational gaps from show calendar + crew data.
 *
 * Checks:
 *   - Unconfirmed doors/curfew within 21 days
 *   - Advances not started within 14 days
 *   - Immigration forms outstanding (France shows with notes containing "immigration")
 *   - Known static gaps (tour insurance, TBD roles, outstanding forms)
 *
 * @returns Sorted array of gaps (nearest deadline first)
 */
export function detectGaps(input: GapDetectionInput): Gap[] {
  const gaps: Gap[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = input.shows.filter((s) => s.date >= today);

  // Shows within 21 days: check anchors and advance status
  const near = upcoming.filter((s) => daysUntil(s.date) <= 21);
  near.forEach((s) => {
    const days = daysUntil(s.date);
    if (!s.doors_confirmed) {
      gaps.push({
        type: "warn",
        category: "doors",
        message: `Doors unconfirmed`,
        show_date: s.date,
        city: s.city,
        days_out: days,
      });
    }
    if (!s.curfew_confirmed) {
      gaps.push({
        type: "warn",
        category: "curfew",
        message: `Curfew unconfirmed`,
        show_date: s.date,
        city: s.city,
        days_out: days,
      });
    }
    if (s.advance_status === "not_started" && days <= 14) {
      gaps.push({
        type: "crit",
        category: "advance",
        message: `Advance not started`,
        show_date: s.date,
        city: s.city,
        days_out: days,
      });
    }
  });

  // France immigration check
  const franceShows = upcoming.filter((s) => s.country === "FR");
  const hasImmigrationNote = franceShows.some(
    (s) => s.notes?.toLowerCase().includes("immigration"),
  );
  if (franceShows.length > 0 && hasImmigrationNote) {
    const nearestFr = franceShows.reduce(
      (min, s) => Math.min(min, daysUntil(s.date)),
      999,
    );
    gaps.push({
      type: "crit",
      category: "immigration",
      message: "French immigration forms outstanding",
      show_date: null,
      city: null,
      days_out: nearestFr,
    });
  }

  // Known static gaps
  if (input.knownGaps) {
    input.knownGaps.forEach((kg) => {
      gaps.push({
        type: kg.type,
        category: "known",
        message: kg.message,
        show_date: null,
        city: null,
        days_out: null,
      });
    });
  }

  // Sort: nearest deadline first, nulls last
  return gaps.sort(
    (a, b) => (a.days_out ?? 999) - (b.days_out ?? 999),
  );
}

// ──────────────────────────────────────────────
// Hardcoded Known Gaps (bbno$ specific, Apr 2026)
// ──────────────────────────────────────────────

/** Known gaps that aren't derivable from data. Update as they resolve. */
export const KNOWN_GAPS: Array<{ type: "crit" | "warn"; message: string }> = [
  { type: "crit", message: "Tour insurance at $0" },
  { type: "warn", message: "Tour coordinator TBD" },
  { type: "warn", message: "Truck driver TBD" },
  { type: "warn", message: "Wasserman UK form outstanding" },
];

// ──────────────────────────────────────────────
// Owner Routing
// ──────────────────────────────────────────────

/**
 * Thread domain to owner routing matrix.
 * Used by Gmail sync to auto-assign action owners.
 */
export const OWNER_ROUTING: Record<string, { owner: Owner; description: string }> = {
  settlement:    { owner: "DAVON",      description: "Settlements, wire info, tax forms" },
  advance:       { owner: "DAVON",      description: "Venue advances (non-production)" },
  transport:     { owner: "DAVON",      description: "Bus, truck, ground transport" },
  immigration:   { owner: "DAVON",      description: "Immigration, withholding" },
  production:    { owner: "SHECK",      description: "Stage plots, rigging, LX, VX, audio" },
  audio:         { owner: "DAN",        description: "Audio, creative, mix decisions" },
  management:    { owner: "MANAGEMENT", description: "Sam/Sandro business decisions" },
  vendor:        { owner: "VENDOR",     description: "External vendor pending" },
  merch:         { owner: "CREW",       description: "Grace (merch)" },
  hospitality:   { owner: "CREW",       description: "Megan (hospo)" },
  foh:           { owner: "CREW",       description: "Ruairi (FOH)" },
  legal:         { owner: "LEGAL",      description: "Attorney review" },
  finance:       { owner: "ACCOUNTANT", description: "Tony/Rajdeep DMCL" },
};

// ──────────────────────────────────────────────
// Intent Classification Keywords
// ──────────────────────────────────────────────

/** Keyword patterns for auto-classifying thread intent. */
export const INTENT_KEYWORDS: Record<Intent, string[]> = {
  ADVANCE:     ["advance", "rider", "hospitality", "catering", "m&g", "meet and greet", "dressing room"],
  PRODUCTION:  ["production", "audio", "video", "lighting", "stage plot", "rigging", "soundcheck", "LED", "laser"],
  SETTLEMENT:  ["settlement", "wire", "payment", "invoice", "guarantee", "backend"],
  LOGISTICS:   ["bus", "truck", "flight", "hotel", "ground transport", "routing", "driver"],
  LEGAL:       ["contract", "rider", "FEC", "immigration", "insurance", "NDA", "visa", "work permit"],
  FINANCE:     ["invoice", "budget", "payroll", "expense", "tax", "W9", "1099", "withholding"],
  MERCH:       ["merch", "merchandise", "donation", "inventory"],
  MEDIA:       ["photo", "video", "press", "TikTok", "content", "PR", "credential"],
  GUEST_LIST:  ["guest list", "comp", "VIP", "ticket", "credential"],
  ADMIN:       ["schedule", "calendar", "call", "meeting", "onboarding", "coordinator"],
  DEV:         ["code", "platform", "bug", "deploy", "API", "database"],
  INFO_ONLY:   ["FYI", "auto-reply", "notification", "newsletter", "receipt"],
};

/**
 * Auto-classify thread intent from subject line and sender context.
 * Returns the best-matching intent, or null if no strong match.
 */
export function classifyIntent(
  subject: string,
  fromContext?: string,
): Intent | null {
  const text = `${subject} ${fromContext ?? ""}`.toLowerCase();

  let bestMatch: Intent | null = null;
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const score = keywords.filter((kw) =>
      text.includes(kw.toLowerCase()),
    ).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = intent as Intent;
    }
  }

  return bestMatch;
}

// ──────────────────────────────────────────────
// Mission Item Categorization (for sections A-G)
// ──────────────────────────────────────────────

export interface CategorizedMission {
  critical: MissionItem[];
  high: MissionItem[];
  aging: MissionItem[];
  active: MissionItem[];
  resolved: MissionItem[];
}

/**
 * Categorize mission items into sections for display.
 * Aging = open items >48h where owner is DAVON.
 */
export function categorizeMissionItems(
  items: MissionItem[],
): CategorizedMission {
  const critical = items.filter(
    (i) => i.urgency === "critical" && i.status === "open",
  );
  const high = items.filter(
    (i) => i.urgency === "high" && i.status === "open",
  );
  const aging = items.filter((i) => {
    if (i.status !== "open" || i.owner !== "DAVON") return false;
    const age =
      (Date.now() - new Date(i.created_at ?? Date.now()).getTime()) / 3600000;
    return age > 48;
  });
  const active = items.filter(
    (i) =>
      (i.urgency === "medium" || i.urgency === "low") && i.status === "open",
  );
  const resolved = items.filter((i) => i.status === "resolved");

  return { critical, high, aging, active, resolved };
}
