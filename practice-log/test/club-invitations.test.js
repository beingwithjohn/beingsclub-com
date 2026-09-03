import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sendClubInvitation, sendClubSalonEmail, sendClubSalonRsvpEmail, sendClubWelcome,
  sendMemberJoinedNotification,
} from '../src/mail/send.js';

test('a member invitation is personal, idempotent and points to the member entrance', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email_123' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const sent = await sendClubInvitation({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
      MAIL_FROM_HOST: 'John Ooi <practice@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
    }, {
      email: 'mira@example.test',
      idempotencyKey: 'club-member-7-2000000000',
    });
    assert.equal(sent, true);
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.options.headers['idempotency-key'], 'club-member-7-2000000000');
    const body = JSON.parse(request.options.body);
    assert.equal(body.to[0], 'mira@example.test');
    assert.equal(body.from, 'Beings Club <practice@beingsclub.com>');
    assert.equal(body.subject, 'You’re invited to Beings Club');
    assert.match(body.text, /https:\/\/beingsclub\.com\/members\//);
    assert.match(body.html, /enter Beings Club/);
  } finally {
    globalThis.fetch = original;
  }
});

test('an invitation reports a delivery failure without pretending it sent', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('no', { status: 500 });
  try {
    const sent = await sendClubInvitation({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM_HOST: 'John <practice@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
    }, { email: 'mira@example.test', idempotencyKey: 'member-7' });
    assert.equal(sent, false);
  } finally {
    globalThis.fetch = original;
  }
});

test('granting access sends a welcome rather than another invitation', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email_welcome' }), { status: 200 });
  };
  try {
    const sent = await sendClubWelcome({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
      MAIL_FROM_HOST: 'John Ooi <practice@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
    }, {
      email: 'mira@example.test',
      name: 'Mira',
      actionUrl: 'https://beingsclub.com/members/#welcome=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      idempotencyKey: 'club-prospect-4-2000000000',
    });
    assert.equal(sent, true);
    assert.equal(request.options.headers['idempotency-key'], 'club-prospect-4-2000000000');
    const body = JSON.parse(request.options.body);
    assert.equal(body.from, 'Beings Club <practice@beingsclub.com>');
    assert.equal(body.subject, 'Welcome to Beings Club');
    assert.match(body.text, /Hello, Mira\. You’re in\./);
    assert.match(body.text, /private entrance/);
    assert.match(body.text, /#welcome=AAAA/);
    assert.doesNotMatch(body.text, /six-digit code/);
    assert.doesNotMatch(body.text, /Your welcome is waiting|Beings Club is made by those who participate/);
    assert.match(body.html, /Welcome to <span[^>]*>Beings Club<\/span>\./);
    assert.match(body.html, /Hello, Mira\. You’re in\./);
    assert.doesNotMatch(body.html, /inside Beings Club|Your welcome is waiting|Beings Club is made by those who participate/);
    assert.doesNotMatch(body.subject, /invited/i);
  } finally {
    globalThis.fetch = original;
  }
});

test('John receives one clear notice after a member completes the welcome', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email_456' }), { status: 200 });
  };
  try {
    const sent = await sendMemberJoinedNotification({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
      HOST_NOTIFY_EMAIL: 'john@spacetobe.xyz',
    }, {
      email: 'mira@example.test', name: 'Mira', completedAt: 2_000_000_000,
      idempotencyKey: 'club-joined-7-2000000000',
    });
    assert.equal(sent, true);
    assert.equal(request.options.headers['idempotency-key'], 'club-joined-7-2000000000');
    const body = JSON.parse(request.options.body);
    assert.deepEqual(body.to, ['john@spacetobe.xyz']);
    assert.equal(body.subject, 'Mira joined Beings Club');
    assert.match(body.text, /completed the Beings Club welcome/);
    assert.match(body.text, /mira@example\.test/);
    assert.match(body.html, /open host tools/);
  } finally {
    globalThis.fetch = original;
  }
});

test('Salon email opens through the member-specific private entrance', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email_salon' }), { status: 200 });
  };
  const actionUrl = 'https://beingsclub.com/members/#welcome=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  try {
    const sent = await sendClubSalonEmail({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
    }, {
      email: 'mira@example.test', name: 'Mira',
      salonStartsAt: Date.parse('2026-09-30T18:00:00Z') / 1000,
      hostNote: 'Looking forward to being with you all.',
      kind: 'announcement', actionUrl,
    });
    assert.equal(sent, true);
    const body = JSON.parse(request.options.body);
    assert.match(body.text, /We will gather for the next Salon on Wednesday 30 September, 7 PM BST\./);
    assert.match(body.text, /#welcome=AAAA/);
    assert.match(body.text, /private link that logs you into your account/);
    assert.match(body.text, /please don’t share it/);
    assert.match(body.html, /#welcome=AAAA/);
    assert.match(body.html, /open the Salon/);
    assert.match(body.html, /private link that logs you into your account/);
    assert.doesNotMatch(body.text, /members\/#salon/);
  } finally {
    globalThis.fetch = original;
  }
});

test('RSVP confirmation includes a private entrance and a calendar invitation', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email_rsvp' }), { status: 200 });
  };
  try {
    const sent = await sendClubSalonRsvpEmail({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
    }, {
      email: 'mira@example.test', name: 'Mira', salonId: 7,
      salonStartsAt: Date.parse('2026-09-30T18:00:00Z') / 1000,
      durationMinutes: 90,
      hostNote: 'Looking forward to being with you all.',
      actionUrl: 'https://beingsclub.com/members/#welcome=AAAA',
      idempotencyKey: 'club-salon-rsvp-7-2',
    });
    assert.equal(sent, true);
    assert.equal(request.options.headers['idempotency-key'], 'club-salon-rsvp-7-2');
    const body = JSON.parse(request.options.body);
    assert.equal(body.subject, 'You’re in for the next Salon');
    assert.match(body.text, /Wednesday 30 September, 7 PM BST/);
    assert.match(body.text, /calendar invitation is attached/i);
    assert.match(body.text, /private link that logs you into your account/);
    assert.match(body.html, /open the Salon/);
    assert.equal(body.attachments[0].filename, 'beings-club-salon.ics');
    const calendar = Buffer.from(body.attachments[0].content, 'base64').toString('utf8');
    assert.match(calendar, /METHOD:PUBLISH/);
    assert.match(calendar, /UID:salon-7@beingsclub\.com/);
    assert.match(calendar, /DTSTART:20260930T180000Z/);
    assert.match(calendar, /DTEND:20260930T193000Z/);
    assert.doesNotMatch(calendar, /zoom\.us/);
  } finally {
    globalThis.fetch = original;
  }
});
