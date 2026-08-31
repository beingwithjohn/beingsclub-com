import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bearerToken, keyedHash, normalizeEmail, randomCode, randomToken,
  sameText, validChallenge, validCode,
} from '../src/club/security.js';

const env = { LINK_KEY: Buffer.alloc(32, 7).toString('base64') };

test('member email matching is normalized without widening what is accepted', () => {
  assert.equal(normalizeEmail('  John@SpaceToBe.XYZ '), 'john@spacetobe.xyz');
  assert.equal(normalizeEmail('not an email'), null);
  assert.equal(normalizeEmail('a@b'), null);
  assert.equal(normalizeEmail(''), null);
});

test('six digit codes keep leading zeroes and validate exactly', () => {
  for (let index = 0; index < 100; index += 1) assert.match(randomCode(), /^\d{6}$/);
  assert.equal(validCode(' 012345 '), '012345');
  assert.equal(validCode('12345'), null);
  assert.equal(validCode('1234567'), null);
  assert.equal(validCode('12345a'), null);
});

test('opaque challenges and bearer sessions reject malformed input', () => {
  const token = randomToken();
  assert.equal(validChallenge(token), token);
  assert.equal(validChallenge('../token'), null);
  assert.equal(bearerToken(new Request('https://example.test', {
    headers: { authorization: `Bearer ${token}` },
  })), token);
  assert.equal(bearerToken(new Request('https://example.test', {
    headers: { authorization: 'Bearer short' },
  })), null);
});

test('code hashes are purpose-bound and compared without early character exits', async () => {
  const one = await keyedHash(env, 'login-code', 'challenge:123456');
  const again = await keyedHash(env, 'login-code', 'challenge:123456');
  const otherPurpose = await keyedHash(env, 'email-rate', 'challenge:123456');
  assert.equal(one, again);
  assert.notEqual(one, otherPurpose);
  assert.ok(sameText(one, again));
  assert.ok(!sameText(one, otherPurpose));
});
