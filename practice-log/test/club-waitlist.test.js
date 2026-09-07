import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getHostAdmissions, getMemberInvitationLink, removeFromActiveWaitlist, resolveReferral,
} from '../src/club/waitlist.js';
import { sendWaitlistConfirmation } from '../src/mail/send.js';

const LINK_KEY = Buffer.alloc(32, 7).toString('base64');

test('a member invitation URL names its valid referring member', async () => {
  const env = {
    LINK_KEY,
    MEMBERS: {
      prepare(sql) {
        return {
          bind(id) {
            return {
              async first() {
                assert.match(sql, /agreement_accepted_at IS NOT NULL/);
                assert.equal(id, 27);
                return { id: 27, display_name: 'Mira' };
              },
            };
          },
        };
      },
    },
  };
  const response = await getMemberInvitationLink(env, {
    id: 27, onboarding_completed_at: 2_000_000_000,
  });
  const body = await response.json();
  assert.match(body.url, /^https:\/\/beingsclub\.com\/members\/\?join=1&invite=27\.[a-f0-9]{64}$/);
  const referral = await resolveReferral(env, new URL(body.url).searchParams.get('invite'));
  assert.deepEqual(referral, { memberId: 27, name: 'Mira' });
});

test('the host waiting list excludes people who booked or became members', async () => {
  let query = '';
  const env = {
    MEMBERS: {
      prepare(sql) {
        query = sql;
        return {
          async first() {
            return { paused_at: 2_000_000_000, reopened_at: null, updated_at: 2_000_000_000 };
          },
          async all() {
            return { results: [{
              id: 4, email: 'leila@example.test', display_name: 'Leila',
              waitlist_joined_at: 2_000_000_000, waitlist_status: 'waiting',
              waitlist_offered_at: null, waitlist_host_note: null, inviter_name: 'Mira',
            }] };
          },
        };
      },
    },
  };
  const response = await getHostAdmissions(env);
  const body = await response.json();
  assert.equal(body.admissions.paused, true);
  assert.equal(body.waitlist[0].invitedBy, 'Mira');
  assert.match(query, /p\.waitlist_removed_at IS NULL/);
  assert.match(query, /p\.granted_at IS NULL/);
  assert.match(query, /p\.booking_uid IS NULL/);
});

test('booking removes an active entry but preserves its row as history', async () => {
  const runs = [];
  const env = {
    MEMBERS: {
      prepare(sql) {
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          async run() {
            runs.push({ sql, args });
            return { meta: { changes: 1 } };
          },
        };
      },
    },
  };
  await removeFromActiveWaitlist(env, 9, 'booked', null, 2_000_000_000);
  assert.match(runs[0].sql, /UPDATE prospect SET waitlist_status/);
  assert.match(runs[0].sql, /waitlist_removed_at IS NULL/);
  assert.deepEqual(runs[0].args, ['booked', 2_000_000_000, 9]);
  assert.equal(runs.some(({ sql }) => sql.includes('DELETE FROM prospect')), false);
  assert.equal(runs.some(({ sql }) => sql.includes('UPDATE prospect_booking_link SET revoked_at')), true);
  assert.equal(runs.some(({ sql }) => sql.includes('INSERT INTO prospect_waitlist_notion_sync')), true);
});

test('joining the waiting list sends the settled confirmation copy', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return Response.json({ id: 'waitlist-mail' });
  };
  try {
    assert.equal(await sendWaitlistConfirmation({
      RESEND_API_KEY: 'resend-test',
      MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
    }, {
      email: 'leila@example.test', name: 'Leila', idempotencyKey: 'waitlist-4',
    }), true);
    const body = JSON.parse(request.options.body);
    assert.equal(body.subject, 'You’re on the Beings Club waiting list');
    assert.match(body.text, /^Hello, Leila\./);
    assert.match(body.text, /First conversations are taking a pause\./);
    assert.match(body.text, /Beings Club will write when there is room to choose a time\./);
    assert.match(body.text, /For the benefit of all beings$/);
    assert.match(body.html, /We’ll write when conversations/);
  } finally {
    globalThis.fetch = original;
  }
});
