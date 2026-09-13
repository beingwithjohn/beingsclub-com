import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { practiceLogRetired, retiredLogRequest } from '../src/retirement.js';

const env = { PRACTICE_LOG_RETIRED: 'true', APP_ORIGIN: 'https://spacetobe.xyz' };

test('retirement requires an explicit flag', () => {
  assert.equal(practiceLogRetired({}), false);
  assert.equal(practiceLogRetired({ PRACTICE_LOG_RETIRED: 'false' }), false);
  assert.equal(practiceLogRetired(env), true);
});

test('all log access and writes stop before data, authentication or email is touched', async () => {
  for (const path of ['join', 'login', 'invite', 'place', 'state', 'day', 'mark',
    'note', 'message', 'settings', 'settings/revoke', 'replies', 'replies/1/audio', 'host/people']) {
    for (const method of ['GET', 'POST', 'PATCH']) {
      const response = await worker.fetch(new Request('https://example.test/api/' + path, {
        method, headers: { origin: 'https://spacetobe.xyz' },
      }), env, {});
      assert.equal(response.status, 410, method + ' ' + path);
      assert.equal((await response.json()).error, 'retired');
      assert.equal(response.headers.get('access-control-allow-origin'), 'https://spacetobe.xyz');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
});

test('membership, webhooks, giving and data erasure remain outside retirement', () => {
  for (const path of ['health', 'club/login', 'club/state', 'club/host/people',
    'cal/webhook', 'stripe/webhook', 'giving', 'giving/manage', 'settings/delete']) {
    assert.equal(retiredLogRequest(env, '/api/' + path), false, path);
  }
});

test('health still responds and disallowed origins remain forbidden', async () => {
  assert.equal((await worker.fetch(new Request('https://example.test/api/health'), env, {})).status, 200);
  assert.equal((await worker.fetch(new Request('https://example.test/api/join', {
    method: 'POST', headers: { origin: 'https://evil.example' },
  }), env, {})).status, 403);
});

test('retired scheduled jobs never touch the Practice Log database', async () => {
  const jobs = [];
  const db = { prepare() { throw new Error('Practice Log database accessed by retired cron'); } };
  await worker.scheduled({ scheduledTime: Date.now() }, { ...env, DB: db }, {
    waitUntil(job) { jobs.push(job); },
  });
  await Promise.all(jobs);
});
