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

## Page structure (matches the brief)

| Route | Page |
|---|---|
| `/` | Home + search by clinic name, city, or ZIP |
| `/pain-clinics/` | All states |
| `/pain-clinics/[state]/` | State hub → cities |
| `/pain-clinics/[state]/[city]/` | **Ranked clinic list** (the local-search workhorse) |
| `/clinic/[slug]/` | Clinic profile (the real content unit) |
| `/[topic]/[city]/` | Condition **or** procedure × city (one route handles both) |
| `/how-we-rank/` | Published ranking methodology |
| `/ownership-disclosure/` | Disclosure (neutral now, flips with the tripwire) |
| `/sitemap.xml` | Self-generated, covers every route |

## Search by clinic name (and the "add your clinic" path)

Cities and zones are searched against a build-time index embedded in the home
page. **Clinic names** are looked up live instead, because the full name index
would be far too large to ship: `window.pbSearchClinics(q)` (defined in
`src/components/LeadChat.astro`, which renders site-wide and already holds the
anon creds) queries the read-only `clinics_public` view over PostgREST and
returns primaries only. It resolves to `[]` whenever Supabase isn't configured —
so with the fictional sample, name search silently returns nothing.

Every text search ends with an **Add your clinic** row, and the chat widget has a
practice branch (`data-open-leadchat="practice"`) that searches by name, links
matches to `/clinic/<slug>/?claim=1`, and otherwise collects the practice.
Both the chat form and `/for-practices/#add` write to the existing `claims`
table with `interest = 'Add my clinic (not listed)'` and `npi`/`clinic_slug`
null — the location details go in `message`, so no schema change was needed.

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
