import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inviteFieldNoteAttendees, parseFieldNote, parseHostFieldPost, parseImageData,
  runFieldNoteReminders, setFieldNotePostable, setHostFieldPostPostable,
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

test('a member may add or remove one private postable mark', async () => {
  const writes = [];
  const env = {
    MEMBERS: {
      prepare(sql) {
        return {
          args: [],
          bind(...args) { this.args = args; return this; },
          async first() {
            if (/COUNT\(\*\)/.test(sql)) return { n: 3 };
            if (/SELECT id FROM field_note/.test(sql)) return { id: 8 };
            return null;
          },
          async run() { writes.push({ sql, args: this.args }); return { meta: { changes: 1 } }; },
        };
      },
    },
  };
  const added = await setFieldNotePostable(env, { id: 4 }, 8, { postable: true }, 1000);
  assert.deepEqual(await added.json(), { ok: true, postable: true, count: 3 });
  assert.match(writes[0].sql, /ON CONFLICT\(field_note_id, member_id\)/);
  assert.deepEqual(writes[0].args, [8, 4, 1000]);

  const removed = await setFieldNotePostable(env, { id: 4 }, 8, { postable: false }, 1001);
  assert.deepEqual(await removed.json(), { ok: true, postable: false, count: 3 });
  assert.match(writes[1].sql, /DELETE FROM field_note_postable_vote/);
  assert.deepEqual(writes[1].args, [8, 4]);
});

test('a host-authored Field Note accepts the same private postable mark', async () => {
  const writes = [];
  const env = {
    MEMBERS: {
      prepare(sql) {
        return {
          args: [],
          bind(...args) { this.args = args; return this; },
          async first() {
            if (/COUNT\(\*\)/.test(sql)) return { n: 2 };
            if (/kind = 'field_note'/.test(sql)) return { id: 12 };
            return null;
          },
          async run() { writes.push({ sql, args: this.args }); return { meta: { changes: 1 } }; },
        };
      },
    },
  };
  const response = await setHostFieldPostPostable(
    env, { id: 4 }, 12, { postable: true }, 1000,
  );
  assert.deepEqual(await response.json(), { ok: true, postable: true, count: 2 });
  assert.match(writes[0].sql, /ON CONFLICT\(host_field_post_id, member_id\)/);
  assert.deepEqual(writes[0].args, [12, 4, 1000]);
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
    assert.match(JSON.parse(emailRequest.options.body).text, /next=field-notes/);
  } finally {
    globalThis.fetch = original;
  }
});

test('an unanswered Field Note invitation gets one reminder after two days', async () => {
  const original = globalThis.fetch;
  const claims = new Set(); const requests = []; let eligibilitySql = ''; let cutoff;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ id: 'field-note-reminder' }), { status: 200 });
  };
  const timestamp = 2_000_000_000;
  const env = {
    RESEND_API_KEY: 'test-key',
    MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
    MEMBERS: {
      prepare(sql) {
        return {
          args: [],
          bind(...args) { this.args = args; return this; },
          async all() {
            if (/FROM salon_attendance a/.test(sql)) {
              eligibilitySql = sql; [cutoff] = this.args;
              return { results: [{
                salon_id: 4, member_id: 2, prompted_at: timestamp - (3 * 86400),
                starts_at: timestamp - (4 * 86400), email: 'mira@example.test',
                display_name: 'Mira',
              }] };
            }
            return { results: [] };
          },
          async run() {
            if (/INSERT INTO club_send_log/.test(sql)) {
              const key = `${this.args[0]}:${this.args[1]}`;
              if (claims.has(key)) return { meta: { changes: 0 } };
              claims.add(key); return { meta: { changes: 1 } };
            }
            return { meta: { changes: 1 } };
          },
        };
      },
    },
  };
  try {
    assert.deepEqual(await runFieldNoteReminders(env, timestamp), { sent: 1 });
    assert.deepEqual(await runFieldNoteReminders(env, timestamp + 1800), { sent: 0 });
    assert.equal(cutoff, timestamp + 1800 - (2 * 86400));
    assert.match(eligibilitySql, /a\.dismissed_at IS NULL/);
    assert.match(eligibilitySql, /NOT EXISTS \(\s*SELECT 1 FROM field_note/);
    assert.match(eligibilitySql, /m\.paused_at IS NULL/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.subject, 'A Field Note, if you’d like');
    assert.match(requests[0].body.text, /next=field-notes/);
    assert.equal(requests[0].headers['idempotency-key'], 'club-field-note-reminder-4-2');
  } finally {
    globalThis.fetch = original;
  }
});
