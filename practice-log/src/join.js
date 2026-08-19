// The public front door to the one evergreen Practice Log.
//
// It creates no course place and returns no credential. The link is sent only
// to the address that will own it. Repeating the request sends the same link,
// at most once an hour, rather than minting another one.

import { json, bad } from './api.js';
import { mintToken, unseal, logUrl } from './auth.js';
import { localDate, validTimezone } from './days.js';
import { sendWelcome, sendYourLinks, claim } from './mail/send.js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function postJoin(env, body) {
  const email = String(body?.email ?? '').trim().toLowerCase();
  const same = json({ ok: true });
  if (!EMAIL.test(email) || email.length > 200) return same;

  const run = await env.DB.prepare(
    `SELECT * FROM run WHERE public_join = 1 AND mode = 'evergreen' LIMIT 1`,
  ).first();
  if (!run) return bad(503, 'not open');

  const timezone = typeof body?.timezone === 'string' && validTimezone(body.timezone)
    ? body.timezone : 'Europe/London';
  const name = String(body?.name ?? '').trim().slice(0, 40);

  let person = await env.DB.prepare(
    `SELECT * FROM person WHERE run_id = ?1 AND email = ?2`,
  ).bind(run.id, email).first();
  let fresh = false;

  if (!person) {
    // The interface requires a name. Returning the same response here avoids
    // turning that validation into a way to ask whether an email has an account.
    if (!name) return same;
    const token = await mintToken(env);
    const joinedOn = localDate(Date.now(), timezone);
    const inserted = await env.DB.prepare(
      `INSERT INTO person
        (run_id, name, email, timezone, token_hash, token_enc, joined_on,
         took_place_at, nudge_on, notes_on)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, unixepoch(), 1, 1)
       ON CONFLICT (run_id, email) DO NOTHING`,
    ).bind(run.id, name, email, timezone, token.token_hash, token.token_enc, joinedOn).run();
    fresh = (inserted.meta?.changes ?? 0) > 0;
    person = await env.DB.prepare(
      `SELECT * FROM person WHERE run_id = ?1 AND email = ?2`,
    ).bind(run.id, email).first();
  }

  if (!person) return bad(503, 'not open');

  // Asking again is also how somebody who previously left chooses to return.
  if (person.left_at) {
    await env.DB.prepare(`UPDATE person SET left_at = NULL WHERE id = ?1`).bind(person.id).run();
    person.left_at = null;
  }

  const hour = `${localDate(Date.now(), 'UTC')}T${new Date().getUTCHours()}`;
  if (!(await claim(env, person.id, 'join', hour))) return same;

  let token;
  try {
    token = await unseal(env, person.token_enc);
  } catch (err) {
    console.error('could not open a sealed token for', person.id, err?.message);
    return same;
  }

  if (fresh) {
    await sendWelcome(env, person, run, token, null);
  } else {
    await sendYourLinks(env, person, [{ name: run.name, url: logUrl(env, token) }]);
  }

  return same;
}
