// One door to the featured-research collection, the same way src/lib/articles.js
// is the one door to articles — and for a second reason on top of drafts.
//
// Every study is checked against src/lib/research-rules.js on the way through:
// the license has to be one that lets us reprint the abstract, and the abstract
// has to still match the hash taken when it was fetched. A study that fails
// stops the build, drafts included, because a draft with a doctored abstract is
// one frontmatter flip from being a published one.
//
// So nothing calls getCollection('research') directly. A page that did would
// render a study nobody had checked.
import { getCollection } from 'astro:content';
import { studyProblems } from './research-rules.js';

let _checked = null;

async function allChecked() {
  if (_checked) return _checked;
  const all = await getCollection('research');
  const failures = [];
  for (const s of all) {
    const problems = studyProblems(s.data, s.body);
    if (problems.length) failures.push(`src/content/research/${s.id}\n    - ${problems.join('\n    - ')}`);
  }
  if (failures.length) {
    throw new Error(
      `featured research FAILED — ${failures.length} study file(s) cannot be built:\n\n  ` +
        failures.join('\n\n  ') +
        '\n\nSee src/lib/research-rules.js for what each rule protects.\n'
    );
  }
  _checked = all;
  return all;
}

/** Published studies. SHOW_DRAFTS=1 includes drafts, for a local preview. */
export async function getStudies() {
  const showDrafts = process.env.SHOW_DRAFTS === '1';
  return (await allChecked()).filter((s) => showDrafts || s.data.draft !== true);
}

export async function getStudiesNewestFirst() {
  return (await getStudies()).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
