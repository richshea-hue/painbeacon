// node --test scripts/lib/backlinks.test.mjs
// Pins what decides a backlink number, against markup shaped like the real
// thing. There is no network here on purpose: the fetching is trivial, the
// judging is not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findBacklinks, isOurHost, normalizeSite, robotsAllows } from './backlinks.mjs';

const PAGE = 'https://example-clinic.com/';
const BADGE = [
  '<a href="https://painbeacon.com/clinic/va-fairfax-example/?src=badge"',
  '   title="Example is a verified pain clinic on PainBeacon">',
  '  <img src="https://painbeacon.com/brand/verified-badge.svg"',
  '       alt="Verified" width="230" height="60" style="border:0" loading="lazy">',
  '</a>',
].join('\n');

test('the issued badge counts, and counts as followed', () => {
  const r = findBacklinks(`<body>${BADGE}</body>`, PAGE);
  assert.equal(r.count, 1);
  assert.equal(r.followed, true);
  assert.equal(r.badge, true);
  assert.match(r.url, /^https:\/\/painbeacon\.com\/clinic\//);
});

test('a lookalike domain is never ours', () => {
  const html = `<a href="https://painbeacon.com.evil.net/clinic/x/">x</a>
                <a href="https://notpainbeacon.com/">y</a>`;
  assert.equal(findBacklinks(html, PAGE).count, 0);
  assert.equal(isOurHost('painbeacon.com.evil.net'), false);
  assert.equal(isOurHost('www.painbeacon.com'), true);
  assert.equal(isOurHost('PainBeacon.com'), true);
});

test('rel=nofollow, sponsored and ugc all kill the follow', () => {
  for (const rel of ['nofollow', 'sponsored', 'ugc', 'noopener nofollow']) {
    const html = `<a rel="${rel}" href="https://painbeacon.com/">PainBeacon</a>`;
    const r = findBacklinks(html, PAGE);
    assert.equal(r.count, 1, rel);
    assert.equal(r.followed, false, rel);
  }
  // Unrelated rel values leave it followed.
  const ok = findBacklinks('<a rel="noopener" href="https://painbeacon.com/">x</a>', PAGE);
  assert.equal(ok.followed, true);
});

test('one followed link among several is enough', () => {
  const html = `<a rel="nofollow" href="https://painbeacon.com/a/">a</a>
                <a href="https://painbeacon.com/b/">b</a>`;
  const r = findBacklinks(html, PAGE);
  assert.equal(r.count, 2);
  assert.equal(r.followed, true, 'organic value needs only one followed link');
  assert.equal(r.badge, false, 'a plain mention is not the badge');
});

test('single quotes, no quotes, and relative protocol all parse', () => {
  assert.equal(findBacklinks("<a href='https://painbeacon.com/'>x</a>", PAGE).count, 1);
  assert.equal(findBacklinks('<a href=https://painbeacon.com/ >x</a>', PAGE).count, 1);
  assert.equal(findBacklinks('<a href="//painbeacon.com/">x</a>', PAGE).count, 1);
});

test('normalizeSite copes with what the column actually holds', () => {
  assert.equal(normalizeSite('  example.com ').href, 'https://example.com/');
  assert.equal(normalizeSite('http://example.com').href, 'http://example.com/');
  assert.equal(normalizeSite(''), null);
  assert.equal(normalizeSite(null), null);
  assert.equal(normalizeSite('not a url'), null);
  assert.equal(normalizeSite('mailto:a@b.com'), null);
  assert.equal(normalizeSite('localhost'), null, 'no dot, not a site');
  assert.equal(normalizeSite('https://painbeacon.com/'), null, 'we are not our own backlink');
  // A dot in the token before ':' means host:port, not a scheme. Rare in the
  // column, but throwing the site away is worse than fetching it.
  assert.equal(normalizeSite('example.com:8080').href, 'https://example.com:8080/');
  assert.equal(normalizeSite('http://example.com:8080/x').href, 'http://example.com:8080/x');
  assert.equal(normalizeSite('javascript:alert(1)'), null);
  assert.equal(normalizeSite('ftp://example.com'), null);
});

test('robots: a blanket disallow is honored, a narrow one is not', () => {
  assert.equal(robotsAllows('User-agent: *\nDisallow: /'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /admin'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow:'), true, 'empty Disallow allows all');
  assert.equal(robotsAllows(''), true);
  assert.equal(robotsAllows(null), true);
  // A rule aimed at us beats the wildcard group, either way.
  assert.equal(robotsAllows('User-agent: *\nDisallow:\n\nUser-agent: PainBeaconBot\nDisallow: /'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /\n\nUser-agent: PainBeaconBot\nAllow: /\nDisallow:'), true);
  // Longest match wins, which is what lets Allow carve out of a blanket block.
  assert.equal(robotsAllows('User-agent: *\nDisallow: /\nAllow: /', '/'), true);
});
