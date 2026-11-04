// Post the newest article to X, once, as a link post.
//
//   X_API_KEY=... X_API_SECRET=... \
//   X_ACCESS_TOKEN=... X_ACCESS_TOKEN_SECRET=... \
//     node scripts/post-to-x.mjs [--dry-run]
//
// WHY THIS EXISTS. Same reason as post-to-bluesky.mjs: dlvr.it POLLS the feed
// on a timer and judges each item by its pubDate, so an article that merges a
// week after it was written arrives already stale and gets passed over. That is
// how the 2026-09-16 article reached neither Facebook nor X (article-calendar.md
// has the account). This pushes instead — the deploy finishes, the post goes
// out, at whatever hour that happens to be.
//
// Note what this does NOT do: it does not make the article publish earlier. The
// painbeacon article is gated by a human merge, not by a clock, so "earlier" was
// never available here. What it buys is that the post is no longer at the mercy
// of a poll window.
//
// THIS COSTS REAL MONEY, unlike every other announcer in this repo. X closed its
// free tier to new developers in February 2026 and moved to pay-per-use credits.
// From X's own pricing page (docs.x.com/x-api/getting-started/pricing):
//
//   POST /2/tweets                    $0.015 per request
//   POST /2/tweets WITH A URL         $0.200 per request
//   reads (the duplicate check)       $0.005 per request
//
// An article announcement always carries a link, so every post here is the
// $0.200 kind. One article a week plus two reads is about $10.90 a year. Small,
// but it is not zero and it needs a payment card on the X developer account —
// there is no free path. If the credits run out the post fails and the workflow
// step goes red; nothing else breaks.
//
// WHY OAuth 1.0a AND NOT OAuth 2.0. OAuth 2.0 user-context access tokens expire
// in two hours and are renewed with a refresh token that ROTATES on every use.
// A GitHub Action has nowhere to write the new refresh token back to — it would
// have to rewrite its own repository secret on each run, and a single missed
// write leaves the whole thing dead until someone re-authorizes by hand. OAuth
// 1.0a access tokens do not expire. For an unattended weekly job that is the
// only one of the two that is actually operable, so the four-secret ceremony
// below is the cheaper choice despite being the older standard.
//
//   If this starts returning 401 with valid-looking credentials, the assumption
//   to question first is that POST /2/tweets still accepts OAuth 1.0a. X's
//   OpenAPI spec for the endpoint names an OAuth 2.0 user token explicitly and
//   lists the other scheme only as a generic "UserToken / type: OAuth", so this
//   is the load-bearing guess in the file. If it has been withdrawn, pushing
//   from CI needs somewhere durable to keep a rotating refresh token, which is a
//   different and much larger job than this script.
//
// STATELESS BY DESIGN, like the Bluesky one. It always reads the FIRST item in
// the LIVE feed and asks X whether that URL has already gone out, rather than
// keeping a "last posted" marker. Re-running is harmless, a missed week heals
// itself on the next deploy, and there is no state file to drift out of sync.
// Reading the live feed rather than the local build is the same choice: it is
// the artifact that actually shipped, and it doubles as proof the deploy landed
// before anything is announced.
//
// With any of the four variables unset this exits 0 without posting, so the
// workflow step is a no-op until the secrets exist.
import { SITE } from '../src/lib/site.js';
import { clamp, firstItem, postText } from './lib/feed-item.mjs';
import { authHeader } from './lib/oauth1.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const API = 'https://api.x.com/2';
const TIMEOUT_MS = 30_000;

const CONSUMER_KEY = process.env.X_API_KEY || '';
const CONSUMER_SECRET = process.env.X_API_SECRET || '';
const TOKEN = process.env.X_ACCESS_TOKEN || '';
const TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET || '';

// X's post limit, and the fixed width every URL is counted at. t.co rewrites
// every link to the same length, so a long article URL costs no more than a
// short one — 23 characters either way, plus the space before it.
const MAX_POST = 280;
const URL_WEIGHT = 23;
const TEXT_BUDGET = MAX_POST - URL_WEIGHT - 1;

// X counts a "weighted length" over NFC-normalized text in which CJK ranges
// count double and emoji count as a surrogate pair. Our deks are English prose
// out of the content collection, where every character weighs 1, so counting
// graphemes (what clamp does) matches. If a dek ever picks up an emoji or CJK
// this budget is optimistic by a few characters, which is why it is not pressed
// right up against 280.

const feedUrl = new URL('/rss.xml', SITE.url).href;

// ----------------------------------------------------------------- http -----

// Signing lives in scripts/lib/oauth1.mjs, where scripts/lib/oauth1.test.mjs
// pins it against RFC 5849 §3.4.1's own worked example. A wrong signature and a
// revoked token both present as a bare 401, so having the signing checked
// against the spec is what makes the difference diagnosable.
async function api(path, { method = 'GET', json } = {}) {
  const url = `${API}${path}`;
  const headers = {
    authorization: authHeader({
      method,
      url,
      consumerKey: CONSUMER_KEY,
      consumerSecret: CONSUMER_SECRET,
      token: TOKEN,
      tokenSecret: TOKEN_SECRET,
    }),
  };
  // A JSON body contributes nothing to the signature — RFC 5849 §3.4.1.3.1
  // folds a body in only when it is form-encoded — so there is no `extra` here.
  if (json) headers['content-type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: json ? JSON.stringify(json) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${res.statusText}\n${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : {};
}

// ------------------------------------------------------------------ util -----

/**
 * Same article or not.
 *
 * Compared on host and path with a trailing slash and case folded away, because
 * the feed writes the canonical URL with a trailing slash and X hands back
 * whatever was typed. Query and fragment are ignored: nothing we post carries
 * either, and a tracking parameter appended by someone else should not read as a
 * different article.
 */
function sameArticle(a, b) {
  try {
    const norm = (s) => {
      const u = new URL(s);
      return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '').toLowerCase()}`;
    };
    return norm(a) === norm(b);
  } catch {
    return false;
  }
}

/**
 * Has this article already gone out? Asked of the account, not a marker file.
 *
 * entities.urls is the only place to look: the `text` of a posted tweet carries
 * the t.co rewrite, never our URL, so matching on the text would never hit.
 * Costs two reads, about a cent.
 */
async function alreadyPosted(link) {
  const { data: me } = await api('/users/me');
  if (!me?.id) throw new Error('/users/me returned no id');

  const { data: posts = [] } = await api(
    `/users/${me.id}/tweets?max_results=20&tweet.fields=entities&exclude=replies,retweets`,
  );

  return posts.some((p) =>
    (p?.entities?.urls || []).some((u) =>
      [u.expanded_url, u.unwound_url, u.url].some((candidate) => candidate && sameArticle(candidate, link)),
    ),
  );
}

// ------------------------------------------------------------------- run -----

const feedRes = await fetch(feedUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
if (!feedRes.ok) {
  console.error(`could not read ${feedUrl} — ${feedRes.status} ${feedRes.statusText}`);
  process.exit(1);
}

const item = firstItem(await feedRes.text());
if (!item?.link) {
  console.error(`no usable first item in ${feedUrl}`);
  process.exit(1);
}

// The dek, then the link. Unlike Bluesky there is no card embed to carry the
// headline and photo — X unfurls the URL out of the text itself, so the URL has
// to be in the text.
const text = `${clamp(postText(item, TEXT_BUDGET), TEXT_BUDGET)} ${item.link}`;

console.log(`article  ${item.title}`);
console.log(`link     ${item.link}`);
console.log(`pubDate  ${item.pubDate}`);
console.log(`cost     $0.200 (a post carrying a URL), plus $0.010 for the duplicate check`);
console.log(`text     ${text.length} chars as written, counted by X as ~${text.length - item.link.length + URL_WEIGHT}/${MAX_POST}\n${text}\n`);

if (DRY_RUN) {
  console.log('--dry-run, nothing sent.');
  process.exit(0);
}

if (!CONSUMER_KEY || !CONSUMER_SECRET || !TOKEN || !TOKEN_SECRET) {
  console.log(
    'X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET not all set — skipping the post.',
  );
  process.exit(0);
}

if (await alreadyPosted(item.link)) {
  console.log('already posted — nothing to do.');
  process.exit(0);
}

const { data } = await api('/tweets', { method: 'POST', json: { text } });
console.log(`posted ${data?.id}`);
console.log(`       https://x.com/${SITE.socials.x.split('/').pop()}/status/${data?.id}`);
