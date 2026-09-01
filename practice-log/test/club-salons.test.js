import test from 'node:test';
import assert from 'node:assert/strict';
import {
  joinWindow, parseSalonDraft, publicationProblem, validRsvpStatus,
} from '../src/club/salons.js';

test('Salon drafts store one UTC instant and only secure Zoom links', () => {
  const parsed = parseSalonDraft({
    note: ' We will begin quietly. ',
    startsAt: '2026-09-30T18:00:00.000Z',
    durationMinutes: 90,
    zoomUrl: 'https://zoom.us/j/123?pwd=abc',
  });
  assert.deepEqual(parsed, {
    ok: true,
    note: 'We will begin quietly.',
    startsAt: 1790791200,
    duration: 90,
    zoomUrl: 'https://zoom.us/j/123?pwd=abc',
  });
  assert.deepEqual(parseSalonDraft({ zoomUrl: 'http://zoom.us/j/123' }), {
    ok: false, error: 'zoom url',
  });
  assert.deepEqual(parseSalonDraft({ startsAt: 'next Wednesday-ish' }), {
    ok: false, error: 'date',
  });
});

test('publishing requires John’s note, a future instant, and a Zoom doorway', () => {
  const future = 2_000_000_000;
  const complete = {
    host_note: 'Bring whatever the month has left you with.',
    starts_at: future,
    zoom_join_url: 'https://zoom.us/j/123',
  };
  assert.equal(publicationProblem(complete, future - 1000), null);
  assert.equal(publicationProblem({ ...complete, host_note: '' }, future - 1000), 'add your note first');
  assert.equal(publicationProblem({ ...complete, starts_at: null }, future - 1000), 'add the date and time first');
  assert.equal(publicationProblem({ ...complete, zoom_join_url: null }, future - 1000), 'add the Zoom link first');
  assert.equal(publicationProblem(complete, future), 'date must be in the future');
});

test('the Zoom URL is eligible from ten minutes before through the Salon', () => {
  const salon = { starts_at: 2_000_000, duration_minutes: 90 };
  assert.equal(joinWindow(salon, 1_999_399), false);
  assert.equal(joinWindow(salon, 1_999_400), true);
  assert.equal(joinWindow(salon, 2_005_400), true);
  assert.equal(joinWindow(salon, 2_005_401), false);
});

test('RSVP supports in, not this time, and a cleared response only', () => {
  assert.equal(validRsvpStatus('in'), 'in');
  assert.equal(validRsvpStatus('not_this_time'), 'not_this_time');
  assert.equal(validRsvpStatus(null), null);
  assert.equal(validRsvpStatus('maybe'), false);
});
