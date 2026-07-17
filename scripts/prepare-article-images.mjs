// Prepare an article's photo set from one or two source images.
//
//   node scripts/prepare-article-images.mjs <article-slug> \
//     --hero <src.jpg> --hero-name <seo-file-name> \
//     [--inline <src.jpg> --inline-name <seo-file-name>]
//
// Outputs to public/images/news/<article-slug>/:
//   <hero-name>-hero.jpg    1600×900  (16:9, article top + JSON-LD image)
//   <hero-name>-thumb.jpg    600×600  (1:1, /news feed card)
//   <inline-name>.jpg       1200×800  (3:2, mid-article figure)
//
// Name files descriptively (e.g. "pain-clinic-doctor-patient-consultation") —
// descriptive filenames + alt text are what image SEO actually indexes.
// Sources: use license-free photos (Pexels/Unsplash) downloaded at ≥1600px.
// Smart ("attention") cropping keeps the subject when aspect ratios change.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const slug = args[0];
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};
const hero = opt('hero');
const heroName = opt('hero-name');
const inline = opt('inline');
const inlineName = opt('inline-name');

if (!slug || slug.startsWith('--') || !hero || !heroName || (inline && !inlineName)) {
  console.error(
    'usage: node scripts/prepare-article-images.mjs <article-slug> --hero <src> --hero-name <name> [--inline <src> --inline-name <name>]'
  );
  process.exit(1);
}

const outDir = path.join(root, 'public', 'images', 'news', slug);
mkdirSync(outDir, { recursive: true });

const save = async (src, w, h, file) => {
  await sharp(src)
    .resize(w, h, { fit: 'cover', position: sharp.strategy.attention })
    .jpeg({ quality: 78, progressive: true, mozjpeg: true })
    .toFile(path.join(outDir, file));
  console.log(`wrote  images/news/${slug}/${file}  (${w}x${h})`);
};

await save(hero, 1600, 900, `${heroName}-hero.jpg`);
await save(hero, 600, 600, `${heroName}-thumb.jpg`);
if (inline) await save(inline, 1200, 800, `${inlineName}.jpg`);
