import { json, bad } from '../api.js';
import {
  sendClubInvitation, sendProspectCode, sendProspectTimeNote,
} from '../mail/send.js';
import {
  bearerToken, keyedHash, normalizeEmail, randomCode, randomToken,
  sameText, tokenHash, validChallenge, validCode,
} from './security.js';
import { agreementAccepted, MEMBER_AGREEMENT_VERSION } from './agreement.js';

const CODE_LIFETIME = 10 * 60;
const SESSION_LIFETIME = 30 * 24 * 60 * 60;
const NOTE_MAX = 2400;
const NAME_MAX = 120;
const CAL_EVENT_SLUG = 'beings-club-chat';
const CAL_USERNAME = 'beingwithjohn';
const CAL_SLOTS_API_VERSION = '2024-09-04';
const CAL_BOOKINGS_API_VERSION = '2026-02-25';
const CAL_DURATION_MINUTES = 25;

export async function requestProspectCode(request, env, ctx, body) {
  const responseChallenge = randomToken(24);
  const email = normalizeEmail(body?.email);
  const name = cleanText(body?.name, NAME_MAX);
  if (!email || !name) return json({ ok: true, challenge: responseChallenge });

  const timestamp = now();
  const emailHash = await keyedHash(env, 'prospect-email-rate', email);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const ipHash = await keyedHash(env, 'prospect-ip-rate', ip);
  if (!await mayRequest(env, emailHash, ipHash, timestamp)) {
    return json({ ok: true, challenge: responseChallenge });
  }

  await env.MEMBERS.prepare(
    `INSERT INTO prospect (email, display_name, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?3)
     ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name,
       updated_at = excluded.updated_at`,
  ).bind(email, name, timestamp).run();
  const prospect = await env.MEMBERS.prepare(
    'SELECT id, email, display_name FROM prospect WHERE email = ?1',
  ).bind(email).first();

  const code = randomCode();
  const codeHash = await keyedHash(env, 'prospect-code', `${responseChallenge}:${code}`);
  await env.MEMBERS.batch([
    env.MEMBERS.prepare(
      'INSERT INTO prospect_auth_request (email_hash, ip_hash, created_at) VALUES (?1, ?2, ?3)',
    ).bind(emailHash, ipHash, timestamp),
    env.MEMBERS.prepare(
      `INSERT INTO prospect_auth_challenge
        (id, prospect_id, code_hash, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(responseChallenge, prospect.id, codeHash, timestamp, timestamp + CODE_LIFETIME),
  ]);

  ctx.waitUntil(sendProspectCode(env, {
    email: prospect.email, name: prospect.display_name, code,
  }));
  ctx.waitUntil(env.MEMBERS.batch([
    env.MEMBERS.prepare('DELETE FROM prospect_auth_challenge WHERE expires_at < ?1').bind(timestamp - 86400),
    env.MEMBERS.prepare('DELETE FROM prospect_auth_request WHERE created_at < ?1').bind(timestamp - 86400),
    env.MEMBERS.prepare('DELETE FROM prospect_session WHERE expires_at < ?1').bind(timestamp - 86400),
  ]));
  return json({ ok: true, challenge: responseChallenge });
}

async function mayRequest(env, emailHash, ipHash, timestamp) {
  const since = timestamp - 3600;
  const [emailCount, ipCount, latest] = await env.MEMBERS.batch([
    env.MEMBERS.prepare(
      'SELECT COUNT(*) AS n FROM prospect_auth_request WHERE email_hash = ?1 AND created_at >= ?2',
    ).bind(emailHash, since),
    env.MEMBERS.prepare(
      'SELECT COUNT(*) AS n FROM prospect_auth_request WHERE ip_hash = ?1 AND created_at >= ?2',
    ).bind(ipHash, since),
    env.MEMBERS.prepare(
      'SELECT MAX(created_at) AS at FROM prospect_auth_request WHERE email_hash = ?1',
    ).bind(emailHash),
  ]);
  return Number(emailCount.results?.[0]?.n || 0) < 5
    && Number(ipCount.results?.[0]?.n || 0) < 20
    && timestamp - Number(latest.results?.[0]?.at || 0) >= 60;
}

export async function verifyProspectCode(env, body) {
  const challenge = validChallenge(body?.challenge);
  const code = validCode(body?.code);
  if (!challenge || !code) return bad(401, 'invalid code');
  const row = await env.MEMBERS.prepare(
    `SELECT c.*, p.email, p.granted_at, p.member_id
       FROM prospect_auth_challenge c
       JOIN prospect p ON p.id = c.prospect_id
      WHERE c.id = ?1`,
  ).bind(challenge).first();
  const timestamp = now();
  const suppliedHash = await keyedHash(env, 'prospect-code', `${challenge}:${code}`);
  const valid = row && row.prospect_id && row.consumed_at == null && row.attempts < 5
    && row.expires_at >= timestamp && sameText(row.code_hash, suppliedHash);
  if (!valid) {
    if (row && row.consumed_at == null && row.attempts < 5) {
      await env.MEMBERS.prepare(
        'UPDATE prospect_auth_challenge SET attempts = attempts + 1 WHERE id = ?1',
      ).bind(challenge).run();
    }
    return bad(401, 'invalid code');
  }
  const consumed = await env.MEMBERS.prepare(
    `UPDATE prospect_auth_challenge SET consumed_at = ?1
      WHERE id = ?2 AND consumed_at IS NULL AND attempts < 5`,
  ).bind(timestamp, challenge).run();
  if ((consumed.meta?.changes ?? 0) !== 1) return bad(401, 'invalid code');
  const token = randomToken();
  await env.MEMBERS.prepare(
    `INSERT INTO prospect_session
      (prospect_id, token_hash, created_at, last_seen_at, expires_at)
     VALUES (?1, ?2, ?3, ?3, ?4)`,
  ).bind(row.prospect_id, await tokenHash(token), timestamp, timestamp + SESSION_LIFETIME).run();
  return json({ token, prospect: await getProspectShape(env, row.prospect_id) });
}

export async function identifyProspect(request, env) {
  const token = bearerToken(request);
  if (!token) return null;
  const timestamp = now();
  const row = await env.MEMBERS.prepare(
    `SELECT p.*, s.id AS session_id, s.last_seen_at AS session_last_seen_at
       FROM prospect_session s JOIN prospect p ON p.id = s.prospect_id
      WHERE s.token_hash = ?1 AND s.revoked_at IS NULL AND s.expires_at > ?2`,
  ).bind(await tokenHash(token), timestamp).first();
  if (!row) return null;
  if (timestamp - Number(row.session_last_seen_at || 0) > 3600) {
    await env.MEMBERS.prepare(
      'UPDATE prospect_session SET last_seen_at = ?1 WHERE id = ?2',
    ).bind(timestamp, row.session_id).run();
  }
  return row;
}

export async function getProspectState(env, who) {
  return json({ prospect: shapeProspect(who) });
}

export async function getProspectSlots(env, who, url) {
  const start = calendarDate(url.searchParams.get('start'));
  const end = calendarDate(url.searchParams.get('end'));
  const timeZone = cleanTimezone(url.searchParams.get('timeZone'));
  if (!start || !end || !timeZone || !sensibleRange(start, end)) {
    return bad(400, 'calendar range');
  }
  const result = await fetchCalSlots(env, {
    start, end, timeZone,
    bookingUid: activeBooking(who) ? who.booking_uid : null,
  });
  if (!result.ok) return bad(502, 'calendar unavailable');
  return json({ slots: result.slots, start, end, timeZone });
}

export async function createProspectBooking(env, who, body) {
  const startTime = instantText(body?.start);
  const timeZone = cleanTimezone(body?.timeZone);
  const rescheduling = body?.reschedule === true && activeBooking(who);
  const name = cleanText(body?.name, NAME_MAX) || cleanText(who.display_name, NAME_MAX);
  const note = cleanText(body?.note, NOTE_MAX);
  if (!startTime || !timeZone || (!rescheduling && !name)) return bad(400, 'booking');

  // Never trust a start supplied by the browser. Refresh Cal's availability
  // around that instant and require the exact slot before creating anything.
  const centre = new Date(startTime);
  const rangeStart = isoDate(new Date(centre.getTime() - 86400000));
  const rangeEnd = isoDate(new Date(centre.getTime() + 2 * 86400000));
  const available = await fetchCalSlots(env, {
    start: rangeStart, end: rangeEnd, timeZone,
    bookingUid: rescheduling ? who.booking_uid : null,
  });
  if (!available.ok) return bad(502, 'calendar unavailable');
  if (!available.slots.some((slot) => Date.parse(slot) === startTime.getTime())) {
    return bad(409, 'time unavailable');
  }

  const endpoint = rescheduling
    ? `/v2/bookings/${encodeURIComponent(who.booking_uid)}/reschedule`
    : '/v2/bookings';
  const payload = rescheduling ? {
    start: startTime.toISOString(),
    rescheduledBy: who.email,
    reschedulingReason: 'A new time chosen in Beings Club',
  } : {
    start: startTime.toISOString(),
    attendee: {
      name, email: who.email, timeZone, language: 'en',
    },
    eventTypeSlug: CAL_EVENT_SLUG,
    username: CAL_USERNAME,
    ...(note ? { bookingFieldsResponses: { notes: note } } : {}),
    metadata: { prospectId: String(who.id), source: 'beingsclub' },
  };
  const created = await calRequest(env, endpoint, { method: 'POST', body: payload });
  if (!created.ok) {
    return bad(created.status === 400 || created.status === 409 ? 409 : 502,
      created.status === 400 || created.status === 409 ? 'time unavailable' : 'calendar unavailable');
  }
  const booking = created.data;
  const uid = cleanText(booking?.uid, 200);
  const bookedStart = instant(booking?.start || startTime.toISOString());
  const bookedEnd = instant(booking?.end)
    || bookedStart + CAL_DURATION_MINUTES * 60;
  if (!uid || !bookedStart || !bookedEnd) return bad(502, 'calendar unavailable');
  const timestamp = now();
  await env.MEMBERS.prepare(
    `UPDATE prospect SET booking_uid = ?1, booking_reschedule_uid = ?1,
       booking_title = ?2, booking_start_at = ?3, booking_end_at = ?4,
       booking_timezone = ?5, booking_status = ?6,
       booking_updated_at = ?7, updated_at = ?7,
       display_name = COALESCE(?8, display_name)
     WHERE id = ?9`,
  ).bind(uid, cleanText(booking?.title, 200) || 'A first conversation',
    bookedStart, bookedEnd, timeZone,
    booking?.status === 'accepted' ? 'booked' : 'awaiting_webhook', timestamp, name, who.id).run();
  return json({ prospect: await getProspectShape(env, who.id) });
}

async function fetchCalSlots(env, { start, end, timeZone, bookingUid = null }) {
  const params = new URLSearchParams({
    eventTypeSlug: CAL_EVENT_SLUG,
    username: CAL_USERNAME,
    start, end, timeZone,
  });
  if (bookingUid) params.set('bookingUidToReschedule', bookingUid);
  const response = await calRequest(env, `/v2/slots?${params}`, {
    apiVersion: CAL_SLOTS_API_VERSION,
  });
  if (!response.ok) return response;
  const slots = [];
  for (const day of Object.values(response.data || {})) {
    if (!Array.isArray(day)) continue;
    for (const slot of day) {
      const value = instantText(typeof slot === 'string' ? slot : slot?.start);
      if (value) slots.push(value.toISOString());
    }
  }
  return { ok: true, slots: [...new Set(slots)].sort() };
}

async function calRequest(env, path, options = {}) {
  if (!env.CAL_API_KEY) return { ok: false, status: 503 };
  const headers = {
    authorization: `Bearer ${env.CAL_API_KEY}`,
    'cal-api-version': options.apiVersion || CAL_BOOKINGS_API_VERSION,
    ...(options.body ? { 'content-type': 'application/json' } : {}),
  };
  let response;
  try {
    response = await fetch(`https://api.cal.com${path}`, {
      method: options.method || 'GET', headers,
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (error) {
    console.error('cal api unavailable', error?.message);
    return { ok: false, status: 0 };
  }
  let payload = {};
  try { payload = await response.json(); } catch (_) {}
  if (!response.ok || payload?.status === 'error') {
    console.error('cal api', response.status, JSON.stringify(payload).slice(0, 500));
    return { ok: false, status: response.status };
  }
  return { ok: true, status: response.status, data: payload?.data };
}

export async function saveProspectTimeNote(env, who, body) {
  const note = String(body?.note ?? '').trim();
  if (!note || note.length > NOTE_MAX) return bad(400, 'note');
  const timestamp = now();
  await env.MEMBERS.prepare(
    `UPDATE prospect SET alternate_time_note = ?1, alternate_time_note_at = ?2,
       updated_at = ?2 WHERE id = ?3`,
  ).bind(note, timestamp, who.id).run();
  const sent = await sendProspectTimeNote(env, {
    email: who.email, note, idempotencyKey: `prospect-time-${who.id}-${timestamp}`,
  });
  return json({ ok: true, sent, prospect: await getProspectShape(env, who.id) });
}

export async function enterGrantedProspect(env, who) {
  if (!who.granted_at || !who.member_id) return bad(403, 'membership pending');
  const member = await env.MEMBERS.prepare(
    `SELECT * FROM member WHERE id = ?1 AND disabled_at IS NULL AND left_at IS NULL`,
  ).bind(who.member_id).first();
  if (!member) return bad(403, 'membership pending');
  const timestamp = now();
  const token = randomToken();
  await env.MEMBERS.batch([
    env.MEMBERS.prepare(
      `INSERT INTO member_session
        (member_id, token_hash, created_at, last_seen_at, expires_at)
       VALUES (?1, ?2, ?3, ?3, ?4)`,
    ).bind(member.id, await tokenHash(token), timestamp, timestamp + SESSION_LIFETIME),
    env.MEMBERS.prepare(
      'UPDATE member SET joined_at = COALESCE(joined_at, ?1), updated_at = ?1 WHERE id = ?2',
    ).bind(timestamp, member.id),
  ]);
  return json({ token, member: {
    id: member.id, email: member.email, name: member.display_name,
    website: member.website, line: member.profile_line, hasImage: !!member.profile_image,
    isHost: !!member.is_host, agreementAccepted: agreementAccepted(member),
    agreementVersion: MEMBER_AGREEMENT_VERSION,
    onboardingCompleted: Number(member.onboarding_completed_at) > 0,
  } });
}

export async function listProspects(env) {
  const rows = await env.MEMBERS.prepare(
    `SELECT id, email, display_name, booking_uid, booking_title, booking_start_at,
            booking_end_at, booking_timezone, booking_status,
            alternate_time_note, alternate_time_note_at, granted_at, member_id,
            created_at, updated_at
       FROM prospect ORDER BY granted_at IS NOT NULL, updated_at DESC`,
  ).all();
  return json({ prospects: (rows.results || []).map(shapeHostProspect) });
}

export async function grantProspect(env, host, id) {
  if (!Number.isSafeInteger(id) || id <= 0) return bad(404, 'not found');
  const prospect = await env.MEMBERS.prepare(
    'SELECT * FROM prospect WHERE id = ?1',
  ).bind(id).first();
  if (!prospect) return bad(404, 'not found');
  if (prospect.granted_at && prospect.member_id) {
    return json({ prospect: shapeHostProspect(prospect) });
  }
  const timestamp = now();
  await env.MEMBERS.prepare(
    `INSERT INTO member (email, display_name, is_host, invited_at, created_at, updated_at)
     VALUES (?1, ?2, 0, ?3, ?3, ?3)
     ON CONFLICT(email) DO UPDATE SET disabled_at = NULL, left_at = NULL,
       display_name = COALESCE(member.display_name, excluded.display_name),
       invited_at = COALESCE(invited_at, excluded.invited_at),
       updated_at = excluded.updated_at`,
  ).bind(prospect.email, prospect.display_name, timestamp).run();
  const member = await env.MEMBERS.prepare(
    'SELECT id, email, invitation_sent_at FROM member WHERE email = ?1',
  ).bind(prospect.email).first();
  await env.MEMBERS.prepare(
    `UPDATE prospect SET granted_at = ?1, granted_by = ?2, member_id = ?3,
       updated_at = ?1 WHERE id = ?4 AND granted_at IS NULL`,
  ).bind(timestamp, host.id, member.id, id).run();
  const sent = member.invitation_sent_at ? true : await sendClubInvitation(env, {
    email: member.email, idempotencyKey: `club-prospect-${id}-${timestamp}`,
  });
  await env.MEMBERS.prepare(
    `UPDATE member SET invitation_sent_at = COALESCE(invitation_sent_at, ?1),
       invitation_last_attempt_at = ?2, invitation_last_error = ?3,
       updated_at = ?2 WHERE id = ?4`,
  ).bind(sent ? timestamp : null, timestamp, sent ? null : 'delivery failed', member.id).run();
  const fresh = await env.MEMBERS.prepare('SELECT * FROM prospect WHERE id = ?1').bind(id).first();
  return json({ prospect: shapeHostProspect(fresh), invitationSent: sent });
}

export async function calWebhook(env, request) {
  if (!env.CAL_WEBHOOK_SECRET) return bad(503, 'cal webhook unavailable');
  const raw = await request.text();
  const signature = request.headers.get('x-cal-signature-256') || '';
  if (!await validWebhookSignature(env.CAL_WEBHOOK_SECRET, raw, signature)) {
    return bad(401, 'signature');
  }
  let event;
  try { event = JSON.parse(raw); } catch (_) { return bad(400, 'json'); }
  const payload = event?.payload || {};
  if (payload.type !== CAL_EVENT_SLUG) return json({ ok: true, ignored: true });
  if (!['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED'].includes(event.triggerEvent)) {
    return json({ ok: true, ignored: true });
  }
  const attendee = (Array.isArray(payload.attendees) ? payload.attendees : [])
    .find((person) => normalizeEmail(person?.email));
  const email = normalizeEmail(attendee?.email);
  const uid = cleanText(payload.uid || payload.bookingUid, 200);
  if (!email || !uid) return bad(400, 'booking');
  const prospect = await env.MEMBERS.prepare(
    'SELECT id FROM prospect WHERE email = ?1',
  ).bind(email).first();
  if (!prospect) return json({ ok: true, ignored: true });
  const timestamp = now();
  const cancelled = event.triggerEvent === 'BOOKING_CANCELLED';
  const joinUrl = safeHttps(payload?.metadata?.videoCallUrl || payload?.videoCallUrl);
  await env.MEMBERS.prepare(
    `UPDATE prospect SET booking_uid = ?1, booking_reschedule_uid = ?2,
       booking_title = ?3, booking_start_at = ?4, booking_end_at = ?5,
       booking_timezone = ?6, booking_status = ?7, booking_join_url = ?8,
       booking_updated_at = ?9, updated_at = ?9 WHERE id = ?10`,
  ).bind(uid, cleanText(payload.rescheduleUid, 200) || uid,
    cleanText(payload.title, 200) || 'A first conversation', instant(payload.startTime),
    instant(payload.endTime), cleanTimezone(attendee.timeZone),
    cancelled ? 'cancelled' : 'booked', joinUrl, timestamp, prospect.id).run();
  return json({ ok: true });
}

export async function validWebhookSignature(secret, raw, signature) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(raw)));
  const expected = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return sameText(expected.toLowerCase(), signature.toLowerCase());
}

async function getProspectShape(env, id) {
  const row = await env.MEMBERS.prepare('SELECT * FROM prospect WHERE id = ?1').bind(id).first();
  return shapeProspect(row);
}

function shapeProspect(row) {
  return {
    id: row.id, email: row.email, name: row.display_name || null,
    booking: row.booking_uid ? {
      uid: row.booking_uid, rescheduleUid: row.booking_reschedule_uid || row.booking_uid,
      title: row.booking_title, startTime: iso(row.booking_start_at),
      endTime: iso(row.booking_end_at), timeZone: row.booking_timezone,
      status: row.booking_status, joinUrl: row.booking_join_url || null,
      verified: row.booking_status === 'booked' || row.booking_status === 'cancelled',
    } : null,
    alternateTimeNote: row.alternate_time_note || null,
    alternateTimeNoteAt: iso(row.alternate_time_note_at),
    granted: !!row.granted_at,
  };
}

function shapeHostProspect(row) {
  const shaped = shapeProspect(row);
  return {
    ...shaped, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    grantedAt: iso(row.granted_at), memberId: row.member_id || null,
  };
}

function cleanText(value, max) {
  const text = String(value ?? '').trim();
  return text && text.length <= max ? text : null;
}

function cleanTimezone(value) {
  const zone = cleanText(value, 100);
  if (!zone) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return zone; } catch (_) { return null; }
}

function calendarDate(value) {
  const date = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date : null;
}

function sensibleRange(start, end) {
  const from = Date.parse(`${start}T00:00:00.000Z`);
  const to = Date.parse(`${end}T00:00:00.000Z`);
  const days = (to - from) / 86400000;
  return days > 0 && days <= 45;
}

function activeBooking(row) {
  return !!row?.booking_uid && row.booking_status !== 'cancelled';
}

function instantText(value) {
  const milliseconds = Date.parse(String(value ?? ''));
  return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

function safeHttps(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch (_) { return null; }
}

function instant(value) {
  const milliseconds = Date.parse(String(value ?? ''));
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : null;
}

function iso(value) {
  return Number(value) > 0 ? new Date(Number(value) * 1000).toISOString() : null;
}

function now() { return Math.floor(Date.now() / 1000); }
