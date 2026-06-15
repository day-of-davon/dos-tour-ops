# Alchemy Codex — Project Instructions
## DOS Tour Ops + DOS Platform | Day of Show, LLC | April 21, 2026

---

## Who I Am

Davon Johnson. CEO of Day of Show, LLC. Expert in event production, advancing, dispatch, settlement, touring operations. Currently operating bbno$ Internet Explorer EU Tour 2026. On EU tour May 4-30 (async only).

Known gaps: deep TypeScript types, infra configuration.

Never explain: SaaS basics, multi-tenant patterns, RLS, tRPC, VRP, festival production workflows.

---

## What We're Building

### 1. DOS Tour Ops v7 (active, daily use)
Internal operations dashboard for bbno$ EU Tour. Vite 5 + React 18 + Supabase. Live at `dos-tour-ops.vercel.app`. Multi-user (Davon + Olivia Mims).

**Active build targets (in order):**
- Prompt 1: Auth gate, team/private storage split, notes, custom checklist, status buttons
- Prompt 2: Gmail intel panel, auto-toggle checklist from email, show nav dropdown

### 2. DOS Platform (not yet built)
B2B SaaS for tour operations. Next.js 15, tRPC v11, Supabase. Blocked on Josh Gallegos schema audit. No platform code until that gate clears.

The v7 app prototypes features that get automated in the platform. They share domain knowledge, separate codebases.

---

## Architecture (v7)

| Layer | Stack |
|-------|-------|
| Frontend | Vite 5, React 18, inline styles |
| Auth | Supabase Auth + Google OAuth |
| Database | Supabase Postgres, `app_storage` KV table |
| AI | Claude API via `/api/intel.js` Vercel serverless |
| Deploy | Vercel, auto-deploy from `main` |

**Storage pattern:** `user_id + key + value`. Shared keys use `team_id = 'dos-bbno-eu-2026'`. Private keys scoped to `user_id`.

**Key files:**
- `src/DosApp.jsx` — main app, all tabs, all logic
- `src/lib/storage.js` — Supabase KV adapter
- `api/intel.js` — Anthropic API + Gmail scrape

---

## Data Model Direction

Current v7 keys everything by date (`shows[date]`, `ros[date]`). This is tech debt. Target model is event-ID-keyed:

```
Event {
  id: uuid
  type: show | travel | off_day
  date: YYYY-MM-DD
  contract, advance, travel, schedule, production, finance, crew
}
```

Flag any new date-keyed additions as debt. Platform schema should start from this model.

---

## Active Touring Context (bbno$ IE Tour)

- Red Rocks Apr 16 (w/ Oliver Tree, AEG/Sasha Minkov)
- EU: 17 shows May 4-30, Dublin to Warsaw. Pieter Smit nightliner ($68,367, Toby Jansen). Fly By Nite truck job 56714.
- Summer NA: Mississauga Jul 1, Mohegan Sun Jul 11, Ottawa Bluesfest Jul 12
- Insurance: $0 — CRITICAL gap
- FR immigration forms: outstanding for Paris, Chambord, Villeurbanne

---

## Team

| Person | Role | Availability |
|--------|------|-------------|
| Davon Johnson | CEO, product, agent framework | Active; async-only May 4-30 |
| Olivia Mims | Transport Coordinator | Active |
| Dane Johnson | Frontend (Next.js, tRPC, UI) | Confirmed Jun/Jul |
| Josh Gallegos | Dispatch logic, schema (contractor) | Not yet engaged |
| Sloan LaMotte | Strategy, BD | Re-engaging |
| Borz Azarian | Architecture consultant | Available for reviews |

---

## Communication Rules (non-negotiable)

- Lead with the answer. Reasoning follows.
- Fewest words. No filler, no affirmations.
- No em dashes. Use commas, periods, semicolons.
- Challenge framing when wrong. Honesty over comfort.
- Quantify uncertainty when it matters.
- When confidence < 0.80, ask a clarifying question.
- No trailing summaries. End on substance.
- Default to files for anything over 20 lines.

---

## Anti-Patterns

- Do not explain basics Davon already knows.
- Do not build platform features before Josh's schema audit.
- Do not suggest infrastructure beyond current Revenue Gate (Supabase free + Vercel hobby until revenue).
- Do not pad responses.
- Do not use em dashes.
- Do not treat `day-of-davon/dos-tour-ops` as archived. It is the active repo.
- Do not interrupt build mode with strategy, or vice versa.

---

## Scan / Background Operations

New scan features should fire automatically on load using `useRef(false)` guard + `useEffect`. Manual triggers are friction for ops use.

When touching flight scan logic, always check both `FlightsSection` and `FlightsListView` — they're parallel components that must stay in sync.

---

## Revenue Gate

| Gate | Burn | Infra |
|------|------|-------|
| 0 (now) | $0-200/mo | Supabase free, Vercel hobby |
| 1 | $200-500/mo | Supabase Pro, Vercel Pro |
| 2 | $500-2K/mo | Railway, Stripe Connect |
| 3 | $2K+/mo | Dedicated infra, OSRM |

---

## Competitors

| Tool | Price | Gap |
|------|-------|-----|
| Master Tour | $74.99/mo | No dispatch, settlement, AI, transport |
| FestivalPro | $45-499/mo + 2% txn | No transport, AI, or free tier |
| Lennd | Enterprise | No transport, ROS, market intel |

DOS moat: only platform combining real-time ops (ROS, transport, advancing) with AI intelligence layer.

---

*Day of Show, LLC | d.johnson@dayofshow.net | CLAUDE.md v2.0 | April 21, 2026*
