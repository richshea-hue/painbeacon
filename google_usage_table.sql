-- ============================================================================
-- PainBeacon — monthly Google API usage ledger.
-- One row per (month, SKU pool). The Google-spending scripts read it before
-- making any calls and refuse to start once the month's budget is spent, then
-- write back what they actually used — so runs can never STACK past a free
-- allowance no matter how many times a workflow is dispatched in one month.
-- Per-run LIMITs alone cannot promise that; this table is the cross-run memory.
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- ============================================================================

create table if not exists public.google_api_usage (
  month       text not null,            -- UTC month, e.g. '2026-08'
  sku         text not null,            -- 'geocoding' | 'text_search_pro' | 'place_details_enterprise'
  calls       integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (month, sku)
);

-- Row-level security ON with NO policies: only the service role key (which
-- bypasses RLS) can read or write. The public site's anon key gets nothing —
-- this is operational bookkeeping, not site data.
alter table public.google_api_usage enable row level security;
