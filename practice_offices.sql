-- ===========================================================================
-- PainBeacon — offices of a registry practice rank on the practice's record.
-- Decided 2026-11-20. See notes/practice-offices-2026-11-20.md.
--
-- A non-registry listing with a parent_npi is a location of a practice that
-- IS in the federal registry. It ranks, on the parent's registry signals, when
-- pain medicine is the parent's primary registration, the practice confirmed
-- the office (confirmed_on / confirmed_how, already required to publish), and
-- the office appears on the practice's own website. This column holds that
-- last piece of evidence: the page on the practice's site that lists the
-- office. The build checks it is on the same site as the practice's website
-- (officeProblems in src/lib/listing-rules.js); without it the row stays
-- "listed, not ranked", exactly as before.
--
-- Safe in either order with the code: the build reads the view with
-- select=*, so before this runs the column is simply absent and every
-- listing stays listed, not ranked.
--
-- Verify afterwards:
--   select reloptions from pg_class where relname = 'nonregistry_listings_public';
--     -> {security_invoker=off}
--   With the anon key: GET on the view returns 200 and includes
--   office_evidence_url; POST / PATCH / DELETE on the view return 401 / 42501.
-- ===========================================================================

alter table public.nonregistry_listings
  add column if not exists office_evidence_url text
    check (office_evidence_url is null or office_evidence_url ~* '^https?://[^/\s]+\.[a-z]{2,}(/\S*)?$');

comment on column public.nonregistry_listings.office_evidence_url is
  'A page on the practice''s own website that lists this office. With a pain-primary parent_npi, makes the row a ranked office of that practice.';

-- Appends one column to the definition in nonregistry_listings.sql. CREATE OR
-- REPLACE VIEW may only add columns at the end, which this does.
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
    l.updated_at,
    l.office_evidence_url
   from public.nonregistry_listings l
  where l.status = 'published';

alter view public.nonregistry_listings_public set (security_invoker = off);

-- Re-assert read-only. Replacing the view keeps its grants, but this costs
-- nothing and the reason is in nonregistry_listings.sql: a one-table definer
-- view is writable past RLS unless these two lines hold.
revoke all on public.nonregistry_listings_public from anon, authenticated;
grant select on public.nonregistry_listings_public to anon, authenticated;
