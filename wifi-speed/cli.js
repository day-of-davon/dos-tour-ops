#!/usr/bin/env node
// wifi-speed/cli.js — entrypoint.
//
//   node wifi-speed/cli.js poll              one snapshot -> store + table
//   node wifi-speed/cli.js watch [seconds]   poll on an interval (default 60)
//   node wifi-speed/cli.js serve [port]      chart UI (default :8787)

require("./loadenv");
const { pollOnce } = require("./poll");
const { startServer } = require("./server");

function printTable(snap) {
  const rows = snap.devices
    .slice()
    .sort((a, b) => (b.linkRateMbps || 0) - (a.linkRateMbps || 0))
    .map((d) => ({
      name: (d.name || d.mac || "?").slice(0, 22),
      link: d.linkRateMbps != null ? d.linkRateMbps + " Mbps" : "-",
      down: d.downMbps != null ? d.downMbps + " Mbps" : "-",
      up: d.upMbps != null ? d.upMbps + " Mbps" : "-",
      signal: d.signalPct != null ? d.signalPct + "%" : "-",
      conn: d.connection || "-",
    }));
  console.log("\n" + snap.ts + "  (" + rows.length + " devices)");
  console.table(rows);
  if (snap.traffic) {
    console.log(
      "WAN today: down " + snap.traffic.todayDownloadMB + " MB / up " + snap.traffic.todayUploadMB + " MB"
    );
  }
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "poll": {
      printTable(await pollOnce());
      break;
    }
    case "watch": {
      const sec = Math.max(5, Number(arg || 60));
      console.log("Polling every " + sec + "s. Ctrl-C to stop.");
      const tick = async () => {
        try {
          printTable(await pollOnce());
        } catch (e) {
          console.error("poll error:", e.message);
        }
      };
      await tick();
      setInterval(tick, sec * 1000);
      break;
    }
    case "serve": {
      startServer(arg ? Number(arg) : undefined);
      break;
    }
    default:
      console.log("usage: node wifi-speed/cli.js <poll|watch [sec]|serve [port]>");
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
