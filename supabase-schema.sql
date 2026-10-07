
-- NBANA APP — Supabase setup (free plan).
-- Paste this whole file, then click Run. Safe to run again any time.

-- One table holds every kind of portal data:
--   account / post / thread / concern / pwreq
create table if not exists public.nbana_records (
  kind       text        not null,
  id         text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

create index if not exists nbana_records_kind_idx    on public.nbana_records (kind);
create index if not exists nbana_records_updated_idx on public.nbana_records (updated_at desc);

alter table public.nbana_records enable row level security;

-- Demo access rule: the portal signs users in with its own account records
-- (no Supabase Auth yet), so the browser key needs read + write access.
-- Anyone holding the site's publishable key can read this table — fine for a
-- demo build; switch to Supabase Auth before real student data.
drop policy if exists nbana_records_demo_all on public.nbana_records;
create policy nbana_records_demo_all on public.nbana_records
  for all to anon, authenticated using (true) with check (true);

-- Cleanup: an earlier version of this setup created these two tables.
-- They are unused and were empty, so they are removed here.
-- nbana_records is never touched by these lines.
drop table if exists public.nbana_accounts;
drop table if exists public.nbana_posts;
