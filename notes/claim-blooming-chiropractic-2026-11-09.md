# The open claim request, the NPI blocker, and what a claimant can be sold
## 2026-11-09

Rich asked for three things, in this order: an email so an open claim request
does not sit unnoticed; a decision — not a workaround — on why the dashboard
refuses to approve the one that is open; and research on what PainBeacon can
actually offer a clinic that wants to claim a listing, including paid.

This note is the written half. **Nothing has been changed in the approve
guard, nothing about pricing or placement has gone live, and no clinic row has
been created or edited.** Every option below is a proposal.

Sources: the `claims`, `clinics` and `sponsor_events` tables read live on
2026-11-09 via the Supabase MCP connection; this repo at `b40a12c`; the public
NPPES registry API, queried 2026-11-09; `notes/seo-review-2026-10-27.md` for
the Search Console figures; `notes/advertiser-samakow.md` for the one
sponsorship that has run. Competitor prices are web sources, cited in section
5 with a note on which ones I could confirm on the vendor's own page and which
I could not.

---

## 1. The claim that is open

One row in `claims` is still at `status = 'new'`. It is 19 days old.

| field | value |
|---|---|
| id | `5a13a481-01cd-45c8-bd97-3785f8f51096` |
| created_at | 2026-10-21 06:05 UTC |
| clinic_name | Blooming Chiropractic |
| contact_name | Blooming Chiropractic |
| role | Other |
| work_email | bloomingchiropractic@outlook.com |
| phone | 6578451669 |
| interest | Claim & verify (free) |
| npi | **null** |
| clinic_slug | **null** |
| website | null |
| source_page | **`/for-practices/`** |

The message says: gentle chiropractic care for pregnancy, postpartum and
pediatric needs, at 1525 Mesa Verde Dr E #210, Costa Mesa, CA 92626.

The only other two rows in the table (Apex Advanced Spine & Pain, Meridian ID;
Prestige Pain Centers, Carteret NJ) are both `verified`, so this is the whole
backlog.

**An email was sent to richshea@gmail.com on 2026-11-09** with these facts and
the reason approve refuses. That part of the task is done as a one-off; see
section 3 for the standing version, which is a question not a build.

**Update, 2026-11-10.** Rich sent the reply to the practice: the free listing
offered with nothing asked in return and the verified badge optional, as
section 9 settled it. **Option A is done**, and the row is now waiting on an
NPI from them rather than on us. **Option E is in the dashboard** as of this
date — an inquiry-form row says what it is on the card, and approve explains
why there is nothing to link instead of reporting a missing field. The guard
is exactly as strict as it was. **Option B is the one thing still open**:
setting the row to `verifying` is a click on the status dropdown, and it was
left to Rich rather than written straight to the table.

---

## 2. The blocker is not a missing field

The message is in `src/pages/dashboard.astro:366`:

```js
if (!npi) { alert('This claim has no NPI, so it cannot be linked to a clinic record. Use the status dropdown instead.'); return; }
```

### What approve actually does

`clinics.npi` is a `bigint` and the table's **only** primary key. There is no
surrogate id, no name index, no place_id key — the NPI *is* the clinic's
identity in this database. Approve is two writes:

```js
await sb.from('clinics').update({ listing_tier: tier, website, contact_email }).eq('npi', npi);
await sb.from('claims').update({ status: 'verified' }).eq('id', id);
```

`claims.npi` is `text` and nullable; `clinics.npi` is `bigint` and the key.
With no NPI there is no `WHERE` clause that identifies a row, so the first
write is not merely useless — a PostgREST `UPDATE` that matches nothing
returns success. The second write would then mark the claim `verified` while
nothing was granted. The guard is load-bearing: **it stops the dashboard from
reporting an approval that did not happen.**

### What it is really protecting against

The worse failure is not the no-op, it is what a "fix" would look like.
Anything that resolves a clinic by fuzzy means — name similarity, city match,
place_id, nearest address — would hand this one button the power to mark the
*wrong* clinic verified. That is not a hypothetical on this site. It is
written up in the place_id provenance incident: sub-threshold place_ids were
accepted as good matches and published wrong hours for 2,094 clinics. A wrong
claim approval is strictly worse than wrong hours, because verified status is
not just a field:

- a "Verified" badge on the clinic page and every card
  (`src/pages/clinic/[slug].astro:78`, `src/components/ClinicCard.astro:35`)
- a **followed** outbound link to whatever website the claim supplied
  (`linkableWebsite`, gated on `isVerified`)
- an embeddable "Verified by PainBeacon" badge for the claimant's own site
- the Practice Kit download, gated live on tier by
  `functions/practice-kit/download.js`
- the claimant's `work_email` written into `clinics.contact_email`

So a bad match gives a stranger a followed link and a verification seal on
someone else's practice, on a health site. The guard should not be widened to
make a loose match possible. On that I would push back regardless of which
option below is chosen.

### But this claim is a different problem entirely

Here is the part that changes the decision. **Blooming Chiropractic has no
clinic row to link to.** I searched `clinics` by name and by city: there is no
"Blooming" anything in California, and the seven Costa Mesa listings are all
anesthesiology, PM&R or pain-medicine practices at other addresses. There is
no row to approve, with or without an NPI.

What happened is that the claim came from `/for-practices/`, not from a clinic
page. Two different forms write to the same `claims` table:

- `src/components/ClaimProfile.astro` sits on a clinic page and posts that
  page's `npi` and `slug`. A row from here always identifies a clinic.
- `src/pages/for-practices.astro` is the "Talk to us" form under the heading
  *"Can't find your practice, or want to hear about Enhanced and Featured?"*.
  Its own comment says it: `npi is blank here; clinic_name is what they type`.

So `claims` holds two kinds of thing with one schema: **"I am claiming this
listing"** and **"I am not in your directory, please add me / tell me more"**.
Every row of the second kind is unapprovable by construction, and the error
message describes it as a missing field, which sends the reader looking for an
NPI to paste instead of recognizing an inclusion question.

That is the root cause worth fixing, and it is cheap: the guard can tell the
two apart by `source_page` / null `clinic_slug` and say so.

### Does this practice even belong in the directory?

The directory's inclusion rule is explicit in `scripts/sync_nppes.py:52`:

```python
PAIN_CODES = {"208VP0014X", "208VP0000X", "2084P2900X", "207LP2900X", "2081P2900X"}
```

A practice is in if **any** of its 15 NPPES taxonomy slots carries one of
those five pain codes. That is why 67 chiropractors are already listed — they
hold a pain taxonomy alongside the chiropractic one. The rule is not
"physicians only"; it is "carries a pain-medicine taxonomy in the federal
registry". Clean, checkable, and the thing the whole site's provenance claim
rests on.

Against that rule, what I found in NPPES on 2026-11-09:

- `organization_name=Blooming Chiropractic` → **0 results**, nationwide.
- `organization_name=Blooming*` → 30 results, none of them a chiropractic
  practice in Costa Mesa. The nearest thing is `BLOOMING ACUPUNCTURE AND
  WELLNESS INC` (NPI 1093564452), Costa Mesa CA, taxonomy **Acupuncturist**.
  Same first word and same city; different name and a taxonomy that is not in
  `PAIN_CODES`. I am **not** treating that as a match — that inference is
  exactly the shape of the place_id mistake.
- Every NPPES registrant in ZIP 92626 at a Mesa Verde Dr address: the only one
  at **Ste 210**, the suite in the claim, is **Codi Allred, a Doula**
  (NPI 1821919820). No chiropractor is registered at that suite.

So: I could not find a federal provider record for this practice at all, under
that name or that address. It may be registered under an individual
chiropractor's personal name, it may be new, or the suite may be shared or
sublet. **I did not confirm the business exists** — I checked the registry,
not the world. That is a question for the claimant, and it is one question:
*what is your NPI?*

### The options, and what each costs

**A. Reply and ask for the NPI.** One email: "we list practices that carry a
pain-medicine taxonomy in the federal NPI registry — what is your NPI?" If the
answer carries one of the five codes, the NPPES sync will pick the practice up
on its own on the 10th and the claim becomes an ordinary claim against a real
row. If it does not, the honest answer is that the practice is outside what
this directory covers, which is a better thing to say than to say nothing for
19 days.
*Integrity cost: none. This is the rule already published, applied.*
*Downside: it is a "no" to a chiropractor who may not have a pain taxonomy,
and it takes a round trip.*

**B. Use the status dropdown.** Set `verifying`, `customer` or `declined` by
hand. The dropdown writes **only** `claims.status` — it touches no clinic row,
so it grants the claimant nothing: no badge, no followed link, no Practice Kit,
no tier. It is a CRM note to yourself, not an authorization. Worth being clear
about, because the error message points at it as if it were the alternative
path to approval. It is not; it is the way to stop the row looking unactioned.
*Integrity cost: none, but also no outcome for the claimant.*
*Use it alongside A, not instead of it.*

**C. Create the clinic row by hand, then approve.** Possible — insert into
`clinics` with a real NPI, slug, address and taxonomy, rebuild, approve.
*Integrity cost: this is the expensive one, and it is not the insert.* Every
clinic page says the listing comes from the federal registry; `/how-we-rank/`
and the ownership disclosure lean on that. A hand-made row is the first record
in the directory whose provenance is "someone typed it". `data_source` defaults
to `'NPPES'` and would be a lie unless set otherwise; `sync_nppes.py` would
flag or fight the row every month (it already writes `"still in NPPES but no
pain taxonomy this month — review"` for exactly this shape); and ranking scores
interventional capability off a taxonomy code this row would not honestly
carry. **Only defensible with a real NPI that carries a pain code — at which
point option A gets you there without the hand-insert.**

**D. Add a non-NPI key (place_id, surrogate id, manual id entry).** This is
the one to refuse on its own merits. place_id as a join key is the precise
mechanism of the 2,094-clinic incident. A surrogate id is a real schema
change: `clinics.npi` is the PK and is referenced by `postcards.npi`,
`backlinks.npi`, `kit_downloads.npi`, `clinics.primary_npi`, `kit:link`,
`stripe-setup-links`, the Stripe custom field, and the whole NPPES sync. It is
weeks of work to admit one row. Manual id entry in the dashboard is a text box
that lets a tired person at 11pm verify the wrong practice with a typo, with
every consequence listed above.
*Integrity cost: high to catastrophic. Not recommended under any version of
this claim.*

**E. Improve the message (orthogonal, and worth doing whatever else happens).**
The guard stays exactly as strict; only the wording changes, and only for rows
that came from the inquiry form:

> This came from the /for-practices/ inquiry form, not a clinic page, so it is
> not a claim on an existing listing — it is a practice asking to be added.
> There is no clinic record to link. Check whether their NPI carries a pain
> taxonomy before anything else.

*Integrity cost: none. It changes no permission and no write path.* It is a
few lines in `renderClaims()`, switching on null `clinic_slug` or a
`source_page` that is not `/clinic/`. This is the only code change I would
offer to make without further discussion, and I have not made it.

### Recommendation

**A + B + E.** Reply asking for the NPI, set the row to `verifying` so it stops
reading as untouched, and fix the message so the next inquiry-form row is not
mistaken for a broken claim. Leave the guard's strictness alone. Do not create
a hand-typed clinic row, and do not add a second join key.

---

## 3. The standing notification: a question, not a build

Two things are worth saying before the choice.

**There is no email infrastructure in this repo.** I grepped for Resend,
SendGrid, Postmark, Mailgun, nodemailer and SMTP across `scripts/`,
`functions/`, `src/` and `.github/workflows/`: nothing. Every notification the
site produces today is either a GitHub issue (`confirm-report.yml`) or a file
you read yourself. So either option below starts by adding a first email
sender and a first email secret — and on Cloudflare, an env-var change needs a
redeploy to take effect.

**The two options are genuinely different plumbing**, which is why this is a
question and not a default:

- **A trigger when a claim arrives.** A Supabase Database Webhook or trigger on
  `INSERT INTO claims`, calling an Edge Function that sends the mail. Fires in
  seconds, needs a Supabase Edge Function (new deploy surface for this project)
  plus an email provider key held in Supabase, not Cloudflare. Fails silently
  if the function errors — nothing retries, and nothing tells you it did not
  send. Three claims in five months means it fires about once every seven
  weeks, so a silent failure could go unnoticed for a long time.
- **A scheduled digest of anything still open.** A GitHub Actions cron,
  exactly like `confirm-report.yml` already does: read `claims` where
  `status in ('new','verifying')`, send if the list is non-empty. Lands in
  infrastructure that already exists and already reads Supabase with the anon
  key. A failed run shows up as a red workflow in a place you look. Up to a
  week late, which against a request that has waited 19 days is not the
  binding constraint. Could also just open a GitHub issue and send no email at
  all, which needs no new secret of any kind.

My read, offered not assumed: the digest, weekly, probably as the same
GitHub-issue mechanism the confirm report uses. At this volume lateness costs
nothing and a visible failure is worth more than speed. But the trigger is the
right answer if the intent is to reply the same day, and that is a judgment
about how you want to sell, not about plumbing.

### Rich's decision, 2026-11-09: the trigger

Asked on 2026-11-09, Rich chose **a trigger when a claim arrives**, not the
digest. Recorded here so the reasoning does not have to be reconstructed: at
three claims in five months the point is not volume, it is that a practice
reaching out should get an answer the same day rather than up to a week later.
Reply speed is a sales posture, and that was his call to make.

**It is not built, and it is blocked on one thing only he can supply.** The
trigger needs an email provider, and there is no provider key anywhere in this
project. `.env` holds `KIT_SECRET`, `PEXELS_API_KEY`, `STRIPE_SECRET_KEY`,
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` — no Resend, SendGrid, Postmark or Mailgun. So
somebody has to create an account at a sending provider and mint a key before
any Edge Function can do anything. That is an account and a billing
relationship, so it is Rich's to open, not something to pick on his behalf.

There is no way around it. Cloudflare's old free path for this (MailChannels)
stopped serving Workers in 2024, and Supabase's built-in SMTP settings only
send auth mail, not arbitrary messages. A trigger means a provider.

Once a key exists, the build is small and is three pieces:

1. A Supabase Edge Function — the project has none today, so this is a new
   deploy surface — that takes the inserted row and sends one message.
2. A Database Webhook on `INSERT INTO public.claims` pointed at it.
3. The provider key stored as a Supabase secret, **not** in Cloudflare. Worth
   being explicit about, because every other secret in this project lives on
   the Cloudflare side and a Cloudflare env-var change needs a redeploy; this
   one does not touch Cloudflare at all.

The known weakness, carried over from the comparison above and worth designing
against rather than discovering: nothing retries and nothing reports a failed
send. At roughly one claim every seven weeks a silent failure could go
unnoticed for months. The cheap mitigation is to have the function write a
row (or set a column on the claim) recording that it sent, so there is
something to look at later that is not the absence of an email. Worth doing in
the same change; the trigger alone is the version that fails quietly.

---

## 4. What the repo can give a verified claimant today

More than I expected, and all of it NPI-gated.

**Already built and live:**

| thing | where | gate |
|---|---|---|
| "Verified" badge on profile and cards | `clinic/[slug].astro:78`, `ClinicCard.astro:35` | `listing_tier in (verified, enhanced, featured)` |
| **Followed** outbound link to their website | `linkableWebsite`, needs clean Safe Browsing | verified+ |
| Embeddable "Verified by PainBeacon" badge | `/verified-badge/`, deep-links pre-filled by slug | verified+ (by convention) |
| Practice Kit — five front-desk forms (.docx) | `/practice-kit/`, served by signed link | tier checked live at download |
| Correcting address, phone, hours, website | dashboard approve writes website + contact_email | verified+ |
| Self-reported Medicare acceptance beating the CMS match | `src/lib/insurance.js` | any claimed row |
| Enhanced: photos, description, services, insurance, provider bios, booking link | `isEnhanced` block, `enhanced_*` columns exist | enhanced/featured |
| Featured: one labeled top slot per area, map sponsored rail, homepage slot | `metro/[slug]`, `pain-clinics/[state]/[zone]`, `index.astro:53`, `map-clinics.json` | `listing_tier = 'featured'` |
| Stripe checkout for both paid tiers | 4 live Payment Links in `site.js` | — |
| Build-time guards on the rate card | `check-rate-ladder.mjs`, `check-payment-links.mjs` | — |
| Honest placement reporting | `sponsor-report.mjs` | — |

**Half-built or dark:**

- **No Stripe webhook and no checkout function.** `site.js` says it plainly: a
  payment lands in Stripe and nothing else happens. Someone opens the
  dashboard, sets `listing_tier` by hand and rebuilds. Every Payment Link
  therefore needs a required custom field asking for practice name **and NPI**,
  or a payment arrives with an email address and no way to tell which of 14,603
  clinics just bought.
- **`zones` and `zone_lookup` are empty** (0 rows), though `zones.featured_monthly`
  defaults to 299 — so per-area Featured pricing is schema'd and unpopulated.
  The rate card on `/for-practices/` says $500.
- **`enhanced_photos` / `enhanced_providers` / `enhanced_description` have no
  self-serve editor.** The columns and the rendering exist; filling them is
  someone typing JSON into Supabase.
- **`backlinks` and `postcards` are empty.** The badge-backlink track is parked.
- **Everything in the ROADMAP's "Gated on first revenue" section** — desert
  county pages above all — is explicitly waiting on a first paid listing.

**And the thing that matters for *this* claimant: none of it can be given to a
row with no NPI.** `kit:link` requires a 10-digit NPI and refuses anything
else (`/^\d{10}$/`). The download endpoint looks the tier up by NPI. The badge
page keys off a clinic slug. The Stripe links ask for an NPI. The tier lives
on a row whose PK is an NPI. So the honest answer to "what can we give
Blooming Chiropractic today" is: **nothing, until there is an NPI** — which is
the same conclusion as section 2, arrived at from the product side.

**Current tier counts** (read 2026-11-09): 14,600 free, 2 verified, 0 enhanced,
1 featured. The featured row is not a sale; there has been no paid listing.

---

## 5. What comparable directories charge

Claiming is free everywhere. Every one of these monetizes the *upgrade*, never
the claim — and the free claim is the funnel, not a courtesy.

| site | free claim | paid tier | price | what the money buys |
|---|---|---|---|---|
| Healthgrades | yes, every NPI-registry provider has a profile | Elevated Profile | **$49.95/mo or $479.40/yr** (confirmed on Healthgrades' own B2B page, 2026-11-09) | competitors' listings removed from your page, third-party ads removed, custom layout, direct booking link |
| Psychology Today | n/a — the listing *is* the product | standard membership | ~$29.95/mo; ~$49/mo for treatment centers | the listing itself, plus a "Verified" badge tied to credentialing checks. **Unconfirmed** — I could not retrieve the signup page; figures come from third-party pages, several of them competitors |
| Zocdoc | yes | no subscription on their own account | **per new-patient booking**, varies by specialty and location; a competitor's guide cites $30–$140, and a $250/provider/mo "Advanced" plan that contradicts Zocdoc's own "no subscription fees" language | a booked appointment, not placement. Sponsored Results sold separately. Monthly caps settable |
| WebMD Care / Vitals | yes, free basic profile covering both sites | Featured Profile | **not published** — contact sales | paid placement in the directory, competitors' ads blocked from your profile, appointment requests. Vitals adds booking, analytics, call tracking at extra cost |
| general local directories | usually | featured placement | wide and unreliable; vendor blogs quote 0.5–2% conversion free vs 2–5% paid, with no primary data | top-of-category placement |

Three patterns are worth copying, and PainBeacon already has two of them:

1. **Sell removal of the competition, not a better-looking page.** Healthgrades
   and WebMD both lead with "competitors off your page". That is the clearest
   value a directory can sell, and `/for-practices/` already promises it
   precisely — *"one practice per area, so a competitor can never buy in beside
   you"*. The pitch is written; what is missing is traffic behind it.
2. **Credentialing as the paid-adjacent asset.** Psychology Today's badge is
   bought reputation, and the badge plus the embed snippet is the growth loop —
   the comment in `verified-badge.astro` already names Psychology Today as the
   model. PainBeacon has the badge, the embed page, and the followed link. It
   is giving them away free, deliberately and correctly at this stage.
3. **Per-outcome beats per-month at low volume.** Zocdoc charges per booking
   because a subscription at low volume is a refund conversation waiting to
   happen. This is the one PainBeacon has *not* adopted, and it is the one
   most relevant to its traffic.

The one cautionary data point from the general-directory material: a buyer
paying GBP 180/mo for featured placement on a category page drawing about 40
visits a month, with roughly 6 reaching featured listings in total. Low-traffic
featured slots do not pay for themselves, the buyer works that out, and the
seller's credibility goes with it.

---

## 6. Does the traffic support charging for placement? Not yet.

This is the part to be blunt about.

**Search Console, Jun 2 – Oct 25 2026** (from `notes/seo-review-2026-10-27.md`;
I did **not** re-pull Search Console for this note, so these are 13 days old):
**104 clicks and 23.1K impressions in five months**, average position 28. The
shape is a June launch spike settling to 300–600 impressions a week. 97 of the
104 clicks landed on clinic pages — people searching a practice's legal name.

**The one sponsorship that has run** (`notes/advertiser-samakow.md`): the
September report covering Sept 3–22 recorded **107 card views and 5 clicks,
4.67% CTR**, across a Virginia-wide buy spanning state, zone, clinic and
article placements. That month was complimentary.

(The raw `sponsor_events` table shows 544 unfiltered click rows, which is not a
contradiction: `sponsor-report.mjs` counts a click only when it is not
bot-flagged **and** arrived with a same-site referrer, and its header notes
that skipping the view pixel once turned 5 real clicks into 257. The filtering
is documented and the reported number is the defensible one. Nothing has been
recorded since 2026-10-20, consistent with the flight ending 2026-10-03.)

Put those side by side with the rate card:

- **Featured is $500/mo** for the top slot in one area. A Virginia-wide buy
  across four placement types produced 5 confirmed clicks in 20 days. One
  metro's Featured slot is a fraction of that inventory. At $500/mo that is a
  three-figure cost per click, and the buyer can measure it — the `/go/`
  redirect tags every click `utm_source=painbeacon`, so they will see it in
  their own analytics. **Selling Featured at $500/mo today sets up a
  cancellation and a bad reference.**
- **Enhanced is $50/mo** and is a different proposition: it sells *content on
  their own page* — photos, services, insurance, booking link — not traffic.
  It is the same price as Healthgrades' Elevated Profile. A clinic that gets
  even a handful of name-search visitors a month is buying a better page for
  those visitors, and 97 of 104 clicks landing on clinic pages is the one
  number on this site that supports an Enhanced pitch. That is the tier to
  sell first, and it is priced about right.

**What would have to be true before charging for placement**, in rough order of
how load-bearing each is:

1. **Measurable clicks in the area being sold.** Not site-wide totals — a
   Featured slot is a geographic product. A metro should be producing
   something like 30+ confirmed monthly clicks across its area and clinic
   pages before its slot is worth $500. `sponsor-report.mjs` can already
   measure this per path; it has never had a month of real volume to measure.
2. **Impressions that are not flat.** 300–600 a week, five months after
   launch, at average position 28, is a site Google is not yet sending demand
   to. The SEO review's top five moves are the prerequisite, and the first one
   is removing claims the data does not support — which is also what makes
   paid placement defensible on a health site.
3. **A working trust story.** That review found the site claiming "board
   certification" and "verified reviews" it does not have. Selling placement
   on top of claims that are not true is the version of this that ends badly,
   and it is a bigger risk than leaving money on the table for a quarter.
4. **One referenceable paid listing.** The ROADMAP already gates its whole
   "later" list on first revenue. An Enhanced sale at $50 is the cheapest way
   to unblock that gate, and it does not require the traffic that Featured
   does.
5. **Payment-to-tier automation, or an explicit promise not to need it.** With
   no Stripe webhook, every sale is a manual tier edit plus a rebuild. Fine
   for the first five customers, a liability at fifty.

The honest summary: **PainBeacon can sell a better page now and cannot sell
traffic yet.** The Featured rate card should stay on `/for-practices/` as a
price anchor and an "ask whether your area is open" conversation, which is how
the page already words it — but it should not be pitched to a claimant as
something that will bring them patients this quarter.

---

## 7. So what should be offered to this claimant?

Assuming the NPI question in section 2 comes back with a pain taxonomy and the
practice becomes listable — and only then:

**Give free, now:** the verified badge, the followed link to their website, the
embeddable badge for their own site, the Practice Kit, and correction of their
own details. That is a genuinely good free bundle and it costs nothing to
deliver. The Practice Kit in particular is the right thing to lead with for a
small practice: five front-desk forms is a thing they can use on Monday, and
the audit checklist's whole premise is that a practice which checks its own
listings is a practice that values listings. It converts itself.

**Mention, do not pitch:** Enhanced at $50/mo, framed as what it is — a
complete page with photos, services, accepted insurance and a booking link.
Same price as Healthgrades' Elevated Profile, which is a useful anchor if they
ask. Worth saying out loud what it does not do: it does not change their rank,
and `/how-we-rank/` says so.

**Do not pitch Featured.** Not at $500/mo, not to a practice in a metro the
site has never measured. The cost is not the refund, it is that a clinic owner
who checks their analytics and finds two clicks tells other clinic owners.

**And one thing worth deciding separately from this claim:** the
`/for-practices/` inquiry form is working. It brought in an inbound request
from a practice that is not in the directory and wants to be. Three claims in
five months is thin, but this one is the only *inbound* one that did not come
from a clinic page, which means the "can't find your practice" path has
product-market fit of a sort — and right now it has nowhere to go. If there is
appetite for listing adjacent practices (chiropractic, PT, acupuncture) that
carry no pain taxonomy, that is a directory-scope decision with its own
provenance story to write, and it is worth having deliberately rather than one
claim at a time. **Rich's call. I am flagging it, not proposing it.**

---

## 8. What is not verified

Stated plainly, because guessing here is how the last incident happened.

- **Whether Blooming Chiropractic exists as described.** I found no NPPES
  record under that name nationwide, and the only registrant at the suite in
  the claim is a doula. I did not check the business's own website, the
  California chiropractic board, or Google Maps. Absence from NPPES under one
  name is not absence of a practice.
- **Whether it holds a pain taxonomy.** Unknown and unknowable until there is
  an NPI. This is the single question the whole decision turns on.
- **`BLOOMING ACUPUNCTURE AND WELLNESS INC`, Costa Mesa (NPI 1093564452).**
  Same first word, same city, taxonomy Acupuncturist, which is not in
  `PAIN_CODES`. I am recording it so nobody has to re-find it, and explicitly
  **not** treating it as the same business. Confirming or ruling it out needs
  the claimant, not a similarity score.
- **The claimant's identity.** `role` is "Other" and `contact_name` is the
  business name, not a person. Nobody has confirmed this person represents the
  practice. `/for-practices/` promises verification before anything goes live.
- **Search Console figures are from 2026-10-27**, not re-pulled for this note.
  Treat 104 clicks / 23.1K impressions as the five-month picture to Oct 25,
  not as current.
- **Psychology Today's $29.95 and Zocdoc's $30–$140 per booking** come from
  third-party pages, several written by competitors. Healthgrades' $49.95 is
  the only competitor price I confirmed on the vendor's own page. WebMD and
  Vitals publish nothing.
- **Whether `zones.featured_monthly` ($299 default) or `/for-practices/`
  ($500) is the intended Featured price.** The table is empty so nothing reads
  it today, but the two numbers disagree and one of them will eventually be
  shown to a buyer.
- **I have not tested either notification path.** No Supabase Edge Function
  has been written and no cron added; section 3 is a comparison, not a
  verified plan.

## 9. Rich's counter-proposal, 2026-11-09: a non-registry listing class

After reading the above, Rich proposed a route none of options A–E covered, and
it is better than the ones I listed. Recording it in his framing:

> Offer the listing, but say it's not in the NPI registry and isn't ranked,
> but still listed. We could use a backlink so we could do it and not charge
> him if we can get the backlink from him putting up on his site that he is
> verified as a listing (just not NPI verified). He can always do a paid
> option as well.

**Why this is not option D.** I argued against a non-NPI join key because of
the place_id incident. That objection does not apply here and I was wrong to
treat the space as binary. The place_id failure was *silently linking a claim
to the wrong existing clinic* — a false identity assertion the reader could
not see. A separate, labeled, unranked listing class asserts nothing false: it
says "this practice told us about itself and is not in the federal registry",
which is true and is visible on the page. It also solves a problem the
directory actually has — `/for-practices/` invites practices that cannot find
themselves to get in touch, and until now there was nothing to say to them.

Three things have to be settled before it can be offered to anyone, and two of
them change what the email says.

**1. The word "verified" cannot travel with it.** The existing badge asset
reads *"Verified pain clinic on PainBeacon"* and `/verified-badge/` defines
verified as claimed-and-verified against the registry record. Handing that
badge to a non-registry chiropractic practice makes the badge mean two things
at once, and the second meaning is not true — the practice is neither verified
nor a pain clinic by the site's own definition. This is the same class of
problem the 2026-10-27 SEO review opened with: the site claiming "board
certification" and "verified reviews" it does not have, on a health site where
Google weighs trust most heavily. **The fix is cheap: a second badge that says
"Listed on PainBeacon" and nothing more.** The draft email therefore says "list
you as a practice that isn't NPI-registered" and avoids "verified" entirely.
If Rich wants the verified wording anyway, that is his call to make knowingly,
but it should not slip in by reusing the existing badge.

**2. Conditioning the listing on the link is a link scheme, and nofollow
removes the benefit that made it attractive.** Google Search Essentials names
"exchanging goods or services for links" as link spam. A free listing given
*on condition* of a followed link is that exchange, fairly precisely. The safe
form is `rel="nofollow"` on the badge link — but a nofollow link passes no
ranking signal, so if the point was to improve a backlink profile that
currently has three inbound sites, **this trade does not deliver that.** What
it does deliver is real but different: referral traffic, brand presence on the
practice's own site, and the Psychology Today growth loop. Both are defensible;
they are not the same thing, and the difference is worth knowing before the
offer is made rather than after.

The lower-risk version of the same idea: give the listing free with no
condition, and offer the badge. Psychology Today and Healthgrades both do this
and get the links anyway, because practices like badges. It keeps almost all
the upside and stops being an exchange.

**Decided 2026-11-09: the condition is dropped.** Rich chose the unconditional
version. The listing is free with nothing asked in return, and the badge is
offered as something the practice can take if it wants. The draft email says
so in those words ("No charge for that, and nothing you have to do in
return"), which matters more than it looks — the sentence is what makes the
link editorial rather than purchased, so it is worth keeping if the copy gets
reworked later for the page or an outreach template.

Two consequences worth writing down, because they will come up again:

- **The link can stay followed.** With no exchange there is no link scheme, so
  there is no reason to nofollow the badge. That is the opposite of where this
  was heading a paragraph ago, and it is the better outcome: an unconditional
  badge program can earn followed links, a conditional one cannot safely earn
  any. Dropping the condition is what buys back the link equity, not what
  gives it up.
- **Nothing now hinges on the practice holding up its end**, which removes a
  support question that had no good answer: what happens when a listing was
  given for a link and the link later comes down. Nobody has to monitor
  anything.

**3. The database cannot hold the row.** `clinics.npi` is a `bigint` and the
only primary key, so there is literally nowhere to put a practice without an
NPI. This is schema work: either a separate table for self-reported listings
(cleanest — different provenance, different rendering, no risk of leaking into
ranked lists or `clinics_public`) or a surrogate key on `clinics`, which
touches `postcards.npi`, `backlinks.npi`, `kit_downloads.npi`,
`clinics.primary_npi`, `kit:link`, the Stripe custom field and the NPPES sync.
**A separate table is the right call** — it keeps the federal-registry
provenance of `clinics` intact, which is the claim the whole site rests on.

Unresolved, and deliberately not decided here:

- Where a non-registry listing appears. Not in the ranked list, by definition —
  so does it get a page, a separate section on area pages, or only a profile
  reachable by direct link? Nothing is designed.
- Whether the Practice Kit, the followed website link and Medicare
  self-reporting travel with it. All three are currently gated on
  `listing_tier` on a `clinics` row, so all three would need a decision.
- Whether this opens the directory to chiropractic, PT and acupuncture
  generally. One claim is not a policy, and this is the scope question from
  section 7 arriving by a different door.
- What `sync_nppes.py` does if such a practice later registers an NPI and
  appears in `clinics` for real. There would then be two rows for one
  practice.

Nothing above is built. The email drafted on 2026-11-09 offers the route
without naming a date, which is the right level of commitment until the schema
question is settled.

## 10. Sources

- Healthgrades Elevated Profiles — https://b2b.healthgrades.com/elevated-profiles/ (price confirmed on page, 2026-11-09)
- Healthgrades Elevated Profile — https://premium.healthgrades.com/
- Zocdoc, transparency and control for providers — https://www.zocdoc.com/blog/facts/transparency-and-control-for-providers/
- WebMD Care Directories, free basic profile — https://doctor.webmd.com/learnmore/profile
- WebMD / Vitals enhanced profiles (vendor page) — https://www.sesamecommunications.com/webmd-vitals-com-enhanced-profiles/
- Vitals for physicians (agency page) — https://www.p3practicemarketing.com/insights/vitals-for-physicians/
- Psychology Today charges (third-party) — https://www.brex.com/tools/charge-finder/psychology-today
- Featured-listing pricing, and the GBP 180 cautionary case — https://turnkeydirectories.com/how-much-to-charge-for-featured-business-directory-listings/ and https://www.jasminedirectory.com/blog/should-i-pay-for-a-directory-listing/
- NPPES public registry API — https://npiregistry.cms.hhs.gov/api/ (queried 2026-11-09)
