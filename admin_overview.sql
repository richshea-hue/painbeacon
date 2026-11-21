-- ===========================================================================
-- PainBeacon — everything the admin dashboard counts, in one call.
-- 2026-11-20. Modeled on bestraces.com/admin's admin_overview().
--
-- Read-only, admins only (is_admin(), as the rest of the schema). Returns
-- counts and short top-N lists; no contact details of anyone.
--
-- Columns added by later files (office_evidence_url from practice_offices.sql)
-- are read through to_jsonb(row), so this runs on a database that has not had
-- those files yet and counts zero for them.
--
-- Also adds the 'listed' claim status: an inquiry that became a "listed, not
-- ranked" listing. claims.status has no check constraint, so nothing in the
-- schema changes for it; the dashboard offers it and archives it.
--
-- Run in the Supabase SQL editor. Verify as an admin:
--   select public.admin_overview();
-- ===========================================================================

create or replace function public.admin_overview()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  out jsonb;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;

  select jsonb_build_object(
    'generated_at', now(),

    'directory', jsonb_build_object(
      'clinics',        (select count(*) from clinics),
      'practices',      (select count(*) from clinics where primary_npi is null or primary_npi = npi),
      'geocoded',       (select count(*) from clinics where latitude is not null),
      'rated',          (select count(*) from clinics where aggregate_rating is not null),
      'with_website',   (select count(*) from clinics where coalesce(website, '') <> ''),
      'verified',       (select count(*) from clinics where listing_tier = 'verified'),
      'enhanced',       (select count(*) from clinics where listing_tier = 'enhanced'),
      'featured',       (select count(*) from clinics where listing_tier = 'featured'),
      'zones',          (select count(*) from zones),
      'listings_published', (select count(*) from nonregistry_listings where status = 'published'),
      'listings_draft',     (select count(*) from nonregistry_listings where status = 'draft'),
      'offices',        (select count(*) from nonregistry_listings l
                          where l.status = 'published' and l.parent_npi is not null
                            and coalesce(to_jsonb(l) ->> 'office_evidence_url', '') <> '')
    ),

    'claims', jsonb_build_object(
      'total',     (select count(*) from claims),
      'active',    (select count(*) from claims where coalesce(status, 'new') in ('new', 'verifying')),
      'new',       (select count(*) from claims where coalesce(status, 'new') = 'new'),
      'new_30d',   (select count(*) from claims where created_at > now() - interval '30 days'),
      'inquiries', (select count(*) from claims where clinic_slug is null),
      'by_status', (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb)
                    from (select coalesce(status, 'new') s, count(*) n from claims group by 1) x)
    ),

    'leads', jsonb_build_object(
      'total',         (select count(*) from leads),
      'new_7d',        (select count(*) from leads where created_at > now() - interval '7 days'),
      'new_30d',       (select count(*) from leads where created_at > now() - interval '30 days'),
      'wants_contact', (select count(*) from leads where wants_contact is true)
    ),

    -- search_events is written by the visitor's browser (a crawler that runs
    -- no JavaScript cannot add a row), which is why it is the honest
    -- "someone used the site" signal; see sponsor-report.mjs.
    'search', jsonb_build_object(
      'total',      (select count(*) from search_events),
      'last_7d',    (select count(*) from search_events where created_at > now() - interval '7 days'),
      'last_30d',   (select count(*) from search_events where created_at > now() - interval '30 days'),
      'matched_pct',(select round(100.0 * count(*) filter (where matched) / nullif(count(*), 0))
                     from search_events),
      'by_source',  (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb)
                     from (select coalesce(source, 'unknown') s, count(*) n from search_events group by 1) x),
      'top',        (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                       select lower(btrim(query)) q, count(*) n, bool_or(matched) matched
                       from search_events where coalesce(btrim(query), '') <> ''
                       group by 1 order by 2 desc, 1 limit 12) x),
      'unmatched',  (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                       select lower(btrim(query)) q, count(*) n
                       from search_events where matched is not true and coalesce(btrim(query), '') <> ''
                       group by 1 order by 2 desc, 1 limit 12) x)
    ),

    -- Last six calendar months, oldest first, so the dashboard can draw bars.
    'monthly', (select coalesce(jsonb_agg(m order by m ->> 'month'), '[]'::jsonb) from (
      select jsonb_build_object(
        'month',    to_char(mo, 'YYYY-MM'),
        'searches', (select count(*) from search_events where date_trunc('month', created_at) = mo),
        'leads',    (select count(*) from leads where date_trunc('month', created_at) = mo),
        'claims',   (select count(*) from claims where date_trunc('month', created_at) = mo)
      ) m
      from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') mo
    ) months),

    'outreach', jsonb_build_object(
      'postcards',  (select coalesce(jsonb_agg(x order by x ->> 'batch'), '[]'::jsonb) from (
                       select jsonb_build_object('batch', batch, 'total', count(*),
                         'mailed', count(mailed_at), 'scanned', count(first_scanned_at),
                         'scans', coalesce(sum(scan_count), 0)) x
                       from postcards group by batch) b),
      'kit_downloads',     (select count(*) from kit_downloads),
      'kit_downloads_30d', (select count(*) from kit_downloads where created_at > now() - interval '30 days'),
      'backlinks',         (select count(*) from backlinks),
      'badge_links',       (select count(*) from backlinks where badge is true)
    ),

    -- Non-bot rows only. Clicks are known to over-count (the Samakow day-19
    -- report showed more clicks than views); the dashboard says so.
    'sponsors', (select coalesce(jsonb_agg(x order by x ->> 'sponsor'), '[]'::jsonb) from (
      select jsonb_build_object('sponsor', sponsor,
        'views',     count(*) filter (where event = 'view'),
        'clicks',    count(*) filter (where event = 'click'),
        'views_30d', count(*) filter (where event = 'view' and created_at > now() - interval '30 days'),
        'clicks_30d',count(*) filter (where event = 'click' and created_at > now() - interval '30 days')) x
      from sponsor_events where bot is not true group by sponsor) s)
  ) into out;

  return out;
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
