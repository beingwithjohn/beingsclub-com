import { bad, json } from '../api.js';
import {
  sendClubMemberMessageNotification, sendClubMessageReplyNotification,
} from '../mail/send.js';
import { MEMBER_AGREEMENT_VERSION } from './agreement.js';
import { issueMemberAccessLink } from './member-links.js';

const MESSAGE_MAX = 4000;
const SOURCE_PAGES = new Set([
  'messages', 'salon', 'field-notes', 'members', 'in-person', 'giving', 'public',
]);

export function parsePrivateMessage(body) {
  const message = String(body?.message || '').trim();
  const sourcePage = String(body?.sourcePage || 'messages').trim();
  if (!message) return { error: 'Write something first.' };
  if (message.length > MESSAGE_MAX) {
    return { error: `Keep messages to ${MESSAGE_MAX.toLocaleString('en-GB')} characters or fewer.` };
  }
  if (!SOURCE_PAGES.has(sourcePage)) return { error: 'page' };
  return { ok: true, message, sourcePage };
}

export function parseBroadcastRequest(body) {
  const parsed = parsePrivateMessage({ ...body, sourcePage: 'messages' });
  if (!parsed.ok) return parsed;
  const requestKey = String(body?.requestKey || '').trim();
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey)) return { error: 'request key' };
  return { ok: true, message: parsed.message, requestKey };
}

export async function getMemberMessages(env, member) {
  const rows = await env.MEMBERS.prepare(
    `SELECT id, sender_role, sender_name, body, created_at, member_read_at
       FROM member_message
      WHERE member_id = ?1
      ORDER BY created_at, id
      LIMIT 500`,
  ).bind(member.id).all();
  return json({
    messages: (rows.results || []).map(shapeMessage),
    unreadCount: (rows.results || []).filter(
      (message) => message.sender_role === 'host' && !message.member_read_at,
    ).length,
  });
}

export async function postMemberMessage(env, member, body, ctx, timestamp = now()) {
  if (member.is_host) return bad(403, 'host inbox');
  const parsed = parsePrivateMessage(body);
  if (!parsed.ok) return bad(400, parsed.error);
  const senderName = cleanSenderName(member.display_name, member.email);
  const result = await env.MEMBERS.prepare(
    `INSERT INTO member_message
      (member_id, sender_role, sender_name, body, source_page, created_at, member_read_at)
     VALUES (?1, 'member', ?2, ?3, ?4, ?5, ?5)`,
  ).bind(member.id, senderName, parsed.message, parsed.sourcePage, timestamp).run();
  const id = Number(result.meta?.last_row_id);
  const delivery = sendClubMemberMessageNotification(env, {
    email: member.email, memberId: member.id,
    name: member.display_name,
    message: parsed.message,
    idempotencyKey: Number.isSafeInteger(id) ? `club-member-message-${id}` : undefined,
  }).catch((error) => {
    console.error('member message notification failed', error?.message);
    return false;
  });
  if (ctx?.waitUntil) ctx.waitUntil(delivery); else await delivery;
  return json({
    message: shapeMessage({
      id, sender_role: 'member', sender_name: senderName,
      body: parsed.message, created_at: timestamp,
    }),
  }, 201);
}

export async function markMemberMessagesRead(env, member, timestamp = now()) {
  await env.MEMBERS.prepare(
    `UPDATE member_message SET member_read_at = ?1
      WHERE member_id = ?2 AND sender_role = 'host' AND member_read_at IS NULL`,
  ).bind(timestamp, member.id).run();
  return json({ ok: true });
}

export async function getHostMessageThreads(env) {
  const [rows, members] = await env.MEMBERS.batch([
    env.MEMBERS.prepare(
    `SELECT m.id AS member_id, m.display_name, m.email,
            latest.body, latest.sender_role, latest.sender_name, latest.created_at,
            summary.unread_count
       FROM member m
       JOIN (
         SELECT member_id, MAX(id) AS latest_id,
                SUM(CASE WHEN sender_role = 'member' AND host_read_at IS NULL THEN 1 ELSE 0 END) AS unread_count
           FROM member_message GROUP BY member_id
       ) summary ON summary.member_id = m.id
       JOIN member_message latest ON latest.id = summary.latest_id
      WHERE m.is_host = 0
      ORDER BY latest.created_at DESC, latest.id DESC`,
    ),
    env.MEMBERS.prepare(
      `SELECT id, display_name, email FROM member
        WHERE is_host = 0
          AND joined_at IS NOT NULL
          AND disabled_at IS NULL
          AND left_at IS NULL
          AND paused_at IS NULL
          AND agreement_version = ?1
          AND agreement_accepted_at IS NOT NULL
          AND onboarding_completed_at IS NOT NULL
        ORDER BY LOWER(COALESCE(NULLIF(TRIM(display_name), ''), email)), id`,
    ).bind(MEMBER_AGREEMENT_VERSION),
  ]);
  const activeMembers = (members.results || []).map((member) => ({
    memberId: Number(member.id),
    memberName: member.display_name || member.email,
    email: member.email,
  }));
  return json({
    recipientCount: activeMembers.length,
    members: activeMembers,
    threads: (rows.results || []).map((row) => ({
    memberId: Number(row.member_id),
    memberName: row.display_name || row.email,
    email: row.email,
    lastMessage: row.body,
    lastSenderRole: row.sender_role,
    lastSenderName: row.sender_name,
    updatedAt: toIso(row.created_at),
    unreadCount: Number(row.unread_count || 0),
    })),
  });
}

export async function getHostMemberMessages(env, memberId) {
  const member = await findMember(env, memberId, false);
  if (!member) return bad(404, 'not found');
  const rows = await env.MEMBERS.prepare(
    `SELECT id, sender_role, sender_name, body, created_at, host_read_at
       FROM member_message
      WHERE member_id = ?1
      ORDER BY created_at, id
      LIMIT 500`,
  ).bind(memberId).all();
  return json({
    member: { id: member.id, name: member.display_name || member.email, email: member.email },
    messages: (rows.results || []).map(shapeMessage),
    unreadCount: (rows.results || []).filter(
      (message) => message.sender_role === 'member' && !message.host_read_at,
    ).length,
  });
}

export async function postHostMessage(env, memberId, body, ctx, timestamp = now()) {
  const parsed = parsePrivateMessage({ ...body, sourcePage: 'messages' });
  if (!parsed.ok) return bad(400, parsed.error);
  const member = await findMember(env, memberId, true);
  if (!member) return bad(404, 'not found');
  const result = await env.MEMBERS.prepare(
    `INSERT INTO member_message
      (member_id, sender_role, sender_name, body, source_page, created_at, host_read_at)
     VALUES (?1, 'host', 'John', ?2, 'messages', ?3, ?3)`,
  ).bind(memberId, parsed.message, timestamp).run();
  const id = Number(result.meta?.last_row_id);
  const delivery = (async () => {
    const actionUrl = await issueMemberAccessLink(env, memberId, timestamp, 'messages');
    return sendClubMessageReplyNotification(env, {
      email: member.email,
      name: member.display_name,
      actionUrl,
      idempotencyKey: Number.isSafeInteger(id) ? `club-host-message-${id}` : undefined,
    });
  })().catch((error) => {
    console.error('host message notification failed', error?.message);
    return false;
  });
  if (ctx?.waitUntil) ctx.waitUntil(delivery); else await delivery;
  return json({
    message: shapeMessage({
      id, sender_role: 'host', sender_name: 'John',
      body: parsed.message, created_at: timestamp,
    }),
  }, 201);
}

export async function postHostBroadcast(env, host, body, ctx, timestamp = now()) {
  const parsed = parseBroadcastRequest(body);
  if (!parsed.ok) return bad(400, parsed.error);

  await env.MEMBERS.prepare(
    `INSERT OR IGNORE INTO member_message_broadcast
      (request_key, sender_member_id, body, created_at)
     VALUES (?1, ?2, ?3, ?4)`,
  ).bind(parsed.requestKey, host.id, parsed.message, timestamp).run();
  const broadcast = await env.MEMBERS.prepare(
    `SELECT id, body FROM member_message_broadcast WHERE request_key = ?1`,
  ).bind(parsed.requestKey).first();
  if (!broadcast || broadcast.body !== parsed.message) return bad(409, 'request conflict');

  const recipients = await env.MEMBERS.prepare(
    `SELECT id, email, display_name FROM member
      WHERE is_host = 0
        AND joined_at IS NOT NULL
        AND disabled_at IS NULL
        AND left_at IS NULL
        AND paused_at IS NULL
        AND agreement_version = ?1
        AND agreement_accepted_at IS NOT NULL
        AND onboarding_completed_at IS NOT NULL
      ORDER BY id`,
  ).bind(MEMBER_AGREEMENT_VERSION).all();
  const members = recipients.results || [];
  const inserts = members.map((member) => env.MEMBERS.prepare(
    `INSERT OR IGNORE INTO member_message
      (member_id, sender_role, sender_name, body, source_page, created_at,
       host_read_at, broadcast_id)
     VALUES (?1, 'host', 'John', ?2, 'messages', ?3, ?3, ?4)`,
  ).bind(member.id, parsed.message, timestamp, broadcast.id));
  const results = inserts.length ? await env.MEMBERS.batch(inserts) : [];
  const newlySent = members.flatMap((member, index) => {
    const result = results[index];
    if (Number(result?.meta?.changes || 0) !== 1) return [];
    return [{ ...member, messageId: Number(result.meta?.last_row_id) }];
  });

  const total = await env.MEMBERS.prepare(
    `SELECT COUNT(*) AS count FROM member_message WHERE broadcast_id = ?1`,
  ).bind(broadcast.id).first();
  await env.MEMBERS.prepare(
    `UPDATE member_message_broadcast SET recipient_count = ?1 WHERE id = ?2`,
  ).bind(Number(total?.count || 0), broadcast.id).run();

  const delivery = Promise.allSettled(newlySent.map(async (member) => {
    const actionUrl = await issueMemberAccessLink(env, member.id, timestamp, 'messages');
    return sendClubMessageReplyNotification(env, {
      email: member.email,
      name: member.display_name,
      actionUrl,
      idempotencyKey: `club-broadcast-${broadcast.id}-${member.id}`,
    });
  })).catch((error) => {
    console.error('host broadcast notifications failed', error?.message);
    return [];
  });
  if (ctx?.waitUntil) ctx.waitUntil(delivery); else await delivery;

  return json({
    ok: true,
    sent: newlySent.length,
    recipientCount: members.length,
    duplicate: newlySent.length === 0,
  });
}

export async function markHostMessagesRead(env, memberId, timestamp = now()) {
  if (!Number.isSafeInteger(memberId) || memberId <= 0) return bad(404, 'not found');
  await env.MEMBERS.prepare(
    `UPDATE member_message SET host_read_at = ?1
      WHERE member_id = ?2 AND sender_role = 'member' AND host_read_at IS NULL`,
  ).bind(timestamp, memberId).run();
  return json({ ok: true });
}

async function findMember(env, memberId, requireActive) {
  if (!Number.isSafeInteger(memberId) || memberId <= 0) return null;
  const active = requireActive
    ? ' AND disabled_at IS NULL AND left_at IS NULL AND paused_at IS NULL' : '';
  return env.MEMBERS.prepare(
    `SELECT id, email, display_name FROM member WHERE id = ?1${active}`,
  ).bind(memberId).first();
}

function cleanSenderName(name, email) {
  return String(name || email || 'A member').trim().slice(0, 120) || 'A member';
}

function shapeMessage(message) {
  return {
    id: Number(message.id),
    senderRole: message.sender_role,
    senderName: message.sender_name,
    body: message.body,
    createdAt: toIso(message.created_at),
  };
}

function toIso(timestamp) {
  return new Date(Number(timestamp) * 1000).toISOString();
}

function now() {
  return Math.floor(Date.now() / 1000);
}
