(() => {
  'use strict';
  const API = document.querySelector('meta[name="bc-members-api"]').content;
  const KEY = 'bc_member_session_v1';
  const shell = document.getElementById('host-shell');
  const waiting = document.getElementById('host-waiting');
  const list = document.getElementById('member-list');
  const form = document.getElementById('invite-form');
  const status = document.getElementById('invite-status');
  const salonForm = document.getElementById('salon-form');
  const salonStatus = document.getElementById('salon-status');
  const publishSalon = document.getElementById('publish-salon');
  const saveSalonButton = document.getElementById('save-salon');
  const salonNext = document.getElementById('salon-next');
  const startNextSalon = document.getElementById('start-next-salon');
  const emailAnnouncement = document.getElementById('email-announcement');
  let pendingRemove = null;
  let currentSalon = null;
  let autoZoom = false;
  let previewMode = false;
  let fieldNoteHostState = { salon: null, candidates: [], groups: [] };
  let prospectHostState = [];
  const imageObjectUrls = new Set();

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

  async function callBlob(path) {
    const response = await fetch(`${API}${path}`, {
      headers: { authorization: `Bearer ${token() || ''}` },
    });
    if (!response.ok) throw new Error('image unavailable');
    return response.blob();
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
      actions.append(text('span', `member-status ${state}`, state === 'on_list' ? 'on list' : state));
      if (member.canInvite) {
        const invite = text('button', 'resend-button', member.status === 'invited' ? 'resend invite' : 'send invite');
        invite.type = 'button';
        invite.addEventListener('click', () => inviteMember(member.id, invite));
        actions.append(invite);
      }
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

  function londonParts(iso) {
    if (!iso) return { date: '', time: '' };
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  }

  function zoneOffset(date, timeZone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
      minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    ) - date.getTime();
  }

  function londonInstant(dateText, timeText) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !/^\d{2}:\d{2}$/.test(timeText)) return null;
    const [year, month, day] = dateText.split('-').map(Number);
    const [hour, minute] = timeText.split(':').map(Number);
    const wall = Date.UTC(year, month - 1, day, hour, minute, 0);
    let instant = new Date(wall);
    instant = new Date(wall - zoneOffset(instant, 'Europe/London'));
    instant = new Date(wall - zoneOffset(instant, 'Europe/London'));
    return instant.toISOString();
  }

  function renderSalon(data) {
    currentSalon = data.salon;
    autoZoom = !!data.capabilities?.autoZoom;
    const rsvps = data.rsvps || [];
    const state = document.getElementById('salon-state');
    const summary = document.getElementById('salon-rsvp-summary');
    const roster = document.getElementById('salon-roster');
    const zoomInput = document.getElementById('salon-zoom-url');
    document.getElementById('salon-zoom-label').textContent = autoZoom
      ? 'Zoom join link · optional fallback' : 'Zoom join link';
    document.getElementById('salon-zoom-help').textContent = autoZoom
      ? 'Leave this blank for a fresh Zoom meeting. Paste a secure Zoom link only when you need the fallback.'
      : 'Automatic creation is not connected yet, so add a secure Zoom link before publishing.';
    zoomInput.placeholder = autoZoom ? 'Created automatically when you publish' : 'https://…';
    roster.replaceChildren();

    if (!currentSalon) {
      salonForm.reset(); document.getElementById('salon-id').value = '';
      salonForm.querySelectorAll('input:not([type="hidden"]),textarea').forEach((field) => { field.disabled = false; });
      state.textContent = 'No Salon is being prepared.'; summary.textContent = '';
      publishSalon.textContent = 'publish to members';
      publishSalon.disabled = false; saveSalonButton.disabled = false; salonNext.hidden = true;
      emailAnnouncement.disabled = true; emailAnnouncement.textContent = 'email announcement';
      document.getElementById('announcement-copy').textContent = 'Publish the Salon before announcing it.';
      return;
    }

    const local = londonParts(currentSalon.startsAt);
    document.getElementById('salon-id').value = String(currentSalon.id);
    document.getElementById('salon-date').value = local.date;
    document.getElementById('salon-start-time').value = local.time;
    document.getElementById('salon-host-note').value = currentSalon.note || '';
    zoomInput.value = currentSalon.zoomUrl || '';
    salonForm.querySelectorAll('input:not([type="hidden"]),textarea').forEach((field) => { field.disabled = !!currentSalon.hasEnded; });
    state.textContent = currentSalon.hasEnded
      ? 'This Salon has ended.'
      : currentSalon.status === 'published'
      ? `Published to members.${currentSalon.zoomManaged ? ' Fresh Zoom meeting created.' : ''}`
      : 'Saved privately as a draft.';
    publishSalon.textContent = currentSalon.hasEnded
      ? 'Salon ended' : currentSalon.status === 'published' ? 'published' : 'publish to members';
    publishSalon.disabled = currentSalon.status === 'published';
    saveSalonButton.disabled = !!currentSalon.hasEnded;
    salonNext.hidden = !currentSalon.hasEnded;
    emailAnnouncement.disabled = !!currentSalon.hasEnded || currentSalon.status !== 'published' || !!currentSalon.announcementSentAt;
    emailAnnouncement.textContent = currentSalon.announcementSentAt ? 'announcement sent' : 'email announcement';
    document.getElementById('announcement-copy').textContent = currentSalon.hasEnded
      ? 'This Salon has ended. Its gathering remains here and in Field Notes.'
      : currentSalon.announcementSentAt
      ? 'Sent once. Week and day reminders follow each member’s settings.'
      : currentSalon.status === 'published'
        ? 'Separate from publishing. Sends once only to members who chose announcement email.'
        : 'Publish the Salon before announcing it.';
    summary.textContent = `${currentSalon.rsvpCount || 0} ${currentSalon.rsvpCount === 1 ? 'being is' : 'beings are'} in`;
    rsvps.forEach((rsvp) => {
      const row = document.createElement('div'); row.className = 'salon-roster-row';
      row.append(text('span', '', rsvp.name || rsvp.email), text('span', '', rsvp.status === 'in' ? 'in' : 'not this time'));
      roster.append(row);
    });
  }

  async function loadSalon() {
    renderSalon(await call('/api/club/host/salon'));
  }

  function monthLabel(iso) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', month: 'long', year: 'numeric',
    }).format(new Date(iso));
  }

  async function loadHostImage(note, image) {
    try {
      const blob = await callBlob(`/api/club/field-notes/${note.id}/image`);
      const url = URL.createObjectURL(blob); imageObjectUrls.add(url); image.src = url;
    } catch (_) { image.remove(); }
  }

  function renderFieldNoteHost(data) {
    fieldNoteHostState = data;
    for (const url of imageObjectUrls) URL.revokeObjectURL(url);
    imageObjectUrls.clear();
    const attendance = document.getElementById('attendance-list'); attendance.replaceChildren();
    const submit = document.getElementById('open-field-note-invitations');
    const intro = document.getElementById('field-note-host-intro');
    if (!data.salon) {
      intro.textContent = 'After a Salon ends, this is where you mark who attended and open their Field Note invitation.';
      submit.disabled = true;
      attendance.append(text('p', 'attendance-empty', 'No completed Salon yet.'));
    } else {
      intro.textContent = `Mark who attended the ${monthLabel(data.salon.startsAt)} Salon. Their invitation appears immediately and arrives once by email.`;
      submit.disabled = false;
      data.candidates.forEach((person) => {
        const label = document.createElement('label'); label.className = 'attendance-row';
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
        checkbox.value = String(person.memberId); checkbox.checked = person.prompted; checkbox.disabled = person.prompted;
        const identity = document.createElement('span');
        identity.append(text('strong', '', person.name || person.email), text('small', '', person.email));
        const states = [];
        if (person.rsvp === 'in') states.push('RSVP’d in');
        if (person.prompted) states.push(person.shared ? 'shared' : 'invited');
        label.append(checkbox, identity, text('em', '', states.join(' · ') || 'no RSVP'));
        attendance.append(label);
      });
    }

    const archive = document.getElementById('host-field-note-archive'); archive.replaceChildren();
    (data.groups || []).forEach((group) => {
      const section = document.createElement('section'); section.className = 'host-field-note-group';
      section.append(text('h3', '', monthLabel(group.salonStartsAt)));
      group.notes.forEach((note) => {
        const card = document.createElement('article'); card.className = 'host-field-note-card';
        const identity = note.anonymousToMembers
          ? `${note.author} · anonymous to members` : note.author;
        card.append(text('span', 'host-note-identity', identity));
        if (note.hasImage) {
          const image = document.createElement('img'); image.alt = note.imageAlt || '';
          card.append(image); loadHostImage(note, image);
        }
        if (note.body) card.append(text('p', '', note.body));
        if (note.linkUrl) {
          const link = text('a', '', 'open reference ↗'); link.href = note.linkUrl;
          link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link);
        }
        const remove = text('button', 'text-button', 'remove'); remove.type = 'button';
        remove.addEventListener('click', () => removeHostedNote(note.id)); card.append(remove);
        section.append(card);
      });
      archive.append(section);
    });
  }

  async function loadFieldNoteHost() {
    renderFieldNoteHost(await call('/api/club/host/field-notes'));
  }

  function renderTestimonialQueue(data) {
    const queue = document.getElementById('testimonial-queue'); queue.replaceChildren();
    const testimonials = data.testimonials || [];
    if (!testimonials.length) {
      queue.append(text('p', 'testimonial-queue-empty', 'Nothing waiting.'));
      return;
    }
    testimonials.forEach((testimonial) => {
      const card = document.createElement('article'); card.className = 'testimonial-queue-card';
      const head = document.createElement('div'); head.className = 'testimonial-queue-head';
      const identity = document.createElement('span');
      identity.append(text('strong', '', testimonial.attributionName), text('small', '', testimonial.email));
      head.append(identity, text('em', '', testimonial.month));
      const quote = text('blockquote', '', testimonial.body);
      const actions = document.createElement('div'); actions.className = 'testimonial-queue-actions';
      const copy = text('button', 'outline', 'copy words'); copy.type = 'button';
      copy.addEventListener('click', async () => {
        const statusNode = document.getElementById('testimonial-queue-status');
        try {
          await navigator.clipboard.writeText(`“${testimonial.body}”\n— ${testimonial.attributionName}`);
          statusNode.textContent = 'Copied.';
        } catch (_) { statusNode.textContent = 'Copy was unavailable. Select the words directly.'; }
      });
      const used = text('button', 'primary', 'mark used'); used.type = 'button';
      used.addEventListener('click', () => resolveQueuedTestimonial(testimonial.id, 'used'));
      const pass = text('button', 'text-button', 'pass'); pass.type = 'button';
      pass.addEventListener('click', () => resolveQueuedTestimonial(testimonial.id, 'passed'));
      actions.append(copy, used, pass); card.append(head, quote, actions); queue.append(card);
    });
  }

  async function loadTestimonialQueue() {
    renderTestimonialQueue(await call('/api/club/host/testimonials'));
  }

  function renderProspects(data) {
    prospectHostState = data.prospects || [];
    const listNode = document.getElementById('prospect-host-list'); listNode.replaceChildren();
    if (!prospectHostState.length) {
      listNode.append(text('p', 'prospect-host-empty', 'Nobody is waiting.'));
      return;
    }
    prospectHostState.forEach((prospect) => {
      const card = document.createElement('article'); card.className = 'prospect-host-card';
      const main = document.createElement('div'); main.className = 'prospect-host-main';
      main.append(text('strong', '', prospect.email));
      if (prospect.booking?.startTime) {
        const when = new Intl.DateTimeFormat('en-GB', {
          dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London',
        }).format(new Date(prospect.booking.startTime));
        main.append(text('span', '', `${when} · ${prospect.booking.verified ? 'confirmed by Cal.com' : 'awaiting Cal.com'}`));
      } else main.append(text('span', '', 'No conversation booked yet.'));
      if (prospect.alternateTimeNote) main.append(text('blockquote', '', prospect.alternateTimeNote));
      const actions = document.createElement('div'); actions.className = 'prospect-host-actions';
      if (prospect.granted) {
        actions.append(text('em', '', 'membership granted'));
      } else {
        const grant = text('button', 'outline', 'grant membership'); grant.type = 'button';
        grant.addEventListener('click', () => grantProspect(prospect.id, grant)); actions.append(grant);
      }
      card.append(main, actions); listNode.append(card);
    });
  }

  async function loadProspects() {
    renderProspects(await call('/api/club/host/prospects'));
  }

  async function grantProspect(id, button) {
    const statusNode = document.getElementById('prospect-host-status'); statusNode.textContent = '';
    button.disabled = true;
    try {
      if (previewMode) {
        const prospect = prospectHostState.find((item) => item.id === id);
        if (prospect) prospect.granted = true;
        renderProspects({ prospects: prospectHostState });
        statusNode.textContent = 'Preview: membership opens and one invitation is sent.';
        return;
      }
      const data = await call(`/api/club/host/prospects/${id}/grant`, { method: 'POST', body: '{}' });
      await Promise.all([loadProspects(), loadMembers()]);
      statusNode.textContent = data.invitationSent
        ? 'Membership granted and invitation sent.'
        : 'Membership granted. The invitation email needs another attempt from the list below.';
    } catch (_) { statusNode.textContent = 'Membership could not be granted. Try again.'; }
    finally { button.disabled = false; }
  }

  async function resolveQueuedTestimonial(id, state) {
    const statusNode = document.getElementById('testimonial-queue-status'); statusNode.textContent = '';
    try {
      const data = await call(`/api/club/host/testimonials/${id}/resolve`, {
        method: 'POST', body: JSON.stringify({ status: state }),
      });
      renderTestimonialQueue(data);
      statusNode.textContent = state === 'used' ? 'Marked as used.' : 'Passed and removed from the queue.';
    } catch (_) { statusNode.textContent = 'That testimonial could not be updated.'; }
  }

  async function removeHostedNote(id) {
    if (!window.confirm('Remove this Field Note from the archive? This cannot be undone.')) return;
    const statusNode = document.getElementById('attendance-status'); statusNode.textContent = '';
    try {
      await call(`/api/club/host/field-notes/${id}`, { method: 'DELETE' });
      await loadFieldNoteHost();
    } catch (_) { statusNode.textContent = 'That Field Note could not be removed.'; }
  }

  function salonPayload() {
    const startsAt = londonInstant(
      document.getElementById('salon-date').value,
      document.getElementById('salon-start-time').value,
    );
    return {
      id: currentSalon?.id || null,
      note: document.getElementById('salon-host-note').value,
      startsAt,
      durationMinutes: 90,
      zoomUrl: document.getElementById('salon-zoom-url').value,
    };
  }

  async function saveSalon() {
    const data = await call('/api/club/host/salon', {
      method: 'POST', body: JSON.stringify(salonPayload()),
    });
    renderSalon(data); return data.salon;
  }

  async function removeMember(id) {
    status.textContent = '';
    try { await call(`/api/club/host/members/${id}`, { method: 'DELETE' }); pendingRemove = null; await loadMembers(); }
    catch (_) { status.textContent = 'That person could not be removed. Try again.'; }
  }

  async function inviteMember(id, button) {
    status.textContent = ''; button.disabled = true;
    try {
      if (previewMode) {
        status.textContent = 'Preview: one personal invitation would be sent from John.';
        return;
      }
      await call(`/api/club/host/members/${id}/invite`, { method: 'POST', body: '{}' });
      status.textContent = 'Invitation sent.';
    } catch (error) {
      status.textContent = error.message === 'member added but invitation email did not send'
        ? 'They remain on the list, but the email did not send. Try again.'
        : 'The invitation could not be sent.';
    } finally {
      await loadMembers().catch(() => {});
      button.disabled = false;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); status.textContent = '';
    const input = document.getElementById('invite-email');
    if (!input.checkValidity()) { input.reportValidity(); return; }
    const button = form.querySelector('button'); button.disabled = true;
    try {
      if (previewMode) {
        input.value = '';
        status.textContent = 'Preview: they would be added and receive one personal invitation from John.';
        return;
      }
      await call('/api/club/host/members', { method: 'POST', body: JSON.stringify({ email: input.value }) });
      input.value = ''; status.textContent = 'Added and invited.'; await loadMembers(); input.focus();
    } catch (error) {
      if (error.status === 400) status.textContent = 'Enter a valid email address.';
      else if (error.message === 'already a member') status.textContent = 'That person is already a member.';
      else if (error.message === 'already invited') status.textContent = 'That person has already been invited. Use resend beside their name.';
      else if (error.message === 'member added but invitation email did not send') {
        status.textContent = 'They are on the list, but the invitation email did not send. Use send invite beside their name.';
        await loadMembers().catch(() => {});
      } else status.textContent = 'That address could not be added. Try again.';
    }
    finally { button.disabled = false; }
  });

  salonForm.addEventListener('submit', async (event) => {
    event.preventDefault(); salonStatus.textContent = '';
    if (!salonForm.checkValidity()) { salonForm.reportValidity(); return; }
    const button = document.getElementById('save-salon'); button.disabled = true;
    try { await saveSalon(); salonStatus.textContent = 'Draft saved.'; }
    catch (error) { salonStatus.textContent = error.message || 'The Salon could not be saved.'; }
    finally { button.disabled = false; }
  });

  publishSalon.addEventListener('click', async () => {
    salonStatus.textContent = '';
    if (!salonForm.checkValidity()) { salonForm.reportValidity(); return; }
    publishSalon.disabled = true;
    try {
      const saved = await saveSalon();
      const data = await call('/api/club/host/salon/publish', {
        method: 'POST', body: JSON.stringify({ id: saved.id }),
      });
      renderSalon(data);
      salonStatus.textContent = data.salon?.zoomManaged
        ? 'Fresh Zoom meeting created and published to members. No email has been sent.'
        : 'Published to members with the fallback Zoom link. No email has been sent.';
    } catch (error) { salonStatus.textContent = error.message || 'The Salon could not be published.'; }
    finally { publishSalon.disabled = currentSalon?.status === 'published'; }
  });

  startNextSalon.addEventListener('click', async () => {
    if (!currentSalon?.hasEnded) return;
    salonStatus.textContent = ''; startNextSalon.disabled = true;
    try {
      if (previewMode) {
        renderSalon({ salon: null, rsvps: [], capabilities: { autoZoom } });
      } else {
        renderSalon(await call('/api/club/host/salon/close', {
          method: 'POST', body: JSON.stringify({ id: currentSalon.id }),
        }));
        await loadFieldNoteHost();
      }
      salonStatus.textContent = 'The completed Salon is kept. You can prepare the next one.';
      document.getElementById('salon-date').focus();
    } catch (error) {
      salonStatus.textContent = error.message === 'Salon has not ended'
        ? 'The current Salon has not ended yet.' : 'The next Salon could not be started. Nothing has changed.';
    } finally { startNextSalon.disabled = false; }
  });

  emailAnnouncement.addEventListener('click', async () => {
    if (!currentSalon || currentSalon.status !== 'published' || currentSalon.announcementSentAt) return;
    if (!window.confirm('Email the Salon announcement now? It can only be sent once.')) return;
    salonStatus.textContent = ''; emailAnnouncement.disabled = true;
    try {
      if (previewMode) {
        currentSalon.announcementSentAt = new Date().toISOString();
        renderSalon({ salon: currentSalon, rsvps: [] });
        salonStatus.textContent = 'Preview: the announcement would be queued once.';
        return;
      }
      const result = await call('/api/club/host/salon/announce', {
        method: 'POST', body: JSON.stringify({ id: currentSalon.id }),
      });
      const data = await call('/api/club/host/salon'); renderSalon(data);
      salonStatus.textContent = `Announcement queued for ${result.recipientCount} ${result.recipientCount === 1 ? 'member' : 'members'}.`;
    } catch (error) {
      salonStatus.textContent = error.message === 'announcement already sent'
        ? 'This announcement has already been sent.' : 'The announcement could not be sent. Nothing was retried.';
      try { renderSalon(await call('/api/club/host/salon')); } catch (_) {}
    }
  });

  document.getElementById('attendance-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const statusNode = document.getElementById('attendance-status'); statusNode.textContent = '';
    if (!fieldNoteHostState.salon) return;
    const memberIds = [...document.querySelectorAll('#attendance-list input:checked:not(:disabled)')]
      .map((input) => Number(input.value));
    if (!memberIds.length) { statusNode.textContent = 'Choose at least one person who attended.'; return; }
    const button = document.getElementById('open-field-note-invitations'); button.disabled = true;
    try {
      const data = await call(`/api/club/host/salons/${fieldNoteHostState.salon.id}/field-note-invitations`, {
        method: 'POST', body: JSON.stringify({ memberIds }),
      });
      renderFieldNoteHost(data); statusNode.textContent = 'Invitations opened in the member area. Email was sent once where enabled.';
    } catch (error) { statusNode.textContent = error.message || 'The invitations could not be opened.'; }
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
      previewMode = true;
      updateClock();
      render([
        { id: 1, email: 'john@spacetobe.xyz', name: 'John', isHost: true, status: 'joined', canInvite: false, canRemove: false },
        { id: 2, email: 'mira@example.com', name: 'Mira', isHost: false, status: 'invited', canInvite: true, canRemove: true },
        { id: 3, email: 'sam@example.com', name: null, isHost: false, status: 'on_list', canInvite: true, canRemove: true },
      ]);
      renderSalon({
        capabilities: { autoZoom: true },
        salon: {
          id: 1,
          note: 'We’ll sit first, then wander into pairs and threes. Bring whatever the month has left you with.',
          startsAt: '2026-09-30T18:00:00.000Z', timezone: 'Europe/London',
          durationMinutes: 90, zoomUrl: null, zoomManaged: false,
          status: 'draft', announcementSentAt: null, rsvpCount: 3,
          hasEnded: false,
        },
        rsvps: [
          { name: 'Mira', email: 'mira@example.com', status: 'in' },
          { name: 'Sam', email: 'sam@example.com', status: 'in' },
          { name: 'Noor', email: 'noor@example.com', status: 'not_this_time' },
        ],
      });
      renderFieldNoteHost({
        salon: { id: 9, startsAt: '2026-07-30T18:00:00.000Z' },
        candidates: [
          { memberId: 1, name: 'John', email: 'john@spacetobe.xyz', rsvp: 'in', prompted: true, emailed: true, shared: true },
          { memberId: 2, name: 'Mira', email: 'mira@example.com', rsvp: 'in', prompted: false, emailed: false, shared: false },
          { memberId: 3, name: 'Noor', email: 'noor@example.com', rsvp: null, prompted: false, emailed: false, shared: false },
        ],
        groups: [{
          salonId: 9, salonStartsAt: '2026-07-30T18:00:00.000Z', notes: [
            { id: 7, body: 'The line I kept: attention is already a form of relationship.', linkUrl: null, hasImage: false, imageAlt: null, isAnonymous: true, author: 'John', anonymousToMembers: true },
          ],
        }],
      });
      renderTestimonialQueue({ testimonials: [{
        id: 1, month: '2026-08', attributionName: 'Mira',
        body: 'Beings Club made room for a kind of attention I had forgotten was possible.',
        memberName: 'Mira', email: 'mira@example.com',
        submittedAt: '2026-08-28T12:00:00.000Z', updatedAt: '2026-08-28T12:00:00.000Z',
      }] });
      renderProspects({ prospects: [
        { id: 1, email: 'mira@example.com', booking: { startTime: '2026-09-10T18:00:00.000Z', verified: true }, alternateTimeNote: null, granted: false },
        { id: 2, email: 'noor@example.com', booking: null, alternateTimeNote: 'I’m in Toronto and weekday evenings UK time are difficult. Could a Friday work?', granted: false },
      ] });
      waiting.hidden = true; shell.hidden = false; return;
    }
    if (!token()) { location.replace('/members/'); return; }
    try {
      const data = await call('/api/club/session');
      if (!data.member.isHost) { location.replace('/members/'); return; }
      if (!data.member.agreementAccepted) { location.replace('/members/?onboarding=1'); return; }
      updateClock(); setInterval(updateClock, 30000);
      await Promise.all([loadMembers(), loadSalon(), loadFieldNoteHost(), loadTestimonialQueue(), loadProspects()]);
      waiting.hidden = true; shell.hidden = false;
    } catch (_) { forgetToken(); location.replace('/members/'); }
  })();
})();
