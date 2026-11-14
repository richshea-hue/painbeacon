// Turn one study into a draft featured-research page.
//
//   node scripts/scaffold-research.mjs <PMID | PMCID | DOI> [--slug my-slug]
//
// Writes src/content/research/<slug>.md with `draft: true`: every QUOTED field
// filled in from the source (title, authors, journal, abstract, license), and
// every field that is OURS left as a TODO for whoever writes the summary. A
// draft is absent from the build, and a study that still says TODO cannot be
// un-drafted — src/lib/research-rules.js fails the build — so a half-written
// page has no way onto the site.
//
// WHAT THIS REFUSES TO DO, and why each refusal is a stop rather than a warning:
//
//   - A license that is not CC BY or CC0. Read from the paper's own JATS
//     <permissions> block where Europe PMC has the full text, otherwise from
//     the license the publisher deposited with Crossref. The search index's
//     "cc by" label is what found the paper; it is not what we rely on. If the
//     two sources disagree, or the paper states two different licenses, stop.
//     A paper that fails here can still be featured the way the first one was:
//     ask the author, and record the answer as `license: permission`.
//
//   - An abstract with superscripts or subscripts. Flattening "10<sup>-3</sup>"
//     gives "10-3", a different number inside a quotation. Those few need the
//     abstract typed in by hand from the article, with the hash regenerated.
//
//   - Overwriting a file that exists.
//
// The corresponding author's address is PRINTED, never written to the repo. It
// is for the note Rich sends after the page is live — "we featured your paper,
// here is the link, would you answer three questions" — which is the second
// half of the pipeline and the reason this is worth doing at all.
import { existsSync, writeFileSync } from 'node:fs';
import {
  API, citationFor, cleanAbstract, correspondingEmails, disclosuresFromXml, licenseFromXml,
  slugFor, toCandidate,
} from './lib/europepmc.mjs';
import { abstractHash, classifyLicense, studyProblems } from '../src/lib/research-rules.js';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const slugArg = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : null;
const TIMEOUT_MS = 45_000;
const UA = { 'user-agent': 'research-candidate-finder/1.0' };

if (!id) {
  console.error('usage: node scripts/scaffold-research.mjs <PMID | PMCID | DOI> [--slug my-slug]');
  process.exit(1);
}

const stop = (msg) => {
  console.error(`\nSTOPPED — ${msg}\n`);
  process.exit(1);
};

async function get(url, as = 'json') {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  return as === 'json' ? res.json() : res.text();
}

// ------------------------------------------------------------- the record ----

const query = /^10\.\d{4,}\//.test(id) ? `DOI:"${id}"` : /^PMC\d+$/i.test(id) ? `PMCID:${id.toUpperCase()}` : `EXT_ID:${id} AND SRC:MED`;
const search = new URL(`${API}/search`);
search.searchParams.set('query', query);
search.searchParams.set('format', 'json');
search.searchParams.set('resultType', 'core');
search.searchParams.set('pageSize', '2');
const found = await get(search);
const hits = found?.resultList?.result || [];
if (!hits.length) stop(`Europe PMC has no record for ${id}.`);
if (hits.length > 1 && hits[0].pmid !== id) stop(`${id} matched more than one record — use the PMID.`);

const c = toCandidate(hits[0]);
if (!c.doi) stop('the record has no DOI, so there is no stable link to the version of record.');

// ------------------------------------------------------------- the license ---

let xml = null;
if (c.pmcid) xml = await get(`${API}/${c.pmcid}/fullTextXML`, 'text');

let licenseUrl = null;
let licenseSource = null;
let copyright = null;

if (xml) {
  const fromXml = licenseFromXml(xml);
  if (fromXml.ambiguous) stop(`the paper states more than one license: ${fromXml.ambiguous.join(' and ')}. Read the article and decide by hand.`);
  licenseUrl = fromXml.url;
  copyright = fromXml.copyright;
  if (licenseUrl) licenseSource = `the paper's own <permissions> block (${c.pmcid})`;
}

// Crossref: what the publisher deposited. The fallback when there is no JATS
// file, and a second opinion when there is.
const crossref = await get(`https://api.crossref.org/works/${encodeURIComponent(c.doi)}`);
const crossrefUrls = [
  ...new Set(
    (crossref?.message?.license || [])
      .filter((l) => !l['content-version'] || ['vor', 'unspecified'].includes(l['content-version']))
      .map((l) => String(l.URL || '').replace(/^http:/, 'https:').replace(/\/(?:legalcode|deed)[a-z.]*$/i, '').replace(/\/?$/, '/'))
      .filter((u) => /creativecommons\.org/i.test(u))
  ),
];

if (licenseUrl && crossrefUrls.length && !crossrefUrls.includes(licenseUrl)) {
  stop(`the paper says ${licenseUrl} but Crossref has ${crossrefUrls.join(', ')} for the same DOI. Read the article page and decide by hand.`);
}
if (!licenseUrl) {
  if (crossrefUrls.length > 1) stop(`Crossref lists more than one license for the version of record: ${crossrefUrls.join(', ')}.`);
  if (crossrefUrls.length === 1) {
    licenseUrl = crossrefUrls[0];
    licenseSource = 'Crossref (publisher-deposited; no full text in Europe PMC yet)';
  }
}
if (!licenseUrl) {
  stop(
    'no license statement found in the paper or at Crossref. Open the article and look: if it is CC BY, ' +
      'try again once it reaches PMC; otherwise it needs the author\'s permission (license: permission).'
  );
}

// Europe PMC indexes journal names in NLM sentence case ("JAMA network open").
// Crossref carries the name as the journal writes it, and a journal's name is a
// proper noun we print on the page and in the citation.
const journal = crossref?.message?.['container-title']?.[0] || c.journal;

const lic = classifyLicense(licenseUrl);
if (!lic.kind) stop(`${licenseUrl} — ${lic.reason}. This one needs the author's permission (license: permission).`);

// ------------------------------------------------------------- the abstract --

const abs = cleanAbstract(c.abstractHtml);
if (!abs.text) stop('the record has no abstract.');
if (abs.lossy) {
  stop(
    'the abstract contains superscripts or subscripts, which do not survive as plain text ("10<sup>-3</sup>" becomes "10-3"). ' +
      'Type it in by hand from the article page and set abstractSha256 with abstractHash() from src/lib/research-rules.js.'
  );
}

// ------------------------------------------------------------- the file ------

const slug = (slugArg || slugFor(c)).toLowerCase();
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) stop(`"${slug}" is not a usable slug.`);
if (slug === 'pain-care-deserts') stop('that slug belongs to our own data study.');
const file = new URL(`../src/content/research/${slug}.md`, import.meta.url);
if (existsSync(file)) stop(`src/content/research/${slug}.md already exists.`);

const q = (s) => JSON.stringify(String(s));
const today = new Date().toISOString().slice(0, 10);
const disclosures = xml ? disclosuresFromXml(xml) : { coi: [], funding: [] };
// The marker is on these lines too: they quote the paper, and the spelling gate
// reads YAML comments like any other line.
const asComment = (label, list) =>
  list.length
    ? list.map((t) => `#   ${label} (us-english-ok): ${t.replace(/\s+/g, ' ')}`).join('\n')
    : `#   ${label}: (not found in the XML — read it off the article page)`;

// `# us-english-ok` on every quoted line: scripts/us-english.mjs rewrites
// British spellings repo-wide, and these are other people's words. The hash
// would catch a rewritten abstract; the escape stops it being rewritten.
const authorLines = c.authors
  .map((a) => `  - name: ${q(a.name)} # us-english-ok` + (a.orcid ? `\n    url: https://orcid.org/${a.orcid}` : ''))
  .join('\n');

const md = `---
headline: "TODO — the finding in plain English, as a headline. Not the study's title."
dek: "TODO — one or two sentences: who was studied, how many, what was found. Doubles as the meta description."
date: ${today}
draft: true
disclosure: "TODO — who funded the study and what conflicts the authors declared, in our words. Say so plainly if they declared none."
# What the paper itself says, to write the disclosure from. Delete once written.
${asComment('funding', disclosures.funding)}
${asComment('conflicts', disclosures.coi)}

# --- the study, as published. Quoted, not ours: do not edit these lines. ---
studyTitle: ${q(c.title.replace(/\.$/, ''))} # us-english-ok
authors:
${authorLines}
journal: ${q(journal)} # us-english-ok
year: ${c.year}${c.published ? `\npublished: ${c.published}` : ''}
doi: ${q(c.doi)}${c.pmid ? `\npmid: ${q(c.pmid)}` : ''}${c.pmcid ? `\npmcid: ${q(c.pmcid)}` : ''}
sourceUrl: ${q(`https://doi.org/${c.doi}`)}
citation: ${q(citationFor(c))} # us-english-ok
abstract: ${q(abs.text)} # us-english-ok
abstractSha256: ${abstractHash(abs.text)}

# --- why we may print it ---
# License read from ${licenseSource}.
license: ${lic.kind}
licenseUrl: ${licenseUrl}${copyright ? `\ncopyright: ${q(copyright)} # us-english-ok` : ''}
---

**What the study looked at.** TODO — who was studied, how many, over what period, and what kind of study this is (a trial, a review of trials, an analysis of records). One paragraph.

**What it found.**

- TODO — the main result, with its number.
- TODO — the next most important result.
- TODO — what the study could NOT show: its limits as the authors state them.

**Why it matters for patients.** TODO — what a person deciding about pain care can take from this, without turning a finding into advice. Link to a relevant guide in /news/ or to /pain-clinics/ where it genuinely fits.
`;

// The scaffold must pass its own gate as a draft, or the next build fails on a
// file nobody has touched yet.
const data = {
  draft: true,
  abstract: abs.text,
  abstractSha256: abstractHash(abs.text),
  license: lic.kind,
  licenseUrl,
};
const problems = studyProblems(data, '');
if (problems.length) stop(`the scaffold would not pass the build:\n  - ${problems.join('\n  - ')}`);

writeFileSync(file, md, 'utf8');

console.log(`wrote src/content/research/${slug}.md (draft)\n`);
console.log(`  ${c.title}`);
console.log(`  ${journal}, ${c.year} · ${c.authors.length} author${c.authors.length === 1 ? '' : 's'} · https://doi.org/${c.doi}`);
console.log(`  license: ${lic.kind} ${lic.version} — from ${licenseSource}`);
console.log(`  abstract: ${abs.text.length} characters, ${abs.text.split('\n\n').length} paragraph(s), hash pinned`);
if (!xml) console.log('  NOTE: no full text in Europe PMC — read funding and conflicts off the article page.');

const emails = xml ? correspondingEmails(xml) : [];
console.log('\nFor the note to the author once the page is live (not written to the repo):');
console.log(emails.length ? emails.map((e) => `  ${e}`).join('\n') : '  (no corresponding address in the XML — it is on the article page)');

console.log(`\nNext: write headline, dek, disclosure and the summary; preview with SHOW_DRAFTS=1 npm run dev;`);
console.log(`then remove "draft: true". The build refuses the file while any TODO remains.`);
