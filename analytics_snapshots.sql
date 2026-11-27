-- ===========================================================================
-- PainBeacon — cached outside analytics for the admin dashboard.
-- Same design as bestraces.com/admin (its migration 011), 2026-11-20.
--
-- The dashboard is a static page talking to Supabase with the public key, so
-- it cannot hold Cloudflare or Google credentials. scripts/sync-analytics.mjs
-- (service role, run daily by .github/workflows/sync-analytics.yml or by hand)
-- writes one snapshot row per source; a signed-in admin reads the latest row
-- per source through admin_analytics(). The raw table is service-role only.
--
-- Kinds:
--   traffic    Cloudflare edge totals per day, two 28-day windows
--   referrers  Cloudflare top referring hosts, last 28 days
--   keywords   Search Console totals, daily series and top queries and pages
--
-- Run in the Supabase SQL editor. Verify:
--   select public.admin_analytics();   -- as an admin: {} until the first sync
-- ===========================================================================

create table if not exists public.analytics_snapshots (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('traffic', 'referrers', 'keywords')),
  captured_at timestamptz not null default now(),
  payload     jsonb not null
);

alter table public.analytics_snapshots enable row level security;
-- Supabase grants new public tables to anon and authenticated by default.
revoke all on public.analytics_snapshots from anon, authenticated;

create index if not exists analytics_snapshots_kind_idx
  on public.analytics_snapshots (kind, captured_at desc);

-- Latest snapshot per kind, admins only. Shape:
--   { "traffic": { ...payload, "captured_at": ... }, "keywords": {...}, ... }
-- A kind with no snapshot yet is absent; the dashboard shows a setup hint.
create or replace function public.admin_analytics()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  return coalesce((
    select jsonb_object_agg(kind, payload || jsonb_build_object('captured_at', captured_at))
    from (
      select distinct on (kind) kind, captured_at, payload
      from public.analytics_snapshots
      order by kind, captured_at desc
    ) latest
  ), '{}'::jsonb);
end;
$$;

revoke all on function public.admin_analytics() from public, anon;
grant execute on function public.admin_analytics() to authenticated;
