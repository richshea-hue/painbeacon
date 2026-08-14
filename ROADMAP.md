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

4. **Sponsored slot in the list, never on the map.** If a zone's Featured
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
- **"Near me" landing page.** `/near-me/` that geolocates and redirects into
  the map with the visitor's area pre-searched — a high-intent SEO term.
- **Map social cards.** Per-state OG images cropped from the national map for
  state hub pages, matching the deserts-card pipeline.
