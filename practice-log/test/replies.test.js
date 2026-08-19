import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteReplyAudioForPerson, getReplyAudio, listReplies } from '../src/replies.js';

const run = { mode: 'evergreen' };

function repliesDb({ marked = false, replyRows = [], audioRow = null } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, values: [] };
      calls.push(call);
      return {
        bind(...values) { call.values = values; return this; },
        async first() {
          if (/FROM day_mark/.test(sql)) return marked ? { 1: 1 } : null;
          if (/FROM host_reply WHERE id/.test(sql)) return audioRow;
          return null;
        },
        async all() {
          if (/FROM host_reply/.test(sql)) {
            const [personId, sharedOpen] = call.values;
            return {
              results: replyRows.filter((row) =>
                row.recipient_person_id === personId || (row.visibility === 'shared' && sharedOpen === 1)),
            };
          }
          return { results: [] };
        },
      };
    },
  };
}

const rows = [
  {
    id: 1, recipient_person_id: 7, visibility: 'private', public_context: 'must not leak',
    body: 'For one person', audio_object: null, created_at: 10,
  },
  {
    id: 2, recipient_person_id: 7, visibility: 'shared', public_context: 'A public question',
    body: 'Shared, prompted by you', audio_object: 'own-audio', audio_mime: 'audio/webm', created_at: 20,
  },
  {
    id: 3, recipient_person_id: 99, visibility: 'shared', public_context: 'Another public question',
    body: 'Shared, prompted by another person', audio_object: null, created_at: 30,
  },
];

test('before today’s tap, a person receives only replies prompted by their own words', async () => {
  const DB = repliesDb({ marked: false, replyRows: rows });
  const response = await listReplies({ DB }, {
    person: { id: 7, timezone: 'Europe/Lisbon' }, run,
  });
  const data = await response.json();

  assert.deepEqual(data.replies.map((reply) => reply.id), [1, 2]);
  assert.equal(data.replies[0].context, null, 'private public_context must never be returned');
  assert.equal(data.replies[1].context, 'A public question');
  assert.equal('recipient_person_id' in data.replies[1], false);
});

test('after today’s tap, shared replies prompted by other people also appear', async () => {
  const DB = repliesDb({ marked: true, replyRows: rows });
  const response = await listReplies({ DB }, {
    person: { id: 7, timezone: 'Europe/Lisbon' }, run,
  });
  const data = await response.json();

  assert.deepEqual(data.replies.map((reply) => reply.id), [1, 2, 3]);
  assert.equal(data.replies.find((reply) => reply.id === 3).for_you, false);
});

test('private recordings return not found to everybody except their recipient or the host', async () => {
  let gets = 0;
  const DB = repliesDb({
    audioRow: { recipient_person_id: 7, visibility: 'private', audio_object: 'private-key', audio_mime: 'audio/webm' },
  });
  const AUDIO = { async get() { gets++; return { body: new Uint8Array([1]), size: 1 }; } };

  const denied = await getReplyAudio({ DB, AUDIO }, {
    person: { id: 8, is_host: false, timezone: 'Europe/Lisbon' }, run,
  }, 1);
  assert.equal(denied.status, 404);
  assert.equal(gets, 0);

  const allowed = await getReplyAudio({ DB, AUDIO }, {
    person: { id: 7, is_host: false, timezone: 'Europe/Lisbon' }, run,
  }, 1);
  assert.equal(allowed.status, 200);
  assert.equal(gets, 1);
});

test('another person’s shared recording opens only after today’s tap', async () => {
  const audioRow = {
    recipient_person_id: 99, visibility: 'shared', audio_object: 'shared-key', audio_mime: 'audio/webm',
  };
  const AUDIO = { async get() { return { body: new Uint8Array([1, 2]), size: 2 }; } };

  const closed = await getReplyAudio({ DB: repliesDb({ marked: false, audioRow }), AUDIO }, {
    person: { id: 7, is_host: false, timezone: 'Europe/Lisbon' }, run,
  }, 2);
  assert.equal(closed.status, 404);

  const open = await getReplyAudio({ DB: repliesDb({ marked: true, audioRow }), AUDIO }, {
    person: { id: 7, is_host: false, timezone: 'Europe/Lisbon' }, run,
  }, 2);
  assert.equal(open.status, 200);
  assert.equal(open.headers.get('cache-control'), 'private, no-store');
});

test('account erasure removes every stored recording tied to that person', async () => {
  const DB = repliesDb({
    replyRows: [
      { recipient_person_id: 7, audio_object: 'one' },
      { recipient_person_id: 7, audio_object: 'two' },
    ],
  });
  const removed = [];
  await deleteReplyAudioForPerson({ DB, AUDIO: { async delete(keys) { removed.push(...keys); } } }, 7);
  assert.deepEqual(removed, ['one', 'two']);
});
