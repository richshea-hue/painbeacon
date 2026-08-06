#!/usr/bin/env python3
"""
seed_geocodes_from_cache.py — fill PainBeacon's coordinate gap from Places
responses that were ALREADY PAID FOR, making zero Google calls.

Why this exists
---------------
`backfill_geocodes.py` buys coordinates from Text Search at 4,000 calls/run.
But the candor-nppes data engine already ran `enrich_places.py` over the same
NPPES pain-clinic set and cached every response to disk, keyed by NPI — the
same key PainBeacon uses. Those 11,413 responses are spent money sitting on a
local disk. This script harvests them first, so the paid job only has to cover
whatever the cache genuinely doesn't have.

This is a drop-in substitute for a `backfill_geocodes.py` run: it writes the
same columns (latitude, longitude, google_maps_uri, and whichever place-id
column exists) after the same in-state validation, and selects the same
candidates. It just reads a JSON file instead of billing an API.

What the cache does and does not have
-------------------------------------
`enrich_places.py` was run at `--tier basic`, whose field mask requests
location + rating + reviews but NOT websiteUri or regularOpeningHours. So the
cache CAN fill coordinates, and CANNOT fill hours or websites — every cached
`hours` and `website` value is an empty string (the script writes its whole
schema regardless of tier). Do not read empty as "Google has none".

Deliberately NOT written here, though the cache holds them:
  aggregate_rating / review_count — these feed src/lib/ranking.js, so writing
  them would reorder live search results. That is a separate, reviewable
  change, not a side effect of filling in map pins.

On MIN_CONFIDENCE, and why 0.50 is not a compromise
---------------------------------------------------
enrich_places.py scores each match as
    0.45 * (clinic ZIP == place ZIP) + 0.55 * (name-token overlap)
and clamps anything with zero name overlap to 0.34 — below its own 0.50 accept
floor. So every entry this script will use has real name agreement, not just a
shared ZIP; that clamp is what stops same-building neighbours matching.

Worth knowing before raising the floor: `backfill_geocodes.py` — the paid job
this replaces — takes the FIRST Text Search result with no name scoring at all,
validating only `in_state`. Seeding from the cache at 0.50 is therefore stricter
than what the paid job would have written for the same clinic, not looser. The
run prints the confidence spread of what it is about to write so the floor stays
a visible decision; raise MIN_CONFIDENCE if you want only the strongest matches.

Why a cache miss is never recorded as a failure
-----------------------------------------------
`backfill_geocodes.py` writes `google_maps_uri = ''` as a permanent
"tried and failed, never retry" marker. This script NEVER writes that marker.
A clinic absent from the cache, or whose cached pin fails state validation,
has not been tried against Google at all — marking it would permanently
exclude it from the paid job and silently shrink the map.

Run it
------
    # Never commit credentials. Set them in the environment; .env is gitignored.
    set -a; . .env; set +a
    export PLACES_CACHE_DIR="/c/Users/Richs/OneDrive - TASTELOUDOUN.COM/Desktop/candor-nppes/output/places_cache"
    DRY_RUN=1 python scripts/seed_geocodes_from_cache.py   # report only
    python scripts/seed_geocodes_from_cache.py             # write

Env vars
  SUPABASE_URL, SUPABASE_SERVICE_KEY   service role key (NOT the anon key)
  PLACES_CACHE_DIR                     candor-nppes output/places_cache
  MIN_CONFIDENCE  optional, default 0.50 — matches enrich_places.py's ACCEPT
  LIMIT           optional cap on clinics processed this run (0 = all)
  DRY_RUN         "1" = report what would be written, write nothing
"""

import json
import os
import sys

import requests

CACHE_DIR = os.environ.get("PLACES_CACHE_DIR", "").strip()
MIN_CONFIDENCE = float(os.environ.get("MIN_CONFIDENCE") or "0.50")
LIMIT = int(os.environ.get("LIMIT") or "0")
DRY_RUN = os.environ.get("DRY_RUN", "") == "1"
SUPABASE_TIMEOUT = 30
PAGE = 1000

try:
    SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
    SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
except KeyError as e:
    print(f"[fatal] missing env var: {e}", file=sys.stderr)
    sys.exit(1)

if not CACHE_DIR or not os.path.isdir(CACHE_DIR):
    print(f"[fatal] PLACES_CACHE_DIR not set or not a directory: {CACHE_DIR!r}",
          file=sys.stderr)
    sys.exit(1)

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# Approximate bounding boxes per state/territory: (lat_min, lat_max, lon_min,
# lon_max). Kept in step with the copies in backfill_geocodes.py and
# fix_errant_locations.py — each script in this family is standalone by
# convention, so the table is duplicated rather than shared.
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
# Supabase — same queries and columns as backfill_geocodes.py
# ---------------------------------------------------------------------------
def detect_place_id_columns():
    found = []
    for col in ("place_id", "google_place_id"):
        r = requests.get(f"{SUPABASE_URL}/rest/v1/clinics", headers=SB_HEADERS,
                         params={"select": col, "limit": "1"},
                         timeout=SUPABASE_TIMEOUT)
        if r.status_code == 200:
            found.append(col)
    return found


def get_candidates():
    """Every clinic with no coordinates that has not already been tried.

    Paged, because unlike the billed job there is no per-run call budget to
    cap this at — the whole backlog can be served from disk in one pass.
    """
    out = []
    for offset in range(0, 200_000, PAGE):
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/clinics",
            headers=dict(SB_HEADERS, Range=f"{offset}-{offset + PAGE - 1}",
                         **{"Range-Unit": "items"}),
            params={
                "select": "npi,name,city,state",
                "latitude": "is.null",
                "google_maps_uri": "is.null",
                "primary_npi": "is.null",
                "order": "npi.asc",
            },
            timeout=SUPABASE_TIMEOUT,
        )
        r.raise_for_status()
        batch = r.json()
        out.extend(batch)
        if len(batch) < PAGE:
            break
        if LIMIT and len(out) >= LIMIT:
            break
    return out[:LIMIT] if LIMIT else out


def patch(npi, payload):
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/clinics", headers=SB_HEADERS,
                       params={"npi": f"eq.{npi}"}, json=payload,
                       timeout=SUPABASE_TIMEOUT)
    if r.status_code >= 300:
        log(f"  !! PATCH {npi} failed {r.status_code}: {r.text[:200]}")
        return False
    return True


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
def read_cached(npi):
    """Cached enrichment for one NPI, or None.

    Returns None unless the entry carries usable coordinates: enrich_places.py
    only fills latitude/longitude for entries it scored as `matched`, and
    leaves them empty for `low_confidence` and `no_result`.
    """
    path = os.path.join(CACHE_DIR, f"{npi}.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return None

    try:
        lat = float(d.get("latitude"))
        lon = float(d.get("longitude"))
    except (TypeError, ValueError):
        return None

    try:
        conf = float(d.get("match_confidence") or 0)
    except (TypeError, ValueError):
        conf = 0.0
    if conf < MIN_CONFIDENCE:
        return None

    return {
        "latitude": lat,
        "longitude": lon,
        "google_maps_uri": (d.get("google_maps_uri") or "").strip(),
        "place_id": (d.get("google_place_id") or "").strip(),
        "confidence": conf,
        "status": d.get("status") or "",
    }


def main():
    cache_files = len([f for f in os.listdir(CACHE_DIR) if f.endswith(".json")])
    log(f"Cache: {cache_files} entries in {CACHE_DIR}")
    log(f"MIN_CONFIDENCE={MIN_CONFIDENCE}  LIMIT={LIMIT or 'all'}  DRY_RUN={DRY_RUN}")
    log("Google calls this run: 0 (by construction — this script has no API key)\n")

    id_cols = [] if DRY_RUN else detect_place_id_columns()
    if not DRY_RUN:
        log(f"place-id columns present: {', '.join(id_cols) if id_cols else 'NONE'}")

    clinics = get_candidates()
    log(f"Clinics with no coordinates, never attempted: {len(clinics)}\n")

    hits = wrote = failed = 0
    miss = low_conf_or_unmatched = out_of_state = 0
    samples = []
    # Confidence spread of what is actually being written, so the floor is a
    # visible decision rather than a buried default.
    bands = {"0.50-0.69": 0, "0.70-0.89": 0, "0.90-1.00": 0}

    for i, c in enumerate(clinics, 1):
        npi = str(c["npi"])
        state = (c.get("state") or "").upper()
        entry = read_cached(npi)

        if entry is None:
            # Absent from the cache, or cached without usable coordinates.
            # Either way it still needs the paid job — never marked as failed.
            if os.path.exists(os.path.join(CACHE_DIR, f"{npi}.json")):
                low_conf_or_unmatched += 1
            else:
                miss += 1
            continue

        if not in_state(state, entry["latitude"], entry["longitude"]):
            # Cached pin lands outside the clinic's listed state. No pin beats a
            # wrong pin, and this is left for the paid job rather than marked.
            out_of_state += 1
            continue

        hits += 1
        conf = entry["confidence"]
        bands["0.50-0.69" if conf < 0.70 else
              "0.70-0.89" if conf < 0.90 else "0.90-1.00"] += 1
        if len(samples) < 8:
            samples.append(f"  {npi}  {(c.get('name') or '')[:34]:<34} "
                           f"{c.get('city') or '':<16} {state}  "
                           f"{entry['latitude']:.4f},{entry['longitude']:.4f}  "
                           f"conf={entry['confidence']:.2f}")

        if DRY_RUN:
            continue

        payload = {
            "latitude": entry["latitude"],
            "longitude": entry["longitude"],
            "google_maps_uri": entry["google_maps_uri"],
        }
        if entry["place_id"]:
            for col in id_cols:
                payload[col] = entry["place_id"]
        if patch(npi, payload):
            wrote += 1
        else:
            failed += 1

        if i % 500 == 0:
            log(f"  {i}/{len(clinics)}  usable={hits} written={wrote}")

    if samples:
        log(("Sample of what would be written:" if DRY_RUN
             else "Sample of what was written:"))
        for s in samples:
            log(s)
        log("")

    log(f"{'Would fill' if DRY_RUN else 'Filled'} from cache : {hits}")
    if hits:
        log(f"  confidence spread      : " +
            ", ".join(f"{k} {v}" for k, v in bands.items()))
    if not DRY_RUN:
        log(f"  written                : {wrote}")
        log(f"  write failures         : {failed}")
    log(f"Not in cache             : {miss}")
    log(f"Cached, no usable coords : {low_conf_or_unmatched}")
    log(f"Rejected, out of state   : {out_of_state}")

    still_need_paid = miss + low_conf_or_unmatched + out_of_state
    log(f"\nStill needs the paid job : {still_need_paid}")
    if still_need_paid:
        runs = (still_need_paid + 3999) // 4000
        log(f"  {runs} run(s) of backfill_geocodes.py at 4,000/run "
            f"(Text Search Pro, 5,000/month free)")
    log("Google calls made        : 0")


if __name__ == "__main__":
    main()
