// storage.js — mirrors the window.storage API used in the Claude artifact.
// All calls are scoped to the authenticated user via Supabase RLS.

import { supabase } from "./supabase";

// ── Core adapter ──────────────────────────────────────────────────────────────
export const storage = {
  async get(key) {
    const { data, error } = await supabase
      .from("app_storage")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) { console.error("storage.get error:", error); return null; }
    return data ? { key, value: data.value } : null;
  },

  async set(key, value) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { error } = await supabase
      .from("app_storage")
      .upsert({ user_id: user.id, key, value }, { onConflict: "user_id,key" });
    if (error) { console.error("storage.set error:", error); return null; }
    return { key, value };
  },

  async delete(key) {
    const { error } = await supabase
      .from("app_storage")
      .delete()
      .eq("key", key);
    if (error) { console.error("storage.delete error:", error); return null; }
    return { key, deleted: true };
  },
};

// ── App-level helpers (same signatures as the artifact's inline functions) ────
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
