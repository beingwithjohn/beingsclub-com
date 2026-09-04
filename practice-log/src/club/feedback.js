import { bad, json } from '../api.js';
import { sendClubMemberFeedback } from '../mail/send.js';

const PAGE_LABELS = {
  salon: 'the next Salon page',
  'field-notes': 'the Field Notes page',
  members: 'the members page',
  'in-person': 'the in-person page',
  giving: 'the giving page',
  public: 'the public events page',
};

export function parseMemberFeedback(body) {
  const message = String(body?.message || '').trim();
  const page = String(body?.page || '').trim();
  if (!message) return { error: 'Write something first.' };
  if (message.length > 1000) return { error: 'Keep feedback to 1,000 characters or fewer.' };
  if (!PAGE_LABELS[page]) return { error: 'page' };
  return { ok: true, message, page, pageLabel: PAGE_LABELS[page] };
}

export async function sendMemberFeedback(env, member, body) {
  const parsed = parseMemberFeedback(body);
  if (!parsed.ok) return bad(400, parsed.error);
  const sent = await sendClubMemberFeedback(env, {
    email: member.email,
    name: member.display_name,
    pageLabel: parsed.pageLabel,
    message: parsed.message,
  });
  if (!sent) return bad(502, 'Feedback could not be sent. Try again.');
  return json({ ok: true });
}
