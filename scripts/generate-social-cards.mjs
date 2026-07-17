// Generate 1200×1200 social-share cards (og:image) from the brand spine art.
//
//   node scripts/generate-social-cards.mjs           # make missing cards
//   node scripts/generate-social-cards.mjs --force   # regenerate all
//
// Outputs to public/social/:
//   painbeacon-card.png        site-wide default card (home + every non-article page)
//   <article-slug>.png         one card per src/content/articles/*.md (title + category)
//
// Square (1:1) on purpose — Facebook/LinkedIn/WhatsApp crop tall or wide images,
// but a 1200×1200 card survives every platform uncropped. Run this after adding
// a weekly article, then commit the new PNG alongside the .md.
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import matter from 'gray-matter';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(root, 'public', 'social');
const ART = path.join(root, 'public', 'brand', 'hero-spine-2x.jpg');
const LOGO = path.join(root, 'public', 'brand', 'painbeacon-logo-horizontal-dark.svg');
const ARTICLES = path.join(root, 'src', 'content', 'articles');
const SIZE = 1200;
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
  const bg = await sharp(ART).resize(SIZE, SIZE, { fit: 'cover', position: 'centre' }).toBuffer();
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

mkdirSync(OUT_DIR, { recursive: true });

// Site-wide default card.
await makeCard('painbeacon-card.png', {
  eyebrow: 'Independent national directory',
  title: 'Find the right pain clinic near you.',
  footer: 'painbeacon.com',
});

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
