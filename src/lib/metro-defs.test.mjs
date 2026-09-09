// node --test src/lib/metro-defs.test.mjs
// Twin of the FertilityRecord test. Pins membership rules, not the metro list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { METROS, buildMetroIndex, bestMetroFor, milesBetween, metroLabel, metroArea } from './metro-defs.js';

const items = [
  { id: 'dc', city: 'Washington', st: 'DC', lat: 38.9072, lng: -77.0369 },
  { id: 'arl', city: 'Arlington', st: 'VA', lat: 38.8816, lng: -77.091 },
  { id: 'beth-located', city: 'Bethesda', st: 'MD', lat: 38.9847, lng: -77.0947 },
  { id: 'beth-unlocated', city: 'Bethesda', st: 'MD', lat: null, lng: null },
  { id: 'richmond', city: 'Richmond', st: 'VA', lat: 37.5407, lng: -77.436 },
  { id: 'nowhere', city: 'Roanoke', st: 'VA', lat: null, lng: null },
];
const latLng = (it) => (it.lat == null ? null : [it.lat, it.lng]);
const cityState = (it) => `${it.city}|${it.st}`;

test('metro definitions are well formed and unique', () => {
  const slugs = new Set();
  for (const m of METROS) {
    assert.ok(!slugs.has(m.slug), `duplicate slug ${m.slug}`);
    slugs.add(m.slug);
    assert.ok(m.name && m.states.length && m.radiusMi > 0 && m.aliases.length, m.slug);
    assert.ok(Math.abs(m.lat) <= 90 && Math.abs(m.lng) <= 180, m.slug);
  }
  assert.equal(metroLabel(METROS[0]), 'Washington, DC');
  assert.equal(metroLabel(METROS.find((m) => m.slug === 'south-florida')), 'South Florida');
  assert.equal(metroArea(METROS[0]), 'the Washington, DC area');
  assert.equal(metroArea(METROS.find((m) => m.slug === 'south-florida')), 'South Florida');
  assert.equal(metroArea(METROS.find((m) => m.slug === 'san-francisco-bay-area')), 'the Bay Area');
});

test('miles between DC and Richmond is about 95', () => {
  const d = milesBetween(38.8977, -77.0365, 37.5407, -77.436);
  assert.ok(d > 90 && d < 100, String(d));
});

test('radius membership, with unlocated clinics borrowing their city', () => {
  const index = buildMetroIndex(items, latLng, cityState);
  const dc = index.get('washington-dc');
  assert.ok(dc);
  assert.deepEqual(dc.items.map((i) => i.id), ['dc', 'arl', 'beth-located', 'beth-unlocated']);
  assert.deepEqual([...dc.byState.entries()], [['DC', 1], ['VA', 1], ['MD', 2]]);
  const rva = index.get('richmond');
  assert.deepEqual(rva.items.map((i) => i.id), ['richmond']);
  assert.ok(!index.has('denver'));
});

test('bestMetroFor picks the metro holding most of a list', () => {
  const index = buildMetroIndex(items, latLng, cityState);
  const best = bestMetroFor(index, [items[1], items[2], items[4]]);
  assert.equal(best.entry.metro.slug, 'washington-dc');
  assert.equal(best.n, 2);
  assert.equal(bestMetroFor(index, [items[5]]), null);
});
