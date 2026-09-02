-- ============================================================================
-- PainBeacon — click ledger for brand sponsorships (functions/go/[id].js).
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
--
-- One row per click on a SponsorCard link. No visitor identity is stored:
-- no IP, no user agent, no cookie. Just which sponsor, which page, when —
-- enough to hand an advertiser a monthly report and nothing more.
-- ============================================================================

create table if not exists public.sponsor_clicks (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  sponsor     text not null,      -- data/sponsors.json id, e.g. 'samakow-law'
  path        text,               -- page the card was on (from ?p=)
  referrer    text                -- Referer header, if any
);

create index if not exists sponsor_clicks_sponsor_idx
  on public.sponsor_clicks (sponsor, created_at desc);

-- Lock the table down: the anon key can neither read nor insert directly.
alter table public.sponsor_clicks enable row level security;

-- The ONLY door is this function, which runs with the table owner's rights
-- and inserts a fixed shape. The redirect calls it with the anon key.
create or replace function public.log_sponsor_click(
  p_sponsor text, p_path text default null, p_referrer text default null
) returns void
language sql security definer set search_path = public as $$
  insert into public.sponsor_clicks (sponsor, path, referrer)
  values (left(p_sponsor, 80), left(p_path, 300), left(p_referrer, 300));
$$;

revoke all on function public.log_sponsor_click(text, text, text) from public;
grant execute on function public.log_sponsor_click(text, text, text) to anon;

-- ----------------------------------------------------------------------------
-- The monthly report (run for the sponsor's billing month):
--
--   select date_trunc('day', created_at)::date as day, count(*) as clicks
--   from public.sponsor_clicks
--   where sponsor = 'samakow-law'
--     and created_at >= '2026-09-15' and created_at < '2026-10-15'
--   group by 1 order by 1;
--
--   -- Which pages the clicks came from:
--   select path, count(*) from public.sponsor_clicks
--   where sponsor = 'samakow-law' group by path order by 2 desc limit 25;
-- ----------------------------------------------------------------------------
