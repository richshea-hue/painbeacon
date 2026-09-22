// node --test src/lib/practice-type.test.mjs
// Pins the two rules the directory's honesty rests on: a record's DISCIPLINES
// come from every taxonomy slot it declared, while its RANK ELIGIBILITY comes
// from its primary registration alone. Codes below are real ones from the
// production inventory, with their live record counts noted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DISCIPLINES, disciplinesOf, disciplineAttr, isRankable, taxonomyCodes } from './practice-type.js';

const rec = (primary, all) => ({ primary_taxonomy_code: primary, all_taxonomy_codes: all ?? primary });
const has = (c, k) => disciplinesOf(c).includes(k);

test('disciplines read every slot, not just the primary one', () => {
  // The case Rich hit: a pain practice that is also a chiropractor. Under
  // primary-code grouping this was invisible under "Chiropractic" — 515 of the
  // 575 chiropractic records are secondary declarations like this one.
  const c = rec('208VP0014X', '208VP0014X|111N00000X');
  assert.ok(has(c, 'interventional'));
  assert.ok(has(c, 'chiropractic'));
  assert.equal(disciplineAttr(c), 'interventional chiropractic');
});

test('a record with no all_taxonomy_codes still classifies off its primary', () => {
  assert.deepEqual(taxonomyCodes({ primary_taxonomy_code: '111N00000X' }), ['111N00000X']);
  assert.ok(has({ primary_taxonomy_code: '111N00000X' }, 'chiropractic'));
  assert.deepEqual(disciplinesOf({}), []);
});

test('rank eligibility reads the primary code only', () => {
  // A pain clinic that also dispenses braces is still a pain clinic.
  assert.ok(isRankable(rec('208VP0014X', '208VP0014X|332B00000X')));
  // A durable-medical-equipment company is not, whatever else it declared —
  // and all 12,487 listed records declare a pain code somewhere, so the
  // secondary slot here is the norm rather than an edge case.
  assert.ok(!isRankable(rec('332B00000X', '332B00000X|208VP0014X')));
  assert.ok(!isRankable(rec('291U00000X'))); // clinical medical laboratory
  assert.ok(!isRankable(rec('251B00000X'))); // case management
  // The rest of 251 delivers care and ranks.
  assert.ok(isRankable(rec('251E00000X'))); // home health
});

test('the supply chip still finds a supplier that cannot rank', () => {
  const dme = rec('332B00000X', '332B00000X|208VP0014X');
  assert.ok(!isRankable(dme));
  assert.ok(has(dme, 'supply'), 'must be findable under its own discipline');
});

test('specialty boundaries that are easy to get wrong', () => {
  // 171M is Case Manager/Care Coordinator, not an acupuncturist, despite 171.
  assert.ok(has(rec('171100000X'), 'acupuncture'));
  assert.ok(!has(rec('171M00000X'), 'acupuncture'));
  assert.ok(has(rec('171M00000X'), 'home-health'));
  // Primary care is general internal medicine, not its subspecialties.
  assert.ok(has(rec('207R00000X'), 'primary-care'));
  assert.ok(!has(rec('207RC0000X'), 'primary-care')); // cardiovascular disease
  assert.ok(has(rec('207RR0500X'), 'rheumatology'));
  // Sports medicine is a suffix across several parent specialties.
  assert.ok(has(rec('2081S0010X'), 'sports-medicine'));
  assert.ok(has(rec('207QS0010X'), 'sports-medicine'));
  assert.ok(has(rec('207XX0005X'), 'sports-medicine'));
  assert.ok(!has(rec('2081P2900X'), 'sports-medicine'));
  // A pain anesthesiologist is an anesthesiologist and a pain physician both.
  const pa = rec('207LP2900X');
  assert.ok(has(pa, 'anesthesiology'));
  assert.ok(has(pa, 'pain-medicine'));
  assert.ok(!has(pa, 'interventional'));
});

test('every discipline has a distinct key and a label', () => {
  const keys = DISCIPLINES.map((d) => d.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const d of DISCIPLINES) {
    assert.ok(d.label && typeof d.match === 'function', `${d.key} is incomplete`);
    // Keys land in an HTML attribute and are split on spaces to match.
    assert.ok(/^[a-z-]+$/.test(d.key), `${d.key} must be space-free and lowercase`);
  }
});
