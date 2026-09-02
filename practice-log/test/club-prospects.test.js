import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { sendProspectCode, sendProspectTimeNote } from '../src/mail/send.js';
import { validWebhookSignature } from '../src/club/prospects.js';

test('Cal.com webhooks require the exact HMAC of the raw request body', async () => {
  const secret = 'test-cal-webhook-secret';
  const raw = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'book_123' } });
  const signature = createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(await validWebhookSignature(secret, raw, signature), true);
  assert.equal(await validWebhookSignature(secret, `${raw} `, signature), false);
  assert.equal(await validWebhookSignature(secret, raw, 'not-a-signature'), false);
});

test('a prospective member receives a one-use conversation code without membership language', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email_prospect_123' }), { status: 200 });
  };
  try {
    const sent = await sendProspectCode({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
    }, { email: 'mira@example.test', code: '012345' });
    assert.equal(sent, true);
    const body = JSON.parse(request.options.body);
    assert.deepEqual(body.to, ['mira@example.test']);
    assert.equal(body.subject, 'Your Beings Club conversation code');
    assert.match(body.text, /012345/);
    assert.match(body.text, /book a first conversation with John/);
    assert.doesNotMatch(body.text, /You.re invited|membership begins/i);
  } finally {
    globalThis.fetch = original;
  }
});

test('an alternative-time note goes privately to the configured host', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email_note_123' }), { status: 200 });
  };
  try {
    const sent = await sendProspectTimeNote({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
      HOST_NOTIFY_EMAIL: 'john@spacetobe.xyz',
    }, {
      email: 'mira@example.test',
      note: 'Evenings after 19:00 UTC generally work for me.',
      idempotencyKey: 'prospect-time-4-2000000000',
    });
    assert.equal(sent, true);
    assert.equal(request.options.headers['idempotency-key'], 'prospect-time-4-2000000000');
    const body = JSON.parse(request.options.body);
    assert.deepEqual(body.to, ['john@spacetobe.xyz']);
    assert.match(body.text, /mira@example\.test/);
    assert.match(body.text, /Evenings after 19:00 UTC/);
    assert.match(body.text, /members\/host/);
  } finally {
    globalThis.fetch = original;
  }
});
