// node --test src/lib/place-query.test.mjs
// Pins the behavior the search boxes rely on. Twin of the FertilityRecord test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlace, stateOf, placeMatches, placeFilter, placeCandidates } from './place-query.js';

test('normalizes punctuation, filler and state names', () => {
  assert.equal(normalizePlace('Washington, D.C. metro area'), 'washington dc');
  assert.equal(normalizePlace('DC Metro'), 'dc');
  assert.equal(normalizePlace('Arlington, Virginia'), 'arlington va');
  assert.equal(normalizePlace('Saint Paul, Minnesota'), 'st paul mn');
  assert.equal(normalizePlace('Fort Worth, TX'), 'ft worth tx');
  assert.equal(normalizePlace('Greater Boston area clinics'), 'boston');
  assert.equal(normalizePlace('Fairfax County'), 'fairfax');
  // "new york" stays a city name so it leads with "New York, NY" rather than
  // every NY label; stateOf() still reads it as the state.
  assert.equal(normalizePlace('New York City'), 'new york');
  assert.ok(placeMatches('New York City', 'New York, NY'));
  assert.ok(!placeMatches('new york', 'Buffalo, NY'));
  assert.ok(placeCandidates('nyc').includes('brooklyn ny'));
  assert.equal(normalizePlace(''), '');
});

test('a bare state is a state, in any spelling', () => {
  assert.equal(stateOf('dc metro'), 'DC');
  assert.equal(stateOf('Virginia'), 'VA');
  assert.equal(stateOf('la'), 'LA');
  // The bare word is the state, as the map always read it; the capital is
  // "washington dc", and typing that never resolves to a state.
  assert.equal(stateOf('washington'), 'WA');
  assert.equal(stateOf('washington dc'), null);
  assert.equal(stateOf('new york'), 'NY');
});

test('matches labels by token prefix in any order', () => {
  assert.ok(placeMatches('washington dc', 'Washington, DC'));
  assert.ok(placeMatches('Washington DC metro', 'Washington, DC'));
  assert.ok(placeMatches('dc washington', 'Washington, DC'));
  assert.ok(placeMatches('wash', 'Washington, DC'));
  assert.ok(placeMatches('arlington virginia', 'Arlington, VA'));
  assert.ok(placeMatches('st paul', 'Saint Paul, MN'));
  assert.ok(!placeMatches('washington dc', 'Washington, PA'));
  assert.ok(!placeMatches('boston', 'Austin, TX'));
});

test('aliases expand nicknames and regions', () => {
  assert.ok(placeCandidates('DMV').includes('washington dc'));
  assert.ok(placeCandidates('Northern Virginia').includes('arlington va'));
  assert.ok(placeCandidates('NoVA').includes('fairfax va'));
  assert.ok(placeCandidates('Twin Cities').includes('st paul mn'));
  assert.ok(placeCandidates('Bay Area').includes('san francisco ca'));
  assert.ok(placeCandidates('Denver, CO').includes('englewood co'));
  assert.ok(placeCandidates('denver').includes('englewood co'));
  assert.ok(placeCandidates('Phoenix').includes('scottsdale az'));
  assert.deepEqual(placeCandidates('north'), ['north']);
  assert.ok(placeMatches('Hampton Roads', 'Norfolk, VA'));
  assert.ok(placeMatches('Montgomery County MD', 'Bethesda, MD'));
});

test('placeFilter leads with direct matches, then aliases, no duplicates', () => {
  const labels = ['Washington, PA', 'Arlington, VA', 'Washington, DC', 'Bethesda, MD', 'Arlington, TX', 'Alexandria, VA'];
  const out = placeFilter('Washington DC', labels, (l) => l);
  assert.deepEqual(out, ['Washington, DC', 'Arlington, VA', 'Alexandria, VA', 'Bethesda, MD']);

  const nova = placeFilter('northern virginia', labels, (l) => l);
  assert.deepEqual(nova, ['Arlington, VA', 'Alexandria, VA']);

  assert.deepEqual(placeFilter('', labels, (l) => l), []);
  assert.deepEqual(placeFilter('zzz', labels, (l) => l), []);
});

test('an alias target prefers the exact label over a prefix hit', () => {
  const labels = ['St Paul Park, MN', 'Saint Paul, MN', 'Minneapolis, MN'];
  const out = placeFilter('twin cities', labels, (l) => l);
  assert.deepEqual(out, ['Minneapolis, MN', 'Saint Paul, MN', 'St Paul Park, MN']);
});
