// Shoot the home page and crop it to the site's share card (og:image).
//
//   npm run build                        # the card is shot from dist/, so build first
//   node scripts/home-share-card.mjs     # -> public/social/painbeacon-home.png
//   node scripts/home-share-card.mjs --hero   # tighter crop, hero band only
//
// WHY A SCREENSHOT AND NOT A DRAWN CARD. The previous site card was a separate
// 1200×1200 graphic, and every link preview surface is built around 1.91:1 — so
// it arrived letterboxed, or center-cropped through its middle, cutting off the
// headline along its bottom edge. Redrawing it wider would have fixed the shape
// and still shipped a graphic nobody sees anywhere else. Shooting the real page
// means the preview shows what the link opens: the search field, the clinician,
// the headline, the trust line, in the real typefaces, at the real spacing. It
// also cannot drift from the design — restyle the hero and re-run this.
//
// THE CROP IS FOUND, NOT HARD-CODED. The card must be exactly 1.91:1 or the
// platforms crop it again. Rather than pin pixel coordinates that a design tweak
// would silently invalidate, this measures the region it wants and then picks the
// viewport width at which that region is already 1.91:1, so the shot needs no
// cropping and nothing is squeezed. Today that lands at ~1264px wide for the
// default crop. Shot at 2× and downsampled to 1200×630, so type stays crisp.
//
// ONE SUBSTITUTION, AND ONLY ONE. The hero's eyebrow is a live clinic count
// ("12,431 pain clinics · 54 states and territories"). It comes from Supabase at
// build time and moves every deploy, but this card is committed and then cached
// by scrapers for months — the number would be wrong long before anyone noticed.
// So the eyebrow is replaced with the site's standing claim, which does not
// expire. Everything else in the frame is the page as it ships. (Area cards can
// carry live counts — see scripts/area-cards.mjs — because they are regenerated
// on every build.)
//
// REQUIREMENTS. playwright-core plus a Chromium/Chrome on the machine; set
// CHROME_PATH if it is not in one of the usual places. Deliberately NOT wired
// into `npm run build`: the deploy builder has no browser, and the card changes
// about as often as the hero does. Re-run it by hand after a hero redesign and
// commit the PNG.
import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright-core';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(root, 'dist');
const OUT = path.join(root, 'public', 'social', 'painbeacon-home.png');

const CARD_W = 1200;
const CARD_H = 630;
const RATIO = CARD_H / CARD_W; // 0.525 — the 1.91:1 every link preview expects

// Default crop starts at the top of the page, so the card reads as the site:
// masthead, trust bar, hero. `--hero` drops the chrome and frames the hero band
// alone, which makes the headline and search field bigger in the thumbnail.
const HERO_ONLY = process.argv.includes('--hero');

// The eyebrow's live count, swapped for a claim that does not go stale. See the
// note at the top of this file.
const EYEBROW = 'Independent national directory of pain clinics';

// Chromium is a machine dependency, not an npm one — playwright-core ships no
// browser. Look where one usually is, and say so plainly when there isn't one.
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function findChrome() {
  const hit = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (hit) return hit;
  console.error('No Chromium found. Install Chrome, or point CHROME_PATH at one:');
  console.error('  CHROME_PATH=/path/to/chrome node scripts/home-share-card.mjs');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml',
};

// Serve dist/ rather than running `astro dev`: the card should be shot from the
// same artifact that deploys, and a dev server re-renders through Vite.
function serveDist() {
  const server = createServer((req, res) => {
    let file = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(DIST)) return res.writeHead(403).end();
    if (existsSync(file) && !path.extname(file)) file = path.join(file, 'index.html');
    if (!existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/**
 * Load the page at `width` and report the crop box, with the eyebrow already
 * swapped so the measurement matches what gets shot.
 */
async function measure(browser, port, width) {
  // Tall viewport on purpose: the fixed lead-chat bubble anchors to the bottom
  // of the viewport, and this keeps it well below the crop.
  const page = await browser.newPage({ viewport: { width, height: 1200 }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.evaluate((eyebrow) => {
    const el = document.querySelector('.hero-dark .eyebrow');
    if (el) el.textContent = eyebrow;
  }, EYEBROW);
  // Webfonts change every measurement below, so settle them before measuring.
  await page.evaluate(() => document.fonts.ready);
  const box = await page.evaluate((heroOnly) => {
    const hero = document.querySelector('.hero-dark');
    const r = hero.getBoundingClientRect();
    return { top: heroOnly ? r.top + window.scrollY : 0, bottom: r.bottom + window.scrollY };
  }, HERO_ONLY);
  return { page, height: box.bottom - box.top, top: box.top };
}

const { server, port } = await serveDist();
if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html missing — run `npm run build` first.');
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: findChrome(),
  // Google Fonts serves the real typefaces; behind a sandbox proxy Chromium has
  // to be told about it, and told to leave the local dist server alone.
  ...(process.env.HTTPS_PROXY
    ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } }
    : {}),
});

// Solve for the width at which the crop is already 1.91:1. The region's height
// barely moves with width — the copy column is capped at 42rem — so this settles
// in two or three passes; the guard is for a future layout where it doesn't.
let width = Math.round(CARD_W / RATIO / 2); // ≈1143, a sane opening guess
let shot = null;
for (let pass = 0; pass < 6; pass++) {
  const { page, height, top } = await measure(browser, port, width);
  const want = Math.round(height / RATIO);
  if (Math.abs(want - width) <= 1) {
    shot = await page.screenshot({
      clip: { x: 0, y: top, width, height },
      scale: 'device', // 2× — downsampled below, so the type resolves
    });
    console.log(`crop  ${width}×${Math.round(height)} at 2×  (ratio ${(height / width).toFixed(4)})`);
    await page.close();
    break;
  }
  await page.close();
  // Never go below the 980px breakpoint: under it the hero reflows to a stacked
  // layout and the photograph leaves the background entirely.
  width = Math.max(1000, want);
}

if (!shot) {
  console.error('Could not settle on a 1.91:1 crop — the hero layout may have changed shape.');
  process.exit(1);
}

mkdirSync(path.dirname(OUT), { recursive: true });
await sharp(shot).resize(CARD_W, CARD_H, { fit: 'fill' }).png({ quality: 90 }).toFile(OUT);

await browser.close();
server.close();
console.log(`wrote ${path.relative(root, OUT)}  ${CARD_W}×${CARD_H}${HERO_ONLY ? '  (hero crop)' : ''}`);
