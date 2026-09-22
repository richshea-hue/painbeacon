-- ===========================================================================
-- PainBeacon — the backlink loop, made measurable.
--
-- /verified-badge/ gives a verified clinic an embed: an <a> to its own
-- PainBeacon profile (…/clinic/<slug>/?src=badge) wrapping the badge SVG. The
-- clinic's profile links back to the clinic's site with a followed link. That
-- exchange is the growth loop the directory is betting on — claims become
-- badges become links become organic traffic, which is what lets the paid
-- geotargeting budget come down.
--
-- The table existed but was empty and nothing wrote to it, so the loop was an
-- assumption rather than a measurement. scripts/check-backlinks.mjs fills it.
--
-- Added here:
--   npi       which clinic the domain belongs to, so "of the clinics we
--             verified, how many link back" is answerable
--   followed  false when every link to us carries rel=nofollow/sponsored/ugc.
--             An unfollowed badge still shows a patient we verified them and
--             still sends clicks; it just does nothing for organic, which is
--             the whole reason this is being counted.
--   badge     true when the link is the issued badge (?src=badge, or wraps
--             the badge SVG) rather than a plain mention. Tells apart "the
--             badge program works" from "someone linked to us anyway".
--   status    linked | no_link | unreachable | blocked_by_robots. Without it
--             a missing row and a checked-but-empty site look identical, and
--             no conversion rate can be computed.
--
-- One row per domain, so a re-check updates in place; that is what the unique
-- index is for. RLS stays on with no anon policy: this is internal, and the
-- collector uses the service-role key.
--
-- Run:  node --env-file=.env scripts/supabase.mjs sql backlinks_table.sql
-- ===========================================================================

alter table public.backlinks
  add column if not exists npi      bigint,
  add column if not exists followed boolean,
  add column if not exists badge    boolean,
  add column if not exists status   text;

create unique index if not exists backlinks_domain_key on public.backlinks (domain);

comment on column public.backlinks.links_count is
  'Links to painbeacon.com found on the domain''s home page (not the whole site).';
comment on column public.backlinks.status is
  'linked | no_link | unreachable | blocked_by_robots';
