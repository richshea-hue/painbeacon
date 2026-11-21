// Rules for non-registry listings: practices listed at their own request that
// have no record of their own in the federal NPI registry.
//
// Pure functions, no Astro and no network, so `node --test` can run them and
// the build (src/lib/listings.js) applies exactly what the tests pin.
//
// A listing is what a practice told us about itself. That is a different kind
// of fact from everything else on the site, which is read from a federal file,
// and these rules exist to keep the two from being mistaken for each other:
//
//   * a listing is never ranked and never called verified, by us or by its own
//     description;
//   * a row that does not hold together (no name, no city, a state that is not
//     a state, a website that is not a URL) is left off the site rather than
//     published half-formed. It is skipped with a warning, not a failed build:
//     a typo in one hand-entered row should not stop a 15,000-page directory
//     from deploying, and the row was entered through the dashboard by one
//     person who will see the warning.

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Words a listing's own description may not use, because the page they sit on
// says the opposite: this practice is not ranked and not verified by us.
const CLAIMS = /\bverified\b|\branked\b|\branking\b|\btop[- ]rated\b|#\s?1\b|\bboard[- ]certified\b/i;

export const zip5 = (raw) => {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 4 || d.length === 8) d = '0' + d; // dropped leading zero, as in map-clinics.json.js
  return d.length >= 5 ? d.slice(0, 5) : '';
};

const text = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function websiteHrefOf(raw) {
  const v = text(raw);
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (!/^https?:$/.test(u.protocol) || !/\.[a-z]{2,}$/i.test(u.hostname)) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Every reason this row cannot be published. Empty array = fit to build. */
export function listingProblems(row) {
  const out = [];
  const r = row || {};
  if (!SLUG.test(String(r.slug ?? ''))) out.push('slug must be lowercase letters, digits and single hyphens');
  const name = text(r.name);
  if (name.length < 2 || name.length > 120) out.push('name is missing or longer than 120 characters');
  if (/https?:|www\.|@|[<>{}]/i.test(name)) out.push('name must be a name, not a link or an address');
  if (!text(r.city)) out.push('city is missing');
  if (!/^[A-Z]{2}$/.test(String(r.state ?? ''))) out.push('state must be a two-letter code in capitals');
  if (text(r.website) && !websiteHrefOf(r.website)) out.push('website is not a web address');
  const desc = text(r.description);
  if (desc.length > 400) out.push('description is longer than 400 characters');
  if (CLAIMS.test(desc)) out.push('description claims a rank, a verification or a credential; a listing has none of these from us');
  if (CLAIMS.test(text(r.practice_type))) out.push('practice type claims a rank, a verification or a credential');
  const lat = r.latitude, lng = r.longitude;
  if ((lat == null) !== (lng == null)) out.push('latitude and longitude must both be set or both be empty');
  if (lat != null && lng != null) {
    const a = Number(lat), b = Number(lng);
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0)) {
      out.push('latitude/longitude are not a real location');
    }
  }
  return out;
}

/** A slug for a new listing: state, city, name. Same shape as clinic slugs. */
export function listingSlug({ state, city, name }) {
  return [state, city, name]
    .map((p) => text(p))
    .filter(Boolean)
    .join('-')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 120)
    .replace(/-+$/, '');
}

/**
 * Which area page a listing belongs on.
 *
 * A listing has no zone of its own: zones are assigned to registry clinics by
 * the sync. So it borrows one from the registry clinics around it, nearest
 * evidence first: same ZIP, then same city, then same 3-digit ZIP area, always
 * within the same state. Returns one of those clinics (the caller reads its
 * zone fields) or null, in which case the listing still has its own page and
 * simply appears on no area page. It is never guessed across a state line.
 */
export function zoneClinicFor(listing, clinics) {
  const st = String(listing.state || '').toUpperCase();
  const pool = (clinics || []).filter((c) => c.zoneSlug && String(c.state || '').toUpperCase() === st);
  if (!pool.length) return null;
  const z5 = zip5(listing.postal_code);
  const city = text(listing.city).toLowerCase();
  const tiers = [
    z5 && ((c) => zip5(c.postal_code) === z5),
    city && ((c) => text(c.city).toLowerCase() === city),
    z5 && ((c) => zip5(c.postal_code).slice(0, 3) === z5.slice(0, 3)),
  ].filter(Boolean);
  for (const test of tiers) {
    const hits = pool.filter(test);
    if (!hits.length) continue;
    // The zone most of them share; ties broken by zone slug so builds are stable.
    const counts = new Map();
    for (const c of hits) counts.set(c.zoneSlug, (counts.get(c.zoneSlug) || 0) + 1);
    const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return hits.find((c) => c.zoneSlug === best);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Offices of a registry practice (decided 2026-11-20)
// ---------------------------------------------------------------------------
//
// A listing with a parent_npi is a location of a practice that IS in the
// federal registry. The ranking scores the practice, not the street address:
// its registry specialty, how long it has been registered, whether it carries
// the interventional code. Those are as true at its second office as at its
// first, and most group practices bill every office under one organization
// NPI without filing the optional secondary locations. So an office ranks,
// on the parent's registry signals, when all of this holds:
//
//   1. the parent's PRIMARY registration is pain medicine (isPainPrimary);
//   2. the practice itself confirmed the office (confirmed_on / confirmed_how,
//      which the database already requires before a row is published);
//   3. the office appears on the practice's own website: office_evidence_url
//      is a page on the same site as the listing's or the parent's website;
//   4. it is scored on the parent's registry signals only. It carries no
//      Google rating of its own (a loose address match is how 2,094 clinics
//      once got the wrong hours; see notes/), so it earns none of those points.
//
// A row with a parent that fails any of these stays a "listed, not ranked"
// listing, exactly as before.

/** The site a URL belongs to, for "is this page on the practice's own site?" */
export function siteOf(raw) {
  const href = websiteHrefOf(raw);
  if (!href) return '';
  const host = new URL(href).hostname.toLowerCase().replace(/^www\./, '');
  // Last two labels: drs-smith.com and offices.drs-smith.com are one site.
  // US practice domains only; a .co.uk practice is not a case this directory has.
  return host.split('.').slice(-2).join('.');
}

/**
 * Every reason this listing cannot be ranked as an office of `parent`.
 * Empty array = it qualifies. `isPainPrimary` is passed in so this module stays
 * free of the data layer (and testable under plain `node --test`).
 */
export function officeProblems(row, parent, isPainPrimary) {
  const out = [];
  const r = row || {};
  if (r.parent_npi == null) return ['no parent practice'];
  if (!parent) return [`parent NPI ${r.parent_npi} is not in the directory`];
  if (!isPainPrimary(parent)) out.push("the parent's primary registration is not pain medicine");
  const evidence = siteOf(r.office_evidence_url);
  if (!evidence) out.push('no page on the practice website lists this office (office_evidence_url)');
  else {
    const own = new Set([siteOf(r.website), siteOf(parent.website)].filter(Boolean));
    if (!own.has(evidence)) out.push(`office_evidence_url is on ${evidence}, not the practice's own site`);
  }
  if (!String(r.state || '').match(/^[A-Z]{2}$/)) out.push('state must be a two-letter code');
  return out;
}
