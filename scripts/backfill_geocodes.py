#!/usr/bin/env python3
"""
backfill_geocodes.py — PainBeacon Google Places coordinate backfill

Gives coordinates to clinics that have none. Roughly 47% of the directory has
never been matched to a Google place at all, so those clinics carry no
latitude/longitude and are dropped before they ever reach a map: zone pages
list them but cannot pin them (Tampa lists 84 clinics and maps 21).

This is the missing third job in the Places family. The other two only ever
ENRICH clinics that already have a place id — backfill_hours.py and
backfill_websites.py both select `place_id IS NOT NULL` — so the unmatched
clinics are excluded from those queues by construction and would never gain
coordinates no matter how many times they run. This script is what puts a
clinic INTO that queue: once it has a place id, hours and websites pick it up
on their own.

BILLING — READ BEFORE RAISING LIMIT:
  This uses Text Search with a Pro field mask (places.location and friends),
  which bills as **Text Search Pro**: $32/1,000 with 5,000 free per month.
  That is a SEPARATE free pool from the one hours + websites share — those two
  use Place Details **Enterprise** ($20/1,000, only ~1,000 free/month, which is
  why their defaults are 200 + 700). Nothing else in this repo uses Text Search
  Pro, so this job starts with the whole 5,000 available.

  Default LIMIT is 4,000 — a deliberate 20% margin under the free tier, so a
  retry or a manual run in the same month cannot tip the account into paid
  usage. At that rate the backlog clears in about two months. Raising it above
  5,000 costs real money at $32/1,000. Check Billing → Reports after any change.

  Do NOT add rating, userRatingCount, priceLevel or regularOpeningHours to the
  field mask: any one of them promotes the call to Text Search Enterprise,
  which drops the free allowance from 5,000 to 1,000.

Guardrails (same family as backfill_hours.py / backfill_websites.py):
- Strict field mask — Pro fields only, nothing that promotes the SKU
- Skips folded duplicates (primary_npi IS NOT NULL)
- Bare requests.get/post for Google calls — NOT a shared requests.Session — so
  the Supabase `Authorization: Bearer` header can't bleed into Google requests
- Validates every result against the clinic's listed state before writing.
  Same rule the errant-location audit settled on: no pin is better than a wrong
  pin, because a clinic pinned in the wrong state is worse than an absent one
- Records permanent failures by writing google_maps_uri = '' so a clinic that
  genuinely has no findable place is never re-fetched and never re-billed on a
  later run. Without this the same dead records would be paid for every month
- Aborts hard on RESOURCE_EXHAUSTED rather than continuing to bill
- DRY_RUN=1: counts candidates only — no Google calls, no writes

Env vars (set as GitHub Actions secrets / workflow inputs):
  SUPABASE_URL            e.g. https://<project>.supabase.co
  SUPABASE_SERVICE_KEY    service role key (NOT the anon key)
  GOOGLE_MAPS_API_KEY     same key the hours/website backfills use
  LIMIT                   max Google calls this run (default 4000)
  MONTHLY_BUDGET          hard cap on TOTAL calls this month across all runs
                          (default 4500; ledger table google_api_usage — see
                          google_usage_table.sql)
  DRY_RUN                 "1" = count candidates only
  CLOUDFLARE_DEPLOY_HOOK  OPTIONAL — POSTed after a run that wrote coordinates

Schema note: the repo is inconsistent about the place-id column — the hours and
website backfills read `place_id`, while fix_errant_locations.py writes
`google_place_id`. Rather than guess, this script probes which columns exist and
writes every one it finds, reporting the result. If only `google_place_id` is
written on this database, newly geocoded clinics will NOT enter the hours and
website queues, and that is worth knowing.

Stdlib + requests only. Run from the repo root:

  python scripts/backfill_geocodes.py
"""

import os
import sys
import time

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or ""
GOOGLE_KEY = os.environ.get("GOOGLE_MAPS_API_KEY") or ""
DEPLOY_HOOK = os.environ.get("CLOUDFLARE_DEPLOY_HOOK") or ""

# 4,000 leaves 1,000 of the 5,000-call Text Search Pro free tier spare.
LIMIT = int(os.environ.get("LIMIT") or os.environ.get("MAX_CALLS") or "4000")
DRY_RUN = (os.environ.get("DRY_RUN") or "").strip() in ("1", "true", "True")

SUPABASE_TIMEOUT = 60
GOOGLE_TIMEOUT = 30
SLEEP_BETWEEN_CALLS = 0.10      # ~10 QPS, well under Google's per-second limit

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.")
if not GOOGLE_KEY and not DRY_RUN:
    sys.exit("GOOGLE_MAPS_API_KEY is required (or set DRY_RUN=1).")

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# --- Monthly budget ledger (google_api_usage table) -------------------------
# Per-run LIMIT cannot stop dispatches from STACKING within a month, so every
# live run first reads this month's Text Search Pro spend from the ledger,
# clamps its LIMIT to what is left of MONTHLY_BUDGET, and records the calls it
# actually made (every LEDGER_FLUSH_EVERY calls, and again on exit, so an
# abort loses at most one flush interval). The table is created by
# google_usage_table.sql — live runs FAIL CLOSED if it is missing, because a
# billing guard that shrugs and continues is not a guard.
#
# Default budget 4,500: the Text Search Pro free tier is 5,000/month (verified
# — see BILLING above) and this keeps the month's TOTAL under it with headroom
# for the flush interval, even across repeated dispatches.
USAGE_SKU = "text_search_pro"
MONTHLY_BUDGET = int(os.environ.get("MONTHLY_BUDGET") or "4500")
LEDGER_FLUSH_EVERY = 25
CALLS_MADE = 0          # incremented by places_lookup() on every Google call
_LEDGER_BASE = 0        # this month's spend when the run started


def usage_month():
    return time.strftime("%Y-%m", time.gmtime())


def ledger_read():
    """This month's recorded calls, or None if the ledger table is missing."""
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/google_api_usage",
        headers=SB_HEADERS,
        params={"month": f"eq.{usage_month()}", "sku": f"eq.{USAGE_SKU}", "select": "calls"},
        timeout=SUPABASE_TIMEOUT,
    )
    if r.status_code == 404:
        return None
    r.raise_for_status()
    rows = r.json()
    return rows[0]["calls"] if rows else 0


def ledger_flush():
    """Upsert this month's total (baseline + this run's calls so far)."""
    headers = dict(SB_HEADERS)
    headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/google_api_usage",
        headers=headers,
        json={"month": usage_month(), "sku": USAGE_SKU,
              "calls": _LEDGER_BASE + CALLS_MADE},
        timeout=SUPABASE_TIMEOUT,
    )
    r.raise_for_status()

# Approximate bounding boxes per state/territory: (lat_min, lat_max, lon_min,
# lon_max). Kept in step with the copy in fix_errant_locations.py — each script
# in this family is standalone by convention, so the table is duplicated rather
# than shared.
BUFFER = 0.35  # degrees of slack so border-town clinics never false-positive
BOUNDS = {
    "AL": (30.1, 35.1, -88.6, -84.8), "AK": (51.0, 71.6, -180.0, -129.0),
    "AZ": (31.2, 37.1, -115.0, -109.0), "AR": (33.0, 36.6, -94.7, -89.6),
    "CA": (32.4, 42.1, -124.6, -114.0), "CO": (36.9, 41.1, -109.1, -102.0),
    "CT": (40.9, 42.1, -73.8, -71.7), "DE": (38.4, 39.9, -75.8, -74.9),
    "DC": (38.78, 39.01, -77.13, -76.90), "FL": (24.3, 31.1, -87.7, -79.8),
    "GA": (30.3, 35.1, -85.7, -80.7), "HI": (18.8, 22.3, -160.4, -154.7),
    "ID": (41.9, 49.1, -117.3, -110.9), "IL": (36.9, 42.6, -91.6, -87.0),
    "IN": (37.7, 41.8, -88.1, -84.7), "IA": (40.3, 43.6, -96.7, -90.1),
    "KS": (36.9, 40.1, -102.1, -94.5), "KY": (36.4, 39.2, -89.6, -81.9),
    "LA": (28.8, 33.1, -94.1, -88.7), "ME": (42.9, 47.5, -71.1, -66.8),
    "MD": (37.8, 39.8, -79.5, -74.9), "MA": (41.1, 42.9, -73.6, -69.8),
    "MI": (41.6, 48.4, -90.5, -82.3), "MN": (43.4, 49.5, -97.3, -89.4),
    "MS": (30.1, 35.1, -91.7, -88.0), "MO": (35.9, 40.7, -95.8, -89.0),
    "MT": (44.3, 49.1, -116.1, -104.0), "NE": (39.9, 43.1, -104.1, -95.2),
    "NV": (35.0, 42.1, -120.1, -114.0), "NH": (42.6, 45.4, -72.6, -70.5),
    "NJ": (38.8, 41.4, -75.6, -73.8), "NM": (31.2, 37.1, -109.1, -102.9),
    "NY": (40.4, 45.1, -79.8, -71.7), "NC": (33.7, 36.6, -84.4, -75.3),
    "ND": (45.9, 49.1, -104.1, -96.5), "OH": (38.4, 42.0, -84.9, -80.5),
    "OK": (33.6, 37.1, -103.1, -94.4), "OR": (41.9, 46.3, -124.6, -116.4),
    "PA": (39.7, 42.3, -80.6, -74.6), "RI": (41.1, 42.1, -71.9, -71.1),
    "SC": (32.0, 35.3, -83.4, -78.4), "SD": (42.4, 46.0, -104.1, -96.4),
    "TN": (34.9, 36.7, -90.4, -81.6), "TX": (25.8, 36.6, -106.7, -93.4),
    "UT": (36.9, 42.1, -114.1, -109.0), "VT": (42.7, 45.1, -73.5, -71.4),
    "VA": (36.5, 39.5, -83.7, -75.1), "WA": (45.5, 49.1, -124.9, -116.9),
    "WV": (37.1, 40.7, -82.7, -77.7), "WI": (42.4, 47.1, -93.0, -86.7),
    "WY": (40.9, 45.1, -111.1, -104.0), "PR": (17.8, 18.6, -67.4, -65.1),
    "VI": (17.6, 18.5, -65.2, -64.5), "GU": (13.2, 13.7, 144.6, 145.0),
    "AS": (-14.7, -14.0, -171.2, -169.3), "MP": (14.0, 20.6, 144.8, 146.2),
}


def log(msg):
    print(msg, flush=True)


def in_state(state, lat, lon):
    box = BOUNDS.get(state)
    if not box:
        return True  # unknown state code: don't reject what we can't check
    lat_min, lat_max, lon_min, lon_max = box
    if not (lat_min - BUFFER <= lat <= lat_max + BUFFER):
        return False
    if state == "AK":
        # Aleutian islands cross the antimeridian into positive longitudes.
        return (-180.0 <= lon <= -129.0 + BUFFER) or (170.0 <= lon <= 180.0)
    return lon_min - BUFFER <= lon <= lon_max + BUFFER


# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------
def detect_place_id_columns():
    """Which of place_id / google_place_id this database actually has.

    The two column names are used inconsistently across this repo's scripts and
    a PATCH naming a column that does not exist fails the whole write, so ask
    rather than assume.
    """
    found = []
    for col in ("place_id", "google_place_id"):
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/clinics",
            headers=SB_HEADERS,
            params={"select": col, "limit": "1"},
            timeout=SUPABASE_TIMEOUT,
        )
        if r.status_code == 200:
            found.append(col)
    return found


def get_candidates(limit):
    """Clinics with no coordinates that have not already been tried.

    google_maps_uri = '' is the tried-and-failed marker (see write_failure), so
    IS NULL here means genuinely never attempted.
    """
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/clinics",
        headers=SB_HEADERS,
        params={
            "select": "npi,name,address_1,address_2,city,state,postal_code",
            "latitude": "is.null",
            "google_maps_uri": "is.null",
            "primary_npi": "is.null",
            "limit": str(limit),
            "order": "npi.asc",
        },
        timeout=SUPABASE_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


def count_candidates():
    """Exact backlog size, via a HEAD request with an exact count."""
    headers = dict(SB_HEADERS)
    headers["Prefer"] = "count=exact"
    r = requests.head(
        f"{SUPABASE_URL}/rest/v1/clinics",
        headers=headers,
        params={
            "select": "npi",
            "latitude": "is.null",
            "google_maps_uri": "is.null",
            "primary_npi": "is.null",
        },
        timeout=SUPABASE_TIMEOUT,
    )
    rng = r.headers.get("content-range", "")
    return int(rng.split("/")[-1]) if "/" in rng else -1


def patch(npi, payload):
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/clinics",
        headers=SB_HEADERS,
        params={"npi": f"eq.{npi}"},
        json=payload,
        timeout=SUPABASE_TIMEOUT,
    )
    if r.status_code >= 300:
        log(f"  !! PATCH {npi} failed {r.status_code}: {r.text[:200]}")
        return False
    return True


# ---------------------------------------------------------------------------
# Google
# ---------------------------------------------------------------------------
def places_lookup(query):
    """Google Places (New) Text Search. Deliberately a fresh request each time
    (never a shared session) so Supabase auth headers can't leak to Google.

    The field mask is Pro-tier only. Adding an Enterprise field would cut the
    monthly free allowance from 5,000 calls to 1,000 — see the billing note.
    """
    global CALLS_MADE
    r = requests.post(
        "https://places.googleapis.com/v1/places:searchText",
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_KEY,
            "X-Goog-FieldMask":
                "places.id,places.displayName,places.formattedAddress,"
                "places.location,places.googleMapsUri",
        },
        json={"textQuery": query},
        timeout=GOOGLE_TIMEOUT,
    )
    CALLS_MADE += 1
    if CALLS_MADE % LEDGER_FLUSH_EVERY == 0:
        try:
            ledger_flush()
        except requests.RequestException as e:
            # The next flush (or the final one) carries the running total, so
            # a transient ledger hiccup should not kill a healthy run.
            log(f"  [warn] ledger flush failed: {e}")
    if r.status_code == 429 or "RESOURCE_EXHAUSTED" in r.text:
        sys.exit(f"ABORT: Google quota exhausted — stopping rather than billing on.\n{r.text[:400]}")
    if r.status_code >= 300:
        log(f"  !! Places {r.status_code}: {r.text[:200]}")
        return None
    places = (r.json() or {}).get("places") or []
    return places[0] if places else None


def query_for(c):
    """The address string the errant-location audit settled on."""
    parts = [
        c.get("name") or "",
        c.get("address_1") or "",
        c.get("city") or "",
        f"{(c.get('state') or '').upper()} {(c.get('postal_code') or '')[:5]}".strip(),
    ]
    return ", ".join(p for p in parts if p)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    global _LEDGER_BASE
    backlog = count_candidates()
    log(f"Clinics with no coordinates, never attempted: {backlog if backlog >= 0 else 'unknown'}")
    log(f"LIMIT={LIMIT} (Text Search Pro free tier is 5,000/month)  DRY_RUN={DRY_RUN}")

    # Monthly budget check BEFORE any Google call. Fail closed on a missing
    # ledger for live runs; dry runs just report.
    used = ledger_read()
    if used is None:
        if DRY_RUN:
            log("[warn] google_api_usage table not found - dry run continues, "
                "but a live run will refuse to start. Run google_usage_table.sql "
                "in Supabase first.")
            used = 0
        else:
            sys.exit("ABORT: google_api_usage table not found in Supabase. "
                     "Run google_usage_table.sql (repo root) in the Supabase "
                     "SQL editor once, then re-dispatch. Refusing to spend "
                     "unmetered Google calls.")
    remaining = max(0, MONTHLY_BUDGET - used)
    log(f"Monthly budget ({USAGE_SKU}): {used} of {MONTHLY_BUDGET} used in "
        f"{usage_month()} - {remaining} remaining")
    limit = min(LIMIT, remaining)
    if limit < LIMIT:
        log(f"  LIMIT clamped {LIMIT} -> {limit} to stay inside the budget")
    if not DRY_RUN and limit <= 0:
        sys.exit(f"ABORT: monthly {USAGE_SKU} budget ({MONTHLY_BUDGET}) is "
                 f"spent - nothing left this month. Re-run next month, or "
                 f"raise MONTHLY_BUDGET deliberately AFTER verifying spend in "
                 f"Billing > Reports.")
    _LEDGER_BASE = used

    if DRY_RUN:
        sample = get_candidates(min(limit, 5))
        log("\nDry run — no Google calls, no writes. Sample queries that would be sent:")
        for c in sample:
            log(f"  {c['npi']}  {query_for(c)}")
        if backlog >= 0 and limit > 0:
            months = (backlog + limit - 1) // limit
            log(f"\nAt {limit}/run this backlog clears in {months} run(s).")
        return

    id_cols = detect_place_id_columns()
    log(f"place-id columns present: {', '.join(id_cols) if id_cols else 'NONE'}")
    if "place_id" not in id_cols:
        log("  NOTE: `place_id` not found — the hours and website backfills select on"
            " that column, so geocoded clinics will not enter their queues.")

    clinics = get_candidates(limit)
    log(f"Processing {len(clinics)} clinic(s)\n")

    matched = out_of_state = no_match = failed = 0

    try:
        for i, c in enumerate(clinics, 1):
            npi = c["npi"]
            state = (c.get("state") or "").upper()
            place = places_lookup(query_for(c))
            time.sleep(SLEEP_BETWEEN_CALLS)

            loc = (place or {}).get("location") or {}
            lat, lon = loc.get("latitude"), loc.get("longitude")

            if place and lat is not None and in_state(state, lat, lon):
                payload = {
                    "latitude": lat,
                    "longitude": lon,
                    "google_maps_uri": place.get("googleMapsUri") or "",
                }
                for col in id_cols:
                    payload[col] = place.get("id")
                if patch(npi, payload):
                    matched += 1
                else:
                    failed += 1
            else:
                # Permanent outcome: record it so this clinic is never re-billed.
                # An out-of-state match usually means a bad address in the federal
                # record — the same signal fix_errant_locations.py flags for
                # outreach — and no result usually means the practice has closed.
                reason = "out of state" if place and lat is not None else "no match"
                if reason == "out of state":
                    out_of_state += 1
                else:
                    no_match += 1
                if not patch(npi, {"google_maps_uri": ""}):
                    failed += 1

            if i % 250 == 0:
                log(f"  {i}/{len(clinics)}  matched={matched} out_of_state={out_of_state} no_match={no_match}")
    finally:
        # The ledger must reflect every call actually made, however this run
        # ends (including the RESOURCE_EXHAUSTED abort) — this is what makes
        # next month's arithmetic trustworthy.
        if CALLS_MADE:
            try:
                ledger_flush()
                log(f"Ledger: {USAGE_SKU} at {_LEDGER_BASE + CALLS_MADE} of "
                    f"{MONTHLY_BUDGET} for {usage_month()}")
            except requests.RequestException as e:
                log(f"[warn] FINAL ledger flush failed ({e}) - record "
                    f"{CALLS_MADE} extra {USAGE_SKU} call(s) for "
                    f"{usage_month()} manually in google_api_usage.")

    log(f"\nDone. matched={matched} out_of_state={out_of_state} no_match={no_match} write_failures={failed}")
    log(f"Google calls made: {CALLS_MADE} (free tier 5,000/month)")

    remaining = max(backlog - len(clinics), 0) if backlog >= 0 else -1
    if remaining >= 0:
        log(f"Remaining backlog: {remaining}")

    if matched and DEPLOY_HOOK:
        requests.post(DEPLOY_HOOK, timeout=30)
        log("Triggered Cloudflare Pages rebuild.")


if __name__ == "__main__":
    main()
