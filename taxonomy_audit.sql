-- ============================================================================
-- PainBeacon — what practice types are actually in the directory?
--
-- READ-ONLY. Nothing is written. Supabase -> SQL Editor -> New query -> Run.
--
-- The first question for practice-type search: which NPI taxonomy codes do the
-- clinics carry, and at what volume? A facet is only worth building where there
-- are enough clinics behind it to be worth a patient's click.
--
-- Returns ONE table with three reports stacked, because the SQL editor shows
-- only the last result set of a multi-statement script:
--
--   1 primary specialty  the clinic's own declared specialty, with its
--                        human-readable description and share of the directory
--   2 code in any slot   every code appearing in ANY of the 15 NPPES taxonomy
--                        slots, so co-specialties show up — a pain practice
--                        that is also plain Anesthesiology or Neurology. This
--                        is where practice-type search gets more interesting
--                        than the five pain codes scripts/sync_nppes.py filters
--                        on, since all_taxonomy_codes is NOT limited to those.
--   3 codes per clinic   how many codes each record carries, which says whether
--                        a filter needs to be multi-select at all
--
-- `listable` mirrors what the site actually shows: primaries only (a folded
-- duplicate would count one office twice) and rows with a city, state and name,
-- since src/lib/data.js drops the rest as unroutable. Counts here therefore
-- match what a practice-type filter would really display, rather than what the
-- table happens to hold.
--
-- all_taxonomy_codes is PIPE-separated ("|".join in sync_nppes.py), not comma.
-- ============================================================================

with listable as (
  select *
  from public.clinics
  where (primary_npi is null or primary_npi = npi)
    and coalesce(city,  '') <> ''
    and coalesce(state, '') <> ''
    and coalesce(name,  '') <> ''
),

primary_mix as (
  select '1 primary specialty' as report,
         coalesce(nullif(primary_taxonomy_code, ''), '(none)') as code,
         coalesce(nullif(primary_taxonomy_desc, ''), '(no description on record)')
           as practice_type,
         count(*) as clinics,
         round(100.0 * count(*) / sum(count(*)) over (), 1)::text || '%' as note
  from listable
  group by 2, 3
),

any_slot as (
  select '2 code in any slot' as report,
         t.code,
         '' as practice_type,
         count(distinct l.npi) as clinics,
         count(distinct l.npi) filter (where l.primary_taxonomy_code = t.code)::text
           || ' as primary' as note
  from listable l
  cross join lateral
    unnest(string_to_array(coalesce(l.all_taxonomy_codes, ''), '|')) as t(code)
  where nullif(trim(t.code), '') is not null
  group by t.code
),

breadth as (
  select '3 codes per clinic' as report,
         coalesce(array_length(string_to_array(nullif(all_taxonomy_codes, ''), '|'), 1), 0)::text
           as code,
         '' as practice_type,
         count(*) as clinics,
         '' as note
  from listable
  group by 2
)

select * from primary_mix
union all select * from any_slot
union all select * from breadth
order by report, clinics desc, code;
