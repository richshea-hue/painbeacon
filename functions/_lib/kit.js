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

/** `<npi>.<24-char signature>` — the token that goes in the download link. */
export async function signNpi(secret, npi) {
  const sig = b64url(await hmac(secret, `kit:${npi}`)).slice(0, 24);
  return `${npi}.${sig}`;
}

/** Returns the NPI when the token verifies, otherwise null. Constant-time compare. */
export async function verifyToken(secret, token) {
  const m = /^(\d{10})\.([A-Za-z0-9_-]{24})$/.exec(token || '');
  if (!m) return null;
  const expected = await signNpi(secret, m[1]);
  if (expected.length !== token.length) return null;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0 ? m[1] : null;
}
