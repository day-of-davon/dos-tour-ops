// @ts-check
// constants.js — single source of truth for scope, storage keys, team, hotel defaults.
// Consumed by DosApp.jsx, storage.js, audit.js. Do not duplicate these elsewhere.

/**
 * @typedef {{ id: string, label: string, initials: string, role: string, clients: string[], primary: string[] }} TeamMember
 */

export const TEAM_ID = "dos-bbno-2026";

// ── Storage keys ─────────────────────────────────────────────────────────────
// Shared: team-scoped rows (team_id = TEAM_ID). Private: user-scoped rows (team_id = null).
export const SK = Object.freeze({
  SHOWS:        "dos-v7-shows",
  ROS:          "dos-v7-ros",
  ADVANCES:     "dos-v7-advances",
  FINANCE:      "dos-v7-finance",
  SETTINGS:     "dos-v7-settings",
  CREW:         "dos-v7-crew",
  PRODUCTION:   "dos-v7-production",
  FLIGHTS:      "dos-v7-flights",
  LODGING:      "dos-v7-lodging",
  GUESTLISTS:   "dos-v7-guestlists",
  GL_TEMPLATES: "dos-v7-guestlist-templates",
  IMMIGRATION:  "dos-v7-immigration",
  PERMISSIONS:  "dos-v7-permissions",
  BUS_EDITS:    "dos-v7-bus-edits",
});

export const PK = Object.freeze({
  NOTES_PRIV:     "dos-v7-notes-private",
  CHECKLIST_PRIV: "dos-v7-checklist-private",
  INTEL:          "dos-v7-intel",
  ACTLOG:         "dos-v7-actlog",
});

export const SHARED_KEYS = /** @type {Set<string>} */ (new Set(Object.values(SK)));
export const PRIVATE_KEYS = /** @type {Set<string>} */ (new Set(Object.values(PK)));

// ── Hotel defaults ───────────────────────────────────────────────────────────
export const HOTEL_DEFAULT_CHECKIN = "15:00";
export const HOTEL_DEFAULT_CHECKOUT = "11:00";
export const HOTEL_TODOS_DEFAULT = [
  "Confirm room block",
  "Collect confirmation #",
  "Share room list with crew",
  "Arrange early check-in (if needed)",
  "Confirm late check-out",
  "Collect receipt",
  "Verify billing address",
];

// ── Team registry ────────────────────────────────────────────────────────────
// email → {id, label, initials, role, clients[]: access, primary[]: ownership}
// Single source for auth gating, audit metadata, owner inference, assignment dropdowns.
export const TEAM = /** @type {Readonly<Record<string, TeamMember>>} */ (Object.freeze({
  "d.johnson@dayofshow.net": { id: "davon",  label: "Davon",  initials: "DJ", role: "tm_td",           clients: ["bbn","wkn","bwc","elm"], primary: ["bbn"] },
  "olivia@dayofshow.net":    { id: "olivia", label: "Olivia", initials: "OM", role: "transport_coord", clients: ["bbn","wkn","bwc","elm"], primary: ["elm","bwc","wkn"] },
}));

export const ROLE_LABEL = Object.freeze({
  tm_td:           "TM/TD",
  transport_coord: "Transport Coord",
  viewer:          "Viewer",
});

export const GUEST_ME = Object.freeze({ id: "guest", label: "Guest", initials: "··", role: "viewer", clients: ["bbn"], primary: [] });

/** @param {string} email @returns {TeamMember} */
export const resolveMe = (email) => TEAM[(email || "").toLowerCase()] || GUEST_ME;

// Assignment dropdown (advance items) — derived from TEAM.
export const TEAM_MEMBERS = Object.values(TEAM).map(({ id, label, initials }) => ({ id, label, initials }));

// ── TM role gate ─────────────────────────────────────────────────────────────
// Who is allowed to select the "TM" role in the role picker. Separate from TEAM
// because it includes the shared `advance@dayofshow.net` alias and excludes
// Transport Coord by design.
export const TM_EMAILS = new Set([
  "d.johnson@dayofshow.net",
  "advance@dayofshow.net",
]);
