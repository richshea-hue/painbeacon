#!/usr/bin/env python3
"""
sponsor-report-pdf.py — renders the sponsor report as a PDF to send.

Input is the JSON that sponsor-report.mjs writes, never the Markdown: one set
of arithmetic, so the two outputs cannot disagree.

    node --env-file=.env scripts/sponsor-report.mjs --sponsor samakow-law \\
        --json samakow.json
    python3 scripts/sponsor-report-pdf.py samakow.json --out samakow.pdf

Needs reportlab (pip install reportlab). Nothing here talks to the network or
reads credentials.

The growth panel is ONE encoded series of monthly counts, so it is drawn as a
plain bar row with every value labeled and no legend — the heading names the
series. Where the source also reports clicks they ride alongside as a number in
their own column, never as a second set of bars: impressions run about fifty
times larger, and two scales in one panel is the dual-axis chart that can be
made to say anything. Bars carry the house teal; the numbers beside them stay in
text ink, because a figure wearing the series color reads as a second encoding
that is not there.
"""

import argparse
import json
import os

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Table, TableStyle, PageBreak, Flowable)

TEAL_DEEP = colors.HexColor("#0A4F46")
TEAL      = colors.HexColor("#17A08C")
INK       = colors.HexColor("#1D2B29")
SOFT      = colors.HexColor("#5A6B68")
LINE      = colors.HexColor("#DCE3E1")
TINT      = colors.HexColor("#F1F7F5")


def S(name, **kw):
    base = dict(name=name, fontName="Helvetica", fontSize=9.5, leading=13.5,
                textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(**base)


st = {
    "kicker": S("kicker", fontName="Helvetica-Bold", fontSize=8, textColor=TEAL_DEEP, leading=10),
    "h1":     S("h1", fontName="Helvetica-Bold", fontSize=18, leading=22, spaceAfter=3),
    "meta":   S("meta", fontSize=9, textColor=SOFT, leading=13),
    "h2":     S("h2", fontName="Helvetica-Bold", fontSize=11.5, leading=15,
                textColor=TEAL_DEEP, spaceBefore=11, spaceAfter=5),
    "body":   S("body"),
    "small":  S("small", fontSize=8, leading=11.5, textColor=SOFT),
    "bignum": S("bignum", fontName="Helvetica-Bold", fontSize=21, leading=23, textColor=TEAL_DEEP),
    "statlbl":S("statlbl", fontSize=8, leading=11, textColor=SOFT),
    "th":     S("th", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=SOFT),
    "td":     S("td", fontSize=9, leading=12.5),
    "tdr":    S("tdr", fontSize=9, leading=12.5, alignment=2),
}


class BarRow(Flowable):
    """One horizontal bar per month, with the value — and, where the source has
    one, a companion count — in right-aligned columns.

    Bars start at a common baseline and share one scale, so length is the only
    thing carrying magnitude. The companion count is a NUMBER, never a second
    bar: impressions and clicks differ by about fiftyfold, and two scales in one
    panel is the dual-axis chart that can be made to say anything. The
    in-progress month is drawn hollow, because a partial count standing beside
    complete ones would otherwise read as a fall.
    """

    ROW, GAP, BAR, HEAD = 17, 2, 11, 13     # 2px surface gap between bars

    def __init__(self, months, width, label_w=58, value_w=56,
                 value_head="", clicks_head=""):
        super().__init__()
        self.months, self.width = months, width
        self.label_w, self.value_w = label_w, value_w
        self.clicks = any(m.get("clicks") is not None for m in months)
        self.clicks_w = 58 if self.clicks else 0
        self.value_head, self.clicks_head = value_head, clicks_head
        self.head = self.HEAD if (value_head or clicks_head) else 0
        self.height = len(months) * (self.ROW + self.GAP) + self.head

    def draw(self):
        c = self.canv
        peak = max([m["value"] for m in self.months] or [0]) or 1
        track = self.width - self.label_w - self.value_w - self.clicks_w
        value_x = self.label_w + track + self.value_w - 2
        clicks_x = value_x + self.clicks_w

        y = self.height - self.head
        if self.head:
            c.setFont("Helvetica", 7.5)
            c.setFillColor(SOFT)
            if self.value_head:
                c.drawRightString(value_x, y + 2, self.value_head)
            if self.clicks and self.clicks_head:
                c.drawRightString(clicks_x, y + 2, self.clicks_head)
            c.setStrokeColor(LINE)
            c.setLineWidth(0.5)
            c.line(0, y - 1, self.width, y - 1)

        y -= self.ROW
        for m in self.months:
            c.setFont("Helvetica", 8.5)
            c.setFillColor(SOFT)
            c.drawString(0, y + 2.5, month_label(m["month"]) + (" *" if m["partial"] else ""))
            w = max(1.5, track * m["value"] / peak)
            c.setFillColor(TEAL)
            c.setStrokeColor(TEAL)
            if m["partial"]:
                c.setFillColor(colors.white)
                c.setLineWidth(0.8)
                c.roundRect(self.label_w, y, w, self.BAR, 2.5, stroke=1, fill=1)
            else:
                c.roundRect(self.label_w, y, w, self.BAR, 2.5, stroke=0, fill=1)
            # Values wear text ink, not the series color: a figure in the bar's
            # color reads as a second encoding that is not there.
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 9)
            c.drawRightString(value_x, y + 2, f"{m['value']:,}")
            if self.clicks:
                c.setFont("Helvetica", 9)
                c.setFillColor(SOFT)
                c.drawRightString(clicks_x, y + 2, f"{m.get('clicks') or 0:,}")
            y -= self.ROW + self.GAP


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def month_label(ym):
    y, m = ym.split("-")
    return f"{MONTHS[int(m) - 1]} {y}"


def build(data, out_path):
    doc = BaseDocTemplate(
        out_path, pagesize=LETTER,
        leftMargin=0.9 * inch, rightMargin=0.9 * inch,
        topMargin=0.75 * inch, bottomMargin=0.95 * inch,
        title=f"PainBeacon sponsor report — {data['name']}",
        author="Rich Shea", subject=f"Sponsor report, {data['since']} to {data['until']}")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")

    def deco(canvas, d):
        canvas.saveState()
        w, h = LETTER
        canvas.setFillColor(TEAL_DEEP)
        canvas.rect(0, h - 0.16 * inch, w, 0.16 * inch, stroke=0, fill=1)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(SOFT)
        canvas.drawString(0.9 * inch, 0.6 * inch, "PAINBEACON.COM")
        canvas.drawRightString(w - 0.9 * inch, 0.6 * inch, "Page %d" % d.page)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(0.9 * inch, 0.78 * inch, w - 0.9 * inch, 0.78 * inch)
        canvas.restoreState()

    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=deco)])
    W = doc.width
    P = lambda t, s="body": Paragraph(t, st[s])
    F = []

    hd = data["headline"]
    fl = data["filtered"]
    states = ", ".join(data.get("states") or []) or "national"

    F.append(P("SPONSOR REPORT", "kicker"))
    F.append(P(data["name"], "h1"))
    F.append(P(f"PainBeacon &middot; {states} &middot; {data['since']} to {data['until']}<br/>"
               f"Prepared by Rich Shea &middot; {data['prepared']}", "meta"))
    F.append(Spacer(1, 10))

    stats = [[Paragraph(f"{hd['views']:,}", st["bignum"]),
              Paragraph(f"{hd['clicks']:,}", st["bignum"]),
              Paragraph("—" if hd["ctr"] is None else f"{hd['ctr']:.2f}%", st["bignum"]),
              Paragraph(f"{hd['days_with_views']} of {hd['days']}", st["bignum"])],
             [Paragraph("Card views", st["statlbl"]),
              Paragraph("Clicks to your site", st["statlbl"]),
              Paragraph("Click-through rate", st["statlbl"]),
              Paragraph("Days with views", st["statlbl"])]]
    t = Table(stats, colWidths=[W / 4.0] * 4)
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("LINEABOVE", (0, 0), (-1, 0), 0.8, TEAL_DEEP),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
    ]))
    F.append(t)
    F.append(Spacer(1, 12))

    g = data.get("growth") or {}
    gsc = g.get("source") == "search-console"
    # sponsor-report.mjs already trims the pre-launch months; all that is left
    # to drop is a current month that has not seen anything yet.
    months = [m for m in g.get("months", []) if m.get("value") or not m.get("partial")]
    if any(m["value"] for m in months):
        F.append(P("How the site is growing", "h2"))
        if g.get("changePct") is not None:
            what = ("in how often Google showed a PainBeacon page"
                    if gsc else "measured in searches run by visitors")
            F.append(P(f"<b>{'+' if g['changePct'] >= 0 else ''}{g['changePct']}%</b> "
                       f"from {month_label(g['first']['month'])} to {month_label(g['last']['month'])}, "
                       f"{what}."))
            F.append(Spacer(1, 5))
        F.append(BarRow(months, W,
                        value_head="Shown in Google" if gsc else "Searches",
                        clicks_head="Clicked through" if gsc else ""))
        F.append(Spacer(1, 4))
        if gsc:
            F.append(P("These are Google's own counts, from Search Console for "
                       f"{g.get('property') or 'this site'}. An impression is one time Google "
                       "showed a PainBeacon page to someone reading a results page; a click is "
                       "one time that person came. We report these instead of page views because "
                       "on a directory of 12,000 pages most raw page requests are crawlers rather "
                       "than readers &mdash; and because you can hold us to a number we did not "
                       "count ourselves. Google settles each day about two days late, so figures "
                       f"run through {g.get('through') or 'the last settled day'}; an asterisk "
                       "marks a month still in progress, which is left out of the percentage "
                       "above.", "small"))
        else:
            F.append(P("A search is one person typing a ZIP code or city into the site and "
                       "submitting it. We report these instead of page views on purpose: the "
                       "search is recorded by JavaScript in the visitor's browser, so automated "
                       "traffic cannot produce one, and on a directory of 12,000 pages most raw "
                       "page requests are crawlers rather than readers. An asterisk marks a month "
                       "still in progress; it is left out of the percentage above.", "small"))
        F.append(Spacer(1, 8))

    F.append(P("What was excluded, and why", "h2"))
    rows = [[P("Raw events recorded", "td"), P(f"{fl['raw']:,}", "tdr")],
            [P("Automated requests not counted", "td"), P(f"{fl['automated']:,}", "tdr")],
            [P("Clicks we could not attribute to a page", "td"), P(f"{fl['unattributed']:,}", "tdr")],
            [P("Counted as genuine", "td"), P(f"{hd['views'] + hd['clicks']:,}", "tdr")]]
    t = Table(rows, colWidths=[W * 0.68, W * 0.32])
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEABOVE", (0, 0), (-1, 0), 0.8, TEAL_DEEP),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
        ("LINEBELOW", (0, -1), (-1, -1), 0.8, TEAL_DEEP),
        ("BACKGROUND", (0, -1), (-1, -1), TINT),
    ]))
    F.append(t)
    if fl.get("legacy"):
        F.append(Spacer(1, 5))
        F.append(P(f"{fl['legacy']:,} of these events predate the counter fix of 22 September and "
                   "carry no automation verdict. For those a click counts only when it arrived "
                   "from one of our own pages, which is the stricter test — so this window "
                   "understates rather than overstates.", "small"))

    if data.get("by_kind"):
        F.append(P("Where your card was seen", "h2"))
        rows = [[P("Page type", "th"), P("Views", "th"), P("Clicks", "th")]]
        for k in sorted(data["by_kind"], key=lambda r: -r["views"]):
            rows.append([P(k["kind"], "td"), P(f"{k['views']:,}", "tdr"), P(f"{k['clicks']:,}", "tdr")])
        t = Table(rows, colWidths=[W * 0.52, W * 0.24, W * 0.24])
        t.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
            ("LINEBELOW", (0, 0), (-1, 0), 0.6, TEAL_DEEP),
            ("LINEBELOW", (0, 1), (-1, -2), 0.4, LINE),
        ]))
        F.append(t)

    F.append(PageBreak())
    F.append(P("SPONSOR REPORT", "kicker"))
    F.append(P("The detail", "h1"))
    F.append(Spacer(1, 8))

    clicks = data.get("clicks_detail") or []
    if clicks and len(clicks) <= 40:
        F.append(P("Every click", "h2"))
        F.append(P("Small enough to list in full, which is the point of reporting it honestly.", "small"))
        F.append(Spacer(1, 4))
        rows = [[P("Date", "th"), P("Page the reader was on", "th")]]
        for c in clicks:
            rows.append([P(c["date"], "td"), P(c["path"] or "—", "td")])
        t = Table(rows, colWidths=[W * 0.22, W * 0.78])
        t.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
            ("LINEBELOW", (0, 0), (-1, 0), 0.6, TEAL_DEEP),
            ("LINEBELOW", (0, 1), (-1, -2), 0.4, LINE),
        ]))
        F.append(t)

    days = [d for d in (data.get("by_day") or []) if d["views"] or d["clicks"]]
    if days:
        F.append(P("Day by day", "h2"))
        cols, per = 3, (len(days) + 2) // 3
        chunks = [days[i * per:(i + 1) * per] for i in range(cols)]
        header, body = [], []
        for ch in chunks:
            header += [P("Day", "th"), P("V", "th"), P("C", "th")]
        rows = [header]
        for i in range(per):
            row = []
            for ch in chunks:
                if i < len(ch):
                    row += [P(ch[i]["date"][5:], "td"), P(str(ch[i]["views"]), "tdr"),
                            P(str(ch[i]["clicks"]), "tdr")]
                else:
                    row += [P("", "td"), P("", "td"), P("", "td")]
            rows.append(row)
        cw = []
        for _ in range(cols):
            cw += [W / cols * 0.46, W / cols * 0.27, W / cols * 0.27]
        t = Table(rows, colWidths=cw)
        t.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ("LINEBELOW", (0, 0), (-1, 0), 0.6, TEAL_DEEP),
        ]))
        F.append(t)

    F.append(P("How this is measured", "h2"))
    host = ""
    if data.get("url"):
        host = data["url"].split("//")[-1].split("/")[0].replace("www.", "")
    F.append(P("A view is one display of your card in a browser that loads images. A click is one "
               "follow of the card's link, counted on our own servers and forwarded to "
               f"{host or 'your site'} tagged <b>utm_source=painbeacon</b>, so the same visits "
               "appear in your analytics under Acquisition &rarr; Campaigns. We store no IP "
               "address, device identifier or cookie for any of it, and run no advertising "
               "scripts. Your card is labeled &ldquo;Advertisement&rdquo; everywhere it appears "
               "and sits outside the ranked clinic list; sponsorship never affects how clinics "
               "are ranked.", "small"))
    F.append(Spacer(1, 10))
    F.append(P("Rich Shea &middot; PainBeacon &middot; (703) 930-1655 &middot; richshea@painbeacon.com", "small"))

    doc.build(F)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("json", help="output of sponsor-report.mjs --json")
    ap.add_argument("--out", help="PDF path (default: alongside the JSON)")
    a = ap.parse_args()
    with open(a.json, encoding="utf-8") as f:
        data = json.load(f)
    out = a.out or os.path.splitext(a.json)[0] + ".pdf"
    print("wrote", build(data, out))


if __name__ == "__main__":
    main()
