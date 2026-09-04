(() => {
  'use strict';
  const API = document.querySelector('meta[name="bc-members-api"]').content;
  const KEY = 'bc_member_session_v1';
  const shell = document.getElementById('host-shell');
  const waiting = document.getElementById('host-waiting');
  const list = document.getElementById('member-list');
  const form = document.getElementById('invite-form');
  const status = document.getElementById('invite-status');
  const invitationPreview = document.getElementById('invitation-preview');
  const invitationPreviewFrame = document.getElementById('invitation-preview-frame');
  const invitationPreviewSubject = document.getElementById('invitation-preview-subject');
  const salonStatus = document.getElementById('salon-status');
  const salonPlanList = document.getElementById('salon-plan-list');
  let pendingRemove = null;
  let salonHostState = [];
  let autoZoom = false;
  const openSalonIds = new Set();
  let previewMode = false;
  let inPersonHostState = [];
  let currentInPersonEvent = null;
  let inPersonImageData = null;
  let fieldNoteHostState = { salon: null, candidates: [], groups: [] };
  let prospectHostState = [];
  const imageObjectUrls = new Set();
  const NOTION_NOTE_PREFIX = 'bc_notion_invitation_note_';

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

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function localInvitationPreview(name, personalNote) {
    const greeting = name.trim() ? `Hello, ${escapeHtml(name.trim())}.` : 'Hello,';
    const note = personalNote.trim();
    const noteMarkup = note
      ? '<tr><td style="padding:24px 48px 0 48px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F2ECFF" style="width:100%;background:#F2ECFF;border:1px solid #DED7EA;"><tr><td style="padding:18px 20px 5px 20px;font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#5A4B7C;">a note from John</td></tr><tr><td style="padding:5px 20px 20px 20px;font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#312E29;line-height:25px;">'
        + `${escapeHtml(note).replace(/\r?\n/g, '<br>')}</td></tr></table></td></tr>`
      : '';
    return {
      subject: 'You’re invited to Beings Club',
      html: '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>You’re invited to Beings Club</title></head><body style="margin:0;padding:0;background-color:#F7F5EF;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F7F5EF;"><tr><td align="center" style="padding:36px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#FDFCF9;"><tr><td align="left" style="padding:44px 48px 0 48px;"><img src="/assets/beings-logo-outline.png" alt="Beings Club — concentric hand-drawn rings" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0;"></td></tr><tr><td style="padding:28px 48px 0 48px;font-family:Helvetica,Arial,sans-serif;font-size:34px;font-weight:bold;letter-spacing:-1px;color:#171916;line-height:40px;">You’re invited to <span style="color:#5A4B7C">Beings Club</span>.</td></tr><tr><td style="padding:20px 48px 0 48px;font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#4A473F;line-height:27px;"><p style="margin:0 0 16px">'
        + `${greeting}</p><p style="margin:0 0 16px">Membership is ongoing and freely offered.</p><p style="margin:0">Enter using this email address and we’ll send you a six-digit code.</p></td></tr>${noteMarkup}`
        + '<tr><td style="padding:30px 48px 0 48px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#171916"><span style="display:block;padding:14px 32px;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:#FFFFFF;">enter Beings Club</span></td></tr></table></td></tr><tr><td style="padding:36px 48px 44px 48px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="504" style="width:100%;border-top:1px solid #E7E4DB;"><tr><td style="padding:22px 0 0 0;font-family:\'Courier New\',Courier,monospace;font-size:11px;color:#A5A198;line-height:19px;">for the benefit of all beings</td></tr><tr><td style="padding:18px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#A5A198;line-height:18px;">Beings Club · London, United Kingdom · <u>member entrance</u></td></tr></table></td></tr></table></td></tr></table></body></html>',
    };
  }

  async function previewInvitation() {
    status.textContent = '';
    const name = document.getElementById('invite-name');
    const note = document.getElementById('invite-note');
    const button = document.getElementById('invite-preview');
    if (!name.checkValidity()) { name.reportValidity(); return; }
    if (!note.checkValidity()) { note.reportValidity(); return; }
    button.disabled = true;
    try {
      const mail = previewMode ? localInvitationPreview(name.value, note.value) : await call(
        '/api/club/host/members/invitation-preview', {
          method: 'POST', body: JSON.stringify({ name: name.value, invitationNote: note.value }),
        },
      );
      invitationPreviewSubject.textContent = mail.subject;
      invitationPreviewFrame.srcdoc = mail.html;
      invitationPreview.showModal();
    } catch (_) {
      status.textContent = 'The email preview could not be opened. Try again.';
    } finally {
      button.disabled = false;
    }
  }

  function notionDraft(pageId) {
    try { return sessionStorage.getItem(`${NOTION_NOTE_PREFIX}${pageId}`) || ''; } catch (_) { return ''; }
  }

  function saveNotionDraft(pageId, value) {
    try {
      const key = `${NOTION_NOTE_PREFIX}${pageId}`;
      if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key);
    } catch (_) {}
  }

  async function previewNotionInvitation(person, note, button, statusNode) {
    button.disabled = true; statusNode.textContent = '';
    try {
      const mail = previewMode ? localInvitationPreview(person.name || '', note.value) : await call(
        '/api/club/host/members/invitation-preview', {
          method: 'POST', body: JSON.stringify({
            name: person.name || '', invitationNote: note.value,
          }),
        },
      );
      invitationPreviewSubject.textContent = mail.subject;
      invitationPreviewFrame.srcdoc = mail.html;
      invitationPreview.showModal();
    } catch (_) {
      statusNode.textContent = 'The email preview could not be opened. Try again.';
    } finally { button.disabled = false; }
  }

  async function sendNotionInvitation(person, note, button, statusNode) {
    button.disabled = true; statusNode.textContent = 'Sending this invitation…';
    try {
      if (previewMode) {
        statusNode.textContent = `Preview: ${person.name || person.email} would receive this invitation${note.value.trim() ? ' with your note' : ''}.`;
        return;
      }
      const result = await call('/api/club/host/notion-members/invite-one', {
        method: 'POST', body: JSON.stringify({
          confirmation: 'INVITE NOTION MEMBER', pageId: person.pageId,
          email: person.email, invitationNote: note.value,
        }),
      });
      saveNotionDraft(person.pageId, '');
      const sentMessage = result.notionMarked
        ? 'Invitation sent and marked in Notion.'
        : 'Invitation sent. The Notion mark needs another attempt.';
      statusNode.textContent = sentMessage;
      await Promise.all([loadMembers(), checkNotionInvites()]);
      document.getElementById('notion-invite-status').textContent = sentMessage;
    } catch (error) {
      if (error.message === 'invitation note') statusNode.textContent = 'Keep the personal note to 1,200 characters.';
      else if (error.message === 'invitation email did not send') statusNode.textContent = 'They are on the member list, but the email did not send. Try again from the member list.';
      else if (error.status === 409) statusNode.textContent = 'This person is no longer ready for an invitation. Check the Notion list again.';
      else statusNode.textContent = error.message || 'This invitation could not be sent.';
    } finally { button.disabled = false; }
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

  const notionStatusLabels = {
    ready: 'ready to invite',
    joined: 'already joined',
    invited_needs_mark: 'invited · Notion needs marking',
    marked_sent: 'marked sent in Notion',
    inactive: 'inactive · review separately',
    duplicate: 'duplicate email · fix in Notion',
  };

  function renderNotionInvitePreview(data) {
    const listNode = document.getElementById('notion-invite-list');
    const statusNode = document.getElementById('notion-invite-status');
    listNode.replaceChildren();
    if (!data.configured) {
      statusNode.textContent = 'Connect the Notion integration before checking this list.';
      return;
    }
    (data.people || []).forEach((person) => {
      const row = document.createElement('details'); row.className = `notion-invite-row ${person.status}`;
      const summary = document.createElement('summary');
      const identity = document.createElement('span');
      identity.append(text('strong', '', person.name || person.email));
      if (person.name) identity.append(text('small', '', person.email));
      summary.append(identity, text('em', '', notionStatusLabels[person.status] || person.status));
      row.append(summary);
      if (person.status === 'ready') {
        const draft = document.createElement('div'); draft.className = 'notion-invite-draft';
        const label = document.createElement('label');
        label.append(text('span', '', 'a personal note · optional'));
        const note = document.createElement('textarea');
        note.maxLength = 1200; note.placeholder = 'A few words from you…'; note.value = notionDraft(person.pageId);
        note.addEventListener('input', () => saveNotionDraft(person.pageId, note.value));
        label.append(note);
        const actions = document.createElement('div'); actions.className = 'notion-person-actions';
        const preview = text('button', 'outline', 'preview email'); preview.type = 'button';
        const send = text('button', 'primary', 'send invitation'); send.type = 'button';
        const personStatus = text('span', 'status', '');
        personStatus.setAttribute('role', 'status'); personStatus.setAttribute('aria-live', 'polite');
        preview.addEventListener('click', () => previewNotionInvitation(person, note, preview, personStatus));
        send.addEventListener('click', () => sendNotionInvitation(person, note, send, personStatus));
        actions.append(preview, send); draft.append(label, actions, personStatus); row.append(draft);
      }
      listNode.append(row);
    });
    const ready = Number(data.readyCount || 0);
    const repair = Number(data.repairCount || 0);
    statusNode.textContent = `${data.people.length} in Notion · ${ready} ready to invite${repair ? ` · ${repair} Notion ${repair === 1 ? 'mark' : 'marks'} to repair` : ''}.`;
  }

  async function checkNotionInvites() {
    const button = document.getElementById('notion-invite-check');
    const statusNode = document.getElementById('notion-invite-status');
    button.disabled = true; statusNode.textContent = 'Checking Notion against the member list…';
    try {
      if (previewMode) {
        renderNotionInvitePreview({
          configured: true, readyCount: 2, repairCount: 1,
          people: [
            { pageId: 'preview-ana', name: 'Ana', email: 'ana@example.com', status: 'ready' },
            { pageId: 'preview-mira', name: 'Mira', email: 'mira@example.com', status: 'ready' },
            { pageId: 'preview-sam', name: 'Sam', email: 'sam@example.com', status: 'invited_needs_mark' },
            { pageId: 'preview-john', name: 'John', email: 'john@example.com', status: 'joined' },
          ],
        });
      } else renderNotionInvitePreview(await call('/api/club/host/notion-members'));
    } catch (error) {
      statusNode.textContent = error.message || 'The Notion member list could not be checked.';
    } finally { button.disabled = false; }
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

  function salonHeading(salon) {
    if (!salon.startsAt) return 'Untitled Salon';
    const date = new Date(salon.startsAt);
    const day = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric',
    }).format(date);
    const timeValue = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(date).replace(':00', '').replace(/\bam\b/i, 'AM').replace(/\bpm\b/i, 'PM');
    return `${day} · ${timeValue}`;
  }

  function field(labelText, control, helpText = '') {
    const label = document.createElement('label');
    label.append(text('span', '', labelText), control);
    if (helpText) label.append(text('small', '', helpText));
    return label;
  }

  function renderSalonEditor(salon) {
    const key = String(salon.id ?? salon.clientId);
    const article = document.createElement('article'); article.className = 'salon-plan'; article.dataset.salonKey = key;
    const heading = document.createElement('h3');
    const toggle = document.createElement('button'); toggle.className = 'salon-plan-toggle'; toggle.type = 'button';
    const headingWords = document.createElement('span'); headingWords.className = 'salon-plan-heading';
    headingWords.append(text('strong', '', salonHeading(salon)));
    const statusLabel = salon.hasEnded ? 'completed' : salon.status === 'published' ? 'published' : 'draft';
    headingWords.append(text('em', `salon-plan-state ${statusLabel}`, statusLabel));
    toggle.append(headingWords);
    const body = document.createElement('div'); body.className = 'salon-plan-body'; body.id = `salon-plan-${key.replace(/[^a-z0-9_-]/gi, '-')}`;
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open)); body.hidden = !open;
      if (open) openSalonIds.add(key); else openSalonIds.delete(key);
    };
    toggle.setAttribute('aria-controls', body.id); setOpen(openSalonIds.has(key));
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    heading.append(toggle); article.append(heading);

    const formNode = document.createElement('form'); formNode.className = 'salon-form'; formNode.noValidate = true;
    const local = londonParts(salon.startsAt);
    const dateInput = document.createElement('input'); dateInput.type = 'date'; dateInput.name = 'date'; dateInput.required = true; dateInput.value = local.date;
    const timeInput = document.createElement('input'); timeInput.type = 'time'; timeInput.name = 'time'; timeInput.required = true; timeInput.value = local.time;
    const grid = document.createElement('div'); grid.className = 'salon-form-grid';
    grid.append(field('date · UK time', dateInput), field('time · GMT or BST', timeInput));
    const note = document.createElement('textarea'); note.name = 'note'; note.maxLength = 2400; note.required = true;
    note.placeholder = 'A few lines for this gathering.'; note.value = salon.note || '';
    const zoom = document.createElement('input'); zoom.type = 'url'; zoom.inputMode = 'url'; zoom.name = 'zoomUrl'; zoom.value = salon.zoomUrl || '';
    zoom.placeholder = autoZoom ? 'Created automatically when you publish' : 'https://…';
    const zoomHelp = autoZoom
      ? 'Leave this blank for a fresh Zoom meeting. Paste a secure Zoom link only when you need the fallback.'
      : 'Automatic creation is not connected yet, so add a secure Zoom link before publishing.';
    formNode.append(grid, field('your note · appears above RSVP', note), field(autoZoom ? 'Zoom join link · optional fallback' : 'Zoom join link', zoom, zoomHelp));
    formNode.querySelectorAll('input,textarea').forEach((input) => { input.disabled = !!salon.hasEnded; });

    const actions = document.createElement('div'); actions.className = 'salon-form-actions';
    const save = text('button', 'outline', 'save draft'); save.type = 'submit'; save.disabled = !!salon.hasEnded;
    const publish = text('button', 'primary', salon.status === 'published' ? 'published' : 'publish to members');
    publish.type = 'button'; publish.disabled = !!salon.hasEnded || salon.status === 'published';
    publish.addEventListener('click', () => publishSalonEditor(salon, formNode, publish));
    actions.append(save, publish);
    if (salon.id && !salon.hasEnded) {
      const remove = text('button', 'text-button danger', 'delete Salon'); remove.type = 'button';
      remove.addEventListener('click', () => deleteSalonEditor(salon, remove)); actions.append(remove);
    }
    if (salon.id && salon.hasEnded) {
      const close = text('button', 'outline', 'close completed Salon'); close.type = 'button';
      close.addEventListener('click', () => closeSalonEditor(salon, close)); actions.append(close);
    }
    formNode.append(actions);
    formNode.addEventListener('submit', (event) => saveSalonEditor(event, salon, formNode, save));
    body.append(formNode);

    const state = document.createElement('div'); state.className = 'salon-host-state';
    state.append(text('span', '', salon.hasEnded
      ? 'This Salon has ended.'
      : salon.status === 'published'
        ? `Published to members.${salon.zoomManaged ? ' Fresh Zoom meeting created.' : ''}`
        : salon.id ? 'Saved privately as a draft.' : 'Not saved yet.'));
    state.append(text('span', '', `${salon.rsvpCount || 0} ${salon.rsvpCount === 1 ? 'being is' : 'beings are'} in`));
    body.append(state);

    const roster = document.createElement('div'); roster.className = 'salon-roster';
    (salon.rsvps || []).forEach((rsvp) => {
      const row = document.createElement('div'); row.className = 'salon-roster-row';
      row.append(text('span', '', rsvp.name || rsvp.email), text('span', '', rsvp.status === 'in' ? 'in' : 'not this time'));
      roster.append(row);
    });
    body.append(roster);

    if (salon.id) {
      const announcement = document.createElement('div'); announcement.className = 'announcement-hold';
      const count = Number(salon.announcementRecipientCount || 0);
      const email = text('button', 'outline', salon.announcementSentAt
        ? count ? `email new members · ${count}` : 'email new members'
        : 'email announcement');
      email.type = 'button'; email.disabled = !!salon.hasEnded || salon.status !== 'published' || count === 0;
      email.addEventListener('click', () => announceSalonEditor(salon, email));
      const copy = salon.hasEnded
        ? 'This Salon has ended. Its gathering remains here and in Field Notes.'
        : salon.announcementSentAt
          ? count
            ? `${count} ${count === 1 ? 'member has' : 'members have'} not received this announcement yet.`
            : 'Everyone currently eligible has received this announcement. If somebody joins later, you can send it to them here.'
          : salon.status === 'published'
            ? `${count} ${count === 1 ? 'member will' : 'members will'} receive it. Each person receives this announcement once.`
            : 'Publish the Salon before announcing it.';
      announcement.append(email, text('span', '', copy)); body.append(announcement);
    }

    article.append(body); return article;
  }

  function renderSalons(data, preferredOpenId = null) {
    autoZoom = !!data.capabilities?.autoZoom;
    salonHostState = data.salons || (data.salon ? [{ ...data.salon, rsvps: data.rsvps || [] }] : []);
    if (preferredOpenId != null) openSalonIds.add(String(preferredOpenId));
    salonPlanList.replaceChildren();
    if (!salonHostState.length) salonPlanList.append(text('p', 'salon-plan-empty', 'No Salons are being prepared yet.'));
    salonHostState.forEach((salon) => salonPlanList.append(renderSalonEditor(salon)));
  }

  async function loadSalon() {
    renderSalons(await call('/api/club/host/salon'));
  }

  function formatInPersonTime(event) {
    const zone = event.timezone || 'Europe/London';
    const start = new Date(event.startsAt); const end = new Date(event.endsAt);
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    }).format(start);
    const formatTime = (value) => new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(value).replace(':00', '').replace(/\bam\b/i, 'AM').replace(/\bpm\b/i, 'PM');
    return `${date} · ${formatTime(start)}–${formatTime(end)}`;
  }

  function clearInPersonForm() {
    currentInPersonEvent = null; inPersonImageData = null;
    const eventForm = document.getElementById('in-person-event-form'); eventForm.reset();
    document.getElementById('in-person-event-id').value = '';
    document.getElementById('in-person-event-image-help').textContent = 'A landscape image works best here · JPEG, PNG or WebP · up to 5MB.';
    document.getElementById('publish-in-person-event').textContent = 'publish event';
    document.getElementById('publish-in-person-event').disabled = false;
    document.getElementById('in-person-event-status').textContent = '';
  }

  function editInPersonEvent(event) {
    currentInPersonEvent = event; inPersonImageData = null;
    document.getElementById('in-person-event-id').value = String(event.id);
    document.getElementById('in-person-event-title').value = event.title;
    const start = londonParts(event.startsAt); const end = londonParts(event.endsAt);
    document.getElementById('in-person-event-date').value = start.date;
    document.getElementById('in-person-event-start').value = start.time;
    document.getElementById('in-person-event-end').value = end.time;
    document.getElementById('in-person-event-location').value = event.location;
    document.getElementById('in-person-event-description').value = event.description;
    document.getElementById('in-person-event-url').value = event.bookingUrl;
    document.getElementById('in-person-event-image').value = '';
    document.getElementById('in-person-event-image-help').textContent = event.hasImage
      ? 'The current image will be kept unless you choose a replacement.'
      : 'A landscape image works best here · JPEG, PNG or WebP · up to 5MB.';
    document.getElementById('publish-in-person-event').textContent = event.status === 'published' ? 'published' : 'publish event';
    document.getElementById('publish-in-person-event').disabled = event.status === 'published';
    document.getElementById('in-person-event-title').focus();
  }

  function renderHostInPersonEvents(data) {
    inPersonHostState = data.events || [];
    const listNode = document.getElementById('in-person-host-list'); listNode.replaceChildren();
    if (!inPersonHostState.length) {
      listNode.append(text('p', 'in-person-host-empty', 'No in-person happenings have been prepared yet.'));
      return;
    }
    inPersonHostState.forEach((event) => {
      const row = document.createElement('div'); row.className = 'in-person-host-row';
      const words = document.createElement('div'); words.className = 'in-person-host-row-words';
      words.append(text('strong', '', event.title));
      words.append(text('span', '', formatInPersonTime(event)));
      words.append(text('span', `in-person-host-state ${event.status}`, event.status));
      const actions = document.createElement('div'); actions.className = 'in-person-host-actions';
      const edit = text('button', 'text-button', 'edit'); edit.type = 'button';
      edit.addEventListener('click', () => editInPersonEvent(event));
      const remove = text('button', 'text-button danger', 'delete'); remove.type = 'button';
      remove.addEventListener('click', () => deleteInPersonEvent(event));
      actions.append(edit, remove); row.append(words, actions); listNode.append(row);
    });
  }

  async function loadInPersonEvents() {
    renderHostInPersonEvents(await call('/api/club/host/in-person'));
  }

  function inPersonPayload() {
    const date = document.getElementById('in-person-event-date').value;
    return {
      id: currentInPersonEvent?.id || null,
      title: document.getElementById('in-person-event-title').value,
      startsAt: londonInstant(date, document.getElementById('in-person-event-start').value),
      endsAt: londonInstant(date, document.getElementById('in-person-event-end').value),
      location: document.getElementById('in-person-event-location').value,
      description: document.getElementById('in-person-event-description').value,
      bookingUrl: document.getElementById('in-person-event-url').value,
      imageData: inPersonImageData,
    };
  }

  async function saveInPersonEvent() {
    const data = await call('/api/club/host/in-person', {
      method: 'POST', body: JSON.stringify(inPersonPayload()),
    });
    renderHostInPersonEvents(data);
    const saved = data.events.find((event) => event.id === currentInPersonEvent?.id)
      || data.events.find((event) => event.status === 'draft') || data.events[0];
    if (saved) editInPersonEvent(saved);
    return saved;
  }

  async function deleteInPersonEvent(event) {
    if (!window.confirm(`Delete “${event.title}”? It will disappear from the member page. This cannot be undone.`)) return;
    const statusNode = document.getElementById('in-person-event-status'); statusNode.textContent = '';
    try {
      if (previewMode) {
        renderHostInPersonEvents({ events: inPersonHostState.filter((item) => item.id !== event.id) });
      } else {
        renderHostInPersonEvents(await call(`/api/club/host/in-person/${event.id}`, { method: 'DELETE' }));
      }
      if (currentInPersonEvent?.id === event.id) clearInPersonForm();
      statusNode.textContent = 'Event deleted.';
    } catch (error) { statusNode.textContent = error.message || 'The event could not be deleted.'; }
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
      main.append(text('strong', '', prospect.name || prospect.email));
      if (prospect.name) main.append(text('span', '', prospect.email));
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
        if (prospect.canResendWelcome) {
          const welcome = text('button', 'outline', 'resend welcome'); welcome.type = 'button';
          welcome.addEventListener('click', () => resendProspectWelcome(prospect.id, welcome));
          actions.append(welcome);
        }
      } else {
        const grant = text('button', 'outline', 'grant membership'); grant.type = 'button';
        grant.addEventListener('click', () => grantProspect(prospect.id, grant));
        const dismiss = text('button', 'text-button', 'remove from queue'); dismiss.type = 'button';
        dismiss.addEventListener('click', () => dismissProspect(prospect, dismiss));
        actions.append(grant, dismiss);
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
        prospectHostState = prospectHostState.filter((item) => item.id !== id);
        renderProspects({ prospects: prospectHostState });
        statusNode.textContent = 'Preview: membership opens and one welcome email is sent.';
        return;
      }
      const data = await call(`/api/club/host/prospects/${id}/grant`, { method: 'POST', body: '{}' });
      await Promise.all([loadProspects(), loadMembers()]);
      statusNode.textContent = data.invitationSent
        ? 'Membership granted and welcome email sent.'
        : 'Membership granted. The welcome email needs another attempt from the list below.';
    } catch (_) { statusNode.textContent = 'Membership could not be granted. Try again.'; }
    finally { button.disabled = false; }
  }

  async function dismissProspect(prospect, button) {
    const label = prospect.name || prospect.email;
    if (!window.confirm(`Remove ${label} from the first-conversation queue? Their history will be kept, and they can reappear if they begin the joining flow again.`)) return;
    const statusNode = document.getElementById('prospect-host-status'); statusNode.textContent = '';
    button.disabled = true;
    try {
      if (previewMode) {
        prospectHostState = prospectHostState.filter((item) => item.id !== prospect.id);
        renderProspects({ prospects: prospectHostState });
        statusNode.textContent = 'Preview: removed from the queue; their history is kept.';
        return;
      }
      await call(`/api/club/host/prospects/${prospect.id}/dismiss`, { method: 'POST', body: '{}' });
      await loadProspects();
      statusNode.textContent = 'Removed from the queue. Their history is kept.';
    } catch (error) {
      statusNode.textContent = error.message === 'prospect unavailable'
        ? 'This conversation has already been resolved.'
        : 'This person could not be removed from the queue. Try again.';
    } finally { button.disabled = false; }
  }

  async function resendProspectWelcome(id, button) {
    const statusNode = document.getElementById('prospect-host-status'); statusNode.textContent = '';
    button.disabled = true;
    try {
      if (previewMode) {
        statusNode.textContent = 'Preview: the welcome email is sent again.';
        return;
      }
      await call(`/api/club/host/prospects/${id}/welcome`, { method: 'POST', body: '{}' });
      statusNode.textContent = 'Welcome email sent again.';
    } catch (error) {
      statusNode.textContent = error.message === 'welcome unavailable'
        ? 'The welcome is no longer available because onboarding is complete.'
        : 'The welcome email did not send. Try again.';
    } finally { button.disabled = false; }
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

  function salonPayload(formNode, salon) {
    const startsAt = londonInstant(
      formNode.elements.date.value,
      formNode.elements.time.value,
    );
    return {
      id: salon.id || null,
      note: formNode.elements.note.value,
      startsAt,
      durationMinutes: 90,
      zoomUrl: formNode.elements.zoomUrl.value,
    };
  }

  async function saveSalon(formNode, salon) {
    const data = await call('/api/club/host/salon', {
      method: 'POST', body: JSON.stringify(salonPayload(formNode, salon)),
    });
    const savedId = data.savedSalonId || salon.id;
    renderSalons(data, savedId);
    return data.salons.find((item) => item.id === savedId);
  }

  async function saveSalonEditor(event, salon, formNode, button) {
    event.preventDefault(); salonStatus.textContent = '';
    if (!formNode.checkValidity()) { formNode.reportValidity(); return; }
    button.disabled = true;
    try {
      if (previewMode) {
        const savedId = salon.id || Math.max(0, ...salonHostState.map((item) => Number(item.id) || 0)) + 1;
        const payload = salonPayload(formNode, salon);
        const saved = {
          ...salon, id: savedId, clientId: undefined, note: payload.note, startsAt: payload.startsAt,
          zoomUrl: payload.zoomUrl || null, status: salon.status || 'draft', rsvps: salon.rsvps || [],
        };
        salonHostState = salonHostState.filter((item) => item !== salon).concat(saved)
          .sort((a, b) => String(a.startsAt || '9999').localeCompare(String(b.startsAt || '9999')));
        openSalonIds.delete(String(salon.clientId)); openSalonIds.add(String(savedId));
        renderSalons({ salons: salonHostState, capabilities: { autoZoom } }, savedId);
      } else await saveSalon(formNode, salon);
      salonStatus.textContent = 'Draft saved.';
    } catch (error) { salonStatus.textContent = error.message || 'The Salon could not be saved.'; }
    finally { button.disabled = false; }
  }

  async function publishSalonEditor(salon, formNode, button) {
    salonStatus.textContent = '';
    if (!formNode.checkValidity()) { formNode.reportValidity(); return; }
    button.disabled = true;
    try {
      if (previewMode) {
        const savedId = salon.id || Math.max(0, ...salonHostState.map((item) => Number(item.id) || 0)) + 1;
        const payload = salonPayload(formNode, salon);
        const saved = {
          ...salon, id: savedId, clientId: undefined, note: payload.note, startsAt: payload.startsAt,
          zoomUrl: payload.zoomUrl || null, status: 'published', zoomManaged: !payload.zoomUrl,
          rsvps: salon.rsvps || [],
        };
        salonHostState = salonHostState.filter((item) => item !== salon).concat(saved)
          .sort((a, b) => String(a.startsAt || '9999').localeCompare(String(b.startsAt || '9999')));
        openSalonIds.delete(String(salon.clientId)); openSalonIds.add(String(savedId));
        renderSalons({ salons: salonHostState, capabilities: { autoZoom } }, savedId);
        salonStatus.textContent = 'Preview: fresh Zoom meeting created and published to members. No email has been sent.';
        return;
      }
      const saved = await saveSalon(formNode, salon);
      const data = await call('/api/club/host/salon/publish', {
        method: 'POST', body: JSON.stringify({ id: saved.id }),
      });
      renderSalons(data, saved.id);
      const published = data.salons.find((item) => item.id === saved.id);
      salonStatus.textContent = published?.zoomManaged
        ? 'Fresh Zoom meeting created and published to members. No email has been sent.'
        : 'Published to members with the fallback Zoom link. No email has been sent.';
    } catch (error) { salonStatus.textContent = error.message || 'The Salon could not be published.'; }
    finally { button.disabled = false; }
  }

  async function closeSalonEditor(salon, button) {
    salonStatus.textContent = ''; button.disabled = true;
    try {
      if (previewMode) {
        salonHostState = salonHostState.filter((item) => item.id !== salon.id);
        renderSalons({ salons: salonHostState, capabilities: { autoZoom } });
      } else {
        const data = await call('/api/club/host/salon/close', {
          method: 'POST', body: JSON.stringify({ id: salon.id }),
        });
        renderSalons(data);
        await loadFieldNoteHost();
      }
      salonStatus.textContent = 'The completed Salon is kept with its RSVPs and Field Notes.';
    } catch (error) {
      salonStatus.textContent = error.message === 'Salon has not ended'
        ? 'This Salon has not ended yet.' : 'The Salon could not be closed. Nothing has changed.';
      button.disabled = false;
    }
  }

  async function deleteSalonEditor(salon, button) {
    if (!window.confirm('Delete this Salon? It will disappear for every member and its RSVPs will be removed. Any automatically created Zoom meeting will be cancelled. This cannot be undone.')) return;
    salonStatus.textContent = ''; button.disabled = true;
    try {
      if (previewMode) {
        salonHostState = salonHostState.filter((item) => item.id !== salon.id);
        renderSalons({ salons: salonHostState, capabilities: { autoZoom } });
      } else {
        renderSalons(await call('/api/club/host/salon/delete', {
          method: 'POST', body: JSON.stringify({ id: salon.id }),
        }));
      }
      openSalonIds.delete(String(salon.id));
      salonStatus.textContent = 'The Salon and its RSVPs were deleted.';
    } catch (error) {
      salonStatus.textContent = error.message || 'The Salon could not be deleted. Nothing has changed.';
      button.disabled = false;
    }
  }

  async function announceSalonEditor(salon, button) {
    if (salon.status !== 'published' || salon.hasEnded) return;
    const count = Number(salon.announcementRecipientCount || 0);
    if (!count) return;
    const question = salon.announcementSentAt
      ? `Email the Salon announcement to ${count} ${count === 1 ? 'new member' : 'new members'} now?`
      : `Email the Salon announcement to ${count} ${count === 1 ? 'member' : 'members'} now?`;
    if (!window.confirm(question)) return;
    salonStatus.textContent = ''; button.disabled = true;
    try {
      if (previewMode) {
        salon.announcementSentAt = new Date().toISOString(); salon.announcementRecipientCount = 0;
        renderSalons({ salons: salonHostState, capabilities: { autoZoom } }, salon.id);
        salonStatus.textContent = `Preview: announcement queued for ${count} ${count === 1 ? 'member' : 'members'}.`;
        return;
      }
      const result = await call('/api/club/host/salon/announce', {
        method: 'POST', body: JSON.stringify({ id: salon.id }),
      });
      renderSalons(await call('/api/club/host/salon'), salon.id);
      salonStatus.textContent = `Announcement queued for ${result.recipientCount} ${result.recipientCount === 1 ? 'member' : 'members'}.`;
    } catch (_) {
      salonStatus.textContent = 'The announcement could not be sent. Nothing was retried.';
      try { renderSalons(await call('/api/club/host/salon'), salon.id); } catch (_) {}
    }
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
        status.textContent = 'Preview: one personal invitation would be sent from Beings Club.';
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
    const name = document.getElementById('invite-name');
    const note = document.getElementById('invite-note');
    if (!input.checkValidity()) { input.reportValidity(); return; }
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      if (previewMode) {
        const hasNote = note.value.trim().length > 0;
        input.value = ''; name.value = ''; note.value = '';
        status.textContent = `Preview: they would be added and receive one invitation from Beings Club${hasNote ? ', including your note' : ''}.`;
        return;
      }
      await call('/api/club/host/members', {
        method: 'POST', body: JSON.stringify({
          email: input.value, name: name.value, invitationNote: note.value,
        }),
      });
      input.value = ''; name.value = ''; note.value = ''; status.textContent = 'Added and invited.'; await loadMembers(); input.focus();
    } catch (error) {
      if (error.message === 'invitation note') status.textContent = 'Keep the personal note to 1,200 characters.';
      else if (error.status === 400) status.textContent = 'Enter a valid email address.';
      else if (error.message === 'already a member') status.textContent = 'That person is already a member.';
      else if (error.message === 'already invited') status.textContent = 'That person has already been invited. Use resend beside their name.';
      else if (error.message === 'member added but invitation email did not send') {
        status.textContent = 'They are on the list, but the invitation email did not send. Use send invite beside their name.';
        await loadMembers().catch(() => {});
      } else status.textContent = 'That address could not be added. Try again.';
    }
    finally { button.disabled = false; }
  });

  document.getElementById('invite-preview').addEventListener('click', previewInvitation);
  document.getElementById('invitation-preview-close').addEventListener('click', () => invitationPreview.close());
  invitationPreview.addEventListener('click', (event) => {
    if (event.target === invitationPreview) invitationPreview.close();
  });

  document.getElementById('notion-invite-check').addEventListener('click', checkNotionInvites);

  document.getElementById('in-person-event-image').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    const help = document.getElementById('in-person-event-image-help');
    if (!file) { inPersonImageData = null; return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      event.target.value = ''; inPersonImageData = null;
      help.textContent = 'Choose a JPEG, PNG or WebP no larger than 5MB.'; return;
    }
    try {
      inPersonImageData = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      help.textContent = `${file.name} will replace the current image when you save.`;
    } catch (_) { inPersonImageData = null; help.textContent = 'That image could not be read.'; }
  });

  document.getElementById('in-person-event-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const eventForm = event.currentTarget;
    const statusNode = document.getElementById('in-person-event-status'); statusNode.textContent = '';
    if (!eventForm.checkValidity()) { eventForm.reportValidity(); return; }
    const button = document.getElementById('save-in-person-event'); button.disabled = true;
    try {
      if (previewMode) {
        statusNode.textContent = 'Preview: draft saved.';
      } else {
        await saveInPersonEvent(); statusNode.textContent = 'Draft saved.';
      }
    } catch (error) { statusNode.textContent = error.message || 'The event could not be saved.'; }
    finally { button.disabled = false; }
  });

  document.getElementById('publish-in-person-event').addEventListener('click', async () => {
    const eventForm = document.getElementById('in-person-event-form');
    const statusNode = document.getElementById('in-person-event-status'); statusNode.textContent = '';
    if (!eventForm.checkValidity()) { eventForm.reportValidity(); return; }
    const button = document.getElementById('publish-in-person-event'); button.disabled = true;
    try {
      if (previewMode) {
        statusNode.textContent = 'Preview: event published to the in-person page.';
      } else {
        const saved = await saveInPersonEvent();
        if (!saved) throw new Error('The event could not be found after saving.');
        const data = await call(`/api/club/host/in-person/${saved.id}/publish`, { method: 'POST', body: '{}' });
        renderHostInPersonEvents(data);
        const published = data.events.find((item) => item.id === saved.id);
        if (published) editInPersonEvent(published);
        statusNode.textContent = 'Published to the in-person page.';
      }
    } catch (error) {
      statusNode.textContent = error.message || 'The event could not be published.';
      button.disabled = false;
    }
  });

  document.getElementById('new-in-person-event').addEventListener('click', clearInPersonForm);

  document.getElementById('add-salon').addEventListener('click', () => {
    const existing = salonHostState.find((salon) => salon.clientId === 'new');
    if (existing) {
      openSalonIds.add('new'); renderSalons({ salons: salonHostState, capabilities: { autoZoom } }, 'new');
    } else {
      const draft = {
        clientId: 'new', id: null, note: '', startsAt: null, durationMinutes: 90,
        zoomUrl: null, zoomManaged: false, status: 'draft', announcementSentAt: null,
        announcementRecipientCount: 0, rsvpCount: 0, rsvps: [], hasEnded: false,
      };
      salonHostState = [...salonHostState, draft]; openSalonIds.add('new');
      renderSalons({ salons: salonHostState, capabilities: { autoZoom } }, 'new');
    }
    salonPlanList.querySelector('[data-salon-key="new"] input[name="date"]')?.focus();
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
    document.querySelector('.greeting').textContent = `good ${greeting}, john`;
  }

  async function signOut() {
    try { await call('/api/club/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
    forgetToken(); location.replace('/members/');
  }
  document.getElementById('host-sign-out').addEventListener('click', signOut);
  document.getElementById('mobile-sign-out').addEventListener('click', signOut);
  const menu = document.getElementById('mobile-menu'); const menuButton = document.getElementById('menu-button');
  const menuClose = document.getElementById('menu-close');
  const menuBackground = [...menu.parentElement.children].filter((node) => node !== menu);
  function setMenuBackgroundInert(inert) {
    menuBackground.forEach((node) => { node.inert = inert; });
  }
  function closeMobileMenu(restoreFocus = true) {
    menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); setMenuBackgroundInert(false);
    if (restoreFocus) menuButton.focus();
  }
  menuButton.addEventListener('click', () => {
    menu.hidden = false; menuButton.setAttribute('aria-expanded', 'true'); setMenuBackgroundInert(true); menuClose.focus();
  });
  menuClose.addEventListener('click', () => closeMobileMenu());
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeMobileMenu(); }
    if (event.key === 'Tab') {
      const focusable = [...menu.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')]
        .filter((node) => !node.hidden && node.getClientRects().length);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !menu.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  });
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => closeMobileMenu(false)));

  function prepareHostSections() {
    document.querySelectorAll('.host-section').forEach((section, index) => {
      const heading = section.querySelector(':scope > h2');
      if (!heading) return;
      const body = document.createElement('div');
      body.className = 'host-section-body';
      body.id = `host-section-body-${index + 1}`;
      while (heading.nextSibling) body.append(heading.nextSibling);
      section.append(body);

      const label = heading.textContent.trim();
      const toggle = document.createElement('button');
      toggle.className = 'host-section-toggle';
      toggle.type = 'button';
      toggle.textContent = label;
      toggle.setAttribute('aria-controls', body.id);
      const setOpen = (open) => {
        toggle.setAttribute('aria-expanded', String(open));
        body.hidden = !open;
      };
      setOpen(section.dataset.hostOpen === 'true');
      toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
      heading.replaceChildren(toggle);
    });
  }

  prepareHostSections();

  (async () => {
    // A static localhost-only state for visual QA. It never opens on the live
    // domain and contains no real member data beyond the public host identity.
    const previewParams = new URLSearchParams(location.search);
    if ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        && previewParams.has('preview')) {
      previewMode = true;
      const salonPreview = document.querySelector('.host-section');
      const inPersonEventPreview = document.getElementById('in-person-event-host');
      if (previewParams.get('salon') === 'open') {
        const salonToggle = salonPreview.querySelector('.host-section-toggle');
        const salonBody = salonPreview.querySelector('.host-section-body');
        salonToggle.setAttribute('aria-expanded', 'true'); salonBody.hidden = false;
        openSalonIds.add('1');
      }
      if (previewParams.get('in-person') === 'event') {
        const eventToggle = inPersonEventPreview.querySelector('.host-section-toggle');
        const eventBody = inPersonEventPreview.querySelector('.host-section-body');
        eventToggle.setAttribute('aria-expanded', 'true');
        eventBody.hidden = false;
      }
      updateClock();
      render([
        { id: 1, email: 'john@spacetobe.xyz', name: 'John', isHost: true, status: 'joined', canInvite: false, canRemove: false },
        { id: 2, email: 'mira@example.com', name: 'Mira', isHost: false, status: 'invited', canInvite: true, canRemove: true },
        { id: 3, email: 'sam@example.com', name: null, isHost: false, status: 'on_list', canInvite: true, canRemove: true },
      ]);
      renderSalons({
        capabilities: { autoZoom: true },
        salons: [{
          id: 1,
          note: 'We’ll sit first, then wander into pairs and threes. Bring whatever the month has left you with.',
          startsAt: '2026-09-30T18:00:00.000Z', timezone: 'Europe/London',
          durationMinutes: 90, zoomUrl: null, zoomManaged: false,
          status: 'published', announcementSentAt: '2026-09-03T12:00:00.000Z', announcementRecipientCount: 1, rsvpCount: 3,
          hasEnded: false,
          rsvps: [
            { name: 'Mira', email: 'mira@example.com', status: 'in' },
            { name: 'Sam', email: 'sam@example.com', status: 'in' },
            { name: 'Noor', email: 'noor@example.com', status: 'not_this_time' },
          ],
        }, {
          id: 2,
          note: 'A quiet winter gathering. More detail can take shape nearer the time.',
          startsAt: '2026-10-28T19:00:00.000Z', timezone: 'Europe/London',
          durationMinutes: 90, zoomUrl: null, zoomManaged: false,
          status: 'draft', announcementSentAt: null, announcementRecipientCount: 3, rsvpCount: 0,
          hasEnded: false, rsvps: [],
        }],
      });
      renderHostInPersonEvents({ events: [{
        id: 12, title: 'A gathering in London',
        description: 'A day to practise curiosity together through guided practice, conversation, shared food and whatever else the day makes possible.',
        startsAt: '2026-10-18T10:00:00.000Z', endsAt: '2026-10-18T16:00:00.000Z',
        timezone: 'Europe/London', location: 'London · the exact place shared after booking',
        bookingUrl: 'https://lu.ma/beingsclub', hasImage: true, status: 'draft', publishedAt: null,
      }] });
      if (previewParams.get('in-person') === 'event') editInPersonEvent(inPersonHostState[0]);
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
        { id: 1, name: 'Mira', email: 'mira@example.com', booking: { startTime: '2026-09-10T18:00:00.000Z', verified: true }, alternateTimeNote: null, granted: false },
        { id: 2, name: 'Noor', email: 'noor@example.com', booking: null, alternateTimeNote: 'I’m in Toronto and weekday evenings UK time are difficult. Could a Friday work?', granted: false },
      ] });
      waiting.hidden = true; shell.hidden = false; return;
    }
    if (!token()) { location.replace('/members/'); return; }
    try {
      const data = await call('/api/club/session');
      if (!data.member.isHost) { location.replace('/members/'); return; }
      if (!data.member.agreementAccepted) { location.replace('/members/?onboarding=1'); return; }
      updateClock(); setInterval(updateClock, 30000);
      await Promise.all([loadMembers(), loadSalon(), loadInPersonEvents(), loadFieldNoteHost(), loadTestimonialQueue(), loadProspects()]);
      waiting.hidden = true; shell.hidden = false;
    } catch (_) { forgetToken(); location.replace('/members/'); }
  })();
})();
