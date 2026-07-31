// The magic link is the session. There are no passwords anywhere.
//
// Only a hash of the token is stored, so a copy of the person table is not a
// set of working links. Revoking from Settings issues a new one and the old
// link stops resolving on the next request.

const B64URL = /^[A-Za-z0-9_-]{22,86}$/;

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64url(bytes);
}

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Bearer header, or nothing. Tokens are never read from the query string. */
export function bearer(request) {
  const h = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) return null;
  return B64URL.test(m[1]) ? m[1] : null;
}

/** The person this request is, with their run, or null. */
export async function identify(env, request) {
  const token = bearer(request);
  if (!token) return null;

  const row = await env.DB.prepare(
    `SELECT p.*, r.slug AS run_slug, r.name AS run_name, r.mode, r.starts_on,
            r.length_days, r.week_labels, r.standfirst
       FROM person p JOIN run r ON r.id = p.run_id
      WHERE p.token_hash = ?1`,
  ).bind(await hashToken(token)).first();

  if (!row) return null;

  return {
    person: {
      id: row.id, run_id: row.run_id, name: row.name, email: row.email,
      timezone: row.timezone, nudge_hour: row.nudge_hour,
      nudge_on: !!row.nudge_on, notes_on: !!row.notes_on,
      is_host: !!row.is_host, joined_on: row.joined_on, left_at: row.left_at,
      setup_at: row.setup_at,
    },
    run: {
      id: row.run_id, slug: row.run_slug, name: row.run_name, mode: row.mode,
      starts_on: row.starts_on, length_days: row.length_days,
      week_labels: row.week_labels ? JSON.parse(row.week_labels) : null,
      standfirst: row.standfirst,
    },
  };
}

// ---------------------------------------------------------------------------
// sealing
// ---------------------------------------------------------------------------
// The mailer needs the token back to build the link. AES-GCM under a key held
// in `wrangler secret put LINK_KEY`, so the database on its own opens nothing.

async function linkKey(env) {
  if (!env.LINK_KEY) throw new Error('LINK_KEY is not set');
  const raw = Uint8Array.from(atob(env.LINK_KEY), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error('LINK_KEY must be 32 bytes, base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(env, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, await linkKey(env), new TextEncoder().encode(token),
  ));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  return b64url(out);
}

export async function unseal(env, sealed) {
  const raw = Uint8Array.from(
    atob(String(sealed).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0),
  );
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: raw.slice(0, 12) }, await linkKey(env), raw.slice(12),
  );
  return new TextDecoder().decode(pt);
}

/** Mint a token and both of its stored forms in one go. */
export async function mintToken(env) {
  const token = newToken();
  return { token, token_hash: await hashToken(token), token_enc: await seal(env, token) };
}

/** The link that goes in every email. A GET on it must never write anything. */
export function logUrl(env, token) {
  return `${env.APP_URL}?t=${encodeURIComponent(token)}`;
}
