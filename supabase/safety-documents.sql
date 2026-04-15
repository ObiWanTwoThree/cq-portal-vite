-- Safety Documents feature
-- Run this in Supabase -> SQL Editor.

-- 1) Documents available per site
create table if not exists public.site_documents (
  id uuid primary key default gen_random_uuid(),
  site_name text not null,
  document_url text not null,
  document_type text not null check (document_type in ('RAMS', 'Induction', 'Certificate')),
  created_at timestamptz not null default now()
);

create index if not exists site_documents_site_name_idx on public.site_documents(site_name);
create index if not exists site_documents_type_idx on public.site_documents(document_type);

-- 2) Signatures (who has read/signed what)
create table if not exists public.document_signatures (
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_id uuid not null references public.site_documents(id) on delete cascade,
  signed_at timestamptz not null default now(),
  primary key (user_id, document_id)
);

create index if not exists document_signatures_user_idx on public.document_signatures(user_id);
create index if not exists document_signatures_doc_idx on public.document_signatures(document_id);

-- RLS
alter table public.site_documents enable row level security;
alter table public.document_signatures enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and lower(p.role) = 'admin'
  );
$$;

-- Policies: documents
drop policy if exists "site_documents_select_authenticated" on public.site_documents;
create policy "site_documents_select_authenticated"
on public.site_documents
for select
to authenticated
using (true);

drop policy if exists "site_documents_admin_write" on public.site_documents;
create policy "site_documents_admin_write"
on public.site_documents
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Policies: signatures (users can only read/write their own signatures)
drop policy if exists "document_signatures_select_own" on public.document_signatures;
create policy "document_signatures_select_own"
on public.document_signatures
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "document_signatures_insert_own" on public.document_signatures;
create policy "document_signatures_insert_own"
on public.document_signatures
for insert
to authenticated
with check (user_id = auth.uid());

