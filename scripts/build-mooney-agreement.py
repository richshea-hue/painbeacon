from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Table, TableStyle, KeepTogether)

# Renders notes/mark-mooney-sales-agreement-2026-09-22.md as a signable PDF.
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
              textColor=TEAL_DEEP, spaceBefore=4.5, spaceAfter=1.8),
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
    canvas.drawString(0.72*inch, 0.34*inch, "PAINBEACON.COM")
    canvas.drawRightString(w - 0.72*inch, 0.34*inch, "Page %d of 2" % doc.page)
    canvas.setStrokeColor(LINE); canvas.setLineWidth(0.5)
    canvas.line(0.72*inch, 0.48*inch, w - 0.72*inch, 0.48*inch)
    canvas.restoreState()

doc = BaseDocTemplate(OUT, pagesize=LETTER,
        leftMargin=0.72*inch, rightMargin=0.72*inch,
        topMargin=0.45*inch, bottomMargin=0.55*inch,
        title="Sales and Origination Agreement - PainBeacon and Mark Mooney",
        author="Rich Shea", subject="Draft sales and origination agreement")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=deco)])
W = doc.width

def P(t, s="body"): return Paragraph(t, st[s])
def H(t): return Paragraph(t, st["h2"])

F = []
F.append(P("DRAFT FOR REVIEW &mdash; 22 SEPTEMBER 2026", "kicker"))
F.append(P("Sales and Origination Agreement", "h1"))
F.append(P("PainBeacon, operated by Richard Shea (&ldquo;PainBeacon&rdquo;), and Mark Mooney (&ldquo;Contractor&rdquo;). "
           "Effective ______________, 2026. Subject: origination of sales of (a) the Samakow pain-practice book series "
           "and the associated forms vault, and (b) PainBeacon advertising, sponsorship and featured placements.", "meta"))
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
  [P("&minus;&nbsp; approved marketing and campaign costs still being recouped","td")],
  [P("&minus;&nbsp; any association, channel or referral-partner share","td")],
  [P("=&nbsp; <b>Distributable Revenue</b> &nbsp;&rarr;&nbsp; two-thirds to the Samakow publishing entity, "
     "one-third to PainBeacon (<b>&ldquo;PainBeacon Revenue&rdquo;</b>)","td")],
]
t = Table(water, colWidths=[W])
t.setStyle(TableStyle([
  ("BACKGROUND",(0,0),(-1,-1),TINT),
  ("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),
  ("TOPPADDING",(0,0),(-1,-1),1.2),("BOTTOMPADDING",(0,0),(-1,-1),1.2),
  ("TOPPADDING",(0,0),(0,0),5),("BOTTOMPADDING",(0,-1),(0,-1),5),
  ("LINEABOVE",(0,5),(0,5),0.6,LINE),
]))
F.append(Spacer(1,3)); F.append(t); F.append(Spacer(1,4))
F.append(P("Only costs approved in advance in writing by both PainBeacon and the publishing entity come off the top. "
  "Commissions in Section 3 are a percentage of <b>PainBeacon Revenue</b>, except the minimum in 3(f). If that split "
  "changes, Sections 2 and 3 are amended in writing; Contractor&rsquo;s percentages do not change on their own."))

F.append(H("3. Commission schedule"))
F.append(P("&ldquo;Originator&rdquo; is the party whose named contact, outreach or introduction produced the sale, "
  "recorded in the shared pipeline before it closes; a sale with no Originator of record is a house sale. "
  "<b>These rates apply identically to Contractor and to Richard Shea.</b>"))
rows = [
 [P("(a) Direct origination","td"),                                  P("25% of PainBeacon Revenue on that sale","tdr")],
 [P("(b) Channel override &mdash; that party opened it, another closed","td"), P("10%, for 12 months from the channel&rsquo;s first sale","tdr")],
 [P("(c) House sale &mdash; neither party originated it","td"),      P("5%, if that party closed a sale in the trailing quarter","tdr")],
 [P("(d) Renewals and repeat purchases in the account","td"),        P("10% to the original Originator, for 24 months","tdr")],
 [P("(e) Cap on any one sale","td"),                                 P("30% of PainBeacon Revenue, origination plus override","tdr")],
 [P("(f) Minimum per closed series sale","td"),                      P("$150 to the Originator when funds clear, credited against (a)","tdr")],
 [P("(g) Advertising, sponsorship, featured placements","td"),       P("25% of collections net of processing fees, unchanged","tdr")],
]
t = Table(rows, colWidths=[W*0.45, W*0.55])
t.setStyle(TableStyle([
  ("VALIGN",(0,0),(-1,-1),"TOP"),
  ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),
  ("LEFTPADDING",(1,0),(1,-1),10),
  ("TOPPADDING",(0,0),(-1,-1),2.4),("BOTTOMPADDING",(0,0),(-1,-1),2.4),
  ("LINEBELOW",(0,0),(-1,-2),0.4,LINE),
]))
F.append(Spacer(1,3)); F.append(t)

F.append(H("4. Payment and clawback"))
F.append(P("PainBeacon issues a monthly statement showing each sale, the deductions applied, PainBeacon Revenue, and "
  "commission earned, and pays within 15 days of receiving its distribution for that sale. A sale later refunded or "
  "charged back reverses the related commission, offset against future commissions."))

F.append(H("5. Authority"))
F.append(P("Contractor may not set or discount price, bundle products, promise delivery dates, or describe the forms "
  "vault beyond the written materials PainBeacon supplies. Any variation needs written approval from Richard Shea."))

F.append(H("6. Rankings are not for sale"))
F.append(P("PainBeacon&rsquo;s directory rank, placement, verification badges and editorial coverage are never affected "
  "by payment. Contractor may not state or imply that buying books, advertising or a featured listing changes how a "
  "clinic ranks or appears in the directory. Paid placements are labeled as advertising. Breach is grounds for "
  "immediate termination and forfeiture of unpaid commissions."))

F.append(H("7. No referral compensation"))
F.append(P("Nothing sold here is a patient referral, and no compensation is tied to the volume or value of referrals, "
  "patients, or health-care business. Contractor sells publications and advertising only."))

F.append(H("8. Confidentiality and term"))
F.append(P("Customer lists, pricing, pipeline records, the publisher&rsquo;s materials and PainBeacon&rsquo;s data are "
  "confidential, may not be used outside this agreement, and are returned or deleted when it ends. Either party may end "
  "this agreement on 30 days&rsquo; written notice; commission on sales closed before the end date is paid for 90 days "
  "of collection after it, and overrides under 3(b) end on the end date."))

F.append(H("9. Ownership and general"))
F.append(P("This agreement grants no ownership interest in PainBeacon and is not a promise of one; any ownership would "
  "be a separate written instrument. Virginia law governs. This is the entire agreement on its subject and can be "
  "changed only in a writing signed by both."))

F.append(Spacer(1, 3))
sig = Table([
  [P("PainBeacon &mdash; Richard Shea","td"), P("","td"), P("Date","small")],
  [P("","td"), P("","td"), P("","td")],
  [P("Mark Mooney","td"), P("","td"), P("Date","small")],
], colWidths=[W*0.30, W*0.45, W*0.25], rowHeights=[17, 3, 17])
sig.setStyle(TableStyle([
  ("VALIGN",(0,0),(-1,-1),"BOTTOM"),
  ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),
  ("LINEBELOW",(1,0),(2,0),0.6,INK),
  ("LINEBELOW",(1,2),(2,2),0.6,INK),
]))
F.append(sig)
F.append(Spacer(1,3))
F.append(P("A separate, non-binding term sheet covers a path to ownership. It is not part of this agreement.","small"))

# ---- page 2
from reportlab.platypus import PageBreak
F.append(PageBreak())
F.append(P("APPENDIX &mdash; NOT PART OF THE AGREEMENT", "kicker"))
F.append(P("Worked example", "h1"))
F.append(P("One $3,000 book-series sale, paid by card, with marketing costs already recouped.", "meta"))
F.append(Spacer(1,8))

ex = [
 [P("Gross","td"),                                   P("$3,000.00","tdr")],
 [P("Stripe processing (2.9% + $0.30)","td"),        P("&minus;$87.30","tdr")],
 [P("Marketing recoupment (assumed complete)","td"), P("$0.00","tdr")],
 [P("Distributable Revenue","tdb"),                  P("$2,912.70","tdrb")],
 [P("Samakow publishing entity, two-thirds","td"),   P("$1,941.80","tdr")],
 [P("PainBeacon Revenue, one-third","tdb"),          P("$970.90","tdrb")],
 [P("Origination commission at 25%","td"),           P("&minus;$242.73","tdr")],
 [P("PainBeacon retained","tdb"),                    P("$728.17","tdrb")],
]
t = Table(ex, colWidths=[W*0.62, W*0.38])
t.setStyle(TableStyle([
  ("VALIGN",(0,0),(-1,-1),"TOP"),
  ("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),
  ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
  ("LINEBELOW",(0,0),(-1,-2),0.4,LINE),
  ("BACKGROUND",(0,3),(-1,3),TINT),
  ("BACKGROUND",(0,5),(-1,5),TINT),
  ("BACKGROUND",(0,7),(-1,7),TINT),
  ("LINEABOVE",(0,0),(-1,0),0.8,TEAL_DEEP),
  ("LINEBELOW",(0,-1),(-1,-1),0.8,TEAL_DEEP),
]))
F.append(t)
F.append(Spacer(1,12))
F.append(P("<b>The same sale paid by ACH.</b> Stripe charges 0.8% capped at $5.00 instead of $87.30, so Distributable "
  "Revenue is $2,995.00, PainBeacon Revenue is $998.33, and PainBeacon retains $748.75 after commission. Moving a buyer "
  "from card to ACH is worth about $27 per sale to PainBeacon and about $55 to the publishing entity &mdash; enough to "
  "justify a line of checkout copy asking for it."))
F.append(Spacer(1,8))
F.append(P("<b>During marketing recoupment.</b> While approved campaign costs are still being recovered off the top, "
  "Distributable Revenue and therefore PainBeacon Revenue are $0 on a sale, and the percentage commissions compute to "
  "nothing. The $150 minimum in Section 3(f) is what the Originator is paid instead, so the first sales &mdash; the "
  "hardest ones &mdash; are not the unpaid ones."))
F.append(Spacer(1,8))
F.append(P("<b>Three blanks to fill before this goes out.</b> The PainBeacon legal entity name, the effective date, and "
  "written confirmation from the publishing entity that the two-thirds / one-third split and the off-the-top expense "
  "order in Section 2 are agreed. Section 2 is the base every number in Section 3 is measured against; Contractor "
  "should not sign against a split that is still verbal. This draft has not been reviewed by counsel."))

doc.build(F)
print("built", OUT)
