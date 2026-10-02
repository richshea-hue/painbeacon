# PainBeacon outreach pipeline

Two ways in: pick a market and work it cold (below), or let the monthly
**confirm-update report** tell you which clinics just changed (further down).
Either way nothing auto-sends, and every claim traces back to the pitch that
produced it.

## Cold outreach: pick a market

Three steps.

Credentials come from the repo's `.env` automatically — the Python scripts
load it themselves, the same file `node --env-file=.env` uses. You need
`SUPABASE_URL` and `SUPABASE_ANON_KEY` in there (both public; the anon key can
only read the public view). On a project migrated to Supabase's 2026 key
format there is no anon key — use `SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`
instead and the scripts take it. Nothing to export first, on any shell.

If one of these still reports a variable "is not set", the message now lists
what it actually read out of `.env`; a name missing from that list is a
parsing problem in the file, not a missing value. `python scripts/outreach/test_env.py`
checks the loader against the shapes that have bitten us (Notepad's UTF-8 BOM,
CRLF line endings, quoted values, inline comments, a pasted `export`).

```bash
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

## Warm outreach: clinics AI assistants already cite us for

Bing Webmaster Tools → **AI Performance → Grounding Queries** lists the
queries where Bing/Copilot cited painbeacon.com. Some of those queries are a
single practice's name: somebody asked an assistant about one clinic and we
were a source. Those clinics are the warmest list we have, because the pitch
is checkable by the recipient in ten seconds and it is good news rather than
a favour-ask.

```bash
# Bing: AI Performance -> Grounding Queries -> "Download all"
python scripts/outreach/match_ai_citations.py \
    --queries ~/Downloads/bing-grounding-queries.csv \
    --out scripts/outreach/out/targets-ai.csv

# then the usual steps 2 and 3
python scripts/outreach/discover_emails.py \
    --in scripts/outreach/out/targets-ai.csv \
    --out scripts/outreach/out/targets-ai-emails.csv
python scripts/outreach/make_drafts.py \
    --in scripts/outreach/out/targets-ai-emails.csv --variant ai-cited ...
```

The matcher sorts the queries into **category** ("pain specialist" — we are
being used as a directory, no clinic to contact) and **branded** ("mahajan
spine and joint" — one practice, that practice is the target). It decides by
rarity rather than a keyword list: a branded query contains a token almost no
other clinic name uses, a category query is built from tokens thousands share.
A query carrying intent words ("best", "near me", a year) is category whatever
else is in it, because "best pain doctors near me in augusta" names a city,
not a practice.

Everything it does not write is still printed — the category queries, the
branded-looking ones that matched nothing (possibly a practice we do not
list), and the runner-up matches. **Read the runners-up.** A rare word can be
shared: "augusta spine and pain" matches Augusta Spine and Pain at 1.00 and
Augusta Foot and Ankle at 0.77, and only the first is written. By default one
clinic is written per query for exactly this reason; `--max-per-query 3` is
for when you mean to mail several locations of one practice.

**Only send `ai-cited` to rows this script produced.** The email says Copilot
cites us for that practice, which the recipient can check immediately. It has
to be true of them specifically.

## The pitches

| variant | hook | src tag |
|---|---|---|
| `ai-cited` | "Copilot cites us when people ask about you" (warmest; needs match_ai_citations.py) | `em-ai-cited` |
| `confirm-update` | "our records show X changed — can you confirm?" (warm; needs a confirm report) | `em-confirm-update` |
| `fix-info` | "here's what patients see for you — is it right?" | `em-fix-info` |
| `badge-backlink` | free Verified badge + followed link to your site | `em-badge-backlink` |
| `founding-featured` | 4 months Featured for the price of 1, ad-funded | `em-founding-featured` |

Claims arriving in the dashboard carry `source_page` with the `src` tag, so
after ~50 sends per variant you'll know which pitch converts. Kill the losers,
scale the winner.

## Founding-Featured mechanics

- **The deal:** one practice per market, at the launch offer the site already
  publishes — four months of Featured for the price of three, $1,350 instead
  of $2,000. The draft never contains a typed price: `make_drafts.py` reads
  `SITE.pricing.featured` and `SITE.pricing.launchOffer` out of
  `src/lib/site.js` and phrases the offer from them, so raising a price or
  ending the launch offer changes the emails with no second edit. It also
  means the recipient can open /for-practices/ and see the same numbers.
  (Until 2026-09-18 this was a separate $500-for-four-months deal, which
  became untenable the day the site started publishing $1,350 for exactly
  that. Undercutting your own published price by 63% in cold email is a
  problem the first time two clinics in one metro compare notes.)
- **The flywheel:** a large portion of the money goes back into geo-targeted
  marketing in that market, pointed at the pages the clinic's listing sits
  on. The featured clinic sits on top, clearly labeled. Real patients arrive
  → the clinic sees value → renews; the ads also seed the site's own traffic
  and analytics. Say "a large portion", not "all of it": the exact split is a
  judgement call per market, and a promise that specific is one you have to
  be able to evidence.
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
