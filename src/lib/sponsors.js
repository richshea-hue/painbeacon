// Brand sponsorships — the labeled "Advertisement" unit. Read at build time
// from data/sponsors.json; nothing here runs in the browser.
//
// Two rules keep this product from ever contaminating the directory:
//   1. A sponsor is never a clinic. Featured listings are a separate product
//      (listing_tier on the clinic row) with their own exclusivity rules.
//      This module knows nothing about clinics, scores, or rank.
//   2. Matching is geographic and editorial only — the card renders where the
//      page's STATE is one the sponsor bought, or on an article the sponsor
//      was explicitly attached to. It never reads visitor data; the same
//      visitor sees the same card on the same page every time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', '..', 'data', 'sponsors.json');

export const PLACEMENTS = ['state', 'zone', 'clinic', 'article'];

let _all = null;
export function allSponsors() {
  if (_all) return _all;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    _all = Array.isArray(raw.sponsors) ? raw.sponsors : [];
  } catch {
    _all = [];
  }
  return _all;
}

// Live = master switch on AND today inside the (optional) date window. The
// window is what lets a signed deal be committed before it starts and expire
// without a deploy — the daily rebuild picks it up.
export function isLive(s, today = new Date()) {
  if (!s || s.active !== true) return false;
  const d = today.toISOString().slice(0, 10);
  if (s.starts && d < s.starts) return false;
  if (s.ends && d > s.ends) return false;
  return true;
}

// Deterministic pick when several sponsors match one page: hash the page key
// so builds are stable and each sponsor gets a fixed share of the inventory.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * The sponsor (if any) for one page.
 * @param {object} q
 * @param {'state'|'zone'|'clinic'|'article'} q.placement
 * @param {string} [q.state]     2-letter code of the page's state (directory pages)
 * @param {string} [q.article]   article slug (article pages)
 * @param {string} q.pageKey     stable per-page string (the URL path is ideal)
 */
export function sponsorFor({ placement, state, article, pageKey }, today = new Date()) {
  if (!PLACEMENTS.includes(placement)) return null;
  const matches = allSponsors().filter((s) => {
    if (!isLive(s, today)) return false;
    if (!Array.isArray(s.placements) || !s.placements.includes(placement)) return false;
    if (placement === 'article') {
      const list = Array.isArray(s.articles) ? s.articles : [];
      return list.includes('*') || (article && list.includes(article));
    }
    const states = Array.isArray(s.states) ? s.states.map((x) => String(x).toUpperCase()) : [];
    if (!states.length) return true; // national
    return !!state && states.includes(String(state).toUpperCase());
  });
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];
  const ordered = [...matches].sort((a, b) => a.id.localeCompare(b.id));
  return ordered[hash(String(pageKey || '')) % ordered.length];
}

// Outbound href: always through /go/<id>, never the raw URL, so the click is
// counted server-side (functions/go/[id].js) with no script on the page.
export function sponsorHref(s, pageKey = '') {
  const q = pageKey ? `?p=${encodeURIComponent(pageKey)}` : '';
  return `/go/${encodeURIComponent(s.id)}/${q}`;
}
