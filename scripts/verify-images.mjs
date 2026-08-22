// Fail loudly if any two pages share a photo. Run before pushing an article
// (the weekly draft task runs it in its verify step); cheap enough for CI.
//
//   node scripts/verify-images.mjs
//
// Checks, in order of how early they catch a mistake:
//   1. Registry: the same Pexels id or source-file hash on two different pages.
//   2. Disk: byte-identical image files at two paths anywhere under
//      public/images, public/brand, public/social — catches photos that were
//      hand-dropped without going through the prep scripts.
//   3. Frontmatter: two articles whose heroImg/thumb/shareImg point at the
//      same file.
//   4. Perceptual: the same PHOTOGRAPH on two pages at different crops or from
//      the same shoot. Checks 1-3 are all exact and cannot see this — a re-crop
//      shares no bytes, and a different frame of the same session has its own
//      provider id. This is the check that caught the home hero, how-to-choose's
//      hero and how-we-rank's inline all being one photo session.
// Entries with "waived": true are reported as warnings, not failures — the
// pre-registry home-hero / how-to-choose overlap, and the how-we-rank inline
// duplicate found on 2026-08-22. Both need a fresh photo; the waiver keeps the
// pages building without hiding the problem.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegistry, md5File, root } from './lib/image-registry.mjs';
import { dhash, hamming, fromHex, REUSE_MAX, REVIEW_MAX } from './lib/perceptual-hash.mjs';

const problems = [];
const warnings = [];
const reg = loadRegistry();

// 1 — registry-level duplicates
const byId = new Map();
const byHash = new Map();
for (const s of reg.sources) {
  const tag = `${s.page} (${s.role})`;
  if (s.pexels_id != null) {
    const prev = byId.get(`pexels:${s.pexels_id}`);
    if (prev) problems.push(`Pexels ${s.pexels_id} used by both ${prev} and ${tag}`);
    else byId.set(`pexels:${s.pexels_id}`, tag);
  }
  if (s.unsplash_id != null) {
    const prev = byId.get(`unsplash:${s.unsplash_id}`);
    if (prev) problems.push(`Unsplash ${s.unsplash_id} used by both ${prev} and ${tag}`);
    else byId.set(`unsplash:${s.unsplash_id}`, tag);
  }
  if (s.source_md5) {
    const prev = byHash.get(s.source_md5);
    if (prev) {
      (s.waived || prev.waived ? warnings : problems).push(
        `same source photo behind ${prev.tag} and ${tag}${s.waived ? ' [waived]' : ''}`
      );
    } else byHash.set(s.source_md5, { tag, waived: !!s.waived });
  }
  if (s.waived && s.note) warnings.push(`${tag}: ${s.note}`);
}

// 2 — byte-identical files on disk. Derivatives of one registered source are
// allowed to collide with each other (they never should, but a thumb equal to
// its own share crop is a size bug, not a reuse bug — still flag it).
function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(jpe?g|png|webp)$/i.test(f)) yield p;
  }
}
const seen = new Map();
for (const rel of ['public/images', 'public/brand', 'public/social']) {
  const dir = join(root, rel);
  if (!existsSync(dir)) continue;
  for (const p of walk(dir)) {
    const h = md5File(p);
    const relPath = p.slice(root.length).replace(/\\/g, '/');
    if (seen.has(h)) problems.push(`identical bytes: ${seen.get(h)} and ${relPath}`);
    else seen.set(h, relPath);
  }
}

// 3 — two articles pointing at the same image path
const artDir = join(root, 'src', 'content', 'articles');
const usedBy = new Map();
for (const f of readdirSync(artDir).filter((f) => f.endsWith('.md'))) {
  const fm = readFileSync(join(artDir, f), 'utf8');
  for (const key of ['heroImg', 'thumb', 'shareImg']) {
    const m = fm.match(new RegExp(`^${key}:\\s*'([^']+)'`, 'm'));
    if (!m) continue;
    const prev = usedBy.get(m[1]);
    if (prev && prev !== f) problems.push(`${m[1]} referenced by both ${prev} and ${f}`);
    else usedBy.set(m[1], f);
  }
}

// 4 — the SAME PHOTOGRAPH on two pages at different crops. Checks 1-3 are all
// exact (id, bytes, path) and cannot see this: a re-crop shares no bytes and a
// different frame of one shoot has its own provider id.
//
// One entry per SOURCE PHOTO, which is exactly what the registry already models:
// a (page, role) pair owns one photo and all the crops made from it. Comparing
// per-file instead would flag a hero against its own thumb, and every brand
// variant against every other — hero-clinic-wide vs -band vs .webp are one photo
// by design.
//
// Brand marks (logos, badges, generated social cards) are excluded: they are not
// stock photography, they SHOULD recur across pages, and a first attempt at this
// check failed them against each other at distance 7. A bit-balance guard was
// tried to separate flat graphics from photos and measured 24-35 bits set for
// both, so it does not discriminate — scoping by what the registry knows is a
// photo does.
const candidates = [];
for (const s of reg.sources) {
  // Hotlinked Unsplash sources have no local files by design — nothing is
  // re-hosted. They still have to take part in reuse detection, so the fetch
  // script stores their perceptual hash at pull time and it is read back here.
  if (s.remote_url) {
    if (!s.dhash) {
      problems.push(`hotlinked source has no stored dhash, so it cannot be deduped: ${s.page} (${s.role})`);
      continue;
    }
    candidates.push({ key: `${s.page} (${s.role}, hotlinked)`, hash: fromHex(s.dhash), waived: !!s.waived });
    continue;
  }
  const f = (s.files ?? [])[0];
  if (!f) continue;
  // Registry paths are site-absolute ("/images/..."); on disk they live under
  // public/. Getting this wrong makes every candidate vanish and the whole check
  // pass silently, so it is asserted rather than skipped.
  const p = join(root, 'public', f.path.replace(/^\//, ''));
  if (!existsSync(p)) {
    problems.push(`registry points at a missing file: ${f.path} (${s.page} ${s.role})`);
    continue;
  }
  candidates.push({ key: `${s.page} (${s.role})`, path: p, waived: !!s.waived });
}
// Article photos that never went through the registry still need checking.
const registered = new Set(
  reg.sources.flatMap((s) => (s.files ?? []).map((f) => f.path.replace(/^\//, '')))
);
const newsDir = join(root, 'public/images/news');
if (existsSync(newsDir)) {
  for (const p of walk(newsDir)) {
    const rel = p.slice(root.length + 1).replace(/\\/g, '/').replace(/^public\//, '');
    if (registered.has(rel)) continue;
    if (/-(thumb|share)\.(jpe?g|png|webp)$/i.test(p)) continue; // same photo as its -hero
    candidates.push({ key: `/${rel} (unregistered)`, path: p, waived: false });
  }
}

const hashes = [];
for (const c of candidates) {
  if (c.hash !== undefined) {
    hashes.push(c); // hotlinked: hash came from the registry, there is no file
    continue;
  }
  try {
    hashes.push({ ...c, hash: await dhash(c.path) });
  } catch {
    /* unreadable/exotic file — the byte check above still covers it */
  }
}
for (let i = 0; i < hashes.length; i++) {
  for (let j = i + 1; j < hashes.length; j++) {
    const a = hashes[i];
    const b = hashes[j];
    const d = hamming(a.hash, b.hash);
    if (d > REVIEW_MAX) continue;
    const line = `same photograph at different crops (dHash distance ${d}): ${a.key} and ${b.key}`;
    if (d <= REUSE_MAX && !(a.waived || b.waived)) problems.push(line);
    else warnings.push(`${line}${a.waived || b.waived ? ' [waived]' : ' — near miss, worth a look'}`);
  }
}

for (const w of warnings) console.warn(`  warn: ${w}`);
if (problems.length) {
  console.error('DUPLICATE IMAGES FOUND:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(
  `OK — ${reg.sources.length} registered sources, ${seen.size} image files on disk, no cross-page reuse.` +
    (warnings.length ? ` (${warnings.length} waived warning${warnings.length > 1 ? 's' : ''})` : '')
);
