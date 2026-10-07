// Google Search Console, the one place we read it from.
//
// Auth is a service-account JWT signed locally and traded for an access token,
// which is why this needs no OAuth dance and no browser: GSC_SERVICE_ACCOUNT_JSON
// points at the key file, and that key's client_email has to be added as a user
// on the property (Search Console -> Settings -> Users and permissions) or the
// token comes back fine and every query 403s.
//
// Why Search Console at all, when Cloudflare also counts traffic: a directory of
// 12,000 pages is crawled constantly, so edge "visits" are mostly robots -- the
// trap that once turned 5 real sponsor clicks into 257. An impression is logged
// when Google showed one of our pages to a person looking at a results page, and
// a click when that person came. Both are counted by Google, not by us, which is
// also what makes them checkable by anyone who asks.
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

// Search Console finalizes a day's data about two days late. Asking for
// yesterday returns a half-filled row that reads as a collapse in traffic.
export const LAG_DAYS = 2;

const iso = (d) => d.toISOString().slice(0, 10);

/** The most recent date Search Console has settled data for. */
export function latestSettledDay(now = new Date()) {
  return iso(new Date(now.getTime() - LAG_DAYS * 86400000));
}

export function gscConfigured(env = process.env) {
  return Boolean(env.GSC_SERVICE_ACCOUNT_JSON);
}

/**
 * Returns { site, email, query(startDate, endDate, body) } or null when no
 * credential is configured, so a caller can degrade instead of throwing.
 */
export async function gscClient({ env = process.env, site } = {}) {
  const keyPath = env.GSC_SERVICE_ACCOUNT_JSON;
  if (!keyPath) return null;
  const property = site || env.GSC_SITE
    || `sc-domain:${env.CLOUDFLARE_ZONE_NAME || 'painbeacon.com'}`;
  const sa = JSON.parse(readFileSync(keyPath, 'utf8'));

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
  })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const tok = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${sig}`,
    }),
  })).json();
  if (!tok.access_token) {
    throw new Error(`GSC auth failed — is ${sa.client_email} a user on ${property}?`);
  }

  const query = async (startDate, endDate, body = {}) => {
    const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, ...body }),
    });
    const out = await r.json();
    if (out.error) throw new Error(`GSC: ${out.error.message}`);
    return out.rows || [];
  };

  return { site: property, email: sa.client_email, query };
}
