import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrivateMessage } from '../src/club/messages.js';
import {
  sendClubMemberMessageNotification, sendClubMessageReplyNotification,
} from '../src/mail/send.js';

test('private messages accept only member pages and bounded non-empty words', () => {
  assert.deepEqual(parsePrivateMessage({
    sourcePage: 'field-notes', message: '  Something stayed with me.  ',
  }), {
    ok: true, message: 'Something stayed with me.', sourcePage: 'field-notes',
  });
  assert.equal(parsePrivateMessage({ sourcePage: 'profile', message: 'Hello' }).error, 'page');
  assert.equal(parsePrivateMessage({ sourcePage: 'messages', message: '   ' }).error, 'Write something first.');
  assert.equal(
    parsePrivateMessage({ sourcePage: 'messages', message: 'x'.repeat(4001) }).error,
    'Keep messages to 4,000 characters or fewer.',
  );
});

test('a new member message notifies John and points into the host inbox', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email_message' }), { status: 200 });
  };
  try {
    const sent = await sendClubMemberMessageNotification({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Beings Club <hello@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
      HOST_NOTIFY_EMAIL: 'john@spacetobe.xyz',
    }, {
      email: 'mira@example.test', name: 'Mira',
      memberId: 2,
      message: 'Could we return to this after the Salon?',
      idempotencyKey: 'member-message-1',
    });
    assert.equal(sent, true);
    const body = JSON.parse(request.options.body);
    assert.deepEqual(body.to, ['john@spacetobe.xyz']);
    assert.equal(body.reply_to, 'john@spacetobe.xyz');
    assert.equal(body.subject, 'A message from Mira');
    assert.match(body.text, /Could we return to this after the Salon\?/);
    assert.match(body.html, /members\/?\?message=2#messages/);
  } finally {
    globalThis.fetch = original;
  }
});

test('John’s reply notice uses a private doorway back to Messages', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email_reply' }), { status: 200 });
  };
  try {
    const actionUrl = 'https://beingsclub.com/members/#welcome=private&next=messages';
    await sendClubMessageReplyNotification({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Beings Club <hello@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
    }, { email: 'mira@example.test', name: 'Mira', actionUrl });
    const body = JSON.parse(request.options.body);
    assert.deepEqual(body.to, ['mira@example.test']);
    assert.equal(body.subject, 'A message from John');
    assert.match(body.text, /private link that logs you into your account/);
    assert.match(body.html, /open messages/);
    assert.match(body.html, /next=messages/);
  } finally {
    globalThis.fetch = original;
  }
});
