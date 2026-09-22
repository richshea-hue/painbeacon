// Is this request an automated client rather than a person?
//
// Shared by the two sponsor counters (functions/go/[id].js and
// functions/i/[id].js). Files starting with an underscore are not routed by
// Pages Functions, so this is a library, not an endpoint.
//
// Why it exists: /go/<id>/ counted a click on ANY GET. Crawlers follow links
// and skip 1x1 images, so between 2026-09-09 and 2026-09-22 the sponsor report
// showed 257 clicks against 106 views — one "click" per distinct page, spread
// evenly through the day. Five of those 257 carried a same-site referrer. The
// rest were machines, and the number we would have reported to the sponsor was
// wrong by fifty times.
//
// IMPORTANT — what this may and may not keep. /privacy enumerates what a
// sponsor event stores: "which sponsor, which page, when", with "no IP
// address, no device identifier, and no cookie". A full user-agent string is a
// fingerprinting surface, so it is read here and thrown away; only the boolean
// verdict is ever persisted. Do not "improve" this by storing the raw string
// without changing that page first.
//
// The list is deliberately broad and errs toward calling a thing a bot: under-
// reporting to a sponsor is recoverable, over-reporting is not.

const BOT_PATTERNS = [
  // Self-identifying automation
  'bot', 'crawl', 'spider', 'slurp', 'scrap',
  // Command-line and library clients
  'curl', 'wget', 'python-requests', 'python-urllib', 'aiohttp', 'httpx',
  'go-http-client', 'okhttp', 'axios', 'node-fetch', 'java/', 'libwww',
  'httpclient', 'restsharp', 'guzzle', 'postman',
  // Headless browsers and automation drivers
  'headless', 'phantomjs', 'puppeteer', 'playwright', 'selenium', 'lighthouse',
  // Link unfurlers and preview fetchers — not crawlers, still not people
  'facebookexternalhit', 'whatsapp', 'telegram', 'slack', 'discord',
  'twitterbot', 'linkedin', 'embedly', 'preview', 'quora link',
  // Monitoring, security scanners and validators
  'monitor', 'uptime', 'pingdom', 'statuscake', 'validator', 'checker',
  'scanner', 'nessus', 'qualys', 'expanse', 'censys', 'zgrab',
  // Feed readers and archives
  'feedfetcher', 'feedly', 'ia_archiver', 'archive.org',
];

/**
 * True when the request looks automated.
 *
 * A missing User-Agent counts as automated: every real browser sends one, and
 * a bare fetch usually does not.
 */
export function isBot(request) {
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  if (!ua) return true;
  return BOT_PATTERNS.some((p) => ua.includes(p));
}

/**
 * True when the request came from one of our own pages.
 *
 * public/_headers sets Referrer-Policy: strict-origin-when-cross-origin, and
 * /go/ is same-origin with the page carrying the card, so a genuine in-browser
 * click sends the full page URL. A click with no referrer at all is a direct
 * fetch — which is what a crawler does. This is reported alongside the bot
 * verdict rather than folded into it: a handful of real people do strip
 * referrers, so it belongs in the confidence column, not the filter.
 */
export function isSameSite(request, url) {
  const ref = request.headers.get('referer') || '';
  if (!ref) return false;
  try {
    return new URL(ref).origin === new URL(url).origin;
  } catch (_e) {
    return false;
  }
}
