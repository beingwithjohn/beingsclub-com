import { bad, json } from '../api.js';

export const MEMBER_AGREEMENT_VERSION = '2026-09-01';

export function agreementAccepted(member) {
  return member?.agreement_version === MEMBER_AGREEMENT_VERSION
    && Number(member?.agreement_accepted_at) > 0;
}

export async function acceptMemberAgreement(env, who, body, timestamp = now()) {
  if (body?.accepted !== true || body?.version !== MEMBER_AGREEMENT_VERSION) {
    return bad(400, 'agreement');
  }
  const id = Number(who.member_id ?? who.id);
  const result = await env.MEMBERS.prepare(
    `UPDATE member SET agreement_version = ?1, agreement_accepted_at = ?2,
       updated_at = ?2 WHERE id = ?3 AND disabled_at IS NULL AND left_at IS NULL`,
  ).bind(MEMBER_AGREEMENT_VERSION, timestamp, id).run();
  if ((result.meta?.changes ?? 0) !== 1) return bad(404, 'not found');
  return json({
    member: {
      id,
      email: who.email,
      name: who.display_name,
      website: who.website,
      line: who.profile_line,
      hasImage: !!who.profile_image,
      isHost: !!who.is_host,
      agreementAccepted: true,
      agreementVersion: MEMBER_AGREEMENT_VERSION,
    },
  });
}

function now() {
  return Math.floor(Date.now() / 1000);
}
