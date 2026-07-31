import test from 'node:test';
import assert from 'node:assert/strict';
import { originAllowed } from '../src/index.js';

const LIVE = ['https://beingsclub.com'];
const DEV = ['http://localhost:*'];

test('the live origin is matched exactly and nothing else is', () => {
  assert.ok(originAllowed(LIVE, 'https://beingsclub.com'));

  assert.ok(!originAllowed(LIVE, 'http://beingsclub.com'));          // wrong scheme
  assert.ok(!originAllowed(LIVE, 'https://beingsclub.com.evil.com'));
  assert.ok(!originAllowed(LIVE, 'https://evil.com'));
  assert.ok(!originAllowed(LIVE, 'https://www.beingsclub.com'));
  assert.ok(!originAllowed(LIVE, 'null'));
  assert.ok(!originAllowed(LIVE, ''));
});

test('a live config never gains a wildcard by accident', () => {
  // The production origin has no `:*`, so no port form of it is allowed either.
  assert.ok(!originAllowed(LIVE, 'https://beingsclub.com:8443'));
});

test('the dev wildcard matches a port and only a port', () => {
  assert.ok(originAllowed(DEV, 'http://localhost:4173'));
  assert.ok(originAllowed(DEV, 'http://localhost:8787'));
  assert.ok(originAllowed(DEV, 'http://localhost:1'));

  // The whole point: everything after the colon must be digits.
  assert.ok(!originAllowed(DEV, 'http://localhost:4173.evil.com'));
  assert.ok(!originAllowed(DEV, 'http://localhost:evil'));
  assert.ok(!originAllowed(DEV, 'http://localhost:'));
  assert.ok(!originAllowed(DEV, 'http://localhost'));
  assert.ok(!originAllowed(DEV, 'http://localhost.evil.com'));
  assert.ok(!originAllowed(DEV, 'https://localhost:4173'));   // wrong scheme
  assert.ok(!originAllowed(DEV, 'http://notlocalhost:4173'));
});

test('an empty configuration allows nothing', () => {
  assert.ok(!originAllowed([], 'https://beingsclub.com'));
  assert.ok(!originAllowed([], 'http://localhost:4173'));
});

test('several origins can be configured at once', () => {
  const both = ['https://beingsclub.com', 'http://localhost:*'];
  assert.ok(originAllowed(both, 'https://beingsclub.com'));
  assert.ok(originAllowed(both, 'http://localhost:4173'));
  assert.ok(!originAllowed(both, 'https://evil.com'));
});
