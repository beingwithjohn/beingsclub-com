import test from 'node:test';
import assert from 'node:assert/strict';
import { issueMemberAccessLink } from '../src/club/member-links.js';

test('each Salon email entrance is one-use without invalidating another entrance', async () => {
  const statements = [];
  const env = {
    MEMBERS: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() {
                statements.push({ sql, args });
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  };
  const timestamp = 2_000_000_000;
  const first = await issueMemberAccessLink(env, 9, timestamp);
  const second = await issueMemberAccessLink(env, 9, timestamp + 1);
  const fieldNotes = await issueMemberAccessLink(env, 9, timestamp + 2, 'field-notes');

  assert.match(first, /^https:\/\/beingsclub\.com\/members\/#welcome=[A-Za-z0-9_-]+$/);
  assert.match(second, /^https:\/\/beingsclub\.com\/members\/#welcome=[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
  assert.match(fieldNotes, /^https:\/\/beingsclub\.com\/members\/#welcome=[A-Za-z0-9_-]+&next=field-notes$/);
  assert.equal(statements.filter(({ sql }) => sql.includes('INSERT INTO member_welcome_link')).length, 3);
  assert.equal(statements.some(({ sql }) => sql.includes('SET consumed_at')), false);
  const insert = statements.find(({ sql }) => sql.includes('INSERT INTO member_welcome_link'));
  assert.equal(insert.args[1], 9);
  assert.equal(insert.args[3], timestamp + (7 * 24 * 60 * 60));
});
