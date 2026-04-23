# ARCHITECTURE — v7 + Platform

**Last refresh:** 2026-04-23.

---

## Repos

- `day-of-davon/dos-tour-ops` — **ACTIVE**. Vite 5 + React 18 + Supabase. v7 JSX deployed here. Live at `dos-tour-ops.vercel.app`.
- `[DOS LLC org]/dos-platform` — NOT YET CREATED. Phase 0 action item. Next.js 15 + tRPC v11 scaffold.

## Deployed

- `dos-tour-ops.vercel.app` — v7 React app. Supabase-backed storage. Google OAuth configured. Multi-user (Davon + Olivia).

## Supabase

- Active project backing `dos-tour-ops.vercel.app`.
- `app_storage` table: KV pattern, `user_id` + `key` + `value`.
- Storage adapter at `src/lib/storage.js`, shimmed to `window.storage` in `src/main.jsx`.
- RLS: team_id shared keys + user_id private keys.

## v7 Storage keys

| Key | Scope | Content |
|-----|-------|---------|
| `dos-v7-shows` | shared | Show metadata, anchors, client associations |
| `dos-v7-ros` | shared | Per-show ROS block overrides |
| `dos-v7-advances` | shared | Per-show advance checklist state |
| `dos-v7-finance` | shared | Settlement + payout log |
| `dos-v7-settings` | shared | Role, tab, show, client selection |
| `dos-v7-crew` | shared | Crew assignments per show |
| `dos-v7-production` | shared | Production doc ingest data |
| `dos-v7-flights` | shared | Flight records, pax matching, lifecycle |
| `dos-v7-lodging` | shared | Hotel room blocks and todos |
| `dos-v7-guestlists` | shared | Guest list parties + categories |
| `dos-v7-guestlist-templates` | shared | Reusable guest list templates |
| `dos-v7-immigration` | shared | Immigration form status per show |
| `dos-v7-permissions` | shared | Role-based access control state |
| `dos-v7-actlog` | shared | Activity log entries |
| `dos-v7-intel` | private | Email intel, personal to-do list |
| `dos-v7-notes-private` | private | Personal notes per show |
| `dos-v7-checklist-private` | private | Custom private checklist items |

Team ID: `team_id = 'dos-bbno-2026'` (tour-scoped; leg derived from show date).

---

## Tech stack — v7 (active)

| Layer | Technology |
|-------|-----------|
| Frontend | Vite 5, React 18, inline styles |
| Auth | Supabase Auth + Google OAuth |
| Database | Supabase Postgres (`app_storage` KV) |
| Storage adapter | `src/lib/storage.js` (shimmed to `window.storage`) |
| AI | Claude API via `/api/intel.js` (Vercel serverless) |
| Gmail | Google OAuth, `gmail.readonly` scope, via Supabase session token |
| Deploy | Vercel (auto-deploy from `main`) |
| Fonts | Outfit, JetBrains Mono (inline) |

## Tech stack — Platform (to be built, Phase 0+)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 App Router, Tailwind, shadcn/ui |
| API | tRPC v11, Zod validation |
| Auth | Supabase Auth, JWT, RLS |
| Database | Supabase Postgres + PostGIS |
| Real-time | Supabase Realtime |
| AI | Claude API (Sonnet 4.6, server-side tRPC only) |
| Automation | n8n self-hosted on Railway |
| Driver App | Next.js PWA + Service Worker |
| Maps | Google Maps API |
| Route optimization | VROOM (VRP solver) |
| Deploy | Vercel (platform), Railway (n8n) |

---

## v7 file structure

```
dos-tour-ops/
  CLAUDE.md
  index.html
  package.json                # Vite 5, React 18, @supabase/supabase-js
  vite.config.js
  vercel.json
  .env.example                # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, VITE_APP_URL
  SETUP.md

  api/
    intel.js                  # Gmail → Claude intel digest per show (Sonnet)
    comms.js                  # Draft reply from Gmail thread (Sonnet)
    flights.js                # Gmail flight sweep, parse + verify, JSON-LD fast path (Sonnet/Haiku)
    flight-status.js          # Live flight status lookup
    lodging-scan.js           # Gmail hotel sweep (Sonnet)
    parse-doc.js              # OCR/PDF → structured data (Sonnet)
    parse-pdf.js              # PDF extraction helper
    production.js             # Production doc ingest (Sonnet)
    lib/
      gmail.js                # search, batched fetch, body extract, JSON-LD, extractJson
      anthropic.js            # URL, headers, DEFAULT_MODEL (env-overridable)

  src/
    main.jsx                  # Entry, window.storage shim, Supabase auth
    DosApp.jsx                # Main app (all tabs, all logic)
    App.jsx                   # OLD v5. Reference only for Gmail intel port.
    lib/
      storage.js              # Supabase KV adapter (get, set, delete)
      supabase.js             # Supabase client init

  supabase/
    schema.sql                # app_storage + RLS
```

## Tab structure

| Tab | Status | Function |
|-----|--------|----------|
| Dashboard | Live | Cross-client urgency, next shows, open items, flags |
| Advance | Live | Per-show advance checklist, 9-state pills, contacts, notes, Gmail intel |
| Show Day | Live | ROS scheduler, anchor times, block timeline |
| Transport | Live | EU bus schedule + festival driver dispatch |
| Finance | Live | Settlement status, wire tracking, payout log |
| Flights | Live | Gmail scan, dedup, crew match, lifecycle tracking |
| Lodging | Live | Gmail hotel scan, room blocks, todos |
| Guest List | Live | Parties (top) + collapsible categories, templates, activity log |
| Crew | Live | Split-day independent selection via composite show+party keys |

## Clients (seed)

- bbno$ (artist, active)
- Wakaan (festival, active)
- Beyond Wonderland (festival, active)
- Elements (festival, active)
