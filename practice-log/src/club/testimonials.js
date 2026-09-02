import { bad, json } from '../api.js';

const BODY_MAX = 2000;
const NAME_MAX = 80;
const CONSENT = 'public-any-channel-light-edit-v1';
const CLUB_TIMEZONE = 'Europe/London';

export async function getMemberGiving(env, who, timestamp = now()) {
  const month = clubMonth(timestamp);
  const [row, subscription] = await Promise.all([
    env.MEMBERS.prepare(
    `SELECT id, attribution_name, body, status, submitted_at, updated_at
       FROM member_testimonial WHERE member_id = ?1 AND month_key = ?2`,
    ).bind(memberId(who), month).first(),
    env.DB.prepare(
      `SELECT amount, currency, status, cancel_at_period_end, updated_at
         FROM giving_subscription
        WHERE lower(email) = lower(?1)
          AND status NOT IN ('canceled', 'incomplete_expired')
        ORDER BY updated_at DESC LIMIT 1`,
    ).bind(who.email).first(),
  ]);
  const monthlyGiving = subscription &&
    ['active', 'trialing'].includes(subscription.status) &&
    !Number(subscription.cancel_at_period_end)
    ? {
        active: true,
        amount: Number(subscription.amount),
        currency: String(subscription.currency || 'gbp').toLowerCase(),
      }
    : null;
  return json({
    month,
    testimonial: row ? shapeMemberTestimonial(row) : null,
    canSubmit: !row,
    suggestedName: who.display_name || '',
    consentVersion: CONSENT,
    monthlyGiving,
  });
}

export async function createTestimonial(env, who, body, timestamp = now()) {
  const parsed = parseTestimonial(body);
  if (!parsed.ok) return bad(400, parsed.error);
  const month = clubMonth(timestamp);
  try {
    const result = await env.MEMBERS.prepare(
      `INSERT INTO member_testimonial
        (member_id, month_key, attribution_name, body, consent_version,
         status, submitted_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?6)`,
    ).bind(
      memberId(who), month, parsed.name, parsed.body, CONSENT, timestamp,
    ).run();
    return json({ ok: true, id: result.meta?.last_row_id }, 201);
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) return bad(409, 'already offered this month');
    throw error;
  }
}

export async function updateTestimonial(env, who, testimonialId, body, timestamp = now()) {
  const parsed = parseTestimonial(body);
  if (!parsed.ok) return bad(400, parsed.error);
  const result = await env.MEMBERS.prepare(
    `UPDATE member_testimonial
        SET attribution_name = ?1, body = ?2, consent_version = ?3, updated_at = ?4
      WHERE id = ?5 AND member_id = ?6 AND status = 'pending'`,
  ).bind(parsed.name, parsed.body, CONSENT, timestamp, testimonialId, memberId(who)).run();
  if ((result.meta?.changes ?? 0) !== 1) return bad(409, 'no longer editable');
  return json({ ok: true });
}

export async function withdrawTestimonial(env, who, testimonialId, timestamp = now()) {
  const result = await env.MEMBERS.prepare(
    `UPDATE member_testimonial
        SET status = 'withdrawn', resolved_at = ?1, updated_at = ?1
      WHERE id = ?2 AND member_id = ?3 AND status = 'pending'`,
  ).bind(timestamp, testimonialId, memberId(who)).run();
  if ((result.meta?.changes ?? 0) !== 1) return bad(409, 'no longer withdrawable');
  return json({ ok: true });
}

export async function getHostTestimonials(env) {
  const rows = await env.MEMBERS.prepare(
    `SELECT t.id, t.month_key, t.attribution_name, t.body,
            t.submitted_at, t.updated_at, m.display_name, m.email
       FROM member_testimonial t JOIN member m ON m.id = t.member_id
      WHERE t.status = 'pending'
      ORDER BY t.submitted_at ASC, t.id ASC`,
  ).all();
  return json({
    testimonials: (rows.results || []).map((row) => ({
      id: row.id,
      month: row.month_key,
      attributionName: row.attribution_name,
      body: row.body,
      memberName: row.display_name,
      email: row.email,
      submittedAt: iso(row.submitted_at),
      updatedAt: iso(row.updated_at),
    })),
  });
}

export async function resolveTestimonial(env, who, testimonialId, body, timestamp = now()) {
  const status = body?.status === 'used' || body?.status === 'passed' ? body.status : null;
  if (!status) return bad(400, 'status');
  const result = await env.MEMBERS.prepare(
    `UPDATE member_testimonial
        SET status = ?1, resolved_at = ?2, resolved_by = ?3, updated_at = ?2
      WHERE id = ?4 AND status = 'pending'`,
  ).bind(status, timestamp, memberId(who), testimonialId).run();
  if ((result.meta?.changes ?? 0) !== 1) return bad(409, 'already resolved');
  return getHostTestimonials(env);
}

export function parseTestimonial(value) {
  const name = String(value?.name ?? '').trim();
  const body = String(value?.body ?? '').trim();
  if (!name || name.length > NAME_MAX) return { ok: false, error: 'name' };
  if (!body || body.length > BODY_MAX) return { ok: false, error: 'testimonial' };
  if (value?.consent !== true) return { ok: false, error: 'permission' };
  return { ok: true, name, body };
}

export function clubMonth(timestamp) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: CLUB_TIMEZONE, year: 'numeric', month: '2-digit',
  }).formatToParts(new Date(Number(timestamp) * 1000))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
}

function shapeMemberTestimonial(row) {
  return {
    id: row.id,
    attributionName: row.attribution_name,
    body: row.body,
    status: row.status,
    canEdit: row.status === 'pending',
    submittedAt: iso(row.submitted_at),
    updatedAt: iso(row.updated_at),
  };
}

function memberId(who) {
  return Number(who.member_id ?? who.id);
}

function iso(seconds) {
  return seconds == null ? null : new Date(Number(seconds) * 1000).toISOString();
}

function now() {
  return Math.floor(Date.now() / 1000);
}
