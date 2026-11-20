// Pull outside analytics into analytics_snapshots for the admin dashboard.
//
//   node --env-file=.env scripts/sync-analytics.mjs
//
// Runs daily from .github/workflows/sync-analytics.yml, and by hand whenever.
// Same design as bestraces' scripts/sync-analytics.mjs: the dashboard is a
// static page with the public key and cannot hold these credentials, so this
// writes one snapshot per source and the dashboard reads the latest
// (admin_analytics(), analytics_snapshots.sql).
//
// Each source is skipped with a note when its credential is missing, so a
// partial setup does whatever it can:
//
//  - traffic + referrers: Cloudflare zone analytics (GraphQL), edge data, no
//    on-page script. Needs CLOUDFLARE_API_TOKEN (Zone > Analytics : Read, plus
//    Zone : Read unless CLOUDFLARE_ZONE_ID is set). "Uniques" count IPs,
//    crawlers included; on a 15,000-page directory that is mostly robots, and
//    the dashboard labels it so.
//  - keywords: Google Search Console via scripts/lib/gsc.mjs. Needs
//    GSC_SERVICE_ACCOUNT_JSON (path to the key file, whose client_email must be
//    a user on the property). GSC_SITE defaults to sc-domain:painbeacon.com.
//
// Writes need the service-role key under any of its names (scripts/lib/sb-key.mjs).
import { gscClient, latestSettledDay } from './lib/gsc.mjs';
import { serviceKey } from './lib/sb-key.mjs';

const SUPA_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SK = serviceKey();
if (!SUPA_URL || !SK) {
  console.error('Set SUPABASE_URL and the service-role key (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY).');
  process.exit(1);
}

const ZONE_NAME = process.env.CLOUDFLARE_ZONE_NAME || 'painbeacon.com';
const WINDOW = 28; // days per comparison window
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const pct = (c, p) => (p > 0 ? Math.round((1000 * (c - p)) / p) / 10 : null);

async function saveSnapshot(kind, payload) {
  const res = await fetch(`${SUPA_URL}/rest/v1/analytics_snapshots`, {
    method: 'POST',
    headers: { apikey: SK.key, Authorization: `Bearer ${SK.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify([{ kind, payload }]),
  });
  if (!res.ok) throw new Error(`saving ${kind} snapshot failed (${res.status}): ${await res.text()}`);
  console.log(`✔ ${kind} snapshot saved`);
}

// ------------------------------------------------------------------ Cloudflare
async function cloudflare() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) { console.log('– traffic/referrers skipped: CLOUDFLARE_API_TOKEN not set'); return; }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  let zone = process.env.CLOUDFLARE_ZONE_ID;
  if (!zone) {
    const b = await (await fetch(`https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}`, { headers })).json();
    zone = b?.result?.[0]?.id;
    if (!zone) throw new Error(`could not resolve the Cloudflare zone for ${ZONE_NAME}: ${JSON.stringify(b?.errors ?? b)}`);
  }
  const gql = async (query, variables) => {
    const b = await (await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST', headers, body: JSON.stringify({ query, variables }),
    })).json();
    if (b.errors?.length) throw new Error(JSON.stringify(b.errors));
    return b.data;
  };

  const since = day(-(2 * WINDOW)), until = day(-1); // yesterday is the last full day
  const d = await gql(`query ($zone: String!, $since: String!, $until: String!) {
    viewer { zones(filter: { zoneTag: $zone }) {
      httpRequests1dGroups(limit: 100, filter: { date_geq: $since, date_leq: $until }, orderBy: [date_ASC]) {
        dimensions { date } sum { requests pageViews } uniq { uniques }
      } } } }`, { zone, since, until });
  const byDate = new Map((d?.viewer?.zones?.[0]?.httpRequests1dGroups ?? []).map((r) => [r.dimensions.date, r]));
  const days = [];
  for (let i = 2 * WINDOW; i >= 1; i--) {
    const date = day(-i), r = byDate.get(date);
    days.push({ date, requests: r?.sum.requests ?? 0, pageviews: r?.sum.pageViews ?? 0, uniques: r?.uniq.uniques ?? 0 });
  }
  const sum = (slice) => ({
    pageviews: slice.reduce((a, x) => a + x.pageviews, 0),
    uniques: slice.reduce((a, x) => a + x.uniques, 0),
    requests: slice.reduce((a, x) => a + x.requests, 0),
  });
  const previous = sum(days.slice(0, WINDOW)), current = sum(days.slice(WINDOW));
  await saveSnapshot('traffic', {
    zone: ZONE_NAME, window_days: WINDOW, days, current, previous,
    pct: { pageviews: pct(current.pageviews, previous.pageviews), uniques: pct(current.uniques, previous.uniques) },
  });

  // Referrer hosts. The adaptive dataset is not on every plan: report and move on.
  try {
    const ref = await gql(`query ($zone: String!, $since: String!, $until: String!) {
      viewer { zones(filter: { zoneTag: $zone }) {
        httpRequestsAdaptiveGroups(limit: 40, filter: { date_geq: $since, date_leq: $until, clientRefererHost_neq: "" }, orderBy: [count_DESC]) {
          count dimensions { clientRefererHost } } } } }`, { zone, since: day(-WINDOW), until });
    const hosts = (ref?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [])
      .map((r) => ({ host: r.dimensions.clientRefererHost, requests: r.count }))
      .filter((r) => r.host && !r.host.endsWith(ZONE_NAME))
      .slice(0, 20);
    await saveSnapshot('referrers', { window_days: WINDOW, hosts });
  } catch (e) {
    console.log(`– referrers skipped: ${e.message}`);
  }
}

// ------------------------------------------------------- Google Search Console
async function searchConsole() {
  const gsc = await gscClient();
  if (!gsc) { console.log('– keywords skipped: GSC_SERVICE_ACCOUNT_JSON not set'); return; }
  const end = latestSettledDay();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const curStart = iso(endMs - (WINDOW - 1) * 86400000);
  const prevEnd = iso(endMs - WINDOW * 86400000);
  const prevStart = iso(endMs - (2 * WINDOW - 1) * 86400000);

  const totalsOf = async (a, b) => {
    const r = (await gsc.query(a, b, { rowLimit: 1 }))[0];
    return r
      ? { clicks: r.clicks, impressions: r.impressions, ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10 }
      : { clicks: 0, impressions: 0, ctr: null, position: null };
  };
  const totals = await totalsOf(curStart, end);
  const previous = await totalsOf(prevStart, prevEnd);
  const daily = (await gsc.query(prevStart, end, { dimensions: ['date'], rowLimit: 100 }))
    .map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions }));
  const queries = (await gsc.query(curStart, end, { dimensions: ['query'], rowLimit: 25 })).map((r) => ({
    query: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10,
  }));
  const pages = (await gsc.query(curStart, end, { dimensions: ['page'], rowLimit: 15 })).map((r) => ({
    page: r.keys[0].replace(/^https?:\/\/(www\.)?painbeacon\.com/, '') || '/',
    clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10,
  }));

  await saveSnapshot('keywords', {
    site: gsc.site, range: { start: curStart, end }, window_days: WINDOW,
    totals, previous,
    pct: { clicks: pct(totals.clicks, previous.clicks), impressions: pct(totals.impressions, previous.impressions) },
    daily, queries, pages,
  });
}

const results = await Promise.allSettled([cloudflare(), searchConsole()]);
let failed = false;
for (const r of results) {
  if (r.status === 'rejected') { console.error(`✘ ${r.reason.message}`); failed = true; }
}
if (failed) process.exit(1);
console.log('Done. The dashboard reads the latest snapshot per source.');
