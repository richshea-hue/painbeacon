// List recent pain studies we could feature without asking anyone, best first.
//
//   node scripts/find-research-candidates.mjs [--days 60] [--limit 12] [--json]
//   node scripts/find-research-candidates.mjs --pass <PMID> --reason "why not"
//
// WHY THIS EXISTS. The first featured study (Michael Ray's, The Journal of Pain)
// took a personal request and a wait, because the journal is subscription-only
// and reprinting its abstract needed the author's yes. That route still exists
// for the studies worth it, but it cannot be a schedule. A CC BY paper can be
// featured the day it is found: the license already grants reuse with
// attribution, commercial use included. This finds those.
//
// It only FINDS. Nothing is written to the site. The next step for a candidate
// worth featuring is:
//
//   node scripts/scaffold-research.mjs <PMID>
//
// WHAT IS LEFT OUT, and where each rule lives:
//   - anything already featured (ids read from src/content/research/*.md)
//   - anything in data/research-ledger.json — studies a person looked at and
//     passed on, with the reason, so the same paper is not offered every run
//   - protocols, case reports, corrections, animal and bench work, and anything
//     not CC BY or CC0 (scoreCandidate in scripts/lib/europepmc.mjs)
//
// The score is a sort order, not a verdict. Each candidate prints the reasons
// behind its number so a bad ranking can be seen and argued with.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { API, buildQuery, scoreCandidate, toCandidate } from './lib/europepmc.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : fallback;
};

const CONTENT_DIR = new URL('../src/content/research/', import.meta.url);
const LEDGER = new URL('../data/research-ledger.json', import.meta.url);
const TIMEOUT_MS = 45_000;
const PAGE = 100;
const MAX_PAGES = 15; // 1,500 papers; two months of pain titles is under half that

const ymd = (d) => d.toISOString().slice(0, 10);

function readLedger() {
  try {
    const j = JSON.parse(readFileSync(LEDGER, 'utf8'));
    return { passed: Array.isArray(j.passed) ? j.passed : [] };
  } catch {
    return { passed: [] };
  }
}

/** Every id already on the site, whichever way a study file records it. */
function featuredIds() {
  const ids = new Set();
  let files = [];
  try {
    files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  } catch {
    return ids;
  }
  for (const f of files) {
    const src = readFileSync(new URL(f, CONTENT_DIR), 'utf8');
    for (const m of src.matchAll(/^(?:doi|pmid|pmcid):\s*["']?([^"'\s#]+)/gim)) ids.add(m[1].toLowerCase());
  }
  return ids;
}

// ------------------------------------------------------------- --pass --------

if (flag('pass')) {
  const id = opt('pass');
  const reason = opt('reason');
  if (!id || !reason) {
    console.error('usage: --pass <PMID> --reason "why this study is not one to feature"');
    process.exit(1);
  }
  const ledger = readLedger();
  if (ledger.passed.some((p) => String(p.pmid) === String(id))) {
    console.log(`${id} is already in the ledger.`);
    process.exit(0);
  }
  ledger.passed.push({ pmid: String(id), reason, date: ymd(new Date()) });
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  console.log(`passed on ${id}: ${reason}`);
  process.exit(0);
}

// -------------------------------------------------------------- search -------

const days = Number(opt('days', 60));
const limit = Number(opt('limit', 12));
const to = new Date();
const from = new Date(to.getTime() - days * 86_400_000);
const query = buildQuery({ from: ymd(from), to: ymd(to) });

async function page(cursorMark) {
  const url = new URL(`${API}/search`);
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('resultType', 'core');
  url.searchParams.set('pageSize', String(PAGE));
  url.searchParams.set('cursorMark', cursorMark);
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'research-candidate-finder/1.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Europe PMC ${res.status} ${res.statusText}`);
  return res.json();
}

const records = [];
let cursor = '*';
let hitCount = 0;
for (let i = 0; i < MAX_PAGES; i++) {
  const j = await page(cursor);
  hitCount = j.hitCount ?? hitCount;
  const batch = j.resultList?.result || [];
  records.push(...batch);
  if (!j.nextCursorMark || j.nextCursorMark === cursor || batch.length < PAGE) break;
  cursor = j.nextCursorMark;
}

// -------------------------------------------------------------- rank ---------

const featured = featuredIds();
const passed = new Set(readLedger().passed.map((p) => String(p.pmid)));
const excluded = new Map();
const bump = (why) => excluded.set(why, (excluded.get(why) || 0) + 1);

const ranked = [];
for (const r of records) {
  const c = toCandidate(r);
  const ids = [c.pmid, c.pmcid, c.doi].filter(Boolean).map((x) => String(x).toLowerCase());
  if (ids.some((x) => featured.has(x))) { bump('already featured'); continue; }
  if (c.pmid && passed.has(String(c.pmid))) { bump('passed on earlier (ledger)'); continue; }
  const s = scoreCandidate(c);
  if (s.exclude) { bump(s.exclude.replace(/:.*$/, '').replace(/".*"/, '…')); continue; }
  // Not a reason to leave it out — about a third of new CC BY papers are not in
  // PMC yet — but the scaffolder then has no JATS file and falls back to the
  // license the publisher deposited with Crossref, and the funding and
  // conflict statements have to be read off the article page by hand.
  if (!c.pmcid) s.flags.push('not in PMC yet — license is read from Crossref, disclosures by hand');
  ranked.push({ ...c, ...s });
}
ranked.sort((a, b) => b.score - a.score || String(b.published).localeCompare(String(a.published)));
const top = ranked.slice(0, limit);

if (flag('json')) {
  const slim = top.map(({ abstractHtml, keywords, ...rest }) => rest);
  console.log(JSON.stringify({ query, hitCount, considered: records.length, offered: ranked.length, top: slim }, null, 2));
  process.exit(0);
}

console.log(`Europe PMC: ${hitCount} CC BY / CC0 pain-titled papers first published ${ymd(from)} to ${ymd(to)}.`);
console.log(`Read ${records.length}; ${ranked.length} are candidates; showing the top ${top.length}.\n`);

top.forEach((c, i) => {
  const first = c.authors[0];
  const aff = first?.affiliations[0] ? ` — ${first.affiliations[0].slice(0, 90)}` : '';
  console.log(`${String(i + 1).padStart(2)}. [${c.score}] ${c.title}`);
  console.log(`    ${c.journal} · ${c.published || c.year} · ${c.authors.length} author${c.authors.length === 1 ? '' : 's'}`);
  if (first) console.log(`    first author: ${first.name}${aff}`);
  console.log(`    why: ${c.reasons.join(', ') || '(no signals either way)'}`);
  for (const f of c.flags) console.log(`    CHECK: ${f}`);
  console.log(`    PMID ${c.pmid} · https://europepmc.org/article/MED/${c.pmid}`);
  console.log('');
});

if (excluded.size) {
  console.log('Left out:');
  for (const [why, n] of [...excluded.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${why}`);
  console.log('');
}
console.log('Next: node scripts/scaffold-research.mjs <PMID>');
console.log('Or:   node scripts/find-research-candidates.mjs --pass <PMID> --reason "..."');
