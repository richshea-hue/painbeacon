// node --test scripts/lib/feed-item.test.mjs
// Pins the parts of announcing an article that fail silently and in public: the
// wrong item, mangled punctuation, a post rejected for length it did not have.
// Markup here is shaped like what src/pages/rss.xml.js actually emits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, decodeXml, firstItem, graphemes, postText } from './feed-item.mjs';

const FEED = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>PainBeacon — News &amp; guides</title><link>https://painbeacon.com/</link><atom:link rel="hub" href="https://websubhub.com/hub"/><item><title>Spinal Cord Stimulators: Who They&apos;re For and What a Trial Involves</title><link>https://painbeacon.com/news/spinal-cord-stimulator-trial/</link><guid isPermaLink="true">https://painbeacon.com/news/spinal-cord-stimulator-trial/</guid><description>A trial comes first &amp; nothing is implanted until it works.</description><pubDate>Wed, 23 Sep 2026 00:00:00 GMT</pubDate><enclosure url="https://painbeacon.com/images/news/x/photo-share.jpg" length="96296" type="image/jpeg"/></item><item><title>Last week</title><link>https://painbeacon.com/news/older/</link><description>Older.</description><pubDate>Wed, 16 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>`;

test('reads the newest item, and only that one', () => {
  const item = firstItem(FEED);
  assert.equal(item.title, "Spinal Cord Stimulators: Who They're For and What a Trial Involves");
  assert.equal(item.link, 'https://painbeacon.com/news/spinal-cord-stimulator-trial/');
  assert.equal(item.pubDate, 'Wed, 23 Sep 2026 00:00:00 GMT');
  assert.equal(item.image, 'https://painbeacon.com/images/news/x/photo-share.jpg');
  // Walking the whole feed would post the archive on the announcer's first run.
  assert.ok(!item.title.includes('Last week'));
});

test('the channel title is not mistaken for the item title', () => {
  // <title> appears on the channel first. Scoping to the <item> block is what
  // keeps the post from being headlined "PainBeacon — News & guides".
  assert.equal(firstItem(FEED).title.startsWith('Spinal'), true);
});

test('entities come back as the characters a reader typed', () => {
  assert.equal(firstItem(FEED).description, 'A trial comes first & nothing is implanted until it works.');
  assert.equal(decodeXml('&lt;b&gt;'), '<b>');
  assert.equal(decodeXml('&quot;quoted&quot;'), '"quoted"');
  assert.equal(decodeXml('&#8212;&#x2014;'), '——');
  assert.equal(decodeXml('<![CDATA[raw & unescaped]]>'), 'raw & unescaped');
});

test('&amp; decodes last, so escaped markup stays escaped', () => {
  // The trap: decode &amp; first and "&amp;lt;" becomes "&lt;" and then "<",
  // inventing a tag the article never contained.
  assert.equal(decodeXml('&amp;lt;script&amp;gt;'), '&lt;script&gt;');
});

test('a feed with no items is null, not a half-built post', () => {
  assert.equal(firstItem('<rss><channel><title>Empty</title></channel></rss>'), null);
  assert.equal(firstItem(''), null);
  assert.equal(firstItem(undefined), null);
});

test('an item with no enclosure yields no image rather than throwing', () => {
  const noPhoto = '<rss><channel><item><title>T</title><link>https://painbeacon.com/news/t/</link><description>D</description></item></channel></rss>';
  assert.deepEqual(firstItem(noPhoto), {
    title: 'T',
    description: 'D',
    link: 'https://painbeacon.com/news/t/',
    pubDate: '',
    image: '',
  });
});

test('length is counted in graphemes, not code units', () => {
  // '👍' is 2 code units and 'é' written as e + U+0301 is 2. Counting with
  // .length would reject posts that fit and truncate ones that did not need it.
  assert.equal(graphemes('👍').length, 1);
  assert.equal('👍'.length, 2);
  assert.equal(graphemes('é').length, 1);
});

test('clamp leaves short text alone and marks what it cuts', () => {
  assert.equal(clamp('short', 300), 'short');
  assert.equal(clamp('abcdefghij', 10), 'abcdefghij');
  const cut = clamp('abcdefghijk', 10);
  assert.equal(graphemes(cut).length, 10);
  assert.ok(cut.endsWith('…'));
});

test('clamp never splits a grapheme in half', () => {
  const cut = clamp('👍👍👍👍👍', 3);
  assert.equal(graphemes(cut).length, 3);
  assert.equal(cut, '👍👍…');
});

test('the post leads with the dek, falling back to the title', () => {
  assert.equal(postText(firstItem(FEED), 300), 'A trial comes first & nothing is implanted until it works.');
  assert.equal(postText({ title: 'Only a title' }, 300), 'Only a title');
  assert.equal(postText({}, 300), '');
  assert.equal(postText(null, 300), '');
});

test('a dek longer than the limit is trimmed to fit it exactly', () => {
  const long = 'x'.repeat(400);
  assert.equal(graphemes(postText({ description: long }, 300)).length, 300);
});
