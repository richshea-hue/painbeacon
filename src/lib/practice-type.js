// What a practice IS, and what it OFFERS — two different questions.
//
// Every record here declared a pain taxonomy in one of its fifteen NPPES
// slots. That is what put it in the directory; it is not what the practice
// primarily is, and it is not the whole of what the practice does. So this
// module answers two questions with two different fields, and keeping them
// apart is the point:
//
//   What it IS      primary_taxonomy_code — the single code the entity
//                   registered itself under. Decides whether it competes in
//                   the ranking of pain clinics (see isRankable) and what the
//                   card calls it.
//
//   What it OFFERS  all_taxonomy_codes — every slot, pipe-separated. Decides
//                   which discipline filters it answers to. A practice can be
//                   in several at once, because half of them are: of 12,487
//                   listable records, 4,762 declare codes spanning two
//                   disciplines and 2,628 span three or more.
//
// Reading the filter off every slot is what makes the chips findable. Under
// primary-code-only grouping, chiropractic was 117 records on 99 of 930 area
// pages and medical supply 144 on 116 — so on ~88% of pages neither chip
// existed at all. Off all slots they are 1,437 and 571 records, on 499 and
// 314 pages.
//
// Counts are a snapshot from production (taxonomy_audit.sql) for orientation;
// no code below depends on them.

// ---------------------------------------------------------------------------
// What it IS: rank eligibility, off the primary code only.
// ---------------------------------------------------------------------------

// Entities that supply, dispense, test or administer — they do not treat pain.
// 144 records by primary code, 118 of them carrying a Google rating, which is
// how a medical-supply company was collecting up to 45 of the 100 ranking
// points and placing above physicians. 251B is case management specifically:
// the rest of 251 (home health, community/behavioral health) delivers care.
const SUPPLY_PRIMARY_PREFIXES = ['332', '291', '246', '247', '374', '251B'];

const startsWithAny = (code, prefixes) => prefixes.some((p) => code.startsWith(p));

/**
 * Does this record compete in the ranking of pain clinics?
 *
 * Only supply-primary records are out. They stay listed — the NPI record is
 * real and the address may be exactly what someone is looking for — but take
 * no rank among clinics that treat pain. Filter a page to their discipline and
 * they are ranked against each other, which is the comparison that means
 * something for them.
 *
 * This reads the PRIMARY code on purpose. A pain practice that also dispenses
 * braces declares a supply code in a later slot; it is still a pain practice
 * and still ranks. Only a record whose own registration says "supplier" is
 * held out.
 */
export const isRankable = (c) =>
  !startsWithAny((c.primary_taxonomy_code || '').trim(), SUPPLY_PRIMARY_PREFIXES);

// ---------------------------------------------------------------------------
// What it OFFERS: the discipline filters, off every declared slot.
// ---------------------------------------------------------------------------

// The five pain codes, which every listed record carries at least one of.
export const PAIN_CODES = ['208VP0014X', '207LP2900X', '2081P2900X', '208VP0000X', '2084P2900X'];

const exact = (...codes) => {
  const set = new Set(codes);
  return (code) => set.has(code);
};
const prefix = (...prefixes) => (code) => startsWithAny(code, prefixes);
const either = (...tests) => (code) => tests.some((t) => t(code));

/**
 * The discipline list, in the order the chips are offered.
 *
 * Labels name the discipline a patient would search for, not the NUCC
 * description — someone looking for a chiropractor types "chiropractor", not
 * "Chiropractic Physician". Ordering runs most pain-specific first, then the
 * physician specialties a pain patient is commonly referred between, then the
 * non-physician disciplines, then the entities that supply rather than treat.
 *
 * These are facets, not a partition: a record can match several, and a record
 * can match none (it still shows under "All"). Adding a discipline here is the
 * whole job — the filter, the counts and the card attributes follow.
 */
export const DISCIPLINES = [
  // 208VP0014X. The credential the ranking already weighs most heavily.
  { key: 'interventional', label: 'Interventional pain', match: exact('208VP0014X') },
  // The pain subspecialties of anesthesiology, PM&R and psychiatry/neurology,
  // plus standalone Pain Medicine and a clinic registered as a pain center.
  { key: 'pain-medicine', label: 'Pain medicine',
    match: exact('208VP0000X', '207LP2900X', '2081P2900X', '2084P2900X', '261QP3300X') },
  { key: 'anesthesiology', label: 'Anesthesiology', match: prefix('207L') },
  { key: 'pmr', label: 'Physical medicine & rehab', match: prefix('2081') },
  // Neurology, plus neuromusculoskeletal medicine & OMM, which is where a lot
  // of manual-medicine pain care sits.
  { key: 'neurology', label: 'Neurology', match: prefix('2084N', '204D', '204R') },
  { key: 'neurosurgery', label: 'Neurosurgery', match: prefix('207T') },
  { key: 'orthopedic', label: 'Orthopedic surgery', match: prefix('207X') },
  { key: 'rheumatology', label: 'Rheumatology', match: prefix('207RR') },
  // Sports medicine is a subspecialty of several parents, so it is a code
  // suffix rather than a prefix — 2081S0010X, 207QS0010X, 207RS0010X and so
  // on — plus orthopedics' own sports code.
  { key: 'sports-medicine', label: 'Sports medicine',
    match: either((code) => code.endsWith('S0010X'), exact('207XX0005X', '204C00000X')) },
  // General internal medicine only: 207R also carries cardiology, GI,
  // nephrology and the rest, which are not primary care.
  { key: 'primary-care', label: 'Primary care',
    match: either(prefix('207Q', '208D'), exact('207R00000X')) },
  { key: 'behavioral', label: 'Psychiatry & behavioral health',
    match: prefix('2084P', '2084A', '2084B', '2084F', '101', '102', '103', '104', '106') },
  { key: 'chiropractic', label: 'Chiropractic', match: prefix('111') },
  { key: 'therapy', label: 'Physical & occupational therapy', match: prefix('225', '224Z') },
  { key: 'acupuncture', label: 'Acupuncture & naturopathic',
    match: exact('171100000X', '171000000X', '175F00000X') },
  { key: 'podiatry', label: 'Podiatry', match: prefix('213') },
  { key: 'nursing', label: 'Nurse practitioner, PA & nursing',
    match: prefix('363L', '363A', '364S', '367', '163W') },
  { key: 'imaging-lab', label: 'Imaging & laboratory', match: prefix('2085', '291', '246', '247', '293') },
  { key: 'supply', label: 'Medical supply & equipment', match: prefix('332', '333', '335') },
  // 171M is Case Manager/Care Coordinator, which sits in NUCC's "Other
  // Service" group rather than with the agencies, so it is named exactly.
  { key: 'home-health', label: 'Home health & case management',
    match: either(prefix('251', '253Z', '374'), exact('171M00000X')) },
];

/**
 * The disciplines a record answers to, as a bitmask over DISCIPLINES order.
 *
 * For /map, whose points file every visitor downloads: at directory scale a
 * list of discipline slugs per row would outweigh the data it describes, so
 * nineteen booleans travel as one small integer (bits 0..18). The map's
 * <select> carries the same array indices, because both sides are generated
 * from DISCIPLINES in the same build — reorder that list and they move
 * together.
 */
export function disciplineMask(c) {
  const codes = taxonomyCodes(c);
  if (!codes.length) return 0;
  let mask = 0;
  DISCIPLINES.forEach((d, i) => {
    if (codes.some((code) => d.match(code))) mask |= 1 << i;
  });
  return mask;
}

const LABELS = Object.fromEntries(DISCIPLINES.map((d) => [d.key, d.label]));
export const disciplineLabel = (key) => LABELS[key] || key;

/** Every taxonomy code a record declares, from all fifteen NPPES slots. */
export function taxonomyCodes(c) {
  return String(c.all_taxonomy_codes || c.primary_taxonomy_code || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The discipline keys a record answers to, in DISCIPLINES order.
 *
 * Read off every declared slot, so a pain practice that also registers as a
 * physical-therapy provider is findable under both — which is how someone
 * looking for physical therapy near them actually finds it.
 */
export function disciplinesOf(c) {
  const codes = taxonomyCodes(c);
  if (!codes.length) return [];
  return DISCIPLINES.filter((d) => codes.some((code) => d.match(code))).map((d) => d.key);
}

/** Space-separated, for the card's data attribute and token matching. */
export const disciplineAttr = (c) => disciplinesOf(c).join(' ');
