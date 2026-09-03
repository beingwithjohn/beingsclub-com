import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEmailPreferences, parseLeavePolicy } from '../src/club/settings.js';
import { announceSalon, eligibleMembers, queueSalonRsvpConfirmation, reminderWindow } from '../src/club/mailer.js';
import { clubSalonTime } from '../src/mail/send.js';

test('Club email settings accept only an explicit complete set of choices', () => {
  const value = {
    salonAnnounced: true, salonMonth: false, salonWeek: true,
    salonDay: false, salonHour: true, fieldNotes: true, quiet: false,
  };
  assert.deepEqual(parseEmailPreferences(value), { ok: true, email: value });
  assert.equal(parseEmailPreferences({ ...value, salonDay: 'yes' }).ok, false);
  assert.equal(parseEmailPreferences({ salonAnnounced: true }).ok, false);
});

test('leaving requires a deliberate confirmation and one known Field Note policy', () => {
  assert.equal(parseLeavePolicy({ confirm: 'LEAVE', notePolicy: 'keep_signed' }), 'keep_signed');
  assert.equal(parseLeavePolicy({ confirm: 'LEAVE', notePolicy: 'anonymise' }), 'anonymise');
  assert.equal(parseLeavePolicy({ confirm: 'LEAVE', notePolicy: 'remove' }), 'remove');
  assert.equal(parseLeavePolicy({ confirm: 'leave', notePolicy: 'remove' }), null);
  assert.equal(parseLeavePolicy({ confirm: 'LEAVE', notePolicy: 'delete_everything' }), null);
});

test('Salon reminder windows are narrow and idempotence can own the retry', () => {
  const start = 2_000_000_000;
  assert.equal(reminderWindow(start, 'salon_month', start - (30 * 86400)), true);
  assert.equal(reminderWindow(start, 'salon_week', start - (7 * 86400)), true);
  assert.equal(reminderWindow(start, 'salon_week', start - (7 * 86400) + 1799), true);
  assert.equal(reminderWindow(start, 'salon_week', start - (7 * 86400) + 1800), false);
  assert.equal(reminderWindow(start, 'salon_day', start - 86400), true);
  assert.equal(reminderWindow(start, 'salon_hour', start - 3600), true);
  assert.equal(reminderWindow(start, 'unknown', start), false);
});

test('announcements and week notices can reach every opted-in member while other reminders require an RSVP', async () => {
  const seen = [];
  const env = {
    MEMBERS: {
      prepare(sql) {
        seen.push({ sql, bound: null });
        const current = seen.at(-1);
        return {
          async all() { return { results: [] }; },
          bind(...args) {
            current.bound = args;
            return { async all() { return { results: [] }; } };
          },
        };
      },
    },
  };

  await eligibleMembers(env, 'salon_announced');
  await eligibleMembers(env, 'salon_week');
  await eligibleMembers(env, 'salon_day', 17);

  assert.doesNotMatch(seen[0].sql, /salon_rsvp/);
  assert.match(seen[0].sql, /p\.salon_announced/);
  assert.equal(seen[0].bound, null);
  assert.doesNotMatch(seen[1].sql, /salon_rsvp/);
  assert.match(seen[1].sql, /p\.salon_week/);
  assert.equal(seen[1].bound, null);
  assert.match(seen[2].sql, /FROM salon_rsvp r/);
  assert.match(seen[2].sql, /p\.salon_day/);
  assert.match(seen[2].sql, /r\.status = 'in'/);
  assert.deepEqual(seen[2].bound, [17]);
});

test('Club time names BST and GMT correctly in Salon email copy', () => {
  assert.match(clubSalonTime(Date.parse('2026-09-30T18:00:00Z') / 1000), /7 PM BST$/);
  assert.match(clubSalonTime(Date.parse('2026-11-25T19:00:00Z') / 1000), /7 PM GMT$/);
});

test('publishing and announcing remain separate, with a send claim before mail', async () => {
  const seen = []; let queued;
  const env = {
    MEMBERS: {
      prepare(sql) {
        const statement = {
          async all() {
            seen.push(['all', sql, []]);
            return { results: [{ id: 2, email: 'mira@example.test', display_name: 'Mira' }] };
          },
          bind(...args) {
            return {
              async first() {
                seen.push(['first', sql, args]);
                return { id: 7, status: 'published', starts_at: 2_000_000_000,
                  announcement_sent_at: null, host_note: 'Bring the month with you.' };
              },
              async all() {
                seen.push(['all', sql, args]);
                return { results: [{ id: 2, email: 'mira@example.test', display_name: 'Mira' }] };
              },
              async run() {
                seen.push(['run', sql, args]);
                return { meta: { changes: 1 } };
              },
            };
          },
        };
        return statement;
      },
    },
  };
  const response = await announceSalon(env, 7, { waitUntil(value) { queued = value; } }, 1_900_000_000);
  assert.deepEqual(await response.json(), { ok: true, recipientCount: 1 });
  await queued;
  const claimAt = seen.findIndex((entry) => entry[1].includes('INSERT INTO club_send_log'));
  const markedAt = seen.findIndex((entry) => entry[1].includes('announcement_sent_at ='));
  assert.ok(claimAt >= 0 && markedAt > claimAt);
});

test('a later announcement reaches only members who have not already received it', async () => {
  const people = [{ id: 2, email: 'mira@example.test', display_name: 'Mira' }];
  const claims = new Set(); const queued = [];
  const env = {
    MEMBERS: {
      prepare(sql) {
        return {
          async all() { return { results: people }; },
          bind(...args) {
            return {
              async first() {
                return { id: 7, status: 'published', starts_at: 2_000_000_000,
                  announcement_sent_at: 1_900_000_000, host_note: 'Come as you are.' };
              },
              async run() {
                if (!sql.includes('INSERT INTO club_send_log')) return { meta: { changes: 1 } };
                const key = `${args[0]}:${args[1]}:${args[2]}`;
                if (claims.has(key)) return { meta: { changes: 0 } };
                claims.add(key); return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  };
  const ctx = { waitUntil(value) { queued.push(value); } };

  let response = await announceSalon(env, 7, ctx, 1_900_000_100);
  assert.deepEqual(await response.json(), { ok: true, recipientCount: 1 });
  people.push({ id: 3, email: 'noor@example.test', display_name: 'Noor' });
  response = await announceSalon(env, 7, ctx, 1_900_000_200);
  assert.deepEqual(await response.json(), { ok: true, recipientCount: 1 });
  assert.equal(claims.size, 2);
  await Promise.all(queued);
});

test('RSVP confirmation is claimed once for each member and Salon', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'email_rsvp' }), { status: 200 });
  const claims = new Set();
  const queued = [];
  const env = {
    RESEND_API_KEY: 'test-key',
    MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
    MAIL_REPLY_TO: 'john@spacetobe.xyz',
    MEMBERS: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() {
                if (!sql.includes('INSERT INTO club_send_log')) return { meta: { changes: 1 } };
                const key = `${args[0]}:${args[1]}`;
                if (claims.has(key)) return { meta: { changes: 0 } };
                claims.add(key);
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  };
  const who = { id: 2, email: 'mira@example.test', display_name: 'Mira' };
  const salon = {
    id: 7, starts_at: 2_000_000_000, duration_minutes: 90, host_note: 'Come as you are.',
  };
  const ctx = { waitUntil(value) { queued.push(value); } };
  try {
    assert.equal(await queueSalonRsvpConfirmation(env, who, salon, ctx, 1_900_000_000), true);
    assert.equal(await queueSalonRsvpConfirmation(env, who, salon, ctx, 1_900_000_001), false);
    assert.equal(queued.length, 1);
    await Promise.all(queued);
  } finally {
    globalThis.fetch = original;
  }
});
