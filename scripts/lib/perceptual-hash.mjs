// Perceptual hash, for catching the same PHOTOGRAPH used twice — even when the
// two copies are different crops and so share no bytes and no provider id.
//
// The registry's exact checks (provider id, source md5, derivative md5) catch a
// photo used twice verbatim. They cannot catch a re-crop: the home page hero and
// news/how-to-choose-a-pain-clinic's hero are the same frame at different crops,
// which is why that overlap sat in the registry as a permanent `waived` entry
// instead of being caught. A reader sees one photo on two pages; every exact
// check sees two unrelated files.
//
// dHash: grayscale, resize to 9x8, compare each pixel to its right neighbor,
// pack the 64 comparisons into a bigint. Brightness- and scale-invariant, and
// tolerant of moderate cropping, because it encodes coarse structure rather than
// pixels.
//
// THRESHOLDS ARE MEASURED, NOT GUESSED. On this repo's images (2026-08-22):
//
//   same frame, different crop  (home-hero vs how-to-choose hero)   10
//   different photos            (home-hero vs pill-mill hero)       19
//   different photos            (how-to-choose vs how-we-rank)      31
//   different photos            (pill-mill vs how-we-rank)          36
//
// So REUSE_MAX = 12 sits inside the gap. It is deliberately a narrow gap on a
// small sample, which is why 13..REVIEW_MAX is reported as a warning to look at
// rather than silently passed — a near-miss is worth a human glance, not a
// build failure.
import sharp from 'sharp';

export const REUSE_MAX = 12; // <= this: treat as the same photograph
export const REVIEW_MAX = 18; // <= this: close enough to be worth eyeballing

export async function dhash(path) {
  const buf = await sharp(path).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (buf[y * 9 + x] > buf[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return bits;
}

export function hamming(a, b) {
  let v = a ^ b;
  let c = 0;
  while (v) {
    c += Number(v & 1n);
    v >>= 1n;
  }
  return c;
}

// Hex string, so a hash can be stored in the registry and compared later without
// re-reading the image file.
export const toHex = (bits) => bits.toString(16).padStart(16, '0');
export const fromHex = (hex) => BigInt(`0x${hex}`);
