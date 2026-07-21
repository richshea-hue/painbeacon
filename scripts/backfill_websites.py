#!/usr/bin/env python3
"""
backfill_websites.py — PainBeacon Google Places website backfill

Fetches websiteUri (+ businessStatus) from Google Places API (New) for clinics
that have a place_id but no website yet, and writes results back to Supabase.

Why Places and not NPPES: NPPES has no website field, and the original
registry-era website data was scrubbed after expired/hijacked domains got the
site flagged by Safe Browsing. Places websiteUri comes from the clinic's live
Google Business Profile, and every URL is re-checked against the Safe Browsing
API on each site build before it is ever linked (src/lib/safebrowsing.js), so
a bad domain can reach the database but never a patient.

BILLING — READ BEFORE RAISING LIMIT:
  websiteUri bills as Place Details **Enterprise**: $20/1,000 calls with only
  ~1,000 free per month (unlike the Pro tier's 5,000). The default LIMIT=900
  stays inside the Enterprise free tier with headroom. Raising it costs real
  money: e.g. LIMIT=10000 ≈ $180 after the free 1,000. Do a small run first
  (LIMIT=25) and check which SKU line it lands on in the Cloud Console billing
  report before any big run.

Guardrails (same family as backfill_hours.py):
- Strict field mask: `id,websiteUri,businessStatus` only
- Skips folded duplicates (primary_npi IS NOT NULL)
- Bare requests.get for Google calls — NOT a shared requests.Session — so the
  Supabase `Authorization: Bearer` header can't bleed into Google requests
- Writes '' (empty string) when a place has no usable website, so those
  clinics are never re-fetched / re-billed on later runs
- Social/aggregator domains (facebook, yelp, healthgrades, …) are junk for our
  purposes — treated as "no website" and written as ''
- CLOSED_PERMANENTLY and 404/gone places get '' too — permanent outcomes are
  recorded, never re-billed
- Aborts hard on RESOURCE_EXHAUSTED rather than continuing to bill
- DRY_RUN=1: counts candidates only — no Google calls, no writes

Env vars (set as GitHub Actions secrets / workflow inputs):
  SUPABASE_URL            e.g. https://<project>.supabase.co
  SUPABASE_SERVICE_KEY    service role key (NOT the anon key)
  GOOGLE_MAPS_API_KEY     same key the hours backfill uses
  LIMIT                   max Google calls this run (default 900 — free tier)
  DRY_RUN                 "1" = count candidates only
  CLOUDFLARE_DEPLOY_HOOK  OPTIONAL — POSTed after a run that wrote new
                          websites, so the site rebuild picks them up
"""

import os
import re
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
LIMIT = int(os.environ.get("LIMIT") or os.environ.get("MAX_CALLS") or "900")
DRY_RUN = os.environ.get("DRY_RUN", "") == "1"
BATCH_SIZE = 500                # Supabase page size
SLEEP_BETWEEN_CALLS = 0.10      # ~10 QPS, well under Google's per-second limit
GOOGLE_TIMEOUT = 15
SUPABASE_TIMEOUT = 30

# Domains that are never the clinic's own site. A match (incl. subdomains)
# is treated as "no usable website" and recorded as '' so it isn't re-billed.
JUNK_DOMAINS = {
    "facebook.com", "m.facebook.com", "instagram.com", "x.com", "twitter.com",
    "youtube.com", "tiktok.com", "linkedin.com", "linktr.ee",
    "yelp.com", "healthgrades.com", "webmd.com", "doctor.webmd.com",
    "vitals.com", "zocdoc.com", "ratemds.com", "sharecare.com",
    "findatopdoc.com", "wellness.com", "npidb.org", "npino.com",
    "google.com", "goo.gl", "g.page", "business.site",
}

# ---------------------------------------------------------------------------
# Env
# ---------------------------------------------------------------------------
try:
    SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
    SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
    GOOGLE_KEY   = os.environ["GOOGLE_MAPS_API_KEY"]
except KeyError as e:
    print(f"[fatal] missing env var: {e}", file=sys.stderr)
    sys.exit(1)

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# ---------------------------------------------------------------------------
# URL hygiene
# ---------------------------------------------------------------------------
def clean_website(raw):
    """
    Normalize a Places websiteUri to a stable, tracker-free URL.
    Returns '' when the URL is unusable (junk domain, malformed, non-http).
    """
    if not raw:
        return ""
    raw = raw.strip()
    if not re.match(r"^https?://", raw, re.I):
        raw = "https://" + raw
    try:
        parts = urlsplit(raw)
    except ValueError:
        return ""
    host = (parts.hostname or "").lower()
    if not host or "." not in host:
        return ""
    bare = host[4:] if host.startswith("www.") else host
    if bare in JUNK_DOMAINS or any(bare.endswith("." + d) for d in JUNK_DOMAINS):
        return ""
    # Strip tracking params and fragments; keep meaningful path/query.
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if not k.lower().startswith("utm_") and k.lower() not in ("fbclid", "gclid")]
    return urlunsplit((
        parts.scheme.lower(), parts.netloc, parts.path or "/",
        urlencode(query), "",
    ))

# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------
def sb_count_candidates():
    url = f"{SUPABASE_URL}/rest/v1/clinics"
    params = {
        "select": "id",
        "place_id": "not.is.null",
        "website": "is.null",
        "primary_npi": "is.null",
        "limit": "1",
    }
    headers = dict(SB_HEADERS, Prefer="count=exact", Range="0-0")
    r = requests.get(url, headers=headers, params=params, timeout=SUPABASE_TIMEOUT)
    r.raise_for_status()
    content_range = r.headers.get("Content-Range", "/0")
    return int(content_range.split("/")[-1])

def sb_get_candidates(limit):
    """Clinics with a place_id but no website yet, skipping folded duplicates."""
    url = f"{SUPABASE_URL}/rest/v1/clinics"
    params = {
        "select": "id,place_id",
        "place_id": "not.is.null",
        "website": "is.null",
        "primary_npi": "is.null",
        "limit": str(limit),
        "order": "id.asc",
    }
    r = requests.get(url, headers=SB_HEADERS, params=params, timeout=SUPABASE_TIMEOUT)
    r.raise_for_status()
    return r.json()

def sb_write_website(clinic_id, website):
    url = f"{SUPABASE_URL}/rest/v1/clinics"
    params = {"id": f"eq.{clinic_id}"}
    r = requests.patch(url, headers=SB_HEADERS, params=params,
                       json={"website": website}, timeout=SUPABASE_TIMEOUT)
    r.raise_for_status()

# ---------------------------------------------------------------------------
# Google Places (New)
# ---------------------------------------------------------------------------
def google_fetch_website(place_id):
    """
    Returns:
      (website_uri, business_status)  strings, either may be ""
      None  place not found / non-quota 4xx — treated as permanently gone
    Raises RuntimeError on quota exhaustion or 5xx — caller aborts the run.
    """
    url = f"https://places.googleapis.com/v1/places/{place_id}"
    headers = {
        "X-Goog-Api-Key": GOOGLE_KEY,
        # KEEP THIS TIGHT. websiteUri already bills Enterprise; adding
        # reviews/photos/rating cannot make it cheaper, only the payload fatter.
        "X-Goog-FieldMask": "id,websiteUri,businessStatus",
    }
    r = requests.get(url, headers=headers, timeout=GOOGLE_TIMEOUT)

    if r.status_code == 429 or (r.status_code == 403 and "RESOURCE_EXHAUSTED" in r.text):
        raise RuntimeError(f"Google quota exhausted (status {r.status_code}): {r.text[:300]}")
    if r.status_code >= 500:
        raise RuntimeError(f"Google 5xx: {r.status_code} {r.text[:300]}")
    if r.status_code == 404:
        return None
    if r.status_code != 200:
        print(f"  [warn] Google {r.status_code} for place_id={place_id}: {r.text[:200]}")
        return None

    data = r.json()
    return data.get("websiteUri") or "", data.get("businessStatus") or ""

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    started = datetime.now(timezone.utc).isoformat()
    total = sb_count_candidates()
    print(f"[{started}] backfill_websites: start  LIMIT={LIMIT}  DRY_RUN={DRY_RUN}")
    print(f"  candidates (place_id set, website null, primary only): {total}")

    if DRY_RUN:
        print(f"[dry-run] would fetch up to {min(LIMIT, total)} places. "
              "No Google calls made, nothing written.")
        return

    calls_made = 0
    written = 0        # real website written
    emptied = 0        # '' written: no site / junk domain / closed / gone place
    seen = set()       # ids attempted this run — belt-and-braces against ever
                       # re-pulling (and re-billing) a row twice in one run

    while calls_made < LIMIT:
        remaining = LIMIT - calls_made
        candidates = sb_get_candidates(min(BATCH_SIZE, remaining))
        candidates = [r for r in candidates if r["id"] not in seen]
        if not candidates:
            print("  no more candidates.")
            break

        for row in candidates:
            if calls_made >= LIMIT:
                break
            seen.add(row["id"])

            try:
                result = google_fetch_website(row["place_id"])
            except RuntimeError as e:
                print(f"[abort] {e}")
                print(f"[abort] calls={calls_made} written={written} emptied={emptied}")
                sys.exit(2)

            calls_made += 1

            if result is None:
                # Place removed from Google (or invalid id) — permanent.
                # Write '' so it is never re-fetched / re-billed.
                sb_write_website(row["id"], "")
                emptied += 1
            else:
                website_uri, status = result
                site = "" if status == "CLOSED_PERMANENTLY" else clean_website(website_uri)
                sb_write_website(row["id"], site)
                if site:
                    written += 1
                else:
                    emptied += 1

            if calls_made % 100 == 0:
                print(f"  progress: {calls_made} calls | {written} written | {emptied} empty")

            time.sleep(SLEEP_BETWEEN_CALLS)

        # Loop continues until the candidate query returns nothing new
        # (written/emptied rows drop out of the query; skipped ones are
        # filtered by `seen`) or LIMIT is reached.

    print(f"[done] calls={calls_made} written={written} emptied={emptied}")

    # New websites only matter once the static site rebuilds (which also runs
    # the Safe Browsing pass over them). Fire the deploy hook if one is set.
    hook = os.environ.get("CLOUDFLARE_DEPLOY_HOOK", "").strip()
    if written and hook:
        try:
            requests.post(hook, timeout=30).raise_for_status()
            print("[deploy] Cloudflare deploy hook triggered.")
        except Exception as e:
            print(f"[warn] deploy hook failed: {e}")

if __name__ == "__main__":
    main()
