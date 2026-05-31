// Build-time data access. Reads the clinics_public VIEW only — internal
// deal-flow columns are not exposed by that view, so the site cannot leak them.
// Falls back to a local fictional sample so the project builds without Supabase.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sampleData from '../data/sample.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function slugify(...parts) {
  return parts
    .filter(Boolean)
    .join('-')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export const stateSlug = (s) => (s || '').toLowerCase();
export const citySlug = (c) => slugify(c);

async function fetchFromSupabase(url, key) {
  const out = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/clinics_public?select=*`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${offset}-${offset + pageSize - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
}

let _cache = null;

export async function getClinics() {
  if (_cache) return _cache;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;

  let rows;
  if (url && key) {
    rows = await fetchFromSupabase(url, key);
    console.log(`[data] loaded ${rows.length} clinics from Supabase clinics_public`);
  } else {
    rows = sampleData;
    console.warn(
      `[data] SUPABASE_URL not set — using ${rows.length} FICTIONAL sample clinics. ` +
        `Set SUPABASE_URL + SUPABASE_ANON_KEY to build from real data.`
    );
  }

  // Normalize + derive routing keys. Only LOCATION records with a city/state
  // are routable; drop the rest from the site (they stay in the DB).
  _cache = rows
    .filter((c) => c.city && c.state && c.name)
    .map((c) => ({
      ...c,
      stateSlug: stateSlug(c.state),
      citySlug: citySlug(c.city),
      cityLabel: titleCase(c.city),
    }));
  return _cache;
}

export function titleCase(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .replace(/\bLlc\b/, 'LLC')
    .replace(/\bPc\b/, 'PC')
    .replace(/\bPa\b/, 'PA');
}

export function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

// US state names for hub page titles / nicer copy.
export const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington, D.C.',
  PR: 'Puerto Rico',
};
export const stateName = (abbr) => STATE_NAMES[abbr] || abbr;
