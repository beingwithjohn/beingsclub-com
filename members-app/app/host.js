(() => {
  'use strict';
  const API = document.querySelector('meta[name="bc-members-api"]').content;
  const KEY = 'bc_member_session_v1';
  const shell = document.getElementById('host-shell');
  const waiting = document.getElementById('host-waiting');
  const list = document.getElementById('member-list');
  const form = document.getElementById('invite-form');
  const status = document.getElementById('invite-status');
  let pendingRemove = null;

  function token() { try { return localStorage.getItem(KEY); } catch (_) { return null; } }
  function forgetToken() { try { localStorage.removeItem(KEY); } catch (_) {} }
  async function call(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token() || ''}`,
        ...(options.headers || {}),
      },
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw Object.assign(new Error(data.error || 'request failed'), { status: response.status });
    return data;
  }

  function text(tag, className, value) {
    const node = document.createElement(tag); node.className = className; node.textContent = value; return node;
  }

  function render(members) {
    list.replaceChildren();
    members.filter((member) => member.status !== 'removed').forEach((member) => {
      const row = document.createElement('div'); row.className = 'member-row'; row.dataset.memberId = String(member.id);
      const identity = document.createElement('div'); identity.className = 'member-identity';
      identity.append(text('span', 'member-email', member.email));
      if (member.name) identity.append(text('span', 'member-name', member.name));
      const actions = document.createElement('div'); actions.className = 'member-actions';
      const state = member.isHost ? 'host' : member.status;
      actions.append(text('span', `member-status ${state}`, state));
      if (member.canRemove) {
        if (pendingRemove === member.id) {
          const keep = text('button', 'confirm-button', 'keep'); keep.type = 'button';
          keep.addEventListener('click', () => { pendingRemove = null; render(members); });
          const remove = text('button', 'confirm-button danger', 'remove'); remove.type = 'button';
          remove.addEventListener('click', () => removeMember(member.id));
          actions.append(keep, remove);
        } else {
          const remove = text('button', 'remove-button', '×'); remove.type = 'button';
          remove.title = 'remove from the list'; remove.setAttribute('aria-label', `Remove ${member.email}`);
          remove.addEventListener('click', () => { pendingRemove = member.id; render(members); });
          actions.append(remove);
        }
      }
      row.append(identity, actions); list.append(row);
    });
  }

  async function loadMembers() {
    const data = await call('/api/club/host/members'); render(data.members);
  }

  async function removeMember(id) {
    status.textContent = '';
    try { await call(`/api/club/host/members/${id}`, { method: 'DELETE' }); pendingRemove = null; await loadMembers(); }
    catch (_) { status.textContent = 'That person could not be removed. Try again.'; }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); status.textContent = '';
    const input = document.getElementById('invite-email');
    if (!input.checkValidity()) { input.reportValidity(); return; }
    const button = form.querySelector('button'); button.disabled = true;
    try {
      await call('/api/club/host/members', { method: 'POST', body: JSON.stringify({ email: input.value }) });
      input.value = ''; status.textContent = 'Added to the list.'; await loadMembers(); input.focus();
    } catch (_) { status.textContent = 'That address could not be added. Try again.'; }
    finally { button.disabled = false; }
  });

  function updateClock() {
    const now = new Date(); const days = ['su','mo','tu','we','th','fr','sa'];
    const month = now.toLocaleString('en-GB', { month: 'short' }).toLowerCase();
    document.getElementById('clock').textContent = `${days[now.getDay()]} ${now.getDate()} ${month} ${String(now.getFullYear()).slice(2)} · ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const greeting = now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening';
    document.querySelector('.greeting').textContent = `good ${greeting}, John`;
  }

  async function signOut() {
    try { await call('/api/club/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
    forgetToken(); location.replace('/members/');
  }
  document.getElementById('host-sign-out').addEventListener('click', signOut);
  document.getElementById('mobile-sign-out').addEventListener('click', signOut);
  const menu = document.getElementById('mobile-menu'); const menuButton = document.getElementById('menu-button');
  menuButton.addEventListener('click', () => { menu.hidden = false; menuButton.setAttribute('aria-expanded', 'true'); });
  document.getElementById('menu-close').addEventListener('click', () => { menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); menuButton.focus(); });

  (async () => {
    // A static localhost-only state for visual QA. It never opens on the live
    // domain and contains no real member data beyond the public host identity.
    if ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        && new URLSearchParams(location.search).has('preview')) {
      updateClock(); render([{ id: 1, email: 'john@spacetobe.xyz', name: 'John', isHost: true, status: 'joined', canRemove: false }]);
      waiting.hidden = true; shell.hidden = false; return;
    }
    if (!token()) { location.replace('/members/'); return; }
    try {
      const data = await call('/api/club/session');
      if (!data.member.isHost) { location.replace('/members/'); return; }
      updateClock(); setInterval(updateClock, 30000); await loadMembers();
      waiting.hidden = true; shell.hidden = false;
    } catch (_) { forgetToken(); location.replace('/members/'); }
  })();
})();
