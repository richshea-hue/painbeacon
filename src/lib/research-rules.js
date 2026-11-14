// The rules a featured study has to satisfy before it can be built.
//
// A featured study puts somebody else's words on our page. Two things make that
// legitimate, and both are easy to lose without noticing:
//
//   THE RIGHT TO REUSE. Either the paper is under a license that grants it —
//   CC BY, or CC0 for public-domain work — or the author gave permission, as
//   Michael Ray did for the first one. "Open access" is not enough. Most of what
//   is free to READ is CC BY-NC or BY-NC-ND, and this is a site that sells
//   sponsorships: NC rules us out, and ND rules out printing an abstract beside
//   a summary of our own. So the license is checked by its URL, which carries
//   the exact terms, and never by a label that says "open".
//
//   THE WORDS THEMSELVES. An abstract is quoted, so it has to stay exactly as
//   published. The danger is not carelessness, it is our own tooling:
//   `npm run fix:spelling` rewrites British spellings across the repo, and a
//   British author's "randomised" would become "randomized" inside a quotation // us-english-ok
//   attributed to them. abstractSha256 pins the text as it was fetched from the
//   source, so any edit — a "fix", a stray paste, a helpful tidy-up — fails the
//   build instead of shipping a misquote.
//
// Pure functions, no Astro imports: src/lib/research.js runs these at build
// time, scripts/scaffold-research.mjs runs them when it writes a draft, and
// research-rules.test.mjs runs them without either.
import { createHash } from 'node:crypto';

/** sha256 of the abstract exactly as stored, as lowercase hex. */
export function abstractHash(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

// Attribution only. The version is captured because the credit line has to
// name it; a trailing "legalcode" or "deed.en" is tolerated because publishers
// link to both, and nothing else is.
const CC_BY = /^https?:\/\/creativecommons\.org\/licenses\/by\/(\d\.\d)(?:\/(?:legalcode|deed)[a-z.\-]*)?\/?$/i;
const CC0 = /^https?:\/\/creativecommons\.org\/publicdomain\/zero\/(\d\.\d)(?:\/(?:legalcode|deed)[a-z.\-]*)?\/?$/i;
const CC_ANY = /^https?:\/\/creativecommons\.org\/(?:licenses|publicdomain)\/([a-z\-]+)\//i;

/**
 * What a license URL permits us to do.
 *
 *   { kind: 'CC BY', version: '4.0' }   reusable with attribution
 *   { kind: 'CC0', version: '1.0' }     public domain
 *   { kind: null, reason: '...' }       not reusable without asking
 */
export function classifyLicense(url) {
  const u = String(url || '').trim();
  if (!u) return { kind: null, reason: 'no license URL' };
  let m = u.match(CC_BY);
  if (m) return { kind: 'CC BY', version: m[1] };
  m = u.match(CC0);
  if (m) return { kind: 'CC0', version: m[1] };
  m = u.match(CC_ANY);
  if (m) {
    const terms = m[1].toLowerCase();
    if (terms.includes('nc')) return { kind: null, reason: `CC ${terms.toUpperCase()} forbids commercial use, and this site sells sponsorships` };
    if (terms.includes('nd')) return { kind: null, reason: `CC ${terms.toUpperCase()} forbids derivatives` };
    if (terms.includes('sa')) return { kind: null, reason: `CC ${terms.toUpperCase()} is share-alike — ask rather than assume` };
    return { kind: null, reason: `unrecognized Creative Commons terms: ${terms}` };
  }
  return { kind: null, reason: 'not a Creative Commons license URL' };
}

/** The line printed under the abstract. One place, so every study says it the same way. */
export function abstractCredit(data) {
  if (data.abstractCredit) return data.abstractCredit;
  const holder = data.copyright || 'The Author(s)';
  if (data.license === 'CC0') {
    return 'Abstract reproduced unchanged from the published article, which is dedicated to the public domain (CC0).';
  }
  const { version } = classifyLicense(data.licenseUrl);
  return `Abstract reproduced unchanged from the published article under the Creative Commons Attribution ${version || ''} license (CC BY). ${holder}`
    .replace(/\s+/g, ' ')
    .replace(/([^.])$/, '$1.');
}

// Markers the scaffolder leaves for whoever writes the summary. One of these
// reaching the live site is a page that says "TODO" under a real researcher's
// name, so a study that is not a draft may not contain any.
const PLACEHOLDER = /\bTODO\b|\bTKTK\b|\[\s*placeholder\s*\]/i;

/**
 * Everything wrong with one study, as sentences. Empty array = fit to build.
 *
 * @param {object} data  parsed frontmatter
 * @param {string} body  the markdown body (our summary)
 */
export function studyProblems(data, body = '') {
  const problems = [];
  const draft = data.draft === true;

  // --- the words -----------------------------------------------------------
  if (!data.abstract || !String(data.abstract).trim()) {
    problems.push('abstract is empty');
  } else if (abstractHash(data.abstract) !== String(data.abstractSha256 || '').toLowerCase()) {
    problems.push(
      'abstract does not match abstractSha256 — the quoted abstract was edited after it was fetched. ' +
        'Restore it from the source; do not update the hash to match an edit (and check `npm run fix:spelling` did not rewrite it)'
    );
  }

  // --- the right to reuse ----------------------------------------------------
  if (data.license === 'permission') {
    if (!data.permissionNote) problems.push('license is "permission" but permissionNote does not record who agreed, when, and to what');
    if (!data.abstractCredit) problems.push('license is "permission" but abstractCredit (the copyright line agreed with the author) is missing');
  } else {
    const c = classifyLicense(data.licenseUrl);
    if (!c.kind) problems.push(`licenseUrl is not reusable: ${c.reason}`);
    else if (c.kind !== data.license) problems.push(`license says "${data.license}" but licenseUrl is ${c.kind}`);
  }

  // --- nothing unfinished goes live --------------------------------------------
  if (!draft) {
    const fields = ['headline', 'dek', 'disclosure', 'citation'];
    for (const f of fields) {
      if (PLACEHOLDER.test(String(data[f] || ''))) problems.push(`${f} still contains a placeholder`);
    }
    if (PLACEHOLDER.test(body)) problems.push('the summary still contains a placeholder');
    if (String(body).trim().length < 400) problems.push('the summary is under 400 characters — a featured study with no plain-English summary is just a copied abstract');
    // Not asked of a study featured by permission: those terms were agreed with
    // the author one at a time, and the first one covers the abstract, the
    // citation and a link, nothing else.
    if (!data.disclosure && data.license !== 'permission') {
      problems.push('disclosure is missing — say who funded the study and what conflicts the authors declared, or that they declared none');
    }
  }

  return problems;
}
