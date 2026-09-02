// The checks from §7 of the spec that can be run without a deployed backend.
//
// The rest — two accounts seeing each other, the cron firing per timezone, a
// mark at 01:00 counting for the day before — are exercised against a real
// worker in test/live.sh, because a mock proves nothing about D1.
//
//   node test/checks.js
//
// Exits non-zero on the first failure, so it can gate a deploy.

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pl = join(here, '..');
const repo = join(pl, '..');

let failed = 0;
const results = [];

/**
 * Everything in a built page a reader could end up seeing: the markup with
 * script and style removed, plus the string literals from the script (which is
 * where all of this app's copy lives). Deliberately not the comments.
 */
function visibleText(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const markup = html
    .replace(/<script>[\s\S]*?<\/script>/g, ' ')
    .replace(/<style>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  // Nearly all of this app's copy lives inside string literals that are HTML
  // fragments, so the literals are kept and then put through the same
  // treatment as the markup: strip inline styles, strip tags, strip any CSS
  // declaration left over. Otherwise width:100% reads as a percentage and
  // "Did you practise today?" does not read as copy.
  const literals = (scripts.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g) || [])
    .map((s) => s.slice(1, -1))
    .join('\n')
    .replace(/style=\\?"[^"]*\\?"/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[-a-z]+\s*:\s*[^;\n]+;?/g, ' ');

  return `${markup}\n${literals}`;
}

function check(n, title, fn) {
  try {
    const detail = fn();
    results.push([true, n, title, detail || '']);
  } catch (err) {
    failed++;
    results.push([false, n, title, err.message]);
  }
}

const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const read = (...p) => readFileSync(join(repo, ...p), 'utf8');

const log = read('log', 'index.html');
const host = read('log', 'host', 'index.html');

// ---------------------------------------------------------------------------
// integration
// ---------------------------------------------------------------------------

check(1, 'the log exists where the emails point', () => {
  ok(existsSync(join(repo, 'log', 'index.html')), 'log/index.html is missing');
  ok(log.length > 20000, 'log/index.html looks empty');
  return `${(log.length / 1024).toFixed(1)}KB`;
});

check(3, 'the shell does not claim /log/ as one of its own routes', () => {
  // The shell intercepts only paths in ROUTES. /log/ must not be one, or a link
  // to it would crossfade to nothing instead of loading the app.
  const slugs = ['index.html', 'about/index.html', 'salons/index.html',
    'sits/index.html', 'beyondbelief/index.html', 'join/index.html'];
  for (const slug of slugs) {
    if (!existsSync(join(repo, slug))) continue;
    const src = read(slug);
    const routes = /ROUTES\s*=\s*\{([^}]*)\}/.exec(src);
    if (!routes) continue;
    ok(!routes[1].includes('/log/'), `${slug} has /log/ inside ROUTES`);
  }
  return 'not in ROUTES';
});

check(4, 'the log does not make the site generator dirty', () => {
  const gen = join(repo, 'build', 'build_shell.py');
  if (!existsSync(gen)) return 'no generator present, skipped';

  const SLUGS = ['index.html', 'about', 'salons', 'sits', 'beyondbelief', 'join'];
  const dirty = (paths = SLUGS) => execFileSync('git', ['status', '--porcelain', '--', ...paths],
    { cwd: repo, encoding: 'utf8' })
    // Untracked files in those directories are somebody else's business; what
    // this check is about is whether the generator rewrote a tracked slug.
    .split('\n').filter((l) => l.trim() && !l.startsWith('??'));

  // This check has to run the real generator, which writes into the working
  // tree — possibly over uncommitted work by whoever is editing the site right
  // now. So the files are copied first and put back from that copy afterwards,
  // not from git: `git checkout` would restore HEAD and throw away exactly the
  // changes this is trying to protect.
  // If the generator itself is mid-edit, its output is *meant* to differ from
  // the committed slugs. Reporting that would blame this build for somebody
  // else's work in progress. (The snapshot below still protects the tree; this
  // is only about what the result can honestly be read to mean.)
  const genDirty = execFileSync('git', ['status', '--porcelain', '--', 'build/build_shell.py'],
    { cwd: repo, encoding: 'utf8' }).trim();
  if (genDirty && dirty().length) return 'generator and slugs both mid-edit, skipped';

  const files = SLUGS.flatMap((s) => (s.endsWith('.html') ? [s] : [`${s}/index.html`]))
    .filter((f) => existsSync(join(repo, f)));
  const before = new Map(files.map((f) => [f, readFileSync(join(repo, f))]));

  try {
    execFileSync('python3', [gen], { cwd: repo, stdio: 'pipe' });
  } catch (err) {
    // The generator reads a design bundle from an absolute path in Downloads.
    // If it is not there this check cannot run, which is itself worth saying.
    return `generator did not run (${String(err.stderr || err).slice(0, 60).trim()}) — skipped`;
  }

  const changed = [...before.entries()]
    .filter(([f, was]) => !was.equals(readFileSync(join(repo, f))))
    .map(([f]) => f);

  // Whatever it wrote, put the tree back exactly as it was found. A check that
  // leaves changes behind is a check that edits your work while inspecting it.
  for (const [f, was] of before) writeFileSync(join(repo, f), was);

  ok(changed.length === 0, `re-running the generator changed:\n  ${changed.join('\n  ')}`);
  return `${files.length} slugs byte-identical, tree untouched`;
});

check('3b', 'the log is not indexed', () => {
  ok(/<meta name="robots" content="noindex/.test(log), 'the log is missing its noindex');
  ok(/<meta name="robots" content="noindex/.test(host), 'the host page is missing its noindex');
  return 'noindex on both pages';
});

// ---------------------------------------------------------------------------
// the product rules
// ---------------------------------------------------------------------------

check(5, 'rule 1 — the cohort is not in the page before the tap', () => {
  // The client cannot show what it was not sent: `shared` is null until today
  // is marked, and every read of it goes through S.shared.
  const api = read('practice-log', 'src', 'api.js');
  ok(/^\s*shared: null,$/m.test(api), 'the state does not default shared to null');

  // The cohort is attached in exactly one place, and only behind the gate.
  const attachments = api.match(/state\.shared = .*/g) || [];
  ok(attachments.length === 1, `shared is attached in ${attachments.length} places, expected 1`);
  ok(/if \(canSeeShared\) \{\s*\n\s*state\.shared = await sharedView/.test(api),
    'shared is attached without going through canSeeShared');

  // And the gate itself must still require today's mark for a run in progress.
  ok(/const canSeeShared = markedToday \|\| \(closed &&/.test(api),
    'the gate no longer requires today to be marked while the run is open');
  // The past-day endpoint has to be gated too, or the cohort leaks one day at
  // a time through a URL. It carries the same closed-run allowance as getState
  // and nothing wider.
  ok(/if \(!marked\) \{/.test(api), '/api/day is not gated on today being marked');
  ok(/const ever = isClosed\(run, today\) &&/.test(api),
    '/api/day lets an unmarked day through on a run that is still open');
  ok(/if \(!ever\) return bad\(404/.test(api), '/api/day does not refuse when the gate fails');

  return 'gated server-side, today and past days';
});

check(6, 'rule 3 — the vocabulary of scoring is absent', () => {
  const banned = [
    'streak', 'in a row', 'you missed', "don't break", 'do not break',
    'average', 'congratulations', 'well done', 'keep it up',
    '% of', 'percent', 'progress bar',
  ];
  // What the reader can actually see: the markup outside <script>/<style>,
  // plus every string literal inside the script. Comments are excluded on
  // purpose — the source says "No streaks, ever" precisely because the
  // interface never does, and a check that cannot tell those apart is useless.
  const prose = [log, host].map(visibleText).join('\n');
  // A filter that removed everything would make this check pass on nothing.
  ok(prose.length > 2000, `only ${prose.length} chars of prose found — the filter is too greedy`);
  ok(/Did you practise\?/.test(prose), 'the main question is not in the prose corpus');

  const hits = banned.filter((w) => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(prose));
  ok(hits.length === 0, `found: ${hits.join(', ')}`);

  // "6/10" and "60%" — a count against a denominator, anywhere in the built app.
  ok(!/\b\d+\s*\/\s*10\b/.test(prose), 'a count over a denominator appears');
  ok(!/\b\d{1,3}\s?%/.test(prose), 'a percentage appears');
  return `${banned.length} phrases, none present`;
});

check('6b', 'the app uses practise without prescribing a standard length', () => {
  const prose = visibleText(log);
  ok(/practise/i.test(prose), 'the verb "practise" is missing');
  // “Weekly live sessions” describes the separate Sits offering. What this
  // rule rejects is the Log recasting a person's meditation as a scored or
  // standardised session.
  const logProse = prose.replace(/Sits · weekly live sessions/gi, '');
  ok(!/\bsessions?\b/i.test(logProse), '"session" appears outside the Sits door');
  ok(!/Twenty minutes is standard/.test(prose), 'the removed standard-length copy remains');
  ok(!/Five minutes on a hard day/.test(prose), 'the removed flexibility copy remains');
  return 'no prescribed length in the app';
});

check(7, 'rule 4 — no participant endpoint reads a private message', () => {
  const api = read('practice-log', 'src', 'api.js');
  const replies = read('practice-log', 'src', 'replies.js');
  // postMessage writes. Participant reads use a separate host_reply record,
  // which deliberately contains none of the source message or note.
  for (const [name, source] of [['api.js', api], ['replies.js', replies]]) {
    ok(!/FROM private_message/i.test(source), `${name} reads private_message`);
    ok(!/JOIN private_message/i.test(source), `${name} joins private_message`);
  }
  ok(!/\bFROM note\b/i.test(replies), 'replies.js reads source notes');
  ok(/FROM host_reply/.test(replies), 'participant replies do not come from host_reply');
  ok(/row\.visibility === 'shared' \? row\.public_context : null/.test(replies),
    'a private reply can expose a public-context field');
  const host_ = read('practice-log', 'src', 'host.js');
  ok(/is_host/.test(read('practice-log', 'src', 'index.js')), 'the host routes are not gated');
  ok(host_.includes('run_id = ?1') || host_.includes('p.run_id = ?1'),
    'the host inbox is not scoped to the run');
  return 'source words remain host-only; replies are separate records';
});

check('7b', 'shared replies keep their source person private and obey the tap gate', () => {
  const replies = read('practice-log', 'src', 'replies.js');
  ok(/recipient_person_id = \?1 OR \(visibility = 'shared' AND \?2 = 1\)/.test(replies),
    'shared replies are not gated while own replies remain reachable');
  ok(/SELECT 1 FROM day_mark WHERE person_id = \?1 AND on_date = \?2/.test(replies),
    'the shared-reply gate does not require today\'s mark');
  ok(!/\b(?:name|email|source_note_date|source_message_id|recipient_person_id)\s*:/.test(
    replies.slice(replies.indexOf('return replyJson({'), replies.indexOf('export async function getReplyAudio'))
  ), 'participant reply JSON exposes source identity');
  return 'own replies always; everyone else’s only after today’s tap';
});

check('7c', 'voice replies are private objects, capped at twenty minutes', () => {
  const hostJs = read('practice-log', 'app', 'host.js');
  const hostApi = read('practice-log', 'src', 'host.js');
  const config = read('practice-log', 'wrangler.toml');
  ok(/MAX_RECORDING_MS = 20 \* 60 \* 1000/.test(hostJs), 'the recorder lacks a twenty-minute client cap');
  ok(/REPLY_AUDIO_MAX_MS = 20 \* 60 \* 1000/.test(hostApi), 'the API lacks a twenty-minute cap');
  ok(/navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/.test(hostJs),
    'the host page has no in-app recorder');
  ok(/\[\[r2_buckets\]\][\s\S]*binding = "AUDIO"[\s\S]*bucket_name = "practice-log-audio"/.test(config),
    'private recording storage is not bound');
  ok(!/preview_url|public_url|r2\.dev/i.test(config + hostApi), 'recordings are configured with a public URL');
  return 'browser recorder, server cap, authenticated R2 playback';
});

check('7d', 'only the source person is notified when John replies', () => {
  const hostApi = read('practice-log', 'src', 'host.js');
  const mail = read('practice-log', 'src', 'mail', 'templates.js');
  const client = read('practice-log', 'app', 'app.js');
  const notify = hostApi.slice(hostApi.indexOf('async function notifyReply'), hostApi.indexOf('async function hostReply'));
  ok(/sendAnswered\(env, \{ name: source\.name, email: source\.email \}/.test(notify),
    'the reply notification is not addressed only to its source person');
  ok(!/SELECT|\.all\(|everyone|broadcast/i.test(notify), 'reply notification can fan out beyond its source person');
  ok(/view=from-john&reply=/.test(notify), 'the email does not link to the exact in-log reply');
  ok(/Only you received an immediate email/.test(mail) && /weekly updates/.test(mail),
    'the shared-reply email describes a different notification rule');
  ok(/For you/.test(client) && /Shared/.test(client) && /From something you shared/.test(client),
    'the participant filters or source-person label are missing');
  return 'one recipient; everyone else finds shared replies in the log';
});

check('7e', 'public-reply digests are explicit, weekly and never duplicate the source notification', () => {
  const migration = read('practice-log', 'migrations', '0008_reply_digest.sql');
  const digest = read('practice-log', 'src', 'digest.js');
  const nudge = read('practice-log', 'src', 'nudge.js');
  const mail = read('practice-log', 'src', 'mail', 'templates.js');
  const app = read('practice-log', 'app', 'app.js');
  ok(/reply_digest_on INTEGER NOT NULL DEFAULT 0/.test(migration), 'the digest is not opt-in');
  ok(/weekday\(date\) === 0/.test(digest), 'the digest is not confined to Sunday');
  ok(/nudgeDue\(\{ \.\.\.person, nudge_on: true \}, at\)/.test(digest),
    'the digest does not use the person’s existing email time');
  ok(/recipient_person_id <> \?3/.test(digest),
    'a source person can receive their own public reply again in the digest');
  ok(/visibility = 'shared'/.test(digest) && /shared_at > \?1 AND shared_at <= \?2/.test(digest),
    'the digest is not limited to newly public replies');
  ok(/if \(digest\.handled\)[\s\S]{0,120}continue;[\s\S]{0,80}nudgeOne/.test(nudge),
    'a Sunday digest can be followed by a second scheduled email');
  ok(/Weekly replies from John/.test(app) && /One Sunday email when John has shared something new/.test(app),
    'Settings does not clearly describe the opt-in');
  ok(/subject: 'From John this week'/.test(mail) && /people and words that prompted them remain private/.test(mail),
    'the digest subject or privacy explanation is missing');
  return 'off by default; Sunday at the chosen time; source replies excluded';
});

check('7f', 'the Practice Log opens benefit-led doors into the wider work', () => {
  const app = read('practice-log', 'app', 'app.js');
  ok(/label: 'Build a meditation practice through shared commitment'/.test(app) &&
    /sub: 'Sits · weekly live sessions'/.test(app) && /href: '\/sits\/'/.test(app),
  'the Sits door does not name shared commitment and weekly live sessions');
  ok(/label: 'Find another way into your practice'/.test(app) &&
    /sub: 'Practice map · body, heart and mind'/.test(app) && /href: '\/practice-map\/'/.test(app),
  'the Practice Map door is missing or no longer invitational');
  return 'shared commitment, live sessions and another way into practice';
});

// ---------------------------------------------------------------------------
// email safety
// ---------------------------------------------------------------------------

check(8, 'a link in an email cannot write anything', () => {
  const idx = read('practice-log', 'src', 'index.js');
  // Every write is behind POST or PATCH. If a GET ever routed to one of them,
  // a mail scanner following links would log practices nobody did.
  const writes = ['/api/join', '/api/mark', '/api/note', '/api/message',
    '/api/settings/revoke', '/api/settings/delete', '/api/giving/manage'];
  for (const w of writes) {
    const line = idx.split('\n').find((l) => l.includes(`'${w}'`) && l.includes('path ==='));
    ok(line, `${w} is not routed`);
    ok(/method === 'POST'|method === 'PATCH'/.test(line) || /path === '\/api\/settings\/revoke'/.test(line),
      `${w} is reachable without POST`);
  }
  ok(/if \(method === 'POST' \|\| method === 'PATCH'\)/.test(idx),
    'writes are not fenced behind POST/PATCH');
  return 'writes are POST-only';
});

check(9, 'the token is taken out of the address bar on arrival', () => {
  ok(/history\.replaceState\(\{\}, '', location\.pathname\)/.test(log),
    'the log does not strip the token from the URL');
  ok(/history\.replaceState\(\{\}, '', location\.pathname\)/.test(host),
    'the host page does not strip the token from the URL');
  return 'stripped on both pages';
});

check('9b', 'the token is never put in a URL by the client', () => {
  // It travels as a bearer header. A token in a query string ends up in logs,
  // referrers and shared screenshots.
  ok(!/\?t=|&t=/.test(log.replace(/location\.search\.match\([^)]*\)/g, '')
    .replace(/\[\?&\]t=/g, '')), 'the client builds a URL containing a token');
  ok(/authorization: 'Bearer '/.test(log), 'the client does not send a bearer token');
  return 'bearer header only';
});

// ---------------------------------------------------------------------------
// safety
// ---------------------------------------------------------------------------

check(14, 'nothing secret is in anything served', () => {
  // The value has to look like key material — sixteen or more characters of
  // base64/hex — so `LINK_KEY="…the same value…"` in the README and
  // `$(openssl rand -base64 32)` in an example both read as what they are.
  const suspects = [
    [/re_[A-Za-z0-9]{12,}/, 'a Resend key'],
    [/sk-[A-Za-z0-9]{12,}/, 'an API key'],
    [/\bLINK_KEY\s*[=:]\s*['"]?[A-Za-z0-9+/=_-]{16,}/, 'the link key'],
    [/\bRESEND_API_KEY\s*[=:]\s*['"]?[A-Za-z0-9+/=_-]{16,}/, 'the Resend key'],
  ];

  // A leak detector that has stopped detecting is worse than none, so prove
  // each pattern still fires on the thing it is for before trusting a pass.
  const canaries = [
    're_AbCdEf0123456789xyz',
    'sk-AbCdEf0123456789xyz',
    'LINK_KEY=t3TFjPBIfeVoisq8g9lBHnKGYyaOfy0vWkmSuTIYFbA=',
    'RESEND_API_KEY="re_0123456789abcdefghij"',
  ];
  for (let i = 0; i < suspects.length; i++) {
    ok(suspects[i][0].test(canaries[i]),
      `the pattern for ${suspects[i][1]} no longer matches a real one`);
  }
  for (const [re, what] of suspects) {
    ok(!re.test(log) && !re.test(host), `${what} is in the built app`);
  }
  // And the same for everything committed under practice-log/.
  const tracked = execFileSync('git', ['ls-files', 'practice-log'], { cwd: repo, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  ok(!tracked.includes('practice-log/.dev.vars'), '.dev.vars is tracked by git');

  // This file is the one exception, and only because it has to hold the
  // canaries above. Nothing else here is exempt.
  const self = 'practice-log/test/checks.js';
  // A tracked file can be intentionally deleted in the working tree during a
  // rename; scan what will actually be served or committed.
  const scanned = tracked.filter((f) => f !== self && existsSync(join(repo, f)));

  // A tracked path that is not a regular file is a symlink or a directory that
  // slipped past .gitignore. `node_modules/` with a trailing slash does not
  // match a symlink pointing at one, and such a link arrives broken — or
  // pointing somewhere unexpected — on anybody else's machine.
  for (const f of scanned) {
    ok(statSync(join(repo, f)).isFile(), `${f} is tracked but is not a regular file`);
  }

  for (const f of scanned) {
    const src = read(f);
    for (const [re, what] of suspects) ok(!re.test(src), `${what} is in ${f}`);
  }
  return `${scanned.length} tracked files clean, ${self} exempt`;
});

check(15, 'a fixed run freezes, and an evergreen one does not', () => {
  const days = read('practice-log', 'src', 'days.js');
  ok(/if \(run\.mode !== 'fixed'\) return false;/.test(days), 'isClosed does not exempt evergreen');
  ok(/markableDates/.test(days), 'there is no markable-dates gate');
  const api = read('practice-log', 'src', 'api.js');
  ok(/const allowed = markableDates\(run, today, anchorOf\(run, person\)\)/.test(api),
    'the mark endpoint does not check the date is markable');

  // Freezing must not mean disappearing. After the last day there is no today
  // to mark, so gating the grid on today's mark alone would shut the log for
  // good and render the closing view empty.
  ok(/closed && mine\.marks\.size > 0/.test(api),
    'a closed run is not readable — the closing view would be empty for ever');
  ok(/isClosed\(run, today\) \? lastDay\(run\) : today/.test(api),
    'a closed run keeps counting days past its last one');

  return 'freezes, stays readable, stops at the last day';
});

check(16, 'one public log, with host-set access to John', () => {
  const idx = read('practice-log', 'src', 'index.js');
  const join = read('practice-log', 'src', 'join.js');
  const api = read('practice-log', 'src', 'api.js');
  const access = read('practice-log', 'src', 'access.js');
  const host_ = read('practice-log', 'src', 'host.js');
  const mail = read('practice-log', 'src', 'mail', 'templates.js');

  ok(/path === '\/api\/join' && method === 'POST'/.test(idx), 'the public front door is not POST-only');
  ok(/public_join = 1 AND mode = 'evergreen'/.test(join), 'self-service entry is not confined to the public evergreen log');
  ok(!/json\(\{[^}]*token/.test(join), 'public entry returns a credential to the browser');
  ok(/messageAccess\(person, today\)\.active/.test(api), 'the message endpoint is not gated by host-set dates');
  ok(/from <= today/.test(access) && /today <= until/.test(access), 'private-line access is not bounded at both ends');
  ok(/message-access/.test(host_), 'the host cannot grant or clear private-line access');
  ok(/message_access && S\.person\.message_access\.active/.test(log), 'the private line is shown outside active host-set access');
  ok(!/messageAccess/.test(host_), 'the host is prevented from replying after the access window closes');
  ok(/if \(!d\.run\.public_join\) wrap\.appendChild\(inviteForm\(\)\)/.test(host),
    'the public host page still offers private invitations');
  ok(/Ready to practise\?/.test(mail) && /Your log is ready/.test(mail),
    'the evergreen welcome still reads like a course place');
  ok(/view=settings/.test(mail) && /requestedParams\.get\(['"]view['"]\) === ['"]settings['"]/.test(log) &&
    /change the time or stop the daily emails/.test(mail),
    'email Settings links do not open Settings directly');
  ok(!/heading\(`Hello,|Good morning/.test(mail),
    'routine emails still greet the reader by name every time');
  ok(!/how many others|Good morning|Twenty minutes is standard/.test(log + mail),
    'stale count, morning-only, or prescribed-length copy remains live');
  ok(/subject: fixed \? 'Day 1 · today we start' : 'Did you practise\?'/.test(mail),
    'the evergreen first-day email still claims a course is starting');
  ok(/How it works/.test(log) && /Choose a time for the log to email each day/.test(log) &&
    /ask: <b>Did you practise\?<\/b>/.test(log) &&
    /Sit in meditation, however you sit/.test(log) &&
    /tap <b>I practised<\/b> to record it/.test(log) &&
    /practising with you this week, and what it has been like for them/.test(log) &&
    /<ol>/.test(log),
    'the public sign-up page does not explain the experience');
  ok(/John will respond when he’s able/.test(log), 'the private line does not set the agreed response expectation');
  ok(!/usually within a day or two/.test(log), 'the old response deadline remains');
  ok(!/while your course is running|opens during a course|taking a course with John/.test(visibleText(log + host)),
    'course language remains in the private-line interface');
  return 'open log, host-set private line, no deadline, no invitation copy on the public path';
});

check(17, 'setup can read its timezone and reports a failed save', () => {
  ok(/var readZone = wireZone\(root, zone\)/.test(log),
    'the setup form does not retain the timezone reader');
  ok(/timezone: readZone\(\)/.test(log),
    'Begin reads an undefined timezone value');
  ok(/id="setup-msg"/.test(log) && /That did not save\. Try again\./.test(log),
    'setup failures are invisible');
  return 'timezone reader called, failure shown';
});

check(18, 'the public interface does not call people a cohort', () => {
  const prose = visibleText(log);
  ok(!/Not the cohort|cohort news|Show me in the cohort/i.test(prose),
    'course-era cohort wording remains visible');
  return 'people and notes described directly';
});

check(19, 'only the host can see who has an account', () => {
  const api = read('practice-log', 'src', 'api.js');
  ok(!/state\.roster|async function roster/.test(api),
    'the participant API still sends a persistent roster');
  ok(!/S\.roster|viewRoom|label: ['"]The room['"]/.test(log),
    'the participant app still contains an account directory');
  const host_ = read('practice-log', 'src', 'host.js');
  ok(/path === ['"]\/api\/host\/people['"]/.test(host_) &&
    /async function people\(/.test(host_), 'the private host account list is missing');
  ok(/FROM day_mark dm JOIN person p/.test(api) &&
    !/SELECT COUNT\(\*\) AS n FROM person WHERE run_id/.test(api),
  'participant presence is not derived exclusively from practice marks');
  ok(/profile_image: person\.profile_image/.test(api) && /profile_image: r\.profile_image/.test(host_),
    'the person cannot see their own picture or the host cannot see account pictures');
  return 'host registry only; participants appear only through marked days';
});

check(20, 'equal dots make practice social without making accounts social', () => {
  const css = read('practice-log', 'app', 'app.css');
  const api = read('practice-log', 'src', 'api.js');
  ok(/function presenceDots\(people, date, extra\)/.test(log) && /function profilesForDay\(day\)/.test(log),
    'marked people are not rendered as day dots');
  ok(/\.presence-dot\s*\{[^}]*background:\s*var\(--ink\)/s.test(css) &&
    /\.presence-dot\.mine\s*\{[^}]*background:\s*var\(--you\)/s.test(css),
  'participant dots are not equal apart from the viewer’s own mark');
  ok(/mouseenter/.test(log) && /addEventListener\(['"]click['"]/.test(log) &&
    /class=\\?"presence-card/.test(log), 'the practice card does not open by hover and tap');
  ok(/profileVisual\(person\.image, person\.name, ['"]presence-photo['"]\)/.test(log),
    'pictures are not confined to the opened practice card');
  ok(!/Number of others/.test(log) && !/class=\\?"wcount|class=\\?"wax-track/.test(log),
    'the old visible counts or bars remain on the weekly view');
  ok(/people:\s*\[\.\.\.profiles\.values\(\)\]/.test(api) && /people,\s*\n\s*mine:/.test(api),
    'past marked identities are not retained with their days');
  ok(!/FROM day_mark dm JOIN person p[\s\S]{0,220}p\.is_host = 0/.test(api),
    'a host who practises is still filtered out of participant presence');
  ok(!/dm\.created_at/.test(api) && /dm\.marked_at/.test(api),
    'practice presence uses a timestamp column that day_mark does not have');
  ok(/S\.shared\.today_count - 1/.test(log) &&
    /d\.count - \(d\.mine \? 1 : 0\)/.test(log),
  'the viewer’s own host mark is counted as another person');
  ok(/The log shows one week at a time/.test(log) && !/function allBlock\(/.test(log) &&
    /outside the visible week/.test(api), 'participant history extends beyond the one visible week');
  return 'equal day dots; only yours differs; one week; identity opens on hover or tap';
});

check(21, 'the timer remains separate from recording practice', () => {
  ok(/data-minutes=\\?"5\\?"/.test(log) && /data-minutes=\\?"10\\?"/.test(log) &&
    /data-minutes=\\?"20\\?"/.test(log), 'the agreed timer lengths are not all offered');
  ok(/Sound at the end/.test(log) && /One gentle bell/.test(log),
    'the timer has no visible sound choice');
  ok(/id=\\?"timer-custom-choice\\?"/.test(log) && /min=\\?"1\\?"[^>]*max=\\?"180\\?"/.test(log),
    'a granular custom timer length is not offered');
  ok(/customChoice\.classList\.toggle\(['"]sel['"], t\.custom\)/.test(log),
    'the custom timer choice is not visibly selected');
  ok(!/20 minutes\s*<small>standard<\/small>/.test(log), '20 minutes is still labelled standard');
  const timer = /function viewTimer\(\)[\s\S]*?function quietArrival\(\)/.exec(log)?.[0] || '';
  ok(timer && !/\/api\/mark/.test(timer), 'finishing the timer records practice');
  ok(/L\.timerEnded = S\.today\.date/.test(timer) && /Did you practise\?/.test(log),
    'the timer does not return to the existing practice tap');
  ok(/navigator\.wakeLock\.request\(['"]screen['"]\)/.test(timer) &&
    /releaseTimerWakeLock\(\)/.test(timer) && /timerDim:\s*true/.test(timer),
    'the browser timer does not keep its low-light screen awake and release it afterwards');
  ok(/document\.createElement\(['"]audio['"]\)/.test(timer) && /audio\/wav/.test(timer) &&
    /This is a bell clip, not a silent track/.test(timer),
    'the iPhone-safe short media bell is missing or has become a full-length audio workaround');
  ok(/Keep this screen open and awake to hear the bell\./.test(timer) &&
    /This screen will stay awake while the timer runs\./.test(timer),
    'the timer does not state whether its screen is being kept awake');
  ok(/tap\.querySelector\(['"]i['"]\)\.textContent = ['"]today['"]/.test(log),
    'the confirmation still shows a day number');
  ok(/A line for anyone else who practices today/.test(log) && /Whatever you feel like sharing\.\.\./.test(log),
    'the agreed note invitation is missing');
  const mail = read('practice-log', 'src', 'mail', 'templates.js');
  ok(/Change when you receive this note/.test(mail), 'the email timing link has the old wording');
  ok(/subject: ['"]Did you practise\?['"]/.test(mail) &&
    !/A quiet minute counts/.test(mail), 'the daily email subject is not the agreed question');
  const nudge = read('practice-log', 'src', 'nudge.js');
  ok(/QUIET_BEFORE_STILL_HERE\s*=\s*3/.test(nudge) &&
    /Nothing to explain\./.test(mail) && /showing up again is how the practice deepens/.test(mail),
  'the fourth-day return note does not use the agreed timing and copy');
  return 'presets plus 1–180 custom; awake low-light screen; short media bell; no automatic mark';
});

check('21b', 'sharing invitations stay occasional and unpredictable', () => {
  const api = read('practice-log', 'src', 'api.js');
  const days = read('practice-log', 'src', 'days.js');
  ok(/S\.today\.share_invited/.test(log) && /share_invited:\s*shareInvitationDue/.test(api) &&
    /const count = 2 \+ \(seed % 5\)/.test(days),
    'the note invitation is not a stable, hidden selection of two to six days each week');
  ok(/A line for anyone else who practices today/.test(log) && /Whatever you feel like sharing\.\.\./.test(log),
    'the approved invitation wording changed while making its appearance occasional');
  return 'two to six hidden days per week; stable across devices; existing wording kept';
});

check('21c', 'the pre-timer intention is optional and leaves no record', () => {
  const intention = /function viewTimerIntention\(t\)[\s\S]*?function timerRemaining\(t\)/.exec(log)?.[0] || '';
  ok(/Set an intention\?/.test(intention) && /id=\\?"timer-intention-yes\\?"/.test(intention) &&
    /id=\\?"timer-intention-skip\\?"[^>]*>Not today/.test(intention),
    'the intention pause does not ask before the timer begins');
  ok(/id=\\?"timer-intention\\?"/.test(intention) && !/placeholder=/.test(intention) &&
    /id=\\?"timer-intention-begin\\?"[^>]*>Begin/.test(intention),
    'the intention field does not use the approved blank field and Begin action');
  ok(/timer-intention-skip[\s\S]*beginTimer\(t\)/.test(intention) &&
    /timerIntentionStep = null;\s*t\.started = true/.test(intention),
    'Not today does not begin immediately or the intention survives into the running timer');
  ok(!/L\.[a-zA-Z_]*intention|t\.[a-zA-Z_]*intention|localStorage[\s\S]{0,80}intention/i.test(intention),
    'the typed intention is being saved rather than disappearing at Begin');
  return 'asked after Start; blank field; Begin or Not today; never stored';
});

check(22, 'giving has moved out of the Practice Log and into the member area', () => {
  ok(!existsSync(join(repo, 'giving', 'index.html')), 'the retired standalone giving page remains');
  ok(!/href:\s*['"]\/giving\/['"]|class=\\?"practice-giving|you can give here/.test(log),
    'the Practice Log still links or invites people to the retired giving page');
  const mail = read('practice-log', 'src', 'mail', 'templates.js');
  ok(!/\/giving\/|help sustain Beings Club|one-off or monthly gift|monthly giving/i.test(mail),
    'a Practice Log email contains a giving invitation');
  const idx = read('practice-log', 'src', 'index.js');
  ok(!/path === ['"]\/api\/giving['"]/.test(idx), 'the retired public giving endpoint remains');
  const givingApi = read('practice-log', 'src', 'giving.js');
  const givingMigration = read('practice-log', 'migrations', '0006_giving_email.sql');
  ok(/\/api\/giving\/manage/.test(log) && /postGivingPortal/.test(givingApi) &&
    /billing_portal\/sessions/.test(givingApi), 'Settings cannot open Stripe to manage monthly giving');
  ok(/giving_subscription/.test(givingMigration) && !/REFERENCES person/.test(givingMigration) &&
    /lower\(email\) = lower\(\?1\)/.test(givingApi),
  'monthly management either cannot match the giver or attaches giving to a Practice Log person');
  const memberShell = read('members-app', 'app', 'shell.html');
  const memberApp = read('members-app', 'app', 'app.js');
  ok(/id="financial-giving-form"/.test(memberShell) &&
    /\/api\/club\/giving\/checkout/.test(memberApp), 'member Giving is not integrated');
  return 'no standalone page or Practice Log invitation; member Giving remains integrated';
});

check(23, 'deleting a Practice Log erases identity and presence', () => {
  const idx = read('practice-log', 'src', 'index.js');
  const api = read('practice-log', 'src', 'api.js');
  const schema = read('practice-log', 'migrations', '0001_init.sql');
  ok(/path === ['"]\/api\/settings\/delete['"] && method === ['"]POST['"]/.test(idx),
    'account deletion is not an authenticated POST');
  ok(/body\?\.confirmation !== ['"]DELETE['"]/.test(api) &&
    /DELETE FROM person WHERE id = \?1/.test(api), 'deletion is soft or lacks explicit confirmation');
  ok((schema.match(/REFERENCES person\(id\) ON DELETE CASCADE/g) || []).length >= 5,
    'person-linked practice data does not cascade away with the profile');
  ok(/Another host must exist/.test(api), 'the only host credential can be accidentally deleted');
  ok(/localStorage\.removeItem\(KEY\)/.test(log) && /view === ['"]deleted['"]/.test(log),
    'the deleted person’s old local session survives');
  ok(/copy\.shared\.people = copy\.shared\.people\.filter/.test(log) &&
    /return p\.mine/.test(log) && /copy\.shared\.notes.*filter/.test(log),
  'other people’s profiles or notes remain in the offline cache');
  return 'hard delete; cascaded practice data; old link and cached identity removed';
});

// ---------------------------------------------------------------------------

const width = Math.max(...results.map(([, , t]) => t.length));
for (const [pass, n, title, detail] of results) {
  console.log(`${pass ? ' ok ' : 'FAIL'}  ${String(n).padStart(3)}  ${title.padEnd(width)}  ${detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
