// County-level CSV behind the Pain Care Deserts study — the journalist-friendly
// download linked from /research/pain-care-deserts/.

import { getDesertStats } from '../../lib/deserts.js';

export async function GET() {
  const S = await getDesertStats();
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const lines = ['county_fips,county,state,population,pain_clinics,is_pain_care_desert'];
  const rows = [...S.rows].sort((a, b) => a.fips.localeCompare(b.fips));
  for (const r of rows) {
    lines.push(
      [r.fips, esc(r.county), r.state, r.pop, r.clinics, r.clinics === 0 ? 'true' : 'false'].join(',')
    );
  }
  return new Response(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
}
