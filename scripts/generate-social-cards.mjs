// Generate the committed social-share cards (og:image).
//
//   node scripts/generate-social-cards.mjs           # make missing cards
//   node scripts/generate-social-cards.mjs --force   # regenerate all
//
// Outputs to public/social/:
//   painbeacon-home.png        site-wide default card — the home screen, 1200×630
//   <article-slug>.png         one card per src/content/articles/*.md, 1200×1200
//
// TWO SHAPES, ON PURPOSE.
//
// Article cards are square. Facebook/LinkedIn/WhatsApp crop tall or wide images,
// and a 1200×1200 card survives every platform uncropped — worth it for a card
// whose whole job is to carry a long headline.
//
// The site card is 1200×630 (1.91:1), the shape every platform's link preview is
// actually built around. The old square site card was letterboxed or center-cropped
// into that slot, which cut the headline off. This one is the home screen instead
// of a separate graphic: same hero photograph, same scrim, same words, same search
// field, same trust line — so a shared link previews as the page it opens.
//
// Deliberately NO clinic count on the site card, even though the home screen leads
// with one. The card is committed, but the count comes from Supabase at build time
// and moves between deploys; a baked-in number would keep traveling through link
// caches and chat logs long after it stopped being true. (Area cards can carry
// counts — see scripts/area-cards.mjs — because they are generated per build.)
//
// Run this after adding a weekly article, then commit the new PNG alongside the .md.
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import matter from 'gray-matter';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(root, 'public', 'social');
const ART = path.join(root, 'public', 'brand', 'hero-spine-2x.jpg');
// The photograph the home page actually runs behind its hero.
const HERO = path.join(root, 'public', 'brand', 'hero-clinic-wide.jpg');
const LOGO = path.join(root, 'public', 'brand', 'painbeacon-logo-horizontal-dark.svg');
const ARTICLES = path.join(root, 'src', 'content', 'articles');
const SIZE = 1200;
const CARD_W = 1200;
const CARD_H = 630;
const FORCE = process.argv.includes('--force');

const FONT = `-apple-system, 'Segoe UI', Arial, sans-serif`;

// Rough word-wrap for SVG text (no layout engine): estimate ~0.52em per char
// for the bold face and break greedily.
function wrap(text, fontSize, maxWidth) {
  const perChar = fontSize * 0.52;
  const maxChars = Math.floor(maxWidth / perChar);
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const cand = line ? `${line} ${w}` : w;
    if (cand.length > maxChars && line) { lines.push(line); line = w; }
    else line = cand;
  }
  if (line) lines.push(line);
  return lines;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Text block SVG overlaid on the darkened art. `title` wraps; shrink the font
// until it fits in 4 lines.
function overlaySvg({ eyebrow, title, footer }) {
  let fontSize = 84;
  let lines = wrap(title, fontSize, SIZE - 160);
  while (lines.length > 4 && fontSize > 48) {
    fontSize -= 8;
    lines = wrap(title, fontSize, SIZE - 160);
  }
  const lineH = fontSize * 1.18;
  const blockH = lines.length * lineH;
  const baseY = SIZE - 120 - blockH; // text block sits above the footer line

  return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#07222e" stop-opacity="0.18"/>
      <stop offset="0.45" stop-color="#07222e" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#07222e" stop-opacity="0.94"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#scrim)"/>
  <text x="80" y="${baseY - 34}" font-family="${FONT}" font-size="30" font-weight="600"
        letter-spacing="6" fill="#2fd4bf">${esc(eyebrow.toUpperCase())}</text>
  ${lines
    .map(
      (l, i) => `<text x="80" y="${baseY + lineH * (i + 0.8)}" font-family="${FONT}"
        font-size="${fontSize}" font-weight="700" fill="#ffffff">${esc(l)}</text>`
    )
    .join('\n  ')}
  <text x="80" y="${SIZE - 64}" font-family="${FONT}" font-size="32" font-weight="500"
        fill="#cfe0de">${esc(footer)}</text>
</svg>`;
}

async function makeCard(outFile, { eyebrow, title, footer }) {
  const out = path.join(OUT_DIR, outFile);
  if (existsSync(out) && !FORCE) {
    console.log(`skip (exists)  ${outFile}`);
    return;
  }
  // Spine art: portrait, spine slightly right of center — cover-crop to square.
  const bg = await sharp(ART).resize(SIZE, SIZE, { fit: 'cover', position: 'center' }).toBuffer();
  // Logo (cream on transparent) scaled for the top-left corner.
  const logo = await sharp(LOGO, { density: 300 }).resize({ width: 400 }).png().toBuffer();

  await sharp(bg)
    .composite([
      { input: Buffer.from(overlaySvg({ eyebrow, title, footer })), top: 0, left: 0 },
      { input: logo, top: 72, left: 76 },
    ])
    .png({ quality: 90 })
    .toFile(out);
  console.log(`wrote          ${outFile}`);
}

/**
 * Cover-crop like CSS `object-fit: cover` + `object-position: x% y%`, so the
 * card frames the photograph exactly where the hero band does.
 */
async function coverCrop(file, w, h, posX, posY) {
  const meta = await sharp(file).metadata();
  const scale = Math.max(w / meta.width, h / meta.height);
  const sw = Math.max(w, Math.round(meta.width * scale));
  const sh = Math.max(h, Math.round(meta.height * scale));
  return sharp(file)
    .resize(sw, sh)
    .extract({
      left: Math.round((sw - w) * posX),
      top: Math.round((sh - h) * posY),
      width: w,
      height: h,
    })
    .toBuffer();
}

/**
 * The home screen, as a 1.91:1 link preview.
 *
 * Everything here is transcribed from the real hero rather than reinvented:
 * the scrim stops mirror `.hero-dark::before`, the colors are the same hex
 * values as `.hero-dark`, and the words are the ones the page ships.
 *
 * Type is sized so it still fits when the renderer falls back to a wide face.
 * There is no font here that a build machine is guaranteed to have — sharp
 * renders SVG through librsvg with whatever fontconfig offers — so every line
 * is laid out against a pessimistic ~0.62em-per-character estimate, and the
 * headline breaks at fixed points instead of being measured. Widest realistic
 * line ("Find the right" at 66px) lands near 573px inside a 700px column.
 */
async function makeHomeCard(outFile) {
  const out = path.join(OUT_DIR, outFile);
  if (existsSync(out) && !FORCE) {
    console.log(`skip (exists)  ${outFile}`);
    return;
  }

  // object-position: 68% 28% — holds the clinician right of the copy column.
  const bg = await coverCrop(HERO, CARD_W, CARD_H, 0.68, 0.28);
  const logo = await sharp(LOGO, { density: 300 }).resize({ width: 330 }).png().toBuffer();

  await sharp(bg)
    .composite([
      { input: Buffer.from(homeCardSvg()), top: 0, left: 0 },
      { input: logo, top: 44, left: 72 },
    ])
    .png({ quality: 90 })
    .toFile(out);
  console.log(`wrote          ${outFile}  ${CARD_W}×${CARD_H}`);
}

function homeCardSvg() {
  const M = 72; // left margin, same optical position as the hero copy column
  // Headline breaks into three lines rather than the page's two: at card size
  // the page's first line ("Find the right pain clinic") would run under the
  // clinician. Same words, same teal emphasis, one extra break.
  const head = [
    { text: 'Find the right', fill: '#ffffff' },
    { text: 'pain clinic', fill: '#2fd4bf' },
    { text: 'near you.', fill: '#ffffff' },
  ];
  const headSize = 66;
  const headLead = 76;
  const headTop = 268; // baseline of the first line

  // Trust line, shortened from the hero's three items so it clears the margin
  // even in a wide fallback face. <tspan> keeps the emphasis inline, so the
  // renderer measures the run instead of us guessing where each item starts.
  const trust = [
    { text: 'No pay-to-rank', bold: true },
    { text: ' · Built on the ', bold: false },
    { text: 'federal NPI registry', bold: true },
    { text: ' · ', bold: false },
    { text: 'Verified', bold: true },
    { text: ' reviews & credentials', bold: false },
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <!-- .hero-dark::before, second layer: copy column over the near-opaque end,
         clinician left readable at the open end. -->
    <linearGradient id="side" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#07222e" stop-opacity="0.97"/>
      <stop offset="0.36" stop-color="#07222e" stop-opacity="0.94"/>
      <stop offset="0.58" stop-color="#07222e" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#0a2c38" stop-opacity="0.32"/>
    </linearGradient>
    <!-- ...first layer: keeps the small-print trust strip off the bright end. -->
    <linearGradient id="foot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.74" stop-color="#07222e" stop-opacity="0"/>
      <stop offset="0.86" stop-color="#07222e" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#07222e" stop-opacity="0.62"/>
    </linearGradient>
  </defs>

  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#side)"/>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#foot)"/>

  <text x="${M}" y="192" font-family="${FONT}" font-size="21" font-weight="600"
        letter-spacing="3.4" fill="#5fd8c8">INDEPENDENT NATIONAL DIRECTORY</text>

  ${head
    .map(
      (l, i) => `<text x="${M}" y="${headTop + i * headLead}" font-family="${FONT}"
        font-size="${headSize}" font-weight="700" fill="${l.fill}">${esc(l.text)}</text>`
    )
    .join('\n  ')}

  <rect x="${M}" y="460" width="560" height="58" rx="8" fill="#fffefb"/>
  <text x="${M + 20}" y="497" font-family="${FONT}" font-size="18" fill="#7c8a87"
        >${esc('Search a city or ZIP — e.g. Providence or 02906')}</text>

  <rect x="${M}" y="556" width="${CARD_W - M * 2}" height="1" fill="#f7f4ed" fill-opacity="0.14"/>
  ${/* xml:space="preserve" or librsvg eats the spaces that separate the runs,
       welding "No pay-to-rank" onto the separator that follows it. */ ''}
  <text x="${M}" y="592" xml:space="preserve" font-family="${FONT}" font-size="18" fill="#cfe0de">${trust
    .map(
      (t) =>
        `<tspan${t.bold ? ' font-weight="600" fill="#ffffff"' : ''}>${esc(t.text)}</tspan>`
    )
    .join('')}</text>
</svg>`;
}

mkdirSync(OUT_DIR, { recursive: true });

// Site-wide default card — the home screen (home + every non-article page).
await makeHomeCard('painbeacon-home.png');

// One card per article.
for (const f of readdirSync(ARTICLES).filter((f) => f.endsWith('.md'))) {
  const slug = f.replace(/\.md$/, '');
  const { data } = matter(readFileSync(path.join(ARTICLES, f), 'utf8'));
  await makeCard(`${slug}.png`, {
    eyebrow: data.category || 'News & guides',
    title: data.title,
    footer: 'painbeacon.com/news',
  });
}
