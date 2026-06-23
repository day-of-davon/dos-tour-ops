// wifi-speed/server.js — tiny static + data server for the chart UI (zero deps).

const http = require("http");
const fs = require("fs");
const path = require("path");
const { readSnapshots } = require("./store");
const { pollOnce } = require("./poll");

function startServer(port = Number(process.env.ORBI_UI_PORT || 8787)) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = fs.readFileSync(path.join(__dirname, "chart.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }

    if (url.pathname === "/api/data") {
      const hours = Number(url.searchParams.get("hours") || 0);
      const sinceMs = hours > 0 ? Date.now() - hours * 3600 * 1000 : 0;
      const snaps = readSnapshots(sinceMs);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(snaps));
    }

    if (url.pathname === "/api/poll") {
      try {
        const snap = await pollOnce();
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(snap));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    }

    res.writeHead(404);
    res.end("not found");
  });
  server.listen(port, () => {
    console.log("wifi-speed chart: http://localhost:" + port);
  });
  return server;
}

module.exports = { startServer };
