# Which page types earn clicks, and which earn impressions

*Search Console, Performance → Search results → PAGES, no page filter, trailing three
months. Two pulls: sorted by clicks (2026-10-30, top 28) and sorted by impressions
(2026-10-31, top 50). Site-wide for the window: **49 clicks, 9,270 impressions, 0.5%
CTR, position 29.3.***

Two sorts of the same report describe two different populations, and reading either one
alone gets the site wrong. That happened twice here; both corrections are recorded below.

## The impressions pull — where demand actually is

| page type | pages | clicks | impressions | share | CTR |
|---|---|---|---|---|---|
| `/pain-clinics/<state>/<zone>/` area pages | 33 | 3 | **2,212** | 68.6% | 0.1% |
| `/clinic/<slug>/` profiles | 16 | 1 | 942 | 29.2% | 0.1% |
| homepage | 1 | 1 | 69 | 2.1% | 1.4% |
| | 50 | 5 | 3,223 | 100% | 0.2% |

**Demand is concentrated.** Fifty pages hold **34.8% of all site impressions** — 3,223 of
9,270 — out of 15,656 in the sitemap. **46 of those 50 pages have zero clicks**, holding
86.7% of the impressions in the list. The top 50 by impressions account for 10% of site
clicks; the top 28 by clicks accounted for 67%. Almost no page does both.

## Three populations, not two

| | pages like | impressions each | CTR | what they rank for |
|---|---|---|---|---|
| **A. Area pages** | `/pain-clinics/il/chicago/` 291 | 20–337 | ~0.1% | commercial local queries |
| **B. High-impression profiles** | `wi-green-bay-anesthesia` 210 | 20–210 | ~0.1% | condition + city queries |
| **C. Low-impression profiles** | `fl-boynton-beach-...` 2 | 2–9 | ~19% | the practice's own name |

Population C is the site's entire click business: navigational search, where someone
already has the practice name, types it, and nothing else competes for "Drake Pain
Medicine LLC". Those pages convert because the intent is already resolved.

Populations A and B are where the volume is, and both convert at roughly nothing. North
Brunswick's area page sits at **position 87.2** on queries as on-target as "pain clinic
north brunswick" (`north-brunswick-outreach-2026-10-30.md`).

## What population B reveals

Sixteen clinic profiles carry 942 impressions and one click between them. Matching the
cities against the earlier top-100 query pull explains why:

| market | condition+city query impressions | page impressions | landing page |
|---|---|---|---|
| Richmond Hill, GA | 51 | 131 | `/clinic/ga-richmond-hill-riverside-spine-georgia/` |
| Aventura, FL | 20 | 101 | `/clinic/fl-aventura-healing-earth-rejuvenation/` |
| Antelope Valley, CA | 16 | 20 | `/clinic/ca-lancaster-antelope-valley-orthopaedic-...` | <!-- us-english-ok: real NPPES practice name -->
| Dover, DE | 34 | 38 | `/pain-clinics/de/dover/` |
| North Brunswick, NJ | 84 | 337 | `/pain-clinics/nj/north-brunswick-area/` |

205 impressions of "spinal fusion richmond hill ga", "foot pain aventura", "knee pain
antelope valley", "pelvic pain dover", "leg pain north brunswick" — condition-plus-city
queries, landing on a single practice's profile or on a city page, because **the site has
no page for a condition in a city.** `src/lib/topics.js:105` sets
`MIN_CLINICS_FOR_TOPIC_PAGE = 100000`, which switches every `/[topic]/[city]/` page off.

Google is substituting the closest thing it can find and ranking it badly. A single
clinic profile picking up 131 impressions for spine-surgery queries in one Georgia town
is not a page doing its job; it is a gap being papered over.

## The sitemap question, answered

Whether to stop submitting thin `/clinic/*` profiles — 14,603 of 15,656 sitemap URLs,
93.3% — so crawl budget reaches pages that can rank.

**No.** Population C produces **84.8% of the site's clicks**. Cutting clinic profiles
cuts the only thing converting. Fourth independent reason against, and the first measured
rather than inferred: the earlier three were that articles are already crawled and
indexed, that clinic pages produce effectively all visibility, and the anti-correlation
between crawl volume and ranking.

A narrower cut — populations A and B only, keeping C — is not available either, because
nothing distinguishes them structurally. The same template produces all of them; which
population a page lands in depends on what Google decides to rank it for.

Still the owner's decision. The argument against is now evidential.

## Two corrections this supersedes

**1. North Brunswick does not represent the site.** Its cluster showed 355 of 356
impressions on the area page and 1 across twelve clinic profiles, and the reading floated
from it — that clinic profiles might earn nothing site-wide — was wrong. Checked before
it was acted on.

**2. "Clinic profiles convert at 18.8%" was survivorship bias.** That figure came off the
click-sorted list, which by construction contains only pages that got clicks. The
impressions-sorted list shows sixteen clinic profiles with 942 impressions and one click
— 0.1%. Both numbers are real; each describes one tail. Clinic profiles are bimodal, and
no single CTR describes them. The 18.8% belongs to population C alone.

## Still unmeasured

The **Links report** — referring domains. Position 87.2 on correct-intent local queries
is what a thin link profile looks like, but PainBeacon's backlink profile has not been
read. Nothing about bestraces.com's 2026-08-16 demotion, its two spam referring domains
or its 2026-09-23 disavow applies to this property.

Also unpulled: per-page average position. Brooklyn (184 impressions, 2 clicks) and New
York (157, 1) convert where Chicago (291, 0) and Dallas (156, 0) do not, which suggests
they rank materially better, but that is inference until the position column is read.
