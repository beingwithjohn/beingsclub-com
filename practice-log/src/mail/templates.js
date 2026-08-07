// The seven emails.
//
// 600px, one column, a plain-text fallback for every one, and no image
// dependency — the op-art marks are decorative and must degrade to nothing.
//
// Every one carries the same one-tap link, and none carries cohort news, counts
// or any reference to days that were not marked. An invitation, never a
// check-up.
//
// Palette and type follow beingsclub.com rather than the log's own earlier
// bundle, so an email reads as the same house as the site it links to.
// Webfonts are unreliable in mail clients, so Host Grotesk is asked for and a
// system stack catches it.

const T = {
  paper: '#FDFCF9',
  stone: '#F0EEE8',
  warm: '#F8F6F1',
  lilac: '#F2ECFF',
  ink: '#171916',
  body: '#43403A',
  muted: '#75726A',
  violet: '#5A4B7C',
  hair: 'rgba(38,34,26,0.10)',
};

const FONT = "'Host Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

// John's wording for the button in every outgoing email.
export const CTA = 'Log Your Practice';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

// ---------------------------------------------------------------------------
// pieces
// ---------------------------------------------------------------------------

function layout({ preheader, blocks, footer, dark = false }) {
  const ground = dark ? T.ink : T.stone;
  const sheet = dark ? T.ink : T.paper;
  const border = dark ? 'rgba(255,255,255,0.16)' : T.hair;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Beings Club</title>
</head>
<body style="margin:0;padding:0;background:${ground};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${ground};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
  style="width:600px;max-width:100%;background:${sheet};border-left:1px solid ${border};border-right:1px solid ${border};">
${blocks}
<tr><td style="padding:18px 40px;border-top:1px solid ${border};background:${dark ? T.ink : T.warm};
  font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;
  color:${dark ? 'rgba(255,255,255,0.5)' : T.muted};">${footer}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const eyebrow = (text, colour = T.muted) => `
<tr><td style="padding:34px 40px 0;font-family:${FONT};font-size:11px;font-weight:600;
  letter-spacing:0.18em;text-transform:uppercase;color:${colour};">${esc(text)}</td></tr>`;

const heading = (text, dark = false) => `
<tr><td style="padding:14px 40px 0;font-family:${FONT};font-size:28px;font-weight:600;
  line-height:1.15;letter-spacing:-0.028em;color:${dark ? T.paper : T.ink};">${text}</td></tr>`;

const para = (html, dark = false) => `
<tr><td style="padding:18px 40px 0;font-family:${FONT};font-size:17px;font-weight:400;
  line-height:1.8;color:${dark ? 'rgba(255,255,255,0.72)' : T.body};">${html}</td></tr>`;

// The button is a link, and following it must never write anything. It opens
// the log with the square primed; the mark is a tap on the page.
const button = (url, label, dark = false) => `
<tr><td style="padding:28px 40px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="background:${dark ? T.paper : T.ink};">
    <a href="${esc(url)}" style="display:block;padding:15px 28px;font-family:${FONT};font-size:12px;
      font-weight:700;letter-spacing:0.16em;text-transform:uppercase;
      color:${dark ? T.ink : T.paper};text-decoration:none;">${esc(label)}</a>
  </td></tr></table>
</td></tr>`;

const band = (html) => `
<tr><td style="padding:26px 40px;margin-top:32px;background:${T.lilac};border-top:1px solid ${T.hair};
  border-bottom:1px solid ${T.hair};font-family:${FONT};font-size:20px;font-weight:600;
  line-height:1.25;letter-spacing:-0.025em;color:${T.ink};">${html}</td></tr>`;

const small = (html, dark = false) => `
<tr><td style="padding:20px 40px 0;font-family:${FONT};font-size:15px;line-height:1.6;
  color:${dark ? 'rgba(255,255,255,0.5)' : T.muted};">${html}</td></tr>`;

const gap = (h = 34) => `<tr><td style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</td></tr>`;

const steps = (items) => items.map((s, i) => `
<tr><td style="padding:${i === 0 ? '22' : '14'}px 40px 0;font-family:${FONT};font-size:16px;
  line-height:1.7;color:${T.body};">
  <span style="color:${T.violet};font-weight:700;font-size:12px;">${i + 1}</span>
  &nbsp;&nbsp;${s}</td></tr>`).join('');

const link = (url, text) =>
  `<a href="${esc(url)}" style="color:${T.violet};text-decoration:underline;">${esc(text)}</a>`;

const FOOT_CLUB = 'Beings Club · reply to this and John reads it';
const FOOT_LINK = 'Beings Club · your log stays at this link';

const settings = (url) =>
  `${link(url, 'Change the time')} &nbsp;·&nbsp; ${link(url, 'stop these')}`;

// The house wording. The standard first, the flexibility second — never the
// flexibility alone, or the standard quietly disappears.
const STANDARD = 'Twenty minutes is standard, and sitting daily matters far more than sitting long. '
  + 'Five minutes on a hard day is a real practice, not a failed one.';

// ---------------------------------------------------------------------------
// E1 · you're in
// ---------------------------------------------------------------------------
// E0 · the invitation — sent after a yes, before there is anyone to be.
// What a Sit is, said plainly, and one link. Following the link takes no
// place: it opens the threshold, and a tap there does the taking.
export function invitation({ person, run, url }) {
  const when = run.starts_on
    ? `${words(run.length_days)} days from ${longDate(run.starts_on)}`
    : 'for as long as you want it';

  const sit = 'A Sit runs as a shared experiment over a set stretch of days. We each sit in our '
    + 'own lives, knowing that others are sitting the same days'
    + (run.meets ? `, and meet live once a week — ${run.meets}.` : '.');

  const lineage = 'John hosts and teaches. The practices are rooted in contemplative traditions '
    + 'and he won’t pretend otherwise — but this is a lineage of feeling, not a body of doctrine. '
    + 'Nothing is asked of you as belief.';

  const blocks = [
    eyebrow('A place is yours if you want it'),
    heading(`${esc(first(person.name))} — there’s a place for you.`),
    para(`<strong>${esc(run.name)}</strong> runs ${esc(when)}.`),
    para(esc(sit)),
    para(esc(lineage)),
    band('Take your place, and you’ll see who else is here.'),
    button(url, 'Take my place'),
    small('One link, no password. Nothing is charged to be here — there’s a way to contribute '
      + 'if and when you want to, and skipping it changes nothing at all.'),
    gap(),
  ].join('');

  return {
    subject: `A place for you on ${run.name}`,
    html: layout({ preheader: 'A place is yours if you want it.', blocks, footer: FOOT_CLUB }),
    text: [
      `${first(person.name)} — there’s a place for you.`, '',
      `${run.name} runs ${when}.`, '', sit, '', lineage, '',
      `Take my place: ${url}`, '',
      'One link, no password. Nothing is charged to be here.',
    ].join('\n'),
  };
}

export function welcome({ person, run, url, mapUrl }) {
  const fixed = run.mode === 'fixed';
  const opening = fixed
    ? `${esc(run.name)} runs for ${words(run.length_days)} days, from ${longDate(run.starts_on)}. `
      + `Ten of us, practising daily.`
    : `${esc(run.name)} has no start date and no end. People join on the day they arrive, `
      + `practise as they can, and see the others who did.`;

  const blocks = [
    eyebrow(fixed ? "You're in" : 'Welcome'),
    heading(`${esc(first(person.name))} — you have a place.`),
    para(opening),
    steps([
      mapUrl ? `Read ${link(mapUrl, 'the practice map')} before you begin. Ten minutes.` : 'Find ten quiet minutes to read before you begin.',
      'Pick your hour. One email a day, at that hour.',
      'Find a place to sit and a time you can keep.',
    ]),
    button(url, 'Set up my log'),
    small('One link, no password. It’s yours and it doesn’t expire.'),
    gap(),
  ].join('');

  return {
    subject: fixed ? `You’re in. We start ${weekdayName(run.starts_on)}.` : 'You’re in.',
    html: layout({ preheader: 'Your place is held. Set up your log.', blocks, footer: FOOT_CLUB }),
    text: [
      `${first(person.name)} — you have a place.`, '',
      strip(opening), '',
      '1. Read the practice map before you begin. Ten minutes.',
      '2. Pick your hour. One email a day, at that hour.',
      '3. Find a place to sit and a time you can keep.', '',
      `Set up my log: ${url}`, '',
      'One link, no password. It’s yours and it doesn’t expire.', '',
      'Beings Club · reply to this and John reads it',
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// E2 · day one
// ---------------------------------------------------------------------------
export function dayOne({ person, run, url, principle }) {
  const blocks = [
    eyebrow(run.mode === 'fixed' ? 'Day 1 · today we start' : 'Day 1'),
    heading(`It begins today, ${esc(first(person.name))}.`),
    principle ? para(`This week we’re with <em style="color:${T.violet};">${esc(principle.toLowerCase())}</em> — sitting without needing anything to happen.`) : '',
    para(`${STANDARD} Whenever you practise today, come and say so.`),
    button(url, CTA),
    gap(),
  ].join('');

  return {
    subject: 'Day 1 · today we start',
    html: layout({ preheader: 'It begins today.', blocks, footer: settings(url) }),
    text: [
      `It begins today, ${first(person.name)}.`, '',
      principle ? `This week we’re with ${principle.toLowerCase()} — sitting without needing anything to happen.\n` : '',
      STANDARD, '',
      'Whenever you practise today, come and say so.', '',
      `${CTA}: ${url}`,
    ].filter(Boolean).join('\n'),
  };
}

// ---------------------------------------------------------------------------
// E3 · the daily email
// ---------------------------------------------------------------------------
// No group news, no counts, no "you haven't logged". One line rotates with the
// week's principle where a run has them; the rest is fixed.
export function daily({ person, run, url, dayNumber, principle }) {
  const label = run.mode === 'fixed'
    ? `Day ${dayNumber} · a quiet minute counts`
    : `A quiet minute counts`;

  const blocks = [
    eyebrow(label),
    heading(`Good morning, ${esc(first(person.name))}.`),
    principle ? para(`This week we’re with <em style="color:${T.violet};">${esc(principle.toLowerCase())}</em>.`) : '',
    para('Whenever you practise today, long or short, come and say so.'),
    button(url, CTA),
    small('Haven’t yet? This will keep until you have.'),
    gap(),
  ].join('');

  return {
    subject: label,
    html: layout({ preheader: 'Whenever you practise today, come and say so.', blocks, footer: settings(url) }),
    text: [
      `Good morning, ${first(person.name)}.`, '',
      principle ? `This week we’re with ${principle.toLowerCase()}.\n` : '',
      'Whenever you practise today, long or short, come and say so.', '',
      `${CTA}: ${url}`, '',
      'Haven’t yet? This will keep until you have.',
    ].filter(Boolean).join('\n'),
  };
}

// ---------------------------------------------------------------------------
// E4 · the week turns — the only long one, and it comes from John's name
// ---------------------------------------------------------------------------
export function weekLetter({ person, run, url, weekNumber, principle, bodyHtml, listenUrl, mapUrl }) {
  const blocks = [
    eyebrow('From John', T.violet),
    heading(esc(principle || `Week ${words(weekNumber)}`)),
    para(bodyHtml || ''),
    listenUrl ? button(listenUrl, 'Listen · 6 min') : '',
    mapUrl ? small(`${link(mapUrl, 'Open the practice map')}`) : '',
    band('Nothing about the practice changes — same sit, same tap.'),
    button(url, CTA),
    gap(),
  ].join('');

  return {
    subject: `Week ${words(weekNumber)}${principle ? ` · ${principle.toLowerCase()}` : ''}`,
    html: layout({ preheader: 'The week turns.', blocks, footer: 'Reply and John reads it' }),
    text: [
      principle || `Week ${words(weekNumber)}`, '',
      strip(bodyHtml || ''), '',
      listenUrl ? `Listen: ${listenUrl}\n` : '',
      'Nothing about the practice changes — same sit, same tap.', '',
      `${CTA}: ${url}`,
    ].filter(Boolean).join('\n'),
  };
}

// ---------------------------------------------------------------------------
// E5 · John answered you — the one dark email
// ---------------------------------------------------------------------------
export function answered({ person, url, question, askedOn, answerText, audioUrl }) {
  const blocks = [
    eyebrow(`You asked on ${weekdayName(askedOn)}`, 'rgba(255,255,255,0.5)'),
    heading('An answer, just for you.', true),
    // Their own words back. A nested table, because a border-left on the outer
    // cell would run down the edge of the sheet rather than beside the quote.
    `<tr><td style="padding:22px 40px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:2px;background:${T.violet};font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding-left:18px;font-family:${FONT};font-size:17px;line-height:1.7;
          font-style:italic;color:rgba(255,255,255,0.72);">“${esc(question)}”</td>
      </tr></table>
    </td></tr>`,
    answerText ? para(`“${esc(answerText)}”`, true) : '',
    audioUrl ? button(audioUrl, 'Listen · then log today', true) : button(url, CTA, true),
    small('Nobody else received this. Ask him something else any time.', true),
    gap(),
  ].join('');

  return {
    subject: 'An answer, just for you',
    html: layout({ preheader: 'John answered you.', blocks, footer: 'Just to you', dark: true }),
    text: [
      `You asked on ${weekdayName(askedOn)}:`, `“${question}”`, '',
      answerText ? `“${answerText}”\n` : '',
      audioUrl ? `Listen: ${audioUrl}` : `${CTA}: ${url}`, '',
      'Nobody else received this. Ask him something else any time.',
    ].filter(Boolean).join('\n'),
  };
}

// ---------------------------------------------------------------------------
// E6 · still here — once per run, never twice, never names the number of days
// ---------------------------------------------------------------------------
export function stillHere({ person, url, stopUrl }) {
  const blocks = [
    eyebrow('Still here whenever you are'),
    heading(`${esc(first(person.name))} — no news needed.`),
    para('Life takes the days it takes. I’m not counting them and neither is the log.'),
    para('The room is the same as you left it. There’s today, and today is enough to come back on.'),
    button(url, 'Practise with us today'),
    small(`If you’d rather stop, that’s a fine answer too — ${link(stopUrl || url, 'tell me here')} and the emails end.`),
    gap(),
  ].join('');

  return {
    subject: 'Still here whenever you are',
    html: layout({ preheader: 'No news needed.', blocks, footer: 'Sent once · never twice' }),
    text: [
      `${first(person.name)} — no news needed.`, '',
      'Life takes the days it takes. I’m not counting them and neither is the log.', '',
      'The room is the same as you left it. There’s today, and today is enough to come back on.', '',
      `Practise with us today: ${url}`, '',
      'If you’d rather stop, that’s a fine answer too — reply and the emails end.',
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// E7 · the last day
// ---------------------------------------------------------------------------
// The single place a total appears, and it names the unmarked days in the same
// breath so it reads as a record rather than a score.
export function lastDay({ person, run, url, marked }) {
  const total = run.length_days;
  const unmarked = total - marked;
  const blocks = [
    eyebrow(`Day ${total} · the last one together`),
    heading(`Last day, ${esc(first(person.name))}.`),
    para(`Practise today as you have. Then the log stays open, unchanging, for as long as you want it: `
      + `your ${words(total)} days, and the people who were in them.`),
    band(`Your run<br><span style="font-size:17px;font-weight:400;line-height:1.7;color:${T.body};">`
      + `${cap(words(marked))} days marked. ${cap(words(unmarked))} not. Both true.</span>`),
    button(url, CTA),
    gap(),
  ].join('');

  return {
    subject: `Day ${total} · the last one together`,
    html: layout({ preheader: 'The last day.', blocks, footer: FOOT_LINK }),
    text: [
      `Last day, ${first(person.name)}.`, '',
      `Practise today as you have. Then the log stays open, unchanging, for as long as you want it.`, '',
      `Your run: ${cap(words(marked))} days marked. ${cap(words(unmarked))} not. Both true.`, '',
      `${CTA}: ${url}`,
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// a new link, after revoking from Settings
// ---------------------------------------------------------------------------
export function newLink({ person, url }) {
  const blocks = [
    eyebrow('Your new link'),
    heading('Here’s the way back in.'),
    para('The old link has stopped working. This one is yours now.'),
    button(url, 'Open my log'),
    small('If you didn’t ask for this, the old link is already dead and nothing else has changed.'),
    gap(),
  ].join('');

  return {
    subject: 'Your new link',
    html: layout({ preheader: 'Here’s the way back in.', blocks, footer: FOOT_LINK }),
    text: ['Here’s the way back in.', '', 'The old link has stopped working. This one is yours now.', '', url].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// words
// ---------------------------------------------------------------------------
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five',
  'twenty-six', 'twenty-seven', 'twenty-eight', 'twenty-nine', 'thirty', 'thirty-one',
  'thirty-two', 'thirty-three', 'thirty-four', 'thirty-five'];

export const words = (n) => WORDS[n] ?? String(n);
export const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'friend';
const strip = (html) => String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function longDate(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function weekdayName(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
}
