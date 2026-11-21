/**
 * Keep the numbers inside published articles in step with the data that built
 * the site. Runs BEFORE `astro build`, wired into `npm run build`.
 *
 * WHY THIS EXISTS: /news/how-we-rank-pain-clinics/ quotes the size of the
 * directory and the score distribution in prose. Those were written by hand
 * against a snapshot, and the directory has moved since — the article said
 * 14,536 clinics while the homepage, computed at build time from the same
 * database, said 12,487. Two different numbers for the same thing on the same
 * site is exactly the kind of thing a reader checks, and the article is the one
 * arguing that our numbers are checkable.
 *
 * So the article no longer hard-codes them. Each figure sits between markers:
 *
 *     <!--s:clinicCount-->12,487<!--/s-->
 *
 * and this script rewrites what's between them from live data, using the same
 * getClinics() + scoreBand() the pages use. The markers are HTML comments, so
 * they render as nothing; the number between them stays readable in the source
 * and correct in git, which means the article is never wrong even if this
 * script is skipped.
 *
 * SAFETY: with no SUPABASE_URL the data layer falls back to eight fictional
 * sample clinics. Rewriting real published figures with those would be far
 * worse than leaving them stale, so the script exits without touching anything
 * unless it is looking at real data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getClinics } from '../src/lib/data.js';
import { scoreClinic, scoreBand } from '../src/lib/ranking.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTICLE = path.join(__dirname, '..', 'src', 'content', 'articles', 'how-we-rank-pain-clinics.md');
const PAIN_INTERVENTIONAL = '208VP0014X';

if (!process.env.SUPABASE_URL) {
  console.warn('[article-stats] SUPABASE_URL not set — skipping. Published figures left as they are.');
  process.exit(0);
}

const n = (x) => x.toLocaleString('en-US');
const pct = (part, whole) => (whole ? ((part / whole) * 100).toFixed(1) : '0.0');

const clinics = await getClinics();
// Primary (deduped) practices only — the same basis as every count on the site.
const primaries = clinics.filter((c) => c.isPrimary);
const total = primaries.length;

const bands = { 'Strongly qualified': 0, 'Well qualified': 0, Qualified: 0, 'Basic listing': 0 };
for (const c of primaries) bands[scoreBand(scoreClinic(c).score).label]++;

const interventional = primaries.filter(
  (c) =>
    c.primary_taxonomy_code === PAIN_INTERVENTIONAL ||
    (c.all_taxonomy_codes || '').includes(PAIN_INTERVENTIONAL)
).length;

const rated = primaries.filter((c) => c.aggregate_rating && Number(c.review_count) > 0).length;

const stats = {
  clinicCount: n(total),
  bandStrong: n(bands['Strongly qualified']),
  bandStrongPct: pct(bands['Strongly qualified'], total),
  bandWell: n(bands['Well qualified']),
  bandWellPct: pct(bands['Well qualified'], total),
  bandQualified: n(bands.Qualified),
  bandQualifiedPct: pct(bands.Qualified, total),
  bandBasic: n(bands['Basic listing']),
  bandBasicPct: pct(bands['Basic listing'], total),
  interventionalCount: n(interventional),
  ratedCount: n(rated),
};

let md = fs.readFileSync(ARTICLE, 'utf8');
const before = md;
const changed = [];
const unseen = new Set(Object.keys(stats));

md = md.replace(/<!--s:([a-zA-Z]+)-->([\s\S]*?)<!--\/s-->/g, (whole, key, old) => {
  if (!(key in stats)) {
    console.warn(`[article-stats] unknown marker "${key}" — left alone.`);
    return whole;
  }
  unseen.delete(key);
  if (old !== stats[key]) changed.push(`${key}: ${old} -> ${stats[key]}`);
  return `<!--s:${key}-->${stats[key]}<!--/s-->`;
});

if (unseen.size) console.warn(`[article-stats] no marker found for: ${[...unseen].join(', ')}`);

if (md === before) {
  console.log(`[article-stats] already in step (${stats.clinicCount} clinics).`);
} else {
  fs.writeFileSync(ARTICLE, md);
  console.log(`[article-stats] updated ${path.basename(ARTICLE)} — ${changed.join(', ')}`);
}
