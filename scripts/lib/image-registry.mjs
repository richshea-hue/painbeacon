// Shared registry of every source photo the site has ever shipped, so the same
// stock photo can never be used on two different pages.
//
// The problem this solves: the prep scripts (prepare-article-images.mjs,
// prepare-hero-photo.mjs) take a downloaded --src file, write crops, and forget
// where the photo came from. The source files themselves are never committed —
// only the derivatives — so "have we used this Pexels photo before?" had no
// answer anywhere. That is how the home-page hero shipped as a re-crop of the
// how-to-choose article's hero without anyone noticing.
//
// data/image-registry.json holds one entry per SOURCE photo (not per output
// file): which page uses it, the Pexels id/URL/photographer when known, the md5
// of the source download, and the md5 of every derivative written from it.
// Entries that predate the registry have null Pexels ids — for those, only the
// file hashes guard against reuse. Same shape as bestraces' photo-registry.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REGISTRY = join(root, 'data', 'image-registry.json');

export const md5 = (buf) => createHash('md5').update(buf).digest('hex');
export const md5File = (path) => md5(readFileSync(path));

export function loadRegistry() {
  if (!existsSync(REGISTRY)) return { sources: [] };
  return JSON.parse(readFileSync(REGISTRY, 'utf8'));
}

export function saveRegistry(reg) {
  reg.sources.sort((a, b) => (a.page + a.role < b.page + b.role ? -1 : 1));
  writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
}

// Parse "--source" input: a Pexels photo URL or bare numeric id. Returns
// { pexelsId, srcUrl }. Accepts "manual:<free text>" for the rare non-Pexels
// source (own photo, commissioned art) — recorded verbatim, no id dedup.
export function parseSource(s) {
  if (!s) return null;
  if (s.startsWith('manual:')) return { pexelsId: null, srcUrl: s };
  const m = String(s).match(/(?:pexels\.com\/(?:photo\/)?[^/]*?(\d{4,})|^(\d{4,})$)/);
  if (!m) {
    throw new Error(
      `--source "${s}" is neither a Pexels URL, a numeric Pexels id, nor "manual:<note>". ` +
        `Pass the pexels.com photo page URL or the numeric id from the images.pexels.com download URL.`
    );
  }
  const id = Number(m[1] || m[2]);
  return { pexelsId: id, srcUrl: `https://www.pexels.com/photo/${id}/` };
}

// Throw if this source photo is already registered to a DIFFERENT page.
// Re-running the prep script for the same page is fine (idempotent replace).
export function assertUnused(reg, { pexelsId, sourceMd5, page }) {
  for (const s of reg.sources) {
    if (s.page === page) continue;
    if (pexelsId != null && s.pexels_id === pexelsId) {
      throw new Error(
        `Pexels photo ${pexelsId} is already used by "${s.page}" (${s.files[0]?.path}). ` +
          `Pick a different photo — every page must have images the site has never shown before.`
      );
    }
    if (sourceMd5 && s.source_md5 === sourceMd5) {
      throw new Error(
        `This exact source file already produced the images on "${s.page}" ` +
          `(source md5 ${sourceMd5.slice(0, 12)}). Pick a different photo.`
      );
    }
    // Passing an already-shipped derivative as the new source is also reuse.
    if (sourceMd5 && (s.files ?? []).some((f) => f.md5 === sourceMd5)) {
      throw new Error(
        `The source file IS one of "${s.page}"'s shipped images. Pick a different photo.`
      );
    }
  }
}

// Record (or replace) a source entry. files: [{ path, md5, bytes }] with paths
// site-absolute ("/images/news/<slug>/x.jpg").
export function registerSource(reg, { page, role, pexelsId, srcUrl, photographer, sourceMd5, files, note }) {
  reg.sources = reg.sources.filter((s) => !(s.page === page && s.role === role));
  reg.sources.push({
    page,
    role,
    pexels_id: pexelsId ?? null,
    src_url: srcUrl ?? null,
    photographer: photographer ?? null,
    source_md5: sourceMd5 ?? null,
    files,
    ...(note ? { note } : {}),
  });
}
