// audit.js — append-only log for status changes, finance events, disputes.
// Fire-and-forget: never blocks UI. Failures log to console, do not throw.
//
// Usage:
//   import { logAudit } from "./lib/audit";
//   logAudit({ entityType: "advance", entityId: `${date}:${itemId}`, action: "status_change",
//              before: { status: "sent" }, after: { status: "confirmed" }, meta: { source: "manual" } });

import { supabase } from "./supabase";

const TEAM_ID = "dos-bbno-2026";

// Current user role + display id — set once on auth resolve, attached to every audit row.
let CURRENT_ROLE = null;
let CURRENT_USER_KEY = null;
export function setAuditIdentity({ role, userKey }) {
  CURRENT_ROLE = role || null;
  CURRENT_USER_KEY = userKey || null;
}

export function logAudit({ entityType, entityId, action, before = null, after = null, meta = null, teamScoped = true }) {
  // Non-blocking: kick the promise, handle errors in background.
  (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const row = {
        user_id: user.id,
        user_email: user.email || null,
        team_id: teamScoped ? TEAM_ID : null,
        entity_type: entityType,
        entity_id: String(entityId),
        action,
        before_value: before,
        after_value: after,
        metadata: { ...(meta || {}), role: CURRENT_ROLE, userKey: CURRENT_USER_KEY },
      };
      const { error } = await supabase.from("audit_log").insert(row);
      if (error) console.warn("[audit] insert failed:", error.message);
    } catch (e) {
      console.warn("[audit] unexpected:", e?.message || e);
    }
  })();
}

// Convenience: read recent audit entries for a specific entity.
export async function readAudit(entityType, entityId, limit = 50) {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", String(entityId))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { console.warn("[audit] read failed:", error.message); return []; }
  return data || [];
}
