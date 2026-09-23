// Tell the WebSub hub the feed moved, so subscribed readers get it pushed now
// instead of on their next poll.
//
//   node scripts/ping-websub.mjs
//   node scripts/ping-websub.mjs --dry-run   # print the request, send nothing
//
// A publish ping carries no content. It names the topic URL that changed; the
// hub then fetches that feed itself and fans out to whoever subscribed. Two
// things follow from that.
//
// FIRST, IT MUST RUN AFTER THE DEPLOY IS LIVE. Ping too early and the hub
// fetches the old feed, finds nothing new, and the ping is spent —
// .github/workflows/announce-article.yml waits for the build before calling
// this.
//
// SECOND, IT IS ONLY HALF THE MECHANISM. The hub only has subscribers because
// rss.xml advertises it (see the atom:link rel="hub" in src/pages/rss.xml.js).
// Declaring the hub without pinging it, or pinging without declaring it, both
// do nothing at all.
//
// Never fatal: the article is already published and ordinary pollers will still
// find it, so a hub that is down or slow costs nothing and this exits 0 either
// way. It only fails the run on a bad request — something this script got
// wrong, which is worth seeing.
import { SITE } from '../src/lib/site.js';

const DRY_RUN = process.argv.includes('--dry-run');
const TIMEOUT_MS = 15_000;

const hub = SITE.websubHub;
if (!hub) {
  console.log('SITE.websubHub is blank — no hub declared in the feed, nothing to ping.');
  process.exit(0);
}

const topic = new URL('/rss.xml', SITE.url).href;

// hub.topic is the W3C WebSub spelling; hub.url is PubSubHubbub 0.3's, which
// plenty of hubs still expect. They name the same thing and hubs ignore the one
// they do not use, so send both rather than guess.
const body = new URLSearchParams({
  'hub.mode': 'publish',
  'hub.topic': topic,
  'hub.url': topic,
});

console.log(`hub    ${hub}`);
console.log(`topic  ${topic}`);

if (DRY_RUN) {
  console.log(`\n--dry-run, not sending:\n  POST ${hub}\n  ${body}`);
  process.exit(0);
}

try {
  const res = await fetch(hub, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // 2xx is success; the spec asks for 204 and hubs variously send 200 or 202.
  if (res.ok) {
    console.log(`pinged — ${res.status} ${res.statusText}`);
    process.exit(0);
  }

  // A 4xx means the request itself is wrong (bad topic, unknown mode), which is
  // ours to fix and should be visible. A 5xx is the hub's problem and the
  // article is published regardless.
  const detail = (await res.text().catch(() => '')).slice(0, 400);
  console.error(`hub answered ${res.status} ${res.statusText}${detail ? `\n${detail}` : ''}`);
  process.exit(res.status >= 400 && res.status < 500 ? 1 : 0);
} catch (err) {
  console.error(`could not reach the hub: ${err.message}`);
  console.error('The article is published either way; pollers will still pick it up.');
  process.exit(0);
}
