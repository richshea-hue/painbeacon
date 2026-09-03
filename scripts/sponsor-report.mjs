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
// render of the card in something that loads images. Real people, plus the
// crawlers that fetch images. What a "click" is: one follow of the card's link
// through /go/, JavaScript or not. Neither stores who the visitor was.
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const SPONSOR = arg('--sponsor', null);
const OUT = arg('--out', null);
if (!SPONSOR) { console.error('usage: --sponsor <id> [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--out file.md]'); process.exit(1); }

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (see .env.example).'); process.exit(1); }

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
  const r = await fetch(`${base}/rest/v1/sponsor_events?select=created_at,event,path,referrer&sponsor=eq.${encodeURIComponent(SPONSOR)}&created_at=gte.${SINCE}T00:00:00Z&created_at=lt.${UNTIL}T23:59:59.999Z&order=created_at.asc`,
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
const views = rows.filter((r) => r.event === 'view').length;
const clicks = rows.filter((r) => r.event === 'click').length;

const byDay = new Map();
for (let d = new Date(`${SINCE}T00:00:00Z`); d <= new Date(`${UNTIL}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) byDay.set(d.toISOString().slice(0, 10), { v: 0, c: 0 });
for (const r of rows) { const k = r.created_at.slice(0, 10); const b = byDay.get(k) || { v: 0, c: 0 }; b[r.event === 'view' ? 'v' : 'c']++; byDay.set(k, b); }

const byPage = new Map();
for (const r of rows) { const k = r.path || '(unknown)'; const b = byPage.get(k) || { v: 0, c: 0 }; b[r.event === 'view' ? 'v' : 'c']++; byPage.set(k, b); }
const topPages = [...byPage.entries()].sort((a, b) => b[1].c - a[1].c || b[1].v - a[1].v).slice(0, 25);

// Which kinds of page did the work: area lists, clinic profiles, state hubs, guides.
const kind = (p) => (/^\/news\//.test(p) ? 'Guides' : /^\/clinic\//.test(p) ? 'Clinic profiles' : /^\/pain-clinics\/[a-z]{2}\/[^/]+\/$/.test(p) ? 'Area pages' : /^\/pain-clinics\/[a-z]{2}\/$/.test(p) ? 'State hubs' : 'Other');
const byKind = new Map();
for (const [p, b] of byPage) { const k = kind(p); const t = byKind.get(k) || { v: 0, c: 0 }; t.v += b.v; t.c += b.c; byKind.set(k, t); }

const name = entry?.name || SPONSOR;
const L = [];
L.push(`# ${name} on PainBeacon — sponsor report`);
L.push(`${SINCE} to ${UNTIL}${entry?.states?.length ? ` · ${entry.states.join(', ')}` : ''} · prepared ${day(0)}\n`);
L.push('| | |'); L.push('|---|---:|');
L.push(`| Card views | ${n(views)} |`);
L.push(`| Clicks to ${entry?.url ? new URL(entry.url).hostname.replace(/^www\./, '') : 'your site'} | ${n(clicks)} |`);
L.push(`| Click-through rate | ${pct(clicks, views)} |`);
L.push(`| Days live | ${[...byDay.values()].filter((b) => b.v > 0).length} of ${byDay.size} |\n`);

L.push('## By page type\n'); L.push('| Page type | Views | Clicks | Rate |'); L.push('|---|---:|---:|---:|');
for (const [k, t] of [...byKind.entries()].sort((a, b) => b[1].v - a[1].v)) L.push(`| ${k} | ${n(t.v)} | ${n(t.c)} | ${pct(t.c, t.v)} |`);

L.push('\n## By day\n'); L.push('| Day | Views | Clicks |'); L.push('|---|---:|---:|');
for (const [k, b] of byDay) L.push(`| ${k} | ${n(b.v)} | ${n(b.c)} |`);

L.push('\n## Top pages\n'); L.push('| Page | Views | Clicks |'); L.push('|---|---:|---:|');
for (const [p, b] of topPages) L.push(`| ${p} | ${n(b.v)} | ${n(b.c)} |`);

L.push('\n---');
L.push('A view is one display of your card in a browser that loads images (real readers plus the crawlers that fetch images). A click is one follow of the card\'s link, counted on our servers and forwarded to your site with UTM tags (utm_source=painbeacon, utm_medium=sponsor, utm_campaign=' + SPONSOR + ', utm_content=the page), so your own analytics show the same visits under Acquisition → Campaigns. PainBeacon stores no IP address, device identifier or cookie for any of this.');

const text = L.join('\n');
if (OUT) { writeFileSync(OUT, text); console.log(`wrote ${OUT}`); } else console.log(text);
