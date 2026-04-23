// @ts-check
// storage.js — Supabase-backed key/value, scoped by RLS.
// Two scopes: private (user_id, team_id null) and shared (team_id).

/**
 * @typedef {{ key: string, value: unknown }} StorageEntry
 * @typedef {{ key: string, deleted: true }} DeleteResult
 */

import { supabase } from "./supabase";
import { TEAM_ID, SHARED_KEYS, PRIVATE_KEYS } from "./constants";

/** @param {string} k */
export const isSharedKey = (k) => SHARED_KEYS.has(k);
/** @param {string} k */
export const isPrivateKey = (k) => PRIVATE_KEYS.has(k);
export { TEAM_ID };

// ── Shared (team-scoped) ────────────────────────────────────────────────────
/** @param {string} key @returns {Promise<StorageEntry | null>} */
export async function getShared(key) {
  const { data, error } = await supabase
    .from("app_storage").select("value").eq("team_id", TEAM_ID).eq("key", key).maybeSingle();
  if (error) { console.error("getShared:", error); return null; }
  return data ? { key, value: data.value } : null;
}

/** @param {string} key @param {unknown} value @returns {Promise<StorageEntry | null>} */
export async function setShared(key, value) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.rpc("upsert_app_storage", {
    p_user_id: user.id, p_team_id: TEAM_ID, p_key: key, p_value: value,
  });
  if (error) { console.error("setShared:", error); return null; }
  return { key, value };
}

/** @param {string} key @returns {Promise<DeleteResult | null>} */
export async function deleteShared(key) {
  const { error } = await supabase.from("app_storage")
    .delete().eq("team_id", TEAM_ID).eq("key", key);
  if (error) { console.error("deleteShared:", error); return null; }
  return { key, deleted: true };
}

// ── Private (user-scoped) ───────────────────────────────────────────────────
export const storage = {
  /** @param {string} key @returns {Promise<StorageEntry | null>} */
  async get(key) {
    const { data, error } = await supabase
      .from("app_storage").select("value").is("team_id", null).eq("key", key).maybeSingle();
    if (error) { console.error("storage.get error:", error); return null; }
    return data ? { key, value: data.value } : null;
  },

  /** @param {string} key @param {unknown} value @returns {Promise<StorageEntry | null>} */
  async set(key, value) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { error } = await supabase.rpc("upsert_app_storage", {
      p_user_id: user.id, p_team_id: null, p_key: key, p_value: value,
    });
    if (error) { console.error("storage.set:", error); return null; }
    return { key, value };
  },

  /** @param {string} key @returns {Promise<DeleteResult | null>} */
  async delete(key) {
    const { error } = await supabase
      .from("app_storage").delete().is("team_id", null).eq("key", key);
    if (error) { console.error("storage.delete error:", error); return null; }
    return { key, deleted: true };
  },
};

export const getPrivate    = (/** @type {string} */ k)                    => storage.get(k);
export const setPrivate    = (/** @type {string} */ k, /** @type {unknown} */ v) => storage.set(k, v);
export const deletePrivate = (/** @type {string} */ k)                    => storage.delete(k);
