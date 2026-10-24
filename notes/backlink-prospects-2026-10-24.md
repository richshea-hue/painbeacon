# Backlink prospecting — who could link to us, and how to ask
*2026-10-24, corrected the same day. Prospect URLs were found by search and are
unverified; open each one before writing to it.*

> **Correction.** The first version of this note said PainBeacon had exactly two
> referring domains, both SEO-spam link sellers, disavowed on 2026-09-23, during
> recovery from a site-wide demotion on 2026-08-16. **Those are BestRaces' facts,
> not PainBeacon's** — they were carried across from the other project by
> mistake. PainBeacon has no disavow file and no recorded demotion. Its actual
> backlink profile is unknown and has to be read from the Search Console Links
> report before anyone quotes a number, including us.

## Read this before anything else: do not trade links

Google's spam policies name "excessive link exchanges" and "link to me and I'll
link to you" arrangements as link schemes. That is reason enough on its own — it
does not need a war story, and the one this note originally told was another
site's.

The working rule: **never agree in writing to give a link in exchange for one.**
If a resource page links to us and we separately find their page genuinely worth
citing in an article, link to it — that happens between real publishers all the
time and nobody is counting. The difference is whether the link was traded or
earned, and that difference is legible.

## What we have that is actually linkable

Nobody links to a directory. They link to **data**. In order of strength:

1. **`/research/pain-care-deserts/`** — counties with no pain management clinic,
   published as a page, a **CSV**, a **JSON** payload and an **embeddable
   choropleth**, all **CC BY 4.0**, all built from federal public-domain sources
   (NPPES, Census, TIGER). This is the single most linkable thing we own and it
   already exists. Lead with it every time.
2. **`/research/chronic-pain-prevalence-2019-2023/`** — same shape, second
   subject.
3. **The Beacon guides** — the non-opioid guide, the spinal cord stimulator
   trial, pill-mill red flags. These fit "patient education" resource lists.
4. **The directory itself** — our best asset for users and our weakest for
   links. Mention it second, never first.

Check that the deserts page is turning up in **Google Dataset Search**. It
already emits Dataset structured data with the license attached, so it should
be; if it is not, that is a free fix worth more than several emails.

## Where to ask, best return first

### A. Dataset newsletters and journalist data libraries

The highest leverage per hour, because one feature propagates: being listed gets
mirrored into library guides, course pages and newsroom wikis that we would
never find to pitch individually.

- **[Data is Plural](https://www.data-is-plural.com/)** — a weekly newsletter of
  "useful/curious datasets" with an open archive that other sites republish and
  cite (a [Dallas library guide](https://udallas.libguides.com/business/websites)
  lists it; VOA built a [journalist-facing remix](https://projects.voanews.com/data-resources/about.html)
  of the archive). Submissions are free and go to the editor. **Do this one
  first.** The county-level desert file is exactly the shape that gets picked.
- **[AHCJ Health Journalism Data](https://healthjournalism.org/data/)** — the
  Association of Health Care Journalists' curated archive of data sources,
  organized by topic. Our dataset is a fit; being in it reaches the reporters
  who would write the story.
- Local and regional newsrooms, for the story rather than the list: "X counties
  in [state] have no pain clinic" is a real local story and the data is free to
  use under CC BY as long as they credit.

### B. University library guides

Librarians maintain consumer-health subject guides, genuinely want good free
resources on them, and answer polite email from a human. High-authority `.edu`
domains, and the link usually survives for years.

Found by search, all **to be opened and verified** before pitching:

- [University of Illinois — consumer health](https://guides.library.illinois.edu/mbh/consumerhealth)
- [UC Irvine — consumer health](https://guides.lib.uci.edu/consumerhealth/home)
- [Northern Health — pain management](https://nhalibrary.libguides.com/painmanagement)
- [KRS — chronic pain](https://krs.libguides.com/chronicpain/home)

Skip the Australian guides that come up alongside them (La Trobe, Monash,
ANZCA, Southern Cross). We are a US directory; a guide for Australian patients
has no reason to link to us and asking marks us as a spammer.

Find more with: `site:libguides.com "chronic pain"`,
`site:.edu inurl:libguides consumer health pain`,
`site:.edu "pain management" "patient resources"`.

### C. Patient advocacy organizations

- **[U.S. Pain Foundation](https://uspainfoundation.org/)** — runs education and
  resource sections, and its own disclaimer says it cannot provide referrals.
  That is the opening: a free, independent, national directory is the thing they
  decline to be, and pointing to one costs them nothing.
- **American Chronic Pain Association** (theacpa.org) — a consumer guide to
  managing pain and a national support-group listing. Verify the current site
  structure first; what came back in search was years old.
- State and regional chronic-pain and arthritis groups, which are smaller,
  likelier to answer, and often maintain a links page nobody has updated in a
  while.

### D. Rural health and government

- **RHIhub** — already emailed 2026-09-23, no reply. Worth **one** follow-up, and
  worth changing the pitch: lead with the county dataset rather than the
  directory. Their whole subject is geographic access to care, which is what the
  deserts study measures. If that gets no answer, stop.
- **State offices of rural health**, state health department resource pages, and
  **area agencies on aging** — all maintain link lists, all are `.gov`, all move
  slowly. Low hit rate, high value per hit.

### E. Local, for the DMV push

The chamber directories Mark is already working (Loudoun, Fairfax, Greater
Washington) usually carry a member listing. Often nofollow, so treat them as
referral traffic rather than SEO, and do not spend real time on them.

## The method that finds the rest

Two techniques beat guessing.

**Search operators**, run per topic rather than per site:

```
intitle:resources "chronic pain" -site:painbeacon.com
"pain management" "helpful links" site:.gov
inurl:links "patient resources" "chronic pain"
site:.edu "health care deserts" OR "provider shortage" data
```

**Mine the comparable studies.** Other organizations have published health-care-
desert and provider-shortage analyses and collected links doing it. Find those
studies, run them through a backlink tool, and the pages that linked to them are
pre-qualified: they link to this exact kind of thing, and the pitch is "you
covered X; here is the pain-specialty version, free under CC BY."

## What the email says

Short, one specific page, one specific reason, no attachment, no follow-up
sequence. Something close to:

> Dr. [name] / [name],
>
> I maintain PainBeacon, a free national directory of pain management clinics.
> We published a county-level analysis of which U.S. counties have no pain
> clinic at all — the map and the full dataset are free under CC BY 4.0:
> painbeacon.com/research/pain-care-deserts/
>
> Your [page name] page lists resources on [topic]. If the dataset or the
> directory is useful to the people who read it, we would be glad to be
> included. If not, no reply needed — and if you spot anything wrong in the
> data, I would genuinely like to know.
>
> Rich Shea
> painbeacon.com

The last sentence is not decoration. Librarians and data editors answer people
who invite correction, and it is true: we want the errors.

## What not to do, ever

Paid links. Guest-post networks. "Directory submission" services. Private blog
networks. Anything that arrives in the inbox offering DA-50 placements for $99.
A site whose entire pitch is that its rankings are not for sale cannot buy its
own rankings, and the people selling those placements are selling them to our
competitors too.

## And do not let this replace the badge loop

The clinic Verified badge is still the best backlink channel we have: a real
link from a real local medical practice, earned by giving them something free.
That is `badge-backlink` in the outreach pipeline, `public.backlinks` and
`check-backlinks.mjs` already measure whether it produces links, and the DMV
batch is sitting ready. Resource-page outreach is a second channel, not a
replacement — it is slower, and the hit rate will be low enough that ten sent
emails producing one link is a good week.
