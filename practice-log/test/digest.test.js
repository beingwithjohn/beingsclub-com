import test from 'node:test';
import assert from 'node:assert/strict';
import { seal } from '../src/auth.js';
import { replyDigestDue, replyDigestOne } from '../src/digest.js';

const linkKey = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const SUNDAY = Date.parse('2026-08-23T06:00:00Z'); // 07:00 in Lisbon

const person = (overrides = {}) => ({
  id: 7,
  name: 'Sam',
  email: 'sam@example.com',
  timezone: 'Europe/Lisbon',
  nudge_hour: '07:00',
  nudge_on: 0,
  reply_digest_on: 1,
  ...overrides,
});

function digestDb(contexts, claimed = true) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, values: [] };
      calls.push(call);
      return {
        bind(...values) { call.values = values; return this; },
        async all() {
          return { results: contexts.map((public_context) => ({ public_context })) };
        },
        async run() { return { meta: { changes: claimed ? 1 : 0 } }; },
      };
    },
  };
}

test('the weekly replies setting uses the existing email time on Sunday', () => {
  assert.equal(replyDigestDue(person(), SUNDAY), '2026-08-23');
  assert.equal(replyDigestDue(person({ reply_digest_on: 0 }), SUNDAY), null);
  assert.equal(replyDigestDue(person(), Date.parse('2026-08-22T06:00:00Z')), null);
});

test('no new public reply means no Sunday digest and leaves the daily nudge available', async () => {
  const DB = digestDb([]);
  const result = await replyDigestOne({ DB }, person(), SUNDAY);
  assert.deepEqual(result, { handled: false, sent: false, count: 0 });
  assert.equal(DB.calls.length, 1);
});

test('the digest contains every new public context except replies prompted by its recipient', async () => {
  const DB = digestDb(['A first public question', 'Another way in']);
  const token = 'local-digest-token';
  const token_enc = await seal({ LINK_KEY: linkKey }, token);
  const sent = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return new Response('{}', { status: 200 });
  };

  try {
    const result = await replyDigestOne({
      DB,
      LINK_KEY: linkKey,
      APP_URL: 'https://beingsclub.com/log/',
      RESEND_API_KEY: 'test',
      MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
      MAIL_FROM_HOST: 'John Ooi <practice@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
    }, person({ token_enc }), SUNDAY);

    assert.deepEqual(result, { handled: true, sent: true, count: 2 });
    const query = DB.calls[0];
    assert.match(query.sql, /visibility = 'shared'/);
    assert.match(query.sql, /shared_at > \?1 AND shared_at <= \?2/);
    assert.match(query.sql, /recipient_person_id <> \?3/);
    assert.equal(query.values[2], 7);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to[0], 'sam@example.com');
    assert.match(sent[0].subject, /From John this week/);
    assert.match(sent[0].text, /A first public question/);
    assert.match(sent[0].text, /Another way in/);
    assert.doesNotMatch(sent[0].text, /Sam/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a retried Sunday tick stays handled without sending a daily email as well', async () => {
  const DB = digestDb(['A public question'], false);
  const result = await replyDigestOne({ DB }, person(), SUNDAY);
  assert.deepEqual(result, { handled: true, sent: false, count: 1 });
});
