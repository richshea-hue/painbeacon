// Build-time Google Safe Browsing validation for clinic website URLs.
//
// Why: practice domains in the federal data sometimes expire and get
// re-registered as spam/malware — linking to them once got the site flagged by
// Google Safe Browsing. So no clinic URL is ever linked unless it passed a
// Safe Browsing check during THIS build.
//
// Uses the Lookup API v4 (threatMatches:find), batched 500 URLs per request.
// Needs GOOGLE_SAFE_BROWSING_API_KEY (Google Cloud Console → enable
// "Safe Browsing API" → API key). Free tier: 10,000 lookups/day — a full
// build uses a handful of batched requests, far below the quota.
//
// Fail-safe by design: no key, a network error, or a malformed URL all mean
// "not validated", and unvalidated URLs are never linked. The build never
// fails because of this module.

const API = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const BATCH_SIZE = 500;
const THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION',
];

// Normalize a raw website value ("clinic.com", "http://x.com/p") to a full
// https-defaulted URL, or null if it can't be a real public web URL.
export function normalizeWebsite(raw) {
  if (!raw) return null;
  let v = String(raw).trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.') || u.hostname.endsWith('.')) return null;
    return u.href;
  } catch {
    return null;
  }
}

// Check a list of normalized URLs. Returns a Map of url -> true (clean) or
// false (flagged). URLs missing from the map were NOT validated (API error).
// Returns an empty Map when no API key is configured.
export async function checkWebsites(urls) {
  const results = new Map();
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return results;

  // Dev-only escape hatch so the local sample build can exercise the
  // verified-link UI without a key. NEVER set this in a production build.
  if (process.env.SAFE_BROWSING_ASSUME_SAFE === '1') {
    console.warn(
      '[safebrowsing] SAFE_BROWSING_ASSUME_SAFE=1 — marking ALL websites safe ' +
        'WITHOUT checking. Dev builds only; never set this in production.'
    );
    for (const u of unique) results.set(u, true);
    return results;
  }

  const key = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!key) {
    console.warn(
      `[safebrowsing] GOOGLE_SAFE_BROWSING_API_KEY not set — ${unique.length} ` +
        'clinic websites left unvalidated, so none will be linked.'
    );
    return results;
  }

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(`${API}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'painbeacon-build', clientVersion: '1.0' },
          threatInfo: {
            threatTypes: THREAT_TYPES,
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: batch.map((url) => ({ url })),
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const flagged = new Set((data.matches || []).map((m) => m.threat?.url).filter(Boolean));
      for (const url of batch) results.set(url, !flagged.has(url));
    } catch (err) {
      // This batch stays unvalidated (unlinked). Keep going — a transient
      // error on one batch shouldn't kill validation for the rest.
      console.warn(`[safebrowsing] batch ${i / BATCH_SIZE + 1} failed, leaving ` +
        `${batch.length} URLs unvalidated: ${err.message}`);
    }
  }

  const flaggedCount = [...results.values()].filter((v) => v === false).length;
  console.log(
    `[safebrowsing] checked ${results.size}/${unique.length} websites — ` +
      `${flaggedCount} flagged, ${unique.length - results.size} unvalidated`
  );
  return results;
}
