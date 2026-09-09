/**
 * Metro areas: the places people actually mean when they search.
 *
 * TWIN FILE: the identical module lives in PainBeacon (src/lib/metro-defs.js)
 * and FertilityRecord (sites/fertility/src/lib/metro-defs.js). Change both.
 *
 * WHY A METRO IS A RADIUS, NOT A LIST. Neither site has a "metro" field in its
 * data: PainBeacon's zones are ZIP-prefix areas with a state suffix, and
 * FertilityRecord's clinics are filed under the suburb on their mailing
 * address. Washington, DC is therefore three states' worth of separate pages,
 * and Denver's clinics are in Englewood and Lone Tree. A metro here is an
 * anchor point and a radius in miles, and membership is computed at build
 * time from each clinic's coordinates. A clinic without coordinates borrows
 * its city: if any located clinic in the same city and state is inside the
 * radius, so is it. That is the same approach BestRaces uses for its metro
 * pages, and it needs no knowledge of how either site names its areas.
 *
 * Overlaps are allowed on purpose (Baltimore sits inside the DC radius's
 * edge). A metro page is a reader's question, not a partition.
 *
 * `aliases` are the other names for the place. The search boxes match them
 * through place-query.js, so "DMV", "Northern Virginia" and "Twin Cities" all
 * land on the metro page. `states` is every state the radius touches; the
 * sponsor rule on PainBeacon shows a brand on a metro page only when it has
 * bought every one of those states (or is national), which is the "state
 * group" the rate card sells.
 */

export const METROS = [
  { slug: 'washington-dc', name: 'Washington, DC', states: ['DC', 'VA', 'MD'], lat: 38.8977, lng: -77.0365, radiusMi: 40,
    aliases: ['dmv', 'dc metro', 'washington metro', 'washington dc metro', 'national capital region', 'northern virginia', 'nova', 'dc suburbs', 'maryland suburbs'] },
  { slug: 'new-york', name: 'New York, NY', states: ['NY', 'NJ', 'CT'], lat: 40.7128, lng: -74.006, radiusMi: 40,
    aliases: ['nyc', 'new york city', 'tri state', 'tristate', 'manhattan', 'brooklyn', 'queens', 'bronx', 'north jersey', 'long island', 'westchester'] },
  { slug: 'los-angeles', name: 'Los Angeles, CA', states: ['CA'], lat: 34.0522, lng: -118.2437, radiusMi: 45,
    aliases: ['la metro', 'greater los angeles', 'los angeles area', 'orange county', 'san fernando valley'] },
  { slug: 'chicago', name: 'Chicago, IL', states: ['IL', 'IN', 'WI'], lat: 41.8781, lng: -87.6298, radiusMi: 45,
    aliases: ['chicagoland', 'chicago metro', 'chi'] },
  { slug: 'dallas-fort-worth', name: 'Dallas–Fort Worth, TX', states: ['TX'], lat: 32.8, lng: -96.95, radiusMi: 45,
    aliases: ['dfw', 'metroplex', 'dallas fort worth', 'dallas', 'fort worth', 'north texas'] },
  { slug: 'houston', name: 'Houston, TX', states: ['TX'], lat: 29.7604, lng: -95.3698, radiusMi: 45,
    aliases: ['houston metro', 'greater houston'] },
  { slug: 'philadelphia', name: 'Philadelphia, PA', states: ['PA', 'NJ', 'DE'], lat: 39.9526, lng: -75.1652, radiusMi: 40,
    aliases: ['philly', 'delaware valley', 'main line', 'south jersey'] },
  { slug: 'atlanta', name: 'Atlanta, GA', states: ['GA'], lat: 33.749, lng: -84.388, radiusMi: 45,
    aliases: ['atl', 'metro atlanta'] },
  { slug: 'south-florida', name: 'Miami–Fort Lauderdale–West Palm Beach, FL', shortName: 'South Florida', states: ['FL'], lat: 26.1224, lng: -80.1373, radiusMi: 50,
    aliases: ['south florida', 'sofla', 'miami', 'miami metro', 'miami dade', 'broward', 'palm beach', 'fort lauderdale', 'west palm beach'] },
  { slug: 'boston', name: 'Boston, MA', states: ['MA', 'NH'], lat: 42.3601, lng: -71.0589, radiusMi: 40,
    aliases: ['greater boston', 'boston metro', 'metrowest', 'north shore', 'south shore'] },
  { slug: 'san-francisco-bay-area', name: 'San Francisco Bay Area, CA', shortName: 'Bay Area', states: ['CA'], lat: 37.55, lng: -122.3, radiusMi: 45,
    aliases: ['bay area', 'sf bay area', 'san francisco', 'silicon valley', 'east bay', 'peninsula', 'san jose', 'oakland'] },
  { slug: 'phoenix', name: 'Phoenix, AZ', states: ['AZ'], lat: 33.4484, lng: -112.074, radiusMi: 40,
    aliases: ['valley of the sun', 'phoenix metro', 'east valley', 'west valley', 'scottsdale'] },
  { slug: 'seattle', name: 'Seattle, WA', states: ['WA'], lat: 47.6062, lng: -122.3321, radiusMi: 40,
    aliases: ['puget sound', 'seattle tacoma', 'seattle metro', 'eastside'] },
  { slug: 'minneapolis-st-paul', name: 'Minneapolis–St. Paul, MN', states: ['MN', 'WI'], lat: 44.9778, lng: -93.265, radiusMi: 40,
    aliases: ['twin cities', 'minneapolis', 'st paul', 'saint paul'] },
  { slug: 'san-diego', name: 'San Diego, CA', states: ['CA'], lat: 32.7157, lng: -117.1611, radiusMi: 35,
    aliases: ['san diego county', 'north county'] },
  { slug: 'denver', name: 'Denver, CO', states: ['CO'], lat: 39.7392, lng: -104.9903, radiusMi: 40,
    aliases: ['denver metro', 'front range', 'mile high'] },
  { slug: 'detroit', name: 'Detroit, MI', states: ['MI'], lat: 42.3314, lng: -83.0458, radiusMi: 40,
    aliases: ['metro detroit', 'southeast michigan', 'oakland county'] },
  { slug: 'tampa-bay', name: 'Tampa Bay, FL', states: ['FL'], lat: 27.9506, lng: -82.4572, radiusMi: 35,
    aliases: ['tampa', 'tampa bay', 'st petersburg', 'st pete', 'clearwater'] },
  { slug: 'orlando', name: 'Orlando, FL', states: ['FL'], lat: 28.5383, lng: -81.3792, radiusMi: 35,
    aliases: ['central florida', 'orlando metro'] },
  { slug: 'baltimore', name: 'Baltimore, MD', states: ['MD'], lat: 39.2904, lng: -76.6122, radiusMi: 30,
    aliases: ['baltimore metro', 'bmore'] },
  { slug: 'st-louis', name: 'St. Louis, MO', states: ['MO', 'IL'], lat: 38.627, lng: -90.1994, radiusMi: 35,
    aliases: ['stl', 'saint louis', 'metro east'] },
  { slug: 'charlotte', name: 'Charlotte, NC', states: ['NC', 'SC'], lat: 35.2271, lng: -80.8431, radiusMi: 35,
    aliases: ['charlotte metro', 'clt'] },
  { slug: 'portland', name: 'Portland, OR', states: ['OR', 'WA'], lat: 45.5152, lng: -122.6784, radiusMi: 35,
    aliases: ['pdx', 'portland metro'] },
  { slug: 'san-antonio', name: 'San Antonio, TX', states: ['TX'], lat: 29.4241, lng: -98.4936, radiusMi: 30,
    aliases: ['san antonio metro', 'alamo city'] },
  { slug: 'austin', name: 'Austin, TX', states: ['TX'], lat: 30.2672, lng: -97.7431, radiusMi: 30,
    aliases: ['austin metro', 'atx', 'central texas'] },
  { slug: 'pittsburgh', name: 'Pittsburgh, PA', states: ['PA'], lat: 40.4406, lng: -79.9959, radiusMi: 35,
    aliases: ['pittsburgh metro', 'western pa'] },
  { slug: 'sacramento', name: 'Sacramento, CA', states: ['CA'], lat: 38.5816, lng: -121.4944, radiusMi: 30,
    aliases: ['sacramento metro', 'sac'] },
  { slug: 'las-vegas', name: 'Las Vegas, NV', states: ['NV'], lat: 36.1699, lng: -115.1398, radiusMi: 30,
    aliases: ['vegas', 'las vegas metro', 'henderson'] },
  { slug: 'cincinnati', name: 'Cincinnati, OH', states: ['OH', 'KY', 'IN'], lat: 39.1031, lng: -84.512, radiusMi: 30,
    aliases: ['cincy', 'greater cincinnati', 'northern kentucky'] },
  { slug: 'kansas-city', name: 'Kansas City, MO', states: ['MO', 'KS'], lat: 39.0997, lng: -94.5786, radiusMi: 35,
    aliases: ['kc', 'kansas city metro', 'overland park'] },
  { slug: 'columbus', name: 'Columbus, OH', states: ['OH'], lat: 39.9612, lng: -82.9988, radiusMi: 30,
    aliases: ['columbus metro', 'central ohio'] },
  { slug: 'indianapolis', name: 'Indianapolis, IN', states: ['IN'], lat: 39.7684, lng: -86.1581, radiusMi: 30,
    aliases: ['indy', 'indianapolis metro', 'central indiana'] },
  { slug: 'cleveland', name: 'Cleveland, OH', states: ['OH'], lat: 41.4993, lng: -81.6944, radiusMi: 30,
    aliases: ['cleveland metro', 'northeast ohio'] },
  { slug: 'nashville', name: 'Nashville, TN', states: ['TN'], lat: 36.1627, lng: -86.7816, radiusMi: 30,
    aliases: ['nashville metro', 'middle tennessee'] },
  { slug: 'raleigh-durham', name: 'Raleigh–Durham, NC', states: ['NC'], lat: 35.8801, lng: -78.788, radiusMi: 30,
    aliases: ['research triangle', 'the triangle', 'triangle', 'rtp', 'raleigh', 'durham', 'chapel hill'] },
  { slug: 'hampton-roads', name: 'Hampton Roads, VA', states: ['VA', 'NC'], lat: 36.8508, lng: -76.2859, radiusMi: 30,
    aliases: ['hampton roads', 'tidewater', 'virginia beach', 'norfolk', 'newport news', 'chesapeake'] },
  { slug: 'richmond', name: 'Richmond, VA', states: ['VA'], lat: 37.5407, lng: -77.436, radiusMi: 30,
    aliases: ['richmond metro', 'rva', 'central virginia'] },
  { slug: 'salt-lake-city', name: 'Salt Lake City, UT', states: ['UT'], lat: 40.7608, lng: -111.891, radiusMi: 30,
    aliases: ['slc', 'wasatch front', 'salt lake'] },
  { slug: 'milwaukee', name: 'Milwaukee, WI', states: ['WI'], lat: 43.0389, lng: -87.9065, radiusMi: 30,
    aliases: ['milwaukee metro', 'mke'] },
  { slug: 'new-orleans', name: 'New Orleans, LA', states: ['LA'], lat: 29.9511, lng: -90.0715, radiusMi: 30,
    aliases: ['nola', 'new orleans metro', 'metairie'] },
];

/** The everyday name: "Washington, DC" or, where set, a shorter handle. */
export const metroLabel = (m) => m.shortName || m.name;

/** The place as a phrase: "the Washington, DC area", "the Bay Area", "South Florida". */
export const metroArea = (m) => {
  if (!m.shortName) return `the ${m.name} area`;
  return /\barea\b/i.test(m.shortName) ? `the ${m.shortName}` : m.shortName;
};

/** Great-circle distance in miles. */
export function milesBetween(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Assign items to metros.
 *
 * @param items           any array of clinics
 * @param latLng(item)    -> [lat, lng] or null when the item has no coordinates
 * @param cityState(item) -> "city|ST" (case-insensitive) used to place unlocated items
 * @returns Map<slug, { metro, items, byState: Map<ST, count> }> for metros with
 *          at least one member, in METROS order. Items keep their input order.
 */
export function buildMetroIndex(items, latLng, cityState) {
  const out = new Map();
  for (const metro of METROS) {
    const members = [];
    const cities = new Set();
    for (const it of items) {
      const p = latLng(it);
      if (!p) continue;
      const [lat, lng] = p;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
      if (milesBetween(lat, lng, metro.lat, metro.lng) <= metro.radiusMi) {
        members.push(it);
        cities.add(String(cityState(it) || '').toLowerCase());
      }
    }
    // Unlocated items borrow their city's membership.
    const located = new Set(members);
    for (const it of items) {
      if (located.has(it) || latLng(it)) continue;
      const key = String(cityState(it) || '').toLowerCase();
      if (key && cities.has(key)) members.push(it);
    }
    if (!members.length) continue;
    const byState = new Map();
    for (const it of members) {
      const st = String(cityState(it) || '').split('|')[1]?.toUpperCase() || '';
      byState.set(st, (byState.get(st) || 0) + 1);
    }
    out.set(metro.slug, { metro, items: members, byState });
  }
  return out;
}

/** The metro holding the most of these items, or null. `index` from buildMetroIndex. */
export function bestMetroFor(index, items) {
  let best = null;
  for (const entry of index.values()) {
    const set = new Set(entry.items);
    const n = items.filter((it) => set.has(it)).length;
    if (n && (!best || n > best.n)) best = { entry, n };
  }
  return best;
}
