-- ── DOS Tour Ops — Supabase schema ──────────────────────────────────────────
-- Run this entire file in the Supabase SQL editor once during setup.

-- Key-value storage table (mirrors window.storage from the Claude artifact)
create table if not exists app_storage (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users on delete cascade not null,
  key         text        not null,
  value       text        not null,
  updated_at  timestamptz default now(),
  -- One row per user per key
  unique (user_id, key)
);

-- Auto-update updated_at on upsert
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger app_storage_updated_at
  before update on app_storage
  for each row execute procedure set_updated_at();

-- Row-level security: users can only see/write their own rows
alter table app_storage enable row level security;

create policy "Users access own storage"
  on app_storage for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fast key lookups
create index if not exists app_storage_user_key on app_storage (user_id, key);
