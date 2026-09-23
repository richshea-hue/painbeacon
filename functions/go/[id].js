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
// Every request is classified before it is counted. This endpoint used to log
// a click on ANY GET, and because crawlers follow links while skipping the 1x1
// view pixel, the first flight reported 257 clicks where 5 had a same-site
// referrer. The bot verdict is stored as a boolean; the user-agent it was
// derived from is not, because /privacy promises no device identifier. The
// redirect itself is never gated — a bot still gets sent on its way, it just
// does not land in the sponsor's numbers as a person.
//
// The destination comes from data/sponsors.json, never from the query string,
// so this can't be used as an open redirect.
import sponsorsFile from '../../data/sponsors.json';
import { isBot, isSameSite } from '../_lib/bot.js';

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
          // Kept only when it is one of our own pages. An off-site referrer is
          // not ours to hand to an advertiser, and a crawler's is noise.
          p_referrer: isSameSite(context.request, reqUrl)
            ? (context.request.headers.get('referer') || '').slice(0, 300) || null
            : null,
          p_bot: isBot(context.request),
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
