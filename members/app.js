(() => {
  'use strict';
  const API = document.querySelector('meta[name="bc-members-api"]').content;
  const KEY = 'bc_member_session_v1';
  const PROSPECT_KEY = 'bc_prospect_session_v1';
  const JOIN_EMAIL_KEY = 'bc_join_email_v1';
  const loginPage = document.getElementById('login-page');
  const welcomePage = document.getElementById('welcome-page');
  const memberApp = document.getElementById('member-app');
  const prospectApp = document.getElementById('prospect-app');
  const emailForm = document.getElementById('email-form');
  const codeForm = document.getElementById('code-form');
  const prospectEmailForm = document.getElementById('prospect-email-form');
  const prospectCodeForm = document.getElementById('prospect-code-form');
  const waiting = document.getElementById('waiting');
  const emailInput = document.getElementById('email');
  const codeInput = document.getElementById('code');
  const emailStatus = document.getElementById('email-status');
  const codeStatus = document.getElementById('code-status');
  const resend = document.getElementById('resend');
  const prospectNameInput = document.getElementById('prospect-name');
  const prospectEmailInput = document.getElementById('prospect-email');
  const prospectCodeInput = document.getElementById('prospect-code');
  const prospectEmailStatus = document.getElementById('prospect-email-status');
  const prospectCodeStatus = document.getElementById('prospect-code-status');
  const prospectResend = document.getElementById('prospect-resend');
  let challenge = null;
  let email = '';
  let countdown = null;
  let member = null;
  let prospect = null;
  let prospectChallenge = null;
  let prospectEmail = '';
  let prospectName = '';
  let prospectCountdown = null;
  let calendarMonth = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1));
  let calendarSlots = [];
  let selectedCalendarDay = null;
  let selectedCalendarSlot = null;
  let calendarRequestId = 0;
  let prospectRescheduling = false;
  let calendarTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let timezoneChoices = [];
  let prospectMessageSource = 'calendar';
  let salon = null;
  let fieldNotes = { prompt: null, groups: [] };
  let givingState = { testimonial: null, canSubmit: true, suggestedName: '', monthlyGiving: null };
  let directoryState = { profile: null, members: [] };
  let settingsState = {
    email: {
      salonAnnounced: true, salonMonth: false, salonWeek: true,
      salonDay: true, salonHour: false, fieldNotes: true, quiet: false,
    },
    account: { email: '', joinedAt: null, isHost: false },
  };
  let showClubTime = false;
  let previewMode = false;
  let editingNote = null;
  let chosenImageData = null;
  let removeExistingImage = false;
  let editingTestimonial = false;
  let profileImageData = null;
  let removeProfileImage = false;
  let profileCropImage = null;
  let profileCropZoom = 1;
  let profileCropOffsetX = 0;
  let profileCropOffsetY = 0;
  let profileCropPointer = null;
  let profileCropTarget = 'profile';
  let replayingWelcome = false;
  let givingCadence = 'once';
  let givingCurrency = 'gbp';
  let givingThanks = new URLSearchParams(location.search).get('thanks') === '1';
  let welcomeStep = 0;
  let directoryOrder = [];
  let membersDrawerMode = 'minimised';
  let membersDrawerTouched = false;
  let membersDrawerPinnedId = null;
  let membersDrawerActiveId = null;
  const imageObjectUrls = new Set();
  const drawerImageObjectUrls = new Set();

  function token() { try { return localStorage.getItem(KEY); } catch (_) { return null; } }
  function saveToken(value) { try { localStorage.setItem(KEY, value); } catch (_) {} }
  function forgetToken() { try { localStorage.removeItem(KEY); } catch (_) {} }
  function prospectToken() { try { return localStorage.getItem(PROSPECT_KEY); } catch (_) { return null; } }
  function saveProspectToken(value) { try { localStorage.setItem(PROSPECT_KEY, value); } catch (_) {} }
  function forgetProspectToken() { try { localStorage.removeItem(PROSPECT_KEY); } catch (_) {} }

  function takeWelcomeToken() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const value = params.get('welcome');
    if (!value) return null;
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    return value;
  }

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

  async function prospectCall(path, options = {}) {
    const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
    const saved = prospectToken();
    if (saved) headers.authorization = `Bearer ${saved}`;
    const response = await fetch(`${API}${path}`, { ...options, headers });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw Object.assign(new Error(data.error || 'request failed'), { status: response.status });
    return data;
  }

  async function callBlob(path) {
    const response = await fetch(`${API}${path}`, {
      headers: { authorization: `Bearer ${token() || ''}` },
    });
    if (!response.ok) throw new Error('image unavailable');
    return response.blob();
  }

  function showLogin(element) {
    memberApp.hidden = true;
    prospectApp.hidden = true;
    welcomePage.hidden = true;
    loginPage.hidden = false;
    [emailForm, codeForm, prospectEmailForm, prospectCodeForm, waiting]
      .forEach((node) => { node.hidden = node !== element; });
  }

  function renderWelcome() {
    document.querySelectorAll('[data-welcome-step]').forEach((node) => {
      node.hidden = Number(node.dataset.welcomeStep) !== welcomeStep;
    });
    document.getElementById('welcome-count').textContent = `${welcomeStep + 1} / 7`;
    const nextButton = document.getElementById('welcome-next');
    const skipButton = document.getElementById('welcome-skip');
    nextButton.hidden = welcomeStep === 3 || welcomeStep === 4;
    nextButton.textContent = welcomeStep === 6 ? 'enter the club' : 'next';
    skipButton.hidden = welcomeStep === 3;
    if (welcomeStep === 3 && replayingWelcome && member?.agreementAccepted) {
      document.getElementById('agreement-check').checked = true;
    }
    document.getElementById('welcome-name').textContent = member?.name || 'being';
    if (welcomeStep === 4) prepareWelcomeProfile();
    const heading = document.getElementById('welcome-salon-heading');
    heading.textContent = salon?.startsAt
      ? `The next one is ${formatSalonTime(salon.startsAt, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')}.`
      : 'The next Salon will appear here when it is announced.';
  }

  function showWelcome(step = 0) {
    loginPage.hidden = true;
    memberApp.hidden = true;
    prospectApp.hidden = true;
    welcomePage.hidden = false;
    welcomeStep = step;
    renderWelcome();
  }

  function showProspectPreview(state = 'calendar') {
    loginPage.hidden = true;
    welcomePage.hidden = true;
    memberApp.hidden = true;
    prospectApp.hidden = false;
    if (!prospectName) prospectName = 'John';
    updateProspectGreeting();
    const booked = state === 'booked';
    document.getElementById('prospect-granted').hidden = true;
    document.getElementById('prospect-calendar').hidden = booked;
    document.getElementById('prospect-booked').hidden = !booked;
    document.getElementById('prospect-calendar-body').hidden = false;
    document.getElementById('prospect-booking-form').hidden = true;
    document.getElementById('prospect-message').hidden = true;
    document.querySelector('.prospect-calendar-head').hidden = false;
    document.querySelector('.prospect-preview-switch').hidden = false;
    document.querySelectorAll('[data-prospect-preview]').forEach((button) => {
      button.classList.toggle('current', button.dataset.prospectPreview === state);
    });
    const params = new URLSearchParams(location.search);
    params.set('preview', 'prospective');
    if (booked) params.set('state', 'booked');
    else params.delete('state');
    history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
    if (booked) {
      const chosen = selectedCalendarSlot || previewCalendarSlots()[1];
      renderBookedTime({
        uid: 'preview', title: 'A first conversation with John', startTime: chosen,
        endTime: new Date(Date.parse(chosen) + 25 * 60000).toISOString(), verified: true,
      });
    } else {
      prepareProspectCalendar(true);
    }
  }

  function showProspectMessage(open) {
    document.querySelector('.prospect-calendar-head').hidden = open;
    document.getElementById('prospect-calendar-body').hidden = open || !!selectedCalendarSlot;
    document.getElementById('prospect-booking-form').hidden = open || !selectedCalendarSlot;
    document.getElementById('prospect-message').hidden = !open;
    if (open) document.getElementById('prospect-message-body').focus();
  }

  function calendarDateKey(value, zone = calendarTimeZone) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone,
    }).formatToParts(new Date(value));
    const part = (type) => parts.find((item) => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  function monthKey(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  function previewCalendarSlots() {
    const year = calendarMonth.getUTCFullYear();
    const month = calendarMonth.getUTCMonth();
    const day = month === new Date().getMonth() && year === new Date().getFullYear()
      ? Math.min(Math.max(new Date().getDate() + 2, 3), 20) : 10;
    return [18, 19, 20].map((hour) => new Date(Date.UTC(year, month, day, hour, 0)).toISOString());
  }

  function timezoneAbbreviation(zone = calendarTimeZone, date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, timeZoneName: 'short', hour: '2-digit',
    }).formatToParts(date);
    return parts.find((part) => part.type === 'timeZoneName')?.value || zone;
  }

  function prettyTimezone(zone) {
    return zone.replaceAll('_', ' ').replace('/', ' / ');
  }

  function populateTimezones() {
    if (timezoneChoices.length) return;
    const common = ['Europe/London', 'Europe/Lisbon', 'Europe/Paris', 'America/New_York',
      'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Asia/Kolkata',
      'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'UTC'];
    let zones = common;
    try { zones = Intl.supportedValuesOf('timeZone'); } catch (_) {}
    if (!zones.includes(calendarTimeZone)) zones = [calendarTimeZone, ...zones];
    const year = new Date().getFullYear();
    timezoneChoices = zones.map((zone) => {
      const abbreviations = [...new Set([
        timezoneAbbreviation(zone, new Date(Date.UTC(year, 0, 15, 12))),
        timezoneAbbreviation(zone, new Date(Date.UTC(year, 6, 15, 12))),
        timezoneAbbreviation(zone),
      ])];
      return {
        zone, label: prettyTimezone(zone), abbreviations,
        search: `${zone} ${prettyTimezone(zone)} ${abbreviations.join(' ')}`.toLowerCase(),
        common: common.includes(zone),
      };
    });
  }

  function closeTimezoneResults() {
    const input = document.getElementById('prospect-timezone-search');
    document.getElementById('prospect-timezone-results').hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }

  function chooseTimezone(zone) {
    calendarTimeZone = zone;
    document.getElementById('prospect-timezone-search').value = prettyTimezone(zone);
    closeTimezoneResults();
    if (previewMode) prepareProspectCalendar(true); else loadProspectSlots();
  }

  function renderTimezoneResults(value = '') {
    populateTimezones();
    const input = document.getElementById('prospect-timezone-search');
    const results = document.getElementById('prospect-timezone-results');
    const query = value.trim().toLowerCase();
    const ranked = timezoneChoices.map((choice) => {
      const aliases = choice.abbreviations.map((item) => item.toLowerCase());
      let rank = choice.common ? 5 : 6;
      if (query) {
        if (aliases.includes(query)) rank = 0;
        else if (aliases.some((alias) => alias.startsWith(query))) rank = 1;
        else if (choice.zone.toLowerCase().startsWith(query) || choice.label.toLowerCase().startsWith(query)) rank = 2;
        else if (choice.search.includes(query)) rank = 3;
        else rank = 99;
      }
      return { choice, rank };
    }).filter((item) => item.rank < 99)
      .sort((a, b) => a.rank - b.rank || a.choice.label.localeCompare(b.choice.label))
      .slice(0, 8);
    results.replaceChildren();
    ranked.forEach(({ choice }) => {
      const button = document.createElement('button');
      button.type = 'button'; button.role = 'option'; button.dataset.timezone = choice.zone;
      const label = document.createElement('span'); label.textContent = choice.label;
      const aliases = document.createElement('small'); aliases.textContent = choice.abbreviations.join(' / ');
      button.append(label, aliases);
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => chooseTimezone(choice.zone));
      results.append(button);
    });
    const open = ranked.length > 0;
    results.hidden = !open; input.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function renderProspectCalendar() {
    populateTimezones();
    const timezoneInput = document.getElementById('prospect-timezone-search');
    if (document.activeElement !== timezoneInput) timezoneInput.value = prettyTimezone(calendarTimeZone);
    document.getElementById('prospect-timezone-abbreviation').textContent = timezoneAbbreviation();
    const monthLabel = new Intl.DateTimeFormat('en-GB', {
      month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(calendarMonth);
    const days = document.getElementById('prospect-days');
    const available = new Map();
    calendarSlots.forEach((slot) => {
      const key = calendarDateKey(slot);
      if (!available.has(key)) available.set(key, []);
      available.get(key).push(slot);
    });
    document.getElementById('prospect-month-label').textContent = monthLabel;
    days.setAttribute('aria-label', monthLabel);
    days.replaceChildren();
    const offset = (calendarMonth.getUTCDay() + 6) % 7;
    for (let index = 0; index < offset; index += 1) days.append(document.createElement('span'));
    const count = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + 1, 0)).getUTCDate();
    for (let day = 1; day <= count; day += 1) {
      const key = `${monthKey(calendarMonth).slice(0, 8)}${String(day).padStart(2, '0')}`;
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = String(day); button.dataset.calendarDay = key;
      button.disabled = !available.has(key);
      button.classList.toggle('selected', key === selectedCalendarDay);
      button.setAttribute('aria-pressed', key === selectedCalendarDay ? 'true' : 'false');
      if (available.has(key)) button.setAttribute('aria-label', `${day} ${monthLabel}, times available`);
      button.addEventListener('click', () => {
        selectedCalendarDay = key; selectedCalendarSlot = null; renderProspectCalendar();
      });
      days.append(button);
    }
    const monthNow = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1));
    document.getElementById('prospect-month-previous').disabled = calendarMonth <= monthNow;
    const daySlots = available.get(selectedCalendarDay) || [];
    const weekday = document.getElementById('prospect-day-weekday');
    const heading = document.getElementById('prospect-day-heading');
    const list = document.getElementById('prospect-time-list');
    list.replaceChildren();
    if (!selectedCalendarDay) {
      weekday.textContent = 'available times'; heading.textContent = 'Choose a day';
    } else {
      const reference = new Date(`${selectedCalendarDay}T12:00:00Z`);
      weekday.textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(reference);
      heading.textContent = new Intl.DateTimeFormat('en-GB', {
        day: 'numeric', month: 'long', timeZone: 'UTC',
      }).format(reference);
    }
    daySlots.forEach((slot) => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.prospectTime = slot;
      button.textContent = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: calendarTimeZone,
      }).format(new Date(slot)).replace(/^24:/, '00:');
      button.addEventListener('click', () => chooseCalendarSlot(slot));
      list.append(button);
    });
    const status = document.getElementById('prospect-calendar-status');
    if (status.dataset.loading === 'true') status.textContent = 'Finding available times…';
    else if (!calendarSlots.length) status.textContent = 'There are no available times in this month.';
    else if (selectedCalendarDay && !daySlots.length) status.textContent = 'There are no times left on this day.';
    else status.textContent = '';
  }

  async function prepareProspectCalendar(sample = false) {
    prospectRescheduling = false;
    selectedCalendarDay = null; selectedCalendarSlot = null;
    document.getElementById('prospect-calendar-body').hidden = false;
    document.getElementById('prospect-booking-form').hidden = true;
    if (sample) {
      calendarSlots = previewCalendarSlots();
      selectedCalendarDay = calendarDateKey(calendarSlots[0]);
      renderProspectCalendar(); return;
    }
    await loadProspectSlots();
  }

  async function loadProspectSlots() {
    const requestId = ++calendarRequestId;
    const status = document.getElementById('prospect-calendar-status');
    status.dataset.loading = 'true';
    calendarSlots = []; selectedCalendarDay = null; selectedCalendarSlot = null;
    renderProspectCalendar();
    const nextMonth = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + 1, 1));
    try {
      const query = new URLSearchParams({
        start: monthKey(calendarMonth), end: monthKey(nextMonth), timeZone: calendarTimeZone,
      });
      const data = await prospectCall(`/api/club/prospect/slots?${query}`);
      if (requestId !== calendarRequestId) return;
      calendarSlots = Array.isArray(data.slots) ? data.slots : [];
      if (calendarSlots.length) selectedCalendarDay = calendarDateKey(calendarSlots[0]);
      status.dataset.loading = 'false'; renderProspectCalendar();
    } catch (_) {
      if (requestId !== calendarRequestId) return;
      status.dataset.loading = 'false'; renderProspectCalendar();
      status.textContent = 'The calendar is unavailable just now. Try again, or send John a note.';
    }
  }

  function chooseCalendarSlot(slot) {
    selectedCalendarSlot = slot;
    document.getElementById('prospect-calendar-body').hidden = true;
    const form = document.getElementById('prospect-booking-form');
    form.hidden = false;
    const parts = localBookingParts(slot, calendarTimeZone);
    document.getElementById('prospect-selection-heading').textContent = `${parts.weekday} ${parts.day} · ${parts.time}`;
    document.getElementById('prospect-booking-email').value = prospect?.email || 'you@example.com';
    document.getElementById('prospect-booking-name').value = prospect?.name || prospectName || '';
    document.getElementById('prospect-booking-fields').hidden = prospectRescheduling;
    document.getElementById('prospect-booking-name').required = !prospectRescheduling;
    document.getElementById('prospect-keep-time').hidden = !prospectRescheduling;
    document.getElementById('prospect-booking-submit').textContent = prospectRescheduling
      ? 'confirm new time' : 'confirm this time';
    document.getElementById('prospect-booking-status').textContent = '';
    if (!prospectRescheduling) document.getElementById('prospect-booking-name').focus();
  }

  function leaveBookingSelection() {
    selectedCalendarSlot = null;
    document.getElementById('prospect-booking-form').hidden = true;
    document.getElementById('prospect-calendar-body').hidden = false;
  }

  function localBookingParts(iso, zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') {
    const date = new Date(iso);
    const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: zone }).format(date);
    const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: zone }).format(date);
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone, timeZoneName: 'short',
    }).format(date).replace(/^24:/, '00:');
    return { weekday, day, time };
  }

  function bookingCalendarData(booking) {
    const start = new Date(booking.startTime); const end = new Date(booking.endTime);
    const stamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const escape = (value) => String(value || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Beings Club//First Conversation//EN\r\nBEGIN:VEVENT\r\nUID:${escape(booking.uid)}\r\nDTSTAMP:${stamp(new Date())}\r\nDTSTART:${stamp(start)}\r\nDTEND:${stamp(end)}\r\nSUMMARY:${escape(booking.title || 'A first conversation with John')}\r\nDESCRIPTION:${escape('A first conversation about Beings Club.')}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  }

  function renderBookedTime(booking) {
    const parts = localBookingParts(booking.startTime);
    document.getElementById('prospect-booked-weekday').textContent = parts.weekday;
    document.getElementById('prospect-booked-date').textContent = parts.day;
    document.getElementById('prospect-booked-time').textContent = parts.time;
    document.getElementById('prospect-booked-note').textContent = booking.verified
      ? 'You’ll also receive the details by email.'
      : 'Your time is confirmed. The call details will follow by email.';
    const calendar = document.getElementById('prospect-calendar-link');
    calendar.href = URL.createObjectURL(new Blob([bookingCalendarData(booking)], { type: 'text/calendar' }));
    calendar.download = 'beings-club-first-conversation.ics';
  }

  function renderProspect() {
    loginPage.hidden = true; welcomePage.hidden = true; memberApp.hidden = true;
    prospectApp.hidden = false;
    prospectName = prospect?.name || prospectName;
    updateProspectGreeting();
    document.querySelector('.prospect-preview-switch').hidden = true;
    document.getElementById('prospect-message').hidden = true;
    document.querySelector('.prospect-calendar-head').hidden = false;
    const granted = !!prospect?.granted;
    const booking = prospect?.booking;
    const booked = !!booking && booking.status !== 'cancelled';
    document.getElementById('prospect-granted').hidden = !granted;
    document.getElementById('prospect-calendar').hidden = granted || booked;
    document.getElementById('prospect-booked').hidden = granted || !booked;
    if (granted) return;
    if (!booked) { prepareProspectCalendar(); return; }
    renderBookedTime(booking);
  }

  async function finishWelcome() {
    const replay = replayingWelcome;
    replayingWelcome = false;
    if (!replay && !previewMode && !member?.onboardingCompleted) {
      try {
        await call('/api/club/onboarding/complete', { method: 'POST', body: '{}' });
        member.onboardingCompleted = true;
      } catch (_) {
        // Completion is durable server-side and the scheduled retry handles a
        // host-notice delivery failure. Never trap a member in the welcome.
      }
    }
    welcomePage.hidden = true;
    showMemberApp();
  }

  function showNonMember(emailAddress) {
    showLogin(emailForm);
    emailInput.value = emailAddress;
    const link = document.createElement('a');
    link.href = '/members/?join=1';
    link.textContent = 'Start with a conversation →';
    link.addEventListener('click', () => {
      try { sessionStorage.setItem(JOIN_EMAIL_KEY, emailAddress); } catch (_) {}
    });
    emailStatus.replaceChildren(
      document.createTextNode('That email isn’t on the member list. '), link,
    );
  }

  async function requestCode() {
    const data = await call('/api/club/auth/request', {
      method: 'POST', body: JSON.stringify({ email }),
    });
    if (data.limited) return 'limited';
    if (data.eligible === false) {
      showNonMember(email);
      return 'ineligible';
    }
    if (data.eligible !== true) throw new Error('login eligibility unavailable');
    challenge = data.challenge;
    document.getElementById('email-shown').textContent = email;
    codeInput.value = '';
    showLogin(codeForm);
    codeInput.focus();
    startResendClock();
    return 'sent';
  }

  async function requestProspectCode() {
    const data = await prospectCall('/api/club/prospect/auth/request', {
      method: 'POST', body: JSON.stringify({ email: prospectEmail, name: prospectName }),
    });
    prospectChallenge = data.challenge;
    document.getElementById('prospect-email-shown').textContent = prospectEmail;
    prospectCodeInput.value = '';
    showLogin(prospectCodeForm);
    prospectCodeInput.focus();
    startProspectResendClock();
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

  function startProspectResendClock() {
    clearInterval(prospectCountdown);
    let seconds = 60;
    prospectResend.disabled = true;
    prospectResend.innerHTML = `send another code · <span id="prospect-resend-count">${seconds}</span>s`;
    prospectCountdown = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(prospectCountdown); prospectResend.disabled = false;
        prospectResend.textContent = 'send another code';
      } else {
        document.getElementById('prospect-resend-count').textContent = String(seconds);
      }
    }, 1000);
  }

  function updateClock() {
    const current = new Date();
    const days = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
    const month = current.toLocaleString('en-GB', { month: 'short' }).toLowerCase();
    document.getElementById('member-clock').textContent = `${days[current.getDay()]} ${current.getDate()} ${month} ${String(current.getFullYear()).slice(2)} · ${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`;
    const greeting = current.getHours() < 12 ? 'morning' : current.getHours() < 18 ? 'afternoon' : 'evening';
    document.getElementById('member-greeting').textContent = `good ${greeting}, ${member?.name || 'being'}`;
  }

  function updateProspectGreeting() {
    const current = new Date();
    const greeting = current.getHours() < 12 ? 'morning' : current.getHours() < 18 ? 'afternoon' : 'evening';
    document.getElementById('prospect-greeting').textContent = prospectName
      ? `good ${greeting}, ${prospectName.toLocaleLowerCase('en-GB')}` : `good ${greeting}`;
  }

  function formatSalonTime(iso, timeZone) {
    const date = new Date(iso);
    const day = new Intl.DateTimeFormat('en-GB', {
      timeZone, weekday: 'long', day: 'numeric', month: 'long',
    }).format(date);
    const rawTime = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
    }).format(date);
    const time = rawTime.replace(':00', '').replace(/\bam\b/i, 'AM').replace(/\bpm\b/i, 'PM');
    return `${day}, ${time}`;
  }

  function renderTime() {
    if (!salon) return;
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const zone = showClubTime ? 'Europe/London' : localZone;
    const sameZone = localZone === 'Europe/London';
    document.getElementById('salon-time').textContent = formatSalonTime(salon.startsAt, zone);
    document.getElementById('time-hint').textContent = sameZone
      ? 'your local time · Beings Club time'
      : (showClubTime ? 'Beings Club time · select for your local time' : 'your local time · select for Beings Club time');
  }

  function renderPresence() {
    const count = Number(salon?.rsvpCount || 0);
    const dots = document.getElementById('rsvp-dots');
    dots.replaceChildren();
    for (let index = 0; index < Math.min(count, 3); index += 1) {
      const dot = document.createElement('span'); dot.textContent = '?'; dots.append(dot);
    }
    document.getElementById('rsvp-count').textContent = count === 0
      ? 'no responses yet'
      : count === 1 ? 'one being is in' : `${count} beings are in`;
  }

  function renderRsvp() {
    const mine = salon?.myRsvp || null;
    document.getElementById('rsvp-actions').hidden = mine !== null;
    document.getElementById('rsvp-going').hidden = mine !== 'in';
    document.getElementById('rsvp-not-going').hidden = mine !== 'not_this_time';
    renderPresence();
  }

  function renderDoor() {
    const link = document.getElementById('join-room');
    const waitingCopy = document.getElementById('door-waiting');
    if (salon?.zoomUrl) {
      link.href = salon.zoomUrl; link.hidden = false; waitingCopy.hidden = true;
    } else {
      link.removeAttribute('href'); link.hidden = true; waitingCopy.hidden = false;
      const opens = salon?.joinAvailableAt ? formatSalonTime(salon.joinAvailableAt,
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') : null;
      waitingCopy.textContent = opens
        ? `The room opens from this page at ${opens}.`
        : 'The room opens from this page ten minutes before.';
    }
  }

  function renderSalon() {
    document.getElementById('salon-empty').hidden = !!salon;
    document.getElementById('salon-view').hidden = !salon;
    if (!salon) return;
    document.getElementById('salon-note').textContent = salon.note;
    document.getElementById('salon-duration').textContent = `About ${salon.durationMinutes} minutes`;
    renderTime(); renderRsvp(); renderDoor();
  }

  function monthLabel(iso) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', month: 'long', year: 'numeric',
    }).format(new Date(iso));
  }

  function makeText(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    return node;
  }

  async function loadNoteImage(note, image) {
    if (previewMode) return;
    try {
      const blob = await callBlob(`/api/club/field-notes/${note.id}/image`);
      const url = URL.createObjectURL(blob); imageObjectUrls.add(url); image.src = url;
    } catch (_) { image.remove(); }
  }

  function resetComposer() {
    editingNote = null; chosenImageData = null; removeExistingImage = false;
    document.getElementById('field-note-form').reset();
    document.getElementById('field-note-image-preview').hidden = true;
    document.getElementById('field-note-image-preview').removeAttribute('src');
    document.getElementById('field-note-alt-wrap').hidden = true;
    document.getElementById('field-note-image-remove').hidden = true;
    document.getElementById('field-note-image-name').textContent = 'JPEG, PNG, GIF or WebP · up to 5MB';
    document.getElementById('field-note-share').textContent = 'share field note';
    document.getElementById('field-note-cancel-edit').hidden = true;
    document.getElementById('field-note-dismiss').hidden = !fieldNotes.prompt;
    document.getElementById('composer-eyebrow').textContent = 'an invitation from the Salon';
    document.getElementById('composer-title').textContent = 'What stayed with you?';
  }

  function beginEdit(note) {
    editingNote = note; chosenImageData = null; removeExistingImage = false;
    const composer = document.getElementById('field-note-composer'); composer.hidden = false;
    document.getElementById('field-note-body').value = note.body || '';
    document.getElementById('field-note-link').value = note.linkUrl || '';
    document.getElementById('field-note-alt').value = note.imageAlt || '';
    document.querySelector(`input[name="field-note-attribution"][value="${note.isAnonymous ? 'anonymous' : 'signed'}"]`).checked = true;
    document.getElementById('composer-eyebrow').textContent = monthLabel(note.salonStartsAt);
    document.getElementById('composer-title').textContent = 'Edit your Field Note';
    document.getElementById('field-note-share').textContent = 'save changes';
    document.getElementById('field-note-cancel-edit').hidden = false;
    document.getElementById('field-note-dismiss').hidden = true;
    if (note.hasImage) {
      document.getElementById('field-note-image-name').textContent = 'Current image';
      document.getElementById('field-note-image-remove').hidden = false;
      document.getElementById('field-note-alt-wrap').hidden = false;
    }
    composer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderFieldNotes() {
    for (const url of imageObjectUrls) URL.revokeObjectURL(url);
    imageObjectUrls.clear();
    const archive = document.getElementById('field-note-archive'); archive.replaceChildren();
    const composer = document.getElementById('field-note-composer');
    if (!editingNote) {
      resetComposer(); composer.hidden = !fieldNotes.prompt;
      if (fieldNotes.prompt) {
        document.getElementById('composer-eyebrow').textContent = `${monthLabel(fieldNotes.prompt.salonStartsAt)} Salon`;
      }
    }
    const groups = fieldNotes.groups || [];
    document.getElementById('field-notes-empty').hidden = groups.length !== 0;
    groups.forEach((group) => {
      const section = document.createElement('section'); section.className = 'field-note-group';
      const head = document.createElement('header'); head.className = 'field-note-group-head';
      head.append(makeText('span', 'eyebrow', 'Salon'), makeText('h2', '', monthLabel(group.salonStartsAt)));
      const grid = document.createElement('div'); grid.className = 'field-note-grid';
      group.notes.forEach((note) => {
        note.salonStartsAt = group.salonStartsAt;
        const article = document.createElement('article'); article.className = 'field-note-card';
        if (note.hasImage) {
          const image = document.createElement('img'); image.className = 'field-note-card-image';
          image.alt = note.imageAlt || ''; article.append(image); loadNoteImage(note, image);
        }
        if (note.body) article.append(makeText('p', 'field-note-card-body', note.body));
        if (note.linkUrl) {
          const link = document.createElement('a'); link.className = 'field-note-card-link';
          link.href = note.linkUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
          try { link.textContent = `${new URL(note.linkUrl).hostname.replace(/^www\./, '')} ↗`; }
          catch (_) { link.textContent = 'open reference ↗'; }
          article.append(link);
        }
        const foot = document.createElement('footer'); foot.className = 'field-note-card-foot';
        foot.append(makeText('span', '', note.isAnonymous ? 'shared anonymously' : (note.author || 'A being')));
        if (note.editedAt) foot.append(makeText('span', '', 'edited'));
        if (note.isMine) {
          const actions = document.createElement('span'); actions.className = 'field-note-own-actions';
          const edit = makeText('button', '', 'edit'); edit.type = 'button'; edit.addEventListener('click', () => beginEdit(note));
          const remove = makeText('button', '', 'remove'); remove.type = 'button'; remove.addEventListener('click', () => removeNote(note));
          actions.append(edit, remove); foot.append(actions);
        }
        article.append(foot); grid.append(article);
      });
      section.append(head, grid); archive.append(section);
    });
  }

  function renderGiving() {
    const monthlyActive = givingState.monthlyGiving?.active === true;
    if (monthlyActive && givingCadence === 'monthly') givingCadence = 'once';
    updateFinancialGivingForm();
    document.getElementById('member-giving-thanks').hidden = !givingThanks;
    document.getElementById('member-monthly-giving').hidden = !monthlyActive;
    const form = document.getElementById('testimonial-form');
    const current = document.getElementById('testimonial-current');
    const testimonial = givingState.testimonial;
    const canWrite = givingState.canSubmit || editingTestimonial;
    form.hidden = !canWrite;
    current.hidden = !testimonial || editingTestimonial;
    if (canWrite && !editingTestimonial) {
      form.reset();
      document.getElementById('testimonial-name').value = givingState.suggestedName || member?.name || '';
      document.getElementById('testimonial-submit').textContent = 'offer these words';
      document.getElementById('testimonial-cancel-edit').hidden = true;
    }
    if (!testimonial) return;
    document.getElementById('testimonial-current-body').textContent = testimonial.body;
    document.getElementById('testimonial-current-name').textContent = `— ${testimonial.attributionName}`;
    const pending = testimonial.status === 'pending';
    document.getElementById('testimonial-current-actions').hidden = !pending;
    document.querySelector('.testimonial-current-state').textContent = pending
      ? 'with John · awaiting consideration' : 'this month’s offering';
    const resolved = document.getElementById('testimonial-resolved-copy');
    resolved.hidden = pending;
    resolved.textContent = testimonial.status === 'withdrawn'
      ? 'Withdrawn. The opportunity will appear again next month.'
      : 'These words have left the private queue. Thank you for offering them.';
  }

  function updateFinancialGivingForm() {
    const monthlyActive = givingState.monthlyGiving?.active === true;
    document.querySelectorAll('[data-giving-cadence]').forEach((button) => {
      const selected = button.dataset.givingCadence === givingCadence;
      button.disabled = monthlyActive && button.dataset.givingCadence === 'monthly';
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    document.querySelectorAll('[data-giving-currency]').forEach((button) => {
      const selected = button.dataset.givingCurrency === givingCurrency;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    const symbol = givingCurrency === 'usd' ? '$' : '£';
    document.getElementById('member-giving-symbol').textContent = symbol;
    document.getElementById('member-giving-amount-label').textContent = givingCadence === 'monthly'
      ? 'amount each month' : 'amount';
    document.getElementById('member-giving-help').textContent = `${symbol}1 minimum.`;
    document.getElementById('member-giving-monthly-note').hidden = givingCadence !== 'monthly';
  }

  async function beginFinancialGiving() {
    const amount = document.getElementById('member-giving-amount');
    const statusNode = document.getElementById('member-giving-status');
    const raw = amount.value.trim();
    const symbol = givingCurrency === 'usd' ? '$' : '£';
    statusNode.textContent = '';
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || Number(raw) < 1) {
      statusNode.textContent = `Enter an amount of ${symbol}1 or more.`;
      amount.focus(); return;
    }
    const button = document.getElementById('member-give'); button.disabled = true;
    try {
      if (previewMode) {
        statusNode.textContent = 'In the live member area, Stripe would open securely from here.';
        return;
      }
      const result = await call('/api/club/giving/checkout', {
        method: 'POST',
        body: JSON.stringify({
          cadence: givingCadence, currency: givingCurrency,
          amount: Math.round(Number(raw) * 100),
        }),
      });
      location.href = result.url;
    } catch (error) {
      statusNode.textContent = error.status === 503
        ? 'Giving is not switched on yet. Nothing is owed in the meantime.'
        : 'That did not open. Please try again in a moment.';
    } finally { button.disabled = false; }
  }

  async function manageFinancialGiving() {
    const statusNode = document.getElementById('member-giving-status'); statusNode.textContent = '';
    const button = document.getElementById('member-giving-manage'); button.disabled = true;
    try {
      if (previewMode) {
        statusNode.textContent = 'In the live member area, Stripe would open any monthly gift linked to your sign-in email.';
        return;
      }
      const result = await call('/api/club/giving/manage', { method: 'POST', body: '{}' });
      location.href = result.url;
    } catch (error) {
      statusNode.textContent = error.status === 404
        ? 'No active monthly gift was found for your sign-in email.'
        : 'Monthly giving could not be opened. Try again.';
    } finally { button.disabled = false; }
  }

  function memberInitial(name) {
    return String(name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  async function loadMemberImage(person, image, fallback, urlSet = imageObjectUrls) {
    if (previewMode && person.previewImage) {
      image.src = person.previewImage; image.hidden = false; fallback.hidden = true; return;
    }
    try {
      const blob = await callBlob(`/api/club/members/${person.id}/image`);
      const url = URL.createObjectURL(blob); urlSet.add(url);
      image.src = url; image.hidden = false; fallback.hidden = true;
    } catch (_) { image.hidden = true; fallback.hidden = false; }
  }

  function orderedDirectoryMembers() {
    const members = directoryState.members || [];
    const ids = new Set(members.map((person) => String(person.id)));
    directoryOrder = directoryOrder.filter((id) => ids.has(String(id)));
    members.forEach((person) => {
      if (!directoryOrder.some((id) => String(id) === String(person.id))) directoryOrder.push(person.id);
    });
    const positions = new Map(directoryOrder.map((id, index) => [String(id), index]));
    return [...members].sort((a, b) => positions.get(String(a.id)) - positions.get(String(b.id)));
  }

  function shuffledDirectoryOrder(people, moveFirst = false) {
    const before = people.map((person) => person.id);
    if (before.length < 2) return before;
    const next = [...before];
    for (let index = next.length - 1; index > 0; index -= 1) {
      const chosen = Math.floor(Math.random() * (index + 1));
      [next[index], next[chosen]] = [next[chosen], next[index]];
    }
    if (next.every((id, index) => String(id) === String(before[index]))) next.push(next.shift());
    if (moveFirst && next.length > 1 && String(next[0]) === String(before[0])) {
      const chosen = 1 + Math.floor(Math.random() * (next.length - 1));
      [next[0], next[chosen]] = [next[chosen], next[0]];
    }
    return next;
  }

  function animateDirectoryOrder() {
    const grid = document.getElementById('directory-grid');
    const cards = new Map([...grid.children].map((card) => [card.dataset.memberId, card]));
    const people = orderedDirectoryMembers();
    if (cards.size !== people.length || people.some((person) => !cards.has(String(person.id)))) {
      renderDirectory(); return;
    }
    const before = new Map([...cards].map(([id, card]) => [id, card.getBoundingClientRect()]));
    people.forEach((person) => grid.append(cards.get(String(person.id))));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    people.forEach((person, index) => {
      const card = cards.get(String(person.id));
      card.getAnimations().forEach((animation) => animation.cancel());
      const start = before.get(String(person.id));
      const end = card.getBoundingClientRect();
      const x = start.left - end.left;
      const y = start.top - end.top;
      if (!x && !y) return;
      const turn = ((index % 2 ? 1 : -1) * (1.2 + ((index * 7) % 4) * .45));
      card.animate([
        { transform: `translate(${x}px,${y}px) rotate(${turn}deg) scale(.96)`, opacity: .72 },
        { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
      ], {
        duration: 560 + ((index * 29) % 120),
        delay: ((index * 37) % 11) * 16,
        easing: 'cubic-bezier(.22,1,.36,1)',
      });
    });
    const button = document.getElementById('directory-randomise');
    button.classList.remove('is-shuffling');
    requestAnimationFrame(() => button.classList.add('is-shuffling'));
    window.setTimeout(() => button.classList.remove('is-shuffling'), 820);
  }

  function randomiseDirectory() {
    const people = orderedDirectoryMembers();
    if (people.length < 2) return;
    directoryOrder = shuffledDirectoryOrder(people, true);
    animateDirectoryOrder();
    if (!document.getElementById('members-drawer').hidden) renderMembersDrawer();
  }

  function renderDirectory() {
    for (const url of imageObjectUrls) URL.revokeObjectURL(url);
    imageObjectUrls.clear();
    const grid = document.getElementById('directory-grid'); grid.replaceChildren();
    const people = orderedDirectoryMembers();
    document.getElementById('directory-randomise').disabled = people.length < 2;
    people.forEach((person) => {
      const card = document.createElement('article'); card.className = 'directory-card';
      card.dataset.memberId = String(person.id);
      if (person.isMe) card.classList.add('is-me');
      const portrait = document.createElement('div'); portrait.className = 'directory-portrait';
      const fallback = makeText('span', 'directory-fallback', memberInitial(person.name));
      const image = document.createElement('img'); image.alt = `${person.name}’s profile image`; image.hidden = true;
      portrait.append(fallback, image);
      if (person.hasImage || person.previewImage) loadMemberImage(person, image, fallback);
      const words = document.createElement('div'); words.className = 'directory-words';
      const nameRow = document.createElement('div'); nameRow.className = 'directory-name-row';
      nameRow.append(makeText('h2', '', person.name));
      if (person.isMe) nameRow.append(makeText('span', 'directory-you', 'you'));
      words.append(nameRow);
      if (person.line) words.append(makeText('p', '', person.line));
      if (person.website) {
        const link = document.createElement('a'); link.href = person.website;
        link.target = '_blank'; link.rel = 'noopener noreferrer';
        try { link.textContent = `${new URL(person.website).hostname.replace(/^www\./, '')} ↗`; }
        catch (_) { link.textContent = 'website ↗'; }
        words.append(link);
      }
      card.append(portrait, words); grid.append(card);
    });
  }

  function drawerPerson(id) {
    return (directoryState.members || []).find((person) => String(person.id) === String(id)) || null;
  }

  function renderMembersDrawerDetail(person, imageSrc = '') {
    const portrait = document.getElementById('members-drawer-portrait');
    const image = document.getElementById('members-drawer-image');
    const fallback = document.getElementById('members-drawer-fallback');
    const name = document.getElementById('members-drawer-name');
    const website = document.getElementById('members-drawer-website');
    const line = document.getElementById('members-drawer-line');
    membersDrawerActiveId = person?.id ?? null;
    if (!person) {
      portrait.hidden = true; image.hidden = true; image.removeAttribute('src');
      name.textContent = `${(directoryState.members || []).length} beings`;
      website.hidden = true; website.removeAttribute('href');
      line.textContent = 'hover, focus or choose a member';
      return;
    }
    portrait.hidden = false;
    fallback.textContent = memberInitial(person.name);
    if (imageSrc) { image.src = imageSrc; image.alt = `${person.name}’s profile image`; image.hidden = false; fallback.hidden = true; }
    else { image.hidden = true; image.removeAttribute('src'); fallback.hidden = false; }
    name.textContent = person.name;
    if (person.website) {
      website.href = person.website; website.hidden = false;
      try { website.textContent = `${new URL(person.website).hostname.replace(/^www\./, '')} ↗`; }
      catch (_) { website.textContent = 'website ↗'; }
    } else { website.hidden = true; website.removeAttribute('href'); }
    line.textContent = person.line || (person.isMe ? 'you' : '');
  }

  function renderMembersDrawer() {
    for (const url of drawerImageObjectUrls) URL.revokeObjectURL(url);
    drawerImageObjectUrls.clear();
    const people = orderedDirectoryMembers();
    const grid = document.getElementById('members-drawer-grid'); grid.replaceChildren();
    document.getElementById('members-drawer-count').textContent = `members · ${people.length} ${people.length === 1 ? 'being' : 'beings'}`;
    people.forEach((person) => {
      const button = document.createElement('button');
      button.className = 'members-drawer-avatar'; button.type = 'button';
      button.setAttribute('aria-label', `Meet ${person.name}`); button.title = person.name;
      button.classList.toggle('is-pinned', String(person.id) === String(membersDrawerPinnedId));
      const fallback = makeText('span', '', memberInitial(person.name));
      const image = document.createElement('img'); image.alt = ''; image.hidden = true;
      button.append(fallback, image); grid.append(button);
      const show = () => renderMembersDrawerDetail(person, image.hidden ? '' : image.src);
      const restore = () => {
        const pinned = drawerPerson(membersDrawerPinnedId);
        if (pinned) {
          const pinnedButton = [...grid.children].find((node) => node.dataset.memberId === String(pinned.id));
          const pinnedImage = pinnedButton?.querySelector('img');
          renderMembersDrawerDetail(pinned, pinnedImage && !pinnedImage.hidden ? pinnedImage.src : '');
        } else renderMembersDrawerDetail(null);
      };
      button.dataset.memberId = String(person.id);
      button.addEventListener('mouseenter', show); button.addEventListener('focus', show);
      button.addEventListener('mouseleave', restore); button.addEventListener('blur', restore);
      button.addEventListener('click', () => {
        membersDrawerPinnedId = String(person.id) === String(membersDrawerPinnedId) ? null : person.id;
        renderMembersDrawer();
      });
      if (person.hasImage || person.previewImage) {
        loadMemberImage(person, image, fallback, drawerImageObjectUrls).then(() => {
          if (String(membersDrawerActiveId) === String(person.id) && !image.hidden) renderMembersDrawerDetail(person, image.src);
        });
      }
    });
    const pinned = drawerPerson(membersDrawerPinnedId);
    if (pinned) {
      const pinnedButton = [...grid.children].find((node) => node.dataset.memberId === String(pinned.id));
      const pinnedImage = pinnedButton?.querySelector('img');
      renderMembersDrawerDetail(pinned, pinnedImage && !pinnedImage.hidden ? pinnedImage.src : '');
    } else renderMembersDrawerDetail(null);
  }

  function setMembersDrawerMode(mode) {
    membersDrawerMode = mode;
    const drawer = document.getElementById('members-drawer');
    drawer.classList.toggle('is-minimised', mode === 'minimised');
    drawer.classList.toggle('is-compact', mode === 'compact');
    drawer.classList.toggle('is-expanded', mode === 'expanded');
    const panel = document.getElementById('members-drawer-panel');
    const tab = document.getElementById('members-drawer-tab');
    panel.hidden = mode === 'minimised'; tab.hidden = mode !== 'minimised';
    tab.setAttribute('aria-expanded', mode === 'minimised' ? 'false' : 'true');
    const resize = document.getElementById('members-drawer-resize');
    resize.textContent = mode === 'expanded' ? '⤡' : '⤢';
    resize.setAttribute('aria-label', mode === 'expanded' ? 'Make members compact' : 'Expand members');
  }

  function prepareWelcomeProfile() {
    const profile = directoryState.profile || {
      id: member?.id, email: member?.email, name: member?.name || '', line: '', website: '', hasImage: false,
    };
    profileImageData = null; removeProfileImage = false;
    document.getElementById('welcome-profile-form').reset();
    document.getElementById('welcome-profile-name').value = profile.name || member?.name || '';
    document.getElementById('welcome-profile-line').value = profile.line || '';
    document.getElementById('welcome-profile-website').value = profile.website || '';
    document.getElementById('welcome-profile-status').textContent = '';
    const fallback = document.getElementById('welcome-profile-image-fallback');
    fallback.textContent = memberInitial(profile.name || member?.name);
    fallback.hidden = false;
    const image = document.getElementById('welcome-profile-image-preview');
    image.hidden = true; image.removeAttribute('src');
    if (profile.hasImage || profile.previewImage) loadMemberImage(profile, image, fallback);
  }

  function renderProfile() {
    const profile = directoryState.profile || {
      id: member?.id, email: member?.email, name: member?.name || '', line: '', website: '', hasImage: false,
    };
    profileImageData = null; removeProfileImage = false;
    document.getElementById('profile-form').reset();
    document.getElementById('profile-name').value = profile.name || '';
    document.getElementById('profile-line').value = profile.line || '';
    document.getElementById('profile-website').value = profile.website || '';
    document.getElementById('profile-email').textContent = profile.email || member?.email || '';
    document.getElementById('profile-image-fallback').textContent = memberInitial(profile.name);
    document.getElementById('profile-image-fallback').hidden = false;
    const image = document.getElementById('profile-image-preview'); image.hidden = true; image.removeAttribute('src');
    document.getElementById('profile-image-remove').hidden = !profile.hasImage;
    if (profile.hasImage || profile.previewImage) {
      loadMemberImage(profile, image, document.getElementById('profile-image-fallback'));
    }
  }

  function renderSettings() {
    const preferences = settingsState.email;
    document.getElementById('email-salon-announced').checked = !!preferences.salonAnnounced;
    document.getElementById('email-salon-month').checked = !!preferences.salonMonth;
    document.getElementById('email-salon-week').checked = !!preferences.salonWeek;
    document.getElementById('email-salon-day').checked = !!preferences.salonDay;
    document.getElementById('email-salon-hour').checked = !!preferences.salonHour;
    document.getElementById('email-field-notes').checked = !!preferences.fieldNotes;
    document.getElementById('email-quiet').checked = !!preferences.quiet;
    document.getElementById('salon-email-options').classList.toggle('settings-email-muted', !!preferences.quiet);
    document.getElementById('field-note-email-row').classList.toggle('settings-email-muted', !!preferences.quiet);
    document.getElementById('settings-account-email').textContent = settingsState.account?.email || member?.email || '';
    document.getElementById('settings-email-note').textContent = preferences.quiet
      ? 'Everything is quiet · turn off the last switch to hear from us again.'
      : (!preferences.salonAnnounced && !preferences.salonMonth && !preferences.salonWeek
          && !preferences.salonDay && !preferences.salonHour && !preferences.fieldNotes)
        ? 'No optional Club email · this member area is the only door.'
        : 'Every Club email ends with a link back to this page.';
  }

  function emailPreferencesFromPage() {
    return {
      salonAnnounced: document.getElementById('email-salon-announced').checked,
      salonMonth: document.getElementById('email-salon-month').checked,
      salonWeek: document.getElementById('email-salon-week').checked,
      salonDay: document.getElementById('email-salon-day').checked,
      salonHour: document.getElementById('email-salon-hour').checked,
      fieldNotes: document.getElementById('email-field-notes').checked,
      quiet: document.getElementById('email-quiet').checked,
    };
  }

  async function saveEmailSettings() {
    const statusNode = document.getElementById('settings-email-status');
    const previous = settingsState.email; const emailSettings = emailPreferencesFromPage();
    settingsState.email = emailSettings; renderSettings(); statusNode.textContent = 'Saving…';
    try {
      if (!previewMode) settingsState = await call('/api/club/settings', {
        method: 'PATCH', body: JSON.stringify({ email: emailSettings }),
      });
      renderSettings(); statusNode.textContent = 'Saved.';
    } catch (_) {
      settingsState.email = previous; renderSettings(); statusNode.textContent = 'That change could not be saved. Try again.';
    }
  }

  async function signOutAll() {
    if (!window.confirm('Sign out every device, including this one?')) return;
    const statusNode = document.getElementById('settings-access-status'); statusNode.textContent = '';
    const button = document.getElementById('sign-out-all'); button.disabled = true;
    try {
      if (!previewMode) await call('/api/club/settings/sign-out-all', { method: 'POST', body: '{}' });
      if (previewMode) { statusNode.textContent = 'In the live member area, every device would now be signed out.'; return; }
      forgetToken(); location.replace('/members/?signed-out=all');
    } catch (_) { statusNode.textContent = 'Your sessions could not be ended. Try again.'; }
    finally { button.disabled = false; }
  }

  function closeLeaveFlow() {
    const form = document.getElementById('leave-form'); form.hidden = true; form.reset();
    document.querySelector('input[name="leave-note-policy"][value="keep_signed"]').checked = true;
    document.getElementById('leave-intro').hidden = false;
    document.getElementById('leave-status').textContent = '';
  }

  async function submitLeave(event) {
    event.preventDefault();
    const form = document.getElementById('leave-form');
    const statusNode = document.getElementById('leave-status'); statusNode.textContent = '';
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const payload = {
      notePolicy: new FormData(form).get('leave-note-policy'),
      confirm: document.getElementById('leave-confirm').value,
    };
    const button = document.getElementById('leave-submit'); button.disabled = true;
    try {
      if (previewMode) {
        statusNode.textContent = 'Preview only. In the live member area this would take effect immediately.';
        return;
      }
      await call('/api/club/settings/leave', { method: 'POST', body: JSON.stringify(payload) });
      forgetToken(); location.replace('/members/?left=1');
    } catch (error) {
      statusNode.textContent = error.message === 'last host'
        ? 'The last host cannot leave until another host has been appointed.'
        : 'Leaving could not be completed. Nothing has changed; try again.';
    } finally { button.disabled = false; }
  }

  function viewFromHash() {
    return ({
      '#field-notes': 'field-notes', '#in-person': 'in-person', '#giving': 'giving',
      '#members': 'members', '#profile': 'profile',
      '#settings': 'settings',
    })[location.hash] || 'salon';
  }

  function showView(name) {
    const field = name === 'field-notes';
    const inPerson = name === 'in-person';
    const giving = name === 'giving';
    const directory = name === 'members';
    const profile = name === 'profile';
    const settings = name === 'settings';
    const directoryPage = document.getElementById('directory-page');
    const directoryOpening = directory && directoryPage.hidden;
    document.getElementById('salon-page').hidden = field || inPerson || giving || directory || profile || settings;
    document.getElementById('field-notes-page').hidden = !field;
    document.getElementById('in-person-page').hidden = !inPerson;
    document.getElementById('giving-page').hidden = !giving;
    directoryPage.hidden = !directory;
    document.getElementById('profile-page').hidden = !profile;
    document.getElementById('settings-page').hidden = !settings;
    document.querySelectorAll('[data-member-view]').forEach((link) => {
      const selected = field ? 'field-notes' : inPerson ? 'in-person' : giving ? 'giving'
        : directory ? 'members' : profile ? 'profile' : settings ? 'settings' : 'salon';
      const current = link.dataset.memberView === selected;
      link.classList.toggle('current', current);
      if (current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (field) renderFieldNotes();
    if (giving) renderGiving();
    if (directory) {
      if (directoryOpening) directoryOrder = shuffledDirectoryOrder(orderedDirectoryMembers());
      renderDirectory();
    }
    if (profile) renderProfile();
    if (settings) renderSettings();
    const drawer = document.getElementById('members-drawer');
    const drawerVisible = name === 'salon';
    drawer.hidden = !drawerVisible;
    if (drawerVisible) { setMembersDrawerMode(membersDrawerMode); renderMembersDrawer(); }
  }

  function showMemberApp() {
    loginPage.hidden = true;
    welcomePage.hidden = true;
    memberApp.hidden = false;
    document.getElementById('member-host-link').hidden = !member.isHost;
    document.getElementById('mobile-host-link').hidden = !member.isHost;
    updateClock(); renderSalon();
    showView(member.name ? viewFromHash() : 'profile');
  }

  async function enter(memberData, options = {}) {
    member = memberData;
    if (!member.agreementAccepted) {
      showWelcome(0);
      return;
    }
    showLogin(waiting);
    const [salonState, notesState, memberGiving, directory, settings] = await Promise.all([
      call('/api/club/salon'), call('/api/club/field-notes'), call('/api/club/giving'),
      call('/api/club/directory'), call('/api/club/settings'),
    ]);
    salon = salonState.salon; fieldNotes = notesState; givingState = memberGiving;
    directoryState = directory; settingsState = settings;
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!member.onboardingCompleted) showWelcome(Number.isInteger(options.welcomeStep) ? options.welcomeStep : 4);
    else if (Number.isInteger(options.welcomeStep)) showWelcome(options.welcomeStep);
    else showMemberApp();
  }

  async function setRsvp(status) {
    if (!salon) return;
    const statusNode = document.getElementById('rsvp-status');
    statusNode.textContent = '';
    try {
      if (previewMode) {
        if (salon.myRsvp === 'in') salon.rsvpCount = Math.max(0, salon.rsvpCount - 1);
        salon.myRsvp = status;
        if (status === 'in') salon.rsvpCount += 1;
        renderRsvp(); return;
      }
      const state = await call(`/api/club/salons/${salon.id}/rsvp`, {
        method: 'POST', body: JSON.stringify({ status }),
      });
      salon = state.salon; renderRsvp();
    } catch (error) {
      statusNode.textContent = error.status === 409
        ? 'The Salon has already begun.' : 'Your response could not be saved. Try again.';
    }
  }

  function calendarText() {
    const start = new Date(salon.startsAt);
    const end = new Date(start.getTime() + salon.durationMinutes * 60000);
    const stamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Beings Club//Salon//EN',
      'BEGIN:VEVENT', `UID:salon-${salon.id}@beingsclub.com`,
      `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      'SUMMARY:Beings Club Salon',
      'DESCRIPTION:The Salon doorway opens at beingsclub.com/members/ ten minutes before.',
      'URL:https://beingsclub.com/members/', 'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n');
  }

  function downloadCalendar() {
    if (!salon) return;
    const url = URL.createObjectURL(new Blob([calendarText()], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'beings-club-salon.ics';
    document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }

  async function signOut() {
    if (!previewMode) {
      try { await call('/api/club/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
    }
    forgetToken(); location.replace('/members/');
  }

  async function reloadFieldNotes() {
    if (previewMode) { renderFieldNotes(); return; }
    fieldNotes = await call('/api/club/field-notes'); renderFieldNotes();
  }

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function clampProfileCrop() {
    if (!profileCropImage) return;
    const canvas = document.getElementById('profile-crop-canvas');
    const base = Math.max(canvas.width / profileCropImage.naturalWidth, canvas.height / profileCropImage.naturalHeight);
    const scale = base * profileCropZoom;
    const limitX = Math.max(0, (profileCropImage.naturalWidth * scale - canvas.width) / 2);
    const limitY = Math.max(0, (profileCropImage.naturalHeight * scale - canvas.height) / 2);
    profileCropOffsetX = Math.max(-limitX, Math.min(limitX, profileCropOffsetX));
    profileCropOffsetY = Math.max(-limitY, Math.min(limitY, profileCropOffsetY));
  }

  function renderProfileCrop() {
    if (!profileCropImage) return;
    clampProfileCrop();
    const canvas = document.getElementById('profile-crop-canvas');
    const context = canvas.getContext('2d');
    const base = Math.max(canvas.width / profileCropImage.naturalWidth, canvas.height / profileCropImage.naturalHeight);
    const scale = base * profileCropZoom;
    const width = profileCropImage.naturalWidth * scale;
    const height = profileCropImage.naturalHeight * scale;
    context.fillStyle = '#F0EBFB'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      profileCropImage,
      (canvas.width - width) / 2 + profileCropOffsetX,
      (canvas.height - height) / 2 + profileCropOffsetY,
      width, height,
    );
  }

  async function openProfileCrop(file, target = 'profile') {
    const data = await readImage(file);
    const image = new Image();
    image.decoding = 'async';
    await new Promise((resolve, reject) => {
      image.onload = resolve; image.onerror = reject; image.src = data;
    });
    profileCropImage = image; profileCropTarget = target; profileCropZoom = 1;
    profileCropOffsetX = 0; profileCropOffsetY = 0; profileCropPointer = null;
    const zoom = document.getElementById('profile-crop-zoom'); zoom.value = '1';
    renderProfileCrop();
    document.getElementById('profile-cropper').showModal();
  }

  function closeProfileCrop() {
    const dialog = document.getElementById('profile-cropper');
    if (dialog.open) dialog.close();
    profileCropImage = null; profileCropPointer = null;
    document.getElementById(profileCropTarget === 'welcome'
      ? 'welcome-profile-image-input' : 'profile-image-input').value = '';
  }

  function applyProfileCrop() {
    if (!profileCropImage) return;
    renderProfileCrop();
    profileImageData = document.getElementById('profile-crop-canvas').toDataURL('image/jpeg', 0.9);
    removeProfileImage = false;
    const welcome = profileCropTarget === 'welcome';
    const image = document.getElementById(welcome ? 'welcome-profile-image-preview' : 'profile-image-preview');
    image.src = profileImageData; image.hidden = false;
    document.getElementById(welcome ? 'welcome-profile-image-fallback' : 'profile-image-fallback').hidden = true;
    if (!welcome) document.getElementById('profile-image-remove').hidden = false;
    document.getElementById(welcome ? 'welcome-profile-status' : 'profile-status').textContent = 'Crop ready. Save to keep it.';
    closeProfileCrop();
  }

  async function removeNote(note) {
    if (!window.confirm('Remove this Field Note? This cannot be undone.')) return;
    const statusNode = document.getElementById('field-note-status'); statusNode.textContent = '';
    try {
      if (previewMode) {
        const group = fieldNotes.groups.find((entry) => entry.salonId === note.salonId);
        group.notes = group.notes.filter((entry) => entry.id !== note.id);
      } else {
        await call(`/api/club/field-notes/${note.id}`, { method: 'DELETE', body: '{}' });
        fieldNotes = await call('/api/club/field-notes');
      }
      editingNote = null; renderFieldNotes();
    } catch (_) { statusNode.textContent = 'That Field Note could not be removed. Try again.'; }
  }

  async function submitFieldNote(event) {
    event.preventDefault();
    const statusNode = document.getElementById('field-note-status'); statusNode.textContent = '';
    const link = document.getElementById('field-note-link');
    if (link.value && !link.checkValidity()) { link.reportValidity(); return; }
    const body = document.getElementById('field-note-body').value.trim();
    if (!body && !link.value.trim() && !chosenImageData && !(editingNote?.hasImage && !removeExistingImage)) {
      statusNode.textContent = 'Add a thought, link or image first.'; return;
    }
    const payload = {
      body,
      linkUrl: link.value,
      imageData: chosenImageData,
      imageAlt: document.getElementById('field-note-alt').value,
      removeImage: removeExistingImage,
      isAnonymous: document.querySelector('input[name="field-note-attribution"]:checked').value === 'anonymous',
    };
    const button = document.getElementById('field-note-share'); button.disabled = true;
    try {
      if (previewMode) {
        if (editingNote) Object.assign(editingNote, payload, { linkUrl: payload.linkUrl || null, editedAt: new Date().toISOString() });
        else fieldNotes.prompt = null;
      } else if (editingNote) {
        await call(`/api/club/field-notes/${editingNote.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await call('/api/club/field-notes', {
          method: 'POST', body: JSON.stringify({ ...payload, salonId: fieldNotes.prompt.salonId }),
        });
      }
      editingNote = null;
      if (!previewMode) fieldNotes = await call('/api/club/field-notes');
      renderFieldNotes();
    } catch (error) {
      statusNode.textContent = error.message === 'image' ? 'That image could not be used.' : 'Your Field Note could not be shared. Try again.';
    } finally { button.disabled = false; }
  }

  async function dismissInvitation() {
    if (!fieldNotes.prompt) return;
    const button = document.getElementById('field-note-dismiss'); button.disabled = true;
    try {
      if (!previewMode) {
        await call(`/api/club/field-note-invitations/${fieldNotes.prompt.salonId}/dismiss`, { method: 'POST', body: '{}' });
        fieldNotes = await call('/api/club/field-notes');
      } else fieldNotes.prompt = null;
      renderFieldNotes();
    } catch (_) { document.getElementById('field-note-status').textContent = 'The invitation could not be dismissed. Try again.'; }
    finally { button.disabled = false; }
  }

  async function loadGiving() {
    if (!previewMode) givingState = await call('/api/club/giving');
    renderGiving();
  }

  async function submitTestimonial(event) {
    event.preventDefault();
    const form = document.getElementById('testimonial-form');
    const statusNode = document.getElementById('testimonial-status'); statusNode.textContent = '';
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const payload = {
      name: document.getElementById('testimonial-name').value,
      body: document.getElementById('testimonial-body').value,
      consent: document.getElementById('testimonial-consent').checked,
    };
    const button = document.getElementById('testimonial-submit'); button.disabled = true;
    try {
      if (previewMode) {
        givingState.testimonial = {
          id: givingState.testimonial?.id || 1,
          attributionName: payload.name.trim(), body: payload.body.trim(),
          status: 'pending', canEdit: true,
        };
        givingState.canSubmit = false;
      } else if (editingTestimonial) {
        await call(`/api/club/testimonials/${givingState.testimonial.id}`, {
          method: 'PATCH', body: JSON.stringify(payload),
        });
      } else {
        await call('/api/club/testimonials', { method: 'POST', body: JSON.stringify(payload) });
      }
      editingTestimonial = false; await loadGiving();
    } catch (error) {
      statusNode.textContent = error.message === 'already offered this month'
        ? 'You have already offered words this month.'
        : 'Your words could not be saved. Try again.';
    } finally { button.disabled = false; }
  }

  function editTestimonial() {
    if (!givingState.testimonial?.canEdit) return;
    editingTestimonial = true; renderGiving();
    document.getElementById('testimonial-name').value = givingState.testimonial.attributionName;
    document.getElementById('testimonial-body').value = givingState.testimonial.body;
    document.getElementById('testimonial-consent').checked = false;
    document.getElementById('testimonial-submit').textContent = 'save these words';
    document.getElementById('testimonial-cancel-edit').hidden = false;
    document.getElementById('testimonial-body').focus();
  }

  async function withdrawTestimonial() {
    if (!givingState.testimonial?.canEdit) return;
    if (!window.confirm('Withdraw these words from John’s private queue?')) return;
    const statusNode = document.getElementById('testimonial-status'); statusNode.textContent = '';
    try {
      if (previewMode) {
        givingState.testimonial.status = 'withdrawn'; givingState.testimonial.canEdit = false;
      } else {
        await call(`/api/club/testimonials/${givingState.testimonial.id}`, { method: 'DELETE', body: '{}' });
      }
      editingTestimonial = false; await loadGiving();
    } catch (_) { statusNode.textContent = 'These words could not be withdrawn. Try again.'; }
  }

  async function submitProfile(event) {
    event.preventDefault();
    const form = document.getElementById('profile-form');
    const statusNode = document.getElementById('profile-status'); statusNode.textContent = '';
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const payload = {
      name: document.getElementById('profile-name').value,
      line: document.getElementById('profile-line').value,
      website: document.getElementById('profile-website').value,
      imageData: profileImageData,
      removeImage: removeProfileImage,
    };
    const button = document.getElementById('profile-save'); button.disabled = true;
    try {
      if (previewMode) {
        const profile = directoryState.profile;
        Object.assign(profile, {
          name: payload.name.trim(), line: payload.line.trim(), website: payload.website.trim(),
          hasImage: profileImageData ? true : (removeProfileImage ? false : profile.hasImage),
          previewImage: profileImageData || (removeProfileImage ? null : profile.previewImage),
        });
        const existing = directoryState.members.find((person) => person.id === profile.id);
        if (existing) Object.assign(existing, profile, { isMe: true });
      } else {
        directoryState = await call('/api/club/profile', { method: 'PATCH', body: JSON.stringify(payload) });
      }
      member.name = directoryState.profile.name;
      member.line = directoryState.profile.line;
      member.website = directoryState.profile.website;
      member.hasImage = directoryState.profile.hasImage;
      givingState.suggestedName = member.name;
      updateClock(); renderProfile(); statusNode.textContent = 'Profile saved.';
    } catch (error) {
      statusNode.textContent = error.message === 'image'
        ? 'That image could not be used.' : 'Your profile could not be saved. Try again.';
    } finally { button.disabled = false; }
  }

  async function submitWelcomeProfile(event) {
    event.preventDefault();
    const form = document.getElementById('welcome-profile-form');
    const statusNode = document.getElementById('welcome-profile-status'); statusNode.textContent = '';
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const payload = {
      name: document.getElementById('welcome-profile-name').value,
      line: document.getElementById('welcome-profile-line').value,
      website: document.getElementById('welcome-profile-website').value,
      imageData: profileImageData,
      removeImage: false,
    };
    const button = document.getElementById('welcome-profile-save'); button.disabled = true;
    try {
      if (previewMode) {
        const existing = directoryState.profile || {
          id: member?.id || 1, email: member?.email || '', hasImage: false,
        };
        Object.assign(existing, {
          name: payload.name.trim(), line: payload.line.trim(), website: payload.website.trim(),
          hasImage: profileImageData ? true : existing.hasImage,
          previewImage: profileImageData || existing.previewImage || null,
        });
        directoryState.profile = existing;
        directoryState.members = directoryState.members || [];
        const listed = directoryState.members.find((person) => person.id === existing.id);
        if (listed) Object.assign(listed, existing, { isMe: true });
        else directoryState.members.push({ ...existing, isMe: true });
      } else {
        directoryState = await call('/api/club/profile', { method: 'PATCH', body: JSON.stringify(payload) });
      }
      member.name = directoryState.profile.name;
      member.line = directoryState.profile.line;
      member.website = directoryState.profile.website;
      member.hasImage = directoryState.profile.hasImage;
      givingState.suggestedName = member.name;
      profileImageData = null;
      showWelcome(5);
    } catch (error) {
      statusNode.textContent = error.message === 'image'
        ? 'That image could not be used.' : 'Your profile could not be saved. Try again.';
    } finally { button.disabled = false; }
  }

  emailForm.addEventListener('submit', async (event) => {
    event.preventDefault(); emailStatus.textContent = '';
    email = emailInput.value.trim().toLowerCase();
    if (!emailInput.checkValidity()) { emailInput.reportValidity(); return; }
    const button = emailForm.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      const result = await requestCode();
      if (result === 'limited') emailStatus.textContent = 'Please wait a minute before requesting another code.';
    }
    catch (_) { emailStatus.textContent = 'Something went wrong. Please try again.'; }
    finally { button.disabled = false; }
  });

  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6); });
  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault(); codeStatus.textContent = '';
    if (!/^\d{6}$/.test(codeInput.value)) { codeStatus.textContent = 'Enter all six digits.'; return; }
    const button = codeForm.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      const data = await call('/api/club/auth/verify', {
        method: 'POST', body: JSON.stringify({ challenge, code: codeInput.value }),
      });
      saveToken(data.token); await enter(data.member);
    } catch (_) {
      codeStatus.textContent = 'That code didn’t work. Check it and try again.'; codeInput.select();
    } finally { button.disabled = false; }
  });

  document.getElementById('try-again').addEventListener('click', () => {
    clearInterval(countdown); challenge = null; codeStatus.textContent = ''; showLogin(emailForm); emailInput.focus();
  });
  prospectEmailForm.addEventListener('submit', async (event) => {
    event.preventDefault(); prospectEmailStatus.textContent = '';
    prospectName = prospectNameInput.value.trim();
    prospectEmail = prospectEmailInput.value.trim().toLowerCase();
    if (!prospectNameInput.checkValidity()) { prospectNameInput.reportValidity(); return; }
    if (!prospectEmailInput.checkValidity()) { prospectEmailInput.reportValidity(); return; }
    const button = prospectEmailForm.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      if (previewMode) {
        document.getElementById('prospect-email-shown').textContent = prospectEmail;
        showLogin(prospectCodeForm); prospectCodeInput.focus();
      } else await requestProspectCode();
    }
    catch (_) { prospectEmailStatus.textContent = 'Something went wrong. Please try again.'; }
    finally { button.disabled = false; }
  });
  prospectCodeInput.addEventListener('input', () => {
    prospectCodeInput.value = prospectCodeInput.value.replace(/\D/g, '').slice(0, 6);
  });
  prospectCodeForm.addEventListener('submit', async (event) => {
    event.preventDefault(); prospectCodeStatus.textContent = '';
    if (!/^\d{6}$/.test(prospectCodeInput.value)) {
      prospectCodeStatus.textContent = 'Enter all six digits.'; return;
    }
    const button = prospectCodeForm.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      if (previewMode) { showProspectPreview('calendar'); return; }
      const data = await prospectCall('/api/club/prospect/auth/verify', {
        method: 'POST', body: JSON.stringify({
          challenge: prospectChallenge, code: prospectCodeInput.value,
        }),
      });
      saveProspectToken(data.token); prospect = data.prospect; renderProspect();
    } catch (_) {
      prospectCodeStatus.textContent = 'That code didn’t work. Check it and try again.';
      prospectCodeInput.select();
    } finally { button.disabled = false; }
  });
  document.getElementById('prospect-try-again').addEventListener('click', () => {
    clearInterval(prospectCountdown); prospectChallenge = null;
    prospectCodeStatus.textContent = ''; showLogin(prospectEmailForm); prospectNameInput.focus();
  });
  prospectResend.addEventListener('click', async () => {
    if (prospectResend.disabled) return;
    prospectCodeStatus.textContent = '';
    try { await requestProspectCode(); prospectCodeStatus.textContent = 'Another code is on its way.'; }
    catch (_) { prospectCodeStatus.textContent = 'Something went wrong. Please try again.'; }
  });
  document.getElementById('agreement-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) { event.currentTarget.reportValidity(); return; }
    const statusNode = document.getElementById('agreement-status');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    statusNode.textContent = ''; button.disabled = true;
    try {
      if (replayingWelcome && member?.agreementAccepted) {
        showWelcome(4);
        return;
      }
      if (previewMode) {
        member.agreementAccepted = true; member.agreementVersion = '2026-09-01';
        showWelcome(4);
        return;
      }
      const data = await call('/api/club/agreement', {
        method: 'POST',
        body: JSON.stringify({
          accepted: true,
          version: document.getElementById('agreement-version').value,
        }),
      });
      await enter(data.member, { welcomeStep: 4 });
    } catch (_) {
      statusNode.textContent = 'Your agreement could not be saved. Nothing has changed; try again.';
    } finally { button.disabled = false; }
  });
  document.getElementById('welcome-skip').addEventListener('click', async () => {
    if (!member?.agreementAccepted && welcomeStep < 3) {
      welcomeStep = 3;
      renderWelcome();
      return;
    }
    await finishWelcome();
  });
  document.getElementById('welcome-next').addEventListener('click', async () => {
    if (welcomeStep >= 6) { await finishWelcome(); return; }
    welcomeStep += 1;
    renderWelcome();
  });
  document.getElementById('welcome-profile-form').addEventListener('submit', submitWelcomeProfile);
  document.getElementById('welcome-profile-later').addEventListener('click', () => {
    profileImageData = null;
    showWelcome(5);
  });
  document.getElementById('welcome-profile-name').addEventListener('input', (event) => {
    document.getElementById('welcome-profile-image-fallback').textContent = memberInitial(event.target.value);
  });
  document.getElementById('welcome-profile-image-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const statusNode = document.getElementById('welcome-profile-status'); statusNode.textContent = '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      statusNode.textContent = 'Choose a JPEG, PNG or WebP no larger than 5MB.'; event.target.value = ''; return;
    }
    try {
      await openProfileCrop(file, 'welcome');
    } catch (_) { statusNode.textContent = 'That image could not be read.'; }
  });
  resend.addEventListener('click', async () => {
    if (resend.disabled) return;
    codeStatus.textContent = '';
    try {
      const result = await requestCode();
      if (result === 'sent') codeStatus.textContent = 'Another code is on its way.';
      if (result === 'limited') codeStatus.textContent = 'Please wait a minute before requesting another code.';
    }
    catch (_) { codeStatus.textContent = 'Something went wrong. Please try again.'; }
  });
  document.querySelectorAll('[data-rsvp]').forEach((button) => button.addEventListener('click', () => setRsvp(button.dataset.rsvp)));
  document.getElementById('rsvp-clear').addEventListener('click', () => setRsvp(null));
  document.getElementById('rsvp-clear-not').addEventListener('click', () => setRsvp(null));
  document.getElementById('calendar-link').addEventListener('click', downloadCalendar);
  document.getElementById('salon-time').addEventListener('click', () => { showClubTime = !showClubTime; renderTime(); });
  document.getElementById('sign-out').addEventListener('click', signOut);
  document.getElementById('mobile-sign-out').addEventListener('click', signOut);
  document.getElementById('field-note-form').addEventListener('submit', submitFieldNote);
  document.getElementById('field-note-dismiss').addEventListener('click', dismissInvitation);
  document.getElementById('field-note-cancel-edit').addEventListener('click', () => {
    editingNote = null; renderFieldNotes();
  });
  document.getElementById('field-note-image').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const statusNode = document.getElementById('field-note-status'); statusNode.textContent = '';
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      statusNode.textContent = 'Choose a JPEG, PNG, GIF or WebP no larger than 5MB.'; event.target.value = ''; return;
    }
    try {
      chosenImageData = await readImage(file); removeExistingImage = false;
      const preview = document.getElementById('field-note-image-preview'); preview.src = chosenImageData; preview.hidden = false;
      document.getElementById('field-note-image-name').textContent = file.name;
      document.getElementById('field-note-image-remove').hidden = false;
      document.getElementById('field-note-alt-wrap').hidden = false;
    } catch (_) { statusNode.textContent = 'That image could not be read.'; }
  });
  document.getElementById('field-note-image-remove').addEventListener('click', () => {
    chosenImageData = null; removeExistingImage = !!editingNote?.hasImage;
    document.getElementById('field-note-image').value = '';
    document.getElementById('field-note-image-preview').hidden = true;
    document.getElementById('field-note-image-preview').removeAttribute('src');
    document.getElementById('field-note-image-name').textContent = removeExistingImage ? 'Image will be removed' : 'JPEG, PNG, GIF or WebP · up to 5MB';
    document.getElementById('field-note-image-remove').hidden = true;
    document.getElementById('field-note-alt-wrap').hidden = true;
  });
  document.getElementById('testimonial-form').addEventListener('submit', submitTestimonial);
  document.getElementById('testimonial-edit').addEventListener('click', editTestimonial);
  document.getElementById('testimonial-withdraw').addEventListener('click', withdrawTestimonial);
  document.getElementById('testimonial-cancel-edit').addEventListener('click', () => {
    editingTestimonial = false; renderGiving();
  });
  document.querySelectorAll('[data-giving-cadence]').forEach((button) => {
    button.addEventListener('click', () => {
      givingCadence = button.dataset.givingCadence; updateFinancialGivingForm();
    });
  });
  document.querySelectorAll('[data-giving-currency]').forEach((button) => {
    button.addEventListener('click', () => {
      givingCurrency = button.dataset.givingCurrency; updateFinancialGivingForm();
    });
  });
  document.getElementById('member-give').addEventListener('click', beginFinancialGiving);
  document.getElementById('member-giving-manage').addEventListener('click', manageFinancialGiving);
  document.getElementById('profile-form').addEventListener('submit', submitProfile);
  document.getElementById('profile-name').addEventListener('input', (event) => {
    document.getElementById('profile-image-fallback').textContent = memberInitial(event.target.value);
  });
  document.getElementById('profile-image-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const statusNode = document.getElementById('profile-status'); statusNode.textContent = '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      statusNode.textContent = 'Choose a JPEG, PNG or WebP no larger than 5MB.'; event.target.value = ''; return;
    }
    try {
      await openProfileCrop(file, 'profile');
    } catch (_) { statusNode.textContent = 'That image could not be read.'; }
  });
  const cropCanvas = document.getElementById('profile-crop-canvas');
  cropCanvas.addEventListener('pointerdown', (event) => {
    if (!profileCropImage) return;
    cropCanvas.setPointerCapture(event.pointerId);
    profileCropPointer = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      offsetX: profileCropOffsetX, offsetY: profileCropOffsetY,
    };
    cropCanvas.classList.add('is-dragging');
  });
  cropCanvas.addEventListener('pointermove', (event) => {
    if (!profileCropPointer || profileCropPointer.id !== event.pointerId) return;
    const ratio = cropCanvas.width / cropCanvas.getBoundingClientRect().width;
    profileCropOffsetX = profileCropPointer.offsetX + ((event.clientX - profileCropPointer.x) * ratio);
    profileCropOffsetY = profileCropPointer.offsetY + ((event.clientY - profileCropPointer.y) * ratio);
    renderProfileCrop();
  });
  const stopCropDrag = (event) => {
    if (!profileCropPointer || profileCropPointer.id !== event.pointerId) return;
    profileCropPointer = null; cropCanvas.classList.remove('is-dragging');
    if (cropCanvas.hasPointerCapture(event.pointerId)) cropCanvas.releasePointerCapture(event.pointerId);
  };
  cropCanvas.addEventListener('pointerup', stopCropDrag);
  cropCanvas.addEventListener('pointercancel', stopCropDrag);
  document.getElementById('profile-crop-zoom').addEventListener('input', (event) => {
    profileCropZoom = Number(event.target.value); renderProfileCrop();
  });
  document.getElementById('profile-crop-apply').addEventListener('click', applyProfileCrop);
  document.getElementById('profile-crop-cancel').addEventListener('click', closeProfileCrop);
  document.getElementById('profile-cropper').addEventListener('cancel', (event) => {
    event.preventDefault(); closeProfileCrop();
  });
  document.getElementById('profile-image-remove').addEventListener('click', () => {
    profileImageData = null; removeProfileImage = true;
    document.getElementById('profile-image-input').value = '';
    const image = document.getElementById('profile-image-preview'); image.hidden = true; image.removeAttribute('src');
    document.getElementById('profile-image-fallback').hidden = false;
    document.getElementById('profile-image-remove').hidden = true;
  });
  document.getElementById('directory-randomise').addEventListener('click', randomiseDirectory);
  document.getElementById('members-drawer-tab').addEventListener('click', () => {
    membersDrawerTouched = true; setMembersDrawerMode('compact');
  });
  document.getElementById('members-drawer-minimise').addEventListener('click', () => {
    membersDrawerTouched = true; setMembersDrawerMode('minimised');
  });
  document.getElementById('members-drawer-resize').addEventListener('click', () => {
    membersDrawerTouched = true;
    setMembersDrawerMode(membersDrawerMode === 'expanded' ? 'compact' : 'expanded');
  });
  [
    'email-salon-announced', 'email-salon-month', 'email-salon-week', 'email-salon-day',
    'email-salon-hour',
    'email-field-notes', 'email-quiet',
  ].forEach((id) => document.getElementById(id).addEventListener('change', saveEmailSettings));
  document.getElementById('onboarding-replay').addEventListener('click', () => {
    replayingWelcome = true;
    document.getElementById('agreement-check').checked = false;
    showWelcome(0);
  });
  document.getElementById('sign-out-all').addEventListener('click', signOutAll);
  document.getElementById('leave-open').addEventListener('click', () => {
    document.getElementById('leave-intro').hidden = true;
    document.getElementById('leave-form').hidden = false;
    document.querySelector('input[name="leave-note-policy"]:checked').focus();
  });
  document.getElementById('leave-cancel').addEventListener('click', closeLeaveFlow);
  document.getElementById('leave-form').addEventListener('submit', submitLeave);
  window.addEventListener('hashchange', () => {
    const nextView = member?.name ? viewFromHash() : 'profile';
    if (givingThanks && nextView !== 'giving') {
      givingThanks = false;
      const params = new URLSearchParams(location.search);
      params.delete('thanks');
      const query = params.toString();
      history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    }
    showView(nextView);
  });
  window.addEventListener('resize', () => {
    if (membersDrawerTouched) return;
    setMembersDrawerMode('minimised');
  });

  const menu = document.getElementById('mobile-menu');
  const menuButton = document.getElementById('menu-button');
  menuButton.addEventListener('click', () => { menu.hidden = false; menuButton.setAttribute('aria-expanded', 'true'); });
  document.getElementById('menu-close').addEventListener('click', () => {
    menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); menuButton.focus();
  });
  document.querySelectorAll('[data-prospect-preview]').forEach((button) => {
    button.addEventListener('click', () => showProspectPreview(button.dataset.prospectPreview));
  });
  document.getElementById('prospect-month-previous').addEventListener('click', () => {
    calendarMonth = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() - 1, 1));
    if (previewMode) prepareProspectCalendar(true); else loadProspectSlots();
  });
  document.getElementById('prospect-month-next').addEventListener('click', () => {
    calendarMonth = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + 1, 1));
    if (previewMode) prepareProspectCalendar(true); else loadProspectSlots();
  });
  const timezoneSearch = document.getElementById('prospect-timezone-search');
  timezoneSearch.addEventListener('focus', () => renderTimezoneResults(''));
  timezoneSearch.addEventListener('input', (event) => renderTimezoneResults(event.target.value));
  timezoneSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeTimezoneResults(); timezoneSearch.value = prettyTimezone(calendarTimeZone); }
    if (event.key === 'Enter') {
      const first = document.querySelector('#prospect-timezone-results [data-timezone]');
      if (first) { event.preventDefault(); chooseTimezone(first.dataset.timezone); }
    }
  });
  timezoneSearch.addEventListener('blur', () => {
    window.setTimeout(() => {
      closeTimezoneResults(); timezoneSearch.value = prettyTimezone(calendarTimeZone);
    }, 120);
  });
  document.getElementById('prospect-selection-back').addEventListener('click', leaveBookingSelection);
  document.getElementById('prospect-keep-time').addEventListener('click', () => {
    prospectRescheduling = false; selectedCalendarSlot = null; renderProspect();
  });
  document.getElementById('prospect-booking-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedCalendarSlot) return;
    const name = document.getElementById('prospect-booking-name');
    const note = document.getElementById('prospect-booking-note');
    if (!prospectRescheduling && !name.checkValidity()) { name.reportValidity(); return; }
    const button = document.getElementById('prospect-booking-submit');
    const status = document.getElementById('prospect-booking-status');
    button.disabled = true; status.textContent = prospectRescheduling ? 'Moving your conversation…' : 'Confirming your conversation…';
    if (previewMode) {
      const chosen = selectedCalendarSlot;
      prospect = { email: 'you@example.com', booking: {
        uid: 'preview', title: 'A first conversation with John', startTime: chosen,
        endTime: new Date(Date.parse(chosen) + 25 * 60000).toISOString(), verified: true,
      } };
      status.textContent = ''; button.disabled = false; showProspectPreview('booked'); return;
    }
    try {
      const data = await prospectCall('/api/club/prospect/booking', {
        method: 'POST', body: JSON.stringify({
          start: selectedCalendarSlot, timeZone: calendarTimeZone,
          name: name.value, note: note.value, reschedule: prospectRescheduling,
        }),
      });
      prospect = data.prospect; prospectRescheduling = false; selectedCalendarSlot = null;
      renderProspect();
    } catch (error) {
      if (error.status === 409) {
        leaveBookingSelection();
        await loadProspectSlots();
        document.getElementById('prospect-calendar-status').textContent = 'That time has just gone. Please choose another.';
      } else {
        status.textContent = 'That time could not be confirmed. Please try again.';
      }
    } finally { button.disabled = false; }
  });
  document.getElementById('prospect-change-time').addEventListener('click', () => {
    if (previewMode) { showProspectPreview('calendar'); return; }
    prospectRescheduling = true; selectedCalendarSlot = null;
    document.getElementById('prospect-booked').hidden = true;
    document.getElementById('prospect-calendar').hidden = false;
    document.getElementById('prospect-calendar-body').hidden = false;
    document.getElementById('prospect-booking-form').hidden = true;
    loadProspectSlots();
  });
  document.getElementById('prospect-message-open').addEventListener('click', () => {
    prospectMessageSource = 'calendar'; showProspectMessage(true);
  });
  document.getElementById('prospect-message-cancel').addEventListener('click', () => showProspectMessage(false));
  document.getElementById('prospect-message').addEventListener('submit', async (event) => {
    event.preventDefault();
    const statusNode = document.getElementById('prospect-message-status');
    const note = document.getElementById('prospect-message-body');
    if (!note.checkValidity()) { note.reportValidity(); return; }
    const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
    if (previewMode) {
      statusNode.textContent = 'Preview only · this note would be sent privately to John.';
      button.disabled = false; return;
    }
    try {
      const data = await prospectCall('/api/club/prospect/note', {
        method: 'POST', body: JSON.stringify({ note: note.value }),
      });
      prospect = data.prospect;
      statusNode.textContent = data.sent
        ? 'Sent privately to John.'
        : 'Saved here. Email delivery is delayed, but John can see it in the host tools.';
      note.value = '';
    } catch (_) { statusNode.textContent = 'That note could not be sent. Try again.'; }
    finally { button.disabled = false; }
  });
  document.getElementById('prospect-sign-out').addEventListener('click', async () => {
    if (!previewMode) {
      try { await prospectCall('/api/club/prospect/logout', { method: 'POST', body: '{}' }); } catch (_) {}
      forgetProspectToken();
    }
    location.href = '/members/?join=1';
  });
  document.getElementById('prospect-enter-club').addEventListener('click', async () => {
    const statusNode = document.getElementById('prospect-enter-status'); statusNode.textContent = '';
    try {
      const data = await prospectCall('/api/club/prospect/enter', { method: 'POST', body: '{}' });
      saveToken(data.token); forgetProspectToken(); member = data.member; showWelcome(0);
    } catch (_) { statusNode.textContent = 'The member entrance could not open. Try again.'; }
  });

  (async () => {
    const previewParams = new URLSearchParams(location.search);
    const preview = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? previewParams.get('preview') : null;
    if (preview) {
      previewMode = true;
      if (preview === 'login-error') {
        email = 'you@example.com';
        showNonMember(email);
        return;
      }
      if (preview === 'prospective') {
        if (previewParams.get('step') === 'email') {
          showLogin(prospectEmailForm); prospectEmailInput.focus(); return;
        }
        if (previewParams.get('step') === 'code') {
          prospectEmail = 'you@example.com';
          document.getElementById('prospect-email-shown').textContent = prospectEmail;
          showLogin(prospectCodeForm); prospectCodeInput.focus(); return;
        }
        showProspectPreview(previewParams.get('state') === 'booked' ? 'booked' : 'calendar');
        return;
      }
      member = {
        id: 1, email: 'john@spacetobe.xyz', name: 'John', isHost: true,
        agreementAccepted: preview !== 'onboarding', agreementVersion: '2026-09-01',
        onboardingCompleted: preview !== 'onboarding',
      };
      if (preview === 'onboarding') {
        showWelcome(previewParams.get('step') === 'profile' ? 4 : 0);
        return;
      }
      salon = preview === 'empty' ? null : {
        id: 1,
        note: 'We’ll sit first, then wander into pairs and threes. Bring whatever the month has left you with.',
        startsAt: '2026-09-30T18:00:00.000Z',
        timezone: 'Europe/London', durationMinutes: 90, rsvpCount: 11, myRsvp: null,
        joinAvailableAt: '2026-09-30T17:50:00.000Z', zoomUrl: null,
      };
      fieldNotes = {
        prompt: {
          salonId: 2, salonStartsAt: '2026-08-27T18:00:00.000Z',
          promptedAt: '2026-08-27T20:00:00.000Z',
        },
        groups: [
          {
            salonId: 1, salonStartsAt: '2026-07-30T18:00:00.000Z', notes: [
              { id: 1, body: 'I noticed how quickly an ordinary question became a different kind of attention.', linkUrl: null, hasImage: false, imageAlt: null, isAnonymous: false, author: 'Mira', isMine: false, publishedAt: '2026-07-31T10:00:00.000Z', editedAt: null },
              { id: 2, body: 'What if uncertainty is less a problem to solve than somewhere to meet?', linkUrl: 'https://en.wikipedia.org/wiki/Negative_capability', hasImage: false, imageAlt: null, isAnonymous: true, author: null, isMine: false, publishedAt: '2026-07-31T12:00:00.000Z', editedAt: null },
              { id: 3, body: 'The line I kept: attention is already a form of relationship.', linkUrl: null, hasImage: false, imageAlt: null, isAnonymous: false, author: 'John', isMine: true, publishedAt: '2026-08-01T09:00:00.000Z', editedAt: null },
            ],
          },
          {
            salonId: 3, salonStartsAt: '2026-06-25T18:00:00.000Z', notes: [
              { id: 4, body: 'Beginning again.', linkUrl: null, hasImage: false, imageAlt: null, isAnonymous: true, author: null, isMine: false, publishedAt: '2026-06-26T09:00:00.000Z', editedAt: null },
            ],
          },
        ],
      };
      givingState = {
        month: '2026-08', testimonial: null, canSubmit: true,
        suggestedName: 'John', consentVersion: 'public-any-channel-light-edit-v1',
        monthlyGiving: previewParams.get('monthly') === 'active'
          ? { active: true, amount: 1000, currency: 'gbp' } : null,
      };
      directoryState = {
        profile: {
          id: 1, email: 'john@spacetobe.xyz', name: 'John',
          line: 'Holding Beings Club.', website: 'https://spacetobe.xyz/', hasImage: false,
        },
        members: [
          { id: 1, name: 'John', line: 'Holding Beings Club.', website: 'https://spacetobe.xyz/', hasImage: false, isMe: true },
          { id: 2, name: 'Mira', line: 'Working with sound, attention and the spaces between.', website: 'https://example.com/', hasImage: true, previewImage: '/assets/img/about-aura.jpg', isMe: false },
          { id: 3, name: 'Noor', line: 'In motion between technology, care and collective imagination.', website: null, hasImage: false, isMe: false },
          { id: 4, name: 'Sam', line: null, website: 'https://example.org/', hasImage: true, previewImage: '/assets/img/salons-rainbow-circle.jpg', isMe: false },
          { id: 5, name: 'Leila', line: 'Curious about cities, memory and how people gather.', website: null, hasImage: false, isMe: false },
        ],
      };
      settingsState = {
        email: {
          salonAnnounced: true, salonMonth: false, salonWeek: true, salonDay: true,
          salonHour: false, fieldNotes: true, quiet: false,
        },
        account: { email: 'john@spacetobe.xyz', joinedAt: '2026-08-01T12:00:00.000Z', isHost: true },
      };
      showMemberApp(); return;
    }
    const welcomeToken = takeWelcomeToken();
    if (welcomeToken) {
      showLogin(waiting);
      try {
        const data = await call('/api/club/auth/welcome', {
          method: 'POST', body: JSON.stringify({ token: welcomeToken }),
        });
        saveToken(data.token); await enter(data.member); return;
      } catch (_) {
        forgetToken(); showLogin(emailForm);
        emailStatus.textContent = 'That private welcome link has expired or has already been used. Enter your email for a fresh code.';
        emailInput.focus(); return;
      }
    }
    const joining = previewParams.get('join') === '1';
    if (joining || (!token() && prospectToken())) {
      if (!prospectToken()) {
        try {
          const joinEmail = sessionStorage.getItem(JOIN_EMAIL_KEY);
          if (joinEmail) {
            prospectEmailInput.value = joinEmail;
            prospectEmail = joinEmail;
            sessionStorage.removeItem(JOIN_EMAIL_KEY);
          }
        } catch (_) {}
        showLogin(prospectEmailForm); prospectEmailInput.focus(); return;
      }
      showLogin(waiting);
      try {
        const data = await prospectCall('/api/club/prospect/session');
        prospect = data.prospect; renderProspect(); return;
      } catch (_) {
        forgetProspectToken(); showLogin(prospectEmailForm); prospectEmailInput.focus(); return;
      }
    }
    if (!token()) {
      showLogin(emailForm);
      const params = new URLSearchParams(location.search);
      if (params.get('left') === '1') emailStatus.textContent = 'You have left Beings Club. If you ever want to return, leave John a note.';
      if (params.get('signed-out') === 'all') emailStatus.textContent = 'Every device has been signed out.';
      emailInput.focus(); return;
    }
    showLogin(waiting);
    try { const data = await call('/api/club/session'); await enter(data.member); }
    catch (_) { forgetToken(); showLogin(emailForm); emailInput.focus(); }
  })();

  setInterval(updateClock, 30000);
  setInterval(async () => {
    if (!member || previewMode || !salon || salon.zoomUrl) return;
    try { const state = await call('/api/club/salon'); salon = state.salon; renderSalon(); } catch (_) {}
  }, 30000);
})();
