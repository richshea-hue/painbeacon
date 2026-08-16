#!/usr/bin/env python3
"""
clear_low_confidence_matches.py — remove hours (and the place id that fetched
them) from clinics whose Google business match scored below the accept floor.

The defect
----------
candor-nppes/enrich_places.py scores every Text Search match and, below its
ACCEPT floor of 0.50, deliberately withholds the coordinates, rating and review
count — but it still records the candidate `google_place_id`. That id was loaded
into PainBeacon. `backfill_hours.py` then selects on `google_place_id IS NOT
NULL`, which silently readmitted every match enrich_places had rejected, fetched
Place Details for the WRONG business and wrote its hours onto the clinic's
public profile.

Measured 2026-08-08: 2,094 clinics display hours obtained this way — 31% of all
published hours. Examples, all scoring 0.34 (the clamp enrich_places applies
when name overlap is exactly zero):

  TOLLER ENTERPRISES LLC            <- hours from "Pleasant View Healthcare Center"
  PROFESSIONAL PAIN MANAGEMENT P.C. <- hours from "Riverdale Physical Therapy"

Neither component is wrong on its own; the gap is between them. Both are
behaving as designed.

What is NOT affected (verified, not assumed)
-------------------------------------------
- `aggregate_rating` / `review_count`: zero rows in any sub-threshold band carry
  them, because enrich_places withheld them together with the coordinates. So
  src/lib/ranking.js is NOT skewed and search order is intact.
- `website`: 2 rows only, because backfill_websites.py has never run. Keep it
  that way until this is cleaned up — a wrong website sends a patient to another
  business, which is worse than wrong hours.
- Claimed listings: every affected row is `free` tier, so nothing here can
  overwrite an owner's deliberate edit.

What this clears, and why each one
----------------------------------
- `hours`   -> NULL. Wrong opening times are the user-facing harm.
- `google_place_id` -> NULL. This is the part that matters: leaving it means the
  clinic sits in the hours and website queues forever and gets re-contaminated
  on the next monthly run. 858 clinics are currently queued for wrong hours on
  that basis. Nothing in src/ reads this column, so clearing it changes no
  rendering. The id is not lost either — candor-nppes' cache still has it.
- `google_maps_uri` -> '' (empty, not NULL). It currently points at the wrong
  business on Google Maps, so it cannot stay. Empty is deliberate: it is falsy,
  so [slug].astro falls back to a name+address Maps search (correct behavior),
  and it is also backfill_geocodes.py's "Places could not identify this
  business" sentinel — which is precisely, literally true here.

Coordinates are deliberately left alone. Only 77 sub-threshold rows have any,
and some are now correct (address-geocoded by geocode_addresses.py rather than
derived from the bad match), so a blanket clear would destroy good pins. Those
77 are worth a separate look.

Bands
-----
  clear  (default)  conf <= 0.34 : zero or near-zero name agreement. Includes the
                    0.34 clamp (exactly zero shared name tokens) and everything
                    below it. 1,824 rows carry hours.
  review (default)  conf 0.35-0.49 : some name agreement, so a legitimate trade
                    name difference is plausible — medical practices routinely
                    operate under a name other than their NPPES legal entity.
                    Exported to CSV for a human, never auto-cleared.

Set BANDS=all to clear the review band too. Do that only after reading the CSV.

Run it
------
    set -a; . ./.env; set +a
    export PLACES_CACHE_DIR=".../candor-nppes/output/places_cache"
    DRY_RUN=1 python scripts/clear_low_confidence_matches.py   # audit only
    python scripts/clear_low_confidence_matches.py             # apply

Env
  SUPABASE_URL, SUPABASE_SERVICE_KEY, PLACES_CACHE_DIR
  BANDS      "clear" (default) or "all"
  DRY_RUN    "1" = write the audit CSV, change nothing
  AUDIT_CSV  default scripts/outreach/out/low_confidence_cleared.csv
  REVIEW_CSV default scripts/outreach/out/low_confidence_review.csv
  CLOUDFLARE_DEPLOY_HOOK  OPTIONAL — POSTed after a run that changed rows
"""

import csv
import json
import os
import sys

import requests

CACHE_DIR = os.environ.get("PLACES_CACHE_DIR", "").strip()
BANDS = (os.environ.get("BANDS") or "clear").strip().lower()
DRY_RUN = os.environ.get("DRY_RUN", "") == "1"
AUDIT_CSV = os.environ.get("AUDIT_CSV") or "scripts/outreach/out/low_confidence_cleared.csv"
REVIEW_CSV = os.environ.get("REVIEW_CSV") or "scripts/outreach/out/low_confidence_review.csv"
SUPABASE_TIMEOUT = 30
PAGE = 1000

# enrich_places.py clamps a zero-name-overlap score to 0.34, so "<= 0.34" is
# exactly "shares no significant word with the matched business".
CLEAR_MAX = 0.34
REVIEW_MAX = 0.49

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


def log(msg):
    print(msg, flush=True)


def fetch_place_id_rows():
    """Every primary clinic carrying a google_place_id."""
    out = []
    for offset in range(0, 200_000, PAGE):
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/clinics",
            headers=dict(SB_HEADERS, Range=f"{offset}-{offset + PAGE - 1}",
                         **{"Range-Unit": "items"}),
            params={
                "select": "npi,name,city,state,slug,hours,google_place_id,"
                          "google_maps_uri,listing_tier,latitude",
                "google_place_id": "not.is.null",
                "primary_npi": "is.null",
                "order": "npi.asc",
            },
            timeout=SUPABASE_TIMEOUT)
        r.raise_for_status()
        batch = r.json()
        out.extend(batch)
        if len(batch) < PAGE:
            break
    return out


def cache_verdict(npi):
    """(status, confidence, matched_name) from the candor-nppes cache, or None."""
    path = os.path.join(CACHE_DIR, f"{npi}.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return None
    try:
        conf = float(d.get("match_confidence") or 0)
    except (TypeError, ValueError):
        conf = 0.0
    return (d.get("status") or "", conf, (d.get("google_match_name") or "").strip())


def patch(npi, payload):
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/clinics", headers=SB_HEADERS,
                       params={"npi": f"eq.{npi}"}, json=payload,
                       timeout=SUPABASE_TIMEOUT)
    if r.status_code >= 300:
        log(f"  !! PATCH {npi} failed {r.status_code}: {r.text[:200]}")
        return False
    return True


def main():
    log(f"BANDS={BANDS}  DRY_RUN={DRY_RUN}")
    log("No Google calls: every confidence score comes from the local cache.\n")

    rows = fetch_place_id_rows()
    log(f"Primary clinics carrying a google_place_id: {len(rows)}")

    to_clear, to_review, claimed = [], [], 0
    for c in rows:
        v = cache_verdict(c["npi"])
        if v is None:
            continue
        status, conf, matched_name = v
        if status == "matched":
            continue  # scored at or above the accept floor; leave alone
        rec = {
            "npi": c["npi"], "slug": c.get("slug") or "",
            "clinic_name": c.get("name") or "",
            "city": c.get("city") or "", "state": c.get("state") or "",
            "matched_google_name": matched_name,
            "confidence": f"{conf:.2f}", "cache_status": status,
            "had_hours": "yes" if c.get("hours") not in (None, "") else "no",
            "hours_before": (str(c.get("hours") or ""))[:120],
            "place_id_before": c.get("google_place_id") or "",
            "listing_tier": c.get("listing_tier") or "free",
            "has_coords": "yes" if c.get("latitude") is not None else "no",
        }
        if c.get("listing_tier") not in (None, "", "free"):
            # Owner-managed: never touch, only report.
            claimed += 1
            rec["cache_status"] += " (CLAIMED - skipped)"
            to_review.append(rec)
        elif conf <= CLEAR_MAX or (BANDS == "all" and conf <= REVIEW_MAX):
            to_clear.append(rec)
        elif conf <= REVIEW_MAX:
            to_review.append(rec)

    with_hours = sum(1 for r in to_clear if r["had_hours"] == "yes")
    log(f"  to clear : {len(to_clear)} rows ({with_hours} of them showing wrong hours)")
    log(f"  to review: {len(to_review)} rows -> {REVIEW_CSV}")
    if claimed:
        log(f"  claimed listings skipped: {claimed} (owner-managed, never overwritten)")

    os.makedirs(os.path.dirname(AUDIT_CSV) or ".", exist_ok=True)
    cols = list(to_clear[0].keys()) if to_clear else list(to_review[0].keys()) if to_review else []
    for path, data in ((AUDIT_CSV, to_clear), (REVIEW_CSV, to_review)):
        if not data:
            continue
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            w.writerows(data)

    if to_clear:
        log("\nSample of what would be cleared (clinic -> the business its hours came from):")
        for r in to_clear[:10]:
            if r["had_hours"] == "yes":
                log(f"  {r['confidence']}  {r['clinic_name'][:36]:<36} <- {r['matched_google_name'][:34]}")

    if DRY_RUN:
        log(f"\n[dry-run] nothing changed. Audit of intended edits -> {AUDIT_CSV}")
        log("Review it, then re-run without DRY_RUN to apply.")
        return

    cleared = failed = 0
    for i, r in enumerate(to_clear, 1):
        payload = {"hours": None, "google_place_id": None}
        # Only rewrite the maps link if one is actually stored; '' is already the
        # correct end state and re-writing it would be a pointless PATCH.
        payload["google_maps_uri"] = ""
        if patch(r["npi"], payload):
            cleared += 1
        else:
            failed += 1
        if i % 250 == 0:
            log(f"  {i}/{len(to_clear)} cleared={cleared}")

    log(f"\nDone. cleared={cleared} failures={failed}")
    log(f"Audit of every row changed -> {AUDIT_CSV}")

    hook = os.environ.get("CLOUDFLARE_DEPLOY_HOOK", "").strip()
    if cleared and hook:
        try:
            requests.post(hook, timeout=30).raise_for_status()
            log("[deploy] Cloudflare deploy hook triggered - wrong hours come off the site on rebuild.")
        except requests.RequestException as e:
            log(f"[warn] deploy hook failed: {e}")


if __name__ == "__main__":
    main()
