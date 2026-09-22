// Which Supabase credential did this repo actually get given?
//
// Seven names are in use across scripts/ and functions/ for three
// credentials — SUPABASE_SERVICE_KEY (the Python backfills), SERVICE_ROLE_KEY
// (.env.example), SECRET_KEY (Supabase's 2025 naming), plus SUPABASE_KEY,
// ANON_KEY and PUBLISHABLE_KEY. A script that insists on one spelling fails
// with "required" on a machine where the credential is sitting right there
// under another name, which is a confusing way to lose an evening.
//
// Reading several names is the fix. Quietly accepting the WRONG CLASS of key
// is not: the anon/publishable key cannot read sponsor_events or backlinks —
// both are RLS default-deny with no anon policy — so it would return 401 or an
// empty set, which reads as "no data" rather than "wrong key".

const PRIVILEGED = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_SECRET_KEY'];
const PUBLIC = ['SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_KEY'];

/**
 * The service-role key under any of its names, or null.
 *
 * `what` names the table in the error, since "which key" is never the useful
 * half of the question — "which key, for what" is.
 */
export function serviceKey(env = process.env) {
  for (const name of PRIVILEGED) {
    const v = (env[name] || '').trim();
    if (v) return { key: v, name };
  }
  return null;
}

/** The message to print when there isn't one. Names what was searched. */
export function missingKeyMessage(env = process.env, what = 'this table') {
  const url = (env.SUPABASE_URL || '').trim();
  const publicOnly = PUBLIC.filter((n) => (env[n] || '').trim());
  const lines = [];
  if (!url) lines.push('SUPABASE_URL is not set.');
  lines.push(`No service-role key found. Looked for: ${PRIVILEGED.join(', ')}.`);
  if (publicOnly.length) {
    lines.push(
      `Found ${publicOnly.join(' and ')}, but ${what} is RLS default-deny with no`,
      'anon policy, so a publishable/anon key reads back empty rather than failing',
      'loudly. Add the service-role (or "secret") key from Supabase → Settings →',
      'API Keys as SUPABASE_SERVICE_ROLE_KEY in .env.'
    );
  } else {
    lines.push('Add it to .env as SUPABASE_SERVICE_ROLE_KEY (see .env.example).');
  }
  return lines.join('\n');
}
