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
    DB: firstDb({ amount: 1200, currency: 'gbp', status: 'active', cancel_at_period_end: 0 }),
  }, { id: 7, email: 'member@example.com', display_name: 'Member' });
  const body = await response.json();
  assert.deepEqual(body.monthlyGiving, { active: true, amount: 1200, currency: 'gbp' });
});

test('the monthly notice disappears as soon as cancellation is scheduled', async () => {
  const response = await getMemberGiving({
    MEMBERS: firstDb(null),
    DB: firstDb({ amount: 1200, currency: 'gbp', status: 'active', cancel_at_period_end: 1 }),
  }, { id: 7, email: 'member@example.com', display_name: 'Member' });
  assert.equal((await response.json()).monthlyGiving, null);
});
