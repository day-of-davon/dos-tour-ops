# wifi-speed — Orbi RBR50 device link-rate tracker

Polls the Orbi for per-device stats over time and charts them. Self-contained,
zero npm dependencies (Node built-ins + Chart.js from CDN in the browser).

## What it can and cannot read

The RBR50 has no SNMP and no public REST API. The only programmatic surface is
NETGEAR's "genie" SOAP API on port 5000 — the same calls the admin UI and Orbi
app use. From `GetAttachDevice2` we get, per connected device:

- **Link rate** (negotiated Mbps) — always present. This is the primary metric.
- **Signal strength** (%) — present for wireless devices.
- **Download / Upload (Mbps)** — a current-throughput reading present on most
  RBR50 firmware. If your firmware returns 0/empty here, only link rate is real.

The router does **not** expose historical per-device totals. True continuous
per-device throughput would require inline monitoring (a Pi bridge or custom
firmware); that is out of scope here. WAN totals (whole network) come from the
traffic meter if you have it enabled in the router UI.

History is built by **this tool polling on a schedule** and storing each
snapshot, then charting the series.

## Setup

```sh
cp wifi-speed/.env.example wifi-speed/.env
# edit wifi-speed/.env: set ORBI_PASSWORD (router admin password), and ORBI_HOST
# if orbilogin.com does not resolve (use your router LAN IP instead).
```

## Usage

```sh
# one snapshot, printed as a table and appended to history
node wifi-speed/cli.js poll          # or: npm run wifi:poll

# keep polling every 60s (background data collection)
node wifi-speed/cli.js watch 60      # or: npm run wifi:watch

# chart UI at http://localhost:8787
node wifi-speed/cli.js serve         # or: npm run wifi:serve
```

Typical workflow: run `watch` in one terminal to collect data, and `serve` in
another (or just open the chart and hit "Poll now"). Pick the metric (link rate,
download, upload, signal), time range, and toggle devices on the left.

## Storage

Append-only NDJSON at `wifi-speed/data/history.ndjson` (gitignored). One JSON
line per poll. Delete the file to reset history. Override with `ORBI_DATA_DIR`.

## Running continuously

For unattended collection, run `watch` under your process manager of choice
(systemd, launchd, pm2) or a cron that calls `poll`. The store is append-only
and safe to run alongside `serve`.

## Troubleshooting

- **Login failed**: verify `ORBI_USER`/`ORBI_PASSWORD` (router admin creds, not
  WiFi password). If `orbilogin.com` does not resolve, set `ORBI_HOST` to the
  router IP. Some firmware uses https on 443: set `ORBI_SCHEME=https`,
  `ORBI_PORT=443`.
- **Download/Upload always 0**: firmware does not report it; use link rate.
- **WAN totals blank**: enable the traffic meter in the Orbi admin UI.
