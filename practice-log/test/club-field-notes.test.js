import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inviteFieldNoteAttendees, parseFieldNote, parseHostFieldPost, parseImageData,
} from '../src/club/field-notes.js';

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

test('host posts distinguish announcements from signed host Field Notes', () => {
  assert.deepEqual(parseHostFieldPost({
    kind: 'announcement', title: '  A small change  ', body: '  We gather here.  ',
  }), {
    ok: true,
    body: 'We gather here.',
    linkUrl: null,
    image: null,
    imageAlt: null,
    isAnonymous: false,
    kind: 'announcement',
    salonId: null,
    title: 'A small change',
  });
  assert.equal(parseHostFieldPost({ kind: 'field_note', salonId: 9, linkUrl: 'https://example.com/' }).ok, true);
  assert.equal(parseHostFieldPost({ kind: 'field_note', body: 'A thought' }).error, 'salon');
  assert.equal(parseHostFieldPost({ kind: 'notice', body: 'Hello' }).error, 'kind');
  assert.equal(parseHostFieldPost({ kind: 'announcement', title: 'Only a title' }).ok, true);
  assert.equal(parseHostFieldPost({ kind: 'announcement', title: 'x'.repeat(121), body: 'Hello' }).error, 'title too long');
});

test('an attended Salon always sends its one Field Note invitation to an active member', async () => {
  const original = globalThis.fetch;
  let allowedSql = ''; let attendanceArgs; let queued; let emailRequest;
  globalThis.fetch = async (url, options) => {
    emailRequest = { url, options };
    return new Response(JSON.stringify({ id: 'field-note-mail' }), { status: 200 });
  };
  const env = {
    RESEND_API_KEY: 'test-key',
    MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
    MEMBERS: {
      prepare(sql) {
        return {
          args: [],
          bind(...args) { this.args = args; return this; },
          async first() {
            if (/SELECT \* FROM salon WHERE id/.test(sql)) {
              return { id: 4, starts_at: 2_000_000_000, duration_minutes: 90, status: 'closed' };
            }
            return null;
          },
          async all() {
            if (/SELECT m\.id, m\.email, m\.display_name/.test(sql)) {
              allowedSql = sql;
              return { results: [{ id: 2, email: 'mira@example.test', display_name: 'Mira' }] };
            }
            return { results: [] };
          },
          async run() {
            if (/INSERT INTO salon_attendance/.test(sql)) attendanceArgs = this.args;
            return { meta: { changes: 1 } };
          },
        };
      },
      async batch(statements) {
        for (const statement of statements) await statement.run();
        return statements.map(() => ({ success: true }));
      },
    },
  };
  try {
    const response = await inviteFieldNoteAttendees(
      env, { id: 1 }, 4, { memberIds: [2] }, { waitUntil(value) { queued = value; } }, 2_000_010_000,
    );
    assert.equal(response.status, 200);
    await queued;
    assert.match(allowedSql, /m\.paused_at IS NULL/);
    assert.doesNotMatch(allowedSql, /member_email_pref|field_note_email|email_quiet/);
    assert.equal(attendanceArgs[4], 2_000_010_000);
    assert.match(emailRequest.url, /api\.resend\.com/);
  } finally {
    globalThis.fetch = original;
  }
});
