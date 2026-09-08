// Practice Kit token + file-path helpers.
//
// Shared by the download endpoint (functions/practice-kit/download.js, a
// Cloudflare Pages Function) and the Node scripts that build the kit and mint
// links (scripts/build-practice-kit.mjs, scripts/kit-link.mjs). Only WebCrypto
// and TextEncoder are used, so the same file runs unchanged in both.
//
// The gate has two parts, both keyed off KIT_SECRET:
//   1. A per-clinic token, `<npi>.<hmac>`, that goes out by hand in the
//      verification email. Nothing on the site mints one.
//   2. The zip lives under /practice-kit/files/<dir>/ where <dir> is derived
//      from the secret, so the static file is never at a guessable URL. The
//      endpoint reads it through ASSETS; robots and _headers keep it out of
//      indexes. Rotate the secret and every old link and path dies at once.
//
// Files starting with an underscore are not routed by Pages Functions.

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const KIT_FILENAME = 'painbeacon-practice-kit.zip';

/** The secret directory segment under /practice-kit/files/. */
export async function kitDir(secret) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(`painbeacon-kit-path:${secret}`));
  return hex(d).slice(0, 32);
}

/** Site-relative path of the zip for this secret. */
export async function kitAssetPath(secret) {
  return `/practice-kit/files/${await kitDir(secret)}/${KIT_FILENAME}`;
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(msg));
}

/** Today as YYYYMMDD (UTC) — the issue date stamped into new tokens. */
export function todayStamp(d = new Date()) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * `<npi>.<yyyymmdd>.<24-char signature>` — the token that goes in the download
 * link. The issue date is signed along with the NPI, so the kit can later move
 * to the paid tiers for NEW verifications while every practice that verified
 * during the free period keeps its link (see KIT_FREE_UNTIL in download.js).
 * That is what makes "free for a limited time — verify now and keep it" a
 * promise the code enforces rather than a slogan.
 */
export async function signNpi(secret, npi, issued = todayStamp()) {
  const sig = b64url(await hmac(secret, `kit:${npi}:${issued}`)).slice(0, 24);
  return `${npi}.${issued}.${sig}`;
}

/** Legacy `<npi>.<sig>` form from before the issue date was added. */
async function signLegacy(secret, npi) {
  const sig = b64url(await hmac(secret, `kit:${npi}`)).slice(0, 24);
  return `${npi}.${sig}`;
}

function sameToken(expected, token) {
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/**
 * Returns `{ npi, issued }` when the token verifies, otherwise null. `issued`
 * is `YYYYMMDD` for dated tokens and null for legacy ones (which predate the
 * cutoff by construction). Constant-time compare.
 */
export async function verifyToken(secret, token) {
  const dated = /^(\d{10})\.(\d{8})\.([A-Za-z0-9_-]{24})$/.exec(token || '');
  if (dated) {
    const expected = await signNpi(secret, dated[1], dated[2]);
    return sameToken(expected, token) ? { npi: dated[1], issued: dated[2] } : null;
  }
  const legacy = /^(\d{10})\.([A-Za-z0-9_-]{24})$/.exec(token || '');
  if (legacy) {
    const expected = await signLegacy(secret, legacy[1]);
    return sameToken(expected, token) ? { npi: legacy[1], issued: null } : null;
  }
  return null;
}
