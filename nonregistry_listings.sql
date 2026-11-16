-- ===========================================================================
-- PainBeacon — practices that are listed but are not in the federal registry.
--
-- Every row in `clinics` is a record in the federal NPI registry: `npi` is the
-- table's only key, and every clinic page says the listing comes from there.
-- That leaves nothing to say to a practice that writes in and has no record
-- of its own. Two have, in four weeks:
--
--   2026-10-21  a chiropractic practice in Costa Mesa with no NPPES record
--               under its name or at its suite
--   2026-11-16  the Katy office of a Houston pain practice: the practice is in
--               the registry (and in `clinics`), the Katy suite is not
--
-- They do not go in `clinics`. A hand-typed row there would be the first one
-- whose provenance is "someone told us", it would be scored by a ranking that
-- reads a taxonomy code it does not honestly carry, and the monthly NPPES sync
-- would flag it for review forever. They get a table of their own, a page of
-- their own (/listing/<slug>/), and a labeled section below the ranked list
-- on the area page. Never a rank, never the word "verified".
--
-- What is in a row is what the practice told us, confirmed with the practice
-- directly. `confirmed_on` records that we did, and the table will not let a
-- row be published without it: the two requests above both arrived from
-- someone other than the practice's own address.
--
-- `parent_npi` ties an extra location to the registry clinic it belongs to,
-- so the Katy office can say whose office it is and the clinic's page can
-- list it. It is a pointer for display. It is never a join that moves data
-- from one row to the other.
--
-- Access follows the rest of the schema:
--   * the table is RLS-on and readable/writable only by a signed-in admin
--     (is_admin(), the same function claims and clinics use);
--   * the build reads `nonregistry_listings_public`, a view of the published
--     rows' public columns, with the anon key. Like clinics_public it is a
--     definer view (security_invoker = off) so the anon key needs no policy
--     on the table underneath. The internal columns (who asked, how we
--     confirmed it, notes) are not in the view and cannot reach the site.
--
-- Safe in either order with the code: until this runs the build finds no
-- such view, logs one line, and publishes no listings.
--
-- Run it in the Supabase SQL editor, then verify:
--   select reloptions from pg_class where relname = 'nonregistry_listings_public';
--   -> {security_invoker=off}
--   select count(*) from nonregistry_listings_public;   -- 0, and no error
-- ===========================================================================

create table if not exists public.nonregistry_listings (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique
                   check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 120),
  name           text not null check (length(btrim(name)) between 2 and 120),
  practice_type  text,
  address_1      text,
  address_2      text,
  city           text not null check (length(btrim(city)) > 0),
  state          text not null check (state ~ '^[A-Z]{2}$'),
  postal_code    text,
  phone          text,
  website        text,
  description    text check (description is null or length(description) <= 400),
  parent_npi     bigint references public.clinics (npi) on delete set null,
  latitude       double precision,
  longitude      double precision,

  status         text not null default 'draft'
                   check (status in ('draft', 'published', 'removed')),

  -- Internal. None of these are in the public view.
  confirmed_on   date,
  confirmed_how  text,
  contact_email  text,
  claim_id       uuid references public.claims (id) on delete set null,
  internal_notes text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Nothing is published on the word of whoever filled in the form.
  constraint published_listing_was_confirmed
    check (status <> 'published' or (confirmed_on is not null and length(btrim(coalesce(confirmed_how, ''))) > 0))
);

comment on table public.nonregistry_listings is
  'Practices listed at their own request that have no record of their own in the federal NPI registry. '
  'Shown separately from clinics, never ranked. See notes/brand-names-and-nonregistry-listings-2026-11-16.md.';

alter table public.nonregistry_listings enable row level security;

-- Supabase grants new public tables to anon by default; this one is admin-only.
revoke all on table public.nonregistry_listings from anon;

drop policy if exists "admin read nonregistry listings" on public.nonregistry_listings;
create policy "admin read nonregistry listings" on public.nonregistry_listings
  for select to authenticated using (is_admin());

drop policy if exists "admin insert nonregistry listings" on public.nonregistry_listings;
create policy "admin insert nonregistry listings" on public.nonregistry_listings
  for insert to authenticated with check (is_admin());

drop policy if exists "admin update nonregistry listings" on public.nonregistry_listings;
create policy "admin update nonregistry listings" on public.nonregistry_listings
  for update to authenticated using (is_admin()) with check (is_admin());

-- No delete policy on purpose: a listing that comes down is set to 'removed',
-- so there is a record that it was once published and why it is not now.

create or replace view public.nonregistry_listings_public as
 select l.slug,
    l.name,
    l.practice_type,
    l.address_1,
    l.address_2,
    l.city,
    l.state,
    l.postal_code,
    l.phone,
    l.website,
    l.description,
    l.parent_npi,
    l.latitude,
    l.longitude,
    l.updated_at
   from public.nonregistry_listings l
  where l.status = 'published';

alter view public.nonregistry_listings_public set (security_invoker = off);

grant select on public.nonregistry_listings_public to anon, authenticated;
