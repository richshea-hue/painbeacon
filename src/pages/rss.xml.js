import rss from '@astrojs/rss';
import { getArticlesNewestFirst } from '../lib/articles.js';
import { statSync } from 'node:fs';
import { SITE } from '../lib/site.js';

// Image enclosure per item so RSS-to-social automation (dlvr.it etc.) attaches
// the article's 1:1 share photo to each post instead of a bare link. RSS
// enclosures require a byte length, so stat the file at build time; skip if
// missing.
function cardEnclosure(webPath) {
  try {
    const size = statSync(new URL(`../../public${webPath}`, import.meta.url)).size;
    const type = webPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return { enclosure: { url: new URL(webPath, SITE.url).href, length: size, type } };
  } catch {
    return {};
  }
}

// Hotlinked Unsplash heroes have no local file to stat, and statSync failing
// silently returns {} — which would drop the enclosure and leave dlvr.it posting
// to Facebook and X with no photo. Ask the CDN for the length instead. A HEAD
// that fails still degrades to no enclosure, same as a missing local file, but
// it is no longer the default outcome for every Unsplash-illustrated article.
async function remoteEnclosure(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    const len = Number(r.headers.get('content-length'));
    if (!r.ok || !Number.isFinite(len) || len <= 0) return {};
    return { enclosure: { url, length: len, type: r.headers.get('content-type') || 'image/jpeg' } };
  } catch {
    return {};
  }
}

export async function GET(context) {
  const articles = await getArticlesNewestFirst();
  return rss({
    title: `${SITE.name} — News & guides`,
    description:
      'Weekly guides and analysis from the PainBeacon editorial desk: how to choose ' +
      'the right kind of pain clinic, treatments explained in plain English, and how ' +
      'our rankings work.',
    site: context.site,
    // Promise.all, not a bare map: remoteEnclosure does a HEAD request, so the
    // per-item spread has to be awaited before rss() sees the items.
    items: await Promise.all(
      articles.map(async (a) => ({
        title: a.data.title,
        description: a.data.dek,
        pubDate: a.data.date,
        link: `/news/${a.slug}/`,
        ...(a.data.heroRemote
          ? await remoteEnclosure(`${a.data.heroRemote}&w=1200&h=1200&fit=crop&crop=entropy&q=80`)
          : cardEnclosure(a.data.shareImg || a.data.image || `/social/${a.slug}.png`)),
      }))
    ),
  });
}
