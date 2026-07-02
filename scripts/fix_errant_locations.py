#!/usr/bin/env python3
"""
PainBeacon — errant location audit & fix.

Finds every clinic whose latitude/longitude falls OUTSIDE its listed state
(the "New York clinic pinned in Florida" bug) and, in FIX mode, repairs it:

  1. Re-looks the clinic up on Google Places (New) using its full NPPES
     address: "name, address, city, STATE zip".
  2. If Google returns a location INSIDE the listed state -> update
     latitude, longitude, google_place_id, google_maps_uri. Hours, rating,
     and review count are CLEARED because they came from the old, wrong
     match (the monthly hours backfill will re-fetch hours for the new
     place ID on its next run).
  3. If Google's best match is still outside the state, or no match found
     -> clear latitude, longitude, google_place_id, google_maps_uri, hours,
     rating, review count. No pin is better than a wrong pin.

Also reports (never auto-changes) clinics whose zone_slug state suffix
disagrees with their state column — those indicate a wrong ZIP in the
underlying NPPES record and are your best outreach candidates.

Outputs:
  errant_locations_report.csv   — every flagged clinic + action taken
  zone_state_mismatches.csv     — ZIP/state disagreements (report only)

Stdlib only — no pip install needed.

Usage (PowerShell):
  python scripts\\fix_errant_locations.py            # report only, no changes
  $env:FIX = "true"; python scripts\\fix_errant_locations.py   # apply fixes

Env vars:
  SUPABASE_URL           required
  SUPABASE_SERVICE_KEY   required
  GOOGLE_MAPS_API_KEY    required only in FIX mode
  FIX                    "true" to write changes (default: report only)
  CLOUDFLARE_DEPLOY_HOOK optional — if set and fixes were made, triggers rebuild
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
FIX = os.environ.get("FIX", "false").strip().lower() == "true"
DEPLOY_HOOK = os.environ.get("CLOUDFLARE_DEPLOY_HOOK", "")

if not SUPABASE_URL or not SERVICE_KEY:
    print("ERROR: set SUPABASE_URL and SUPABASE_SERVICE_KEY first.", file=sys.stderr)
    sys.exit(1)
if FIX and not GOOGLE_KEY:
    print("ERROR: FIX mode needs GOOGLE_MAPS_API_KEY.", file=sys.stderr)
    sys.exit(1)

# Approximate bounding boxes per state/territory: (lat_min, lat_max, lon_min, lon_max).
# A buffer is applied in-code, so borderline clinics near state lines never
# false-positive. Alaska is handled specially (crosses the antimeridian).
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
BUFFER = 0.35  # degrees of slack so border-town clinics never false-positive


def in_state(state, lat, lon):
    box = BOUNDS.get(state)
    if not box:
        return True  # unknown state code: don't flag what we can't check
    lat_min, lat_max, lon_min, lon_max = box
    if not (lat_min - BUFFER <= lat <= lat_max + BUFFER):
        return False
    if state == "AK":
        # Aleutian islands cross the antimeridian into positive longitudes.
        return (-180.0 <= lon <= -129.0 + BUFFER) or (170.0 <= lon <= 180.0)
    return lon_min - BUFFER <= lon <= lon_max + BUFFER


def guess_state(lat, lon):
    """Best-effort: which state's box do these coordinates fall in?"""
    hits = [s for s in BOUNDS if in_state(s, lat, lon)]
    return "/".join(sorted(hits)[:3]) if hits else "none (possibly outside US)"


def http_json(url, method="GET", headers=None, body=None, retries=3):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
                return json.loads(raw) if raw.strip() else {}
        except (urllib.error.URLError, urllib.error.HTTPError) as e:
            if attempt == retries:
                raise
            time.sleep(2 ** attempt)


def sb_get(path):
    return http_json(f"{SUPABASE_URL}/rest/v1/{path}", headers={
        "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
    })


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


def places_lookup(query):
    """Google Places (New) Text Search. Deliberately a fresh request each time
    (never a shared session) so Supabase auth headers can't leak to Google."""
    body = {"textQuery": query}
    out = http_json(
        "https://places.googleapis.com/v1/places:searchText",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_KEY,
            "X-Goog-FieldMask":
                "places.id,places.displayName,places.formattedAddress,"
                "places.location,places.googleMapsUri",
        },
        body=body,
    )
    places = out.get("places") or []
    return places[0] if places else None


def fetch_all_clinics():
    cols = ("npi,name,address_1,address_2,city,state,postal_code,phone,"
            "latitude,longitude,google_place_id,zone_slug,primary_npi")
    rows, offset, page = [], 0, 1000
    while True:
        batch = sb_get(f"clinics?select={cols}&limit={page}&offset={offset}")
        if not batch:
            break
        rows.extend(batch)
        offset += page
        if len(batch) < page:
            break
    return rows


def main():
    print(f"Mode: {'FIX (writing changes)' if FIX else 'REPORT ONLY (no changes)'}\n")
    clinics = fetch_all_clinics()
    print(f"Fetched {len(clinics):,} clinic rows.\n")

    coord_flagged, zone_flagged = [], []
    for c in clinics:
        state = (c.get("state") or "").upper().strip()

        # Check 1: coordinates vs listed state.
        lat, lon = c.get("latitude"), c.get("longitude")
        if lat is not None and lon is not None and state:
            try:
                lat, lon = float(lat), float(lon)
                if not in_state(state, lat, lon):
                    coord_flagged.append((c, lat, lon))
            except (TypeError, ValueError):
                pass

        # Check 2: zone_slug's state suffix vs the state column. A mismatch
        # means the ZIP itself put the clinic in another state's zone —
        # that's a wrong ZIP in the federal record. Report only.
        zs = c.get("zone_slug") or ""
        if zs and state and "-" in zs:
            if zs.rsplit("-", 1)[-1].upper() != state:
                zone_flagged.append(c)

    print(f"Coordinates outside listed state: {len(coord_flagged)}")
    print(f"Zone/state (ZIP) mismatches:      {len(zone_flagged)}\n")

    report_rows = []
    fixes_made = 0

    for c, lat, lon in coord_flagged:
        state = (c.get("state") or "").upper().strip()
        name = c.get("name") or ""
        addr = ", ".join(x for x in [c.get("address_1"), c.get("city"),
                                     f"{state} {(c.get('postal_code') or '')[:5]}"] if x)
        row = {
            "npi": c["npi"], "name": name, "address": c.get("address_1") or "",
            "city": c.get("city") or "", "state": state,
            "zip": (c.get("postal_code") or "")[:5], "phone": c.get("phone") or "",
            "old_lat": lat, "old_lon": lon,
            "old_pin_appears_in": guess_state(lat, lon),
            "action": "flagged (report-only run)",
            "new_lat": "", "new_lon": "",
        }

        if FIX:
            place = None
            try:
                place = places_lookup(f"{name}, {addr}")
            except Exception as e:
                print(f"  Google lookup failed for NPI {c['npi']}: {e}", file=sys.stderr)
            time.sleep(0.2)  # gentle on quota/rate limits

            loc = (place or {}).get("location") or {}
            g_lat, g_lon = loc.get("latitude"), loc.get("longitude")

            if g_lat is not None and in_state(state, g_lat, g_lon):
                sb_patch(c["npi"], {
                    "latitude": g_lat, "longitude": g_lon,
                    "google_place_id": place.get("id"),
                    "google_maps_uri": place.get("googleMapsUri"),
                    "hours": None, "aggregate_rating": None, "review_count": None,
                })
                row["action"] = "re-matched inside state (hours/rating cleared for re-fetch)"
                row["new_lat"], row["new_lon"] = g_lat, g_lon
            elif g_lat is not None:
                sb_patch(c["npi"], {
                    "latitude": None, "longitude": None, "google_place_id": None,
                    "google_maps_uri": None, "hours": None,
                    "aggregate_rating": None, "review_count": None,
                })
                row["action"] = ("ADDRESS ITSELF RESOLVES OUT OF STATE — federal record "
                                 "likely wrong (enrichment cleared). Best outreach candidate.")
            else:
                sb_patch(c["npi"], {
                    "latitude": None, "longitude": None, "google_place_id": None,
                    "google_maps_uri": None, "hours": None,
                    "aggregate_rating": None, "review_count": None,
                })
                row["action"] = "no Google match found — enrichment cleared (no pin > wrong pin)"
            fixes_made += 1

        report_rows.append(row)
        print(f"  NPI {row['npi']}  {name[:40]:40s}  {row['city']}, {state}"
              f"  pin was in: {row['old_pin_appears_in']}  ->  {row['action']}")

    with open("errant_locations_report.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(report_rows[0].keys()) if report_rows else
                           ["npi", "name", "address", "city", "state", "zip", "phone",
                            "old_lat", "old_lon", "old_pin_appears_in", "action",
                            "new_lat", "new_lon"])
        w.writeheader()
        w.writerows(report_rows)

    with open("zone_state_mismatches.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["npi", "name", "address", "city", "state", "zip", "phone", "zone_slug"])
        for c in zone_flagged:
            w.writerow([c["npi"], c.get("name"), c.get("address_1"), c.get("city"),
                        c.get("state"), (c.get("postal_code") or "")[:5],
                        c.get("phone"), c.get("zone_slug")])

    print(f"\nWrote errant_locations_report.csv ({len(report_rows)} rows)")
    print(f"Wrote zone_state_mismatches.csv ({len(zone_flagged)} rows)")

    if FIX and fixes_made and DEPLOY_HOOK:
        try:
            urllib.request.urlopen(urllib.request.Request(DEPLOY_HOOK, method="POST"),
                                   timeout=30).read()
            print("Triggered Cloudflare Pages rebuild.")
        except Exception as e:
            print(f"Deploy hook failed ({e}) — trigger a rebuild manually.", file=sys.stderr)
    elif FIX and fixes_made:
        print("Fixes written. Push any commit (or use your deploy hook) to rebuild the site.")


if __name__ == "__main__":
    main()
