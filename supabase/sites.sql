-- Sites infrastructure
-- Run this in Supabase -> SQL Editor.

-- 1) Sites table
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location_description text null,
  sealing_specs text null,
  postcode text null,
  latitude double precision null,
  longitude double precision null,
  site_manager_name text null,
  site_manager_phone text null,
  access_notes text null,
  created_at timestamptz not null default now()
);

-- Backward-compatible: add columns if the table already existed
alter table public.sites add column if not exists postcode text null;
alter table public.sites add column if not exists latitude double precision null;
alter table public.sites add column if not exists longitude double precision null;
alter table public.sites add column if not exists site_manager_name text null;
alter table public.sites add column if not exists site_manager_phone text null;
alter table public.sites add column if not exists access_notes text null;

create index if not exists sites_name_idx on public.sites(name);

-- 2) Seed initial sites
insert into public.sites (name, location_description, sealing_specs)
values
  ('Johnstone Castle', 'New build development', null),
  ('Battlefield', 'New build development', null),
  ('KingsView', 'New build development', null),
  ('Clyde Gateway', 'New build development', null),
  ('Drongan', 'New build development', null),
  ('Bryden Way', 'New build development', null)
on conflict (name) do nothing;

-- 3) Link tasks -> sites
alter table public.tasks
add column if not exists site_id uuid null;

-- Add FK (safe to re-run)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_site_id_fkey'
  ) then
    alter table public.tasks
    add constraint tasks_site_id_fkey
    foreign key (site_id) references public.sites(id)
    on delete set null;
  end if;
end $$;

create index if not exists tasks_site_id_idx on public.tasks(site_id);

-- Optional: best-effort backfill site_id by matching existing task.location to sites.name
-- (Only updates tasks that are currently null for site_id.)
update public.tasks t
set site_id = s.id
from public.sites s
where t.site_id is null
  and t.location is not null
  and lower(trim(t.location)) = lower(trim(s.name));

-- RLS
alter table public.sites enable row level security;

-- Anyone authenticated can read sites
drop policy if exists "sites_select_authenticated" on public.sites;
create policy "sites_select_authenticated"
on public.sites
for select
to authenticated
using (true);

-- Only admins can write sites
drop policy if exists "sites_admin_write" on public.sites;
create policy "sites_admin_write"
on public.sites
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

