// Post the newest article to the Facebook Page, once, as a link post.
//
//   FACEBOOK_PAGE_ACCESS_TOKEN=... node scripts/post-to-facebook.mjs [--dry-run]
//
// WHY THIS EXISTS. Same reason as post-to-bluesky.mjs and post-to-x.mjs: dlvr.it
// POLLS the feed and judges each item by its pubDate, so an article that merges
// a week after it was written arrives stale and gets skipped — which is how the
// 2026-09-16 article reached neither Facebook nor X (article-calendar.md has the
// account). This pushes instead, so publishing is the trigger.
//
// ONE OPEN QUESTION, AND IT CAN KILL THIS WHOLE FILE. src/lib/site.js records
// the account as facebook.com/profile.php?id=61592202442574. That URL form is
// what Facebook serves for any account without a vanity handle, and it does not
// distinguish a PAGE from a PERSONAL PROFILE. There is no API for posting to a
// personal profile — Meta removed publish_actions in 2018 and never replaced it.
// So:
//
//   - If 61592202442574 is a Page, everything below works.
//   - If it is a personal profile, no amount of code helps and the Facebook half
//     of the announcer has to be abandoned in favor of dlvr.it or a manual post.
//
// The evidence says Page: dlvr.it can only post to Pages, and it has been
// posting there. But it was never confirmed directly, so the first real run is
// the test. A 404 or "Unsupported post request" on the /feed edge is what a
// personal profile looks like from here, and the error path below says so.
//
// ACCESS: Publishing needs pages_manage_posts and a PAGE access token (not a
// user token). Meta's Pages API overview says "All Page-related Permissions and
// Features require approval through the App Review process", and also that apps
// in Development Mode "can request any Permission from any app User who has a
// Role on the app" — which are not quite the same claim, and the docs do not say
// the second covers production use. So treat App Review as an open question too:
// generate a long-lived Page token, try it, and find out. This script does not
// assume either answer.
//
// Getting the token, once, by hand (it is not scriptable and should not be):
//   1. developers.facebook.com → create an app → add the Facebook Login product
//   2. Graph API Explorer → select the app → request pages_manage_posts and
//      pages_read_engagement → Generate Access Token (a USER token)
//   3. GET /me/accounts with that token → the Page's id and its PAGE token
//   4. Exchange the user token for a long-lived one, then re-read /me/accounts;
//      Page tokens derived from a long-lived user token do not expire on a timer
//   5. Put the PAGE token in the FACEBOOK_PAGE_ACCESS_TOKEN repository secret
//
// With the token unset this exits 0 without posting, so the workflow step is a
// no-op until the secret exists.
//
// STATELESS BY DESIGN, like its siblings: read the FIRST item of the LIVE feed,
// ask Facebook whether that URL is already on the Page, post if not. No marker
// file, so re-running is harmless and a missed week heals itself.
import { SITE } from '../src/lib/site.js';
import { clamp, firstItem, postText } from './lib/feed-item.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

// v26.0 is current as of 2026-11 (introduced 2026-07-29). Graph API versions are
// supported for about two years and then start refusing calls, so this needs
// bumping roughly annually; GRAPH_API_VERSION exists so a bump can be tested
// without a commit. Leaving the version out of the path is NOT an option —
// Facebook then serves the oldest version still alive, which is the one closest
// to being switched off.
const VERSION = process.env.GRAPH_API_VERSION || 'v26.0';
const API = `https://graph.facebook.com/${VERSION}`;
const TIMEOUT_MS = 30_000;

const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '';

// The Page id is not a secret — it is sitting in the public profile URL — so it
// is derived from site.js rather than being a second thing to configure and
// keep in step. FACEBOOK_PAGE_ID overrides it if the account ever moves.
const PAGE_ID =
  process.env.FACEBOOK_PAGE_ID ||
  (SITE.socials.facebook.match(/[?&]id=(\d+)/) || [])[1] ||
  '';

// Facebook's own cap is 63,206 characters. The dek is a meta description and
// runs nearer 150, so this only guards against something pathological.
const MAX_MESSAGE = 2_000;

const feedUrl = new URL('/rss.xml', SITE.url).href;

// -------------------------------------------------------------- graph api ----

async function api(path, { method = 'GET', form } = {}) {
  const headers = { authorization: `Bearer ${TOKEN}` };
  let body;
  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }

  // The token goes in the Authorization header, never in the query string.
  // Graph API accepts ?access_token=, but a URL ends up in CI logs, in error
  // messages and in any proxy's access log, and a Page token is a long-lived
  // credential.
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${res.statusText}\n${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Same article or not. Host and path, trailing slash and case folded away;
 * query and fragment ignored, because Facebook appends its own tracking
 * parameters to shimmed links and those do not make it a different article.
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
 * Has this article already gone out?
 *
 * Asked of the Page's own feed. unshimmed_url first: Facebook rewrites outbound
 * links through l.facebook.com, and the shimmed form carries our URL buried in a
 * query parameter where a naive comparison would miss it.
 */
async function alreadyPosted(link) {
  const { data: posts = [] } = await api(
    `/${PAGE_ID}/feed?limit=20&fields=attachments{unshimmed_url,target,url},message`,
  );

  return posts.some((p) =>
    (p?.attachments?.data || []).some((a) =>
      [a.unshimmed_url, a.target?.url, a.url].some(
        (candidate) => candidate && sameArticle(candidate, link),
      ),
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

// `link` is what builds the card — the headline, the photo and the domain all
// come from the page's own Open Graph tags. The message is the dek, and it sits
// above the card rather than inside it. Facebook stopped honoring name/caption/
// description overrides in v2.9, so the card is whatever the page says it is,
// which is the right outcome anyway.
const message = clamp(postText(item, MAX_MESSAGE), MAX_MESSAGE);

console.log(`article  ${item.title}`);
console.log(`link     ${item.link}`);
console.log(`pubDate  ${item.pubDate}`);
console.log(`page     ${PAGE_ID || '(none — set FACEBOOK_PAGE_ID)'}`);
console.log(`graph    ${VERSION}`);
console.log(`message  ${message.length} chars\n${message}\n`);

if (DRY_RUN) {
  console.log('--dry-run, nothing sent.');
  process.exit(0);
}

if (!TOKEN) {
  console.log('FACEBOOK_PAGE_ACCESS_TOKEN not set — skipping the post.');
  process.exit(0);
}

if (!PAGE_ID) {
  console.error('no Page id — set FACEBOOK_PAGE_ID, or fix SITE.socials.facebook in src/lib/site.js.');
  process.exit(1);
}

try {
  if (await alreadyPosted(item.link)) {
    console.log('already posted — nothing to do.');
    process.exit(0);
  }

  const { id } = await api(`/${PAGE_ID}/feed`, {
    method: 'POST',
    form: { message, link: item.link },
  });
  console.log(`posted ${id}`);
  console.log(`       https://www.facebook.com/${id}`);
} catch (err) {
  // The specific failure worth naming, because it is the one that means stop
  // rather than retry: /feed does not exist as a publishable edge on a personal
  // profile, and Meta has no replacement for publish_actions.
  const msg = String(err?.message || err);
  if (/Unsupported (post|get) request|does not exist|cannot be loaded/i.test(msg)) {
    console.error(
      `::error title=Facebook announce::The /feed edge was refused for ${PAGE_ID}. ` +
        'If that id is a personal profile rather than a Page, there is no API that can post to it ' +
        'and this step should be removed rather than debugged. See the header of this file.',
    );
  }
  throw err;
}
