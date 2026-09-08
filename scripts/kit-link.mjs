// Mint a Practice Kit download link for one verified clinic.
//
//   npm run kit:link -- <10-digit NPI>
//   node --env-file=.env scripts/kit-link.mjs <npi> [--origin https://painbeacon.com]
//
// Paste the printed URL into the verification email. The link is signed with
// KIT_SECRET (functions/_lib/kit.js) and checked live against the listing's
// tier by functions/practice-kit/download.js, so it only works while the
// listing stays verified, and rotating KIT_SECRET voids every link at once.
//
// If Supabase credentials are in the environment the clinic's name and tier are
// printed too, so you can see who you're sending it to and catch a not-yet-
// approved listing before the clinic hits a 403.
import { signNpi } from '../functions/_lib/kit.js';

const args = process.argv.slice(2);
const npi = args.find((a) => /^\d{10}$/.test(a));
const oi = args.indexOf('--origin');
const origin = (oi > -1 && args[oi + 1] ? args[oi + 1] : 'https://painbeacon.com').replace(/\/$/, '');

if (!process.env.KIT_SECRET) {
  console.error('KIT_SECRET is not set. Run with: node --env-file=.env scripts/kit-link.mjs <npi>');
  process.exit(1);
}
if (!npi) {
  console.error('Usage: node --env-file=.env scripts/kit-link.mjs <10-digit NPI> [--origin https://painbeacon.com]');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/clinics_public?select=name,city,state,listing_tier&npi=eq.${npi}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const rows = r.ok ? await r.json() : [];
    if (!rows.length) console.warn(`! No clinic with NPI ${npi} in clinics_public — the link will be refused.`);
    else {
      const c = rows[0];
      console.log(`${c.name} — ${c.city}, ${c.state} — tier: ${c.listing_tier}`);
      if (!['verified', 'enhanced', 'featured'].includes(c.listing_tier)) console.warn('! Listing is not verified yet; approve the claim first or the link answers 403.');
    }
  } catch (_e) {
    console.warn('! Could not look the clinic up (network?) — printing the link anyway.');
  }
}

console.log(`${origin}/practice-kit/download?t=${await signNpi(process.env.KIT_SECRET, npi)}`);
