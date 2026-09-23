// Tell the WebSub hub the feed moved, so subscribed readers get it pushed now
// instead of on their next poll.
//
//   node scripts/ping-websub.mjs
//   node scripts/ping-websub.mjs --dry-run   # print the request, send nothing
//
// WHAT THE SPEC ACTUALLY SAYS, because it is less than you would expect.
// WebSub §6 Publishing requires only that "the publisher MUST inform the hubs
// it previously designated when a topic has been updated", and then: "The hub
// and the publisher can agree on any mechanism." A NOTE adds that the mechanism
// "is left unspecified", and that some public hubs happen to accept a POST with
// hub.mode=publish and hub.url. So the request below is that convention, not a
// conformance requirement, and no hub owes us any particular status code for
// it. A rejection here is information about one hub's API, never a spec
// violation — which is why this script reports and moves on rather than failing.
//
// The half that IS normative for a publisher is the advertisement: the
// atom:link rel="hub" and rel="self" elements in src/pages/rss.xml.js. Those are
// what let a subscriber find the hub and subscribe in the first place, and they
// work whether or not this ping is accepted.
//
// ORDERING. The hub fetches the feed itself after a ping, so this must run AFTER
// the deploy is live or it fetches the old one and the ping is spent.
// .github/workflows/announce-article.yml waits for the build first.
//
// NEVER FATAL. The article is published and ordinary pollers will find it
// regardless, so a hub that is down, slow, or simply uninterested costs nothing.
// This exits 0 in every case except a malformed request, which would be ours.
import { SITE } from '../src/lib/site.js';

const DRY_RUN = process.argv.includes('--dry-run');
const TIMEOUT_MS = 15_000;

/** A GitHub Actions warning annotation, so a rejection shows in the run summary. */
const warn = (msg) => console.log(`::warning title=WebSub ping::${msg}`);

// WEBSUB_HUB overrides the configured hub, so the branches below can be
// exercised against a local stub without touching the real one.
const hub = process.env.WEBSUB_HUB || SITE.websubHub;
if (!hub) {
  console.log('SITE.websubHub is blank — no hub declared in the feed, nothing to ping.');
  process.exit(0);
}

const topic = new URL('/rss.xml', SITE.url).href;

// hub.topic is the W3C spelling used elsewhere in the spec; hub.url is the one
// the §6 note names and the one PubSubHubbub 0.3 used. They mean the same thing
// and hubs ignore the key they do not read, so send both rather than guess.
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

  const detail = (await res.text().catch(() => '')).trim();

  if (res.ok) {
    console.log(`pinged — ${res.status} ${res.statusText}`);
    process.exit(0);
  }

  // The expected steady state until somebody subscribes. A topic becomes known
  // to a hub when a SUBSCRIBER sends hub.mode=subscribe for it, so a hub that
  // has never been asked for this feed has no record to publish against. Said
  // plainly rather than warned about: it is not a fault, and warning weekly
  // about a thing nobody has done yet would train us to ignore the warnings.
  if (/topic not found/i.test(detail)) {
    console.log(`not fanned out — ${res.status}: ${detail}`);
    console.log(`The hub has no subscribers for this feed yet, so it has nothing to push.`);
    console.log(`It starts working the first time a reader subscribes via the rel="hub" link.`);
    process.exit(0);
  }

  // Anything else is worth a human glance: the hub's API may have moved, or the
  // request shape it wants may have changed. Surfaced as an annotation so it is
  // visible in the run summary without failing the job or the Bluesky post.
  warn(`${hub} answered ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
  // A 4xx means the request itself is wrong, which is ours to fix and should be
  // loud. A 5xx is the hub's to fix and the article shipped either way.
  process.exit(res.status >= 400 && res.status < 500 ? 1 : 0);
} catch (err) {
  warn(`could not reach ${hub}: ${err.message}`);
  console.log('The article is published either way; pollers will still pick it up.');
  process.exit(0);
}
