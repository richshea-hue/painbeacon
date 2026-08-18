---
title: 'How We Rank Pain Clinics — and Why Nobody Can Buy a Spot'
dek: 'Every clinic in our directory gets a score built from five checkable signals. Here is the whole formula, what it can and cannot see, and the line between the ranking and the money.'
date: 2026-08-18
category: 'Inside the Rankings'
heroImg: '/images/news/how-we-rank-pain-clinics/pain-clinic-physicians-reviewing-patient-record-hero.jpg'
heroAlt: 'Two clinicians in a bright clinic corridor review a patient chart together in a green folder.'
thumb: '/images/news/how-we-rank-pain-clinics/pain-clinic-physicians-reviewing-patient-record-thumb.jpg'
shareImg: '/images/news/how-we-rank-pain-clinics/pain-clinic-physicians-reviewing-patient-record-share.jpg'
---

Most directories order their listings by something they would rather not explain.
We order ours by a formula, and the formula is published. This is the whole of
it, including the parts that do not work as well as we would like.

Our directory currently holds **14,536 pain clinics**. Every one of them gets a
score out of 100, computed the same way, from data anyone can go and check.

## The five signals

| Signal | Weight | What it measures |
|---|---|---|
| Interventional capability | 25% | Whether the practice carries the interventional pain medicine credential (NUCC taxonomy 208VP0014X) |
| Patient rating | 25% | Aggregate rating from public sources, scaled to the weight |
| Review volume | 20% | How many reviews stand behind that rating, log-scaled |
| Years in practice | 15% | Time since the practice's federal provider record was created, capped at 20 years |
| Contact transparency | 15% | Whether the clinic publishes a working phone number and website |

Two of those deserve a word on why they are shaped the way they are.

**Review volume is deliberately blunted.** A single five-star review should not
outrank a practice with four hundred of them, so volume is compressed
logarithmically and capped. Going from 5 reviews to 50 moves the number a lot.
Going from 200 to 400 barely moves it at all.

**Years in practice is capped at twenty.** Past two decades, we stop counting.
A practice that opened in 1998 and one that opened in 1985 are both simply
established, and pretending we can rank one above the other on longevity alone
would be inventing precision we do not have.

<figure>
  <img src="/images/news/how-we-rank-pain-clinics/doctor-patient-consultation-clinic-office.jpg"
       alt="A physician sits across a desk from a patient in a bright medical office, listening during a consultation."
       width="1200" height="800" loading="lazy" />
  <figcaption>The ranking exists to get you into a room like this one with someone qualified to be there. It is a filter, not a verdict.</figcaption>
</figure>

## What the scores actually look like

Run that formula across all 14,536 clinics and the directory sorts itself into
four bands:

- **Strongly qualified** — 2,107 clinics (14.5%)
- **Well qualified** — 2,790 (19.2%)
- **Qualified** — 3,426 (23.6%)
- **Basic listing** — 6,213 (42.7%)

That bottom band is the honest part. We do not show a number for those clinics,
because the number would be misleading. A "basic listing" is overwhelmingly a
clinic we hold little verified data about — no ratings on file, no interventional
credential recorded — and that is a statement about our records, not about the
care. Of the full directory, 4,504 clinics carry the interventional credential
and 6,717 have a rating and review count we can read. The rest are not bad
clinics. They are clinics we cannot yet describe.

## Where the money is, and where it is not

We sell listings. A clinic can pay for an enhanced profile, and one featured
placement is available per geographic zone. So the honest version of "nobody can
buy a spot" is narrower and more useful than the slogan: **you can buy
visibility, and you cannot buy rank.**

Here is how that line is held, in the code rather than in a promise:

- The scoring function reads five fields — the credential, the rating, the review
  count, the record date, and the contact details. It does not read the payment
  tier. It has no parameter for it.
- A featured placement renders in a labeled slot **above** the ranked list, and is
  then **removed** from that list. It does not sit at position one. It sits
  outside the ordering entirely, marked as sponsored.
- Nothing a clinic pays for changes the score of any clinic, including its own.

If we ever break that, the way to catch us is the same as the way to check us:
the formula is on [our methodology page](/how-we-rank/), and every clinic profile
shows the signals that produced its own score.

## What this formula cannot see

Contact transparency is the weakest of the five right now, and not for an
interesting reason. Nearly every clinic in the directory has a phone number on
file and almost none has a website recorded, so that signal currently awards
essentially the same 7.5 points to essentially everybody. It is carrying far less
weight in practice than the 15% suggests, and expanding that coverage is ordinary
unglamorous work we have not finished.

Two things the formula does not attempt at all: insurance breadth and the range
of procedures a clinic offers. Both matter enormously when you are choosing where
to go. Neither is in the score, because we do not yet hold that data reliably
enough to rank on it, and a signal built from patchy data is worse than no signal
— it quietly punishes the clinics with thinner paperwork rather than the ones
with worse care.

So use the ranking for what it is: a way to narrow 14,536 clinics down to a
shortlist worth calling. Then do the part no formula does for you — read the
[warning signs](/news/spot-a-pill-mill-red-flags/), make the phone call, and ask
the questions. The [directory](/pain-clinics/) gets you to the shortlist. It does
not get you to the answer.

---

*This article is educational and is not medical advice. Treatment decisions,
including any change to a prescribed medication, should be made with a licensed
clinician who has examined you.*
