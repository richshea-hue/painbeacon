# PainBeacon — Astro site layer

The patient-facing directory. Static-generated from the `clinics_public` view, so
it renders thousands of programmatic pages with no server and physically cannot
read the internal deal-flow columns.

## Run

```bash
npm install
npm run dev        # http://localhost:4321  — builds from the fictional sample
npm run build      # -> dist/  (static, deploy anywhere)
```

With no env vars it builds from `src/data/sample.json` (8 clearly-fictional RI
clinics) so you can see it immediately. To build from real data:

```bash
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_ANON_KEY=<anon key>      # anon is fine — it can only read the public VIEW
npm run build
```

Deploy `dist/` to Cloudflare Pages or Vercel (build command `npm run build`,
output dir `dist`). Set the same env vars in the host's build settings.

### American English is enforced by the build

`scripts/us-english.mjs` runs before `astro build`. A British spelling fails the
build rather than shipping — this is a US site for US readers on US federal
data, and the spellings had drifted far enough to reach page copy — the map
told people a ZIP was not recognised. <!-- us-english-ok -->

```bash
npm run lint:spelling   # scan
npm run fix:spelling    # rewrite in place
```

It matches **whole words from an explicit list**, never a prefix rule: the
obvious `/\bcharacteris/ → characteriz` turns "characteristics" into
"characteriztics". Words correct in both dialects (advertise, exercise,
supervise, analysis, and *analyses* as the plural noun — as in the research
index's "Original analyses of…") are absent from the list by construction.

**Escape hatch: `us-english-ok` in a comment on that line**, per line. It exists
for real data: `restore_obvious_matches.py`'s `STOP` set deliberately keeps the
British spelling of "center" because clinics spell their names that way, and
the first pass of this gate quietly collapsed it into a duplicate — a silent
loss of matching coverage. Anything that is a *value* rather than prose
deserves that scrutiny before you accept a fix.

The same file lives in the `primary-source` repo. Keep the two identical.

### A ZIP is a location, not a filter

Three-digit ZIP prefixes are administrative, not spatial. **123 real Census
prefixes hold no clinic at all** — thousands of ZIPs across Minnesota, Iowa,
Montana, Missouri, Nebraska and Maine — so any code path that decides *whether
to answer* by looking up a prefix will dead-end on real people in real towns.

The rule: a prefix chooses **which** answer, never **whether** to answer.

- **`index.astro`** sends every full ZIP to the map. The `zip3-zones.json`
  lookup only decides whether the `?zip=` deep link (ads, email) prefers the
  zone page. It used to gate navigation entirely, so a searcher in Willmar MN
  got "we don't list clinics for that ZIP yet" while the map could have located
  them and ranked every clinic by real distance.
- **`map.astro`** falls back to `goNearestToZip()`, which geocodes the ZIP from
  the Census centroids and ranks by haversine. The typed-suggestion path always
  did this; the `?q=` deep-link branch was left behind when it was added, so
  `/map/?q=56201` answered "No clinics on the map near 56201" and then listed
  Brandon FL at 1,181 miles.

**Locating a ZIP switches the list to distance order** and moves the sort
toggle with it, so the control never disagrees with the ordering. Without it the
status line read "nearest is 45 miles away" while the first card said 103 —
both true, because the cards were in best-match order, and confusing precisely
because the two numbers sat next to each other. It is a default, not a lock;
"Best match" stays one click away.

**`fitBounds` and `setView` are followed by an explicit `updateList()`.** Leaflet
fires no `moveend` when the view it is asked for is the view it is already on,
and the list then keeps a render made before the anchor existed — every row
saying "from map center" under a status line naming a ZIP. The move event is an
optimization, not a guarantee. This was found by logging `updateList` calls and
seeing exactly one, at init.

**Distances are measured from the searched ZIP** (`distAnchor`), not the map
center. Fitting the map to a Minnesota ZIP and a Rhode Island clinic puts the
center halfway between them, so the status line said "nearest is 1,200 miles
away" while every row said "611 mi from map center" — both true, and the
smaller number is the one a reader takes as the drive. The anchor is released
when the reader touches the map surface, but **not** when they use the zoom
control (which lives inside the Leaflet container, so a naive `pointerdown`
listener catches it — that bug was caught by watching the label flip on a plain
zoom-out).

City search already routed to the map on both paths and needed no change.

### Clinic website links (Safe Browsing)

Outbound links to clinics' own websites (verified profiles + `sameAs` in the
JSON-LD) only appear for URLs that pass a Google Safe Browsing check at build
time — see `src/lib/safebrowsing.js`. Set this in the build env to enable:

```bash
export GOOGLE_SAFE_BROWSING_API_KEY=<key>   # Cloud Console → enable "Safe Browsing API" → API key
```

Without the key the build still succeeds; no clinic URL is validated, so no
clinic URL is linked (domains from the federal data are sometimes expired and
re-registered as malware — that once got the site flagged, hence fail-safe).
For local dev with the fictional sample you can set
`SAFE_BROWSING_ASSUME_SAFE=1` to preview the verified-link UI — never in
production.

### Article photos (Pexels / Unsplash)

`scripts/fetch-article-photo.mjs` finds a source photo the site has never
shipped before and downloads it for `prepare-article-images.mjs` to crop. It
takes its keys from `.env`, which is gitignored — copy `.env.example` and fill
it in:

```bash
cp .env.example .env                     # then paste the two keys
node --env-file=.env scripts/fetch-article-photo.mjs --contact "sciatica" 12
```

Either provider may be absent — the script says which one it is missing and
carries on with the other. Pexels is searched first; Unsplash is the backup
only when no Pexels query yields an unused, landscape, ≥1600px photo. Both are
deduped against `data/image-registry.json`, so a photo can never ship twice.

The keys belong in the local `.env` and in the environment of whatever runs the
weekly draft — not in the repo. Nothing in the build needs them: photo sourcing
happens when an article is written, and only the finished crops are committed.

### Brand sponsorships (the "Advertisement" unit)

A second paid product, separate from Featured clinic listings: a business that
is **not** a clinic (a law firm, a device maker) buys labeled placement in one
or more states. Everything lives in `data/sponsors.json`; `src/lib/sponsors.js`
matches a sponsor to a page by the page's STATE (or, on articles, by an explicit
article slug), and `src/components/SponsorCard.astro` renders it — below the
ranked list on zone pages, after the tiles on state hubs, after the profile on
clinic pages, after the byline on articles. No sponsor → nothing renders.

- Master switch `active`, plus an optional `starts`/`ends` window, so a signed
  deal can be committed early and expires without a deploy.
- `SPONSOR_PREVIEW=1` in the build env shows every entry regardless of `active`
  or dates. Set it on the Pages **Preview** environment only, so a branch
  preview can show a prospect their card on the real pages; production never
  sets it.
- Zero tracking scripts, no cookies. Two Pages Functions count events through
  the `log_sponsor_event` RPC (create it once with `sponsor_events_table.sql`;
  the functions read `SUPABASE_URL` / `SUPABASE_ANON_KEY` from the Pages env):
  - `/i/<id>/?p=<page>` (`functions/i/[id].js`) — a 1×1 GIF the card embeds,
    one request per render, logged as a `view`. No-store, so caching can't eat
    the count. Bots that fetch images are counted; the report says so.
  - `/go/<id>/?p=<page>` (`functions/go/[id].js`) — the card's links, logged as
    a `click`, then a 302 to the sponsor's URL with UTM tags (`utm_source=
    painbeacon`, `utm_medium=sponsor`, `utm_campaign=<id>`, `utm_content=<page>`)
    so the sponsor's own analytics attribute the visit. The destination comes
    from the JSON, never the query string.
  Both paths are disallowed in `robots.txt` like `/c/`. The privacy page's
  "Advertising" paragraph describes exactly this; keep the two in step.
- The sponsor's report: `node --env-file=.env scripts/sponsor-report.mjs
  --sponsor samakow-law [--since 2026-09-03 --until 2026-10-03] [--out report.md]`
  prints views, clicks, click-through rate, a daily table and the top pages.
  Needs `SUPABASE_SERVICE_ROLE_KEY` (the anon key cannot read the ledger).
- The card always carries the "Sponsors never influence rankings or editorial"
  line and `rel="sponsored nofollow"`. Amber top rule = brand sponsor; teal pill
  = Featured clinic. Keep the two distinguishable.

### Draft articles

`draft: true` in an article's front matter keeps it out of the build entirely —
page, feed, sitemap, homepage row — because every consumer goes through
`src/lib/articles.js`. `SHOW_DRAFTS=1 npx astro build` previews it.

### Google Preferred Sources

A reader who adds PainBeacon at `google.com/preferences/source?q=painbeacon.com`
gets a "Preferred" badge on our links inside AI Overviews and AI Mode, and
Google reports preferred sources are roughly twice as likely to be clicked. It
is a reader opt-in — it changes nothing about how the site is crawled, indexed
or ranked, and Google alone decides which domains appear in that tool.

The URL lives once in `SITE.preferredSourceUrl` (`src/lib/site.js`) and renders
in three places: the footer's Follow block (so every page carries it), a "Follow
us" row under the share buttons on each article, and beside the RSS link on The
Beacon index. Setting it to `''` removes all three.

Domain-level only — `painbeacon.com` is eligible, `painbeacon.com/news` is not.
Google also offers an interactive button that loads a script from
`news.google.com`; we use the plain link instead, so the site still ships no
third-party JavaScript beyond Google Fonts.

## Page structure (matches the brief)

| Route | Page |
|---|---|
| `/` | Home + client-side city search |
| `/pain-clinics/` | All states |
| `/pain-clinics/[state]/` | State hub → cities |
| `/pain-clinics/[state]/[city]/` | **Ranked clinic list** (the local-search workhorse) |
| `/clinic/[slug]/` | Clinic profile (the real content unit) |
| `/[topic]/[city]/` | Condition **or** procedure × city (one route handles both) |
| `/how-we-rank/` | Published ranking methodology |
| `/ownership-disclosure/` | Disclosure (neutral now, flips with the tripwire) |
| `/sitemap.xml` | Self-generated, covers every route |

## SEO / E-E-A-T built in

- `MedicalClinic` + `PostalAddress` + `GeoCoordinates` + `AggregateRating` JSON-LD
  on every profile; `BreadcrumbList` on every page; `WebSite` on the home page.
- Accurate NAP rendered from the data on every clinic.
- Named medical reviewer + last-reviewed date in the footer site-wide (set the
  real reviewer in `src/lib/site.js`).
- Canonical URLs, OG tags, descriptive titles per page.
- Internal linking flows state → city → clinic and city → condition/procedure.
- **No thin pages:** a condition/procedure × city page is only generated when the
  city has ≥ 2 clinics (`MIN_CLINICS_FOR_TOPIC_PAGE` in `src/lib/topics.js`).

## The ranking lives in one place

`src/lib/ranking.js` holds the weighted "best qualified" score. The weights shown
on `/how-we-rank/` are read from that same file, so the published methodology can
never drift from the actual ordering. Signals not yet in the data (insurance
breadth, procedure count) are documented as "expanding," not faked.

## Where to edit

- Brand, domain, reviewer, tripwire → `src/lib/site.js`
- Ranking weights → `src/lib/ranking.js`
- Conditions/procedures + their copy → `src/lib/topics.js`
- Design tokens → `src/styles/global.css`
- Data source / Supabase fetch → `src/lib/data.js`
