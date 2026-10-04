-- Jernlogg: one generic document table so new features never need migrations.
create table if not exists public.docs (
  id text primary key,
  collection text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists docs_collection_idx on public.docs (collection);
create index if not exists docs_created_idx on public.docs (created_at);

-- No login in the app: the anon role may read and write. Delete is not allowed (soft delete via `deleted`).
alter table public.docs enable row level security;

drop policy if exists "anon read" on public.docs;
drop policy if exists "anon insert" on public.docs;
drop policy if exists "anon update" on public.docs;

create policy "anon read" on public.docs for select to anon, authenticated using (true);
create policy "anon insert" on public.docs for insert to anon, authenticated with check (true);
create policy "anon update" on public.docs for update to anon, authenticated using (true) with check (true);

grant select, insert, update on public.docs to anon, authenticated;

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs'
  ) then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
