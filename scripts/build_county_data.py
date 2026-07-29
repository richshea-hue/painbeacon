"""Builds src/data/county_data.json for the Pain Care Deserts research page.

Downloads public Census Bureau data (no API key needed):
  1. 2020 ZCTA-to-county relationship file — maps each 5-digit ZIP Code
     Tabulation Area to the county containing most of its land area.
  2. Vintage 2024 county population estimates.
  3. The ZCTA-to-county-subdivision relationship file and current subdivision
     boundaries, used only to repair ZCTAs the county file cannot place.

Note the vintage seam: the relationship file is fixed to 2020 geography while
the population estimates are current, so a state that has redefined its
county-equivalents since 2020 appears in one file and not the other.
Connecticut did exactly that, replacing its eight counties with nine planning
regions, which left every Connecticut ZIP unmappable and — because clinics are
counted per ZIP — reported all 3.7M residents as living in a pain care desert.
repair_via_cousub() closes that seam by routing through towns, which the
redefinition left intact.

Output shape (kept compact — it is committed and imported at build time):
  {
    "vintage": "2024",
    "counties": { "01001": {"n": "Autauga County", "st": "AL", "p": 60342}, ... },
    "zipToCounty": { "36003": "01001", ... }
  }

Scope: 50 states + DC (3,144 counties). Territories are excluded because the
population-estimate file doesn't cover them.

Usage: python scripts/build_county_data.py
Re-run only when the Census posts new vintages (annually) — the output is
otherwise stable.
"""

import csv
import io
import json
import os
import urllib.parse
import urllib.request

ZCTA_REL_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/"
    "tab20_zcta520_county20_natl.txt"
)
# Same relationship, but to county subdivisions (towns). Used only to repair
# ZCTAs the county file cannot place — see repair_via_cousub().
ZCTA_COUSUB_REL_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/"
    "tab20_zcta520_cousub20_natl.txt"
)
POP_URL = (
    "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/"
    "counties/totals/co-est2024-alldata.csv"
)
# Current county subdivisions, which carry each town's *present* county code.
COUSUB_LAYER_URL = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
    "tigerWMS_ACS2024/MapServer/22/query"
)

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data", "county_data.json")

STATE_FIPS_TO_ABBR = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
    "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
    "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY",
}


def fetch(url):
    print(f"Downloading {url} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "painbeacon-data-build/1.0"})
    with urllib.request.urlopen(req) as r:
        return r.read()


def build_counties():
    """fips -> {n: name, st: abbr, p: population}"""
    raw = fetch(POP_URL).decode("latin-1")
    counties = {}
    for row in csv.DictReader(io.StringIO(raw)):
        if row["SUMLEV"] != "050":  # county-level records only
            continue
        fips = row["STATE"].zfill(2) + row["COUNTY"].zfill(3)
        abbr = STATE_FIPS_TO_ABBR.get(row["STATE"].zfill(2))
        if not abbr:
            continue
        counties[fips] = {
            "n": row["CTYNAME"],
            "st": abbr,
            "p": int(row["POPESTIMATE2024"]),
        }
    print(f"  {len(counties)} counties")
    return counties


def build_zip_map(counties):
    """zip5 -> county fips, choosing the county with the largest land-area
    overlap when a ZCTA spans county lines (the standard assignment rule)."""
    raw = fetch(ZCTA_REL_URL).decode("utf-8", errors="replace")
    best = {}  # zip -> (arealand, fips)
    orphans = {}  # zip -> set of state fips whose counties we did not recognise
    for row in csv.DictReader(io.StringIO(raw), delimiter="|"):
        z = row["GEOID_ZCTA5_20"].strip()
        fips = row["GEOID_COUNTY_20"].strip()
        if not z or not fips:
            continue
        if fips not in counties:
            # The relationship file is fixed to 2020 geography. Where a state
            # has since redefined its county-equivalents, every one of its ZCTAs
            # lands here and would otherwise be dropped in silence.
            orphans.setdefault(z, set()).add(fips[:2])
            continue
        area = int(row["AREALAND_PART"] or 0)
        if z not in best or area > best[z][0]:
            best[z] = (area, fips)

    unplaced = {z: states for z, states in orphans.items() if z not in best}
    if unplaced:
        repaired = repair_via_cousub(unplaced, counties)
        best.update({z: (0, fips) for z, fips in repaired.items()})

    zip_map = {z: fips for z, (_, fips) in best.items()}
    print(f"  {len(zip_map)} ZCTAs mapped")
    return zip_map


def fetch_cousub_to_county(state_fips):
    """Current town -> county fips, keyed by (state, 5-digit subdivision code).

    County subdivisions survive a county redefinition — Connecticut's planning
    regions are unions of whole towns — so they are a stable bridge from the
    2020 relationship file to present-day county codes.
    """
    mapping = {}
    for st in sorted(state_fips):
        params = urllib.parse.urlencode({
            "where": f"STATE='{st}'",
            "outFields": "GEOID",
            "returnGeometry": "false",
            "f": "json",
        })
        data = json.loads(fetch(f"{COUSUB_LAYER_URL}?{params}"))
        for feature in data.get("features", []):
            geoid = feature.get("attributes", {}).get("GEOID", "")
            if len(geoid) != 10:
                continue
            # GEOID is state(2) + county(3) + subdivision(5).
            mapping[(geoid[:2], geoid[5:])] = geoid[:5]
        print(f"  {st}: {sum(1 for k in mapping if k[0] == st)} subdivisions")
    return mapping


def repair_via_cousub(unplaced, counties):
    """Re-place ZCTAs whose 2020 county no longer exists, via county subdivisions.

    Applies the same largest-land-area rule as build_zip_map, just summed over
    the towns a ZCTA covers rather than read straight off the county file.
    """
    states = {st for sts in unplaced.values() for st in sts if st in STATE_FIPS_TO_ABBR}
    if not states:
        return {}

    print(f"{len(unplaced)} ZCTAs have no current county; repairing via subdivisions")
    cousub_to_county = fetch_cousub_to_county(states)

    raw = fetch(ZCTA_COUSUB_REL_URL).decode("utf-8", errors="replace")
    areas = {}  # zip -> {county fips: land area}
    for row in csv.DictReader(io.StringIO(raw), delimiter="|"):
        z = row["GEOID_ZCTA5_20"].strip()
        if z not in unplaced:
            continue
        geoid = row["GEOID_COUSUB_20"].strip()
        if len(geoid) != 10:
            continue
        fips = cousub_to_county.get((geoid[:2], geoid[5:]))
        if fips is None or fips not in counties:
            continue
        area = int(row["AREALAND_PART"] or 0)
        areas.setdefault(z, {})[fips] = areas.setdefault(z, {}).get(fips, 0) + area

    repaired = {z: max(by_county.items(), key=lambda kv: kv[1])[0] for z, by_county in areas.items()}

    still_missing = sorted(set(unplaced) - set(repaired))
    print(f"  repaired {len(repaired)} ZCTAs")
    if still_missing:
        print(f"  {len(still_missing)} still unplaced (expected for territories): "
              f"{', '.join(still_missing[:8])}{' ...' if len(still_missing) > 8 else ''}")
    return repaired


def main():
    counties = build_counties()
    zip_map = build_zip_map(counties)
    out = {"vintage": "2024", "counties": counties, "zipToCounty": zip_map}
    with open(os.path.abspath(OUT_PATH), "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    size_kb = os.path.getsize(os.path.abspath(OUT_PATH)) // 1024
    print(f"Wrote {OUT_PATH} ({size_kb} KB)")


if __name__ == "__main__":
    main()
