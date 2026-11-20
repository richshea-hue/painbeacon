// The raw rows of nonregistry_listings_public, fetched once per build.
//
// Two loaders read them and each takes a different share:
//
//   * data.js (getClinics) takes the rows that qualify as an OFFICE of a
//     registry practice (see qualifiesAsOffice in listing-rules.js) and turns
//     them into ranked entries that carry the parent practice's registry
//     signals.
//   * listings.js (getListings) takes everything else: the "listed, not
//     ranked" class.
//
// Kept in its own module so neither loader has to import the other for the
// fetch, and so the request is made once however many pages ask.

import sampleListings from '../data/sample-listings.json' with { type: 'json' };

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

let _rows = null;

export async function getListingRows() {
  if (_rows) return _rows;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (url && key) {
    _rows = await fetchRows(url, key);
    console.log(`[listings] loaded ${_rows.length} non-registry listing row(s)`);
  } else {
    // getClinics() refuses to build sample data on Cloudflare, so reaching
    // this branch means a laptop build. The samples are fictional.
    _rows = sampleListings;
  }
  return _rows;
}
