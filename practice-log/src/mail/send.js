// Sending.
//
// beingsclub.com is authenticated for sending through Resend (DKIM on the
// visible From domain and SPF/MX on the `send` return path). The root domain has
// no receiving inbox, so every send carries a reply-to that can receive mail.
// Both addresses are configuration, not constants — see README, "Sending domain".

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

async function post(env, {
  to, from, subject, html, text, idempotencyKey, attachments,
}) {
  if (!env.RESEND_API_KEY) {
    console.warn('no RESEND_API_KEY — not sending', subject, 'to', to);
    return false;
  }
  const headers = {
    authorization: `Bearer ${env.RESEND_API_KEY}`,
    'content-type': 'application/json',
  };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: from || env.MAIL_FROM,
      to: [to],
      reply_to: env.MAIL_REPLY_TO,
      subject,
      html,
      text,
      ...(attachments?.length ? { attachments } : {}),
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
const CLUB_TEXT_FOOTER = 'For the benefit of all beings';

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
  const greeting = name ? `Hello, ${escapeHtml(name)}.` : 'Hello.';
  const subject = 'Your Beings Club code';
  const text = `${name ? `Hello, ${name}.` : 'Hello.'}\n\nYour Beings Club code is ${code}. It expires in ten minutes and can be used once.\n\nIf you did not ask for this, you can ignore this email.\n\n${CLUB_TEXT_FOOTER}`;
  const html = clubEmailLayout({
    title: subject,
    preheader: 'Your one-use Beings Club code.',
    heading: 'Your Beings Club <span style="color:#5A4B7C;">code</span>.',
    body: `<p style="margin:0 0 16px;">${greeting}</p>`
      + `<div style="margin:20px 0;padding:22px 26px;background-color:#F2ECFF;font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:bold;letter-spacing:.28em;color:#5A4B7C;">${escapeHtml(code)}</div>`
      + '<p style="margin:0 0 16px;">It expires in ten minutes and can be used once.</p>'
      + '<p style="margin:0;color:#75726A;">If you did not ask for this, you can ignore this email.</p>',
    settingsUrl: 'https://beingsclub.com/members/',
    footerLinkLabel: 'member entrance',
  });
  return post(env, { to: email, from: club(env), subject, text, html });
}

/** Short-lived code for the membership threshold, before anybody is a member. */
export async function sendProspectCode(env, { email, name, code }) {
  const subject = 'Your Beings Club code';
  const hello = name ? `Hello, ${name}.` : 'Hello.';
  const text = `${hello}\n\nYour code is ${code}. It expires in ten minutes and can be used once.\n\nUse it to return to the private place where you can book a first conversation with John, the host of Beings Club.\n\nIf you did not ask for this, you can ignore this email.\n\n${CLUB_TEXT_FOOTER}`;
  const html = clubEmailLayout({
    title: subject,
    preheader: 'Your one-use code for a first conversation.',
    heading: 'Your Beings Club <span style="color:#5A4B7C;">code</span>.',
    body: `<p style="margin:0 0 16px;">${escapeHtml(hello)}</p>`
      + `<div style="margin:20px 0;padding:22px 26px;background-color:#F2ECFF;font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:bold;letter-spacing:.28em;color:#5A4B7C;">${escapeHtml(code)}</div>`
      + '<p style="margin:0 0 16px;">It expires in ten minutes and can be used once.</p>'
      + '<p style="margin:0 0 16px;">Use it to return to the private place where you can book a first conversation with John, the host of Beings Club.</p>'
      + '<p style="margin:0;color:#75726A;">If you did not ask for this, you can ignore this email.</p>',
    settingsUrl: 'https://beingsclub.com/members/?join=1',
    footerLinkLabel: 'conversation entrance',
  });
  return post(env, { to: email, from: club(env), subject, text, html });
}

/** A private request for a more workable first-conversation time. */
export async function sendProspectTimeNote(env, { email, note, idempotencyKey }) {
  const to = String(env.HOST_NOTIFY_EMAIL || env.MAIL_REPLY_TO || '').trim();
  if (!to) return false;
  const url = 'https://beingsclub.com/members/host/#prospects';
  const subject = `Another conversation time · ${email}`;
  const text = `${email} could not find a workable conversation time and wrote:\n\n${note}\n\nOpen the host tools:\n${url}\n\n${CLUB_TEXT_FOOTER}`;
  const html = clubEmailLayout({
    preheader: `${email} is looking for another conversation time.`,
    heading: 'Could another time <span style="color:#5A4B7C">work</span>?',
    body: `<p style="margin:0 0 16px"><strong>${escapeHtml(email)}</strong> wrote:</p>`
      + `<p style="margin:0;white-space:pre-wrap">${escapeHtml(note)}</p>`,
    actionUrl: url,
    actionLabel: 'open host tools',
    settingsUrl: url,
    footerLinkLabel: 'host tools',
  });
  return post(env, { to, from: club(env), subject, text, html, idempotencyKey });
}

/** A personal invitation after John adds somebody through the host tools. */
export async function sendClubInvitation(env, { email, idempotencyKey }) {
  const url = 'https://beingsclub.com/members/';
  const subject = 'You’re invited to Beings Club';
  const text = `Hello,\n\nYou’re invited to Beings Club.\n\nMembership is ongoing and freely offered. Enter using this email address and we’ll send you a six-digit code.\n\nEnter Beings Club:\n${url}\n\n${CLUB_TEXT_FOOTER}`;
  const html = clubEmailLayout({
    preheader: 'An invitation to Beings Club.',
    heading: 'You’re invited to <span style="color:#5A4B7C">Beings Club</span>.',
    body: '<p style="margin:0 0 16px">Hello,</p>'
      + '<p style="margin:0 0 16px">Membership is ongoing and freely offered.</p>'
      + '<p style="margin:0">Enter using this email address and we’ll send you a six-digit code.</p>',
    actionUrl: url,
    actionLabel: 'enter Beings Club',
    settingsUrl: url,
    footerLinkLabel: 'member entrance',
  });
  return post(env, {
    to: email,
    from: club(env),
    subject,
    text,
    html,
    idempotencyKey,
  });
}

/** A welcome after John and a prospective member have reached a mutual yes. */
export async function sendClubWelcome(env, { email, name, actionUrl, idempotencyKey }) {
  const url = actionUrl || 'https://beingsclub.com/members/';
  const subject = 'Welcome to Beings Club';
  const hello = name ? `Hello, ${name}.` : 'Hello.';
  const text = `Welcome to Beings Club.\n\n${hello} You’re in.\n\nMembership is ongoing and freely offered. The link below is your private entrance. It can be used once and expires in seven days.\n\nEnter Beings Club:\n${url}\n\n${CLUB_TEXT_FOOTER}`;
  const html = clubWelcomeLayout({ name, actionUrl: url });
  return post(env, {
    to: email,
    from: club(env),
    subject,
    text,
    html,
    idempotencyKey,
  });
}

/** One host notice after a member finishes the first-entry welcome. */
export async function sendMemberJoinedNotification(env, {
  email, name, completedAt, idempotencyKey,
}) {
  const to = String(env.HOST_NOTIFY_EMAIL || env.MAIL_REPLY_TO || '').trim();
  if (!to) return false;
  const identity = name ? `${name} (${email})` : email;
  const when = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', dateStyle: 'long', timeStyle: 'short',
  }).format(new Date(Number(completedAt) * 1000));
  const url = 'https://beingsclub.com/members/host/';
  const subject = `${name || email} joined Beings Club`;
  const text = `${identity} completed the Beings Club welcome and agreed to the member principles on ${when}.\n\nOpen the host tools:\n${url}\n\n${CLUB_TEXT_FOOTER}`;
  const html = clubEmailLayout({
    preheader: `${identity} completed the Beings Club welcome.`,
    heading: 'A new member has <span style="color:#5A4B7C">joined</span>.',
    body: `<p style="margin:0 0 16px"><strong>${escapeHtml(identity)}</strong> completed the Beings Club welcome and agreed to the member principles.</p>`
      + `<p style="margin:0;color:#75726A">${escapeHtml(when)}</p>`,
    actionUrl: url,
    actionLabel: 'open host tools',
    settingsUrl: url,
    footerLinkLabel: 'host tools',
  });
  return post(env, {
    to, from: club(env), subject, text, html, idempotencyKey,
  });
}

/** One invitation after John marks somebody as having attended a Salon. */
export async function sendFieldNoteInvitation(env, { email, name, salonStartsAt }) {
  const greeting = name ? `Hello, ${escapeHtml(name)}.` : 'Hello, being.';
  const subject = 'Share a Field Note';
  const url = 'https://beingsclub.com/members/#field-notes';
  const settingsUrl = 'https://beingsclub.com/members/#settings';
  const invitation = 'You’re invited to share something of what you discovered at the Salon: a thought, question, image, reference or anything else that stayed with you.';
  const text = `${name ? `Hello, ${name}.` : 'Hello, being.'}\n\n${invitation}\n\nPlease respect the privacy and confidentiality of your conversations. Members who were not at the Salon will also be able to see what you share. Nobody can respond to a Field Note.\n\nShare or dismiss the invitation inside Beings Club:\n${url}\n\nChoose what we send you:\n${settingsUrl}\n\n${CLUB_TEXT_FOOTER}`;
  const html = clubEmailLayout({
    preheader: 'Something from the Salon, if you would like to share it.',
    heading: 'What did you <span style="color:#5A4B7C">find</span>?',
    body: `<p style="margin:0 0 16px">${greeting}</p><p style="margin:0 0 16px">${escapeHtml(invitation)}</p>`
      + '<p style="margin:0">Please respect the privacy and confidentiality of your conversations. Members who were not at the Salon will also be able to see what you share. Nobody can respond to a Field Note.</p>',
    actionUrl: url,
    actionLabel: 'leave a Field Note',
    settingsUrl,
  });
  return post(env, { to: email, from: club(env), subject, text, html });
}

/** The five member-controlled Salon emails: announcement, month, week, day and hour. */
export async function sendClubSalonEmail(env, {
  email, name, salonStartsAt, hostNote, kind, actionUrl,
}) {
  const when = clubSalonTime(salonStartsAt);
  const settingsUrl = 'https://beingsclub.com/members/#settings';
  const salonUrl = actionUrl || 'https://beingsclub.com/members/#salon';
  const greeting = name ? `Hello, ${escapeHtml(name)}.` : 'Hello, being.';
  const versions = {
    announcement: {
      subject: `The next Salon has been announced · ${when}`,
      preheader: `The next Salon has been announced for ${when}.`,
      heading: 'The next <span style="color:#5A4B7C">Salon</span>.',
      opening: `We will gather for the next Salon on ${when}.`,
    },
    month: {
      subject: 'One month until the next Salon',
      preheader: 'One month until the next Salon.',
      heading: 'One month until the next <span style="color:#5A4B7C">Salon</span>.',
      opening: `We gather in one month: ${when}.`,
    },
    week: {
      subject: 'One week until the next Salon',
      preheader: `One week until the next Salon.`,
      heading: 'One week until the next <span style="color:#5A4B7C">Salon</span>.',
      opening: `We gather in one week: ${when}.`,
    },
    day: {
      subject: 'The next Salon is tomorrow',
      preheader: `The next Salon is tomorrow.`,
      heading: 'The Salon is <span style="color:#5A4B7C">tomorrow</span>.',
      opening: `We gather tomorrow: ${when}.`,
    },
    hour: {
      subject: 'The next Salon begins in one hour',
      preheader: 'The next Salon begins in one hour.',
      heading: 'The Salon begins in <span style="color:#5A4B7C">one hour</span>.',
      opening: `We begin in an hour: ${when}.`,
    },
  };
  const version = versions[kind] || versions.announcement;
  const note = String(hostNote || '').trim();
  const description = 'We begin with a guided curiosity practice, then meet one-to-one and in groups of three. There are no prompts or themes, and nothing to prepare or bring. There is nothing to do except stay curious.';
  const privateLinkNote = actionUrl
    ? 'This is a private link that logs you into your account, so please don’t share it.'
    : '';
  const text = `${name ? `Hello, ${name}.` : 'Hello, being.'}\n\n${version.opening}\n\n${note ? `${note}\n\n` : ''}${description}\n\nOpen the Salon to RSVP or add it to your calendar:\n${salonUrl}${privateLinkNote ? `\n\n${privateLinkNote}` : ''}\n\nChoose what we send you:\n${settingsUrl}\n\n${CLUB_TEXT_FOOTER}`;
  const html = clubEmailLayout({
    preheader: version.preheader,
    heading: version.heading,
    body: `<p style="margin:0 0 16px">${greeting}</p><p style="margin:0 0 16px">${escapeHtml(version.opening)}</p>`
      + (note ? `<div style="margin:24px 0;padding:18px 20px;background:#F2ECFF;color:#5A4B7C;font-family:Georgia,serif;font-size:16px;line-height:1.6">${escapeHtml(note)}</div>` : '')
      + `<p style="margin:0">${escapeHtml(description)}</p>`,
    actionUrl: salonUrl,
    actionLabel: 'Salon page',
    afterBody: privateLinkNote
      ? `<tr><td style="padding:12px 48px 0 48px;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#8A867D;mso-line-height-rule:exactly;line-height:18px;">${escapeHtml(privateLinkNote)}</td></tr>`
      : '',
    settingsUrl,
  });
  return post(env, { to: email, from: club(env), subject: version.subject, text, html });
}

/** One transactional confirmation after a member says they are coming. */
export async function sendClubSalonRsvpEmail(env, {
  email, name, salonId, salonStartsAt, durationMinutes, hostNote, zoomUrl,
  actionUrl, idempotencyKey,
}) {
  const when = clubSalonTime(salonStartsAt);
  const settingsUrl = 'https://beingsclub.com/members/#settings';
  const greeting = name ? `Hello, ${escapeHtml(name)}.` : 'Hello, being.';
  const plainGreeting = name ? `Hello, ${name}.` : 'Hello, being.';
  const note = String(hostNote || '').trim();
  const subject = 'You’re in for the next Salon';
  const privateLinkNote = 'This is a private link that logs you into your account, so please don’t share it.';
  const calendarUrl = salonGoogleCalendarUrl({
    salonStartsAt, durationMinutes, zoomUrl,
  });
  const calendarCopy = 'The Zoom link is included in the calendar invitation.';
  const text = `${plainGreeting}\n\nYou’re in. We’ll gather on ${when}.\n\n${note ? `${note}\n\n` : ''}${calendarCopy}\n\nAdd to your calendar:\n${calendarUrl}\n\nOpen the Salon:\n${actionUrl}\n\n${privateLinkNote}\n\nChoose what we send you:\n${settingsUrl}\n\n${CLUB_TEXT_FOOTER}`;
  const html = clubEmailLayout({
    preheader: `You’re in for the next Salon on ${when}.`,
    heading: 'You’re <span style="color:#5A4B7C">in</span>.',
    body: `<p style="margin:0 0 16px">${greeting}</p>`
      + `<p style="margin:0 0 16px">We’ll gather on ${escapeHtml(when)}.</p>`
      + (note ? `<div style="margin:24px 0;padding:18px 20px;background:#F2ECFF;color:#5A4B7C;font-family:Georgia,serif;font-size:16px;line-height:1.6">${escapeHtml(note)}</div>` : '')
      + `<p style="margin:0">${escapeHtml(calendarCopy)}</p>`,
    actionUrl,
    actionLabel: 'Salon page',
    secondaryActionUrl: calendarUrl,
    secondaryActionLabel: 'add to your calendar',
    afterBody: `<tr><td style="padding:12px 48px 0 48px;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#8A867D;mso-line-height-rule:exactly;line-height:18px;">${escapeHtml(privateLinkNote)}</td></tr>`,
    settingsUrl,
  });
  return post(env, {
    to: email,
    from: club(env),
    subject,
    text,
    html,
    idempotencyKey,
    attachments: [salonCalendarAttachment({
      salonId, salonStartsAt, durationMinutes, zoomUrl,
    })],
  });
}

export function clubSalonTime(seconds) {
  const date = new Date(Number(seconds) * 1000);
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long',
  }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: 'numeric', minute: '2-digit', hour12: true,
    timeZoneName: 'short',
  }).format(date).replace(':00', '').replace(/\bam\b/i, 'AM').replace(/\bpm\b/i, 'PM');
  return `${day}, ${time}`;
}

function salonCalendarAttachment({ salonId, salonStartsAt, durationMinutes, zoomUrl }) {
  const start = new Date(Number(salonStartsAt) * 1000);
  const end = new Date(start.getTime() + (Number(durationMinutes || 90) * 60 * 1000));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const date = (value) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Beings Club//Salon//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:salon-${Number(salonId)}@beingsclub.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${date(start)}`,
    `DTEND:${date(end)}`,
    'SUMMARY:Beings Club Salon',
    `DESCRIPTION:${calendarEscape(`Join the Salon on Zoom: ${zoomUrl}`)}`,
    `LOCATION:${calendarEscape(zoomUrl)}`,
    `URL:${calendarEscape(zoomUrl)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
  return {
    filename: 'beings-club-salon.ics',
    content: btoa(calendar),
    content_type: 'text/calendar; charset=utf-8',
  };
}

function salonGoogleCalendarUrl({ salonStartsAt, durationMinutes, zoomUrl }) {
  const start = new Date(Number(salonStartsAt) * 1000);
  const end = new Date(start.getTime() + (Number(durationMinutes || 90) * 60 * 1000));
  const date = (value) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Beings Club Salon',
    dates: `${date(start)}/${date(end)}`,
    details: `Join the Salon on Zoom: ${zoomUrl}`,
    location: zoomUrl,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function calendarEscape(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

function clubEmailLayout({
  title = 'Beings Club', preheader, heading, body, actionUrl, actionLabel, settingsUrl,
  secondaryActionUrl, secondaryActionLabel,
  footerLinkLabel = 'choose what we send you', afterBody = '', footerNote = '',
  logoWidth = 180,
}) {
  const action = actionUrl && actionLabel
    ? `<tr><td style="padding:30px 48px 0 48px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#171916" style="mso-line-height-rule:exactly;"><a href="${actionUrl}" style="display:block;padding:14px 32px;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:#FFFFFF;text-decoration:none;">${escapeHtml(actionLabel)}</a></td></tr></table></td></tr>`
    : '';
  const secondaryAction = secondaryActionUrl && secondaryActionLabel
    ? `<tr><td style="padding:12px 48px 0 48px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border:1px solid #5A4B7C;mso-line-height-rule:exactly;"><a href="${secondaryActionUrl}" style="display:block;padding:13px 31px;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#5A4B7C;text-decoration:none;">${escapeHtml(secondaryActionLabel)}</a></td></tr></table></td></tr>`
    : '';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<meta name="color-scheme" content="light dark"><title>${escapeHtml(title)}</title></head>`
    + '<body style="margin:0;padding:0;background-color:#F7F5EF;">'
    + `<span style="display:none;font-size:1px;color:#F7F5EF;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>`
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F7F5EF;"><tr><td align="center" style="padding:36px 16px;">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#FDFCF9;">'
    + `<tr><td align="left" style="padding:44px 48px 0 48px;"><img src="https://beingsclub.com/assets/beings-logo-outline.png" alt="Beings Club — concentric hand-drawn rings" width="${logoWidth}" style="display:block;width:${logoWidth}px;max-width:100%;height:auto;border:0;"></td></tr>`
    + `<tr><td style="padding:28px 48px 0 48px;font-family:Helvetica,Arial,sans-serif;font-size:34px;font-weight:bold;letter-spacing:-1px;color:#171916;mso-line-height-rule:exactly;line-height:40px;">${heading}</td></tr>`
    + `<tr><td style="padding:20px 48px 0 48px;font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#4A473F;mso-line-height-rule:exactly;line-height:27px;">${body}</td></tr>`
    + action
    + secondaryAction
    + afterBody
    + '<tr><td style="padding:36px 48px 44px 48px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="504" style="width:100%;border-top:1px solid #E7E4DB;">'
    + '<tr><td style="padding:22px 0 0 0;font-family:\'Courier New\',Courier,monospace;font-size:11px;color:#A5A198;mso-line-height-rule:exactly;line-height:19px;">for the benefit of all beings</td></tr>'
    + (footerNote ? `<tr><td style="padding:18px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#A5A198;mso-line-height-rule:exactly;line-height:18px;">${footerNote}</td></tr>` : '')
    + `<tr><td style="padding:${footerNote ? '8' : '18'}px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#A5A198;mso-line-height-rule:exactly;line-height:18px;">Beings Club · London, United Kingdom · <a href="${settingsUrl}" style="color:#A5A198;text-decoration:underline;">${escapeHtml(footerLinkLabel)}</a></td></tr>`
    + '</table></td></tr></table></td></tr></table></body></html>';
}

function clubWelcomeLayout({ name, actionUrl }) {
  const hello = name ? `Hello, ${escapeHtml(name)}. You’re in.` : 'Hello. You’re in.';
  return clubEmailLayout({
    title: 'Welcome to Beings Club',
    preheader: 'The member area is open.',
    heading: 'Welcome to <span style="color:#5A4B7C;">Beings Club</span>.',
    body: `<p style="margin:0 0 16px;">${hello}</p>`
      + '<p style="margin:0;">Membership is ongoing and freely offered. The link below is your private entrance. It can be used once and expires in seven days.</p>',
    actionUrl,
    actionLabel: 'enter Beings Club',
    settingsUrl: actionUrl,
    footerLinkLabel: 'member entrance',
    footerNote: 'This welcome was meant for you — if it found the wrong hands, you can simply let it rest.',
    logoWidth: 220,
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
