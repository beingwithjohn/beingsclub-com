import test from 'node:test';
import assert from 'node:assert/strict';
import { clubRoute } from '../src/club/index.js';
import { keyedHash } from '../src/club/security.js';

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    this.db.firsts.push(this);
    if (this.sql.includes('FROM auth_challenge')) return this.db.challenge;
    if (this.sql.includes('FROM member')) return this.db.member;
    return null;
  }
  async run() { this.db.runs.push(this); return { meta: { changes: 1 } }; }
}

function membersDb(member = null) {
  return {
    member,
    challenge: null,
    firsts: [],
    runs: [],
    batches: [],
    prepare(sql) { return new Statement(this, sql); },
    async batch(statements) {
      this.batches.push(statements);
      if (statements.every((statement) => statement.sql.includes('SELECT '))) {
        return [
          { results: [{ n: 0 }] },
          { results: [{ n: 0 }] },
          { results: [{ at: null }] },
        ];
      }
      return statements.map(() => ({ results: [], meta: { changes: 1 } }));
    },
  };
}

async function requestLogin(db, email) {
  const pending = [];
  const env = {
    MEMBERS: db,
    LINK_KEY: Buffer.alloc(32, 7).toString('base64'),
    MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
    MAIL_REPLY_TO: 'john@spacetobe.xyz',
  };
  const request = new Request('https://example.test/api/club/auth/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.8' },
    body: JSON.stringify({ email }),
  });
  const response = await clubRoute(request, env, { waitUntil(value) { pending.push(value); } }, new URL(request.url));
  await Promise.all(pending);
  return response.json();
}

test('member login distinguishes an unknown address only after recording its throttled request', async () => {
  const db = membersDb();
  const result = await requestLogin(db, 'new@example.test');
  assert.equal(result.eligible, false);
  assert.equal(result.limited, undefined);
  assert.equal(db.runs.some((statement) => statement.sql.includes('INSERT INTO auth_request')), true);
  assert.equal(db.batches.flat().some((statement) => statement.sql.includes('INSERT INTO auth_challenge')), false);
});

test('a current member remains eligible for the six-digit code flow', async () => {
  const db = membersDb({ id: 3, email: 'member@example.test', display_name: 'Mira' });
  const result = await requestLogin(db, 'member@example.test');
  assert.equal(result.eligible, true);
  assert.match(result.challenge, /^[A-Za-z0-9_-]{20,100}$/);
  assert.equal(db.batches.flat().some((statement) => statement.sql.includes('INSERT INTO auth_challenge')), true);
});

test('a returning member stays past onboarding immediately after a new code login', async () => {
  const challenge = 'returning_member_login_123456';
  const code = '314159';
  const linkKey = Buffer.alloc(32, 7).toString('base64');
  const db = membersDb();
  db.challenge = {
    id: challenge,
    member_id: 3,
    code_hash: await keyedHash({ LINK_KEY: linkKey }, 'login-code', `${challenge}:${code}`),
    attempts: 0,
    expires_at: Math.floor(Date.now() / 1000) + 600,
    consumed_at: null,
    email: 'member@example.test',
    display_name: 'Mira',
    is_host: 0,
    disabled_at: null,
    left_at: null,
    agreement_version: '2026-09-01',
    agreement_accepted_at: 1,
    onboarding_completed_at: 1,
  };
  const request = new Request('https://example.test/api/club/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challenge, code }),
  });
  const response = await clubRoute(request, { MEMBERS: db, LINK_KEY: linkKey }, {}, new URL(request.url));
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.member.onboardingCompleted, true);
  assert.match(
    db.firsts.find((statement) => statement.sql.includes('FROM auth_challenge')).sql,
    /m\.onboarding_completed_at/,
  );
});
