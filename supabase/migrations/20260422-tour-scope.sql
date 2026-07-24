-- Rescope team_id from leg-level (dos-bbno-eu-2026) to tour-level (dos-bbno-2026).
-- Run ONCE in Supabase SQL editor BEFORE re-running schema.sql and BEFORE deploying code.
-- Run order: (1) this migration, (2) schema.sql, (3) Vercel deploy.

-- Preflight: count rows that will be touched.
-- Expected: every pre-existing shared row for this tour.
select count(*) as rows_to_update from app_storage where team_id = 'dos-bbno-eu-2026';

-- Migration.
update app_storage set team_id = 'dos-bbno-2026' where team_id = 'dos-bbno-eu-2026';

-- Verification: new count should equal preflight count; old count should be zero.
select count(*) as new_rows from app_storage where team_id = 'dos-bbno-2026';
select count(*) as stale_rows from app_storage where team_id = 'dos-bbno-eu-2026';
