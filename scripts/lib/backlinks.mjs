// Finding our own link on somebody else's page.
//
// Pure functions, no network, so scripts/lib/backlinks.test.mjs can pin the
// parts that actually decide a number. scripts/check-backlinks.mjs does the
// fetching.
//
// What counts as a backlink here is narrower than "the string painbeacon.com
// appears": the href has to resolve to our host. A link to
// painbeacon.com.example.net is somebody else's domain and must never be
// counted as ours.

const HOST = 'painbeacon.com';

/** Is this hostname us? Apex and any subdomain, never a lookalike. */
export function isOurHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return h === HOST || h.endsWith('.' + HOST);
}

/**
 * A clinic's stored website turned into something fetchable, or null.
 *
 * The column holds whatever a directory record or a director typed: bare
 * domains, stray spaces, "http://" on sites that are https now. Anything that
 * is not an http(s) URL with a hostname is not worth a request.
 */
export function normalizeSite(website) {
  const raw = String(website || '').trim();
  if (!raw) return null;
  // Parse as written FIRST. Prepending https:// to everything turns
  // "mailto:a@b.com" into "https://mailto:a@b.com/", which the URL parser
  // happily reads as host b.com with a username — a request to a stranger.
  // A leading token before ':' is only a scheme when it has no dot in it —
  // otherwise "example.com:8080" parses as the scheme "example.com" and a
  // perfectly good host:port gets thrown away.
  const scheme = raw.match(/^([a-zA-Z][a-zA-Z0-9+.\-]*):/);
  const schemed = Boolean(scheme) && !scheme[1].includes('.');
  let u = null;
  try {
    u = new URL(schemed ? raw : `https://${raw.replace(/^\/+/, '')}`);
  } catch (_e) {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (!u.hostname || !u.hostname.includes('.')) return null;
  // Our own domain is not a backlink to ourselves.
  if (isOurHost(u.hostname)) return null;
  return u;
}

const REL_BLOCKS = ['nofollow', 'sponsored', 'ugc'];
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
};

/**
 * Every link to us on one page.
 *
 * Returns { count, followed, badge, url }:
 *   count     how many anchors resolve to our host
 *   followed  true when at least one of them passes link equity (no
 *             nofollow/sponsored/ugc). One followed link is what matters for
 *             organic, so this is an OR across the page, not an AND.
 *   badge     true when at least one is the issued badge — ?src=badge, or an
 *             anchor wrapping the badge SVG
 *   url       the first matching href, absolute, for the record
 *
 * Deliberately a regex and not a DOM: this reads pages from thousands of
 * sites we do not control, many of them malformed, and a parser that throws
 * on bad markup would lose the count. The cost is that a commented-out or
 * script-embedded anchor could be counted; that is an over-count of something
 * we are measuring the growth of, and it is visible in `url`.
 */
export function findBacklinks(html, pageUrl) {
  const out = { count: 0, followed: false, badge: false, url: null };
  if (!html) return out;
  const anchors = String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi);
  for (const m of anchors) {
    const [, tag, inner] = m;
    const href = attr(tag, 'href');
    if (!href) continue;
    let resolved;
    try {
      resolved = new URL(href, pageUrl);
    } catch (_e) {
      continue;
    }
    if (!isOurHost(resolved.hostname)) continue;

    out.count += 1;
    if (!out.url) out.url = resolved.href;

    const rel = attr(tag, 'rel').toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (!REL_BLOCKS.some((r) => rel.includes(r))) out.followed = true;

    if (resolved.searchParams.get('src') === 'badge' || /verified-badge/i.test(inner)) {
      out.badge = true;
    }
  }
  return out;
}

/**
 * Minimal robots.txt check: may we fetch this path?
 *
 * Not a full implementation — it reads the group for our agent, falling back
 * to the wildcard group, and applies longest-match Allow/Disallow prefixes,
 * which is what decides the only question asked here ("may we GET /"). Absent
 * or unparseable robots.txt means yes, which is what the standard says.
 *
 * These are the sites of businesses we list, fetched once and slowly, so the
 * point is courtesy rather than compliance theater. Honoring a blanket
 * Disallow costs one row of data and avoids being the directory that crawls
 * people who asked it not to.
 */
export function robotsAllows(robotsTxt, path = '/', agent = 'painbeaconbot') {
  if (!robotsTxt || typeof robotsTxt !== 'string') return true;
  const groups = [];
  let current = null;
  for (const line of robotsTxt.split(/\r?\n/)) {
    const clean = line.replace(/#.*$/, '').trim();
    if (!clean) continue;
    const [rawField, ...rest] = clean.split(':');
    const field = rawField.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (field === 'user-agent') {
      // Consecutive User-agent lines share one group of rules.
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (field === 'allow' || field === 'disallow')) {
      current.rules.push({ allow: field === 'allow', path: value });
    }
  }
  const ua = agent.toLowerCase();
  const group =
    groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a))) ||
    groups.find((g) => g.agents.includes('*'));
  if (!group) return true;

  let best = null;
  for (const rule of group.rules) {
    // "Disallow:" with an empty value means allow everything; it has no prefix.
    if (!rule.path) continue;
    if (!path.startsWith(rule.path)) continue;
    // Longest prefix wins, and Allow wins a tie — that is what lets an
    // explicit Allow carve a path out of a blanket Disallow.
    if (!best || rule.path.length > best.path.length
      || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}
