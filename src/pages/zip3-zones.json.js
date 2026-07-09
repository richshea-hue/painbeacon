// Build-time ZIP3 -> zone map: emits /zip3-zones.json at build time, mapping
// each 3-digit ZIP prefix to the zone page that covers it ("state/zone-segment").
//
// The site's zones are ZIP3-based: sync_nppes.py assigns every clinic a zone by
// a majority vote of existing clinics sharing its (state, ZIP3). We reconstruct
// the same mapping here, keyed by ZIP3 alone, so a visitor who types only a
// 5-digit ZIP (no state) can be routed to /pain-clinics/[state]/[zone]/.
//
// Built INSIDE the Astro build (not a standalone script) on purpose: the zone
// URL segment is derived in data.js (slugified label, de-duplicated per state),
// so generating this map from the same getClinics() call guarantees the targets
// always match the zone pages actually being built. Only PRIMARY clinics vote,
// mirroring how zone pages are generated (one page per zone of primaries), which
// also avoids duplicate-NPI records biasing the majority.

import { getClinics } from '../lib/data.js';

// Extract the 3-digit ZIP prefix from a raw postal value. Handles ZIP+4 and a
// dropped leading zero (a common New England case, e.g. "2906" -> "02906").
function zip3(raw) {
  let d = (raw == null ? '' : String(raw)).replace(/\D/g, '');
  if (d.length === 4 || d.length === 8) d = '0' + d;
  return d.slice(0, 3);
}

export async function GET() {
  const clinics = await getClinics();

  // ZIP3 -> Map("state/zoneSegment" -> vote count).
  const tally = new Map();
  for (const c of clinics) {
    if (!c.isPrimary || !c.zoneUrlSlug || !c.postal_code) continue;
    const z3 = zip3(c.postal_code);
    if (z3.length < 3) continue;
    const seg = `${c.stateSlug}/${c.zoneUrlSlug}`;
    let m = tally.get(z3);
    if (!m) tally.set(z3, (m = new Map()));
    m.set(seg, (m.get(seg) || 0) + 1);
  }

  // Pick the majority zone per ZIP3 (alphabetical tie-break keeps builds stable).
  const map = {};
  for (const [z3, m] of tally) {
    map[z3] = [...m.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0][0];
  }

  return new Response(JSON.stringify(map), {
    headers: { 'Content-Type': 'application/json' },
  });
}
