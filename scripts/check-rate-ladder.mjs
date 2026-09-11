// PainBeacon — the sponsor rate card must only ever climb.
//
// National sponsorship contains every market a state-group sponsorship can
// contain, so it must cost more than any sane number of those groups. It did
// not: $2,000/mo national against $750/mo per group put the break-even at 2.67
// groups, which meant three metros ($2,250) cost more than the entire United
// States ($2,000) — and the three-metro pilot quarter we pitched ($5,400) cost
// $600 more than the national quarter ($4,800). Nobody had to be clever to
// find that; any buyer pricing three markets would run into it.
//
// This runs first in `npm run build` so the failure is a red build, not a
// question from someone reading /advertise/ with a calculator.
//
// The rules, in the order they are checked:
//   1. single < group < national, month to month.
//   2. National costs at least MIN_GROUPS state groups, monthly AND prepaid.
//   3. The group and national tiers take the same prepaid discount, so the
//      break-even is identical in both columns. (Discount one tier harder and
//      the inversion returns in the prepaid column only, where it hides.)
//   4. Every `per` string matches its own prepaid total divided by 3 months.
import { SITE } from '../src/lib/site.js';

// Below this, a buyer is better off naming markets one at a time; at or above
// it, national is the honest recommendation. Four means three metros can never
// beat the country, which is the case that bit us.
const MIN_GROUPS = 4;
const MONTHS = 3; // every commit on the card is a three-month prepay
const CENTS = 0.005;

// Reads the first dollar figure out of a display string: '$750', '$1,800',
// '$2,400/mo' all parse. Anything without a number is a typo worth stopping on.
const money = (s, where) => {
  const m = String(s).match(/([\d,]+(?:\.\d+)?)/);
  const n = m ? Number(m[1].replace(/,/g, '')) : NaN;
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${where}: cannot read a price from ${JSON.stringify(s)}`);
  return n;
};

const sp = SITE.pricing.sponsor;
const tier = (name, t) => ({
  name,
  monthly: money(t.price, `sponsor.${name}.price`),
  prepaid: money(t.commit.price, `sponsor.${name}.commit.price`),
  per: money(t.commit.per, `sponsor.${name}.commit.per`),
});

const single = tier('single', sp.single);
const group = tier('group', sp);
const national = tier('national', sp.national);

const errors = [];
const fail = (msg) => errors.push(msg);
const usd = (n) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// 1. The tiers ascend.
if (!(single.monthly < group.monthly)) fail(`single (${usd(single.monthly)}/mo) must cost less than a state group (${usd(group.monthly)}/mo).`);
if (!(group.monthly < national.monthly)) fail(`a state group (${usd(group.monthly)}/mo) must cost less than national (${usd(national.monthly)}/mo).`);

// 2. National is worth at least MIN_GROUPS groups, in both columns.
for (const col of ['monthly', 'prepaid']) {
  const floor = group[col] * MIN_GROUPS;
  if (national[col] + CENTS < floor) {
    const n = (national[col] / group[col]).toFixed(2);
    fail(
      `national ${col} (${usd(national[col])}) is only ${n} state groups. ` +
        `It must be at least ${MIN_GROUPS} (${usd(floor)}), or ${Math.ceil(national[col] / group[col])} metros ` +
        `bought one at a time cost more than every page in the country.`,
    );
  }
}

// 3. Group and national take the same prepaid discount, so the break-even
//    lands in the same place whether a buyer pays monthly or prepays.
const discount = (t) => 1 - t.prepaid / (t.monthly * MONTHS);
const dGroup = discount(group);
const dNational = discount(national);
if (Math.abs(dGroup - dNational) > 0.005) {
  fail(
    `the state group prepays at ${(dGroup * 100).toFixed(1)}% off and national at ${(dNational * 100).toFixed(1)}% off. ` +
      `Keep them equal, or the monthly and prepaid break-evens drift apart ` +
      `(${(national.monthly / group.monthly).toFixed(2)} groups monthly vs ${(national.prepaid / group.prepaid).toFixed(2)} prepaid).`,
  );
}

// 4. Each displayed per-month figure matches its own prepaid total.
for (const t of [single, group, national]) {
  const expected = t.prepaid / MONTHS;
  if (Math.abs(t.per - expected) > 1) {
    fail(`sponsor.${t.name}.commit.per says ${usd(t.per)}/mo but ${usd(t.prepaid)} over ${MONTHS} months is ${usd(expected)}/mo.`);
  }
}

if (errors.length) {
  console.error('\nRate card ladder is broken:\n');
  for (const e of errors) console.error(`  • ${e}`);
  console.error('\nFix src/lib/site.js → pricing.sponsor. See the LADDER RULE comment there.\n');
  process.exit(1);
}

const breakEven = national.monthly / group.monthly;
console.log(
  `rate ladder ok — single ${usd(single.monthly)} < group ${usd(group.monthly)} < national ${usd(national.monthly)}; ` +
    `national = ${breakEven.toFixed(2)} groups (floor ${MIN_GROUPS}), ${(dGroup * 100).toFixed(0)}% prepaid discount on both.`,
);
