import { json } from '../api.js';
import { sendMemberJoinedNotification } from '../mail/send.js';

const RETRY_AFTER = 30 * 60;
const MAX_ATTEMPTS = 24;

export async function completeOnboarding(env, who, timestamp = now()) {
  const id = Number(who.member_id ?? who.id);
  await env.MEMBERS.prepare(
    `UPDATE member SET onboarding_completed_at = COALESCE(onboarding_completed_at, ?1),
            updated_at = ?1
      WHERE id = ?2 AND disabled_at IS NULL AND left_at IS NULL`,
  ).bind(timestamp, id).run();
  const member = await env.MEMBERS.prepare(
    `SELECT id, email, display_name, onboarding_completed_at,
            host_join_notice_sent_at, host_join_notice_last_attempt_at,
            host_join_notice_attempts
       FROM member WHERE id = ?1`,
  ).bind(id).first();
  const sent = member?.host_join_notice_sent_at
    ? true : await deliverHostJoinNotice(env, member, timestamp);
  return json({ ok: true, onboardingCompleted: true, hostNotificationSent: sent });
}

export async function retryHostJoinNotices(env, timestamp = now()) {
  if (!env.MEMBERS) return { attempted: 0, sent: 0 };
  const due = await env.MEMBERS.prepare(
    `SELECT id, email, display_name, onboarding_completed_at,
            host_join_notice_sent_at, host_join_notice_last_attempt_at,
            host_join_notice_attempts
       FROM member
      WHERE onboarding_completed_at IS NOT NULL
        AND host_join_notice_sent_at IS NULL
        AND disabled_at IS NULL AND left_at IS NULL
        AND host_join_notice_attempts < ?1
        AND COALESCE(host_join_notice_last_attempt_at, 0) <= ?2
      ORDER BY id LIMIT 20`,
  ).bind(MAX_ATTEMPTS, timestamp - RETRY_AFTER).all();
  let sent = 0;
  for (const member of due.results || []) {
    if (await deliverHostJoinNotice(env, member, timestamp)) sent += 1;
  }
  return { attempted: (due.results || []).length, sent };
}

async function deliverHostJoinNotice(env, member, timestamp) {
  if (!member?.id || !member?.onboarding_completed_at) return false;
  await env.MEMBERS.prepare(
    `UPDATE member SET host_join_notice_last_attempt_at = ?1,
            host_join_notice_attempts = host_join_notice_attempts + 1,
            host_join_notice_last_error = NULL, updated_at = ?1
      WHERE id = ?2 AND host_join_notice_sent_at IS NULL`,
  ).bind(timestamp, member.id).run();
  const delivered = await sendMemberJoinedNotification(env, {
    email: member.email,
    name: member.display_name,
    completedAt: member.onboarding_completed_at,
    idempotencyKey: `club-joined-${member.id}-${member.onboarding_completed_at}`,
  });
  await env.MEMBERS.prepare(
    `UPDATE member SET host_join_notice_sent_at = ?1,
            host_join_notice_last_error = ?2, updated_at = ?3
      WHERE id = ?4 AND host_join_notice_sent_at IS NULL`,
  ).bind(delivered ? timestamp : null, delivered ? null : 'delivery failed', timestamp, member.id).run();
  return delivered;
}

function now() {
  return Math.floor(Date.now() / 1000);
}
