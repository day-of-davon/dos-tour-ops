-- ── Receipt storage: private bucket for uploaded/scanned + email receipt files ──
-- Idempotent. Run once in the Supabase SQL editor.
-- Uploads are written server-side with the service key (api/parse-doc.js via
-- api/lib/receiptStore.js), so they bypass Storage RLS. Reads are served as
-- short-lived signed URLs (api/receipt-url.js), also minted with the service key.
-- The policies below additionally permit authenticated team members to read/write
-- directly, in case the client ever uploads without the server hop.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Team members may read receipt objects.
drop policy if exists "team read receipts" on storage.objects;
create policy "team read receipts"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'receipts');

-- Team members may upload receipt objects.
drop policy if exists "team write receipts" on storage.objects;
create policy "team write receipts"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'receipts');
