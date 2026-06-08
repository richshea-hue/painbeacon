// lib/pricing.js
// Maps a zone's monthly Featured price to its live Stripe Payment Link.
// When you introduce a new price point (e.g. metro $599), add one line here —
// the site then routes those zones to the right checkout automatically.
//
// NOTE: these are PUBLIC Stripe Payment Link URLs (the same links you'd paste in
// an email). They are safe to commit — they are NOT secret API keys.

export const FEATURED_LINKS = {
  299: 'https://buy.stripe.com/9B6eVf2Pv6ZO5Pj5nxeAg03',
  // 599: 'https://buy.stripe.com/REPLACE_WITH_YOUR_METRO_LINK',  // add when you raise metro pricing
  // 899: 'https://buy.stripe.com/REPLACE_WITH_YOUR_MONSTER_LINK',
};

// Resolve the right checkout link for a clinic's zone price.
// Falls back to the $299 link if a price has no mapping yet (so the CTA never breaks).
export function featuredLinkFor(monthly) {
  return FEATURED_LINKS[monthly] || FEATURED_LINKS[299];
}

export const featuredPriceLabel = (monthly) => `$${monthly}/mo`;
