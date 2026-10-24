// node --test src/lib/state-slug.test.mjs
// stateSlug decides a URL path segment, and every state-bearing URL on the site
// runs through it: the state hub, breadcrumbs, the sitemap, the city-redirect
// map, zip3-zones. One unnormalized value therefore mints a whole phantom state
// section. That happened — see the GEORGIA case below, which is a real record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stateSlug } from './data.js';

test('a two-letter code is just lowercased', () => {
  assert.equal(stateSlug('GA'), 'ga');
  assert.equal(stateSlug('ga'), 'ga');
  assert.equal(stateSlug('Ny'), 'ny');
});

test('a spelled-out state becomes its code — the bug this exists for', () => {
  // NPI 1760874721, Shelton Sports and Spine, Duluth, arrived from NPPES with
  // state "GEORGIA". That produced /pain-clinics/georgia/ alongside
  // /pain-clinics/ga/: two live state hubs, each canonicalizing to itself, both
  // in the sitemap, competing for the same searches.
  assert.equal(stateSlug('GEORGIA'), 'ga');
  assert.equal(stateSlug('Georgia'), 'ga');
  assert.equal(stateSlug('  georgia  '), 'ga');
});

test('multi-word states do not leave a space in the path', () => {
  // The old implementation was `.toLowerCase()`, so "NEW YORK" would have gone
  // into a URL with a space in it.
  assert.equal(stateSlug('NEW YORK'), 'ny');
  assert.equal(stateSlug('North Carolina'), 'nc');
  assert.equal(stateSlug('West Virginia'), 'wv');
});

test('the district, by every name it gets written under', () => {
  assert.equal(stateSlug('DC'), 'dc');
  assert.equal(stateSlug('Washington, D.C.'), 'dc');
  assert.equal(stateSlug('District of Columbia'), 'dc');
  assert.equal(stateSlug('washington dc'), 'dc');
});

test('territories resolve too', () => {
  assert.equal(stateSlug('Puerto Rico'), 'pr');
  assert.equal(stateSlug('Guam'), 'gu');
});

test('empty stays empty', () => {
  assert.equal(stateSlug(''), '');
  assert.equal(stateSlug(null), '');
  assert.equal(stateSlug(undefined), '');
});

test('something unrecognized is still URL-safe', () => {
  // We cannot map it, but we can refuse to put a space or a comma in a path.
  assert.equal(stateSlug('Atlantis'), 'atlantis');
  assert.equal(stateSlug('Some Place'), 'some-place');
});
