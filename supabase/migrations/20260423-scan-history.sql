-- Scan history + per-thread memory for Gmail scanners (flights, intel, lodging).
-- Run AFTER 20260422-audit-log.sql.
--
-- Two tables:
--   scan_runs         — one row per scanner invocation (cost, timing, stop_reasons)
--   scan_thread_cache — one row per (scanner, thread_id) to skip re-parse when unchanged
--
-- Writes are service-role only (Vercel serverless). Reads allowed to team members.

create table if not exists scan_runs (
  id                  uuid        default gen_random_uuid() primary key,
  scanner             text        not null,        -- 'flights' | 'intel' | 'lodging'
  user_id             uuid        references auth.users on delete set null,
  team_id             text,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  duration_ms         integer,
  threads_found       integer     default 0,
  threads_cached      integer     default 0,
  threads_parsed      integer     default 0,
  attachments_scanned integer     default 0,
  input_tokens        integer     default 0,
  output_tokens       integer     default 0,
  cost_cents          integer     default 0,
  stop_reasons        jsonb       default '{}'::jsonb,
  errors              jsonb       default '[]'::jsonb,
  params              jsonb       default '{}'::jsonb,
  created_at          timestamptz default now()
);

create table if not exists scan_thread_cache (
  scanner                  text        not null,
  thread_id                text        not null,
  team_id                  text,
  last_msg_ms              bigint,
  body_hash                text,
  parsed_at                timestamptz not null default now(),
  result                   jsonb,
  stop_reason              text,
  footer_strip_saved_chars integer,
  attachment_fingerprints  jsonb       default '[]'::jsonb,
  primary key (scanner, thread_id)
);

create index if not exists scan_runs_scanner_time_idx
  on scan_runs (scanner, started_at desc);
create index if not exists scan_runs_team_time_idx
  on scan_runs (team_id, started_at desc) where team_id is not null;
create index if not exists scan_thread_cache_team_idx
  on scan_thread_cache (team_id, parsed_at desc) where team_id is not null;

alter table scan_runs         enable row level security;
alter table scan_thread_cache enable row level security;

drop policy if exists "read scan_runs" on scan_runs;
drop policy if exists "read scan_thread_cache" on scan_thread_cache;

create policy "read scan_runs"
  on scan_runs for select
  using (team_id = 'dos-bbno-2026' or user_id = auth.uid());

create policy "read scan_thread_cache"
  on scan_thread_cache for select
  using (team_id = 'dos-bbno-2026');

-- Sanity check.
select count(*) as scan_runs from scan_runs;
select count(*) as thread_cache from scan_thread_cache;
