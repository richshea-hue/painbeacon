// node --test src/lib/brand-name.test.mjs
// A practice's own name next to its registered one. The rules under test are
// the ones that keep a self-reported name from displacing the federal record:
// verified listings only, the registered name always still available, and
// nothing that is not a name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBrandName, brandNameOf, publicName, registeredAs } from './data.js';

const mm = (over = {}) => ({
  name: 'M&M CLINICAL GROUP',
  listing_tier: 'verified',
  brand_name: 'Interventional Pain Management',
  ...over,
});

test('a verified listing leads with its brand name and keeps the registered one', () => {
  assert.equal(publicName(mm()), 'Interventional Pain Management');
  assert.equal(registeredAs(mm()), 'M&M Clinical Group');
});

test('paid tiers are verified too', () => {
  for (const tier of ['enhanced', 'featured']) {
    assert.equal(publicName(mm({ listing_tier: tier })), 'Interventional Pain Management');
  }
});

test('an unverified listing never shows a brand name, even if the column is filled', () => {
  for (const tier of ['free', '', null, undefined, 'pending']) {
    const c = mm({ listing_tier: tier });
    assert.equal(brandNameOf(c), null, String(tier));
    assert.equal(publicName(c), 'M&M Clinical Group');
    assert.equal(registeredAs(c), null);
  }
});

test('no brand name means the registered name, with nothing to disclose', () => {
  for (const brand of [undefined, null, '', '   ']) {
    const c = mm({ brand_name: brand });
    assert.equal(publicName(c), 'M&M Clinical Group');
    assert.equal(registeredAs(c), null);
  }
});

test('the registered name retyped is not a brand name', () => {
  // Otherwise the page would say "Foo, registered as Foo".
  assert.equal(cleanBrandName('M & M Clinical Group', 'M&M CLINICAL GROUP'), null);
  assert.equal(cleanBrandName('m&m clinical group.', 'M&M CLINICAL GROUP'), null);
  assert.equal(registeredAs(mm({ brand_name: 'M&M Clinical Group' })), null);
});

test('a brand name prints as the practice typed it', () => {
  // displayName would turn these into "Ispine" and "Md Pain Care".
  assert.equal(cleanBrandName('iSpine Pain Physicians'), 'iSpine Pain Physicians');
  assert.equal(cleanBrandName('  MD   Pain Care '), 'MD Pain Care');
});

test('only a name is accepted', () => {
  const bad = [
    'Best Pain Clinic https://example.com',
    'Call us www.example.com',
    'info@example.com',
    'Pain Relief 713-369-1969',
    'Pain Relief 7133691969',
    '<b>Pain Relief</b>',
    'A',
    '12345',
    'x'.repeat(81),
  ];
  for (const s of bad) assert.equal(cleanBrandName(s), null, s);
});

test('a row with no listing is handled, not thrown on', () => {
  assert.equal(brandNameOf(null), null);
  assert.equal(brandNameOf(undefined), null);
});
