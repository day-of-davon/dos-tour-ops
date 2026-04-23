-- ── DOS Tour Ops — Supabase schema ──────────────────────────────────────────
-- Run this entire file in the Supabase SQL editor once during setup.
-- Idempotent: safe to re-run.

create table if not exists app_storage (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users on delete cascade not null,
  key         text        not null,
  value       text        not null,
  team_id     text,
  updated_at  timestamptz default now()
);

-- Add team_id on existing deployments
alter table app_storage add column if not exists team_id text;

-- Replace old single unique constraint (if present) with partial unique indexes
alter table app_storage drop constraint if exists app_storage_user_id_key_key;

create unique index if not exists app_storage_private_uniq
  on app_storage (user_id, key) where team_id is null;

create unique index if not exists app_storage_shared_uniq
  on app_storage (team_id, key) where team_id is not null;

create index if not exists app_storage_team_key
  on app_storage (team_id, key) where team_id is not null;

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists app_storage_updated_at on app_storage;
create trigger app_storage_updated_at
  before update on app_storage
  for each row execute procedure set_updated_at();

-- Row-level security
alter table app_storage enable row level security;

drop policy if exists "Users access own storage" on app_storage;
drop policy if exists "read own or team" on app_storage;
drop policy if exists "insert own or team" on app_storage;
drop policy if exists "update own or team" on app_storage;
drop policy if exists "delete own or team" on app_storage;

create policy "read own or team"
  on app_storage for select
  using (
    (team_id is null and auth.uid() = user_id)
    or team_id = 'dos-bbno-2026'
  );

create policy "insert own or team"
  on app_storage for insert
  with check (
    auth.uid() = user_id
    and (team_id is null or team_id = 'dos-bbno-2026')
  );

create policy "update own or team"
  on app_storage for update
  using (
    (team_id is null and auth.uid() = user_id)
    or team_id = 'dos-bbno-2026'
  )
  with check (
    (team_id is null and auth.uid() = user_id)
    or team_id = 'dos-bbno-2026'
  );

create policy "delete own or team"
  on app_storage for delete
  using (
    (team_id is null and auth.uid() = user_id)
    or team_id = 'dos-bbno-2026'
  );

-- ── Atomic upsert — avoids race conditions with partial-index ON CONFLICT ─────
CREATE OR REPLACE FUNCTION upsert_app_storage(
  p_user_id uuid,
  p_team_id text,
  p_key text,
  p_value text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_team_id IS NULL THEN
    INSERT INTO app_storage (user_id, team_id, key, value)
    VALUES (p_user_id, null, p_key, p_value)
    ON CONFLICT (user_id, key) WHERE team_id IS NULL
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  ELSE
    INSERT INTO app_storage (user_id, team_id, key, value)
    VALUES (p_user_id, p_team_id, p_key, p_value)
    ON CONFLICT (team_id, key) WHERE team_id IS NOT NULL
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;
END;
$$;

-- ── Intel cache: user-scoped, optional team sharing ──────────────────────────
-- Migration: drop old single-key table if user_id column is absent
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'intel_cache')
     and not exists (select 1 from information_schema.columns
                     where table_name = 'intel_cache' and column_name = 'user_id')
  then
    drop table intel_cache;
  end if;
end $$;

create table if not exists intel_cache (
  id                  uuid        default gen_random_uuid() primary key,
  user_id             uuid        references auth.users on delete cascade not null,
  show_id             text        not null,
  intel               jsonb       not null,
  gmail_threads_found int         not null default 0,
  cached_at           timestamptz not null default now(),
  is_shared           boolean     not null default false,
  user_email          text,
  unique (user_id, show_id)
);

-- RLS: direct client access sees only own rows; service key bypasses for API use
alter table intel_cache enable row level security;

drop policy if exists "own intel" on intel_cache;
create policy "own intel"
  on intel_cache
  using (auth.uid() = user_id);

-- ── Audit log: append-only history for disputes, status, finance ─────────────
-- Writes only. No client updates or deletes — integrity depends on immutability.
create table if not exists audit_log (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        references auth.users on delete set null,
  user_email    text,
  team_id       text,
  entity_type   text        not null,   -- 'advance' | 'finance' | 'show' | 'flight' | 'lodging' | ...
  entity_id     text        not null,   -- show date, flight id, item id, composite "YYYY-MM-DD:itemId", etc.
  action        text        not null,   -- 'status_change' | 'create' | 'delete' | 'edit' | ...
  before_value  jsonb,
  after_value   jsonb,
  metadata      jsonb,                  -- free-form: { field, source: 'intel-suggest'|'manual', ... }
  created_at    timestamptz not null default now()
);

create index if not exists audit_log_entity_idx
  on audit_log (entity_type, entity_id, created_at desc);
create index if not exists audit_log_team_time_idx
  on audit_log (team_id, created_at desc) where team_id is not null;
create index if not exists audit_log_user_time_idx
  on audit_log (user_id, created_at desc);

alter table audit_log enable row level security;

drop policy if exists "read own or team audit" on audit_log;
drop policy if exists "insert own audit" on audit_log;

create policy "read own or team audit"
  on audit_log for select
  using (
    auth.uid() = user_id
    or team_id = 'dos-bbno-2026'
  );

create policy "insert own audit"
  on audit_log for insert
  with check (auth.uid() = user_id);

-- No update / delete policies: append-only.

-- ── Scan runs: per-invocation metadata for intel/flights/lodging scanners ─────
create table if not exists scan_runs (
  id                  uuid        default gen_random_uuid() primary key,
  scanner             text        not null,   -- 'intel' | 'flights' | 'lodging'
  user_id             uuid        references auth.users on delete cascade not null,
  team_id             text,
  params              jsonb       default '{}',
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  duration_ms         int,
  threads_found       int         default 0,
  threads_cached      int         default 0,
  threads_parsed      int         default 0,
  attachments_scanned int         default 0,
  input_tokens        int         default 0,
  output_tokens       int         default 0,
  cache_read_tokens   int         default 0,
  cache_creation_tokens int       default 0,
  cost_cents          int         default 0,
  stop_reasons        jsonb       default '{}',
  errors              jsonb       default '[]'
);

-- Add cache columns on existing deployments
alter table scan_runs add column if not exists cache_read_tokens   int default 0;
alter table scan_runs add column if not exists cache_creation_tokens int default 0;

create index if not exists scan_runs_user_time_idx
  on scan_runs (user_id, started_at desc);
create index if not exists scan_runs_team_time_idx
  on scan_runs (team_id, started_at desc) where team_id is not null;

alter table scan_runs enable row level security;

drop policy if exists "own scan runs" on scan_runs;
create policy "own scan runs"
  on scan_runs
  using (auth.uid() = user_id);

-- ── Scan thread cache: per-thread memoization keyed by content hash ───────────
create table if not exists scan_thread_cache (
  id                        uuid        default gen_random_uuid() primary key,
  scanner                   text        not null,
  thread_id                 text        not null,
  team_id                   text,
  last_msg_ms               bigint,
  body_hash                 text,
  result                    jsonb,
  stop_reason               text,
  footer_strip_saved_chars  int,
  attachment_fingerprints   jsonb       default '[]',
  parsed_at                 timestamptz not null default now(),
  unique (scanner, thread_id)
);

create index if not exists scan_thread_cache_scanner_idx
  on scan_thread_cache (scanner, thread_id);

alter table scan_thread_cache enable row level security;

-- ── Feature comments: user feedback, bug reports, feature requests ────────────
create table if not exists feature_comments (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id    uuid        references auth.users on delete cascade not null,
  user_email text,
  team_id    text        not null,
  role       text        not null,   -- tm_td | internal | viewer
  tab        text        not null,   -- dash | advance | ros | ...
  section    text,                   -- section label from COMMENT_TARGETS map
  category   text        not null,   -- bug | feature | ux | fix
  body       text        not null,
  status     text        not null default 'open'  -- open | reviewed | planned | done | wontfix
);

create index if not exists feature_comments_team_idx
  on feature_comments (team_id, created_at desc);
create index if not exists feature_comments_user_idx
  on feature_comments (user_id, created_at desc);

alter table feature_comments enable row level security;

drop policy if exists "read team comments" on feature_comments;
drop policy if exists "insert own comment" on feature_comments;
drop policy if exists "update status team" on feature_comments;

create policy "read team comments"
  on feature_comments for select
  using (team_id = 'dos-bbno-2026');

create policy "insert own comment"
  on feature_comments for insert
  with check (auth.uid() = user_id and team_id = 'dos-bbno-2026');

create policy "update status team"
  on feature_comments for update
  using (team_id = 'dos-bbno-2026')
  with check (team_id = 'dos-bbno-2026');
