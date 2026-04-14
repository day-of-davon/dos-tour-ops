/**
 * DOS Tour Module — HOS Compliance Engine
 * @module tours/mgmt/services/hos-compliance
 *
 * EC Regulation 561/2006 Hours of Service compliance checker.
 * Extracted from artifact v6.8 (lines 83-84, 632-643).
 * Zero React, zero storage, zero side effects.
 *
 * EC 561/2006 Rules:
 *   - 4h30m max continuous driving before 45-min break
 *   - 9h daily driving limit (extendable to 10h, max 2x per week)
 *   - 56h weekly driving limit
 *   - 90h bi-weekly driving limit
 */

import type { BusLeg, HosWeekSummary } from "../schema";

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/** EC 561/2006 Hours of Service limits (in minutes unless noted). */
export const HOS_LIMITS = {
  /** Max continuous driving before mandatory break (4h30m). */
  continuousMax: 270,
  /** Mandatory break duration after continuous driving (45m). */
  breakMin: 45,
  /** Standard daily driving limit (9h). */
  dailyMax: 540,
  /** Extended daily driving limit (10h), allowed max 2x/week. */
  dailyExtendedMax: 600,
  /** Max extended days per week. */
  extendedDaysPerWeek: 2,
  /** Weekly driving limit (56h). */
  weeklyMax: 56 * 60,  // 3360 minutes
  /** Bi-weekly (rolling 2-week) driving limit (90h). */
  biweeklyMax: 90 * 60, // 5400 minutes
} as const;

// ──────────────────────────────────────────────
// Daily Validation
// ──────────────────────────────────────────────

export interface DailyDriveResult {
  date: string;
  driveMin: number;
  isExtended: boolean;
  exceedsMax: boolean;
  violations: string[];
}

/**
 * Validate a single day's driving against HOS daily limits.
 *
 * @param date - ISO date string
 * @param driveMin - Total driving minutes for the day
 * @param dateLabel - Human-readable date label for violation messages
 */
export function validateDailyDrive(
  date: string,
  driveMin: number,
  dateLabel?: string,
): DailyDriveResult {
  const label = dateLabel ?? date;
  const violations: string[] = [];

  const isExtended = driveMin > HOS_LIMITS.dailyMax;
  const exceedsMax = driveMin > HOS_LIMITS.dailyExtendedMax;

  if (exceedsMax) {
    violations.push(
      `${label}: ${Math.round(driveMin / 60)}h exceeds 10h max`,
    );
  }

  return { date, driveMin, isExtended, exceedsMax, violations };
}

// ──────────────────────────────────────────────
// Weekly Compliance
// ──────────────────────────────────────────────

/**
 * Calculate HOS compliance for a single week of bus legs.
 *
 * @param weekNum - Week number (for labeling)
 * @param legs - Bus legs for this week
 * @param formatDate - Optional date formatter for violation messages
 */
export function calculateWeeklyHos(
  weekNum: number,
  legs: BusLeg[],
  formatDate?: (date: string) => string,
): HosWeekSummary {
  const fmtDate = formatDate ?? ((d: string) => d);

  const totalDrive = legs.reduce((sum, d) => sum + d.drive_min, 0);
  const totalKm = legs.reduce((sum, d) => sum + d.km, 0);
  const driveDays = legs.filter((d) => d.drive_min > 0);
  const maxDay = driveDays.length > 0
    ? Math.max(...driveDays.map((d) => d.drive_min))
    : 0;
  const extendedDays = driveDays.filter(
    (d) => d.drive_min > HOS_LIMITS.dailyMax,
  ).length;

  const violations: string[] = [];

  // Weekly limit check
  if (totalDrive > HOS_LIMITS.weeklyMax) {
    violations.push(
      `Weekly ${Math.round(totalDrive / 60)}h exceeds 56h`,
    );
  }

  // Per-day extended max check
  driveDays.forEach((d) => {
    if (d.drive_min > HOS_LIMITS.dailyExtendedMax) {
      violations.push(
        `${fmtDate(d.date)}: ${Math.round(d.drive_min / 60)}h exceeds 10h max`,
      );
    }
  });

  // Extended days per week check
  if (extendedDays > HOS_LIMITS.extendedDaysPerWeek) {
    violations.push(
      `${extendedDays} extended days (max ${HOS_LIMITS.extendedDaysPerWeek}/week)`,
    );
  }

  return {
    week: weekNum,
    total_drive_min: totalDrive,
    total_km: totalKm,
    max_day_min: maxDay,
    extended_days: extendedDays,
    show_days: legs.filter((d) => d.leg_type === "show").length,
    travel_days: legs.filter((d) => d.leg_type === "travel").length,
    off_days: legs.filter((d) => d.leg_type === "off").length,
    violations,
  };
}

// ──────────────────────────────────────────────
// Full Tour Compliance
// ──────────────────────────────────────────────

export interface TourHosResult {
  weekSummaries: Record<number, HosWeekSummary>;
  allViolations: string[];
  totals: {
    km: number;
    driveMin: number;
    shows: number;
    travelDays: number;
    offDays: number;
  };
}

/**
 * Calculate HOS compliance for an entire tour bus schedule.
 * Groups legs by week, validates each week, then checks bi-weekly limits.
 *
 * @param legs - All bus legs for the tour
 * @param formatDate - Optional date formatter for violation messages
 */
export function calculateTourHos(
  legs: BusLeg[],
  formatDate?: (date: string) => string,
): TourHosResult {
  // Group by week
  const weeks: Record<number, BusLeg[]> = {};
  legs.forEach((leg) => {
    if (!weeks[leg.week]) weeks[leg.week] = [];
    weeks[leg.week].push(leg);
  });

  const weekNums = Object.keys(weeks)
    .map(Number)
    .sort((a, b) => a - b);

  // Calculate per-week
  const weekSummaries: Record<number, HosWeekSummary> = {};
  weekNums.forEach((w) => {
    weekSummaries[w] = calculateWeeklyHos(w, weeks[w], formatDate);
  });

  // Bi-weekly check (rolling consecutive pairs)
  for (let i = 0; i < weekNums.length - 1; i++) {
    const w1 = weekNums[i];
    const w2 = weekNums[i + 1];
    const combined =
      weekSummaries[w1].total_drive_min + weekSummaries[w2].total_drive_min;
    if (combined > HOS_LIMITS.biweeklyMax) {
      weekSummaries[w2].violations.push(
        `Bi-weekly W${w1}+W${w2}: ${Math.round(combined / 60)}h exceeds 90h`,
      );
    }
  }

  // Collect all violations
  const allViolations = Object.values(weekSummaries).flatMap(
    (s) => s.violations,
  );

  // Totals
  const totals = {
    km: legs.reduce((s, d) => s + d.km, 0),
    driveMin: legs.reduce((s, d) => s + d.drive_min, 0),
    shows: legs.filter((d) => d.leg_type === "show").length,
    travelDays: legs.filter((d) => d.leg_type === "travel").length,
    offDays: legs.filter((d) => d.leg_type === "off").length,
  };

  return { weekSummaries, allViolations, totals };
}

// ──────────────────────────────────────────────
// Drive Time Percentage (for UI progress bars)
// ──────────────────────────────────────────────

/**
 * Calculate drive time as a percentage of the extended daily max.
 * Used for visual progress bars in the bus schedule UI.
 */
export function drivePercentage(driveMin: number): number {
  if (driveMin <= 0) return 0;
  return Math.min(100, Math.round((driveMin / HOS_LIMITS.dailyExtendedMax) * 100));
}

/**
 * Get the position (as percentage) of the standard daily limit marker
 * within the extended max range. Used for the 9h marker on progress bars.
 */
export function standardLimitMarkerPct(): number {
  return Math.round((HOS_LIMITS.dailyMax / HOS_LIMITS.dailyExtendedMax) * 100);
}
