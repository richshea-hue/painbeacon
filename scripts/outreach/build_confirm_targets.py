#!/usr/bin/env python3
"""
build_confirm_targets.py — outreach target list for clinics whose listing data
CHANGED since the last run: moved, renamed, new phone, new/changed hours,
new/changed website, or newly added to the directory.

Why this exists: the automated jobs (sync_nppes.py monthly, plus the Google
Places hours/website backfills) rewrite Supabase with no report to anyone.
Every one of those changes is a concrete reason to contact the practice:
"we now show X for you — can you confirm it's right?" That's a far warmer
opening than a cold "claim your listing" pitch, and it doubles as data QA.

How the diff works
------------------
A snapshot CSV of every clinic's contact fields is written at the end of each
run and restored at the start of the next (via actions/cache — see
.github/workflows/confirm-report.yml). Each run compares current Supabase
state against that snapshot and reports per-field changes.

Two deliberate guards:
  - NO snapshot at all (first run ever, or the cache was evicted) => establish
    the baseline and report ZERO changes. Otherwise every already-populated
    clinic reads as "new" and floods the report with thousands of non-events.
  - A snapshot MISSING a column (written by an older version of this script)
    => that field is skipped for this run rather than treated as blank, so a
    schema addition doesn't mass-flag every row as changed.

Output feeds the rest of the outreach pipeline:
  build_confirm_targets.py -> discover_emails.py -> make_drafts.py --variant confirm-update

Unlike build_targets.py (anon key + clinics_public view, for ad-hoc local
runs), this reads the base `clinics` table with the service key so it can run
unattended on a schedule and see internal columns like sync_note.

Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
"""

import argparse
import csv
import os
import re
import sys

import requests

SITE_URL = "https://painbeacon.com"
PAGE = 1000
TIMEOUT = 30
SNAPSHOT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "out", "confirm_snapshot.csv")

# Fields tracked in the snapshot and compared each run. Order is the CSV order.
TRACKED = ["name", "address_1", "city", "state", "postal_code", "phone",
           "website", "hours", "listing_tier"]

# An address change across any of these means the practice relocated — the
# single most useful outreach hook, and the one most likely to be stale on
# their own website too.
ADDRESS_FIELDS = ("address_1", "city", "state", "postal_code")


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
    sel = ("npi,slug,name,address_1,city,state,postal_code,zone_slug,zone_name,"
           "phone,website,hours,aggregate_rating,review_count,listing_tier,"
           "sync_note,primary_npi")
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
    # contacting them would be a wasted (and confusing) call.
    return [c for c in rows if c.get("primary_npi") in (None, c.get("npi"))
            and c.get("zone_slug") and c.get("name")]


def val(c, field):
    return str(c.get(field) or "").strip()


def load_snapshot():
    """Returns (rows_by_npi, columns_present). columns_present is empty when
    there is no snapshot — the caller treats that as 'baseline only'."""
    if not os.path.exists(SNAPSHOT_PATH):
        return {}, set()
    with open(SNAPSHOT_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        cols = set(reader.fieldnames or [])
        prev = {row["npi"]: row for row in reader}
    return prev, cols


def save_snapshot(clinics):
    os.makedirs(os.path.dirname(SNAPSHOT_PATH), exist_ok=True)
    with open(SNAPSHOT_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["npi"] + TRACKED)
        for c in clinics:
            w.writerow([c["npi"]] + [val(c, k) for k in TRACKED])


def norm_phone(v):
    return re.sub(r"\D", "", v or "")


def describe(field, before, after):
    """Short human string for the call/email script."""
    if field == "hours":
        # Full weekly hours are too long to read aloud; lead with the change.
        return f"hours: {before.split(';')[0].strip() or '(none)'} -> {after.split(';')[0].strip()}"
    trim = lambda s: (s[:60] + "...") if len(s) > 60 else s
    return f"{field}: {trim(before) or '(none)'} -> {trim(after)}"


def diff_clinic(c, before, cols):
    """Returns (reason_tokens, detail_strings) for one clinic."""
    reasons, details = [], []

    # Address first — a move supersedes the individual field noise.
    moved = [f for f in ADDRESS_FIELDS
             if f in cols and val(c, f) != (before.get(f) or "").strip()]
    if moved:
        reasons.append("moved")
        old = " ".join((before.get(f) or "").strip() for f in ADDRESS_FIELDS).strip()
        new = " ".join(val(c, f) for f in ADDRESS_FIELDS).strip()
        details.append(f"address: {old or '(none)'} -> {new}")

    for field in ("phone", "website", "hours", "name"):
        if field not in cols:
            continue
        after, prior = val(c, field), (before.get(field) or "").strip()
        same = (norm_phone(after) == norm_phone(prior)) if field == "phone" \
            else (after == prior)
        if same:
            continue
        if after and not prior:
            reasons.append(f"{field}-new")
        elif after and prior:
            reasons.append(f"{field}-changed")
        else:
            # Went blank. Worth knowing (their site may have died) but it is
            # not something to ask them to "confirm", so it is not a reason
            # to contact on its own.
            continue
        details.append(describe(field, prior, after))

    return reasons, details


def find_changed(clinics, prev, cols):
    changed = []
    for c in clinics:
        before = prev.get(c["npi"])
        if before is None:
            # Genuinely new to the directory since the last snapshot.
            changed.append((c, ["new-listing"],
                            [f"new listing: {val(c, 'city')}, {val(c, 'state')}"]))
            continue
        reasons, details = diff_clinic(c, before, cols)
        if reasons:
            changed.append((c, reasons, details))
    return changed


def build_csv(changed, out_path):
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["zone_slug", "zone_name", "state", "npi", "slug", "name",
                    "city", "phone", "website", "hours", "rating",
                    "review_count", "listing_tier", "profile_url",
                    "claim_url", "updated_fields", "change_detail",
                    "sync_note"])
        for c, reasons, details in changed:
            profile = f"{SITE_URL}/clinic/{c['slug']}/"
            w.writerow([
                c["zone_slug"], c.get("zone_name") or "", val(c, "state"),
                c["npi"], c["slug"], c["name"], val(c, "city"),
                val(c, "phone"), val(c, "website"), val(c, "hours"),
                c.get("aggregate_rating") or "", c.get("review_count") or "",
                c.get("listing_tier") or "free",
                profile, f"{profile}?claim=1",
                ",".join(reasons), "; ".join(details), val(c, "sync_note"),
            ])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="scripts/outreach/out/confirm_targets.csv")
    args = ap.parse_args()

    clinics = fetch_all()
    prev, cols = load_snapshot()

    if not cols:
        # No usable snapshot: record the baseline, report nothing. Every
        # populated clinic would otherwise look brand-new.
        build_csv([], args.out)
        save_snapshot(clinics)
        print(f"[baseline] no previous snapshot — recorded {len(clinics)} clinics "
              f"as the baseline and reported 0 changes.")
        print(f"[note] the next run will diff against this. -> {args.out}")
        return

    skipped = [f for f in TRACKED if f not in cols]
    if skipped:
        print(f"[note] snapshot predates these fields, not compared this run: "
              f"{', '.join(skipped)}")

    changed = find_changed(clinics, prev, cols)
    build_csv(changed, args.out)
    save_snapshot(clinics)

    tally = {}
    for _, reasons, _ in changed:
        for r in reasons:
            tally[r] = tally.get(r, 0) + 1
    summary = "  ".join(f"{k}={v}" for k, v in sorted(tally.items())) or "none"

    print(f"[done] {len(changed)} clinics changed since last run "
          f"(of {len(clinics)} primary clinics checked) -> {args.out}")
    print(f"[breakdown] {summary}")
    print(f"[snapshot] saved {len(clinics)} clinics -> {SNAPSHOT_PATH}")


if __name__ == "__main__":
    main()
