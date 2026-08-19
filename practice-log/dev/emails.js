// Render every email shape to files, so they can be looked at before anyone
// receives one.
//
//   node practice-log/dev/emails.js [outdir]
//
// Writes <kind>.html and <kind>.txt, plus an index. Nothing is sent.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as T from '../src/mail/templates.js';

const out = process.argv[2] || join(process.cwd(), 'email-preview');
mkdirSync(out, { recursive: true });

const person = { name: 'Sam Okafor', email: 'sam@example.com' };
const url = 'https://beingsclub.com/log/?t=EXAMPLE';
const fixed = { name: 'Beyond Belief', mode: 'fixed', starts_on: '2026-09-16', length_days: 35 };
const evergreen = { name: 'The Practice Log', mode: 'evergreen' };

const set = [
  ['E1-welcome-fixed', T.welcome({ person, run: fixed, url, mapUrl: 'https://beingsclub.com/practice-map/' })],
  ['E1-welcome-evergreen', T.welcome({ person, run: evergreen, url })],
  ['E2-day-one', T.dayOne({ person, run: fixed, url, principle: 'Curiosity' })],
  ['E3-daily-fixed', T.daily({ person, run: fixed, url, dayNumber: 18, principle: 'Responsibility' })],
  ['E3-daily-evergreen', T.daily({ person, run: evergreen, url, dayNumber: 112 })],
  ['E4-week-letter', T.weekLetter({
    person, run: fixed, url, weekNumber: 3, principle: 'Responsibility',
    bodyHtml: 'Two weeks in, something usually shifts: sitting stops being an event and '
      + 'starts being a thing you do. This week we look at what you are actually responsible '
      + 'for — not your thoughts arriving, but what you do next.',
    listenUrl: 'https://example.com/week-three.mp3',
    mapUrl: 'https://beingsclub.com/practice-map/',
  })],
  ['E5-answered', T.answered({
    person, url, visibility: 'shared', hasAudio: true,
  })],
  ['E6-still-here', T.stillHere({ person, url })],
  ['E7-last-day', T.lastDay({ person, run: fixed, url, marked: 28 })],
  ['new-link', T.newLink({ person, url })],
];

const rows = [];
for (const [name, mail] of set) {
  writeFileSync(join(out, `${name}.html`), mail.html);
  writeFileSync(join(out, `${name}.txt`), mail.text);
  rows.push(`<tr><td style="padding:8px 16px;border-bottom:1px solid #ddd;">` +
    `<a href="./${name}.html">${name}</a></td>` +
    `<td style="padding:8px 16px;border-bottom:1px solid #ddd;color:#75726A;">${mail.subject}</td>` +
    `<td style="padding:8px 16px;border-bottom:1px solid #ddd;"><a href="./${name}.txt">text</a></td></tr>`);
}

writeFileSync(join(out, 'index.html'),
  `<meta charset="utf-8"><title>Emails</title>
   <body style="font:15px/1.6 -apple-system,sans-serif;background:#F0EEE8;margin:0;padding:40px;">
   <h1 style="font-weight:600;letter-spacing:-.02em;">Practice Log emails</h1>
   <p style="color:#75726A;">Rendered from src/mail/templates.js. Nothing here was sent.</p>
   <table style="background:#FDFCF9;border-collapse:collapse;width:100%;max-width:64rem;">${rows.join('')}</table>`);

console.log(`${set.length} emails → ${out}`);
