#!/usr/bin/env python3
"""
geocode_addresses.py — give unmapped clinics coordinates by geocoding their
ADDRESS, instead of trying to match them to a Google business listing.

Why this exists
---------------
`backfill_geocodes.py` asks Text Search to find the *business* ("ACME PAIN
CLINIC, 123 Main St, ...") and takes the top hit. For the 3,032 clinics still
unmapped that approach is exhausted: candor-nppes/enrich_places.py already ran
the identical query against the same endpoint and scored 2,879 of them
`low_confidence` and 143 `no_result`. Re-asking the same question gets the same
answers — the difference being that backfill_geocodes has no confidence scoring
and would write those rejected matches anyway, place_id included, which then
feeds the hours/website backfills and publishes another practice's details.

A map pin does not need a business identity. It needs the street address turned
into a point, which is what the Geocoding API does — no name matching involved,
so a clinic whose name Google has never heard still geocodes fine.

What this writes, and what it deliberately does not
---------------------------------------------------
Writes latitude + longitude ONLY.

Does NOT write place_id: the Geocoding API's place_id identifies an ADDRESS, not
a business, so feeding it to backfill_hours.py / backfill_websites.py would burn
Place Details Enterprise calls on a record that has no hours or website to
return, and record '' sentinels against clinics that were never really tried.
Coordinates are the deliverable; business enrichment stays a separate question.

Does NOT write google_maps_uri: that column holds a Places URL. Leaving it NULL
is safe — src/pages/clinic/[slug].astro falls back to a Maps search URL built
from the name and address (`const mapHref = c.google_maps_uri || ...`), and
mapMarkers only needs latitude/longitude.

Consequence worth stating plainly: these clinics become mappable but stay
unenriched (no hours, no website), because those queues select on a non-null
place id. That is strictly better than today (unmapped AND unenriched) and much
better than a wrong business match, but it is not full enrichment.

Quality gates
-------------
- `components=country:US` and the clinic's state, so a bad address cannot match
  something on another continent.
- APPROXIMATE results are REJECTED. Those resolve to a city or ZIP centroid, so
  accepting them would stack dozens of clinics on one identical point and read
  as a broken map. Only ROOFTOP, RANGE_INTERPOLATED and GEOMETRIC_CENTER are
  precise enough for a clinic pin.
- `partial_match` results are rejected: the geocoder had to guess at the input.
- Every accepted point is checked against the clinic's state bounds — the same
  "no pin is better than a wrong pin" rule the errant-location audit settled on.
- Failures are NOT marked in the database. `google_maps_uri = ''` is the Places
  jobs' permanent "tried and failed" sentinel and means something different;
  writing it here would also hide these clinics from any future Places work.
  Instead failures are written to a CSV, because an address that will not geocode
  is usually a bad federal record — the same signal fix_errant_locations.py
  flags for outreach. Re-runs naturally retry only the failures, since anything
  that succeeded now has a non-null latitude.

BILLING — VERIFY BEFORE THE FIRST LIVE RUN:
  This is the Geocoding SKU, which is NOT one of the three Places pools this
  repo already spends from (Place Details Enterprise, Text Search Enterprise,
  Text Search Pro). Confirm the current free allowance and per-call price in
  Billing → Reports, grouped by SKU, before running live — two SKU assumptions
  in this repo have already turned out wrong, and one of them cost $51.96.
  There is deliberately NO cron for this job: manual dispatch only.

Env vars
  SUPABASE_URL, SUPABASE_SERVICE_KEY   service role key (NOT the anon key)
  GOOGLE_MAPS_API_KEY                  needs the Geocoding API enabled
  LIMIT                                max geocode calls this run (default 500)
  MONTHLY_BUDGET                       hard cap on TOTAL calls this month across
                                       all runs (default 9000; ledger table
                                       google_api_usage, see google_usage_table.sql)
  DRY_RUN                              "1" = count + show sample queries only
  FAILURE_CSV                          default scripts/outreach/out/geocode_failures.csv
  CLOUDFLARE_DEPLOY_HOOK               OPTIONAL — POSTed if coordinates were written
"""

import csv
import os
import sys
import time

import requests

# Default 500, not the whole 3,032 backlog: the Geocoding free allowance is
# unverified for this account (see BILLING above), so the first live run should
# be small enough to check against Billing → Reports before committing to more.
LIMIT = int(os.environ.get("LIMIT") or "500")
DRY_RUN = os.environ.get("DRY_RUN", "") == "1"
FAILURE_CSV = os.environ.get("FAILURE_CSV") or "scripts/outreach/out/geocode_failures.csv"
SLEEP_BETWEEN_CALLS = 0.05      # 20 QPS, well under the Geocoding limit
GEOCODE_TIMEOUT = 15
SUPABASE_TIMEOUT = 30
PAGE = 1000

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

# --- Monthly budget ledger (google_api_usage table) -------------------------
# Per-run LIMIT cannot stop dispatches from STACKING within a month, so every
# live run first reads this month's spend from the ledger, clamps its LIMIT to
# what is left of MONTHLY_BUDGET, and records the calls it actually made
# (every LEDGER_FLUSH_EVERY calls, and again on exit, so an abort loses at
# most one flush interval). The table is created by google_usage_table.sql —
# live runs FAIL CLOSED if it is missing, because a billing guard that shrugs
# and continues is not a guard.
#
# Default budget 9,000: the Geocoding SKU's free allowance is BELIEVED to be
# 10,000/month under Essentials pricing but is UNVERIFIED for this billing
# account (see BILLING above — two SKU assumptions here have already been
# wrong). 9,000 leaves headroom for that risk plus the flush interval. Verify
# in Billing → Reports, then raise deliberately via the workflow input.
USAGE_SKU = "geocoding"
MONTHLY_BUDGET = int(os.environ.get("MONTHLY_BUDGET") or "9000")
LEDGER_FLUSH_EVERY = 25
CALLS_MADE = 0          # incremented by geocode() on every Google call
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

# Precise enough to pin a building. APPROXIMATE is excluded on purpose — see
# the Quality gates note above.
GOOD_LOCATION_TYPES = {"ROOFTOP", "RANGE_INTERPOLATED", "GEOMETRIC_CENTER"}

try:
    SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
    SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
    GOOGLE_KEY = os.environ["GOOGLE_MAPS_API_KEY"]
except KeyError as e:
    print(f"[fatal] missing env var: {e}", file=sys.stderr)
    sys.exit(1)

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# Approximate bounding boxes per state/territory: (lat_min, lat_max, lon_min,
# lon_max). Kept in step with the copies in backfill_geocodes.py,
# fix_errant_locations.py and seed_geocodes_from_cache.py — each script in this
# family is standalone by convention, so the table is duplicated rather shared.
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
def count_candidates():
    headers = dict(SB_HEADERS, Prefer="count=exact", Range="0-0")
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/clinics", headers=headers,
        params={"select": "npi", "latitude": "is.null",
                "primary_npi": "is.null", "address_1": "not.is.null"},
        timeout=SUPABASE_TIMEOUT)
    r.raise_for_status()
    return int(r.headers.get("Content-Range", "/0").split("/")[-1])


def get_candidates(limit):
    """Clinics with no coordinates that have a street address to geocode.

    Deliberately does NOT filter on google_maps_uri, unlike
    backfill_geocodes.py. That column's '' sentinel means "Places could not
    identify this business", which says nothing about whether the address
    geocodes — those clinics are exactly the ones this job exists to rescue.
    """
    out = []
    for offset in range(0, 200_000, PAGE):
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/clinics",
            headers=dict(SB_HEADERS, Range=f"{offset}-{offset + PAGE - 1}",
                         **{"Range-Unit": "items"}),
            params={
                "select": "npi,name,address_1,city,state,postal_code",
                "latitude": "is.null",
                "primary_npi": "is.null",
                "address_1": "not.is.null",
                "order": "npi.asc",
            },
            timeout=SUPABASE_TIMEOUT)
        r.raise_for_status()
        batch = r.json()
        out.extend(batch)
        if len(batch) < PAGE or len(out) >= limit:
            break
    return out[:limit]


def patch(npi, payload):
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/clinics", headers=SB_HEADERS,
                       params={"npi": f"eq.{npi}"}, json=payload,
                       timeout=SUPABASE_TIMEOUT)
    if r.status_code >= 300:
        log(f"  !! PATCH {npi} failed {r.status_code}: {r.text[:200]}")
        return False
    return True


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------
def address_for(c):
    """Street address only — no clinic name. The name is what defeated the
    Places matching; the address is what the geocoder actually needs."""
    zip5 = (c.get("postal_code") or "")[:5]
    parts = [c.get("address_1") or "", c.get("city") or "",
             f"{(c.get('state') or '').upper()} {zip5}".strip()]
    return ", ".join(p for p in parts if p)


def geocode(c):
    """Returns (lat, lon, location_type) or (None, None, reason_string).

    Raises RuntimeError on quota/auth failures so the caller aborts rather than
    grinding through the whole backlog logging the same error.
    """
    state = (c.get("state") or "").upper()
    params = {
        "address": address_for(c),
        "key": GOOGLE_KEY,
        # Constrain to the US and the clinic's own state so a malformed address
        # cannot match a same-named street in another country.
        "components": f"country:US|administrative_area:{state}" if state else "country:US",
    }
    global CALLS_MADE
    r = requests.get(GEOCODE_URL, params=params, timeout=GEOCODE_TIMEOUT)
    CALLS_MADE += 1
    if CALLS_MADE % LEDGER_FLUSH_EVERY == 0:
        try:
            ledger_flush()
        except requests.RequestException as e:
            # The next flush (or the final one) carries the running total, so
            # a transient ledger hiccup should not kill a healthy run.
            log(f"  [warn] ledger flush failed: {e}")
    if r.status_code >= 500:
        raise RuntimeError(f"Geocoding 5xx: {r.status_code}")
    try:
        data = r.json()
    except ValueError:
        return None, None, f"bad json (http {r.status_code})"

    status = data.get("status")
    if status in ("OVER_QUERY_LIMIT", "OVER_DAILY_LIMIT"):
        raise RuntimeError(f"Geocoding quota exhausted: {status} "
                           f"{data.get('error_message', '')[:200]}")
    if status == "REQUEST_DENIED":
        raise RuntimeError(f"Geocoding REQUEST_DENIED — is the Geocoding API "
                           f"enabled for this key? {data.get('error_message','')[:200]}")
    if status == "ZERO_RESULTS":
        return None, None, "zero_results"
    if status != "OK":
        return None, None, f"status {status}"

    results = data.get("results") or []
    if not results:
        return None, None, "no results array"
    top = results[0]

    if top.get("partial_match"):
        # The geocoder had to guess at the input — not good enough to pin.
        return None, None, "partial_match"

    geom = top.get("geometry") or {}
    loc_type = geom.get("location_type") or "?"
    if loc_type not in GOOD_LOCATION_TYPES:
        # Almost always APPROXIMATE: a city or ZIP centroid, which would stack
        # unrelated clinics on one identical point.
        return None, None, f"imprecise ({loc_type})"

    loc = geom.get("location") or {}
    lat, lon = loc.get("lat"), loc.get("lng")
    if lat is None or lon is None:
        return None, None, "no location in result"
    return float(lat), float(lon), loc_type


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    global _LEDGER_BASE
    backlog = count_candidates()
    log(f"Clinics with no coordinates that have a street address: {backlog}")
    log(f"LIMIT={LIMIT}  DRY_RUN={DRY_RUN}")
    # ASCII only in printed output: Windows consoles default to cp1252 and an
    # em dash or arrow raises UnicodeEncodeError mid-run.
    log("SKU: Geocoding (NOT one of the three Places pools) - verify the free "
        "allowance in Billing > Reports before a large run.\n")

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
                 f"raise MONTHLY_BUDGET deliberately AFTER verifying the free "
                 f"allowance in Billing > Reports.")
    _LEDGER_BASE = used

    clinics = get_candidates(limit)

    if DRY_RUN:
        log("Dry run - no Geocoding calls, no writes. Sample addresses that "
            "would be sent (note: no clinic name):")
        for c in clinics[:10]:
            log(f"  {c['npi']}  {address_for(c)}")
        if backlog and limit:
            runs = (backlog + limit - 1) // limit
            log(f"\nAt {limit}/run the backlog needs {runs} run(s).")
        return

    log(f"Processing {len(clinics)} clinic(s)\n")
    wrote = out_of_state = rejected = failed = 0
    failures = []

    try:
        for i, c in enumerate(clinics, 1):
            npi = c["npi"]
            state = (c.get("state") or "").upper()
            try:
                lat, lon, info = geocode(c)
            except RuntimeError as e:
                log(f"[abort] {e}")
                log(f"[abort] wrote={wrote} rejected={rejected} out_of_state={out_of_state}")
                break
            time.sleep(SLEEP_BETWEEN_CALLS)

            if lat is None:
                rejected += 1
                failures.append({"npi": npi, "name": c.get("name") or "",
                                 "address": address_for(c), "reason": info})
            elif not in_state(state, lat, lon):
                # Geocoded, but outside the state the federal record claims.
                out_of_state += 1
                failures.append({"npi": npi, "name": c.get("name") or "",
                                 "address": address_for(c),
                                 "reason": f"out_of_state ({lat:.4f},{lon:.4f})"})
            elif patch(npi, {"latitude": lat, "longitude": lon}):
                wrote += 1
            else:
                failed += 1

            if i % 100 == 0:
                log(f"  {i}/{len(clinics)}  wrote={wrote} rejected={rejected} "
                    f"out_of_state={out_of_state}")
    finally:
        # The ledger must reflect every call actually made, however this run
        # ends — this is what makes next month's arithmetic trustworthy.
        if CALLS_MADE:
            try:
                ledger_flush()
                log(f"Ledger: {USAGE_SKU} at {_LEDGER_BASE + CALLS_MADE} of "
                    f"{MONTHLY_BUDGET} for {usage_month()}")
            except requests.RequestException as e:
                log(f"[warn] FINAL ledger flush failed ({e}) - record "
                    f"{CALLS_MADE} extra {USAGE_SKU} call(s) for "
                    f"{usage_month()} manually in google_api_usage.")

    log(f"\nDone. wrote={wrote} rejected={rejected} out_of_state={out_of_state} "
        f"write_failures={failed}")
    log(f"Geocoding calls made: {CALLS_MADE}")

    if failures:
        os.makedirs(os.path.dirname(FAILURE_CSV) or ".", exist_ok=True)
        with open(FAILURE_CSV, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["npi", "name", "address", "reason"])
            w.writeheader()
            w.writerows(failures)
        log(f"\n{len(failures)} address(es) could not be pinned -> {FAILURE_CSV}")
        log("Not marked in the database: an address that will not geocode is "
            "usually a bad federal record, which is an outreach signal rather "
            "than a permanent dead end. Re-runs retry only these.")

    hook = os.environ.get("CLOUDFLARE_DEPLOY_HOOK", "").strip()
    if wrote and hook:
        try:
            requests.post(hook, timeout=30).raise_for_status()
            log("[deploy] Cloudflare deploy hook triggered - new pins go live on rebuild.")
        except requests.RequestException as e:
            log(f"[warn] deploy hook failed: {e}")


if __name__ == "__main__":
    main()
