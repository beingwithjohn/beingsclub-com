import { bad, json } from '../api.js';
import { sendClubSalonEmail } from '../mail/send.js';

const HALF_HOUR = 30 * 60;
const DAY = 24 * 60 * 60;
const REMINDERS = [
  { kind: 'salon_week', preference: 'salon_week', offset: 7 * DAY },
  { kind: 'salon_day', preference: 'salon_day', offset: DAY },
];

export async function announceSalon(env, salonId, ctx, timestamp = now()) {
  if (!Number.isSafeInteger(salonId) || salonId <= 0) return bad(404, 'not found');
  const salon = await env.MEMBERS.prepare(
    `SELECT * FROM salon WHERE id = ?1 AND status = 'published'
      AND starts_at > ?2`,
  ).bind(salonId, timestamp).first();
  if (!salon) return bad(404, 'not found');
  if (salon.announcement_sent_at) return bad(409, 'announcement already sent');

  const recipients = await eligibleMembers(env, 'salon_announced');
  const claimed = await claimRecipients(env, recipients, 'salon_announced', String(salon.id), timestamp);
  await env.MEMBERS.prepare(
    `UPDATE salon SET announcement_sent_at = ?1, updated_at = ?1
      WHERE id = ?2 AND announcement_sent_at IS NULL`,
  ).bind(timestamp, salon.id).run();
  if (claimed.length) {
    ctx.waitUntil(Promise.all(claimed.map((person) => sendClubSalonEmail(env, {
      email: person.email,
      name: person.display_name,
      salonStartsAt: salon.starts_at,
      hostNote: salon.host_note,
      kind: 'announcement',
    }))));
  }
  return json({ ok: true, recipientCount: claimed.length });
}

export async function runClubMail(env, scheduledTime = Date.now()) {
  if (!env.MEMBERS) return { sent: 0 };
  const timestamp = Math.floor(Number(scheduledTime) / 1000);
  let sent = 0;
  for (const reminder of REMINDERS) {
    const salons = await env.MEMBERS.prepare(
      `SELECT * FROM salon
        WHERE status = 'published' AND starts_at IS NOT NULL
          AND starts_at - ?1 <= ?2 AND starts_at - ?1 > ?3`,
    ).bind(reminder.offset, timestamp, timestamp - HALF_HOUR).all();
    if (!(salons.results || []).length) continue;
    const recipients = await eligibleMembers(env, reminder.preference);
    for (const salon of salons.results || []) {
      const claimed = await claimRecipients(
        env, recipients, reminder.kind, String(salon.id), timestamp,
      );
      const outcomes = await Promise.all(claimed.map((person) => sendClubSalonEmail(env, {
        email: person.email,
        name: person.display_name,
        salonStartsAt: salon.starts_at,
        hostNote: salon.host_note,
        kind: reminder.kind === 'salon_week' ? 'week' : 'day',
      })));
      sent += outcomes.filter(Boolean).length;
    }
  }
  return { sent };
}

export function reminderWindow(startsAt, kind, timestamp) {
  const reminder = REMINDERS.find((entry) => entry.kind === kind);
  if (!reminder) return false;
  const target = Number(startsAt) - reminder.offset;
  return target <= Number(timestamp) && target > Number(timestamp) - HALF_HOUR;
}

async function eligibleMembers(env, preference) {
  if (!['salon_announced', 'salon_week', 'salon_day'].includes(preference)) return [];
  const rows = await env.MEMBERS.prepare(
    `SELECT m.id, m.email, m.display_name
       FROM member m LEFT JOIN member_email_pref p ON p.member_id = m.id
      WHERE m.joined_at IS NOT NULL AND m.disabled_at IS NULL AND m.left_at IS NULL
        AND COALESCE(p.quiet, 0) = 0
        AND COALESCE(p.${preference}, 1) = 1
      ORDER BY m.id`,
  ).all();
  return rows.results || [];
}

async function claimRecipients(env, people, kind, scope, timestamp) {
  const claimed = [];
  for (const person of people) {
    const result = await env.MEMBERS.prepare(
      `INSERT INTO club_send_log (member_id, kind, scope, claimed_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(member_id, kind, scope) DO NOTHING`,
    ).bind(person.id, kind, scope, timestamp).run();
    if ((result.meta?.changes ?? 0) === 1) claimed.push(person);
  }
  return claimed;
}

function now() {
  return Math.floor(Date.now() / 1000);
}
