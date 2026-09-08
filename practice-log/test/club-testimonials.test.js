import test from 'node:test';
import assert from 'node:assert/strict';
import { clubMonth, getMemberGiving, parseTestimonial } from '../src/club/testimonials.js';

function firstDb(value) {
  return {
    prepare() {
      return { bind() { return this; }, async first() { return value; } };
    },
  };
}

function givingDb({ subscription = null, recentGift = null } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, values: [] };
      calls.push(call);
      return {
        bind(...values) { call.values = values; return this; },
        async first() { return sql.includes('FROM gift') ? recentGift : subscription; },
      };
    },
  };
}

test('testimonials require words, a public name, and explicit permission', () => {
  assert.deepEqual(parseTestimonial({
    name: '  John  ', body: '  This changed something.  ', consent: true,
  }), { ok: true, name: 'John', body: 'This changed something.' });
  assert.equal(parseTestimonial({ body: 'Words', consent: true }).error, 'name');
  assert.equal(parseTestimonial({ name: 'John', consent: true }).error, 'testimonial');
  assert.equal(parseTestimonial({ name: 'John', body: 'Words' }).error, 'permission');
});

test('one-per-month uses the Beings Club month at the UK boundary', () => {
  assert.equal(clubMonth(Date.parse('2026-08-31T22:30:00Z') / 1000), '2026-08');
  assert.equal(clubMonth(Date.parse('2026-08-31T23:30:00Z') / 1000), '2026-09');
});

test('member Giving exposes an active monthly gift matched by sign-in email', async () => {
  const response = await getMemberGiving({
    MEMBERS: firstDb(null),
    DB: givingDb({
      subscription: { amount: 1200, currency: 'gbp', status: 'active', cancel_at_period_end: 0 },
    }),
  }, { id: 7, email: 'member@example.com', display_name: 'Member' });
  const body = await response.json();
  assert.deepEqual(body.monthlyGiving, { active: true, amount: 1200, currency: 'gbp' });
  assert.equal(body.suppressFieldNoteGivingAppeal, true);
});

test('the monthly notice disappears as soon as cancellation is scheduled', async () => {
  const response = await getMemberGiving({
    MEMBERS: firstDb(null),
    DB: givingDb({
      subscription: { amount: 1200, currency: 'gbp', status: 'active', cancel_at_period_end: 1 },
    }),
  }, { id: 7, email: 'member@example.com', display_name: 'Member' });
  assert.equal((await response.json()).monthlyGiving, null);
});

test('a gift in the previous 30 days suppresses the post-Field Note appeal', async () => {
  const timestamp = Date.parse('2026-09-07T12:00:00Z') / 1000;
  const db = givingDb({ recentGift: { recent: 1 } });
  const response = await getMemberGiving({
    MEMBERS: firstDb(null), DB: db,
  }, { id: 7, email: 'member@example.com', display_name: 'Member' }, timestamp);
  const body = await response.json();
  assert.equal(body.recentGift, true);
  assert.equal(body.suppressFieldNoteGivingAppeal, true);
  const giftQuery = db.calls.find((call) => call.sql.includes('FROM gift'));
  assert.deepEqual(giftQuery.values, ['member@example.com', timestamp - (30 * 24 * 60 * 60)]);
});

test('a member without recent or active giving still sees the post-Field Note appeal', async () => {
  const response = await getMemberGiving({
    MEMBERS: firstDb(null), DB: givingDb(),
  }, { id: 7, email: 'member@example.com', display_name: 'Member' });
  const body = await response.json();
  assert.equal(body.recentGift, false);
  assert.equal(body.monthlyGiving, null);
  assert.equal(body.suppressFieldNoteGivingAppeal, false);
});
