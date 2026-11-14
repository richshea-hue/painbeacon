// node --test src/lib/research-rules.test.mjs
// Pins the two things that make printing somebody else's abstract legitimate:
// a license that really grants it, and a quotation nobody has touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { abstractCredit, abstractHash, classifyLicense, studyProblems } from './research-rules.js';

const ABSTRACT = 'Background: A randomised trial of 240 adults.\n\nResults: Pain fell by 2.1 points.'; // us-english-ok
const SUMMARY = '**What the study looked at.** ' + 'A real paragraph about the study. '.repeat(20);

const ccby = (over = {}) => ({
  headline: 'A finding, in plain English',
  dek: 'Who was studied and what was found.',
  disclosure: 'Funded by the National Institutes of Health. The authors declared no conflicts.',
  citation: 'Doe, J. (2026). A study.',
  abstract: ABSTRACT,
  abstractSha256: abstractHash(ABSTRACT),
  license: 'CC BY',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  ...over,
});

test('CC BY and CC0 are reusable, in the forms publishers actually link', () => {
  assert.deepEqual(classifyLicense('https://creativecommons.org/licenses/by/4.0/'), { kind: 'CC BY', version: '4.0' });
  assert.deepEqual(classifyLicense('http://creativecommons.org/licenses/by/3.0'), { kind: 'CC BY', version: '3.0' });
  assert.equal(classifyLicense('https://creativecommons.org/licenses/by/4.0/legalcode').kind, 'CC BY');
  assert.equal(classifyLicense('https://creativecommons.org/publicdomain/zero/1.0/').kind, 'CC0');
});

test('"open access" licenses that do not let us reprint are refused, each for its own reason', () => {
  // The one that matters: most free-to-read papers are NC, and it reads as open.
  const nc = classifyLicense('https://creativecommons.org/licenses/by-nc/4.0/');
  assert.equal(nc.kind, null);
  assert.match(nc.reason, /commercial/);
  assert.match(classifyLicense('https://creativecommons.org/licenses/by-nc-nd/4.0/').reason, /commercial/);
  assert.match(classifyLicense('https://creativecommons.org/licenses/by-nd/4.0/').reason, /derivatives/);
  assert.match(classifyLicense('https://creativecommons.org/licenses/by-sa/4.0/').reason, /share-alike/);
  assert.equal(classifyLicense('https://www.elsevier.com/tdm/userlicense/1.0/').kind, null);
  assert.equal(classifyLicense('').kind, null);
});

test('a "by" URL with extra terms cannot pass as plain CC BY', () => {
  // The CC BY pattern must not match by-nc as a prefix.
  assert.equal(classifyLicense('https://creativecommons.org/licenses/by-nc/4.0/').kind, null);
  // Only legalcode/deed may trail the version, so nothing can be smuggled after it.
  assert.equal(classifyLicense('https://creativecommons.org/licenses/by/4.0/by-nc').kind, null);
  assert.equal(classifyLicense('https://creativecommons.org/licenses/by/4.0/deed.en').kind, 'CC BY');
  assert.equal(classifyLicense('https://example.com/creativecommons.org/licenses/by/4.0/').kind, null);
});

test('a finished CC BY study has no problems', () => {
  assert.deepEqual(studyProblems(ccby(), SUMMARY), []);
});

test('an edited abstract fails, even by one letter — the spelling "fix" case', () => {
  // What `npm run fix:spelling` would do to a British author's abstract.
  const respelled = ccby({ abstract: ABSTRACT.replace('randomised', 'randomized') }); // us-english-ok
  const problems = studyProblems(respelled, SUMMARY);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /does not match abstractSha256/);
});

test('an edited abstract fails on a DRAFT too', () => {
  // A draft with a doctored quotation is one flag away from a published one.
  const draft = ccby({ draft: true, abstract: ABSTRACT + ' ' });
  assert.match(studyProblems(draft, '').join('\n'), /does not match abstractSha256/);
});

test('the license label has to agree with the license URL', () => {
  assert.match(studyProblems(ccby({ license: 'CC0' }), SUMMARY).join('\n'), /license says "CC0" but licenseUrl is CC BY/);
  assert.match(studyProblems(ccby({ licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/' }), SUMMARY).join('\n'), /not reusable/);
  assert.match(studyProblems(ccby({ licenseUrl: undefined }), SUMMARY).join('\n'), /no license URL/);
});

test('a scaffolded draft passes as a draft and cannot be un-drafted while it says TODO', () => {
  const scaffold = ccby({
    draft: true,
    headline: 'TODO — the finding in plain English',
    dek: 'TODO — one or two sentences',
    disclosure: 'TODO — who funded the study',
  });
  const body = '**What the study looked at.** TODO — who was studied.';
  assert.deepEqual(studyProblems(scaffold, body), []);

  const live = studyProblems({ ...scaffold, draft: false }, body).join('\n');
  assert.match(live, /headline still contains a placeholder/);
  assert.match(live, /dek still contains a placeholder/);
  assert.match(live, /disclosure still contains a placeholder/);
  assert.match(live, /summary still contains a placeholder/);
});

test('a published study needs a real summary and a disclosure', () => {
  assert.match(studyProblems(ccby(), 'Too short.').join('\n'), /under 400 characters/);
  assert.match(studyProblems(ccby({ disclosure: undefined }), SUMMARY).join('\n'), /disclosure is missing/);
});

test('a study featured by permission records the permission instead of a license', () => {
  const byPermission = {
    headline: 'How common is chronic pain?',
    dek: 'A summary.',
    citation: 'Ray, B.M. (2026). A study.',
    abstract: ABSTRACT,
    abstractSha256: abstractHash(ABSTRACT),
    license: 'permission',
    permissionNote: 'The author agreed in August 2026 to the abstract, citation and link.',
    abstractCredit: "Abstract © 2026 Elsevier Inc. Reproduced with the author's permission.",
  };
  // No licenseUrl and no disclosure: those terms were agreed with the author.
  assert.deepEqual(studyProblems(byPermission, SUMMARY), []);
  assert.match(studyProblems({ ...byPermission, permissionNote: undefined }, SUMMARY).join('\n'), /permissionNote/);
  assert.match(studyProblems({ ...byPermission, abstractCredit: undefined }, SUMMARY).join('\n'), /abstractCredit/);
});

test('the credit line names the license version and the copyright holder', () => {
  assert.equal(
    abstractCredit(ccby({ copyright: 'Copyright 2026 Doan LV et al. JAMA Network Open.' })),
    'Abstract reproduced unchanged from the published article under the Creative Commons Attribution 4.0 license (CC BY). Copyright 2026 Doan LV et al. JAMA Network Open.'
  );
  // No copyright statement in the paper: credit the authors rather than nobody.
  assert.match(abstractCredit(ccby()), /\(CC BY\)\. The Author\(s\)\.$/);
  // An agreed line is printed exactly as agreed.
  assert.equal(abstractCredit({ abstractCredit: 'As agreed.' }), 'As agreed.');
});
