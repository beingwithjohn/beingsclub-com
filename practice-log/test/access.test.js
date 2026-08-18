import test from 'node:test';
import assert from 'node:assert/strict';
import { messageAccess } from '../src/access.js';

test('course message access includes both boundary dates', () => {
  const p = { message_from: '2026-09-15', message_until: '2026-10-20' };
  assert.equal(messageAccess(p, '2026-09-14').active, false);
  assert.equal(messageAccess(p, '2026-09-15').active, true);
  assert.equal(messageAccess(p, '2026-10-20').active, true);
  assert.equal(messageAccess(p, '2026-10-21').active, false);
});

test('missing or malformed access dates never open the private line', () => {
  assert.equal(messageAccess({}, '2026-09-15').active, false);
  assert.equal(messageAccess({ message_from: 'soon', message_until: 'later' }, '2026-09-15').active, false);
  assert.equal(messageAccess({ message_from: '2026-10-20', message_until: '2026-09-15' }, '2026-09-20').active, false);
});

