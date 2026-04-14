/**
 * DOS Tour Module — ROS Time Engine
 * @module tours/mgmt/services/ros-engine
 *
 * Pure functions for calculating Running Order of Show block times.
 * Extracted from artifact v6.8 (lines 746-770).
 * Zero React, zero storage, zero side effects.
 *
 * Architecture:
 *   5 anchors (Bus Arrival, Crew Call, M&G, Doors, Curfew) define fixed points.
 *   All other blocks derive their times relative to these anchors:
 *     - Pre-show: forward from Crew Call
 *     - M&G Check-In: backward from M&G anchor
 *     - Doors Early: backward from Doors anchor
 *     - Show blocks: forward from Doors + 60min (audience fill)
 *     - Post blocks: forward from Curfew, or offset from headline end
 *     - Settlement: headline end + 30min (not curfew-relative)
 *     - Crew Call Back: headline end - 30min
 */

import type { RosBlock, BlockTimes, ShowAnchors, RosPhase, AnchorKey } from "../schema";

// ──────────────────────────────────────────────
// Time Utilities
// ──────────────────────────────────────────────

/** Convert hours + minutes to minutes from midnight. */
export function toMinutes(h: number, m: number = 0): number {
  return h * 60 + m;
}

/** Format minutes from midnight to 12h string (e.g., 1140 -> "7:00p"). */
export function formatTime(mins: number | null | undefined): string {
  if (mins == null) return "--";
  const n = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(n / 60);
  const m = n % 60;
  const period = h >= 12 ? "p" : "a";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
}

/** Parse a 12h time string to minutes from midnight. Returns null on invalid input. */
export function parseTime(str: string): number | null {
  if (!str) return null;
  const match = str.match(/^(\d{1,2}):(\d{2})\s*(a|p|am|pm)?$/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const mi = parseInt(match[2]);
  const pe = (match[3] || "a").toLowerCase();
  if (pe.startsWith("p") && h < 12) h += 12;
  if (pe.startsWith("a") && h === 12) h = 0;
  return h * 60 + mi;
}

/** Format minutes as duration string (e.g., 135 -> "2h15m"). */
export function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

/** Days until a date from today. */
export function daysUntil(dateStr: string): number {
  const now = new Date();
  const then = new Date(dateStr + "T12:00:00");
  return Math.ceil((then.getTime() - now.getTime()) / 86400000);
}

// ──────────────────────────────────────────────
// Core Time Engine
// ──────────────────────────────────────────────

/**
 * Calculate start/end times for every block in a ROS, given show anchors.
 *
 * This is the heart of the scheduling engine. Rules:
 *   1. bus_in phase: anchored directly to busArrive
 *   2. pre phase (non-anchor): forward-chain from crewCall
 *   3. mg phase: M&G Check-In = mgTime - checkInDuration; M&G = mgTime
 *   4. doors phase: Doors Early = doors - earlyDuration; Doors GA = doors
 *   5. show phase: forward-chain from doors + 60min (audience fill buffer)
 *   6. curfew phase: anchored directly to curfew
 *   7. post phase:
 *      - Blocks with offsetRef "bbno_set_end": relative to headline set end time
 *      - Blocks without offsetRef: forward-chain from curfew
 *
 * @param anchors - The 5 anchor times (in minutes from midnight)
 * @param blocks - Ordered array of ROS blocks
 * @returns Record mapping block ID to calculated start/end times
 */
export function calculateBlockTimes(
  anchors: ShowAnchors,
  blocks: RosBlock[],
): Record<string, BlockTimes> {
  const t: Record<string, BlockTimes> = {};
  const { doors, curfew, busArrive, crewCall, venueAccess, mgTime } = anchors;

  // Bus arrival + venue access: direct anchor
  t.bus_arrive = { s: busArrive, e: busArrive };
  t.venue_access = { s: venueAccess, e: venueAccess };
  t.crew_call = { s: crewCall, e: crewCall };

  // Pre-show blocks: forward-chain from crewCall
  const preBlocks = blocks.filter((b) => b.phase === "pre" && !b.isAnchor);
  let cursor = crewCall;
  for (const b of preBlocks) {
    t[b.id] = { s: cursor, e: cursor + b.duration };
    cursor += b.duration;
  }

  // M&G: check-in is reverse-calculated from mgTime
  const mgCheckInDur = blocks.find((b) => b.id === "mg_checkin")?.duration ?? 30;
  t.mg_checkin = { s: mgTime - mgCheckInDur, e: mgTime };
  const mgDur = blocks.find((b) => b.id === "mg")?.duration ?? 120;
  t.mg = { s: mgTime, e: mgTime + mgDur };

  // Doors: early entry is reverse-calculated from doors
  const earlyDur = blocks.find((b) => b.id === "doors_early")?.duration ?? 30;
  t.doors_early = { s: doors - earlyDur, e: doors };
  t.doors_ga = { s: doors, e: doors };

  // Show blocks: forward-chain from doors + 60min audience fill
  const showBlocks = blocks.filter((b) => b.phase === "show");
  cursor = doors + 60;
  for (const b of showBlocks) {
    t[b.id] = { s: cursor, e: cursor + b.duration };
    cursor += b.duration;
  }

  // Headline end time (used for post-show offset calculations)
  const headlineEnd = t.bbno_set?.e ?? curfew;

  // Curfew: direct anchor
  t.curfew = { s: curfew, e: curfew };

  // Post-show blocks: offset-ref or forward-chain from curfew
  const postBlocks = blocks.filter((b) => b.phase === "post");
  cursor = curfew;
  for (const b of postBlocks) {
    if (b.offsetRef === "bbno_set_end") {
      const start = headlineEnd + (b.offsetMin ?? 0);
      t[b.id] = { s: start, e: start + b.duration };
      continue;
    }
    t[b.id] = { s: cursor, e: cursor + b.duration };
    cursor += b.duration;
  }

  return t;
}

// ──────────────────────────────────────────────
// Block Resolution
// ──────────────────────────────────────────────

/**
 * Resolve which ROS blocks to use for a given show date.
 * Priority: user overrides > custom template > default template.
 *
 * @param userOverrides - Per-show user overrides (from storage/DB), keyed by date
 * @param customTemplates - Hardcoded custom templates (e.g., Red Rocks), keyed by date
 * @param defaultTemplate - Factory function returning default EU ROS blocks
 * @param date - Show date string
 */
export function resolveRos(
  date: string,
  userOverrides: Record<string, RosBlock[]>,
  customTemplates: Record<string, () => RosBlock[]>,
  defaultTemplate: () => RosBlock[],
): RosBlock[] {
  if (userOverrides[date]) return userOverrides[date];
  if (customTemplates[date]) return customTemplates[date]();
  return defaultTemplate();
}

// ──────────────────────────────────────────────
// Block Reorder with M&G Enforcement
// ──────────────────────────────────────────────

/**
 * Reorder blocks via drag-drop within the same phase.
 * Enforces: M&G Check-In always precedes M&G.
 *
 * @param blocks - Current block list
 * @param fromId - Block being moved
 * @param toId - Target position block
 * @returns New block array, or null if reorder is invalid
 */
export function reorderBlocks(
  blocks: RosBlock[],
  fromId: string,
  toId: string,
): RosBlock[] | null {
  const fromIdx = blocks.findIndex((b) => b.id === fromId);
  const toIdx = blocks.findIndex((b) => b.id === toId);

  if (fromIdx < 0 || toIdx < 0) return null;
  if (blocks[fromIdx].phase !== blocks[toIdx].phase) return null;
  if (blocks[fromIdx].isAnchor || blocks[toIdx].isAnchor) return null;

  const result = [...blocks];
  const [moved] = result.splice(fromIdx, 1);
  result.splice(toIdx, 0, moved);

  // Enforce M&G Check-In before M&G
  const ciIdx = result.findIndex((b) => b.id === "mg_checkin");
  const mgIdx = result.findIndex((b) => b.id === "mg");
  if (ciIdx >= 0 && mgIdx >= 0 && ciIdx > mgIdx) {
    const [ci] = result.splice(ciIdx, 1);
    result.splice(mgIdx, 0, ci);
  }

  return result;
}

// ──────────────────────────────────────────────
// Role Visibility
// ──────────────────────────────────────────────

/** Block IDs that are always full-brightness regardless of role view. */
export const ALWAYS_BRIGHT_BLOCKS = new Set([
  "bus_arrive", "doors_early", "doors_ga", "clear", "bus_depart",
]);

/**
 * Check if a block should be highlighted for a given role view.
 * TM sees all blocks. Other roles see their tagged blocks + universal-bright blocks.
 */
export function isBlockVisible(block: RosBlock, role: string): boolean {
  if (ALWAYS_BRIGHT_BLOCKS.has(block.id)) return true;
  if (role === "tm") return true;
  return block.roles?.includes(role as any) ?? false;
}

// ──────────────────────────────────────────────
// Anchor Labels
// ──────────────────────────────────────────────

export const ANCHOR_LABELS: Record<AnchorKey, string> = {
  busArrive: "Bus Arrival",
  venueAccess: "Venue Access",
  crewCall: "Crew Call",
  mgTime: "Meet & Greet",
  doors: "Doors",
  curfew: "Curfew",
};

// ──────────────────────────────────────────────
// Phase Metadata
// ──────────────────────────────────────────────

export interface PhaseMeta {
  key: RosPhase;
  label: string;
  description: string;
}

export const PHASES: PhaseMeta[] = [
  { key: "bus_in",  label: "BUS ARRIVAL",  description: "Anchor (GPS-ready)" },
  { key: "pre",     label: "PRE-SHOW",     description: "Forward from Crew Call" },
  { key: "mg",      label: "MEET & GREET", description: "Anchor. Check-in auto-precedes." },
  { key: "doors",   label: "DOORS",        description: "Contract anchor" },
  { key: "show",    label: "SHOW",         description: "Forward from Doors +60min" },
  { key: "curfew",  label: "CURFEW",       description: "Contract anchor" },
  { key: "post",    label: "POST-SHOW",    description: "Relative to set end / curfew" },
];

// ──────────────────────────────────────────────
// Anchor Extraction Helper
// ──────────────────────────────────────────────

/**
 * Extract ShowAnchors from a TourShow database row.
 * Maps snake_case DB columns to camelCase engine inputs.
 */
export function extractAnchors(show: {
  doors: number;
  curfew: number;
  bus_arrive: number;
  crew_call: number;
  venue_access: number;
  mg_time: number;
}): ShowAnchors {
  return {
    doors: show.doors,
    curfew: show.curfew,
    busArrive: show.bus_arrive,
    crewCall: show.crew_call,
    venueAccess: show.venue_access,
    mgTime: show.mg_time,
  };
}
