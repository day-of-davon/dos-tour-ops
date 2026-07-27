import "@testing-library/jest-dom/vitest";

// main.jsx installs window.storage at boot; tests render <App/> directly and
// skip main.jsx, so we provide an in-memory equivalent here. The app's storage
// helpers (sG/sS/sGP/sSP) call window.storage.get/set/getPrivate/setPrivate and
// expect either null or an object shaped { value: <json string> }.
const mem = new Map();
const wrap = (k) => (mem.has(k) ? { value: mem.get(k) } : null);

window.storage = {
  get: async (k) => wrap(k),
  set: async (k, v) => { mem.set(k, v); return true; },
  delete: async (k) => { mem.delete(k); return true; },
  getShared: async (k) => wrap(k),
  setShared: async (k, v) => { mem.set(k, v); return true; },
  deleteShared: async (k) => { mem.delete(k); return true; },
  getPrivate: async (k) => wrap(k),
  setPrivate: async (k, v) => { mem.set(k, v); return true; },
  deletePrivate: async (k) => { mem.delete(k); return true; },
};

// jsdom lacks matchMedia; some components may probe it.
if (!window.matchMedia) {
  window.matchMedia = (q) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  });
}

// jsdom does not implement scrollIntoView; several list views call it.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
