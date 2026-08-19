// Giving.
//
// Beings Club offers the work first. A later gift does not buy the Practice
// Log, a place in a Sit, or different care. This is therefore a public side
// door with no Practice Log identity attached to it.

import { json, bad } from './api.js';

const STRIPE = 'https://api.stripe.com/v1';
const MINIMUM = 100;              // £1.00, in the smallest unit
const MAXIMUM = 99999999;         // Stripe's eight-digit unit-amount ceiling
const REPLAY_WINDOW = 5 * 60;     // seconds a webhook signature stays valid

// ---------------------------------------------------------------------------
// POST /api/giving  →  a Checkout session to send the giver to
// ---------------------------------------------------------------------------
export async function postGiving(env, body) {
  if (!env.STRIPE_SECRET_KEY) return bad(503, 'giving is not set up yet');

  const cadence = body?.cadence || 'once';
  const amount = Number(body?.amount);
  if (!['once', 'monthly'].includes(cadence)) return bad(400, 'cadence');
  if (!Number.isInteger(amount) || amount < MINIMUM || amount > MAXIMUM) {
    return bad(400, 'amount');
  }

  const form = new URLSearchParams({
    mode: cadence === 'monthly' ? 'subscription' : 'payment',
    success_url: `${givingUrl(env)}?thanks=1`,
    cancel_url: givingUrl(env),
    'metadata[source]': 'giving',
    'metadata[cadence]': cadence,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'gbp',
    'line_items[0][price_data][product_data][name]': cadence === 'monthly'
      ? 'Monthly gift to Beings Club'
      : 'Gift to Beings Club',
    'line_items[0][price_data][unit_amount]': String(amount),
  });
  if (cadence === 'monthly') {
    form.set('line_items[0][price_data][recurring][interval]', 'month');
    form.set('subscription_data[metadata][source]', 'giving');
  }

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
    return bad(502, 'could not open Stripe');
  }

  const session = await res.json();
  return json({ url: session.url });
}

function givingUrl(env) {
  return String(env.GIVING_URL || 'https://beingsclub.com/giving/').replace(/\/+$/, '/');
}

// ---------------------------------------------------------------------------
// POST /api/stripe/webhook
// ---------------------------------------------------------------------------
// Anyone can POST here, so nothing is believed without a valid signature. The
// body is read as text and verified before it is parsed.
export async function stripeWebhook(env, request) {
  if (!env.STRIPE_WEBHOOK_SECRET) return bad(503, 'not set up');

  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') || '';
  if (!(await signatureValid(env.STRIPE_WEBHOOK_SECRET, payload, signature))) {
    return bad(400, 'bad signature');
  }

  let event;
  try { event = JSON.parse(payload); } catch { return bad(400, 'bad json'); }
  const object = event.data?.object || {};

  if (event.type === 'checkout.session.completed') {
    if (object.metadata?.source !== 'giving') return json({ ok: true, ignored: 'other source' });
    if (object.mode === 'subscription') return rememberCheckoutSubscription(env, object);
    if (object.payment_status !== 'paid') return json({ ok: true, ignored: 'unpaid' });
    return recordGift(env, {
      amount: object.amount_total,
      currency: object.currency,
      cadence: 'once',
      stripeRef: object.id,
      customer: idOf(object.customer),
      subscription: '',
    });
  }

  if (event.type === 'invoice.paid') return recordInvoice(env, object);

  if (event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted') {
    return rememberSubscription(env, object, Number(event.created) || 0);
  }

  return json({ ok: true, ignored: event.type });
}

async function rememberCheckoutSubscription(env, session) {
  if (!session.customer || !session.subscription) return bad(400, 'nothing to record');
  await upsertSubscription(env, {
    customer: idOf(session.customer),
    subscription: idOf(session.subscription),
    amount: Number(session.amount_total) || MINIMUM,
    currency: session.currency || 'gbp',
    status: session.payment_status === 'paid' ? 'active' : 'incomplete',
    cancelAtPeriodEnd: 0,
    eventCreated: 0,
  });
  return json({ ok: true });
}

async function rememberSubscription(env, subscription, eventCreated) {
  const known = subscription.id ? await env.DB.prepare(
    `SELECT 1 FROM giving_subscription WHERE stripe_subscription_ref = ?1`,
  ).bind(idOf(subscription.id)).first() : null;
  if (subscription.metadata?.source !== 'giving' && !known) {
    return json({ ok: true, ignored: 'other source' });
  }
  if (!subscription.id || !subscription.customer) return bad(400, 'nothing to record');
  const price = subscription.items?.data?.[0]?.price || {};
  await upsertSubscription(env, {
    customer: idOf(subscription.customer),
    subscription: idOf(subscription.id),
    amount: Number(price.unit_amount) || MINIMUM,
    currency: price.currency || 'gbp',
    status: subscription.status || 'active',
    cancelAtPeriodEnd: subscription.cancel_at_period_end ? 1 : 0,
    eventCreated,
  });
  return json({ ok: true });
}

async function recordInvoice(env, invoice) {
  const details = invoice.parent?.subscription_details || invoice.subscription_details || {};
  const subscription = idOf(details.subscription || invoice.subscription);
  let known = details.metadata?.source === 'giving';
  if (!known && subscription) {
    known = !!(await env.DB.prepare(
      `SELECT 1 FROM giving_subscription WHERE stripe_subscription_ref = ?1`,
    ).bind(subscription).first());
  }
  if (!known) return json({ ok: true, ignored: 'other source' });

  const amount = Number(invoice.amount_paid);
  if (!Number.isInteger(amount) || amount <= 0 || !invoice.id) {
    return bad(400, 'nothing to record');
  }
  return recordGift(env, {
    amount,
    currency: invoice.currency,
    cadence: 'monthly',
    stripeRef: invoice.id,
    customer: idOf(invoice.customer),
    subscription,
  });
}

async function upsertSubscription(env, data) {
  await env.DB.prepare(
    `INSERT INTO giving_subscription
       (stripe_customer_ref, stripe_subscription_ref, amount, currency,
        status, cancel_at_period_end, event_created, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, unixepoch())
     ON CONFLICT (stripe_subscription_ref) DO UPDATE SET
       stripe_customer_ref = excluded.stripe_customer_ref,
       amount = excluded.amount,
       currency = excluded.currency,
       status = excluded.status,
       cancel_at_period_end = excluded.cancel_at_period_end,
       event_created = excluded.event_created,
       updated_at = unixepoch()
     WHERE excluded.event_created >= giving_subscription.event_created`,
  ).bind(
    data.customer, data.subscription, data.amount, String(data.currency || 'gbp'),
    data.status, data.cancelAtPeriodEnd, data.eventCreated || 0,
  ).run();
}

async function recordGift(env, data) {
  const amount = Number(data.amount);
  if (!Number.isInteger(amount) || amount <= 0 || !data.stripeRef) {
    return bad(400, 'nothing to record');
  }
  await env.DB.prepare(
    `INSERT INTO gift
       (amount, currency, cadence, stripe_ref, stripe_customer_ref, stripe_subscription_ref)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT (stripe_ref) DO NOTHING`,
  ).bind(
    amount, String(data.currency || 'gbp'), data.cadence,
    String(data.stripeRef), String(data.customer || ''), String(data.subscription || ''),
  ).run();
  return json({ ok: true });
}

function idOf(value) {
  if (!value) return '';
  return typeof value === 'string' ? value : String(value.id || '');
}

async function signatureValid(secret, payload, header) {
  const parts = header.split(',')
    .map((p) => p.split('=', 2)).filter((p) => p.length === 2);
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > REPLAY_WINDOW) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`),
  ));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return parts.filter(([key_]) => key_ === 'v1')
    .some(([, value]) => timingSafeEqual(expected, String(value || '')));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
