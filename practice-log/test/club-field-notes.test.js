import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFieldNote, parseImageData } from '../src/club/field-notes.js';

test('a Field Note may contain words, a secure link, an image, or a combination', () => {
  assert.deepEqual(parseFieldNote({ body: '  A question stayed with me.  ', isAnonymous: true }), {
    ok: true,
    body: 'A question stayed with me.',
    linkUrl: null,
    image: null,
    imageAlt: null,
    isAnonymous: true,
  });
  assert.equal(parseFieldNote({}).error, 'add something');
  assert.equal(parseFieldNote({ linkUrl: 'http://example.com' }).error, 'link');
  assert.equal(parseFieldNote({ linkUrl: 'https://example.com/a' }).linkUrl, 'https://example.com/a');
  assert.equal(parseFieldNote({}, { hasImage: true }).ok, true);
});

test('Field Note images accept only bounded web image data', () => {
  const png = parseImageData('data:image/png;base64,aGVsbG8=');
  assert.equal(png.type, 'image/png');
  assert.equal(new TextDecoder().decode(png.bytes), 'hello');
  assert.equal(parseImageData('data:image/svg+xml;base64,PHN2Zy8+'), null);
  assert.equal(parseImageData('https://example.com/image.jpg'), null);
});
