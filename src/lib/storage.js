// storage.js — Supabase-backed key/value with retry, offline mirror, write queue.
// Two scopes: private (user_id, team_id null) and shared (team_id).
// On network failure, writes are enqueued; on reconnect they flush automatically.
// Reads fall back to the localStorage mirror.

import { supabase } from "./supabase";
import { mirrorRead, mirrorWrite, mirrorDelete } from "./offlineMirror";
import { enqueue, drain } from "./writeQueue";

const TEAM_ID = "dos-bbno-eu-2026";

const SHARED_KEYS = new Set([
  "dos-v7-shows","dos-v7-ros","dos-v7-advances","dos-v7-finance","dos-v7-settings","dos-v7-crew","dos-v7-production",
]);
const PRIVATE_KEYS = new Set([
  "dos-v7-intel","dos-v7-notes-private","dos-v7-checklist-private",
]);
export const isSharedKey = (k) => SHARED_KEYS.has(k);
export const isPrivateKey = (k) => PRIVATE_KEYS.has(k);
export { TEAM_ID };

// ── Retry helper ────────────────────────────────────────────────────────────
// Retries transient failures (network). Does not retry on auth or constraint errors.
async function withRetry(fn, attempts = 3, baseMs = 500) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new Error("offline");
    }
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = (e && (e.message || e.code || "")).toString();
      // PostgREST auth/permission errors are terminal; don't retry.
      if (/JWT|permission|denied|401|403/i.test(msg)) throw e;
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, baseMs * Math.pow(2, i)));
      }
    }
  }
  throw lastErr;
}

async function currentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

// ── Shared (team-scoped) ────────────────────────────────────────────────────
export async function getShared(key) {
  try {
    const data = await withRetry(async () => {
      const { data, error } = await supabase
        .from("app_storage").select("value").eq("team_id", TEAM_ID).eq("key", key).maybeSingle();
      if (error) throw error;
      return data;
    });
    if (data) {
      mirrorWrite("shared", key, data.value);
      return { key, value: data.value };
    }
    return null;
  } catch (e) {
    console.warn("getShared: falling back to mirror", key, e?.message || e);
    const cached = mirrorRead("shared", key);
    return cached != null ? { key, value: cached } : null;
  }
}

export async function setShared(key, value) {
  mirrorWrite("shared", key, value);
  let user;
  try { user = await currentUser(); } catch (e) {
    console.warn("setShared: no user, enqueueing", e?.message || e);
    enqueue({ type: "set", scope: "shared", key, value, teamId: TEAM_ID });
    return { key, value };
  }
  try {
    await withRetry(async () => {
      const { data: existing, error: selErr } = await supabase
        .from("app_storage").select("id").eq("team_id", TEAM_ID).eq("key", key).maybeSingle();
      if (selErr) throw selErr;
      if (existing) {
        const { error } = await supabase.from("app_storage")
          .update({ value, updated_at: new Date().toISOString() })
          .eq("team_id", TEAM_ID).eq("key", key);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("app_storage")
          .insert({ user_id: user.id, team_id: TEAM_ID, key, value });
        if (error) throw error;
      }
    });
    // opportunistic drain after a success
    drain();
    return { key, value };
  } catch (e) {
    console.warn("setShared: enqueueing after failure", key, e?.message || e);
    enqueue({ type: "set", scope: "shared", key, value, userId: user.id, teamId: TEAM_ID });
    return { key, value };
  }
}

export async function deleteShared(key) {
  mirrorDelete("shared", key);
  try {
    await withRetry(async () => {
      const { error } = await supabase.from("app_storage")
        .delete().eq("team_id", TEAM_ID).eq("key", key);
      if (error) throw error;
    });
    drain();
    return { key, deleted: true };
  } catch (e) {
    console.warn("deleteShared: enqueueing after failure", key, e?.message || e);
    enqueue({ type: "delete", scope: "shared", key, teamId: TEAM_ID });
    return { key, deleted: true };
  }
}

// ── Private (user-scoped) ───────────────────────────────────────────────────
export const storage = {
  async get(key) {
    try {
      const data = await withRetry(async () => {
        const { data, error } = await supabase
          .from("app_storage").select("value").is("team_id", null).eq("key", key).maybeSingle();
        if (error) throw error;
        return data;
      });
      if (data) {
        mirrorWrite("private", key, data.value);
        return { key, value: data.value };
      }
      return null;
    } catch (e) {
      console.warn("storage.get: falling back to mirror", key, e?.message || e);
      const cached = mirrorRead("private", key);
      return cached != null ? { key, value: cached } : null;
    }
  },

  async set(key, value) {
    mirrorWrite("private", key, value);
    let user;
    try { user = await currentUser(); } catch (e) {
      console.warn("storage.set: no user, enqueueing", e?.message || e);
      enqueue({ type: "set", scope: "private", key, value });
      return { key, value };
    }
    try {
      await withRetry(async () => {
        const { data: existing, error: selErr } = await supabase
          .from("app_storage").select("id")
          .eq("user_id", user.id).eq("key", key).is("team_id", null).maybeSingle();
        if (selErr) throw selErr;
        if (existing) {
          const { error } = await supabase.from("app_storage")
            .update({ value, updated_at: new Date().toISOString() })
            .eq("user_id", user.id).eq("key", key).is("team_id", null);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("app_storage")
            .insert({ user_id: user.id, team_id: null, key, value });
          if (error) throw error;
        }
      });
      drain();
      return { key, value };
    } catch (e) {
      console.warn("storage.set: enqueueing after failure", key, e?.message || e);
      enqueue({ type: "set", scope: "private", key, value, userId: user.id });
      return { key, value };
    }
  },

  async delete(key) {
    mirrorDelete("private", key);
    try {
      await withRetry(async () => {
        const { error } = await supabase.from("app_storage")
          .delete().is("team_id", null).eq("key", key);
        if (error) throw error;
      });
      drain();
      return { key, deleted: true };
    } catch (e) {
      console.warn("storage.delete: enqueueing after failure", key, e?.message || e);
      enqueue({ type: "delete", scope: "private", key });
      return { key, deleted: true };
    }
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
