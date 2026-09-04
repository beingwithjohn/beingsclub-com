import { randomToken, tokenHash } from './security.js';

const MEMBER_LINK_LIFETIME = 7 * 24 * 60 * 60;

export async function issueMemberAccessLink(env, memberId, timestamp, destination = '') {
  const token = randomToken();
  await env.MEMBERS.prepare(
    `INSERT INTO member_welcome_link
      (token_hash, member_id, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4)`,
  ).bind(
    await tokenHash(token), memberId, timestamp, timestamp + MEMBER_LINK_LIFETIME,
  ).run();
  await env.MEMBERS.prepare(
    'DELETE FROM member_welcome_link WHERE expires_at < ?1',
  ).bind(timestamp - 86400).run();
  const next = destination ? `&next=${encodeURIComponent(destination)}` : '';
  return `https://beingsclub.com/members/#welcome=${encodeURIComponent(token)}${next}`;
}

export async function issueMemberWelcomeLink(env, memberId, timestamp) {
  const token = randomToken();
  await env.MEMBERS.batch([
    env.MEMBERS.prepare(
      `UPDATE member_welcome_link SET consumed_at = ?1
        WHERE member_id = ?2 AND consumed_at IS NULL`,
    ).bind(timestamp, memberId),
    env.MEMBERS.prepare(
      `INSERT INTO member_welcome_link
        (token_hash, member_id, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4)`,
    ).bind(
      await tokenHash(token), memberId, timestamp, timestamp + MEMBER_LINK_LIFETIME,
    ),
    env.MEMBERS.prepare(
      'DELETE FROM member_welcome_link WHERE expires_at < ?1',
    ).bind(timestamp - 86400),
  ]);
  return `https://beingsclub.com/members/#welcome=${encodeURIComponent(token)}`;
}
