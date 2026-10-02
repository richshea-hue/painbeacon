#!/usr/bin/env python3
"""
match_ai_citations.py — an alternative step 1 for the outreach pipeline.

build_targets.py picks a market and sorts by review count. This picks the
clinics that AI assistants ALREADY cite us for, which is a warmer list: the
pitch writes itself, the recipient can verify it in ten seconds, and it is
flattering rather than a favour-ask.

Input is the "Download all" export from Bing Webmaster Tools →
AI Performance → Grounding Queries. Those queries split into two kinds:

  category   "pain specialist", "interventional pain specialists"
             — we are being used as a directory. No clinic to contact.
  branded    "mahajan spine and joint", "spine and pain physicians of wny"
             — someone asked about ONE practice and we were cited. That
               practice is the target.

Telling them apart is the whole job, and the signal is rarity: a branded
query contains at least one token that almost no other clinic name uses
("mahajan", "wny", "augusta"), while a category query is built entirely from
tokens thousands of clinics share ("pain", "management", "specialist"). So we
score on inverse document frequency over the directory's own names rather
than on a hand-written keyword list, which would need maintaining forever and
would still miss the next surname.

Output is a targets CSV in exactly build_targets.py's shape plus four
ai_* columns, so it flows straight into the rest of the pipeline:

    python scripts/outreach/match_ai_citations.py --queries bing.csv \
        --out scripts/outreach/out/targets-ai.csv
    python scripts/outreach/discover_emails.py --in ... --out ...
    python scripts/outreach/make_drafts.py --in ... --variant ai-cited ...

Env: SUPABASE_URL + SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY), read
from the repo's .env automatically — same as every other script here. Pass
--clinics-csv to match against a local CSV instead and skip Supabase, which
is how the tests run and how you can try this before wiring credentials.
"""

import argparse
import csv
import math
import os
import re
import sys
from collections import Counter, defaultdict

from _env import load_env  # noqa: F401  (loads .env on import, as elsewhere)

SITE_URL = "https://painbeacon.com"

# Dropped from both sides: they carry no identity. Legal suffixes and
# honorifics appear in thousands of names and in no real query.
NOISE = {
    "llc", "pllc", "pc", "pa", "inc", "ltd", "corp", "co", "the", "of", "and",
    "a", "an", "at", "for", "md", "do", "dr", "drs", "phd", "dpm", "facs",
}

# A query containing any of these is asking for a CATEGORY, whatever else is
# in it. "best pain doctors near me in augusta" names a city, not a practice,
# and mailing the Augusta clinic about it would be a lie. Years count too:
# "best pain management clinics 2025" is a listicle query.
INTENT_MARKERS = {
    "best", "top", "near", "nearby", "me", "cheapest", "cheap", "affordable",
    "how", "what", "why", "when", "where", "which", "who", "vs", "versus",
    "compare", "comparison", "reviews", "rating", "ratings", "cost", "costs",
    "price", "prices", "list", "directory", "find", "finding", "guide",
    "should", "does", "do", "is", "are", "can",
}
YEAR = re.compile(r"^(19|20)\d{2}$")


def tokens(s):
    """Lowercase alphanumeric tokens, minus noise and single characters."""
    raw = re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).split()
    return [t for t in raw if len(t) > 1 and t not in NOISE]


def is_category_query(toks):
    return any(t in INTENT_MARKERS or YEAR.match(t) for t in toks)


def load_clinics_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def load_clinics_supabase():
    # Imported lazily so --clinics-csv needs neither requests nor credentials.
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from build_targets import fetch_all
    return fetch_all()


def pick_column(fieldnames, *candidates):
    """Bing renames these columns between releases; match case-insensitively
    on a few known spellings rather than hard-coding one."""
    lowered = {(f or "").strip().lower(): f for f in fieldnames}
    for c in candidates:
        if c in lowered:
            return lowered[c]
    for key, original in lowered.items():
        if any(c in key for c in candidates):
            return original
    return None


def read_queries(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit(f"[fatal] no rows in {path}")
    fn = rows[0].keys()
    qcol = pick_column(fn, "grounding query", "query", "keyword")
    ccol = pick_column(fn, "citations", "citation count", "count")
    scol = pick_column(fn, "citation share", "share")
    if not qcol:
        raise SystemExit(
            f"[fatal] no query column in {path}. Columns found: {', '.join(fn)}")
    print(f"[cols] query={qcol!r} citations={ccol!r} share={scol!r}")
    out = []
    for r in rows:
        q = (r.get(qcol) or "").strip().rstrip("….")  # strip UI ellipsis
        if q:
            out.append({"query": q,
                        "citations": (r.get(ccol) or "").strip() if ccol else "",
                        "share": (r.get(scol) or "").strip() if scol else ""})
    return out


def build_index(clinics):
    """Token -> set of clinic indexes, for document frequency."""
    postings = defaultdict(set)
    toks_by_clinic = []
    for i, c in enumerate(clinics):
        t = set(tokens(c.get("name")))
        toks_by_clinic.append(t)
        for tok in t:
            postings[tok].add(i)
    return postings, toks_by_clinic


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--queries", required=True,
                    help="Bing Webmaster AI Performance 'Download all' CSV")
    ap.add_argument("--out", default="scripts/outreach/out/targets-ai.csv")
    ap.add_argument("--clinics-csv",
                    help="Match against a local clinics CSV instead of Supabase")
    ap.add_argument("--rare-df", type=float, default=0.002,
                    help="A token is distinctive if it appears in at most this "
                         "fraction of clinic names (default 0.002)")
    ap.add_argument("--min-score", type=float, default=0.5,
                    help="Share of the query's information the clinic name must "
                         "account for (default 0.5)")
    ap.add_argument("--max-per-query", type=int, default=1,
                    help="Clinics written per branded query (default 1). The "
                         "runners-up are printed either way; raise this only if "
                         "you mean to mail several locations of one practice.")
    args = ap.parse_args()

    clinics = (load_clinics_csv(args.clinics_csv) if args.clinics_csv
               else load_clinics_supabase())
    n = len(clinics)
    if not n:
        raise SystemExit("[fatal] no clinics loaded")
    postings, toks_by_clinic = build_index(clinics)
    rare_max = max(2, int(args.rare_df * n))
    print(f"[index] {n} clinics, {len(postings)} distinct name tokens; "
          f"a token is distinctive at <= {rare_max} names")

    def idf(tok):
        df = len(postings.get(tok, ()))
        return math.log(n / df) if df else math.log(n)

    queries = read_queries(args.queries)
    rows, category, unmatched, runners_up = [], [], [], []

    for q in queries:
        qt = tokens(q["query"])
        if not qt:
            continue
        if is_category_query(qt):
            category.append((q, "intent words"))
            continue
        distinctive = [t for t in qt if 0 < len(postings.get(t, ())) <= rare_max]
        if not distinctive:
            category.append((q, "no distinctive token"))
            continue

        total = sum(idf(t) for t in qt) or 1.0
        scored = []
        for i in set().union(*(postings[t] for t in distinctive)):
            shared = set(qt) & toks_by_clinic[i]
            if not shared:
                continue
            score = sum(idf(t) for t in shared) / total
            if score >= args.min_score:
                scored.append((score, i, sorted(shared & set(distinctive))))
        if not scored:
            unmatched.append(q)
            continue
        scored.sort(key=lambda x: (-x[0], clinics[x[1]].get("name") or ""))
        for score, i, _ in scored[args.max_per_query:]:
            runners_up.append((q["query"], clinics[i].get("name") or "", score))
        for rank, (score, i, on) in enumerate(scored[:args.max_per_query], 1):
            c = clinics[i]
            profile = f"{SITE_URL}/clinic/{c['slug']}/"
            rows.append({
                "zone_slug": c.get("zone_slug") or "", "zone_name": c.get("zone_name") or "",
                "state": c.get("state") or "", "npi": c.get("npi") or "",
                "slug": c.get("slug") or "", "name": c.get("name") or "",
                "city": c.get("city") or "", "phone": c.get("phone") or "",
                "website": (c.get("website") or "").strip(),
                "rating": c.get("aggregate_rating") or c.get("rating") or "",
                "review_count": c.get("review_count") or "",
                "listing_tier": c.get("listing_tier") or "free",
                "profile_url": profile, "claim_url": f"{profile}?claim=1",
                "ai_query": q["query"], "ai_citations": q["citations"],
                "ai_citation_share": q["share"],
                "ai_match_score": f"{score:.2f}",
                "ai_matched_on": " ".join(on),
                "ai_match_rank": rank,
            })

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    fields = list(rows[0].keys()) if rows else [
        "zone_slug", "zone_name", "state", "npi", "slug", "name", "city",
        "phone", "website", "rating", "review_count", "listing_tier",
        "profile_url", "claim_url", "ai_query", "ai_citations",
        "ai_citation_share", "ai_match_score", "ai_matched_on", "ai_match_rank"]
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

    branded = len({r["ai_query"] for r in rows})
    print(f"\n[done] {len(queries)} queries -> {branded} branded, "
          f"{len(category)} category, {len(unmatched)} branded-looking but unmatched")
    print(f"[done] wrote {len(rows)} clinic rows -> {args.out}")
    if category:
        print("\nCategory queries (no clinic to contact):")
        for q, why in category:
            print(f"  {q['query'][:58]:<58} {q['citations']:>5}  ({why})")
    if unmatched:
        print("\nLooked branded but matched no clinic — worth a manual look, "
              "a practice we may not list:")
        for q in unmatched:
            print(f"  {q['query'][:58]:<58} {q['citations']:>5}")
    if runners_up:
        print("\nAlso matched, NOT written (a lower-scoring name sharing the "
              "same rare word). Check that the written one is the right "
              "practice before mailing:")
        for query, name, score in runners_up:
            print(f"  {query[:40]:<40} -> {name[:34]:<34} {score:.2f}")


if __name__ == "__main__":
    main()
