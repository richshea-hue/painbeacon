// PainBeacon — the structured data must not point away from us.
//
//   node scripts/check-structured-data.mjs        (runs in `npm run build`)
//
// mainEntityOfPage names the page a piece of JSON-LD DESCRIBES. On
// /research/chronic-pain-prevalence-2019-2023/ it pointed at the journal that
// published the study, so the markup told Google our page was not the home of
// that content while the HTML canonical said it was. Two contradictory signals
// about the same page, and we are the one who loses the argument. The page was
// not indexed.
//
// A featured study, a syndicated piece, a guest article — every one of them
// arrives with somebody else's URL in hand and the same mistake available. This
// runs after `astro build` over the built HTML, so it checks what ships rather
// than what we meant, and fails the build rather than letting it out.
//
// Credit the original with sameAs, citation or a link in the body. Those say
// "the same work also lives there." mainEntityOfPage says "that page, not this
// one," which is a different claim and not one we want to make.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

function* htmlFiles(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* htmlFiles(full);
    else if (name.endsWith('.html')) yield full;
  }
}

/** Every object in a JSON-LD tree, however deeply nested. */
function* objects(node) {
  if (Array.isArray(node)) { for (const n of node) yield* objects(n); return; }
  if (node && typeof node === 'object') {
    yield node;
    for (const v of Object.values(node)) yield* objects(v);
  }
}

const urlOf = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? v['@id'] || v.url : null);
const same = (a, b) => String(a).replace(/\/$/, '') === String(b).replace(/\/$/, '');

const problems = [];
let pagesChecked = 0;

for (const file of htmlFiles(DIST)) {
  const html = readFileSync(file, 'utf8');

  // Pages with no canonical are the noindex ones; they make no claim to argue with.
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (!canonical) continue;
  pagesChecked += 1;

  for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let parsed;
    try {
      parsed = JSON.parse(block[1]);
    } catch (e) {
      problems.push(`${file}\n    unparseable JSON-LD: ${e.message}`);
      continue;
    }
    for (const obj of objects(parsed)) {
      if (!('mainEntityOfPage' in obj)) continue;
      const target = urlOf(obj.mainEntityOfPage);
      if (target && !same(target, canonical)) {
        problems.push(
          `${file}\n    @type ${obj['@type'] || '(none)'}\n` +
          `    mainEntityOfPage: ${target}\n` +
          `    canonical:        ${canonical}`
        );
      }
    }
  }
}

if (!pagesChecked) {
  console.error('check-structured-data: no built pages found — run after `astro build`.');
  process.exit(1);
}

if (problems.length) {
  console.error(
    `structured data FAILED — ${problems.length} block(s) point away from their own page:\n\n  ` +
    problems.join('\n\n  ') +
    '\n\nmainEntityOfPage must be the page\'s own canonical URL. To credit an\n' +
    'original published elsewhere, use sameAs or citation instead.\n'
  );
  process.exit(1);
}

console.log(`structured data ok — ${pagesChecked} canonical pages, no mainEntityOfPage pointing off-page.`);
