# Sales and Origination Agreement — draft, rev. 2026-09-23

Source text for the PDF built by `scripts/build-mooney-agreement.py`. Draft for
Rich's review; not reviewed by counsel.

## What changed from the 2026-09-22 draft

**PainBeacon has no legal entity.** Rich signs personally, as a sole proprietor
doing business as PainBeacon. Two consequences the earlier draft papered over
with a blank line for an entity name:

- Rich is **personally liable** under every term, Section 6 included. If Mark
  tells a clinic that buying books moves its ranking, the clinic's claim lands
  on Rich, not on a company.
- Section 9 now carries an assignment clause, so when an entity does exist the
  agreement moves to it on written notice with nothing re-signed.

Registering "PainBeacon" as a Virginia fictitious name is a separate, cheap
filing that makes the trade name legitimate. It does **not** create the entity
or the liability shield — only forming one does, and in Virginia that is a $100
SCC filing plus a $50 annual registration fee. Rich's call whether that waits
for revenue; the agreement works either way.

**The $150 minimum in 3(f) is replaced by 10% of gross, paid off the top.** Rich's
call. What it means mechanically:

- The commission moves **above** the Paul/PainBeacon split in the Section 2
  waterfall, and above the marketing-recoupment line — otherwise recoupment
  eats it and we are back where we started.
- On a $3,000 sale that is **$300**, of which the publishing entity effectively
  bears $200 and PainBeacon $100. Across a full $8,000 recoupment, roughly $800
  and $400.
- **This spends Paul's money, not just ours.** It cannot go in unilaterally —
  Section 2 has to be agreed with the publishing entity in writing first. The
  argument for it is that the salesperson is an ordinary cost of making the
  sale, in the same category as the Stripe fee and the association share, both
  of which already come off the top; Paul funds two-thirds because he receives
  two-thirds of what it produces, and his alternative is no salesperson.
- A tiebreak rule was needed and is now in Section 3: which of (a) or (f)
  applies is fixed at the *start* of each sale by whether the recoupment
  balance is above zero. A sale never splits between the two.

**There is a step down at the recoupment boundary**: $300 during, $242.73 after.
The Originator earns more per sale during recoupment than after it. That is
defensible — the two are paid out of different things, and the appendix says so
— but it is worth knowing before Mark notices it himself.

> If the step down bothers you, **8% of gross is $240**, within $3 of the
> steady-state number. It removes the cliff entirely and is a smaller ask of
> Paul. One number to change in Section 3(f) and the waterfall cap.

## Other design notes (unchanged)

- **Commission base is PainBeacon Revenue, not gross**, outside recoupment.
  PainBeacon only receives a third of a book sale, so a percentage of gross
  would pay out more than the sale earns us.
- **The schedule is party-neutral.** Rich earns origination on the same terms
  as Mark. That is deliberate — it is Rich's main route to a distribution, and
  a schedule that paid only one party would be renegotiated the first time the
  other one sold something. It is also what makes the off-the-top line
  defensible to Paul as a cost of sale rather than a payment to Rich's friend.
- **Section 6 is non-negotiable.** Rankings are not for sale is a repo invariant
  and a binding term on `/terms/`; a commissioned salesperson is exactly the
  person most tempted to imply otherwise, so it carries a termination and
  forfeiture consequence.

---

## SALES AND ORIGINATION AGREEMENT

Richard Shea, an individual doing business as PainBeacon ("PainBeacon"), and
Mark Mooney ("Contractor"). Effective ______________, 2026. Subject:
origination of sales of (a) the Samakow pain-practice book series and the
associated forms vault, and (b) PainBeacon advertising, sponsorship and featured
placements.

### 1. Role

Contractor is an independent contractor, not an employee, and not an agent with
authority to bind PainBeacon. He is paid on Form 1099-NEC, controls his own
schedule and methods, and bears his own expenses unless PainBeacon approves them
in writing beforehand. The relationship is non-exclusive both ways.

### 2. How the money is counted

For each book-series sale, the numbers run in this order:

      Gross amount collected from the customer
    − payment processing fees actually charged
    − refunds and chargebacks, including fees not returned on a refund
    − origination commission on the sale during recoupment, capped at 10% of gross
    − approved marketing and campaign costs still being recouped
    − any association, channel or referral-partner share
    = Distributable Revenue → two-thirds to the Samakow publishing entity,
                              one-third to PainBeacon ("PainBeacon Revenue")

Only costs approved in advance in writing by both PainBeacon and the publishing
entity come off the top. The origination line is a cost of making the sale, like
the processing fee and the channel share, borne by both sides in proportion to
what they receive. Commissions in Section 3 are a percentage of **PainBeacon
Revenue**, except during recoupment under 3(f). If the split changes, Sections 2
and 3 are amended in writing; Contractor's percentages do not change on their
own.

### 3. Commission schedule

"Originator" is the party whose named contact, outreach or introduction produced
the sale, recorded in the shared pipeline before it closes; a sale with no
Originator of record is a house sale. Whether (a) or (f) applies is fixed at the
start of each sale by whether the recoupment balance is above zero, and a sale
is never split between the two. **These rates apply identically to Contractor
and to Richard Shea.**

| | |
|---|---|
| (a) Direct origination | 25% of PainBeacon Revenue on that sale |
| (b) Channel override — that party opened it, another closed | 10%, for 12 months from the channel's first sale |
| (c) House sale — neither party originated it | 5%, if that party closed a sale in the trailing quarter |
| (d) Renewals and repeat purchases in the account | 10% to the original Originator, for 24 months |
| (e) Cap on any one sale | 30% of PainBeacon Revenue, origination plus override |
| (f) While marketing costs are still being recouped | 10% of gross to the Originator, paid off the top, in place of (a) |
| (g) Advertising, sponsorship, featured placements | 25% of collections net of processing fees, unchanged |

### 4. Payment and clawback

PainBeacon issues a monthly statement showing each sale, the deductions applied,
PainBeacon Revenue, and commission earned, and pays within 15 days of receiving
its distribution. A refunded or charged-back sale reverses the related
commission, offset against future commissions.

### 5. Authority

Contractor may not set or discount price, bundle products, promise delivery
dates, or describe the forms vault beyond the written materials PainBeacon
supplies. Any variation needs written approval from Richard Shea.

### 6. Rankings are not for sale

PainBeacon's directory rank, placement, verification badges and editorial
coverage are never affected by payment. Contractor may not state or imply that
buying books, advertising or a featured listing changes how a clinic ranks or
appears. Paid placements are labeled as advertising. Breach is grounds for
immediate termination and forfeiture of unpaid commissions.

### 7. No referral compensation

Nothing sold here is a patient referral, and no compensation is tied to the
volume or value of referrals, patients, or health-care business. Contractor
sells publications and advertising only.

### 8. Confidentiality and term

Customer lists, pricing, pipeline records, the publisher's materials and
PainBeacon's data are confidential, are not used outside this agreement, and are
returned or deleted when it ends. Either party may end it on 30 days' written
notice; commission on sales closed before the end date is paid for 90 days of
collection after it, and overrides under 3(b) end on the end date.

### 9. Ownership and general

Shea contracts as a sole proprietor and may assign this agreement to an entity
he forms, on written notice to Contractor and with no change to any term. This
agreement grants no ownership interest in PainBeacon and is not a promise of
one. Virginia law governs, this is the entire agreement on its subject, and it
can be changed only in a writing signed by both.

---

Richard Shea, d/b/a PainBeacon    ____________________    Date __________

Mark Mooney                       ____________________    Date __________

---

## Appendix — worked examples (not part of the agreement)

One $3,000 book-series sale, paid by card, against an $8,000 approved campaign.

**A sale made while the campaign is still being recouped**

| | |
|---|---|
| Gross | $3,000.00 |
| Stripe processing (2.9% + $0.30) | −$87.30 |
| **Origination to the seller, 10% of gross — 3(f)** | **−$300.00** |
| Applied to the recoupment balance | −$2,612.70 |
| **Distributable Revenue** | **$0.00** |
| Publishing entity $0.00 · PainBeacon $0.00 | |

The campaign balance falls from $8,000.00 to $5,387.30, so an $8,000 campaign
clears during the fourth sale. The $300 costs the publishing entity $200 and
PainBeacon $100, measured against what each would otherwise have received —
about $800 and $400 across the whole recoupment.

**The same sale once the campaign is recouped**

| | |
|---|---|
| Gross | $3,000.00 |
| Stripe processing (2.9% + $0.30) | −$87.30 |
| **Distributable Revenue** | **$2,912.70** |
| Samakow publishing entity, two-thirds | $1,941.80 |
| **PainBeacon Revenue, one-third** | **$970.90** |
| Origination at 25% — 3(a) | −$242.73 |
| **PainBeacon retained** | **$728.17** |

**The step down is intentional.** The Originator earns $300 on a recoupment sale
and $242.73 on the same sale afterwards, because the two are paid out of
different things. During recoupment nobody takes a profit, so selling is a cost
of the sale and both sides fund it in proportion to what it will earn them.
After recoupment it is a share of PainBeacon's profit and PainBeacon alone pays
it.

**The same sale paid by ACH.** Stripe charges 0.8% capped at $5.00 instead of
$87.30. After recoupment that makes PainBeacon Revenue $998.33 and retained
$748.75 — about $27 per sale to PainBeacon and $55 to the publishing entity,
enough to justify a line of checkout copy asking for it.

## Still open (not in the agreement)

- **Section 2 has to be agreed with Paul in writing** before Mark signs against
  it — the split, the off-the-top expense order, and now the origination line.
- **Ownership term sheet for Mark.** Non-binding, separate document. Section 9
  deliberately forecloses any argument that this agreement granted equity.
- **Reporting access from Paul's side.** Paul is merchant of record on his own
  Stripe account, so PainBeacon cannot compute Section 2 or issue the Section 4
  statement without read access to book-sale reporting.
- **Sales tax and nexus** on the book series and the forms vault sit with the
  merchant of record (Paul's entity) and should be confirmed there.
