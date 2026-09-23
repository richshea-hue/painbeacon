// node --test src/lib/article-art.test.mjs
// Pins the precedence these three helpers exist to hold: heroRemote beats the
// local crops, and the alt an article gives is never silently swapped for a
// different photo's. Both rules broke in production before this module existed —
// the homepage never learned heroRemote at all, and the news listing honored it
// for the image but not the alt — so the tests below are the regressions, not
// hypotheticals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { articleHero, articleThumb, articleShare } from './article-art.js';

const REMOTE = 'https://images.unsplash.com/photo-123?ixid=abc&ixlib=rb-4.1.0';
const local = {
  heroImg: '/images/news/x/photo-hero.jpg',
  thumb: '/images/news/x/photo-thumb.jpg',
  shareImg: '/images/news/x/photo-share.jpg',
  heroAlt: 'A clinician and a patient talking across a desk.',
};

test('local crops are used at their own sizes', () => {
  assert.deepEqual(articleHero(local), { src: local.heroImg, alt: local.heroAlt });
  assert.deepEqual(articleThumb(local, 'x'), { src: local.thumb, alt: local.heroAlt });
  assert.deepEqual(articleShare(local, 'x'), {
    src: local.shareImg,
    alt: local.heroAlt,
    remote: false,
  });
});

test('heroRemote wins over every local crop, at all three sizes', () => {
  // The whole point of the module. An article can carry both — a hotlinked hero
  // and leftover local crops from a photo it no longer shows — and the local
  // ones must not surface anywhere, least of all in a share preview that
  // platforms then cache for months.
  const d = { ...local, heroRemote: REMOTE };
  assert.match(articleHero(d).src, /^https:\/\/images\.unsplash\.com\/.*w=1600&h=900/);
  assert.match(articleThumb(d, 'x').src, /^https:\/\/images\.unsplash\.com\/.*w=600&h=600/);
  assert.match(articleShare(d, 'x').src, /^https:\/\/images\.unsplash\.com\/.*w=1200&h=1200/);
});

test('sizing params append to the query string urls.raw already carries', () => {
  // & not ?, or Unsplash ignores them and serves the full-size original.
  const src = articleShare({ heroRemote: REMOTE }, 'x').src;
  assert.equal(src.indexOf('?'), REMOTE.indexOf('?'));
  assert.ok(src.startsWith(`${REMOTE}&`));
  assert.match(src, /fit=crop&crop=entropy/);
});

test('a hotlinked article keeps its own alt on every surface', () => {
  // The listing bug: heroRemote picked the image but the alt fell through to
  // imageAlt, which on a photo article is unset — so the thumbnail shipped with
  // alt="".
  const d = { heroRemote: REMOTE, heroAlt: local.heroAlt, imageAlt: 'card art' };
  assert.equal(articleHero(d).alt, local.heroAlt);
  assert.equal(articleThumb(d, 'x').alt, local.heroAlt);
  assert.equal(articleShare(d, 'x').alt, local.heroAlt);
});

test('an article with no photo falls back to its generated card', () => {
  const d = { imageAlt: 'PainBeacon card' };
  assert.equal(articleHero(d), null);
  assert.deepEqual(articleThumb(d, 'slug-here'), {
    src: '/social/slug-here.png',
    alt: 'PainBeacon card',
  });
  assert.deepEqual(articleShare(d, 'slug-here'), {
    src: '/social/slug-here.png',
    alt: 'PainBeacon card',
    remote: false,
  });
});

test('an explicit image overrides the generated card', () => {
  const d = { image: '/social/custom.png', imageAlt: 'custom' };
  assert.equal(articleThumb(d, 'x').src, '/social/custom.png');
  assert.equal(articleShare(d, 'x').src, '/social/custom.png');
});

test('alt is empty, never invented, when the article gives none', () => {
  // Callers decide whether to fall back to the title: og:image:alt does, a
  // listing thumbnail beside its own headline does not.
  assert.equal(articleHero({ heroRemote: REMOTE }).alt, '');
  assert.equal(articleThumb({ heroRemote: REMOTE }, 'x').alt, '');
  assert.equal(articleShare({ heroRemote: REMOTE }, 'x').alt, '');
  assert.equal(articleThumb({}, 'x').alt, '');
});

test('remote tells RSS whether it can stat a local file for the byte length', () => {
  assert.equal(articleShare({ heroRemote: REMOTE }, 'x').remote, true);
  assert.equal(articleShare(local, 'x').remote, false);
  assert.equal(articleShare({}, 'x').remote, false);
});
