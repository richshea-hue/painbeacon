-- ===========================================================================
-- PainBeacon — a practice's own name, next to its registered one.
--
-- The federal registry holds a LEGAL name, and for many practices that is not
-- the name on the door. The case that prompted this: "Interventional Pain
-- Management" in Houston is registered as M&M CLINICAL GROUP (NPI 1316348501).
-- Nobody searches for the second name, and the practice's own marketing firm
-- wrote in on 2026-11-16 to say the practice was not listed. It was.
--
-- `clinics.brand_name` holds the name patients know the practice by. The site
-- prints it first and the registered name beside it, on verified listings
-- only (see publicName / registeredAs in src/lib/data.js). It is set from the
-- dashboard when a claim is approved, never by the NPPES sync and never by a
-- match: scripts/sync_nppes.py does not know the column exists, so a monthly
-- resync leaves it alone.
--
-- Nothing else changes. `name` stays the registry's name, the slug stays the
-- slug, and NULL (every row, the day this runs) means exactly what the site
-- did before.
--
-- The view is a CREATE OR REPLACE that appends ONE column to the end of the
-- select list; the list above it is the live definition as read back with
-- pg_get_viewdef on 2026-11-16. It must not change `security_invoker`, which
-- has to remain OFF or the anon build key loses access to the underlying
-- table and every Cloudflare deploy fails with 42501.
--
-- Safe in either order with the code: the build reads the view with select=*,
-- so before this runs brand_name is simply undefined and nothing prints.
--
-- Run it in the Supabase SQL editor, then verify:
--   select reloptions from pg_class
--    where relname = 'clinics_public' and relnamespace = 'public'::regnamespace;
--   -> must still read {security_invoker=off}
--   select brand_name from clinics_public limit 1;   -- must not error
-- ===========================================================================

alter table public.clinics add column if not exists brand_name text;

comment on column public.clinics.brand_name is
  'Name patients know the practice by, when it differs from the registered (NPPES) name. '
  'Set by hand from a verified claim; printed only on verified+ listings, always beside the registered name.';

create or replace view public.clinics_public as
 SELECT c.npi,
    c.enumeration_type,
    c.name,
    c.slug,
    c.address_1,
    c.address_2,
    c.city,
    c.state,
    c.postal_code,
    c.country,
    c.phone,
    c.fax,
    c.website,
    c.primary_taxonomy_code,
    c.primary_taxonomy_desc,
    c.all_taxonomy_codes,
    c.provider_credentials,
    c.services,
    c.conditions_treated,
    c.procedures_offered,
    c.accepted_insurance,
    c.aggregate_rating,
    c.review_count,
    c.profile_photo,
    c.latitude,
    c.longitude,
    c.hours,
    c.google_place_id,
    c.google_maps_uri,
    c.photo_name,
    c.listing_tier,
    c.enhanced_description,
    c.booking_url,
    c.enhanced_photos,
    c.enhanced_providers,
    c.primary_npi,
    c.zone_slug,
    c.zone_name,
    z.is_oversized,
    z.featured_monthly,
    c.enumeration_date,
    c.accepts_medicare_cms,
    c.accepts_medicare_self_reported,
    c.brand_name
   FROM clinics c
     LEFT JOIN zones z ON z.zone_slug = c.zone_slug;

-- CREATE OR REPLACE VIEW drops reloptions, so re-assert it in the same run.
alter view public.clinics_public set (security_invoker = off);
