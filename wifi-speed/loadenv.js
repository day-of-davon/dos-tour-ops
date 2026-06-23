// wifi-speed/loadenv.js — minimal .env loader (zero deps).
// Loads wifi-speed/.env into process.env without overwriting existing vars.

const fs = require("fs");
const path = require("path");

const file = process.env.ORBI_ENV_FILE || path.join(__dirname, ".env");
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
