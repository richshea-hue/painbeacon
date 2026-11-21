"""Stamp outreach tracking back onto the clinics table from a filled-in call sheet.

The DMV note's last line is the one that always gets skipped: `contacted_at` and
`outreach_channel` exist on `clinics` and are null for everyone, so a second pass
repeats the first. This closes that loop.

Reads a call sheet produced for a market (CSV with `npi` and `called_at` columns),
and for every row where `called_at` is filled in, writes:

    contacted_at      <- called_at (ISO date, or today if the cell just says "y")
    outreach_channel  <- --channel (default "phone")
    outreach_status   <- the row's `outcome` cell, or --status

Nothing is written without --apply. Run it once without, read the plan, then rerun.

    python scripts/outreach/mark_contacted.py --in scripts/outreach/out/north-brunswick-callsheet.csv
    python scripts/outreach/mark_contacted.py --in scripts/outreach/out/north-brunswick-callsheet.csv --apply

Needs SUPABASE_URL and SUPABASE_SERVICE_KEY — the anon key cannot write `clinics`.
These columns are not exposed by `clinics_public`, so none of this reaches the site.
"""

import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date

from _env import load_env

TRACKED = ("contacted_at", "outreach_channel", "outreach_status")


def normalize_date(cell):
    """A call sheet filled in by hand says '2026-10-30', or just 'y'/'x'/'yes'."""
    v = (cell or "").strip()
    if not v:
        return None
    if len(v) >= 8 and v[:4].isdigit():
        return v[:10]
    return date.today().isoformat()


def patch(base, key, npi, payload):
    req = urllib.request.Request(
        f"{base}/rest/v1/clinics?npi=eq.{npi}",
        method="PATCH",
        data=json.dumps(payload).encode(),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="infile", required=True, help="filled-in call sheet CSV")
    ap.add_argument("--channel", default="phone")
    ap.add_argument("--status", default="contacted",
                    help="fallback when a row's `outcome` cell is empty")
    ap.add_argument("--apply", action="store_true", help="actually write (default is a dry run)")
    args = ap.parse_args()

    load_env()
    base = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        sys.exit("[mark_contacted] SUPABASE_URL and SUPABASE_SERVICE_KEY are required "
                 "(the anon key cannot write `clinics`).")

    with open(args.infile, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    missing = [c for c in ("npi", "called_at") if rows and c not in rows[0]]
    if missing:
        sys.exit(f"[mark_contacted] {args.infile} has no {', '.join(missing)} column.")

    todo = []
    for r in rows:
        when = normalize_date(r.get("called_at"))
        if not when:
            continue
        todo.append((r["npi"], r.get("practice", ""), {
            "contacted_at": when,
            "outreach_channel": args.channel,
            "outreach_status": (r.get("outcome") or "").strip() or args.status,
        }))

    if not todo:
        print(f"[mark_contacted] nothing to do - no row in {args.infile} has called_at filled in.")
        return

    print(f"[mark_contacted] {len(todo)} of {len(rows)} rows have been called:\n")
    for npi, name, p in todo:
        print(f"  {npi}  {name[:44]:46} {p['contacted_at']}  {p['outreach_channel']}  {p['outreach_status']}")

    if not args.apply:
        print(f"\n[dry run] nothing written. Re-run with --apply to write {len(todo)} rows.")
        return

    ok = 0
    for npi, name, p in todo:
        try:
            patch(base, key, npi, p)
            ok += 1
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:300]
            print(f"  [fail] {npi} {name}: HTTP {e.code} {detail}")
            if "invalid input value for enum" in detail:
                print("         outreach_status is an enum — pass an allowed value with --status.")
        except Exception as e:  # noqa: BLE001 - report and keep going
            print(f"  [fail] {npi} {name}: {e}")
    print(f"\n[mark_contacted] wrote {ok}/{len(todo)} rows.")


if __name__ == "__main__":
    main()
