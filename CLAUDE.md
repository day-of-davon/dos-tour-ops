# CLAUDE.md — DOS Platform + Tour Ops
## Day of Show, LLC | Davon Johnson | April 13, 2026
## Place in repo root. Claude Code reads this automatically on every session.

---

## 0. What This Is

DOS is two things built by one team:

1. **DOS Tour Ops v7** — Internal operations dashboard for Davon and Olivia. Vite + React 18 + Supabase. Live at `dos-tour-ops.vercel.app`. Used daily to run bbno$'s Internet Explorer Tour. This is the active build target.

2. **DOS Platform** — B2B tour operations SaaS (Next.js 15, tRPC v11, Supabase). Customer-facing product. Not yet scaffolded. No platform feature code until Josh delivers schema audit.

The artifact informs the platform. Features are prototyped manually in v7, then automated in the platform. They share domain knowledge but are separate codebases.

---

## 1. Who You're Working With

**Davon Johnson** — CEO, product lead, touring ops. Expert in event production, dispatch, advancing, settlement. Known gaps: deep TypeScript types, infra config. On EU tour May 4-30 (async only).

**Communication rules (non-negotiable):**
- Lead with the answer. Reasoning follows.
- Fewest words. No filler, no affirmations.
- No em dashes. Use commas, periods, semicolons.
- Challenge framing when wrong. Honesty over comfort.
- Quantify uncertainty when it matters.
- Never explain: SaaS basics, multi-tenant patterns, RLS, tRPC, VRP, festival production workflows.
- Ask clarifying questions when confidence < 0.80.
- Minimize exclamation points.
- Default to files for anything over 20 lines.

---

## 2. Team

| Person | Role | Status | Domain |
|--------|------|--------|--------|
| Davon Johnson | CEO, Product, Agent Framework | Active, EU tour May 4-30 | Specs, agents, touring ops |
| Olivia Mims | Transportation Coordinator | Active | Elements ops, advance coordination |
| Dane Johnson | Frontend Engineer (brother) | Confirmed, bandwidth Jun/Jul | Next.js, tRPC, UI, PWA |
| Josh Gallegos | Dispatch Logic (contractor) | Outreach Apr 14, not yet engaged | optimizer.ts, schemas, Maps |
| Sloan LaMotte | Strategy, BD (advisor) | Reengaging | GTM, financial modeling |
| Borz Azarian | Architecture (consultant) | Available for reviews | Architecture decisions |

---

## 3. Current State

### Repos
- `day-of-davon/dos-tour-ops` — ACTIVE. Vite 5 + React 18 + Supabase. v7 JSX deployed here. Live at `dos-tour-ops.vercel.app`.
- `[DOS LLC org]/dos-platform` — NOT YET CREATED. Phase 0 action item. Next.js 15 + tRPC v11 scaffold.

### What's Deployed
- `dos-tour-ops.vercel.app` — LIVE. v7 React app. Supabase-backed storage. Google OAuth configured. Multi-user (Davon + Olivia).

### Supabase
- Active project backing `dos-tour-ops.vercel.app`.
- `app_storage` table: KV pattern, `user_id` + `key` + `value`.
- Storage adapter at `src/lib/storage.js`, shimmed to `window.storage` in `src/main.jsx`.
- RLS: currently user_id scoped. Team/private split IN PROGRESS (see Section 11).

### v7 Storage Keys
| Key | Scope | Content |
|-----|-------|---------|
| `dos-v7-shows` | shared | Show metadata, anchors, client associations |
| `dos-v7-ros` | shared | Per-show ROS block overrides |
| `dos-v7-advances` | shared | Per-show advance checklist state |
| `dos-v7-finance` | shared | Settlement + payout log |
| `dos-v7-settings` | shared | Role, tab, show, client selection |
| `dos-v7-intel` | private | Email intel, personal to-do list |
| `dos-v7-notes-private` | private | Personal notes per show |
| `dos-v7-checklist-private` | private | Custom private checklist items |

### Team ID
All shared storage uses `team_id = 'dos-bbno-eu-2026'`.

---

## 4. Decisions Log (Canonical)

| Decision | Date | Supersedes |
|----------|------|------------|
| v7 TypeScript CLI-first agents are canonical | Apr 13 | Python pgvector framework (killed) |
| Hybrid pricing: touring $99-499/mo, festivals $1K-15K+ | Apr 13 | $50/driver/month |
| Festival tiers: boutique $1K, regional $2.5K, mid-major $5K, major $10K, enterprise $15K+ | Apr 13 | Untiered |
| Structured logging + Claude API cost tracking in Phase 4 | Apr 13 | No observability plan |
| New GitHub org for DOS LLC | Apr 13 | Personal account repo |
| `day-of-davon/dos-tour-ops` is the active v7 repo, NOT archived | Apr 13 | CLAUDE.md Section 3 (stale) |
| v7 deployed to Vercel, Supabase-backed, multi-user | Apr 13 | "not yet deployed" (stale) |
| Team/private storage split: shared keys use team_id, private keys use user_id | Apr 13 | Single user_id scoping |
| Google OAuth required gate (in progress) | Apr 13 | No auth |
| Master Tour is $74.99/mo single-user, no dispatch/settlement/AI | Apr 13 | $59.99 estimate |

---

## 5. Tech Stack

### v7 Tour Ops App (active)
| Layer | Technology |
|-------|-----------|
| Frontend | Vite 5, React 18, inline styles |
| Auth | Supabase Auth + Google OAuth |
| Database | Supabase Postgres (`app_storage` KV table) |
| Storage adapter | `src/lib/storage.js` (shimmed to `window.storage`) |
| AI | Claude API via `/api/intel.js` (Vercel serverless) |
| Gmail | Google OAuth, `gmail.readonly` scope, via Supabase session token |
| Deploy | Vercel (auto-deploy from `main` branch) |
| Fonts | Outfit, JetBrains Mono (inline) |

### Platform (to be built, Phase 0+)
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 App Router, Tailwind CSS, shadcn/ui |
| API | tRPC v11, Zod validation |
| Auth | Supabase Auth, JWT, RLS |
| Database | Supabase Postgres + PostGIS |
| Real-time | Supabase Realtime |
| AI | Claude API (Sonnet 4.6, server-side tRPC only) |
| Automation | n8n self-hosted on Railway |
| Driver App | Next.js PWA + Service Worker |
| Maps | Google Maps API |
| Route Optimization | VROOM (VRP solver) |
| Deploy | Vercel (platform), Railway (n8n) |

---

## 6. v7 App Architecture

### File Structure
```
dos-tour-ops/
  CLAUDE.md                   # This file
  index.html
  package.json                # Vite 5, React 18, @supabase/supabase-js
  vite.config.js
  vercel.json
  .env.example                # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, VITE_APP_URL
  SETUP.md                    # Full setup guide

  api/
    intel.js                  # Vercel serverless: Anthropic API + Gmail scrape

  src/
    main.jsx                  # Entry point, window.storage shim, Supabase auth
    DosApp.jsx                # Main app (784 lines, all tabs, all logic)
    App.jsx                   # OLD v5 file. Reference only for Gmail intel feature port.
    lib/
      storage.js              # Supabase KV adapter (get, set, delete)
      supabase.js             # Supabase client init

  supabase/
    schema.sql                # app_storage table + RLS policies
```

### Tab Structure
| Tab | Status | Function |
|-----|--------|----------|
| Dashboard | Live | Cross-client urgency view, next shows, open items, flags |
| Advance | Live | Per-show advance checklist, status tracking, contacts, notes |
| Show Day | Live | ROS scheduler, anchor times, block timeline |
| Transport | Live | EU bus schedule + festival driver dispatch |
| Finance | Live | Settlement status, wire tracking, payout log |
| Crew | Placeholder | Coming Phase 5 |

### Clients (seed data)
- bbno$ (artist, active)
- Wakaan (festival, active)
- Beyond Wonderland (festival, active)
- Elements (festival, active)

---

## 7. Features In Progress (current Claude Code session)

Run these in order. Do not start Prompt 2 until Prompt 1 is deployed and confirmed.

### Prompt 1: Auth + Storage + Notes + Custom Checklist + Status Buttons
1. Google OAuth gate (sign-in required)
2. Team/private storage split (team_id shared, user_id private)
3. Persistent user notes per show (public/private toggle)
4. Custom checklist items per show (public/private toggle)
5. Mobile detection hook (`useMobile`)
6. Snapshot/export state (JSON download + import)
7. Advance item status buttons: Pending, Sent, Received, In Progress, Respond, Follow Up, Escalate, Confirmed, N/A

### Prompt 2: Gmail Intel + Auto-toggle
1. Gmail intel panel per show (private, user-scoped)
2. Auto-toggle advance checklist from email scrape (one-click confirm required)
3. Show dropdown nav (jump to any show from any tab)
4. Private to-do list from email scrape (per show, per user)

### Status Button Design Spec
- Single click: cycles Pending → In Progress → Confirmed
- Long press / right click: popover with all 9 options
- Mobile: tap opens popover
- Colors: Confirmed=green, Escalate=red, Follow Up/Respond=amber, In Progress=blue, Sent/Received=slate, N/A=muted + strikethrough
- Storage: shared if item is shared, private if item is private

### Auto-toggle Logic
- Shared checklist item confirmed: stored in shared storage, visible to all users
- Private checklist item confirmed: stored in private storage, user only
- Always requires one-click "Confirm" before marking complete
- Undo available for 30 seconds after confirm
- Never auto-confirms without user action

---

## 8. Pricing Model

### Touring (per-month)
| Tier | Price | Modules |
|------|-------|---------|
| Starter (Free) | $0 | ROS, Calendar, 3 shows |
| Pro | $99/mo | All ops + DOS Advance |
| Pro + Benchmark | $199/mo | Pro + DOS Benchmark |
| Market | $499/mo | All + Global + Market Intel |
| Enterprise | Negotiated | All + API + white-label |

### Festivals (per-event)
| Scale | Drivers | Artists | Price |
|-------|---------|---------|-------|
| Boutique | 1-3 | 1-15 | $1,000 |
| Regional | 4-8 | 15-40 | $2,500 |
| Mid-Major | 9-15 | 40-80 | $5,000 |
| Major | 15-25 | 80-150 | $10,000 |
| Enterprise | 25+ | 150+ | $15,000+ |

---

## 9. Competitive Landscape

| Competitor | Price | What They Have | What They Don't |
|------------|-------|---------------|-----------------|
| Master Tour | $74.99/mo single-user | Itineraries, day sheets, 150K contacts, offline | Dispatch, settlement, AI, transport, deal pipeline |
| FestivalPro | ~$45-499/mo + 2% txn | 600+ events, full lifecycle, ticketing | Transport, AI, free tier, API |
| Lennd | Enterprise (unpublished) | Credentialing, portals | Transport, ROS, market intel |
| BeatSwitch | Acquired Jan 2026 | Booking focus | Everything else |

**DOS moat:** Only platform combining real-time ops (ROS, transport, advancing) with AI intelligence layer.

---

## 10. Platform Roadmap

| Phase | Timeline | Scope | Gate |
|-------|----------|-------|------|
| 0 | Apr 13 - May 3 | Foundation, schema, tools, IP, GitHub org, Supabase project | Schema reconciled, auth, CRUD |
| 1 | May 4-31 | Dashboard, dispatch, driver PWA, logic extraction | Dispatch + PWA live |
| 2 | Jun 1-28 | Maps, real-time, GPS tracking, conflict detection | GPS tracking live |
| 3 | Jun 29 - Jul 26 | Bus schedule, hardening, 350-run load test | Load test pass |
| 4 | Parallel P3 | Advances, DOS Advance, n8n, structured logging | Agents live |
| 5 | Parallel P3 | Crew tab, DOS Benchmark | Benchmark scoring live |
| Elements | Aug 7-10 | Deploy, load data, train, operate | Zero-downtime |
| 6 | Sep-Oct | DOS Market Intel, DOS Global, DeerFlow | Weekly briefs |
| 7 | Jul 27 - Aug 15 | DOS Social, production deploy | Production stable |
| 8 | Oct-Dec | Multi-tenant auth, Stripe, public launch | First external customer |
| 9 | Q1 2027 | API, white-label, Enterprise SSO | API docs published |

### Revenue Gate Framework
| Gate | Burn | Infra Allowed |
|------|------|--------------|
| 0 | $0-200/mo | Supabase free, Vercel hobby |
| 1 | $200-500/mo | Supabase Pro, Vercel Pro, Twilio |
| 2 | $500-2K/mo | Railway, Stripe Connect, DeerFlow |
| 3 | $2K+/mo | Dedicated infra, OSRM, enterprise support |

---

## 11. Open Items (as of Apr 13, 2026)

### v7 App (blocking for EU tour)
- [ ] Prompt 1 Claude Code session (auth, storage split, notes, checklist, status buttons)
- [ ] Prompt 2 Claude Code session (Gmail intel, auto-toggle, show nav)
- [ ] Crew tab (port from v5 App.jsx)
- [ ] Tour insurance: $0, CRITICAL. Route to Sam/Sandro. Not a platform problem.
- [ ] FR immigration forms: Paris (May 20), Chambord (Jun 26), Villeurbanne (Jun 28)
- [ ] Wasserman UK form: outstanding since Apr 9

### Platform (Phase 0)
- [ ] Create GitHub org for DOS LLC
- [ ] Create `dos-platform` repo (Next.js 15 scaffold)
- [ ] Create new Supabase project for platform (separate from v7)
- [ ] Contact Josh Gallegos (Apr 14, check PayPal first)
- [ ] Install SuperClaude, GWS CLI, Claude Task Master

---

## 12. Active Touring Context (bbno$ IE Tour)

- **Next show:** Red Rocks Apr 16 (w/ Oliver Tree, custom ROS, BNP vendor, AEG/Sasha Minkov)
- **EU:** 17 shows, May 4-30, Dublin to Warsaw. Fly in Dublin, bus between all shows, fly out Warsaw.
- **Bus:** Pieter Smit nightliner, $68,367 confirmed (Toby Jansen, nightliner@pietersmit.com)
- **Truck:** Fly By Nite, job 56714 confirmed (Fiona Nolan)
- **LX/VX:** Neg Earth (Alex Griffiths PM), TSL Lighting quote J38723 GBP 66,991 (Gemma Jaques)
- **Insurance:** $0, CRITICAL gap
- **Immigration:** FR forms outstanding for Paris, Chambord, Villeurbanne
- **Summer NA:** Mississauga Jul 1, Mohegan Sun Jul 11, Ottawa Bluesfest Jul 12

### Key Contacts
- Sam Alavi, Right Click Culture CEO (sam@rightclick.gg)
- Mike Sheck, PM L7 Touring (mikesheck@l7touring.com)
- Dan Nudelman, Prod Dir (dan@noodle.management)
- Matt Adler, Wasserman (madler@the.team)
- Tony Yacowar, DMCL CPA (tyacowar@dmcl.ca)
- Ruairi Matthews, FOH (ruairim@magentasound.ca)
- Guillaume Bessette, Bus Driver
- Olivia Mims, Transport Coordinator

---

## 13. Anti-Patterns

- Do NOT explain basics (SaaS, RLS, tRPC, VRP, festival workflows).
- Do NOT interrupt build mode with strategy or vice versa.
- Do NOT build platform features before Josh's schema audit.
- Do NOT suggest infrastructure beyond current Revenue Gate.
- Do NOT pad responses. End on substance.
- Do NOT use em dashes.
- Do NOT reference the Python agent framework as active. It is dead.
- Do NOT treat `day-of-davon/dos-tour-ops` as archived. It is the active repo.

---

*Day of Show, LLC | d.johnson@dayofshow.net | 337.326.0041*
*Los Angeles, CA | San Juan, PR*
*CLAUDE.md v2.0 | April 13, 2026*
