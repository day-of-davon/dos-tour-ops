// offlineMirror.js — mirror successful reads/writes in localStorage so the
// app can render from cache when Supabase is unreachable.

const PREFIX = "dos-v7-mirror";

const k = (scope, key) => `${PREFIX}:${scope}:${key}`;

export function mirrorWrite(scope, key, value) {
  try {
    localStorage.setItem(k(scope, key), value);
  } catch (e) {
    console.warn("offlineMirror.write failed", e);
  }
}

export function mirrorRead(scope, key) {
  try {
    return localStorage.getItem(k(scope, key));
  } catch {
    return null;
  }
}

export function mirrorDelete(scope, key) {
  try {
    localStorage.removeItem(k(scope, key));
  } catch {
    // ignore
  }
}
