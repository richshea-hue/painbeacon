// Titles and meta descriptions that fit what search engines show.
//
// Bing's SEO report (2026-11-21) flagged 121 clinic pages whose title ran past
// 70 characters and ~1,900 pages whose description was too short. Titles were
// "<registered name> — <city>, <ST> — PainBeacon", and a registered name can
// be 70 characters on its own ("..., A Professional Corporatio", cut off by
// the federal registry). Descriptions were one clause, ~85 characters.

export const TITLE_MAX = 70;
export const DESC_MIN = 120;
export const DESC_MAX = 160;

// Legal-form tails, including the registry's 70-character cut-offs
// ("A Professional Corporatio"). Only at the end of the name.
const LEGAL_TAIL = new RegExp(
  '(?:,|\\s)\\s*(?:' + [
    'a\\s+professional\\s+(?:medical\\s+|law\\s+)?corp\\w*',
    'a\\s+medical\\s+corp\\w*',
    'a\\s+prof\\w*',
    'p\\.?\\s?l\\.?\\s?l\\.?\\s?c\\.?',
    'l\\.?\\s?l\\.?\\s?c\\.?',
    'l\\.?\\s?l\\.?\\s?p\\.?',
    'p\\.?\\s?c\\.?',
    'p\\.?\\s?a\\.?',
    's\\.?\\s?c\\.?',
    'inc\\.?',
    'ltd\\.?',
    'corp\\.?',
    'corporation',
  ].join('|') + ')\\s*$',
  'i',
);

/** "Gold Coast Pain And Wellness Center, A Medical Corporation" -> "Gold Coast Pain And Wellness Center" */
export function withoutLegalForm(name) {
  let n = String(name || '').trim(), prev;
  do { prev = n; n = n.replace(LEGAL_TAIL, '').replace(/[\s,]+$/, ''); } while (n !== prev && n);
  return n || String(name || '').trim();
}

/** Cut at a word boundary so the result is at most `max` characters, ending in an ellipsis. */
function clip(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1).replace(/[\s,–—-]+\S*$/, '');
  return (cut || s.slice(0, max - 1)) + '…';
}

/**
 * The full <title> for a page about one practice. Tries, in order:
 *   name — City, ST — Site
 *   name without its legal form — City, ST — Site
 *   name without its legal form — City, ST
 *   that name clipped at a word — City, ST
 */
export function practiceTitle(name, place, site, max = TITLE_MAX) {
  const full = String(name || '').trim(), short = withoutLegalForm(full);
  for (const n of [full, short]) {
    const t = `${n} — ${place} — ${site}`;
    if (t.length <= max) return t;
  }
  const t = `${short} — ${place}`;
  if (t.length <= max) return t;
  return `${clip(short, max - place.length - 3)} — ${place}`;
}

/**
 * Add sentences to a description, in order, while it is under `min`, skipping
 * any that would take it past `max`. Every extra must be true of the page.
 */
export function fillDescription(base, extras, min = DESC_MIN, max = DESC_MAX) {
  let d = String(base).trim();
  for (const x of extras) {
    if (d.length >= min) break;
    if (!x) continue;
    const next = `${d} ${x}`;
    if (next.length <= max) d = next;
  }
  return d;
}
