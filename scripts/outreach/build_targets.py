#!/usr/bin/env python3
"""
build_targets.py — step 1 of the PainBeacon outreach pipeline.

Builds a per-market target list of clinics to contact about claiming /
verifying their listing. Reads ONLY the public clinics_public view (anon key),
so it can run anywhere without touching service credentials.

Usage:
  # See the biggest markets first (pick pilots from this):
  python scripts/outreach/build_targets.py --list-markets --top 25

  # Build a target CSV for one or more markets (zone slugs from --list-markets):
  python scripts/outreach/build_targets.py --markets phoenix-az,mesa-az \
      --out scripts/outreach/out/targets.csv

Env:
  SUPABASE_URL, SUPABASE_ANON_KEY   same public values the site build uses

Output CSV columns:
  zone_slug, zone_name, state, npi, slug, name, city, phone, website,
  rating, review_count, listing_tier, profile_url, claim_url
(claim_url gets ?claim=1&src=SRC appended by make_drafts.py per variant.)
"""

import argparse
import csv
import os
import sys
from collections import Counter, defaultdict

import requests

SITE_URL = "https://painbeacon.com"
PAGE = 1000
TIMEOUT = 30


def env(name):
    v = os.environ.get(name, "").strip()
    if not v:
        print(f"[fatal] {name} not set (public anon values — same as the site build)",
              file=sys.stderr)
        sys.exit(1)
    return v


def fetch_all():
    base = env("SUPABASE_URL").rstrip("/")
    key = env("SUPABASE_ANON_KEY")
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    sel = ("npi,slug,name,city,state,zone_slug,zone_name,phone,website,"
           "aggregate_rating,review_count,listing_tier,primary_npi")
    rows = []
    for offset in range(0, 100_000, PAGE):
        r = requests.get(
            f"{base}/rest/v1/clinics_public",
            params={"select": sel, "order": "npi.asc"},
            headers=dict(headers, Range=f"{offset}-{offset + PAGE - 1}",
                         **{"Range-Unit": "items"}),
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < PAGE:
            break
    # Primaries only — folded duplicates would double-contact the same office.
    return [c for c in rows if c.get("primary_npi") in (None, c.get("npi"))
            and c.get("zone_slug") and c.get("name")]


def list_markets(clinics, top):
    counts = Counter(c["zone_slug"] for c in clinics)
    names = {c["zone_slug"]: (c.get("zone_name") or c["zone_slug"]) for c in clinics}
    with_site = Counter(c["zone_slug"] for c in clinics if (c.get("website") or "").strip())
    print(f"{'zone_slug':<28} {'market':<30} {'clinics':>7} {'w/site':>7}")
    for slug, n in counts.most_common(top):
        print(f"{slug:<28} {names[slug]:<30} {n:>7} {with_site.get(slug, 0):>7}")


def build_csv(clinics, markets, out_path):
    chosen = defaultdict(list)
    for c in clinics:
        if c["zone_slug"] in markets:
            chosen[c["zone_slug"]].append(c)

    missing = [m for m in markets if m not in chosen]
    if missing:
        print(f"[warn] no clinics found for: {', '.join(missing)} "
              "(check slugs via --list-markets)")

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    n = 0
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["zone_slug", "zone_name", "state", "npi", "slug", "name",
                    "city", "phone", "website", "rating", "review_count",
                    "listing_tier", "profile_url", "claim_url"])
        for slug_key in markets:
            # Most-reviewed first: an active Google presence means someone at
            # the practice cares about their online reputation — the person
            # most likely to answer a "your listing" email.
            for c in sorted(chosen.get(slug_key, []),
                            key=lambda c: -(c.get("review_count") or 0)):
                profile = f"{SITE_URL}/clinic/{c['slug']}/"
                w.writerow([
                    c["zone_slug"], c.get("zone_name") or "", c.get("state") or "",
                    c["npi"], c["slug"], c["name"], c.get("city") or "",
                    c.get("phone") or "", (c.get("website") or "").strip(),
                    c.get("aggregate_rating") or "", c.get("review_count") or "",
                    c.get("listing_tier") or "free",
                    profile, f"{profile}?claim=1",
                ])
                n += 1
    print(f"[done] wrote {n} clinics across {len(chosen)} markets -> {out_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list-markets", action="store_true")
    ap.add_argument("--top", type=int, default=25)
    ap.add_argument("--markets", help="comma-separated zone slugs")
    ap.add_argument("--out", default="scripts/outreach/out/targets.csv")
    args = ap.parse_args()

    clinics = fetch_all()
    print(f"[data] {len(clinics)} primary clinics loaded")

    if args.list_markets:
        list_markets(clinics, args.top)
        return
    if not args.markets:
        ap.error("--markets required (or use --list-markets first)")
    build_csv(clinics, [m.strip() for m in args.markets.split(",") if m.strip()], args.out)


if __name__ == "__main__":
    main()
