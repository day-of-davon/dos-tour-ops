// storage.js — Supabase-backed key/value, scoped by RLS.
// Two scopes: private (user_id, team_id null) and shared (team_id).

import { supabase } from "./supabase";
import { TEAM_ID, SHARED_KEYS, PRIVATE_KEYS } from "./constants";

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
