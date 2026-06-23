// wifi-speed/poll.js — take one snapshot of the Orbi and persist it.

const { OrbiClient } = require("./orbi");
const { appendSnapshot } = require("./store");

async function pollOnce(opts = {}) {
  const client = new OrbiClient(opts);
  const [devices, traffic] = await Promise.all([
    client.getAttachedDevices(),
    client.getTrafficMeter(),
  ]);
  const snapshot = { ts: new Date().toISOString(), devices, traffic };
  appendSnapshot(snapshot);
  return snapshot;
}

module.exports = { pollOnce };
