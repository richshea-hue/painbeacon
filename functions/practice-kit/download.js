// PainBeacon — gated Practice Kit download.
// Repo path: functions/practice-kit/download.js  →  GET /practice-kit/download?t=<token>
//
// The kit (five front-desk forms, see /practice-kit/) is free for claimed and
// verified listings. The link in the verification email carries a signed
// per-clinic token from scripts/kit-link.mjs. On each request this:
//   1. verifies the token against KIT_SECRET (no secret → 503, bad token → 403);
//   2. checks the listing's LIVE tier in clinics_public, so a link stops working
//      if a listing is ever moved back to free (Supabase down → fail open, the
//      signature is the real gate);
//   3. counts the download (best effort, log_kit_download RPC — see
//      kit_downloads_table.sql) and streams the zip from its secret path
//      through ASSETS with a download disposition.
//
// Uses SUPABASE_URL / SUPABASE_ANON_KEY already on the Pages project, plus
// KIT_SECRET, which must be set for BOTH build and functions (the build script
// derives the file path from it).
import { verifyToken, kitAssetPath, KIT_FILENAME } from '../_lib/kit.js';

const ALLOWED_TIERS = new Set(['verified', 'enhanced', 'featured']);

function page(status, title, body) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${title} — PainBeacon</title>
<style>body{margin:0;background:#f7f4ed;color:#1c2b2a;font:17px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:34rem;margin:12vh auto;padding:0 1.25rem}h1{font-size:1.5rem;margin:0 0 .6rem}p{margin:0 0 1rem;color:#4c5b59}
a{color:#0a4f46;font-weight:600}.brand{font-weight:700;color:#0a4f46;margin-bottom:2rem}</style></head>
<body><main><div class="brand">PainBeacon</div><h1>${title}</h1>${body}
<p><a href="/practice-kit/">About the Practice Kit</a> · <a href="/for-practices/">For practices</a></p></main></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = (url.searchParams.get('t') || '').trim();

  if (!env.KIT_SECRET) {
    return page(503, 'The kit isn’t available yet',
      '<p>The download isn’t switched on for this site right now. If you were sent this link, please reply to that email and we’ll sort it out.</p>');
  }

  const npi = await verifyToken(env.KIT_SECRET, token);
  if (!npi) {
    return page(403, 'This link isn’t valid',
      '<p>Download links are sent to practices once their listing is claimed and verified, and each one is specific to that practice. If yours was cut off in an email, try copying the whole address. If it still doesn’t work, reply to the email it came in and we’ll send a fresh one.</p>');
  }

  // Live tier check: the link is only good while the listing stays verified.
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    const headers = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` };
    try {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/clinics_public?select=listing_tier&npi=eq.${npi}&limit=1`, { headers });
      if (r.ok) {
        const rows = await r.json();
        const tier = rows[0] && rows[0].listing_tier;
        if (!rows.length || !ALLOWED_TIERS.has(tier)) {
          return page(403, 'This listing isn’t verified',
            '<p>The kit is for practices whose PainBeacon listing is claimed and verified. This listing isn’t showing as verified right now. If you think that’s wrong, reply to the email your link came in and we’ll take a look.</p>');
        }
      }
    } catch (_e) {
      // Supabase hiccup: the signed token is the real gate, so let it through.
    }

    const log = fetch(`${env.SUPABASE_URL}/rest/v1/rpc/log_kit_download`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_npi: npi, p_ua: (request.headers.get('user-agent') || '').slice(0, 300) || null }),
    }).catch(() => {});
    if (context.waitUntil) context.waitUntil(log); else await log;
  }

  const asset = await env.ASSETS.fetch(new URL(await kitAssetPath(env.KIT_SECRET), url));
  if (!asset.ok) {
    return page(503, 'The kit file is missing',
      '<p>The link is good but the file isn’t where it should be — most likely the site was deployed without the kit. Please reply to the email your link came in and we’ll fix it.</p>');
  }

  return new Response(asset.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${KIT_FILENAME}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
