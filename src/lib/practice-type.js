// What kind of practice is this, and should it compete in the ranking?
//
// Every record here declared a pain taxonomy in one of its fifteen NPPES
// slots — that is what put it in the directory. It is NOT what the practice
// primarily is. Grouping therefore reads primary_taxonomy_code, the one field
// that says what the entity registered itself as.
//
// Counts below are from taxonomy_audit.sql against production, 12,487 listable
// clinics, and are a snapshot for orientation rather than anything the code
// depends on.

const GROUP_BY_PRIMARY_CODE = {
  '208VP0014X': 'interventional', // 2,726
  '207LP2900X': 'anesthesiology', // 3,218
  '2081P2900X': 'pmr',            // 1,718
  '208VP0000X': 'pain',           // 1,838
  '2084P2900X': 'psych-neuro',    //   148
};

// Entities that supply, dispense, test or administer — they do not treat pain.
// 144 records, 118 of them carrying a Google rating, which is how a
// medical-supply company was collecting up to 45 of the 100 ranking points and
// placing above physicians. 251B is case management specifically: the rest of
// 251 (home health, community/behavioral health) does deliver care.
const SUPPLY_PREFIXES = ['332', '291', '246', '247', '374', '251B'];

// Clinicians who treat pain but are not pain physicians: chiropractic, physical
// and occupational therapy, acupuncture, naprapathy, counseling, psychology,
// dentistry, podiatry. 117 records. These still rank — they treat patients —
// and the card names what they are.
const THERAPY_PREFIXES = ['111', '225', '171', '172', '101', '103', '122', '213'];

const startsWithAny = (code, prefixes) => prefixes.some((p) => code.startsWith(p));

/** The practice group key for a clinic. Always returns one of PRACTICE_GROUPS. */
export function practiceGroup(c) {
  const code = (c.primary_taxonomy_code || '').trim();
  if (!code) return 'physician'; // a missing code is a data gap, not a verdict
  if (GROUP_BY_PRIMARY_CODE[code]) return GROUP_BY_PRIMARY_CODE[code];
  if (startsWithAny(code, SUPPLY_PREFIXES)) return 'supply';
  if (startsWithAny(code, THERAPY_PREFIXES)) return 'therapy';
  return 'physician';
}

// Filter-chip order. Labels are patient-facing, so they say the training rather
// than the taxonomy: someone choosing a pain doctor cares whether the physician
// came up through anesthesiology or physiatry.
export const PRACTICE_GROUPS = [
  { key: 'interventional', label: 'Interventional pain' },
  { key: 'anesthesiology', label: 'Anesthesiology' },
  { key: 'pmr', label: 'Physical medicine & rehab' },
  { key: 'pain', label: 'Pain medicine' },
  { key: 'psych-neuro', label: 'Psychiatry & neurology' },
  { key: 'physician', label: 'Other physician & clinic' },
  { key: 'therapy', label: 'Therapy & chiropractic' },
  { key: 'supply', label: 'Medical supply & services' },
];

const LABELS = Object.fromEntries(PRACTICE_GROUPS.map((g) => [g.key, g.label]));
export const practiceGroupLabel = (key) => LABELS[key] || key;

/**
 * Does this record compete in the ranking of pain clinics?
 *
 * Only the supply group is out. It is listed — the NPI record is real and the
 * address may be exactly what someone is looking for — but it does not take a
 * rank among clinics that treat pain. Filter the page to that group and its
 * members are ranked against each other, which is the comparison that makes
 * sense for them.
 */
export const isRankable = (c) => practiceGroup(c) !== 'supply';
