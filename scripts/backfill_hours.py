#!/usr/bin/env python3
"""
PainBeacon — targeted HOURS backfill.

Why this exists
---------------
The original Google Places enrichment (enrich_places.py, in the candor-nppes
data-engine folder) was run at the "basic" field tier, which pulls rating + geo
but NOT opening hours. So clinics show real ratings/reviews/map links but
"Hours: —". Re-running full-tier enrichment re-pays for every field on every
clinic. This script instead asks Google for ONLY the hours field, and ONLY for
clinics that were already enriched (they have a stored google_place_id) but are
missing hours. Cheapest possible way to fill the gap.

What it does
------------
  1. Reads the `clinics` table for rows that HAVE a google_place_id but have
     NULL/blank `hours`.
  2. For each, calls Place Details (New) with field mask `id,regularOpeningHours`
     — the single Contact-tier field we need (Place Details Pro SKU, first 5,000
     calls/month free as of 2026; verify current pricing before a large run).
  3. Joins Google's `weekdayDescriptions` with "; " — which is already the exact
     string format the site renders (c.hours.split(';')) — and writes it back to
     `clinics.hours`.
  4. Caches every Google response under ./places_hours_cache/ so reruns are free
     and resumable. Kill and restart freely.
  5. Optionally pings the Cloudflare deploy hook so the site rebuilds.

Run it
------
    # 1) Dry run — counts candidates, makes ZERO Google calls, writes nothing:
    DRY_RUN=1 \
    SUPABASE_URL=https://eojjpozaoanwqzngxtuz.supabase.co \
    SUPABASE_SERVICE_KEY=... \
    GOOGLE_MAPS_API_KEY=... \
    python scripts/backfill_hours.py

    # 2) Small paid test (caps billable calls at 50):
    LIMIT=50 SUPABASE_URL=... SUPABASE_SERVICE_KEY=... GOOGLE_MAPS_API_KEY=... \
    python scripts/backfill_hours.py

    # 3) Full run (optionally one state at a time, and trigger a rebuild after):
    STATE=NV CLOUDFLARE_DEPLOY_HOOK=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
    GOOGLE_MAPS_API_KEY=... python scripts/backfill_hours.py

Env vars
--------
  SUPABASE_URL            e.g. https://eojjpozaoanwqzngxtuz.supabase.co
  SUPABASE_SERVICE_KEY    service-role key (server-side only — never in site code)
  GOOGLE_MAPS_API_KEY     Places API (New) key, billing enabled
  DRY_RUN                 "1" = report candidates, no Google calls, no writes
  LIMIT                   max clinics to process this run (0 = no cap). Use a
                          small number for your first paid run.
  STATE                   optional 2-letter filter, e.g. NV (backfill one state)
  CLOUDFLARE_DEPLOY_HOOK  optional; Pages deploy-hook URL to rebuild when done
  SLEEP_MS                optional per-call pause in ms (default 60)
"""

import json
import os
import sys
import time

import requests

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or ""
GOOGLE_KEY = os.environ.get("GOOGLE_MAPS_API_KEY") or ""
DRY_RUN = os.environ.get("DRY_RUN", "") == "1"
LIMIT = int(os.environ.get("LIMIT", "0") or "0")
STATE = (os.environ.get("STATE", "") or "").strip().upper()
DEPLOY_HOOK = os.environ.get("CLOUDFLARE_DEPLOY_HOOK") or ""
SLEEP_MS = int(os.environ.get("SLEEP_MS", "60") or "60")
# Folded duplicate records (primary_npi points at a different NPI) don't render
# as their own pages — only primaries show to users. Skip duplicates by default
# so you don't pay Google for hours on pages nobody sees. Set PRIMARY_ONLY=0 to
# include everything.
PRIMARY_ONLY = os.environ.get("PRIMARY_ONLY", "1") == "1"

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "places_hours_cache")
PLACES_URL = "https://places.googleapis.com/v1/places/{pid}"

S = requests.Session()
S.headers.update({"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"})


def log(msg):
    print(f"[hours] {msg}", flush=True)


def die(msg):
    log("ERROR: " + msg)
    sys.exit(1)


def fetch_candidates():
    """Rows with a google_place_id but no usable hours. Read from the base
    `clinics` table with the service key (sees all columns, bypasses RLS)."""
    out = []
    page = 1000
    select = "npi,name,state,google_place_id,hours,primary_npi"
    base = (f"{SUPABASE_URL}/rest/v1/clinics?select={select}"
            f"&google_place_id=not.is.null")
    if STATE:
        base += f"&state=eq.{STATE}"
    for offset in range(0, 10_000_000, page):
        r = S.get(base, headers={"Range": f"{offset}-{offset + page - 1}",
                                 "Range-Unit": "items"})
        if not r.ok:
            die(f"Supabase read {r.status_code}: {r.text[:300]}")
        batch = r.json()
        out.extend(batch)
        if len(batch) < page:
            break

    def is_primary(c):
        p = c.get("primary_npi")
        return p is None or str(p) == str(c.get("npi"))

    # Keep only those genuinely missing hours, with a non-empty place id, and
    # (by default) only primary practice records that actually render.
    cand = [c for c in out
            if (c.get("google_place_id") or "").strip()
            and not (c.get("hours") or "").strip()
            and (not PRIMARY_ONLY or is_primary(c))]
    return cand


def cache_path(pid):
    safe = "".join(ch if ch.isalnum() else "_" for ch in pid)[:120]
    return os.path.join(CACHE_DIR, safe + ".json")


def place_hours(pid):
    """Return the '; '-joined weekday hours string for a place id, or None.
    Uses a local cache; only calls Google on a cache miss."""
    cp = cache_path(pid)
    if os.path.exists(cp):
        with open(cp) as f:
            data = json.load(f)
    else:
        clean = pid.split("/")[-1]  # accept bare id or 'places/ID'
        # IMPORTANT: use a bare requests.get (NOT the shared session S). S carries
        # the Supabase Authorization: Bearer header, and Google would treat that
        # as an (invalid) OAuth token and reject the call with a 401 — even though
        # the X-Goog-Api-Key is valid. A fresh request sends only these headers.
        r = requests.get(
            PLACES_URL.format(pid=clean),
            headers={"X-Goog-Api-Key": GOOGLE_KEY,
                     "X-Goog-FieldMask": "id,regularOpeningHours"},
            timeout=30,
        )
        if r.status_code == 404:
            data = {"_notfound": True}
        elif not r.ok:
            log(f"  Places {r.status_code} for {pid}: {r.text[:160]}")
            return None
        else:
            data = r.json()
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(cp, "w") as f:
            json.dump(data, f)
    desc = (((data or {}).get("regularOpeningHours") or {})
            .get("weekdayDescriptions") or [])
    desc = [d for d in desc if d and d.strip()]
    return "; ".join(desc) if desc else None


def write_hours(npi, hours):
    r = S.patch(
        f"{SUPABASE_URL}/rest/v1/clinics?npi=eq.{npi}",
        headers={"Content-Type": "application/json", "Prefer": "return=minimal"},
        data=json.dumps({"hours": hours}),
    )
    if not r.ok:
        log(f"  WRITE FAILED npi={npi}: {r.status_code} {r.text[:160]}")
        return False
    return True


def main():
    if not SUPABASE_URL or not SERVICE_KEY:
        die("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.")
    if not DRY_RUN and not GOOGLE_KEY:
        die("GOOGLE_MAPS_API_KEY is required for a live run (or set DRY_RUN=1).")

    log(f"Reading clinics{' in ' + STATE if STATE else ''} with a place_id but no hours"
        + (" (primaries only)" if PRIMARY_ONLY else " (incl. duplicates)") + "…")
    cand = fetch_candidates()
    log(f"Candidates missing hours: {len(cand)}")

    if DRY_RUN:
        for c in cand[:10]:
            log(f"  would backfill: {c.get('name','?')} ({c.get('state','?')}) npi={c.get('npi')}")
        more = max(0, len(cand) - 10)
        if more:
            log(f"  …and {more} more.")
        log("DRY RUN — no Google calls made, nothing written. "
            f"A live run would make up to {len(cand) if not LIMIT else min(LIMIT, len(cand))} "
            "billable Place Details calls (Pro tier; first 5,000/month free).")
        return

    todo = cand if not LIMIT else cand[:LIMIT]
    log(f"Processing {len(todo)} clinic(s)"
        + (f" (LIMIT={LIMIT})" if LIMIT else "") + "…")

    filled = no_hours = failed = 0
    for i, c in enumerate(todo, 1):
        pid = c["google_place_id"].strip()
        hours = place_hours(pid)
        if hours is None:
            no_hours += 1
        else:
            if write_hours(c["npi"], hours):
                filled += 1
                if filled <= 8:
                    log(f"  ✓ {c.get('name','?')} ({c.get('state','?')}): {hours.split(';')[0].strip()} …")
            else:
                failed += 1
        if i % 100 == 0:
            log(f"  …{i}/{len(todo)} done (filled {filled}, no-hours {no_hours}, failed {failed})")
        if SLEEP_MS:
            time.sleep(SLEEP_MS / 1000.0)

    log(f"Done. hours written: {filled}; Google returned no hours: {no_hours}; "
        f"write failures: {failed}; candidates remaining (over LIMIT): "
        f"{max(0, len(cand) - len(todo))}")

    if filled and DEPLOY_HOOK:
        log("Triggering Cloudflare rebuild so the new hours render…")
        try:
            requests.post(DEPLOY_HOOK, timeout=30)
            log("Rebuild triggered.")
        except Exception as e:
            log(f"Deploy hook failed (rebuild manually): {e}")
    elif filled:
        log("No deploy hook set — push any commit or click Redeploy to show the new hours.")


if __name__ == "__main__":
    main()
