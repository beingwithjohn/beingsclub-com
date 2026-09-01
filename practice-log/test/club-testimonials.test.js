import test from 'node:test';
import assert from 'node:assert/strict';
import { clubMonth, parseTestimonial } from '../src/club/testimonials.js';

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
