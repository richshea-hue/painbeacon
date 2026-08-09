#!/usr/bin/env python3
"""
restore_obvious_matches.py — put back the google_place_id for rows that
clear_low_confidence_matches.py cleared but whose names are, on inspection,
plainly the same business.

Why this is needed
------------------
enrich_places.py scores name agreement with exact token-set overlap, so a match
can be genuinely correct and still score below 0.50:

  PAIN MANGEMENT PARTNERS, LLC   <- "Pain Management Partners, LLC"    0.37
  REVIVE ORTHOPEDICS SPINE & ... <- "ReVive Orthopedics Spine & ..."   0.44
  PAIN MANAGEMENT CENTERS OF ST. LOUIS <- "St. Louis Pain Management Center" 0.44

The first is a TYPO in the federal record ("MANGEMENT"), which breaks token
equality. The third is the same words in a different order. Clearing the
0.35-0.49 band was the right default — most of it is wrong — but it took these
with it.

What this restores, and what it does NOT
----------------------------------------
Restores `google_place_id` only.

It does NOT restore `hours`. The audit CSV stores `hours_before` truncated to 120
characters (see clear_low_confidence_matches.py), and a full week of opening
times runs past 200 — writing the stored value back would publish a partial
week, which is its own kind of wrong. Restoring the place id puts the clinic back
in backfill_hours.py's queue, which will re-fetch complete hours from Google at
one Place Details Enterprise call each.

It does not touch `google_maps_uri` either: that was set to '' and stays there
until a real Places URL is fetched alongside the hours.

The matching rule
-----------------
Normalise both names (case-fold, strip punctuation, drop legal-form and generic
words: LLC/PC/INC/PLLC/LTD/... plus the/of/and/associates/center/clinic/group,
the same list enrich_places.py uses), singularise tokens, then require EITHER:

  ratio   >= 0.88   difflib similarity on the normalised strings, which forgives
                    typos and small spelling differences
  jaccard >= 0.80   token-set overlap, which forgives word ORDER and trailing
                    descriptors

Deliberately conservative, and checked against the real cases:

  restored: PAIN MANGEMENT PARTNERS (ratio .98) · REVIVE ORTHOPEDICS (ratio 1.0)
            NORTH JERSEY INTERVENTIONAL PAIN vs "... Associates" (jaccard 1.0)
            PAIN MANAGEMENT CENTERS OF ST. LOUIS vs "St. Louis ..." (jaccard 1.0)
  skipped:  MONTANA SPORT AND SPINE vs "Bozeman Sport, Spine ..." (jaccard .33 —
            different city in the name)
            ALAMEDA PACIFIC MEDICAL GROUP vs "Pacific Medical, Inc." (jaccard
            .67 — the matched name DROPS the distinguishing word, so it could be
            a different company; subset alone is not evidence)
            ADAPTIVE PAIN MANAGEMENT vs "Access Pain Solutions | Tulsa Pain"

Run it
------
    set -a; . ./.env; set +a
    DRY_RUN=1 python scripts/restore_obvious_matches.py   # print every decision
    python scripts/restore_obvious_matches.py             # apply

Env
  SUPABASE_URL, SUPABASE_SERVICE_KEY
  IN_CSV     default scripts/outreach/out/low_confidence_cleared_band2.csv
  OUT_CSV    default scripts/outreach/out/restored_matches.csv
  MIN_RATIO  default 0.88
  MIN_JACCARD default 0.80
  DRY_RUN    "1" = decide and report, change nothing
"""

import csv
import difflib
import os
import re
import sys

import requests

IN_CSV = os.environ.get("IN_CSV") or "scripts/outreach/out/low_confidence_cleared_band2.csv"
OUT_CSV = os.environ.get("OUT_CSV") or "scripts/outreach/out/restored_matches.csv"
MIN_RATIO = float(os.environ.get("MIN_RATIO") or "0.88")
MIN_JACCARD = float(os.environ.get("MIN_JACCARD") or "0.80")
DRY_RUN = os.environ.get("DRY_RUN", "") == "1"
SUPABASE_TIMEOUT = 30

try:
    SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
    SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
except KeyError as e:
    print(f"[fatal] missing env var: {e}", file=sys.stderr)
    sys.exit(1)

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# Legal forms and generic descriptors carry no identifying signal. The tail of
# this list matches enrich_places.py's own stop set so the two agree on what a
# name's meaningful content is.
STOP = {
    "llc", "lc", "pc", "pa", "pllc", "plc", "inc", "ltd", "llp", "lp", "corp",
    "corporation", "co", "company", "md", "do", "dba",
    "the", "of", "and", "associates", "associate", "association",
    "center", "centers", "centre", "clinic", "clinics", "group",
}


def norm(name):
    """Case-folded, punctuation-free, single-spaced."""
    s = (name or "").lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def content_tokens(name):
    """Meaningful tokens only, crudely singularised so CENTER/CENTERS agree."""
    out = set()
    for t in norm(name).split():
        if t in STOP or len(t) <= 1:
            continue
        if len(t) > 4 and t.endswith("s"):
            t = t[:-1]
        out.add(t)
    return out


def score(a, b):
    """(ratio, jaccard) for two raw names."""
    na, nb = norm(a), norm(b)
    ratio = difflib.SequenceMatcher(None, na, nb).ratio() if na and nb else 0.0
    ta, tb = content_tokens(a), content_tokens(b)
    jac = len(ta & tb) / len(ta | tb) if (ta or tb) else 0.0
    return ratio, jac


def patch(npi, payload):
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/clinics", headers=SB_HEADERS,
                       params={"npi": f"eq.{npi}"}, json=payload,
                       timeout=SUPABASE_TIMEOUT)
    if r.status_code >= 300:
        print(f"  !! PATCH {npi} failed {r.status_code}: {r.text[:200]}", flush=True)
        return False
    return True


def main():
    if not os.path.exists(IN_CSV):
        print(f"[fatal] audit CSV not found: {IN_CSV}", file=sys.stderr)
        sys.exit(1)
    with open(IN_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"Audit rows: {len(rows)}  from {IN_CSV}")
    print(f"Restore when ratio >= {MIN_RATIO} OR jaccard >= {MIN_JACCARD}  DRY_RUN={DRY_RUN}")
    print("Restores google_place_id only - hours_before in the CSV is truncated "
          "to 120 chars, so hours must be re-fetched, not restored.\n")

    restore, skip = [], []
    for r in rows:
        pid = (r.get("place_id_before") or "").strip()
        clinic, matched = r.get("clinic_name") or "", r.get("matched_google_name") or ""
        if not pid or not matched:
            skip.append((r, 0.0, 0.0, "no place_id or no matched name"))
            continue
        ratio, jac = score(clinic, matched)
        if ratio >= MIN_RATIO or jac >= MIN_JACCARD:
            restore.append((r, ratio, jac))
        else:
            skip.append((r, ratio, jac, "below both thresholds"))

    print(f"RESTORE {len(restore)}:")
    for r, ratio, jac in restore[:40]:
        print(f"  r={ratio:.2f} j={jac:.2f}  {r['clinic_name'][:38]:<38} <- {r['matched_google_name'][:36]}")
    if len(restore) > 40:
        print(f"  ... and {len(restore) - 40} more")

    print(f"\nSKIP {len(skip)} (staying cleared) - closest 12:")
    for r, ratio, jac, why in sorted(skip, key=lambda x: -max(x[1], x[2]))[:12]:
        print(f"  r={ratio:.2f} j={jac:.2f}  {r['clinic_name'][:38]:<38} <- {(r['matched_google_name'] or '(none)')[:36]}")

    os.makedirs(os.path.dirname(OUT_CSV) or ".", exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["npi", "clinic_name", "matched_google_name", "confidence",
                    "ratio", "jaccard", "place_id_restored"])
        for r, ratio, jac in restore:
            w.writerow([r["npi"], r["clinic_name"], r["matched_google_name"],
                        r.get("confidence", ""), f"{ratio:.3f}", f"{jac:.3f}",
                        r["place_id_before"]])
    print(f"\nDecision list -> {OUT_CSV}")

    if DRY_RUN:
        print("[dry-run] nothing changed.")
        return

    ok = bad = 0
    for i, (r, _, _) in enumerate(restore, 1):
        if patch(r["npi"], {"google_place_id": r["place_id_before"]}):
            ok += 1
        else:
            bad += 1
        if i % 50 == 0:
            print(f"  {i}/{len(restore)} restored={ok}")

    print(f"\nDone. place_ids restored={ok} failures={bad}")
    print(f"These {ok} clinics are back in backfill_hours.py's queue and will "
          f"re-fetch complete hours at 1 Place Details Enterprise call each "
          f"(~{ok} of the 1,000/month free pool).")


if __name__ == "__main__":
    main()
