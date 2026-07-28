"""Builds src/data/county_data.json for the Pain Care Deserts research page.

Downloads two public Census Bureau files (no API key needed):
  1. 2020 ZCTA-to-county relationship file — maps each 5-digit ZIP Code
     Tabulation Area to the county containing most of its land area.
  2. Vintage 2024 county population estimates.

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
import urllib.request

ZCTA_REL_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/"
    "tab20_zcta520_county20_natl.txt"
)
POP_URL = (
    "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/"
    "counties/totals/co-est2024-alldata.csv"
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
    for row in csv.DictReader(io.StringIO(raw), delimiter="|"):
        z = row["GEOID_ZCTA5_20"].strip()
        fips = row["GEOID_COUNTY_20"].strip()
        if not z or fips not in counties:
            continue
        area = int(row["AREALAND_PART"] or 0)
        if z not in best or area > best[z][0]:
            best[z] = (area, fips)
    zip_map = {z: fips for z, (_, fips) in best.items()}
    print(f"  {len(zip_map)} ZCTAs mapped")
    return zip_map


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
