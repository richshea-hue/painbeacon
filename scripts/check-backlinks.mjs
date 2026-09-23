// PainBeacon — does the badge loop actually produce links?
//
//   node --env-file=.env scripts/check-backlinks.mjs --dry-run
//   node --env-file=.env scripts/check-backlinks.mjs --verified
//   node --env-file=.env scripts/check-backlinks.mjs --limit 50 --delay 2000
//   node --env-file=.env scripts/check-backlinks.mjs --sites a-clinic.com,b-clinic.com
//
// The growth loop the directory is betting on: a clinic claims its listing,
// takes the badge from /verified-badge/, embeds it on its own site, and that
// followed link raises PainBeacon's organic traffic — which is what lets the
// paid geotargeting budget come down. Every part of that was an assumption;
// public.backlinks existed and was empty. This fills it.
//
// Reads clinics with a website from Supabase, fetches each home page, counts
// links back to us, and upserts one row per domain. Incremental: results are
// written to data/backlinks.json as each site completes, so an interrupted run
// resumes instead of re-fetching. Re-check with --refresh.
//
// It fetches the HOME PAGE only. A badge in a site footer is on every page; a
// badge buried on an "About" page will be missed and read as no_link. That is
// the honest limit of a cheap check, and it under-counts rather than over-.
//
// Manners, because these are the sites of businesses we list. One request per
// site, paced, with a User-Agent that says who we are and links to a page
// explaining it, and robots.txt honored — if a site blocks us we record
// blocked_by_robots and move on. Never run this from the cloud container:
// outbound traffic there goes through an allowlist proxy and every fetch fails
// identically, which looks exactly like every clinic being offline.
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. backlinks is RLS
// default-deny with no anon policy: it is internal data, not a public table.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { findBacklinks, normalizeSite, robotsAllows } from './lib/backlinks.mjs';
import { serviceKey, missingKeyMessage } from './lib/sb-key.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };

const DRY_RUN = has('--dry-run');
const REFRESH = has('--refresh');
const VERIFIED_ONLY = has('--verified');
const LIMIT = Number(arg('--limit', '0')) || 0;
// Re-check named domains and skip the directory read entirely — for when a
// clinic emails to say the badge is up and you want an answer now.
const SITES = String(arg('--sites', '')).split(',').map((x) => x.trim()).filter(Boolean);
const DELAY = Number(arg('--delay', '1200'));
const TIMEOUT = Number(arg('--timeout', '12000'));

const UA = 'PainBeaconBot/1.0 (+https://painbeacon.com/verified-badge/)';
const CACHE = new URL('../data/backlinks.json', import.meta.url);

const SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = serviceKey()?.key || '';
// --sites --dry-run needs neither the directory nor the table, so it runs
// anywhere; anything that reads or writes Supabase does not.
if ((!SB || !KEY) && !(SITES.length && DRY_RUN)) {
  console.error(missingKeyMessage(process.env, 'backlinks'));
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cache = {};
try { cache = JSON.parse(readFileSync(CACHE, 'utf8')); } catch (_e) { cache = {}; }
const saveCache = () => {
  try {
    mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
    writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  } catch (e) { console.warn(`! could not write cache: ${e.message}`); }
};

// --- who to check ----------------------------------------------------------
// Primaries only, mirroring the isPrimary convention everywhere else, so a
// folded duplicate does not make one office look like two backlinks.
const TIERS = "listing_tier=in.(verified,enhanced,featured)";
const select = 'npi,name,website,listing_tier,primary_npi';
const rows = [];
for (let from = 0; SITES.length === 0; from += 1000) {
  const q = [`select=${select}`, 'website=not.is.null', 'website=neq.', VERIFIED_ONLY ? TIERS : '']
    .filter(Boolean).join('&');
  const r = await fetch(`${SB}/rest/v1/clinics?${q}&order=npi.asc`, {
    headers: { ...H, Range: `${from}-${from + 999}` },
  });
  if (r.status === 416) break;
  if (!r.ok) { console.error(`Supabase ${r.status}: ${await r.text()}`); process.exit(1); }
  const page = await r.json();
  rows.push(...page);
  if (page.length < 1000) break;
}

// One entry per domain: several clinics can share a group practice's site, and
// the table is keyed by domain.
const byDomain = new Map();
for (const site of SITES) {
  const u = normalizeSite(site);
  if (!u) { console.warn(`! skipping unusable --sites entry: ${site}`); continue; }
  const domain = u.hostname.replace(/^www\./, '');
  byDomain.set(domain, { domain, url: u, npi: null, name: domain });
}
for (const c of rows) {
  if (c.primary_npi && c.primary_npi !== c.npi) continue;
  const u = normalizeSite(c.website);
  if (!u) continue;
  const domain = u.hostname.replace(/^www\./, '');
  if (!byDomain.has(domain)) byDomain.set(domain, { domain, url: u, npi: c.npi, name: c.name });
}

let targets = [...byDomain.values()].filter((t) => REFRESH || !cache[t.domain]);
if (LIMIT) targets = targets.slice(0, LIMIT);
console.log(`${byDomain.size} domains with a website${VERIFIED_ONLY ? ' (verified tiers only)' : ''}; ` +
  `${targets.length} to check${LIMIT ? ` (--limit ${LIMIT})` : ''}${DRY_RUN ? ' · DRY RUN' : ''}`);

// --- fetching --------------------------------------------------------------
async function get(url, signalMs = TIMEOUT) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), signalMs);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: ctl.signal,
    });
  } finally { clearTimeout(t); }
}

const robotsCache = new Map();
async function mayFetch(u) {
  const key = u.origin;
  if (!robotsCache.has(key)) {
    let txt = null;
    try {
      const r = await get(new URL('/robots.txt', u).href, 6000);
      txt = r.ok ? await r.text() : null;
    } catch (_e) { txt = null; }
    robotsCache.set(key, txt);
  }
  return robotsAllows(robotsCache.get(key), '/', 'painbeaconbot');
}

let checked = 0, linked = 0, followed = 0, badged = 0, unreachable = 0, blocked = 0;
for (const t of targets) {
  let rec;
  try {
    if (!(await mayFetch(t.url))) {
      rec = { status: 'blocked_by_robots', links_count: 0, followed: null, badge: null, url: null };
      blocked += 1;
    } else {
      const res = await get(t.url.href);
      if (!res.ok) {
        rec = { status: 'unreachable', links_count: 0, followed: null, badge: null, url: null, note: `HTTP ${res.status}` };
        unreachable += 1;
      } else {
        const html = await res.text();
        const f = findBacklinks(html, res.url || t.url.href);
        rec = {
          status: f.count > 0 ? 'linked' : 'no_link',
          links_count: f.count,
          followed: f.count ? f.followed : null,
          badge: f.count ? f.badge : null,
          url: f.url,
        };
        if (f.count) { linked += 1; if (f.followed) followed += 1; if (f.badge) badged += 1; }
      }
    }
  } catch (e) {
    rec = { status: 'unreachable', links_count: 0, followed: null, badge: null, url: null, note: e.name === 'AbortError' ? 'timeout' : e.message };
    unreachable += 1;
  }

  rec.npi = t.npi;
  rec.checked_at = new Date().toISOString();
  cache[t.domain] = rec;
  saveCache(); // written as each completes, so an interrupt loses one site
  checked += 1;

  const mark = rec.status === 'linked' ? (rec.followed ? '✓ followed' : '✓ nofollow') : rec.status;
  console.log(`  ${String(checked).padStart(4)}/${targets.length}  ${t.domain.padEnd(38)} ${mark}${rec.badge ? ' · badge' : ''}${rec.note ? ` (${rec.note})` : ''}`);
  if (DELAY) await sleep(DELAY);
}

// --- write -----------------------------------------------------------------
const payload = Object.entries(cache).map(([domain, r]) => ({
  domain, npi: r.npi ?? null, url: r.url ?? null,
  links_count: r.links_count ?? 0, followed: r.followed ?? null,
  badge: r.badge ?? null, status: r.status ?? null,
  updated_at: r.checked_at ?? new Date().toISOString(),
}));

if (DRY_RUN) {
  console.log(`\nDRY RUN — ${payload.length} rows not written.`);
} else if (payload.length) {
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const r = await fetch(`${SB}/rest/v1/backlinks?on_conflict=domain`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
    if (!r.ok) { console.error(`\nupsert failed ${r.status}: ${await r.text()}`); process.exit(1); }
  }
  console.log(`\nwrote ${payload.length} rows to public.backlinks`);
}

console.log(`checked ${checked} · linked ${linked} · of those followed ${followed}, badge ${badged} · ` +
  `unreachable ${unreachable} · blocked by robots ${blocked}`);
