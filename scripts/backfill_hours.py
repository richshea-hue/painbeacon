#!/usr/bin/env python3
"""
backfill_hours.py — PainBeacon Google Places hours backfill

Fetches regularOpeningHours from Google Places API (New) for clinics that
have a place_id but no hours yet, and writes results back to Supabase.

Guardrails vs. the previous version:
- Default limit 450/run. NOTE: regularOpeningHours itself bills as the
  ENTERPRISE SKU ($20/1,000, ~1,000 free/month shared with the website
  backfill) — the old assumption that a tight mask stays on the Pro tier was
  wrong, confirmed by the July 2026 bill ($47.68 Places API (New) on the 5th).
- Limit is override-able via LIMIT/MAX_CALLS env for deliberate paid catch-ups
- Strict field mask: `id,regularOpeningHours` ONLY — no reviews/photos/rating
  (extra fields can't make the call cheaper, only the payload fatter)
- Skips folded duplicates (primary_npi IS NOT NULL)
- Bare requests.get for Google calls — NOT a shared requests.Session — so the
  Supabase `Authorization: Bearer` header can't bleed into Google requests
- Writes {} for places Google returns with no hours, so those clinics are not
  re-fetched next month (this was the biggest hidden cost lever)
- Aborts hard on RESOURCE_EXHAUSTED rather than continuing to bill

Env vars (set as GitHub Actions secrets):
  SUPABASE_URL          e.g. https://eojjpozaoanwqzngxtuz.supabase.co
  SUPABASE_SERVICE_KEY  service role key (NOT the anon key)
  GOOGLE_MAPS_API_KEY   the key you just rotated after the incident
  LIMIT                 max calls this run (the workflow input; falls back to
                        MAX_CALLS, then 4500)
  DRY_RUN               "1" = count candidates only, no Google calls/writes
  MAX_CALLS             OPTIONAL legacy override for manual shell runs

Schema assumptions in the `clinics` table (verify column names before commit):
  id             bigint / uuid    primary key
  place_id       text             Google Place ID (nullable)
  hours          jsonb            null when not backfilled yet
  primary_npi    bigint           IS NOT NULL => folded duplicate; skip
"""

import os
import sys
import time
from datetime import datetime, timezone

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
# The workflow passes LIMIT (its input) and DRY_RUN; MAX_CALLS kept as a
# fallback for manual shell runs. Previously only MAX_CALLS was read, so the
# Actions "limit" input silently did nothing and "dry run" still made billed
# Google calls and wrote to the DB.
# Default 450: regularOpeningHours bills as Place Details ENTERPRISE
# (~1,000 free/month SHARED with backfill_websites.py, then $20/1,000) —
# confirmed by the $47.68 Places API (New) charge on the July 2026 bill.
# The old 4,500 default assumed hours were Pro-tier (5,000 free); they aren't.
MAX_CALLS = int(os.environ.get("LIMIT") or os.environ.get("MAX_CALLS") or "450")
DRY_RUN = os.environ.get("DRY_RUN", "") == "1"
BATCH_SIZE = 500                # Supabase page size
SLEEP_BETWEEN_CALLS = 0.10      # ~10 QPS, well under Google's per-second limit
GOOGLE_TIMEOUT = 15
SUPABASE_TIMEOUT = 30

# ---------------------------------------------------------------------------
# Env
# ---------------------------------------------------------------------------
try:
    SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
    SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
    GOOGLE_KEY   = os.environ["GOOGLE_MAPS_API_KEY"]
except KeyError as e:
    print(f"[fatal] missing env var: {e}", file=sys.stderr)
    sys.exit(1)

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------
def sb_get_candidates(limit):
    """Clinics with a place_id but no hours yet, skipping folded duplicates."""
    url = f"{SUPABASE_URL}/rest/v1/clinics"
    params = {
        "select": "id,place_id",
        "place_id": "not.is.null",
        "hours": "is.null",
        "primary_npi": "is.null",
        "limit": str(limit),
        "order": "id.asc",
    }
    r = requests.get(url, headers=SB_HEADERS, params=params, timeout=SUPABASE_TIMEOUT)
    r.raise_for_status()
    return r.json()

def sb_write_hours(clinic_id, hours_obj):
    """Write regularOpeningHours JSON back to clinics.hours."""
    url = f"{SUPABASE_URL}/rest/v1/clinics"
    params = {"id": f"eq.{clinic_id}"}
    body = {"hours": hours_obj}
    r = requests.patch(url, headers=SB_HEADERS, params=params, json=body, timeout=SUPABASE_TIMEOUT)
    r.raise_for_status()

# ---------------------------------------------------------------------------
# Google Places (New) — Pro-tier fetch only
# ---------------------------------------------------------------------------
def google_fetch_hours(place_id):
    """
    Returns:
      dict  the regularOpeningHours object, or {} if the place has none
      None  place not found / non-quota 4xx (skip and move on)
    Raises RuntimeError on quota exhaustion or 5xx — caller aborts the run.
    """
    url = f"https://places.googleapis.com/v1/places/{place_id}"
    headers = {
        "X-Goog-Api-Key": GOOGLE_KEY,
        # KEEP THIS TIGHT. Adding reviews/photos/rating/userRatingCount
        # upgrades every call to the Enterprise SKU (1,000 free/mo, $20/1,000).
        "X-Goog-FieldMask": "id,regularOpeningHours",
    }
    r = requests.get(url, headers=headers, timeout=GOOGLE_TIMEOUT)

    if r.status_code == 429 or (r.status_code == 403 and "RESOURCE_EXHAUSTED" in r.text):
        raise RuntimeError(f"Google quota exhausted (status {r.status_code}): {r.text[:300]}")
    if r.status_code >= 500:
        raise RuntimeError(f"Google 5xx: {r.status_code} {r.text[:300]}")
    if r.status_code == 404:
        return None
    if r.status_code != 200:
        print(f"  [warn] Google {r.status_code} for place_id={place_id}: {r.text[:200]}")
        return None

    data = r.json()
    return data.get("regularOpeningHours") or {}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    started = datetime.now(timezone.utc).isoformat()
    print(f"[{started}] backfill_hours: start  MAX_CALLS={MAX_CALLS}  DRY_RUN={DRY_RUN}")

    if DRY_RUN:
        candidates = sb_get_candidates(BATCH_SIZE)
        more = "+" if len(candidates) == BATCH_SIZE else ""
        print(f"[dry-run] {len(candidates)}{more} candidates still missing hours "
              f"(first page). No Google calls made, nothing written.")
        return

    calls_made = 0
    written = 0
    empty = 0
    skipped = 0

    while calls_made < MAX_CALLS:
        remaining = MAX_CALLS - calls_made
        pull = min(BATCH_SIZE, remaining)

        candidates = sb_get_candidates(pull)
        if not candidates:
            print("  no more candidates.")
            break

        for row in candidates:
            if calls_made >= MAX_CALLS:
                break

            place_id = row["place_id"]
            clinic_id = row["id"]

            try:
                hours = google_fetch_hours(place_id)
            except RuntimeError as e:
                print(f"[abort] {e}")
                print(f"[abort] calls_made={calls_made} written={written} empty={empty} skipped={skipped}")
                sys.exit(2)

            calls_made += 1

            if hours is None:
                skipped += 1
            elif hours == {}:
                # Place exists but has no published hours. Write {} so we don't
                # burn quota re-fetching this clinic next month.
                sb_write_hours(clinic_id, {})
                empty += 1
            else:
                sb_write_hours(clinic_id, hours)
                written += 1

            if calls_made % 100 == 0:
                print(f"  progress: {calls_made} calls | {written} written | {empty} empty | {skipped} skipped")

            time.sleep(SLEEP_BETWEEN_CALLS)

        if len(candidates) < pull:
            break

    print(f"[done] calls={calls_made} written={written} empty={empty} skipped={skipped}")

if __name__ == "__main__":
    main()
