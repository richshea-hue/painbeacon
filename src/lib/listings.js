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

import { getClinics, stateSlug, titleCase, formatPhone, publicName } from './data.js';
import { checkWebsites } from './safebrowsing.js';
import { listingProblems, websiteHrefOf, zoneClinicFor, zip5 } from './listing-rules.js';
import { getListingRows } from './listing-rows.js';

let _cache = null;

export async function getListings() {
  if (_cache) return _cache;
  const clinics = await getClinics();
  // A row that qualified as an office of a registry practice is a ranked
  // clinic entry now (data.js buildOffices), with a page at /clinic/<slug>/.
  // It must not also appear here as a listing.
  const offices = new Set(clinics.filter((c) => c.isOffice).map((c) => c.listingSlug));
  const rows = (await getListingRows()).filter((r) => !offices.has(r.slug));
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
