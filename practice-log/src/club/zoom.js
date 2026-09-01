const TOKEN_URL = 'https://zoom.us/oauth/token';
const DEFAULT_API_URL = 'https://api.zoom.us';

export function zoomConfigured(env) {
  return ['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET', 'ZOOM_HOST_USER_ID']
    .every((key) => typeof env?.[key] === 'string' && env[key].trim());
}

export async function createZoomMeeting(env, salon, fetchImpl = fetch) {
  if (!zoomConfigured(env)) throw new Error('Zoom is not configured');
  const token = await requestAccessToken(env, fetchImpl);
  const endpoint = `${token.apiUrl}/v2/users/${encodeURIComponent(env.ZOOM_HOST_USER_ID.trim())}/meetings`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(zoomMeetingPayload(salon)),
  });
  const data = await responseJson(response);
  if (!response.ok) throw zoomFailure('meeting', response.status, data);
  if (!isZoomJoinUrl(data?.join_url) || data?.id == null) {
    throw new Error('Zoom returned an incomplete meeting');
  }
  return { meetingId: String(data.id), joinUrl: data.join_url };
}

export function zoomMeetingPayload(salon) {
  const startsAt = Number(salon?.starts_at);
  const duration = Number(salon?.duration_minutes || 90);
  if (!Number.isFinite(startsAt) || startsAt <= 0) throw new Error('Salon start time is missing');
  return {
    topic: 'Beings Club Salon',
    type: 2,
    start_time: new Date(startsAt * 1000).toISOString().replace('.000Z', 'Z'),
    duration,
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
  };
}

export function isZoomJoinUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:'
      && (url.hostname === 'zoom.us' || url.hostname.endsWith('.zoom.us'))
      && /^\/j\/\d+/.test(url.pathname);
  } catch {
    return false;
  }
}

async function requestAccessToken(env, fetchImpl) {
  const credentials = btoa(`${env.ZOOM_CLIENT_ID.trim()}:${env.ZOOM_CLIENT_SECRET.trim()}`);
  const body = new URLSearchParams({
    grant_type: 'account_credentials', account_id: env.ZOOM_ACCOUNT_ID.trim(),
  });
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${credentials}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const data = await responseJson(response);
  if (!response.ok || !data?.access_token) throw zoomFailure('token', response.status, data);
  return {
    accessToken: data.access_token,
    apiUrl: validApiUrl(data.api_url) || DEFAULT_API_URL,
  };
}

function validApiUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'api.zoom.us' && !url.hostname.endsWith('.zoom.us')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function responseJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function zoomFailure(stage, status, data) {
  const code = Number.isFinite(Number(data?.code)) ? ` (${Number(data.code)})` : '';
  return new Error(`Zoom ${stage} request failed: ${Number(status) || 0}${code}`);
}
