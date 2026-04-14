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
    or team_id = 'dos-bbno-eu-2026'
  );

create policy "insert own or team"
  on app_storage for insert
  with check (
    auth.uid() = user_id
    and (team_id is null or team_id = 'dos-bbno-eu-2026')
  );

create policy "update own or team"
  on app_storage for update
  using (
    (team_id is null and auth.uid() = user_id)
    or team_id = 'dos-bbno-eu-2026'
  )
  with check (
    (team_id is null and auth.uid() = user_id)
    or team_id = 'dos-bbno-eu-2026'
  );

create policy "delete own or team"
  on app_storage for delete
  using (
    (team_id is null and auth.uid() = user_id)
    or team_id = 'dos-bbno-eu-2026'
  );

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
