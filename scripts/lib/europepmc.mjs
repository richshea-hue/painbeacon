// Finding studies we are allowed to feature, and deciding which are worth it.
//
// Europe PMC is the source because it is the one index that exposes a paper's
// LICENSE as a searchable field and serves the full-text XML where the license
// is stated in the publisher's own words. PubMed has the same papers and
// neither of those.
//
// Everything here is a pure function over data already fetched, so the
// judgments — what counts as on-topic, what gets excluded, what a US author
// looks like in an affiliation string — are pinned by europepmc.test.mjs rather
// than rediscovered by a bad week's candidate list. The network calls live in
// scripts/find-research-candidates.mjs and scripts/scaffold-research.mjs.

export const API = 'https://www.ebi.ac.uk/europepmc/webservices/rest';

// Title terms, not abstract terms. An abstract search for "pain" returns every
// surgical trial that measured it as a secondary outcome; a paper with one of
// these in its TITLE is about pain.
const TITLE_TERMS = [
  'chronic pain', 'pain management', 'pain medicine', 'low back pain', 'back pain',
  'neck pain', 'neuropathic pain', 'neuropathy', 'sciatica', 'radiculopathy',
  'fibromyalgia', 'complex regional pain syndrome', 'spinal cord stimulation',
  'spinal cord stimulator', 'epidural steroid', 'radiofrequency ablation',
  'nerve block', 'neuromodulation', 'opioid', 'pain clinic',
];

/** The Europe PMC query for reusable pain papers first published in [from, to] (YYYY-MM-DD). */
export function buildQuery({ from, to }) {
  const titles = TITLE_TERMS.map((t) => `TITLE:"${t}"`).join(' OR ');
  return (
    `(${titles}) AND (LICENSE:"cc by" OR LICENSE:"cc0") AND HAS_ABSTRACT:y AND LANG:eng ` +
    `AND SRC:MED AND FIRST_PDATE:[${from} TO ${to}]`
  );
}

// ---------------------------------------------------------------- text -------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return e.toLowerCase() in ENTITIES ? ENTITIES[e.toLowerCase()] : m;
  });
}

/**
 * Europe PMC's abstractText → the abstract as plain paragraphs.
 *
 * A structured abstract arrives as <h4>Background</h4>text<h4>Methods</h4>text.
 * Each section becomes its own paragraph led by its label ("Background: …"),
 * which is how PubMed prints the same abstract. Inline tags are dropped and
 * their text kept. No word is added, removed or respelled.
 *
 * `lossy` is true when the abstract carried <sup> or <sub>: flattening those
 * turns "10<sup>-3</sup>" into "10-3", which is a different number. The
 * scaffolder stops and says so instead of writing a quietly wrong quotation.
 */
export function cleanAbstract(html) {
  const src = String(html || '');
  const lossy = /<su[bp]\b/i.test(src);
  const text = (s) => decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

  const parts = src.split(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
  // split() with one capture group yields [before, label, body, label, body, …]
  const paragraphs = [];
  const lead = text(parts[0]);
  if (lead) paragraphs.push(lead);
  for (let i = 1; i < parts.length; i += 2) {
    const label = text(parts[i]).replace(/[:.\s]+$/, '');
    const body = text(parts[i + 1] || '');
    if (body) paragraphs.push(label ? `${label}: ${body}` : body);
  }
  return { text: paragraphs.join('\n\n'), lossy };
}

// ----------------------------------------------------------- the record ------

const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** A Europe PMC "core" result, flattened to the fields the pipeline uses. */
export function toCandidate(r) {
  const authors = arr(r?.authorList?.author)
    .map((a) => ({
      name: [a.firstName, a.lastName].filter(Boolean).join(' ') || a.fullName || a.collectiveName || '',
      lastName: a.lastName || '',
      initials: a.initials || '',
      orcid: a.authorId?.type === 'ORCID' ? a.authorId.value : null,
      affiliations: arr(a.authorAffiliationDetailsList?.authorAffiliation)
        .map((x) => x.affiliation)
        .filter(Boolean),
    }))
    .filter((a) => a.name);

  return {
    pmid: r.pmid || null,
    pmcid: r.pmcid || null,
    doi: r.doi || null,
    title: decodeEntities(String(r.title || '').replace(/<[^>]+>/g, '')).trim(),
    journal: r.journalInfo?.journal?.title || '',
    year: Number(r.pubYear || r.journalInfo?.yearOfPublication) || null,
    published: r.firstPublicationDate || null,
    authors,
    abstractHtml: r.abstractText || '',
    pubTypes: arr(r.pubTypeList?.pubType),
    keywords: arr(r.keywordList?.keyword),
    license: String(r.license || '').toLowerCase(),
    language: r.language || '',
  };
}

// --------------------------------------------------------------- scoring -----

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
  'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia',
  'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];
// "Georgia" is deliberately absent: Tbilisi is in Georgia too. A Georgia (US)
// affiliation still matches on "USA" or on its ", GA 30322" form.
const US_NAMED = /\b(?:USA|U\.S\.A\.?|United States(?: of America)?)\b/;
const US_ZIP = /,\s*[A-Z]{2}\s+\d{5}\b/;
const US_STATE = new RegExp(`,\\s*(?:${US_STATES.join('|')})\\b`);

export const isUsAffiliation = (s) => {
  const t = String(s || '');
  return US_NAMED.test(t) || US_ZIP.test(t) || US_STATE.test(t);
};

// Named because a study of a device, written by people employed by its maker,
// is the single most important thing a patient-facing summary could leave out.
// "Pharmaceuticals", plural: the singular is every university's Department of
// Pharmaceutical Sciences, which the first live run flagged as a company.
const INDUSTRY =
  /\b(?:Inc\.?|LLC|Ltd\.?|Corp(?:oration)?\.?|GmbH|Pharmaceuticals|Pharma|Medtronic|Boston Scientific|Abbott|Nevro|Saluda|Stryker|Pfizer|Vertex|Lilly|AbbVie)\b/;

/** The largest study size the abstract states, or null. */
export function sampleSize(text) {
  let best = null;
  const t = String(text || '');
  const patterns = [
    /\b[nN]\s*=\s*(\d[\d,]*)/g,
    /\b(\d[\d,]*)\s+(?:adult|adults|patients|participants|individuals|people|veterans|respondents|subjects|beneficiaries|persons)\b/g,
  ];
  for (const re of patterns) {
    for (const m of t.matchAll(re)) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0 && (best == null || n > best)) best = n;
    }
  }
  return best;
}

const EXCLUDED_TYPES = [
  'Case Reports', 'Editorial', 'Letter', 'Comment', 'Published Erratum', 'Retraction of Publication',
  'Retracted Publication', 'Preprint', 'Clinical Trial Protocol', 'News', 'Biography',
];

// A paper is about pain if its TITLE says so. The search terms alone do not
// settle it: "neuromodulation" brought in a review of depression treatments and
// "opioid" brought in addiction-medicine papers, both of which outscored real
// pain studies on the first live run. An abstract that keeps returning to pain
// counts too, for the opioid-prescribing paper whose title never uses the word.
const PAIN_TITLE =
  /\b(?:pain|painful|neuropath\w+|sciatica|radiculopathy|fibromyalgia|spinal cord stimulat\w+|epidural|radiofrequency ablation|analgesi\w+)\b/i;
const PAIN_WORD = /\bpain\b/gi;

// [points, label, pattern, where]. `where` is 'title' when the word is too
// common in abstracts to mean anything there: every cohort's abstract says
// "burden", and that does not make it a prevalence study.
const TOPICS = [
  // What the directory's clinics actually do. Highest fit: a reader choosing a
  // clinic is choosing between exactly these.
  [3, 'a procedure the directory lists', /\b(?:epidural|radiofrequency ablation|spinal cord stimulat\w+|nerve blocks?|neuromodulation|intrathecal|facet|peripheral nerve stimulat\w+|dorsal root ganglion)\b/i, 'both'],
  [2, 'a condition pain clinics treat', /\b(?:low back pain|back pain|neck pain|neuropath\w+|sciatica|radiculopathy|fibromyalgia|complex regional pain|osteoarthritis|chronic pain)\b/i, 'both'],
  [2, 'opioid or non-opioid treatment', /\b(?:opioids?|non-?opioid|taper\w*|buprenorphine)\b/i, 'both'],
  [2, 'how common pain is', /\b(?:prevalence|nationally representative|national health interview survey|NHIS|epidemiolog\w+)\b/i, 'title'],
];
// Whether people can get care at all — the pain-care-deserts question. Bare
// "access" is not in here: it matches "open-access" and "vascular access".
const ACCESS =
  /\b(?:access to (?:care|treatment|pain|health)|rural|telehealth|telemedicine|disparit\w+|underserved|uninsured|insurance coverage|medicaid|medicare|out-of-pocket|affordab\w+|wait(?:ing)? times?|workforce|shortage)\b/i;

// Strongest first, and the first match is the only one counted. Qualitative is
// checked before everything because an interview study that informs a
// randomized trial says "randomized" in its title and is not one; a
// meta-analysis is checked before "randomized" because it is a review OF
// randomized trials.
const DESIGNS = [
  [0, 'qualitative study', /\b(?:qualitative|interviews?|focus groups?|thematic analysis)\b/i, 'title'],
  [3, 'systematic review or meta-analysis', /\b(?:systematic review|meta-analys[ie]s)\b/i, 'both'],
  [3, 'randomized trial', /\brandomi[sz]ed\b/i, 'both'],
  [2, 'cohort or real-world data', /\b(?:cohort|retrospective|prospective|real[- ]world|claims data|registry|longitudinal)\b/i, 'both'],
  [1, 'survey or cross-sectional', /\b(?:cross-sectional|survey)\b/i, 'both'],
];

const STRONG_JOURNALS =
  /^(?:pain|the journal of pain|journal of pain|pain medicine.*|jama network open|jama.*|bmj.*|the bmj|regional anesthesia.*|neuromodulation.*|spine|the spine journal|plos medicine|annals of internal medicine|anesthesiology|pain reports|pain practice.*|pain physician|bmc medicine|the lancet.*|the clinical journal of pain|european journal of pain.*)$/i;
// Peer review there is light and fast by design. Not excluded — a good study can
// appear anywhere — but it should not outrank the same finding in Pain.
const WEAK_JOURNALS = /^cureus/i;

// Off the directory's subject even when "pain" is in the title.
// Surgical anesthesia is the big one: a nerve block for a knee replacement is an
// anesthesiologist's study, not a pain clinic's, and it matches "nerve block".
const OFF_TOPIC =
  /\b(?:labou?r analgesia|dental|toothache|post-?operative|postsurgical|perioperative|arthroplasty|surgery|surgical|cancer pain|oncolog\w+|palliative|dysmenorrh\w+|neonat\w+|veterinar\w+)\b/i;
// ...except pain that outlasts the operation, which is exactly what pain clinics
// see: failed back surgery syndrome, chronic postsurgical pain.
const SURGICAL_BUT_OURS = /\b(?:chronic|persistent|failed back)\b/i;
// Treating opioid use disorder is addiction medicine. Worth knowing about, not
// what this directory's clinics are listed for — unless the paper is also about
// pain, which the title test above has already established by this point.
const ADDICTION = /\b(?:use disorder|addiction|overdose|naloxone|methadone)\b/i;
const ANIMAL = /\b(?:mice|mouse|murine|rats?|rodents?|zebrafish|rabbits?|canine|porcine|in vitro|proteom\w+|transcriptom\w+)\b/gi;
const PEDIATRIC = /\b(?:pa?ediatric|children|adolescents?|youth|infants?)\b/i;

const count = (re, s) => (String(s).match(re) || []).length;

/**
 * Should we feature this, and how much do we want to?
 *
 *   { exclude: 'reason' }                         never offered
 *   { score, reasons: ['+3 randomized trial'] }   offered, highest score first
 *
 * The reasons are printed beside each candidate, so the ranking can be argued
 * with instead of trusted.
 */
export function scoreCandidate(c) {
  const title = c.title || '';
  const abstract = cleanAbstract(c.abstractHtml).text;
  const both = `${title}\n${abstract}`;

  if (!['cc by', 'cc0'].includes(c.license)) return { exclude: `license is "${c.license || 'none'}", not CC BY or CC0` };
  if (c.language && c.language !== 'eng') return { exclude: 'not in English' };
  if (abstract.length < 600) return { exclude: 'abstract too short to feature' };
  const badType = c.pubTypes.find((t) => EXCLUDED_TYPES.includes(t));
  if (badType) return { exclude: `publication type: ${badType}` };
  if (/\b(?:protocol|erratum|corrigendum|correction to|retract(?:ed|ion)|case report|case series)\b/i.test(title)) {
    return { exclude: 'protocol, correction or case report by its title' };
  }
  if (count(ANIMAL, title) > 0 || count(ANIMAL, abstract) >= 3) return { exclude: 'animal or bench study' };
  const titledPain = PAIN_TITLE.test(title);
  if (!titledPain && count(PAIN_WORD, abstract) < 4) return { exclude: 'not about pain' };

  let score = 0;
  const reasons = [];
  const add = (n, why) => {
    score += n;
    reasons.push(`${n > 0 ? '+' : ''}${n} ${why}`);
  };
  const hit = (re, where) => re.test(where === 'title' ? title : both);
  const anyUs = c.authors.some((a) => a.affiliations.some(isUsAffiliation));

  for (const [n, why, re, where] of TOPICS) if (hit(re, where)) add(n, why);
  // Access to care in the US is this site's own subject. Access to care in
  // another health system is a real finding that tells a US reader little.
  if (ACCESS.test(both)) add(anyUs ? 3 : 1, anyUs ? 'access to care, US data' : 'access to care, outside the US');

  const design = DESIGNS.find(([, , re, where]) => hit(re, where));
  if (design && design[0] !== 0) add(design[0], design[1]);
  if (design && design[0] === 0) reasons.push(design[1]);
  const isReview = c.pubTypes.some((t) => /^review$/i.test(t)) || /\b(?:narrative|scoping) review\b/i.test(title);
  if (isReview && !(design && design[1].startsWith('systematic'))) add(-2, 'narrative review, not original data');

  const n = sampleSize(abstract);
  if (n != null) {
    if (n >= 1000) add(2, `large sample (n=${n.toLocaleString('en-US')})`);
    else if (n >= 100) add(1, `sample of ${n}`);
    else if (n < 30) add(-1, `small sample (n=${n})`);
  }

  const first = c.authors[0];
  if (first && first.affiliations.some(isUsAffiliation)) add(2, 'US first author');
  else if (anyUs) add(1, 'a US co-author');

  if (STRONG_JOURNALS.test(c.journal)) add(2, `journal: ${c.journal}`);
  if (WEAK_JOURNALS.test(c.journal)) add(-2, `journal: ${c.journal}`);
  if (OFF_TOPIC.test(title) && !SURGICAL_BUT_OURS.test(title)) {
    add(-4, 'surgical, cancer or otherwise outside what pain clinics treat');
  }
  if (!titledPain && ADDICTION.test(title)) add(-3, 'addiction treatment rather than pain care');
  if (PEDIATRIC.test(title)) add(-1, 'pediatric');

  const flags = [];
  if (c.authors.some((a) => a.affiliations.some((x) => INDUSTRY.test(x)))) {
    flags.push('an author is affiliated with a company — read the conflict-of-interest statement first');
  }

  return { score, reasons, flags, sample: n };
}

// ------------------------------------------------- the paper's own XML -------

// Tags become spaces so adjacent elements do not fuse into one word, which
// leaves a space before the punctuation that followed a closing tag.
const xmlText = (s) =>
  decodeEntities(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();

/**
 * The license as the paper itself states it, from the <permissions> block of
 * the JATS full text. This, not the search index's "cc by" label, is what the
 * study's licenseUrl is set from: it is the publisher's statement, with the
 * version number, in the article of record.
 */
export function licenseFromXml(xml) {
  const perm = String(xml || '').match(/<permissions>([\s\S]*?)<\/permissions>/i)?.[1] || '';
  const urls = [...perm.matchAll(/https?:\/\/creativecommons\.org\/[^\s"'<>]+/gi)].map((m) => m[0].replace(/[.,;)]+$/, ''));
  const copyright = perm.match(/<copyright-statement>([\s\S]*?)<\/copyright-statement>/i)?.[1];
  // A block usually cites the license twice (attribute and text). They must agree.
  const distinct = [
    ...new Set(
      urls.map((u) =>
        u.replace(/^http:/, 'https:').replace(/\/(?:legalcode|deed)[a-z.]*$/i, '').replace(/\/?$/, '/')
      )
    ),
  ];
  return {
    url: distinct.length === 1 ? distinct[0] : null,
    ambiguous: distinct.length > 1 ? distinct : null,
    copyright: copyright ? xmlText(copyright) : null,
  };
}

/** Conflict-of-interest and funding statements, verbatim, for whoever writes the disclosure line. */
export function disclosuresFromXml(xml) {
  const s = String(xml || '');
  const coi = [];
  const funding = [];
  // Publishers mark these up three different ways; all three were seen in the
  // first two papers tried. JAMA: <p content-type="COI-statement">. Frontiers: a
  // titled <sec>. Others: an <fn> in the back matter.
  for (const m of s.matchAll(/<p[^>]*content-type="COI-statement"[^>]*>([\s\S]*?)<\/p>/gi)) coi.push(xmlText(m[1]));
  for (const m of s.matchAll(/<p[^>]*content-type="funding-statement"[^>]*>([\s\S]*?)<\/p>/gi)) funding.push(xmlText(m[1]));
  for (const m of s.matchAll(/<fn[^>]*fn-type="(?:COI-statement|conflict)"[^>]*>([\s\S]*?)<\/fn>/gi)) coi.push(xmlText(m[1]));
  for (const m of s.matchAll(/<sec[^>]*sec-type="COI-statement"[^>]*>([\s\S]*?)<\/sec>/gi)) coi.push(xmlText(m[1]));
  for (const m of s.matchAll(/<title>\s*(?:Conflicts? of interest|Competing interests?|Declaration of competing interests?|Disclosures?)\s*<\/title>([\s\S]*?)<\/sec>/gi)) coi.push(xmlText(m[1]));
  for (const m of s.matchAll(/<funding-statement>([\s\S]*?)<\/funding-statement>/gi)) funding.push(xmlText(m[1]));
  for (const m of s.matchAll(/<title>\s*Funding\s*<\/title>([\s\S]*?)<\/sec>/gi)) funding.push(xmlText(m[1]));
  return { coi: [...new Set(coi.filter(Boolean))], funding: [...new Set(funding.filter(Boolean))] };
}

/** Corresponding-author addresses, for the note we send AFTER featuring a paper. Never committed. */
export function correspondingEmails(xml) {
  const s = String(xml || '');
  const scope = [...s.matchAll(/<corresp[^>]*>([\s\S]*?)<\/corresp>/gi)].map((m) => m[1]).join(' ');
  return [...new Set([...scope.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0]))];
}

// ------------------------------------------------------------ the file -------

const STOP = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'for', 'to', 'with', 'among', 'from', 'by', 'at',
  'as', 'is', 'are', 'its', 'their', 'study', 'analysis',
]);

/** A URL slug from the study title: its first few meaningful words. The drafter may rename it. */
export function slugFor(c) {
  const words = String(c.title || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !STOP.has(w));
  return words.slice(0, 7).join('-').slice(0, 70).replace(/-+$/, '') || `study-${c.pmid || 'untitled'}`;
}

/** "Ray, B.M. (2026). Title as published." — everything before the journal name. */
export function citationFor(c) {
  const fmt = (a) => {
    if (!a.lastName) return a.name;
    const init = [...String(a.initials || '')].filter((ch) => /\p{L}/u.test(ch)).map((ch) => `${ch}.`).join('');
    return init ? `${a.lastName}, ${init}` : a.lastName;
  };
  const names = c.authors.map(fmt);
  let joined;
  if (names.length <= 1) joined = names.join('');
  // APA lists up to twenty, then the first nineteen, an ellipsis and the last.
  else if (names.length > 20) joined = `${names.slice(0, 19).join(', ')}, … ${names[names.length - 1]}`;
  else joined = `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
  const title = String(c.title || '').replace(/[.\s]+$/, '');
  return `${joined} (${c.year}). ${title}.`;
}
