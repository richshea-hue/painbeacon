// Build-time points file for the national clinic map at /map/. One row per
// PRIMARY clinic that has coordinates, as a compact array-of-arrays:
//
//   [lat, lng, "Clinic Name", "clinic-slug", "City, ST", "02906",
//    score, tier, rating, reviews, "480-1020|480-1020|...|"]
//
//   score   0-100 rank from src/lib/ranking.js, rounded — lets the map's
//           results list order itself with no second request
//   tier    0 = none, 1 = verified/enhanced (shows the Verified badge),
//           2 = featured (badge + sponsored-slot eligibility)
//   rating  aggregate rating (0 when unrated), reviews review count
//   hours   7 '|'-separated Mon..Sun parts, each "openMin-closeMin" or empty;
//           "" when the clinic has no published hours
//
// Kept deliberately lean — this file is fetched by the map page for every
// visitor, and at directory scale the field names would outweigh the data.
// Coordinates are rounded to 5 decimal places (~1 m), the ZIP is included so
// the map's search box can match a typed ZIP without a geocoding service.
//
// Built inside the Astro build (same getClinics() call as the pages) so the
// slugs here always match the clinic pages actually being generated.

import { getClinics, titleCase } from '../lib/data.js';
import { scoreClinic } from '../lib/ranking.js';

const round5 = (n) => Math.round(n * 1e5) / 1e5;

// Normalize a raw postal value to a 5-digit ZIP. Handles ZIP+4 and the
// dropped-leading-zero case (a common New England artifact of ZIPs stored as
// numbers: "2906" -> "02906", "29061234" -> "02906") — same rule as the zip3()
// helper behind /zip3-zones.json. A naive \d{5} grab gets both cases wrong,
// which broke ZIP search on the map for every clinic with such a ZIP.
const zip5 = (raw) => {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 4 || d.length === 8) d = '0' + d;
  return d.length >= 5 ? d.slice(0, 5) : '';
};

// Parse the published hours string ("Monday: 8:00 AM – 5:00 PM; ...;
// Sunday: Closed") into the compact Mon..Sun minute-range encoding above.
// Unparseable or absent hours become "" — the "Open now" filter simply
// leaves those clinics visible-but-unmatched rather than guessing.
const DAY_IDX = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
};
const TIME_RE = /(\d{1,2}):(\d{2})\s*([AP]M)\s*[–—-]\s*(\d{1,2}):(\d{2})\s*([AP]M)/i;
const toMin = (h, m, ap) => ((Number(h) % 12) + (/pm/i.test(ap) ? 12 : 0)) * 60 + Number(m);

function encodeHours(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const parts = ['', '', '', '', '', '', ''];
  let any = false;
  for (const seg of raw.split(';')) {
    const [day, rest] = seg.split(/:(.+)/);
    const idx = DAY_IDX[(day || '').trim().toLowerCase()];
    if (idx === undefined || !rest) continue;
    if (/open 24 hours/i.test(rest)) {
      parts[idx] = '0-1440';
      any = true;
      continue;
    }
    const m = rest.match(TIME_RE);
    if (!m) continue; // "Closed" and anything unrecognized stay empty
    parts[idx] = `${toMin(m[1], m[2], m[3])}-${toMin(m[4], m[5], m[6])}`;
    any = true;
  }
  return any ? parts.join('|') : '';
}

const TIER = { featured: 2, enhanced: 1, verified: 1 };

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
      zip5(c.postal_code),
      Math.round(scoreClinic(c).score),
      TIER[c.listing_tier] || 0,
      Number(c.aggregate_rating) || 0,
      Number(c.review_count) || 0,
      encodeHours(c.hours),
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
