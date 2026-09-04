import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { sendProspectCode, sendProspectTimeNote } from '../src/mail/send.js';
import {
  createProspectBooking, dismissProspect, enterMemberWelcome, getProspectSlots, resendProspectWelcome,
  listProspects, validWebhookSignature,
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
              display_name: args[7] || row.display_name,
            });
          }
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}

function grantedProspectDb(row) {
  const updates = [];
  const batches = [];
  return {
    updates, batches,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return sql.includes('FROM prospect p JOIN member') ? { ...row } : null; },
        async run() { updates.push({ sql, args }); return { meta: { changes: 1 } }; },
      };
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map(() => ({ results: [], meta: { changes: 1 } }));
    },
  };
}

function welcomeEntryDb(row) {
  const runs = [];
  const batches = [];
  return {
    runs, batches,
    prepare(sql) {
      let args = [];
      return {
        sql,
        bind(...values) { args = values; this.args = args; return this; },
        async first() { return sql.includes('FROM member_welcome_link') ? { ...row } : null; },
        async run() { runs.push({ sql, args }); return { meta: { changes: 1 } }; },
      };
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map(() => ({ results: [], meta: { changes: 1 } }));
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

test('cancelled or resolved first conversations leave the host working queue without deleting the prospect', async () => {
  let query = '';
  const response = await listProspects({
    MEMBERS: {
      prepare(sql) {
        query = sql;
        return { async all() { return { results: [] }; } };
      },
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).prospects, []);
  assert.match(query, /p\.granted_at IS NULL AND p\.archived_at IS NULL/);
  assert.match(query, /p\.booking_status IS NULL OR p\.booking_status != 'cancelled'/);
});

test('the host can dismiss an unresolved first conversation while preserving its record', async () => {
  let statement;
  const response = await dismissProspect({
    MEMBERS: {
      prepare(sql) {
        statement = { sql, args: [] };
        return {
          bind(...args) { statement.args = args; return this; },
          async run() { return { meta: { changes: 1 } }; },
        };
      },
    },
  }, 7);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.match(statement.sql, /SET archived_at = \?1/);
  assert.match(statement.sql, /granted_at IS NULL/);
  assert.equal(statement.args[1], 7);
});

test('a prospective member receives a one-use Beings Club code without membership language', async () => {
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
    }, { email: 'mira@example.test', name: 'Mira', code: '012345' });
    assert.equal(sent, true);
    const body = JSON.parse(request.options.body);
    assert.deepEqual(body.to, ['mira@example.test']);
    assert.equal(body.subject, 'Your Beings Club code');
    assert.match(body.text, /012345/);
    assert.match(body.text, /Hello, Mira\./);
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

test('the host can resend a welcome after access is granted but before onboarding', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email_welcome_again' }), { status: 200 });
  };
  const members = grantedProspectDb({
    id: 4, granted_at: 2_000_000_000, member_id: 9,
    display_name: 'Mira', member_name: 'Mira', email: 'mira@example.test',
    joined_at: null, disabled_at: null, left_at: null,
  });
  try {
    const response = await resendProspectWelcome({
      MEMBERS: members,
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
      MAIL_FROM_HOST: 'John Ooi <practice@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
    }, 4);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).invitationSent, true);
    assert.match(request.options.headers['idempotency-key'], /^club-prospect-welcome-4-\d+$/);
    const body = JSON.parse(request.options.body);
    assert.equal(body.to[0], 'mira@example.test');
    assert.equal(body.subject, 'Welcome to Beings Club');
    assert.match(body.text, /Hello, Mira\. You’re in\./);
    assert.match(body.text, /members\/#welcome=[A-Za-z0-9_-]+/);
    assert.doesNotMatch(body.text, /six-digit code/);
    assert.equal(members.batches.length, 1);
    assert.equal(members.updates.length, 1);
    assert.equal(members.updates[0].args[3], 9);
  } finally {
    globalThis.fetch = original;
  }
});

test('a one-use welcome entrance creates a member session and opens onboarding', async () => {
  const members = welcomeEntryDb({
    id: 9, member_id: 9, email: 'mira@example.test', display_name: 'Mira',
    expires_at: Math.floor(Date.now() / 1000) + 300, consumed_at: null,
    disabled_at: null, left_at: null, is_host: 0, agreement_version: null,
    agreement_accepted_at: null, onboarding_completed_at: null,
  });
  const response = await enterMemberWelcome({ MEMBERS: members }, {
    token: 'A'.repeat(43),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(data.token, /^[A-Za-z0-9_-]{20,100}$/);
  assert.equal(data.member.email, 'mira@example.test');
  assert.equal(data.member.agreementAccepted, false);
  assert.equal(data.member.onboardingCompleted, false);
  assert.equal(members.runs.some((run) => run.sql.includes('SET consumed_at')), true);
  assert.equal(members.batches.flat().some((statement) => statement.sql.includes('INSERT INTO member_session')), true);
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
