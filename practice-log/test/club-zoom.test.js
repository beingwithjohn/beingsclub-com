import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createZoomMeeting, deleteZoomMeeting, isZoomJoinUrl, zoomConfigured, zoomMeetingPayload,
} from '../src/club/zoom.js';

const env = {
  ZOOM_ACCOUNT_ID: 'account-id',
  ZOOM_CLIENT_ID: 'client-id',
  ZOOM_CLIENT_SECRET: 'client-secret',
  ZOOM_HOST_USER_ID: 'john@spacetobe.xyz',
};

test('Zoom is configured only when every account credential and host are present', () => {
  assert.equal(zoomConfigured(env), true);
  assert.equal(zoomConfigured({ ...env, ZOOM_CLIENT_SECRET: '' }), false);
  assert.equal(zoomConfigured({}), false);
});

test('automatic Salon meetings use the agreed waiting-room and entry settings', () => {
  assert.deepEqual(zoomMeetingPayload({ starts_at: 1790791200, duration_minutes: 90 }), {
    topic: 'Beings Club Salon',
    type: 2,
    start_time: '2026-09-30T18:00:00Z',
    duration: 90,
    timezone: 'UTC',
    agenda: 'A space for guided curiosity practice and conversation.',
    settings: {
      host_video: false,
      participant_video: false,
      join_before_host: false,
      mute_upon_entry: true,
      waiting_room: true,
      meeting_authentication: false,
      auto_recording: 'none',
      use_pmi: false,
    },
  });
});

test('Zoom creation exchanges account credentials without exposing them to the meeting API', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        access_token: 'access-token', api_url: 'https://api.zoom.us', expires_in: 3600,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      id: 12345678901,
      join_url: 'https://us02web.zoom.us/j/12345678901?pwd=opaque',
      start_url: 'https://zoom.us/s/host-secret',
    }), { status: 201, headers: { 'content-type': 'application/json' } });
  };

  const meeting = await createZoomMeeting(
    env, { starts_at: 1790791200, duration_minutes: 90 }, fakeFetch,
  );
  assert.deepEqual(meeting, {
    meetingId: '12345678901',
    joinUrl: 'https://us02web.zoom.us/j/12345678901?pwd=opaque',
  });
  assert.equal(calls[0].url, 'https://zoom.us/oauth/token');
  const tokenBody = new URLSearchParams(calls[0].options.body);
  assert.equal(tokenBody.get('grant_type'), 'account_credentials');
  assert.equal(tokenBody.get('account_id'), 'account-id');
  assert.equal(calls[1].url, 'https://api.zoom.us/v2/users/john%40spacetobe.xyz/meetings');
  assert.equal(calls[1].options.headers.authorization, 'Bearer access-token');
  assert.equal(calls[1].options.body.includes('client-secret'), false);
});

test('only real HTTPS Zoom meeting doorways are accepted', () => {
  assert.equal(isZoomJoinUrl('https://zoom.us/j/123456789'), true);
  assert.equal(isZoomJoinUrl('https://us02web.zoom.us/j/123456789?pwd=opaque'), true);
  assert.equal(isZoomJoinUrl('http://zoom.us/j/123456789'), false);
  assert.equal(isZoomJoinUrl('https://zoom.us.example.com/j/123456789'), false);
  assert.equal(isZoomJoinUrl('https://example.com/j/123456789'), false);
});

test('deleting an automatic Salon meeting removes it from Zoom', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        access_token: 'access-token', api_url: 'https://api.zoom.us', expires_in: 3600,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(null, { status: 204 });
  };

  assert.equal(await deleteZoomMeeting(env, '12345678901', fakeFetch), true);
  assert.equal(calls[1].url, 'https://api.zoom.us/v2/meetings/12345678901');
  assert.equal(calls[1].options.method, 'DELETE');
  assert.equal(calls[1].options.headers.authorization, 'Bearer access-token');
});
