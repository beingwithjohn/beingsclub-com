// The Practice Log worker.
//
// Everything the log cannot do as a static page: hold shared state, know who
// the visitor is, and send mail on a schedule. Nothing else.

import { identify, identifyInvite } from './auth.js';
import {
  json, bad, getState, getDay, postMark, postNote, postMessage,
  patchSettings, postRevoke, getInvite, postPlace,
} from './api.js';
import { hostRoute } from './host.js';
import { runNudges } from './nudge.js';
import { postContribution, stripeWebhook } from './contribution.js';
import { postLogin } from './login.js';
import { postJoin } from './join.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const cors = corsHeaders(env, origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (!url.pathname.startsWith('/api/')) {
      return withCors(new Response('Not found', { status: 404 }), cors);
    }

    // A browser call must come from the app's own origin. Requests with no
    // Origin at all (curl, a mail scanner) are left alone here — they still
    // have to present a bearer token, and no GET writes anything.
    if (origin && !allowedOrigin(env, origin)) return withCors(bad(403, 'origin'), cors);

    try {
      return withCors(await route(request, env, ctx, url), cors);
    } catch (err) {
      console.error('unhandled', err?.stack || err);
      return withCors(bad(500, 'server'), cors);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runNudges(env, event.scheduledTime || Date.now()));
  },
};

async function route(request, env, ctx, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/health' && method === 'GET') return json({ ok: true });

  // The one evergreen log is open to anyone. This never returns a credential:
  // it sends the long-lived link to the address that will own it.
  if (path === '/api/join' && method === 'POST') {
    const body = await readJson(request);
    if (body === undefined) return bad(400, 'bad json');
    return postJoin(env, body);
  }

  // Stripe calls this, not a browser. It carries no session and proves itself
  // with a signature instead.
  if (path === '/api/stripe/webhook' && method === 'POST') return stripeWebhook(env, request);

  // Anybody can ask for their link back. It posts the same link they already
  // had to the address it already belongs to, so it grants nothing — and it
  // answers identically whether or not the address is anybody's.
  if (path === '/api/login' && method === 'POST') {
    const body = await readJson(request);
    if (body === undefined) return bad(400, 'bad json');
    return postLogin(env, body);
  }

  // The invitation: a weaker credential reaching exactly two endpoints, one
  // that reads the threshold and one that accepts it. Nothing else takes it.
  if (path === '/api/invite' || path === '/api/place') {
    const invited = await identifyInvite(env, request);
    if (!invited) return bad(401, 'no');
    if (path === '/api/invite' && method === 'GET') return getInvite(env, invited);
    if (path === '/api/place' && method === 'POST') {
      const body = await readJson(request);
      if (body === undefined) return bad(400, 'bad json');
      return postPlace(env, invited, body);
    }
    return bad(405, 'method');
  }

  const who = await identify(env, request);
  if (!who) return bad(401, 'no');

  // Someone who has left keeps their link and their record, and can read it.
  // They are simply no longer counted, and nothing new can be written.
  const readOnly = !!who.person.left_at;

  if (path.startsWith('/api/host/')) {
    if (!who.person.is_host) return bad(404, 'not found');
    return hostRoute(env, request, url, who);
  }

  if (path === '/api/state' && method === 'GET') return getState(env, who);
  if (path === '/api/day' && method === 'GET') return getDay(env, who, url);

  if (method === 'POST' || method === 'PATCH') {
    if (readOnly) return bad(409, 'closed');
    const body = await readJson(request);
    if (body === undefined) return bad(400, 'bad json');

    if (path === '/api/mark' && method === 'POST') return postMark(env, who, body);
    if (path === '/api/note' && method === 'POST') return postNote(env, who, body);
    if (path === '/api/message' && method === 'POST') return postMessage(env, who, body);
    if (path === '/api/settings' && method === 'PATCH') return patchSettings(env, who, body);
    if (path === '/api/settings/revoke' && method === 'POST') return postRevoke(env, who);
    if (path === '/api/contribution' && method === 'POST') return postContribution(env, who, body);
  }

  return bad(404, 'not found');
}

async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return {};
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
function allowedOrigins(env) {
  return String(env.APP_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * An entry may end in `:*` to allow any port on that host — for local work,
 * where the static server's port is assigned rather than chosen. Production
 * sets one exact origin in wrangler.toml, so this never widens the live API;
 * it can only do what the configuration it is given says.
 *
 * The remainder after the prefix must be all digits, so `http://localhost:*`
 * matches `http://localhost:4173` and refuses `http://localhost:1.evil.com`.
 */
export function originAllowed(allowedList, origin) {
  return allowedList.some((allowed) => {
    if (!allowed.endsWith(':*')) return allowed === origin;
    const prefix = allowed.slice(0, -1);
    return origin.startsWith(prefix) && /^\d+$/.test(origin.slice(prefix.length));
  });
}

function allowedOrigin(env, origin) {
  return originAllowed(allowedOrigins(env), origin);
}

function corsHeaders(env, origin) {
  const allow = origin && allowedOrigin(env, origin) ? origin : allowedOrigins(env)[0] || '';
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function withCors(response, cors) {
  const r = new Response(response.body, response);
  for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
  return r;
}
