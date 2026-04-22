-- Create audit_log table + indexes + RLS. Append-only.
-- Run AFTER 20260422-tour-scope.sql (references team_id = 'dos-bbno-2026').

create table if not exists audit_log (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        references auth.users on delete set null,
  user_email    text,
  team_id       text,
  entity_type   text        not null,
  entity_id     text        not null,
  action        text        not null,
  before_value  jsonb,
  after_value   jsonb,
  metadata      jsonb,
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

-- Sanity check.
select count(*) as rows from audit_log;
