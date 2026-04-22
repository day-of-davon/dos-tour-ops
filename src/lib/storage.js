// storage.js — Supabase-backed key/value, scoped by RLS.
// Two scopes: private (user_id, team_id null) and shared (team_id).

import { supabase } from "./supabase";

const TEAM_ID = "dos-bbno-2026";

const SHARED_KEYS = new Set([
  "dos-v7-shows","dos-v7-ros","dos-v7-advances","dos-v7-finance","dos-v7-settings","dos-v7-crew","dos-v7-production",
  "dos-v7-flights","dos-v7-lodging","dos-v7-guestlists","dos-v7-guestlist-templates",
]);
const PRIVATE_KEYS = new Set([
  "dos-v7-intel","dos-v7-notes-private","dos-v7-checklist-private",
]);
export const isSharedKey = (k) => SHARED_KEYS.has(k);
export const isPrivateKey = (k) => PRIVATE_KEYS.has(k);
export { TEAM_ID };

// ── Shared (team-scoped) ────────────────────────────────────────────────────
export async function getShared(key) {
  const { data, error } = await supabase
    .from("app_storage").select("value").eq("team_id", TEAM_ID).eq("key", key).maybeSingle();
  if (error) { console.error("getShared:", error); return null; }
  return data ? { key, value: data.value } : null;
}

export async function setShared(key, value) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.rpc("upsert_app_storage", {
    p_user_id: user.id, p_team_id: TEAM_ID, p_key: key, p_value: value,
  });
  if (error) { console.error("setShared:", error); return null; }
  return { key, value };
}

export async function deleteShared(key) {
  const { error } = await supabase.from("app_storage")
    .delete().eq("team_id", TEAM_ID).eq("key", key);
  if (error) { console.error("deleteShared:", error); return null; }
  return { key, deleted: true };
}

// ── Private (user-scoped) ───────────────────────────────────────────────────
export const storage = {
  async get(key) {
    const { data, error } = await supabase
      .from("app_storage").select("value").is("team_id", null).eq("key", key).maybeSingle();
    if (error) { console.error("storage.get error:", error); return null; }
    return data ? { key, value: data.value } : null;
  },

  async set(key, value) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { error } = await supabase.rpc("upsert_app_storage", {
      p_user_id: user.id, p_team_id: null, p_key: key, p_value: value,
    });
    if (error) { console.error("storage.set:", error); return null; }
    return { key, value };
  },

  async delete(key) {
    const { error } = await supabase
      .from("app_storage").delete().is("team_id", null).eq("key", key);
    if (error) { console.error("storage.delete error:", error); return null; }
    return { key, deleted: true };
  },
};

export const getPrivate    = (k)   => storage.get(k);
export const setPrivate    = (k,v) => storage.set(k, v);
export const deletePrivate = (k)   => storage.delete(k);

// ── App-level helpers (legacy monolithic blob — stays private) ──────────────
const STORE_KEY = "dos-tour-ops-v5";
const SNAP_KEY  = "dos-tour-ops-v5-snap";

export const save      = (data) => storage.set(STORE_KEY, JSON.stringify(data));
export const load      = async () => {
  const r = await storage.get(STORE_KEY);
  return r ? JSON.parse(r.value) : null;
};
export const loadSnap  = async () => {
  const r = await storage.get(SNAP_KEY);
  return r ? JSON.parse(r.value) : null;
};
export const saveSnap  = (data) => storage.set(SNAP_KEY, JSON.stringify(data));
export const clearAll  = async () => {
  await storage.delete(STORE_KEY);
  await storage.delete(SNAP_KEY);
};

export { STORE_KEY, SNAP_KEY };
