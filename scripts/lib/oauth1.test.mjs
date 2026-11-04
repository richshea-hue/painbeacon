// OAuth 1.0a signing, pinned against the worked example in RFC 5849 §3.4.1.
//
// Why bother: an OAuth 1.0a signature is byte-exact or it is a blanket 401 with
// no diagnostic, and a 401 from a wrong signature is indistinguishable from a
// 401 from a revoked token. Without a vector there is no way to tell which half
// is broken. The spec ships one, so use it.
//
// The vector exercises the three things most likely to be wrong, all of which
// are invisible in ordinary use because our own requests do not hit them:
//   - a repeated parameter name (a3, as both "2 q" and "a"), which an
//     object-keyed implementation silently drops one half of
//   - sorting on the ENCODED name, so c%40 sorts before c2
//   - a value that is itself percent-encoded in the query (b5=%3D%253D), which
//     has to survive a decode-then-re-encode round trip unchanged
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { authHeader, baseString, normalizeParams, pct, sign } from './oauth1.mjs';

// RFC 5849 §3.4.1.3.1 — the request the example is built from.
const URL_UNDER_TEST = 'http://example.com/request?b5=%3D%253D&a3=a&c%40=&a2=r%20b';
const BODY = 'c2&a3=2+q';

// The Authorization header of that example. Note there is no oauth_version:
// §3.1 makes it optional, and the example omits it. realm is present in the
// request but is NOT a signature parameter, so it is absent here.
const OAUTH = [
  ['oauth_consumer_key', '9djdj82h48djs9d2'],
  ['oauth_token', 'kkk9d7dh3k39sjv7'],
  ['oauth_signature_method', 'HMAC-SHA1'],
  ['oauth_timestamp', '137131201'],
  ['oauth_nonce', '7d8f3e4a'],
];

const bodyPairs = [...new URLSearchParams(BODY)];

// §3.4.1.3.2, with the display line-wrapping removed.
const EXPECTED_PARAMS =
  'a2=r%20b&a3=2%20q&a3=a&b5=%3D%253D&c%40=&c2=' +
  '&oauth_consumer_key=9djdj82h48djs9d2&oauth_nonce=7d8f3e4a' +
  '&oauth_signature_method=HMAC-SHA1&oauth_timestamp=137131201' +
  '&oauth_token=kkk9d7dh3k39sjv7';

// §3.4.1.1, with the display line-wrapping removed.
const EXPECTED_BASE =
  'POST&http%3A%2F%2Fexample.com%2Frequest' +
  '&a2%3Dr%2520b%26a3%3D2%2520q%26a3%3Da%26b5%3D%253D%25253D%26c%2540%3D%26c2%3D' +
  '%26oauth_consumer_key%3D9djdj82h48djs9d2%26oauth_nonce%3D7d8f3e4a' +
  '%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D137131201' +
  '%26oauth_token%3Dkkk9d7dh3k39sjv7';

test('normalizeParams matches RFC 5849 §3.4.1.3.2', () => {
  const queryPairs = [...new URL(URL_UNDER_TEST).searchParams];
  assert.equal(normalizeParams([...OAUTH, ...bodyPairs, ...queryPairs]), EXPECTED_PARAMS);
});

test('baseString matches RFC 5849 §3.4.1.1', () => {
  assert.equal(baseString('POST', URL_UNDER_TEST, [...OAUTH, ...bodyPairs]), EXPECTED_BASE);
});

test('baseString drops the query from the URI half and lowercases the host', () => {
  const base = baseString('get', 'https://API.X.com/2/tweets?a=1', []);
  assert.equal(base, 'GET&https%3A%2F%2Fapi.x.com%2F2%2Ftweets&a%3D1');
});

test('baseString omits a default port, as §3.4.1.2 requires', () => {
  assert.match(baseString('GET', 'https://api.x.com:443/2/tweets'), /%2Fapi\.x\.com%2F2%2Ftweets/);
});

test('a repeated parameter name is kept, and sorted by value', () => {
  // Dropping one of these is the bug the RFC vector exists to catch.
  assert.equal(normalizeParams([['a', 'b'], ['a', 'a']]), 'a=a&a=b');
});

test('pct leaves the unreserved set alone', () => {
  const unreserved = 'ABCdef123-._~';
  assert.equal(pct(unreserved), unreserved);
});

test("pct escapes the characters encodeURIComponent misses", () => {
  // The whole reason pct exists rather than a bare encodeURIComponent. An
  // apostrophe in a dek would otherwise invalidate the signature.
  assert.equal(pct("!'()*"), '%21%27%28%29%2A');
});

test('pct escapes in uppercase hex, and UTF-8 encodes non-ASCII', () => {
  assert.equal(pct(' '), '%20');
  assert.equal(pct('='), '%3D');
  assert.equal(pct('é'), '%C3%A9');
  assert.equal(pct('—'), '%E2%80%94');
});

test('pct treats null and undefined as empty', () => {
  assert.equal(pct(null), '');
  assert.equal(pct(undefined), '');
});

test('the signing key is both secrets, percent-encoded, joined by &', () => {
  // Computed independently from the literal key the spec describes, so this
  // tests the key derivation rather than restating the HMAC.
  const expected = crypto
    .createHmac('sha1', 'con%26sumer&tok%3Den')
    .update('BASE')
    .digest('base64');
  assert.equal(sign('BASE', 'con&sumer', 'tok=en'), expected);
});

test('an absent token secret still leaves the trailing &', () => {
  const expected = crypto.createHmac('sha1', 'secret&').update('BASE').digest('base64');
  assert.equal(sign('BASE', 'secret', ''), expected);
});

test('authHeader quotes every parameter and sorts them', () => {
  const header = authHeader({
    method: 'POST',
    url: 'https://api.x.com/2/tweets',
    consumerKey: 'ck',
    consumerSecret: 'cs',
    token: 'tk',
    tokenSecret: 'ts',
    nonce: 'abc',
    timestamp: '1700000000',
  });

  assert.match(header, /^OAuth /);
  assert.match(header, /oauth_consumer_key="ck"/);
  assert.match(header, /oauth_nonce="abc"/);
  assert.match(header, /oauth_signature_method="HMAC-SHA1"/);
  assert.match(header, /oauth_timestamp="1700000000"/);
  assert.match(header, /oauth_token="tk"/);
  assert.match(header, /oauth_version="1\.0"/);
  assert.match(header, /oauth_signature="[A-Za-z0-9%]+"/);

  // Alphabetical, and the signature is encoded — a raw base64 '+' or '=' in the
  // header would be read as a delimiter or padding by the far end.
  const names = [...header.matchAll(/(oauth_[a-z_]+)="/g)].map((m) => m[1]);
  assert.deepEqual(names, [...names].sort());
});

test('authHeader is stable for fixed inputs and changes with the nonce', () => {
  const args = {
    method: 'POST',
    url: 'https://api.x.com/2/tweets',
    consumerKey: 'ck',
    consumerSecret: 'cs',
    token: 'tk',
    tokenSecret: 'ts',
    timestamp: '1700000000',
  };
  assert.equal(authHeader({ ...args, nonce: 'n1' }), authHeader({ ...args, nonce: 'n1' }));
  assert.notEqual(authHeader({ ...args, nonce: 'n1' }), authHeader({ ...args, nonce: 'n2' }));
});
