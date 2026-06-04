import { getClinics, groupBy } from '../lib/data.js';
import { SITE } from '../lib/site.js';
import { ALL_TOPICS, MIN_CLINICS_FOR_TOPIC_PAGE } from '../lib/topics.js';

export async function GET() {
  const clinics = await getClinics();
  const urls = new Set(['/', '/pain-clinics/', '/how-we-rank/', '/ownership-disclosure/']);

  const byState = groupBy(clinics, (c) => c.stateSlug);
  for (const state of byState.keys()) urls.add(`/pain-clinics/${state}/`);

  const byCity = groupBy(clinics, (c) => `${c.stateSlug}|${c.citySlug}`);
  for (const [key, list] of byCity.entries()) {
    const [state, city] = key.split('|');
    urls.add(`/pain-clinics/${state}/${city}/`);
    if (list.length >= MIN_CLINICS_FOR_TOPIC_PAGE) {
      for (const topic of Object.keys(ALL_TOPICS)) urls.add(`/${topic}/${city}/`);
    }
  }
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
