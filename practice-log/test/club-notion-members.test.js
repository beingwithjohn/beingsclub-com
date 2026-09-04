import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inviteNotionMembers, queueMemberNotionSync, runMemberNotionSync, syncMemberToNotion,
} from '../src/club/notion-members.js';

function notionDb(member) {
  const runs = [];
  return {
    runs,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          return sql.includes('FROM member m JOIN member_notion_sync') ? { ...member } : null;
        },
        async all() {
          return sql.includes('SELECT member_id FROM member_notion_sync')
            ? { results: [{ member_id: member.id }] } : { results: [] };
        },
        async run() {
          runs.push({ sql, args });
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}

const configured = (members) => ({
  MEMBERS: members,
  NOTION_API_KEY: 'notion-secret',
  NOTION_MEMBERS_DATA_SOURCE_ID: '38dd39b4-61ab-8000-bccd-000b0af707d8',
});

test('a membership grant is queued before its immediate Notion sync', async () => {
  const original = globalThis.fetch;
  const members = notionDb({
    id: 7, email: 'mira@example.test', display_name: 'Mira', notion_page_id: null,
  });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/query')) {
      return Response.json({ results: [] });
    }
    return Response.json({ id: 'notion-page-7' }, { status: 201 });
  };
  try {
    const waits = [];
    await queueMemberNotionSync(configured(members), 7, {
      waitUntil(promise) { waits.push(promise); },
    }, 2_000_000_000);
    assert.equal(waits.length, 1);
    assert.match(members.runs[0].sql, /INSERT INTO member_notion_sync/);
    assert.deepEqual(members.runs[0].args, [7, 2_000_000_000]);
    assert.equal(await waits[0], true);
    assert.equal(requests.length, 2);
    const query = JSON.parse(requests[0].options.body);
    assert.deepEqual(query.filter, {
      property: 'Email', email: { equals: 'mira@example.test' },
    });
    const create = JSON.parse(requests[1].options.body);
    assert.equal(create.parent.type, 'data_source_id');
    assert.equal(create.properties.Name.title[0].text.content, 'Mira');
    assert.equal(create.properties.Email.email, 'mira@example.test');
    assert.equal(requests[1].options.headers.authorization, 'Bearer notion-secret');
    assert.equal(requests[1].options.headers['notion-version'], '2026-03-11');
    assert.match(members.runs.at(-1).sql, /notion_page_id = \?1, synced_at = \?2/);
  } finally {
    globalThis.fetch = original;
  }
});

test('an existing Notion member is updated by page id rather than duplicated', async () => {
  const original = globalThis.fetch;
  const members = notionDb({
    id: 8, email: 'alex@example.test', display_name: 'Alex', notion_page_id: null,
  });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/query')) {
      return Response.json({ results: [{ id: 'existing-page', in_trash: false }] });
    }
    return Response.json({ id: 'existing-page' });
  };
  try {
    assert.equal(await syncMemberToNotion(configured(members), 8, 2_000_000_100), true);
    assert.match(requests[1].url, /\/pages\/existing-page$/);
    assert.equal(requests[1].options.method, 'PATCH');
  } finally {
    globalThis.fetch = original;
  }
});

test('an existing Notion name is not replaced by an email when D1 has no chosen name', async () => {
  const original = globalThis.fetch;
  const members = notionDb({
    id: 11, email: 'existing@example.test', display_name: null, notion_page_id: null,
  });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/query')) {
      return Response.json({ results: [{ id: 'named-page', in_trash: false }] });
    }
    return Response.json({ id: 'named-page' });
  };
  try {
    assert.equal(await syncMemberToNotion(configured(members), 11, 2_000_000_150), true);
    const update = JSON.parse(requests[1].options.body);
    assert.deepEqual(update.properties, { Email: { email: 'existing@example.test' } });
  } finally {
    globalThis.fetch = original;
  }
});

test('a failed Notion request remains queued for the scheduled retry', async () => {
  const original = globalThis.fetch;
  const members = notionDb({
    id: 9, email: 'jo@example.test', display_name: null, notion_page_id: null,
  });
  globalThis.fetch = async () => Response.json(
    { message: 'temporary problem' }, { status: 503 },
  );
  try {
    assert.equal(await syncMemberToNotion(configured(members), 9, 2_000_000_200), false);
    const failure = members.runs.at(-1);
    assert.match(failure.sql, /attempts = attempts \+ 1/);
    assert.deepEqual(failure.args, ['Notion 503: temporary problem', 9]);
  } finally {
    globalThis.fetch = original;
  }
});

test('the scheduled run leaves the queue alone until Notion is configured', async () => {
  const members = notionDb({ id: 10, email: 'sam@example.test' });
  assert.deepEqual(await runMemberNotionSync({ MEMBERS: members }), {
    configured: false, synced: 0, failed: 0,
  });
  assert.equal(members.runs.length, 0);
});

test('the confirmed Notion transition sends each ready invitation once and marks its page', async () => {
  const original = globalThis.fetch;
  const member = {
    id: 12, email: 'ana@example.test', joined_at: null,
    disabled_at: null, left_at: null, invitation_sent_at: null,
  };
  const runs = [];
  const members = {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async all() {
          return sql.includes('FROM member') ? { results: [{ ...member }] } : { results: [] };
        },
        async first() { return { ...member }; },
        async run() { runs.push({ sql, args }); return { meta: { changes: 1 } }; },
      };
    },
  };
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/query')) {
      return Response.json({
        results: [{
          id: 'notion-ana', in_trash: false,
          properties: {
            Name: { title: [{ plain_text: 'Ana' }] },
            Email: { email: 'Ana@example.test' },
            'Reboot Invite Sent?': { checkbox: false },
          },
        }],
        has_more: false,
      });
    }
    if (String(url) === 'https://api.resend.com/emails') {
      return Response.json({ id: 'email-ana' });
    }
    return Response.json({ id: 'notion-ana' });
  };
  try {
    const response = await inviteNotionMembers({
      ...configured(members),
      RESEND_API_KEY: 'resend-secret',
      MAIL_FROM: 'Beings Club <practice@beingsclub.com>',
      MAIL_REPLY_TO: 'john@spacetobe.xyz',
    }, { confirmation: 'INVITE NOTION MEMBERS' });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.sentCount, 1);
    assert.equal(result.failedCount, 0);
    const email = requests.find((request) => request.url === 'https://api.resend.com/emails');
    assert.equal(email.options.headers['idempotency-key'], 'club-reboot-12-2026');
    const emailBody = JSON.parse(email.options.body);
    assert.match(emailBody.text, /^Hello, Ana\./);
    const notionMark = requests.find((request) => request.url.endsWith('/pages/notion-ana'));
    assert.deepEqual(JSON.parse(notionMark.options.body).properties, {
      'Reboot Invite Sent?': { checkbox: true },
    });
    assert.equal(runs.some((run) => run.sql.includes('invitation_sent_at = ?1')), true);
  } finally {
    globalThis.fetch = original;
  }
});
