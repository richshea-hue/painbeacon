-- ============================================================================
-- PainBeacon — lead-capture table for the "Find your pain specialist" widget.
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- ============================================================================

create table if not exists public.leads (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  zip_or_city   text,
  care_type     text,
  name          text,
  contact       text,           -- phone or email the visitor optionally provides
  wants_contact boolean default false,
  source_page   text,
  user_agent    text
);

-- Row-level security ON: lock the table down, then open ONLY anon INSERT.
alter table public.leads enable row level security;

-- The public site uses the anon (publishable) key. Let it INSERT a lead, but
-- NOT read any leads. You view submissions in the Supabase Table editor (or via
-- the service key), so visitor contact info is never publicly readable.
drop policy if exists "anon can submit leads" on public.leads;
create policy "anon can submit leads"
  on public.leads for insert to anon
  with check (true);

grant insert on public.leads to anon;
