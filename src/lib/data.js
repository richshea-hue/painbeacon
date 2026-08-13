// Build-time data access. Reads the clinics_public VIEW only — internal
// deal-flow columns are not exposed by that view, so the site cannot leak them.
// Falls back to a local fictional sample so the project builds without Supabase.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sampleData from '../data/sample.json';
import { normalizeWebsite, checkWebsites } from './safebrowsing.js';

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

// Strip a trailing ", NV" state suffix from a zone name to get a display label.
const zoneLabelOf = (zoneName, fallbackCity) =>
  zoneName ? zoneName.replace(/,\s*[A-Z]{2}\s*$/, '') : titleCase(fallbackCity);

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
  const located = rows.filter((c) => c.city && c.state && c.name);

  // Build a clean, state-scoped URL segment for each zone, guaranteed unique
  // within its state, so URLs read /pain-clinics/nv/las-vegas/ (not the raw
  // zone_slug, which repeats the state: las-vegas-nv). Deterministic ordering
  // (sorted by zone_slug) keeps builds stable.
  const zoneUrlBySlug = new Map();
  const usedByState = new Map();
  const uniqueZones = [
    ...new Map(located.filter((c) => c.zone_slug).map((c) => [c.zone_slug, c])).values(),
  ].sort((a, b) => a.zone_slug.localeCompare(b.zone_slug));
  for (const c of uniqueZones) {
    const st = stateSlug(c.state);
    const base = slugify(zoneLabelOf(c.zone_name, c.city)) || 'area';
    const used = usedByState.get(st) || new Set();
    let seg = base;
    let n = 2;
    while (used.has(seg)) seg = `${base}-${n++}`;
    used.add(seg);
    usedByState.set(st, used);
    zoneUrlBySlug.set(c.zone_slug, seg);
  }

  // Safe Browsing pass: every clinic website is checked once per build, and
  // only URLs that come back clean are ever linked (see safebrowsing.js for
  // the why). websiteSafe: true = checked & clean, false = flagged,
  // null = not validated (no API key / API error) — treated as unlinkable.
  const websiteHrefOf = new Map(
    located.map((c) => [c.npi, normalizeWebsite(c.website)])
  );
  const safety = await checkWebsites([...websiteHrefOf.values()]);

  _cache = located.map((c) => ({
    ...c,
    websiteHref: websiteHrefOf.get(c.npi) || null,
    websiteSafe: safety.has(websiteHrefOf.get(c.npi))
      ? safety.get(websiteHrefOf.get(c.npi))
      : null,
    stateSlug: stateSlug(c.state),
    citySlug: citySlug(c.city),
    cityLabel: titleCase(c.city),
    // Zone fields (sourced from the clinics_public view).
    zoneSlug: c.zone_slug || null,
    zoneName: c.zone_name || null,
    zoneLabel: zoneLabelOf(c.zone_name, c.city),
    zoneUrlSlug: c.zone_slug ? zoneUrlBySlug.get(c.zone_slug) : null,
    // A row is a primary (deduped) practice if it isn't folded into another NPI.
    isPrimary: c.primary_npi == null || c.primary_npi === c.npi,
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
  PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands', AS: 'American Samoa',
  MP: 'Northern Mariana Islands',
};
export const stateName = (abbr) => STATE_NAMES[abbr] || abbr;
