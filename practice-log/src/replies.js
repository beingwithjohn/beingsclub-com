// Replies from John.
//
// Shared replies contain only John's rewritten public context. The original
// private message or practice note is deliberately absent from every response
// a participant can reach. Audio lives in a private R2 bucket and is streamed
// only after the same bearer-token check as the rest of the Practice Log.

import { isClosed, localDate } from './days.js';

const replyJson = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const replyBad = (status, message) => replyJson({ error: message }, status);

async function canSeeSharedReplies(env, { person, run }) {
  const today = localDate(Date.now(), person.timezone);
  const mark = await env.DB.prepare(
    `SELECT 1 FROM day_mark WHERE person_id = ?1 AND on_date = ?2`,
  ).bind(person.id, today).first();
  if (mark) return true;
  if (!isClosed(run, today)) return false;
  return !!(await env.DB.prepare(
    `SELECT 1 FROM day_mark WHERE person_id = ?1 LIMIT 1`,
  ).bind(person.id).first());
}

export async function listReplies(env, who) {
  const { person } = who;
  // A reply prompted by this person's own words is always theirs to open,
  // including from an email. Other people's shared replies follow the same
  // nothing-before-the-tap gate as the rest of the social surface.
  const sharedOpen = await canSeeSharedReplies(env, who);
  const rows = await env.DB.prepare(
    `SELECT id, recipient_person_id, visibility, public_context, body,
            audio_object, audio_mime, audio_ms, legacy_audio_url, created_at
       FROM host_reply
      WHERE recipient_person_id = ?1 OR (visibility = 'shared' AND ?2 = 1)
      ORDER BY created_at DESC, id DESC
      LIMIT 200`,
  ).bind(person.id, sharedOpen ? 1 : 0).all();

  return replyJson({
    replies: (rows.results || []).map((row) => ({
      id: row.id,
      visibility: row.visibility,
      context: row.visibility === 'shared' ? row.public_context : null,
      body: row.body,
      has_audio: !!row.audio_object,
      legacy_audio: row.legacy_audio_url || null,
      audio_mime: row.audio_mime || null,
      audio_ms: row.audio_ms || null,
      for_you: row.recipient_person_id === person.id,
      created_at: row.created_at,
    })),
  });
}

export async function getReplyAudio(env, who, id) {
  const { person } = who;
  if (!Number.isInteger(id)) return replyBad(400, 'id');

  const row = await env.DB.prepare(
    `SELECT recipient_person_id, visibility, audio_object, audio_mime
       FROM host_reply WHERE id = ?1`,
  ).bind(id).first();
  if (!row || !row.audio_object) return replyBad(404, 'not found');

  const allowed = !!person.is_host
    || row.recipient_person_id === person.id
    || (row.visibility === 'shared' && await canSeeSharedReplies(env, who));
  if (!allowed) return replyBad(404, 'not found');
  if (!env.AUDIO) return replyBad(503, 'audio unavailable');

  const object = await env.AUDIO.get(row.audio_object);
  if (!object) return replyBad(404, 'not found');

  return new Response(object.body, {
    headers: {
      'content-type': row.audio_mime || object.httpMetadata?.contentType || 'audio/webm',
      ...(Number.isFinite(object.size) ? { 'content-length': String(object.size) } : {}),
      'cache-control': 'private, no-store',
      'content-disposition': 'inline',
      ...(object.httpEtag ? { etag: object.httpEtag } : {}),
    },
  });
}

/** R2 does not participate in D1 cascades, so erase objects before the person. */
export async function deleteReplyAudioForPerson(env, personId) {
  if (!env.AUDIO) return;
  const rows = await env.DB.prepare(
    `SELECT audio_object FROM host_reply
      WHERE recipient_person_id = ?1 AND audio_object IS NOT NULL`,
  ).bind(personId).all();
  const keys = (rows.results || []).map((row) => row.audio_object).filter(Boolean);
  if (keys.length) await env.AUDIO.delete(keys);
}
