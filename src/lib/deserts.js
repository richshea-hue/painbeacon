// Build-time analysis for the Pain Care Deserts research page.
// Joins the clinic directory (NPPES-derived, via clinics_public) against
// Census county populations and the ZCTA->county crosswalk committed in
// src/data/county_data.json (regenerate with scripts/build_county_data.py).
//
// A "pain care desert" = a county (50 states + DC) with zero pain management
// clinics in the directory. Clinics are counted once (primary records only)
// and assigned to the county containing most of their ZIP's land area.

import countyData from '../data/county_data.json';
import { getClinics, STATE_NAMES } from './data.js';

let _cache = null;

export async function getDesertStats() {
  if (_cache) return _cache;
  const { counties, zipToCounty, vintage } = countyData;
  const clinics = (await getClinics()).filter((c) => c.isPrimary);

  // Count clinics per county.
  const countPerCounty = new Map();
  let mapped = 0;
  for (const c of clinics) {
    const zip = (c.postal_code || '').slice(0, 5);
    const fips = zipToCounty[zip];
    if (!fips) continue; // territory, military, or PO-box-only ZIP
    mapped++;
    countPerCounty.set(fips, (countPerCounty.get(fips) || 0) + 1);
  }

  // Per-county rows, then roll up per state and nationally.
  const rows = Object.entries(counties).map(([fips, m]) => ({
    fips,
    county: m.n,
    state: m.st,
    pop: m.p,
    clinics: countPerCounty.get(fips) || 0,
  }));

  const stateMap = new Map();
  for (const r of rows) {
    if (!stateMap.has(r.state)) {
      stateMap.set(r.state, {
        state: r.state,
        stateName: STATE_NAMES[r.state] || r.state,
        counties: 0, deserts: 0, clinics: 0, pop: 0, desertPop: 0,
      });
    }
    const s = stateMap.get(r.state);
    s.counties++;
    s.clinics += r.clinics;
    s.pop += r.pop;
    if (r.clinics === 0) {
      s.deserts++;
      s.desertPop += r.pop;
    }
  }
  const states = [...stateMap.values()]
    .map((s) => ({
      ...s,
      desertPct: Math.round((s.deserts / s.counties) * 100),
      per100k: s.pop ? +((s.clinics / s.pop) * 100000).toFixed(2) : 0,
    }))
    .sort((a, b) => b.desertPct - a.desertPct || a.stateName.localeCompare(b.stateName));

  const deserts = rows.filter((r) => r.clinics === 0);
  const singles = rows.filter((r) => r.clinics === 1);
  const totalPop = rows.reduce((a, r) => a + r.pop, 0);
  const desertPop = deserts.reduce((a, r) => a + r.pop, 0);

  _cache = {
    vintage,
    generatedAt: new Date().toISOString().slice(0, 10),
    totalClinics: clinics.length,
    mappedClinics: mapped,
    totalCounties: rows.length,
    desertCount: deserts.length,
    desertPct: Math.round((deserts.length / rows.length) * 100),
    desertPop,
    totalPop,
    desertPopPct: +((desertPop / totalPop) * 100).toFixed(1),
    singleClinicCount: singles.length,
    singleClinicPop: singles.reduce((a, r) => a + r.pop, 0),
    // Most-populous counties with zero clinics — the headline table.
    topDeserts: deserts.sort((a, b) => b.pop - a.pop).slice(0, 25),
    states,
    rows, // full county table (CSV endpoint)
  };
  return _cache;
}
