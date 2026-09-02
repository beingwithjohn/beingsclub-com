import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { sendProspectCode, sendProspectTimeNote } from '../src/mail/send.js';
import {
  createProspectBooking, getProspectSlots, validWebhookSignature,
} from '../src/club/prospects.js';

function prospectDb(row) {
  return {
    row,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return { ...row }; },
        async run() {
          if (sql.includes('UPDATE prospect SET booking_uid')) {
            Object.assign(row, {
              booking_uid: args[0], booking_reschedule_uid: args[0],
              booking_title: args[1], booking_start_at: args[2],
              booking_end_at: args[3], booking_timezone: args[4],
              booking_status: args[5], booking_updated_at: args[6], updated_at: args[6],
            });
          }
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}

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

test('the native calendar returns Cal availability without exposing Cal’s interface', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({
      status: 'success',
      data: { '2026-09-03': [{ start: '2026-09-03T16:10:00.000+01:00' }] },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const response = await getProspectSlots({ CAL_API_KEY: 'cal_test_123' }, { booking_uid: null }, new URL(
      'https://example.test/api/club/prospect/slots?start=2026-09-01&end=2026-10-01&timeZone=Europe%2FLondon',
    ));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).slots, ['2026-09-03T15:10:00.000Z']);
    assert.match(request.url, /eventTypeSlug=beings-club-chat/);
    assert.match(request.url, /username=beingwithjohn/);
    assert.equal(request.options.headers.authorization, 'Bearer cal_test_123');
    assert.equal(request.options.headers['cal-api-version'], '2024-09-04');
  } finally {
    globalThis.fetch = original;
  }
});

test('the Worker verifies a chosen slot and creates the Cal booking itself', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/v2/slots?')) {
      return new Response(JSON.stringify({
        status: 'success',
        data: { '2026-09-03': [{ start: '2026-09-03T15:10:00.000Z' }] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      status: 'success', data: {
        uid: 'cal_booking_123', title: 'Beings Club Chat between John and Mira',
        status: 'accepted', start: '2026-09-03T15:10:00.000Z',
        end: '2026-09-03T15:35:00.000Z',
      },
    }), { status: 201, headers: { 'content-type': 'application/json' } });
  };
  const row = {
    id: 7, email: 'mira@example.test', booking_uid: null,
    booking_status: null, granted_at: null,
  };
  try {
    const response = await createProspectBooking({
      MEMBERS: prospectDb(row), CAL_API_KEY: 'cal_test_123',
    }, row, {
      start: '2026-09-03T15:10:00.000Z', timeZone: 'Europe/London',
      name: 'Mira', note: 'I would love to understand the club more.',
    });
    assert.equal(response.status, 200);
    assert.equal(row.booking_uid, 'cal_booking_123');
    assert.equal(row.booking_status, 'booked');
    const bookingBody = JSON.parse(requests[1].options.body);
    assert.deepEqual(bookingBody.attendee, {
      name: 'Mira', email: 'mira@example.test', timeZone: 'Europe/London', language: 'en',
    });
    assert.deepEqual(bookingBody.bookingFieldsResponses, {
      notes: 'I would love to understand the club more.',
    });
    assert.equal(bookingBody.eventTypeSlug, 'beings-club-chat');
    assert.equal(bookingBody.username, 'beingwithjohn');
    assert.equal(requests[0].options.headers['cal-api-version'], '2024-09-04');
    assert.equal(requests[1].options.headers['cal-api-version'], '2026-02-25');
    assert.equal(requests[1].options.headers.authorization, 'Bearer cal_test_123');
  } finally {
    globalThis.fetch = original;
  }
});

test('the native calendar reschedules the existing booking instead of creating another', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/v2/slots?')) {
      return new Response(JSON.stringify({
        status: 'success',
        data: { '2026-09-10': [{ start: '2026-09-10T17:00:00.000Z' }] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      status: 'success', data: {
        uid: 'cal_booking_123', title: 'Beings Club Chat between John and Mira',
        status: 'accepted', start: '2026-09-10T17:00:00.000Z',
        end: '2026-09-10T17:25:00.000Z',
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const row = {
    id: 7, email: 'mira@example.test', booking_uid: 'cal_booking_123',
    booking_status: 'booked', granted_at: null,
  };
  try {
    const response = await createProspectBooking({
      MEMBERS: prospectDb(row), CAL_API_KEY: 'cal_test_123',
    }, row, {
      start: '2026-09-10T17:00:00.000Z', timeZone: 'Europe/London', reschedule: true,
    });
    assert.equal(response.status, 200);
    assert.match(requests[0].url, /bookingUidToReschedule=cal_booking_123/);
    assert.match(requests[1].url, /\/v2\/bookings\/cal_booking_123\/reschedule$/);
    assert.deepEqual(JSON.parse(requests[1].options.body), {
      start: '2026-09-10T17:00:00.000Z',
      rescheduledBy: 'mira@example.test',
      reschedulingReason: 'A new time chosen in Beings Club',
    });
  } finally {
    globalThis.fetch = original;
  }
});
