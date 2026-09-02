import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sendClubInvitation, sendClubWelcome, sendMemberJoinedNotification,
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
    assert.match(body.text, /Beings Club is made by those who participate/);
    assert.match(body.html, /Welcome to <span[^>]*>Beings Club<\/span>\./);
    assert.match(body.html, /Hello, Mira\. You’re in\./);
    assert.match(body.html, /inside Beings Club/);
    assert.match(body.html, /Beings Club is made by those who participate/);
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
