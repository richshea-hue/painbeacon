// Wait until the live feed carries the article this commit should have
// published, then exit.
//
//   node scripts/wait-for-article.mjs
//   node scripts/wait-for-article.mjs --slug some-article   # override
//   node scripts/wait-for-article.mjs --dry-run             # what would it wait for
//
// WHY THIS REPLACED `sleep 300`. Every announcer reads the LIVE site —
// post-to-bluesky.mjs, post-to-x.mjs, post-to-facebook.mjs and ping-websub.mjs
// all take the first item of the published feed — so each one has to run after
// the Cloudflare Pages build that publishes the article. The old step waited a
// flat five minutes and hoped.
//
// Measured deploy windows, read from the cloudflare-workers-and-pages[bot] PR
// comment (its created_at → updated_at span is "Deploying…" → "Deploy
// successful"):
//
//   painbeacon  PR #104   6m 10s      ← overran the 300 s wait
//   painbeacon  PR  #95   4m 23s
//   painbeacon  PR  #92   2m 33s
//
// So `sleep 300` was not a safe margin, it was a coin flip on the slow end. When
// it loses, every announcer reads the PREVIOUS feed: Bluesky and X post last
// week's article and the WebSub ping is spent telling the hub about a feed that
// has not changed. All of it silent — the steps go green either way, which is
// why it went unnoticed.
//
// Waiting on the condition rather than a duration is both safer and faster: a
// 2m 33s deploy no longer costs five minutes of runner time, and a slow one no
// longer corrupts the posts.
//
// WHAT IT WAITS FOR, and why it is computed here rather than passed in. The
// expected article is derived from the CHECKOUT: the newest non-draft file in
// src/content/articles/, which is exactly what src/lib/articles.js's
// getArticlesNewestFirst() will put first in the feed. Deriving it from the push
// diff instead looked simpler and is wrong in both directions — an article
// published by flipping `draft: true` to false shows up as a modification rather
// than an addition, and a typo fix to an old article shows up as a change that
// will never become the first feed item. The frontmatter is the source of truth
// for what the build is going to say, so ask it.
//
// NEVER FATAL. On timeout this warns and exits 0 rather than failing the job.
// The article is published and ordinary pollers will find it regardless, and the
// posters' own duplicate checks mean the worst case of proceeding early is a
// skipped post that the next deploy heals — strictly better than a red workflow
// nobody reads.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SITE } from '../src/lib/site.js';
import { firstItem } from './lib/feed-item.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const slugArg = (() => {
  const i = process.argv.indexOf('--slug');
  return i !== -1 ? process.argv[i + 1] || '' : '';
})();

// 15 minutes against a measured worst case of 6. The cap only costs time when
// something is actually wrong, because a match exits immediately; keep the job's
// own timeout-minutes comfortably above it.
const MAX_WAIT_MS = Number(process.env.WAIT_MAX_MS || 15 * 60 * 1000);
const INTERVAL_MS = Number(process.env.WAIT_INTERVAL_MS || 15_000);
const TIMEOUT_MS = 20_000;

const ARTICLES = new URL('../src/content/articles/', import.meta.url);
const feedUrl = new URL('/rss.xml', SITE.url).href;

/** A GitHub Actions warning annotation, so a timeout shows in the run summary. */
const warn = (msg) => console.log(`::warning title=Waiting for the deploy::${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pathOf = (url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
};

/**
 * The slugs the feed could legitimately lead with.
 *
 * Normally one. More only when several articles share the newest date, in which
 * case the build's tie-break is whatever order the collection came back in — so
 * accept any of them rather than guessing which won.
 *
 * Deliberately a small frontmatter reader and not the real content pipeline:
 * src/lib/articles.js imports astro:content, which only exists inside a build.
 * The two fields read here are `date` and `draft`, and the filter below is the
 * same `draft !== true` that articles.js applies.
 */
function expectedSlugs() {
  const files = readdirSync(ARTICLES).filter((f) => f.endsWith('.md'));

  const published = files
    .map((file) => {
      const src = readFileSync(new URL(file, ARTICLES), 'utf8');
      const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fm) return null;

      const block = fm[1];
      const date = (block.match(/^date:\s*(\S+)/m) || [])[1] || '';
      const draft = /^draft:\s*true\s*$/m.test(block);
      if (draft || !date) return null;

      // Astro's collection slug for a flat directory is the filename.
      return { slug: path.basename(file, '.md'), date };
    })
    .filter(Boolean);

  if (!published.length) return [];

  const newest = published.reduce((a, b) => (b.date > a.date ? b : a)).date;
  return published.filter((a) => a.date === newest).map((a) => a.slug);
}

// ------------------------------------------------------------------- run -----

// "Never fatal" has to hold here too, or the promise above is only half true:
// a throw out of expectedSlugs would fail the step, and the announcers after it
// that are not guarded by `if: always()` would be skipped.
const slugs = (() => {
  if (slugArg) return [slugArg];
  try {
    return expectedSlugs();
  } catch (err) {
    warn(`could not read src/content/articles/ — ${String(err?.message || err).slice(0, 160)}`);
    return [];
  }
})();

if (!slugs.length) {
  warn('no published article to wait for — continuing without waiting.');
  process.exit(0);
}

const wanted = new Set(slugs.map((s) => `/news/${s}/`));

console.log(`feed      ${feedUrl}`);
console.log(`expecting ${[...wanted].join(' or ')}`);

if (DRY_RUN) {
  console.log('--dry-run, not waiting.');
  process.exit(0);
}

console.log(
  `polling   every ${Math.round(INTERVAL_MS / 1000)}s, giving up after ${Math.round(MAX_WAIT_MS / 60000)}m\n`,
);

const startedAt = Date.now();
let attempt = 0;

while (Date.now() - startedAt < MAX_WAIT_MS) {
  attempt += 1;
  const elapsed = Math.round((Date.now() - startedAt) / 1000);

  try {
    // cache: 'no-store' matters here. Without it a CDN or the runtime's own
    // cache can keep handing back the pre-deploy feed for the whole wait, and
    // the poll would time out against a feed that had in fact already changed.
    const res = await fetch(feedUrl, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.log(`${elapsed}s  attempt ${attempt}: ${res.status} ${res.statusText}`);
    } else {
      const item = firstItem(await res.text());
      const got = pathOf(item?.link);

      if (wanted.has(got)) {
        console.log(`${elapsed}s  attempt ${attempt}: live — ${item.title}`);
        process.exit(0);
      }
      console.log(`${elapsed}s  attempt ${attempt}: first item is still ${got || '(none)'}`);
    }
  } catch (err) {
    console.log(`${elapsed}s  attempt ${attempt}: ${String(err?.message || err).slice(0, 120)}`);
  }

  await sleep(INTERVAL_MS);
}

warn(
  `${[...wanted].join(' or ')} did not become the first feed item within ` +
    `${Math.round(MAX_WAIT_MS / 60000)} minutes. Continuing anyway — the announcers check for ` +
    'duplicates, so they will either post the right thing or skip. Worth checking the Cloudflare ' +
    'deploy for this commit.',
);
process.exit(0);
