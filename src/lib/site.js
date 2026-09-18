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
  //
  // Four links, the amount each charges, and what it buys:
  //   enhanced.url          $50/mo recurring        1 month, renewing
  //   enhanced.commit.url   $135 one-time           4 months of service
  //   featured.url          $500/mo recurring       1 month, renewing
  //   featured.commit.url   $1,350 one-time         4 months of service
  //
  // The prepaid links bill three months' list price and deliver four, so the
  // `per` figures below are the total over FOUR months, not three. Stripe sees
  // a one-time charge and nothing more: the bonus month exists only because
  // someone honors it when setting the listing's end date by hand. Change the
  // months of service and scripts/check-payment-links.mjs must change with it.
  //
  // EVERY link needs a required custom field asking for the practice name and
  // NPI, because nothing here is automatic. There is no Stripe webhook and no
  // checkout function in this repo: a payment lands in Stripe and that is all
  // that happens. Someone then finds the clinic in /dashboard/, sets
  // listing_tier by hand, and rebuilds the site. Without that field a payment
  // arrives with an email address and no way to tell which of ~14,500 clinics
  // just bought, and the buyer waits while we work it out.
  //
  // Do NOT put the outreach "Founding Featured — 4 months" link ($500 once,
  // scripts/outreach/README.md) in any slot below. It is a different offer at
  // a different price and belongs only in those emails; dropping it here would
  // sell four months for the price the page calls one.
  //
  // scripts/check-payment-links.mjs runs at build time and rejects a test-mode
  // link, a retired link, a non-Payment-Link URL, and the same link pasted in
  // two slots. It cannot tell whether a live link charges the right amount —
  // confirm that in Stripe when you create it.
  pricing: {
    enhanced: {
      // note renders as a badge under the price on /for-practices/. It must
      // describe what the Payment Link in `url` actually does: the 2026-09-18
      // link charges $50 immediately, so the '30-day free trial' that used to
      // sit here promised a trial checkout never gave. Re-add it only alongside
      // a trial configured on the link itself.
      price: '$50', period: '/mo', note: '', url: '',
      commit: { label: '4 months, paying for 3', price: '$135', per: '$33.75/mo', url: '' },
    },
    featured: {
      price: '$500', period: '/mo', note: '', url: '',
      commit: { label: '4 months, paying for 3', price: '$1,350', per: '$337.50/mo', url: '' },
    },
    // Brand sponsorship (data/sponsors.json) — sold, not self-serve. Prices
    // render on /advertise/; the sale closes by conversation and invoice.
    // LADDER RULE — national must never undercut the markets it contains.
    // National was $2,000/mo against $750 per state group, which put the
    // break-even at 2.67 groups: three metros cost $2,250 and the entire
    // country cost $2,000, so the pilot quarter we pitch (three metros,
    // $5,400 prepaid) was $600 MORE than every page in the United States.
    // Any buyer doing the arithmetic reads that as a rate card nobody
    // thought about. National is now 4x the group rate, so the ladder only
    // ever climbs: buy markets one at a time up to three, and at four it is
    // a wash, past four take national.
    //
    // Two things keep it honest when these numbers change:
    //   1. national.price >= 4 x price (and national.commit >= 4 x commit).
    //   2. Every tier takes the SAME prepaid discount (20% here), which is
    //      what makes the break-even identical monthly and prepaid. Discount
    //      one tier harder than another and the inversion comes back in the
    //      prepaid column only, where it is easy to miss.
    // scripts/check-rate-ladder.mjs asserts both at build time.
    sponsor: {
      // A state group is a metro's states sold together (VA + MD + DC).
      price: '$750', period: '/mo', term: 'Month to month, 30 days notice',
      commit: { label: '3 months prepaid', price: '$1,800', per: '$600/mo' },
      // One state on its own, for a business that only serves one.
      single: { price: '$400', period: '/mo', commit: { label: '3 months prepaid', price: '$1,000', per: '$333/mo' } },
      // Every state (states: [] in sponsors.json) — OTC brands, device makers,
      // trial recruiters, national firms. Category exclusivity is nationwide,
      // which is the expensive part: it locks out every competitor in the
      // category on all ~14,500 clinic pages for the term.
      national: { price: '$3,000', period: '/mo', commit: { label: '3 months prepaid', price: '$7,200', per: '$2,400/mo' } },
    },
  },
};
