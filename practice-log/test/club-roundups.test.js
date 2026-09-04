import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoundupItems, storedRoundupItems } from '../src/club/roundups.js';

test('a Salon announcement can carry up to three ordered Field Note references', () => {
  const items = [
    { source: 'member', id: 7 },
    { source: 'host', id: 40 },
  ];
  assert.deepEqual(parseRoundupItems(items), { ok: true, items });
  assert.equal(parseRoundupItems([...items, { source: 'member', id: 8 }, { source: 'member', id: 9 }]).ok, false);
  assert.equal(parseRoundupItems([{ source: 'report', id: 1 }]).ok, false);
  assert.equal(parseRoundupItems([{ source: 'member', id: 7 }, { source: 'member', id: 7 }]).ok, false);
  assert.deepEqual(storedRoundupItems(JSON.stringify(items)), items);
  assert.deepEqual(storedRoundupItems('not json'), []);
});
