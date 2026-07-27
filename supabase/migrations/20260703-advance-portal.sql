-- Venue/promoter advance portal: external, per-show, magic-link-gated access
-- to the advance checklist.
-- Run ONCE in the Supabase SQL editor. Idempotent.
-- Run order: (1) this migration, (2) enable "Email OTP" provider in the
-- Supabase Auth dashboard, (3) deploy code.
--
-- IMPORTANT — verify before enabling Email OTP in production:
-- is_oauth_session() below assumes a Google OAuth session's JWT amr claim
-- has a method literal of 'oauth', distinguishing it from an OTP/magic-link
-- session. Sign in once via each flow in this project and inspect a live
-- `select auth.jwt()` result (or the decoded JWT) to confirm the literal
-- before relying on this in production. If it differs, update the literal
-- below before enabling Email OTP, since every clause that gates on this
-- function stops working the moment OTP sessions exist.

-- ── 0. Close the OTP-widens-RLS-trust hole ──────────────────────────────────
-- Today the only way to get a valid Supabase session at all is Google OAuth,
-- restricted to manually-approved test users (see SETUP.md). Every existing
-- team_id-only policy below is implicitly safe only because of that. The
-- moment Email OTP is enabled for the portal, any email address can self-issue
-- a valid session, and these same policies would let a stranger read/write the
-- entire shared blob, forge audit_log rows, or touch every receipt file.
-- Gating on is_oauth_session() closes that without touching the internal
-- cockpit, which only ever authenticates via OAuth anyway.
create or replace function is_oauth_session()
returns boolean language sql stable as $$
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) e
    where e->>'method' = 'oauth'
  );
$$;

drop policy if exists "read own or team" on app_storage;
drop policy if exists "insert own or team" on app_storage;
drop policy if exists "update own or team" on app_storage;
drop policy if exists "delete own or team" on app_storage;

create policy "read own or team"
  on app_storage for select
  using (
    (team_id is null and auth.uid() = user_id)
    or (team_id = 'dos-bbno-2026' and is_oauth_session())
  );

create policy "insert own or team"
  on app_storage for insert
  with check (
    auth.uid() = user_id
    and (team_id is null or (team_id = 'dos-bbno-2026' and is_oauth_session()))
  );

create policy "update own or team"
  on app_storage for update
  using (
    (team_id is null and auth.uid() = user_id)
    or (team_id = 'dos-bbno-2026' and is_oauth_session())
  )
  with check (
    (team_id is null and auth.uid() = user_id)
    or (team_id = 'dos-bbno-2026' and is_oauth_session())
  );

create policy "delete own or team"
  on app_storage for delete
  using (
    (team_id is null and auth.uid() = user_id)
    or (team_id = 'dos-bbno-2026' and is_oauth_session())
  );

drop policy if exists "insert own audit" on audit_log;
create policy "insert own audit"
  on audit_log for insert
  with check (auth.uid() = user_id and is_oauth_session());
-- Portal writes never use this path. portal_update_advance_item() is
-- SECURITY DEFINER, bypasses this policy, and inserts its own audit row
-- tagged actor: 'portal'.

drop policy if exists "read team comments" on feature_comments;
drop policy if exists "insert own comment" on feature_comments;
create policy "read team comments"
  on feature_comments for select
  using (team_id = 'dos-bbno-2026' and is_oauth_session());
create policy "insert own comment"
  on feature_comments for insert
  with check (auth.uid() = user_id and team_id = 'dos-bbno-2026' and is_oauth_session());
-- "update status team" policy is unchanged (feature status updates stay
-- internal-only via the existing policy, untouched here).

drop policy if exists "team read receipts" on storage.objects;
drop policy if exists "team write receipts" on storage.objects;
create policy "team read receipts"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'receipts' and is_oauth_session());
create policy "team write receipts"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'receipts' and is_oauth_session());

-- ── 1. Catalog mirror: server-trusted source for write authorization ────────
-- Mirrors AT[].{id,dept,dir} from src/lib/domain-constants.js. The write RPC
-- below must independently verify an item's `dir` rather than trust a
-- client-supplied flag, so it checks this table instead of the client's copy
-- of the catalog. Custom items don't need a mirror row: their `dir` is
-- durably stored in the advance blob's own customItems array by an internal
-- (OAuth) session already, so the write RPC reads it from there directly.
--
-- MAINTENANCE: keep this in sync with AT when the catalog changes. Drift is
-- safe-by-default: an id missing here fails the write closed, it never opens
-- one up.
create table if not exists advance_catalog_items (
  id   text primary key,
  dept text not null,
  dir  text not null check (dir in ('we_provide', 'they_provide', 'bilateral'))
);

insert into advance_catalog_items (id, dept, dir) values
  ('at1','artist_team','we_provide'),('at2','artist_team','we_provide'),
  ('at3','artist_team','we_provide'),('at4','artist_team','we_provide'),
  ('at5','artist_team','we_provide'),('at6','artist_team','we_provide'),
  ('vn1','venue','they_provide'),('vn2','venue','they_provide'),
  ('vn3','venue','they_provide'),('vn4','venue','they_provide'),
  ('vn5','venue','they_provide'),('vn6','venue','they_provide'),
  ('vn7','venue','they_provide'),('vn8','venue','they_provide'),
  ('ar1','ar_hospo','bilateral'),('ar2','ar_hospo','bilateral'),
  ('ar3','ar_hospo','bilateral'),('ar4','ar_hospo','bilateral'),
  ('ar5','ar_hospo','they_provide'),('ar6','ar_hospo','they_provide'),
  ('ar7','ar_hospo','bilateral'),
  ('tr1','transport','bilateral'),('tr2','transport','they_provide'),
  ('tr3','transport','they_provide'),('tr4','transport','they_provide'),
  ('tr5','transport','bilateral'),('tr6','transport','we_provide'),
  ('tr7','transport','bilateral'),
  ('pr1','production','they_provide'),('pr2','production','they_provide'),
  ('pr3','production','they_provide'),('pr4','production','they_provide'),
  ('pr5','production','they_provide'),('pr6','production','bilateral'),
  ('pr7','production','bilateral'),
  ('vd1','vendors','bilateral'),('vd2','vendors','bilateral'),
  ('vd3','vendors','we_provide'),('vd4','vendors','bilateral'),
  ('vd5','vendors','bilateral'),
  ('so1','site_ops','bilateral'),('so2','site_ops','they_provide'),
  ('so3','site_ops','they_provide'),('so4','site_ops','they_provide'),
  ('so5','site_ops','bilateral'),
  ('qm1','quartermaster','we_provide'),('qm2','quartermaster','bilateral'),
  ('qm3','quartermaster','bilateral'),('qm4','quartermaster','bilateral')
on conflict (id) do update set dept = excluded.dept, dir = excluded.dir;

alter table advance_catalog_items enable row level security;
-- No policies: default-deny direct client access. Read only from inside the
-- SECURITY DEFINER functions below, which bypass RLS as the function owner.

-- ── 2. Grants: one row = one email granted access to one show ──────────────
-- show_key is the literal storage `eventKey` (usually a bare date like
-- '2026-08-15', or '<date>#<partyId>' for a split-day party), NOT
-- showIdFor()'s '${venue}__${date}' (that's a different key, used only for
-- Gmail-thread matching). client_id disambiguates: eventKey/date is not
-- globally unique across clients (two real shows share 2026-08-07 today,
-- already flagged in their own show notes as a known double-booking), so a
-- grant needs both to identify one show unambiguously at creation time.
create table if not exists advance_portal_grants (
  id               uuid        default gen_random_uuid() primary key,
  show_key         text        not null,
  client_id        text        not null,
  venue_label      text,
  granted_email    text        not null,
  granted_by       uuid        references auth.users on delete set null,
  granted_by_email text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  expires_at       timestamptz,
  revoked_at       timestamptz,
  revoked_by       uuid        references auth.users on delete set null
);

create unique index if not exists advance_portal_grants_uniq
  on advance_portal_grants (show_key, client_id, lower(granted_email));
create index if not exists advance_portal_grants_active_email_idx
  on advance_portal_grants (lower(granted_email)) where revoked_at is null;
create index if not exists advance_portal_grants_show_idx
  on advance_portal_grants (show_key, client_id);

drop trigger if exists advance_portal_grants_updated_at on advance_portal_grants;
create trigger advance_portal_grants_updated_at
  before update on advance_portal_grants
  for each row execute procedure set_updated_at();

alter table advance_portal_grants enable row level security;
-- No policies: default-deny for both OAuth and portal sessions. Every access
-- path, internal grant/revoke and portal reads alike, goes through the
-- SECURITY DEFINER functions below. That is where authorization actually
-- lives; adding permissive RLS on top would only be redundant surface area
-- to get wrong.

-- ── 3. Internal grant admin (any OAuth team member) ─────────────────────────
create or replace function advance_portal_admin_grant(
  p_show_key text, p_client_id text, p_venue_label text, p_email text
) returns advance_portal_grants
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_row advance_portal_grants;
begin
  if not is_oauth_session() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email';
  end if;

  insert into advance_portal_grants (show_key, client_id, venue_label, granted_email, granted_by, granted_by_email)
  values (p_show_key, p_client_id, p_venue_label, v_email, auth.uid(), auth.email())
  on conflict (show_key, client_id, lower(granted_email)) do update set
    revoked_at = null, revoked_by = null,
    venue_label = excluded.venue_label,
    granted_by = excluded.granted_by, granted_by_email = excluded.granted_by_email
  returning * into v_row;

  insert into audit_log (user_id, user_email, team_id, entity_type, entity_id, action, after_value, metadata)
  values (auth.uid(), auth.email(), 'dos-bbno-2026', 'advance_portal_grant',
          p_show_key || ':' || p_client_id || ':' || v_email, 'grant',
          to_jsonb(v_row), jsonb_build_object('actor', 'internal'));
  return v_row;
end;
$$;

create or replace function advance_portal_admin_revoke(
  p_show_key text, p_client_id text, p_email text
) returns advance_portal_grants
language plpgsql security definer set search_path = public as $$
declare v_row advance_portal_grants;
begin
  if not is_oauth_session() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update advance_portal_grants set revoked_at = now(), revoked_by = auth.uid()
  where show_key = p_show_key and client_id = p_client_id and lower(granted_email) = lower(trim(p_email))
  returning * into v_row;
  if v_row.id is null then
    raise exception 'grant not found';
  end if;

  insert into audit_log (user_id, user_email, team_id, entity_type, entity_id, action, before_value, metadata)
  values (auth.uid(), auth.email(), 'dos-bbno-2026', 'advance_portal_grant',
          p_show_key || ':' || p_client_id || ':' || lower(trim(p_email)), 'revoke',
          to_jsonb(v_row), jsonb_build_object('actor', 'internal'));
  return v_row;
end;
$$;

create or replace function advance_portal_admin_list_grants(p_show_key text, p_client_id text)
returns setof advance_portal_grants
language plpgsql security definer set search_path = public stable as $$
begin
  if not is_oauth_session() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query select * from advance_portal_grants
    where show_key = p_show_key and client_id = p_client_id
    order by created_at desc;
end;
$$;

-- ── 4. Portal-facing functions (any authenticated session) ─────────────────
-- auth.email()/auth.uid() are read from the server-verified JWT claims
-- PostgREST injects before the function body runs; a caller cannot forge
-- these without a validly-signed Supabase Auth session. They are never taken
-- as a client-supplied parameter.
create or replace function has_active_portal_grant(p_show_key text, p_client_id text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from advance_portal_grants
    where show_key = p_show_key and client_id = p_client_id
      and lower(granted_email) = lower(auth.email())
      and revoked_at is null and (expires_at is null or expires_at > now())
  );
$$;

create or replace function portal_list_my_grants()
returns table (show_key text, client_id text, venue_label text, expires_at timestamptz)
language sql security definer set search_path = public stable as $$
  select show_key, client_id, venue_label, expires_at
  from advance_portal_grants
  where lower(granted_email) = lower(auth.email())
    and revoked_at is null and (expires_at is null or expires_at > now());
$$;

create or replace function portal_get_advance(p_show_key text, p_client_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_blob jsonb; v_show jsonb;
begin
  if auth.email() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not has_active_portal_grant(p_show_key, p_client_id) then
    raise exception 'no active grant for this show' using errcode = '42501';
  end if;

  select value::jsonb into v_blob from app_storage
  where team_id = 'dos-bbno-2026' and key = 'dos-v7-advances';
  v_show := coalesce(v_blob -> p_show_key, '{}'::jsonb);

  -- Explicit allow-list: notes/threadLink/itemDependents are internal working
  -- notes, Gmail links, and crew-assignment tags, never surfaced to a portal
  -- user.
  return jsonb_build_object(
    'items',         coalesce(v_show -> 'items', '{}'::jsonb),
    'customItems',   coalesce(v_show -> 'customItems', '[]'::jsonb),
    'itemOverrides', coalesce(v_show -> 'itemOverrides', '{}'::jsonb)
  );
end;
$$;

create or replace function portal_update_advance_item(
  p_show_key text, p_client_id text, p_item_id text, p_status text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_blob jsonb; v_show jsonb; v_items jsonb; v_custom jsonb;
  v_dir text; v_prev jsonb; v_new_item jsonb; v_confirmed_meta jsonb;
begin
  if auth.email() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not has_active_portal_grant(p_show_key, p_client_id) then
    raise exception 'no active grant for this show' using errcode = '42501';
  end if;
  if p_status not in ('pending','sent','received','in_progress','respond','follow_up','escalate','confirmed','na') then
    raise exception 'invalid status: %', p_status;
  end if;

  select value::jsonb into v_blob from app_storage
  where team_id = 'dos-bbno-2026' and key = 'dos-v7-advances'
  for update; -- serialize concurrent writes against this single shared-blob row
  if v_blob is null then
    raise exception 'no advance data found';
  end if;

  v_show   := coalesce(v_blob -> p_show_key, '{}'::jsonb);
  v_items  := coalesce(v_show -> 'items', '{}'::jsonb);
  v_custom := coalesce(v_show -> 'customItems', '[]'::jsonb);

  select dir into v_dir from advance_catalog_items where id = p_item_id;
  if v_dir is null then
    select c->>'dir' into v_dir from jsonb_array_elements(v_custom) c where c->>'id' = p_item_id;
  end if;
  if v_dir is null then
    raise exception 'unknown item id: %', p_item_id using errcode = '42704';
  end if;
  if v_dir not in ('they_provide', 'bilateral') then
    raise exception 'item is read-only for portal users' using errcode = '42501';
  end if;

  v_prev := coalesce(v_items -> p_item_id, '{}'::jsonb);
  v_confirmed_meta := case when p_status = 'confirmed'
    then jsonb_build_object('confirmedBy', auth.email(), 'confirmedAt', to_jsonb(now()))
    else jsonb_build_object('confirmedBy', null, 'confirmedAt', null) end;
  v_new_item := v_prev || jsonb_build_object('status', p_status) || v_confirmed_meta;

  v_blob := jsonb_set(v_blob, array[p_show_key, 'items', p_item_id], v_new_item, true);
  update app_storage set value = v_blob::text
  where team_id = 'dos-bbno-2026' and key = 'dos-v7-advances';

  insert into audit_log (user_id, user_email, team_id, entity_type, entity_id, action, before_value, after_value, metadata)
  values (auth.uid(), auth.email(), 'dos-bbno-2026', 'advance', p_show_key || ':' || p_item_id, 'status_change',
          jsonb_build_object('status', v_prev->>'status'), jsonb_build_object('status', p_status),
          jsonb_build_object('actor', 'portal', 'portalEmail', auth.email(), 'clientId', p_client_id, 'showKey', p_show_key));
  return v_new_item;
end;
$$;

revoke execute on function portal_get_advance(text, text) from anon;
grant  execute on function portal_get_advance(text, text) to authenticated;
revoke execute on function portal_update_advance_item(text, text, text, text) from anon;
grant  execute on function portal_update_advance_item(text, text, text, text) to authenticated;
revoke execute on function portal_list_my_grants() from anon;
grant  execute on function portal_list_my_grants() to authenticated;
revoke execute on function advance_portal_admin_grant(text, text, text, text) from anon;
grant  execute on function advance_portal_admin_grant(text, text, text, text) to authenticated;
revoke execute on function advance_portal_admin_revoke(text, text, text) from anon;
grant  execute on function advance_portal_admin_revoke(text, text, text) to authenticated;
revoke execute on function advance_portal_admin_list_grants(text, text) from anon;
grant  execute on function advance_portal_admin_list_grants(text, text) to authenticated;
