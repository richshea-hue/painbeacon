#!/usr/bin/env python3
"""
build_confirm_targets.py — outreach target list for clinics the automated
Google Places backfills (backfill_hours.py, backfill_websites.py) just added
hours or a website for.

Why this exists: those backfills write straight to Supabase with no report to
anyone. This script diffs the current hours/website state against a snapshot
of the last time it ran and produces a target list of clinics with genuinely
NEW data — the exact excuse to email them: "we found this for your practice,
please confirm it's right."

Output feeds the rest of the outreach pipeline, same as build_targets.py:
  build_confirm_targets.py -> discover_emails.py -> make_drafts.py --variant confirm-update

Unlike build_targets.py (anon key + clinics_public view, meant for ad-hoc
local runs), this reads the base `clinics` table with the service key so it
can run unattended on a schedule.

Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
Snapshot: scripts/outreach/out/confirm_snapshot.csv (gitignored — persisted
across scheduled runs via actions/cache in .github/workflows/confirm-report.yml,
same pattern as the Places hours cache in hours-backfill.yml). Missing/first
run == everything currently filled counts as "new".
"""

import argparse
import csv
import os
import sys

import requests

SITE_URL = "https://painbeacon.com"
PAGE = 1000
TIMEOUT = 30
SNAPSHOT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "out", "confirm_snapshot.csv")


def env(name):
    v = os.environ.get(name, "").strip()
    if not v:
        print(f"[fatal] {name} not set", file=sys.stderr)
        sys.exit(1)
    return v


def fetch_all():
    base = env("SUPABASE_URL").rstrip("/")
    key = env("SUPABASE_SERVICE_KEY")
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    sel = ("npi,slug,name,city,state,zone_slug,zone_name,phone,website,hours,"
           "aggregate_rating,review_count,listing_tier,primary_npi")
    rows = []
    for offset in range(0, 200_000, PAGE):
        r = requests.get(
            f"{base}/rest/v1/clinics",
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
    # Primaries only — folded duplicates don't get their own page, so
    # contacting them would be a wasted (and confusing) email.
    return [c for c in rows if c.get("primary_npi") in (None, c.get("npi"))
            and c.get("zone_slug") and c.get("name")]


def load_snapshot():
    prev = {}
    if os.path.exists(SNAPSHOT_PATH):
        with open(SNAPSHOT_PATH, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                prev[row["npi"]] = {
                    "hours": row.get("hours") or "",
                    "website": row.get("website") or "",
                }
    return prev


def save_snapshot(clinics):
    os.makedirs(os.path.dirname(SNAPSHOT_PATH), exist_ok=True)
    with open(SNAPSHOT_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["npi", "hours", "website"])
        for c in clinics:
            w.writerow([c["npi"], (c.get("hours") or "").strip(),
                        (c.get("website") or "").strip()])


def find_changed(clinics, prev):
    changed = []
    for c in clinics:
        cur_hours = (c.get("hours") or "").strip()
        cur_site = (c.get("website") or "").strip()
        before = prev.get(c["npi"], {"hours": "", "website": ""})
        fields = []
        if cur_hours and not before["hours"]:
            fields.append("hours")
        if cur_site and not before["website"]:
            fields.append("website")
        if fields:
            changed.append((c, fields))
    return changed


def build_csv(changed, out_path):
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["zone_slug", "zone_name", "state", "npi", "slug", "name",
                    "city", "phone", "website", "hours", "rating",
                    "review_count", "listing_tier", "profile_url",
                    "claim_url", "updated_fields"])
        for c, fields in changed:
            profile = f"{SITE_URL}/clinic/{c['slug']}/"
            w.writerow([
                c["zone_slug"], c.get("zone_name") or "", c.get("state") or "",
                c["npi"], c["slug"], c["name"], c.get("city") or "",
                c.get("phone") or "", (c.get("website") or "").strip(),
                (c.get("hours") or "").strip(),
                c.get("aggregate_rating") or "", c.get("review_count") or "",
                c.get("listing_tier") or "free",
                profile, f"{profile}?claim=1",
                ",".join(fields),
            ])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="scripts/outreach/out/confirm_targets.csv")
    args = ap.parse_args()

    clinics = fetch_all()
    prev = load_snapshot()
    changed = find_changed(clinics, prev)

    build_csv(changed, args.out)
    save_snapshot(clinics)

    print(f"[done] {len(changed)} clinics with newly-confirmed hours/website "
          f"(of {len(clinics)} primary clinics checked) -> {args.out}")
    print(f"[snapshot] saved {len(clinics)} clinics -> {SNAPSHOT_PATH}")


if __name__ == "__main__":
    main()
