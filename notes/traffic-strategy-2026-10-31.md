# How this site gets traffic — what the numbers allow, and what they rule out

*2026-10-31. Research plus the measured Search Console data in
`page-type-performance-2026-10-30.md`. Where a figure is somebody's study it is
attributed; where it is ours it is marked.*

Baseline, ours, trailing three months: **49 clicks, 9,270 impressions, 0.53% CTR,
position 29.3.**

## The ceiling nobody has been accounting for

Advanced Web Ranking's Google Organic CTR study (July 2026 snapshot, Google US desktop,
~1.75M SERPs/month, position-1 figures drawn from 184.8M impressions and 37.0M clicks)
measures position-1 CTR against which SERP features are present:

| what else is on the page | position-1 CTR | clicks per 1,000 impressions |
|---|---|---|
| nothing (clean SERP) | 20.02% | 200 |
| AI Overview | 9.69% | 97 |
| **local pack** | **1.17%** | **12** |

A local pack alone costs position 1 **94%** of its clicks. AI Overview plus local pack
costs 97%.

**Every query this directory is built to win has a local pack.** "pain clinic north
brunswick", "pain doctor in north brunswick", "chronic pain management north brunswick" —
local service intent, so Google shows the pack, and the pack is Google Business Profiles.
**A directory cannot appear in it.** We compete for what is left after it.

So, ours, same 9,270 impressions, if the site ranked **#1 for all of them**:

| query class | clicks at #1 | vs today |
|---|---|---|
| local-pack queries | 108 | 2.2x |
| AI Overview queries | 898 | 18.3x |
| clean SERPs | 1,856 | 37.9x |

**Ranking #1 is worth 8.3x more on an informational query than on a local one.** That
ratio is the single most important number in this note, and nothing we do to the
directory pages changes it.

Worked through on our biggest cluster: North Brunswick's area page has 337 impressions at
position 87.2. Taking it to #1 — the hardest SEO job on the site — yields **4 clicks** if
impressions hold, and **39** even if ranking #1 grew its impressions tenfold. That is the
prize for winning the thing we have been trying to win.

## What this rules out

**Area pages and clinic profiles cannot be a traffic channel.** Not because they rank
badly or read thinly, but because the SERPs they compete on hand ~99% of the clicks to
the local pack. This is structural. It does not yield to links, schema, content depth or
patience.

Keep them anyway — they are 84.8% of current clicks (population C, navigational "Drake
Pain Medicine LLC" searches), they are the product, and `page-type-performance` sets out
why cutting them from the sitemap would be self-harm. Just stop expecting growth there.

## Where the headroom is

**Informational queries have no local pack**, and we already have proof the site can rank
on them: `/news/how-to-choose-a-pain-clinic/` sits at **average position 4** (ours, URL
Inspection plus Performance, 2026-10-29). Position 4, on a site averaging 29.3. The
article ranks; almost nobody searches that exact phrasing, so it drew 3 impressions.

Sixteen articles exist in `src/content/articles/`. The topics are genuinely good — RFA,
spinal cord stimulator trials, epidural steroid injection evidence, pill-mill red flags,
insurance and prior authorization. **The targeting is magazine, not search.** Compare:

| what we published | what people type |
|---|---|
| "Radiofrequency Ablation for Back and Neck Pain: What It Is and Who It Helps" | how long does radiofrequency ablation last |
| "Epidural Steroid Injections: What the Evidence Actually Says" | epidural steroid injection side effects |
| "Sciatica: When to See a Pain Specialist and When to Wait It Out" | is sciatica serious |

Same subject, different entry point. The headline is written for a reader who already
arrived; the query is written by someone who has not.

This is the cheapest work on the list and the only one with a measured 8.3x multiplier
behind it.

## The YMYL gap, which is a hard blocker on exactly that plan

Google holds health content to a higher bar. John Mueller, on YMYL sites: the issue is
less about tactics and more about whether the business is legitimate and backed by
trustworthy sources, and he recommends getting content reviewed by a legitimate expert
and showing that on the page.

**Ours: 0 of 16 articles has a named author or a medical reviewer.**
`src/pages/news/[slug].astro:49` sets `author` to an `Organization`, and line 85 prints
"— The PainBeacon editorial desk". For consumer medical content that is the weakest
available signal: anonymous health advice.

Fixing it is a frontmatter field, a schema change and a credential. The credential is the
real cost — it needs an actual clinician willing to be named. Without it, scaling article
output means scaling anonymous medical content, which is the profile Google suppresses.

**Do this before writing more articles, not after.**

## Links: the existing plan is right, and unexecuted

`backlink-prospects-2026-10-24.md` already has the correct strategy, and research
confirms its central claim — nobody links to a directory, they link to data. We own two
properly built data assets, which is more than most directories ever manage:

- `/research/pain-care-deserts/` — counties with no pain clinic, as a page, **CSV**,
  **JSON** and an **embeddable choropleth**, CC BY 4.0, from federal public-domain sources
- `/research/chronic-pain-prevalence-2019-2023/` — same shape

The pitches are drafted. **Data is Plural and AHCJ Health Journalism Data have not been
sent.** Those two are the highest leverage in the note because a listing propagates into
library guides and newsroom wikis nobody could find to pitch individually. Practitioner
sources agree journalists cite specific numbers rather than whole studies, and that
ungated, indexable data is what gets cited — both of which we already satisfy.

Links remain worth real effort, but be clear about what they buy: links lift the whole
domain, which lifts the *articles and research pages*, where CTR is 8.3x better. They do
not rescue the directory pages, because nothing does.

Also open: **Google Dataset Search**. The deserts page already emits `Dataset` structured
data with the license attached. Confirming it is actually indexed there is a free check.

## Ranked, by measured return per hour

1. **Name a medical reviewer.** Blocks everything else in health content. Needs a person,
   not code.
2. **Send the two dataset pitches** — Data is Plural, AHCJ. Drafted, free, propagating.
3. **Re-target the 16 existing articles** at queries people type. No new writing; new
   titles, H1s and intros, and internal links from the clinic and area pages that already
   get impressions. Measure with the Performance report filtered to `/news/`.
4. **Then** new articles, on the condition-plus-city demand already visible in our own
   query data — "spinal fusion richmond hill ga" and "foot pain aventura" are currently
   landing on a single clinic's profile because no better page exists.
5. **Topic pages** (`MIN_CLINICS_FOR_TOPIC_PAGE`, currently 100000) — but note these are
   condition plus **city**, so many will inherit a local pack and the 1.17% ceiling. Lower
   value than it looked two days ago. Start small if at all.
6. **Badge backlinks** from clinics — real links from local medical practices, the
   North Brunswick pilot's one surviving justification.

## What the research says not to bother with

- **Directory submission runs.** Mostly nofollow, and the vendor guides recommending them
  sell them. 20–40 quality citations beats 200; we are not short of citations anyway.
- **Chasing head terms.** Healthgrades, Zocdoc, WebMD and Yelp hold those, with local
  packs on top. No measured path there.
- **Paid links, guest-post networks, PBNs.** A site whose pitch is that its rankings are
  not for sale cannot buy its own.

## Honest limits of this note

The CTR figures are AWR's, US desktop, all verticals — not pain-specific and not mobile,
where the local pack is more dominant still, so 1.17% is if anything generous. Health
vertical CTR data for 2026 exists only in vendor roundups restating each other; the
numbers that looked usable (-32% health organic traffic, 78% health zero-click) could not
be traced to a primary source and are not relied on here.

**Still unmeasured: the Links report.** Position 87.2 on correct-intent queries is
consistent with a thin link profile, but PainBeacon's referring domains have never been
read. Nothing about bestraces.com's demotion, its two spam domains or its disavow applies
to this property.
