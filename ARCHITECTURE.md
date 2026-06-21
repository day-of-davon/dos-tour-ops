# ARCHITECTURE — v7 + Platform

**Last refresh:** 2026-06-21.

---

## Repos

- `day-of-davon/dos-tour-ops` — **ACTIVE**. Vite 5 + React 18 + Supabase. v7 JSX deployed here. Live at `dos-tour-ops.vercel.app`.
- `[DOS LLC org]/dos-platform` — NOT YET CREATED. Phase 0 action item. Next.js 15 + tRPC v11 scaffold. No platform feature code until Josh's schema audit.

## Deployed

- `dos-tour-ops.vercel.app` — v7 React app. Supabase-backed storage. Google OAuth + Gmail readonly. Multi-user (Davon + Olivia). Vercel auto-deploys from `main`.

## Supabase

- Active project backing `dos-tour-ops.vercel.app`.
- `app_storage` table: KV pattern, `team_id` + `user_id` + `key` + `value`.
- Storage adapter at `src/lib/storage.js`, shimmed to `window.storage` in `src/main.jsx`.
- RLS: shared rows scoped by `team_id`; private rows scoped by `user_id` (team_id null).
- Additional tables/buckets (see `supabase/migrations/`):
  - `audit_log` — append-only activity log (20260422-audit-log.sql).
  - `scan_runs` — one row per scanner invocation (cost, timing, stop_reasons).
  - `scan_thread_cache` — per `(scanner, thread_id)` memoization to skip re-parse when a thread is unchanged (20260423-scan-history.sql).
  - `receipts` private Storage bucket — source files for scanned/uploaded receipts; written server-side with the service key, read via short-lived signed URLs (20260615-receipt-storage.sql).

Team ID: `team_id = 'dos-bbno-2026'` (tour-scoped; leg derived from show date). Defined once in `src/lib/constants.js` (`TEAM_ID`) and `api/lib/scanMemory.js` / `api/lib/tourContext.js`.

## v7 storage keys

Single source of truth: `src/lib/constants.js` (`SK` = shared, `PK` = private). Do not duplicate elsewhere.

**Shared (`SK`, team-scoped):**

| Key | Content |
|-----|---------|
| `dos-v7-shows` | Show metadata, anchors, client associations |
| `dos-v7-ros` | Per-show ROS block overrides |
| `dos-v7-advances` | Per-show advance checklist state |
| `dos-v7-finance` | Settlement, payout log, receipt ledger |
| `dos-v7-settings` | Role, tab, show, client selection |
| `dos-v7-crew` | Crew assignments per show |
| `dos-v7-production` | Production doc ingest data |
| `dos-v7-flights` | Flight records, pax matching, lifecycle |
| `dos-v7-lodging` | Hotel room blocks and todos |
| `dos-v7-guestlists` | Guest list parties + categories |
| `dos-v7-guestlist-templates` | Reusable guest list templates |
| `dos-v7-immigration` | Immigration form status per show |
| `dos-v7-permissions` | Role-based access control state |
| `dos-v7-bus-edits` | Per-show bus schedule overrides |
| `dos-v7-user-types` | Per-user role/type assignments |
| `dos-v7-group-notes` | Shared group notes |

**Private (`PK`, user-scoped):**

| Key | Content |
|-----|---------|
| `dos-v7-notes-private` | Personal notes per show |
| `dos-v7-checklist-private` | Custom private checklist items |
| `dos-v7-intel` | Email intel digest, personal to-do |
| `dos-v7-actlog` | Activity log entries |

---

## Tech stack — v7 (active)

| Layer | Technology |
|-------|-----------|
| Frontend | Vite 5, React 18, inline styles + `src/styles/tokens.js` |
| Auth | Supabase Auth + Google OAuth (`src/components/AuthGate.jsx`) |
| Database | Supabase Postgres (`app_storage` KV + scan/audit tables) |
| Storage adapter | `src/lib/storage.js` (shimmed to `window.storage`) |
| AI | Claude API via Vercel serverless `/api/*` |
| Gmail | Google OAuth, `gmail.readonly` scope, token from Supabase session |
| Routing | OpenRouteService → Google Maps → haversine fallback (`api/route.js`) |
| Deploy | Vercel (auto-deploy from `main`) |
| Fonts | Outfit, JetBrains Mono (inline) |

**Claude models** (env-overridable, defined in `api/lib/anthropic.js` + `api/intel.js`):

| Var | Default | Use |
|-----|---------|-----|
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Default parser |
| `ANTHROPIC_MODEL_HEAVY` | `claude-opus-4-7` | Heavy parse jobs |
| `ANTHROPIC_MODEL_FAST` | `claude-haiku-4-5` | Fast path (e.g. JSON-LD verify) |

Anthropic requests use prompt caching + the PDF beta (`anthropic-beta: pdfs-2024-09-25,prompt-caching-2024-07-31`).

## Tech stack — Platform (to be built, Phase 0+)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 App Router, Tailwind, shadcn/ui |
| API | tRPC v11, Zod validation |
| Auth | Supabase Auth, JWT, RLS |
| Database | Supabase Postgres + PostGIS |
| Real-time | Supabase Realtime |
| AI | Claude API (server-side tRPC only) |
| Automation | n8n self-hosted on Railway |
| Driver App | Next.js PWA + Service Worker |
| Maps | Google Maps API |
| Route optimization | VROOM (VRP solver) |
| Deploy | Vercel (platform), Railway (n8n) |

---

## v7 file structure

```
dos-tour-ops/
  CLAUDE.md                   # Identity + rules + pointers (read first)
  ARCHITECTURE.md             # This file
  SETUP.md                    # End-to-end hosted-app setup (Google/Supabase/Vercel)
  *.md                        # Topic files (TEAM, TOUR, ROADMAP, STRATEGY, ...)
  docs/                       # Daily sitreps + scan-flow + module design notes
  index.html
  package.json                # Vite 5, React 18, @supabase/supabase-js, mammoth, pdf-parse, xlsx
  vite.config.js
  vercel.json                 # rewrites + per-function maxDuration
  .env.example
  gmail-filters.xml           # Gmail label/filter rules feeding the scanners

  api/                        # Vercel serverless functions (CommonJS)
    intel.js                  # Gmail → Claude intel digest per show
    comms.js                  # Draft reply from a Gmail thread
    flights.js                # Gmail flight sweep, parse + verify, JSON-LD fast path
    flight-status.js          # Live flight status lookup
    lodging-scan.js           # Gmail hotel sweep
    rideshare-scan.js         # Gmail rideshare/ground-transport receipts → Finance
    car-rental-scan.js        # Gmail car-rental confirmations → Finance
    food-scan.js              # Gmail food-delivery receipts → Finance (Meals)
    parse-doc.js              # OCR/PDF/doc → structured data (+ receipt capture)
    parse-pdf.js              # PDF extraction helper
    production.js             # Production doc ingest
    receipt-url.js            # Mint short-lived signed URL for a stored receipt
    route.js                  # Address-to-address driving route (ORS/Google/haversine)
    lib/
      anthropic.js            # API config, models, postMessages (cache_control, usage)
      auth.js                 # Supabase admin client + bearer-token auth
      gmail.js                # search, batched fetch, body extract, JSON-LD, extractJson
      attachments.js          # PDF + .eml discovery, fetch, folio dedup
      eml.js                  # Minimal RFC822/.eml text extractor (forwarded receipts)
      parsePrimitives.js      # Shared parser guards + stopword/UI-chrome validation
      scanMemory.js           # scan_runs + scan_thread_cache, token-cost accounting
      tourContext.js          # Crew roster, vendors, owner routing (parser context)
      receiptStore.js         # Upload receipt files to Supabase Storage
      utils.js                # withTimeout + small helpers

  src/
    main.jsx                  # Entry, window.storage shim, Supabase auth bootstrap
    DosApp.jsx                # Main app: all tabs + logic (~10k lines)
    components/
      AuthGate.jsx            # Google OAuth gate, useAuth() context
      ui.jsx                  # Button, Pill primitives
    lib/
      constants.js            # Scope, storage keys (SK/PK), team, hotel defaults
      storage.js              # Supabase KV adapter (get, set, delete)
      supabase.js             # Supabase client init
      audit.js                # logAudit + identity (writes audit_log)
    styles/
      tokens.js               # Design tokens (T)

  supabase/
    schema.sql                # app_storage + RLS
    migrations/               # tour-scope, audit-log, scan-history, receipt-storage

  dos-mt-sync/                # Standalone Node CLI: DOS Tour Ops → Master Tour sync
```

## API surface (Vercel serverless)

All handlers authenticate via `api/lib/auth.js` (Supabase bearer token), call Claude
through `api/lib/anthropic.js`, and read Gmail via the Google token in the Supabase
session. Per-function `maxDuration` is set in `vercel.json` (scanners up to 180s,
`flights.js` 180s, `intel.js` 120s).

The finance scanners (`rideshare-scan`, `car-rental-scan`, `food-scan`) share one
pipeline: Gmail query sweep → thread cache check (`scanMemory`) → text batch + per-thread
PDF + `.eml` bundle parsing (`attachments` + `eml`) → Claude parse → validate
(`parsePrimitives`) → `scan_runs` telemetry → receipt files persisted to Storage
(`receiptStore`). They emit ledger-ready records (`rides` / `rentals` / `meals`) into
`dos-v7-finance`.

## dos-mt-sync (companion CLI)

Standalone ES-module Node project (`dos-mt-sync/`). Syncs DOS Tour Ops data into
Master Tour via Playwright/Electron automation. Not part of the Vercel deploy.

- `cli.js` (bin `dos-mt`) — `commander` CLI; `npm run sync` / `npm run dry-run`.
- `src/sync/` — `shows.js`, `events.js`, `flights.js`, `travel.js`.
- `src/pages/` — Master Tour page objects (`EventPage`, `TravelPage`, `Nav`).
- `clean-flights.js` — flight normalize/dedup (mirrors `cleanFlightsObj` in `DosApp.jsx`).
- Deps: `playwright`, `commander`, `dotenv`. Own `.env.example`.

## Tab structure (`DosApp.jsx` `TABS`)

| Tab | id | Function |
|-----|-----|---------|
| Dashboard | `dash` | Cross-client urgency, next shows, open items, flags |
| Advance | `advance` | Per-show advance checklist, state pills, contacts, notes, Gmail intel |
| Guest List | `guestlist` | Parties + collapsible categories, templates, activity log |
| Schedule | `ros` | ROS scheduler, anchor times, block timeline |
| Logistics | `transport` | EU bus schedule + festival driver dispatch + routing |
| Finance | `finance` | Settlement status, wire tracking, payout log, receipt ledger |
| Crew | `crew` | Split-day independent selection via composite show+party keys |
| Lodging | `lodging` | Gmail hotel scan, room blocks, todos |
| Production | `production` | Production doc ingest |
| Notes | `notes` | Shared + private notes |
| Access | `access` | Role/permission management |

Flights are surfaced within the relevant lanes (scanned via `api/flights.js`).

## Clients (seed)

- bbno$ (artist, active)
- Wakaan (festival, active)
- Beyond Wonderland (festival, active)
- Elements (festival, active)

## Environment variables

| Variable | Where | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Client + Server | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Client | Supabase anon/public key |
| `SUPABASE_SERVICE_KEY` | Server only | Supabase service role key (never expose) |
| `ANTHROPIC_API_KEY` | Server only | Anthropic API key (never expose) |
| `ANTHROPIC_MODEL` / `_HEAVY` / `_FAST` | Server only | Optional model overrides |
| `ORS_API_KEY` | Server only | OpenRouteService (route.js); optional |
| `GOOGLE_MAPS_API_KEY` | Server only | Google Directions fallback (route.js); optional |
| `VITE_APP_URL` | Client | Deployed app URL (OAuth redirect) |

Full hosted-app setup walkthrough: see [SETUP.md](SETUP.md).
