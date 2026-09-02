import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEmailPreferences, parseLeavePolicy } from '../src/club/settings.js';
import { announceSalon, reminderWindow } from '../src/club/mailer.js';
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
