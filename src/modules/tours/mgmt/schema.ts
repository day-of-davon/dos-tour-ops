/**
 * DOS Tour Module — Zod Schemas
 * @module tours/mgmt/schema
 *
 * All entity schemas for the tour management module.
 * These map 1:1 to Supabase tables (tour_*).
 * Used by tRPC router for input validation and type inference.
 */

import { z } from "zod";

// ──────────────────────────────────────────────
// Enums
// ──────────────────────────────────────────────

export const rosPhaseEnum = z.enum([
  "bus_in", "pre", "mg", "doors", "show", "curfew", "post",
]);
export type RosPhase = z.infer<typeof rosPhaseEnum>;

export const anchorKeyEnum = z.enum([
  "busArrive", "venueAccess", "crewCall", "mgTime", "doors", "curfew",
]);
export type AnchorKey = z.infer<typeof anchorKeyEnum>;

export const regionEnum = z.enum(["na", "eu", "eu-post", "summer"]);
export type Region = z.infer<typeof regionEnum>;

export const travelModeEnum = z.enum(["bus", "fly", "local", "vendor", "drive"]);
export type TravelMode = z.infer<typeof travelModeEnum>;

export const flightDirectionEnum = z.enum(["inbound", "outbound"]);
export type FlightDirection = z.infer<typeof flightDirectionEnum>;

export const flightStatusEnum = z.enum(["pending", "confirmed", "cancelled"]);
export type FlightStatus = z.infer<typeof flightStatusEnum>;

export const urgencyEnum = z.enum(["critical", "high", "medium", "low"]);
export type UrgencyLevel = z.infer<typeof urgencyEnum>;

export const intentEnum = z.enum([
  "ADVANCE", "PRODUCTION", "SETTLEMENT", "LOGISTICS",
  "LEGAL", "FINANCE", "MERCH", "MEDIA",
  "GUEST_LIST", "ADMIN", "DEV", "INFO_ONLY",
]);
export type Intent = z.infer<typeof intentEnum>;

export const ownerEnum = z.enum([
  "DAVON", "SHECK", "DAN", "MANAGEMENT",
  "VENDOR", "CREW", "LEGAL", "ACCOUNTANT", "NONE",
]);
export type Owner = z.infer<typeof ownerEnum>;

export const advanceStatusEnum = z.enum([
  "not_started", "in_progress", "complete",
]);
export type AdvanceStatus = z.infer<typeof advanceStatusEnum>;

export const roleViewEnum = z.enum([
  "tm", "production", "hospitality", "transport",
]);
export type RoleView = z.infer<typeof roleViewEnum>;

export const busLegTypeEnum = z.enum(["show", "travel", "off"]);
export type BusLegType = z.infer<typeof busLegTypeEnum>;

// ──────────────────────────────────────────────
// Tour (parent entity)
// ──────────────────────────────────────────────

export const tourSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string().min(1).describe("Tour name, e.g. 'Internet Explorer Tour'"),
  artist: z.string().min(1).describe("Primary artist"),
  status: z.string().default("active"),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});
export type Tour = z.infer<typeof tourSchema>;

// ──────────────────────────────────────────────
// Tour Show (per-date)
// ──────────────────────────────────────────────

/** Minutes from midnight. 7:00p = 1140, 11:00p = 1380. */
const minutesField = z.number().int().min(0).max(1440);

export const tourShowSchema = z.object({
  id: z.string().uuid(),
  tour_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  event_id: z.string().uuid().nullable().default(null),
  date: z.string().date().describe("ISO date, e.g. '2026-04-16'"),
  city: z.string().min(1),
  venue: z.string().min(1),
  country: z.string().length(2).default("US"),
  region: regionEnum.default("na"),
  promoter: z.string().nullable().default(null),
  doors: minutesField.default(1140).describe("Doors time in minutes from midnight"),
  curfew: minutesField.default(1380),
  bus_arrive: minutesField.default(540),
  crew_call: minutesField.default(630),
  venue_access: minutesField.default(540),
  mg_time: minutesField.default(990),
  doors_confirmed: z.boolean().default(false),
  curfew_confirmed: z.boolean().default(false),
  bus_arrive_confirmed: z.boolean().default(false),
  crew_call_confirmed: z.boolean().default(false),
  venue_access_confirmed: z.boolean().default(false),
  mg_confirmed: z.boolean().default(false),
  deal: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  advance_status: advanceStatusEnum.default("not_started"),
  eta_source: z.enum(["schedule", "manual", "gps"]).default("schedule"),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});
export type TourShow = z.infer<typeof tourShowSchema>;

/** Subset of TourShow used for anchor time calculations. */
export const showAnchorsSchema = z.object({
  doors: minutesField,
  curfew: minutesField,
  busArrive: minutesField,
  crewCall: minutesField,
  venueAccess: minutesField,
  mgTime: minutesField,
});
export type ShowAnchors = z.infer<typeof showAnchorsSchema>;

// ──────────────────────────────────────────────
// ROS Block
// ──────────────────────────────────────────────

export const rosBlockSchema = z.object({
  id: z.string().describe("Unique block ID, e.g. 'bus_arrive', 'sc_bbno'"),
  label: z.string().min(1),
  duration: z.number().int().min(0).describe("Duration in minutes"),
  phase: rosPhaseEnum,
  type: z.string().optional().describe("Block type: bus, setup, soundcheck, performance, etc."),
  color: z.string().optional(),
  roles: z.array(roleViewEnum).default(["tm"]),
  note: z.string().optional().default(""),
  isAnchor: z.boolean().optional().default(false),
  anchorKey: anchorKeyEnum.optional(),
  offsetRef: z.string().optional().describe("Reference block ID for offset, e.g. 'bbno_set_end'"),
  offsetMin: z.number().int().optional().describe("Offset minutes from reference (negative = before)"),
  sortOrder: z.number().int().optional().default(0),
});
export type RosBlock = z.infer<typeof rosBlockSchema>;

/** Calculated start/end times for a block. */
export const blockTimesSchema = z.object({
  s: z.number().int().describe("Start time in minutes from midnight"),
  e: z.number().int().describe("End time in minutes from midnight"),
});
export type BlockTimes = z.infer<typeof blockTimesSchema>;

// ──────────────────────────────────────────────
// Crew
// ──────────────────────────────────────────────

export const crewMemberSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string().min(1),
  role: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  created_at: z.string().datetime().optional(),
});
export type CrewMember = z.infer<typeof crewMemberSchema>;

export const crewAssignmentSchema = z.object({
  id: z.string().uuid(),
  tour_show_id: z.string().uuid(),
  crew_member_id: z.string().uuid(),
  attending: z.boolean().default(false),
  in_mode: travelModeEnum.default("bus"),
  out_mode: travelModeEnum.default("bus"),
  created_at: z.string().datetime().optional(),
});
export type CrewAssignment = z.infer<typeof crewAssignmentSchema>;

export const flightLegSchema = z.object({
  id: z.string().uuid(),
  assignment_id: z.string().uuid(),
  direction: flightDirectionEnum,
  flight: z.string().nullable().default(null),
  from_airport: z.string().default(""),
  to_airport: z.string().default(""),
  depart_time: z.string().nullable().default(null),
  arrive_time: z.string().nullable().default(null),
  confirmation: z.string().nullable().default(null),
  status: flightStatusEnum.default("pending"),
  created_at: z.string().datetime().optional(),
});
export type FlightLeg = z.infer<typeof flightLegSchema>;

// ──────────────────────────────────────────────
// Advance
// ──────────────────────────────────────────────

export const advanceContactSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  role: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
});
export type AdvanceContact = z.infer<typeof advanceContactSchema>;

export const tourAdvanceSchema = z.object({
  id: z.string().uuid(),
  tour_show_id: z.string().uuid(),
  checks: z.record(z.string(), z.boolean()).default({}).describe("Index-keyed checklist booleans"),
  contacts: z.array(advanceContactSchema).default([]),
  notes: z.string().default(""),
  updated_at: z.string().datetime().optional(),
});
export type TourAdvance = z.infer<typeof tourAdvanceSchema>;

/** The 20-item advance checklist. Indices map to checks record keys. */
export const ADVANCE_ITEMS = [
  "Venue contact confirmed", "Tech advance sent", "Tech advance returned",
  "Production advance complete", "Catering/rider sent", "Catering confirmed",
  "Hospitality advance", "Guest list open", "Merch advance sent",
  "Merch load-in confirmed", "Settlement info sent", "W9/tax forms received",
  "Wire info confirmed", "Run of show drafted", "Run of show approved",
  "Meet & greet confirmed", "Security advance", "Parking/load-in confirmed",
  "Hotel confirmed", "Ground transport confirmed",
] as const;

// ──────────────────────────────────────────────
// Bus Schedule
// ──────────────────────────────────────────────

export const busLegSchema = z.object({
  id: z.string().uuid(),
  tour_id: z.string().uuid(),
  date: z.string().date(),
  leg_type: busLegTypeEnum.default("travel"),
  from_city: z.string().nullable().default(null),
  to_city: z.string().nullable().default(null),
  from_country: z.string().length(2).nullable().default(null),
  to_country: z.string().length(2).nullable().default(null),
  km: z.number().int().default(0),
  drive_min: z.number().int().default(0),
  depart: z.string().default("--"),
  arrive: z.string().default("--"),
  note: z.string().nullable().default(null),
  week: z.number().int().default(1),
  sort_order: z.number().int().default(0),
});
export type BusLeg = z.infer<typeof busLegSchema>;

// ──────────────────────────────────────────────
// Mission Control
// ──────────────────────────────────────────────

export const missionItemSchema = z.object({
  id: z.string().uuid(),
  tour_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  subject: z.string().min(1),
  context: z.string().default(""),
  action: z.string().default(""),
  urgency: urgencyEnum.default("medium"),
  intent: intentEnum.optional(),
  owner: ownerEnum.default("DAVON"),
  from_name: z.string().default(""),
  thread_link: z.string().url().optional().or(z.literal("")),
  deadline: z.string().date().nullable().default(null),
  show_date: z.string().date().nullable().default(null),
  status: z.enum(["open", "resolved"]).default("open"),
  source: z.enum(["manual", "gmail_refresh"]).default("manual"),
  resolved_at: z.string().datetime().nullable().default(null),
  created_at: z.string().datetime().optional(),
});
export type MissionItem = z.infer<typeof missionItemSchema>;

export const nextStepSchema = z.object({
  id: z.string().uuid(),
  tour_id: z.string().uuid(),
  text: z.string().min(1),
  done: z.boolean().default(false),
  created_at: z.string().datetime().optional(),
});
export type NextStep = z.infer<typeof nextStepSchema>;

// ──────────────────────────────────────────────
// Gap Detection Output
// ──────────────────────────────────────────────

export const gapSchema = z.object({
  type: z.enum(["crit", "warn"]),
  category: z.string().describe("doors, curfew, advance, immigration, insurance, crew, etc."),
  message: z.string(),
  show_date: z.string().date().nullable(),
  city: z.string().nullable(),
  days_out: z.number().int().nullable(),
});
export type Gap = z.infer<typeof gapSchema>;

// ──────────────────────────────────────────────
// HOS Compliance Output
// ──────────────────────────────────────────────

export const hosWeekSummarySchema = z.object({
  week: z.number().int(),
  total_drive_min: z.number().int(),
  total_km: z.number().int(),
  max_day_min: z.number().int(),
  extended_days: z.number().int(),
  show_days: z.number().int(),
  travel_days: z.number().int(),
  off_days: z.number().int(),
  violations: z.array(z.string()),
});
export type HosWeekSummary = z.infer<typeof hosWeekSummarySchema>;
