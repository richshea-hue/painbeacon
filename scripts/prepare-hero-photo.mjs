// Build the homepage hero photo set from one source image.
//
//   node scripts/prepare-hero-photo.mjs --src <source.jpg> --source <pexels-url-or-id>
//   node scripts/prepare-hero-photo.mjs --src <source.jpg> --source <pexels-url-or-id> --position center
//
// --source is REQUIRED (Pexels photo URL, numeric id, or "manual:<note>"): the
// photo is checked against data/image-registry.json and refused if any article
// already uses it — the previous home hero shipped as a re-crop of the
// how-to-choose article's hero because nothing tracked photo sources. Commit
// the registry with the new images.
//
// Outputs to public/brand/:
//   hero-clinic-wide.jpg / .webp    1600×720  desktop background (photo sits
//                                             beside the copy, behind a scrim)
//   hero-clinic-band.jpg / .webp    1000×460  tablet/phone band under the copy
//
// Two crops on purpose. Below ~980px there is no room for the subject beside
// the headline — overlaying puts display type across the clinician's face — so
// narrow screens get the photo as its own undimmed band and need a smaller,
// shorter file than the desktop background.
//
// --position picks the crop anchor: "attention" (default, sharp's saliency
// detector), "center", "north", "east", etc. Check the result — saliency
// sometimes locks onto a bright window instead of the face.
//
// Swapping the hero photo later is this one command plus a commit. Source
// photos should be license-free (Pexels/Unsplash) at ≥1600px wide.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import {
  loadRegistry, saveRegistry, parseSource, assertUnused, registerSource, md5File,
} from './lib/image-registry.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};

const src = opt('src');
const sourceRef = opt('source');
if (!src || !sourceRef) {
  console.error(
    'usage: node scripts/prepare-hero-photo.mjs --src <source.jpg> --source <pexels-url-or-id> [--position attention|center|north|…]'
  );
  process.exit(1);
}

// Refuse a photo any article already uses, before writing anything.
const reg = loadRegistry();
const srcInfo = parseSource(sourceRef);
const sourceMd5 = md5File(src);
assertUnused(reg, { ...srcInfo, sourceMd5, page: 'home-hero' });

const positionArg = opt('position') || 'attention';
const position = positionArg === 'attention' ? sharp.strategy.attention : positionArg;

const outDir = path.join(root, 'public', 'brand');
mkdirSync(outDir, { recursive: true });

// Quality is deliberately high-ish: the hero is the LCP element, but it also
// sits behind a dark scrim that would make banding in a low-quality JPEG show.
const VARIANTS = [
  { name: 'hero-clinic-wide', w: 1600, h: 720 },
  { name: 'hero-clinic-band', w: 1000, h: 460 },
];

const meta = await sharp(src).metadata();
console.log(`source ${path.basename(src)} — ${meta.width}×${meta.height}`);

const files = [];
for (const v of VARIANTS) {
  if (meta.width < v.w) {
    console.warn(
      `  ! source is ${meta.width}px wide, ${v.name} wants ${v.w}px — it will be upscaled and look soft.`
    );
  }
  const base = sharp(src).resize(v.w, v.h, { fit: 'cover', position });
  const jpg = path.join(outDir, `${v.name}.jpg`);
  const webp = path.join(outDir, `${v.name}.webp`);
  const a = await base.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(jpg);
  const b = await base.clone().webp({ quality: 78 }).toFile(webp);
  console.log(`  ${v.name}.jpg   ${v.w}×${v.h}  ${(a.size / 1024).toFixed(0)}KB`);
  console.log(`  ${v.name}.webp  ${v.w}×${v.h}  ${(b.size / 1024).toFixed(0)}KB`);
  files.push({ path: `/brand/${v.name}.jpg`, md5: md5File(jpg), bytes: a.size });
  files.push({ path: `/brand/${v.name}.webp`, md5: md5File(webp), bytes: b.size });
}

registerSource(reg, { page: 'home-hero', role: 'hero', ...srcInfo, sourceMd5, files });
saveRegistry(reg);
console.log('recorded in data/image-registry.json — commit it with the new images.');
