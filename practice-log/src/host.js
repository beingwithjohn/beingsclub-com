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

export async function hostRoute(env, request, url, who) {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/host/inbox' && method === 'GET') return inbox(env, who);
  if (path === '/api/host/people' && method === 'GET') return people(env, who);

  if (method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body) return bad(400, 'bad json');
    if (path === '/api/host/answer') return answer(env, who, body);
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
    `SELECT m.id, m.on_date, m.body, m.created_at, m.answer_body, m.answer_url, m.answered_at,
            p.id AS person_id, p.name, p.email
       FROM private_message m JOIN person p ON p.id = m.person_id
      WHERE p.run_id = ?1
      ORDER BY (m.answered_at IS NOT NULL), m.created_at DESC
      LIMIT 200`,
  ).bind(run.id).all();

  return json({
    messages: (rows.results || []).map((r) => ({
      id: r.id, person_id: r.person_id, name: r.name, email: r.email,
      on_date: r.on_date, body: r.body, created_at: r.created_at,
      answered: !!r.answered_at, answer: r.answer_body, audio: r.answer_url,
    })),
  });
}

// ---------------------------------------------------------------------------
// the roster
// ---------------------------------------------------------------------------
// Quiet days appear here and nowhere else in the product. They exist so John
// can notice someone has gone quiet and reach out as a person. They are never
// shown to the participant, never counted in the interface, never emailed.
async function people(env, { run }) {
  const rows = await env.DB.prepare(
    `SELECT p.id, p.name, p.email, p.timezone, p.nudge_hour, p.nudge_on, p.notes_on,
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
      id: r.id, name: r.name, email: r.email, timezone: r.timezone,
      nudge_hour: r.nudge_hour, nudge_on: !!r.nudge_on, notes_on: !!r.notes_on,
      message_from: r.message_from, message_until: r.message_until,
      joined_on: r.joined_on, left_at: r.left_at, is_host: !!r.is_host,
      marks: r.marks, last_mark: r.last_mark, quiet_days: quiet, today,
    });
  }

  return json({ run: { slug: run.slug, name: run.name, mode: run.mode }, people: out });
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
// answering — the one dark email
// ---------------------------------------------------------------------------
async function answer(env, { run }, body) {
  const id = Number(body.id);
  if (!Number.isInteger(id)) return bad(400, 'id');

  const text = String(body.body ?? '').trim();
  const audio = body.audio ? String(body.audio).trim() : null;
  if (!text && !audio) return bad(400, 'empty');
  if (audio && !/^https:\/\//.test(audio)) return bad(400, 'audio must be https');

  const msg = await env.DB.prepare(
    `SELECT m.*, p.id AS pid, p.name, p.email, p.token_enc, p.run_id
       FROM private_message m JOIN person p ON p.id = m.person_id
      WHERE m.id = ?1`,
  ).bind(id).first();
  if (!msg || msg.run_id !== run.id) return bad(404, 'not found');

  await env.DB.prepare(
    `UPDATE private_message SET answer_body = ?1, answer_url = ?2, answered_at = unixepoch()
      WHERE id = ?3`,
  ).bind(text || null, audio, id).run();

  // One notification per answer, even if the row is edited later.
  let mailed = false;
  if (await claim(env, msg.pid, 'answer', String(id))) {
    const url = logUrl(env, await unseal(env, msg.token_enc));
    mailed = await sendAnswered(env, { name: msg.name, email: msg.email }, url, {
      question: msg.body, askedOn: msg.on_date, answerText: text, audioUrl: audio,
    });
  }

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
