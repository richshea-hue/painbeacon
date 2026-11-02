// Build-time data access. Reads the clinics_public VIEW only — internal
// deal-flow columns are not exposed by that view, so the site cannot leak them.
// Falls back to a local fictional sample so the project builds without Supabase
// on a laptop; a Cloudflare Pages build (CF_PAGES set) fails instead.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Import attribute so this module also loads under plain Node — the post-build
// card generator imports getClinics() directly, outside Vite, which resolves a
// bare JSON import on its own. Vite and Node 20+ both accept `with`.
import sampleData from '../data/sample.json' with { type: 'json' };
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

// NPPES occasionally sends a state spelled out — "GEORGIA" rather than "GA".
// stateSlug is the one chokepoint every state-bearing URL runs through: the
// state hub, breadcrumbs, the sitemap, the city-redirect map, zip3-zones. So a
// single unnormalized value mints an entire phantom state section that competes
// with the real one, and that is not hypothetical — on 2026-10-24 both
// /pain-clinics/georgia/ and /pain-clinics/ga/ were live, each canonicalizing to
// itself, both in the sitemap, with the phantom sitting in Google's
// "Crawled - currently not indexed" from one clinic record in Duluth.
//
// Normalizing here rather than at ingest means it holds however the row arrives:
// a weekly resync, a hand-added clinic, a director's edit.
let _codeByStateName = null;
const codeByStateName = () => {
  if (_codeByStateName) return _codeByStateName;
  _codeByStateName = new Map(
    Object.entries(STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code])
  );
  // Spellings registries and people actually use for the one that has no plain name.
  for (const alias of ['district of columbia', 'washington dc', 'washington d.c.']) {
    _codeByStateName.set(alias, 'DC');
  }
  return _codeByStateName;
};

export const stateSlug = (s) => {
  const v = String(s ?? '').trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toLowerCase();
  const code = codeByStateName().get(v.toLowerCase());
  // Anything still unrecognized has to be URL-safe regardless: the old
  // .toLowerCase() would have put a space in the path for "NEW YORK".
  return code ? code.toLowerCase() : slugify(v);
};
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

// clinics_public held 14,536 rows on 2026-09-19. A real fetch far below that
// means a half-broken view or a truncated page loop; publishing it would
// silently drop most of the directory, so fail instead.
const MIN_CLINICS = 10000;

let _cache = null;

export async function getClinics() {
  if (_cache) return _cache;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;

  let rows;
  if (url && key) {
    rows = await fetchFromSupabase(url, key);
    console.log(`[data] loaded ${rows.length} clinics from Supabase clinics_public`);
    if (rows.length < MIN_CLINICS) {
      throw new Error(
        `[data] Supabase clinics_public returned only ${rows.length} rows (floor is ${MIN_CLINICS}). ` +
          `Refusing to build a partial directory — check the view and its permissions.`
      );
    }
  } else if (process.env.CF_PAGES) {
    // Cloudflare Pages sets CF_PAGES=1 on every build, production and preview.
    // The sample fallback below would publish eight invented clinics as a
    // national medical directory, so a deploy without real data must fail.
    const missing = [!url && 'SUPABASE_URL', !key && 'SUPABASE_ANON_KEY'].filter(Boolean).join(' and ');
    throw new Error(
      `[data] ${missing} not set in this Cloudflare Pages build. Refusing to publish ` +
        `FICTIONAL sample clinics. Add the missing value under Settings → Environment variables for this ` +
        `environment (production and preview are configured separately), then redeploy.`
    );
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

  // Practices whose PRIMARY registration is not pain medicine. They are here
  // because one of their fifteen taxonomy slots carries a pain code, not
  // because pain medicine is the business: general anesthesia groups,
  // orthopedic surgeons, DME suppliers, chiropractors, a dentist. Measured
  // against clinics_public on 2026-10-30: 3,116 of 14,603, or 21.3%, across
  // 163 distinct registrations -- 584 general anesthesiology, 384 orthopedic
  // surgery, 147 medical-supply companies, 50 chiropractors. The 2,839 in the
  // note on PAIN_TAXONOMY_CODES below is the same count taken earlier; it has
  // drifted by 277 rows since, so re-measure rather than quote either.
  //
  // Search Console for the three months to 2026-10-30 says what carrying them
  // costs. The largest query cluster the whole site matched was anesthesia
  // STAFFING -- "anesthesia services companies green bay" and its neighbors,
  // 408 of the top hundred queries' 1,879 impressions -- against zero clicks.
  // Someone sourcing an anesthesia group for a surgical center is not looking
  // for a pain-clinic directory, so those impressions can never convert.
  //
  // PAIN_PRIMARY_ONLY=1 drops them. It is OFF by default on purpose: this
  // delists 21.3% of the directory, which is Rich's call, and the dropped URLs
  // need to answer 410 before it is taken. The split is logged either way, so
  // an ordinary build measures the cut without making it.
  const { primary, offPrimary } = splitByListablePrimary(located);
  if (offPrimary.length) console.log(offPrimarySummary(offPrimary, located.length));
  const listed = process.env.PAIN_PRIMARY_ONLY === '1' ? primary : located;

  // Build a clean, state-scoped URL segment for each zone, guaranteed unique
  // within its state, so URLs read /pain-clinics/nv/las-vegas/ (not the raw
  // zone_slug, which repeats the state: las-vegas-nv). Deterministic ordering
  // (sorted by zone_slug) keeps builds stable.
  const zoneUrlBySlug = new Map();
  const usedByState = new Map();
  const uniqueZones = [
    ...new Map(listed.filter((c) => c.zone_slug).map((c) => [c.zone_slug, c])).values(),
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
    listed.map((c) => [c.npi, normalizeWebsite(c.website)])
  );
  const safety = await checkWebsites([...websiteHrefOf.values()]);

  _cache = listed.map((c) => ({
    ...c,
    phone: formatPhone(c.phone),
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

// The five pain taxonomy codes the NPPES sync filters the directory on
// (CODE_DESC in scripts/sync_nppes.py). A clinic is listed if ANY of its
// fifteen taxonomy slots carries one of these — which is NOT the same as pain
// medicine being what the practice primarily does. 2,839 listed clinics have a
// primary registration that is something else: mostly Anesthesiology,
// Orthopaedic Surgery and PM&R, but also 123 durable medical equipment,  us-english-ok
// 54 chiropractors, 20 physical therapists and a dentist.
//
// "Orthopaedic" above is CMS's own spelling in the NPPES taxonomy table.  us-english-ok
// primary_taxonomy_desc is stored verbatim from that table and rendered as-is,
// so it reaches the page that way too; us-english.mjs only scans authored
// source, which is right — correcting a federal label would misquote it.
export const PAIN_TAXONOMY_CODES = new Set([
  '207LP2900X', // Anesthesiology - Pain Medicine
  '208VP0014X', // Pain Medicine - Interventional Pain Medicine
  '208VP0000X', // Pain Medicine - Pain Medicine
  '2081P2900X', // Physical Medicine & Rehabilitation - Pain Medicine
  '2084P2900X', // Psychiatry & Neurology - Pain Medicine
]);

// Is pain medicine this practice's PRIMARY registration, rather than one of
// the other fourteen things it also declared?
export const isPainPrimary = (c) => PAIN_TAXONOMY_CODES.has(c.primary_taxonomy_code);

// What the LISTING gate accepts as a primary registration: the five pain codes
// above, plus 261QP3300X, "Clinic/Center - Pain". That one is a pain clinic by
// registration even though it is not a physician subspecialty, and
// practice-type.js already counts it under pain medicine. 63 listed practices
// carry it as their primary and dropping them would be plainly wrong.
//
// Deliberately NOT folded into PAIN_TAXONOMY_CODES: isPainPrimary() answers a
// different question -- is pain medicine this PHYSICIAN's subspecialty -- and
// ClinicCard.astro decides whether to print a practice type from that answer.
// Widening it there would quietly stop 63 cards showing what the practice is.
export const LISTABLE_PRIMARY_CODES = new Set([...PAIN_TAXONOMY_CODES, '261QP3300X']);
export const isListablePrimary = (c) => LISTABLE_PRIMARY_CODES.has(c.primary_taxonomy_code);

// Split listings on that question. Pure, so the gate in getClinics() can be
// tested without a database or an env var.
export function splitByListablePrimary(rows) {
  const primary = [];
  const offPrimary = [];
  for (const c of rows) (isListablePrimary(c) ? primary : offPrimary).push(c);
  return { primary, offPrimary };
}

// The one build-log line: how many listings are not pain-primary, and the eight
// registrations they most often are instead. Descriptions print as CMS wrote
// them, CMS's own spellings included, for the reason given above.
export function offPrimarySummary(offPrimary, total) {
  const byDesc = new Map();
  for (const c of offPrimary) {
    const d = c.primary_taxonomy_desc || '(no primary taxonomy)';
    byDesc.set(d, (byDesc.get(d) || 0) + 1);
  }
  const top = [...byDesc]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([d, n]) => `${d} ${n}`)
    .join('; ');
  const pct = total ? ((100 * offPrimary.length) / total).toFixed(1) : '0.0';
  const verdict =
    process.env.PAIN_PRIMARY_ONLY === '1'
      ? 'PAIN_PRIMARY_ONLY=1 - dropping them'
      : 'listed anyway - set PAIN_PRIMARY_ONLY=1 to drop them';
  return `[data] ${offPrimary.length} of ${total} listings (${pct}%) are not pain-primary: ${top}. ${verdict}`;
}

// Federal records arrive in capitals ("FIRST CHOICE MEDICAL SOLUTIONS PLLC"), so
// everything we print is title-cased, in two passes. titleCase is safe for any
// text, addresses and cities included: it fixes only what is wrong everywhere,
// "Physician'S" -> "Physician's" and "Mcallen" -> "McAllen" (Mc plus three or
// more letters, so "Mcr Health" is left alone). displayName adds the acronyms,
// and is for practice NAMES only, because the same letters mean something else
// in an address: "PT" is a physical therapist in a name and Point in "Pt Loma
// Ave"; "PL" is a Florida professional company in a name and Place on a street.
export function titleCase(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .replace(/'S\b/g, "'s")
    .replace(/\bMc([a-z])(?=[a-z]{2})/g, (_, l) => `Mc${l.toUpperCase()}`)
    .replace(/\bLlc\b/, 'LLC')
    .replace(/\bPc\b/, 'PC')
    .replace(/\bPa\b/, 'PA');
}

// Business suffixes and the credentials doctors put in a practice's legal name.
// Checked against every name in clinics_public on 2026-10-27: all 114 "DO"s
// were the credential and all 12 "US"s the country. Before this, 3,196 names
// printed as "Pllc", "Md", "Do" and the like ("Alan D Silberberg, Md PA").
const NAME_ACRONYMS = [
  'LLC', 'PLLC', 'PC', 'PA', 'LLP', 'LLLP', 'LP', 'SC', 'PLC', 'PL', 'APC', 'APMC', 'PSC', 'PS', 'LC',
  'MD', 'DO', 'DPM', 'DC', 'DDS', 'DMD', 'PHD', 'NP', 'PT', 'DPT', 'RN', 'CRNA', 'FNP', 'MPH', 'MHA', 'FACEP',
  'II', 'III', 'IV', 'USA', 'US',
];
const NAME_ACRONYM_RE = new RegExp(`\\b(${NAME_ACRONYMS.join('|')})\\b`, 'gi');
export const displayName = (s) => titleCase(s).replace(NAME_ACRONYM_RE, (m) => m.toUpperCase());

// 22% of phones arrive as bare digits ("8178775353"), the rest as 817-877-5353.
// Print them all the second way. Anything that isn't a plain ten-digit US number
// (an extension, a letter) is left exactly as it came.
export function formatPhone(p) {
  if (!p || !/^[\d\s().+-]+$/.test(String(p))) return p;
  let d = String(p).replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : p;
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
