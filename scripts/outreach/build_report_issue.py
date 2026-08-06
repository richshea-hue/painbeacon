#!/usr/bin/env python3
"""
build_report_issue.py — renders confirm_targets_with_emails.csv (produced by
build_confirm_targets.py + discover_emails.py) as Markdown for the monthly
GitHub issue in .github/workflows/confirm-report.yml.

Usage: python scripts/outreach/build_report_issue.py <csv_path>  (prints to stdout)
"""

import csv
import sys
from collections import Counter

MAX_ROWS = 40


def esc(s):
    return (s or "").replace("|", "\\|").replace("\n", " ").strip()


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "scripts/outreach/out/confirm_targets_with_emails.csv"
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"**{len(rows)} clinics** changed since the last run - moved, renamed, "
          "new phone/hours/website, or newly listed. Each one is a reason to "
          "call or email and confirm the update.\n")

    if not rows:
        print("Nothing changed this period.")
        return

    # What kind of change, so the biggest hooks (moves, new listings) are
    # visible without opening the CSV.
    tally = Counter()
    for r in rows:
        for f in (r.get("updated_fields") or "").split(","):
            if f.strip():
                tally[f.strip()] += 1
    print("Breakdown: " + ", ".join(f"`{k}` {v}" for k, v in tally.most_common()) + "\n")

    with_email = sum(1 for r in rows if (r.get("email") or "").strip())
    claimable = sum(1 for r in rows if (r.get("listing_tier") or "free") == "free")
    print(f"{with_email} have a discovered contact email; the rest have a "
          f"phone number for a call sheet. {claimable} are unclaimed "
          "(`free` tier) and so are worth contacting - already-verified "
          "clinics control their own info and are skipped when drafting. "
          "Full data (including emails) is attached as a workflow artifact "
          "on this run - not committed to the repo.\n")

    print("| Clinic | City, State | Changed | What | Phone | Email |")
    print("|---|---|---|---|---|---|")
    for r in rows[:MAX_ROWS]:
        loc = f"{esc(r.get('city'))}, {esc(r.get('state'))}"
        print(f"| {esc(r.get('name'))} | {loc} | {esc(r.get('updated_fields'))} "
              f"| {esc(r.get('change_detail'))} | {esc(r.get('phone'))} "
              f"| {esc(r.get('email'))} |")
    if len(rows) > MAX_ROWS:
        print(f"\n...and {len(rows) - MAX_ROWS} more in the attached CSV.")


if __name__ == "__main__":
    main()
