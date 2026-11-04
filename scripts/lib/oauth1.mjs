// OAuth 1.0a request signing (HMAC-SHA1), as RFC 5849 §3.4 specifies it.
//
// Pure functions, no network, so scripts/lib/oauth1.test.mjs can pin them
// against the worked example in RFC 5849 §3.4.1. That test is the whole reason
// this is a separate file: a signature is either byte-exact or it is a blanket
// 401, there is no partial credit and no useful error message, and the failure
// looks identical to bad credentials. Getting it checked against the spec's own
// vector is the difference between "the token must be wrong" and knowing.
//
// Used by scripts/post-to-x.mjs. Dependency-free on purpose, like
// scripts/lib/feed-item.mjs, so the announce workflow runs on a bare runner
// with no npm install.
import crypto from 'node:crypto';

/**
 * Percent-encoding as §3.6 requires: the unreserved set is A-Za-z0-9-._~ and
 * everything else is escaped in UPPERCASE hex.
 *
 * encodeURIComponent is almost right but leaves !'()* alone. An unescaped
 * apostrophe is enough to invalidate every signature, so this replace is not a
 * nicety.
 */
export const pct = (s) =>
  encodeURIComponent(String(s ?? '')).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * The normalized parameter string (§3.4.1.3.2).
 *
 * Takes [name, value] pairs with values already DECODED, encodes both halves,
 * then sorts by encoded name and — where names collide — by encoded value.
 *
 * Pairs, not an object: §3.4.1.3.2 explicitly allows a name to repeat, and the
 * spec's own example relies on it (a3 appears twice, as "2 q" and as "a").
 * Flattening into an object silently drops one of them and produces a signature
 * that is wrong only for the requests that happen to repeat a name.
 *
 * oauth_signature itself is never a member of this set, and neither is realm.
 */
export function normalizeParams(pairs) {
  return pairs
    .map(([k, v]) => [pct(k), pct(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

/**
 * The signature base string (§3.4.1.1): method, base string URI, and normalized
 * parameters, each percent-encoded and joined with '&'.
 *
 * `url`'s query string joins the parameter set automatically (§3.4.1.3.1), and
 * is stripped from the URI half. `extra` is for everything else that
 * participates: the oauth_* values, plus the body's fields when the request is
 * form-encoded. A JSON body contributes nothing — §3.4.1.3.1 folds in a body
 * only when its content type is application/x-www-form-urlencoded — which is
 * why an X post's text is authenticated by TLS alone.
 */
export function baseString(method, url, extra = []) {
  const u = new URL(url);

  // §3.4.1.2: scheme and host lowercased, default port omitted, query dropped.
  // URL.origin already does the first two.
  const uri = `${u.origin.toLowerCase()}${u.pathname}`;

  const pairs = [...extra];
  for (const [k, v] of u.searchParams) pairs.push([k, v]);

  return [method.toUpperCase(), pct(uri), pct(normalizeParams(pairs))].join('&');
}

/** HMAC-SHA1 over the base string, keyed by the two secrets (§3.4.2). */
export const sign = (base, consumerSecret, tokenSecret) =>
  crypto
    .createHmac('sha1', `${pct(consumerSecret)}&${pct(tokenSecret)}`)
    .update(base)
    .digest('base64');

/**
 * A complete Authorization header value for one request.
 *
 * `nonce` and `timestamp` are injectable so a test can reproduce a fixed
 * vector; in real use they default to a fresh random nonce and now.
 */
export function authHeader({
  method,
  url,
  consumerKey,
  consumerSecret,
  token,
  tokenSecret,
  extra = [],
  nonce = crypto.randomBytes(16).toString('hex'),
  timestamp = Math.floor(Date.now() / 1000).toString(),
}) {
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(timestamp),
    oauth_token: token,
    oauth_version: '1.0',
  };

  const base = baseString(method, url, [...Object.entries(oauth), ...extra]);
  oauth.oauth_signature = sign(base, consumerSecret, tokenSecret);

  return `OAuth ${Object.keys(oauth)
    .sort()
    .map((k) => `${pct(k)}="${pct(oauth[k])}"`)
    .join(', ')}`;
}
