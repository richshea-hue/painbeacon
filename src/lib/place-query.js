/**
 * Forgiving place matching for the search boxes.
 *
 * TWIN FILE: the identical module lives in PainBeacon (src/lib/place-query.js)
 * and FertilityRecord (sites/fertility/src/lib/place-query.js). Change both.
 *
 * Why this exists. Every search box on both sites matched the raw string a
 * visitor typed against "City, ST" labels with a substring or prefix test.
 * "Washington" found Washington, DC. "Washington DC" did not (the label has a
 * comma). "DC metro", "Northern Virginia", "DMV", "Bay Area" and "Twin Cities"
 * found nothing, and the search log said so. People type places the way they
 * say them, not the way a database labels them.
 *
 * Three fixes, in order:
 *   1. normalizePlace() folds both sides to the same shape: lowercase, no
 *      punctuation, "D.C." -> "dc", "Saint/Fort/Mount" -> "st/ft/mt", full
 *      state names -> abbreviations, and filler words dropped (metro, area,
 *      greater, region, county, clinics...). "Washington, D.C. metro area"
 *      and "Washington, DC" both become "washington dc".
 *   2. Tokens match as prefixes, in any order, so "wash dc", "dc washington"
 *      and "washington dc" all find "Washington, DC" and typing still
 *      narrows as you go.
 *   3. PLACE_ALIASES expands the names people use for places that are not a
 *      city label: nicknames (DMV, NoVA, Philly), regions (Hampton Roads,
 *      Inland Empire, Twin Cities), and metros whose clinics carry suburb
 *      addresses (Denver's are in Englewood and Lone Tree). Alias matches
 *      come AFTER direct matches so the exact place always leads.
 *
 * A two-letter query is a state, never an alias ("la" is Louisiana on both
 * sites, as it always was), so stateOf() runs before anything else.
 *
 * Plain ESM with no imports. Bundled scripts import it; the two inline map
 * scripts read it from window.PlaceQuery, set by a one-line bridge script.
 */

export const STATE_ABBR = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', 'district of columbia': 'dc',
  florida: 'fl', georgia: 'ga', hawaii: 'hi', idaho: 'id', illinois: 'il',
  indiana: 'in', iowa: 'ia', kansas: 'ks', kentucky: 'ky', louisiana: 'la',
  maine: 'me', maryland: 'md', massachusetts: 'ma', michigan: 'mi', minnesota: 'mn',
  mississippi: 'ms', missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv',
  'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
  'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh', oklahoma: 'ok',
  oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
  'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt',
  virginia: 'va', washington: 'wa', 'west virginia': 'wv', wisconsin: 'wi',
  wyoming: 'wy', 'puerto rico': 'pr',
};
const ABBRS = new Set(Object.values(STATE_ABBR));

/* Words that carry no place information. "county" is here so "Fairfax
 * County" finds Fairfax; the county-only names that are not a city
 * (Montgomery County, MD) are aliases below. "washington" is deliberately
 * NOT folded to "wa": as a city it is the capital, and a state query is
 * handled by stateOf() from the abbreviation. */
const FILLER = new Set([
  'metro', 'metropolitan', 'metroplex', 'area', 'areas', 'region', 'greater',
  'the', 'in', 'near', 'nearby', 'around', 'of', 'and', 'county', 'city',
  'clinic', 'clinics', 'doctor', 'doctors', 'pain', 'management', 'fertility',
  'ivf', 'suburbs', 'downtown', 'me', 'my',
]);

/* Multi-word state names must be replaced before tokenizing, longest first,
 * so "new hampshire" does not become "new nh". Two names stay as typed
 * because they are cities first: "washington" (the capital) and "new york"
 * (the city label is "New York, NY", and folding would make "new york"
 * match every NY label). stateOf() still recognizes both as states. */
const CITY_FIRST = new Set(['washington', 'new york']);
const STATE_PHRASES = Object.keys(STATE_ABBR)
  .filter((n) => !CITY_FIRST.has(n))
  .sort((a, b) => b.length - a.length);

/** Lowercase, strip punctuation, fold abbreviations, drop filler. */
export function normalizePlace(input) {
  let s = String(input || '').toLowerCase();
  s = s.replace(/\bd\.?\s?c\.?(?=\s|$)/g, ' dc ');
  s = s.replace(/&/g, ' and ');
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  if (!s) return '';
  s = ' ' + s + ' ';
  for (const name of STATE_PHRASES) {
    if (s.indexOf(' ' + name + ' ') !== -1) s = s.split(' ' + name + ' ').join(' ' + STATE_ABBR[name] + ' ');
  }
  s = s.replace(/ saint /g, ' st ').replace(/ fort /g, ' ft ').replace(/ mount /g, ' mt ');
  return s
    .trim()
    .split(/\s+/)
    .filter((t) => t && !FILLER.has(t))
    .join(' ');
}

/** Two-letter state abbreviation when the whole query is a state, else null. */
export function stateOf(input) {
  const n = normalizePlace(input);
  if (ABBRS.has(n)) return n.toUpperCase();
  if (STATE_ABBR[n]) return STATE_ABBR[n].toUpperCase();
  return null;
}

/**
 * Nicknames and regions -> the city labels they mean, in "city st" form.
 * Keys are matched after normalizePlace(), so write them plain. Targets are
 * searched in order; put the anchor city first.
 */
export const PLACE_ALIASES = {
  // Washington, DC and its suburbs
  'dmv': ['washington dc', 'arlington va', 'alexandria va', 'bethesda md', 'silver spring md', 'fairfax va', 'rockville md'],
  'washington dc': ['arlington va', 'alexandria va', 'bethesda md', 'silver spring md', 'fairfax va', 'mclean va', 'rockville md'],
  'northern va': ['arlington va', 'alexandria va', 'fairfax va', 'vienna va', 'tysons va', 'mclean va', 'falls church va', 'reston va', 'herndon va', 'sterling va', 'ashburn va', 'leesburg va', 'manassas va', 'woodbridge va', 'springfield va', 'annandale va', 'burke va', 'chantilly va', 'centreville va'],
  'nova': ['arlington va', 'alexandria va', 'fairfax va', 'vienna va', 'tysons va', 'mclean va', 'falls church va', 'reston va', 'herndon va', 'sterling va', 'ashburn va', 'leesburg va', 'manassas va', 'woodbridge va', 'springfield va'],
  'nova va': ['arlington va', 'alexandria va', 'fairfax va', 'vienna va', 'tysons va', 'mclean va', 'falls church va', 'reston va', 'herndon va', 'leesburg va', 'manassas va'],
  'montgomery md': ['bethesda md', 'rockville md', 'silver spring md', 'gaithersburg md', 'germantown md', 'chevy chase md', 'olney md', 'wheaton md'],
  'moco': ['bethesda md', 'rockville md', 'silver spring md', 'gaithersburg md', 'germantown md', 'chevy chase md'],
  'prince georges': ['largo md', 'bowie md', 'greenbelt md', 'hyattsville md', 'laurel md', 'college park md', 'upper marlboro md', 'lanham md'],
  'pg md': ['largo md', 'bowie md', 'greenbelt md', 'hyattsville md', 'laurel md', 'college park md'],
  'hampton roads': ['norfolk va', 'virginia beach va', 'chesapeake va', 'newport news va', 'hampton va', 'portsmouth va', 'suffolk va', 'williamsburg va'],
  'tidewater': ['norfolk va', 'virginia beach va', 'chesapeake va', 'newport news va', 'hampton va', 'portsmouth va'],
  // Northeast
  'nyc': ['new york ny', 'brooklyn ny', 'bronx ny', 'queens ny', 'staten island ny', 'flushing ny', 'jamaica ny'],
  'new york ny': ['brooklyn ny', 'bronx ny', 'queens ny', 'staten island ny', 'flushing ny'],
  'manhattan': ['new york ny'],
  'long island': ['hempstead ny', 'garden city ny', 'great neck ny', 'huntington ny', 'melville ny', 'smithtown ny', 'lake success ny', 'mineola ny', 'commack ny'],
  'westchester': ['white plains ny', 'yonkers ny', 'scarsdale ny', 'tarrytown ny', 'purchase ny'],
  'north nj': ['newark nj', 'jersey city nj', 'hackensack nj', 'paramus nj', 'morristown nj', 'livingston nj', 'englewood nj'],
  'philly': ['philadelphia pa'],
  'philadelphia pa': ['bala cynwyd pa', 'king of prussia pa', 'bryn mawr pa', 'wayne pa', 'abington pa'],
  'main line': ['bryn mawr pa', 'wayne pa', 'bala cynwyd pa', 'paoli pa', 'ardmore pa'],
  'boston ma': ['brookline ma', 'cambridge ma', 'newton ma', 'waltham ma', 'lexington ma', 'burlington ma', 'dedham ma'],
  'metrowest': ['framingham ma', 'natick ma', 'wellesley ma', 'marlborough ma'],
  // Southeast
  'atl': ['atlanta ga', 'alpharetta ga', 'marietta ga', 'sandy springs ga', 'decatur ga'],
  'atlanta ga': ['alpharetta ga', 'marietta ga', 'sandy springs ga', 'decatur ga', 'lawrenceville ga', 'roswell ga'],
  'south fl': ['miami fl', 'ft lauderdale fl', 'west palm beach fl', 'boca raton fl', 'hollywood fl', 'coral springs fl', 'plantation fl', 'aventura fl'],
  'sofla': ['miami fl', 'ft lauderdale fl', 'west palm beach fl', 'boca raton fl'],
  'tampa bay': ['tampa fl', 'st petersburg fl', 'clearwater fl', 'brandon fl', 'largo fl'],
  'research triangle': ['raleigh nc', 'durham nc', 'chapel hill nc', 'cary nc', 'morrisville nc'],
  'triangle': ['raleigh nc', 'durham nc', 'chapel hill nc', 'cary nc'],
  'rtp': ['raleigh nc', 'durham nc', 'chapel hill nc', 'cary nc'],
  'triad': ['greensboro nc', 'winston salem nc', 'high point nc'],
  'nola': ['new orleans la', 'metairie la'],
  // Midwest
  'chicagoland': ['chicago il', 'naperville il', 'evanston il', 'oak brook il', 'schaumburg il', 'skokie il'],
  'chi': ['chicago il'],
  'twin cities': ['minneapolis mn', 'st paul mn', 'edina mn', 'bloomington mn', 'woodbury mn', 'maple grove mn'],
  'kc': ['kansas city mo', 'kansas city ks', 'overland park ks', 'leawood ks'],
  'stl': ['st louis mo', 'chesterfield mo', 'creve coeur mo'],
  'detroit mi': ['troy mi', 'southfield mi', 'dearborn mi', 'royal oak mi', 'bloomfield hills mi', 'novi mi'],
  'metro detroit': ['detroit mi', 'troy mi', 'southfield mi', 'dearborn mi', 'royal oak mi', 'novi mi'],
  // Texas
  'dfw': ['dallas tx', 'ft worth tx', 'arlington tx', 'plano tx', 'irving tx', 'frisco tx', 'richardson tx'],
  'dallas tx': ['plano tx', 'irving tx', 'frisco tx', 'richardson tx', 'grapevine tx', 'southlake tx'],
  'houston tx': ['the woodlands tx', 'sugar land tx', 'katy tx', 'pearland tx', 'webster tx'],
  // Mountain and Southwest
  'denver co': ['englewood co', 'lone tree co', 'aurora co', 'littleton co', 'lakewood co', 'greenwood village co', 'centennial co'],
  'valley of the sun': ['phoenix az', 'scottsdale az', 'mesa az', 'tempe az', 'chandler az', 'gilbert az', 'glendale az'],
  'phoenix az': ['scottsdale az', 'mesa az', 'tempe az', 'chandler az', 'gilbert az', 'glendale az', 'peoria az'],
  'vegas': ['las vegas nv', 'henderson nv'],
  'slc': ['salt lake city ut', 'murray ut', 'sandy ut'],
  // West Coast
  'bay': ['san francisco ca', 'oakland ca', 'san jose ca', 'palo alto ca', 'berkeley ca', 'walnut creek ca', 'fremont ca', 'redwood ca'],
  'sf': ['san francisco ca'],
  'san fran': ['san francisco ca'],
  'east bay': ['oakland ca', 'berkeley ca', 'walnut creek ca', 'fremont ca', 'san ramon ca'],
  'silicon valley': ['san jose ca', 'palo alto ca', 'sunnyvale ca', 'mtn view ca', 'mountain view ca', 'santa clara ca', 'cupertino ca'],
  'socal': ['los angeles ca', 'san diego ca', 'irvine ca', 'anaheim ca', 'long beach ca', 'pasadena ca', 'riverside ca'],
  'los angeles ca': ['beverly hills ca', 'santa monica ca', 'pasadena ca', 'glendale ca', 'burbank ca', 'torrance ca', 'encino ca', 'west hollywood ca'],
  'orange ca': ['irvine ca', 'anaheim ca', 'santa ana ca', 'newport beach ca', 'huntington beach ca', 'mission viejo ca', 'fullerton ca', 'laguna hills ca'],
  'oc': ['irvine ca', 'anaheim ca', 'santa ana ca', 'newport beach ca', 'huntington beach ca'],
  'inland empire': ['riverside ca', 'san bernardino ca', 'ontario ca', 'rancho cucamonga ca', 'temecula ca', 'corona ca'],
  'seattle wa': ['bellevue wa', 'kirkland wa', 'redmond wa', 'renton wa', 'everett wa', 'tacoma wa'],
  'puget sound': ['seattle wa', 'bellevue wa', 'tacoma wa', 'everett wa', 'kirkland wa'],
  'pdx': ['portland or'],
};

/* Alias keys are looked up after normalization, so normalize them once
 * too. A key written with its state ("denver co") also answers to the bare
 * city ("denver"): nobody types the state for a place they live in, and
 * "denver" finding nothing was the whole Denver problem. Bare compass words
 * are skipped so "north" does not surface Newark while someone is still
 * typing "north carolina". */
const ALIASES_NORM = {};
const BARE_SKIP = new Set(['north', 'south', 'east', 'west']);
for (const k of Object.keys(PLACE_ALIASES)) {
  const n = normalizePlace(k);
  ALIASES_NORM[n] = PLACE_ALIASES[k];
  const parts = n.split(' ');
  const bare = parts.slice(0, -1).join(' ');
  if (parts.length > 1 && ABBRS.has(parts[parts.length - 1]) && bare && !BARE_SKIP.has(bare) && !ALIASES_NORM[bare]) {
    ALIASES_NORM[bare] = PLACE_ALIASES[k];
  }
}

/** Direct query first, then every alias target. Each entry is normalized. */
export function placeCandidates(input) {
  const n = normalizePlace(input);
  if (!n) return [];
  const out = [n];
  const targets = ALIASES_NORM[n];
  if (targets) for (const t of targets) { const tn = normalizePlace(t); if (tn && out.indexOf(tn) === -1) out.push(tn); }
  return out;
}

/** True when every token of `candidate` starts some token of `label`. Both normalized. */
function tokensMatch(candidate, labelNorm) {
  if (!candidate || !labelNorm) return false;
  const lt = labelNorm.split(' ');
  return candidate.split(' ').every((q) => lt.some((t) => t.indexOf(q) === 0));
}

/** Does the query, or one of its aliases, match this label? */
export function placeMatches(query, label) {
  const ln = normalizePlace(label);
  return placeCandidates(query).some((c) => tokensMatch(c, ln));
}

/**
 * Filter `items` by place. Direct matches lead, in their original order;
 * alias matches follow, in alias order. `labelOf` returns the item's
 * "City, ST" label. Never returns the same item twice.
 */
export function placeFilter(query, items, labelOf) {
  const cands = placeCandidates(query);
  if (!cands.length) return [];
  const norm = items.map((it) => normalizePlace(labelOf(it)));
  const seen = new Set();
  const out = [];
  cands.forEach((c, ci) => {
    const hits = [];
    for (let i = 0; i < items.length; i++) {
      if (!seen.has(i) && tokensMatch(c, norm[i])) hits.push(i);
    }
    // Alias targets are exact places: prefer the exact label over a prefix
    // hit ("st paul mn" should not lead with "St Paul Park, MN").
    if (ci > 0) hits.sort((a, b) => (norm[b] === c) - (norm[a] === c));
    for (const i of hits) { seen.add(i); out.push(items[i]); }
  });
  return out;
}
