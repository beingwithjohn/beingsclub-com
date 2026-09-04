import { bad, json } from '../api.js';
import { sendFieldNoteInvitation } from '../mail/send.js';
import { issueMemberAccessLink } from './member-links.js';

const BODY_MAX = 5000;
const ALT_MAX = 240;
const URL_MAX = 2000;
const IMAGE_MAX = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export async function getMemberFieldNotes(env, who) {
  const id = memberId(who);
  const [prompt, notes] = await Promise.all([
    env.MEMBERS.prepare(
      `SELECT a.salon_id, a.prompted_at, s.starts_at
         FROM salon_attendance a JOIN salon s ON s.id = a.salon_id
        WHERE a.member_id = ?1 AND a.dismissed_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM field_note n
             WHERE n.salon_id = a.salon_id AND n.member_id = a.member_id
          )
        ORDER BY s.starts_at DESC LIMIT 1`,
    ).bind(id).first(),
    readNotes(env, false),
  ]);
  return json({
    prompt: prompt ? {
      salonId: prompt.salon_id,
      salonStartsAt: iso(prompt.starts_at),
      promptedAt: iso(prompt.prompted_at),
    } : null,
    groups: groupNotes(notes, id, false),
  });
}

export async function createFieldNote(env, who, body, timestamp = now()) {
  const id = memberId(who);
  const parsed = parseFieldNote(body);
  if (!parsed.ok) return bad(400, parsed.error);
  const salonId = positiveId(body?.salonId);
  if (!salonId) return bad(400, 'salon');

  const invitation = await env.MEMBERS.prepare(
    `SELECT 1 FROM salon_attendance
      WHERE salon_id = ?1 AND member_id = ?2 AND dismissed_at IS NULL`,
  ).bind(salonId, id).first();
  if (!invitation) return bad(403, 'not invited');
  const exists = await env.MEMBERS.prepare(
    'SELECT 1 FROM field_note WHERE salon_id = ?1 AND member_id = ?2',
  ).bind(salonId, id).first();
  if (exists) return bad(409, 'already shared');

  const image = await storeImage(env, id, parsed.image);
  if (parsed.image && !image) return bad(503, 'image unavailable');
  try {
    const result = await env.MEMBERS.prepare(
      `INSERT INTO field_note
        (salon_id, member_id, body, link_url, image_key, image_type, image_alt,
         is_anonymous, published_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?9)`,
    ).bind(
      salonId, id, parsed.body, parsed.linkUrl, image?.key || null,
      image?.type || null, parsed.imageAlt, parsed.isAnonymous ? 1 : 0, timestamp,
    ).run();
    return json({ ok: true, id: result.meta?.last_row_id }, 201);
  } catch (error) {
    if (image) await env.MEMBER_MEDIA.delete(image.key);
    throw error;
  }
}

export async function updateFieldNote(env, who, noteId, body, timestamp = now()) {
  const id = memberId(who);
  if (!positiveId(noteId)) return bad(404, 'not found');
  const existing = await env.MEMBERS.prepare(
    'SELECT * FROM field_note WHERE id = ?1 AND member_id = ?2',
  ).bind(noteId, id).first();
  if (!existing) return bad(404, 'not found');

  const parsed = parseFieldNote(body, {
    hasImage: !!existing.image_key && body?.removeImage !== true && !body?.imageData,
  });
  if (!parsed.ok) return bad(400, parsed.error);
  const replacement = await storeImage(env, id, parsed.image);
  if (parsed.image && !replacement) return bad(503, 'image unavailable');
  const imageKey = replacement?.key || (body?.removeImage === true ? null : existing.image_key);
  const imageType = replacement?.type || (body?.removeImage === true ? null : existing.image_type);
  try {
    await env.MEMBERS.prepare(
      `UPDATE field_note SET body = ?1, link_url = ?2, image_key = ?3,
         image_type = ?4, image_alt = ?5, is_anonymous = ?6,
         edited_at = ?7, updated_at = ?7
       WHERE id = ?8 AND member_id = ?9`,
    ).bind(
      parsed.body, parsed.linkUrl, imageKey, imageType, parsed.imageAlt,
      parsed.isAnonymous ? 1 : 0, timestamp, noteId, id,
    ).run();
  } catch (error) {
    if (replacement) await env.MEMBER_MEDIA.delete(replacement.key);
    throw error;
  }
  if ((replacement || body?.removeImage === true) && existing.image_key && env.MEMBER_MEDIA) {
    await env.MEMBER_MEDIA.delete(existing.image_key);
  }
  return json({ ok: true });
}

export async function removeOwnFieldNote(env, who, noteId, timestamp = now()) {
  const id = memberId(who);
  const note = await env.MEMBERS.prepare(
    'SELECT * FROM field_note WHERE id = ?1 AND member_id = ?2',
  ).bind(noteId, id).first();
  if (!note) return bad(404, 'not found');
  await env.MEMBERS.batch([
    env.MEMBERS.prepare('DELETE FROM field_note WHERE id = ?1 AND member_id = ?2').bind(noteId, id),
    env.MEMBERS.prepare(
      `UPDATE salon_attendance SET dismissed_at = ?1, updated_at = ?1
        WHERE salon_id = ?2 AND member_id = ?3`,
    ).bind(timestamp, note.salon_id, id),
  ]);
  if (note.image_key && env.MEMBER_MEDIA) await env.MEMBER_MEDIA.delete(note.image_key);
  return json({ ok: true });
}

export async function dismissFieldNoteInvitation(env, who, salonId, timestamp = now()) {
  const result = await env.MEMBERS.prepare(
    `UPDATE salon_attendance SET dismissed_at = ?1, updated_at = ?1
      WHERE salon_id = ?2 AND member_id = ?3 AND dismissed_at IS NULL`,
  ).bind(timestamp, salonId, memberId(who)).run();
  if ((result.meta?.changes ?? 0) !== 1) return bad(404, 'not found');
  return json({ ok: true });
}

export async function getFieldNoteImage(env, noteId) {
  if (!env.MEMBER_MEDIA) return bad(503, 'image unavailable');
  const note = await env.MEMBERS.prepare(
    'SELECT image_key, image_type FROM field_note WHERE id = ?1 AND image_key IS NOT NULL',
  ).bind(noteId).first();
  if (!note) return bad(404, 'not found');
  const object = await env.MEMBER_MEDIA.get(note.image_key);
  if (!object) return bad(404, 'not found');
  return new Response(object.body, {
    headers: {
      'content-type': note.image_type || 'application/octet-stream',
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function getHostFieldNotes(env, timestamp = now()) {
  const salon = await env.MEMBERS.prepare(
    `SELECT * FROM salon
      WHERE status IN ('published', 'closed') AND starts_at IS NOT NULL
        AND starts_at + (duration_minutes * 60) <= ?1
      ORDER BY starts_at DESC LIMIT 1`,
  ).bind(timestamp).first();
  let candidates = [];
  if (salon) {
    const rows = await env.MEMBERS.prepare(
      `SELECT m.id, m.email, m.display_name, r.status AS rsvp,
              a.prompted_at, a.email_sent_at,
              CASE WHEN n.id IS NULL THEN 0 ELSE 1 END AS shared
         FROM member m
         LEFT JOIN salon_rsvp r ON r.member_id = m.id AND r.salon_id = ?1
         LEFT JOIN salon_attendance a ON a.member_id = m.id AND a.salon_id = ?1
         LEFT JOIN field_note n ON n.member_id = m.id AND n.salon_id = ?1
        WHERE m.joined_at IS NOT NULL AND m.disabled_at IS NULL AND m.left_at IS NULL
        ORDER BY CASE r.status WHEN 'in' THEN 0 ELSE 1 END,
                 COALESCE(m.display_name, m.email) COLLATE NOCASE`,
    ).bind(salon.id).all();
    candidates = (rows.results || []).map((row) => ({
      memberId: row.id,
      name: row.display_name,
      email: row.email,
      rsvp: row.rsvp,
      prompted: !!row.prompted_at,
      emailed: !!row.email_sent_at,
      shared: !!row.shared,
    }));
  }
  return json({
    salon: salon ? { id: salon.id, startsAt: iso(salon.starts_at) } : null,
    candidates,
    groups: groupNotes(await readNotes(env, true), null, true),
  });
}

export async function inviteFieldNoteAttendees(env, who, salonId, body, ctx, timestamp = now()) {
  const ids = [...new Set((Array.isArray(body?.memberIds) ? body.memberIds : [])
    .map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return bad(400, 'choose attendees');
  const salon = await env.MEMBERS.prepare(
    `SELECT * FROM salon WHERE id = ?1 AND status IN ('published', 'closed')
      AND starts_at + (duration_minutes * 60) <= ?2`,
  ).bind(salonId, timestamp).first();
  if (!salon) return bad(404, 'not found');

  const placeholders = ids.map(() => '?').join(',');
  const allowed = await env.MEMBERS.prepare(
    `SELECT m.id, m.email, m.display_name,
            COALESCE(p.field_notes, 1) AS field_note_email,
            COALESCE(p.quiet, 0) AS email_quiet
       FROM member m LEFT JOIN member_email_pref p ON p.member_id = m.id
      WHERE m.id IN (${placeholders}) AND m.joined_at IS NOT NULL
        AND m.disabled_at IS NULL AND m.left_at IS NULL`,
  ).bind(...ids).all();
  const people = allowed.results || [];
  if (people.length !== ids.length) return bad(400, 'member');

  const existing = await env.MEMBERS.prepare(
    `SELECT member_id FROM salon_attendance
      WHERE salon_id = ?1 AND member_id IN (${placeholders})`,
  ).bind(salonId, ...ids).all();
  const already = new Set((existing.results || []).map((row) => Number(row.member_id)));
  const fresh = people.filter((person) => !already.has(Number(person.id)));
  if (fresh.length) {
    await env.MEMBERS.batch(fresh.map((person) => env.MEMBERS.prepare(
      `INSERT INTO salon_attendance
        (salon_id, member_id, marked_by, prompted_at, email_sent_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?4, ?4)`,
    ).bind(
      salonId, person.id, memberId(who), timestamp,
      wantsFieldNoteEmail(person) ? timestamp : null,
    )));
    const emailed = fresh.filter(wantsFieldNoteEmail);
    ctx.waitUntil(Promise.all(emailed.map(async (person) => {
      const actionUrl = await issueMemberAccessLink(env, person.id, timestamp);
      return sendFieldNoteInvitation(env, {
        email: person.email,
        name: person.display_name,
        salonStartsAt: salon.starts_at,
        actionUrl,
      });
    })));
  }
  return getHostFieldNotes(env, timestamp);
}

export async function hostRemoveFieldNote(env, noteId) {
  const note = await env.MEMBERS.prepare('SELECT * FROM field_note WHERE id = ?1').bind(noteId).first();
  if (!note) return bad(404, 'not found');
  await env.MEMBERS.prepare('DELETE FROM field_note WHERE id = ?1').bind(noteId).run();
  if (note.image_key && env.MEMBER_MEDIA) await env.MEMBER_MEDIA.delete(note.image_key);
  return json({ ok: true });
}

export function parseFieldNote(body, options = {}) {
  const text = String(body?.body ?? '').trim();
  if (text.length > BODY_MAX) return { ok: false, error: 'note too long' };
  const linkUrl = cleanUrl(body?.linkUrl);
  if (body?.linkUrl && !linkUrl) return { ok: false, error: 'link' };
  const image = parseImageData(body?.imageData);
  if (body?.imageData && !image) return { ok: false, error: 'image' };
  const imageAlt = String(body?.imageAlt ?? '').trim();
  if (imageAlt.length > ALT_MAX) return { ok: false, error: 'image description too long' };
  if (!text && !linkUrl && !image && !options.hasImage) return { ok: false, error: 'add something' };
  return {
    ok: true,
    body: text || null,
    linkUrl,
    image,
    imageAlt: imageAlt || null,
    isAnonymous: body?.isAnonymous === true,
  };
}

export function parseImageData(value) {
  if (!value) return null;
  const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(value));
  if (!match || !IMAGE_TYPES.has(match[1])) return null;
  try {
    const binary = atob(match[2]);
    if (!binary.length || binary.length > IMAGE_MAX) return null;
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { type: match[1], bytes };
  } catch {
    return null;
  }
}

async function readNotes(env, host) {
  const rows = await env.MEMBERS.prepare(
    `SELECT n.*, s.starts_at, m.display_name
      FROM field_note n
       JOIN salon s ON s.id = n.salon_id
       JOIN member m ON m.id = n.member_id
      ORDER BY s.starts_at DESC, n.published_at ASC, n.id ASC`,
  ).all();
  return (rows.results || []).map((row) => ({ ...row, host }));
}

function groupNotes(notes, viewerId, host) {
  const groups = [];
  for (const row of notes) {
    let group = groups.find((entry) => entry.salonId === row.salon_id);
    if (!group) {
      group = { salonId: row.salon_id, salonStartsAt: iso(row.starts_at), notes: [] };
      groups.push(group);
    }
    const anonymous = !!row.is_anonymous;
    group.notes.push({
      id: row.id,
      body: row.body,
      linkUrl: row.link_url,
      hasImage: !!row.image_key,
      imageAlt: row.image_alt,
      isAnonymous: anonymous,
      author: anonymous && !host ? null : (row.display_name || 'A being'),
      anonymousToMembers: anonymous && host,
      isMine: Number(row.member_id) === Number(viewerId),
      publishedAt: iso(row.published_at),
      editedAt: iso(row.edited_at),
    });
  }
  return groups;
}

async function storeImage(env, memberIdValue, image) {
  if (!image) return null;
  if (!env.MEMBER_MEDIA) return null;
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }[image.type];
  const key = `field-notes/${memberIdValue}/${crypto.randomUUID()}.${extension}`;
  await env.MEMBER_MEDIA.put(key, image.bytes, { httpMetadata: { contentType: image.type } });
  return { key, type: image.type };
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

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function memberId(who) {
  return Number(who.member_id ?? who.id);
}

function wantsFieldNoteEmail(person) {
  return Number(person.field_note_email) === 1 && Number(person.email_quiet) !== 1;
}

function iso(seconds) {
  return seconds == null ? null : new Date(Number(seconds) * 1000).toISOString();
}

function now() {
  return Math.floor(Date.now() / 1000);
}
