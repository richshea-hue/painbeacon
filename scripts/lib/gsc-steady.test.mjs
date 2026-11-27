import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, spikeDays, steadyTotals } from './gsc-steady.mjs';

const W = { previous: ['2026-10-01', '2026-10-04'], current: ['2026-10-05', '2026-10-08'] };
const row = (page, date, impressions, position, clicks = 0) => ({ keys: [page, date], impressions, position, clicks });

test('median', () => {
  assert.equal(median([]), 0);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 10]), 2.5);
});

test('a burst day is a spike; a busy normal day is not', () => {
  const m = new Map([['a', 45], ['b', 40], ['c', 1523], ['d', 105], ['e', 50]]);
  assert.deepEqual(spikeDays(m), ['c']);
});

test('a slow site\'s 3-to-15 day is not a spike (floor)', () => {
  assert.deepEqual(spikeDays(new Map([['a', 3], ['b', 2], ['c', 15], ['d', 3]])), []);
});

test('spike day leaves both totals and the median', () => {
  const rows = [
    row('/a', '2026-10-01', 40, 20, 1), row('/a', '2026-10-02', 40, 20), row('/a', '2026-10-03', 40, 20),
    row('/x', '2026-10-04', 1500, 4, 2), row('/a', '2026-10-04', 40, 20),
    row('/a', '2026-10-05', 40, 20), row('/a', '2026-10-06', 40, 20), row('/a', '2026-10-07', 40, 20), row('/a', '2026-10-08', 40, 20, 1),
  ];
  const s = steadyTotals(rows, W);
  assert.deepEqual(s.spike_days.map((d) => d.date), ['2026-10-04']);
  assert.equal(s.previous.impressions, 120);
  assert.equal(s.previous.clicks, 1);
  assert.equal(s.previous.days, 3);
  assert.equal(s.current.impressions, 160);
  assert.equal(s.pct.median_daily_impressions, 0);
});

test('deep positions do not drag the visible average; page one counted', () => {
  const rows = [
    row('/a', '2026-10-05', 30, 8), row('/lafayette', '2026-10-05', 150, 71),
    row('/a', '2026-10-06', 30, 12),
  ];
  const s = steadyTotals(rows, W);
  assert.equal(s.current.position, 10);
  assert.equal(s.current.page1_impressions, 30);
  assert.equal(s.current.impressions, 210);
});

test('days with no rows count as zero days', () => {
  const s = steadyTotals([row('/a', '2026-10-05', 10, 5)], W);
  assert.equal(s.current.days, 4);
  assert.equal(s.current.median_daily_impressions, 0);
  assert.equal(s.previous.position, null);
});
