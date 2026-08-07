// Contributions.
//
// A place is not bought. Nothing in this file gates anything: someone can take
// their place, practise every day and contribute nothing, and no screen, email
// or query will treat them differently or mention it. "Skip for now" is a real
// answer and it is never made to feel like one.
//
// So this is a side door, not a checkout. It exists because John's work costs
// something and some people want to meet that, whenever they want to, more
// than once if they like.

import { json, bad } from './api.js';

const STRIPE = 'https://api.stripe.com/v1';

// Stripe requires a minimum charge; below roughly this the fees eat it whole.
const MINIMUM = 100;              // £1.00, in the smallest unit
const REPLAY_WINDOW = 5 * 60;     // seconds a webhook signature stays valid

// ---------------------------------------------------------------------------
// POST /api/contribution  →  a Checkout session to send them to
// ---------------------------------------------------------------------------
export async function postContribution(env, { person, run }, body) {
  if (!env.STRIPE_SECRET_KEY) return bad(503, 'contributions are not set up yet');

  const currency = (run.currency || 'gbp').toLowerCase();

  // The amount is the person's to choose. A suggestion is offered and can be
  // typed over; it is a default, never a floor beyond Stripe's own.
  const suggested = Number.isInteger(run.suggested_amount) ? run.suggested_amount : null;
  const preset = Math.max(MINIMUM, suggested || MINIMUM);

  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': currency,
    'line_items[0][price_data][product_data][name]': `${run.name} — a contribution`,
    'line_items[0][price_data][custom_unit_amount][enabled]': 'true',
    'line_items[0][price_data][custom_unit_amount][preset]': String(preset),
    'line_items[0][price_data][custom_unit_amount][minimum]': String(MINIMUM),
    client_reference_id: String(person.id),
    'metadata[person_id]': String(person.id),
    'metadata[run_slug]': run.slug,
    customer_email: person.email,
    success_url: `${env.APP_URL}?thanks=1`,
    cancel_url: `${env.APP_URL}`,
  });

  const res = await fetch(`${STRIPE}/checkout/sessions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  if (!res.ok) {
    console.error('stripe session', res.status, (await res.text()).slice(0, 400));
    return bad(502, 'could not open the contribution page');
  }

  const session = await res.json();
  return json({ url: session.url });
}

// ---------------------------------------------------------------------------
// POST /api/stripe/webhook
// ---------------------------------------------------------------------------
// Anyone can POST here, so nothing is believed without a valid signature. The
// body is read as text and verified before it is parsed: parsing first would
// mean acting on numbers nobody has proved came from Stripe.
export async function stripeWebhook(env, request) {
  if (!env.STRIPE_WEBHOOK_SECRET) return bad(503, 'not set up');

  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') || '';

  if (!(await signatureValid(env.STRIPE_WEBHOOK_SECRET, payload, signature))) {
    return bad(400, 'bad signature');
  }

  let event;
  try { event = JSON.parse(payload); } catch { return bad(400, 'bad json'); }

  if (event.type !== 'checkout.session.completed') return json({ ok: true, ignored: event.type });

  const session = event.data?.object || {};
  if (session.payment_status !== 'paid') return json({ ok: true, ignored: 'unpaid' });

  const personId = Number(session.metadata?.person_id || session.client_reference_id);
  const amount = Number(session.amount_total);
  if (!Number.isInteger(personId) || !Number.isInteger(amount) || amount <= 0) {
    return bad(400, 'nothing to record');
  }

  // Stripe retries until it gets a 2xx, so the same session can arrive several
  // times. The unique constraint makes the second one a no-op rather than a
  // second contribution.
  await env.DB.prepare(
    `INSERT INTO contribution (person_id, amount, currency, stripe_ref)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (stripe_ref) DO NOTHING`,
  ).bind(personId, amount, String(session.currency || 'gbp'), String(session.id)).run();

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Stripe's scheme: `t=<unix>,v1=<hex hmac of "t.payload">`
// ---------------------------------------------------------------------------
async function signatureValid(secret, payload, header) {
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=', 2)).filter((p) => p.length === 2),
  );
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) return false;

  // Without this an old signed payload could be replayed for ever.
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > REPLAY_WINDOW) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`),
  ));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');

  return timingSafeEqual(expected, String(parts.v1 || ''));
}

/** Comparing with === leaks how much of the digest matched, through timing. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
