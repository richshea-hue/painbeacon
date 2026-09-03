// One door to the article collection, so `draft: true` means the same thing
// everywhere: the article is absent from the build — no page, no feed entry,
// no sitemap line, no homepage card. Set SHOW_DRAFTS=1 to preview a draft
// locally. Every consumer goes through here rather than calling
// getCollection('articles') directly, which is how a draft used to leak.
import { getCollection } from 'astro:content';

export async function getArticles() {
  const all = await getCollection('articles');
  const showDrafts = process.env.SHOW_DRAFTS === '1';
  return all.filter((a) => showDrafts || a.data.draft !== true);
}

export async function getArticlesNewestFirst() {
  return (await getArticles()).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
