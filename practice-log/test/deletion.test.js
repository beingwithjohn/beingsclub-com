import test from 'node:test';
import assert from 'node:assert/strict';
import { postDelete } from '../src/api.js';

function deletionDb(anotherHost = null) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, values: [] };
      calls.push(call);
      return {
        bind(...values) { call.values = values; return this; },
        async first() { return anotherHost; },
        async run() { return { success: true }; },
      };
    },
  };
}

test('confirmed deletion permanently removes the person row', async () => {
  const DB = deletionDb();
  const response = await postDelete(
    { DB },
    { person: { id: 12, run_id: 7, is_host: false } },
    { confirmation: 'DELETE' },
  );
  assert.equal(response.status, 200);
  assert.match(DB.calls.at(-1).sql, /DELETE FROM person WHERE id/);
  assert.deepEqual(DB.calls.at(-1).values, [12]);
});

test('deletion requires the explicit confirmation word', async () => {
  const DB = deletionDb();
  const response = await postDelete(
    { DB },
    { person: { id: 12, run_id: 7, is_host: false } },
    { confirmation: 'delete' },
  );
  assert.equal(response.status, 400);
  assert.equal(DB.calls.length, 0);
});

test('the final host cannot accidentally erase the only host credential', async () => {
  const DB = deletionDb(null);
  const response = await postDelete(
    { DB },
    { person: { id: 12, run_id: 7, is_host: true } },
    { confirmation: 'DELETE' },
  );
  assert.equal(response.status, 409);
  assert.equal(DB.calls.some((call) => /DELETE FROM person/.test(call.sql)), false);
});

