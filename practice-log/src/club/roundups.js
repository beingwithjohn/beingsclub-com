const MAX_ROUNDUP_NOTES = 3;
const SOURCES = new Set(['member', 'host']);

export function parseRoundupItems(value, optional = false) {
  if (value == null && optional) return { ok: true, items: undefined };
  if (!Array.isArray(value) || value.length > MAX_ROUNDUP_NOTES) {
    return { ok: false, error: 'roundup notes' };
  }
  const seen = new Set();
  const items = [];
  for (const item of value) {
    const source = String(item?.source || '');
    const id = Number(item?.id);
    const key = `${source}:${id}`;
    if (!SOURCES.has(source) || !Number.isSafeInteger(id) || id <= 0 || seen.has(key)) {
      return { ok: false, error: 'roundup notes' };
    }
    seen.add(key); items.push({ source, id });
  }
  return { ok: true, items };
}

export function storedRoundupItems(value) {
  if (!value) return [];
  try {
    const parsed = parseRoundupItems(JSON.parse(value));
    return parsed.ok ? parsed.items : [];
  } catch (_) { return []; }
}

export async function validateRoundupItems(env, items, targetStartsAt) {
  if (items === undefined || items.length === 0) return true;
  if (!Number(targetStartsAt)) return false;
  const checks = await Promise.all(items.map((item) => {
    const sql = item.source === 'member'
      ? `SELECT n.id FROM field_note n JOIN salon source_salon ON source_salon.id = n.salon_id
          WHERE n.id = ?1 AND source_salon.starts_at < ?2`
      : `SELECT p.id FROM host_field_post p JOIN salon source_salon ON source_salon.id = p.salon_id
          WHERE p.id = ?1 AND p.kind = 'field_note' AND source_salon.starts_at < ?2`;
    return env.MEMBERS.prepare(sql).bind(item.id, targetStartsAt).first();
  }));
  return checks.every(Boolean);
}

export async function readRoundupNotes(env, value) {
  const items = storedRoundupItems(value);
  const notes = [];
  for (const item of items) {
    const row = item.source === 'member'
      ? await env.MEMBERS.prepare(
        `SELECT n.body, n.link_url, n.image_alt, n.image_key, n.is_anonymous,
                m.display_name, s.starts_at AS salon_starts_at
           FROM field_note n JOIN member m ON m.id = n.member_id
           JOIN salon s ON s.id = n.salon_id WHERE n.id = ?1`,
      ).bind(item.id).first()
      : await env.MEMBERS.prepare(
        `SELECT p.title, p.body, p.link_url, p.image_alt, p.image_key,
                m.display_name, s.starts_at AS salon_starts_at
           FROM host_field_post p JOIN member m ON m.id = p.author_member_id
           JOIN salon s ON s.id = p.salon_id
          WHERE p.id = ?1 AND p.kind = 'field_note'`,
      ).bind(item.id).first();
    if (!row) continue;
    notes.push({
      title: row.title || null,
      body: row.body || null,
      linkUrl: row.link_url || null,
      imageAlt: row.image_alt || null,
      hasImage: !!row.image_key,
      author: item.source === 'member' && row.is_anonymous
        ? 'shared anonymously' : (row.display_name || (item.source === 'host' ? 'John' : 'A being')),
      salonStartsAt: row.salon_starts_at,
    });
  }
  return notes;
}

export { MAX_ROUNDUP_NOTES };
