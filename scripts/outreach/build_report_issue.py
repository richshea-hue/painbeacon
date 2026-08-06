#!/usr/bin/env python3
"""
build_report_issue.py — renders confirm_targets_with_emails.csv (produced by
build_confirm_targets.py + discover_emails.py) as Markdown for the monthly
GitHub issue in .github/workflows/confirm-report.yml.

Usage: python scripts/outreach/build_report_issue.py <csv_path>  (prints to stdout)
"""

import csv
import sys

MAX_ROWS = 40


def esc(s):
    return (s or "").replace("|", "\\|").replace("\n", " ").strip()


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "scripts/outreach/out/confirm_targets_with_emails.csv"
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"**{len(rows)} clinics** got new hours and/or a website from this "
          "month's Google Places backfills - a good excuse to reach out and "
          "confirm the update.\n")

    if not rows:
        print("Nothing changed this period.")
        return

    with_email = sum(1 for r in rows if (r.get("email") or "").strip())
    print(f"{with_email} have a discovered contact email; the rest have a "
          "phone number for a call sheet. Full data (including emails) is "
          "attached as a workflow artifact on this run - not committed to "
          "the repo.\n")

    print("| Clinic | City, State | Updated | Phone | Email |")
    print("|---|---|---|---|---|")
    for r in rows[:MAX_ROWS]:
        loc = f"{esc(r.get('city'))}, {esc(r.get('state'))}"
        print(f"| {esc(r.get('name'))} | {loc} | {esc(r.get('updated_fields'))} "
              f"| {esc(r.get('phone'))} | {esc(r.get('email'))} |")
    if len(rows) > MAX_ROWS:
        print(f"\n...and {len(rows) - MAX_ROWS} more in the attached CSV.")


if __name__ == "__main__":
    main()
