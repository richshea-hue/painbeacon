// Run: node scripts/build_pin_svg.mjs
//
// Derives public/brand/painbeacon-pin.svg from the real horizontal logo, so the
// map pin can never drift from the brand again — re-run it if the logo changes.
//
// The logo's mark is already a beacon: a ring with a downward triangle below it,
// which is a map pin. The dark-variant artwork draws the glyph in cream + teal
// for a dark background, so filling the ring solid navy reuses it unchanged.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(`${REPO}/public/brand/painbeacon-logo-horizontal-dark.svg`, 'utf8');

// The mark is the first top-level <g>; the wordmark groups follow it.
const markStart = src.indexOf('<g transform="translate(50.00,50.00)');
const markEnd = src.indexOf('<g transform="translate(494.16,174.99)');
const mark = src.slice(markStart, markEnd);

const circle = mark.match(/<circle[^>]*\/>/)[0];
const cx = +circle.match(/cx="([\d.]+)"/)[1];
const cy = +circle.match(/cy="([\d.]+)"/)[1];
const r = +circle.match(/r="([\d.]+)"/)[1];
const strokeW = +circle.match(/stroke-width="([\d.]+)"/)[1];

// The tail triangle sits directly after the circle.
const tail = mark.match(/<path d="M [^"]*Z"[^>]*\/>/)[0];
const tailD = tail.match(/d="([^"]*)"/)[1];

// Both glyph groups, kept exactly as authored (cream body + teal accents).
const glyphGroups = [...mark.matchAll(/<g transform="translate\(0\.0+,1040\.0+\) scale\([^)]*\)">[\s\S]*?<\/g>/g)]
  .map((m) => m[0]);
if (glyphGroups.length !== 2) throw new Error(`expected 2 glyph groups, got ${glyphGroups.length}`);

// Solid disc replaces the ring: outer edge of the stroked ring becomes the fill
// radius, so the mark keeps its silhouette.
const discR = r + strokeW / 2;

// Tight frame around disc + tail, with a little breathing room for the shadow.
const tailBottom = Math.max(...tailD.match(/[\d.]+/g).map(Number).filter((_, i) => i % 2 === 1));
const pad = 12;
const minX = cx - discR - pad;
const minY = cy - discR - pad;
const w = discR * 2 + pad * 2;
const h = tailBottom - (cy - discR) + pad * 2;

const NAVY = '#0f2e3a';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="Pain clinic location">
<circle cx="${cx}" cy="${cy}" r="${discR.toFixed(1)}" fill="${NAVY}"/>
<path d="${tailD}" fill="${NAVY}"/>
${glyphGroups.join('\n')}
</svg>
`;

writeFileSync(`${REPO}/public/brand/painbeacon-pin.svg`, svg);
console.log(`wrote painbeacon-pin.svg — ${(svg.length / 1024).toFixed(0)} KB`);
console.log(`  disc r=${discR.toFixed(1)} at ${cx},${cy} · viewBox ${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
console.log(`  aspect ratio ${(w / h).toFixed(3)} -> at 38px wide, ${Math.round((38 * h) / w)}px tall`);
