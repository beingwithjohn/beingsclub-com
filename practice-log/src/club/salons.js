import { bad, json } from '../api.js';

const NOTE_MAX = 2400;
const URL_MAX = 2000;
const DEFAULT_TIMEZONE = 'Europe/London';
const DEFAULT_DURATION = 90;
const JOIN_EARLY_SECONDS = 10 * 60;

export async function getMemberSalon(env, who, timestamp = now()) {
  const salon = await env.MEMBERS.prepare(
    `SELECT s.*,
            (SELECT COUNT(*) FROM salon_rsvp r
              WHERE r.salon_id = s.id AND r.status = 'in') AS rsvp_count,
            (SELECT status FROM salon_rsvp r
              WHERE r.salon_id = s.id AND r.member_id = ?1) AS my_rsvp
       FROM salon s
      WHERE s.status = 'published'
        AND s.starts_at IS NOT NULL
        AND s.starts_at + (s.duration_minutes * 60) >= ?2
      ORDER BY s.starts_at ASC
      LIMIT 1`,
  ).bind(memberId(who), timestamp).first();

  return json({ salon: salon ? shapeMemberSalon(salon, timestamp) : null });
}

export async function setMemberRsvp(env, who, salonId, body, timestamp = now()) {
  if (!Number.isSafeInteger(salonId) || salonId <= 0) return bad(404, 'not found');
  const status = validRsvpStatus(body?.status);
  if (body?.status != null && !status) return bad(400, 'status');

  const salon = await env.MEMBERS.prepare(
    `SELECT id, starts_at FROM salon
      WHERE id = ?1 AND status = 'published'`,
  ).bind(salonId).first();
  if (!salon) return bad(404, 'not found');
  if (Number(salon.starts_at) <= timestamp) return bad(409, 'salon started');

  if (status == null) {
    await env.MEMBERS.prepare(
      'DELETE FROM salon_rsvp WHERE salon_id = ?1 AND member_id = ?2',
    ).bind(salonId, memberId(who)).run();
  } else {
    await env.MEMBERS.prepare(
      `INSERT INTO salon_rsvp
        (salon_id, member_id, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?4)
       ON CONFLICT(salon_id, member_id) DO UPDATE SET
         status = excluded.status, updated_at = excluded.updated_at`,
    ).bind(salonId, memberId(who), status, timestamp).run();
  }

  return getMemberSalon(env, who, timestamp);
}

export async function getHostSalon(env, timestamp = now()) {
  const salon = await env.MEMBERS.prepare(
    `SELECT s.*,
            (SELECT COUNT(*) FROM salon_rsvp r
              WHERE r.salon_id = s.id AND r.status = 'in') AS rsvp_count
       FROM salon s
      WHERE s.status IN ('draft', 'published')
      ORDER BY CASE s.status WHEN 'published' THEN 0 ELSE 1 END,
               COALESCE(s.starts_at, 9223372036854775807), s.created_at DESC
      LIMIT 1`,
  ).first();
  if (!salon) return json({ salon: null, rsvps: [] });

  const rsvps = await env.MEMBERS.prepare(
    `SELECT r.status, r.updated_at, m.id, m.email, m.display_name
       FROM salon_rsvp r JOIN member m ON m.id = r.member_id
      WHERE r.salon_id = ?1 AND m.disabled_at IS NULL AND m.left_at IS NULL
      ORDER BY CASE r.status WHEN 'in' THEN 0 ELSE 1 END,
               COALESCE(m.display_name, m.email) COLLATE NOCASE`,
  ).bind(salon.id).all();

  return json({
    salon: shapeHostSalon(salon, timestamp),
    rsvps: (rsvps.results || []).map((row) => ({
      memberId: row.id,
      name: row.display_name,
      email: row.email,
      status: row.status,
      updatedAt: iso(row.updated_at),
    })),
  });
}

export async function saveHostSalon(env, who, body, timestamp = now()) {
  const draft = parseSalonDraft(body);
  if (!draft.ok) return bad(400, draft.error);
  const id = Number(body?.id || 0);

  if (id) {
    if (!Number.isSafeInteger(id) || id <= 0) return bad(404, 'not found');
    const result = await env.MEMBERS.prepare(
      `UPDATE salon SET
         host_note = ?1, starts_at = ?2, timezone = ?3,
         duration_minutes = ?4, zoom_join_url = ?5, updated_at = ?6
       WHERE id = ?7 AND status IN ('draft', 'published')`,
    ).bind(
      draft.note, draft.startsAt, DEFAULT_TIMEZONE,
      draft.duration, draft.zoomUrl, timestamp, id,
    ).run();
    if ((result.meta?.changes ?? 0) !== 1) return bad(404, 'not found');
    return getHostSalon(env, timestamp);
  }

  const existing = await env.MEMBERS.prepare(
    `SELECT id FROM salon WHERE status IN ('draft', 'published') LIMIT 1`,
  ).first();
  if (existing) return bad(409, 'active salon exists');

  await env.MEMBERS.prepare(
    `INSERT INTO salon
      (host_note, starts_at, timezone, duration_minutes, zoom_join_url,
       status, created_by, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'draft', ?6, ?7, ?7)`,
  ).bind(
    draft.note, draft.startsAt, DEFAULT_TIMEZONE, draft.duration,
    draft.zoomUrl, memberId(who), timestamp,
  ).run();
  return getHostSalon(env, timestamp);
}

export async function publishHostSalon(env, body, timestamp = now()) {
  const id = Number(body?.id || 0);
  if (!Number.isSafeInteger(id) || id <= 0) return bad(404, 'not found');
  const salon = await env.MEMBERS.prepare(
    `SELECT * FROM salon WHERE id = ?1 AND status IN ('draft', 'published')`,
  ).bind(id).first();
  if (!salon) return bad(404, 'not found');

  const missing = publicationProblem(salon, timestamp);
  if (missing) return bad(409, missing);
  if (salon.status === 'draft') {
    await env.MEMBERS.prepare(
      `UPDATE salon SET status = 'published', published_at = ?1, updated_at = ?1
        WHERE id = ?2 AND status = 'draft'`,
    ).bind(timestamp, id).run();
  }
  return getHostSalon(env, timestamp);
}

export function validRsvpStatus(value) {
  if (value == null || value === '') return null;
  return value === 'in' || value === 'not_this_time' ? value : false;
}

export function parseSalonDraft(body) {
  const note = String(body?.note ?? '').trim();
  if (note.length > NOTE_MAX) return { ok: false, error: 'note too long' };

  const startsAt = parseInstant(body?.startsAt);
  if (body?.startsAt && startsAt == null) return { ok: false, error: 'date' };

  const duration = Number(body?.durationMinutes ?? DEFAULT_DURATION);
  if (!Number.isInteger(duration) || duration < 30 || duration > 240) {
    return { ok: false, error: 'duration' };
  }

  const zoomUrl = cleanUrl(body?.zoomUrl);
  if (body?.zoomUrl && !zoomUrl) return { ok: false, error: 'zoom url' };
  return { ok: true, note: note || null, startsAt, duration, zoomUrl };
}

export function publicationProblem(salon, timestamp = now()) {
  if (!String(salon.host_note || '').trim()) return 'add your note first';
  if (!Number(salon.starts_at)) return 'add the date and time first';
  if (Number(salon.starts_at) <= timestamp) return 'date must be in the future';
  if (!cleanUrl(salon.zoom_join_url)) return 'add the Zoom link first';
  return null;
}

export function joinWindow(salon, timestamp = now()) {
  const start = Number(salon.starts_at);
  const end = start + Number(salon.duration_minutes || DEFAULT_DURATION) * 60;
  return timestamp >= start - JOIN_EARLY_SECONDS && timestamp <= end;
}

function shapeMemberSalon(salon, timestamp) {
  return {
    id: salon.id,
    note: salon.host_note,
    startsAt: iso(salon.starts_at),
    timezone: salon.timezone,
    durationMinutes: salon.duration_minutes,
    rsvpCount: Number(salon.rsvp_count || 0),
    myRsvp: salon.my_rsvp || null,
    joinAvailableAt: iso(Number(salon.starts_at) - JOIN_EARLY_SECONDS),
    zoomUrl: joinWindow(salon, timestamp) ? salon.zoom_join_url : null,
  };
}

function shapeHostSalon(salon, timestamp) {
  return {
    id: salon.id,
    note: salon.host_note,
    startsAt: iso(salon.starts_at),
    timezone: salon.timezone,
    durationMinutes: salon.duration_minutes,
    zoomUrl: salon.zoom_join_url,
    status: salon.status,
    publishedAt: iso(salon.published_at),
    announcementSentAt: iso(salon.announcement_sent_at),
    rsvpCount: Number(salon.rsvp_count || 0),
    joinAvailableAt: salon.starts_at ? iso(Number(salon.starts_at) - JOIN_EARLY_SECONDS) : null,
    isJoinWindow: salon.starts_at ? joinWindow(salon, timestamp) : false,
  };
}

function memberId(who) {
  return Number(who.member_id ?? who.id);
}

function parseInstant(value) {
  if (value == null || value === '') return null;
  const milliseconds = Date.parse(String(value));
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : null;
}

function cleanUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > URL_MAX) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function iso(seconds) {
  return seconds == null ? null : new Date(Number(seconds) * 1000).toISOString();
}

function now() {
  return Math.floor(Date.now() / 1000);
}
