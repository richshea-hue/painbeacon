// Build-time pin index for the home-page clinic map: emits /clinic-points.json,
// one row per mappable PRIMARY practice.
//
// Rows are positional tuples, not objects — at ~12k clinics, field names would
// repeat 12,000 times and roughly double the file. The layout is mirrored by the
// R constant in ClinicFinderMap.astro; change one and you must change the other.
//
// Built INSIDE the Astro build (like zip3-zones.json) so the slugs it emits are
// guaranteed to match the /clinic/[slug]/ pages actually generated.

import { getClinics, titleCase } from '../lib/data.js';

// ~1m of precision. Full float coordinates cost ~8 more bytes per row for
// accuracy no map pin can show.
const round = (n) => Number(Number(n).toFixed(5));

export async function GET() {
  const clinics = await getClinics();

  const rows = clinics
    .filter((c) => {
      if (!c.isPrimary || !c.slug) return false;
      const lat = Number(c.latitude);
      const lng = Number(c.longitude);
      // Drop unplaced clinics and the 0,0 "null island" sentinel, matching
      // ClinicMap.astro. They stay in the directory, just not on the map.
      return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
    })
    // Deterministic order keeps rebuilds byte-stable.
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((c) => [
      c.slug,
      titleCase(c.name),
      c.cityLabel,
      c.state,
      round(c.latitude),
      round(c.longitude),
    ]);

  return new Response(JSON.stringify({ clinics: rows }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
