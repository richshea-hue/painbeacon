# A pipeline for featured research

*2026-11-14. Rich asked for a way to publish more research than the two studies
`/research/` had: either produce it ourselves, ask people to publish here, or
both. This is the first of three tracks, built; the other two are described at
the end and are not.*

## What was there

Two pages, made two different ways.

- **Pain care deserts** (2026-07-28). Ours: computed at build time from the
  directory and Census data, with a CSV, a JSON payload and an embeddable map.
- **Chronic pain prevalence, 2019–2023** (2026-08-28). Michael Ray's study in
  *The Journal of Pain*, which Rich found and asked to feature. The author agreed
  to the abstract, the citation and a link; we added a plain-English summary
  marked as ours.

The second one is the repeatable shape, and it had one bottleneck: the journal
is subscription-only, so reprinting its abstract needed the author's yes, which
meant finding him and waiting. That works for a study worth the wait. It cannot
be a schedule.

## The route that needs no permission

A large share of pain research is published under **CC BY**, which grants reuse
with attribution, commercial use included. A CC BY paper can be featured the day
it is found.

Counted on Europe PMC for the 60 days to 2026-11-14: **480** papers with a pain
term in the title under CC BY or CC0. After removing protocols, case reports,
corrections, animal work and papers that are not really about pain, **288** are
candidates. That is far more than we could or should publish; the point of the
ranking is to pick two a month, not to keep up.

"Open access" is not the test. Most free-to-read papers are CC BY-**NC** or
BY-NC-**ND**. This site sells sponsorships, so NC rules us out, and ND rules out
printing an abstract beside a summary of our own. Only plain CC BY and CC0 pass.

## What was built

| | |
|---|---|
| `src/content/research/*.md` | One file per featured study. Frontmatter is the study as published; the body is our summary. |
| `src/pages/research/[slug].astro` | The page, generalized from the Ray page. |
| `src/lib/research-rules.js` | What a study must satisfy to build. |
| `src/lib/research.js` | The one door to the collection; runs the rules. |
| `scripts/find-research-candidates.mjs` | Lists reusable recent studies, ranked, with reasons. |
| `scripts/scaffold-research.mjs` | Turns one into a draft with every quoted field filled in. |
| `data/research-ledger.json` | Studies looked at and passed on, so they are not offered again. |

```
npm run research:find                        # what could we feature?
npm run research:scaffold -- <PMID>          # start a draft
npm run research:find -- --pass <PMID> --reason "..."
npm run test:research
```

The Ray page was moved into the collection rather than left as a one-off. Its
URL, title, description, structured data and visible text are unchanged, checked
against the live page; the only differences are four apostrophes in our own
summary, which markdown now renders as typographic ones.

## Three rules that fail the build

**The license has to be one that lets us reprint.** Checked by its URL, which
carries the exact terms. The scaffolder reads it from the paper's own
`<permissions>` block, falls back to what the publisher deposited with Crossref,
and stops if the two disagree. The search index's "cc by" label finds the paper;
nothing relies on it.

**The abstract has to be exactly as published.** `abstractSha256` pins the text
as fetched. This guards against our own tooling more than against carelessness:
`npm run fix:spelling` rewrites British spellings repo-wide, and a British
author's "randomised" would become "randomized" inside a quotation attributed to <!-- us-english-ok -->
them. Quoted lines carry `us-english-ok` so the gate leaves them alone, and the
hash catches anything that gets through.

**Nothing unfinished goes live.** A scaffold is a draft full of TODO markers. A
draft is absent from the build, and a file that still says TODO cannot be
un-drafted.

All three were tried against a real build: a respelled word in the abstract, a
license swapped to BY-NC, and a leftover TODO each stopped it.

## Judgment calls worth knowing about

- **Every licensed study must say who paid for it.** `disclosure` is required
  before a CC BY study can go live. The second paper the finder ever surfaced was
  a spinal cord stimulation study with a device-company employee among its
  authors. Still worth featuring; not without saying so. The finder flags company
  affiliations and the scaffolder copies the paper's own funding and conflict
  statements into the draft to write from.
- **The page says the authors did not review it.** Under permission the author
  knows. Under CC BY they find out afterwards, so the page states that the
  summary is ours and that featuring is not endorsement, which the license also
  requires.
- **Peer-reviewed papers only, no preprints.** The site has no named medical
  reviewer. Peer review is standing in for one.
- **The ranking is a sort order.** Each candidate prints the reasons behind its
  score. The first live run put a depression review at #4 and scored an interview
  study as a randomized trial; both are now test cases.
- **Our own study leads the research page.** `/research/` now has two sections,
  ours first. In one newest-first list, pain care deserts would drop a row with
  every featured study, and it is the only thing there nobody else has.

## The first one through

*Initial Treatment for Acute Low Back Pain and Risk of Opioid Use Disorder and
Overdose* (Doan et al., *JAMA Network Open*, 2026; CC BY 4.0; 399,500 Medicaid
patients). Ranked first by the finder. Written through the pipeline as
`low-back-pain-first-treatment-opioid-risk`, from the full text.

## The half that is not code

The page is the opening. The point is the note that follows it: *we featured
your paper, here is the link, would you answer three short questions for the
page?* An author has reasons to share and link a plain-English write-up of their
work, and their university's news office has more. That note is also where the
permission track restarts, because the natural next line is to ask what they
are publishing next.

The scaffolder prints the corresponding author's address for this. It is never
written to the repo, which is public.

It is not clear this follow-up was ever sent for the Ray page: the plan was to
email him the live link and three questions, and the page has no Q&A. Worth
checking, since he is the one author already known to be willing.

## Not built

- **Announcing.** Featured studies are not in `rss.xml`, so nothing posts them to
  social. Adding them is a decision, not an oversight: the announcers read the
  first feed item, `wait-for-article.mjs` assumes `/news/`, and each X post costs
  $0.20.
- **Track 2, permission outreach** for subscription-only studies. Same template,
  `license: permission`, a handful a quarter.
- **Track 3, our own data studies.** The linkable assets. Candidates from data
  already held: pain specialists per 100,000 by state and metro, and the over-65
  population living in pain care deserts.

## What this will not do

As of the 2026-10-27 review both research pages had zero search impressions. More
pages of the same kind should not be expected to change that by themselves. The
measure of this is author replies and links earned, not clicks.
