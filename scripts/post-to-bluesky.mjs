// Post the newest article to Bluesky, once, with its share photo as a link card.
//
//   BLUESKY_HANDLE=painbeacon.bsky.social \
//   BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
//     node scripts/post-to-bluesky.mjs [--dry-run]
//
// WHY THIS EXISTS ALONGSIDE dlvr.it. dlvr.it POLLS the feed on a timer and
// judges each item by its pubDate. That is how the 2026-09-16 article reached
// neither Facebook nor X: it merged a week after it was written, so it arrived
// in the feed already seven days old and read as backfill (article-calendar.md
// has the full account). This pushes instead — the deploy finishes, the post
// goes out. No poll window, no date heuristic. It also leaves dlvr.it's two
// free profile slots to Facebook and X, which have no comparably simple API.
//
// STATELESS BY DESIGN. It always reads the FIRST item in the LIVE feed and asks
// Bluesky whether that URL has been posted already, instead of keeping a "last
// posted" marker somewhere. So re-running is harmless, a missed week heals
// itself on the next deploy, and there is no state file to drift out of sync
// with reality. Reading the live feed rather than the local build is the same
// choice: it is the artifact that actually shipped, and it doubles as proof the
// deploy landed before anything is announced.
//
// CREDENTIALS. BLUESKY_APP_PASSWORD must be an APP PASSWORD — Bluesky Settings
// → Privacy and security → App passwords — never the account password. An app
// password can be revoked on its own and cannot change the account's email or
// password, so a leaked one from CI logs costs a revoke rather than the account.
// With either variable unset this exits 0 without posting, so the workflow step
// is a no-op until the secrets are added.
import { SITE } from '../src/lib/site.js';
import { firstItem, graphemes, postText } from './lib/feed-item.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const SERVICE = process.env.BLUESKY_SERVICE || 'https://bsky.social';
const HANDLE = process.env.BLUESKY_HANDLE || '';
const APP_PASSWORD = process.env.BLUESKY_APP_PASSWORD || '';

// Bluesky counts post text in graphemes, not code units, and caps it at 300.
const MAX_GRAPHEMES = 300;
// Blob ceiling for an image. Our share crops run ~70–100KB, so this only ever
// catches a hotlinked Unsplash original; over it the card ships without a thumb
// rather than the post failing.
const MAX_THUMB_BYTES = 1_000_000;
const TIMEOUT_MS = 30_000;

const feedUrl = new URL('/rss.xml', SITE.url).href;

// --------------------------------------------------------------- bluesky ----

async function api(path, { method = 'GET', token, json, body, contentType } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (json) headers['content-type'] = 'application/json';
  if (contentType) headers['content-type'] = contentType;

  const res = await fetch(`${SERVICE}/xrpc/${path}`, {
    method,
    headers,
    body: json ? JSON.stringify(json) : body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${res.statusText}\n${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : {};
}

/** Has this article already gone out? Checked against the account, not a marker file. */
async function alreadyPosted(did, token, url) {
  const { feed = [] } = await api(
    `app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=30&filter=posts_no_replies`,
    { token }
  );
  return feed.some(({ post }) => {
    // The record is what we wrote; the view is the server's hydrated copy.
    // Either one carrying this URL means the post exists.
    const fromRecord = post?.record?.embed?.external?.uri;
    const fromView = post?.embed?.external?.uri;
    return fromRecord === url || fromView === url;
  });
}

/** Fetch the share photo and upload it as a blob for the card's thumbnail. */
async function uploadThumb(url, token) {
  if (!url) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    console.warn(`thumb  skipped — ${url} returned ${res.status}`);
    return null;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_THUMB_BYTES) {
    console.warn(`thumb  skipped — ${bytes.byteLength} bytes is over the ${MAX_THUMB_BYTES} limit`);
    return null;
  }
  const { blob } = await api('com.atproto.repo.uploadBlob', {
    method: 'POST',
    token,
    contentType: res.headers.get('content-type') || 'image/jpeg',
    body: bytes,
  });
  console.log(`thumb  ${bytes.byteLength} bytes uploaded`);
  return blob;
}

// ------------------------------------------------------------------ run -----

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

const text = postText(item, MAX_GRAPHEMES);
console.log(`article  ${item.title}`);
console.log(`link     ${item.link}`);
console.log(`pubDate  ${item.pubDate}`);
console.log(`image    ${item.image || '(none — the card will have no thumbnail)'}`);
console.log(`text     ${graphemes(text).length}/${MAX_GRAPHEMES} graphemes\n${text}\n`);

if (DRY_RUN) {
  console.log('--dry-run, nothing sent.');
  process.exit(0);
}

if (!HANDLE || !APP_PASSWORD) {
  console.log('BLUESKY_HANDLE / BLUESKY_APP_PASSWORD not set — skipping the post.');
  process.exit(0);
}

const { accessJwt, did } = await api('com.atproto.server.createSession', {
  method: 'POST',
  json: { identifier: HANDLE, password: APP_PASSWORD },
});
console.log(`signed in as ${HANDLE} (${did})`);

if (await alreadyPosted(did, accessJwt, item.link)) {
  console.log('already posted — nothing to do.');
  process.exit(0);
}

const thumb = await uploadThumb(item.image, accessJwt);

const { uri } = await api('com.atproto.repo.createRecord', {
  method: 'POST',
  token: accessJwt,
  json: {
    repo: did,
    collection: 'app.bsky.feed.post',
    record: {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: new Date().toISOString(),
      langs: ['en'],
      embed: {
        $type: 'app.bsky.embed.external',
        external: {
          uri: item.link,
          title: item.title,
          // The card's own description line. Same dek; it reads as the summary
          // under the headline rather than as a repeat of the post text.
          description: item.description,
          ...(thumb ? { thumb } : {}),
        },
      },
    },
  },
});

// at://did:plc:xxxx/app.bsky.feed.post/3kabc → bsky.app/profile/<did>/post/3kabc
const rkey = uri.split('/').pop();
console.log(`posted ${uri}`);
console.log(`       https://bsky.app/profile/${did}/post/${rkey}`);
