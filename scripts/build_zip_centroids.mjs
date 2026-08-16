/**
 * Build ZIP centroid shards for the map's ZIP search.
 *
 * WHY: the map's ZIP handling matched a typed ZIP against clinic ZIPs, then
 * fell back to the surrounding 3-digit area. That covers most of the country,
 * but it dead-ends wherever the whole 3-digit prefix is empty — measured
 * against the Census ZCTA list that is 138 real prefixes covering 4,449 live
 * ZIP codes, including Atlantic City NJ (08401), Springfield MA (010xx),
 * Waterville ME (049xx) and Rutland VT (057xx). Those searchers got
 * "No clinics on the map near that ZIP" with nothing to click, which is the
 * least useful true statement available to someone in a coverage gap.
 *
 * A ZIP prefix is administrative, not spatial: Arlington VA's nearest clinics
 * are in DC's 200xx, not another 222xx. Locating the ZIP itself and ranking
 * clinics by real distance has neither failure mode.
 *
 * Source: U.S. Census Bureau 2020 Gazetteer, ZIP Code Tabulation Areas.
 * Public domain, no key, no rate limit.
 *   https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_zcta_national.zip
 * Unzip 2020_Gaz_zcta_national.txt into data/ and run:
 *   node scripts/build_zip_centroids.mjs
 *
 * Output: public/zip/{0..9}.json — ~80 KB each, sharded by first digit and
 * fetched only when a searcher actually types a ZIP, so ordinary visits pay
 * nothing for it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const IN = path.join(ROOT, "data", "2020_Gaz_zcta_national.txt");
const OUT_DIR = path.join(ROOT, "public", "zip");

if (!fs.existsSync(IN)) {
  console.error(`Missing ${IN}
Download and unzip:
  https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_zcta_national.zip`);
  process.exit(1);
}

const lines = fs.readFileSync(IN, "utf8").split(/\r?\n/).filter(Boolean);
const header = lines[0].split("\t").map((s) => s.trim());
const iZip = header.indexOf("GEOID");
const iLat = header.indexOf("INTPTLAT");
const iLng = header.indexOf("INTPTLONG");
if (iZip < 0 || iLat < 0 || iLng < 0) {
  console.error(`Gazetteer layout changed — columns: ${header.join(", ")}`);
  process.exit(1);
}

const shards = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), {}]));
let n = 0;
for (let i = 1; i < lines.length; i++) {
  const c = lines[i].split("\t").map((s) => s.trim());
  const zip = c[iZip];
  const lat = Number(c[iLat]);
  const lng = Number(c[iLng]);
  if (!/^\d{5}$/.test(zip) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  // 3 decimals ~= 110 m. The value only centres a map; more is payload.
  shards[zip[0]][zip] = [Number(lat.toFixed(3)), Number(lng.toFixed(3))];
  n++;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [digit, obj] of Object.entries(shards)) {
  const p = path.join(OUT_DIR, `${digit}.json`);
  fs.writeFileSync(p, JSON.stringify(obj));
  console.log(`  zip/${digit}.json  ${Object.keys(obj).length.toLocaleString()} ZIPs  ${(fs.statSync(p).size / 1024).toFixed(0)} KB`);
}
console.log(`ZIP centroids written: ${n.toLocaleString()}`);
