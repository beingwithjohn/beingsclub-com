import { bad, json } from '../api.js';

export const DEFAULT_EMAIL_PREFERENCES = Object.freeze({
  salonAnnounced: true, salonMonth: false, salonWeek: true,
  salonDay: true, salonHour: false,
  fieldNotes: true,
  quiet: false,
});

const LEAVE_POLICIES = new Set(['keep_signed', 'anonymise', 'remove']);

export async function getMemberSettings(env, who) {
  const row = await env.MEMBERS.prepare(
    `SELECT salon_announced, salon_month, salon_week, salon_day, salon_hour, field_notes, quiet
       FROM member_email_pref WHERE member_id = ?1`,
  ).bind(memberId(who)).first();
  return json(settingsPayload(who, row));
}

export async function updateMemberSettings(env, who, body, timestamp = now()) {
  const parsed = parseEmailPreferences(body?.email);
  if (!parsed.ok) return bad(400, 'email preferences');
  await env.MEMBERS.prepare(
    `INSERT INTO member_email_pref
      (member_id, salon_announced, salon_month, salon_week, salon_day, salon_hour,
       field_notes, quiet, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
     ON CONFLICT(member_id) DO UPDATE SET
       salon_announced = excluded.salon_announced,
       salon_month = excluded.salon_month,
       salon_week = excluded.salon_week,
       salon_day = excluded.salon_day,
       salon_hour = excluded.salon_hour,
       field_notes = excluded.field_notes,
       quiet = excluded.quiet,
       updated_at = excluded.updated_at`,
  ).bind(
    memberId(who), number(parsed.email.salonAnnounced), number(parsed.email.salonMonth),
    number(parsed.email.salonWeek), number(parsed.email.salonDay),
    number(parsed.email.salonHour), number(parsed.email.fieldNotes),
    number(parsed.email.quiet), timestamp,
  ).run();
  return json(settingsPayload(who, parsed.email));
}

export async function signOutEverywhere(env, who, timestamp = now()) {
  await env.MEMBERS.prepare(
    `UPDATE member_session SET revoked_at = ?1
      WHERE member_id = ?2 AND revoked_at IS NULL`,
  ).bind(timestamp, memberId(who)).run();
  return json({ ok: true });
}

export async function leaveClub(env, who, body, timestamp = now()) {
  const policy = parseLeavePolicy(body);
  if (!policy) return bad(400, 'leave');
  const id = memberId(who);

  if (who.is_host) {
    const hosts = await env.MEMBERS.prepare(
      `SELECT COUNT(*) AS n FROM member
        WHERE is_host = 1 AND disabled_at IS NULL AND left_at IS NULL`,
    ).first();
    if (Number(hosts?.n || 0) <= 1) return bad(409, 'last host');
  }

  const profile = await env.MEMBERS.prepare(
    `SELECT profile_image FROM member
      WHERE id = ?1 AND disabled_at IS NULL AND left_at IS NULL`,
  ).bind(id).first();
  if (!profile) return bad(404, 'not found');

  const noteImages = policy === 'remove'
    ? await env.MEMBERS.prepare(
      'SELECT image_key FROM field_note WHERE member_id = ?1 AND image_key IS NOT NULL',
    ).bind(id).all()
    : { results: [] };

  const statements = [
    env.MEMBERS.prepare(
      `UPDATE member SET website = NULL, profile_line = NULL, profile_image = NULL,
         left_at = ?1, leave_note_policy = ?2, updated_at = ?1
       WHERE id = ?3 AND disabled_at IS NULL AND left_at IS NULL`,
    ).bind(timestamp, policy, id),
    env.MEMBERS.prepare(
      `INSERT INTO member_email_pref
        (member_id, salon_announced, salon_month, salon_week, salon_day, salon_hour,
         field_notes, quiet, created_at, updated_at)
       VALUES (?1, 0, 0, 0, 0, 0, 0, 1, ?2, ?2)
       ON CONFLICT(member_id) DO UPDATE SET
         salon_announced = 0, salon_month = 0, salon_week = 0, salon_day = 0,
         salon_hour = 0,
         field_notes = 0, quiet = 1, updated_at = excluded.updated_at`,
    ).bind(id, timestamp),
    env.MEMBERS.prepare('DELETE FROM salon_rsvp WHERE member_id = ?1').bind(id),
    env.MEMBERS.prepare('DELETE FROM salon_attendance WHERE member_id = ?1').bind(id),
    env.MEMBERS.prepare(
      `UPDATE member_testimonial SET status = 'withdrawn', updated_at = ?1,
         resolved_at = ?1, resolved_by = NULL
       WHERE member_id = ?2 AND status = 'pending'`,
    ).bind(timestamp, id),
    env.MEMBERS.prepare(
      `UPDATE member_session SET revoked_at = ?1
        WHERE member_id = ?2 AND revoked_at IS NULL`,
    ).bind(timestamp, id),
  ];
  if (policy === 'anonymise') {
    statements.push(env.MEMBERS.prepare(
      'UPDATE field_note SET is_anonymous = 1, updated_at = ?1 WHERE member_id = ?2',
    ).bind(timestamp, id));
  } else if (policy === 'remove') {
    statements.push(env.MEMBERS.prepare('DELETE FROM field_note WHERE member_id = ?1').bind(id));
  }
  await env.MEMBERS.batch(statements);

  if (env.MEMBER_MEDIA) {
    const keys = [profile.profile_image, ...(noteImages.results || []).map((row) => row.image_key)]
      .filter(Boolean);
    await Promise.all(keys.map((key) => env.MEMBER_MEDIA.delete(key)));
  }
  return json({ ok: true, notePolicy: policy });
}

export function parseEmailPreferences(value) {
  if (!value || typeof value !== 'object') return { ok: false };
  const keys = [
    'salonAnnounced', 'salonMonth', 'salonWeek', 'salonDay', 'salonHour',
    'fieldNotes', 'quiet',
  ];
  if (!keys.every((key) => typeof value[key] === 'boolean')) return { ok: false };
  return { ok: true, email: Object.fromEntries(keys.map((key) => [key, value[key]])) };
}

export function parseLeavePolicy(value) {
  if (value?.confirm !== 'LEAVE') return null;
  return LEAVE_POLICIES.has(value?.notePolicy) ? value.notePolicy : null;
}

function settingsPayload(member, row) {
  return {
    email: row ? {
      salonAnnounced: boolean(row.salon_announced ?? row.salonAnnounced),
      salonMonth: boolean(row.salon_month ?? row.salonMonth),
      salonWeek: boolean(row.salon_week ?? row.salonWeek),
      salonDay: boolean(row.salon_day ?? row.salonDay),
      salonHour: boolean(row.salon_hour ?? row.salonHour),
      fieldNotes: boolean(row.field_notes ?? row.fieldNotes),
      quiet: boolean(row.quiet),
    } : { ...DEFAULT_EMAIL_PREFERENCES },
    account: {
      email: member.email,
      joinedAt: iso(member.joined_at),
      isHost: !!member.is_host,
    },
  };
}

function memberId(who) {
  return Number(who.member_id ?? who.id);
}

function number(value) {
  return value ? 1 : 0;
}

function boolean(value) {
  return Number(value) === 1 || value === true;
}

function iso(seconds) {
  return seconds == null ? null : new Date(Number(seconds) * 1000).toISOString();
}

function now() {
  return Math.floor(Date.now() / 1000);
}
