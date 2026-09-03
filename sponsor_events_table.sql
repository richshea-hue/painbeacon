-- ============================================================================
-- PainBeacon — view + click ledger for brand sponsorships.
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
--
-- One row per event on a SponsorCard: a 'view' when the card is rendered in
-- a browser (a 1×1 image request to functions/i/[id].js) and a 'click' when
-- its link is followed (the redirect in functions/go/[id].js). No visitor
-- identity is stored: no IP, no user agent, no cookie. Just which sponsor,
-- which page, what happened, when — enough for a monthly report by page and
-- a click-through rate, and nothing more. The privacy page says exactly this.
-- ============================================================================

create table if not exists public.sponsor_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  sponsor     text not null,                 -- data/sponsors.json id, e.g. 'samakow-law'
  event       text not null default 'click'  -- 'view' | 'click'
              check (event in ('view', 'click')),
  path        text,                          -- page the card was on
  referrer    text                           -- Referer header on a click, if any
);

create index if not exists sponsor_events_sponsor_idx
  on public.sponsor_events (sponsor, event, created_at desc);

-- Lock the table down: the anon key can neither read nor insert directly.
alter table public.sponsor_events enable row level security;

-- The ONLY door is this function, which runs with the table owner's rights
-- and inserts a fixed shape. Both Pages Functions call it with the anon key.
create or replace function public.log_sponsor_event(
  p_sponsor text, p_event text default 'click', p_path text default null, p_referrer text default null
) returns void
language sql security definer set search_path = public as $$
  insert into public.sponsor_events (sponsor, event, path, referrer)
  values (left(p_sponsor, 80),
          case when p_event = 'view' then 'view' else 'click' end,
          left(p_path, 300), left(p_referrer, 300));
$$;

revoke all on function public.log_sponsor_event(text, text, text, text) from public;
grant execute on function public.log_sponsor_event(text, text, text, text) to anon;

-- ----------------------------------------------------------------------------
-- The report: node --env-file=.env scripts/sponsor-report.mjs --sponsor samakow-law
-- (needs SUPABASE_SERVICE_ROLE_KEY; the anon key cannot read this table).
--
-- Or by hand, for the sponsor's billing month:
--   select date_trunc('day', created_at)::date as day,
--          count(*) filter (where event = 'view')  as views,
--          count(*) filter (where event = 'click') as clicks
--   from public.sponsor_events
--   where sponsor = 'samakow-law'
--     and created_at >= '2026-09-03' and created_at < '2026-10-04'
--   group by 1 order by 1;
-- ----------------------------------------------------------------------------
