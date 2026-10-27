# SEO and "reads as AI-written" review: PainBeacon (2026-10-27)

Rich asked for the same review BestRaces got today: does the site read as
machine-made, does that cost us in Google, and what should change. The
BestRaces version is `notes/seo-review-greg-moore-2026-10-27.md` in that repo;
its section 4 holds Google's primary sources. I re-checked the ones this note
leans on (section 9) and checked everything else against this repo and this
site only, per the audit prompt's first rule.

Sources for this note: the live site (fetched 2026-10-27), this repo at
`351ebe5`, the `clinics_public` view (14,603 rows, read with the anon key), and
PainBeacon's own Search Console, read in the browser on 2026-10-27. Search
Console data starts on 2026-06-02.

**The short answer.** Yes, the site reads as machine-made, but the part that
matters most is different from BestRaces in two ways.

1. **The clinic pages are where the search traffic comes from.** 97 of the
   site's 104 clicks since June landed on clinic pages, and 48 of the 84
   clinic pages that earned a click hold nothing beyond the federal registry.
   People search a practice's legal name and land on its address and phone.
   The BestRaces fix, noindexing pages we haven't measured, would cut most of
   PainBeacon's clicks. I'm not recommending it.
2. **The bigger problem is trust, on a health site.** Almost every page says
   clinics are "ranked by board certification" and "verified reviews". The
   ranking has no board-certification input, and the reviews are Google
   ratings we copied. Google says trust is the most important part of E-E-A-T
   and weighs it most on health topics. Meanwhile the 13 published health
   articles are indexed and have never shown in a search result. They are
   AI-drafted, signed "the editorial desk", reviewed by no clinician, and 7 of
   them cite no source.

**Top five moves** (details in section 10):
1. Stop saying what isn't true: "board certification" (homepage, 930 zone-page
   descriptions, the footer on every page), "verified reviews" and
   "credentials" (the description of all 14,603 clinic pages), and "our
   ownership disclosure says exactly who runs this directory" (it names no
   one).
2. Put a person on it: an About page in Rich's words, "By Rich Shea" on
   articles, one line on how articles are made, sources on every health
   article, and a real clinician reviewer when one can be found (the code is
   already waiting for one in `site.js`).
3. Take the borrowed Google ratings out of the structured data (Google: "Don't
   aggregate reviews or ratings from other websites"), and drop the FAQ
   markup, which Google stopped showing on May 7, 2026.
4. Shrink the clinic-page template: a 150-word claim form, a four-question FAQ
   that repeats the facts with the name swapped, and three "not medical
   advice" lines sit on 14,600 pages. Fix "Pllc", "Md", "Pain Medicine - Pain
   Medicine" and bare phone digits.
5. No bulk noindex. With Rich's yes, take the 2,065 folded duplicates out of
   the sitemap (their canonicals already point elsewhere). Then the slow
   lever: links. Apart from BestRaces's sponsored house ad, three sites link
   here.

---

## 1. Where PainBeacon stands in search

Search Console, weekly (weeks start Monday; read 2026-10-27):

| Week of | Clicks | Impressions | Avg position |
|---|---|---|---|
| Jun 8 | 10 | 2,650 | 10.1 |
| Jun 15 | 13 | 3,215 | 12.4 |
| Jun 22 | 1 | 1,228 | 28.4 |
| Jul 6 | 7 | 2,310 | 42.1 |
| Jul 20 | 2 | 581 | 55.3 |
| Aug 3 | 7 | 498 | 60.5 |
| Aug 24 | 3 | 1,859 | 13.3 |
| Sep 7 | 2 | 372 | 40.8 |
| Sep 21 | 1 | 507 | 15.3 |
| Oct 5 | 4 | 597 | 17.3 |
| Oct 12 | 4 | 316 | 36.9 |
| Oct 19 | 7 | 1,814 | 9.4 |

All time (Jun 2 to Oct 25): 104 clicks, 23.1K impressions, average position
28. The shape is a launch spike in June that settled by late July to 300 to
600 impressions a week. **There is no BestRaces-style cliff.** That site fell
on 2026-08-16; this one shows nothing that week. The Aug 24 spike didn't hold;
the Oct 19 week is too recent to read, and Search Console hides most of its
queries.

**Where the clicks land**, all time (the UI lists the top 1,000 pages, so the
click column is complete and impressions are partial):

| Page type | Pages seen | Clicks | Impressions |
|---|---|---|---|
| Clinic profiles `/clinic/` | 769 | **97** | 8,684 |
| Zone pages `/pain-clinics/{st}/{area}/` | 225 | 6 | 9,202 |
| Homepage | 1 | 1 | 101 |
| State hubs | 3 | 0 | 77 |
| Articles `/news/*` | 0 | 0 | **0** |
| Research studies | 0 | 0 | **0** |

Last 28 days: 880 clinic pages drew 1,963 impressions and 16 clicks; 112 zone
pages drew 1,140 impressions and 2 clicks. Zone pages often sit at positions 3
to 17 for "pain management {city}" (Dallas, Brooklyn, Baltimore, Los Angeles)
and still earn almost nothing, which suggests they sit below Google's map pack.

**Articles and research.** URL Inspection on
`/news/how-to-choose-a-pain-clinic/`: "URL is on Google ... Page is indexed".
Yet no article under `/news/` has had a single impression since June 2 (the
`/news/` index has one). The research hub has one; the deserts study, the
site's best original work, has none.

**Indexing:** 5.4K indexed, 10.6K not. Of those: 9,774 "Discovered, currently
not indexed", 463 "Alternate page with proper canonical tag", 233 "Crawled,
currently not indexed", 66 redirects, 21 "Google chose different canonical",
2 404s, 1 403. Of the 1,000 indexed URLs Search Console lists: 927 clinic pages, 70
zone pages, no articles.

**Links:** 220 external links. 216 come from bestraces.com, the PainBeacon
house ad, which is `rel="sponsored"` and passes nothing, as it should. The rest:
richshea.com (2), crunchbase.com, linktr.ee. **No manual actions.**

**Sitemap** (live, today): 15,655 URLs. Clinic profiles 14,603 (93.3%), zone
pages 930, state hubs 54, metros 41, articles 13, research 2. Same ratio the
Oct 24 audit reported.

## 2. The "remove the variable" test

Method: 15 live clinic pages, chosen to cover the range (4 with no Google
match, 4 well-documented interventional practices, 2 folded duplicates, all 3
claimed listings, 2 rated without hours). From each page's visible text I
removed the clinic's name and each word in it, street address, city, state,
ZIP, phone, specialty label and website, and turned every number into `#`.
Then for each pair of pages: what share of page A's words also appear on page
B.

| | Words (median) | Shared with another clinic page (median) |
|---|---|---|
| Whole page | 770 | **94%** |
| Main content only | 489 | **90%** |

On the 12 free listings, once the variables are gone, between zero and two
words per page appear on no other sampled page, and those were a neighboring
town in the area name ("naperville", "pensacola"). BestRaces race pages scored
87% on the same test.

What actually varies on a free listing: name, address, phone, specialty label,
years registered, star rating and count, hours, the Medicare line and the map
pin. Everything else is template. A typical free page,
`/clinic/tx-fort-worth-first-choice-medical-solutions-pllc/`, reads in
order:

- "Pain Medicine - Pain Medicine", the name as "First Choice Medical Solutions
  Pllc", phone "8178775353", "No reviews yet", "Hours: Call to confirm",
  "Qualification: Basic listing · limited verified data on file".
- Four FAQ answers that restate those facts with the name dropped in ("First
  Choice Medical Solutions Pllc is a pain medicine clinic located at ...",
  "... has held a federal NPI as a pain medicine provider for about 14 years").
- "Listing built from public federal provider records (NPI registry) and
  enriched with verified location and review data", on a page with neither.
- The claim form, about 150 words.
- "Informational only and not medical advice", then the footer's two more
  disclaimers, then the chat widget's fourth.

**Read in context.** A directory listing is mostly template everywhere, and
Google says so. Its warning is about pages that add nothing beyond their
source. The source here is the NPI registry, which publishes name, address and
phone itself. PainBeacon adds a Google match (rating, hours, map) on 57% of
clinics, Medicare enrollment on 25%, a practice-type label, and the area
ranking. On the other 43% (6,249 clinics: no Google match, no rating, no
hours) the page shows nothing the registry doesn't. What it does that the
registry doesn't is rank for the practice's own name, and section 8 shows
that's where the clicks are.

## 3. Who, How, Why

**Who.**
- There is no About page. The trust bar on every page says "Who's behind
  this" and links to `/ownership-disclosure/`, which says "the organization
  behind PainBeacon owns no pain clinics" and sends questions to "the
  directory's editorial team" (`ownership-disclosure.astro:55`). No person is
  named and no address is given.
- The homepage says "Our ownership disclosure says exactly who runs this
  directory" (`index.astro:288`). It doesn't.
- The only named person is a footer link, "Founded by Rich Shea", to
  richshea.com.
- Articles are signed "— The PainBeacon editorial desk" and marked up with an
  Organization author (`news/[slug].astro:49,85`; also `news/index.astro:16,22`,
  `rss.xml.js:42`). A desk that is one person is the small untruth the BestRaces
  note flagged too. The deserts study's markup names Rich as author
  (`pain-care-deserts.astro:67`), but the page doesn't show it.
- **One thing done right:** `site.js` keeps `medicalReviewer.active: false`
  with a note never to show a fabricated reviewer. Keep that rule.

**How.**
- Articles come from a weekly scheduled routine that takes the next topic in
  `article-calendar.md` and drafts it; several of those commits carry a Claude co-author line.
  Nothing on the page says so. These are health articles: epidural steroid
  injections, spinal cord stimulators, opioids, sciatica.
- 7 of the 13 published articles cite no source at all, including
  "Epidural Steroid Injections: What the Evidence Actually Says". The other
  six carry two or three links each; none links to a study or a guideline
  body (`grep` for pubmed, doi.org, .gov: zero).
- The clinic data's sources are named loosely: "the federal NPI registry,
  enriched with public location and review information". The ratings, hours,
  coordinates and websites come from the Google Places API
  (`scripts/backfill_*.py`). The page never says Google.

**Why.** The site earns from Featured listings ($500/mo), Enhanced profiles,
brand sponsors, and a chat widget on every page that offers to "share your
contact with a clinic to help you book". Each is disclosed somewhere and none
touches the ranking. But a reader has to assemble that from four pages. One
plain paragraph on an About page would do it.

## 4. Claims the data can't back

| Claim | Where | Reach | What's true |
|---|---|---|---|
| "ranked by board certification" / "Board-certified pain specialists, ranked on ... board certification" | `index.astro:146,275`; zone description `[zone].astro:83`; `/how-we-rank/` description (`how-we-rank.astro:20`); all-states description (`pain-clinics/index.astro:28`); `SITE.description` (`site.js:9-11`), printed in the footer and Organization markup of **every page**; Organization `knowsAbout` (`Base.astro:65`); default share-image alt (`Base.astro:23`) | All 15,655 pages; in the description of 930 zone pages | `ranking.js` reads five things: interventional taxonomy, Google rating, review count, years since NPI enumeration, website and phone. No board-certification data exists in the database. |
| "Location, contact, credentials, and verified reviews" | clinic description (`clinic/[slug].astro:167`) | 14,603 clinic pages | `provider_credentials` is empty for every clinic. 7,886 clinic pages have no reviews at all. The reviews that exist are Google's, unverified by us. |
| "verified patient rating", "verified review volume", "verified reviews from public sources" | `how-we-rank.astro:11-12,45`; homepage badge "Verified reviews & credentials" (`index.astro:164`); `for-practices.astro:57,133` | Site-wide trust copy | Same. |
| "enriched with verified location and review data" | clinic notice (`clinic/[slug].astro:290-291`) | 14,603 pages | 43% have no Google match. |
| "Our ownership disclosure says exactly who runs this directory" | `index.astro:288` | Homepage | Names no one (section 3). |
| "Interventional pain medicine credential" | `how-we-rank.astro`, `how-we-rank-pain-clinics.md:23,61` | Methodology | NUCC taxonomy codes are self-selected on the NPI application, not a credential anyone checks. "Registration" is accurate. |
| "Editorially maintained — last updated 2026-05-29" / "As of 2026-05-29" | footer (`Base.astro:182`), `ownership-disclosure.astro` | Every page | Five months stale on pages rebuilt daily. |
| "{Name} is a pain medicine clinic" | FAQ (`clinic/[slug].astro:111`) | Every clinic page | Holds for most. 2,839 primary listings register as something else first (143 as medical-equipment suppliers, labs or pharmacies). |

The false line spreads. The unpublished draft `pain-after-a-car-accident.md:110`
repeats "board certification" from the site copy, and the BestRaces house ad
for PainBeacon says it too (`bestraces/data/sponsors.json`, the alt text, the
body, and probably the banner image itself). That copy lives in the BestRaces
repo.

**A ranking a reader will question.** On `/pain-clinics/tx/dallas/`, number 2
of 127 is "Dallas Physician Medical Services For Children Inc", three stars
from 1,253 reviews, ahead of several five-star pain practices. Under the
current weights a listed website is worth 7.5 points and two stars of rating
10, so review volume and a website can outweigh a much worse rating. The
arithmetic is correct and published, but a patient will read it as an error.
That's Rich's call (section 11).

## 5. Reassurance said on every page

- "Not medical advice": three times on every page (twice in the footer,
  `Base.astro:183,219-220`, once in the chat widget, `LeadChat.astro:58`), four
  on clinic pages and articles.
- No pay-to-rank: the trust bar on every page, then three more times on the
  homepage ("Not on who pays", the badge strip, "No clinic can pay to rank
  higher"), under a heading that says "Why patients trust PainBeacon".
- "Verified" 4 to 6 times on the homepage, `/how-we-rank/`, `/for-practices/`
  and each clinic page.
- The claim form promises privacy three times in a few lines: "never
  published on the site or shared", "(we reply here — not shown publicly)",
  "(so we can reach you — not shown publicly)".
- "Free ... for a limited time" appears on the clinic page, in the claim form
  and twice on `/for-practices/`.

Each line is true or nearly so. Repeated on 14,600 pages they read as a script
reassuring itself, which is the same finding as BestRaces's "never" count.
PainBeacon is lighter on "never" (0 to 4 per page) and heavier on "verified"
and disclaimers.

## 6. Copy tics

Mostly in the July to September articles and the site chrome.

- **"Honest"** as filler, 8 times: "Here is the honest version."
  (`epidural-steroid-injections-evidence.md:18`), "this is the honest version"
  (`pain-management-without-opioids.md`, in the dek), "The brain half, described
  honestly" (same file, :93), "The honest answer is that results vary"
  (`radiofrequency-ablation-back-neck-pain.md:88`), "The honest caveat"
  (`spinal-cord-stimulator-trial.md:122`), "the honest window"
  (`sciatica-when-to-see-a-specialist.md:125`), "That bottom band is the honest
  part" (`how-we-rank-pain-clinics.md:58`), and again in the
  mental-health draft (:42).
- **"Not X. It is Y."**, 7 times: "Sciatica is not a diagnosis. It is a
  description of a pattern"; "Non-opioid pain care is not one substitute pill.
  It is several modest treatments stacked together"; "The goal is not to
  stretch the pain out. It is to raise ..."; "Done properly it is not that. It
  is a graded program"; "This is not the emergency version. It is a reason to
  be examined"; "That is not an argument against having one. It is an argument
  for ..."; and the car-accident draft's opener, "The worst part of a car
  accident is often not the accident. It is the second morning".
- **"Actually" in titles**, 5 of 15: "What the Evidence Actually Says", "What
  You Will Actually Pay", "What Modern Clinics Actually Offer", "What an
  Interventional Pain Clinic Actually Does", "What Actually Helps".
- **Em dashes:** the July to September pieces run one per 50 to 90 words
  (`first-pain-clinic-appointment.md`: 12 in 592; `what-interventional-pain-clinics-do.md`:
  14 in 678; `how-to-choose-a-pain-clinic.md`: 13 in 748). The three October
  articles have none, so the routine already improved. The unpublished
  mental-health draft has 20 in 2,085, so it can slip back. Site pages carry 14
  to 20 each, mostly in the chrome.
- **Trust asserted, not shown:** "Why patients trust PainBeacon", "Rankings
  you can read", "Nothing hidden".

**What reads human, and is the model to copy:** the Medicare explanation on
`/how-we-rank/` ("A clinic missing from that federal file is never shown as
refusing Medicare", with the reason), the "Who is ranked" section, the
"Also listed in {city}" note on zone pages, and the October articles. They
explain a real limit of the data in plain words.

## 7. Machine artifacts

- **Title-case damage to names:** 3,196 clinic names (22%) render with "Pllc",
  "Md", "Do", "Llp", "Sc" or "Ii": "Alan D Silberberg, Md PA", "Morris
  Jagodowicz Md Inc", "Isp Health Pllc", "Interventional Spine And Pain, Llp".
  `titleCase()` fixes only the first LLC, PC or PA and has no rule for the rest
  (`data.js:202-209`).
- **Raw taxonomy as the page's eyebrow:** "Pain Medicine - Pain Medicine" on
  2,139 clinic pages (`clinic/[slug].astro:175`).
- **Bare phone digits:** 3,227 phones (22%) print as "8178775353".
- **Empty states as content:** "No reviews yet" on 7,886 clinic pages (54%),
  "Call to confirm" for hours on 9,986 (68%), "Basic listing · limited verified
  data on file" on about 6,200 (43%).
- **Legal entity names:** 78% of names end in LLC, PC, Inc and the like, and
  some aren't what a patient would recognize ("Araliya Global Enterprises
  LLC", "Sanabria Alberto LLC", "Stuart L Bloom Do A Proffessional
  Corporation"). Search Console says people search these exact names, so
  this one is data to live with, not to hide.
- "54 states and territories" in the homepage eyebrow (`index.astro:142`).

## 8. The noindex question, with this site's own data

The BestRaces plan noindexes pages with nothing measured. PainBeacon's data
says don't copy that.

- 97 of 104 clicks went to clinic pages, spread over 84 pages.
- Of those 84: **48 have no Google match, no rating and no hours**, 25 have a
  rating, 12 are folded duplicates. Thin pages are *over*-represented among
  pages that earn clicks: 57%, against 43% of the directory.
- The queries are navigational: a practice's name, a doctor's name, a phone
  number, a street address ("dr herschel kotkes", "cns network torrance ca",
  "3100 university blvd"). For a small practice with a poor or missing
  website, our page is a reasonable answer: who they are, where, how to call.
- There is no demotion to recover from (section 1), and no manual action.
  9,774 pages waiting in "Discovered" is Google declining to spend crawl on a
  young site with three linking domains, not a penalty.

**Recommendation: no bulk noindex.** One narrow index change instead, with
Rich's yes: the sitemap lists all 14,603 clinic URLs, including **2,065 folded
duplicates whose canonical points to another listing** (`sitemap.xml.js:47`
adds every clinic; `clinic/[slug].astro:35-40` sets the canonical). The
sitemap and the canonical contradict each other; 463 of them already show as
"Alternate page with proper canonical tag". Listing only primaries removes the
contradiction. The pages stay up and keep their canonicals, so nothing is
deindexed by this. 12 of the 84 clicked pages are folded duplicates, which is
why this stays a sitemap change and not a noindex.

## 9. Research: what Google says (re-checked 2026-10-27)

Page dates are each page's own "last updated" stamp.

- *Creating helpful content* ([doc](https://developers.google.com/search/docs/fundamentals/creating-helpful-content),
  2026-10-05): "Of these aspects, trust is most important." Google gives more
  weight to strong E-E-A-T on topics that "could significantly impact the
  health, financial stability, or safety of people". It "strongly encourage[s]
  adding accurate authorship information, such as bylines", warns that
  invented creator profiles are deceptive, and says AI or automation
  disclosures are useful where a reader would wonder how content was made.
- *Spam policies* ([doc](https://developers.google.com/search/docs/essentials/spam-policies),
  2026-08-28): scaled content abuse includes "Scraping feeds, search results,
  or other content to generate many pages"; doorways include pages "targeted
  at specific regions or cities that funnel users to one page"; link spam
  includes "Exchanging goods or services for links".
- *Review snippets* ([doc](https://developers.google.com/search/docs/appearance/structured-data/review-snippet),
  2026-09-08): "Don't aggregate reviews or ratings from other websites." For
  local businesses, "Ratings must be sourced directly from users." Our
  `aggregateRating` (`schema.js:55-62`, on 6,717 clinics) is Google's ratings.
  Search Console recognizes **one** valid review-snippet item, so Google is
  already ignoring it; removing it costs nothing.
- *FAQ rich results:* Google's Search Central documentation log says FAQ rich
  results stopped appearing in Search on 2026-05-07 for every site, and the
  FAQ documentation was removed on 2026-06-15 (secondary coverage:
  [SEJ](https://www.searchenginejournal.com/google-drops-faq-rich-results/574429/),
  [ppc.land](https://ppc.land/google-kills-faq-rich-results-what-seos-saw-coming-since-2019/)).
  Unused markup does no harm. The point is that the visible FAQ on 14,603
  pages now earns nothing and is the most templated text on the page.
- *Places API policies* ([doc](https://developers.google.com/maps/documentation/places/web-service/policies),
  2026-10-23): "You must not pre-fetch, cache, or store Places API content
  beyond the allowed exceptions" (place IDs may be kept), and "When displaying
  Places API data without a Google Map, you must include the Google logo."
  We store ratings, review counts, hours, coordinates and websites from
  Places and show them on static pages and a Leaflet map with no Google
  attribution. **This is a terms question, not an SEO one**, and I haven't
  checked what Rich's Maps Platform agreement says. It's also the real source
  of what the site calls "verified reviews".
- Not re-fetched, taken from the BestRaces note's section 4: the rater
  guidelines (YMYL, 4.6.5 and 4.6.6 on scaled pages, 2.5.2 on knowing who runs
  a site), Mueller on sites that generate a page per combination, and the
  absence of any Google document on style tells like em dashes. **So the copy
  tics matter for readers' trust, not as a ranking signal.** On a health site,
  readers' trust is most of the game.

**The followed-link offer.** The claim form on every clinic page offers "a
direct, search-engine-followed link to your site — a quality backlink that
helps your own SEO. Free for verified clinics for a limited time."
(`ClaimProfile.astro:54`; also `for-practices.astro:70`, `clinic/[slug].astro:214`.)
Free, it's fine. The day it costs money it is a paid link and needs
`rel="sponsored"`, and "a quality backlink that helps your own SEO" is the
kind of pitch the link-spam policy is written about.

---

## 10. The plan

Order: what's untrue first, then who's behind it, then the template and voice,
and index changes last. Nothing below changes a clinic's score, rank or URL.
Effort assumes a session on Rich's computer.

### Tier 1: fix what's untrue (small, safe)

| # | Change | Where | Effort | Risk |
|---|---|---|---|---|
| 1 | **Replace every "board certification" claim** with what the engine measures. Suggested: "ranked on published criteria: interventional registration, patient ratings, review volume, years registered, and contact details." Rich picks the words. | `site.js:9-11`, `index.astro:103,146,275`, `[zone].astro:83`, `pain-clinics/index.astro:28`, `how-we-rank.astro:20`, `Base.astro:23,65` | 1 hr | None |
| 2 | **"Verified reviews" becomes "Google ratings"**, and "credentials" leaves the clinic description. Clinic description becomes something like "{Name}, a pain medicine practice in {City}, {ST}: address, phone, hours, Google rating and Medicare status", naming only fields that page has. "Interventional credential" becomes "registration". | `clinic/[slug].astro:167,290-291`, `how-we-rank.astro:11-12,45`, `index.astro:164,275,282`, `for-practices.astro:56-57,133`, `how-we-rank-pain-clinics.md` | 1 hr | None |
| 3 | **Make the homepage's "says exactly who runs this directory" true** by naming Rich on the page it links to (ties to #7), or reword it. | `index.astro:288` | 15 min | None |
| 4 | **Stale dates:** replace the footer's "last updated 2026-05-29" with the date the methodology was last reviewed, kept current, or drop the line. Same for "As of" on the disclosure page. | `site.js` `editorial.lastReviewed`, `Base.astro:182` | 15 min | None |
| 5 | **Take `aggregateRating` out of the clinic markup.** Keep the stars on the page, labeled "Google rating". | `schema.js:55-62` | 15 min | None (1 item recognized today) |
| 6 | **Drop the FAQPage markup.** What happens to the visible FAQ is #10. | `clinic/[slug].astro:169` | 15 min | None |

### Tier 2: say who's behind it (needs Rich's words)

| # | Change | Effort | Risk |
|---|---|---|---|
| 7 | **An About page**, first person, in Rich's voice: who he is, why PainBeacon exists, where the data comes from (NPI registry, CMS Medicare enrollment file, Google ratings and hours), how the site makes money (Featured listings, sponsors, the clinic connection in the chat), the no-pay-to-rank rule said once, and how to report an error. Point the trust bar's "Who's behind this" at it. I'll draft from facts Rich gives me and invent nothing. | 2 hr + Rich | None |
| 8 | **Bylines:** "By Rich Shea" on articles, linked to the About page; Article `author` becomes a Person; retire "editorial desk" and "editorial team" (`news/[slug].astro:49,85`, `news/index.astro:16,22`, `rss.xml.js:42`, `ownership-disclosure.astro:55`). | 1 hr | None |
| 9 | **One line on how articles are made**, at the foot of each, e.g. "Drafted with AI help from the sources listed below; I check every claim against them before it runs." **Rich's call** on whether to say AI. On clinic pages, a plain source line: "From the federal NPI registry (updated {date}), the CMS Medicare enrollment file, and Google ratings and hours." | 1 hr | None |
| 10 | **Sources on every health article.** The 7 with none first, starting with the epidural evidence piece: link the studies and guideline bodies each claim rests on. Make sources a required section for the weekly routine. | 1 day | None |
| 11 | **A named clinician reviewer** for the health articles, the biggest single trust lever a YMYL site has, and the one the code is already built for (`SITE.medicalReviewer`). A pain physician from the outreach list, paid per article if need be. Never faked. | Rich, ongoing | None |

### Tier 3: shrink the template, change the voice (medium)

| # | Change | Effort | Risk |
|---|---|---|---|
| 12 | **Clinic page diet.** The claim form becomes one line ("Work here? Claim this listing, free") opening the form on demand or on its own page. The four-question FAQ goes; its facts are already in the fact list (keep a single "call to confirm new patients" line). One "not medical advice" per page, in the footer. The "free for a limited time" pitch appears once. Target: a free listing's main content mostly facts about that clinic. | half day | Low; watch claim submissions in the dashboard |
| 13 | **Display fixes, data untouched:** a name formatter (PLLC, LLP, MD, DO, PA, PC, SC, II, at name ends and after commas only), phone formatting, and the eyebrow showing "Pain medicine" or the sub-specialty, never "Pain Medicine - Pain Medicine". Slugs stay as they are. | 2 hr | Low; check every rewrite on a printed list before shipping |
| 14 | **Rewrite the tics** in the July to September articles: "honest", "not X. It is Y.", "Actually" titles, em dashes down to a few per piece. Same URLs, no facts changed. Then the homepage's trust block and badge strip: say it once, plainly. Add the tics to the routine's style rules. | half day | Low |
| 15 | **Drop "a quality backlink that helps your own SEO"** from the claim form. **Rich's call:** the followed website link stays free for good, or turns `rel="sponsored"` the day it's paid for. | 15 min | None |

### Tier 4: index and structure (needs Rich's explicit yes)

| # | Change | Effort | Risk |
|---|---|---|---|
| 16 | **Sitemap lists primaries only:** drop the 2,065 folded duplicates whose canonical points elsewhere. Pages stay, canonicals stay, no noindex. | 15 min | Low |
| 17 | **No bulk noindex** of thin clinic pages (section 8). Revisit only if Search Console shows clicks moving off clinic pages. | none | n/a |

### Tier 5: what actually moves a young YMYL site (ongoing)

| # | Change |
|---|---|
| 18 | **Links.** Still the biggest lever. The deserts study ("1,904 U.S. counties have no pain clinic") is the asset: it's original, public-domain data with a downloadable file and an embed. Pitch it to state health reporters, pain societies and rural-health groups (see `notes/backlink-prospects-2026-10-24.md`). The verified-badge loop needs claimed clinics; there are 3. |
| 19 | **Fewer, better articles.** On a health site, one reviewed, sourced article beats weekly unreviewed ones; heavy automation across many topics is on Google's own warning list. Suggest every other week, sourced, under Rich's byline, until a reviewer is in place. **Rich's call.** |
| 20 | **First-hand material.** Claimed clinics' own descriptions, providers and photos (0 so far), a clinician Q&A, and data only we hold: the Medicare match, the deserts analysis per state. |

### Not doing, and why

- **BestRaces's noindex rule:** it would remove 48 of the 84 pages that earn
  clicks.
- **AI-written blurbs for 14,600 clinics:** the definition of scaled content
  abuse, whoever writes them.
- **New or shorter URLs:** redirect churn for nothing.
- **Keyword-tuning 14,600 titles:** a keyword won't fix a template.
- **A reviewer in name only:** the rule in `site.js` stands.

## 11. Questions for Rich

1. Wording for the ranking line once "board certification" goes (#1).
2. Facts for the About page: your background, why PainBeacon, the address
   for corrections (#7).
3. Whether the article line says AI (#9).
4. Do you want to recruit a clinician reviewer, and is paying per article OK
   (#11)?
5. The followed website link: free for good, or sponsored when paid (#15)?
6. The Places terms: want that scoped separately (section 9)?
7. Weighting: is a website worth more than a 1.5-star rating difference? The
   Dallas page ranks a three-star children's group second (section 4). This
   changes rankings, so it's a methodology change with a published note, not
   part of this plan.
8. Yes or no on the sitemap change (#16).

The BestRaces house ad that repeats "ranked by board certification" needs the
same fix in the BestRaces repo.
