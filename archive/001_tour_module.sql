-- DOS Tour Module — Supabase Migration
-- Day 2 deliverable. EC 561/2006 compliant schema.
-- All times stored as minutes from midnight (int).

-- ──────────────────────────────────────────────
-- Tours (parent entity, one per tour cycle)
-- ──────────────────────────────────────────────
create table tours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  artist text not null,
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ──────────────────────────────────────────────
-- Tour Shows (per-date, optional event link)
-- ──────────────────────────────────────────────
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
  -- Anchor times in minutes from midnight
  doors int not null default 1140,         -- 7:00p
  curfew int not null default 1380,        -- 11:00p
  bus_arrive int not null default 540,     -- 9:00a
  crew_call int not null default 630,      -- 10:30a
  venue_access int not null default 540,
  mg_time int not null default 990,        -- 4:30p
  -- Confirmed flags
  doors_confirmed boolean default false,
  curfew_confirmed boolean default false,
  bus_arrive_confirmed boolean default false,
  crew_call_confirmed boolean default false,
  venue_access_confirmed boolean default false,
  mg_confirmed boolean default false,
  -- Meta
  deal text,
  notes text,
  advance_status text default 'not_started',
  eta_source text default 'schedule',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tour_id, date)
);

-- ──────────────────────────────────────────────
-- Crew Members (global roster per org)
-- ──────────────────────────────────────────────
create table tour_crew (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  role text not null,
  email text,
  phone text,
  created_at timestamptz default now()
);

-- ──────────────────────────────────────────────
-- Per-show crew assignments (split in/out modes)
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- Flight legs (separate table, one per direction)
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- ROS blocks (per-show overrides; rows not JSON array)
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- Advance checklist + contacts + notes
-- ──────────────────────────────────────────────
create table tour_advances (
  id uuid primary key default gen_random_uuid(),
  tour_show_id uuid not null references tour_shows(id) on delete cascade,
  checks jsonb default '{}',
  contacts jsonb default '[]',
  notes text,
  updated_at timestamptz default now(),
  unique(tour_show_id)
);

-- ──────────────────────────────────────────────
-- Bus schedule legs
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- Mission items (Gmail-synced + manual)
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- Mission next steps
-- ──────────────────────────────────────────────
create table tour_next_steps (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  text text not null,
  done boolean default false,
  created_at timestamptz default now()
);

-- ──────────────────────────────────────────────
-- RLS (enable on all tables)
-- ──────────────────────────────────────────────
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

-- RLS policies: org-scoped access via get_user_org_ids()
create policy "tour_org_access" on tours
  for all using (organization_id in (select get_user_org_ids()));

create policy "tour_shows_org_access" on tour_shows
  for all using (organization_id in (select get_user_org_ids()));

create policy "tour_crew_org_access" on tour_crew
  for all using (organization_id in (select get_user_org_ids()));

create policy "tour_crew_assignments_org_access" on tour_crew_assignments
  for all using (
    tour_show_id in (
      select id from tour_shows
      where organization_id in (select get_user_org_ids())
    )
  );

create policy "tour_flight_legs_org_access" on tour_flight_legs
  for all using (
    assignment_id in (
      select tca.id from tour_crew_assignments tca
      join tour_shows ts on tca.tour_show_id = ts.id
      where ts.organization_id in (select get_user_org_ids())
    )
  );

create policy "tour_ros_blocks_org_access" on tour_ros_blocks
  for all using (
    tour_show_id in (
      select id from tour_shows
      where organization_id in (select get_user_org_ids())
    )
  );

create policy "tour_advances_org_access" on tour_advances
  for all using (
    tour_show_id in (
      select id from tour_shows
      where organization_id in (select get_user_org_ids())
    )
  );

create policy "tour_bus_legs_org_access" on tour_bus_legs
  for all using (
    tour_id in (
      select id from tours
      where organization_id in (select get_user_org_ids())
    )
  );

create policy "tour_mission_items_org_access" on tour_mission_items
  for all using (organization_id in (select get_user_org_ids()));

create policy "tour_next_steps_org_access" on tour_next_steps
  for all using (
    tour_id in (
      select id from tours
      where organization_id in (select get_user_org_ids())
    )
  );
