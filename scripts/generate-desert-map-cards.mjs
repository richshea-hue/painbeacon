// Generate the Pain Care Deserts social cards: a county choropleth of every
// U.S. county with no pain management clinic.
//
//   node scripts/generate-desert-map-cards.mjs
//
// Outputs to public/social/:
//   pain-care-deserts-og.png      1200×630  — og:image / twitter:summary_large_image
//   pain-care-deserts-square.png  1200×1200 — native image upload (X, Facebook, LinkedIn)
//
// Unlike generate-social-cards.mjs, this one can't build straight from
// src/lib/deserts.js: that path calls getClinics(), which falls back to
// FICTIONAL sample data when SUPABASE_URL isn't in the environment, and a map
// silently drawn from sample data would be a published falsehood. So the source
// of truth here is the CSV the live site already publishes from the real build,
// with a sanity check on the county count before anything is drawn.
//
// County geometry is us-atlas (Census cartographic boundaries, 1:10m), cached
// under scripts/.cache/ so repeat runs are offline.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import * as topo from 'topojson-client';
import * as d3 from 'd3-geo';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(root, 'public', 'social');
const CACHE = path.join(root, 'scripts', '.cache');

const CSV_URL = 'https://painbeacon.com/research/pain-care-deserts.csv';
const TOPO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';
const EXPECTED_COUNTIES = 3100; // 50 states + DC; refuse to draw anything less

// ---------------------------------------------------------------- data

async function cached(name, url) {
  mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, name);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const body = await res.text();
  writeFileSync(file, body);
  return body;
}

// The CSV is never cached — the study's numbers are the point of the card.
const csv = await (async () => {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`${CSV_URL} → HTTP ${res.status}`);
  return res.text();
})();

const rows = csv.trim().split('\n').slice(1).map((line) => {
  const m = line.match(/^(\d+),("[^"]*"|[^,]*),([A-Z]{2}),(\d+),(\d+),(\w+)$/);
  if (!m) throw new Error(`unparsable CSV row: ${line}`);
  return { fips: m[1], pop: +m[4], clinics: +m[5] };
});

if (rows.length < EXPECTED_COUNTIES) {
  throw new Error(
    `only ${rows.length} counties in ${CSV_URL} (expected ≥ ${EXPECTED_COUNTIES}). ` +
      `Refusing to draw a map from a partial build.`
  );
}

const clinicsByFips = new Map(rows.map((r) => [r.fips, r.clinics]));
const deserts = rows.filter((r) => r.clinics === 0);
const single = rows.filter((r) => r.clinics === 1);
const totalPop = rows.reduce((a, r) => a + r.pop, 0);
const desertPop = deserts.reduce((a, r) => a + r.pop, 0);

const STAT = {
  desertPct: Math.round((100 * deserts.length) / rows.length),
  desertCount: deserts.length.toLocaleString('en-US'),
  singleCount: single.length.toLocaleString('en-US'),
  desertPopM: (desertPop / 1e6).toFixed(0),
  desertPopPct: ((100 * desertPop) / totalPop).toFixed(1),
};
console.log(`[deserts] ${rows.length} counties ·`, STAT);

const us = JSON.parse(await cached('counties-10m.json', TOPO_URL));
const counties = topo.feature(us, us.objects.counties);
const nation = topo.feature(us, us.objects.nation);
const stateMesh = topo.mesh(us, us.objects.states, (a, b) => a !== b);
const countyMesh = topo.mesh(us, us.objects.counties, (a, b) => a !== b);

// ---------------------------------------------------------------- style

const C = {
  bg: '#0a2430',
  desert: '#2ec7ac', // 0 clinics — the story the map tells
  one: '#2a7f88', // exactly 1
  served: '#123c4b', // 2 or more
  unknown: '#102f3a', // territories / counties absent from the CSV
  stroke: '#0a2430',
  stateLine: 'rgba(255,255,255,0.22)',
  white: '#ffffff',
  soft: '#a9c6cb',
  faint: '#6f9099',
  teal: '#4fd8bd',
};
const FONT = `'Segoe UI Semibold','Segoe UI',Arial,sans-serif`;
const FONT_B = `'Segoe UI',Arial,sans-serif`;

const fillFor = (fips) => {
  const n = clinicsByFips.get(fips);
  if (n === undefined) return C.unknown;
  if (n === 0) return C.desert;
  if (n === 1) return C.one;
  return C.served;
};

// Draws the choropleth to fit inside the given box (AlbersUSA keeps its own
// aspect ratio, so it centres within whichever dimension is the constraint).
function mapSvg(x, y, w, h) {
  const path_ = d3.geoPath(d3.geoAlbersUsa().fitExtent([[x, y], [x + w, y + h]], nation));
  let out = '';
  for (const f of counties.features) {
    const d = path_(f);
    if (d) out += `<path d="${d}" fill="${fillFor(f.id)}"/>`;
  }
  // Borders as meshes so shared edges are stroked once, not twice.
  out += `<path d="${path_(countyMesh)}" fill="none" stroke="${C.stroke}" stroke-width="0.4" stroke-opacity="0.55"/>`;
  out += `<path d="${path_(stateMesh)}" fill="none" stroke="${C.stateLine}" stroke-width="1.1"/>`;
  return out;
}

const wordmark = (x, y, size) => `
  <text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="700" letter-spacing="${size * 0.02}">
    <tspan fill="${C.white}">PAIN</tspan><tspan fill="${C.teal}">BEACON</tspan><tspan fill="${C.white}">.COM</tspan>
  </text>`;

const LEGEND_ITEMS = [
  [C.desert, 'No pain clinic'],
  [C.one, 'Exactly 1 clinic'],
  [C.served, '2 or more'],
];

// dir 'v' stacks rows (gap = row height); dir 'h' runs across (gap = column width)
function legend(x, y, gap, fontSize, dir = 'v') {
  const sw = fontSize * 0.9;
  return LEGEND_ITEMS.map(([col, label], i) => {
    const cx = dir === 'h' ? x + i * gap : x;
    const cy = dir === 'h' ? y : y + i * gap;
    return `
    <rect x="${cx}" y="${cy}" width="${sw}" height="${sw}" rx="2" fill="${col}"/>
    <text x="${cx + sw + fontSize * 0.55}" y="${cy + sw * 0.82}" font-family="${FONT_B}"
      font-size="${fontSize}" fill="${C.soft}">${label}</text>`;
  }).join('');
}

const SOURCE = 'Source: PainBeacon analysis of the federal NPI registry (NPPES) &amp; U.S. Census county population estimates';

// ---------------------------------------------------------------- layouts

// 1200×630 — link unfurls on X/Facebook/LinkedIn. Text left, map right.
function ogCard() {
  const W = 1200, H = 630;
  const head = [`${STAT.desertPct}% of U.S. counties`, 'have no pain', 'management clinic'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${C.bg}"/>
    <rect width="${W}" height="5" fill="${C.teal}"/>
    ${mapSvg(430, 52, 760, 530)}
    ${wordmark(64, 92, 24)}
    ${head.map((t, i) => `<text x="64" y="${186 + i * 56}" font-family="${FONT}" font-size="47"
        font-weight="700" fill="${C.white}" letter-spacing="-0.8">${t}</text>`).join('')}
    <text x="64" y="380" font-family="${FONT_B}" font-size="25" font-weight="600" fill="${C.teal}">
      ${STAT.desertCount} counties · ${STAT.desertPopM} million people</text>
    <text x="64" y="416" font-family="${FONT_B}" font-size="19" fill="${C.soft}">
      Another ${STAT.singleCount} counties have exactly one.</text>
    ${legend(64, 470, 34, 17)}
    <text x="64" y="592" font-family="${FONT_B}" font-size="15" fill="${C.faint}">
      Source: PainBeacon analysis of the federal NPI registry &amp; Census county estimates</text>
    <text x="${W - 64}" y="592" text-anchor="end" font-family="${FONT_B}" font-size="15" fill="${C.faint}">
      painbeacon.com/research/pain-care-deserts</text>
  </svg>`;
}

// 1200×1200 — native image upload, where a square never gets cropped.
function squareCard() {
  const W = 1200, H = 1200;
  const head = [`${STAT.desertPct}% of U.S. counties have`, 'no pain management clinic'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${C.bg}"/>
    <rect width="${W}" height="6" fill="${C.teal}"/>
    ${wordmark(72, 108, 28)}
    ${head.map((t, i) => `<text x="72" y="${212 + i * 68}" font-family="${FONT}" font-size="58"
        font-weight="700" fill="${C.white}" letter-spacing="-1">${t}</text>`).join('')}
    <text x="72" y="366" font-family="${FONT_B}" font-size="30" font-weight="600" fill="${C.teal}">
      ${STAT.desertCount} counties · ${STAT.desertPopM} million Americans (${STAT.desertPopPct}% of the U.S.)</text>
    ${mapSvg(20, 380, 1160, 650)}
    ${legend(72, 1054, 232, 21, 'h')}
    <text x="72" y="1122" font-family="${FONT_B}" font-size="19" fill="${C.soft}">
      Free county-by-county dataset →</text>
    <text x="${W - 72}" y="1122" text-anchor="end" font-family="${FONT_B}" font-size="23"
      font-weight="600" fill="${C.white}">painbeacon.com/research/pain-care-deserts</text>
    <text x="72" y="1160" font-family="${FONT_B}" font-size="16" fill="${C.faint}">${SOURCE}</text>
  </svg>`;
}

// 360×360 — the /research index thumbnail, which renders at 180px on desktop
// and full-width on phones. Deliberately wordless: any caption sized to survive
// 180px would crowd the map, and at that size the teaser beside it is already
// carrying the numbers. The silhouette does the work — a US mostly lit up in
// teal reads as "most of the country" before you read anything.
function thumb() {
  const S = 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <rect width="${S}" height="${S}" fill="${C.bg}"/>
    ${mapSvg(12, 12, S - 24, S - 24)}
  </svg>`;
}

// ---------------------------------------------------------------- render

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, svg, w, h] of [
  ['pain-care-deserts-og', ogCard(), 1200, 630],
  ['pain-care-deserts-square', squareCard(), 1200, 1200],
  ['pain-care-deserts-thumb', thumb(), 720, 720], // 2x for retina
]) {
  // Rasterize at 2x so the type stays crisp, then downsample to the exact size.
  const out = path.join(OUT_DIR, `${name}.png`);
  const info = await sharp(Buffer.from(svg), { density: 144 })
    .resize(w, h)
    .png({ compressionLevel: 9, palette: true })
    .toFile(out);
  console.log(`[deserts] wrote public/social/${name}.png ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)}KB`);
}
