(() => {
  'use strict';
  const API = document.querySelector('meta[name="bc-members-api"]').content;
  const KEY = 'bc_member_session_v1';
  const emailForm = document.getElementById('email-form');
  const codeForm = document.getElementById('code-form');
  const waiting = document.getElementById('waiting');
  const holding = document.getElementById('member-holding');
  const emailInput = document.getElementById('email');
  const codeInput = document.getElementById('code');
  const emailStatus = document.getElementById('email-status');
  const codeStatus = document.getElementById('code-status');
  const resend = document.getElementById('resend');
  let challenge = null;
  let email = '';
  let countdown = null;

  function token() { try { return localStorage.getItem(KEY); } catch (_) { return null; } }
  function saveToken(value) { try { localStorage.setItem(KEY, value); } catch (_) {} }
  function forgetToken() { try { localStorage.removeItem(KEY); } catch (_) {} }

  async function call(path, options = {}) {
    const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
    const saved = token();
    if (saved) headers.authorization = `Bearer ${saved}`;
    const response = await fetch(`${API}${path}`, { ...options, headers });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw Object.assign(new Error(data.error || 'request failed'), { status: response.status });
    return data;
  }

  function show(element) {
    [emailForm, codeForm, waiting, holding].forEach((node) => { node.hidden = node !== element; });
  }

  async function requestCode() {
    const data = await call('/api/club/auth/request', {
      method: 'POST', body: JSON.stringify({ email }),
    });
    challenge = data.challenge;
    document.getElementById('email-shown').textContent = email;
    codeInput.value = '';
    show(codeForm);
    codeInput.focus();
    startResendClock();
  }

  function startResendClock() {
    clearInterval(countdown);
    let seconds = 60;
    resend.disabled = true;
    resend.innerHTML = `send another code · <span id="resend-count">${seconds}</span>s`;
    countdown = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(countdown);
        resend.disabled = false;
        resend.textContent = 'send another code';
      } else {
        const node = document.getElementById('resend-count');
        if (node) node.textContent = String(seconds);
      }
    }, 1000);
  }

  async function enter(member) {
    show(waiting);
    await new Promise((resolve) => setTimeout(resolve, 900));
    if (member.isHost) location.replace('/members/host/');
    else {
      document.getElementById('member-name').textContent = member.name || 'being';
      show(holding);
    }
  }

  emailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    emailStatus.textContent = '';
    email = emailInput.value.trim().toLowerCase();
    if (!emailInput.checkValidity()) { emailInput.reportValidity(); return; }
    const button = emailForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try { await requestCode(); }
    catch (_) { emailStatus.textContent = 'Something went wrong. Please try again.'; }
    finally { button.disabled = false; }
  });

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
  });

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    codeStatus.textContent = '';
    if (!/^\d{6}$/.test(codeInput.value)) { codeStatus.textContent = 'Enter all six digits.'; return; }
    const button = codeForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = await call('/api/club/auth/verify', {
        method: 'POST', body: JSON.stringify({ challenge, code: codeInput.value }),
      });
      saveToken(data.token);
      await enter(data.member);
    } catch (_) {
      codeStatus.textContent = 'That code didn’t work. Check it and try again.';
      codeInput.select();
    } finally { button.disabled = false; }
  });

  document.getElementById('try-again').addEventListener('click', () => {
    clearInterval(countdown); challenge = null; codeStatus.textContent = ''; show(emailForm); emailInput.focus();
  });
  resend.addEventListener('click', async () => {
    if (resend.disabled) return;
    codeStatus.textContent = '';
    try { await requestCode(); codeStatus.textContent = 'Another code is on its way, if this address is on the list.'; }
    catch (_) { codeStatus.textContent = 'Something went wrong. Please try again.'; }
  });
  document.getElementById('sign-out').addEventListener('click', async () => {
    try { await call('/api/club/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
    forgetToken(); location.reload();
  });

  (async () => {
    if (!token()) { emailInput.focus(); return; }
    show(waiting);
    try { const data = await call('/api/club/session'); await enter(data.member); }
    catch (_) { forgetToken(); show(emailForm); emailInput.focus(); }
  })();
})();
