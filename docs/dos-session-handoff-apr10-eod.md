# DOS Tour Ops — Session Handoff
## Day of Show, LLC | Davon Johnson | April 10, 2026
## Resume: New chat, Day 2 of migration sprint

---

## WHERE WE ARE

We completed Day 1 of a 7-day sprint migrating the Tour Ops artifact (claude.ai prototype) to the DOS platform (Next.js 15 + Supabase). Day 2 is Supabase migration (tour tables + RLS + seed data).

**Two codebases:**
1. **Artifact** (`dos-tour-ops-v6.jsx`, 1,313 lines): Working prototype on claude.ai. Used for RRX day-of ops (Apr 16). No more features being added.
2. **Platform extraction** (`tour-module/`, 1,171 lines): Pure TypeScript service files + Zod schemas extracted from artifact. `tsc --strict --noEmit` clean. Ready to drop into `src/modules/tours/mgmt/`.

**Platform status:** DOS v2 scaffold (25 files, 927 lines, Next.js 15) is being made bootable. Active Supabase project exists (used for dos-tour-ops v5). Davon is working on getting `npm install && tsc` clean.

---

## FILES PRODUCED THIS SESSION

### Artifact (prototype, no more changes)
| File | Lines | Location |
|---|---|---|
| `dos-tour-ops-v6.jsx` | 1,313 | claude.ai artifact / project files |

### Platform Extraction (Day 1 deliverables)
| File | Lines | Purpose |
|---|---|---|
| `tour-module/schema.ts` | 321 | 15 Zod schemas, 12 enums, all entity types |
| `tour-module/services/ros-engine.ts` | 293 | ROS time calculations, block resolution, reorder, role visibility |
| `tour-module/services/hos-compliance.ts` | 238 | EC 561/2006 HOS checker, weekly/tour compliance |
| `tour-module/services/mission-scoring.ts` | 319 | Urgency scoring, gap detection, intent classification, owner routing |

### Planning
| File | Lines | Purpose |
|---|---|---|
| `dos-platform-migration-plan.md` | 595 | 7-day sprint plan with deliverables per day |

---

## SPRINT PLAN (7 days)

| Day | Date | Track | Status |
|---|---|---|---|
| 1 | Apr 11 | Extract domain logic | **DONE** — 4 files, 1,171 lines, tsc clean |
| 2 | Apr 12 | Supabase migration | **NEXT** — 11 tour tables + RLS + seed data |
| 3 | Apr 13 | tRPC router | ~35 procedures, full CRUD |
| 4 | Apr 14 | UI: Dashboard + show picker | Tailwind/shadcn |
| 5 | Apr 15 | UI: ROS scheduler + crew/travel | Core show day pages |
| 6 | Apr 16 | UI: Advance + mission + transport | **Red Rocks day, use artifact** |
| 7 | Apr 17 | Bridge: data migration + integration test | Artifact export → Supabase |

---

## ARTIFACT ARCHITECTURE (v6.8)

### Storage Keys
| Key | Domain | Status |
|---|---|---|
| `dos-v6-shows` | Show metadata, anchors, contacts | Active |
| `dos-v6-ros` | Per-show ROS block overrides | Active |
| `dos-v6-settings` | Role, tab, show, sub-tab selection | Active |
| `dos-v6-mission` | Mission items, next steps, lastRefresh | Active (seeded from GMAIL_SEED) |
| `dos-v6-crew` | Master crew roster (23 members) | Active |
| `dos-v6-show-crew` | Per-show crew assignments (split modes) | Active |
| `dos-v6-advances` | Per-show checklist, contacts, notes | Active |
| `dos-v6-bus` | Bus schedule (data hardcoded in BUS_DATA) | Planned |

### Tab Structure
```
Dashboard         — hero next show, stats, gaps, mission summary, upcoming shows
Mission Control   — sections A-G, Gmail data (seeded), gap detection, next steps
Show Day          — nested sub-tabs:
  Schedule        — ROS scheduler (5 anchors, phase-relative blocks, drag-reorder)
  Crew & Travel   — split IN/OUT modes, flight legs, roster editor
  Advance         — 20-item checklist, contacts CRUD, notes, deal/promoter info
Transport         — EU bus schedule, 5-week view, HOS compliance
Settings          — export/import JSON, reset, add show form, migration tracker
```

### Components (10 functions)
```
App               — state management, context, autosave, 8 storage domains
TopBar            — tabs, role selector, ⌘K, version badge
Dash              — unified dashboard with gap detection
MissionCtrl       — A-G sections, refresh from storage, add/resolve items
BusSched          — 5-week calendar, HOS compliance, drive bars
ShowDay           — wrapper with sub-tab routing
ROS               — full ROS scheduler with edit panel, add/delete blocks
CrewTravel        — split modes, flight legs, roster editor
AdvanceTab        — checklist, contacts, notes
SettingsTab       — export/import, reset, add show, migration tracker
Cmd               — ⌘K command palette
```

### Data Model (artifact, pre-migration)
```
Show: keyed by date string, anchors in minutes-from-midnight
ROS Block: {id, label, duration, phase, type, color, roles[], isAnchor, anchorKey, offsetRef, offsetMin}
Crew Assignment: {attending, inMode, outMode, inbound:FlightLeg[], outbound:FlightLeg[]}
FlightLeg: {id, flight, from, to, depart, arrive, status}
Advance: {checks:{index:boolean}, contacts:AdvanceContact[], notes:string}
Mission Item: {subject, context, action, urgency, intent, owner, from, threadLink, deadline, showDate, status}
```

---

## PLATFORM ARCHITECTURE (target)

### Tech Stack
- Next.js 15 (App Router, RSC), TypeScript strict, Supabase PostgreSQL + RLS
- tRPC v11, Tailwind CSS + shadcn/ui, TanStack Table v8, FullCalendar v6
- npm (not yarn/pnpm)

### Module Location
```
src/modules/tours/mgmt/
├── router.ts                    # tRPC endpoints (~35 procedures)
├── schema.ts                    # Zod schemas (DONE, 321 lines)
├── services/
│   ├── ros-engine.ts            # DONE, 293 lines
│   ├── hos-compliance.ts        # DONE, 238 lines
│   ├── mission-scoring.ts       # DONE, 319 lines
│   └── data-export.ts           # Day 7
└── components/                  # Days 4-6
```

### Route Structure
```
(dashboard)/tours/[tourId]/
  page.tsx                       # Dashboard
  layout.tsx                     # Sub-nav
  mission/page.tsx
  transport/page.tsx
  settings/page.tsx
  shows/[showId]/
    schedule/page.tsx
    crew/page.tsx
    advance/page.tsx
```

### Database Tables (Day 2 migration)
```
tours                            # Parent entity, one per tour cycle
tour_shows                       # Per-date, links to events table
tour_crew                        # Global roster per org
tour_crew_assignments            # Per-show, split in_mode/out_mode
tour_flight_legs                 # Inbound/outbound per assignment
tour_ros_blocks                  # Per-show ROS overrides
tour_advances                    # JSONB checks + contacts + notes
tour_bus_legs                    # Bus schedule
tour_mission_items               # Action items with Gmail refs
tour_next_steps                  # Numbered steps with done toggle
```
All tables: `organization_id` FK, RLS enabled, `created_at`/`updated_at`.

### Key Schema Decisions
- Show anchors stored as `int` (minutes from midnight), same as artifact
- Crew assignments have `in_mode` and `out_mode` (split travel, upgraded from v5 single mode)
- Flight legs are separate table (not nested JSON), linked to assignment
- Advance checks stored as JSONB `{index: boolean}` (matches artifact)
- ROS blocks are rows with `sort_order`, not stored as JSON array
- Mission items have `source` field ("manual" | "gmail_refresh") for sync tracking

---

## GMAIL SYNC ARCHITECTURE

**Problem solved this session:** Artifact can't call Gmail MCP from inside iframe (MCP server times out, no OAuth context). 

**Solution:** Chat-driven sync. Claude reads Gmail directly via MCP, classifies threads, writes data to artifact storage via `GMAIL_SEED` constant embedded in the artifact. Artifact reads from storage on load.

**Platform migration:** This becomes `POST /api/gmail-sync/route.ts` (server-side, OAuth token from Supabase auth). Same classification logic from `mission-scoring.ts`. Writes directly to `tour_mission_items` table.

**Last sync (Apr 10, 2026):** 27 items classified from 50 threads. 6 critical, 5 high, 10 medium, 6 low. Seeded into GMAIL_SEED constant in artifact.

---

## v5 → v6 MIGRATION TRACKER

| Feature | Status | Phase |
|---|---|---|
| Crew roster (23 members, editable) | DONE | 5 |
| Per-show crew assignments | DONE | 5 |
| Split inbound/outbound travel | DONE (upgraded from v5 single mode) | 5 |
| Flight legs | DONE | 5 |
| Advance checklist (20 items) | DONE | 4 |
| Per-show venue contacts | DONE | 4 |
| Per-show notes | DONE | 4 |
| Mission Control | DONE (rebuilt as cross-show) | v6.6 |
| Gmail sync (chat-driven) | DONE | v6.8 |
| Settings (export/import/reset) | DONE | 6 |
| Add show form | DONE | 6 |
| Session snapshot | DONE | 6 |
| Budget/settlement | NOT STARTED | Next |
| Mobile touch DnD | NOT STARTED | Later |
| Notion sync | NOT STARTED | Later |

---

## SHOW CALENDAR (24 shows)

### NA Wrap
- Apr 16: Red Rocks, Morrison (Custom ROS, w/ Oliver Tree, BNP vendor, HARD curfew 11:30p) — **6 days**
- May 1: WPI, Worcester (Advance past due, drafts created for hospo + tech) — **21 days**

### EU Tour (May 4-30, bus tour, Pieter Smit nightliner)
- May 4-5: Dublin National Stadium (2 shows, EU opener)
- May 7-8: Manchester O2 Victoria Warehouse (2 shows)
- May 10-11: Glasgow O2 Academy (2 shows)
- May 13: London O2 Brixton
- May 15: Zurich Halle 622
- May 16-17: Cologne E-Werk / Palladium
- May 19: Amsterdam AFAS Live
- May 20: Paris Le Bataclan (immigration forms outstanding)
- May 22: Milan Fabrique
- May 24: Prague SaSaZu (DD joins)
- May 26: Berlin Columbiahalle
- May 28: Bratislava Majestic Music Club
- May 30: Warsaw Orange Festival

### Post-EU France
- Jun 26: Chambord Live (immigration outstanding)
- Jun 28: Villeurbanne Le Transbordeur (immigration outstanding)

### Summer NA
- Jul 1: Mississauga Celebration Square
- Jul 11: Uncasville Mohegan Sun Arena
- Jul 12: Ottawa Bluesfest

---

## CRITICAL OPEN ITEMS (from Gmail sync Apr 10)

1. **RRX Design & Programming** — Something Good SOW alignment (SHECK, deadline Apr 14)
2. **GTE PK Sound** — 2nd SD12 + IEM adds confirmed, lock final package (DAN, Apr 12)
3. **WPI Hospo Advance** — Tori following up, rider confirmation needed (DAVON, Apr 11)
4. **French Immigration** — Freya: listing + passports. Tony: social security forms (DAVON, Apr 15-20)
5. **EU Coordinator + Debrief** — Sam wants Monday call, NA cost summary (DAVON, Apr 13)
6. **RBC Bus Items** — Personal items left on bus, pickup needed this weekend (DAVON, Apr 11)
7. **Touring Collective Invoice** — $10,145.25 via Chase ACH (ACCOUNTANT, Apr 17)
8. **AFAS Amsterdam Advance** — Freya looped Asmeret, need to introduce (DAVON, Apr 18)

---

## KEY CONTACTS

### bbno$ Core Team
- Sam Alavi (RCC CEO, sam@rightclick.gg)
- Sandro Lipari (RCC, sandro.lipari@rightclick.gg)
- Mike Sheck (PM L7, mikesheck@l7touring.com)
- Dan Nudelman (Prod Dir, dan@noodle.management)
- Ruairi Matthews (FOH, ruairim@magentasound.ca)
- Tony Yacowar (CPA DMCL, tyacowar@dmcl.ca)
- Freya Whitfield (Wasserman UK, freya.whitfield@the.team)
- Matt Adler (Wasserman/The Team, madler@the.team)

### EU Advance Contacts
- Dublin: Brian (brianfluskey@gmail.com)
- Manchester + London: Tyrone (tyrone84@gmail.com)
- Glasgow: Charmaine (charmaine.hardman@dfconcerts.co.uk)
- Zurich: Sarah (sarah.blum@gadget.ch), Fabian (fabian.tunkel@productionservice.ch)
- Cologne + Berlin: Oli (oliver.zimmermann@livenation-production.de)
- Amsterdam: Asmeret (a.habte@mojo.nl), John (j.cameron@mojo.nl)
- Paris: Cyril (c.legauffey@gmail.com)
- Milan: Andrea (andrea.aurigo@livenation.it), Micaela (micaela.armigero@livenation.it)
- Prague: Barbora (bara@fource.com)
- Bratislava: Peter (peter.lipovsky@gmail.com), Mate (mate.horvath@livenation.hu)

---

## PLATFORM PROJECT CONTEXT

The tour module is one of 20 sub-modules in the DOS platform. The full platform summary is in `DOS_Project_Summary.md` (project files). Key integration points:

- Tours module at `src/modules/tours/mgmt/`
- Multi-tenant: every table has `organization_id`, RLS enforced
- tRPC is the API boundary; no cross-module direct imports
- Brand colors: Primary `#0D3B66`, Accent `#F4D35E`, Warm `#EE964B`
- File naming: `kebab-case.tsx`, hooks `use-kebab-case.ts`, modules `router.ts` + `service.ts`
- Modular monolith, extractable to microservices at Gate 2+

---

## DECISIONS MADE THIS SESSION

1. **Artifact is frozen.** No more features. It's the day-of tool through RRX, then archive.
2. **Gmail sync is chat-driven** (not artifact API calls). MCP OAuth doesn't work from iframe context. Platform version will be server-side endpoint.
3. **Split inbound/outbound travel modes** (upgraded from v5 single mode). Schema supports `in_mode` and `out_mode` independently per crew per show.
4. **Show Day has nested sub-tabs** (Schedule, Crew & Travel, Advance). Not top-level tabs.
5. **Budget is the last remaining v5 feature.** Build directly in platform, not artifact.
6. **Domain logic extracted as pure TypeScript.** Zero React, zero storage, zero side effects. Drop into platform module.

---

## DAY 2 INSTRUCTIONS

### Prerequisites
- v2 scaffold boots (`npm install && tsc` clean)
- Supabase project accessible (`supabase db reset` works)

### Deliverables
1. `supabase/migrations/001_tour_module.sql` — 11 tables with RLS
2. `supabase/seed/tour-bbno.sql` — 24 shows, 23 crew, 30 bus legs, 27 mission items
3. Verify: `supabase db reset` succeeds, data queryable

### Key Schema Details
- All tables need `organization_id` FK to `organizations(id)`
- `tour_shows` has optional `event_id` FK to `events(id)` (null until show is linked to platform event)
- `tour_crew_assignments` has `unique(tour_show_id, crew_member_id)`
- `tour_advances` has `unique(tour_show_id)`
- `tour_shows` has `unique(tour_id, date)`
- RLS pattern: `organization_id in (select get_user_org_ids())`
- Minutes-from-midnight for all time fields (int, not time type)

---

*Day of Show, LLC | d.johnson@dayofshow.net | April 10, 2026*
