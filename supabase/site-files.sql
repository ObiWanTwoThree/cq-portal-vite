-- Site files (uploads) + storage policies
-- Run this in Supabase -> SQL Editor.

-- 1) Metadata table for files uploaded per site
create table if not exists public.site_files (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  mime_type text null,
  size_bytes bigint null,
  uploaded_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists site_files_site_id_idx on public.site_files(site_id);
create index if not exists site_files_file_name_idx on public.site_files(file_name);

alter table public.site_files enable row level security;

-- Authenticated users can view files for sites
drop policy if exists "site_files_select_authenticated" on public.site_files;
create policy "site_files_select_authenticated"
on public.site_files
for select
to authenticated
using (true);

-- Admin-only upload (GDPR-safe default)
drop policy if exists "site_files_admin_insert" on public.site_files;
create policy "site_files_admin_insert"
on public.site_files
for insert
to authenticated
with check (public.is_admin());

-- (Optional) Admin can delete/update rows
drop policy if exists "site_files_admin_write" on public.site_files;
drop policy if exists "site_files_admin_update" on public.site_files;
drop policy if exists "site_files_admin_delete" on public.site_files;

create policy "site_files_admin_update"
on public.site_files
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "site_files_admin_delete"
on public.site_files
for delete
to authenticated
using (public.is_admin());

-- 2) Storage policies for bucket `site-documents`
-- IMPORTANT:
-- The `storage.objects` table is managed by Supabase and is not owned by your SQL Editor role.
-- So running storage policy SQL here often fails with:
--   ERROR: 42501: must be owner of table objects
--
-- Create the Storage policies in the Supabase Dashboard instead:
-- Storage -> site-documents -> Policies
-- - SELECT: bucket_id = 'site-documents'                  (role: authenticated)
-- - INSERT: bucket_id = 'site-documents' AND public.is_admin() (role: authenticated)
-- - DELETE: bucket_id = 'site-documents' AND public.is_admin() (role: authenticated)

