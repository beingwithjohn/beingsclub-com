// Render every current Beings Club email through the real sending functions.
// A local fetch stub captures the Resend payloads, so nothing is sent.
//
//   node practice-log/dev/club-emails.js [outdir]

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  sendClubCode,
  sendProspectCode,
  sendProspectTimeNote,
  sendWaitlistConfirmation,
  sendWaitlistOffer,
  sendClubInvitation,
  sendClubWelcome,
  sendMemberJoinedNotification,
  sendClubMemberFeedback,
  sendClubMemberMessageNotification,
  sendClubMessageReplyNotification,
  sendFieldNoteInvitation,
  sendClubSalonEmail,
  sendClubSalonRsvpEmail,
} from '../src/mail/send.js';

const out = process.argv[2] || join(process.cwd(), 'club-email-preview');
mkdirSync(out, { recursive: true });

const captured = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options = {}) => {
  captured.push(JSON.parse(options.body));
  return { ok: true, status: 200, text: async () => '' };
};

const env = {
  RESEND_API_KEY: 'preview-only',
  MAIL_FROM: 'Beings Club <hello@beingsclub.com>',
  MAIL_FROM_HOST: 'Beings Club <hello@beingsclub.com>',
  MAIL_REPLY_TO: 'john@spacetobe.xyz',
  HOST_NOTIFY_EMAIL: 'john@spacetobe.xyz',
};
const member = { email: 'sam@example.com', name: 'Sam' };
const actionUrl = 'https://beingsclub.com/members/?entrance=PRIVATE-PREVIEW';
const salonStartsAt = Math.floor(Date.parse('2026-09-30T18:00:00Z') / 1000);
const hostNote = 'This is our first Salon back since April. Looking forward to being with you all.';

const previews = [];
async function capture(name, audience, render) {
  const before = captured.length;
  await render();
  const mail = captured[before];
  if (!mail) throw new Error(`No email was rendered for ${name}`);
  previews.push({ name, audience, ...mail });
}

await capture('member-code', 'member', () => sendClubCode(env, { ...member, code: '384 216' }));
await capture('conversation-code', 'prospective member', () => sendProspectCode(env, { ...member, code: '619 042' }));
await capture('another-conversation-time', 'host', () => sendProspectTimeNote(env, {
  email: member.email,
  note: 'Evenings after 6 PM would work best for me.',
  idempotencyKey: 'preview-time-note',
}));
await capture('waiting-list-confirmation', 'prospective member', () => sendWaitlistConfirmation(env, {
  ...member, idempotencyKey: 'preview-waitlist',
}));
await capture('waiting-list-opening', 'prospective member', () => sendWaitlistOffer(env, {
  ...member, actionUrl, idempotencyKey: 'preview-waitlist-offer',
}));
await capture('personal-invitation', 'invited member', () => sendClubInvitation(env, {
  ...member,
  personalNote: 'I have loved our conversations and think you might like the people gathering here.',
  actionUrl,
  idempotencyKey: 'preview-invitation',
}));
await capture('welcome', 'new member', () => sendClubWelcome(env, {
  ...member, actionUrl, idempotencyKey: 'preview-welcome',
}));
await capture('member-joined', 'host', () => sendMemberJoinedNotification(env, {
  ...member, completedAt: salonStartsAt - 86400, idempotencyKey: 'preview-member-joined',
}));
await capture('member-feedback', 'host', () => sendClubMemberFeedback(env, {
  ...member,
  pageLabel: 'Field Notes',
  message: 'The new field report feels much easier to find and read.',
}));
await capture('member-message', 'host', () => sendClubMemberMessageNotification(env, {
  ...member,
  message: 'Could we talk about something that came up after the Salon?',
  idempotencyKey: 'preview-member-message',
}));
await capture('message-from-john', 'member', () => sendClubMessageReplyNotification(env, {
  ...member,
  actionUrl,
  idempotencyKey: 'preview-message-from-john',
}));
await capture('field-note-invitation', 'attendee', () => sendFieldNoteInvitation(env, {
  ...member, salonStartsAt, actionUrl,
}));

const roundupNotes = [
  { author: 'Maya', body: 'I left wondering whether attention is less like a spotlight and more like weather.' },
  { author: 'Theo', body: 'The quiet after the rooms closed felt like part of the conversation.' },
  { author: 'Sam', body: 'A small question stayed with me: what becomes possible when nobody needs to arrive with an answer?' },
];
for (const kind of ['announcement', 'month', 'week', 'day', 'hour']) {
  await capture(`salon-${kind}`, 'members', () => sendClubSalonEmail(env, {
    ...member,
    salonStartsAt,
    hostNote,
    kind,
    actionUrl,
    fieldNotesUrl: `${actionUrl}#field-notes`,
    roundupNotes,
  }));
}
await capture('salon-rsvp-confirmation', 'confirmed attendee', () => sendClubSalonRsvpEmail(env, {
  ...member,
  salonId: 26,
  salonStartsAt,
  durationMinutes: 90,
  hostNote,
  zoomUrl: 'https://zoom.us/j/1234567890',
  actionUrl,
  idempotencyKey: 'preview-rsvp',
}));

globalThis.fetch = originalFetch;

const rows = previews.map((mail, index) => {
  const filename = `${String(index + 1).padStart(2, '0')}-${mail.name}`;
  writeFileSync(join(out, `${filename}.html`), mail.html);
  writeFileSync(join(out, `${filename}.txt`), mail.text);
  return `<article class="preview-card">
    <header><div><span>${escapeHtml(mail.audience)}</span><h2>${escapeHtml(mail.subject)}</h2></div><a href="./${filename}.html" target="_blank">open alone</a></header>
    <iframe src="./${filename}.html" title="${escapeHtml(mail.subject)}"></iframe>
  </article>`;
}).join('');

writeFileSync(join(out, 'index.html'), `<!doctype html><html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Beings Club email previews</title>
  <style>
    :root{color-scheme:light;--ink:#171916;--violet:#5A4B7C;--soft:#75726A;--paper:#F7F5EF;--line:#DCD7CB}
    *{box-sizing:border-box}body{margin:0;padding:clamp(24px,5vw,64px);background:var(--paper);color:var(--ink);font:15px/1.5 Helvetica,Arial,sans-serif}
    main{width:min(1500px,100%);margin:auto;display:grid;gap:32px}h1{margin:0;font-size:clamp(36px,5vw,64px);letter-spacing:-.05em}p{margin:8px 0 16px;color:var(--soft)}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,620px),1fr));gap:28px}.preview-card{overflow:hidden;border:1px solid var(--line);border-radius:20px;background:#FDFCF9;box-shadow:0 18px 54px rgba(45,38,29,.06)}
    header{display:flex;align-items:end;justify-content:space-between;gap:20px;padding:18px 20px;border-bottom:1px solid var(--line)}header div{display:grid;gap:4px}header span{font-size:10px;font-weight:bold;letter-spacing:.18em;text-transform:uppercase;color:var(--violet)}h2{margin:0;font-size:18px;line-height:1.25}a{flex:none;color:var(--violet);font-size:11px}iframe{display:block;width:100%;height:820px;border:0;background:var(--paper)}
    @media(max-width:680px){body{padding:14px}.grid{gap:18px}header{align-items:start;flex-direction:column}iframe{height:760px}}
  </style></head><body><main><div><h1>Beings Club emails.</h1><p>${previews.length} current email shapes, rendered locally from production templates. Nothing was sent.</p></div><section class="grid">${rows}</section></main></body></html>`);

console.log(`${previews.length} Beings Club emails -> ${out}`);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
