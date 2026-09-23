from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Table, TableStyle, KeepTogether)

# Renders notes/mark-mooney-sales-agreement.md as a signable PDF.
# Needs reportlab: pip install reportlab. Writes next to this script's repo root
# unless an output path is given:
#   python3 scripts/build-mooney-agreement.py [out.pdf]
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    ROOT, "PainBeacon-Mooney-sales-agreement-2026-09-22.pdf")

TEAL_DEEP = colors.HexColor("#0A4F46")
INK       = colors.HexColor("#1D2B29")
SOFT      = colors.HexColor("#5A6B68")
LINE      = colors.HexColor("#DCE3E1")
TINT      = colors.HexColor("#F1F7F5")

def S(name, **kw):
    base = dict(name=name, fontName="Helvetica", fontSize=7.6, leading=9.9,
                textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(**base)

st = {
  "kicker": S("kicker", fontName="Helvetica-Bold", fontSize=7.5, textColor=TEAL_DEEP, leading=9),
  "h1":     S("h1", fontName="Helvetica-Bold", fontSize=14.5, leading=17, spaceAfter=1.5),
  "meta":   S("meta", fontSize=7.9, textColor=SOFT, leading=10.8),
  "h2":     S("h2", fontName="Helvetica-Bold", fontSize=8.8, leading=11,
              textColor=TEAL_DEEP, spaceBefore=4.0, spaceAfter=1.6),
  "body":   S("body"),
  "mono":   S("mono", fontName="Courier", fontSize=7.8, leading=10.4),
  "small":  S("small", fontSize=7.6, leading=10.4, textColor=SOFT),
  "th":     S("th", fontName="Helvetica-Bold", fontSize=7.6, leading=10, textColor=SOFT),
  "td":     S("td", fontSize=7.6, leading=9.9),
  "tdb":    S("tdb", fontName="Helvetica-Bold", fontSize=7.8, leading=10.1),
  "tdr":    S("tdr", fontSize=7.6, leading=9.9, alignment=2),
  "tdrb":   S("tdrb", fontName="Helvetica-Bold", fontSize=7.8, leading=10.1, alignment=2),
}

def deco(canvas, doc):
    canvas.saveState()
    w, h = LETTER
    canvas.setFillColor(TEAL_DEEP)
    canvas.rect(0, h - 0.14*inch, w, 0.14*inch, stroke=0, fill=1)
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.setFillColor(SOFT)
    canvas.drawString(0.72*inch, 0.30*inch, "PAINBEACON.COM")
    canvas.drawRightString(w - 0.72*inch, 0.30*inch, "Page %d of 2" % doc.page)
    canvas.setStrokeColor(LINE); canvas.setLineWidth(0.5)
    canvas.line(0.72*inch, 0.44*inch, w - 0.72*inch, 0.48*inch)
    canvas.restoreState()

doc = BaseDocTemplate(OUT, pagesize=LETTER,
        leftMargin=0.72*inch, rightMargin=0.72*inch,
        topMargin=0.45*inch, bottomMargin=0.5*inch,
        title="Sales and Origination Agreement - PainBeacon and Mark Mooney",
        author="Rich Shea", subject="Draft sales and origination agreement")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=deco)])
W = doc.width

def P(t, s="body"): return Paragraph(t, st[s])
def H(t): return Paragraph(t, st["h2"])

F = []
F.append(P("DRAFT FOR REVIEW &mdash; 23 SEPTEMBER 2026", "kicker"))
F.append(P("Sales and Origination Agreement", "h1"))
F.append(P("Richard Shea, an individual doing business as PainBeacon (&ldquo;PainBeacon&rdquo;), and Mark Mooney "
           "(&ldquo;Contractor&rdquo;). Effective ______________, 2026. Subject: origination of sales of (a) the Samakow "
           "pain-practice book series and the associated forms vault, and (b) PainBeacon advertising, sponsorship and "
           "featured placements.", "meta"))
F.append(Spacer(1, 2))

F.append(H("1. Role"))
F.append(P("Contractor is an independent contractor, not an employee, and not an agent with authority to bind "
  "PainBeacon. He is paid on Form 1099-NEC, controls his own schedule and methods, and bears his own expenses unless "
  "PainBeacon approves them in writing beforehand. The relationship is non-exclusive both ways."))

F.append(H("2. How the money is counted"))
F.append(P("For each book-series sale, the numbers run in this order:"))
water = [
  [P("Gross amount collected from the customer","td")],
  [P("&minus;&nbsp; payment processing fees actually charged","td")],
  [P("&minus;&nbsp; refunds and chargebacks, including fees not returned on a refund","td")],
  [P("&minus;&nbsp; origination commission on the sale during recoupment, capped at 10% of gross","td")],
  [P("&minus;&nbsp; approved marketing and campaign costs still being recouped","td")],
  [P("&minus;&nbsp; any association, channel or referral-partner share","td")],
  [P("=&nbsp; <b>Distributable Revenue</b> &nbsp;&rarr;&nbsp; two-thirds to the Samakow publishing entity, "
     "one-third to PainBeacon (<b>&ldquo;PainBeacon Revenue&rdquo;</b>)","td")],
]
t = Table(water, colWidths=[W])
t.setStyle(TableStyle([
  ("BACKGROUND",(0,0),(-1,-1),TINT),
  ("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),
  ("TOPPADDING",(0,0),(-1,-1),0.9),("BOTTOMPADDING",(0,0),(-1,-1),0.9),
  ("TOPPADDING",(0,0),(0,0),5),("BOTTOMPADDING",(0,-1),(0,-1),5),
  ("LINEABOVE",(0,6),(0,6),0.6,LINE),
]))
F.append(Spacer(1,3)); F.append(t); F.append(Spacer(1,4))
F.append(P("Only costs approved in advance in writing by both PainBeacon and the publishing entity come off the top. "
  "The origination line is a cost of making the sale, like the processing fee and the channel share, borne by both "
  "sides in proportion to what they receive. Commissions in Section 3 are a percentage of <b>PainBeacon Revenue</b>, "
  "except during recoupment under 3(f). If the split changes, Sections 2 and 3 are amended in writing; "
  "Contractor&rsquo;s percentages do not change on their own."))

F.append(H("3. Commission schedule"))
F.append(P("&ldquo;Originator&rdquo; is the party whose named contact, outreach or introduction produced the sale, "
  "recorded in the shared pipeline before it closes; a sale with no Originator of record is a house sale. Whether (a) "
  "or (f) applies is fixed at the start of each sale by whether the recoupment balance is above zero, and a sale is "
  "never split between the two. <b>These rates apply identically to Contractor and to Richard Shea.</b>"))
rows = [
 [P("(a) Direct origination","td"),                                  P("25% of PainBeacon Revenue on that sale","tdr")],
 [P("(b) Channel override &mdash; that party opened it, another closed","td"), P("10%, for 12 months from the channel&rsquo;s first sale","tdr")],
 [P("(c) House sale &mdash; neither party originated it","td"),      P("5%, if that party closed a sale in the trailing quarter","tdr")],
 [P("(d) Renewals and repeat purchases in the account","td"),        P("10% to the original Originator, for 24 months","tdr")],
 [P("(e) Cap on any one sale","td"),                                 P("30% of PainBeacon Revenue, origination plus override","tdr")],
 [P("(f) While marketing costs are still being recouped","td"),      P("10% of gross to the Originator, paid off the top, in place of (a)","tdr")],
 [P("(g) Advertising, sponsorship, featured placements","td"),       P("25% of collections net of processing fees, unchanged","tdr")],
]
t = Table(rows, colWidths=[W*0.45, W*0.55])
t.setStyle(TableStyle([
  ("VALIGN",(0,0),(-1,-1),"TOP"),
  ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),
  ("LEFTPADDING",(1,0),(1,-1),10),
  ("TOPPADDING",(0,0),(-1,-1),1.9),("BOTTOMPADDING",(0,0),(-1,-1),1.9),
  ("LINEBELOW",(0,0),(-1,-2),0.4,LINE),
]))
F.append(Spacer(1,3)); F.append(t)

F.append(H("4. Payment and clawback"))
F.append(P("PainBeacon issues a monthly statement showing each sale, the deductions applied, PainBeacon Revenue, and "
  "commission earned, and pays within 15 days of receiving its distribution. A refunded or charged-back sale reverses "
  "the related commission, offset against future commissions."))

F.append(H("5. Authority"))
F.append(P("Contractor may not set or discount price, bundle products, promise delivery dates, or describe the forms "
  "vault beyond the written materials PainBeacon supplies. Any variation needs written approval from Richard Shea."))

F.append(H("6. Rankings are not for sale"))
F.append(P("PainBeacon&rsquo;s directory rank, placement, verification badges and editorial coverage are never affected "
  "by payment. Contractor may not state or imply that buying books, advertising or a featured listing changes how a "
  "clinic ranks or appears. Paid placements are labeled as advertising. Breach is grounds for immediate termination "
  "and forfeiture of unpaid commissions."))

F.append(H("7. No referral compensation"))
F.append(P("Nothing sold here is a patient referral, and no compensation is tied to the volume or value of referrals, "
  "patients, or health-care business. Contractor sells publications and advertising only."))

F.append(H("8. Confidentiality and term"))
F.append(P("Customer lists, pricing, pipeline records, the publisher&rsquo;s materials and PainBeacon&rsquo;s data are "
  "confidential, are not used outside this agreement, and are returned or deleted when it ends. Either party may end it "
  "on 30 days&rsquo; written notice; commission on sales closed before the end date is paid for 90 days of collection "
  "after it, and overrides under 3(b) end on the end date."))

F.append(H("9. Ownership and general"))
F.append(P("Shea contracts as a sole proprietor and may assign this agreement to an entity he forms, on written notice "
  "to Contractor and with no change to any term. This agreement grants no ownership interest in PainBeacon and is not "
  "a promise of one. Virginia law governs, this is the entire agreement on its subject, and it can be changed only in "
  "a writing signed by both."))

F.append(Spacer(1, 1))
sig = Table([
  [P("Richard Shea, d/b/a PainBeacon","td"), P("","td"), P("Date","small")],
  [P("","td"), P("","td"), P("","td")],
  [P("Mark Mooney","td"), P("","td"), P("Date","small")],
], colWidths=[W*0.30, W*0.45, W*0.25], rowHeights=[14, 2, 14])
sig.setStyle(TableStyle([
  ("VALIGN",(0,0),(-1,-1),"BOTTOM"),
  ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),
  ("LINEBELOW",(1,0),(2,0),0.6,INK),
  ("LINEBELOW",(1,2),(2,2),0.6,INK),
]))
F.append(KeepTogether(sig))


# ---- page 2
from reportlab.platypus import PageBreak
F.append(PageBreak())
F.append(P("APPENDIX &mdash; NOT PART OF THE AGREEMENT", "kicker"))
F.append(P("Worked examples", "h1"))
F.append(P("One $3,000 book-series sale, paid by card, against an $8,000 approved campaign.", "meta"))
F.append(Spacer(1,8))

def money_table(rows, bold_rows):
    t = Table(rows, colWidths=[W*0.62, W*0.38])
    style = [
      ("VALIGN",(0,0),(-1,-1),"TOP"),
      ("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),
      ("TOPPADDING",(0,0),(-1,-1),3.2),("BOTTOMPADDING",(0,0),(-1,-1),3.2),
      ("LINEBELOW",(0,0),(-1,-2),0.4,LINE),
      ("LINEABOVE",(0,0),(-1,0),0.8,TEAL_DEEP),
      ("LINEBELOW",(0,-1),(-1,-1),0.8,TEAL_DEEP),
    ]
    for r in bold_rows:
        style.append(("BACKGROUND",(0,r),(-1,r),TINT))
    t.setStyle(TableStyle(style))
    return t

F.append(P("<b>A sale made while the campaign is still being recouped</b>", "body"))
F.append(Spacer(1,3))
F.append(money_table([
 [P("Gross","td"),                                        P("$3,000.00","tdr")],
 [P("Stripe processing (2.9% + $0.30)","td"),             P("&minus;$87.30","tdr")],
 [P("Origination to the seller, 10% of gross &mdash; 3(f)","tdb"), P("&minus;$300.00","tdrb")],
 [P("Applied to the recoupment balance","td"),            P("&minus;$2,612.70","tdr")],
 [P("Distributable Revenue","tdb"),                       P("$0.00","tdrb")],
 [P("Publishing entity $0.00 &nbsp;&middot;&nbsp; PainBeacon $0.00","td"), P("&nbsp;","tdr")],
], [2, 4]))
F.append(Spacer(1,4))
F.append(P("The campaign balance falls from $8,000.00 to $5,387.30, so an $8,000 campaign clears during the fourth "
  "sale. The $300 costs the publishing entity $200 and PainBeacon $100, measured against what each would otherwise "
  "have received &mdash; about $800 and $400 across the whole recoupment.", "small"))
F.append(Spacer(1,10))

F.append(P("<b>The same sale once the campaign is recouped</b>", "body"))
F.append(Spacer(1,3))
F.append(money_table([
 [P("Gross","td"),                                   P("$3,000.00","tdr")],
 [P("Stripe processing (2.9% + $0.30)","td"),        P("&minus;$87.30","tdr")],
 [P("Distributable Revenue","tdb"),                  P("$2,912.70","tdrb")],
 [P("Samakow publishing entity, two-thirds","td"),   P("$1,941.80","tdr")],
 [P("PainBeacon Revenue, one-third","tdb"),          P("$970.90","tdrb")],
 [P("Origination at 25% &mdash; 3(a)","td"),         P("&minus;$242.73","tdr")],
 [P("PainBeacon retained","tdb"),                    P("$728.17","tdrb")],
], [2, 4, 6]))
F.append(Spacer(1,10))

F.append(P("<b>The step down is intentional.</b> The Originator earns $300 on a recoupment sale and $242.73 on the "
  "same sale afterwards, because the two are paid out of different things. During recoupment nobody takes a profit, so "
  "selling is a cost of the sale and both sides fund it in proportion to what it will earn them. After recoupment it "
  "is a share of PainBeacon&rsquo;s profit and PainBeacon alone pays it."))
F.append(Spacer(1,6))
F.append(P("<b>The same sale paid by ACH.</b> Stripe charges 0.8% capped at $5.00 instead of $87.30. After recoupment "
  "that makes PainBeacon Revenue $998.33 and retained $748.75 &mdash; about $27 per sale to PainBeacon and $55 to the "
  "publishing entity, enough to justify a line of checkout copy asking for it."))
F.append(Spacer(1,6))
F.append(P("<b>Two blanks to fill before this goes out,</b> plus one conversation. The blanks are the effective date "
  "and Contractor&rsquo;s address for notice. The conversation is with the publishing entity: Section 2 sets the "
  "two-thirds / one-third split, the off-the-top expense order, and the new origination line, and it needs to be "
  "agreed in writing before Contractor signs against it &mdash; the origination line in particular spends the "
  "publisher&rsquo;s money as well as PainBeacon&rsquo;s. This draft has not been reviewed by counsel."))
F.append(Spacer(1,6))
F.append(P("<b>A path to ownership</b> for Contractor is covered by a separate, non-binding term sheet. Section 9 is "
  "worded so that nothing in this agreement can be read as having granted or promised equity."))
F.append(Spacer(1,6))
F.append(P("<b>PainBeacon is a sole proprietorship today.</b> Shea signs personally and is personally liable under "
  "this agreement until an entity exists and the agreement is assigned to it under Section 9. Virginia registration "
  "of the &ldquo;PainBeacon&rdquo; trade name is a separate, inexpensive filing and does not create that entity or "
  "that protection.", "small"))

doc.build(F)
print("built", OUT)
