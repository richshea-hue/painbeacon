// Search Console totals with the two known distortions taken out.
//
// Found 2026-11-21 when a flat month read as a halving:
//
//  1. One-day bursts. On 2026-10-20 Google logged 1,523 impressions at an
//     average position of 4, about one each on 638 pages, 2 clicks; the days
//     around it ran ~45. Same in the weeks of 2026-06-08 and 2026-08-24.
//     Whatever they are (Google testing pages, rank-tracking tools), they are
//     not patients, and one of them in a 28-day window doubles its total.
//     A day is a spike when its impressions are over SPIKE_MULTIPLE times the
//     median day of the whole series AND at least SPIKE_FLOOR above it, so a
//     slow site's 3-to-15 day is not one.
//
//  2. Deep positions. From 2026-10-23 the Lafayette area page showed for
//     "pain clinic near me" at position ~71 (page eight), 533 impressions
//     nobody saw, which moved the site's average from ~24 to ~38. So position
//     is averaged over page-days in the top VISIBLE_POSITION only, and
//     page-one impressions (position <= 10) are counted on their own: that
//     is the number that turns into clicks.
//
// Input: rows from a Search Console query with dimensions ['page', 'date'].

export const SPIKE_MULTIPLE = 5;
export const SPIKE_FLOOR = 200;
export const VISIBLE_POSITION = 50;

export function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Dates whose total impressions are a burst against the series' median day. */
export function spikeDays(byDate) {
  const vals = [...byDate.values()];
  const med = median(vals);
  return [...byDate].filter(([, v]) => v > SPIKE_MULTIPLE * med && v - med >= SPIKE_FLOOR).map(([d]) => d).sort();
}

const pct = (c, p) => (p > 0 ? Math.round((1000 * (c - p)) / p) / 10 : null);

/**
 * rows: [{ keys: [page, date], clicks, impressions, position }]
 * windows: { previous: [start, end], current: [start, end] }, inclusive ISO dates.
 * Every date in a window counts as a day, with or without rows, so a quiet
 * day pulls the median down as it should.
 */
export function steadyTotals(rows, windows) {
  const byDate = new Map();
  for (const w of Object.values(windows)) {
    for (let t = Date.parse(w[0]); t <= Date.parse(w[1]); t += 86400000) byDate.set(new Date(t).toISOString().slice(0, 10), 0);
  }
  for (const r of rows) if (byDate.has(r.keys[1])) byDate.set(r.keys[1], byDate.get(r.keys[1]) + r.impressions);
  const spikes = spikeDays(byDate);
  const skip = new Set(spikes);

  const one = ([a, b]) => {
    const inWin = (d) => d >= a && d <= b && !skip.has(d);
    let clicks = 0, impressions = 0, page1 = 0, visImpr = 0, visPos = 0;
    for (const r of rows) {
      if (!inWin(r.keys[1])) continue;
      clicks += r.clicks; impressions += r.impressions;
      if (r.position <= 10) page1 += r.impressions;
      if (r.position <= VISIBLE_POSITION) { visImpr += r.impressions; visPos += r.position * r.impressions; }
    }
    const daily = [...byDate].filter(([d]) => inWin(d)).map(([, v]) => v);
    return {
      clicks, impressions, page1_impressions: page1,
      median_daily_impressions: median(daily),
      position: visImpr ? Math.round((10 * visPos) / visImpr) / 10 : null,
      days: daily.length,
    };
  };
  const current = one(windows.current), previous = one(windows.previous);
  return {
    spike_days: spikes.map((d) => ({ date: d, impressions: byDate.get(d) })),
    visible_position: VISIBLE_POSITION,
    current, previous,
    pct: {
      clicks: pct(current.clicks, previous.clicks),
      median_daily_impressions: pct(current.median_daily_impressions, previous.median_daily_impressions),
      page1_impressions: pct(current.page1_impressions, previous.page1_impressions),
    },
  };
}
