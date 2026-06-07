// PainBeacon — postcard QR redirect endpoint.
// Repo path: functions/c/[token].js   (Cloudflare Pages Functions auto-detects this.)
// The QR on each card encodes: https://painbeacon.com/c/<token>
//
// On scan: logs the scan in Supabase (server-side, so it counts even if JS is off),
// then sends the visitor to their own clinic profile with the claim form pre-opened.
// Uses the SUPABASE_URL / SUPABASE_ANON_KEY env vars already set on the Pages project.

export async function onRequestGet(context) {
  const { token } = context.params;
  const env = context.env;
  const origin = new URL(context.request.url).origin;

  let slug = null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/log_postcard_scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_token: token }),
    });
    if (res.ok) {
      const data = await res.json();            // scalar text: the slug, or null
      slug = typeof data === "string" ? data : (Array.isArray(data) ? data[0] : null);
    }
  } catch (_e) {
    // network/Supabase hiccup — still send them somewhere useful below
  }

  const dest = slug
    ? `${origin}/clinic/${slug}/?claim=1&src=postcard&t=${encodeURIComponent(token)}`
    : `${origin}/?src=postcard`;

  return Response.redirect(dest, 302);
}
