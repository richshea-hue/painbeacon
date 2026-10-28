# SEO and structured-data audit — the prompt to run on the other sites
*Started 2026-10-24; A2 rewritten the same day, PART 0 added 2026-10-28. Written
from what these audits actually turned up, so every check below exists because
something was wrong, not because it sounded thorough. Repos run so far:
PainBeacon, BestRaces, primary-source, hiballevents — results at the bottom.
Add yours when you run one, and fold anything new back into the prompt itself.
Both revisions so far came from a later run teaching the prompt something: A2
from BestRaces, PART 0 from primary-source and hiballevents.*

The other sites were built from this one's setup, so they inherit its slug
helpers, its sitemap builder and its JSON-LD shapes — which means they may
inherit its bugs with different data behind them.

**Run it one site at a time, in its own session.** See ground rule 1: the
failure it warns about is one this session actually made, attributing one
site's backlink history to another because the two sit next to each other. And
see PART 0 — a repo is not necessarily a site, so decide what "one site" means
here before you start.

---

## The prompt

```
Audit this site for the SEO and structured-data problems we found on a sibling
site built from the same template. Find them here or prove they are absent —
do not assume either.

GROUND RULES, and the first one cost us real time today:

1. Verify every claim against THIS repo and THIS site's live pages and Search
   Console. These sites share a template, so facts are easy to carry across by
   mistake — backlink counts, disavow files, demotion dates, indexing numbers.
   If you cannot find the evidence in this repo or this site's own data, say
   "unknown" rather than reaching for what you know about the sibling.
2. Check the live site, not just the checkout. Run `git pull` first; a stale
   clone will have you describing a page that no longer exists.
3. Report findings before changing anything. One findings document, then fixes
   in priority order, one PR per concern.

PART 0 — ESTABLISH SCOPE BEFORE YOU AUDIT ANYTHING. Two questions.

  HOW MANY SITES DOES THIS REPO HOLD?
  Do not assume one. Check for a sites/ directory, workspaces in package.json,
  and more than one astro.config. primary-source held THREE sites behind one
  repo (fertility, asc-platform, dataroom) with two separate domains and two
  separate Cloudflare projects deploying from the same branch. "One site per
  session" and "one repo per session" are not the same thing, and the checks
  below apply per site.

  WHICH OF THEM IS ACTUALLY IN SEARCH?
  Ask this before running a single check, because the answer changes what is a
  defect. For each site, read its layout's <head>: does every page carry
  noindex? Is there a robots.txt, a sitemap, a Search Console property?
  asc-platform emits "noindex, nofollow" on all 7,101 of its pages,
  unconditionally, and the comment above that meta tag says so in terms — "do
  not read it as something waiting to be switched off; read it as a decision
  about what the product is for." It is sold direct, deliberately not through
  search.
  That mattered: its 7,101 pages carry NO canonical at all, and on any other
  site in this family that is a serious A5 defect. Here it is correct —
  pairing a canonical with noindex is the contradiction the siblings avoid on
  purpose, so emitting none is right. I was one step from filing it as the
  headline finding of that audit.
  It also decides where a build gate can go: wiring A8's check into that site
  would have failed every build by design, and that site deploys, so it would
  have broken a real pipeline rather than a local command.
  Write the scope down in the findings document, with the evidence, before
  anything else — including the sites you are NOT auditing and why.

PART A — things you can check yourself, from the repo and the live site

A1. mainEntityOfPage pointing off-site.
    Fetch each page type and extract every JSON-LD block. For each object with
    mainEntityOfPage, compare it to that page's own <link rel="canonical">.
    They must match. Where they do not, the markup is telling Google the page
    belongs to someone else while the canonical claims it — we found exactly
    this on a page featuring a journal article, where url and mainEntityOfPage
    both pointed at the publisher. The fix is to point both at our page and
    credit the original with sameAs or citation.
    Pay special attention to any page featuring, syndicating or reproducing
    third-party content.

A2. Raw data becoming a URL segment -- or a grouping key.
    This is the general form of the worst bug on either site, and the second
    site taught us the half the first one hid. Any function that turns a
    source-data field into a path segment is a duplicate-page generator the
    moment the source sends something unexpected. Find every such function
    (grep for slug helpers and for getStaticPaths), and ask what each one does
    with a value that is misspelled, spelled out, differently cased, or carries
    punctuation or spaces.
    Concretely: list every distinct path segment the sitemap contains at each
    level and look for variants of the same thing. We found /pain-clinics/ga/
    and /pain-clinics/georgia/ both live, both self-canonicalizing, both in the
    sitemap, generated from ONE record whose state arrived spelled out.
    Also query the database for fields that feed URLs and do not match their
    expected shape.

    COUNT THE GROUPINGS. DO NOT STOP AT THE FIRST ONE.
    On PainBeacon the field was normalized in one place and the fix was one
    line. On BestRaces the same field -- the city -- was grouped in FOUR
    separate files, and only one of them built a URL:
      1. the ranking-slice key, `${city}|${state}` as an object key
      2. a map of city centroids, keyed the same way in a different function
      3. a PAID-LISTING equality check, `r.city === slice.city`
      4. the search index's own grouping and its ZIP-count lookup
    So grep for the field as a Map/object key and inside template-literal keys,
    not only inside slug helpers: `[`${r.field}` , `.get(`, `=== slice.`. Number
    3 is the one to fear. It is not a URL at all, it compares a raw row against
    an already-canonical value, and when they disagreed a paid placement
    silently missed the page it was bought for. No page 404s, nothing looks
    broken, and the customer is the one who notices.

    IF A NORMALIZER FOR THIS FIELD ALREADY EXISTS SOMEWHERE, THAT IS THE BUG.
    Before writing one, grep for one. BestRaces already had `cityVariants()`
    in its search-index builder, which knew that organizers type "St." for
    "Saint" and "New York City" for "New York" -- the exact spellings that were
    splitting its ranking pages. A second private copy that drifts from the
    first is the actual failure mode here, and it is the same shape as the
    distance normalizer that CLAUDE.md already warns about. The fix therefore
    belongs in ONE shared module with its own test file, imported by every
    caller -- not in the slug function alone, which would merge two URLs
    without merging the two groups behind them.

    A CLEAN A2 IS A RESULT. SAY WHY, NOT JUST THAT.
    hiballevents passed this check because the bug CANNOT occur there: no
    slugify anywhere in the repo, no derived path segment at all. Its four
    event slugs are hand-written literals in a data file, and the photo, logo
    and carousel lookups key on that slug rather than on a display field. No
    data becomes a URL.
    That is worth writing down rather than ticking, because it is the pattern
    the other sites could move toward: the three that failed this check all
    generate paths from ingested fields (NPPES, RunSignup, CDC). Where a site
    legitimately needs programmatic pages it cannot adopt this wholesale — but
    the principle it embodies is the fix anyway. Derive the URL from ONE
    canonical identifier, and let nothing else in the codebase key on the
    display field.

    THE SYMPTOM IS NOT ALWAYS A DUPLICATE. Look for the opposite too.
    - A guard turns it into a MISSING page. BestRaces gated state slices on a
      two-letter-code lookup, so its Georgia bug could not happen -- but a
      malformed state would have made a race vanish from its state page
      instead, silently, with nothing to see in the sitemap.
    - A THRESHOLD turns it into a missing page. Any "only build this page with
      N+ items" rule is a trap: St. Petersburg had six qualifying races split
      four and two across two spellings, so neither half reached five and the
      city had no page at all. Find every minimum in the page builders and ask
      which groups a spelling split is holding just under it.

    HOW TO VERIFY THE FIX WITHOUT FOOLING YOURSELF.
    Diff the generated URL set before and after, and require ZERO removals --
    an added page is free, a removed one orphans something Google has indexed.
    Build the "before" set by stashing your change and re-running the generator
    on TODAY's data. Do not diff against a committed generated file: on
    BestRaces race dates move pages in and out from one day to the next, and
    that first diff showed a page being removed that my change had nothing to
    do with. I nearly reported it as a regression.
    Then read every merge the new key performs, printed as a list, and confirm
    each one by eye. Mine printed 42 and all 42 were genuine spelling variants
    -- but an earlier version of the key stripped the word "city" wholesale,
    which would have folded Panama City, Kansas City, Oklahoma City and Salt
    Lake City into places that do not exist, and one of those was a live page.
    Keep the merge scope narrow and make every alias explicit and auditable:
    a normalizer that merges too little splits a city, and one that merges too
    much invents one.

A3. Sitemap composition.
    Count sitemap URLs by page type and give percentages. On the sibling site,
    93% of 15,656 URLs were thin programmatic directory pages and 0.1% were the
    articles we actually wrote. That ratio is the crawl-budget problem in one
    line. Report it even if you have no recommendation yet.

A4. Sitemap / robots / noindex consistency.
    Nothing in the sitemap may be disallowed in robots.txt or carry noindex.
    Nothing noindexed may be in the sitemap. List any contradiction.

A5. Canonicals.
    Every indexable page should self-reference. Check a sample of each page
    type, on the live site, including the URL form (trailing slash, .html,
    host) matches what the sitemap lists.

A6. Published datasets, if this site has any.
    A Dataset JSON-LD block needs more than name and license to be FOUND rather
    than merely valid: keywords (what Dataset Search matches a query against),
    variableMeasured, isAccessibleForFree, dateModified, and a distribution
    entry for EVERY downloadable format. We had a live JSON file that the
    markup never mentioned.

A7. Credentials in .gitignore.
    Check for patterns covering service-account key files and any other secret
    a browser download would drop into the project folder. .env alone is not
    enough.

A8. Port the build gate.
    The sibling repo now has scripts/check-structured-data.mjs, wired into
    `npm run build` after the build step. It walks the BUILT html and fails on
    any mainEntityOfPage that is not its own page's canonical. If this repo
    lacks it, port it — and verify it both ways: that it passes clean, and that
    it actually fails when you reintroduce the bug. A check nobody has watched
    fail is not a check.

PART B — ask me for what you cannot reach

You cannot read Search Console. Ask me for these and interpret them:
  - Pages report: indexed count, and the breakdown of every "not indexed"
    reason with its page count.
  - The "Crawled - currently not indexed" and "Duplicate, Google chose
    different canonical than user" lists, exported. Tell me what page types
    they contain and how old the last-crawl dates are.
  - Links report: how many referring domains this site actually has.
  - URL Inspection on one article and one directory page: the exact line under
    "Page indexing."
Say explicitly which conclusions depend on data you have not seen yet.

PART C — what to produce

A findings document with, for each issue: what it is, the evidence (a command
and its output, or a quoted line from a live page), how many pages it affects,
and what it would cost to fix. Order by impact, not by ease. Mark anything you
could not verify as unverified rather than leaving it to be read as a finding.

Then stop and let me pick what to fix.
```

---

## What each check cost us, for whoever runs it next

### First site: PainBeacon, 2026-10-24

| check | what it found on PainBeacon |
|---|---|
| A1 | `/research/chronic-pain-prevalence-2019-2023/` had `url` and `mainEntityOfPage` on the Elsevier article it features. Fixed in #97. |
| A2 | One Duluth clinic with `state = "GEORGIA"` built a second Georgia: `/pain-clinics/georgia/` beside `/pain-clinics/ga/`, both in the sitemap. Fixed in #99 by normalizing in `stateSlug`, the chokepoint every state URL runs through. |
| A3 | 15,656 sitemap URLs: 93.3% clinic profiles, 0.1% articles. 9,780 sat in "Discovered — currently not indexed." |
| A6 | The deserts dataset published a live JSON file the markup never declared, and had no `keywords` — so it could be indexed and still never surface for "health care deserts." Fixed in #96. |
| A7 | `.gitignore` covered `.env` and nothing else, with a Google service-account key about to be downloaded. Fixed in #95. |
| A8 | `scripts/check-structured-data.mjs`, added in #97 and verified in both directions. |

**A2 is the one to care about most.** The others are checks; A2 is a principle —
*any raw field that becomes a URL is a duplicate-page generator* — and it will
find bugs that look nothing like the Georgia one. Shared slug helpers across
these sites mean a shared latent flaw with different data behind it.

## Second site: BestRaces, 2026-10-24

Findings in that repo at `notes/seo-audit-bestraces-2026-10-24.md`; fixes in
its #7 and #8. Two things are worth carrying forward.

**The checks that came back clean are a result, not a blank.** A1, A4, A5 and
both URL-building segments were clean there, with evidence — and A2's state
path was not just clean but *guarded*, which is why the Georgia bug could not
recur. That guard is the thing to copy. A3 also cut the other way: BestRaces
submits 3,619 of its 12,930 built pages because it had already done the
thin-page `noindex` work PainBeacon still hasn't, so the same 94%-directory
ratio meant something different there. Run the check, then read the number in
that site's own context.

**One real finding, and it was four bugs.** The city field was grouped in four
separate files and only one built a URL — the rewritten A2 above is entirely
the lesson from it, including the paid-listing comparison that would have cost
money without 404ing anything. Worth knowing how small it looked at the start:
the audit reported it as one missing ranking page.

| | PainBeacon | BestRaces |
|---|---|---|
| A2 groupings of the field | 1 | **4** |
| existing normalizer elsewhere in the repo | none | `cityVariants()`, already correct, unused by the buggy caller |
| symptom | duplicate page | **missing** page (a threshold split under its minimum) |
| fix | one line in `stateSlug` | a shared module + 38 tests |

## Third repo: primary-source, 2026-10-26

Findings in that repo at `docs/seo-audit-2026-10-26.md`; fixes in its #5 and #6.
This is the run PART 0 comes from. Three sites in one repo, only one of them in
search, and the near-miss described there. Its one real finding was the A2 one
again, in its fourth variation: the city field was grouped in four separate
files and only one built a URL — including a paid-listing equality check that
would have cost money while nothing 404'd.

Also worth copying from it: that repo had already built a post-build gate of its
own (`check-sitemap.mjs`) enforcing four invariants including a duplicate-URL
check, which is further than either earlier site had got, and which it added
after its own version of the St. Louis incident.

## Fourth repo: hiballevents, 2026-10-27

Findings in that repo at `notes/seo-audit-2026-10-27.md`; fix in its #11.
**The first repo to come back clean**, and the first where the central bug class
cannot occur — see the A2 note above, which is the thing to take from this run.

Its one finding was not SEO at all: `.gitignore` covered `.env*` but not
`.dev.vars`, wrangler's local secrets file, which on a Cloudflare Worker is the
only copy of an API key that could ever reach git. Note the shape of that —
A7 had been the same hole in the same place on three repos (a Google
service-account key path), and here it was a different file for a different
reason. **Check what THIS repo's stack keeps on disk**, rather than grepping for
the sibling's filename.

Two more things that run settled:
- A clean A4 can mean the repo got there first. Its build already failed on
  sitemap/noindex contradictions, and `robots.txt` had no `Disallow` at all
  because it exists to WELCOME AI crawlers — strategy, not oversight. Read the
  comments before calling an absence a gap.
- A3 has a floor. At 10 sitemap URLs the crawl-budget question has no subject.
  Report the composition and say so, rather than manufacturing a
  recommendation. The four repos submit 15,656 / 3,619 / 1,718 / 10.

| | PainBeacon | BestRaces | primary-source | hiballevents |
|---|---|---|---|---|
| sites in the repo | 1 | 1 | **3** (1 in search) | 1 |
| A2 groupings of the field | 1 | 4 | 4 | **0 — none derived** |
| A2 symptom | duplicate page | missing page | duplicated row + a paid miss | n/a |
| sitemap URLs | 15,656 | 3,619 | 1,718 | 10 |
| had its own post-build gate already | no | no | **yes** | yes (`check:alts`) |

## What this audit did NOT explain

Worth saying plainly so the next run does not overclaim. None of the above
accounts for 9,780 URLs sitting in "Discovered — currently not indexed," and
none of it would move an article that Google has never crawled. Those are
crawl-budget and authority problems — links, and not asking Google to crawl
fifteen thousand thin pages — and they are a different piece of work from
anything in this prompt.
