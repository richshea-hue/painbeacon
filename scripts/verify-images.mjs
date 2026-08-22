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
// Entries with "waived": true are reported as warnings, not failures — that is
// the pre-registry home-hero / how-to-choose overlap, kept visible on purpose
// until the home hero photo is replaced.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegistry, md5File, root } from './lib/image-registry.mjs';

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

for (const w of warnings) console.warn(`  warn: ${w}`);
if (problems.length) {
  console.error('DUPLICATE IMAGES FOUND:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(
  `OK — ${reg.sources.length} registered sources, ${seen.size} image files on disk, no cross-page reuse.` +
    (warnings.length ? ` (${warnings.length} waived warning${warnings.length > 1 ? 's' : ''})` : '')
);
