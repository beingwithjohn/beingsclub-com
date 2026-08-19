import test from 'node:test';
import assert from 'node:assert/strict';
import { postGiving, postGivingPortal, stripeWebhook } from '../src/giving.js';

function fakeDb(firstValue = null) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, values: [] };
      calls.push(call);
      return {
        bind(...values) { call.values = values; return this; },
        async first() { return firstValue; },
        async run() { return { success: true }; },
      };
    },
  };
}

function env(db = fakeDb()) {
  return {
    DB: db,
    STRIPE_SECRET_KEY: 'stripe-test-key',
    STRIPE_WEBHOOK_SECRET: 'webhook-test-secret',
    GIVING_URL: 'https://beingsclub.com/giving/',
    APP_URL: 'https://beingsclub.com/log/',
  };
}

async function withFetch(response, fn) {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try { return await fn(() => request); } finally { globalThis.fetch = original; }
}

test('one-off giving uses the amount chosen on the public page', async () => {
  await withFetch({ url: 'https://checkout.stripe.test/once' }, async (sent) => {
    const response = await postGiving(env(), { cadence: 'once', amount: 725 });
    assert.equal(response.status, 200);
    const form = sent().options.body;
    assert.equal(form.get('mode'), 'payment');
    assert.equal(form.get('line_items[0][price_data][currency]'), 'gbp');
    assert.equal(form.get('line_items[0][price_data][unit_amount]'), '725');
    assert.equal(form.get('line_items[0][price_data][custom_unit_amount][enabled]'), null);
    assert.equal(form.get('metadata[source]'), 'giving');
    assert.equal(form.get('success_url'), 'https://beingsclub.com/giving/?thanks=1');
  });
});

test('monthly giving uses the chosen currency and amount as a recurring price', async () => {
  await withFetch({ url: 'https://checkout.stripe.test/monthly' }, async (sent) => {
    const response = await postGiving(env(), { cadence: 'monthly', currency: 'usd', amount: 725 });
    assert.equal(response.status, 200);
    const form = sent().options.body;
    assert.equal(form.get('mode'), 'subscription');
    assert.equal(form.get('line_items[0][price_data][currency]'), 'usd');
    assert.equal(form.get('line_items[0][price_data][unit_amount]'), '725');
    assert.equal(form.get('line_items[0][price_data][recurring][interval]'), 'month');
    assert.equal(form.get('subscription_data[metadata][source]'), 'giving');
  });
});

test('an authenticated giver can open Stripe to manage or cancel monthly giving', async () => {
  const db = fakeDb({ stripe_customer_ref: 'cus_monthly' });
  await withFetch({ url: 'https://billing.stripe.test/session' }, async (sent) => {
    const response = await postGivingPortal(env(db), { email: 'person@example.com' });
    assert.equal(response.status, 200);
    assert.equal(sent().url, 'https://api.stripe.com/v1/billing_portal/sessions');
    assert.equal(sent().options.body.get('customer'), 'cus_monthly');
    assert.equal(sent().options.body.get('return_url'), 'https://beingsclub.com/log/');
    assert.match(db.calls[0].sql, /lower\(email\) = lower\(\?1\)/);
    assert.deepEqual(db.calls[0].values, ['person@example.com']);
  });
});

test('monthly Checkout remembers Stripe’s email without linking a Practice Log person', async () => {
  const db = fakeDb();
  const event = JSON.stringify({
    type: 'checkout.session.completed',
    data: { object: {
      id: 'cs_monthly', mode: 'subscription', payment_status: 'paid', amount_total: 725,
      currency: 'gbp', customer: 'cus_monthly', subscription: 'sub_monthly',
      customer_details: { email: 'Person@Example.com' }, metadata: { source: 'giving' },
    } },
  });
  const response = await stripeWebhook(env(db), await signedRequest(event));
  assert.equal(response.status, 200);
  assert.match(db.calls.at(-1).sql, /INSERT INTO giving_subscription/);
  assert.equal(db.calls.at(-1).values.at(-1), 'person@example.com');
  assert.doesNotMatch(db.calls.at(-1).sql, /person_id/);
});

test('dollar giving is presented in USD', async () => {
  await withFetch({ url: 'https://checkout.stripe.test/dollars' }, async (sent) => {
    const response = await postGiving(env(), { cadence: 'once', currency: 'usd', amount: 1250 });
    assert.equal(response.status, 200);
    assert.equal(sent().options.body.get('line_items[0][price_data][currency]'), 'usd');
  });
});

test('giving refuses unsupported currencies, fractional smallest units and sub-unit gifts', async () => {
  assert.equal((await postGiving(env(), { cadence: 'once' })).status, 400);
  assert.equal((await postGiving(env(), { cadence: 'once', amount: 100.5 })).status, 400);
  assert.equal((await postGiving(env(), { cadence: 'monthly', amount: 99 })).status, 400);
  assert.equal((await postGiving(env(), { cadence: 'once', currency: 'cad', amount: 500 })).status, 400);
});

test('a signed paid gift is recorded without a Practice Log person', async () => {
  const db = fakeDb();
  const event = JSON.stringify({
    type: 'checkout.session.completed',
    data: { object: {
      id: 'cs_paid', mode: 'payment', payment_status: 'paid', amount_total: 725,
      currency: 'gbp', customer: 'cus_giver', metadata: { source: 'giving' },
    } },
  });
  const request = await signedRequest(event);
  const response = await stripeWebhook(env(db), request);
  assert.equal(response.status, 200);
  assert.match(db.calls.at(-1).sql, /INSERT INTO gift/);
  assert.deepEqual(db.calls.at(-1).values, [725, 'gbp', 'once', 'cs_paid', 'cus_giver', '']);
});

test('a signed event from another Stripe flow is ignored', async () => {
  const db = fakeDb();
  const event = JSON.stringify({
    type: 'checkout.session.completed',
    data: { object: {
      id: 'cs_other', mode: 'payment', payment_status: 'paid', amount_total: 725,
      currency: 'gbp', metadata: { source: 'something-else' },
    } },
  });
  const response = await stripeWebhook(env(db), await signedRequest(event));
  assert.equal(response.status, 200);
  assert.equal(db.calls.length, 0);
});

async function signedRequest(event) {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode('webhook-test-secret'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const digest = new Uint8Array(await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${timestamp}.${event}`),
  ));
  const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://worker.test/api/stripe/webhook', {
    method: 'POST', body: event,
    headers: { 'stripe-signature': `t=${timestamp},v1=not-the-signature,v1=${hex}` },
  });
}
