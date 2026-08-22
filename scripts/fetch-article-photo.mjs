// Find a source photo for an article that the site has NEVER shipped before,
// and download it ready for prepare-article-images.mjs.
//
//   node --env-file=.env scripts/fetch-article-photo.mjs --contact "query" [n]
//   node --env-file=.env scripts/fetch-article-photo.mjs <page> "query one" "query two" ...
//   node --env-file=.env scripts/fetch-article-photo.mjs <page> --id <pexels-id>
//   node --env-file=.env scripts/fetch-article-photo.mjs <page> --id unsplash:<id>
//
// This is the step that was missing here. prepare-article-images.mjs already
// takes a --src file and crops it; nothing in the repo went and FOUND that file,
// so photo sourcing lived only in whatever session happened to run the weekly
// draft. Modeled on bestraces' scripts/pick-article-photo.mjs, whose registry
// this repo's data/image-registry.json already mirrors.
//
// PEXELS FIRST, UNSPLASH AS BACKUP. Every query is tried against Pexels; only if
// no query yields an unused, large-enough, landscape photo does it fall back to
// Unsplash and try the same queries again. Both providers are deduped against
// the registry, so a photo can never be used twice whichever one it came from.
//
// LOOK BEFORE YOU SHIP. Stock alt text does not say what country a clinic is in,
// and neither provider's medical inventory is reliably US. Blind top-pick has
// already had to reject a Russian-language consent form and a chart titled
// "Hair Mineral Analysis". Build a contact sheet with --contact, Read it, then
// re-run with --id for the one you actually chose.
//
// Keys (either provider may be absent; the script says so and carries on with
// whichever it has):
//   PEXELS_API_KEY        https://www.pexels.com/api/
//   UNSPLASH_ACCESS_KEY   https://unsplash.com/developers
//
// TWO DIFFERENT OUTCOMES, because the two providers have different rules:
//
//   Pexels   -> downloaded to .photo-src/, then cropped and re-hosted from
//               public/ by prepare-article-images.mjs, as before.
//   Unsplash -> HOTLINKED. Their API Guidelines require every use of a photo to
//               go through the urls the API returns, so their CDN sees the view
//               and the photographer gets the stats. Nothing is re-hosted: this
//               script registers the source, prints `heroRemote` frontmatter,
//               and deletes its temporary download. Do not run
//               prepare-article-images.mjs on an Unsplash photo.
//
// The temporary download exists only to give the perceptual reuse check pixels
// to hash. It is written OUTSIDE public/ and is never committed.
import { mkdirSync, writeFileSync, unlinkSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { loadRegistry, saveRegistry, registerSource, md5, md5File, root } from './lib/image-registry.mjs';
import { dhash, hamming, toHex, REUSE_MAX, REVIEW_MAX } from './lib/perceptual-hash.mjs';

const SRC_DIR = join(root, '.photo-src'); // gitignored scratch, not public/
const MIN_WIDTH = 1600; // enough for the 1600x900 hero without upscaling

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : undefined;
};

const pexelsKey = process.env.PEXELS_API_KEY;
const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
if (!pexelsKey && !unsplashKey) {
  console.error(
    'No photo API key. Set PEXELS_API_KEY and/or UNSPLASH_ACCESS_KEY and run with `node --env-file=.env`.'
  );
  process.exit(1);
}
if (!pexelsKey) console.warn('! PEXELS_API_KEY missing — searching Unsplash only.');
if (!unsplashKey) console.warn('! UNSPLASH_ACCESS_KEY missing — no backup if Pexels comes up empty.');

// ---------------------------------------------------------------- registry

const reg = loadRegistry();
const usedPexels = new Set(reg.sources.map((s) => s.pexels_id).filter((v) => v != null));
const usedUnsplash = new Set(reg.sources.map((s) => s.unsplash_id).filter(Boolean));
const usedPhotographers = new Set(reg.sources.map((s) => s.photographer).filter(Boolean));

// Hash everything already shipped, so a photo that predates the registry (or was
// hand-dropped) still cannot come back through this door.
const usedHashes = new Set(reg.sources.map((s) => s.source_md5).filter(Boolean));
function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(jpe?g|png|webp)$/i.test(f)) yield p;
  }
}
for (const rel of ['public/images', 'public/brand', 'public/social']) {
  for (const p of walk(join(root, rel))) usedHashes.add(md5File(p));
}

// ---------------------------------------------------------------- providers

// Both search functions return a common shape so the picking logic below does
// not care which provider produced a candidate.
async function searchPexels(q, perPage = 30) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${perPage}&orientation=landscape`;
  const r = await fetch(url, { headers: { Authorization: pexelsKey } });
  if (!r.ok) throw new Error(`Pexels ${r.status} for "${q}"`);
  return ((await r.json()).photos ?? []).map((p) => ({
    provider: 'pexels',
    id: p.id,
    width: p.width,
    photographer: p.photographer,
    alt: p.alt || null,
    pageUrl: p.url,
    previewUrl: p.src.medium,
    fullUrl: p.src.large2x,
    used: usedPexels.has(p.id),
  }));
}

async function searchUnsplash(q, perPage = 30) {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=${perPage}&orientation=landscape`;
  const r = await fetch(url, { headers: { Authorization: `Client-ID ${unsplashKey}` } });
  if (!r.ok) throw new Error(`Unsplash ${r.status} for "${q}"`);
  return ((await r.json()).results ?? []).map((p) => ({
    provider: 'unsplash',
    id: p.id,
    width: p.width,
    photographer: p.user?.name ?? null,
    alt: p.alt_description || p.description || null,
    pageUrl: p.links?.html ?? `https://unsplash.com/photos/${p.id}`,
    profileUrl: p.user?.links?.html ?? null,
    downloadLocation: p.links?.download_location ?? null,
    rawUrl: p.urls?.raw ?? null,
    previewUrl: p.urls?.small,
    fullUrl: p.urls?.full,
    used: usedUnsplash.has(p.id),
  }));
}

async function fetchById(spec) {
  const un = String(spec).match(/^unsplash:(.+)$/);
  if (un) {
    if (!unsplashKey) throw new Error('UNSPLASH_ACCESS_KEY missing — cannot fetch an Unsplash id.');
    const r = await fetch(`https://api.unsplash.com/photos/${un[1]}`, {
      headers: { Authorization: `Client-ID ${unsplashKey}` },
    });
    if (!r.ok) throw new Error(`Unsplash ${r.status} fetching photo ${un[1]}`);
    const p = await r.json();
    return {
      provider: 'unsplash',
      id: p.id,
      width: p.width,
      photographer: p.user?.name ?? null,
      alt: p.alt_description || p.description || null,
      pageUrl: p.links?.html ?? `https://unsplash.com/photos/${p.id}`,
      profileUrl: p.user?.links?.html ?? null,
      downloadLocation: p.links?.download_location ?? null,
      rawUrl: p.urls?.raw ?? null,
      fullUrl: p.urls?.full,
      used: usedUnsplash.has(p.id),
    };
  }
  if (!pexelsKey) throw new Error('PEXELS_API_KEY missing — cannot fetch a Pexels id.');
  const id = Number(spec);
  const r = await fetch(`https://api.pexels.com/v1/photos/${id}`, { headers: { Authorization: pexelsKey } });
  if (!r.ok) throw new Error(`Pexels ${r.status} fetching photo ${id}`);
  const p = await r.json();
  return {
    provider: 'pexels',
    id: p.id,
    width: p.width,
    photographer: p.photographer,
    alt: p.alt || null,
    pageUrl: p.url,
    fullUrl: p.src.large2x,
    used: usedPexels.has(p.id),
  };
}

// ---------------------------------------------------------------- contact sheet

if (argv[0] === '--contact') {
  const q = argv[1];
  const n = Number(argv[2] || 6);
  if (!q) {
    console.error('usage: --contact "query" [n]');
    process.exit(1);
  }
  const found = [];
  for (const [name, key, fn] of [
    ['Pexels', pexelsKey, searchPexels],
    ['Unsplash', unsplashKey, searchUnsplash],
  ]) {
    if (!key) continue;
    try {
      found.push(...(await fn(q, n)));
    } catch (e) {
      console.warn(`! ${name} search failed: ${e.message}`);
    }
  }
  const shown = found.slice(0, n);
  if (!shown.length) {
    console.error(`No results for "${q}" from any available provider.`);
    process.exit(1);
  }

  const W = 420;
  const H = 280;
  const cols = 3;
  const tiles = [];
  for (const p of shown) {
    const buf = Buffer.from(await (await fetch(p.previewUrl)).arrayBuffer());
    tiles.push(await sharp(buf).resize(W, H, { fit: 'cover' }).toBuffer());
    const ref = p.provider === 'unsplash' ? `unsplash:${p.id}` : String(p.id);
    console.log(
      `${ref.padEnd(24)} ${p.used ? '[ALREADY USED] ' : ''}${p.photographer ?? '?'} | ${(p.alt ?? '').slice(0, 70)}`
    );
  }
  mkdirSync(SRC_DIR, { recursive: true });
  const sheet = join(SRC_DIR, 'contact-sheet.jpg');
  await sharp({
    create: {
      width: W * cols,
      height: H * Math.ceil(tiles.length / cols),
      channels: 3,
      background: '#000',
    },
  })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * W, top: Math.floor(i / cols) * H })))
    .jpeg({ quality: 82 })
    .toFile(sheet);
  console.log(`\nsheet: ${sheet}  (row-major, order above)`);
  console.log('Read it, then re-run with: <page> --id <ref from the left column>');
  process.exit(0);
}

// ---------------------------------------------------------------- pick

const page = argv[0];
const idSpec = opt('id');
const queries = argv.slice(1).filter((a, i) => !a.startsWith('--') && argv[i] !== '--id');
if (!page || page.startsWith('--') || (!queries.length && !idSpec)) {
  console.error('usage: fetch-article-photo.mjs <page> "query one" "query two" ...');
  console.error('       fetch-article-photo.mjs <page> --id <pexels-id | unsplash:<id>>');
  console.error('       fetch-article-photo.mjs --contact "query" [n]');
  console.error('\n<page> is the registry page key, e.g. news/how-we-rank-pain-clinics');
  process.exit(1);
}

let chosen = null;
let chosenQuery = null;
const rejected = [];

if (idSpec) {
  chosen = await fetchById(idSpec);
  if (chosen.used) {
    console.error(`${chosen.provider} ${chosen.id} is already used by another page. Pick a different one.`);
    process.exit(1);
  }
  chosenQuery = `--id ${idSpec}`;
} else {
  // Pexels for every query first; Unsplash only as the backup, so the primary
  // library is exhausted before the fallback is touched.
  for (const [name, key, fn] of [
    ['Pexels', pexelsKey, searchPexels],
    ['Unsplash', unsplashKey, searchUnsplash],
  ]) {
    if (!key || chosen) continue;
    for (const q of queries) {
      let photos;
      try {
        photos = await fn(q);
      } catch (e) {
        rejected.push(`${name} "${q}": ${e.message}`);
        continue;
      }
      const fresh = photos.filter((p) => !p.used && p.width >= MIN_WIDTH);
      if (!fresh.length) {
        rejected.push(`${name} "${q}": ${photos.length} results, 0 unused at >=${MIN_WIDTH}px`);
        continue;
      }
      // Prefer a photographer the site has not run yet, then provider relevance.
      fresh.sort(
        (a, b) =>
          Number(usedPhotographers.has(a.photographer)) - Number(usedPhotographers.has(b.photographer))
      );
      chosen = fresh[0];
      chosenQuery = `${name}: "${q}"`;
      break;
    }
    if (!chosen && name === 'Pexels' && unsplashKey) {
      console.log('Pexels came up empty — falling back to Unsplash.');
    }
  }
}

if (!chosen) {
  console.error('No unused photo found. Tried:\n' + rejected.map((r) => '  - ' + r).join('\n'));
  console.error('Add a more specific query and retry.');
  process.exit(1);
}

const raw = Buffer.from(await (await fetch(chosen.fullUrl)).arrayBuffer());
const hash = md5(raw);
if (usedHashes.has(hash)) {
  console.error(`Chosen photo is byte-identical to one already shipped (md5 ${hash.slice(0, 12)}). Aborting.`);
  process.exit(1);
}

mkdirSync(SRC_DIR, { recursive: true });
const outPath = join(SRC_DIR, `${page.replace(/\//g, '-')}-${chosen.provider}-${chosen.id}.jpg`);
writeFileSync(outPath, raw);

// PERCEPTUAL CHECK, at pull time. The id and byte checks above only catch a
// photo used verbatim. They do NOT catch the same shoot at a different frame or
// crop — that is how the home hero, news/how-to-choose-a-pain-clinic's hero and
// news/how-we-rank-pain-clinics' inline all ended up being one photo session
// with three different Pexels ids and three different byte hashes. A reader sees
// the same picture three times; every exact check saw three unrelated files.
const candHash = await dhash(outPath);
const tooClose = [];
for (const s of reg.sources) {
  const f = (s.files ?? [])[0];
  if (!f) continue;
  const p = join(root, 'public', f.path.replace(/^\//, ''));
  if (!existsSync(p)) continue;
  try {
    const d = hamming(candHash, await dhash(p));
    if (d <= REVIEW_MAX) tooClose.push({ d, page: `${s.page} (${s.role})` });
  } catch {
    /* skip unreadable */
  }
}
tooClose.sort((a, b) => a.d - b.d);
const blocking = tooClose.filter((t) => t.d <= REUSE_MAX);
if (blocking.length) {
  unlinkSync(outPath);
  console.error(
    `This is the same photograph the site already uses. Discarded ${outPath.replace(root, '.')}.\n` +
      blocking.map((t) => `  - dHash distance ${t.d} from ${t.page}`).join('\n') +
      `\nPick a different photo — a new crop or another frame from the same shoot still reads as a repeat.`
  );
  process.exit(1);
}
for (const t of tooClose) {
  console.warn(`! near miss: dHash distance ${t.d} from ${t.page} — look at both before shipping.`);
}

// Unsplash API Guidelines require an application to hit the photo's
// download_location endpoint whenever a photo is actually used, the same way a
// pageview is counted. It is a bare event ping; a failure must not lose the
// photo we just downloaded, so it is best-effort and only warns.
if (chosen.provider === 'unsplash' && chosen.downloadLocation) {
  try {
    const r = await fetch(chosen.downloadLocation, {
      headers: { Authorization: `Client-ID ${unsplashKey}` },
    });
    console.log(`unsplash download event: ${r.ok ? 'sent' : `FAILED ${r.status}`}`);
  } catch (e) {
    console.warn(`! unsplash download event failed: ${e.message}`);
  }
}

const sourceRef = chosen.provider === 'unsplash' ? `unsplash:${chosen.id}` : String(chosen.id);
console.log(`matched       : ${chosenQuery}`);
console.log(`provider      : ${chosen.provider}`);
console.log(`photographer  : ${chosen.photographer ?? '(unknown)'}`);
console.log(`alt           : ${chosen.alt ?? '(none)'}`);
console.log(`page          : ${chosen.pageUrl}`);
console.log(`wrote         : ${outPath.replace(root, '.')} (${raw.length} bytes, ${chosen.width}px wide)`);
console.log('\nLOOK AT IT before using it — open the file and confirm it is plausibly a US');
console.log('clinical setting with no legible foreign-language text or off-brand logos.');
// UNSPLASH IS HOTLINKED, NOT RE-HOSTED. Their API Guidelines require every use
// of a photo to go through the hotlinked urls the API returns, so their CDN sees
// the views and the photographer gets the stats. Pexels has no such rule, so
// Pexels photos keep going through prepare-article-images.mjs and are served
// from our own /public.
//
// The temporary download above is NOT a re-host: it exists only so the
// perceptual reuse check has pixels to hash, and it is deleted here. Nothing
// from Unsplash is ever written into public/ or committed.
if (chosen.provider === 'unsplash') {
  if (!chosen.rawUrl) {
    console.error('Unsplash returned no urls.raw to hotlink — cannot use this photo compliantly.');
    unlinkSync(outPath);
    process.exit(1);
  }
  // Register the source here, because prepare-article-images.mjs (which normally
  // does the registering) is skipped for hotlinked photos. Without this the
  // photo would be invisible to next week's dedup. The perceptual hash is stored
  // because there is no local file for verify-images.mjs to hash later.
  registerSource(reg, {
    page,
    role: 'hero',
    unsplashId: chosen.id,
    srcUrl: chosen.pageUrl,
    photographer: chosen.photographer,
    files: [],
    note: 'hotlinked from Unsplash per their API Guidelines; no local copy',
  });
  const entry = reg.sources.find((x) => x.page === page && x.role === 'hero');
  entry.remote_url = chosen.rawUrl;
  entry.dhash = toHex(candHash);
  saveRegistry(reg);
  unlinkSync(outPath);

  console.log(`\nregistered  : ${page} (hero) as a hotlinked Unsplash source`);
  console.log(`discarded   : the temporary download (hotlinked, never re-hosted)`);
  console.log('\n--- paste into the article frontmatter ---');
  console.log(`heroRemote: '${chosen.rawUrl}'`);
  console.log(`heroAlt: '${(chosen.alt ?? '').replace(/'/g, "\\'")}'`);
  console.log(`heroCreditName: '${(chosen.photographer ?? '').replace(/'/g, "\\'")}'`);
  if (chosen.profileUrl) console.log(`heroCreditProfile: '${chosen.profileUrl}'`);
  console.log(`heroCreditPhoto: '${chosen.pageUrl}'`);
  console.log(`heroCreditProvider: 'Unsplash'`);
  if (!chosen.profileUrl) {
    console.warn('! no photographer profile URL came back — Unsplash requires one; do not ship without it.');
  }
  console.log('\nDo NOT run prepare-article-images.mjs for this photo — hotlinked photos');
  console.log('have no local crops. The templates size it via Unsplash CDN params.');
  process.exit(0);
}

// Attribution, ready to paste. Unsplash REQUIRES the photographer and Unsplash
// to be credited with a link back to the photographer's profile; Pexels does not
// require it, but the same fields render for both.
console.log('\n--- paste into the article frontmatter ---');
console.log(`heroCreditName: '${(chosen.photographer ?? '').replace(/'/g, "\\'")}'`);
if (chosen.profileUrl) console.log(`heroCreditProfile: '${chosen.profileUrl}'`);
console.log(`heroCreditPhoto: '${chosen.pageUrl}'`);
console.log(`heroCreditProvider: '${chosen.provider === 'unsplash' ? 'Unsplash' : 'Pexels'}'`);
if (chosen.provider === 'unsplash' && !chosen.profileUrl) {
  console.warn('! no photographer profile URL came back — Unsplash requires one; do not ship without it.');
}

console.log('\n--- then crop and register it ---');
console.log(
  `node scripts/prepare-article-images.mjs <article-slug> \\\n` +
    `  --hero ${outPath.replace(root, '.')} \\\n` +
    `  --hero-name <descriptive-seo-file-name> \\\n` +
    `  --hero-source ${sourceRef}`
);
