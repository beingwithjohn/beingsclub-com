// Asking for the link back.
//
// The magic link is the session and it never expires, so this grants nothing
// new — it posts the same link again, to the address it already belongs to.
// That makes it safe in a way a password reset is not: there is no new
// credential, and nothing an attacker gains by triggering it.
//
// Three things still matter, because this is the one endpoint anybody can call.

import { json, bad } from './api.js';
import { unseal, logUrl } from './auth.js';
import { sendYourLinks, claim } from './mail/send.js';
import { localDate } from './days.js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function postLogin(env, body) {
  const email = String(body?.email ?? '').trim().toLowerCase();

  // 1 · The answer is the same whether or not this address is anybody's.
  //     Otherwise the endpoint becomes a way to ask "is this person in the
  //     Sit?", which is a question about ten named people that nobody outside
  //     is owed an answer to.
  const same = json({ ok: true });

  if (!EMAIL.test(email) || email.length > 200) return same;

  const rows = await env.DB.prepare(
    `SELECT p.id, p.name, p.email, p.token_enc, r.name AS run_name, r.slug
       FROM person p JOIN run r ON r.id = p.run_id
      WHERE p.email = ?1 AND p.took_place_at IS NOT NULL AND p.left_at IS NULL
      ORDER BY r.id`,
  ).bind(email).all();

  const people = rows.results || [];
  if (!people.length) return same;

  // 2 · At most one of these an hour, per person. Without it, anybody could
  //     use this to post a hundred emails to somebody else's inbox.
  const hour = `${localDate(Date.now(), 'UTC')}T${new Date().getUTCHours()}`;
  if (!(await claim(env, people[0].id, 'login', hour))) return same;

  // 3 · One email however many runs they are in, so asking once does not
  //     produce three messages.
  const runs = [];
  for (const p of people) {
    try {
      runs.push({ name: p.run_name, url: logUrl(env, await unseal(env, p.token_enc)) });
    } catch (err) {
      console.error('could not open a sealed token for', p.id, err?.message);
    }
  }
  if (!runs.length) return same;

  await sendYourLinks(env, { name: people[0].name, email }, runs);
  return same;
}
