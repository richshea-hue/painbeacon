# Re-targeting the 16 articles at queries people actually type

*2026-11-02. Follows `traffic-strategy-2026-10-31.md`, which found that informational
queries carry no local pack and are therefore worth 8.3x more per #1 ranking than the
local queries the directory pages chase.*

Titles only, plus two deks. **No slugs changed** — `/news/how-to-choose-a-pain-clinic/`
is at average position 4 and the URLs are indexed, so renaming them would throw away
ranking and require redirects for nothing.

## Where the target queries came from

Google autocomplete (`suggestqueries.google.com/complete/search`), harvested per topic.
Real completions, not guesses, and free. Every title below is backed by a suggestion that
actually returned. Two findings fell out of the harvest:

- **"pain clinic" and "pain management doctor" autocomplete almost entirely to "near me"
  and city names** — Richmond VA, Charlottesville, Fredericksburg. That is the local-pack
  problem confirmed from a second direction, and it is why no title below targets those
  bare phrases.
- **"how to tell if a pain clinic…" returns nothing at all.** It was my first instinct
  for the pill-mill article and it has no demand. The harvest killed it;
  "pain management red flags" came back instead and is what that title now uses.

Autocomplete shows that a query exists, **not how much volume it has.** None of these are
volume-validated. The validation is the Performance report three months out.

## The mechanical problem, fixed on all 16

`Base.astro:30` builds the page title as `${title} — PainBeacon`, so the suffix costs 13
characters and the usable budget is about 47. **Every one of the 16 was over it** — the
shortest was 50, the longest 100. All sixteen were truncating in Google's results.

All are now 24–48 characters.

## Old to new

| slug | was | now | query evidence |
|---|---|---|---|
| `sciatica-when-to-see-a-specialist` | Sciatica: When to See a Pain Specialist and When to Wait It Out | **Sciatica: When to See a Doctor** | exact: "when to see a doctor for sciatica" |
| `first-pain-clinic-appointment` | Your First Pain Clinic Appointment: What to Bring, What to Expect, What to Ask | **What to Expect at a Pain Clinic Appointment** | exact: "what to expect at a pain clinic appointment" |
| `pain-clinic-specialists-who-is-who` | Who's Who at a Pain Clinic: Anesthesiologists, Physiatrists… | **What Does a Pain Management Doctor Do?** | exact: "what does a pain management doctor do" |
| `how-to-choose-a-pain-clinic` | How to Choose a Pain Clinic: A Practical Guide… | **How to Find a Good Pain Management Doctor** | exact: "how to find a good pain management doctor" |
| `what-interventional-pain-clinics-do` | Injections, Nerve Blocks, and Ablation: What an Interventional… | **What Is Interventional Pain Management?** | exact: "what is interventional pain management" |
| `does-insurance-cover-pain-management` | Does Insurance Cover Pain Management? Referrals, Prior Auth… | **Does Insurance Cover Pain Management?** | exact: "does insurance cover pain management" |
| `pain-management-without-opioids` | Pain Management Without Opioids: What Modern Clinics Offer | **Chronic Pain Management Without Opioids** | exact: "chronic pain management without opioids" |
| `radiofrequency-ablation-back-neck-pain` | Radiofrequency Ablation for Back and Neck Pain: What It Is… | **Radiofrequency Ablation: How Long Does It Last?** | "how long does radiofrequency ablation last" |
| `epidural-steroid-injections-evidence` | Epidural Steroid Injections: What the Evidence Actually Says | **Epidural Steroid Injections: Do They Work?** | "how effective is epidural steroid injections", "is epidural steroid injection worth it" |
| `spinal-cord-stimulator-trial` | Spinal Cord Stimulators: Who They're For and What a Trial Involves | **Spinal Cord Stimulator Trial: What to Expect** | "spinal cord stimulator trial" |
| `chronic-pain-and-mental-health` | The Mental Health Side of Chronic Pain: Why the Clinic Asks… | **Chronic Pain and Depression: What Actually Helps** | "chronic pain depression treatment", "…cycle" |
| `pain-after-a-car-accident` | Pain After a Car Accident: When to See a Specialist… | **Delayed Pain After a Car Accident: What to Do** | "pain after car accident delayed", "…what to do" |
| `spot-a-pill-mill-red-flags` | Red Flags: How to Spot a Pill Mill Before You Book | **Pain Management Red Flags: Spotting a Pill Mill** | "pain management red flags" |
| `questions-to-ask-before-a-pain-procedure` | Questions to Ask Before Agreeing to Any Pain Procedure | **8 Questions to Ask Before a Pain Procedure** | thin: "questions to ask pain management doctor" |
| `reading-pain-clinic-reviews` | Reading Pain Clinic Reviews: What Star Ratings Can and Can't Tell You | **How to Read Pain Clinic Reviews** | weak — see below |
| `how-we-rank-pain-clinics` | How We Rank Pain Clinics — and Why Nobody Can Buy a Spot | **How We Rank Pain Clinics** | none — trust page, not a search target |

**Two honest weak spots.** `reading-pain-clinic-reviews` has no real demand behind it:
"pain clinic reviews" autocompletes to named clinics in India, which are brand searches.
It was shortened, not re-targeted, and should not be expected to move.
`questions-to-ask-before-a-pain-procedure` returned only two suggestions, so the demand is
thin. Neither was retitled to a query that does not exist, which was the alternative.

`how-we-rank-pain-clinics` is deliberately untargeted. It is a trust page, and brand
queries matter separately (see the brand-entity gap).

## Deks

The dek is the meta description, the on-page lede and the RSS summary at once, and most
already carried the secondary terms, so only two changed:

- **RFA** — added the side effects, now that the title leads on duration
- **ESI** — reframed to what the evidence says about how often they work, matching
  "success rate" and "worth it" intent

The other 14 deks are good prose that already covered the ground. Left alone.

## A 404 found on the way

`src/lib/article-art.js:55` falls back to `/social/<slug>.png` when an article has no
`shareImg`, `heroRemote` or `image`. Two articles — `chronic-pain-and-mental-health` and
`pain-after-a-car-accident` — have none of the three, **and that PNG was never committed.**
Their `og:image` pointed at a missing file, so every share of those two rendered without a
card. Both cards are now generated and are the only two added.

Three stale, unused cards remain tracked in `public/social/` for articles that use photos
(`first-pain-clinic-appointment`, `how-to-choose-a-pain-clinic`,
`what-interventional-pain-clinics-do`). They render the old titles but nothing serves
them. Left as found.

## What was not done

- **Body intros.** Only titles and two deks. The opening paragraphs still read as
  magazine ledes rather than answering the query in the first sentence, which is the
  remaining half of this job.
- **Internal links** from the clinic and area pages that already carry impressions into
  these articles. Those pages hold 2,212 impressions between them and currently link
  nowhere useful.
- **Named author and medical reviewer** — still 0 of 16, still the blocker on scaling new
  health content (`traffic-strategy-2026-10-31.md`). Re-targeting existing articles did
  not need it; writing new ones does.

## How to tell whether this worked

Search Console → Performance → Search results, page filter **Custom (regex)** `/news/`,
and compare the trailing three months against the same window before 2026-11-02.

Baseline to beat, measured 2026-10-29: the `/news/` section drew **3 impressions** across
the top-100 query sample, and `how-to-choose-a-pain-clinic` sat at average position 4 with
0 clicks. Impressions, not clicks, are the first signal — a title change alters which
queries the page is eligible for, and that shows up in impressions within weeks.

Give it eight weeks before judging. If impressions have not moved at all, the problem is
not the titles.

## Verification run

- `npm run lint:spelling` — articles clean (the two pre-existing failures, `s.json` and
  `samakow-day19.md`, are untracked scratch files and unrelated)
- `npm run test:feed` — 11 pass; `npm run test:art` — 8 pass
- All 16 frontmatter blocks re-parsed as YAML after editing; titles 24–48 chars
- `scripts/lib/feed-item.test.mjs:13` pins an old title inside a self-contained RSS
  fixture, deliberately, to exercise `&apos;` decoding. Not a reference to live content —
  left alone on purpose.
