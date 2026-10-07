// Shaping a monthly growth series, shared by every source that feeds one.
//
// The rules here are all answers to ways a month chart lies:
//
//  - A window of N months on a site younger than N opens with empty months,
//    which draw as a flat line BEFORE the site existed rather than as "we were
//    not there yet". Leading empty months are dropped. Interior zeros are kept:
//    a genuine quiet month is information.
//  - The launch month itself ran for part of a month, so growing from it
//    overstates every later month. The heuristic cannot see that, so `since`
//    overrides it.
//  - The month in progress is short by construction and would read as a fall.
//    It is drawn, marked partial, and left out of the headline change.
//  - Search Console settles a day's data about two days late, so even a month
//    that ended yesterday can still be filling in. Completeness is decided
//    against the last settled day, not against today.

export const monthKey = (iso) => String(iso).slice(0, 7);

const pad = (n) => String(n).padStart(2, '0');
const lastDayOf = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};

/** The N month keys ending with the month `now` falls in, oldest first. */
export function monthWindow(count, now = new Date()) {
  const keys = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - (count - 1));
  for (let i = 0; i < count; i += 1) {
    keys.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return keys;
}

export const firstDayOfWindow = (count, now = new Date()) => `${monthWindow(count, now)[0]}-01`;

/** A month is complete when data exists through its final calendar day. */
export const monthComplete = (ym, through) => String(through) >= lastDayOf(ym);

/**
 * Trim and mark a series of { month, value, ... } entries.
 * `through` is the last date the source has settled data for.
 */
export function shapeSeries(entries, { through, since = null } = {}) {
  let series = entries.map((e) => ({ ...e, partial: !monthComplete(e.month, through) }));
  const firstWithData = series.findIndex((m) => m.value > 0);
  series = firstWithData === -1 ? [] : series.slice(firstWithData);
  if (since) series = series.filter((m) => m.month >= since);
  return series;
}

/**
 * First and last COMPLETE non-empty month, and the change between them. A
 * partial month can never read as a decline, and an empty leading month can
 * never read as infinite growth.
 */
export function summarize(series) {
  const complete = series.filter((m) => !m.partial && m.value > 0);
  const first = complete[0] || null;
  const last = complete.length > 1 ? complete[complete.length - 1] : null;
  const changePct = first && last && first.value > 0
    ? Math.round((100 * (last.value - first.value)) / first.value)
    : null;
  return { first, last, changePct };
}
