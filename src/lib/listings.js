// Build-time access to non-registry listings: practices listed at their own
// request that have no record of their own in the federal NPI registry. They
// are a separate kind of thing from clinics and are kept separate all the way
// down: a table of their own (nonregistry_listings.sql), this loader, a page of
// their own at /listing/<slug>/, and a labeled, unnumbered section on the area
// page. They are never passed to the ranking and never appear on the map's
// scored results.
//
// Reads the nonregistry_listings_public VIEW only, which exposes published
// rows and none of the internal columns (who asked, how we confirmed it).
//
// One door, like research.js: every page that shows a listing gets it from
// getListings(), so the rules in listing-rules.js are applied once and cannot
// be skipped by a page that forgot to.

import sampleListings from '../data/sample-listings.json' with { type: 'json' };
import { getClinics, stateSlug, titleCase, formatPhone, publicName } from './data.js';
import { checkWebsites } from './safebrowsing.js';
import { listingProblems, websiteHrefOf, zoneClinicFor, zip5 } from './listing-rules.js';

// PostgREST's answers for "there is no such relation": the migration has not
// been run on this database yet. That is a normal state, not a failure, and
// the site builds without listings until it has.
const NO_SUCH_VIEW = new Set(['PGRST205', '42P01']);

async function fetchRows(url, key) {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/nonregistry_listings_public?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (res.ok) return await res.json();
  const body = await res.text();
  let code = '';
  try { code = JSON.parse(body).code || ''; } catch { /* not JSON */ }
  if (res.status === 404 || NO_SUCH_VIEW.has(code)) {
    console.warn(
      '[listings] nonregistry_listings_public does not exist on this database yet — ' +
        'building with no non-registry listings. Run nonregistry_listings.sql to turn them on.'
    );
    return [];
  }
  // Anything else (a permissions change, an outage) is a real problem: a build
  // that quietly dropped every listing would look exactly like one with none.
  throw new Error(`[listings] Supabase ${res.status}: ${body}`);
}

let _cache = null;

export async function getListings() {
  if (_cache) return _cache;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;

  let rows;
  if (url && key) {
    rows = await fetchRows(url, key);
    console.log(`[listings] loaded ${rows.length} non-registry listing(s)`);
  } else {
    // getClinics() has already refused to build sample data on Cloudflare, so
    // reaching this branch means a laptop build. The samples are fictional.
    rows = sampleListings;
  }

  const clinics = await getClinics();
  const byNpi = new Map(clinics.map((c) => [String(c.npi), c]));

  const good = [];
  const seen = new Set();
  for (const r of rows) {
    const problems = listingProblems(r);
    if (seen.has(r.slug)) problems.push('slug is already used by another listing');
    if (problems.length) {
      console.warn(`[listings] SKIPPED "${r.name || r.slug || '(unnamed)'}": ${problems.join('; ')}`);
      continue;
    }
    seen.add(r.slug);
    good.push(r);
  }

  const hrefOf = new Map(good.map((r) => [r.slug, websiteHrefOf(r.website)]));
  const safety = await checkWebsites([...hrefOf.values()]);

  _cache = good.map((r) => {
    const zc = zoneClinicFor(r, clinics);
    // An extra location points at the registry clinic it belongs to. Follow a
    // folded duplicate to its primary so the link lands on the canonical page.
    let parent = r.parent_npi != null ? byNpi.get(String(r.parent_npi)) || null : null;
    if (parent && parent.primary_npi != null && parent.primary_npi !== parent.npi) {
      parent = byNpi.get(String(parent.primary_npi)) || parent;
    }
    const href = hrefOf.get(r.slug) || null;
    return {
      ...r,
      name: String(r.name).replace(/\s+/g, ' ').trim(),
      practiceType: (r.practice_type || '').replace(/\s+/g, ' ').trim() || null,
      description: (r.description || '').replace(/\s+/g, ' ').trim() || null,
      phone: formatPhone(r.phone),
      zip: zip5(r.postal_code),
      stateSlug: stateSlug(r.state),
      cityLabel: titleCase(r.city),
      websiteHref: href,
      // true = checked and clean. Anything else is shown as text, never linked:
      // the same rule clinic websites live under (see safebrowsing.js).
      websiteSafe: href && safety.has(href) ? safety.get(href) : null,
      zoneSlug: zc ? zc.zoneSlug : null,
      zoneUrlSlug: zc ? zc.zoneUrlSlug : null,
      zoneLabel: zc ? zc.zoneLabel : null,
      parent: parent
        ? { npi: parent.npi, slug: parent.slug, name: publicName(parent), cityLabel: parent.cityLabel, state: parent.state }
        : null,
    };
  });
  return _cache;
}

/** Listings grouped by the area page they belong on. */
export async function getListingsByZone() {
  const m = new Map();
  for (const l of await getListings()) {
    if (!l.zoneSlug) continue;
    if (!m.has(l.zoneSlug)) m.set(l.zoneSlug, []);
    m.get(l.zoneSlug).push(l);
  }
  for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return m;
}

/** Extra locations grouped by the registry clinic they belong to. */
export async function getListingsByParent() {
  const m = new Map();
  for (const l of await getListings()) {
    if (!l.parent) continue;
    const k = String(l.parent.npi);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(l);
  }
  return m;
}
