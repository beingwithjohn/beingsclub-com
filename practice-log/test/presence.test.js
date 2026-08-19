import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedView, patchSettings, getDay } from '../src/api.js';
import { addDays, localDate } from '../src/days.js';

function presenceDb() {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          if (/FROM day_mark dm JOIN person p/.test(sql)) {
            return { results: [
              { d: '2026-08-18', pid: 1, name: 'John', line: 'Here to notice.', profile_image: null },
              { d: '2026-08-18', pid: 2, name: 'Maya', line: 'Learning to stay.', profile_image: 'data:image/jpeg;base64,AA==' },
              { d: '2026-08-19', pid: 2, name: 'Maya', line: 'Learning to stay.', profile_image: 'data:image/jpeg;base64,AA==' },
            ] };
          }
          return { results: [] };
        },
      };
    },
  };
}

test('shared presence contains marked people, including the host', async () => {
  const shared = await sharedView(
    { DB: presenceDb() },
    { person: { id: 1, is_host: true }, run: { id: 7, mode: 'evergreen' } },
    '2026-08-18',
    '2026-08-19',
    { from: '2026-08-18', marks: new Set(['2026-08-18']), notes: new Map() },
  );

  assert.equal('size' in shared, false, 'account totals must not reach participants');
  assert.deepEqual(shared.people.map((p) => p.name), ['You', 'Maya']);
  assert.equal(shared.people[1].image, 'data:image/jpeg;base64,AA==');
  assert.deepEqual(shared.days.map((d) => d.people), [[1, 2], [2]]);
  assert.equal(shared.today_count, 1);
});

test('profile pictures reject active image formats before touching storage', async () => {
  const response = await patchSettings(
    { DB: { prepare() { throw new Error('database must not be reached'); } } },
    { person: { id: 1 }, run: {} },
    { profile_image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
  );
  assert.equal(response.status, 400);
});

test('first-time setup requires a name before touching storage', async () => {
  const response = await patchSettings(
    { DB: { prepare() { throw new Error('database must not be reached'); } } },
    { person: { id: 1 }, run: {} },
    { setup: true, name: '   ' },
  );
  assert.equal(response.status, 400);
});

test('participant day details stop at the visible week', async () => {
  const today = localDate(Date.now(), 'UTC');
  const oldDate = addDays(today, -7);
  const response = await getDay(
    { DB: { prepare() { throw new Error('database must not be reached'); } } },
    {
      person: { id: 1, timezone: 'UTC', joined_on: addDays(today, -40) },
      run: { id: 7, mode: 'evergreen' },
    },
    new URL('https://example.com/api/day?date=' + oldDate),
  );
  assert.equal(response.status, 400);
});
