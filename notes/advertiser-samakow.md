# Paul Samakow — advertiser, and the book venture

Living record. Last updated 2026-09-23.

Paul Samakow is a Northern Virginia personal-injury attorney, practising in VA
and MD since 1980, introduced by Mark Mooney. There are **two separate
relationships** and they should not be blended, because the economics have
nothing in common:

1. **He advertises on PainBeacon.** A sponsor card, priced per month.
2. **He is the publisher in the book venture.** A revenue split on a product
   PainBeacon sells into pain practices.

The first is live and small. The second is not signed and is potentially much
larger. A problem in one should not be allowed to hold the other hostage.

The BestRaces side of his history is at `notes/advertiser-samakow-2026-09-02.md`
in that repo — he was pitched there first, nothing sold, and the pitch moved
here.

---

## 1. The sponsorship

### What is live

`data/sponsors.json`, id `samakow-law`. Virginia only. Placements: `state`,
`zone`, `clinic`, `article`. Flight **2026-09-03 → 2026-10-03**, and the
September report calls it "days 1–20 of the complimentary month" — **this first
month is free**.

Creative runs: *"Hurt in a crash in Virginia or Maryland? / Get your treatment
covered before the insurer decides what your injury is worth."* Disclosure line
is "Attorney advertising," which is not optional — VA and MD bar rules treat
promotional content as attorney advertising, and an undisclosed advertorial is
his exposure as much as ours.

### Two things that need a decision now

**The flight ends 2026-10-03 and it was free.** The renewal is the first time
anyone asks him for money on the advertising side. That conversation is days
away and has not been prepared. It is also entangled with the book negotiation
in a way worth being deliberate about: ask for the ad money in the same breath
as the book terms and either one can poison the other.

**The `article` placement is dark.** It points at
`src/content/articles/pain-after-a-car-accident`, which carries `draft: true`
and is therefore excluded from the build by `src/lib/articles.js`. The article
cannot ship until Samakow supplies the quotes — every `[QUOTE]` block is still
a bracketed prompt, nothing is attributed to him yet — and confirms the
`[CONFIRM]` legal points, including the contributory-negligence scope and the
filing deadlines. So he is carrying four placements and receiving three. On a
free month that is a talking point rather than a problem; on a paid month it is
a refund conversation, so close it before invoicing.

### The September report

Delivered 2026-09-22 covering Sept 3–22. **107 card views, 5 clicks, 4.67%
click-through, views on 14 of 20 days.** Clicks came from the Virginia state
hub (2), clinic profiles (2) and a metro page (1); on Sept 17 the view and the
click are 23 seconds apart on the same clinic page.

A 4.67% CTR is far above normal display performance. The audience is small and
it responds — both halves of that belong in the renewal conversation, and the
report says so rather than leading with the flattering half.

**The counter was wrong until 2026-09-21.** `/go/[id].js` logged a click on any
GET, so the raw log read 257 clicks against 107 views — impossible for human
traffic, since crawlers follow links but do not load the counting pixel. Fixed
with `functions/_lib/bot.js`; every figure above uses the corrected method
(not automated, and arriving from a PainBeacon page). Of 364 raw events, 252
were excluded as link requests with no PainBeacon page behind them.

This matters beyond the arithmetic: **he can check us.** Clicks are forwarded
tagged `utm_source=painbeacon`, so his own analytics see the same visits. Had
the inflated number gone out, he would have found it, and personal-injury firms
paying $100–$300 per click on Google know analytics cold. Never quote a raw
counter to this advertiser.

---

## 2. The book venture

Paul creates a three-book series for pain practices plus a "vault" of ~150
downloadable forms, given free after the third book. **$3,000 for the series**
(down from $5,000), his cost about $200 per book. PainBeacon would house the
vault. **Paul's Stripe account is merchant of record** — he holds the cash,
bears chargeback liability, and receives the 1099-K.

The agreed waterfall, with expenses off the top: gross, less processing, less
refunds and chargebacks, less origination commission during recoupment, less
approved marketing still being recouped, less any channel share — then
two-thirds to Paul's publishing entity and one-third to PainBeacon.

Two documents carry the detail:

- `notes/mark-mooney-sales-agreement.md` — binding, Mark's commissions
- `notes/mark-mooney-ownership-termsheet.md` — non-binding, Mark's path to equity

### What gates it

**Section 2 of the sales agreement needs Paul's written sign-off** before Mark
signs against it: the two-thirds / one-third split, the off-the-top expense
order, and the 10% origination line during recoupment. That last item spends
Paul's money — roughly $200 of every $300 — so it is a conversation, not a
notification.

**PainBeacon needs read access to his Stripe book-sale reporting.** Without it
we cannot compute Section 2 or issue the Section 4 monthly statement. That is a
term of the PainBeacon–Samakow agreement, not Mark's, but Mark's agreement does
not function without it.

**Sales tax and nexus** on the books and the vault sit with the merchant of
record. Confirm on his side.

### An unresolved inconsistency about Mark's rate

The BestRaces brief from 2026-09-02 records Mark's commission as unsettled and
says "15–20% of collected is normal." The sales agreement written 2026-09-22
puts advertising and sponsorship at **25%** and calls it unchanged from current
practice. Both cannot be right. Settle what Mark is actually on today before
that page goes to him — if it is 15–20%, section 3(g) concedes a third more
than it needs to, in writing.

---

## Standing rules for this relationship

- **Rankings are never for sale.** Section 6 of Mark's agreement carries it
  into the sales channel with a termination consequence. The sponsor card is
  labeled "Advertisement" and sits outside the ranked clinic list.
- **Never quote a raw counter.** See above; he can verify us.
- **PainBeacon never handles donation money and never brokers referrals.**
  Nothing sold to Samakow or through him is a patient referral.
