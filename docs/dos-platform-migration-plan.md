# DOS Tour Module: Artifact → Platform Migration Plan
## Day of Show, LLC | April 10, 2026
## 7-Day Sprint Plan (Apr 11-17)

---

## SITUATION

You have two codebases that need to converge:

1. **v6.8 Artifact** (1,314 lines, claude.ai React): Working prototype with validated domain logic for tour ops (ROS, crew, advance, bus schedule, mission control, gap detection, HOS compliance). No auth, no database, inline styles, `window.storage`, single-file, hardcoded data.

2. **DOS v2 Scaffold** (25 files, 927 lines, Next.js 15): Platform skeleton with tRPC, Supabase, RLS, TypeScript strict. 3 routers, 25 endpoints. No tour module exists.

Red Rocks is April 16. EU starts May 4. You need the tour ops tool functional on the real platform before EU, but you also need the artifact running for RRX in 6 days.

---

## STRATEGY: PARALLEL TRACKS

**Track A (days 1-3): Extract + Schema.** Pull domain logic out of the artifact into typed, testable service files. Write Supabase migrations. No UI yet.

**Track B (days 4-6): Platform UI.** Build the tour module pages in Next.js using extracted services, Tailwind/shadcn, and Supabase data.

**Track C (day 7): Bridge.** Connect live data, seed from artifact export, validate against real tour schedule.

The artifact stays as-is for RRX (Apr 16). You use it day-of. The platform version targets EU readiness (May 4).

---

## SPRINT 1: EXTRACT + SCHEMA (Apr 11-13)

### Day 1 (Apr 11, Fri): Domain Logic Extraction

**Goal:** Pure TypeScript service files with zero React, zero UI, zero storage dependencies.

#### Deliverables:

**`src/modules/tours/mgmt/services/ros-engine.ts`**
Extract from artifact lines 734-931 (ROS component logic):
- `calculateBlockTimes(show, blocks)` — the time engine (anchors, phase-relative, offset refs)
- `resolveRos(date, overrides, customMap)` — gRos resolution chain
- `enforceMgOrder(blocks)` — M&G check-in before M&G
- `DEFAULT_ROS_TEMPLATE`, `RED_ROCKS_ROS` as typed constants
- Types: `RosBlock`, `RosPhase`, `RosAnchorKey`, `ShowAnchors`, `BlockTimes`

**`src/modules/tours/mgmt/services/hos-compliance.ts`**
Extract from artifact lines 83, 627-709 (BusSched logic):
- `HOS_LIMITS` constant (EC 561/2006)
- `calculateWeeklyHos(busLegs[])` — weekly drive hours, violations
- `validateDailyDrive(minutes)` — 9h/10h extended check
- `BUS_DATA` type definition (not the hardcoded data)
- Types: `BusLeg`, `HosLimits`, `HosWeekSummary`, `HosViolation`

**`src/modules/tours/mgmt/services/mission-scoring.ts`**
Extract from artifact lines 88-91, 456-523:
- `scoreUrgency(item, showCalendar)` — CRITICAL/HIGH/MEDIUM/LOW
- `detectGaps(shows, advances, showCrew)` — auto gap detection
- `classifyIntent(subject, from)` — ADVANCE/PRODUCTION/SETTLEMENT etc.
- `routeOwner(thread)` — DAVON/SHECK/DAN/MANAGEMENT routing
- Types: `MissionItem`, `UrgencyLevel`, `Intent`, `Owner`, `Gap`

**`src/modules/tours/mgmt/schema.ts`**
Zod schemas for all tour entities:
```typescript
export const tourShowSchema = z.object({
  id: z.string().uuid(),
  tour_id: z.string().uuid(),
  event_id: z.string().uuid().nullable(),
  date: z.string().date(),
  city: z.string(),
  venue: z.string(),
  country: z.string().length(2),
  region: z.enum(["na", "eu", "eu-post", "summer"]),
  promoter: z.string().nullable(),
  doors: z.number().int().describe("Minutes from midnight"),
  curfew: z.number().int(),
  bus_arrive: z.number().int(),
  crew_call: z.number().int(),
  venue_access: z.number().int(),
  mg_time: z.number().int(),
  doors_confirmed: z.boolean().default(false),
  curfew_confirmed: z.boolean().default(false),
  // ... all anchor confirmed flags
  deal: z.string().nullable(),
  notes: z.string().nullable(),
  advance_status: z.enum(["not_started", "in_progress", "complete"]),
});

export const crewAssignmentSchema = z.object({
  id: z.string().uuid(),
  tour_show_id: z.string().uuid(),
  crew_member_id: z.string().uuid(),
  attending: z.boolean(),
  in_mode: z.enum(["bus", "fly", "local", "vendor", "drive"]),
  out_mode: z.enum(["bus", "fly", "local", "vendor", "drive"]),
});

export const flightLegSchema = z.object({
  id: z.string().uuid(),
  crew_assignment_id: z.string().uuid(),
  direction: z.enum(["inbound", "outbound"]),
  flight: z.string().nullable(),
  from_airport: z.string(),
  to_airport: z.string(),
  depart: z.string().nullable(),
  arrive: z.string().nullable(),
  status: z.enum(["pending", "confirmed", "cancelled"]),
});
// ... ros_blocks, advance_checks, mission_items, bus_legs
```

#### Validation:
- Each service file must compile standalone with `tsc --noEmit`
- Zero imports from React, artifact, or storage
- Each exported function has JSDoc with input/output types

---

### Day 2 (Apr 12, Sat): Supabase Migration

**Goal:** Tour tables in Supabase with RLS, ready for data.

#### Migration: `supabase/migrations/001_tour_module.sql`

```sql
-- Tours (parent entity, one per tour cycle)
create table tours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  artist text not null,
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tour Shows (per-date, links to events table when applicable)
create table tour_shows (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  event_id uuid references events(id),
  date date not null,
  city text not null,
  venue text not null,
  country char(2) not null default 'US',
  region text not null default 'na',
  promoter text,
  doors int not null default 1140,        -- 7:00p in minutes
  curfew int not null default 1380,       -- 11:00p
  bus_arrive int not null default 540,    -- 9:00a
  crew_call int not null default 630,     -- 10:30a
  venue_access int not null default 540,
  mg_time int not null default 990,       -- 4:30p
  doors_confirmed boolean default false,
  curfew_confirmed boolean default false,
  bus_arrive_confirmed boolean default false,
  crew_call_confirmed boolean default false,
  venue_access_confirmed boolean default false,
  mg_confirmed boolean default false,
  deal text,
  notes text,
  advance_status text default 'not_started',
  eta_source text default 'schedule',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tour_id, date)
);

-- Crew Members (global roster per org)
create table tour_crew (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  role text not null,
  email text,
  phone text,
  created_at timestamptz default now()
);

-- Per-show crew assignments (split modes)
create table tour_crew_assignments (
  id uuid primary key default gen_random_uuid(),
  tour_show_id uuid not null references tour_shows(id) on delete cascade,
  crew_member_id uuid not null references tour_crew(id) on delete cascade,
  attending boolean default false,
  in_mode text not null default 'bus',
  out_mode text not null default 'bus',
  created_at timestamptz default now(),
  unique(tour_show_id, crew_member_id)
);

-- Flight legs
create table tour_flight_legs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references tour_crew_assignments(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  flight text,
  from_airport text,
  to_airport text,
  depart_time text,
  arrive_time text,
  confirmation text,
  status text not null default 'pending',
  created_at timestamptz default now()
);

-- ROS blocks (per-show overrides)
create table tour_ros_blocks (
  id uuid primary key default gen_random_uuid(),
  tour_show_id uuid not null references tour_shows(id) on delete cascade,
  block_id text not null,
  label text not null,
  duration int not null default 0,
  phase text not null,
  block_type text,
  color text,
  roles text[] default '{}',
  note text,
  is_anchor boolean default false,
  anchor_key text,
  offset_ref text,
  offset_min int,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Advance checklist + contacts + notes
create table tour_advances (
  id uuid primary key default gen_random_uuid(),
  tour_show_id uuid not null references tour_shows(id) on delete cascade,
  checks jsonb default '{}',
  contacts jsonb default '[]',
  notes text,
  updated_at timestamptz default now(),
  unique(tour_show_id)
);

-- Bus schedule legs
create table tour_bus_legs (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  date date not null,
  leg_type text not null default 'travel',
  from_city text,
  to_city text,
  from_country char(2),
  to_country char(2),
  km int default 0,
  drive_min int default 0,
  depart text,
  arrive text,
  note text,
  week int,
  sort_order int not null default 0
);

-- Mission items
create table tour_mission_items (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  subject text not null,
  context text,
  action text,
  urgency text not null default 'medium',
  intent text,
  owner text not null default 'DAVON',
  from_name text,
  thread_link text,
  deadline date,
  show_date date,
  status text not null default 'open',
  source text default 'manual',
  resolved_at timestamptz,
  created_at timestamptz default now()
);

-- Mission next steps
create table tour_next_steps (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  text text not null,
  done boolean default false,
  created_at timestamptz default now()
);

-- RLS policies (apply to all tour tables)
-- Pattern: user must belong to the org that owns the tour
alter table tours enable row level security;
alter table tour_shows enable row level security;
alter table tour_crew enable row level security;
alter table tour_crew_assignments enable row level security;
alter table tour_flight_legs enable row level security;
alter table tour_ros_blocks enable row level security;
alter table tour_advances enable row level security;
alter table tour_bus_legs enable row level security;
alter table tour_mission_items enable row level security;
alter table tour_next_steps enable row level security;

-- RLS policy template (repeat for each table):
create policy "tour_org_access" on tours
  for all using (organization_id in (select get_user_org_ids()));
-- ... replicate for all tables, joining through tours for org_id
```

#### Seed script: `supabase/seed/tour-bbno.sql`
- Insert bbno$ tour, 24 shows, 23 crew members, bus schedule
- Translate artifact constants to SQL inserts
- Map dates/IDs properly

#### Validation:
- `supabase db reset` succeeds
- `supabase db diff` shows clean schema
- Seed data queryable via Supabase dashboard

---

### Day 3 (Apr 13, Sun): tRPC Router + Data Layer

**Goal:** Complete API layer for the tour module.

#### Deliverables:

**`src/modules/tours/mgmt/router.ts`**
```typescript
export const tourRouter = createTRPCRouter({
  // Tour CRUD
  getTour: publicProcedure.query(...)
  listShows: publicProcedure.input(z.object({ tourId: z.string() })).query(...)
  getShow: publicProcedure.input(z.object({ showId: z.string() })).query(...)
  updateShow: publicProcedure.input(updateShowSchema).mutation(...)

  // ROS
  getRosBlocks: ...,
  upsertRosBlocks: ...,
  resetRos: ...,

  // Crew
  listCrew: ...,
  upsertCrewMember: ...,
  deleteCrew: ...,
  getShowCrew: ...,
  upsertCrewAssignment: ...,

  // Flight legs
  getFlightLegs: ...,
  upsertFlightLeg: ...,
  deleteFlightLeg: ...,

  // Advance
  getAdvance: ...,
  updateAdvanceChecks: ...,
  upsertAdvanceContact: ...,
  deleteAdvanceContact: ...,
  updateAdvanceNotes: ...,

  // Bus
  getBusSchedule: ...,

  // Mission
  listMissionItems: ...,
  upsertMissionItem: ...,
  resolveMissionItem: ...,
  deleteMissionItem: ...,
  listNextSteps: ...,
  upsertNextStep: ...,
  toggleNextStep: ...,

  // Computed
  getDashboardStats: ...,  // aggregation query
  getGaps: ...,            // calls gap-detection service
  getRosTimeline: ...,     // calls ros-engine service
  getHosCompliance: ...,   // calls hos-compliance service
});
```

#### Validation:
- All endpoints typecheck
- Can call from tRPC playground
- Supabase queries return seeded data

---

## SPRINT 2: PLATFORM UI (Apr 14-16)

### Day 4 (Apr 14, Mon): Tour Dashboard + Show Picker

**Goal:** Landing page for tour module with show navigation.

#### Route: `(dashboard)/tours/[tourId]/page.tsx`

**Components:**
- `tour-dashboard.tsx` — hero next show, stats strip, gaps panel, mission summary, upcoming shows (port from artifact Dash component, rewrite with Tailwind/shadcn)
- `show-picker.tsx` — horizontal show strip grouped by region (reusable across all sub-pages)
- `tour-layout.tsx` — layout with sub-nav (Dashboard, Schedule, Crew, Advance, Transport, Mission Control, Settings)

**Design system alignment:**
- DOS brand colors: Primary `#0D3B66`, Accent `#F4D35E`, Warm `#EE964B`
- shadcn Card, Badge, Button, Tabs components
- JetBrains Mono for data, system font for UI (not Outfit, that was artifact-only)

#### Validation:
- Page renders with seeded data
- Show picker navigates between shows
- Stats pull from tRPC endpoints

---

### Day 5 (Apr 15, Tue): ROS Scheduler + Crew/Travel

**Goal:** Core show day pages.

#### Route: `(dashboard)/tours/[tourId]/shows/[showId]/schedule/page.tsx`

**Components:**
- `ros-scheduler.tsx` — timeline view with anchors, phases, drag-reorder, duration edit, confirm toggles. Port UX from artifact, rewrite with Tailwind. Use `ros-engine.ts` service for calculations.
- `block-editor.tsx` — edit panel (label, note, duration, phase, anchor, delete)
- `anchor-summary.tsx` — bottom bar with key times

#### Route: `(dashboard)/tours/[tourId]/shows/[showId]/crew/page.tsx`

**Components:**
- `crew-roster.tsx` — attending toggle, split IN/OUT mode selectors
- `flight-panel.tsx` — expandable flight leg management per crew
- `roster-editor.tsx` — add/remove/edit crew members

#### Validation:
- ROS renders with correct times from engine
- Crew assignments persist to Supabase
- Flight legs CRUD works

---

### Day 6 (Apr 16, Wed): Advance + Mission Control + Transport

*This is Red Rocks day. Use the artifact for day-of ops. Build platform pages in downtime.*

#### Route: `(dashboard)/tours/[tourId]/shows/[showId]/advance/page.tsx`

**Components:**
- `advance-checklist.tsx` — 20-item toggle grid with progress bar
- `advance-contacts.tsx` — CRUD contact cards
- `advance-notes.tsx` — textarea

#### Route: `(dashboard)/tours/[tourId]/mission/page.tsx`

**Components:**
- `mission-control.tsx` — sections A through G, item rows, gap detection
- `add-item-form.tsx` — full CRUD form
- `next-steps.tsx` — numbered list with done/undo

#### Route: `(dashboard)/tours/[tourId]/transport/page.tsx`

**Components:**
- `bus-schedule.tsx` — week view, day rows, HOS compliance strip
- `hos-widget.tsx` — weekly drive hours vs limits

#### Validation:
- All pages render with Supabase data
- CRUD operations persist
- Mission gaps auto-detect from show data

---

## SPRINT 3: BRIDGE (Apr 17)

### Day 7 (Apr 17, Thu): Data Migration + Integration Test

**Goal:** Real data in platform, end-to-end validation.

#### Tasks:

**1. Artifact data export → Supabase import**
- Use Settings tab "Export JSON" from artifact
- Write a migration script that maps artifact JSON to Supabase inserts
- Handle ID translation (date strings → UUIDs)
- Validate all 24 shows, 23 crew, advance states, ROS overrides, mission items

**2. Gmail sync endpoint**
- `src/app/api/gmail-sync/route.ts` — server-side endpoint
- Takes Gmail OAuth token from Supabase auth
- Runs the same classification logic from `mission-scoring.ts`
- Writes directly to `tour_mission_items` table
- Replaces the chat-driven seed approach

**3. Settings page**
- `(dashboard)/tours/[tourId]/settings/page.tsx`
- Export/import JSON
- Reset with confirmation
- v5 migration tracker
- Storage/schema info

**4. Integration validation checklist:**
- [ ] All 24 shows render in show picker
- [ ] ROS times match artifact exactly for Red Rocks custom ROS
- [ ] Crew assignments persist across page reloads
- [ ] Split inbound/outbound modes work
- [ ] Flight legs CRUD
- [ ] Advance checklist toggles persist
- [ ] Advance contacts CRUD
- [ ] Bus schedule weeks render with correct HOS
- [ ] Mission items display in correct sections (A-G)
- [ ] Gap detection finds same gaps as artifact
- [ ] Dashboard stats match artifact dashboard
- [ ] Export produces valid JSON
- [ ] Import restores state

---

## FILE STRUCTURE (Final)

```
src/modules/tours/mgmt/
├── router.ts                    # tRPC endpoints (35-40 procedures)
├── schema.ts                    # Zod schemas for all entities
├── services/
│   ├── ros-engine.ts            # ROS time calculations
│   ├── hos-compliance.ts        # EC 561/2006 checker
│   ├── mission-scoring.ts       # Urgency, gaps, intent, owner routing
│   └── data-export.ts           # Export/import utilities
└── components/
    ├── tour-dashboard.tsx
    ├── show-picker.tsx
    ├── ros-scheduler.tsx
    ├── block-editor.tsx
    ├── anchor-summary.tsx
    ├── crew-roster.tsx
    ├── flight-panel.tsx
    ├── roster-editor.tsx
    ├── advance-checklist.tsx
    ├── advance-contacts.tsx
    ├── advance-notes.tsx
    ├── mission-control.tsx
    ├── add-item-form.tsx
    ├── next-steps.tsx
    ├── bus-schedule.tsx
    ├── hos-widget.tsx
    └── tour-settings.tsx

src/app/(dashboard)/tours/
├── [tourId]/
│   ├── page.tsx                 # Tour dashboard
│   ├── layout.tsx               # Tour layout with sub-nav
│   ├── mission/page.tsx
│   ├── transport/page.tsx
│   ├── settings/page.tsx
│   └── shows/[showId]/
│       ├── schedule/page.tsx
│       ├── crew/page.tsx
│       └── advance/page.tsx

supabase/migrations/
├── 001_tour_module.sql          # Schema
└── 002_tour_seed_bbno.sql       # Seed data
```

---

## WHAT STAYS IN THE ARTIFACT

The v6.8 artifact remains the operational tool through Red Rocks (Apr 16). It's your day-of reference. After the platform has parity (target: Apr 17 end of day), the artifact becomes archive.

**Do not add more features to the artifact.** Every new feature goes directly into the platform.

---

## RISK REGISTER

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| v2 scaffold doesn't compile clean | Medium | Blocks day 2+ | Day 1 morning: `npm install`, `tsc`, fix any issues before extraction |
| Supabase free tier limits | Low | Slows queries | 11 tables is well within free tier. Monitor row counts. |
| ROS time engine has edge cases in TS | Medium | Wrong show times | Unit test against artifact output for all 24 shows |
| Red Rocks day (Apr 16) consumes all time | High | Day 6 is lost | Accept it. Day 6 deliverables shift to day 7. Sprint becomes 8 days if needed. |
| Tailwind/shadcn UI takes longer than inline styles | Medium | UI incomplete by day 7 | Prioritize function over polish. Unstyled but working > pretty but broken. |

---

## SUCCESS CRITERIA (Apr 17 EOD)

1. `npm run build` succeeds with zero errors
2. Tour dashboard renders 24 shows from Supabase
3. ROS scheduler produces identical times to artifact for every show
4. Crew/travel CRUD works end-to-end
5. Advance checklist persists per show
6. Mission Control displays classified items
7. Bus schedule renders with HOS compliance
8. Export/import round-trips cleanly
9. The artifact is no longer needed for daily ops

---

*Day of Show, LLC | d.johnson@dayofshow.net | April 10, 2026*
