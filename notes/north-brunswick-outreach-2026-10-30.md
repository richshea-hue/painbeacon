# North Brunswick outreach — the website-link pilot

*2026-10-30. Counts pulled from Supabase the same day; re-run before quoting them.*

The first test of a single idea: **does linking a clinic's own website, instead of
sending the reader to Google, make the profile page perform better?** North Brunswick
is the cluster to try it in, and the only way to run the test is to get the websites,
which means talking to the clinics.

This is a pilot, not a campaign. Eight phone calls.

---

## The experiment this note was written for does not work

**Measured in Search Console on 2026-10-30**, trailing three months, page filter
`/(clinic/nj-(north-brunswick|new-brunswick|highland-park)-|pain-clinics/nj/north-brunswick-area)`:

| | |
|---|---|
| Impressions | 356 |
| Clicks | **0** |
| Average position | **87.2** |
| Impressions on `/pain-clinics/nj/north-brunswick-area/` | **355** |
| Impressions on all twelve `/clinic/` profiles combined | **1** |

The pilot was built to answer: *does linking a clinic's own website, instead of sending
the reader to Google, make the profile page perform better?* It cannot be answered here.
**The profile pages earned one impression in three months.** Collecting five websites
would change five pages that Google does not show. There is no baseline to move.

The area page is where all the traffic is, and it carries no outbound clinic links at
all — `ClinicCard.astro:38` renders a "Website" tag but the only link is internal, to
`/clinic/<slug>/`. So the change under test does not touch the one page that gets seen.

**And position 87.2 is the real finding.** Page nine. The site-wide average is 29.3, so
this cluster ranks well below the site's own norm. Zero clicks at position 87 is not a
click-through problem; outbound links on profile pages cannot move an area page ranking
87th. The queries are the right ones — "pain clinic north brunswick", "pain doctor in
north brunswick", "chronic pain management north brunswick" — which means the demand is
real and the page is simply not competitive for it.

### What survives, and why the calls are still worth making

Not as an experiment. Two reasons stand on their own:

1. **Badge installs.** Every badge on a practice's own site is a referring domain from a
   local medical practice. Position 87 on correct-intent local queries is what a missing
   link profile looks like, and this is the only lever in the pilot that addresses it.
   Two or three installs are worth more than everything else here combined.
2. **The websites are missing data regardless.** Eleven of twelve listings have no URL.
   That is worth fixing whether or not it ever moves a ranking, and it is a prerequisite
   for any later test run somewhere the pages actually get impressions.

What changed is the claim, not the call list or the script. Nobody is told a measurable
experiment is running, because one is not.

## The blocker that comes first

**`GOOGLE_SAFE_BROWSING_API_KEY` is not set, and until it is, a claimed listing does not
get the link.**

`src/pages/clinic/[slug].astro:84` requires all four:

```js
(SITE.linkClinicWebsites && isVerified && c.websiteSafe === true && c.websiteHref) || ''
```

`websiteSafe` comes from the build-time Safe Browsing pass in `src/lib/safebrowsing.js`,
which returns an empty map with no key, so every clinic is `null` — "unvalidated", and
unvalidated is never linked. Every build already says so:

```
[safebrowsing] GOOGLE_SAFE_BROWSING_API_KEY not set — 1483 clinic websites
left unvalidated, so none will be linked.
```

The `badge-backlink` email promises "a search-engine-followed link to {site_host}". Send
it today and that promise does not render. **A clinic that claims, hands over its URL and
then sees no link is a clinic that never answers again** — and in a market this small
that is most of the pilot.

Google Cloud Console → enable "Safe Browsing API" → create an API key → add
`GOOGLE_SAFE_BROWSING_API_KEY` to `.env` and to Cloudflare Pages (production *and*
preview are configured separately, and an env-var change needs a redeploy). Free tier is
10,000 lookups/day; a full build uses four batched requests for 1,631 URLs.

Verify with a build before the links are meant to appear: the log should read
`checked 1631/1631`.

**Collecting URLs on the phone does not depend on this** — the key only has to be set
before the deploy that is supposed to show them. So the calls can start today, as long
as nobody is told the link is already live. The script below is worded for that.

## What the data actually supports

| | |
|---|---|
| Listings in the zone | 12 |
| With a website on file | **1** |
| With a phone | 12 |
| Above free tier | 0 |
| Ever contacted (`contacted_at`) | **0** |
| With Google reviews | 9 of 12 |

**Correction to an earlier draft of this note:** it said review counts were null across
Central NJ and that the DMV's "20–600 reviews" targeting rule could not transfer. That
was wrong — the column is `review_count`, not `user_rating_count`, and it is populated.
The list below is sorted by it, most-reviewed first, exactly as the DMV batch was.

**Two listings per Google place.** Four of the twelve sit in two pairs that share a
`google_place_id`, and therefore share a rating and a review count:

| shared place | listings |
|---|---|
| `ChIJs2yeggDEw4kR1VQzspIVxYA` (4.7★, 135) | Advanced Spine And Pain **+** Central Jersey Anesthesia and Pain Management |
| `ChIJ7TTZZ_XGw4kRBGCghAETgFQ` (4.8★, 60) | Pain And Anesthesia Care **+** Brunswick Spine Care |

They have different phone numbers, so they may be genuinely co-located practices — or
the place match may be wrong, which this project has been bitten by before. Call both
numbers; if the same front desk answers, treat them as one account and say so in the
sheet. Either way, do not quote the review count back to them as "your reviews" until
it is clear whose place it is.

**The website is the ask, not the fallback.** For eleven of twelve, the website is the
one field we do not have. That makes the call much easier than a claim pitch: we are not
asking them to audit what we show, we are asking for one piece of information, and the
front desk can answer it without involving the doctor.

## The ten to call

Twelve listings, two set aside:

- **Rutgers Health-RWJ Scleroderma Program** — hospital system, 2.3★ over 16 reviews. The
  DMV note's own rule: a clinic in a reputation hole reads "your listing" as a threat.
- **The Collaborative Healthcare Group of NJ** — Internal Medicine primary, no Google
  presence. Also one of the 3,116 the pain-primary gate would delist.

Sorted by reviews, which is the proxy for "someone is actually there":

| # | Practice | City | Phone | Rating | Reviews | The ask |
|---|---|---|---|---|---|---|
| 1 | Advanced Spine And Pain LLC | North Brunswick | 888-985-2727 | 4.7★ | 135 | website |
| 2 | Central Jersey Anesthesia and Pain Management PA | North Brunswick | 732-565-3777 | 4.7★ | 135 | website |
| 3 | Pain And Anesthesia Care PC | New Brunswick | 732-745-2989 | 4.8★ | 60 | **claim + badge** (site on file) |
| 4 | Brunswick Spine Care, L.L.C. | New Brunswick | 732-342-9222 | 4.8★ | 60 | website |
| 5 | Edward S Magaziner, MD, PA | North Brunswick | 732-297-2600 | 4.7★ | 31 | website |
| 6 | Precision Spine & Sports Medicine | North Brunswick | 732-422-3400 | 4.7★ | 28 | website |
| 7 | Nature Spine & Joint Care LLC | Highland Park | 732-641-0838 | 4.6★ | 25 | website |
| 8 | Comprehensive Pain Center | New Brunswick | 732-565-1701 | 3.5★ | 15 | website |
| 9 | A&E Anesthesia Associate LLC | North Brunswick | 609-688-6866 | — | — | website |
| 10 | Premier Pain & Rehab Center, PC | New Brunswick | 732-565-1701 | — | — | website |

Rows 8 and 10 share **732-565-1701** — one call covers both; ask whether they are the
same practice and note the answer. Rows 1/2 and 3/4 share a Google place (above).

That is **eight distinct phone numbers**. An afternoon.

Row 3 already has a website on file, so it skips the URL ask and goes straight to the
claim-and-badge conversation.

### The sheet

`scripts/outreach/out/north-brunswick-callsheet.csv` — the table above plus `npi`,
`profile_url`, and empty `called_at`, `outcome`, `website_given`, `badge_offered` and
`notes` columns to fill in while calling. `out/` is gitignored because it carries
contact data; keep it local.

When the calls are done:

```
python scripts/outreach/mark_contacted.py --in scripts/outreach/out/north-brunswick-callsheet.csv
```

Dry run first — it prints what it would write and touches nothing. Add `--apply` to
stamp `contacted_at`, `outreach_channel` and `outreach_status` on the `clinics` table.
Those three columns exist, are null for all twelve, and are not exposed by
`clinics_public`, so none of it reaches the site. Without this step the next pass calls
everyone again.

## Phone, not email — and the arithmetic says so

Published cold-email reply rates sit at 1–5%, with small targeted sends at the top of
that range. Against eight recipients that is **0.1 to 0.4 replies**. An email batch this
size cannot succeed; it can only fail quietly.

Eight calls is an afternoon, and a front desk answering a one-question call about their
own listing is a far better rate than any email benchmark.

### The call — front desk, no doctor needed

> "Hi — this isn't a sales call and I don't need to speak to the doctor. We run
> PainBeacon, an independent directory of pain clinics built from the federal NPI
> registry, and your practice is listed. The one thing we're missing is your website —
> right now the page sends people to a Google search instead of to you. What's your web
> address? … Thanks — I'll get that added, it'll show on your page at the next update.
> It's free, there's nothing to buy, and
> if you ever want to update anything yourselves there's a 'claim this listing' link on
> the page: painbeacon.com."

If they ask what the catch is: there isn't one, the listing is free, and we make money
from sponsors who are not clinics.

**Do not say claiming improves their Google ranking.** It is not a promise we can keep,
and the SEO pitch was deliberately taken out of the claim form (`d624d36`). The same
discipline applies on the phone.

### Voicemail, 15 seconds

> "This is [name] from PainBeacon — we're an independent pain clinic directory and your
> practice is listed with us. Nothing's wrong and there's nothing to buy; we're just
> missing your website address and wanted to link to you instead of to a Google search.
> painbeacon.com, or call back at [number]. Thanks."

### The second ask, only once the first lands

Once the website is up, the badge is worth raising:

> "One more thing, no obligation — there's an embeddable 'Verified' badge you can put on
> your own site that links back to your profile. Some practices like it; it's free."

Every installed badge is a real, topically relevant link from a local medical practice,
which is the thing this site most lacks. Judged against the site's actual constraint,
two or three badge installs are worth more than the rest of the pilot combined.

## What to measure

Stamp `contacted_at` and `outreach_channel` as each call is made — both columns exist and
are null for all twelve. Without that the next pass repeats this one.

Then, in order of how much they matter:

1. **Badges installed** on clinic sites — referring domains, the only outcome here that
   speaks to position 87.2
2. **Websites collected** — missing data worth fixing on its own terms
3. **Claims started and verified** — whether the claim flow works end to end at all

**Not** North Brunswick impressions. The baseline is captured above and it is 356
impressions at position 87.2 with 355 of them on a page this work does not change.
Re-pulling it after the calls would measure noise.

**Where a link test does belong:** site-wide, not in a market.
`page-type-performance-2026-10-30.md` found that `/clinic/` profiles produce 84.8% of all
clicks at an 18.8% CTR — they are the one page type that works, and 1,631 of them have a
website on file that currently dead-ends to a Google search. That is a sample worth
testing. Twelve listings in one zone never was.

## Honest expectation

Eight practices, perhaps three or four websites, perhaps one badge.

This is a relationship and data-quality call, not an experiment. What it is for: finding
out whether clinics answer, whether the URL ask works better than the claim ask, and
whether the mechanics hold end to end — the claim flow, the badge embed, the Safe
Browsing pass. If three of eight hand over a website, the approach is worth running
across the 76 de-duplicated practices in the wider Middlesex/Central NJ pool, and then
the DMV's 92. If none do, we learned that for the price of an afternoon.

Nothing here will move 49 clicks a quarter. The thing that would is referring domains,
and the badge is the only path to one in this note.
