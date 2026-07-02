#!/usr/bin/env python3
"""
PainBeacon — Medicare acceptance matcher.

Pulls the federal CMS "Medicare Fee-For-Service Public Provider Enrollment"
dataset (sourced from PECOS, refreshed quarterly by CMS) and matches every
NPI in it against your `clinics` table. Sets:

  accepts_medicare_cms = true   -> NPI found enrolled in Medicare
  accepts_medicare_cms = false  -> checked, NPI not found
  medicare_checked_at  = now (UTC) for every clinic processed

Only touches `accepts_medicare_cms` / `medicare_checked_at`. Never touches
`accepts_medicare_self_reported` (that's set later by the clinic itself via
the claim form, and always takes precedence on the site).

Only PRIMARY clinics are updated (mirrors the isPrimary convention used
elsewhere in the codebase: primary_npi is null OR primary_npi == npi).
Folded duplicates are skipped — set PRIMARY_ONLY = False below to include them.

Env vars required:
  SUPABASE_URL
  SUPABASE_SERVICE_KEY

Optional:
  DRY_RUN=true   -> fetch + match + print counts, but write nothing to Supabase

Usage:
  python medicare_match.py
"""

import os
import sys
import time
from datetime import datetime, timezone

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
DRY_RUN = os.environ.get("DRY_RUN", "false").strip().lower() == "true"

PRIMARY_ONLY = True

CMS_DATASET_ID = "2457ea29-fc82-48b0-86ec-3b0755de7515"
CMS_BASE = f"https://data.cms.gov/data-api/v1/dataset/{CMS_DATASET_ID}/data"
CMS_PAGE_SIZE = 5000

SUPABASE_PAGE_SIZE = 1000
UPDATE_CHUNK_SIZE = 200

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.", file=sys.stderr)
    sys.exit(1)


def sb_headers():
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def fetch_all_clinics():
    """Pull npi + primary_npi for every clinic, paginated. Bare requests.get —
    never reuse a Session across Supabase and CMS calls (Supabase auth headers
    would otherwise leak onto the CMS request)."""
    clinics = []
    offset = 0
    while True:
        url = (
            f"{SUPABASE_URL}/rest/v1/clinics"
            f"?select=npi,primary_npi&limit={SUPABASE_PAGE_SIZE}&offset={offset}"
        )
        resp = requests.get(url, headers=sb_headers(), timeout=60)
        resp.raise_for_status()
        page = resp.json()
        if not page:
            break
        clinics.extend(page)
        offset += SUPABASE_PAGE_SIZE
        if len(page) < SUPABASE_PAGE_SIZE:
            break
    return clinics


def fetch_cms_medicare_npis():
    """Paginate the full CMS PECOS enrollment file and return the set of all
    enrolled NPIs (as ints). No filter by specialty — we want a plain NPI
    match regardless of what specialty PECOS has the enrollment under."""
    npis = set()
    offset = 0
    page_num = 0
    while True:
        url = f"{CMS_BASE}?size={CMS_PAGE_SIZE}&offset={offset}"
        resp = None
        for attempt in range(4):
            try:
                resp = requests.get(url, timeout=90)
                resp.raise_for_status()
                break
            except requests.RequestException as e:
                if attempt == 3:
                    raise
                wait = 2 ** attempt
                print(f"  retry {attempt + 1} after error ({e}); waiting {wait}s", file=sys.stderr)
                time.sleep(wait)
        rows = resp.json()
        if not rows:
            break
        for row in rows:
            npi_val = row.get("NPI")
            if npi_val:
                try:
                    npis.add(int(npi_val))
                except (TypeError, ValueError):
                    pass
        offset += CMS_PAGE_SIZE
        page_num += 1
        if page_num % 20 == 0:
            print(f"  ...{offset:,} CMS rows scanned, {len(npis):,} unique NPIs so far")
        if len(rows) < CMS_PAGE_SIZE:
            break
    return npis


def is_primary(clinic):
    return clinic.get("primary_npi") is None or clinic.get("primary_npi") == clinic.get("npi")


def chunked(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def patch_clinics(npi_list, accepts_value, checked_at):
    if not npi_list:
        return
    for chunk in chunked(npi_list, UPDATE_CHUNK_SIZE):
        npi_filter = ",".join(str(n) for n in chunk)
        url = f"{SUPABASE_URL}/rest/v1/clinics?npi=in.({npi_filter})"
        body = {"accepts_medicare_cms": accepts_value, "medicare_checked_at": checked_at}
        if DRY_RUN:
            continue
        resp = requests.patch(url, headers=sb_headers(), json=body, timeout=60)
        resp.raise_for_status()


def main():
    print("Fetching clinic NPIs from Supabase...")
    clinics = fetch_all_clinics()
    print(f"  {len(clinics):,} clinic rows fetched")

    if PRIMARY_ONLY:
        clinics = [c for c in clinics if is_primary(c)]
        print(f"  {len(clinics):,} primary clinics after filtering duplicates")

    clinic_npis = [int(c["npi"]) for c in clinics if c.get("npi") is not None]

    print("Fetching CMS Medicare enrollment data (this pulls the full national file, several hundred pages)...")
    medicare_npis = fetch_cms_medicare_npis()
    print(f"  {len(medicare_npis):,} unique Medicare-enrolled NPIs nationally")

    matched = [n for n in clinic_npis if n in medicare_npis]
    unmatched = [n for n in clinic_npis if n not in medicare_npis]

    checked_at = datetime.now(timezone.utc).isoformat()

    print(f"\nResults: {len(matched):,} clinics matched (Medicare confirmed), "
          f"{len(unmatched):,} not found in CMS file")

    if DRY_RUN:
        print("\nDRY_RUN=true — no writes made to Supabase.")
        return

    print("Writing accepts_medicare_cms = true for matched clinics...")
    patch_clinics(matched, True, checked_at)

    print("Writing accepts_medicare_cms = false for unmatched clinics...")
    patch_clinics(unmatched, False, checked_at)

    print("\nDone.")


if __name__ == "__main__":
    main()
