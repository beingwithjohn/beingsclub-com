const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const B64URL = /^[A-Za-z0-9_-]{20,100}$/;
const encoder = new TextEncoder();

export function normalizeEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return EMAIL.test(email) && email.length <= 200 ? email : null;
}

export function validChallenge(value) {
  const challenge = String(value ?? '');
  return B64URL.test(challenge) ? challenge : null;
}

export function validCode(value) {
  const code = String(value ?? '').trim();
  return /^\d{6}$/.test(code) ? code : null;
}

export function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let text = '';
  for (const byte of data) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomCode() {
  // Rejection sampling avoids favouring any six-digit code.
  const ceiling = Math.floor(0x100000000 / 1000000) * 1000000;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= ceiling);
  return String(values[0] % 1000000).padStart(6, '0');
}

async function key(env) {
  if (!env.LINK_KEY) throw new Error('LINK_KEY is not set');
  const raw = Uint8Array.from(atob(env.LINK_KEY), (char) => char.charCodeAt(0));
  if (raw.length !== 32) throw new Error('LINK_KEY must be 32 bytes, base64');
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function keyedHash(env, purpose, value) {
  const signature = await crypto.subtle.sign(
    'HMAC', await key(env), encoder.encode(`beings-club:${purpose}:${value}`),
  );
  return hex(new Uint8Array(signature));
}

export async function tokenHash(token) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return hex(new Uint8Array(digest));
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function sameText(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function bearerToken(request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
  return match && B64URL.test(match[1]) ? match[1] : null;
}
