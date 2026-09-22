-- ===========================================================================
-- PainBeacon — make the sponsor click count mean something.
--
-- functions/go/[id].js logged a click on ANY GET request, with no check on
-- what was asking. Crawlers follow links; they do not fetch the 1x1 image that
-- records a view. So across the first sponsor flight (2026-09-03 to 09-22) the
-- report held 257 clicks against 106 views — one "click" per distinct page,
-- spread evenly through the day, which is a crawler walking the sitemap, not a
-- person. Five of the 257 arrived with one of our own pages as the referrer.
--
-- Reporting 257 to the sponsor would also have been caught: /go/ tags every
-- redirect utm_source=painbeacon, so their own analytics hold the real number.
--
-- This adds one boolean. It deliberately does NOT add a user-agent column:
-- /privacy tells readers a sponsor event stores "which sponsor, which page,
-- when" with "no IP address, no device identifier, and no cookie", and a full
-- user-agent string is a fingerprinting surface. The endpoints read it, decide,
-- and keep only the verdict. That page now discloses the verdict too.
--
--   bot = true   the request identified itself as automation, or sent no
--                browser identification at all
--   bot = false  looked like a real browser
--   bot = null   written before this change; the report falls back to the
--                referrer test alone for those rows and says so
--
-- Run:  node --env-file=.env scripts/supabase.mjs sql sponsor_events_bot_column.sql
-- ===========================================================================

alter table public.sponsor_events add column if not exists bot boolean;

-- The old 4-argument function has to go in the same transaction as the new
-- one. Adding a defaulted parameter creates an OVERLOAD rather than replacing
-- the function, and a 4-argument call against both would fail as ambiguous —
-- which would silently stop counting on the live site.
drop function if exists public.log_sponsor_event(text, text, text, text);

create or replace function public.log_sponsor_event(
  p_sponsor text,
  p_event text default 'click',
  p_path text default null,
  p_referrer text default null,
  p_bot boolean default null
) returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.sponsor_events (sponsor, event, path, referrer, bot)
  values (left(p_sponsor, 80),
          case when p_event = 'view' then 'view' else 'click' end,
          left(p_path, 300), left(p_referrer, 300), p_bot);
$function$;

-- p_bot defaults to null, so the currently deployed 4-argument callers keep
-- working until the new functions ship. Deploy order is DB first, then code.
grant execute on function public.log_sponsor_event(text, text, text, text, boolean) to anon, authenticated;
