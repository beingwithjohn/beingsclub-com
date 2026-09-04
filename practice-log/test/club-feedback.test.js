import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMemberFeedback } from '../src/club/feedback.js';
import { sendClubMemberFeedback } from '../src/mail/send.js';

test('member feedback is short, non-empty and tied to an allowed member page', () => {
  assert.deepEqual(parseMemberFeedback({ page: 'field-notes', message: '  I found this confusing.  ' }), {
    ok: true,
    message: 'I found this confusing.',
    page: 'field-notes',
    pageLabel: 'the Field Notes page',
  });
  assert.equal(parseMemberFeedback({ page: 'profile', message: 'Hello' }).error, 'page');
  assert.equal(parseMemberFeedback({ page: 'salon', message: '   ' }).error, 'Write something first.');
  assert.equal(
    parseMemberFeedback({ page: 'salon', message: 'x'.repeat(1001) }).error,
    'Keep feedback to 1,000 characters or fewer.',
  );
});

test('member feedback reaches John and replies go to the member', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email_feedback' }), { status: 200 });
  };
  try {
    const sent = await sendClubMemberFeedback({
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
      HOST_NOTIFY_EMAIL: 'john@spacetobe.xyz',
    }, {
      email: 'mira@example.test',
      name: 'Mira',
      pageLabel: 'the Field Notes page',
      message: 'The month label helped me find this.',
    });
    assert.equal(sent, true);
    const body = JSON.parse(request.options.body);
    assert.deepEqual(body.to, ['john@spacetobe.xyz']);
    assert.equal(body.reply_to, 'mira@example.test');
    assert.equal(body.from, 'Beings Club <practice@beingsclub.com>');
    assert.equal(body.subject, 'Member feedback · Mira');
    assert.match(body.text, /Field Notes page/);
    assert.match(body.text, /The month label helped me find this\./);
    assert.match(body.html, /Member <span[^>]*>feedback<\/span>/);
  } finally {
    globalThis.fetch = original;
  }
});
