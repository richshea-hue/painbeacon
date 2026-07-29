// Builds src/data/county_geo.json — the SVG path geometry behind the pain care
// deserts choropleth on /research/pain-care-deserts/.
//
// Source: the Census Bureau's TIGERweb ACS2024 map service, queried per state.
// That vintage matters: it is the same geography as the vintage-2024 population
// estimates behind src/data/county_data.json, so it has Connecticut's nine
// planning regions and Alaska's Chugach / Copper River split. The widely used
// us-atlas TopoJSON is still on 2021 geography and would leave those counties
// as unfilled holes in the map.
//
// The service returns full-resolution TIGER geometry (~290 MB nationally), so
// we ask it to generalize server-side via maxAllowableOffset before sending.
//
// Coordinates come back as lon/lat and are projected here to Albers USA — the
// standard US composite that lifts Alaska and Hawaii into insets — matching
// d3-geo's geoAlbersUsa at scale 1300, translate [487.5, 305], which fits the
// conventional 975x610 frame.
//
// Run:  node scripts/build_county_geo.mjs [--offset 0.005] [--tolerance 0.4]
// Then commit the regenerated src/data/county_geo.json.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const BASE =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer';
const COUNTY_LAYER = 82;
const STATE_LAYER = 80;

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../src/data/county_geo.json');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};

// Server-side generalization, in degrees. 0.005deg is roughly 550m — finer than
// the ~4.6km that one unit of the output grid represents, so it is the network
// that this saves, not fidelity.
const OFFSET = arg('offset', 0.005);
// A light Douglas-Peucker pass after projection, in output units, to drop
// points the projection has made redundant.
const TOLERANCE = arg('tolerance', 0.4);

// The canonical Albers USA frame.
const VIEW_W = 975;
const VIEW_H = 610;

const STATE_FIPS = [
  '01', '02', '04', '05', '06', '08', '09', '10', '11', '12', '13', '15', '16',
  '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29',
  '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42',
  '44', '45', '46', '47', '48', '49', '50', '51', '53', '54', '55', '56',
];

// --- Albers USA projection -------------------------------------------------
// A port of the pieces of d3-geo this script needs. Validated against
// us-atlas's independently produced Albers rendering — see checkProjection().
const RAD = Math.PI / 180;

function conicEqualAreaRaw(phi0, phi1) {
  const sy0 = Math.sin(phi0);
  const n = (sy0 + Math.sin(phi1)) / 2;
  const c = 1 + sy0 * (2 * n - sy0);
  const r0 = Math.sqrt(c) / n;
  return (lambda, phi) => {
    const r = Math.sqrt(c - 2 * n * Math.sin(phi)) / n;
    return [r * Math.sin(lambda * n), r0 - r * Math.cos(lambda * n)];
  };
}

// `rotateLon` shifts longitudes so the projection's central meridian sits at 0;
// `center` is then expressed in that rotated frame, exactly as d3 does it.
function conicProjection({ parallels, rotateLon, center, scale, translate }) {
  const raw = conicEqualAreaRaw(parallels[0] * RAD, parallels[1] * RAD);
  const [cx, cy] = raw(center[0] * RAD, center[1] * RAD);
  const dx = translate[0] - scale * cx;
  const dy = translate[1] + scale * cy;
  return ([lon, lat]) => {
    let lambda = (lon + rotateLon) * RAD;
    // Keep longitudes in [-pi, pi] so geometry near the antimeridian (the
    // Aleutians) doesn't project to the far side of the map.
    if (lambda > Math.PI) lambda -= 2 * Math.PI;
    else if (lambda < -Math.PI) lambda += 2 * Math.PI;
    const p = raw(lambda, lat * RAD);
    return [scale * p[0] + dx, dy - scale * p[1]];
  };
}

const K = 1300;
const TX = 487.5;
const TY = 305;
const EPS = 0.01;

// Each inset is a separate conic projection plus the clip box d3 uses to keep
// it inside its corner of the frame. Alaska's box legitimately extends left of
// x=0 (it is what trims the Aleutian chain); the viewBox clips the remainder.
const PROJECTIONS = {
  lower48: {
    project: conicProjection({
      parallels: [29.5, 45.5], rotateLon: 96, center: [-0.6, 38.7],
      scale: K, translate: [TX, TY],
    }),
    clip: [TX - 0.455 * K, TY - 0.238 * K, TX + 0.455 * K, TY + 0.238 * K],
  },
  alaska: {
    project: conicProjection({
      parallels: [55, 65], rotateLon: 154, center: [-2, 58.5],
      scale: K * 0.35, translate: [TX - 0.307 * K, TY + 0.201 * K],
    }),
    clip: [
      TX - 0.425 * K + EPS, TY + 0.120 * K + EPS,
      TX - 0.214 * K - EPS, TY + 0.234 * K - EPS,
    ],
  },
  hawaii: {
    project: conicProjection({
      parallels: [8, 18], rotateLon: 157, center: [-3, 19.9],
      scale: K, translate: [TX - 0.205 * K, TY + 0.212 * K],
    }),
    clip: [
      TX - 0.214 * K + EPS, TY + 0.166 * K + EPS,
      TX - 0.115 * K - EPS, TY + 0.234 * K - EPS,
    ],
  },
};

const projectionFor = (stateFips) =>
  stateFips === '02' ? PROJECTIONS.alaska
    : stateFips === '15' ? PROJECTIONS.hawaii
      : PROJECTIONS.lower48;

// --- Rectangle clipping ----------------------------------------------------
// Sutherland-Hodgman. Rings that stray outside their inset's box (the Aleutians,
// the northwestern Hawaiian islands) are trimmed to the box edge rather than
// dropped, so partially visible land still draws correctly.
function clipRing(ring, [x0, y0, x1, y1]) {
  const edges = [
    (p) => p[0] >= x0, (p) => p[0] <= x1,
    (p) => p[1] >= y0, (p) => p[1] <= y1,
  ];
  const intersect = [
    (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])],
    (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1],
  ];

  let out = ring;
  for (let e = 0; e < 4; e++) {
    if (!out.length) return [];
    const inside = edges[e];
    const cut = intersect[e];
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const cur = out[i];
      const prev = out[(i + out.length - 1) % out.length];
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) next.push(cut(prev, cur));
        next.push(cur);
      } else if (prevIn) {
        next.push(cut(prev, cur));
      }
    }
    out = next;
  }
  return out;
}

// --- Simplification --------------------------------------------------------
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    if (last - first < 2) continue;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;

    let maxDist = -1;
    let maxIdx = -1;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      let dist;
      if (len2 === 0) {
        dist = Math.hypot(px - ax, py - ay);
      } else {
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > tolerance) {
      keep[maxIdx] = 1;
      stack.push([first, maxIdx], [maxIdx, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// --- Path building ---------------------------------------------------------
// Output coordinates are integers on the 975x610 grid: worst-case error is half
// a unit, sub-pixel at any width the map actually renders at, and it keeps every
// number to three digits. Snapping to a shared grid also pulls the independently
// generalized borders of neighbouring counties back onto identical vertices.
function quantize(points) {
  const out = [];
  for (const [x, y] of points) {
    const p = [Math.round(x), Math.round(y)];
    const prev = out[out.length - 1];
    if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
    out.push(p);
  }
  // A closed ring's last point repeats its first; 'Z' re-closes it for us.
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) out.pop();
  }

  // Snapping to the grid can fold a narrow neck back on itself, leaving an
  // A-B-A spur. The spur encloses no area, but it makes the ring
  // self-intersecting, and under the nonzero fill rule a self-intersecting ring
  // can leave an unfilled sliver — which showed up as thin light slashes across
  // the interiors of large western counties. Collapsing the spurs removes them.
  // Repeated because removing one spur can expose another.
  for (let changed = true; changed && out.length > 2; ) {
    changed = false;
    for (let i = 0; i < out.length && out.length > 2; ) {
      const prev = out[(i + out.length - 1) % out.length];
      const next = out[(i + 1) % out.length];
      if (prev[0] === next[0] && prev[1] === next[1]) {
        // Drop both the spur tip and one of its duplicate neighbours.
        out.splice(i, 1);
        out.splice(i % out.length, 1);
        changed = true;
      } else {
        i++;
      }
    }
  }
  return out;
}

// After the initial moveto, SVG reads bare coordinate pairs as implicit
// linetos, so the per-point "L" can be dropped.
function ringToPath(pts) {
  // Fewer than 3 distinct points encloses no area and would render as nothing.
  if (pts.length < 3) return '';
  let d = 'M' + pts[0][0] + ' ' + pts[0][1];
  for (let i = 1; i < pts.length; i++) d += ' ' + pts[i][0] + ' ' + pts[i][1];
  return d + 'Z';
}

// GeoJSON Polygon is [ring...]; MultiPolygon is [[ring...]...]. Interior rings
// (holes) come through as-is and the paths use the default nonzero fill rule,
// which is what GeoJSON winding expects.
function featureToPath(geometry, { project, clip }, { minMark = 0 } = {}) {
  if (!geometry) return '';
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let d = '';
  const all = [];
  for (const rings of polys) {
    for (const ring of rings) {
      const projected = clipRing(ring.map(project), clip);
      if (projected.length < 3) continue;
      all.push(...projected);
      d += ringToPath(quantize(simplify(projected, TOLERANCE)));
    }
  }

  // Virginia's smallest independent cities are only a couple of square miles —
  // below one grid unit, so they quantize away to nothing. A national county
  // map cannot render them at true size at any resolution, and dropping them
  // would silently leave holes in an otherwise complete dataset, so they get a
  // minimum-size mark at their centre instead. Deliberately slightly oversized
  // so they remain visible and hoverable.
  if (!d && minMark && all.length) {
    const cx = Math.round(all.reduce((a, p) => a + p[0], 0) / all.length);
    const cy = Math.round(all.reduce((a, p) => a + p[1], 0) / all.length);
    const r = minMark;
    d = `M${cx - r} ${cy} ${cx} ${cy - r} ${cx + r} ${cy} ${cx} ${cy + r}Z`;
  }
  return d;
}

// --- Fetching --------------------------------------------------------------
async function fetchLayer(layer, stateFips, fields) {
  const url =
    `${BASE}/${layer}/query?where=${encodeURIComponent(`STATE='${stateFips}'`)}` +
    `&outFields=${fields}&outSR=4326&maxAllowableOffset=${OFFSET}` +
    `&geometryPrecision=5&f=geojson`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || 'service error');
      if (json.properties?.exceededTransferLimit) {
        throw new Error(`transfer limit hit for state ${stateFips} — raise --offset`);
      }
      return json.features || [];
    } catch (err) {
      if (attempt === 3) throw new Error(`state ${stateFips}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return [];
}

// --- Validation ------------------------------------------------------------
// us-atlas publishes the same geography rendered through d3's own geoAlbersUsa.
// Comparing a handful of counties that did not change between vintages catches
// any error in the projection port above — a wrong parallel or a missing
// rotation shows up as a large offset here.
async function checkProjection(counties) {
  const SAMPLES = { '06037': 'Los Angeles CA', '48201': 'Harris TX', '36061': 'New York NY', '02090': 'Fairbanks AK', '15003': 'Honolulu HI' };
  const bounds = (d) => {
    const nums = d.match(/-?\d+/g).map(Number);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < nums.length; i += 2) {
      x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]);
      y0 = Math.min(y0, nums[i + 1]); y1 = Math.max(y1, nums[i + 1]);
    }
    return [(x0 + x1) / 2, (y0 + y1) / 2];
  };

  let ref;
  try {
    const res = await fetch('https://unpkg.com/us-atlas@3/counties-albers-10m.json');
    ref = await res.json();
  } catch {
    console.warn('  (skipped — could not fetch us-atlas reference)');
    return;
  }

  const [sx, sy] = ref.transform.scale;
  const [tx, ty] = ref.transform.translate;
  const arcs = ref.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
  });

  let worst = 0;
  for (const geom of ref.objects.counties.geometries) {
    if (!SAMPLES[geom.id] || !counties[geom.id]) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.arcs;
    for (const rings of polys) {
      for (const ring of rings) {
        for (const i of ring) {
          for (const [x, y] of arcs[i < 0 ? ~i : i]) {
            x0 = Math.min(x0, x); x1 = Math.max(x1, x);
            y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          }
        }
      }
    }
    const mine = bounds(counties[geom.id]);
    const dist = Math.hypot(mine[0] - (x0 + x1) / 2, mine[1] - (y0 + y1) / 2);
    worst = Math.max(worst, dist);
    console.log(`  ${SAMPLES[geom.id].padEnd(16)} delta ${dist.toFixed(2)} units`);
  }
  if (worst > 3) {
    throw new Error(`Projection check FAILED — worst centroid delta ${worst.toFixed(2)} units`);
  }
  console.log(`  OK — worst delta ${worst.toFixed(2)} units (tolerance 3)`);
}

// --- Main ------------------------------------------------------------------
console.log(`Fetching ${STATE_FIPS.length} states from TIGERweb ACS2024 (offset ${OFFSET})`);

const counties = {};
const stateBorders = {};
let skipped = 0;

for (const fips of STATE_FIPS) {
  const proj = projectionFor(fips);

  const countyFeatures = await fetchLayer(COUNTY_LAYER, fips, 'GEOID,NAME');
  for (const f of countyFeatures) {
    const id = f.properties?.GEOID;
    if (!id) continue;
    const d = featureToPath(f.geometry, proj, { minMark: 2 });
    if (d) counties[id] = d;
    else { skipped++; console.warn(`  no drawable path for ${id} ${f.properties?.NAME}`); }
  }

  const stateFeatures = await fetchLayer(STATE_LAYER, fips, 'GEOID');
  for (const f of stateFeatures) {
    const d = featureToPath(f.geometry, proj);
    if (d) stateBorders[fips] = d;
  }

  process.stdout.write(`  ${fips}: ${countyFeatures.length} counties\r`);
}

console.log(`\nProjected ${Object.keys(counties).length} counties${skipped ? `, ${skipped} skipped` : ''}`);

console.log('Validating projection against us-atlas:');
await checkProjection(counties);

const out = {
  source: `${BASE} (layers ${COUNTY_LAYER}, ${STATE_LAYER})`,
  vintage: 'ACS2024',
  offset: OFFSET,
  tolerance: TOLERANCE,
  viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
  counties,
  // Kept per-state rather than merged so the outline can be stroked without
  // any one state's border being lost inside a single mega-path.
  stateBorders,
};

const json = JSON.stringify(out);
writeFileSync(OUT, json);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(
  `Wrote ${OUT}\n  raw ${kb(json.length)} · gzip ${kb(gzipSync(json, { level: 9 }).length)} · ` +
    `brotli ${kb(brotliCompressSync(json).length)}`
);
