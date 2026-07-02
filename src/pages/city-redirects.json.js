// Build-time redirect map: old city URLs -> new zone URLs.
//
// Before the zone migration, pages lived at /pain-clinics/[state]/[city]/.
// Those URLs are still in Google's index and in old backlinks, and currently
// 404. This endpoint emits /city-redirects.json at build time, mapping each
// old city path to the zone page that now covers that city. The Pages
// middleware at functions/pain-clinics/_middleware.js reads this file and
// issues the actual 301s.
//
// Built INSIDE the Astro build (not a standalone script) on purpose: the zone
// URL segment is derived in data.js (slugified label, de-duplicated per state
// with -2/-3 suffixes), so generating the map with the same getClinics() call
// guarantees redirect targets always match the pages actually being built.

import { getClinics } from '../lib/data.js';

export async function GET() {
  const clinics = await getClinics();

  // Every live zone page, keyed "state/segment". If an old city slug matches
  // a live zone segment (common — zones are named after anchor cities), that
  // URL already resolves and must NOT be redirected.
  const liveZonePages = new Set();
  for (const c of clinics) {
    if (c.zoneUrlSlug) liveZonePages.add(`${c.stateSlug}/${c.zoneUrlSlug}`);
  }

  // For each old city URL, tally which zone its clinics landed in and pick
  // the most common (alphabetical tie-break keeps builds deterministic).
  const tally = new Map(); // "state/cityslug" -> Map(zoneUrlSlug -> count)
  for (const c of clinics) {
    if (!c.zoneUrlSlug || !c.citySlug) continue;
    const key = `${c.stateSlug}/${c.citySlug}`;
    if (liveZonePages.has(key)) continue;
    let m = tally.get(key);
    if (!m) tally.set(key, (m = new Map()));
    m.set(c.zoneUrlSlug, (m.get(c.zoneUrlSlug) || 0) + 1);
  }

  const map = {};
  for (const [key, m] of tally) {
    map[key] = [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }

  return new Response(JSON.stringify(map), {
    headers: { 'Content-Type': 'application/json' },
  });
}
