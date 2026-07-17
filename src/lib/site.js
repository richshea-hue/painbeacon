// Central site config. One national brand, one domain — no micro-sites.

export const SITE = {
  name: 'PainBeacon',
  legalName: 'PainBeacon Directory',
  url: 'https://painbeacon.com',
  tagline: 'Find the right pain clinic near you.',
  description:
    'An independent national directory of pain medicine clinics. Find ' +
    'board-certified, interventional pain specialists near you, ranked on ' +
    'objective, published criteria.',

  // Official social profiles. Rendered in the footer and emitted as sameAs in
  // the site's Organization JSON-LD. Leave a value '' to hide that link.
  socials: {
    x: 'https://x.com/painbeacon',
    facebook: '', // paste the PainBeacon Facebook page URL to show the link
  },

  // E-E-A-T: real, named editorial accountability on every page (YMYL).
  // IMPORTANT: keep active=false until a real, named clinician agrees to review.
  // Never display a fabricated reviewer on a health site. When you retain one,
  // set active:true and fill name/credentials/bio with their real details.
  medicalReviewer: {
    active: false,
    name: '',
    credentials: '',
    bio: '',
  },
  editorial: {
    publisher: 'PainBeacon Directory',
    lastReviewed: '2026-05-29',
  },

  // Google Search Console ownership verification. If you verify with the
  // "HTML tag" method, paste ONLY the content="..." value from Google here,
  // then redeploy and click Verify in GSC. (If you verify via Cloudflare DNS
  // instead, leave this blank — no code change needed.)
  googleSiteVerification: '',

  // Bing Webmaster Tools verification. Easiest path is "Import from Google
  // Search Console" (no code needed). If you verify manually with the meta-tag
  // method, paste ONLY the content="..." value from Bing here and redeploy.
  bingSiteVerification: '',

  // Outbound links to each clinic's OWN website are disabled. Practice domains
  // in the federal data sometimes expire and get re-registered as spam/malware,
  // and linking to them got the site flagged by Google Safe Browsing. While off,
  // profiles show the domain as plain text and offer a safe "Find on Google"
  // button instead. Only set true again once website URLs are validated against
  // the Google Safe Browsing API at build time.
  linkClinicWebsites: false,

  // Paid listing tiers. Create the two subscription Payment Links in Stripe,
  // then paste each checkout URL into `url` below — the buttons go live
  // automatically. Until a url is set, the button falls back to the inquiry
  // form (#talk). Prices are display-only here; the real amount is whatever you
  // set on the Stripe Payment Link, so keep the two in sync.
  pricing: {
    enhanced: { price: '$29', period: '/mo', note: '30-day free trial', url: 'https://buy.stripe.com/5kQ4gBgGl97WfpTaHReAg00' },
    featured: { price: '$299', period: '/mo', note: '', url: 'https://buy.stripe.com/3cI5kF1Lresgb9D03deAg02' },
  },
};
