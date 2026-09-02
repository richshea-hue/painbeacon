# PainBeacon outreach pipeline

Two ways in: pick a market and work it cold (below), or let the monthly
**confirm-update report** tell you which clinics just changed (further down).
Either way nothing auto-sends, and every claim traces back to the pitch that
produced it.

## Cold outreach: pick a market

Three steps.

```bash
export SUPABASE_URL=...  SUPABASE_ANON_KEY=...   # public values, same as site build

# 1. Pick pilot markets, build the target list (review-count sorted)
python scripts/outreach/build_targets.py --list-markets --top 25
python scripts/outreach/build_targets.py --markets phoenix-az,mesa-az --out scripts/outreach/out/targets.csv

# 2. Find contact emails on clinics' own websites (needs the website backfill
#    to have run — clinics without a website go to the call sheet instead)
python scripts/outreach/discover_emails.py --in scripts/outreach/out/targets.csv --out scripts/outreach/out/targets_with_emails.csv

# 3. Generate reviewable drafts for ONE variant (never sends anything)
python scripts/outreach/make_drafts.py --in scripts/outreach/out/targets_with_emails.csv \
  --variant founding-featured --from-name "Rich" \
  --postal "<your real mailing address>" --max 25
```

`out/` is gitignored — it contains harvested emails. Keep it local.

## Warm outreach: the monthly confirm-update report

`.github/workflows/confirm-report.yml` runs on the **11th** — last of the
monthly data jobs (hours 5th, websites 6th, NPPES sync 10th) so one report
covers everything that changed that month. It opens a GitHub issue with the
summary and attaches the full CSV as a workflow artifact (never committed).

`build_confirm_targets.py` diffs current Supabase state against a snapshot of
the previous run and reports per-field changes:

| reason | the hook |
|---|---|
| `moved` | practice relocated — the strongest one, and likely stale elsewhere online too |
| `new-listing` | brand-new to the directory: "we just added you" |
| `phone-changed` / `phone-new` | new front-desk number |
| `hours-changed` / `hours-new` | hours differ from what we had |
| `website-changed` / `website-new` | site found or changed |
| `name-changed` | rebrand or possible ownership change |

Each row carries `change_detail` ("address: old -> new") — the specific thing
to read off on the call. Two guards worth knowing: a **missing snapshot**
(first run, or the Actions cache was evicted) records a baseline and reports
zero rather than dumping the whole directory, and fields absent from an older
snapshot are skipped rather than read as blank.

To work a report: download the artifact, then

```bash
python scripts/outreach/make_drafts.py --in <artifact.csv> \
  --variant confirm-update --from-name "Rich" --postal "<your mailing address>"
```

Clinics already `verified` are skipped — they control their own info, so
there's nothing to confirm.

## The pitches

| variant | hook | src tag |
|---|---|---|
| `confirm-update` | "our records show X changed — can you confirm?" (warm; needs a confirm report) | `em-confirm-update` |
| `fix-info` | "here's what patients see for you — is it right?" | `em-fix-info` |
| `badge-backlink` | free Verified badge + followed link to your site | `em-badge-backlink` |
| `founding-featured` | 4 months Featured for the price of 1, ad-funded | `em-founding-featured` |

Claims arriving in the dashboard carry `source_page` with the `src` tag, so
after ~50 sends per variant you'll know which pitch converts. Kill the losers,
scale the winner.

## Founding-Featured mechanics

- **The deal:** one practice per market, 4 months of Featured for $500 total
  (normally $500/mo — the price in `site.js`; keep the two in step). Create a dedicated one-time Stripe Payment Link named
  "Founding Featured — 4 months" so it doesn't collide with the monthly
  subscription link in `site.js`.
- **The flywheel:** the $500 goes straight into Google Ads for
  "[city] pain clinic"-type searches pointed at that market's PainBeacon
  pages. The featured clinic sits on top, clearly labeled. Real patients
  arrive → the clinic sees value → renews at full price; the ads also seed
  the site's own traffic and analytics.
- **Integrity lines that keep us honest (and match /how-we-rank/):** Featured
  is labeled advertising, never changes rankings, and one-per-market
  exclusivity is honored — track sold markets in a simple list before
  drafting a second offer in the same zone.

## Sending guardrails

- 20–30/day, from a warmed mailbox on a subdomain or sibling domain (never
  the bare painbeacon.com, never a personal Gmail).
- Every mail: real postal address + working opt-out (the templates include
  both). Honor UNSUBSCRIBE instantly — keep a do-not-contact list and check
  it before every new batch.
- No urgency theater ("your listing will be removed!") — that's the
  directory-scam pattern the FTC warns businesses about, and front desks
  delete it on sight. Lead with the concrete detail and the free value.
- Follow-up cadence: day 0 email → day 3-4 call (call sheet) → day 8 second
  email (different variant) → stop. Three touches max, then leave them alone
  until something material changes (e.g., site traffic worth bragging about).
