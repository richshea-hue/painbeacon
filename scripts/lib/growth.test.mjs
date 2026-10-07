// node --test scripts/lib/growth.test.mjs
// Pins the ways a growth chart can mislead a sponsor. Every case here is one a
// reviewer already caught by eye: a flat line before launch, a part-month start
// inflating the percentage, and a month still filling in reading as a decline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { monthWindow, firstDayOfWindow, monthComplete, shapeSeries, summarize } from './growth.mjs';

const at = (s) => new Date(`${s}T12:00:00Z`);
const series = (pairs) => pairs.map(([month, value]) => ({ month, value }));

test('the window ends with the current month and runs back N', () => {
  assert.deepEqual(monthWindow(4, at('2026-10-07')), ['2026-07', '2026-08', '2026-09', '2026-10']);
  assert.equal(firstDayOfWindow(4, at('2026-10-07')), '2026-07-01');
  // Across a year boundary.
  assert.deepEqual(monthWindow(3, at('2027-01-15')), ['2026-11', '2026-12', '2027-01']);
});

test('a month is complete only when data reaches its last calendar day', () => {
  assert.equal(monthComplete('2026-09', '2026-09-30'), true);
  assert.equal(monthComplete('2026-09', '2026-09-29'), false);
  assert.equal(monthComplete('2026-10', '2026-10-05'), false);
  // February, and a leap year.
  assert.equal(monthComplete('2026-02', '2026-02-28'), true);
  assert.equal(monthComplete('2028-02', '2028-02-28'), false);
  assert.equal(monthComplete('2028-02', '2028-02-29'), true);
});

test('empty months before launch are dropped, not drawn as a flatline', () => {
  const out = shapeSeries(
    series([['2026-05', 0], ['2026-06', 0], ['2026-07', 120], ['2026-08', 240]]),
    { through: '2026-08-31' },
  );
  assert.deepEqual(out.map((m) => m.month), ['2026-07', '2026-08']);
});

test('an interior quiet month is kept — it is real information', () => {
  const out = shapeSeries(
    series([['2026-07', 120], ['2026-08', 0], ['2026-09', 300]]),
    { through: '2026-09-30' },
  );
  assert.deepEqual(out.map((m) => m.month), ['2026-07', '2026-08', '2026-09']);
});

test('`since` wins over the heuristic, for the part-month launch', () => {
  // July ran nine days. Growing from it would overstate every later month.
  const all = series([['2026-07', 40], ['2026-08', 300], ['2026-09', 420]]);
  const out = shapeSeries(all, { through: '2026-09-30', since: '2026-08' });
  assert.deepEqual(out.map((m) => m.month), ['2026-08', '2026-09']);
  assert.equal(summarize(out).changePct, 40);
  // Without it, the same data claims +950%.
  assert.equal(summarize(shapeSeries(all, { through: '2026-09-30' })).changePct, 950);
});

test('the month in progress is marked and excluded from the headline', () => {
  const out = shapeSeries(
    series([['2026-08', 300], ['2026-09', 450], ['2026-10', 90]]),
    { through: '2026-10-05' },
  );
  assert.deepEqual(out.map((m) => m.partial), [false, false, true]);
  const { first, last, changePct } = summarize(out);
  assert.equal(first.month, '2026-08');
  assert.equal(last.month, '2026-09');       // not the 90 still being counted
  assert.equal(changePct, 50);
});

test("a month that ended two days ago is partial until the source settles it", () => {
  // Search Console lag: on 1 October the last settled day is 29 September, so
  // September is not yet a month to grow from.
  const out = shapeSeries(series([['2026-08', 300], ['2026-09', 290]]), { through: '2026-09-29' });
  assert.deepEqual(out.map((m) => m.partial), [false, true]);
  assert.equal(summarize(out).changePct, null);   // one complete month: no claim
});

test('a single complete month makes no growth claim', () => {
  const out = shapeSeries(series([['2026-09', 420], ['2026-10', 80]]), { through: '2026-10-04' });
  const { first, last, changePct } = summarize(out);
  assert.equal(first.month, '2026-09');
  assert.equal(last, null);
  assert.equal(changePct, null);
});

test('no data anywhere yields an empty series rather than zero bars', () => {
  assert.deepEqual(shapeSeries(series([['2026-09', 0], ['2026-10', 0]]), { through: '2026-10-04' }), []);
  assert.deepEqual(summarize([]), { first: null, last: null, changePct: null });
});

test('a decline is reported as a decline', () => {
  const out = shapeSeries(series([['2026-08', 400], ['2026-09', 300]]), { through: '2026-09-30' });
  assert.equal(summarize(out).changePct, -25);
});
