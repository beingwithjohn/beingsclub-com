// The optional Sunday collection of replies John made public.
//
// It uses the person's existing email time. If a digest goes out, it stands in
// for that Sunday's ordinary practice nudge so the log still sends at most one
// scheduled email at a time. Replies prompted by this person's own words are
// excluded: they already received the immediate, personal notification.

import { nudgeDue, weekday } from './days.js';
import { unseal, logUrl } from './auth.js';
import { claim, sendReplyDigest } from './mail/send.js';

const WEEK_SECONDS = 7 * 24 * 60 * 60;

export function replyDigestDue(person, at) {
  if (!person.reply_digest_on) return null;
  const date = nudgeDue({ ...person, nudge_on: true }, at);
  return date && weekday(date) === 0 ? date : null;
}

/**
 * `handled` means the Sunday digest takes the place of the ordinary nudge,
 * including on a retried cron tick where the send was already claimed.
 */
export async function replyDigestOne(env, person, at) {
  const date = replyDigestDue(person, at);
  if (!date) return { handled: false, sent: false, count: 0 };

  const now = Math.floor(at / 1000);
  const rows = await env.DB.prepare(
    `SELECT public_context
       FROM host_reply
      WHERE visibility = 'shared'
        AND shared_at > ?1 AND shared_at <= ?2
        AND recipient_person_id <> ?3
      ORDER BY shared_at, id`,
  ).bind(now - WEEK_SECONDS, now, person.id).all();
  const contexts = (rows.results || []).map((row) => row.public_context).filter(Boolean);
  if (!contexts.length) return { handled: false, sent: false, count: 0 };

  if (!(await claim(env, person.id, 'reply_digest', date))) {
    return { handled: true, sent: false, count: contexts.length };
  }

  const url = logUrl(env, await unseal(env, person.token_enc));
  const sent = await sendReplyDigest(env, person, url, contexts);
  return { handled: true, sent, count: contexts.length };
}
