// node --test scripts/lib/europepmc.test.mjs
// Pins the judgments the candidate finder makes on its own: what is quoted
// verbatim, what is left out, and what outranks what. Several cases here are
// mistakes the first live run actually made, kept so they stay fixed.
// Records are shaped like Europe PMC's `resultType=core` output.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuery, citationFor, cleanAbstract, correspondingEmails, disclosuresFromXml, isUsAffiliation,
  licenseFromXml, sampleSize, scoreCandidate, slugFor, toCandidate,
} from './europepmc.mjs';

const LONG = ' Chronic low back pain is common and costly, and pain outcomes were tracked for a year in every patient with pain.'.repeat(6);

const record = (over = {}) => ({
  pmid: '42000001',
  pmcid: 'PMC13000001',
  doi: '10.1000/example.2026.1',
  title: 'Spinal cord stimulation for chronic low back pain: a randomized trial.',
  authorList: {
    author: [
      {
        fullName: 'Doe J', firstName: 'Jane', lastName: 'Doe', initials: 'JQ',
        authorId: { type: 'ORCID', value: '0000-0001-2345-6789' },
        authorAffiliationDetailsList: { authorAffiliation: [{ affiliation: 'Department of Anesthesiology, Mayo Clinic, Rochester, MN 55905, USA.' }] },
      },
      { fullName: 'Roe R', firstName: 'Richard', lastName: 'Roe', initials: 'R' },
    ],
  },
  journalInfo: { journal: { title: 'Pain medicine (Malden, Mass.)' }, yearOfPublication: 2026 },
  pubYear: '2026',
  firstPublicationDate: '2026-10-01',
  abstractText: `<h4>Background</h4>We randomized 240 adults.${LONG}<h4>Results</h4>Pain fell by 2.1 points.`,
  pubTypeList: { pubType: ['research-article', 'Journal Article'] },
  license: 'cc by',
  language: 'eng',
  ...over,
});
const score = (over) => scoreCandidate(toCandidate(record(over)));

// ---------------------------------------------------------------- query ------

test('the query asks for reusable licenses only, in a date window', () => {
  const q = buildQuery({ from: '2026-09-01', to: '2026-11-01' });
  assert.match(q, /LICENSE:"cc by" OR LICENSE:"cc0"/);
  assert.match(q, /FIRST_PDATE:\[2026-09-01 TO 2026-11-01\]/);
  assert.match(q, /TITLE:"chronic pain"/);
  assert.doesNotMatch(q, /OPEN_ACCESS/); // free to read is not free to reprint
});

// -------------------------------------------------------------- abstract -----

test('a structured abstract becomes labeled paragraphs with no word changed', () => {
  const { text, lossy } = cleanAbstract('<h4>Background</h4>A randomised trial of 240 adults.<h4>Results:</h4>Pain fell &amp; stayed down.'); // us-english-ok
  assert.equal(text, 'Background: A randomised trial of 240 adults.\n\nResults: Pain fell & stayed down.'); // us-english-ok
  assert.equal(lossy, false);
  // British spelling survives: this is a quotation, not our copy.
  assert.ok(text.includes('randomised')); // us-english-ok
});

test('an unstructured abstract is one paragraph, inline tags dropped and text kept', () => {
  assert.equal(cleanAbstract('Pain is <i>common</i>.  It persists.').text, 'Pain is common. It persists.');
});

test('superscripts are flagged, because flattening them changes numbers', () => {
  assert.equal(cleanAbstract('p &lt; 10<sup>-3</sup>').lossy, true);
  assert.equal(cleanAbstract('H<sub>2</sub>O').lossy, true);
});

// -------------------------------------------------------------- exclusions ---

test('only CC BY and CC0 are offered', () => {
  assert.match(score({ license: 'cc by-nc' }).exclude, /not CC BY or CC0/);
  assert.match(score({ license: 'cc by-nc-nd' }).exclude, /not CC BY or CC0/);
  assert.match(score({ license: '' }).exclude, /not CC BY or CC0/);
  assert.equal(score({ license: 'cc0' }).exclude, undefined);
});

test('protocols, case reports, corrections and animal work are never offered', () => {
  assert.match(score({ title: 'Yoga for chronic pain: protocol for a randomized trial.' }).exclude, /protocol/);
  assert.match(score({ title: 'Erratum: Spinal cord stimulation for chronic pain.' }).exclude, /protocol, correction/);
  assert.match(score({ pubTypeList: { pubType: ['Case Reports'] } }).exclude, /Case Reports/);
  assert.match(score({ title: 'Neuropathic pain in a mouse model of chemotherapy.' }).exclude, /animal/);
  assert.match(score({ abstractText: 'short' }).exclude, /too short/);
});

test('a paper that is not about pain is left out — the depression review that ranked #4', () => {
  const s = score({
    title: 'Neuromodulation Therapies for Depression: Current Status and Future Directions.',
    abstractText: 'Depression is common. Transcranial magnetic stimulation and other neuromodulation approaches are reviewed in randomized trials. '.repeat(8),
  });
  assert.equal(s.exclude, 'not about pain');
});

test('an opioid paper whose abstract keeps returning to pain is still about pain', () => {
  const s = score({
    title: 'Opioid tapering outcomes in primary care.',
    abstractText: 'Patients with chronic pain on long-term opioids were tapered. Pain scores, pain interference and pain-related function were tracked, and pain did not worsen. '.repeat(5),
  });
  assert.equal(s.exclude, undefined);
});

// ---------------------------------------------------------------- ranking ----

test('an interview study that informs a randomized trial is not scored as one', () => {
  const s = score({ title: 'Rural telehealth physical therapy for chronic low back pain: qualitative findings informing a randomized clinical trial.' });
  assert.ok(s.reasons.includes('qualitative study'));
  assert.ok(!s.reasons.some((r) => r.includes('randomized trial')));
});

test('a meta-analysis of randomized trials is scored as a review, once', () => {
  const s = score({ title: 'Epidural steroid injections for sciatica: a systematic review and meta-analysis of randomized trials.' });
  assert.ok(s.reasons.includes('+3 systematic review or meta-analysis'));
  assert.ok(!s.reasons.some((r) => r.includes('randomized trial')));
});

test('surgical anesthesia is marked down; pain that outlasts surgery is not', () => {
  const knee = score({ title: 'Femoral nerve block versus local infiltration analgesia for total knee arthroplasty: a randomized trial.' });
  assert.ok(knee.reasons.some((r) => r.startsWith('-4')));
  const fbss = score({ title: 'Spinal cord stimulation for chronic pain after lumbar spine surgery: a randomized trial.' });
  assert.ok(!fbss.reasons.some((r) => r.startsWith('-4')));
  assert.ok(fbss.score > knee.score);
});

test('access to care counts for more when the data are American', () => {
  const us = score({ title: 'Telehealth for chronic pain in rural clinics: a cohort study.' });
  assert.ok(us.reasons.includes('+3 access to care, US data'));
  const abroad = score({
    title: 'Telehealth for chronic pain in rural clinics: a cohort study.',
    authorList: { author: [{ firstName: 'A', lastName: 'B', initials: 'A', authorAffiliationDetailsList: { authorAffiliation: [{ affiliation: 'King Faisal University, Al-Ahsa, Saudi Arabia.' }] } }] },
  });
  assert.ok(abroad.reasons.includes('+1 access to care, outside the US'));
});

test('"access" alone is not access to care', () => {
  const s = score({ abstractText: `This open-access trial used ultrasound-guided vascular access.${LONG}` });
  assert.ok(!s.reasons.some((r) => r.includes('access to care')));
});

test('a company on the author list is flagged; a pharmacy school is not', () => {
  const withCo = (aff) => score({
    authorList: { author: [{ firstName: 'A', lastName: 'B', initials: 'A', authorAffiliationDetailsList: { authorAffiliation: [{ affiliation: aff }] } }] },
  });
  assert.equal(withCo('Boston Scientific Corporation, Valencia, CA, USA.').flags.length, 1);
  assert.equal(withCo('Department of Pharmaceutical Sciences, College of Clinical Pharmacy, King Faisal University.').flags.length, 0);
});

test('the reasons add up to the score', () => {
  const s = score();
  const sum = s.reasons.map((r) => parseInt(r, 10)).filter(Number.isFinite).reduce((a, b) => a + b, 0);
  assert.equal(sum, s.score);
  assert.ok(s.reasons.includes('+3 randomized trial'));
  assert.ok(s.reasons.includes('+2 US first author'));
});

// ---------------------------------------------------------------- helpers ----

test('US affiliations are recognized three ways, and Tbilisi is not one of them', () => {
  assert.equal(isUsAffiliation('Mayo Clinic, Rochester, MN 55905.'), true);
  assert.equal(isUsAffiliation('Yale School of Medicine, New Haven, Connecticut.'), true);
  assert.equal(isUsAffiliation('MedStar Health Research Institute, Columbia, MD, United States.'), true);
  assert.equal(isUsAffiliation('Tbilisi State Medical University, Tbilisi, Georgia.'), false);
  assert.equal(isUsAffiliation('La Fe University Hospital, Valencia, Spain.'), false);
});

test('sample size is the largest number of people the abstract states', () => {
  assert.equal(sampleSize('Pooled data (N=91,001 adults) from 3 surveys; 240 patients were excluded.'), 91001);
  assert.equal(sampleSize('We enrolled 167 participants.'), 167);
  assert.equal(sampleSize('No numbers here.'), null);
});

test('the slug is the first meaningful words of the title, ASCII only', () => {
  assert.equal(
    slugFor({ title: 'Initial Treatment for Acute Low Back Pain and Risk of Opioid Use Disorder and Overdose.' }),
    'initial-treatment-acute-low-back-pain-risk'
  );
  assert.equal(slugFor({ title: 'Efficacité de la neurostimulation médullaire' }), 'efficacite-de-la-neurostimulation-medullaire');
});

test('the citation is APA up to the journal name', () => {
  const c = toCandidate(record());
  assert.equal(citationFor(c), 'Doe, J.Q., & Roe, R. (2026). Spinal cord stimulation for chronic low back pain: a randomized trial.');
  assert.equal(citationFor({ ...c, authors: [c.authors[0]] }), 'Doe, J.Q. (2026). Spinal cord stimulation for chronic low back pain: a randomized trial.');
});

// ------------------------------------------------------------ the paper XML --

const PERMISSIONS = (inner) => `<article><front><permissions>${inner}</permissions></front></article>`;

test('the license is read from the paper, with its version, and agrees with itself', () => {
  const xml = PERMISSIONS(
    '<copyright-statement>Copyright 2026 Doan LV et al. <italic>JAMA Network Open</italic>.</copyright-statement>' +
    '<license><ali:license_ref>https://creativecommons.org/licenses/by/4.0/</ali:license_ref>' +
    '<license-p>Distributed under the <ext-link xlink:href="http://creativecommons.org/licenses/by/4.0/">CC-BY License</ext-link>.</license-p></license>'
  );
  const lic = licenseFromXml(xml);
  assert.equal(lic.url, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(lic.ambiguous, null);
  assert.equal(lic.copyright, 'Copyright 2026 Doan LV et al. JAMA Network Open.');
});

test('a paper that states two different licenses is ambiguous, not whichever came first', () => {
  const lic = licenseFromXml(PERMISSIONS(
    '<license xlink:href="https://creativecommons.org/licenses/by/4.0/"><license-p>See https://creativecommons.org/licenses/by-nc/4.0/</license-p></license>'
  ));
  assert.equal(lic.url, null);
  assert.equal(lic.ambiguous.length, 2);
});

test('a license mentioned outside <permissions> is not the paper\'s license', () => {
  // Reference lists and figure credits cite other works' licenses.
  const xml = '<article><front><permissions></permissions></front><back><ref>https://creativecommons.org/licenses/by/4.0/</ref></back></article>';
  assert.equal(licenseFromXml(xml).url, null);
});

test('funding and conflict statements are found in the three markups publishers use', () => {
  const jama = disclosuresFromXml(
    '<p content-type="COI-statement"><bold>Conflict of Interest Disclosures:</bold> Dr Doan reported personal fees.</p>' +
    '<p content-type="funding-statement"><bold>Funding/Support:</bold> Supported by grant R01DA053243.</p>'
  );
  assert.deepEqual(jama.coi, ['Conflict of Interest Disclosures: Dr Doan reported personal fees.']);
  assert.deepEqual(jama.funding, ['Funding/Support: Supported by grant R01DA053243.']);

  const frontiers = disclosuresFromXml('<sec id="s9"><title>Conflict of interest</title><p>IH is a Boston Scientific Corporation research scientist.</p></sec>');
  assert.deepEqual(frontiers.coi, ['IH is a Boston Scientific Corporation research scientist.']);

  const fn = disclosuresFromXml('<fn fn-type="COI-statement"><p>None declared.</p></fn>');
  assert.deepEqual(fn.coi, ['None declared.']);
});

test('only the corresponding author\'s address is picked up', () => {
  const xml = '<corresp id="c1">Correspondence: <email>jane.doe@example.edu</email></corresp><aff>Other <email>someone.else@example.org</email></aff>';
  assert.deepEqual(correspondingEmails(xml), ['jane.doe@example.edu']);
  assert.deepEqual(correspondingEmails('<article/>'), []);
});
