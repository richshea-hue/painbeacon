#!/usr/bin/env python3
"""
PainBeacon — re-match cleared clinic locations.

Reads errant_locations_report.csv (produced by fix_errant_locations.py) and
retries the Google Places lookup for every clinic in it. For each clinic:

  - Google returns a location INSIDE the clinic's listed state
      -> writes latitude, longitude, google_place_id, google_maps_uri
         (hours stay null; the monthly backfill re-fetches them)
  - Google's best match is OUTSIDE the state
      -> no write; flagged "address resolves out of state" (federal-record
         problem — strong outreach candidate)
  - Genuinely no result
      -> no write; flagged for manual review (possibly closed practice)

Unlike the first script, this one FAILS FAST: it tests one API call up front
and stops with the full error message if Google rejects it, instead of
quietly marking everything "no match."

Outputs: rematch_results.csv

Stdlib only. Run from the repo root (where errant_locations_report.csv is):

  python scripts\\rematch_cleared_locations.py

Env vars required:
  SUPABASE_URL
  SUPABASE_SERVICE_KEY
  GOOGLE_MAPS_API_KEY
"""

import csv
import json
import os
import sys
import time
import urllib.request
import urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
GOOGLE_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
CSV_IN = "errant_locations_report.csv"

if not SUPABASE_URL or not SERVICE_KEY or not GOOGLE_KEY:
    print("ERROR: set SUPABASE_URL, SUPABASE_SERVICE_KEY, and GOOGLE_MAPS_API_KEY.",
          file=sys.stderr)
    sys.exit(1)

# Catch the placeholder-paste problem before burning any API calls.
suspicious = ("PASTE" in GOOGLE_KEY.upper() or " " in GOOGLE_KEY
              or len(GOOGLE_KEY) < 30)
if suspicious:
    print("ERROR: GOOGLE_MAPS_API_KEY doesn't look like a real key "
          f"(value starts with: {GOOGLE_KEY[:12]!r}...).\n"
          "Set it to your actual Google Maps API key — the same value stored\n"
          "in the GitHub Actions secret — then re-run.", file=sys.stderr)
    sys.exit(1)

if not os.path.exists(CSV_IN):
    print(f"ERROR: {CSV_IN} not found. Run this from the repo root "
          "(the folder where fix_errant_locations.py wrote it).", file=sys.stderr)
    sys.exit(1)

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
BUFFER = 0.35


def in_state(state, lat, lon):
    box = BOUNDS.get(state)
    if not box:
        return True
    lat_min, lat_max, lon_min, lon_max = box
    if not (lat_min - BUFFER <= lat <= lat_max + BUFFER):
        return False
    if state == "AK":
        return (-180.0 <= lon <= -129.0 + BUFFER) or (170.0 <= lon <= 180.0)
    return lon_min - BUFFER <= lon <= lon_max + BUFFER


def places_lookup(query):
    """One Google Places (New) Text Search call. Raises with the FULL error
    body on failure so problems are visible, not swallowed."""
    req = urllib.request.Request(
        "https://places.googleapis.com/v1/places:searchText",
        data=json.dumps({"textQuery": query}).encode(),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_KEY,
            "X-Goog-FieldMask":
                "places.id,places.displayName,places.formattedAddress,"
                "places.location,places.googleMapsUri",
        })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            out = json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"Google API HTTP {e.code}: {body}") from None
    places = out.get("places") or []
    return places[0] if places else None


def sb_patch(npi, payload):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/clinics?npi=eq.{npi}",
        data=json.dumps(payload).encode(), method="PATCH",
        headers={
            "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json", "Prefer": "return=minimal",
        })
    with urllib.request.urlopen(req, timeout=60) as resp:
        resp.read()


def main():
    rows = list(csv.DictReader(open(CSV_IN, encoding="utf-8-sig")))
    print(f"Loaded {len(rows)} clinics from {CSV_IN}\n")

    # FAIL-FAST TEST: one call before touching the whole list.
    first = rows[0]
    test_q = (f"{first['name']}, {first['address']}, {first['city']}, "
              f"{first['state']} {first['zip']}")
    print(f"API test call: {test_q[:70]}...")
    try:
        places_lookup(test_q)
        print("API test OK — Google is answering. Processing all clinics.\n")
    except RuntimeError as e:
        print(f"\nAPI TEST FAILED — stopping before processing anything.\n\n{e}\n",
              file=sys.stderr)
        print("Common causes: wrong/placeholder API key, 'Places API (New)' not\n"
              "enabled on the key's project, or key restrictions blocking your\n"
              "computer. Fix and re-run — nothing was changed.", file=sys.stderr)
        sys.exit(1)

    results = []
    rematched = out_of_state = no_match = 0
    for r in rows:
        state = (r["state"] or "").upper().strip()
        q = f"{r['name']}, {r['address']}, {r['city']}, {state} {r['zip']}"
        outcome, g_addr, g_lat, g_lon = "", "", "", ""
        try:
            place = places_lookup(q)
        except RuntimeError as e:
            print(f"  NPI {r['npi']}: API error, skipping — {str(e)[:120]}",
                  file=sys.stderr)
            outcome = "api error — untouched, re-run later"
            place = None
        time.sleep(0.2)

        if place:
            loc = place.get("location") or {}
            g_lat, g_lon = loc.get("latitude"), loc.get("longitude")
            g_addr = place.get("formattedAddress") or ""
            if g_lat is not None and in_state(state, g_lat, g_lon):
                sb_patch(r["npi"], {
                    "latitude": g_lat, "longitude": g_lon,
                    "google_place_id": place.get("id"),
                    "google_maps_uri": place.get("googleMapsUri"),
                })
                outcome = "re-matched — coordinates restored"
                rematched += 1
            else:
                outcome = ("ADDRESS RESOLVES OUT OF STATE — likely wrong federal "
                           "record; strong outreach candidate")
                out_of_state += 1
        elif not outcome:
            outcome = "no Google result — review manually (possibly closed)"
            no_match += 1

        results.append({
            "npi": r["npi"], "name": r["name"], "city": r["city"],
            "state": state, "zip": r["zip"], "phone": r["phone"],
            "outcome": outcome, "google_address": g_addr,
            "new_lat": g_lat, "new_lon": g_lon,
        })
        print(f"  {r['npi']}  {r['name'][:40]:40s}  {outcome[:60]}")

    with open("rematch_results.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        w.writeheader()
        w.writerows(results)

    print(f"\nRe-matched (fixed): {rematched}")
    print(f"Out-of-state addresses (outreach!): {out_of_state}")
    print(f"No result (review): {no_match}")
    print("\nWrote rematch_results.csv")
    if rematched:
        print("Push a commit (or use the deploy hook) to rebuild the site "
              "with the restored pins.")


if __name__ == "__main__":
    main()
