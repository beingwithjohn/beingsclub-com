import { bad, json } from '../api.js';
import { parseImageData } from './field-notes.js';

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2400;
const LOCATION_MAX = 240;
const URL_MAX = 2000;
const DEFAULT_TIMEZONE = 'Europe/London';

export async function getMemberInPersonEvents(env, timestamp = now()) {
  const rows = await env.MEMBERS.prepare(
    `SELECT * FROM in_person_event
      WHERE status = 'published' AND ends_at >= ?1
      ORDER BY starts_at ASC, id ASC`,
  ).bind(timestamp).all();
  return json({ events: (rows.results || []).map(shapeEvent) });
}

export async function getHostInPersonEvents(env) {
  const rows = await env.MEMBERS.prepare(
    `SELECT * FROM in_person_event
      ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END, starts_at ASC, id ASC`,
  ).all();
  return json({ events: (rows.results || []).map(shapeEvent) });
}

export async function saveHostInPersonEvent(env, who, body, timestamp = now()) {
  const parsed = parseInPersonEvent(body);
  if (!parsed.ok) return bad(400, parsed.error);
  const id = positiveId(body?.id);
  if (body?.id && !id) return bad(404, 'not found');

  const existing = id
    ? await env.MEMBERS.prepare(
      `SELECT * FROM in_person_event WHERE id = ?1 AND status IN ('draft', 'published')`,
    ).bind(id).first()
    : null;
  if (id && !existing) return bad(404, 'not found');

  const image = parsed.image ? await storeImage(env, parsed.image) : null;
  if (parsed.image && !image) return bad(503, 'image unavailable');
  const imageKey = image?.key || (body?.removeImage === true ? null : existing?.image_key || null);

  try {
    if (existing) {
      await env.MEMBERS.prepare(
        `UPDATE in_person_event SET title = ?1, description = ?2, starts_at = ?3,
           ends_at = ?4, timezone = ?5, location = ?6, booking_url = ?7,
           image_key = ?8, updated_at = ?9
         WHERE id = ?10`,
      ).bind(
        parsed.title, parsed.description, parsed.startsAt, parsed.endsAt,
        DEFAULT_TIMEZONE, parsed.location, parsed.bookingUrl, imageKey, timestamp, id,
      ).run();
    } else {
      await env.MEMBERS.prepare(
        `INSERT INTO in_person_event
          (title, description, starts_at, ends_at, timezone, location, booking_url,
           image_key, status, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'draft', ?9, ?10, ?10)`,
      ).bind(
        parsed.title, parsed.description, parsed.startsAt, parsed.endsAt,
        DEFAULT_TIMEZONE, parsed.location, parsed.bookingUrl, imageKey,
        memberId(who), timestamp,
      ).run();
    }
  } catch (error) {
    if (image && env.MEMBER_MEDIA) await env.MEMBER_MEDIA.delete(image.key);
    throw error;
  }

  if ((image || body?.removeImage === true) && isEventImageKey(existing?.image_key) && env.MEMBER_MEDIA) {
    await env.MEMBER_MEDIA.delete(existing.image_key);
  }
  return getHostInPersonEvents(env);
}

export async function publishHostInPersonEvent(env, eventId, timestamp = now()) {
  const id = positiveId(eventId);
  if (!id) return bad(404, 'not found');
  const event = await env.MEMBERS.prepare(
    `SELECT * FROM in_person_event WHERE id = ?1 AND status IN ('draft', 'published')`,
  ).bind(id).first();
  if (!event) return bad(404, 'not found');
  if (Number(event.ends_at) <= timestamp) return bad(409, 'event must end in the future');
  await env.MEMBERS.prepare(
    `UPDATE in_person_event
        SET status = 'published', published_at = COALESCE(published_at, ?1), updated_at = ?1
      WHERE id = ?2`,
  ).bind(timestamp, id).run();
  return getHostInPersonEvents(env);
}

export async function deleteHostInPersonEvent(env, eventId) {
  const id = positiveId(eventId);
  if (!id) return bad(404, 'not found');
  const event = await env.MEMBERS.prepare(
    'SELECT image_key FROM in_person_event WHERE id = ?1',
  ).bind(id).first();
  if (!event) return bad(404, 'not found');
  await env.MEMBERS.prepare('DELETE FROM in_person_event WHERE id = ?1').bind(id).run();
  if (isEventImageKey(event.image_key) && env.MEMBER_MEDIA) await env.MEMBER_MEDIA.delete(event.image_key);
  return getHostInPersonEvents(env);
}

export async function getInPersonEventImage(env, who, eventId) {
  if (!env.MEMBER_MEDIA) return bad(503, 'image unavailable');
  const id = positiveId(eventId);
  if (!id) return bad(404, 'not found');
  const row = await env.MEMBERS.prepare(
    `SELECT image_key, status FROM in_person_event WHERE id = ?1 AND image_key IS NOT NULL`,
  ).bind(id).first();
  if (!row || (!who.is_host && row.status !== 'published') || !isEventImageKey(row.image_key)) {
    return bad(404, 'not found');
  }
  const object = await env.MEMBER_MEDIA.get(row.image_key);
  if (!object) return bad(404, 'not found');
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || 'image/jpeg',
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function parseInPersonEvent(body) {
  const title = String(body?.title ?? '').trim();
  const description = String(body?.description ?? '').trim();
  const location = String(body?.location ?? '').trim();
  if (!title || title.length > TITLE_MAX) return { ok: false, error: 'title' };
  if (!description || description.length > DESCRIPTION_MAX) return { ok: false, error: 'description' };
  if (!location || location.length > LOCATION_MAX) return { ok: false, error: 'location' };
  const startsAt = parseInstant(body?.startsAt);
  const endsAt = parseInstant(body?.endsAt);
  if (!startsAt || !endsAt || endsAt <= startsAt) return { ok: false, error: 'date and time' };
  const bookingUrl = cleanUrl(body?.bookingUrl);
  if (!bookingUrl) return { ok: false, error: 'booking link' };
  const image = parseImageData(body?.imageData);
  if (body?.imageData && (!image || image.type === 'image/gif')) return { ok: false, error: 'image' };
  return { ok: true, title, description, location, startsAt, endsAt, bookingUrl, image };
}

function shapeEvent(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    timezone: row.timezone,
    location: row.location,
    bookingUrl: row.booking_url,
    hasImage: !!row.image_key,
    status: row.status,
    publishedAt: iso(row.published_at),
  };
}

async function storeImage(env, image) {
  if (!image || !env.MEMBER_MEDIA) return null;
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[image.type];
  if (!extension) return null;
  const key = `in-person/${crypto.randomUUID()}.${extension}`;
  await env.MEMBER_MEDIA.put(key, image.bytes, { httpMetadata: { contentType: image.type } });
  return { key };
}

function cleanUrl(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > URL_MAX) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseInstant(value) {
  const milliseconds = Date.parse(String(value ?? ''));
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : null;
}

function isEventImageKey(value) {
  return typeof value === 'string' && /^in-person\/[A-Za-z0-9-]+\.(?:jpg|png|webp)$/.test(value);
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function memberId(who) {
  return Number(who.member_id ?? who.id);
}

function iso(seconds) {
  return seconds == null ? null : new Date(Number(seconds) * 1000).toISOString();
}

function now() {
  return Math.floor(Date.now() / 1000);
}
