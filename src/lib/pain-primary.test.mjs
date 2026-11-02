// node --test src/lib/pain-primary.test.mjs
// The gate that decides whether a practice registered as something else -- a
// general anesthesia group, a chiropractor, a medical-supply company -- is
// listed as a pain clinic because one of its fifteen taxonomy slots carries a
// pain code. See the block above the gate in data.js for why it exists and why
// it is off by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitByListablePrimary, offPrimarySummary, isPainPrimary, isListablePrimary } from './data.js';

const rec = (primary, desc) => ({ primary_taxonomy_code: primary, primary_taxonomy_desc: desc });

test('all five pain codes count as pain-primary', () => {
  for (const code of [
    '207LP2900X', // Anesthesiology - Pain Medicine
    '208VP0014X', // Pain Medicine - Interventional Pain Medicine
    '208VP0000X', // Pain Medicine - Pain Medicine
    '2081P2900X', // Physical Medicine & Rehabilitation - Pain Medicine
    '2084P2900X', // Psychiatry & Neurology - Pain Medicine
  ]) {
    assert.ok(isPainPrimary(rec(code)), code);
  }
});

test('a pain anesthesiologist is kept, a general anesthesia group is not', () => {
  // The distinction the whole gate turns on. 207LP2900X is the pain
  // subspecialty; 207L00000X is the group that staffs operating rooms, and is
  // what "anesthesia services companies green bay" was finding.
  assert.ok(isPainPrimary(rec('207LP2900X')));
  assert.ok(!isPainPrimary(rec('207L00000X')));
});

test('a clinic registered as a pain center is listed, though not pain-primary', () => {
  // 261QP3300X is "Clinic/Center - Pain": a pain clinic by registration, but
  // not a physician subspecialty, so the two questions diverge here. 63 live
  // records sit on this distinction.
  const painCenter = rec('261QP3300X', 'Clinic/Center, Pain');
  assert.ok(!isPainPrimary(painCenter), 'not a physician pain subspecialty');
  assert.ok(isListablePrimary(painCenter), 'but it is still a pain clinic');
});

test('split keeps order and loses nothing', () => {
  const rows = [
    rec('208VP0014X', 'Pain Medicine - Interventional Pain Medicine'),
    rec('207L00000X', 'Anesthesiology'),
    rec('332B00000X', 'Durable Medical Equipment & Medical Supplies'),
    rec('2084P2900X', 'Psychiatry & Neurology - Pain Medicine'),
  ];
  const { primary, offPrimary } = splitByListablePrimary(rows);
  assert.equal(primary.length + offPrimary.length, rows.length);
  assert.deepEqual(primary.map((c) => c.primary_taxonomy_code), ['208VP0014X', '2084P2900X']);
  assert.deepEqual(offPrimary.map((c) => c.primary_taxonomy_code), ['207L00000X', '332B00000X']);
});

test('a row with no primary taxonomy is off-primary, not a crash', () => {
  const { primary, offPrimary } = splitByListablePrimary([{}, { primary_taxonomy_code: null }]);
  assert.equal(primary.length, 0);
  assert.equal(offPrimary.length, 2);
});

test('the summary counts, ranks and names the registrations', () => {
  const offPrimary = [
    rec('207L00000X', 'Anesthesiology'),
    rec('207L00000X', 'Anesthesiology'),
    rec('207X00000X', 'Orthopaedic Surgery'),  // us-english-ok
    { primary_taxonomy_code: null },
  ];
  const line = offPrimarySummary(offPrimary, 10);
  assert.match(line, /4 of 10 listings \(40\.0%\) are not pain-primary/);
  // Most common first, ties alphabetical, and CMS's own spelling is not corrected.
  assert.match(line, /Anesthesiology 2; \(no primary taxonomy\) 1; Orthopaedic Surgery 1/);  // us-english-ok
});

test('an empty off-primary set reports no division by zero', () => {
  assert.match(offPrimarySummary([], 0), /0 of 0 listings \(0\.0%\)/);
});
