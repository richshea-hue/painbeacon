// The homepage's map snapshot: state outlines plus one dot per clinic
// location, emitted as a static SVG at build time. This is what invites
// visitors into /map/ without the homepage paying for Leaflet, tiles, or the
// full points file — it's a single cacheable image built from the same clinic
// data as everything else.
//
// State geometry is reused from src/data/county_geo.json (already committed
// for the deserts choropleth); clinic coordinates are projected onto the same
// Albers USA frame by src/lib/albersUsa.js. Dots are deduplicated onto a
// 2-unit grid — at this size a metro reads as a glow of dots either way, and
// the dedup keeps the file small at directory scale.

import geo from '../data/county_geo.json';
import { getClinics } from '../lib/data.js';
import { projectPoint, VIEW_BOX } from '../lib/albersUsa.js';

export async function GET() {
  const clinics = await getClinics();

  const cells = new Set();
  for (const c of clinics) {
    if (!c.isPrimary || c.latitude == null || c.longitude == null) continue;
    const lat = Number(c.latitude);
    const lon = Number(c.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    const p = projectPoint(lon, lat, c.state);
    if (!p) continue;
    cells.add(`${Math.round(p[0] / 2) * 2},${Math.round(p[1] / 2) * 2}`);
  }

  // One compact path per dot ("M x y h0") drawn with round line caps — a
  // third the bytes of a <circle> each.
  const dots = [...cells].map((k) => `M${k.replace(',', ' ')}h0`).join('');

  const states = Object.values(geo.stateBorders)
    .map((d) => `<path d="${d}"/>`)
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" role="img" ` +
    `aria-label="Map of the United States with a dot at every pain clinic location">` +
    `<g fill="#ece7db" stroke="#f7f4ed" stroke-width="1" stroke-linejoin="round">${states}</g>` +
    `<path d="${dots}" fill="none" stroke="#17a08c" stroke-width="3.2" ` +
    `stroke-linecap="round" opacity="0.82"/>` +
    `</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
