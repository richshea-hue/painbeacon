# SEO and structured-data audit — the prompt to run on the other sites
*2026-10-24. Written from what an audit of PainBeacon actually turned up, so
every check below exists because something was wrong, not because it sounded
thorough.*

The other sites were built from this one's setup, so they inherit its slug
helpers, its sitemap builder and its JSON-LD shapes — which means they may
inherit its bugs with different data behind them.

**Run it one site at a time, in its own session.** See ground rule 1: the
failure it warns about is one this session actually made, attributing one
site's backlink history to another because the two sit next to each other.

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

A2. Raw data becoming a URL segment.
    This is the general form of the worst bug we found. Any function that turns
    a source-data field into a path segment is a duplicate-page generator the
    moment the source sends something unexpected. Find every such function
    (grep for slug helpers and for getStaticPaths), and ask what each one does
    with a value that is misspelled, spelled out, differently cased, or carries
    punctuation or spaces.
    Concretely: list every distinct path segment the sitemap contains at each
    level and look for variants of the same thing. We found /pain-clinics/ga/
    and /pain-clinics/georgia/ both live, both self-canonicalizing, both in the
    sitemap, generated from ONE record whose state arrived spelled out. The
    normalization belongs in the slug function, not at ingest, so it holds
    however the row arrives.
    Also query the database for fields that feed URLs and do not match their
    expected shape.

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

## What each check cost us here, for whoever runs it next

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

## What this audit did NOT explain

Worth saying plainly so the next run does not overclaim. None of the above
accounts for 9,780 URLs sitting in "Discovered — currently not indexed," and
none of it would move an article that Google has never crawled. Those are
crawl-budget and authority problems — links, and not asking Google to crawl
fifteen thousand thin pages — and they are a different piece of work from
anything in this prompt.
