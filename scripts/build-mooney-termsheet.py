from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Table, TableStyle, KeepTogether, PageBreak)

# Renders notes/mark-mooney-ownership-termsheet.md as a PDF.
# Needs reportlab: pip install reportlab.
#   python3 scripts/build-mooney-termsheet.py [out.pdf]
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    ROOT, "PainBeacon-Mooney-ownership-termsheet.pdf")

TEAL_DEEP = colors.HexColor("#0A4F46")
INK       = colors.HexColor("#1D2B29")
SOFT      = colors.HexColor("#5A6B68")
LINE      = colors.HexColor("#DCE3E1")
TINT      = colors.HexColor("#F1F7F5")
WARN      = colors.HexColor("#FBF3E8")
WARN_EDGE = colors.HexColor("#E0C9A6")

def S(name, **kw):
    base = dict(name=name, fontName="Helvetica", fontSize=8.4, leading=11.2,
                textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(**base)

st = {
  "kicker": S("kicker", fontName="Helvetica-Bold", fontSize=7.5, textColor=TEAL_DEEP, leading=9),
  "h1":     S("h1", fontName="Helvetica-Bold", fontSize=16, leading=19, spaceAfter=2),
  "meta":   S("meta", fontSize=8.2, textColor=SOFT, leading=11.4),
  "h2":     S("h2", fontName="Helvetica-Bold", fontSize=9.2, leading=11.6,
              textColor=TEAL_DEEP, spaceBefore=7, spaceAfter=2.4),
  "body":   S("body"),
  "small":  S("small", fontSize=7.7, leading=10.4, textColor=SOFT),
  "th":     S("th", fontName="Helvetica-Bold", fontSize=7.7, leading=10, textColor=SOFT),
  "td":     S("td", fontSize=8.2, leading=10.8),
  "tdb":    S("tdb", fontName="Helvetica-Bold", fontSize=8.2, leading=10.8),
  "tdr":    S("tdr", fontSize=8.2, leading=10.8, alignment=2),
  "tdrb":   S("tdrb", fontName="Helvetica-Bold", fontSize=8.2, leading=10.8, alignment=2),
}

NPAGES = 2

def deco(canvas, doc):
    canvas.saveState()
    w, h = LETTER
    canvas.setFillColor(TEAL_DEEP)
    canvas.rect(0, h - 0.14*inch, w, 0.14*inch, stroke=0, fill=1)
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.setFillColor(SOFT)
    canvas.drawString(0.8*inch, 0.38*inch, "NON-BINDING — PAINBEACON.COM")
    canvas.drawRightString(w - 0.8*inch, 0.38*inch, "Page %d of %d" % (doc.page, NPAGES))
    canvas.setStrokeColor(LINE); canvas.setLineWidth(0.5)
    canvas.line(0.8*inch, 0.52*inch, w - 0.8*inch, 0.52*inch)
    canvas.restoreState()

doc = BaseDocTemplate(OUT, pagesize=LETTER,
        leftMargin=0.8*inch, rightMargin=0.8*inch,
        topMargin=0.5*inch, bottomMargin=0.62*inch,
        title="Ownership Term Sheet (non-binding) - PainBeacon and Mark Mooney",
        author="Rich Shea", subject="Non-binding ownership term sheet")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=deco)])
W = doc.width

def P(t, s="body"): return Paragraph(t, st[s])
def H(t): return Paragraph(t, st["h2"])

def callout(paras, bg=WARN, edge=WARN_EDGE):
    t = Table([[p] for p in paras], colWidths=[W])
    t.setStyle(TableStyle([
      ("BACKGROUND",(0,0),(-1,-1),bg),
      ("BOX",(0,0),(-1,-1),0.6,edge),
      ("LEFTPADDING",(0,0),(-1,-1),9),("RIGHTPADDING",(0,0),(-1,-1),9),
      ("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2),
      ("TOPPADDING",(0,0),(0,0),6),("BOTTOMPADDING",(0,-1),(0,-1),6),
    ]))
    return t

F = []
F.append(P("NON-BINDING TERM SHEET &mdash; 23 SEPTEMBER 2026", "kicker"))
F.append(P("A Path to Ownership", "h1"))
F.append(P("For Mark Mooney, alongside the Sales and Origination Agreement between Richard Shea, doing business as "
           "PainBeacon, and Mark Mooney.", "meta"))
F.append(Spacer(1, 6))

F.append(callout([
  P("<b>Nothing here is binding, and nothing here grants anything today.</b> There is no PainBeacon entity yet, so "
    "there are no units to issue and no one to issue them. This describes what Shea intends to put in an operating "
    "agreement when an entity exists. Only a signed operating agreement creates rights. The Sales and Origination "
    "Agreement is the binding document between us; it says in Section 9 that it grants no ownership, and that stays "
    "true whatever happens to this page."),
]))
F.append(Spacer(1, 4))

F.append(H("1. What can be earned"))
F.append(P("Up to <b>10% of PainBeacon</b>, as non-voting units, earned in four tranches against the cumulative gross "
  "revenue PainBeacon collects on sales Mooney originates &mdash; book series and advertising together, measured by "
  "the Originator record in Section 3 of the Sales Agreement."))
F.append(Spacer(1,4))
rows = [
 [P("Cumulative originated revenue collected","th"), P("Tranche","th"), P("Running total","th")],
 [P("$50,000","td"),  P("2.0%","tdr"), P("2.0%","tdr")],
 [P("$150,000","td"), P("2.0%","tdr"), P("4.0%","tdr")],
 [P("$300,000","td"), P("3.0%","tdr"), P("7.0%","tdr")],
 [P("$500,000","td"), P("3.0%","tdr"), P("10.0%","tdrb")],
]
t = Table(rows, colWidths=[W*0.52, W*0.24, W*0.24])
t.setStyle(TableStyle([
  ("VALIGN",(0,0),(-1,-1),"TOP"),
  ("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),
  ("TOPPADDING",(0,0),(-1,-1),3.4),("BOTTOMPADDING",(0,0),(-1,-1),3.4),
  ("LINEBELOW",(0,0),(-1,0),0.6,TEAL_DEEP),
  ("LINEBELOW",(0,1),(-1,-2),0.4,LINE),
  ("LINEBELOW",(0,-1),(-1,-1),0.8,TEAL_DEEP),
  ("BACKGROUND",(0,-1),(-1,-1),TINT),
]))
F.append(t)
F.append(Spacer(1,4))
F.append(P("A tranche is earned outright when the milestone is reached. There is no separate time vesting: this is paid "
  "for by selling, not by staying. <b>Revenue counts from the effective date of the Sales Agreement, whether or not an "
  "entity exists yet</b>, and tranches earned before formation are credited on formation. 10% is a ceiling, not a "
  "target &mdash; there is no fifth tranche."))

F.append(H("2. What the units are"))
F.append(P("Non-voting profits interests in a Virginia LLC taxed as a partnership. <b>Non-voting</b> means Shea keeps "
  "every decision: what PainBeacon builds, what it charges, who it hires, whether it sells. <b>Profits interest</b> "
  "means the units carry a threshold equal to the entity&rsquo;s good-faith value on the grant date, so they share in "
  "what the business earns and appreciates from that day forward, not in what already exists. That structure is what "
  "lets the units be granted without income tax to Mooney at grant under Rev. Proc. 93-27; a capital interest would be "
  "taxable to him as compensation on day one."))

F.append(H("3. Distributions"))
F.append(P("Distributions are made pro rata to all members after PainBeacon retains a working reserve Shea sets. Units "
  "earn from the business as it runs &mdash; this is not equity that only pays on a sale, because there may never be a "
  "sale. Commissions under the Sales Agreement are unaffected: they are a cost of the sale, paid before profit exists, "
  "and holding units does not reduce them."))

F.append(H("4. If no entity is formed"))
F.append(P("If a tranche is earned and Shea has not formed an entity within 24 months after that, he will instead put "
  "in place a contractual profit share paying the same economics described here. Mooney should not have to wait on a "
  "filing he does not control."))

F.append(H("5. If Mooney stops selling"))
F.append(P("Unearned tranches simply stop accruing. Earned units may be repurchased by PainBeacon if the Sales "
  "Agreement ends or if Mooney originates nothing for twelve consecutive months, at 1.5&times; the distributions those "
  "units received over the trailing twelve months, payable over 24 months &mdash; or at fair market value set by an "
  "independent appraiser, at Mooney&rsquo;s election and expense."))

F.append(H("6. Forfeiture"))
F.append(P("Breach of Section 6 or Section 7 of the Sales Agreement &mdash; representing that payment affects rankings, "
  "or tying compensation to patient referrals &mdash; forfeits all unearned tranches and lets PainBeacon repurchase "
  "earned units at the lower of the Section 5 formula or $1.00. The directory&rsquo;s independence is the whole asset; "
  "a share of it cannot be worth more than it."))

F.append(H("7. Transfers, sale of the business, dilution"))
F.append(P("Units cannot be transferred, pledged or assigned without Shea&rsquo;s written consent, and PainBeacon has a "
  "right of first refusal. If Shea sells control, Mooney sells on the same terms and price per unit (drag-along) and "
  "may participate pro rata if he is not already included (tag-along). Admitting future members dilutes everyone "
  "including Mooney; his consent is not required, and there is no anti-dilution protection."))

F.append(H("8. Information"))
F.append(P("A Schedule K-1 each year, and an annual summary of revenue, distributions and the current unit table. Not "
  "books-and-records inspection rights, not a seat at any table."))

# ---------------- page 2
F.append(PageBreak())
F.append(P("NON-BINDING TERM SHEET &mdash; 23 SEPTEMBER 2026", "kicker"))
F.append(P("What it is worth", "h1"))
F.append(P("Illustrative arithmetic. Not a projection, not a promise.", "meta"))
F.append(Spacer(1, 8))

F.append(H("One $3,000 book-series sale, after marketing is recouped"))
rows = [
 [P("PainBeacon Revenue on the sale (one-third of $2,912.70)","td"), P("$970.90","tdr")],
 [P("Less origination commission at 25%","td"),                      P("&minus;$242.73","tdr")],
 [P("PainBeacon retained, before operating costs","tdb"),            P("$728.17","tdrb")],
 [P("Mooney at 10%, if all four tranches are earned","td"),          P("$72.82","tdr")],
]
t = Table(rows, colWidths=[W*0.64, W*0.36])
t.setStyle(TableStyle([
  ("VALIGN",(0,0),(-1,-1),"TOP"),
  ("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),
  ("TOPPADDING",(0,0),(-1,-1),3.6),("BOTTOMPADDING",(0,0),(-1,-1),3.6),
  ("LINEABOVE",(0,0),(-1,0),0.8,TEAL_DEEP),
  ("LINEBELOW",(0,0),(-1,-2),0.4,LINE),
  ("LINEBELOW",(0,-1),(-1,-1),0.8,TEAL_DEEP),
  ("BACKGROUND",(0,2),(-1,2),TINT),
]))
F.append(t)
F.append(Spacer(1,5))
F.append(P("On a sale Mooney originates he earns the $242.73 commission and, at full vesting, roughly $72.82 more as an "
  "owner &mdash; about $315 on the sale. <b>On a sale he had nothing to do with, he still earns the $72.82.</b> That is "
  "the difference between the two instruments, and the reason both exist: the commission pays for the sale, the units "
  "pay for the business. Operating costs come out before any distribution, so the $72.82 is an upper bound on that "
  "sale, not a number that arrives."))

F.append(H("What 10% is 10% of"))
F.append(P("10% of <b>PainBeacon</b>, which receives one third of book revenue after costs. It is not 10% of a book "
  "sale. On the sale above, 10% of PainBeacon&rsquo;s retained profit is about 2.4% of the $3,000 the clinic paid. "
  "Worth being precise about now: Samakow&rsquo;s two-thirds is contractual, not ownership, and he holds no interest in "
  "PainBeacon. Mooney&rsquo;s units are units in the directory business &mdash; the clinic data, the maps, the "
  "advertising, the claims &mdash; and the book series is one revenue line inside it."))

F.append(H("Tax, in one paragraph, from someone who is not a tax adviser"))
F.append(P("Once Mooney holds an LLC interest he is generally a partner rather than a contractor for tax purposes. His "
  "commissions would most likely be reported as guaranteed payments on a Schedule K-1 rather than on a Form 1099-NEC, "
  "and self-employment tax would apply to his distributive share. Nothing about the cash changes; the paperwork and "
  "the quarterly estimates do. <b>Mooney should run this page past his own accountant before the first tranche is "
  "earned</b>, not after."))

F.append(Spacer(1, 8))
F.append(callout([
  P("<b>Open items on Shea&rsquo;s side, stated so they are not surprises.</b>"),
  P("PainBeacon is a sole proprietorship today. Forming the LLC, setting the threshold value, and drafting the "
    "operating agreement are all ahead, and all cost money the business has not yet made. The threshold value should "
    "be set the day the entity forms, while the business is small &mdash; waiting raises it and makes these units "
    "worth less to Mooney, not more."),
  P("This page has not been reviewed by counsel or a tax adviser, and it is not an offer to sell a security."),
]))

doc.build(F)
print("built", OUT)
