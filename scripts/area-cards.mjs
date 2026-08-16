/**
 * State and area (zone) social cards — runs AFTER `astro build`, writing into
 * dist/social/area/. Wired into `npm run build`.
 *
 * WHY BUILD-TIME AND NOT COMMITTED, unlike the fertility site's clinic cards:
 * this directory's data comes from Supabase at build time and changes between
 * deploys, so a committed card would drift from the page it represents — and a
 * stale card is worse than none, because it travels without the page that would
 * correct it. Generating into dist ties every card to the exact data that built
 * the page beside it, and commits nothing.
 *
 * WHY AREAS AND NOT CLINICS: there are ~12.5k clinic profiles. At ~13 KB a card
 * that is roughly 165 MB per build for pages that individually attract little
 * sharing. The ~55 state and ~930 area pages are the ones that rank and get
 * linked, and they come to ~13 MB.
 *
 * Cards carry only counts and names — never a rating or a rank — because a card
 * outlives the data behind it in caches and chat logs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { getClinics, groupBy, stateName, titleCase } from '../src/lib/data.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'dist/social/area');

const T = {
  bg: '#fbf9f4', ink: '#1a1a17', ink2: '#4a4741', muted: '#7c776d',
  accent: '#0f766e', hair: '#e3ddcf',
};
const SANS = "'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif";
const DISPLAY = "Montserrat,'IBM Plex Sans',system-ui,sans-serif";

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function wrap(text, maxChars, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/[,\s]+$/, '') + '…';
  }
  return lines;
}

function shell({ kicker, titleLines, statBig, statLabel, bullets, footer }) {
  const titleY = titleLines.length === 1 ? 236 : 196;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${T.bg}"/>
  <rect width="1200" height="9" fill="${T.accent}"/>

  ${/* Tagline is RIGHT-aligned rather than offset from the wordmark: the
       renderer has no Montserrat and falls back to a wider face, so a fixed
       x-offset put the two strings on top of each other. */ ''}
  <text x="64" y="76" font-family="${DISPLAY}" font-size="26" font-weight="800" fill="${T.ink}">PainBeacon</text>
  <text x="1136" y="76" text-anchor="end" font-family="${SANS}" font-size="15" fill="${T.muted}">Independent · no pay-to-rank</text>

  <text x="64" y="150" font-family="${SANS}" font-size="16" letter-spacing="2.4" fill="${T.accent}">${esc(kicker)}</text>
  ${titleLines.map((l, i) => `<text x="64" y="${titleY + i * 52}" font-family="${DISPLAY}" font-size="46" font-weight="700" fill="${T.ink}">${esc(l)}</text>`).join('')}

  <g transform="translate(64,330)">
    <text x="0" y="0" font-family="${DISPLAY}" font-size="72" font-weight="800" fill="${T.accent}">${esc(statBig)}</text>
    <text x="0" y="34" font-family="${SANS}" font-size="19" fill="${T.ink2}">${esc(statLabel)}</text>
  </g>

  <g transform="translate(64,430)">
    ${bullets.map((b, i) => `<text x="0" y="${i * 34}" font-family="${SANS}" font-size="20" fill="${T.ink2}">${esc(b)}</text>`).join('')}
  </g>

  <rect x="64" y="566" width="1072" height="1" fill="${T.hair}"/>
  <text x="64" y="596" font-family="${SANS}" font-size="16" fill="${T.muted}">${esc(footer)}</text>
  <text x="1136" y="596" text-anchor="end" font-family="${SANS}" font-size="16" fill="${T.muted}">painbeacon.com</text>
</svg>`;
}

const render = async (svg, file) => {
  const buf = await sharp(Buffer.from(svg))
    .png({ palette: true, colors: 32, compressionLevel: 9, effort: 7 })
    .toBuffer();
  fs.writeFileSync(file, buf);
  return buf.length;
};

/**
 * NEVER fail the deploy over a social card.
 *
 * This runs after `astro build` in the same npm script, so an exception here
 * would take the whole build down and the site would stop shipping — trading a
 * working deploy for a cosmetic asset. Cards are nice; publishing is the job.
 * Anything that goes wrong is reported loudly and exits 0 with the built site
 * intact, falling back to the generic card that every page had before.
 */
async function main() {
const clinics = await getClinics();
const primaries = clinics.filter((c) => c.isPrimary);
const byState = groupBy(primaries, (c) => c.stateSlug);

fs.mkdirSync(OUT, { recursive: true });
let count = 0;
let bytes = 0;
const started = Date.now();

for (const [stateSlugKey, list] of byState) {
  const abbr = list[0].state;
  const name = stateName(abbr);
  const zoned = list.filter((c) => c.zoneSlug);
  const byZone = groupBy(zoned, (c) => c.zoneSlug);

  const topAreas = [...byZone.values()]
    .map((z) => ({ label: z[0].zoneLabel, n: z.length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((a) => `${a.label} — ${a.n}`);

  bytes += await render(
    shell({
      kicker: 'PAIN CLINIC DIRECTORY',
      titleLines: wrap(`Pain clinics in ${name}`, 28, 2),
      statBig: String(list.length),
      statLabel: `clinics across ${byZone.size} area${byZone.size === 1 ? '' : 's'}`,
      bullets: topAreas.length ? ['Largest areas:', ...topAreas] : [],
      footer: 'Built on the federal NPI registry',
    }),
    path.join(OUT, `${stateSlugKey}.png`)
  );
  count++;

  for (const [, zlist] of byZone) {
    const z0 = zlist[0];
    const cities = [...new Set(zlist.map((c) => c.cityLabel).filter(Boolean))].slice(0, 3);
    bytes += await render(
      shell({
        kicker: `${esc(name).toUpperCase()} · PAIN CLINICS`,
        titleLines: wrap(`${z0.zoneLabel}`, 26, 2),
        statBig: String(zlist.length),
        statLabel: `clinic${zlist.length === 1 ? '' : 's'} in this area`,
        bullets: cities.length ? [`Includes ${cities.map(titleCase).join(', ')}`] : [],
        footer: 'Ranked on published, objective criteria',
      }),
      path.join(OUT, `${z0.stateSlug}-${z0.zoneUrlSlug}.png`)
    );
    count++;
    if (count % 200 === 0) process.stdout.write(`\r  ${count} cards`);
  }
}

process.stdout.write('\r');
console.log(`area cards: ${count}`);
console.log(`  total ${(bytes / 1024 / 1024).toFixed(1)} MB · average ${(bytes / count / 1024).toFixed(1)} KB`);
console.log(`  ${((Date.now() - started) / 1000).toFixed(0)}s`);
console.log(`-> dist/social/area/`);
}

try {
  await main();
} catch (err) {
  console.error('\n!! area card generation FAILED — deploying without them.');
  console.error('   Pages fall back to the generic site card; nothing else is affected.');
  console.error(`   ${err?.stack || err}`);
  process.exit(0);
}
