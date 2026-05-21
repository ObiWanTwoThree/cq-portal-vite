-- Site reports (field visit / progress reports per site)
-- Prerequisites: run supabase/sites.sql and supabase/safety-documents.sql (for is_admin()).
-- Run this in Supabase -> SQL Editor.

create table if not exists public.site_reports (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  title text not null,
  report_date date not null default current_date,
  notes text null,
  file_name text null,
  file_path text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists site_reports_site_id_idx on public.site_reports(site_id);
create index if not exists site_reports_report_date_idx on public.site_reports(report_date desc);

alter table public.site_reports enable row level security;

-- Authenticated users can view reports
drop policy if exists "site_reports_select_authenticated" on public.site_reports;
create policy "site_reports_select_authenticated"
on public.site_reports
for select
to authenticated
using (true);

-- Any authenticated user can submit a report (operatives + admins)
drop policy if exists "site_reports_insert_authenticated" on public.site_reports;
create policy "site_reports_insert_authenticated"
on public.site_reports
for insert
to authenticated
with check (created_by = auth.uid());

-- Admin-only update/delete
drop policy if exists "site_reports_admin_update" on public.site_reports;
drop policy if exists "site_reports_admin_delete" on public.site_reports;

create policy "site_reports_admin_update"
on public.site_reports
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "site_reports_admin_delete"
on public.site_reports
for delete
to authenticated
using (public.is_admin());

-- Optional attachments use the existing `site-documents` Storage bucket.
-- Dashboard -> Storage -> site-documents -> Policies (same as site-files.sql).
