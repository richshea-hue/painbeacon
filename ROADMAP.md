# PainBeacon Roadmap

Product direction for the site layer. Data-pipeline work (geocoding, NPPES sync,
outreach) is tracked in the workflow files and scripts; this file is about what
visitors see and how the site earns.

## Next: make the map the front door for search

The national map at `/map/` already supports `?q=` deep links, clustering, and
on-map search over clinic names, cities, states, and ZIPs. Build on it:

1. ✅ *(shipped)* **Home search routes to the map.** The hero search box on `/` keeps its
   suggestion dropdown, but submitting (or choosing a suggestion) lands on
   `/map/?q=<query>` instead of a zone page, so every search starts with
   geographic context. Zone pages stay as the SEO landing pages; the map
   becomes the interactive experience. (Research note: Zillow measured up to an
   8% lift in inquiries after pairing search results with a map — geographic
   context drives contact.)

2. ✅ *(shipped)* **Results list under the map.** Below the map viewport, render the
   top-ranked clinics for the current search/viewport as ClinicCard-style rows
   (the zone pages' card, reused). The list re-populates as the map moves
   ("results update as you explore"); clicking a pin highlights its card and
   vice versa. Needs `/map-clinics.json` to carry each clinic's rank score and
   listing tier so the client can order the list without another request.

3. ✅ *(shipped)* **Sort and filter toggles.** Above the list: sort by *best match* (the
   site's independent ranking — default) or *distance* (from the searched
   point or the visitor's geolocation); filters for *verified profiles* and
   *open now* (hours are already published for matched clinics). Keep the
   toggle row to 3–4 controls — every control beyond that costs mobile users.

4. ✅ *(shipped)* **Sponsored slot in the list, never on the map.** If a zone's Featured
   clinic falls inside the current view, it may occupy one clearly-labeled
   "Sponsored" card above the results list — same exclusivity and labeling
   rules as zone pages. Pins and clusters stay strictly rank-neutral so the
   map itself remains trustworthy.

## Next: homepage below the hero

Today the hero jumps straight to the full "Browse by state" tile wall.
Directory/marketplace best practice is a value-demonstration ladder between the
hero and the long tail. Proposed order:

1. **Map invitation.** A wide, non-interactive snapshot of the national map
   (pre-rendered image, so the homepage stays light — no Leaflet) captioned
   with the live clinic count, linking to `/map/`. Shows the whole offer in
   one glance and feeds the highest-engagement surface.
2. **Top areas.** 8–12 tiles for the largest metros/zones by clinic count —
   what most visitors actually want — with a "All states →" link to
   `/pain-clinics/`. The full state wall moves behind that link (or collapses
   below the fold).
3. **Trust band.** One row: how rankings work, no pay-to-rank, federal-data
   provenance — the site's differentiator, currently buried in the footer area.
4. **Research & guides.** The Pain Care Deserts card plus the two most recent
   articles. Fresh, linkable content signals the site is alive and earns
   press/backlinks; research is also the strongest brand asset.
5. **For practices / sponsor band.** A single clearly-labeled slot: "Featured
   clinic" (when sold) or the claim-your-profile pitch (when not), pointing to
   `/for-practices/` and the paid tiers. Revenue capture lives here — visible
   on every homepage visit but below the patient-first content, and always
   labeled as sponsored so it never contaminates the independent-ranking
   promise (also an FTC disclosure requirement).

Rationale for this order: patient value first (map, areas), credibility second
(trust, research), monetization third — a homepage that sells too early
undercuts the "independent" positioning that makes the directory worth
sponsoring at all. Revisit the order with analytics once the map ships: if map
clicks dominate, promote the map to a live embed; if sponsor inventory sells
out, test a second placement on zone pages rather than adding homepage slots.

## Later

- **Geocode the backlog with review.** ~3,000 clinics (including all of Guam)
  have no coordinates and appear on no map. The automated backfill is gated
  for data-quality reasons; a reviewed, manually-dispatched run per state or
  territory would let the map fill in. Guam is the visible gap today.
  Billing is guarded: both geocode jobs share a monthly ledger
  (`google_api_usage` in Supabase, created by `google_usage_table.sql`) and
  refuse to exceed their SKU's monthly budget no matter how many runs are
  dispatched — so the backlog can be worked in safe monthly slices without
  ever crossing into paid Google usage.
- **"Near me" landing page.** `/near-me/` that geolocates and redirects into
  the map with the visitor's area pre-searched — a high-intent SEO term.
- **Map social cards.** Per-state OG images cropped from the national map for
  state hub pages, matching the deserts-card pipeline.

## Gated on first revenue

Nothing here starts until a paid listing or sponsorship actually lands. The
whole set is blocked behind one $5/mo bill, and the first Enhanced sale covers
ten months of it — so the gate is "we have a customer", not a date.

- **Pain care desert county pages.** `/care-deserts/[state]/[county]` for the
  counties with no clinic in the directory: the nearest verified interventional
  clinics in neighboring counties, with real driving distance, plus the
  county's population and its state's desert rate. Competitors return nothing
  for these searches — Zocdoc shows tele-mental-health or an empty page — and
  the analysis behind it is already published at `/research/pain-care-deserts`.

  **Blocked on the file cap, not on the work.** Cloudflare Pages' free tier
  allows 20,000 files per deployment and the site is already at ~15-16k (the
  same limit that switched off the condition/procedure pages — see
  `MIN_CLINICS_FOR_TOPIC_PAGE` in `src/lib/topics.js`). ~1,900 desert pages fit
  in the remaining headroom but consume nearly all of it, and would foreclose
  ever re-enabling topic pages. The $5/mo Workers Paid plan lifts the cap to
  100,000 and removes the question permanently.

  What the scoping found, so it does not have to be redone:

  - **Data is all in hand but one field.** 3,144 counties with name, state and
    population (`src/data/county_data.json`), clinic counts per county via the
    33,642-entry ZIP->FIPS map, county outlines (`county_geo.json`), and
    lat/lng on every mapped clinic. Missing: a lat/lng centroid per county, to
    compute mileage. `scripts/build_county_geo.mjs` already pulls raw
    lat/lng geometry from TIGER before projecting it, so emitting a centroid
    beside each path is a few lines in a script that exists — no new data
    source and no new dependency. It has to run on the computer; TIGER is
    outside the cloud egress allowlist, as is Supabase, so the desert list and
    its distances cannot be computed from a cloud session at all.
  - **The centroid is geographic, not population-weighted** (no sub-county
    population data), so the page has to say distances are measured from the
    county's geographic center rather than implying they are from anywhere a
    person lives.
  - **Say what the data supports.** The claim is "no clinic in this directory
    is located in this county", never "this county has no pain specialist".
    The records are NPI-derived and a practice can be missing for reasons
    other than absence. A negative claim about medical access is the one a
    competitor would screenshot.
  - **Gate which counties get a page.** Not all ~1,900. The median US county
    holds 26,138 people and deserts skew small and rural; a page for a
    400-person county whose nearest clinic is 180 miles away is thin content
    that helps nobody. A population floor plus a distance ceiling, tuned
    against the real desert list once it can be computed. For reference, 77%
    of all counties clear 10,000 people and 52% clear 25,000.
  - **Discovery is explicit here.** `src/pages/sitemap.xml.js` is a hand-built
    allow-list, not an auto-include, so new pages are only submitted when
    added deliberately. Link them from `/research/pain-care-deserts` and the
    state hubs.

- **Condition and procedure pages.** Blocked on data, not on budget, and the
  file cap is the lesser problem. `src/lib/ranking.js` scores interventional
  capability off a single NPI taxonomy code (`208VP0014X`); NPI taxonomy is
  specialty-level, so it says a clinic is an interventional pain practice and
  never which procedures it performs. Publishing
  `/procedures/spinal-cord-stimulation/houston-tx` would assert a medical fact
  about named clinics that no held data supports. Insurance faceting has the
  same hole: the NPI registry carries no plan acceptance. Both stay off until
  there is a real source, as the comment at the top of `ranking.js` already
  says.
