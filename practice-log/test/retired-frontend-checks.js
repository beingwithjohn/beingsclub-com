// Deployment checks for the retired Beings Club Practice Log frontend.
// Backend behaviour remains covered by the node:test suite. These checks make
// sure an old frontend build cannot quietly reappear at beingsclub.com/log/.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const moves = [
  ['log/index.html', 'https://spacetobe.xyz/log/'],
  ['log/host/index.html', 'https://spacetobe.xyz/log/host/'],
];

let failed = 0;
const results = [];
const check = (title, fn) => {
  try {
    const detail = fn();
    results.push([true, title, detail || '']);
  } catch (error) {
    failed += 1;
    results.push([false, title, error.message]);
  }
};
const ok = (condition, message) => { if (!condition) throw new Error(message); };

check('the old Practice Log addresses move to Space to Be', () => {
  for (const [path, destination] of moves) {
    const html = readFileSync(join(repo, path), 'utf8');
    ok(html.length < 3000, `${path} still looks like an application`);
    ok(html.includes('<meta name="robots" content="noindex,follow">'), `${path} can be indexed`);
    ok(html.includes(`<link rel="canonical" href="${destination}">`), `${path} has the wrong canonical`);
    ok(html.includes(`location.replace(${JSON.stringify(destination)})`), `${path} does not move immediately`);
    ok(html.includes(`href="${destination}"`), `${path} lacks a visible fallback link`);
    ok(!html.includes('id="app"') && !html.includes('Practice Log — client'), `${path} still contains the retired app`);
  }
  return 'reader and host addresses retired';
});

check('the retired frontend build cannot restore the old app', () => {
  const build = readFileSync(join(repo, 'practice-log', 'app', 'build.js'), 'utf8');
  ok(!build.includes('writeFileSync'), 'the retired frontend build still writes pages');
  ok(!build.includes("script: 'app.js'") && !build.includes("script: 'host.js'"), 'the old app build remains wired');
  return 'build command verifies only';
});

check('no secret-looking material is committed in the shared Worker', () => {
  const suspects = [
    [/re_[A-Za-z0-9]{16}/, 'Resend key'],
    [/sk-[A-Za-z0-9]{16}/, 'secret key'],
    [/LINK_KEY\s*=\s*["'][A-Za-z0-9+/=]{24,}/, 'link key'],
    [/RESEND_API_KEY\s*=\s*["'][^"']+/, 'Resend environment value'],
  ];
  const tracked = execFileSync('git', ['ls-files', 'practice-log'], { cwd: repo, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  ok(!tracked.includes('practice-log/.dev.vars'), '.dev.vars is tracked by git');
  const self = 'practice-log/test/retired-frontend-checks.js';
  for (const path of tracked.filter((path) => path !== self && existsSync(join(repo, path)))) {
    ok(statSync(join(repo, path)).isFile(), `${path} is tracked but is not a regular file`);
    const source = readFileSync(join(repo, path), 'utf8');
    for (const [pattern, label] of suspects) ok(!pattern.test(source), `${label} is in ${path}`);
  }
  return `${tracked.length - 1} tracked files clean`;
});

const width = Math.max(...results.map(([, title]) => title.length));
for (const [pass, title, detail] of results) {
  console.log(`${pass ? ' ok ' : 'FAIL'}  ${title.padEnd(width)}  ${detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
