// Build-time points file for the national clinic map at /map/. One row per
// PRIMARY clinic that has coordinates, as a compact array-of-arrays:
//
//   [lat, lng, "Clinic Name", "clinic-slug", "City, ST", "02906"]
//
// Kept deliberately lean — this file is fetched by the map page for every
// visitor, and at directory scale the field names would outweigh the data.
// Coordinates are rounded to 5 decimal places (~1 m), the ZIP is included so
// the map's search box can match a typed ZIP without a geocoding service.
//
// Built inside the Astro build (same getClinics() call as the pages) so the
// slugs here always match the clinic pages actually being generated.

import { getClinics, titleCase } from '../lib/data.js';

const round5 = (n) => Math.round(n * 1e5) / 1e5;

export async function GET() {
  const clinics = await getClinics();

  const rows = clinics
    .filter(
      (c) =>
        c.isPrimary &&
        c.latitude != null &&
        c.longitude != null &&
        // Guard against the 0,0 "null island" sentinel some geocoders emit.
        (Number(c.latitude) !== 0 || Number(c.longitude) !== 0)
    )
    .map((c) => [
      round5(Number(c.latitude)),
      round5(Number(c.longitude)),
      titleCase(c.name),
      c.slug || '',
      `${c.cityLabel}, ${c.state}`,
      ((c.postal_code || '').match(/\d{5}/) || [''])[0],
    ])
    .filter((r) => Number.isFinite(r[0]) && Number.isFinite(r[1]));

  return new Response(JSON.stringify(rows), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Static host will layer its own caching; this is the sane default.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
