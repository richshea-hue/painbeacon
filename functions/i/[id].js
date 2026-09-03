// PainBeacon — sponsor impression counter.
// Repo path: functions/i/[id].js   (Cloudflare Pages Functions auto-detects this.)
// SponsorCard.astro places a 1×1 image at /i/<sponsor-id>/?p=<page> inside the
// card, so one request lands here each time a browser renders the card.
//
// Counts a 'view' in Supabase (server-side; no cookie, no identity, no script)
// and returns a transparent GIF with no-store, so caching can never swallow
// the count. Supabase missing or down → still returns the pixel; a lost count
// is better than a broken image. Unknown sponsor → pixel, no count.
//
// Bots that fetch images are counted; the report says so. That is still far
// closer to "people who saw the card" than raw page requests.
import sponsorsFile from '../../data/sponsors.json';

const KNOWN = new Set((sponsorsFile.sponsors || []).map((s) => s.id));
const GIF = Uint8Array.from([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,0x00,0x00,0x00,
  0xff,0xff,0xff,0x21,0xf9,0x04,0x01,0x00,0x00,0x00,0x00,0x2c,0x00,0x00,0x00,0x00,
  0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,0x01,0x00,0x3b,
]);

export async function onRequestGet(context) {
  const { id } = context.params;
  const env = context.env || {};
  const page = (new URL(context.request.url).searchParams.get('p') || '').slice(0, 300);

  if (KNOWN.has(id) && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    // Don't make the browser wait on the count.
    context.waitUntil(
      fetch(`${env.SUPABASE_URL}/rest/v1/rpc/log_sponsor_event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ p_sponsor: id, p_event: 'view', p_path: page || null }),
      }).catch(() => {})
    );
  }

  return new Response(GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(GIF.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'X-Robots-Tag': 'noindex',
    },
  });
}
