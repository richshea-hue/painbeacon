import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { statSync } from 'node:fs';
import { SITE } from '../lib/site.js';

// Image enclosure per item so RSS-to-social automation (dlvr.it etc.) attaches
// the branded 1:1 share card to each post instead of a bare link. RSS enclosures
// require a byte length, so stat the file at build time; skip if missing.
function cardEnclosure(webPath) {
  try {
    const size = statSync(new URL(`../../public${webPath}`, import.meta.url)).size;
    return { enclosure: { url: new URL(webPath, SITE.url).href, length: size, type: 'image/png' } };
  } catch {
    return {};
  }
}

export async function GET(context) {
  const articles = (await getCollection('articles')).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );
  return rss({
    title: `${SITE.name} — News & guides`,
    description:
      'Weekly guides and analysis from the PainBeacon editorial desk: how to choose ' +
      'the right kind of pain clinic, treatments explained in plain English, and how ' +
      'our rankings work.',
    site: context.site,
    items: articles.map((a) => ({
      title: a.data.title,
      description: a.data.dek,
      pubDate: a.data.date,
      link: `/news/${a.slug}/`,
      ...cardEnclosure(a.data.image || `/social/${a.slug}.png`),
    })),
  });
}
