// Which photograph an article shows, at each size — the one place that decides.
//
// An article's art comes from one of two places. Most carry local crops made by
// scripts/prepare-article-images.mjs (heroImg 1600×900, thumb 600×600, shareImg
// 1200×1200). Ones illustrated from Unsplash carry `heroRemote` instead: a base
// URL hotlinked from their CDN with sizing params appended, because Unsplash's
// API Guidelines require every use of a photo to go through that URL rather than
// a re-hosted copy. `heroRemote` therefore wins over the local fields wherever
// both exist.
//
// WHY THIS IS SHARED. That precedence used to be written out at each call site,
// and they drifted: when heroRemote was introduced, the article page, the news
// listing and the RSS feed learned about it and the homepage did not, so the
// homepage would have shown a broken thumbnail for the first Unsplash-illustrated
// article to reach its two-newest row. The news listing had it half-applied —
// honored for the image, ignored for the alt. Four copies of one rule is three
// too many, so callers ask here instead.
//
// Each helper returns { src, alt }, with `alt` empty when the article gives none.
// The fallback is deliberately the caller's: a listing thumbnail sits beside the
// headline it illustrates, so repeating the title there is noise to a screen
// reader, while og:image:alt travels alone and wants the title rather than
// nothing. Callers that want that fallback write `alt || title` and it is
// visible that they chose it.

// urls.raw already carries a query string, so params append with &.
// fit=crop&crop=entropy keeps the subject when the aspect changes, matching what
// prepare-article-images.mjs does locally with sharp.
const unsplashCrop = (base, w, h) => `${base}&w=${w}&h=${h}&fit=crop&crop=entropy&q=80`;

/** The 1600×900 hero. Null when the article has no hero art at all. */
export function articleHero(d) {
  if (d.heroRemote) return { src: unsplashCrop(d.heroRemote, 1600, 900), alt: d.heroAlt || '' };
  if (d.heroImg) return { src: d.heroImg, alt: d.heroAlt || '' };
  return null;
}

/** The 600×600 listing thumbnail. */
export function articleThumb(d, slug) {
  if (d.heroRemote) return { src: unsplashCrop(d.heroRemote, 600, 600), alt: d.heroAlt || '' };
  if (d.thumb) return { src: d.thumb, alt: d.heroAlt || '' };
  return { src: d.image || `/social/${slug}.png`, alt: d.imageAlt || '' };
}

/**
 * The 1200×1200 share image — og:image and the RSS enclosure. `remote` tells a
 * caller whether it can stat a local file for the byte length RSS needs, or has
 * to ask the CDN.
 */
export function articleShare(d, slug) {
  if (d.heroRemote) {
    return { src: unsplashCrop(d.heroRemote, 1200, 1200), alt: d.heroAlt || '', remote: true };
  }
  if (d.shareImg) return { src: d.shareImg, alt: d.heroAlt || '', remote: false };
  return { src: d.image || `/social/${slug}.png`, alt: d.imageAlt || '', remote: false };
}
