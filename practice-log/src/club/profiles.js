import { bad, json } from '../api.js';
import { parseImageData } from './field-notes.js';

const NAME_MAX = 60;
const LINE_MAX = 180;
const URL_MAX = 2000;

export async function getDirectory(env, who) {
  const rows = await env.MEMBERS.prepare(
    `SELECT id, display_name, website, profile_line, profile_image
       FROM member
      WHERE joined_at IS NOT NULL AND disabled_at IS NULL AND left_at IS NULL
        AND display_name IS NOT NULL AND TRIM(display_name) <> ''
      ORDER BY display_name COLLATE NOCASE, id`,
  ).all();
  return json({
    profile: shapeProfile(who),
    members: (rows.results || []).map((row) => shapeDirectoryMember(row, memberId(who))),
  });
}

export async function updateProfile(env, who, body, timestamp = now()) {
  const parsed = parseProfile(body);
  if (!parsed.ok) return bad(400, parsed.error);

  const id = memberId(who);
  const existing = await env.MEMBERS.prepare(
    'SELECT profile_image FROM member WHERE id = ?1',
  ).bind(id).first();
  if (!existing) return bad(404, 'not found');

  const image = parsed.image ? await storeProfileImage(env, id, parsed.image) : null;
  if (parsed.image && !image) return bad(503, 'image unavailable');
  const imageKey = image?.key || (body?.removeImage === true ? null : existing.profile_image);
  try {
    await env.MEMBERS.prepare(
      `UPDATE member SET display_name = ?1, profile_line = ?2, website = ?3,
         profile_image = ?4, updated_at = ?5
       WHERE id = ?6 AND disabled_at IS NULL AND left_at IS NULL`,
    ).bind(parsed.name, parsed.line, parsed.website, imageKey, timestamp, id).run();
  } catch (error) {
    if (image && env.MEMBER_MEDIA) await env.MEMBER_MEDIA.delete(image.key);
    throw error;
  }
  if ((image || body?.removeImage === true) && isProfileKey(existing.profile_image) && env.MEMBER_MEDIA) {
    await env.MEMBER_MEDIA.delete(existing.profile_image);
  }
  const refreshed = await env.MEMBERS.prepare('SELECT * FROM member WHERE id = ?1').bind(id).first();
  return getDirectory(env, refreshed);
}

export async function getProfileImage(env, memberIdValue) {
  if (!env.MEMBER_MEDIA) return bad(503, 'image unavailable');
  const row = await env.MEMBERS.prepare(
    `SELECT profile_image FROM member
      WHERE id = ?1 AND joined_at IS NOT NULL AND disabled_at IS NULL
        AND left_at IS NULL AND profile_image IS NOT NULL`,
  ).bind(memberIdValue).first();
  if (!row || !isProfileKey(row.profile_image)) return bad(404, 'not found');
  const object = await env.MEMBER_MEDIA.get(row.profile_image);
  if (!object) return bad(404, 'not found');
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || 'image/jpeg',
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function parseProfile(value) {
  const name = String(value?.name ?? '').trim();
  const line = String(value?.line ?? '').trim();
  if (!name || name.length > NAME_MAX) return { ok: false, error: 'name' };
  if (line.length > LINE_MAX) return { ok: false, error: 'line' };
  const website = cleanUrl(value?.website);
  if (value?.website && !website) return { ok: false, error: 'website' };
  const image = parseImageData(value?.imageData);
  if (value?.imageData && (!image || image.type === 'image/gif')) {
    return { ok: false, error: 'image' };
  }
  return { ok: true, name, line: line || null, website, image };
}

function shapeProfile(member) {
  return {
    id: memberId(member),
    email: member.email,
    name: member.display_name || '',
    line: member.profile_line || '',
    website: member.website || '',
    hasImage: !!member.profile_image,
  };
}

function shapeDirectoryMember(row, viewerId) {
  return {
    id: row.id,
    name: row.display_name,
    line: row.profile_line,
    website: row.website,
    hasImage: !!row.profile_image,
    isMe: Number(row.id) === Number(viewerId),
  };
}

async function storeProfileImage(env, memberIdValue, image) {
  if (!image || !env.MEMBER_MEDIA) return null;
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[image.type];
  if (!extension) return null;
  const key = `profiles/${memberIdValue}/${crypto.randomUUID()}.${extension}`;
  await env.MEMBER_MEDIA.put(key, image.bytes, { httpMetadata: { contentType: image.type } });
  return { key };
}

function cleanUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > URL_MAX) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function isProfileKey(value) {
  return typeof value === 'string' && /^profiles\/\d+\/[A-Za-z0-9-]+\.(?:jpg|png|webp)$/.test(value);
}

function memberId(who) {
  return Number(who.member_id ?? who.id);
}

function now() {
  return Math.floor(Date.now() / 1000);
}
