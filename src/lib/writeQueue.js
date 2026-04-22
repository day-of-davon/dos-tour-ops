// writeQueue.js — persist failed Supabase writes in localStorage, replay on reconnect.

import { supabase } from "./supabase";

const Q_KEY = "dos-v7-write-queue";

function readQueue() {
  try {
    const raw = localStorage.getItem(Q_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(arr) {
  try {
    localStorage.setItem(Q_KEY, JSON.stringify(arr));
  } catch (e) {
    console.error("writeQueue: failed to persist queue", e);
  }
}

export function enqueue(op) {
  const q = readQueue();
  q.push({ ...op, ts: op.ts || Date.now() });
  writeQueue(q);
}

export function queueSize() {
  return readQueue().length;
}

async function replayOne(op) {
  const { type, scope, key, value, userId, teamId } = op;
  if (type === "set" && scope === "shared") {
    const { data: existing } = await supabase
      .from("app_storage").select("id").eq("team_id", teamId).eq("key", key).maybeSingle();
    if (existing) {
      const { error } = await supabase.from("app_storage")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("team_id", teamId).eq("key", key);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("app_storage")
        .insert({ user_id: userId, team_id: teamId, key, value });
      if (error) throw error;
    }
  } else if (type === "set" && scope === "private") {
    const { data: existing } = await supabase
      .from("app_storage").select("id").eq("user_id", userId).eq("key", key).is("team_id", null).maybeSingle();
    if (existing) {
      const { error } = await supabase.from("app_storage")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("user_id", userId).eq("key", key).is("team_id", null);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("app_storage")
        .insert({ user_id: userId, team_id: null, key, value });
      if (error) throw error;
    }
  } else if (type === "delete" && scope === "shared") {
    const { error } = await supabase.from("app_storage").delete().eq("team_id", teamId).eq("key", key);
    if (error) throw error;
  } else if (type === "delete" && scope === "private") {
    const { error } = await supabase.from("app_storage").delete().is("team_id", null).eq("key", key);
    if (error) throw error;
  } else {
    throw new Error(`writeQueue: unknown op ${type}/${scope}`);
  }
}

let draining = false;

export async function drain() {
  if (draining) return { drained: 0, remaining: queueSize() };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { drained: 0, remaining: queueSize() };
  }
  draining = true;
  let drained = 0;
  try {
    let q = readQueue();
    while (q.length) {
      const head = q[0];
      try {
        await replayOne(head);
        q = q.slice(1);
        writeQueue(q);
        drained++;
      } catch (e) {
        console.warn("writeQueue: replay failed, leaving in queue", e);
        break;
      }
    }
  } finally {
    draining = false;
  }
  return { drained, remaining: queueSize() };
}

export function installQueueListeners() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => { drain(); });
  supabase.auth.onAuthStateChange((_evt, session) => { if (session) drain(); });
}
