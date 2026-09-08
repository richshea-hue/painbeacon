-- ============================================================================
-- PainBeacon — Practice Kit download log.
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
--
-- functions/practice-kit/download.js calls log_kit_download() with the anon
-- key after a signed link verifies, so every download is counted server-side
-- with no script on the page. Same pattern as sponsor_events / postcard scans.
-- ============================================================================

create table if not exists public.kit_downloads (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  npi         text,            -- the clinic the link was minted for
  user_agent  text
);

-- Locked down: the anon key can only call the function below, never read rows.
alter table public.kit_downloads enable row level security;

create or replace function public.log_kit_download(p_npi text, p_ua text default null)
returns void
language sql security definer set search_path = public as $$
  insert into public.kit_downloads (npi, user_agent)
  values (left(p_npi, 10), left(p_ua, 300));
$$;

revoke all on function public.log_kit_download(text, text) from public;
grant execute on function public.log_kit_download(text, text) to anon;

-- ----------------------------------------------------------------------------
-- Who has downloaded it (service key / SQL editor; the anon key cannot read):
--   select d.npi, c.name, c.city, c.state, count(*) as downloads, max(d.created_at) as last
--   from public.kit_downloads d
--   left join public.clinics c on c.npi = d.npi
--   group by 1, 2, 3, 4 order by last desc;
-- ----------------------------------------------------------------------------
