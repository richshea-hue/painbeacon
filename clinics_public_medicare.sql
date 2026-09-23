-- ===========================================================================
-- PainBeacon — let the Medicare signal reach the site.
--
-- scripts/medicare_match.py has been matching every clinic against the federal
-- CMS Medicare Fee-For-Service Public Provider Enrollment file (PECOS) for a
-- while: 12,410 of 12,487 listable clinics are checked and 3,729 come back
-- enrolled. src/pages/clinic/[slug].astro is already written to render that —
-- a "Medicare" row in the facts list and a "Does {clinic} accept Medicare?"
-- FAQ entry.
--
-- None of it has ever appeared, because `clinics_public` does not select the
-- two columns and the build reads that view. `c.accepts_medicare_cms` is
-- therefore `undefined` on every page, the page's `acceptsMedicare` resolves
-- to null, and both blocks render nothing. The view already carries the
-- public-facing `accepted_insurance`, so the omission is an oversight rather
-- than a policy.
--
-- Both columns are safe to expose and nothing else changes:
--   accepts_medicare_cms           derived from a public federal dataset
--   accepts_medicare_self_reported the clinic's own answer on its claim form,
--                                  collected in order to be published
--
-- The internal columns the view deliberately withholds — internal_notes,
-- acquisition_fit_score, outreach_status, contact_email, contacted_at, the
-- authorized_official_* fields, candor_acquired_at — stay withheld. This is
-- a CREATE OR REPLACE that appends two columns to the end of the select list;
-- it does not re-grant anything and must not change `security_invoker`, which
-- has to remain OFF or the anon build key loses access to the underlying
-- table and every Cloudflare deploy fails with 42501.
--
-- Run:  node --env-file=.env scripts/supabase.mjs sql clinics_public_medicare.sql
-- Then verify:
--   select reloptions from pg_class
--    where relname = 'clinics_public' and relnamespace = 'public'::regnamespace;
--   -> must still read {security_invoker=off}
-- ===========================================================================

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
    c.accepts_medicare_self_reported
   FROM clinics c
     LEFT JOIN zones z ON z.zone_slug = c.zone_slug;

-- CREATE OR REPLACE VIEW drops reloptions, so re-assert it in the same run.
-- Without this the view falls back to the Postgres default and, while that
-- default is also "off" today, the setting stops being explicit — which is how
-- it got flipped ON by a Security Advisor click before and took every deploy
-- down with 42501.
alter view public.clinics_public set (security_invoker = off);
