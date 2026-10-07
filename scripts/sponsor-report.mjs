// PainBeacon — the sponsor's report: views, clicks, rate, by day and by page.
//
//   node --env-file=.env scripts/sponsor-report.mjs --sponsor samakow-law
//   node --env-file=.env scripts/sponsor-report.mjs --sponsor samakow-law \
//        --since 2026-09-03 --until 2026-10-03 --out samakow-day21.md
//
// Reads public.sponsor_events (sponsor_events_table.sql) with the service-role
// key — the anon key is insert-only by design. Dates are inclusive, UTC, and
// default to the sponsor's starts/ends window in data/sponsors.json (or the
// last 30 days if the entry has none). Output is Markdown you can paste into
// an email or hand to the sponsor as is.
//
// What a "view" is: one request for the 1×1 image inside the card, i.e. one
// render of the card in something that loads images — which crawlers mostly
// do not. What a "click" is: one follow of the card's link through /go/,
// JavaScript or not. Neither stores who the visitor was.
//
// Every number here is filtered, and the report says by how much. Until
// 2026-09-22 it was not: /go/ counted any GET, so crawlers following the link
// while skipping the view pixel turned 5 real clicks into 257. A sponsor can
// check us — the redirect tags every click utm_source=painbeacon, so their own
// analytics hold the true figure. Reporting the raw count would have been
// caught, and deserved to be.
//
// A click counts as confirmed when it was not flagged automated AND arrived
// with one of our own pages as its referrer. Rows written before the fix have
// no bot verdict, so for those the referrer test carries the whole weight and
// the report labels the window accordingly.
import { readFileSync, writeFileSync } from 'node:fs';
import { serviceKey, missingKeyMessage } from './lib/sb-key.mjs';
import { gscClient, gscConfigured, latestSettledDay } from './lib/gsc.mjs';
import { monthKey, monthWindow, renderable, shapeSeries, summarize } from './lib/growth.mjs';
import { isBotUA } from '../functions/_lib/bot.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const SPONSOR = arg('--sponsor', null);
const OUT = arg('--out', null);
const JSON_OUT = arg('--json', null);
const GROWTH_MONTHS = Math.max(0, Number(arg('--growth-months', 6)) || 0);
// Where the growth panel gets its numbers. 'auto' prefers Search Console when
// a key is configured, because its history reaches back to launch while the
// site's own search log only starts on 2026-10-06.
const GROWTH_SOURCE = arg('--growth-source', 'auto');
if (!['auto', 'search-console', 'search_events'].includes(GROWTH_SOURCE)) {
  console.error(`--growth-source must be auto, search-console or search_events (got ${GROWTH_SOURCE})`);
  process.exit(1);
}
// Set this when the earliest month with data is the launch month: a part-month
// start makes every later month look like growth that did not happen.
const GROWTH_SINCE = arg('--growth-since', null);
if (!SPONSOR) { console.error('usage: --sponsor <id> [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--out file.md] [--json file.json] [--growth-months 6] [--growth-since YYYY-MM] [--growth-source auto|search-console|search_events]'); process.exit(1); }

const url = process.env.SUPABASE_URL;
const found = serviceKey();
if (!url || !found) { console.error(missingKeyMessage(process.env, 'sponsor_events')); process.exit(1); }
const key = found.key;

let entry = null;
try { entry = (JSON.parse(readFileSync(new URL('../data/sponsors.json', import.meta.url), 'utf8')).sponsors || []).find((s) => s.id === SPONSOR) || null; } catch {}
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const SINCE = arg('--since', entry?.starts || day(-30));
const UNTIL = arg('--until', entry?.ends || day(0));

// Pull every event in the window (paged), then aggregate here — the table is
// small and this keeps the SQL surface to one select.
const base = url.replace(/\/$/, '');
const H = { apikey: key, Authorization: `Bearer ${key}` };
const rows = [];
for (let from = 0; ; from += 1000) {
  const r = await fetch(`${base}/rest/v1/sponsor_events?select=created_at,event,path,referrer,bot&sponsor=eq.${encodeURIComponent(SPONSOR)}&created_at=gte.${SINCE}T00:00:00Z&created_at=lt.${UNTIL}T23:59:59.999Z&order=created_at.asc`,
    { headers: { ...H, Range: `${from}-${from + 999}`, Prefer: 'count=exact' } });
  if (r.status === 404) { console.error('sponsor_events table not found — run sponsor_events_table.sql in Supabase first.'); process.exit(1); }
  if (!r.ok && r.status !== 416) { console.error(`Supabase ${r.status}: ${await r.text()}`); process.exit(1); }
  if (r.status === 416) break;
  const page = await r.json();
  rows.push(...page);
  if (page.length < 1000) break;
}

const n = (x) => Number(x || 0).toLocaleString('en-US');
const pct = (c, v) => (v > 0 ? `${(100 * c / v).toFixed(2)}%` : '—');

// One classifier, used everywhere below, so the headline and the breakdowns
// can never disagree about what counted.
const automated = (r) => r.bot === true;
const sameSite = (r) => typeof r.referrer === 'string' && /(^|\/\/)([a-z0-9-]+\.)*painbeacon\.com/i.test(r.referrer);
// A view already requires a browser that fetches images; a click has to prove
// it came from one of our pages.
const confirmed = (r) => !automated(r) && (r.event === 'view' || sameSite(r));

const viewRows = rows.filter((r) => r.event === 'view');
const clickRows = rows.filter((r) => r.event === 'click');
const views = viewRows.filter(confirmed).length;
const clicks = clickRows.filter(confirmed).length;
const botViews = viewRows.filter(automated).length;
const botClicks = clickRows.filter(automated).length;
// Not flagged automated, but with nothing tying it to one of our pages.
const unattributed = clickRows.filter((r) => !automated(r) && !sameSite(r)).length;
// Rows written before the counter was fixed carry no verdict at all.
const legacy = rows.filter((r) => r.bot === null || r.bot === undefined).length;

const byDay = new Map();
for (let d = new Date(`${SINCE}T00:00:00Z`); d <= new Date(`${UNTIL}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) byDay.set(d.toISOString().slice(0, 10), { v: 0, c: 0 });
for (const r of rows.filter(confirmed)) { const k = r.created_at.slice(0, 10); const b = byDay.get(k) || { v: 0, c: 0 }; b[r.event === 'view' ? 'v' : 'c']++; byDay.set(k, b); }

const byPage = new Map();
for (const r of rows.filter(confirmed)) { const k = r.path || '(unknown)'; const b = byPage.get(k) || { v: 0, c: 0 }; b[r.event === 'view' ? 'v' : 'c']++; byPage.set(k, b); }
const topPages = [...byPage.entries()].sort((a, b) => b[1].c - a[1].c || b[1].v - a[1].v).slice(0, 25);

// Which kinds of page did the work: area lists, clinic profiles, state hubs, guides.
const kind = (p) => (/^\/news\//.test(p) ? 'Guides' : /^\/clinic\//.test(p) ? 'Clinic profiles' : /^\/pain-clinics\/[a-z]{2}\/[^/]+\/$/.test(p) ? 'Area pages' : /^\/pain-clinics\/[a-z]{2}\/$/.test(p) ? 'State hubs' : 'Other');
const byKind = new Map();
for (const [p, b] of byPage) { const k = kind(p); const t = byKind.get(k) || { v: 0, c: 0 }; t.v += b.v; t.c += b.c; byKind.set(k, t); }

// ---------------------------------------------------------------------------
// How the site itself is growing.
//
// Two sources can answer this, and neither one is page views. Page views on a
// 12,000-page directory are mostly robots — the same trap that briefly turned
// 5 real sponsor clicks into 257, and not a number to put in front of anyone
// who buys advertising.
//
//  - Search Console, the default wherever GSC_SERVICE_ACCOUNT_JSON is set. An
//    impression means Google showed a PainBeacon page to a person reading a
//    results page; a click means that person came. GOOGLE counts both, not us,
//    which is what makes the figure checkable by the sponsor, and the history
//    reaches back to launch because Google was recording it before anyone here
//    thought to report it.
//  - search_events, the site's own log: one row per ZIP or city a visitor
//    typed into the search box and submitted. Written by client-side
//    JavaScript, so a crawler that never runs JS cannot produce one, and the
//    act is deliberate rather than incidental. deep_link rows are excluded —
//    those come from a URL, which a crawler can follow; only 'hero' and
//    'chatbot' are a person at a keyboard. The table was not created until
//    2026-10-06, so it has no history before that date.
//
// Impressions are the bar series and clicks ride alongside as a plain number.
// The two differ by a factor of about fifty, and drawing both as bars means two
// scales in one panel — the dual-axis trick that can make any pair of series
// say whatever the author wanted.
const growth = { months: [], source: null, metric: null, property: null, through: null, note: null };
if (GROWTH_MONTHS > 0) {
  const want = GROWTH_SOURCE === 'auto'
    ? (gscConfigured() ? 'search-console' : 'search_events')
    : GROWTH_SOURCE;

  if (want === 'search-console') {
    growth.source = 'search-console';
    growth.metric = 'impressions';
    const keys = monthWindow(GROWTH_MONTHS);
    try {
      const gsc = await gscClient();
      if (!gsc) throw new Error('GSC_SERVICE_ACCOUNT_JSON not set');
      growth.property = gsc.site;
      const through = latestSettledDay();
      growth.through = through;
      const rows = await gsc.query(`${keys[0]}-01`, through, { dimensions: ['date'], rowLimit: 25000 });
      const bucket = new Map(keys.map((k) => [k, { impressions: 0, clicks: 0 }]));
      for (const r of rows) {
        const b = bucket.get(monthKey(r.keys[0]));
        if (!b) continue;
        b.impressions += r.impressions || 0;
        b.clicks += r.clicks || 0;
      }
      growth.months = shapeSeries(keys.map((month) => ({
        month, value: bucket.get(month).impressions, clicks: bucket.get(month).clicks,
      })), { through, since: GROWTH_SINCE });
    } catch (e) {
      // A missing key, an unshared property and a network block all land here,
      // and none of them should cost the sponsor their report.
      growth.note = `Search Console unavailable (${e.message})`;
    }
  } else {
    growth.source = 'search_events';
    growth.metric = 'searches';
    const keys = monthWindow(GROWTH_MONTHS);
    const from = `${keys[0]}-01`;
    const sRows = [];
    let ok = true;
    for (let off = 0; ; off += 1000) {
      const r = await fetch(`${base}/rest/v1/search_events?select=created_at,source,user_agent&created_at=gte.${from}T00:00:00Z&order=created_at.asc`,
        { headers: { ...H, Range: `${off}-${off + 999}` } });
      if (r.status === 416) break;
      if (!r.ok) { ok = false; growth.note = `search_events unavailable (${r.status})`; break; }
      const page = await r.json();
      sRows.push(...page);
      if (page.length < 1000) break;
    }
    if (ok) {
      const human = sRows.filter((r) => (r.source === 'hero' || r.source === 'chatbot') && !isBotUA(r.user_agent));
      const counts = new Map(keys.map((k) => [k, 0]));
      for (const r of human) {
        const k = monthKey(r.created_at);
        if (counts.has(k)) counts.set(k, counts.get(k) + 1);
      }
      const through = day(0);
      growth.through = through;
      growth.months = shapeSeries(keys.map((month) => ({ month, value: counts.get(month) })),
        { through, since: GROWTH_SINCE });
    }
  }
}
Object.assign(growth, summarize(growth.months));
// Drawn only where there is a complete month to draw. A panel holding nothing
// but the month in progress makes no claim and reads worse than no panel.
growth.renderable = renderable(growth.months);

const name = entry?.name || SPONSOR;
const L = [];
L.push(`# ${name} on PainBeacon — sponsor report`);
L.push(`${SINCE} to ${UNTIL}${entry?.states?.length ? ` · ${entry.states.join(', ')}` : ''} · prepared ${day(0)}\n`);
L.push('| | |'); L.push('|---|---:|');
L.push(`| Card views | ${n(views)} |`);
L.push(`| Clicks to ${entry?.url ? new URL(entry.url).hostname.replace(/^www\./, '') : 'your site'} | ${n(clicks)} |`);
L.push(`| Click-through rate | ${pct(clicks, views)} |`);
L.push(`| Days live | ${[...byDay.values()].filter((b) => b.v > 0).length} of ${byDay.size} |\n`);

L.push('### What was filtered out\n');
L.push('| | |'); L.push('|---|---:|');
L.push(`| Automated requests not counted | ${n(botViews + botClicks)} |`);
L.push(`| Clicks we could not attribute to a page | ${n(unattributed)} |`);
L.push(`| Raw events before filtering | ${n(rows.length)} |\n`);
if (legacy > 0) {
  L.push(`> ${n(legacy)} of these events predate the counter fix of 2026-09-22 and carry no`);
  L.push('> automation verdict. For those, a click counts only when it arrived from one of');
  L.push('> our own pages, which is the stricter test — so this window understates rather');
  L.push('> than overstates.\n');
}

L.push('## By page type\n'); L.push('| Page type | Views | Clicks | Rate |'); L.push('|---|---:|---:|---:|');
for (const [k, t] of [...byKind.entries()].sort((a, b) => b[1].v - a[1].v)) L.push(`| ${k} | ${n(t.v)} | ${n(t.c)} | ${pct(t.c, t.v)} |`);

L.push('\n## By day\n'); L.push('| Day | Views | Clicks |'); L.push('|---|---:|---:|');
for (const [k, b] of byDay) L.push(`| ${k} | ${n(b.v)} | ${n(b.c)} |`);

L.push('\n## Top pages\n'); L.push('| Page | Views | Clicks |'); L.push('|---|---:|---:|');
for (const [p, b] of topPages) L.push(`| ${p} | ${n(b.v)} | ${n(b.c)} |`);

const GSC = growth.source === 'search-console';
if (growth.renderable) {
  L.push('\n## How the site is growing\n');
  if (GSC) {
    L.push('| Month | Times Google showed a page | Visitors who clicked through |');
    L.push('|---|---:|---:|');
    for (const m of growth.months) {
      L.push(`| ${m.month}${m.partial ? ' (so far)' : ''} | ${n(m.value)} | ${n(m.clicks)} |`);
    }
  } else {
    L.push('| Month | Searches run by visitors |'); L.push('|---|---:|');
    for (const m of growth.months) L.push(`| ${m.month}${m.partial ? ' (so far)' : ''} | ${n(m.value)} |`);
  }
  if (growth.changePct !== null) {
    const what = GSC ? ' in how often Google showed a PainBeacon page' : '';
    L.push(`\n**${growth.changePct >= 0 ? '+' : ''}${growth.changePct}%**${what} from ${growth.first.month} to ${growth.last.month}.\n`);
  }
  if (GSC) {
    L.push('These are Google\'s own counts, from Search Console, for');
    L.push(`${growth.property}. An impression is one time Google showed a PainBeacon page to`);
    L.push('someone reading a results page; a click is one time that person came. We report');
    L.push('these rather than page views because on a directory of 12,000 pages most raw page');
    L.push('requests are crawlers rather than readers — and because you can hold us to a');
    L.push('number we did not count ourselves. Google settles each day about two days late,');
    L.push(`so figures run through ${growth.through} and any month still open is marked.\n`);
  } else {
    L.push('A search is one person typing a ZIP code or city into the site and submitting it.');
    L.push('We report these rather than page views: the search is recorded by JavaScript in the');
    L.push('visitor\'s browser, so automated traffic cannot produce one, and on a directory of');
    L.push('12,000 pages most raw page requests are crawlers rather than readers.\n');
  }
} else if (GROWTH_MONTHS > 0) {
  // Say nothing to the sponsor, but never let the operator think it rendered.
  console.error(`growth panel omitted: ${growth.note
    || (growth.months.length ? 'no complete month yet — only the month in progress has data' : 'no data in the window')}`);
}

L.push('\n---');
L.push('A view is one display of your card in a browser that loads images; crawlers mostly do not, which is what makes this a reader count. A click is counted only when it was not flagged as automated and arrived from one of our own pages — everything else is excluded and shown above. Clicks are forwarded to your site with UTM tags (utm_source=painbeacon, utm_medium=sponsor, utm_campaign=' + SPONSOR + ', utm_content=the page), so your own analytics show the same visits under Acquisition → Campaigns. PainBeacon stores no IP address, device identifier or cookie for any of this.');

const text = L.join('\n');
if (OUT) { writeFileSync(OUT, text); console.log(`wrote ${OUT}`); } else if (!JSON_OUT) console.log(text);

// The PDF renderer reads this rather than parsing the Markdown back, so there
// is one set of arithmetic and the two outputs cannot disagree.
if (JSON_OUT) {
  const payload = {
    sponsor: SPONSOR, name, states: entry?.states || [], url: entry?.url || null,
    since: SINCE, until: UNTIL, prepared: day(0),
    headline: { views, clicks, ctr: views > 0 ? +(100 * clicks / views).toFixed(2) : null,
                days_with_views: [...byDay.values()].filter((b) => b.v > 0).length, days: byDay.size },
    filtered: { automated: botViews + botClicks, unattributed, raw: rows.length, legacy },
    by_kind: [...byKind.entries()].map(([kind, t]) => ({ kind, views: t.v, clicks: t.c })),
    by_day: [...byDay.entries()].map(([date, b]) => ({ date, views: b.v, clicks: b.c })),
    top_pages: topPages.map(([path, b]) => ({ path, views: b.v, clicks: b.c })),
    clicks_detail: clickRows.filter(confirmed).map((r) => ({ date: r.created_at.slice(0, 10), path: r.path || '' })),
    growth,
  };
  writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2));
  console.log(`wrote ${JSON_OUT}`);
}
