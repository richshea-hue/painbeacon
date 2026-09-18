// PainBeacon — a paid-tier button must charge the right money, or not exist.
//
// The buttons on /for-practices/ are Stripe Payment Links pasted into
// SITE.pricing.*.url. A button goes live the moment its url is non-empty, and
// nothing in the page can see what the link actually charges — the URL is
// opaque, the dollar figure beside it is display-only text. So the ways this
// breaks are all silent:
//
//   • a test-mode link ships, and every "purchase" collects nothing;
//   • a retired link ships, and the site quietly charges the 2025 prices
//     ($29 and $299) while the page advertises $50 and $500;
//   • the monthly link is pasted into the prepaid slot, so "3 months prepaid"
//     bills $50 once instead of $135, or $500 instead of $1,350;
//   • someone pastes a Stripe dashboard URL, and the button 404s for a buyer
//     who is not logged into our Stripe account.
//
// None of those raise an error anywhere. A customer finds them, and by then
// they have been charged the wrong amount or not at all. This runs in
// `npm run build` so they are caught before the page ships.
//
// What it cannot check: whether a live, correctly-slotted link charges the
// amount printed next to it. Only the Stripe dashboard knows that. Verify it
// there when you create the link, and again if you ever change a price.
import { SITE } from '../src/lib/site.js';

// Payment Links are always on this host. Test-mode links carry a /test_ path.
const LINK_HOST = 'https://buy.stripe.com/';
const TEST_MARKER = '/test_';

// Months of service a prepaid listing link delivers. It bills three months'
// list price and runs four: the bonus month is a standing offer, honored by
// hand when the listing's end date is set, because a one-time charge creates
// no subscription and Stripe knows nothing about it. The `per` figure shown
// beside each prepaid price is therefore the total spread over FOUR months.
// Change the offer and change this number with it.
const PREPAID_MONTHS = 4;

// Links retired in September 2026. They still resolve and still charge the old
// prices, which is exactly what makes them dangerous to have lying around in a
// notes file or an old commit. Never re-paste these.
const RETIRED = [
  { id: '5kQ4gBgGl97W', was: '$29/mo Enhanced' },
  { id: '3cI5kF1Lresg', was: '$299/mo Featured' },
];

// Reads the first dollar figure out of a display string: '$135', '$33.75/mo'.
const money = (v, where) => {
  const m = String(v).match(/([\d,]+(?:\.\d+)?)/);
  const n = m ? Number(m[1].replace(/,/g, '')) : NaN;
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${where}: cannot read a price from ${JSON.stringify(v)}`);
  return n;
};
const usd = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const slots = [];
for (const tier of ['enhanced', 'featured']) {
  const t = SITE.pricing[tier];
  slots.push({ name: `pricing.${tier}.url`, url: t.url, charges: `${t.price}${t.period}` });
  slots.push({ name: `pricing.${tier}.commit.url`, url: t.commit.url, charges: `${t.commit.price} once` });
}

const errors = [];
const live = slots.filter((s) => s.url && s.url.trim());

for (const s of live) {
  const url = s.url.trim();

  if (!url.startsWith(LINK_HOST)) {
    errors.push(`${s.name} is not a Stripe Payment Link. It must start with ${LINK_HOST} — a dashboard or checkout-session URL will not work for a buyer.`);
    continue;
  }
  if (url.includes(TEST_MARKER)) {
    errors.push(`${s.name} is a TEST-mode link. It would take no money at all. Create the link again with the Stripe dashboard in live mode.`);
  }
  for (const r of RETIRED) {
    if (url.includes(r.id)) {
      errors.push(`${s.name} is the retired ${r.was} link. The page beside it advertises ${s.charges}, so this would charge the wrong amount. Archive it in Stripe and make a new link.`);
    }
  }
}

// The same link in two slots means one of them bills the wrong amount — most
// often the monthly link pasted into the prepaid row.
const seen = new Map();
for (const s of live) {
  const url = s.url.trim();
  if (seen.has(url)) {
    errors.push(`${s.name} and ${seen.get(url)} are the same link, so they cannot both charge what the page says (${s.charges} vs the other row). Each price needs its own Payment Link.`);
  } else seen.set(url, s.name);
}

// The advertised per-month figure has to be the prepaid total over the months
// of service actually delivered. Nothing else checks this: the page prints
// whatever string is in `per`, so a stale figure just quietly misprices the
// offer — which is exactly what happens when the bonus month is added and the
// old three-month division is left behind.
for (const tier of ['enhanced', 'featured']) {
  const c = SITE.pricing[tier].commit;
  const total = money(c.price, `pricing.${tier}.commit.price`);
  const per = money(c.per, `pricing.${tier}.commit.per`);
  const expected = total / PREPAID_MONTHS;
  if (Math.abs(per - expected) > 0.01) {
    errors.push(
      `pricing.${tier}.commit.per says ${usd(per)}/mo, but ${usd(total)} over ${PREPAID_MONTHS} months of service is ${usd(expected)}/mo. ` +
        `Either the figure is stale or the months of service changed.`,
    );
  }
}

if (errors.length) {
  console.error('\nStripe payment links are wrong:\n');
  for (const e of errors) console.error(`  • ${e}`);
  console.error('\nFix src/lib/site.js → pricing. See the Stripe comment above it.\n');
  process.exit(1);
}

const off = slots.length - live.length;
console.log(
  live.length === 0
    ? `payment links: none set — all ${slots.length} paid buttons fall back to the inquiry form (#talk). No one can buy yet.`
    : `payment links ok — ${live.length} live, ${off} still falling back to the inquiry form.`,
);
