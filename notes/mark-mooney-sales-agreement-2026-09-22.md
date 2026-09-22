# Sales and Origination Agreement — draft 2026-09-22

Source text for `PainBeacon-Mooney-sales-agreement-2026-09-22.pdf` (built by
`scripts/build-mooney-agreement.py`). Draft for Rich's review; not reviewed by
counsel.

Three blanks to fill before it goes out: the PainBeacon legal entity name, the
effective date, and written confirmation from Paul's publishing entity that the
two-thirds / one-third split and the off-the-top expense order in Section 2 are
agreed. Section 2 is the base every number in Section 3 is measured against —
Mark should not sign against a split that is still verbal.

Design notes on why the numbers are what they are:

- **Commission base is PainBeacon Revenue, not gross.** PainBeacon only receives
  a third of a book sale, so a percentage of gross would pay out more than the
  sale earns us.
- **The $150 minimum in 3(f) exists because of the recoupment order.** Rich and
  Paul agreed marketing comes off the top — an $8,000 campaign is offset by the
  first $8,000 of revenue. Under that rule, PainBeacon Revenue on the earliest
  sales is $0 and a pure percentage pays the salesperson nothing for the hardest
  sales in the program. The minimum is a floor, credited against (a), not an
  addition to it.
- **The schedule is party-neutral.** Rich earns origination on the same terms as
  Mark. That is deliberate — it is Rich's main route to a distribution, and a
  schedule that paid only one party would be renegotiated the first time the
  other one sold something.
- **Section 6 is non-negotiable.** Rankings are not for sale is a repo invariant
  and a binding term on `/terms/`; a commissioned salesperson is exactly the
  person most tempted to imply otherwise, so it carries a termination and
  forfeiture consequence.

---

## SALES AND ORIGINATION AGREEMENT

PainBeacon, operated by Richard Shea ("PainBeacon"), and Mark Mooney
("Contractor"). Effective ______________, 2026. Subject: origination of sales of
(a) the Samakow pain-practice book series and the associated forms vault, and
(b) PainBeacon advertising, sponsorship and featured placements.

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
    − approved marketing and campaign costs still being recouped
    − any association, channel or referral-partner share
    = Distributable Revenue → two-thirds to the Samakow publishing entity,
                              one-third to PainBeacon ("PainBeacon Revenue")

Only costs approved in advance in writing by both PainBeacon and the publishing
entity come off the top. Commissions in Section 3 are a percentage of
**PainBeacon Revenue**, except the minimum in 3(f). If that split changes,
Sections 2 and 3 are amended in writing; Contractor's percentages do not change
on their own.

### 3. Commission schedule

"Originator" is the party whose named contact, outreach or introduction produced
the sale, recorded in the shared pipeline before it closes; a sale with no
Originator of record is a house sale. **These rates apply identically to
Contractor and to Richard Shea.**

| | |
|---|---|
| (a) Direct origination | 25% of PainBeacon Revenue on that sale |
| (b) Channel override — that party opened it, another closed | 10%, for 12 months from the channel's first sale |
| (c) House sale — neither party originated it | 5%, if that party closed a sale in the trailing quarter |
| (d) Renewals and repeat purchases in the account | 10% to the original Originator, for 24 months |
| (e) Cap on any one sale | 30% of PainBeacon Revenue, origination plus override |
| (f) Minimum per closed series sale | $150 to the Originator when funds clear, credited against (a) |
| (g) Advertising, sponsorship, featured placements | 25% of collections net of processing fees, unchanged |

### 4. Payment and clawback

PainBeacon issues a monthly statement showing each sale, the deductions applied,
PainBeacon Revenue, and commission earned, and pays within 15 days of receiving
its distribution for that sale. A sale later refunded or charged back reverses
the related commission, offset against future commissions.

### 5. Authority

Contractor may not set or discount price, bundle products, promise delivery
dates, or describe the forms vault beyond the written materials PainBeacon
supplies. Any variation needs written approval from Richard Shea.

### 6. Rankings are not for sale

PainBeacon's directory rank, placement, verification badges and editorial
coverage are never affected by payment. Contractor may not state or imply that
buying books, advertising or a featured listing changes how a clinic ranks or
appears in the directory. Paid placements are labeled as advertising. Breach is
grounds for immediate termination and forfeiture of unpaid commissions.

### 7. No referral compensation

Nothing sold here is a patient referral, and no compensation is tied to the
volume or value of referrals, patients, or health-care business. Contractor
sells publications and advertising only.

### 8. Confidentiality and term

Customer lists, pricing, pipeline records, the publisher's materials and
PainBeacon's data are confidential, may not be used outside this agreement, and
are returned or deleted when it ends. Either party may end this agreement on 30
days' written notice; commission on sales closed before the end date is paid for
90 days of collection after it, and overrides under 3(b) end on the end date.

### 9. Ownership and general

This agreement grants no ownership interest in PainBeacon and is not a promise
of one; any ownership would be a separate written instrument. Virginia law
governs. This is the entire agreement on its subject and can be changed only in
a writing signed by both.

---

PainBeacon — Richard Shea    ____________________    Date __________

Mark Mooney                  ____________________    Date __________

*A separate, non-binding term sheet covers a path to ownership. It is not part
of this agreement.*

---

## Appendix — worked example (not part of the agreement)

One $3,000 book-series sale, paid by card, with marketing costs already
recouped.

| | |
|---|---|
| Gross | $3,000.00 |
| Stripe processing (2.9% + $0.30) | −$87.30 |
| Marketing recoupment (assumed complete) | $0.00 |
| **Distributable Revenue** | **$2,912.70** |
| Samakow publishing entity, two-thirds | $1,941.80 |
| **PainBeacon Revenue, one-third** | **$970.90** |
| Origination commission at 25% | −$242.73 |
| **PainBeacon retained** | **$728.17** |

**The same sale paid by ACH.** Stripe charges 0.8% capped at $5.00 instead of
$87.30, so Distributable Revenue is $2,995.00, PainBeacon Revenue is $998.33,
and PainBeacon retains $748.75 after commission. Moving a buyer from card to ACH
is worth about $27 per sale to PainBeacon and about $55 to the publishing
entity — enough to justify a line of checkout copy asking for it.

**During marketing recoupment.** While approved campaign costs are still being
recovered off the top, Distributable Revenue and therefore PainBeacon Revenue
are $0 on a sale, and the percentage commissions compute to nothing. The $150
minimum in Section 3(f) is what the Originator is paid instead, so the first
sales — the hardest ones — are not the unpaid ones.

## Still open (not in the agreement)

- **Ownership term sheet for Mark.** Non-binding, separate document. Section 9
  deliberately forecloses any argument that this agreement granted equity.
- **Reporting access from Paul's side.** Paul is merchant of record on his own
  Stripe account, so PainBeacon cannot compute Section 2 or issue the Section 4
  statement without read access to book-sale reporting. That is a term of the
  PainBeacon–Samakow agreement, not this one, but Section 4 does not work
  without it.
- **Sales tax and nexus** on the book series and the forms vault sit with the
  merchant of record (Paul's entity) and should be confirmed there.
