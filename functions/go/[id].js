// PainBeacon — sponsor click redirect.
// Repo path: functions/go/[id].js   (Cloudflare Pages Functions auto-detects this.)
// Every SponsorCard link points at https://painbeacon.com/go/<sponsor-id>/?p=<page>
//
// On click: counts the click in Supabase (server-side, so it counts with JS off
// and ships no script — the privacy page depends on that), then 302s
// to the sponsor's landing page with UTM tags so the sponsor sees us in their
// own analytics. Unknown or inactive sponsor → home. Supabase down → still
// redirect; a lost count is better than a dead link.
//
// The destination comes from data/sponsors.json, never from the query string,
// so this can't be used as an open redirect.
import sponsorsFile from '../../data/sponsors.json';

const SPONSORS = new Map((sponsorsFile.sponsors || []).map((s) => [s.id, s]));

export async function onRequestGet(context) {
  const { id } = context.params;
  const env = context.env || {};
  const reqUrl = new URL(context.request.url);
  const origin = reqUrl.origin;
  const page = (reqUrl.searchParams.get('p') || '').slice(0, 300);

  const s = SPONSORS.get(id);
  if (!s || !s.url) return Response.redirect(`${origin}/`, 302);

  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/log_sponsor_event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_sponsor: id,
          p_event: 'click',
          p_path: page || null,
          p_referrer: (context.request.headers.get('referer') || '').slice(0, 300) || null,
        }),
      });
    } catch (_e) {
      // Counting is best-effort.
    }
  }

  const dest = new URL(s.url);
  dest.searchParams.set('utm_source', 'painbeacon');
  dest.searchParams.set('utm_medium', 'sponsor');
  dest.searchParams.set('utm_campaign', id);
  if (page) dest.searchParams.set('utm_content', page);
  return Response.redirect(dest.toString(), 302);
}
