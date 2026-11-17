// node --test src/lib/listing-rules.test.mjs
// Non-registry listings: what may be published, what slug it gets, and which
// area page it lands on. The two real requests that prompted the feature are
// the fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { listingProblems, listingSlug, zoneClinicFor, websiteHrefOf, zip5 } from './listing-rules.js';

const katy = (over = {}) => ({
  slug: 'tx-katy-interventional-pain-management',
  name: 'Interventional Pain Management',
  practice_type: 'Pain management',
  address_1: '26077 Nelson Way',
  address_2: 'Suite 602',
  city: 'Katy',
  state: 'TX',
  postal_code: '77494',
  phone: '713-369-1969',
  website: 'https://interventionalpainmanagment.com',
  parent_npi: 1316348501,
  ...over,
});

test('a complete listing has no problems', () => {
  assert.deepEqual(listingProblems(katy()), []);
});

test('a listing with only a name, a city and a state is enough', () => {
  assert.deepEqual(listingProblems({ slug: 'ca-costa-mesa-blooming-chiropractic', name: 'Blooming Chiropractic', city: 'Costa Mesa', state: 'CA' }), []);
});

test('the pieces that make it a listing are required', () => {
  assert.match(listingProblems(katy({ name: '' })).join(), /name/);
  assert.match(listingProblems(katy({ city: '  ' })).join(), /city/);
  assert.match(listingProblems(katy({ state: 'Texas' })).join(), /state/);
  assert.match(listingProblems(katy({ state: 'tx' })).join(), /state/);
  assert.match(listingProblems(katy({ slug: 'TX Katy' })).join(), /slug/);
  assert.match(listingProblems(katy({ slug: 'tx--katy' })).join(), /slug/);
  assert.ok(listingProblems(null).length > 0);
});

test('a listing cannot call itself ranked, verified or board-certified', () => {
  for (const description of [
    'A verified pain clinic serving West Houston.',
    'Ranked the best in Katy.',
    'Top-rated care.',
    'The #1 pain practice in Texas.',
    'Board-certified physicians.',
  ]) {
    assert.match(listingProblems(katy({ description })).join(), /claims/, description);
  }
  assert.match(listingProblems(katy({ practice_type: 'Verified pain clinic' })).join(), /claims/);
  assert.deepEqual(listingProblems(katy({ description: 'Outpatient pain management. Open Monday and Thursday.' })), []);
});

test('a name is a name', () => {
  assert.match(listingProblems(katy({ name: 'Pain Relief www.example.com' })).join(), /name/);
  assert.match(listingProblems(katy({ name: 'x'.repeat(121) })).join(), /name/);
});

test('a website has to be a web address, and a bare domain is one', () => {
  assert.equal(websiteHrefOf('interventionalpainmanagment.com'), 'https://interventionalpainmanagment.com/');
  assert.equal(websiteHrefOf('http://example.com/katy'), 'http://example.com/katy');
  assert.equal(websiteHrefOf('javascript:alert(1)'), null);
  assert.equal(websiteHrefOf('not a site'), null);
  assert.equal(websiteHrefOf(''), null);
  assert.match(listingProblems(katy({ website: 'call the office' })).join(), /website/);
  assert.deepEqual(listingProblems(katy({ website: '' })), []);
});

test('coordinates come as a pair and have to be somewhere', () => {
  assert.match(listingProblems(katy({ latitude: 29.7 })).join(), /both/);
  assert.match(listingProblems(katy({ latitude: 0, longitude: 0 })).join(), /real location/);
  assert.match(listingProblems(katy({ latitude: 129, longitude: -95 })).join(), /real location/);
  assert.deepEqual(listingProblems(katy({ latitude: 29.74, longitude: -95.82 })), []);
});

test('slugs read like clinic slugs', () => {
  assert.equal(listingSlug({ state: 'TX', city: 'Katy', name: 'Interventional Pain Management' }), 'tx-katy-interventional-pain-management');
  assert.equal(listingSlug({ state: 'CA', city: 'Costa Mesa', name: 'Blooming Chiropractic' }), 'ca-costa-mesa-blooming-chiropractic');
  assert.equal(listingSlug({ state: 'TX', city: 'Houston', name: 'M&M Clinical Group, P.A.' }), 'tx-houston-m-and-m-clinical-group-p-a');
  assert.deepEqual(listingProblems({ slug: listingSlug({ state: 'NY', city: "Coeur d'Alene", name: 'Dr. O’Neil — Spine & Pain' }), name: 'x y', city: 'c', state: 'NY' }), []);
});

test('zip5 restores a dropped leading zero and trims ZIP+4', () => {
  assert.equal(zip5('77494-1234'), '77494');
  assert.equal(zip5('2906'), '02906');
  assert.equal(zip5(''), '');
});

// Area placement. Clinics as getClinics() shapes them: zoneSlug set by the sync.
const clinics = [
  { state: 'TX', city: 'KATY', postal_code: '774941234', zoneSlug: 'katy-tx' },
  { state: 'TX', city: 'KATY', postal_code: '77494', zoneSlug: 'katy-tx' },
  { state: 'TX', city: 'KATY', postal_code: '77450', zoneSlug: 'houston-west-tx' },
  { state: 'TX', city: 'HOUSTON', postal_code: '77025', zoneSlug: 'houston-tx' },
  { state: 'TX', city: 'RICHMOND', postal_code: '77407', zoneSlug: 'sugar-land-tx' },
  { state: 'LA', city: 'KATY', postal_code: '77494', zoneSlug: 'wrong-state-la' },
  { state: 'TX', city: 'AUSTIN', postal_code: '78701', zoneSlug: null },
];

test('a listing joins the area of the registry clinics in its ZIP', () => {
  assert.equal(zoneClinicFor(katy(), clinics).zoneSlug, 'katy-tx');
});

test('with no clinic in the ZIP it falls back to the city, then the 3-digit area', () => {
  assert.equal(zoneClinicFor(katy({ postal_code: '77493' }), clinics).zoneSlug, 'katy-tx'); // city: 2 of 3 Katy clinics
  assert.equal(zoneClinicFor(katy({ city: 'Fulshear', postal_code: '77441' }), clinics).zoneSlug, 'katy-tx'); // 774xx
  assert.equal(zoneClinicFor(katy({ city: 'Bellaire', postal_code: '77099' }), clinics).zoneSlug, 'houston-tx'); // 770xx
  assert.equal(zoneClinicFor(katy({ city: 'El Paso', postal_code: '79901' }), clinics), null); // no ZIP, city or area in common
});

test('it never borrows an area from another state, or from a clinic with no area', () => {
  assert.equal(zoneClinicFor(katy({ state: 'LA' }), clinics).zoneSlug, 'wrong-state-la');
  assert.equal(zoneClinicFor(katy({ state: 'OK' }), clinics), null);
  assert.equal(zoneClinicFor(katy({ city: 'Austin', postal_code: '78701' }), clinics), null);
});
