// John's side.
//
// Not designed in the bundle, and deliberately plain: a list of what people
// have asked him, a roster, and the two things only he can do — answer, and
// remove a note. Ten people do not need an inbox with features.
//
// Everything here is gated on is_host, and a non-host gets a 404 rather than a
// 403: the surface does not announce itself to someone who cannot use it.

import { json, bad } from './api.js';
import { localDate, addDays, diffDays, anchorOf, quietDays, isDate } from './days.js';
import { unseal, logUrl, inviteUrl, mintToken } from './auth.js';
import { sendAnswered, sendWeekLetter, sendInvitation, claim } from './mail/send.js';

const REPLY_BODY_MAX = 4000;
const REPLY_CONTEXT_MAX = 500;
const REPLY_AUDIO_MAX_MS = 20 * 60 * 1000;
const REPLY_AUDIO_MAX_BYTES = 25 * 1024 * 1024;
const REPLY_AUDIO_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/x-m4a']);

export async function hostRoute(env, request, url, who) {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/host/inbox' && method === 'GET') return inbox(env, who);
  if (path === '/api/host/people' && method === 'GET') return people(env, who);
  if (path === '/api/host/notes' && method === 'GET') return notes(env, who);

  if (path === '/api/host/reply' && method === 'POST') {
    const form = await request.formData().catch(() => null);
    if (!form) return bad(400, 'bad form');
    return reply(env, who, form);
  }

  if (method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body) return bad(400, 'bad json');
    if (path === '/api/host/answer') return answer(env, who, body);
    if (path === '/api/host/reply/visibility') return setReplyVisibility(env, who, body);
    if (path === '/api/host/reply/remove') return removeReply(env, who, body);
    if (path === '/api/host/note/remove') return removeNote(env, who, body);
    if (path === '/api/host/week') return weekLetter(env, who, body);
    if (path === '/api/host/invite') return invite(env, who, body);
    if (path === '/api/host/message-access') return setMessageAccess(env, who, body);
  }

  return bad(404, 'not found');
}

// ---------------------------------------------------------------------------
// inviting someone — the mutual yes, made into a link
// ---------------------------------------------------------------------------
// This is the yes. It creates the row but not yet the person: until they
// accept, they are not one of the ten, not on the roster, and cannot sign in.
async function invite(env, { run }, body) {
  const name = String(body.name || '').trim().slice(0, 40);
  const email = String(body.email || '').trim().toLowerCase();
  if (!name) return bad(400, 'name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(400, 'email');

  // Inviting past the last place is allowed — people say no, and John may want
  // one in hand — but he is told rather than finding out afterwards.
  if (run.places && body.force !== true) {
    const taken = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM person
        WHERE run_id = ?1 AND is_host = 0 AND took_place_at IS NOT NULL AND left_at IS NULL`,
    ).bind(run.id).first();
    if ((taken?.n || 0) >= run.places) {
      return json({ ok: false, full: true, message: 'Every place is taken. Send force:true to invite anyway.' });
    }
  }

  const invited = await mintToken(env);
  const session = await mintToken(env);
  const joinedOn = run.mode === 'fixed'
    ? run.starts_on
    : localDate(Date.now(), 'Europe/London');

  await env.DB.prepare(
    `INSERT INTO person (run_id, name, email, token_hash, token_enc,
                         invite_hash, invite_sent_at, joined_on)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, unixepoch(), ?7)
     ON CONFLICT (run_id, email) DO UPDATE SET
       name = excluded.name,
       invite_hash = excluded.invite_hash,
       invite_sent_at = unixepoch()`,
  ).bind(run.id, name, email, session.token_hash, session.token_enc,
    invited.token_hash, joinedOn).run();

  const url = inviteUrl(env, invited.token);
  // The link comes back either way, so John can send it in his own words.
  const mailed = body.send === false ? false : await sendInvitation(env, { name, email }, run, url);

  return json({ ok: true, url, mailed });
}

// ---------------------------------------------------------------------------
// what people have asked
// ---------------------------------------------------------------------------
async function inbox(env, { run }) {
  const rows = await env.DB.prepare(
    `SELECT m.id, m.on_date, m.body, m.created_at,
            p.id AS person_id, p.name, p.email,
            hr.id AS reply_id, hr.visibility AS reply_visibility,
            hr.public_context AS reply_context, hr.body AS reply_body,
            hr.audio_object AS reply_audio_object, hr.audio_ms AS reply_audio_ms,
            hr.legacy_audio_url AS reply_legacy_audio, hr.created_at AS replied_at
       FROM private_message m JOIN person p ON p.id = m.person_id
       LEFT JOIN host_reply hr ON hr.source_message_id = m.id
      WHERE p.run_id = ?1
      ORDER BY (hr.id IS NOT NULL), m.created_at DESC
      LIMIT 200`,
  ).bind(run.id).all();

  return json({
    messages: (rows.results || []).map((r) => ({
      id: r.id, person_id: r.person_id, name: r.name, email: r.email,
      on_date: r.on_date, body: r.body, created_at: r.created_at,
      reply: hostReplyFromRow(r),
    })),
  });
}

// ---------------------------------------------------------------------------
// practice notes John can reply to — host only
// ---------------------------------------------------------------------------
async function notes(env, { run }) {
  const rows = await env.DB.prepare(
    `SELECT n.person_id, n.on_date, n.body, n.created_at,
            p.name, p.email,
            hr.id AS reply_id, hr.visibility AS reply_visibility,
            hr.public_context AS reply_context, hr.body AS reply_body,
            hr.audio_object AS reply_audio_object, hr.audio_ms AS reply_audio_ms,
            hr.legacy_audio_url AS reply_legacy_audio, hr.created_at AS replied_at
       FROM note n JOIN person p ON p.id = n.person_id
       LEFT JOIN host_reply hr
         ON hr.recipient_person_id = n.person_id
        AND hr.source_message_id IS NULL
        AND hr.source_note_date = n.on_date
      WHERE p.run_id = ?1 AND n.removed_at IS NULL
      ORDER BY n.on_date DESC, n.created_at DESC
      LIMIT 200`,
  ).bind(run.id).all();

  return json({
    notes: (rows.results || []).map((r) => ({
      person_id: r.person_id, name: r.name, email: r.email,
      on_date: r.on_date, body: r.body, created_at: r.created_at,
      reply: hostReplyFromRow(r),
    })),
  });
}

function hostReplyFromRow(row) {
  if (!row.reply_id) return null;
  return {
    id: row.reply_id,
    visibility: row.reply_visibility,
    context: row.reply_context,
    body: row.reply_body,
    has_audio: !!row.reply_audio_object,
    audio_ms: row.reply_audio_ms,
    legacy_audio: row.reply_legacy_audio || null,
    created_at: row.replied_at,
  };
}

// ---------------------------------------------------------------------------
// the roster
// ---------------------------------------------------------------------------
// Quiet days appear here and nowhere else in the product. They exist so John
// can notice someone has gone quiet and reach out as a person. They are never
// shown to the participant, never counted in the interface, never emailed.
async function people(env, { run }) {
  const rows = await env.DB.prepare(
    `SELECT p.id, p.name, p.email, p.line, p.profile_image,
            p.timezone, p.nudge_hour, p.nudge_on, p.notes_on,
            p.message_from, p.message_until,
            p.joined_on, p.left_at, p.is_host,
            (SELECT COUNT(*) FROM day_mark d WHERE d.person_id = p.id) AS marks,
            (SELECT MAX(d.on_date) FROM day_mark d WHERE d.person_id = p.id) AS last_mark
       FROM person p WHERE p.run_id = ?1
      ORDER BY p.is_host, p.name`,
  ).bind(run.id).all();

  const now = Date.now();
  const out = [];
  for (const r of rows.results || []) {
    const today = localDate(now, r.timezone);
    const anchor = anchorOf(run, r);
    let quiet = null;
    if (!r.left_at && !r.is_host) {
      const since = diffDays(anchor, addDays(today, -30)) > 0 ? addDays(today, -30) : anchor;
      const marks = await env.DB.prepare(
        `SELECT on_date FROM day_mark WHERE person_id = ?1 AND on_date >= ?2 AND on_date < ?3`,
      ).bind(r.id, since, today).all();
      quiet = quietDays(new Set((marks.results || []).map((m) => m.on_date)), today, since);
    }
    out.push({
      id: r.id, name: r.name, email: r.email, line: r.line,
      profile_image: r.profile_image, timezone: r.timezone,
      nudge_hour: r.nudge_hour, nudge_on: !!r.nudge_on, notes_on: !!r.notes_on,
      message_from: r.message_from, message_until: r.message_until,
      joined_on: r.joined_on, left_at: r.left_at, is_host: !!r.is_host,
      marks: r.marks, last_mark: r.last_mark, quiet_days: quiet, today,
    });
  }

  return json({
    run: { slug: run.slug, name: run.name, mode: run.mode, public_join: run.public_join },
    people: out,
  });
}

// ---------------------------------------------------------------------------
// the private line to John — granted only while a course is running
// ---------------------------------------------------------------------------
async function setMessageAccess(env, { run }, body) {
  const personId = Number(body.person_id);
  if (!Number.isInteger(personId)) return bad(400, 'person_id');

  const clear = body.from == null && body.until == null;
  const from = clear ? null : String(body.from || '');
  const until = clear ? null : String(body.until || '');
  if (!clear && (!isDate(from) || !isDate(until) || from > until)) {
    return bad(400, 'dates');
  }

  const owner = await env.DB.prepare(
    `SELECT 1 FROM person WHERE id = ?1 AND run_id = ?2 AND is_host = 0`,
  ).bind(personId, run.id).first();
  if (!owner) return bad(404, 'not found');

  await env.DB.prepare(
    `UPDATE person SET message_from = ?1, message_until = ?2 WHERE id = ?3`,
  ).bind(from, until, personId).run();
  return json({ ok: true, message_from: from, message_until: until });
}

// ---------------------------------------------------------------------------
// replies — private to one person, or shared through John's rewritten context
// ---------------------------------------------------------------------------
async function reply(env, { run }, form) {
  const sourceType = String(form.get('source_type') || '');
  const visibility = String(form.get('visibility') || 'private');
  const context = String(form.get('context') || '').trim();
  const text = String(form.get('body') || '').trim();
  const audio = form.get('audio');
  const hasAudio = !!audio && typeof audio.arrayBuffer === 'function' && Number(audio.size) > 0;
  const audioMs = Number(form.get('audio_ms') || 0);

  if (!['private', 'shared'].includes(visibility)) return bad(400, 'visibility');
  if (text.length > REPLY_BODY_MAX) return bad(400, 'reply too long');
  if (context.length > REPLY_CONTEXT_MAX) return bad(400, 'context too long');
  if (visibility === 'shared' && !context) return bad(400, 'public context');
  if (!text && !hasAudio) return bad(400, 'empty');

  const source = await replySource(env, run, sourceType, form);
  if (!source) return bad(404, 'not found');

  const existing = sourceType === 'message'
    ? await env.DB.prepare(`SELECT id FROM host_reply WHERE source_message_id = ?1`).bind(source.source_id).first()
    : await env.DB.prepare(
      `SELECT id FROM host_reply
        WHERE source_message_id IS NULL AND recipient_person_id = ?1 AND source_note_date = ?2`,
    ).bind(source.pid, source.source_date).first();
  if (existing) return bad(409, 'already replied');

  let audioKey = null;
  let audioMime = null;
  if (hasAudio) {
    if (!env.AUDIO) return bad(503, 'audio storage unavailable');
    if (Number(audio.size) > REPLY_AUDIO_MAX_BYTES) return bad(413, 'recording too large');
    if (!Number.isInteger(audioMs) || audioMs < 1 || audioMs > REPLY_AUDIO_MAX_MS) {
      return bad(400, 'recording length');
    }
    audioMime = String(audio.type || '').split(';')[0].toLowerCase();
    if (!REPLY_AUDIO_TYPES.has(audioMime)) return bad(415, 'recording type');
    audioKey = `replies/${crypto.randomUUID()}`;
    await env.AUDIO.put(audioKey, await audio.arrayBuffer(), {
      httpMetadata: { contentType: audioMime },
      customMetadata: { duration_ms: String(audioMs) },
    });
  }

  try {
    await env.DB.prepare(
      `INSERT INTO host_reply
        (recipient_person_id, source_message_id, source_note_date,
         visibility, public_context, body, audio_object, audio_mime, audio_ms)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    ).bind(
      source.pid,
      sourceType === 'message' ? source.source_id : null,
      sourceType === 'note' ? source.source_date : null,
      visibility,
      visibility === 'shared' ? context : null,
      text || null,
      audioKey,
      audioMime,
      hasAudio ? audioMs : null,
    ).run();
  } catch (error) {
    if (audioKey && env.AUDIO) await env.AUDIO.delete(audioKey);
    throw error;
  }

  const saved = sourceType === 'message'
    ? await env.DB.prepare(`SELECT id FROM host_reply WHERE source_message_id = ?1`).bind(source.source_id).first()
    : await env.DB.prepare(
      `SELECT id FROM host_reply
        WHERE source_message_id IS NULL AND recipient_person_id = ?1 AND source_note_date = ?2`,
    ).bind(source.pid, source.source_date).first();

  if (!saved?.id) {
    if (audioKey && env.AUDIO) await env.AUDIO.delete(audioKey);
    return bad(500, 'reply was not saved');
  }

  const mailed = await notifyReply(env, source, saved.id, visibility, hasAudio);
  return json({ ok: true, id: saved.id, mailed });
}

async function replySource(env, run, sourceType, fields) {
  if (sourceType === 'message') {
    const id = Number(fields.get('message_id'));
    if (!Number.isInteger(id)) return null;
    return env.DB.prepare(
      `SELECT m.id AS source_id, m.on_date AS source_date,
              p.id AS pid, p.name, p.email, p.token_enc, p.run_id
         FROM private_message m JOIN person p ON p.id = m.person_id
        WHERE m.id = ?1 AND p.run_id = ?2`,
    ).bind(id, run.id).first();
  }
  if (sourceType === 'note') {
    const personId = Number(fields.get('person_id'));
    const date = String(fields.get('note_date') || '');
    if (!Number.isInteger(personId) || !isDate(date)) return null;
    return env.DB.prepare(
      `SELECT n.on_date AS source_date,
              p.id AS pid, p.name, p.email, p.token_enc, p.run_id
         FROM note n JOIN person p ON p.id = n.person_id
        WHERE n.person_id = ?1 AND n.on_date = ?2 AND n.removed_at IS NULL AND p.run_id = ?3`,
    ).bind(personId, date, run.id).first();
  }
  return null;
}

async function notifyReply(env, source, replyId, visibility, hasAudio) {
  if (!(await claim(env, source.pid, 'reply', String(replyId)))) return false;
  const base = logUrl(env, await unseal(env, source.token_enc));
  const url = `${base}&view=from-john&reply=${replyId}`;
  return sendAnswered(env, { name: source.name, email: source.email }, url, {
    visibility, hasAudio,
  });
}

async function hostReply(env, run, id) {
  if (!Number.isInteger(id)) return null;
  return env.DB.prepare(
    `SELECT hr.*, p.run_id
       FROM host_reply hr JOIN person p ON p.id = hr.recipient_person_id
      WHERE hr.id = ?1 AND p.run_id = ?2`,
  ).bind(id, run.id).first();
}

async function setReplyVisibility(env, { run }, body) {
  const id = Number(body.id);
  const visibility = String(body.visibility || '');
  const context = String(body.context || '').trim();
  if (!['private', 'shared'].includes(visibility)) return bad(400, 'visibility');
  if (context.length > REPLY_CONTEXT_MAX) return bad(400, 'context too long');
  if (visibility === 'shared' && !context) return bad(400, 'public context');
  if (!(await hostReply(env, run, id))) return bad(404, 'not found');

  await env.DB.prepare(
    `UPDATE host_reply
        SET visibility = ?1, public_context = ?2, updated_at = unixepoch()
      WHERE id = ?3`,
  ).bind(visibility, visibility === 'shared' ? context : null, id).run();
  return json({ ok: true, visibility, context: visibility === 'shared' ? context : null });
}

async function removeReply(env, { run }, body) {
  const id = Number(body.id);
  const row = await hostReply(env, run, id);
  if (!row) return bad(404, 'not found');
  if (row.audio_object && env.AUDIO) await env.AUDIO.delete(row.audio_object);
  await env.DB.prepare(`DELETE FROM host_reply WHERE id = ?1`).bind(id).run();
  return json({ ok: true });
}

// Compatibility for an already-open copy of the former URL-paste host page.
async function answer(env, { run }, body) {
  const id = Number(body.id);
  const text = String(body.body ?? '').trim();
  const audio = body.audio ? String(body.audio).trim() : null;
  if (!Number.isInteger(id) || (!text && !audio)) return bad(400, 'empty');
  if (audio && !/^https:\/\//.test(audio)) return bad(400, 'audio must be https');

  const source = await env.DB.prepare(
    `SELECT m.id AS source_id, m.on_date AS source_date,
            p.id AS pid, p.name, p.email, p.token_enc, p.run_id
       FROM private_message m JOIN person p ON p.id = m.person_id
      WHERE m.id = ?1 AND p.run_id = ?2`,
  ).bind(id, run.id).first();
  if (!source) return bad(404, 'not found');
  const existing = await env.DB.prepare(`SELECT id FROM host_reply WHERE source_message_id = ?1`).bind(id).first();
  if (existing) return bad(409, 'already replied');

  await env.DB.prepare(
    `INSERT INTO host_reply
      (recipient_person_id, source_message_id, visibility, body, legacy_audio_url)
     VALUES (?1, ?2, 'private', ?3, ?4)`,
  ).bind(source.pid, id, text || null, audio).run();
  await env.DB.prepare(
    `UPDATE private_message SET answer_body = ?1, answer_url = ?2, answered_at = unixepoch() WHERE id = ?3`,
  ).bind(text || null, audio, id).run();
  const saved = await env.DB.prepare(`SELECT id FROM host_reply WHERE source_message_id = ?1`).bind(id).first();
  const mailed = await notifyReply(env, source, saved.id, 'private', !!audio);
  return json({ ok: true, mailed });
}

// ---------------------------------------------------------------------------
// removing a note
// ---------------------------------------------------------------------------
// The person's mark stays and they are not told. There is no reporting UI —
// ten people who chose to be here, one host who reads everything.
async function removeNote(env, { run }, body) {
  const personId = Number(body.person_id);
  const date = String(body.date || '');
  if (!Number.isInteger(personId) || !date) return bad(400, 'person_id and date');

  const owner = await env.DB.prepare(
    `SELECT 1 FROM person WHERE id = ?1 AND run_id = ?2`,
  ).bind(personId, run.id).first();
  if (!owner) return bad(404, 'not found');

  await env.DB.prepare(
    `UPDATE note SET removed_at = unixepoch() WHERE person_id = ?1 AND on_date = ?2`,
  ).bind(personId, date).run();

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// the Wednesday letter — the only send John triggers by hand
// ---------------------------------------------------------------------------
async function weekLetter(env, { run }, body) {
  // This one goes to everybody, so it will not fire on a stray request.
  if (body.confirm !== true) return bad(400, 'set confirm:true to send to everyone');

  const weekNumber = Number(body.week_number);
  if (!Number.isInteger(weekNumber) || weekNumber < 1) return bad(400, 'week_number');

  const scope = `week-${weekNumber}`;
  const rows = await env.DB.prepare(
    `SELECT id, name, email, token_enc FROM person
      WHERE run_id = ?1 AND left_at IS NULL AND is_host = 0`,
  ).bind(run.id).all();

  let sent = 0;
  const skipped = [];
  for (const p of rows.results || []) {
    if (!(await claim(env, p.id, 'week', scope))) { skipped.push(p.email); continue; }
    const url = logUrl(env, await unseal(env, p.token_enc));
    const ok = await sendWeekLetter(env, p, run, url, {
      weekNumber,
      principle: body.principle || null,
      bodyHtml: body.body || '',
      listenUrl: body.listen_url || null,
      mapUrl: body.map_url || null,
    });
    if (ok) sent++;
  }

  return json({ ok: true, sent, already_sent: skipped });
}
