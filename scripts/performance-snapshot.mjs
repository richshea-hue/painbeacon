// PainBeacon — one-command performance snapshot for a sales conversation.
//
//   node --env-file=.env scripts/performance-snapshot.mjs            # print
//   node --env-file=.env scripts/performance-snapshot.mjs --out report.md
//   node --env-file=.env scripts/performance-snapshot.mjs --states VA,MD,DC
//
// Three sources, each skipped with a note when its credential is missing, so a
// partial .env still prints whatever it can:
//
//  - Google Search Console: clicks, impressions, top queries and top pages for
//    the last 28 days and the 28 before. Needs GSC_SERVICE_ACCOUNT_JSON (path to
//    a service-account key whose client_email is a user on the property) and
//    optionally GSC_SITE (default sc-domain:painbeacon.com).
//  - Cloudflare zone analytics: daily uniques, page views and requests for the
//    same two windows, plus top referrer hosts. Needs CLOUDFLARE_API_TOKEN
//    (Zone > Analytics : Read; add Zone : Read or set CLOUDFLARE_ZONE_ID).
//    NOTE: Cloudflare's "uniques" count distinct IPs INCLUDING crawlers, and a
//    directory with tens of thousands of pages is crawled constantly — treat
//    that figure as a ceiling, not a headcount. Search Console clicks and the
//    Supabase search log are the honest visitor signals.
//  - Supabase (service role key): searches logged by the site, split by the
//    states you are selling; leads; claims; page inventory per state; sponsor
//    clicks if the ledger exists. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// This must run where those hosts are reachable (Rich's computer). The cloud
// container's egress proxy blocks Cloudflare and Supabase.
import { readFileSync, writeFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const OUT = arg('--out', null);
const STATES = (arg('--states', 'VA,MD,DC')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const ZONE_NAME = process.env.CLOUDFLARE_ZONE_NAME || 'painbeacon.com';
const WINDOW = 28;

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const n = (x) => Number(x || 0).toLocaleString('en-US');
const pct = (c, p) => (p > 0 ? `${c >= p ? '+' : ''}${Math.round((1000 * (c - p)) / p) / 10}%` : '—');
const lines = [];
const say = (s = '') => lines.push(s);

// --------------------------------------------------------------- Search Console
async function searchConsole() {
  const keyPath = process.env.GSC_SERVICE_ACCOUNT_JSON;
  say('## Google Search Console');
  if (!keyPath) { say('_skipped: GSC_SERVICE_ACCOUNT_JSON not set_\n'); return; }
  const site = process.env.GSC_SITE || `sc-domain:${ZONE_NAME}`;
  const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
  })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const tok = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  })).json();
  if (!tok.access_token) throw new Error(`GSC auth failed — is ${sa.client_email} a user on ${site}?`);

  const query = async (startDate, endDate, body) => {
    const r = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, ...body }),
    });
    const out = await r.json();
    if (out.error) throw new Error(`GSC: ${out.error.message}`);
    return out.rows || [];
  };
  // Search Console lags about two days.
  const cEnd = day(-2), cStart = day(-(WINDOW + 1)), pEnd = day(-(WINDOW + 2)), pStart = day(-(2 * WINDOW + 1));
  const [cur] = await query(cStart, cEnd, { rowLimit: 1 });
  const [prev] = await query(pStart, pEnd, { rowLimit: 1 });
  const c = cur || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const p = prev || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  say(`Property: ${site} · ${cStart} → ${cEnd} (vs. prior 28 days)\n`);
  say('| Metric | Last 28 | Prior 28 | Change |');
  say('|---|---:|---:|---:|');
  say(`| Clicks | ${n(c.clicks)} | ${n(p.clicks)} | ${pct(c.clicks, p.clicks)} |`);
  say(`| Impressions | ${n(c.impressions)} | ${n(p.impressions)} | ${pct(c.impressions, p.impressions)} |`);
  say(`| CTR | ${(100 * c.ctr).toFixed(1)}% | ${(100 * p.ctr).toFixed(1)}% | |`);
  say(`| Avg. position | ${c.position ? c.position.toFixed(1) : '—'} | ${p.position ? p.position.toFixed(1) : '—'} | |`);
  const top = (rows, label) => {
    say(`\n**Top ${label}**\n`);
    say(`| ${label} | Clicks | Impr. | Pos. |`); say('|---|---:|---:|---:|');
    for (const r of rows) say(`| ${r.keys[0]} | ${n(r.clicks)} | ${n(r.impressions)} | ${r.position.toFixed(1)} |`);
  };
  top(await query(cStart, cEnd, { dimensions: ['query'], rowLimit: 15 }), 'queries');
  top(await query(cStart, cEnd, { dimensions: ['page'], rowLimit: 15 }), 'pages');
  // Pages in the states being sold — the inventory the sponsor would sit on.
  const stateRe = new RegExp(`/pain-clinics/(${STATES.map((s) => s.toLowerCase()).join('|')})/`);
  const pages = await query(cStart, cEnd, { dimensions: ['page'], rowLimit: 5000 });
  const local = pages.filter((r) => stateRe.test(r.keys[0]));
  const sum = (k) => local.reduce((a, r) => a + r[k], 0);
  say(`\n**${STATES.join('/')} directory pages in Google's last 28 days:** ${n(local.length)} pages, ${n(sum('clicks'))} clicks, ${n(sum('impressions'))} impressions\n`);
}

// ------------------------------------------------------------------ Cloudflare
async function cloudflare() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  say('## Cloudflare (edge, no on-page script)');
  if (!token) { say('_skipped: CLOUDFLARE_API_TOKEN not set_\n'); return; }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let zone = process.env.CLOUDFLARE_ZONE_ID;
  if (!zone) {
    const b = await (await fetch(`https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}`, { headers })).json();
    zone = b?.result?.[0]?.id;
    if (!zone) throw new Error(`could not resolve zone for ${ZONE_NAME}: ${JSON.stringify(b?.errors ?? b)}`);
  }
  const gql = async (query, variables) => {
    const b = await (await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers, body: JSON.stringify({ query, variables }) })).json();
    if (b.errors?.length) throw new Error(JSON.stringify(b.errors));
    return b.data;
  };
  const since = day(-(2 * WINDOW)), until = day(-1);
  const d = await gql(`query ($zone: String!, $since: String!, $until: String!) {
    viewer { zones(filter: { zoneTag: $zone }) {
      httpRequests1dGroups(limit: 100, filter: { date_geq: $since, date_leq: $until }, orderBy: [date_ASC]) {
        dimensions { date } sum { requests pageViews } uniq { uniques }
      } } } }`, { zone, since, until });
  const rows = d?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
  const byDate = new Map(rows.map((r) => [r.dimensions.date, r]));
  const days = [];
  for (let i = 2 * WINDOW; i >= 1; i--) {
    const r = byDate.get(day(-i));
    days.push({ requests: r?.sum.requests ?? 0, pageviews: r?.sum.pageViews ?? 0, uniques: r?.uniq.uniques ?? 0 });
  }
  const tot = (slice, k) => slice.reduce((a, x) => a + x[k], 0);
  const prev = days.slice(0, WINDOW), cur = days.slice(WINDOW);
  say(`Zone: ${ZONE_NAME} · last ${WINDOW} days vs. prior ${WINDOW}\n`);
  say('| Metric | Last 28 | Prior 28 | Change |'); say('|---|---:|---:|---:|');
  for (const [label, k] of [['Page views', 'pageviews'], ['Unique IPs (sum of daily; includes crawlers)', 'uniques'], ['Requests', 'requests']]) {
    say(`| ${label} | ${n(tot(cur, k))} | ${n(tot(prev, k))} | ${pct(tot(cur, k), tot(prev, k))} |`);
  }
  say('\n_Unique IPs here are the number most easily mistaken for "visitors". Say "page views" or the Search Console clicks in the room._');
  try {
    const ref = await gql(`query ($zone: String!, $since: String!, $until: String!) {
      viewer { zones(filter: { zoneTag: $zone }) {
        httpRequestsAdaptiveGroups(limit: 20, filter: { date_geq: $since, date_leq: $until, clientRefererHost_neq: "" }, orderBy: [count_DESC]) {
          count dimensions { clientRefererHost } } } } }`, { zone, since: day(-WINDOW), until });
    const hosts = (ref?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [])
      .filter((r) => r.dimensions.clientRefererHost && !r.dimensions.clientRefererHost.endsWith(ZONE_NAME)).slice(0, 12);
    if (hosts.length) {
      say('\n**Top referrer hosts (last 28 days)**\n'); say('| Host | Requests |'); say('|---|---:|');
      for (const r of hosts) say(`| ${r.dimensions.clientRefererHost} | ${n(r.count)} |`);
    }
  } catch (e) { say(`\n_referrers skipped: ${e.message}_`); }
  say('');
}

// -------------------------------------------------------------------- Supabase
async function supabase() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  say('## Supabase (what visitors did on the site)');
  if (!url || !key) { say('_skipped: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set_\n'); return; }
  const base = url.replace(/\/$/, '');
  const H = { apikey: key, Authorization: `Bearer ${key}` };
  const count = async (table, filter = '') => {
    const r = await fetch(`${base}/rest/v1/${table}?select=id${filter}`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
    const cr = r.headers.get('content-range') || '';
    return Number(cr.split('/')[1] || 0);
  };
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const statesOr = STATES.map((s) => `zone.like.${s.toLowerCase()}/*`).join(',');

  const s30 = await count('search_events', `&created_at=gte.${since30}`);
  const s90 = await count('search_events', `&created_at=gte.${since90}`);
  const m30 = await count('search_events', `&created_at=gte.${since30}&matched=eq.true`);
  const l30 = await count('search_events', `&created_at=gte.${since30}&or=(${statesOr})`);
  const l90 = await count('search_events', `&created_at=gte.${since90}&or=(${statesOr})`);
  say(`| Signal | Last 30 days | Last 90 days |`); say('|---|---:|---:|');
  say(`| Searches on the site (hero, chatbot, deep links) | ${n(s30)} | ${n(s90)} |`);
  say(`| … that resolved to a listed area | ${n(m30)} | |`);
  say(`| … for a ${STATES.join('/')} location | **${n(l30)}** | **${n(l90)}** |`);
  const leads30 = await count('leads', `&created_at=gte.${since30}`);
  const leads90 = await count('leads', `&created_at=gte.${since90}`);
  say(`| People who asked to be connected to a clinic | ${n(leads30)} | ${n(leads90)} |`);
  const claims30 = await count('claims', `&created_at=gte.${since30}`);
  if (claims30 != null) say(`| Practice claims / inquiries | ${n(claims30)} | |`);

  // Inventory the sponsor would own: pages per state.
  say(`\n**Page inventory in ${STATES.join('/')}** (clinic profiles; each state also has a hub and area pages)\n`);
  say('| State | Clinic pages |'); say('|---|---:|');
  for (const st of STATES) say(`| ${st} | ${n(await count('clinics_public', `&state=eq.${st}`))} |`);

  const clicks = await count('sponsor_clicks', `&created_at=gte.${since30}`);
  if (clicks == null) say('\n_sponsor_clicks table not created yet (run sponsor_clicks_table.sql before a sponsor goes live)._');
  else say(`\n**Sponsor clicks, last 30 days:** ${n(clicks)}`);
  say('');
}

say(`# PainBeacon performance snapshot — ${day(0)}\n`);
for (const fn of [searchConsole, cloudflare, supabase]) {
  try { await fn(); } catch (e) { say(`_error: ${e.message}_\n`); }
}
const text = lines.join('\n');
if (OUT) { writeFileSync(OUT, text); console.log(`wrote ${OUT}`); } else console.log(text);
