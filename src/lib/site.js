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
    facebook: 'https://www.facebook.com/profile.php?id=61592202442574',
  },

  // Google Preferred Sources — a READER opt-in, not a ranking setting. Someone
  // who ticks our box gets a "Preferred" badge on our links inside AI Overviews
  // and AI Mode, and Google reports preferred sources are about twice as likely
  // to be clicked. Nothing here changes how the site is crawled or indexed, and
  // Google alone decides which domains appear in the tool.
  //
  // Domain-level only: painbeacon.com is eligible, painbeacon.com/news is not.
  // Google also ships an interactive button (a script from news.google.com) —
  // we use the plain deeplink instead so the site keeps loading no third-party
  // JavaScript. Set '' to pull the links from the footer, article pages and
  // The Beacon index in one edit.
  preferredSourceUrl: 'https://www.google.com/preferences/source?q=painbeacon.com',

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

  // Facebook App ID, emitted as fb:app_id. OPTIONAL — the Sharing Debugger
  // lists it under "missing required properties", but it is not required and a
  // link preview renders identically without it (verified on the live site).
  // Its only job is to attribute shares of this domain to a Facebook App so
  // engagement shows up in Domain Insights; there is nothing else to build with
  // it. Getting one means registering an app at developers.facebook.com purely
  // for the ID. Leave blank and no tag is emitted — which is the right setting
  // unless someone is actually reading those Insights.
  facebookAppId: '',

  // Outbound links to each clinic's OWN website. Practice domains in the
  // federal data sometimes expire and get re-registered as spam/malware, and
  // linking to them once got the site flagged by Google Safe Browsing. Links
  // are therefore double-gated: this master switch AND a per-URL Safe Browsing
  // check at build time (src/lib/safebrowsing.js — needs
  // GOOGLE_SAFE_BROWSING_API_KEY in the build env). A URL that wasn't checked
  // or didn't come back clean is shown as plain text, never linked, even with
  // this switch on. Set false to kill all clinic links regardless of checks.
  linkClinicWebsites: true,

  // Paid listing tiers and the brand sponsorship. Display copy lives here so
  // /for-practices/ and /advertise/ can never disagree with each other.
  //
  // Stripe: create one Product per tier with TWO prices — a monthly recurring
  // price and a one-time "3 months prepaid" price — and a Payment Link for
  // each. Paste the links into `url` below; a button goes live the moment its
  // url is non-empty and falls back to the inquiry form (#talk) until then.
  // The dollar figures here are display-only; the charge is whatever the
  // Payment Link says, so change both together. The pre-2026-09 links
  // (5kQ4gBgGl97W… at $29, 3cI5kF1Lresg… at $299) charge the OLD prices —
  // archive them in Stripe once the new ones exist, never re-paste them.
  pricing: {
    enhanced: {
      price: '$50', period: '/mo', note: '30-day free trial', url: '',
      commit: { label: '3 months prepaid', price: '$135', per: '$45/mo', url: '' },
    },
    featured: {
      price: '$500', period: '/mo', note: '', url: '',
      commit: { label: '3 months prepaid', price: '$1,350', per: '$450/mo', url: '' },
    },
    // Brand sponsorship (data/sponsors.json) — sold, not self-serve. Prices
    // render on /advertise/; the sale closes by conversation and invoice.
    sponsor: {
      price: '$750', period: '/mo', term: 'Month to month, 30 days notice',
      commit: { label: '3 months prepaid', price: '$1,800', per: '$600/mo' },
    },
  },
};
