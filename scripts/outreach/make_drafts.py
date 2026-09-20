#!/usr/bin/env python3
"""
make_drafts.py — step 3 of the PainBeacon outreach pipeline.

Turns the enriched targets CSV (from discover_emails.py) into per-clinic email
drafts as plain-text files, ready to review and paste/send from any mailbox.
NOTHING IS SENT by this script — it only writes files, so every message gets
human eyes before it goes out.

Variants (pick with --variant; the claim/profile links carry ?src=em-<variant>
so the dashboard shows which pitch produced each claim):
  fix-info           "here's what patients see for you — is it right?"
  badge-backlink     free Verified badge + followed link to their site
  founding-featured  ONE clinic per market, at the launch offer the site
                     already publishes (read from src/lib/site.js)
  confirm-update     "we just found your hours/website via Google" — input is
                     scripts/outreach/build_confirm_targets.py's output
                     (rows carry an updated_fields column: hours, website,
                     or both), NOT build_targets.py's

Rows without a discovered email go to a call sheet CSV instead (front-desk
phone numbers + the same talking points).

CAN-SPAM notes baked in: accurate subject lines, the sender's real postal
address in the footer, and a working opt-out line in every draft. Honor any
opt-out immediately and keep a do-not-contact list.

Usage:
  python scripts/outreach/make_drafts.py \
      --in scripts/outreach/out/targets_with_emails.csv \
      --variant founding-featured \
      --from-name "Rich" \
      --postal "PainBeacon Directory, PO Box ____, City ST 00000" \
      --outdir scripts/outreach/out/drafts
"""

import argparse
import csv
import os
import re
import sys
from urllib.parse import urlsplit
import json
import subprocess
import textwrap

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def pricing():
    """Read the Featured numbers out of src/lib/site.js.

    Never retype a price into this file. /for-practices/ renders from that
    same object, so a figure typed here drifts the moment the page changes —
    and the recipient of this email can open the page and see both. Featured
    moved twice in one day on 2026-09-18 (the founding deal was $500 for four
    months while the site advertised $1,350 for the same thing), which is
    exactly the failure this avoids.

    Shelling out to node is the honest way to read a JS module from Python:
    no second copy of the numbers, no regex guessing at source text.
    """
    expr = ("import {SITE} from './src/lib/site.js';"
            "const p = SITE.pricing;"
            "console.log(JSON.stringify({featured: p.featured, launch: p.launchOffer}));")
    try:
        out = subprocess.run(["node", "--input-type=module", "-e", expr],
                             cwd=REPO, capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        sys.exit("[error] node is not on PATH. make_drafts.py reads prices from "
                 "src/lib/site.js so the email can never quote a figure the site "
                 "contradicts. Install node or run this from the repo.")
    if out.returncode != 0:
        sys.exit(f"[error] could not read prices from src/lib/site.js:\n{out.stderr.strip()}")
    p = json.loads(out.stdout)
    money = lambda v: float(re.sub(r"[^0-9.]", "", str(v)))
    months = 4 if p["launch"]["active"] else 3
    monthly = money(p["featured"]["price"])
    prepaid = money(p["featured"]["commit"]["price"])
    usd = lambda n: f"${n:,.0f}" if float(n).is_integer() else f"${n:,.2f}"
    return {
        "months": months,
        "pay_for": months - 1 if p["launch"]["active"] else months,
        "prepaid": usd(prepaid),
        "full": usd(monthly * months),
        "monthly": usd(monthly),
        "launch": p["launch"]["active"],
    }

VARIANTS = ("fix-info", "badge-backlink", "founding-featured", "confirm-update")


def host_of(url):
    try:
        return (urlsplit(url).hostname or "").replace("www.", "")
    except ValueError:
        return ""


def title_name(raw):
    n = (raw or "").strip()
    return n if n.isupper() is False else n.title()


def market_label(zone_name, city):
    """The market as a person in it would say it.

    zone_name is the site's internal label — "Alexandria Area, VA",
    "Fort Myers Area, FL" — which is right for a page title and wrong in a
    sentence. Nobody in Alexandria calls their market "Alexandria Area, VA",
    and the pitch repeats it four times, so left alone it is the clearest
    signal in the email that no one typed it. Drop the state suffix (we are
    writing TO someone in that state) and the "Area" qualifier.

    src/lib/data.js does the same strip for the site's own zone labels.
    """
    label = (zone_name or city or "").strip()
    label = re.sub(r",\s*[A-Z]{2}\s*$", "", label)      # "Alexandria Area, VA" -> "Alexandria Area"
    label = re.sub(r"\s+Area$", "", label)               # "Alexandria Area"     -> "Alexandria"
    return label or "your area"


def render(variant, row, from_name, postal, price):
    clinic = title_name(row["name"])
    market = market_label(row.get("zone_name"), row.get("city"))
    src = f"em-{variant}"
    profile = f"{row['profile_url']}?src={src}"
    claim = f"{row['claim_url']}&src={src}"
    phone = (row.get("phone") or "").strip()
    site_host = host_of(row.get("website") or "")
    reviews = row.get("review_count") or ""
    rating = row.get("rating") or ""

    if variant == "fix-info":
        subject = f"Is our listing for {clinic} correct?"
        shown = f"We currently list your phone as {phone}." if phone else \
                "We list your address, phone, and credentials from the federal NPI registry."
        social = (f" Patients also see your {rating}★ Google rating ({reviews} reviews)."
                  if rating and reviews else "")
        body = f"""Hi {clinic} team,

PainBeacon is an independent national directory of pain clinics. Patients
searching for pain care in {market} see your practice here:
{profile}

{shown}{social} If anything is out of date — old phone, moved offices,
new providers — claiming your listing is free and takes about two minutes:
{claim}

Verified clinics also get a "Verified" badge and a direct link to their
own website, free.

Worth a quick look?

{from_name}
PainBeacon — painbeacon.com"""

    elif variant == "badge-backlink":
        subject = f"Free Verified badge for {clinic}"
        site_line = (f"a search-engine-followed link to {site_host}"
                     if site_host else "a link to your website")
        body = f"""Hi {clinic} team,

Patients who find you on Google usually double-check you somewhere
independent. PainBeacon lists every pain clinic in {market} from federal
records — here's yours:
{profile}

Claiming it is free and gets you: a Verified badge on your profile,
{site_line}, and an embeddable "Verified" badge for your own site.
Takes about two minutes:
{claim}

No charge, no catch — verified listings simply make the directory better.

{from_name}
PainBeacon — painbeacon.com"""

    elif variant == "confirm-update":
        fields = [f.strip() for f in (row.get("updated_fields") or "").split(",") if f.strip()]
        moved = "moved" in fields
        brand_new = "new-listing" in fields

        # Lead with the most contactable change. A relocation is the strongest
        # hook (and the likeliest thing to be stale elsewhere online); a
        # brand-new listing is really a "we just added you" note.
        if moved:
            headline = "your practice address changed"
            subject = f"Did {clinic} move? Confirming our listing"
        elif brand_new:
            headline = "we just added your practice"
            subject = f"{clinic} is now listed on PainBeacon"
        else:
            pretty = {"phone-new": "a phone number", "phone-changed": "a new phone number",
                      "hours-new": "your hours", "hours-changed": "updated hours",
                      "website-new": "your website", "website-changed": "a new website",
                      "name-changed": "a name change", "name-new": "your name"}
            named = [pretty[f] for f in fields if f in pretty]
            headline = " and ".join(named) if named else "new details for your practice"
            subject = f"Quick check on {clinic}'s listing details"

        # change_detail is written by build_confirm_targets.py as
        # "field: old -> new" segments — the specific thing to confirm. For a
        # brand-new listing there is no before/after worth quoting, so it is
        # left out rather than restating the headline.
        detail = (row.get("change_detail") or "").strip()
        detail_block = ("" if brand_new or not detail
                        else f"\nWhat changed on our end:\n  {detail}\n")

        if brand_new:
            body = f"""Hi {clinic} team,

PainBeacon is an independent national directory of pain clinics, built from
federal NPI registry records. We just added your practice, so patients
searching for pain care in {market} now find you here:
{profile}
{detail_block}
Everything there comes from public records, so it's worth a look to make
sure it's right. Claiming your listing is free and lets you correct it:
{claim}

{from_name}
PainBeacon — painbeacon.com"""
        else:
            body = f"""Hi {clinic} team,

PainBeacon is an independent national directory of pain clinics. Our records
show {headline}, and we've updated what patients in {market} see here:
{profile}
{detail_block}
Could you take two minutes to confirm that's right — or correct it if we got
it wrong? Claiming your listing is free and does both:
{claim}

{from_name}
PainBeacon — painbeacon.com"""

    else:  # founding-featured
        subject = f"Founding Featured spot for pain care in {market}"
        # The whole sentence is conditional, not just the figures: "while
        # we're launching" is a lie the day the launch offer ends, and this
        # file will not be the thing anyone remembers to edit that day.
        offer = (f"While we're launching it's {price['months']} months for the price of "
                 f"{price['pay_for']} — {price['prepaid']} instead of {price['full']}."
                 if price["launch"] else
                 f"It's {price['prepaid']} for {price['months']} months prepaid, "
                 f"or {price['monthly']} a month.")
        # The body is hard-wrapped plain text; an interpolated sentence is not,
        # so wrap it to match rather than shipping one 90-column line.
        offer = textwrap.fill(offer, 70)
        body = f"""Hi {clinic} team,

PainBeacon lists every pain clinic in {market} we can find in the
federal NPI registry — here's your profile:
{profile}

Featured is one practice per market: the top slot on every {market} page
on the site, clearly marked as advertising.

{offer}

A large portion of that goes straight back into geo-targeted marketing
in {market}, pointed at the pages your listing sits on.

Featured never changes rankings (those stay independent and published),
and claiming your listing stays free either way:
{claim}

One spot for {market}, first come first served. Interested?

{from_name}
PainBeacon — painbeacon.com"""

    footer = f"""

--
{postal}
You're receiving this one-time note because your practice is publicly
listed in the federal NPI registry. Reply UNSUBSCRIBE and we will never
email this practice again."""
    return subject, body + footer


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--variant", choices=VARIANTS, required=True)
    ap.add_argument("--from-name", required=True)
    ap.add_argument("--postal", required=True,
                    help="Your real postal address (CAN-SPAM requires it in every email)")
    ap.add_argument("--outdir", default="scripts/outreach/out/drafts")
    ap.add_argument("--max", type=int, default=0, help="cap drafts (0 = all)")
    args = ap.parse_args()

    if "____" in args.postal or not re.search(r"\d", args.postal):
        print("[fatal] --postal must be your real mailing address (CAN-SPAM).",
              file=sys.stderr)
        sys.exit(1)

    with open(args.inp, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    outdir = os.path.join(args.outdir, args.variant)
    os.makedirs(outdir, exist_ok=True)

    # Read once, before drafting: every email quotes the same figures, and
    # they come from src/lib/site.js rather than from this file.
    price = pricing()

    drafted = 0
    call_rows = []
    for row in rows:
        # Never draft to a clinic that's already claimed/verified.
        if (row.get("listing_tier") or "free") != "free":
            continue
        email = (row.get("email") or "").strip()
        if not email:
            if (row.get("phone") or "").strip():
                call_rows.append(row)
            continue
        if args.max and drafted >= args.max:
            break
        subject, body = render(args.variant, row, args.from_name, args.postal, price)
        path = os.path.join(outdir, f"{row['slug']}.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write(f"To: {email}\nSubject: {subject}\n\n{body}\n")
        drafted += 1

    if call_rows:
        sheet = os.path.join(args.outdir, f"call_sheet_{args.variant}.csv")
        # confirm-update rows carry the specific change to confirm. Without it
        # on the sheet the caller has nothing concrete to ask about, which is
        # the entire premise of that variant.
        extra = [c for c in ("updated_fields", "change_detail")
                 if any(r.get(c) for r in call_rows)]
        with open(sheet, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["name", "city", "phone"] + extra
                       + ["profile_url", "claim_url", "pitch"])
            for r in call_rows:
                w.writerow([title_name(r["name"]), r.get("city") or "",
                            r.get("phone") or ""]
                           + [r.get(c) or "" for c in extra]
                           + [r["profile_url"],
                              f"{r['claim_url']}&src=call-{args.variant}",
                              args.variant])
        print(f"[call sheet] {len(call_rows)} clinics with phone but no email -> {sheet}")

    print(f"[done] {drafted} drafts -> {outdir}")
    print("Review every draft before sending. Send 20-30/day max, track replies,")
    print("and add UNSUBSCRIBE replies to a do-not-contact list immediately.")


if __name__ == "__main__":
    main()
