// Sending.
//
// beingsclub.com publishes a deny-all SPF record and has no MX, so it cannot
// receive replies. Every send therefore carries a reply-to that can. Both
// addresses are configuration, not constants — see README, "Sending domain".

import * as T from './templates.js';
import { logUrl } from '../auth.js';

const ENDPOINT = 'https://api.resend.com/emails';

/**
 * Claim the right to send. Returns false if this exact email has already gone
 * to this person for this scope, so a retried cron tick cannot send twice.
 *
 * The claim is written before the send, not after: a duplicate is worse than a
 * miss here. Nobody is harmed by not receiving one nudge; being emailed twice
 * in a minute by something that promises one email a day is a broken promise.
 */
export async function claim(env, personId, kind, scope) {
  try {
    const r = await env.DB.prepare(
      `INSERT INTO send_log (person_id, kind, scope) VALUES (?1, ?2, ?3)
       ON CONFLICT (person_id, kind, scope) DO NOTHING`,
    ).bind(personId, kind, scope).run();
    return (r.meta?.changes ?? 0) > 0;
  } catch (err) {
    console.error('claim failed', kind, scope, err?.message);
    return false;
  }
}

async function post(env, { to, from, subject, html, text }) {
  if (!env.RESEND_API_KEY) {
    console.warn('no RESEND_API_KEY — not sending', subject, 'to', to);
    return false;
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: from || env.MAIL_FROM,
      to: [to],
      reply_to: env.MAIL_REPLY_TO,
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    console.error('resend', res.status, (await res.text()).slice(0, 400));
    return false;
  }
  return true;
}

const club = (env) => env.MAIL_FROM;
const john = (env) => env.MAIL_FROM_HOST || env.MAIL_FROM;

// ---------------------------------------------------------------------------

export async function sendWelcome(env, person, run, token, mapUrl) {
  const mail = T.welcome({ person, run, url: logUrl(env, token), mapUrl });
  return post(env, { to: person.email, from: club(env), ...mail });
}

export async function sendDayOne(env, person, run, url, principle) {
  const mail = T.dayOne({ person, run, url, principle });
  return post(env, { to: person.email, from: club(env), ...mail });
}

export async function sendDaily(env, person, run, url, dayNumber, principle) {
  const mail = T.daily({ person, run, url, dayNumber, principle });
  return post(env, { to: person.email, from: club(env), ...mail });
}

/** The invitation. From John, because a yes comes from a person. */
export async function sendInvitation(env, person, run, url) {
  const mail = T.invitation({ person, run, url });
  return post(env, { to: person.email, from: john(env), ...mail });
}

// From John's name, not the club's.
export async function sendWeekLetter(env, person, run, url, opts) {
  const mail = T.weekLetter({ person, run, url, ...opts });
  return post(env, { to: person.email, from: john(env), ...mail });
}

export async function sendAnswered(env, person, url, opts) {
  const mail = T.answered({ person, url, ...opts });
  return post(env, { to: person.email, from: john(env), ...mail });
}

export async function sendReplyDigest(env, person, url, contexts) {
  const mail = T.replyDigest({ person, url, contexts });
  return post(env, { to: person.email, from: john(env), ...mail });
}

export async function sendStillHere(env, person, url, stopUrl) {
  const mail = T.stillHere({ person, url, stopUrl });
  return post(env, { to: person.email, from: john(env), ...mail });
}

export async function sendLastDay(env, person, run, url, marked) {
  const mail = T.lastDay({ person, run, url, marked });
  return post(env, { to: person.email, from: john(env), ...mail });
}

/** Someone asked for their link back. Goes only to the address they typed. */
export async function sendYourLinks(env, person, runs) {
  const mail = T.yourLinks({ person, runs });
  return post(env, { to: person.email, from: club(env), ...mail });
}

/** After revoking from Settings. The new link is emailed, never returned. */
export async function sendWelcomeBack(env, person, url) {
  const mail = T.newLink({ person, url });
  return post(env, { to: person.email, from: club(env), ...mail });
}

/** Short-lived Beings Club login code. Never log or persist the plain code. */
export async function sendClubCode(env, { email, name, code }) {
  const greeting = name ? `Hello ${escapeHtml(name)},` : 'Hello, being,';
  const subject = 'Your Beings Club code';
  const text = `${name ? `Hello ${name},` : 'Hello, being,'}\n\nYour Beings Club code is ${code}. It expires in ten minutes and can be used once.\n\nIf you did not ask for this, you can ignore this email.\n\nStay curious,\nBeings Club`;
  const html = `<div style="font-family:Arial,sans-serif;color:#171916;line-height:1.6;max-width:520px">`
    + `<p>${greeting}</p><p>Your Beings Club code is</p>`
    + `<p style="font-size:28px;font-weight:700;letter-spacing:.28em;color:#5A4B7C">${code}</p>`
    + `<p>It expires in ten minutes and can be used once.</p>`
    + `<p style="color:#75726A">If you did not ask for this, you can ignore this email.</p>`
    + `<p>Stay curious,<br>Beings Club</p></div>`;
  return post(env, { to: email, from: club(env), subject, text, html });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
