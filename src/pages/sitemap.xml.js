import { getCollection } from 'astro:content';
import { getClinics, groupBy } from '../lib/data.js';
import { SITE } from '../lib/site.js';
import { ALL_TOPICS, MIN_CLINICS_FOR_TOPIC_PAGE } from '../lib/topics.js';

export async function GET() {
  const clinics = await getClinics();
  const urls = new Set(['/', '/pain-clinics/', '/news/', '/how-we-rank/', '/for-practices/', '/ownership-disclosure/', '/privacy/']);

  // News articles: /news/[slug]/
  for (const a of await getCollection('articles')) urls.add(`/news/${a.slug}/`);

  // State hubs: /pain-clinics/[state]/
  const byState = groupBy(clinics, (c) => c.stateSlug);
  for (const state of byState.keys()) urls.add(`/pain-clinics/${state}/`);

  // Zone pages: /pain-clinics/[state]/[zone]/
  // Mirror the [state]/[zone].astro route exactly: one page per distinct zone
  // among deduped (primary) clinics that carry a zoneSlug. This replaces the
  // old city-based geo URLs, which now 404 after the zone migration.
  const primaries = clinics.filter((c) => c.isPrimary && c.zoneSlug);
  const byZone = groupBy(primaries, (c) => c.zoneSlug);
  for (const list of byZone.values()) {
    const c0 = list[0];
    urls.add(`/pain-clinics/${c0.stateSlug}/${c0.zoneUrlSlug}/`);
  }

  // Topic × city pages: /[topic]/[city]/
  // Only where the city clears the thin-page threshold, matching the gating in
  // the [topic]/[city].astro route. (With the current threshold this emits
  // nothing — topic pages are dormant — but it stays in lockstep with the route.)
  const byCity = groupBy(clinics, (c) => `${c.stateSlug}|${c.citySlug}`);
  for (const [key, list] of byCity.entries()) {
    const [, city] = key.split('|');
    if (list.length >= MIN_CLINICS_FOR_TOPIC_PAGE) {
      for (const topic of Object.keys(ALL_TOPICS)) urls.add(`/${topic}/${city}/`);
    }
  }

  // Clinic profiles: /clinic/[slug]/ (built for every clinic)
  for (const c of clinics) urls.add(`/clinic/${c.slug}/`);

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...urls]
      .map((u) => `  <url><loc>${new URL(u, SITE.url).href}</loc></url>`)
      .join('\n') +
    `\n</urlset>\n`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
