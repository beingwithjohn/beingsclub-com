import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteHostSalon, joinWindow, parseSalonDraft, publicationProblem, salonHasEnded, validRsvpStatus,
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
  assert.deepEqual(parseSalonDraft({ zoomUrl: 'https://example.com/j/123' }), {
    ok: false, error: 'zoom url',
  });
  assert.deepEqual(parseSalonDraft({ startsAt: 'next Wednesday-ish' }), {
    ok: false, error: 'date',
  });
});

test('publishing requires John’s note, a future instant, and a Zoom doorway once provisioned', () => {
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
  assert.equal(publicationProblem({ ...complete, zoom_join_url: null }, future - 1000, false), null);
  assert.equal(publicationProblem(complete, future), 'date must be in the future');
});

test('the Zoom URL is eligible from ten minutes before through the Salon', () => {
  const salon = { starts_at: 2_000_000, duration_minutes: 90 };
  assert.equal(joinWindow(salon, 1_999_399), false);
  assert.equal(joinWindow(salon, 1_999_400), true);
  assert.equal(joinWindow(salon, 2_005_400), true);
  assert.equal(joinWindow(salon, 2_005_401), false);
});

test('a completed Salon can make way for the next one only after it ends', () => {
  const salon = { starts_at: 2_000_000, duration_minutes: 90 };
  assert.equal(salonHasEnded(salon, 2_005_400), false);
  assert.equal(salonHasEnded(salon, 2_005_401), true);
  assert.equal(salonHasEnded({ starts_at: null, duration_minutes: 90 }, 2_005_401), false);
});

test('RSVP supports in, not this time, and a cleared response only', () => {
  assert.equal(validRsvpStatus('in'), 'in');
  assert.equal(validRsvpStatus('not_this_time'), 'not_this_time');
  assert.equal(validRsvpStatus(null), null);
  assert.equal(validRsvpStatus('maybe'), false);
});

test('deleting an upcoming Salon removes its managed Zoom meeting first', async () => {
  const calls = [];
  let deleted = false;
  const env = {
    ZOOM_ACCOUNT_ID: 'account-id', ZOOM_CLIENT_ID: 'client-id',
    ZOOM_CLIENT_SECRET: 'client-secret', ZOOM_HOST_USER_ID: 'john@example.test',
    MEMBERS: {
      prepare(sql) {
        return {
          async first() {
            if (sql.includes('SELECT s.*')) return null;
            return null;
          },
          bind(...args) {
            return {
              async first() {
                if (sql.includes('SELECT * FROM salon')) return {
                  id: 7, status: 'published', starts_at: 2_000_000_000,
                  zoom_meeting_id: '12345678901',
                };
                return null;
              },
              async run() {
                calls.push({ sql, args });
                if (sql.includes('DELETE FROM salon')) deleted = true;
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options, deleted });
    if (String(url).includes('/oauth/token')) {
      return new Response(JSON.stringify({ access_token: 'token', api_url: 'https://api.zoom.us' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 204 });
  };

  const response = await deleteHostSalon(env, { id: 7 }, 1_900_000_000, fetchImpl);
  assert.deepEqual(await response.json(), {
    salon: null, rsvps: [], capabilities: { autoZoom: true },
  });
  const zoomDelete = calls.find((call) => call.url?.includes('/v2/meetings/'));
  const dbDelete = calls.find((call) => call.sql?.includes('DELETE FROM salon'));
  assert.equal(zoomDelete.deleted, false);
  assert.ok(dbDelete);
});
