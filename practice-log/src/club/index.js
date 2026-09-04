import { json, bad } from '../api.js';
import { clubInvitationEmail, sendClubCode, sendClubInvitation } from '../mail/send.js';
import {
  bearerToken, keyedHash, normalizeEmail, randomCode, randomToken,
  sameText, tokenHash, validChallenge, validCode,
} from './security.js';
import {
  closeCompletedSalon, deleteHostSalon, getHostSalon, getMemberSalon, publishHostSalon,
  saveHostSalon, setMemberRsvp,
} from './salons.js';
import {
  createFieldNote, dismissFieldNoteInvitation, getFieldNoteImage,
  getHostFieldNotes, getMemberFieldNotes, hostRemoveFieldNote,
  inviteFieldNoteAttendees, removeOwnFieldNote, updateFieldNote,
} from './field-notes.js';
import {
  createTestimonial, getHostTestimonials, getMemberGiving, resolveTestimonial,
  updateTestimonial, withdrawTestimonial,
} from './testimonials.js';
import { getDirectory, getProfileImage, updateProfile } from './profiles.js';
import {
  getMemberSettings, leaveClub, signOutEverywhere, updateMemberSettings,
} from './settings.js';
import { announceSalon } from './mailer.js';
import {
  acceptMemberAgreement, agreementAccepted, MEMBER_AGREEMENT_VERSION,
} from './agreement.js';
import { postGiving, postGivingPortal } from '../giving.js';
import { completeOnboarding } from './onboarding.js';
import {
  createProspectBooking, enterGrantedProspect, enterMemberWelcome,
  getProspectSlots, getProspectState, grantProspect, identifyProspect,
  listProspects, requestProspectCode,
  resendProspectWelcome, saveProspectTimeNote, verifyProspectCode,
} from './prospects.js';
import {
  deleteHostInPersonEvent, getHostInPersonEvents, getInPersonEventImage,
  getMemberInPersonEvents, publishHostInPersonEvent, saveHostInPersonEvent,
} from './in-person.js';
import {
  getNotionInvitePreview, inviteNotionMembers, queueMemberNotionSync,
} from './notion-members.js';

const CODE_LIFETIME = 10 * 60;
const SESSION_LIFETIME = 30 * 24 * 60 * 60;

export async function clubRoute(request, env, ctx, url) {
  if (!env.MEMBERS) return bad(503, 'members unavailable');
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/club/auth/request' && method === 'POST') {
    return requestCode(request, env, ctx, await readJson(request));
  }
  if (path === '/api/club/auth/verify' && method === 'POST') {
    return verifyCode(env, await readJson(request));
  }
  if (path === '/api/club/auth/welcome' && method === 'POST') {
    return enterMemberWelcome(env, await readJson(request));
  }
  if (path === '/api/club/prospect/auth/request' && method === 'POST') {
    return requestProspectCode(request, env, ctx, await readJson(request));
  }
  if (path === '/api/club/prospect/auth/verify' && method === 'POST') {
    return verifyProspectCode(env, await readJson(request));
  }
  if (path.startsWith('/api/club/prospect/')) {
    const prospect = await identifyProspect(request, env);
    if (!prospect) return bad(401, 'no');
    if (path === '/api/club/prospect/session' && method === 'GET') {
      return getProspectState(env, prospect);
    }
    if (path === '/api/club/prospect/slots' && method === 'GET') {
      return getProspectSlots(env, prospect, url);
    }
    if (path === '/api/club/prospect/booking' && method === 'POST') {
      return createProspectBooking(env, prospect, await readJson(request));
    }
    if (path === '/api/club/prospect/note' && method === 'POST') {
      return saveProspectTimeNote(env, prospect, await readJson(request));
    }
    if (path === '/api/club/prospect/enter' && method === 'POST') {
      return enterGrantedProspect(env, prospect);
    }
    if (path === '/api/club/prospect/logout' && method === 'POST') {
      await env.MEMBERS.prepare(
        'UPDATE prospect_session SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL',
      ).bind(now(), prospect.session_id).run();
      return json({ ok: true });
    }
    return bad(404, 'not found');
  }

  const who = await identifyMember(request, env);
  if (!who) return bad(401, 'no');

  if (path === '/api/club/session' && method === 'GET') return json({ member: shapeMember(who) });
  if (path === '/api/club/auth/logout' && method === 'POST') {
    await env.MEMBERS.prepare(
      'UPDATE member_session SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL',
    ).bind(now(), who.session_id).run();
    return json({ ok: true });
  }
  if (path === '/api/club/agreement' && method === 'POST') {
    return acceptMemberAgreement(env, who, await readJson(request));
  }
  if (!agreementAccepted(who)) return bad(403, 'agreement required');

  if (path === '/api/club/onboarding/complete' && method === 'POST') {
    return completeOnboarding(env, who);
  }

  if (path === '/api/club/salon' && method === 'GET') return getMemberSalon(env, who);
  if (path === '/api/club/in-person' && method === 'GET') return getMemberInPersonEvents(env);
  const inPersonImage = /^\/api\/club\/in-person\/(\d+)\/image$/.exec(path);
  if (inPersonImage && method === 'GET') {
    return getInPersonEventImage(env, who, Number(inPersonImage[1]));
  }
  const rsvp = /^\/api\/club\/salons\/(\d+)\/rsvp$/.exec(path);
  if (rsvp && method === 'POST') {
    return setMemberRsvp(env, who, Number(rsvp[1]), await readJson(request), ctx);
  }
  if (path === '/api/club/field-notes' && method === 'GET') return getMemberFieldNotes(env, who);
  if (path === '/api/club/field-notes' && method === 'POST') {
    return createFieldNote(env, who, await readJson(request));
  }
  const fieldNoteImage = /^\/api\/club\/field-notes\/(\d+)\/image$/.exec(path);
  if (fieldNoteImage && method === 'GET') return getFieldNoteImage(env, Number(fieldNoteImage[1]));
  const fieldNote = /^\/api\/club\/field-notes\/(\d+)$/.exec(path);
  if (fieldNote && method === 'PATCH') {
    return updateFieldNote(env, who, Number(fieldNote[1]), await readJson(request));
  }
  if (fieldNote && method === 'DELETE') return removeOwnFieldNote(env, who, Number(fieldNote[1]));
  const dismissFieldNote = /^\/api\/club\/field-note-invitations\/(\d+)\/dismiss$/.exec(path);
  if (dismissFieldNote && method === 'POST') {
    return dismissFieldNoteInvitation(env, who, Number(dismissFieldNote[1]));
  }
  if (path === '/api/club/giving' && method === 'GET') return getMemberGiving(env, who);
  if (path === '/api/club/giving/checkout' && method === 'POST') {
    const body = await readJson(request);
    if (body === undefined) return bad(400, 'bad json');
    return postGiving(env, { ...body, context: 'members' }, who);
  }
  if (path === '/api/club/giving/manage' && method === 'POST') {
    return postGivingPortal(env, who, 'https://beingsclub.com/members/#giving');
  }
  if (path === '/api/club/testimonials' && method === 'POST') {
    return createTestimonial(env, who, await readJson(request));
  }
  const testimonial = /^\/api\/club\/testimonials\/(\d+)$/.exec(path);
  if (testimonial && method === 'PATCH') {
    return updateTestimonial(env, who, Number(testimonial[1]), await readJson(request));
  }
  if (testimonial && method === 'DELETE') {
    return withdrawTestimonial(env, who, Number(testimonial[1]));
  }
  if (path === '/api/club/directory' && method === 'GET') return getDirectory(env, who);
  if (path === '/api/club/profile' && method === 'PATCH') {
    return updateProfile(env, who, await readJson(request));
  }
  if (path === '/api/club/settings' && method === 'GET') return getMemberSettings(env, who);
  if (path === '/api/club/settings' && method === 'PATCH') {
    return updateMemberSettings(env, who, await readJson(request));
  }
  if (path === '/api/club/settings/sign-out-all' && method === 'POST') {
    return signOutEverywhere(env, who);
  }
  if (path === '/api/club/settings/leave' && method === 'POST') {
    return leaveClub(env, who, await readJson(request));
  }
  const profileImage = /^\/api\/club\/members\/(\d+)\/image$/.exec(path);
  if (profileImage && method === 'GET') return getProfileImage(env, Number(profileImage[1]));

  if (!who.is_host || !path.startsWith('/api/club/host/')) return bad(404, 'not found');

  if (path === '/api/club/host/salon' && method === 'GET') return getHostSalon(env);
  if (path === '/api/club/host/salon' && method === 'POST') {
    return saveHostSalon(env, who, await readJson(request));
  }
  if (path === '/api/club/host/salon/publish' && method === 'POST') {
    return publishHostSalon(env, await readJson(request));
  }
  if (path === '/api/club/host/salon/close' && method === 'POST') {
    return closeCompletedSalon(env, await readJson(request));
  }
  if (path === '/api/club/host/salon/delete' && method === 'POST') {
    return deleteHostSalon(env, await readJson(request));
  }
  if (path === '/api/club/host/salon/announce' && method === 'POST') {
    const body = await readJson(request);
    return announceSalon(env, Number(body?.id), ctx);
  }
  if (path === '/api/club/host/in-person' && method === 'GET') return getHostInPersonEvents(env);
  if (path === '/api/club/host/in-person' && method === 'POST') {
    return saveHostInPersonEvent(env, who, await readJson(request));
  }
  const publishInPerson = /^\/api\/club\/host\/in-person\/(\d+)\/publish$/.exec(path);
  if (publishInPerson && method === 'POST') {
    return publishHostInPersonEvent(env, Number(publishInPerson[1]));
  }
  const deleteInPerson = /^\/api\/club\/host\/in-person\/(\d+)$/.exec(path);
  if (deleteInPerson && method === 'DELETE') {
    return deleteHostInPersonEvent(env, Number(deleteInPerson[1]));
  }
  if (path === '/api/club/host/field-notes' && method === 'GET') return getHostFieldNotes(env);
  const inviteFieldNotes = /^\/api\/club\/host\/salons\/(\d+)\/field-note-invitations$/.exec(path);
  if (inviteFieldNotes && method === 'POST') {
    return inviteFieldNoteAttendees(
      env, who, Number(inviteFieldNotes[1]), await readJson(request), ctx,
    );
  }
  const removeFieldNote = /^\/api\/club\/host\/field-notes\/(\d+)$/.exec(path);
  if (removeFieldNote && method === 'DELETE') {
    return hostRemoveFieldNote(env, Number(removeFieldNote[1]));
  }
  if (path === '/api/club/host/testimonials' && method === 'GET') return getHostTestimonials(env);
  const resolveTestimonialPath = /^\/api\/club\/host\/testimonials\/(\d+)\/resolve$/.exec(path);
  if (resolveTestimonialPath && method === 'POST') {
    return resolveTestimonial(
      env, who, Number(resolveTestimonialPath[1]), await readJson(request),
    );
  }
  if (path === '/api/club/host/members' && method === 'GET') return listMembers(env);
  if (path === '/api/club/host/members/invitation-preview' && method === 'POST') {
    return previewMemberInvitation(await readJson(request));
  }
  if (path === '/api/club/host/notion-members' && method === 'GET') {
    return getNotionInvitePreview(env);
  }
  if (path === '/api/club/host/notion-members/invite' && method === 'POST') {
    return inviteNotionMembers(env, await readJson(request));
  }
  if (path === '/api/club/host/members' && method === 'POST') {
    return addMember(env, who, await readJson(request), ctx);
  }
  if (path === '/api/club/host/prospects' && method === 'GET') return listProspects(env);
  const grant = /^\/api\/club\/host\/prospects\/(\d+)\/grant$/.exec(path);
  if (grant && method === 'POST') {
    return grantProspect(env, who, Number(grant[1]), ctx);
  }
  const resendWelcome = /^\/api\/club\/host\/prospects\/(\d+)\/welcome$/.exec(path);
  if (resendWelcome && method === 'POST') {
    return resendProspectWelcome(env, Number(resendWelcome[1]));
  }
  const inviteMember = /^\/api\/club\/host\/members\/(\d+)\/invite$/.exec(path);
  if (inviteMember && method === 'POST') {
    return resendMemberInvitation(env, Number(inviteMember[1]));
  }
  const remove = /^\/api\/club\/host\/members\/(\d+)$/.exec(path);
  if (remove && method === 'DELETE') return disableMember(env, who, Number(remove[1]));

  return bad(404, 'not found');
}

async function requestCode(request, env, ctx, body) {
  // Membership eligibility is returned only inside the existing request
  // throttle. This deliberately supports the public login-to-joining handoff
  // while preventing an address list from being probed without limit.
  const responseChallenge = randomToken(24);
  const email = normalizeEmail(body?.email);
  if (!email) return json({ ok: true, challenge: responseChallenge, eligible: false });

  const timestamp = now();
  const emailHash = await keyedHash(env, 'email-rate', email);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const ipHash = await keyedHash(env, 'ip-rate', ip);

  const allowed = await mayRequest(env, emailHash, ipHash, timestamp);
  if (!allowed) return json({ ok: true, challenge: responseChallenge, limited: true });

  const member = await env.MEMBERS.prepare(
    `SELECT id, email, display_name FROM member
      WHERE email = ?1 AND disabled_at IS NULL AND left_at IS NULL`,
  ).bind(email).first();

  if (!member) {
    await env.MEMBERS.prepare(
      'INSERT INTO auth_request (email_hash, ip_hash, created_at) VALUES (?1, ?2, ?3)',
    ).bind(emailHash, ipHash, timestamp).run();
    ctx.waitUntil(pruneMemberAuth(env, timestamp));
    return json({ ok: true, challenge: responseChallenge, eligible: false });
  }

  const code = randomCode();
  const codeHash = await keyedHash(env, 'login-code', `${responseChallenge}:${code}`);
  await env.MEMBERS.batch([
    env.MEMBERS.prepare(
      `INSERT INTO auth_request (email_hash, ip_hash, created_at) VALUES (?1, ?2, ?3)`,
    ).bind(emailHash, ipHash, timestamp),
    env.MEMBERS.prepare(
      `INSERT INTO auth_challenge
        (id, member_id, code_hash, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(responseChallenge, member.id, codeHash, timestamp, timestamp + CODE_LIFETIME),
  ]);

  ctx.waitUntil(sendClubCode(env, {
    email: member.email,
    name: member.display_name,
    code,
  }));

  // Old codes and request logs contain no useful plaintext; trimming them
  // here prevents unbounded growth without introducing another cron.
  ctx.waitUntil(pruneMemberAuth(env, timestamp));

  return json({ ok: true, challenge: responseChallenge, eligible: true });
}

function pruneMemberAuth(env, timestamp) {
  return env.MEMBERS.batch([
    env.MEMBERS.prepare('DELETE FROM auth_challenge WHERE expires_at < ?1').bind(timestamp - 86400),
    env.MEMBERS.prepare('DELETE FROM auth_request WHERE created_at < ?1').bind(timestamp - 86400),
    env.MEMBERS.prepare('DELETE FROM member_session WHERE expires_at < ?1').bind(timestamp - 86400),
  ]);
}

async function mayRequest(env, emailHash, ipHash, timestamp) {
  const since = timestamp - 3600;
  const [emailCount, ipCount, latest] = await env.MEMBERS.batch([
    env.MEMBERS.prepare(
      'SELECT COUNT(*) AS n FROM auth_request WHERE email_hash = ?1 AND created_at >= ?2',
    ).bind(emailHash, since),
    env.MEMBERS.prepare(
      'SELECT COUNT(*) AS n FROM auth_request WHERE ip_hash = ?1 AND created_at >= ?2',
    ).bind(ipHash, since),
    env.MEMBERS.prepare(
      'SELECT MAX(created_at) AS at FROM auth_request WHERE email_hash = ?1',
    ).bind(emailHash),
  ]);
  const emailN = Number(emailCount.results?.[0]?.n || 0);
  const ipN = Number(ipCount.results?.[0]?.n || 0);
  const lastAt = Number(latest.results?.[0]?.at || 0);
  return emailN < 5 && ipN < 20 && timestamp - lastAt >= 60;
}

async function verifyCode(env, body) {
  const challenge = validChallenge(body?.challenge);
  const code = validCode(body?.code);
  if (!challenge || !code) return bad(401, 'invalid code');

  const row = await env.MEMBERS.prepare(
    `SELECT c.*, m.email, m.display_name, m.website, m.profile_line,
            m.profile_image, m.is_host, m.disabled_at, m.left_at,
            m.agreement_version, m.agreement_accepted_at
       FROM auth_challenge c
       LEFT JOIN member m ON m.id = c.member_id
      WHERE c.id = ?1`,
  ).bind(challenge).first();

  const timestamp = now();
  const suppliedHash = await keyedHash(env, 'login-code', `${challenge}:${code}`);
  const valid = row && row.member_id && row.consumed_at == null && row.attempts < 5
    && row.expires_at >= timestamp && row.disabled_at == null && row.left_at == null
    && sameText(row.code_hash, suppliedHash);

  if (!valid) {
    if (row && row.consumed_at == null && row.attempts < 5) {
      await env.MEMBERS.prepare(
        'UPDATE auth_challenge SET attempts = attempts + 1 WHERE id = ?1',
      ).bind(challenge).run();
    }
    return bad(401, 'invalid code');
  }

  const consumed = await env.MEMBERS.prepare(
    `UPDATE auth_challenge SET consumed_at = ?1
      WHERE id = ?2 AND consumed_at IS NULL AND attempts < 5`,
  ).bind(timestamp, challenge).run();
  if ((consumed.meta?.changes ?? 0) !== 1) return bad(401, 'invalid code');

  const token = randomToken();
  await env.MEMBERS.batch([
    env.MEMBERS.prepare(
      `INSERT INTO member_session
        (member_id, token_hash, created_at, last_seen_at, expires_at)
       VALUES (?1, ?2, ?3, ?3, ?4)`,
    ).bind(row.member_id, await tokenHash(token), timestamp, timestamp + SESSION_LIFETIME),
    env.MEMBERS.prepare(
      `UPDATE member SET joined_at = COALESCE(joined_at, ?1), updated_at = ?1 WHERE id = ?2`,
    ).bind(timestamp, row.member_id),
  ]);

  return json({ token, member: shapeMember(row) });
}

export async function identifyMember(request, env) {
  const token = bearerToken(request);
  if (!token) return null;
  const timestamp = now();
  const row = await env.MEMBERS.prepare(
    `SELECT m.*, s.id AS session_id, s.expires_at AS session_expires_at,
            s.last_seen_at AS session_last_seen_at
       FROM member_session s JOIN member m ON m.id = s.member_id
      WHERE s.token_hash = ?1 AND s.revoked_at IS NULL AND s.expires_at > ?2
        AND m.disabled_at IS NULL AND m.left_at IS NULL`,
  ).bind(await tokenHash(token), timestamp).first();
  if (!row) return null;
  if (timestamp - Number(row.session_last_seen_at || 0) > 3600) {
    await env.MEMBERS.prepare(
      'UPDATE member_session SET last_seen_at = ?1 WHERE id = ?2',
    ).bind(timestamp, row.session_id).run();
  }
  return row;
}

async function listMembers(env) {
  const rows = await env.MEMBERS.prepare(
    `SELECT id, email, display_name, is_host, invited_at, joined_at,
            disabled_at, left_at, invitation_sent_at, invitation_last_error
       FROM member ORDER BY is_host DESC, COALESCE(joined_at, invited_at), email`,
  ).all();
  return json({ members: (rows.results || []).map((member) => ({
    id: member.id,
    email: member.email,
    name: member.display_name,
    isHost: !!member.is_host,
    status: member.disabled_at ? 'removed' : member.left_at ? 'left'
      : member.joined_at ? 'joined' : member.invitation_sent_at ? 'invited' : 'on_list',
    invitationSentAt: member.invitation_sent_at || null,
    invitationError: member.invitation_last_error || null,
    canInvite: !member.is_host && !member.joined_at && !member.disabled_at && !member.left_at,
    canRemove: !member.is_host,
  })) });
}

async function addMember(env, who, body, ctx) {
  const email = normalizeEmail(body?.email);
  if (!email) return bad(400, 'email');
  const name = cleanInvitationName(body?.name);
  if (name === undefined) return bad(400, 'name');
  const invitationNote = cleanInvitationNote(body?.invitationNote);
  if (invitationNote === undefined) return bad(400, 'invitation note');
  const timestamp = now();
  const existing = await env.MEMBERS.prepare(
    `SELECT id, display_name, joined_at, disabled_at, left_at, invitation_sent_at, invitation_note
       FROM member WHERE email = ?1`,
  ).bind(email).first();
  if (existing && !existing.disabled_at && !existing.left_at) {
    if (existing.joined_at) return bad(409, 'already a member');
    if (existing.invitation_sent_at) return bad(409, 'already invited');
    await env.MEMBERS.prepare(
      `UPDATE member SET display_name = COALESCE(?1, display_name), invitation_note = ?2,
         updated_at = ?3 WHERE id = ?4`,
    ).bind(name, invitationNote, timestamp, existing.id).run();
    await queueMemberNotionSync(env, existing.id, ctx, timestamp);
    return deliverMemberInvitation(
      env, existing.id, email, timestamp, null,
      name ?? existing.display_name, invitationNote,
    );
  }
  if (existing) {
    await env.MEMBERS.prepare(
      `UPDATE member SET disabled_at = NULL, left_at = NULL, leave_note_policy = NULL,
              invited_at = ?1, invitation_sent_at = NULL,
              invitation_last_attempt_at = NULL, invitation_last_error = NULL,
              display_name = COALESCE(?2, display_name), invitation_note = ?3, updated_at = ?1
        WHERE id = ?4`,
    ).bind(timestamp, name, invitationNote, existing.id).run();
    await env.MEMBERS.prepare(
      `UPDATE member_email_pref SET salon_announced = 1, salon_month = 0,
         salon_week = 1, salon_day = 1, salon_hour = 0,
         field_notes = 1, quiet = 0, updated_at = ?1
       WHERE member_id = ?2`,
    ).bind(timestamp, existing.id).run();
  } else {
    await env.MEMBERS.prepare(
      `INSERT INTO member
        (email, display_name, is_host, invited_at, invitation_note, created_at, updated_at)
       VALUES (?1, ?2, 0, ?3, ?4, ?3, ?3)`,
    ).bind(email, name, timestamp, invitationNote).run();
  }
  const member = await env.MEMBERS.prepare(
    'SELECT id, email, display_name, invitation_note FROM member WHERE email = ?1',
  ).bind(email).first();
  await queueMemberNotionSync(env, member.id, ctx, timestamp);
  return deliverMemberInvitation(
    env, member.id, member.email, timestamp, who.id,
    member.display_name, member.invitation_note,
  );
}

async function resendMemberInvitation(env, id) {
  if (!Number.isSafeInteger(id) || id <= 0) return bad(404, 'not found');
  const member = await env.MEMBERS.prepare(
    `SELECT id, email, display_name, is_host, joined_at, disabled_at, left_at, invitation_note
       FROM member WHERE id = ?1`,
  ).bind(id).first();
  if (!member || member.is_host || member.joined_at || member.disabled_at || member.left_at) {
    return bad(409, 'invitation unavailable');
  }
  const timestamp = now();
  await env.MEMBERS.prepare(
    `UPDATE member SET invited_at = ?1, invitation_sent_at = NULL,
            invitation_last_attempt_at = NULL, invitation_last_error = NULL,
            updated_at = ?1
      WHERE id = ?2`,
  ).bind(timestamp, id).run();
  return deliverMemberInvitation(
    env, member.id, member.email, timestamp, null,
    member.display_name, member.invitation_note,
  );
}

async function deliverMemberInvitation(
  env, id, email, invitationVersion, hostId = null, name = null, personalNote = null,
) {
  const timestamp = now();
  const delivered = await sendClubInvitation(env, {
    email,
    name,
    personalNote,
    idempotencyKey: `club-member-${id}-${invitationVersion}`,
  });
  await env.MEMBERS.prepare(
    `UPDATE member SET invitation_sent_at = ?1,
            invitation_last_attempt_at = ?2, invitation_last_error = ?3,
            updated_at = ?2 WHERE id = ?4`,
  ).bind(delivered ? timestamp : null, timestamp, delivered ? null : 'delivery failed', id).run();
  if (!delivered) return bad(502, 'member added but invitation email did not send');
  return json({
    member: {
      id, email, status: 'invited', invitationSentAt: timestamp,
      canInvite: true, canRemove: hostId == null || id !== hostId,
    },
  }, 201);
}

function previewMemberInvitation(body) {
  const name = cleanInvitationName(body?.name);
  if (name === undefined) return bad(400, 'name');
  const personalNote = cleanInvitationNote(body?.invitationNote);
  if (personalNote === undefined) return bad(400, 'invitation note');
  return json(clubInvitationEmail({ name, personalNote }));
}

function cleanInvitationName(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const name = value.trim();
  if (!name) return null;
  if (name.length > 120 || /[\u0000-\u001F\u007F]/.test(name)) return undefined;
  return name;
}

function cleanInvitationNote(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const note = value.trim();
  if (!note) return null;
  if (note.length > 1200 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(note)) {
    return undefined;
  }
  return note;
}

async function disableMember(env, who, id) {
  if (!Number.isSafeInteger(id) || id <= 0) return bad(404, 'not found');
  if (id === who.id) return bad(409, 'cannot remove yourself');
  const timestamp = now();
  const result = await env.MEMBERS.prepare(
    `UPDATE member SET disabled_at = ?1, updated_at = ?1
      WHERE id = ?2 AND is_host = 0 AND disabled_at IS NULL`,
  ).bind(timestamp, id).run();
  if ((result.meta?.changes ?? 0) !== 1) return bad(404, 'not found');
  await env.MEMBERS.batch([
    env.MEMBERS.prepare(
      'UPDATE member_session SET revoked_at = ?1 WHERE member_id = ?2 AND revoked_at IS NULL',
    ).bind(timestamp, id),
    env.MEMBERS.prepare('DELETE FROM salon_rsvp WHERE member_id = ?1').bind(id),
    env.MEMBERS.prepare('DELETE FROM salon_attendance WHERE member_id = ?1').bind(id),
  ]);
  return json({ ok: true });
}

function shapeMember(member) {
  return {
    id: member.member_id ?? member.id,
    email: member.email,
    name: member.display_name,
    website: member.website,
    line: member.profile_line,
    hasImage: !!member.profile_image,
    isHost: !!member.is_host,
    agreementAccepted: agreementAccepted(member),
    agreementVersion: MEMBER_AGREEMENT_VERSION,
    onboardingCompleted: Number(member.onboarding_completed_at) > 0,
  };
}

async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return {};
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function now() {
  return Math.floor(Date.now() / 1000);
}
