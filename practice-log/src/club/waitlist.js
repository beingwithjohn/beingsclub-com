import { json, bad } from '../api.js';
import { sendWaitlistConfirmation, sendWaitlistOffer } from '../mail/send.js';
import {
  keyedHash, randomToken, sameText, tokenHash, validChallenge,
} from './security.js';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2026-03-11';
const RETRY_AFTER = 30 * 60;
const SESSION_LIFETIME = 30 * 24 * 60 * 60;

export async function getPublicAdmissions(env, url) {
  const state = await admissionsState(env);
  const invitation = await resolveReferral(env, url.searchParams.get('invite'));
  return json({ paused: state.paused, invitation });
}

export async function isAdmissionsPaused(env) {
  return (await admissionsState(env)).paused;
}

export async function joinWaitlist(env, {
  email, name, invitation, ctx, timestamp = now(),
}) {
  const existing = await env.MEMBERS.prepare(
    `SELECT id, booking_uid, granted_at, waitlist_joined_at, waitlist_removed_at
       FROM prospect WHERE email = ?1`,
  ).bind(email).first();
  if (existing?.booking_uid || existing?.granted_at) {
    return json({ ok: true, alreadyProgressed: true });
  }
  if (existing) {
    await env.MEMBERS.prepare(
      `UPDATE prospect SET display_name = ?1, invited_by_member_id = COALESCE(?2, invited_by_member_id),
         waitlist_joined_at = COALESCE(waitlist_joined_at, ?3), waitlist_status = 'waiting',
         waitlist_removed_at = NULL, archived_at = NULL, updated_at = ?3 WHERE id = ?4`,
    ).bind(name, invitation?.memberId || null, timestamp, existing.id).run();
  } else {
    await env.MEMBERS.prepare(
      `INSERT INTO prospect
        (email, display_name, invited_by_member_id, waitlist_joined_at,
         waitlist_status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'waiting', ?4, ?4)`,
    ).bind(email, name, invitation?.memberId || null, timestamp).run();
  }
  const prospect = await env.MEMBERS.prepare(
    'SELECT id, email, display_name, waitlist_joined_at FROM prospect WHERE email = ?1',
  ).bind(email).first();
  await queueWaitlistNotionSync(env, prospect.id, ctx, timestamp);
  if (!existing?.waitlist_joined_at) {
    const delivery = sendWaitlistConfirmation(env, {
      email: prospect.email, name: prospect.display_name,
      idempotencyKey: `club-waitlist-confirmation-${prospect.id}`,
    });
    if (ctx?.waitUntil) ctx.waitUntil(delivery); else await delivery;
  }
  return json({ ok: true, waitlisted: true });
}

export async function getMemberInvitationLink(env, member) {
  if (!member.onboarding_completed_at) return bad(403, 'onboarding required');
  const signature = await keyedHash(env, 'member-referral', String(member.id));
  return json({
    url: `https://beingsclub.com/members/?join=1&invite=${member.id}.${signature}`,
  });
}

export async function resolveReferral(env, value) {
  const match = /^(\d{1,12})\.([a-f0-9]{64})$/i.exec(String(value || ''));
  if (!match) return null;
  const id = Number(match[1]);
  const expected = await keyedHash(env, 'member-referral', String(id));
  if (!sameText(expected, match[2].toLowerCase())) return null;
  const member = await env.MEMBERS.prepare(
    `SELECT id, display_name FROM member
      WHERE id = ?1 AND disabled_at IS NULL AND left_at IS NULL
        AND agreement_accepted_at IS NOT NULL AND onboarding_completed_at IS NOT NULL`,
  ).bind(id).first();
  return member ? { memberId: member.id, name: member.display_name || 'A member' } : null;
}

export async function getHostAdmissions(env) {
  const state = await admissionsState(env);
  const rows = await env.MEMBERS.prepare(
    `SELECT p.id, p.email, p.display_name, p.waitlist_joined_at,
            p.waitlist_status, p.waitlist_offered_at, p.waitlist_host_note,
            inviter.display_name AS inviter_name
       FROM prospect p
       LEFT JOIN member inviter ON inviter.id = p.invited_by_member_id
      WHERE p.waitlist_joined_at IS NOT NULL
        AND p.waitlist_removed_at IS NULL
        AND p.granted_at IS NULL
        AND p.booking_uid IS NULL
        AND p.waitlist_status IN ('waiting', 'invited to book')
      ORDER BY p.waitlist_joined_at ASC`,
  ).all();
  return json({
    admissions: state,
    waitlist: (rows.results || []).map((row) => ({
      id: row.id, name: row.display_name || null, email: row.email,
      joinedAt: iso(row.waitlist_joined_at), status: row.waitlist_status,
      offeredAt: iso(row.waitlist_offered_at), invitedBy: row.inviter_name || null,
      hostNote: row.waitlist_host_note || null,
    })),
  });
}

export async function setAdmissionsPaused(env, host, body) {
  if (typeof body?.paused !== 'boolean') return bad(400, 'paused');
  const timestamp = now();
  await env.MEMBERS.prepare(
    `UPDATE club_admissions_state
        SET paused_at = ?1, paused_by = ?2, reopened_at = ?3, updated_at = ?4
      WHERE id = 1`,
  ).bind(body.paused ? timestamp : null, body.paused ? host.id : null,
    body.paused ? null : timestamp, timestamp).run();
  return getHostAdmissions(env);
}

export async function offerWaitlistConversation(env, prospectId, ctx) {
  if (!Number.isSafeInteger(prospectId) || prospectId <= 0) return bad(404, 'not found');
  const prospect = await env.MEMBERS.prepare(
    `SELECT id, email, display_name, waitlist_status, waitlist_removed_at,
            booking_uid, granted_at
       FROM prospect WHERE id = ?1`,
  ).bind(prospectId).first();
  if (!prospect || prospect.waitlist_removed_at || prospect.booking_uid || prospect.granted_at
      || !['waiting', 'invited to book'].includes(prospect.waitlist_status)) {
    return bad(409, 'waitlist entry unavailable');
  }
  const timestamp = now();
  const token = randomToken();
  await env.MEMBERS.batch([
    env.MEMBERS.prepare(
      `UPDATE prospect_booking_link SET revoked_at = ?1
        WHERE prospect_id = ?2 AND revoked_at IS NULL`,
    ).bind(timestamp, prospectId),
    env.MEMBERS.prepare(
      `INSERT INTO prospect_booking_link (prospect_id, token_hash, created_at)
       VALUES (?1, ?2, ?3)`,
    ).bind(prospectId, await tokenHash(token), timestamp),
    env.MEMBERS.prepare(
      `UPDATE prospect SET waitlist_status = 'invited to book',
         waitlist_offered_at = ?1, updated_at = ?1 WHERE id = ?2`,
    ).bind(timestamp, prospectId),
  ]);
  await queueWaitlistNotionSync(env, prospectId, ctx, timestamp);
  const sent = await sendWaitlistOffer(env, {
    email: prospect.email, name: prospect.display_name,
    actionUrl: `https://beingsclub.com/members/#conversation=${token}`,
    idempotencyKey: `club-waitlist-offer-${prospectId}-${timestamp}`,
  });
  if (!sent) return bad(502, 'conversation email did not send');
  return json({ ok: true, sent: true });
}

export async function enterWaitlistBooking(env, body) {
  const token = validChallenge(body?.token);
  if (!token) return bad(401, 'conversation link unavailable');
  const timestamp = now();
  const row = await env.MEMBERS.prepare(
    `SELECT p.*, l.id AS link_id
       FROM prospect_booking_link l
       JOIN prospect p ON p.id = l.prospect_id
      WHERE l.token_hash = ?1 AND l.revoked_at IS NULL
        AND p.waitlist_status = 'invited to book'
        AND p.waitlist_removed_at IS NULL AND p.booking_uid IS NULL
        AND p.granted_at IS NULL`,
  ).bind(await tokenHash(token)).first();
  if (!row) return bad(401, 'conversation link unavailable');
  const sessionToken = randomToken();
  await env.MEMBERS.prepare(
    `INSERT INTO prospect_session
      (prospect_id, token_hash, created_at, last_seen_at, expires_at)
     VALUES (?1, ?2, ?3, ?3, ?4)`,
  ).bind(row.id, await tokenHash(sessionToken), timestamp,
    timestamp + SESSION_LIFETIME).run();
  return json({ token: sessionToken });
}

export async function removeFromActiveWaitlist(env, prospectId, status, ctx, timestamp = now()) {
  if (!['booked', 'member', 'withdrawn'].includes(status)) return;
  const result = await env.MEMBERS.prepare(
    `UPDATE prospect SET waitlist_status = ?1,
       waitlist_removed_at = COALESCE(waitlist_removed_at, ?2), updated_at = ?2
     WHERE id = ?3 AND waitlist_joined_at IS NOT NULL
       AND waitlist_removed_at IS NULL`,
  ).bind(status, timestamp, prospectId).run();
  if ((result.meta?.changes ?? 0) !== 1) return;
  await env.MEMBERS.prepare(
    `UPDATE prospect_booking_link SET revoked_at = COALESCE(revoked_at, ?1)
      WHERE prospect_id = ?2`,
  ).bind(timestamp, prospectId).run();
  await queueWaitlistNotionSync(env, prospectId, ctx, timestamp);
}

export async function queueWaitlistNotionSync(env, prospectId, ctx, timestamp = now()) {
  await env.MEMBERS.prepare(
    `INSERT INTO prospect_waitlist_notion_sync (prospect_id, pending_at)
     VALUES (?1, ?2)
     ON CONFLICT(prospect_id) DO UPDATE SET pending_at = excluded.pending_at,
       last_attempt_at = NULL, synced_at = NULL, attempts = 0, last_error = NULL`,
  ).bind(prospectId, timestamp).run();
  const delivery = syncWaitlistToNotion(env, prospectId, timestamp);
  if (ctx?.waitUntil) ctx.waitUntil(delivery); else await delivery;
}

export async function runWaitlistNotionSync(env, scheduledTime = Date.now()) {
  if (!notionConfigured(env) || !env.MEMBERS) return { configured: false, synced: 0, failed: 0 };
  const timestamp = Math.floor(Number(scheduledTime) / 1000);
  const due = await env.MEMBERS.prepare(
    `SELECT prospect_id FROM prospect_waitlist_notion_sync
      WHERE synced_at IS NULL AND (last_attempt_at IS NULL OR last_attempt_at <= ?1)
      ORDER BY pending_at LIMIT 10`,
  ).bind(timestamp - RETRY_AFTER).all();
  const outcomes = await Promise.all((due.results || []).map(
    (row) => syncWaitlistToNotion(env, row.prospect_id, timestamp),
  ));
  return { configured: true, synced: outcomes.filter(Boolean).length,
    failed: outcomes.filter((value) => !value).length };
}

export async function syncWaitlistToNotion(env, prospectId, timestamp = now()) {
  if (!notionConfigured(env) || !env.MEMBERS) return false;
  const claim = await env.MEMBERS.prepare(
    `UPDATE prospect_waitlist_notion_sync SET last_attempt_at = ?1
      WHERE prospect_id = ?2 AND synced_at IS NULL
        AND (last_attempt_at IS NULL OR last_attempt_at <= ?3)`,
  ).bind(timestamp, prospectId, timestamp - RETRY_AFTER).run();
  if ((claim.meta?.changes ?? 0) !== 1) return false;
  const person = await env.MEMBERS.prepare(
    `SELECT p.id, p.email, p.display_name, p.waitlist_joined_at,
            p.waitlist_status, p.waitlist_offered_at, p.waitlist_host_note,
            inviter.display_name AS inviter_name, s.notion_page_id
       FROM prospect p
       JOIN prospect_waitlist_notion_sync s ON s.prospect_id = p.id
       LEFT JOIN member inviter ON inviter.id = p.invited_by_member_id
      WHERE p.id = ?1`,
  ).bind(prospectId).first();
  if (!person) return false;
  try {
    let pageId = person.notion_page_id || await findNotionWaitlistPage(env, person.id);
    const properties = waitlistProperties(person, timestamp);
    const result = pageId
      ? await notionRequest(env, `/pages/${encodeURIComponent(pageId)}`, { method: 'PATCH', body: { properties } })
      : await notionRequest(env, '/pages', { method: 'POST', body: {
        parent: { type: 'data_source_id', data_source_id: env.NOTION_WAITLIST_DATA_SOURCE_ID },
        properties,
      } });
    pageId = pageId || result.id;
    if (!pageId) throw new Error('Notion returned no page id');
    await env.MEMBERS.prepare(
      `UPDATE prospect_waitlist_notion_sync SET notion_page_id = ?1, synced_at = ?2,
         attempts = attempts + 1, last_error = NULL WHERE prospect_id = ?3`,
    ).bind(pageId, timestamp, prospectId).run();
    return true;
  } catch (error) {
    const message = String(error?.message || 'sync failed').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 500);
    console.error('waitlist notion sync failed', prospectId, message);
    await env.MEMBERS.prepare(
      `UPDATE prospect_waitlist_notion_sync SET attempts = attempts + 1,
         last_error = ?1 WHERE prospect_id = ?2`,
    ).bind(message, prospectId).run();
    return false;
  }
}

async function admissionsState(env) {
  const row = await env.MEMBERS.prepare(
    'SELECT paused_at, reopened_at, updated_at FROM club_admissions_state WHERE id = 1',
  ).first();
  return { paused: Number(row?.paused_at) > 0, pausedAt: iso(row?.paused_at),
    reopenedAt: iso(row?.reopened_at), updatedAt: iso(row?.updated_at) };
}

async function findNotionWaitlistPage(env, id) {
  const result = await notionRequest(env,
    `/data_sources/${encodeURIComponent(env.NOTION_WAITLIST_DATA_SOURCE_ID)}/query`, {
      method: 'POST', body: {
        filter: { property: 'Website record ID', number: { equals: id } }, page_size: 2,
      },
    });
  const matches = (result.results || []).filter((page) => !page.in_trash);
  if (matches.length > 1) throw new Error('More than one Notion waitlist entry has this website record ID');
  return matches[0]?.id || null;
}

function waitlistProperties(person, timestamp) {
  const date = (value) => Number(value) > 0 ? { date: { start: new Date(Number(value) * 1000).toISOString() } } : { date: null };
  const rich = (value) => ({ rich_text: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [] });
  return {
    Name: { title: [{ text: { content: person.display_name || person.email } }] },
    Email: { email: person.email },
    Status: { select: { name: person.waitlist_status || 'waiting' } },
    'Joined waiting list': date(person.waitlist_joined_at),
    'Booking offered': date(person.waitlist_offered_at),
    'Invited by': rich(person.inviter_name),
    Source: { select: { name: person.inviter_name ? 'member invitation' : 'website' } },
    'Website record ID': { number: person.id },
    'Host note': rich(person.waitlist_host_note),
    'Last synced': date(timestamp),
  };
}

async function notionRequest(env, path, { method, body }) {
  const response = await fetch(`${NOTION_API}${path}`, {
    method, headers: {
      authorization: `Bearer ${env.NOTION_API_KEY}`,
      'content-type': 'application/json', 'notion-version': NOTION_VERSION,
    }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(`Notion ${response.status}: ${payload.message || 'request failed'}`);
  }
  return response.json();
}

function notionConfigured(env) {
  return Boolean(env?.NOTION_API_KEY && env?.NOTION_WAITLIST_DATA_SOURCE_ID);
}

function iso(value) { return Number(value) > 0 ? new Date(Number(value) * 1000).toISOString() : null; }
function now() { return Math.floor(Date.now() / 1000); }
