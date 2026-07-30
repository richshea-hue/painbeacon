-- ============================================================================
-- PainBeacon — search-event log for the hero search bar + chatbot.
-- Captures what visitors search for (ZIP or city), whether it matched a zone,
-- and where it came from — so you can see demand and coverage gaps (ZIPs people
-- look for that you don't list yet).
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- ============================================================================

create table if not exists public.search_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  source      text,           -- 'hero' | 'chatbot' | 'chatbot_practice' | 'deep_link'
  query       text,           -- raw text the visitor entered (trimmed)
  kind        text,           -- 'zip' | 'city' | 'clinic' (matched a clinic name)
  zip3        text,           -- 3-digit prefix, when kind = 'zip'
  matched     boolean,        -- did it resolve to a zone page?
  zone        text,           -- resolved "state/zone" segment, null if unmatched
  path        text,           -- page the search happened on
  user_agent  text
);

-- Optional: fast filtering on the coverage-gap query (unmatched ZIP searches).
create index if not exists search_events_zip3_idx on public.search_events (zip3);

-- Row-level security ON: lock the table down, then open ONLY anon INSERT.
alter table public.search_events enable row level security;

-- The public site uses the anon (publishable) key. Let it INSERT an event, but
-- NOT read any events back. You view them in the Supabase Table editor (or via
-- the service key).
drop policy if exists "anon can log searches" on public.search_events;
create policy "anon can log searches"
  on public.search_events for insert to anon
  with check (true);

grant insert on public.search_events to anon;

-- ----------------------------------------------------------------------------
-- Handy queries once data is flowing:
--
--   -- Top ZIP3s people searched but you DON'T cover (demand → expansion list):
--   select zip3, count(*) as searches
--   from public.search_events
--   where kind = 'zip' and matched = false
--   group by zip3 order by searches desc limit 50;
--
--   -- Practices searching for themselves and finding nothing (add-listing demand):
--   select query, count(*) as searches
--   from public.search_events
--   where source = 'chatbot_practice' and matched = false
--   group by query order by searches desc limit 50;
--
--   -- Overall match rate by source:
--   select source, count(*) filter (where matched) * 100.0 / count(*) as pct_matched,
--          count(*) as total
--   from public.search_events group by source;
-- ----------------------------------------------------------------------------
