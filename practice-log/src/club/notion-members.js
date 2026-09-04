import { json, bad } from '../api.js';
import { sendClubInvitation } from '../mail/send.js';
import { issueMemberWelcomeLink } from './member-links.js';
import { normalizeEmail } from './security.js';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2026-03-11';
const RETRY_AFTER = 30 * 60;

export async function queueMemberNotionSync(env, memberId, ctx, timestamp = now()) {
  await env.MEMBERS.prepare(
    `INSERT INTO member_notion_sync (member_id, pending_at)
     VALUES (?1, ?2)
     ON CONFLICT(member_id) DO UPDATE SET pending_at = excluded.pending_at,
       last_attempt_at = NULL, synced_at = NULL, attempts = 0, last_error = NULL`,
  ).bind(memberId, timestamp).run();

  const delivery = syncMemberToNotion(env, memberId, timestamp);
  if (ctx?.waitUntil) ctx.waitUntil(delivery);
  else await delivery;
}

export async function runMemberNotionSync(env, scheduledTime = Date.now()) {
  if (!configured(env) || !env.MEMBERS) return { configured: false, synced: 0, failed: 0 };
  const timestamp = Math.floor(Number(scheduledTime) / 1000);
  const due = await env.MEMBERS.prepare(
    `SELECT member_id FROM member_notion_sync
      WHERE synced_at IS NULL
        AND (last_attempt_at IS NULL OR last_attempt_at <= ?1)
      ORDER BY pending_at LIMIT 10`,
  ).bind(timestamp - RETRY_AFTER).all();
  const outcomes = await Promise.all(
    (due.results || []).map((row) => syncMemberToNotion(env, row.member_id, timestamp)),
  );
  return {
    configured: true,
    synced: outcomes.filter(Boolean).length,
    failed: outcomes.filter((value) => !value).length,
  };
}

export async function syncMemberToNotion(env, memberId, timestamp = now()) {
  if (!configured(env) || !env.MEMBERS) return false;
  const claim = await env.MEMBERS.prepare(
    `UPDATE member_notion_sync SET last_attempt_at = ?1
      WHERE member_id = ?2 AND synced_at IS NULL
        AND (last_attempt_at IS NULL OR last_attempt_at <= ?3)`,
  ).bind(timestamp, memberId, timestamp - RETRY_AFTER).run();
  if ((claim.meta?.changes ?? 0) !== 1) return false;
  const member = await env.MEMBERS.prepare(
    `SELECT m.id, m.email, m.display_name, s.notion_page_id
       FROM member m JOIN member_notion_sync s ON s.member_id = m.id
      WHERE m.id = ?1`,
  ).bind(memberId).first();
  if (!member) return false;

  try {
    let pageId = member.notion_page_id;
    if (!pageId) pageId = await findNotionMember(env, member.email);
    const properties = memberProperties(member, !pageId);
    const result = pageId
      ? await notionRequest(env, `/pages/${encodeURIComponent(pageId)}`, {
        method: 'PATCH', body: { properties },
      })
      : await notionRequest(env, '/pages', {
        method: 'POST',
        body: {
          parent: {
            type: 'data_source_id',
            data_source_id: env.NOTION_MEMBERS_DATA_SOURCE_ID,
          },
          properties,
        },
      });
    pageId = pageId || result.id;
    if (!pageId) throw new Error('Notion returned no page id');
    await env.MEMBERS.prepare(
      `UPDATE member_notion_sync SET notion_page_id = ?1, synced_at = ?2,
         attempts = attempts + 1, last_error = NULL
       WHERE member_id = ?3`,
    ).bind(pageId, timestamp, memberId).run();
    return true;
  } catch (error) {
    const message = cleanError(error);
    console.error('member notion sync failed', memberId, message);
    await env.MEMBERS.prepare(
      `UPDATE member_notion_sync SET attempts = attempts + 1,
         last_error = ?1 WHERE member_id = ?2`,
    ).bind(message, memberId).run();
    return false;
  }
}

export async function getNotionInvitePreview(env) {
  if (!configured(env)) return json({ configured: false, people: [], readyCount: 0 });
  try {
    const [notionPeople, memberRows] = await Promise.all([
      listNotionMembers(env),
      env.MEMBERS.prepare(
        `SELECT id, email, joined_at, disabled_at, left_at, invitation_sent_at
           FROM member`,
      ).all(),
    ]);
    const members = new Map((memberRows.results || []).map((member) => [
      normalizeEmail(member.email), member,
    ]));
    const counts = new Map();
    notionPeople.forEach((person) => counts.set(person.email, (counts.get(person.email) || 0) + 1));
    const people = notionPeople.map((person) => ({
      ...person,
      status: notionInviteStatus(person, members.get(person.email), counts.get(person.email)),
    }));
    return json({
      configured: true,
      people,
      readyCount: people.filter((person) => person.status === 'ready').length,
      repairCount: people.filter((person) => person.status === 'invited_needs_mark').length,
    });
  } catch (error) {
    console.error('notion invitation preview failed', cleanError(error));
    return bad(502, 'Notion member list unavailable');
  }
}

export async function inviteNotionMembers(env, body) {
  if (!configured(env)) return bad(503, 'Notion is not connected');
  if (body?.confirmation !== 'INVITE NOTION MEMBERS') return bad(400, 'confirmation required');
  let notionPeople;
  try {
    notionPeople = await listNotionMembers(env);
  } catch (error) {
    console.error('notion invitation load failed', cleanError(error));
    return bad(502, 'Notion member list unavailable');
  }
  const memberRows = await env.MEMBERS.prepare(
    `SELECT id, email, joined_at, disabled_at, left_at, invitation_sent_at
       FROM member`,
  ).all();
  const members = new Map((memberRows.results || []).map((member) => [
    normalizeEmail(member.email), member,
  ]));
  const counts = new Map();
  notionPeople.forEach((person) => counts.set(person.email, (counts.get(person.email) || 0) + 1));
  const timestamp = now();
  const results = [];

  for (const person of notionPeople) {
    const member = members.get(person.email);
    const status = notionInviteStatus(person, member, counts.get(person.email));
    if (status === 'invited_needs_mark') {
      const marked = await markRebootInvite(env, person.pageId);
      results.push({ email: person.email, status: marked ? 'marked' : 'mark_failed' });
      continue;
    }
    if (status !== 'ready') {
      results.push({ email: person.email, status });
      continue;
    }
    results.push(await deliverNotionInvitation(env, person, member, timestamp));
  }

  return json({
    ok: true,
    sentCount: results.filter((result) => result.status === 'sent'
      || result.status === 'sent_mark_failed').length,
    markedCount: results.filter((result) => result.status === 'marked').length,
    failedCount: results.filter((result) => result.status === 'send_failed'
      || result.status === 'sent_mark_failed' || result.status === 'mark_failed').length,
    results,
  });
}

export async function inviteNotionMember(env, body) {
  if (!configured(env)) return bad(503, 'Notion is not connected');
  if (body?.confirmation !== 'INVITE NOTION MEMBER') return bad(400, 'confirmation required');
  const pageId = String(body?.pageId || '').trim();
  const email = normalizeEmail(body?.email);
  const personalNote = String(body?.invitationNote || '').trim();
  if (!pageId || !email) return bad(400, 'person');
  if (personalNote.length > 1200) return bad(400, 'invitation note');

  let notionPeople;
  try {
    notionPeople = await listNotionMembers(env);
  } catch (error) {
    console.error('notion invitation load failed', cleanError(error));
    return bad(502, 'Notion member list unavailable');
  }
  const person = notionPeople.find((candidate) => (
    candidate.pageId === pageId && candidate.email === email
  ));
  if (!person) return bad(404, 'Notion member not found');
  const member = await env.MEMBERS.prepare(
    `SELECT id, email, joined_at, disabled_at, left_at, invitation_sent_at
       FROM member WHERE lower(email) = lower(?1)`,
  ).bind(email).first();
  const duplicateCount = notionPeople.filter((candidate) => candidate.email === email).length;
  const status = notionInviteStatus(person, member, duplicateCount);
  if (status !== 'ready') return bad(409, status);

  const result = await deliverNotionInvitation(env, person, member, now(), personalNote);
  if (result.status === 'send_failed') return bad(502, 'invitation email did not send');
  return json({
    ok: true,
    email: result.email,
    sent: true,
    notionMarked: result.status === 'sent',
  });
}

async function deliverNotionInvitation(env, person, existingMember, timestamp, personalNote = '') {
  let member = existingMember;
  if (!member) {
    await env.MEMBERS.prepare(
      `INSERT INTO member (email, display_name, is_host, invited_at, created_at, updated_at)
       VALUES (?1, ?2, 0, ?3, ?3, ?3)`,
    ).bind(person.email, person.name || null, timestamp).run();
    member = await env.MEMBERS.prepare(
      `SELECT id, email, joined_at, disabled_at, left_at, invitation_sent_at
         FROM member WHERE email = ?1`,
    ).bind(person.email).first();
  } else if (person.name) {
    await env.MEMBERS.prepare(
      `UPDATE member SET display_name = COALESCE(display_name, ?1), updated_at = ?2
        WHERE id = ?3`,
    ).bind(person.name, timestamp, member.id).run();
  }
  await env.MEMBERS.prepare(
    `INSERT INTO member_notion_sync
      (member_id, notion_page_id, pending_at, last_attempt_at, synced_at, attempts)
     VALUES (?1, ?2, ?3, ?3, ?3, 1)
     ON CONFLICT(member_id) DO UPDATE SET notion_page_id = excluded.notion_page_id,
       pending_at = excluded.pending_at, last_attempt_at = excluded.last_attempt_at,
       synced_at = excluded.synced_at, last_error = NULL`,
  ).bind(member.id, person.pageId, timestamp).run();
  const actionUrl = await issueMemberWelcomeLink(env, member.id, timestamp);
  const sent = await sendClubInvitation(env, {
    email: member.email,
    name: person.name,
    personalNote,
    actionUrl,
    idempotencyKey: `club-reboot-${member.id}-2026`,
  });
  await env.MEMBERS.prepare(
    `UPDATE member SET invitation_sent_at = ?1,
       invitation_last_attempt_at = ?2, invitation_last_error = ?3,
       updated_at = ?2 WHERE id = ?4`,
  ).bind(sent ? timestamp : null, timestamp, sent ? null : 'delivery failed', member.id).run();
  const marked = sent ? await markRebootInvite(env, person.pageId) : false;
  return {
    email: person.email,
    status: !sent ? 'send_failed' : marked ? 'sent' : 'sent_mark_failed',
  };
}

async function findNotionMember(env, email) {
  const result = await notionRequest(
    env,
    `/data_sources/${encodeURIComponent(env.NOTION_MEMBERS_DATA_SOURCE_ID)}/query`,
    {
      method: 'POST',
      body: {
        filter: { property: 'Email', email: { equals: email } },
        page_size: 2,
      },
    },
  );
  const matches = (result.results || []).filter((page) => !page.in_trash);
  if (matches.length > 1) throw new Error('More than one Notion member has this email');
  return matches[0]?.id || null;
}

async function listNotionMembers(env) {
  const people = [];
  let cursor = null;
  do {
    const result = await notionRequest(
      env,
      `/data_sources/${encodeURIComponent(env.NOTION_MEMBERS_DATA_SOURCE_ID)}/query`,
      {
        method: 'POST',
        body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
      },
    );
    for (const page of result.results || []) {
      if (page.in_trash) continue;
      const email = normalizeEmail(page.properties?.Email?.email);
      if (!email) continue;
      people.push({
        pageId: page.id,
        email,
        name: notionTitle(page.properties?.Name?.title),
        rebootInviteSent: !!page.properties?.['Reboot Invite Sent?']?.checkbox,
      });
    }
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  return people;
}

function notionInviteStatus(person, member, duplicateCount) {
  if (duplicateCount > 1) return 'duplicate';
  if (person.rebootInviteSent) return 'marked_sent';
  if (!member) return 'ready';
  if (member.disabled_at || member.left_at) return 'inactive';
  if (member.joined_at) return 'joined';
  if (member.invitation_sent_at) return 'invited_needs_mark';
  return 'ready';
}

async function markRebootInvite(env, pageId) {
  try {
    await notionRequest(env, `/pages/${encodeURIComponent(pageId)}`, {
      method: 'PATCH',
      body: { properties: { 'Reboot Invite Sent?': { checkbox: true } } },
    });
    return true;
  } catch (error) {
    console.error('notion invitation mark failed', cleanError(error));
    return false;
  }
}

function notionTitle(parts) {
  if (!Array.isArray(parts)) return null;
  const value = parts.map((part) => part.plain_text || part.text?.content || '').join('').trim();
  return value ? value.slice(0, 120) : null;
}

async function notionRequest(env, path, { method, body }) {
  const response = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.NOTION_API_KEY}`,
      'content-type': 'application/json',
      'notion-version': NOTION_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(`Notion ${response.status}: ${payload.message || 'request failed'}`);
  }
  return response.json();
}

function memberProperties(member, needsTitle) {
  const properties = { Email: { email: member.email } };
  const name = String(member.display_name || '').trim().slice(0, 2000);
  if (name || needsTitle) {
    properties.Name = {
      title: [{ text: { content: name || member.email } }],
    };
  }
  return properties;
}

function configured(env) {
  return Boolean(env?.NOTION_API_KEY && env?.NOTION_MEMBERS_DATA_SOURCE_ID);
}

function cleanError(error) {
  return String(error?.message || 'sync failed')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 500);
}

function now() {
  return Math.floor(Date.now() / 1000);
}
