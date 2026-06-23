// wifi-speed/store.js — append-only NDJSON snapshot store (zero deps).
// One JSON line per poll: { ts, devices: [...], traffic: {...}|null }.

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.ORBI_DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = process.env.ORBI_DATA_FILE || path.join(DATA_DIR, "history.ndjson");

function ensureDir() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

function appendSnapshot(snapshot) {
  ensureDir();
  fs.appendFileSync(DATA_FILE, JSON.stringify(snapshot) + "\n");
}

function readSnapshots(sinceMs) {
  if (!fs.existsSync(DATA_FILE)) return [];
  const lines = fs.readFileSync(DATA_FILE, "utf8").split("\n").filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      const snap = JSON.parse(line);
      if (sinceMs && new Date(snap.ts).getTime() < sinceMs) continue;
      out.push(snap);
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

module.exports = { appendSnapshot, readSnapshots, DATA_FILE };
