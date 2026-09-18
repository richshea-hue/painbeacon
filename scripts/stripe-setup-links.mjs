// PainBeacon — create the four paid-listing Payment Links in Stripe.
//
//   node --env-file=.env scripts/stripe-setup-links.mjs             # dry run
//   node --env-file=.env scripts/stripe-setup-links.mjs --apply     # create them
//   node --env-file=.env scripts/stripe-setup-links.mjs --apply --founding
//
// Why a script rather than clicking: four links, each needing the same two
// required custom fields, the same confirmation message and the same metadata.
// Doing that by hand four times is where `tier=Enhanced` on one link and
// `enhanced` on another comes from, and a mismatch like that only shows up
// months later when a filter silently returns half the customers.
//
// The amounts are READ FROM src/lib/site.js, never typed here. That is the
// point: /for-practices/ prints the price from the same object, so a link this
// script creates cannot charge something the page does not advertise. Change a
// price in site.js, re-run, and the script offers to create the new link.
//
// SAFE TO RE-RUN. Every object it creates is tagged with metadata.pb_key, and
// it looks for that tag before creating anything. A second run finds what the
// first made and reports it rather than making duplicates at the same price.
//
// WHAT IT DOES NOT DO — these are dashboard settings, once each, not per link:
//   • Terms of service acceptance. Set the ToS URL to painbeacon.com/terms/ in
//     Stripe → Settings → Public details, then tick "Require customers to
//     accept your terms of service" on each link.
//   • Statement descriptor. Set it to PAINBEACON in Stripe → Settings →
//     Public details so a subscription charge is recognizable on a card
//     statement; an unrecognized descriptor is the usual cause of chargebacks.
//   • Payment methods. Turn off Klarna and other buy-now-pay-later options if
//     you do not want them on a B2B listing subscription.
//
// AFTER IT RUNS: paste the printed URLs into src/lib/site.js and run
// `npm run lint:links`. Fulfillment stays manual — a payment lands in Stripe
// and nothing else happens until someone sets listing_tier in /dashboard/.
// That is why every link asks for the practice name and NPI.
import { SITE } from '../src/lib/site.js';

const API = 'https://api.stripe.com/v1';
const KEY = process.env.STRIPE_SECRET_KEY;
const APPLY = process.argv.includes('--apply');
const WANT_FOUNDING = process.argv.includes('--founding');

if (!KEY) {
  console.error(`
STRIPE_SECRET_KEY is not set.

Add it to .env (which is gitignored) and re-run with --env-file=.env.

Prefer a RESTRICTED key over the account secret key: Stripe → Developers →
API keys → Create restricted key, with WRITE on Products, Prices and Payment
Links and nothing else. That key cannot issue refunds or read customers, so
it is a far smaller thing to have sitting in a file.
`);
  process.exit(1);
}

const LIVE = KEY.startsWith('sk_live_') || KEY.startsWith('rk_live_');
const MODE = LIVE ? 'LIVE' : 'TEST';

// ---------------------------------------------------------------------------
// Stripe's API is form-encoded, including nested objects and arrays, so
// { custom_fields: [{ label: { type: 'custom' } }] } has to become
// custom_fields[0][label][type]=custom. No SDK, no dependency to install.
// ---------------------------------------------------------------------------
const form = (obj, prefix = '', out = []) => {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item, `${key}[${i}]`, out) : out.push([`${key}[${i}]`, String(item)])));
    else if (typeof v === 'object') form(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
};

const call = async (method, path, body, idempotencyKey) => {
  const headers = { Authorization: `Bearer ${KEY}` };
  let url = `${API}${path}`;
  let payload;
  if (body && method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form(body)).toString();
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  } else if (body) {
    url += `?${new URLSearchParams(body).toString()}`;
  }
  const res = await fetch(url, { method, headers, body: payload });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = json?.error?.message || `HTTP ${res.status}`;
    throw new Error(`${method} ${path} failed: ${m}`);
  }
  return json;
};

// Find an object we previously created, by the tag we stamp on everything.
const findTagged = async (path, pbKey, extra = {}) => {
  const { data = [] } = await call('GET', path, { limit: '100', ...extra });
  return data.find((o) => o?.metadata?.pb_key === pbKey && o.active !== false) || null;
};

const cents = (display) => {
  const m = String(display).match(/([\d,]+(?:\.\d+)?)/);
  if (!m) throw new Error(`cannot read an amount from ${JSON.stringify(display)}`);
  return Math.round(Number(m[1].replace(/,/g, '')) * 100);
};
const usd = (c) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------
// The plan, derived from site.js so it cannot drift from what the page prints.
// ---------------------------------------------------------------------------
const months = SITE.pricing.launchOffer.active ? 4 : 3;
const confirmMonthly =
  'Thank you. We verify that you represent the practice before your upgraded listing goes live, usually within one business day. ' +
  'If we cannot verify it, we refund you in full. Questions: contactus@painbeacon.com';
const confirmPrepaid =
  `Thank you. Your prepaid term runs ${months} months from the day your listing goes live, not from today. ` +
  'We verify that you represent the practice first, usually within one business day, and refund you in full if we cannot. ' +
  'Questions: contactus@painbeacon.com';

const tierPlan = (tier, productName, blurb) => {
  const t = SITE.pricing[tier];
  return [
    {
      pbKey: `${tier}_monthly`,
      slot: `pricing.${tier}.url`,
      productKey: tier,
      productName,
      blurb,
      amount: cents(t.price),
      recurring: true,
      nickname: `${productName} — monthly`,
      metadata: { tier, term: 'monthly' },
      confirmation: confirmMonthly,
      buys: '1 month, renewing',
    },
    {
      pbKey: `${tier}_prepaid`,
      slot: `pricing.${tier}.commit.url`,
      productKey: tier,
      productName,
      blurb,
      amount: cents(t.commit.price),
      recurring: false,
      nickname: `${productName} — ${months} months prepaid`,
      metadata: { tier, term: 'prepaid3' },
      confirmation: confirmPrepaid,
      buys: `${months} months of service`,
    },
  ];
};

const PLAN = [
  ...tierPlan(
    'enhanced',
    'PainBeacon Enhanced Listing',
    'Enhanced profile on PainBeacon: photos, full services, conditions treated, accepted insurance, provider bios, and a booking link.',
  ),
  ...tierPlan(
    'featured',
    'PainBeacon Featured Listing',
    'Featured listing on PainBeacon: the top slot on every area page you serve, the sponsored rail on the clinic map, and a Featured badge. Labeled as advertising; it never changes rankings.',
  ),
];

// The outreach offer. Deliberately NOT part of PLAN and never pasted into
// site.js: it sells four months for $500, which is what the page calls one
// month of Featured. It exists only inside outreach emails.
const FOUNDING = {
  pbKey: 'founding_featured',
  slot: null,
  productKey: 'founding',
  productName: 'PainBeacon Founding Featured — 4 months',
  blurb: 'Founding Featured: four months of a Featured listing in one market, one practice per market. Labeled as advertising; it never changes rankings.',
  amount: 50000,
  recurring: false,
  nickname: 'Founding Featured — 4 months',
  metadata: { tier: 'featured', term: 'founding4' },
  confirmation:
    'Thank you. Your founding Featured term runs four months from the day your listing goes live. ' +
    'We verify that you represent the practice first, usually within one business day, and refund you in full if we cannot. ' +
    'Questions: contactus@painbeacon.com',
  buys: '4 months of service (outreach offer — do NOT put in site.js)',
};

const items = WANT_FOUNDING ? [...PLAN, FOUNDING] : PLAN;

// ---------------------------------------------------------------------------
console.log(`\nPainBeacon — Stripe payment links  [${MODE} MODE]\n`);
if (!APPLY) console.log('DRY RUN. Nothing will be created. Re-run with --apply to create these.\n');
else if (LIVE) console.log('Creating LIVE objects that can take real money.\n');

for (const it of items) {
  console.log(`  ${it.pbKey.padEnd(20)} ${usd(it.amount).padStart(10)} ${it.recurring ? 'per month' : 'one-time  '}  → ${it.buys}`);
}
console.log('');

if (!APPLY) {
  console.log('Each link will be created with:');
  console.log('  • required custom fields: Practice name, NPI');
  console.log('  • billing name, business name and address collected');
  console.log('  • promotion codes off (no codes exist yet)');
  console.log('  • a confirmation message explaining that verification comes first');
  console.log('  • metadata tier/term, so payments can be reconciled later\n');
  process.exit(0);
}

const results = [];
const productCache = new Map();

const ensureProduct = async (it) => {
  if (productCache.has(it.productKey)) return productCache.get(it.productKey);
  let p = await findTagged('/products', `product_${it.productKey}`);
  if (p) console.log(`  product   reuse   ${p.id}  ${p.name}`);
  else {
    p = await call('POST', '/products', {
      name: it.productName,
      description: it.blurb,
      metadata: { pb_key: `product_${it.productKey}` },
    }, `pb-product-${it.productKey}`);
    console.log(`  product   create  ${p.id}  ${p.name}`);
  }
  productCache.set(it.productKey, p);
  return p;
};

const ensurePrice = async (it, product) => {
  let pr = await findTagged('/prices', `price_${it.pbKey}`, { product: product.id });
  if (pr) {
    if (pr.unit_amount !== it.amount) {
      throw new Error(
        `price ${pr.id} is tagged price_${it.pbKey} but charges ${usd(pr.unit_amount)}, and site.js now says ${usd(it.amount)}. ` +
          `A Stripe price is immutable, so archive that price and its link in the dashboard, then re-run.`,
      );
    }
    console.log(`  price     reuse   ${pr.id}  ${usd(pr.unit_amount)}`);
    return pr;
  }
  pr = await call('POST', '/prices', {
    product: product.id,
    currency: 'usd',
    unit_amount: it.amount,
    nickname: it.nickname,
    ...(it.recurring ? { recurring: { interval: 'month' } } : {}),
    metadata: { pb_key: `price_${it.pbKey}`, ...it.metadata },
  }, `pb-price-${it.pbKey}`);
  console.log(`  price     create  ${pr.id}  ${usd(pr.unit_amount)}${it.recurring ? '/mo' : ''}`);
  return pr;
};

const ensureLink = async (it, price) => {
  let link = await findTagged('/payment_links', `link_${it.pbKey}`);
  if (link) {
    console.log(`  link      reuse   ${link.url}`);
    return link;
  }
  link = await call('POST', '/payment_links', {
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { pb_key: `link_${it.pbKey}`, ...it.metadata },
    // The two fields that make a payment identifiable. Keys are alphanumeric
    // because Stripe requires that; the labels are what a buyer reads.
    custom_fields: [
      { key: 'practicename', type: 'text', label: { type: 'custom', custom: 'Practice name' }, optional: false },
      { key: 'npi', type: 'text', label: { type: 'custom', custom: 'NPI (10 digits)' }, optional: false },
    ],
    billing_address_collection: 'required',
    // No promo codes exist, and an empty "Add promotion code" box invites a
    // buyer to go hunting for a discount rather than paying.
    allow_promotion_codes: false,
    after_completion: { type: 'hosted_confirmation', hosted_confirmation: { custom_message: it.confirmation } },
    ...(it.recurring
      ? { subscription_data: { metadata: it.metadata } }
      : // Saving the card on a prepaid term means the renewal conversation does
        // not start with asking for card details again.
        { payment_intent_data: { setup_future_usage: 'off_session', metadata: it.metadata } }),
  }, `pb-link-${it.pbKey}`);
  console.log(`  link      create  ${link.url}`);
  return link;
};

for (const it of items) {
  console.log(`${it.pbKey}`);
  try {
    const product = await ensureProduct(it);
    const price = await ensurePrice(it, product);
    const link = await ensureLink(it, price);
    results.push({ ...it, url: link.url });
  } catch (err) {
    console.error(`  FAILED: ${err.message}\n`);
    results.push({ ...it, error: err.message });
  }
  console.log('');
}

const ok = results.filter((r) => r.url && r.slot);
if (ok.length) {
  console.log('─'.repeat(72));
  console.log('Paste into src/lib/site.js, then run  npm run lint:links\n');
  for (const r of ok) console.log(`  ${r.slot.padEnd(28)} url: '${r.url}',`);
  console.log('');
}
const founding = results.find((r) => r.pbKey === 'founding_featured' && r.url);
if (founding) console.log(`Outreach only — do NOT put this in site.js:\n  ${founding.url}\n`);

const failed = results.filter((r) => r.error);
if (failed.length) {
  console.error(`${failed.length} of ${results.length} failed. Nothing partial was left behind that a re-run will duplicate — every object is tagged, so running again picks up where this stopped.`);
  process.exit(1);
}

console.log('Still to do by hand in the Stripe dashboard:');
console.log('  1. Settings → Public details: statement descriptor PAINBEACON, terms URL painbeacon.com/terms/');
console.log('  2. Tick "Require customers to accept your terms of service" on each link');
console.log('  3. Archive the 2025 links (5kQ4gBgGl97W at $29, 3cI5kF1Lresg at $299)');
console.log('  4. Turn off Klarna and other pay-later methods if you do not want them\n');
