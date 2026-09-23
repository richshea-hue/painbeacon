// Reading our own RSS feed back, and sizing a post to fit a social character
// limit.
//
// Pure functions, no network, so scripts/lib/feed-item.test.mjs can pin the
// parts that get a post wrong in ways nobody notices until it is public.
// scripts/post-to-bluesky.mjs does the fetching and the posting.
//
// This is deliberately NOT a general XML parser. The feed it reads is the one
// src/pages/rss.xml.js generates with @astrojs/rss, from our own content, so
// the shape is known and stable. A dependency-free reader is what lets the
// announce workflow run on a bare runner with no npm install.

/**
 * XML text back to plain text.
 *
 * Order matters: &amp; is decoded LAST. Do it first and "&amp;lt;" — which is
 * how a literal "&lt;" in a dek reaches the feed — decodes to "&lt;" and then
 * to "<", inventing markup that was never in the article.
 */
export function decodeXml(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/**
 * The newest item in the feed, or null if there is none.
 *
 * Only ever the first — an announcer that walked the whole feed would post the
 * archive the first time it ran.
 */
export function firstItem(xml) {
  const block = String(xml ?? '').match(/<item>([\s\S]*?)<\/item>/);
  if (!block) return null;
  const item = block[1];

  const tag = (name) => {
    const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
    return m ? decodeXml(m[1]).trim() : '';
  };

  // The enclosure is the share photo dlvr.it attaches and the link card's
  // thumbnail. Self-closing, so it is read as an attribute, not a tag body.
  const enclosure = item.match(/<enclosure\b[^>]*\burl="([^"]+)"/);

  return {
    title: tag('title'),
    description: tag('description'),
    link: tag('link'),
    pubDate: tag('pubDate'),
    image: enclosure ? decodeXml(enclosure[1]) : '',
  };
}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * Graphemes, not code units. Bluesky counts what a reader would call a
 * character, so an emoji is 1 and not 2, and an accented letter written as a
 * combining pair is 1 and not 2. Counting with .length rejects posts that fit.
 */
export const graphemes = (s) => Array.from(segmenter.segment(String(s ?? '')), (g) => g.segment);

/** Trim to `max` graphemes, spending the last one on an ellipsis. */
export function clamp(text, max) {
  const g = graphemes(text);
  if (g.length <= max) return String(text ?? '');
  return `${g.slice(0, max - 1).join('').trimEnd()}…`;
}

/**
 * The text of the post itself.
 *
 * The dek, not the title: a link card already renders the headline and the
 * photo, so leading with the title shows it twice. The dek is written to stand
 * alone in a feed — it is the same string the RSS description carries and the
 * one dlvr.it puts on X. Falls back to the title when an article has no dek.
 */
export const postText = (item, max) => clamp(item?.description || item?.title || '', max);
