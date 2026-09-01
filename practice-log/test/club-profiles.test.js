import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProfile } from '../src/club/profiles.js';

test('a chosen name is required while context and website stay optional', () => {
  assert.deepEqual(parseProfile({ name: '  Mira  ', line: '  Working with sound.  ' }), {
    ok: true, name: 'Mira', line: 'Working with sound.', website: null, image: null,
  });
  assert.equal(parseProfile({ name: '' }).error, 'name');
  assert.equal(parseProfile({ name: 'Mira', website: 'http://example.com' }).error, 'website');
  assert.equal(parseProfile({ name: 'Mira', website: 'https://example.com' }).website, 'https://example.com/');
});

test('profile images refuse active GIFs while accepting static web images', () => {
  assert.equal(parseProfile({
    name: 'Mira', imageData: 'data:image/png;base64,aGVsbG8=',
  }).image.type, 'image/png');
  assert.equal(parseProfile({
    name: 'Mira', imageData: 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==',
  }).error, 'image');
});
