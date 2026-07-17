import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '../lib/site.js';

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
    })),
  });
}
