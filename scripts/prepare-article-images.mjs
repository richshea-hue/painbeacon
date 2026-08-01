// Prepare an article's photo set from one or two source images.
//
//   node scripts/prepare-article-images.mjs <article-slug> \
//     --hero <src.jpg> --hero-name <seo-file-name> --hero-source <pexels-url-or-id> \
//     [--inline <src.jpg> --inline-name <seo-file-name> --inline-source <pexels-url-or-id>]
//
// --hero-source / --inline-source are REQUIRED: the Pexels photo-page URL or the
// numeric id from the images.pexels.com download URL (use "manual:<note>" for a
// non-Pexels source). The script refuses any photo whose Pexels id or file hash
// is already registered to another page in data/image-registry.json, and records
// this article's choice there — that registry is the only record of which stock
// photos the site has used, because source downloads are never committed.
// Commit data/image-registry.json together with the images.
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
import {
  loadRegistry, saveRegistry, parseSource, assertUnused, registerSource, md5, md5File,
} from './lib/image-registry.mjs';

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

const heroSource = opt('hero-source');
const inlineSource = opt('inline-source');

if (
  !slug || slug.startsWith('--') || !hero || !heroName || !heroSource ||
  (inline && (!inlineName || !inlineSource))
) {
  console.error(
    'usage: node scripts/prepare-article-images.mjs <article-slug> \\\n' +
      '         --hero <src> --hero-name <name> --hero-source <pexels-url-or-id> \\\n' +
      '         [--inline <src> --inline-name <name> --inline-source <pexels-url-or-id>]\n' +
      '--hero-source/--inline-source: the Pexels photo URL or numeric id (or "manual:<note>").'
  );
  process.exit(1);
}

// Refuse photos the site has already shown on another page — BEFORE writing
// anything, so a rejected run leaves no files to clean up.
const reg = loadRegistry();
const page = `news/${slug}`;
const heroSrcInfo = parseSource(heroSource);
const heroMd5 = md5File(hero);
assertUnused(reg, { pexelsId: heroSrcInfo.pexelsId, sourceMd5: heroMd5, page });
let inlineSrcInfo = null;
let inlineMd5 = null;
if (inline) {
  inlineSrcInfo = parseSource(inlineSource);
  inlineMd5 = md5File(inline);
  assertUnused(reg, { pexelsId: inlineSrcInfo.pexelsId, sourceMd5: inlineMd5, page });
  if (inlineMd5 === heroMd5 || (heroSrcInfo.pexelsId && heroSrcInfo.pexelsId === inlineSrcInfo.pexelsId)) {
    console.error('hero and inline are the same photo — pick two different ones.');
    process.exit(1);
  }
}

const outDir = path.join(root, 'public', 'images', 'news', slug);
mkdirSync(outDir, { recursive: true });

const save = async (src, w, h, file) => {
  const buf = await sharp(src)
    .resize(w, h, { fit: 'cover', position: sharp.strategy.attention })
    .jpeg({ quality: 78, progressive: true, mozjpeg: true })
    .toBuffer();
  await sharp(buf).toFile(path.join(outDir, file));
  console.log(`wrote  images/news/${slug}/${file}  (${w}x${h})`);
  return { path: `/images/news/${slug}/${file}`, md5: md5(buf), bytes: buf.length };
};

const heroFiles = [
  await save(hero, 1600, 900, `${heroName}-hero.jpg`),
  await save(hero, 600, 600, `${heroName}-thumb.jpg`),
  await save(hero, 1200, 1200, `${heroName}-share.jpg`), // og:image + RSS enclosure (1:1 photo)
];
registerSource(reg, {
  page, role: 'hero', ...heroSrcInfo, sourceMd5: heroMd5, files: heroFiles,
});
if (inline) {
  const inlineFiles = [await save(inline, 1200, 800, `${inlineName}.jpg`)];
  registerSource(reg, {
    page, role: 'inline', ...inlineSrcInfo, sourceMd5: inlineMd5, files: inlineFiles,
  });
}
saveRegistry(reg);
console.log('recorded in data/image-registry.json — commit it with the images.');
