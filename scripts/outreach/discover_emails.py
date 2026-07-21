#!/usr/bin/env python3
"""
discover_emails.py — step 2 of the PainBeacon outreach pipeline.

Reads the targets CSV from build_targets.py and, for every clinic that has a
website, politely fetches a few pages (homepage + common contact/about paths)
looking for a contact email. Writes the same CSV back out with three added
columns: email, email_source, email_note.

Polite by design: identifies itself in the User-Agent, ~1s between requests
to the same site, 10s timeout, max 4 pages per site, skips sites whose
robots.txt disallows everything. This is a handful of pages per clinic —
the same thing a person clicking "Contact us" would load.

Usage:
  python scripts/outreach/discover_emails.py \
      --in scripts/outreach/out/targets.csv \
      --out scripts/outreach/out/targets_with_emails.csv
"""

import argparse
import csv
import re
import sys
import time
from urllib.parse import urljoin, urlsplit

import requests

UA = ("PainBeaconBot/1.0 (+https://painbeacon.com/for-practices/; "
      "listing-verification outreach; contactus@painbeacon.com)")
TIMEOUT = 10
SLEEP = 1.0
CONTACT_PATHS = ["", "contact", "contact-us", "contactus", "about", "about-us"]

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
# Emails that are never a real inbox for a human at the practice.
JUNK_LOCAL = ("noreply", "no-reply", "donotreply", "mailer-daemon", "postmaster",
              "abuse", "spam", "webmaster", "wordpress", "example", "user",
              "email", "test", "you", "yourname", "name", "firstname")
JUNK_DOMAIN = ("example.", "sentry.", "wixpress.", "wix.com", "godaddy.",
               "squarespace.", "domain.com", "email.com", "sentry-next.",
               "cloudflare", "googleapis", "gstatic", "schema.org", "w3.org")
JUNK_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js")


def plausible(email, site_host):
    e = email.lower().strip(".")
    local, _, domain = e.partition("@")
    if not domain or any(e.endswith(x) for x in JUNK_EXT):
        return None
    if any(j in domain for j in JUNK_DOMAIN):
        return None
    if local in JUNK_LOCAL or local.startswith(JUNK_LOCAL):
        return None
    if len(e) > 60:
        return None
    # Score: same-domain beats free-mail beats anything else.
    bare = site_host[4:] if site_host.startswith("www.") else site_host
    if domain == bare or domain.endswith("." + bare) or bare.endswith("." + domain):
        score = 3
    elif domain in ("gmail.com", "yahoo.com", "outlook.com", "hotmail.com",
                    "aol.com", "icloud.com", "comcast.net", "att.net"):
        score = 2
    else:
        score = 1
    # Front-office style inboxes are the right door to knock on.
    if any(k in local for k in ("info", "office", "contact", "frontdesk",
                                "front.desk", "admin", "reception", "appointments",
                                "scheduling", "manager", "hello")):
        score += 1
    return score


def robots_allows(base, session):
    try:
        r = session.get(urljoin(base, "/robots.txt"), timeout=TIMEOUT)
        if r.status_code != 200:
            return True
        block = False
        for line in r.text.splitlines():
            line = line.split("#")[0].strip().lower()
            if line.startswith("user-agent:"):
                block = line.split(":", 1)[1].strip() in ("*", "painbeaconbot")
            elif block and line.replace(" ", "") == "disallow:/":
                return False
        return True
    except requests.RequestException:
        return True


def find_email(website):
    """Returns (email, source_url, note)."""
    parts = urlsplit(website)
    if not parts.netloc:
        return "", "", "bad url"
    base = f"{parts.scheme or 'https'}://{parts.netloc}"
    host = parts.netloc.lower()

    session = requests.Session()
    session.headers["User-Agent"] = UA

    if not robots_allows(base, session):
        return "", "", "robots.txt disallows"

    best = (0, "", "")  # (score, email, source)
    seen_pages = set()
    for path in CONTACT_PATHS:
        url = urljoin(base + "/", path)
        if url in seen_pages:
            continue
        seen_pages.add(url)
        try:
            r = session.get(url, timeout=TIMEOUT, allow_redirects=True)
        except requests.RequestException:
            continue
        finally:
            time.sleep(SLEEP)
        if r.status_code != 200 or "text/html" not in r.headers.get("Content-Type", "html"):
            continue
        # mailto: links first — highest intent — then any address in the text.
        html = r.text
        candidates = re.findall(r'mailto:([^"\'?>\s]+)', html) + EMAIL_RE.findall(html)
        for cand in candidates:
            score = plausible(cand, host)
            if score and score > best[0]:
                best = (score, cand.lower().strip("."), url)
        if best[0] >= 4:  # same-domain office inbox — good enough, stop early
            break

    if best[1]:
        return best[1], best[2], ""
    return "", "", "none found"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="out", required=True)
    ap.add_argument("--limit", type=int, default=0, help="max sites to crawl (0 = all)")
    args = ap.parse_args()

    with open(args.inp, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    crawled = found = 0
    for row in rows:
        site = (row.get("website") or "").strip()
        row.setdefault("email", ""); row.setdefault("email_source", ""); row.setdefault("email_note", "")
        if not site:
            row["email_note"] = "no website"
            continue
        if args.limit and crawled >= args.limit:
            row["email_note"] = "skipped (limit)"
            continue
        crawled += 1
        email, source, note = find_email(site)
        row["email"], row["email_source"], row["email_note"] = email, source, note
        if email:
            found += 1
        print(f"  {row['name'][:40]:<40} {email or '—':<35} {note}")

    fields = list(rows[0].keys()) if rows else []
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"[done] crawled {crawled} sites, found {found} emails -> {args.out}")


if __name__ == "__main__":
    main()
