/* John's side. A plain list, on purpose.
 *
 * Ten people do not need an inbox with features: what is here is what only he
 * can do — read what people asked privately, answer it, grant the private line
 * for a course, see who has gone quiet, and remove a note. Nothing here is shown to anybody else, and the quiet-day
 * count in particular exists so he can reach out as a person, never so the
 * product can.
 */
(function () {
  'use strict';

  var API = '__API_ORIGIN__';
  var KEY = 'bc_practice_log_v3';   // the same token the log stores
  var root = document.getElementById('root');
  var token = null;
  var tab = 'inbox';
  var hostAudioUrls = {};
  var MAX_RECORDING_MS = 20 * 60 * 1000;

  (function () {
    var m = location.search.match(/[?&]t=([^&#]+)/);
    if (m) {
      token = decodeURIComponent(m[1]);
      try {
        var L = JSON.parse(localStorage.getItem(KEY) || '{}');
        L.token = token;
        localStorage.setItem(KEY, JSON.stringify(L));
      } catch (e) {}
      try { history.replaceState({}, '', location.pathname); } catch (e) {}
    } else {
      try { token = (JSON.parse(localStorage.getItem(KEY) || '{}')).token || null; } catch (e) {}
    }
  })();

  function api(path, opts) {
    opts = opts || {};
    var headers = { authorization: 'Bearer ' + (token || '') };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    return fetch(API + path, {
      method: opts.method || 'GET', headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });
  }

  function apiForm(path, form) {
    return fetch(API + path, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + (token || '') },
      body: form
    }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
        throw new Error(j.error || ('http ' + r.status));
      });
      return r.json();
    });
  }

  function apiAudio(id) {
    return fetch(API + '/api/replies/' + id + '/audio', {
      headers: { authorization: 'Bearer ' + (token || '') }
    }).then(function (r) {
      if (!r.ok) throw new Error('That recording could not be opened.');
      return r.blob();
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function h(html) { var d = document.createElement('div'); d.innerHTML = String(html).trim(); return d.firstChild; }
  function when(ts) { return ts ? new Date(ts * 1000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''; }

  function shell(inner) {
    root.innerHTML = '';
    var app = h('<div class="app"></div>');
    // One link, two chairs. The way back to your own practice is always here.
    app.appendChild(h('<div class="bar">' +
      '<a class="barlink" href="../" style="border:0;">← Your log</a>' +
      '<span class="barlab" id="tabs"></span></div>'));
    var main = h('<main></main>');
    main.appendChild(inner);
    app.appendChild(main);
    root.appendChild(app);

    var t = document.getElementById('tabs');
    [['inbox', 'Asked'], ['notes', 'Notes'], ['people', 'People']].forEach(function (p, i) {
      var b = h('<button class="barlink" style="' + (tab === p[0] ? 'color:var(--you);' : '') +
        (i ? 'margin-left:16px;' : '') + '">' + p[1] + '</button>');
      b.addEventListener('click', function () { tab = p[0]; render(); });
      t.appendChild(b);
    });
  }

  function render() {
    if (!token) {
      return shell(h('<div class="centre"><h1 class="h1">This opens from your own link.</h1>' +
        '<p class="body">The host link is the one seeded with <code>--host</code>.</p></div>'));
    }
    shell(h('<div class="pad"><p class="small">Loading…</p></div>'));
    var opening = tab === 'inbox' ? inbox() : tab === 'notes' ? notes() : people();
    opening.catch(function (e) {
      shell(h('<div class="pad"><p class="small">' + esc(e.message) +
        ' — this link may not be a host link.</p></div>'));
    });
  }

  // -------------------------------------------------------------------------
  function inbox() {
    return api('/api/host/inbox').then(function (d) {
      var wrap = h('<div class="rows" style="flex:1;"></div>');
      if (!d.messages.length) wrap.appendChild(h('<div><p class="small">Nothing asked yet.</p></div>'));

      d.messages.forEach(function (m) {
        var row = h('<div style="display:grid;gap:12px;"></div>');
        row.appendChild(h('<div class="caps">' + esc(m.name) + ' · ' + esc(when(m.created_at)) +
          (m.reply ? ' · replied' : '') + '</div>'));
        row.appendChild(h('<p class="body">' + esc(m.body) + '</p>'));

        row.appendChild(m.reply
          ? savedReply(m.reply)
          : replyForm({ type: 'message', message_id: m.id }));
        wrap.appendChild(row);
      });

      shell(wrap);
    });
  }

  function notes() {
    return api('/api/host/notes').then(function (d) {
      var wrap = h('<div class="rows" style="flex:1;"></div>');
      if (!d.notes.length) wrap.appendChild(h('<div><p class="small">No practice notes yet.</p></div>'));

      d.notes.forEach(function (note) {
        var row = h('<div style="display:grid;gap:12px;"></div>');
        row.appendChild(h('<div class="caps">' + esc(note.name) + ' · ' + esc(note.on_date) +
          (note.reply ? ' · replied' : '') + '</div>'));
        row.appendChild(h('<p class="body">“' + esc(note.body) + '”</p>'));
        row.appendChild(note.reply
          ? savedReply(note.reply)
          : replyForm({ type: 'note', person_id: note.person_id, note_date: note.on_date }));
        wrap.appendChild(row);
      });

      shell(wrap);
    });
  }

  function replyForm(source) {
    var box = h('<div class="host-reply-form" style="display:grid;gap:12px;padding-top:8px;">' +
      '<div class="caps">Reply</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;" role="group" aria-label="Who can see this reply">' +
        '<button class="chip sel" data-vis="private" aria-pressed="true">Just for them</button>' +
        '<button class="chip" data-vis="shared" aria-pressed="false">Share with everyone</button>' +
      '</div>' +
      '<div class="public-context" hidden>' +
        '<label class="small">Your question or context — this is all everyone else sees</label>' +
        '<textarea class="field" rows="2" maxlength="500" placeholder="Write the question or context in your own words. Their original stays private."></textarea>' +
      '</div>' +
      '<textarea class="field reply-body" rows="3" maxlength="4000" placeholder="Write a reply, record one, or do both."></textarea>' +
      '<div class="host-recorder" style="display:grid;gap:10px;">' +
        '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
          '<button class="ul record">Record a voice reply</button>' +
          '<button class="ul stop" hidden>Stop recording</button>' +
          '<span class="small timer">Up to 20 minutes</span>' +
        '</div>' +
        '<div class="recording-preview"></div>' +
      '</div>' +
      '<button class="btn send-reply">Send reply</button>' +
      '<p class="small reply-message" aria-live="polite"></p>' +
    '</div>');

    var visibility = 'private';
    var contextWrap = box.querySelector('.public-context');
    var context = contextWrap.querySelector('textarea');
    var body = box.querySelector('.reply-body');
    var record = box.querySelector('.record');
    var stop = box.querySelector('.stop');
    var timer = box.querySelector('.timer');
    var preview = box.querySelector('.recording-preview');
    var message = box.querySelector('.reply-message');
    var recording = null;
    var recordingMs = 0;
    var recorder = null;
    var stream = null;
    var tick = null;
    var cutoff = null;
    var started = 0;
    var previewUrl = null;

    [].forEach.call(box.querySelectorAll('[data-vis]'), function (button) {
      button.addEventListener('click', function () {
        visibility = button.getAttribute('data-vis');
        [].forEach.call(box.querySelectorAll('[data-vis]'), function (other) {
          var selected = other === button;
          other.classList.toggle('sel', selected);
          other.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        contextWrap.hidden = visibility !== 'shared';
        if (visibility === 'shared') context.focus();
      });
    });

    record.addEventListener('click', function () {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        message.textContent = 'This browser cannot record audio here.';
        return;
      }
      message.textContent = 'Opening the microphone…';
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (opened) {
        stream = opened;
        var types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
        var mime = '';
        for (var i = 0; i < types.length; i++) {
          if (!MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(types[i])) { mime = types[i]; break; }
        }
        try {
          recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : { audioBitsPerSecond: 48000 });
        } catch (error) {
          recorder = new MediaRecorder(stream);
        }
        var chunks = [];
        recorder.addEventListener('dataavailable', function (event) {
          if (event.data && event.data.size) chunks.push(event.data);
        });
        recorder.addEventListener('stop', function () {
          clearInterval(tick); clearTimeout(cutoff);
          if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
          recordingMs = Math.min(MAX_RECORDING_MS, Math.max(1, Date.now() - started));
          recording = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          previewUrl = URL.createObjectURL(recording);
          preview.innerHTML = '';
          var player = document.createElement('audio');
          player.controls = true; player.preload = 'metadata'; player.src = previewUrl;
          player.setAttribute('controlsList', 'nodownload');
          preview.appendChild(player);
          var remove = h('<button class="ul" style="margin-left:12px;">Remove recording</button>');
          remove.addEventListener('click', function () {
            recording = null; recordingMs = 0;
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = null; preview.innerHTML = '';
            record.textContent = 'Record a voice reply';
            timer.textContent = 'Up to 20 minutes';
          });
          preview.appendChild(remove);
          record.hidden = false; record.textContent = 'Record again'; stop.hidden = true;
          timer.textContent = formatDuration(recordingMs);
          message.textContent = 'Recording ready.';
        });
        recorder.start(1000);
        started = Date.now();
        record.hidden = true; stop.hidden = false;
        message.textContent = 'Recording…';
        tick = setInterval(function () { timer.textContent = formatDuration(Date.now() - started) + ' / 20:00'; }, 250);
        cutoff = setTimeout(function () { if (recorder && recorder.state === 'recording') recorder.stop(); }, MAX_RECORDING_MS);
      }).catch(function () {
        message.textContent = 'The microphone could not be opened.';
      });
    });

    stop.addEventListener('click', function () {
      if (recorder && recorder.state === 'recording') recorder.stop();
    });

    box.querySelector('.send-reply').addEventListener('click', function () {
      var button = this;
      if (!body.value.trim() && !recording) { message.textContent = 'Write or record something first.'; return; }
      if (visibility === 'shared' && !context.value.trim()) {
        message.textContent = 'Write the public question or context first.'; context.focus(); return;
      }

      var form = new FormData();
      form.append('source_type', source.type);
      if (source.type === 'message') form.append('message_id', String(source.message_id));
      if (source.type === 'note') {
        form.append('person_id', String(source.person_id));
        form.append('note_date', source.note_date);
      }
      form.append('visibility', visibility);
      form.append('context', context.value.trim());
      form.append('body', body.value.trim());
      if (recording) {
        form.append('audio', recording, recording.type.indexOf('mp4') > -1 ? 'reply.m4a' : 'reply.webm');
        form.append('audio_ms', String(recordingMs));
      }

      button.disabled = true;
      message.textContent = 'Sending…';
      apiForm('/api/host/reply', form).then(function (result) {
        message.textContent = result.mailed ? 'Saved, and they were emailed.' : 'Saved. Their email did not go.';
        setTimeout(render, 700);
      }).catch(function (error) {
        button.disabled = false;
        message.textContent = error.message || 'That did not go through.';
      });
    });

    return box;
  }

  function savedReply(reply) {
    var box = h('<div class="frame" style="display:grid;gap:10px;">' +
      '<div class="caps">' + (reply.visibility === 'shared' ? 'Shared with everyone' : 'Just for them') + '</div>' +
      (reply.context ? '<p class="body"><b>Public context:</b> ' + esc(reply.context) + '</p>' : '') +
      (reply.body ? '<p class="body">' + esc(reply.body) + '</p>' : '') +
      '<div class="saved-audio"></div>' +
      '<div class="reply-sharing" hidden style="display:grid;gap:8px;">' +
        '<textarea class="field" rows="2" maxlength="500" placeholder="The question or context everyone will see.">' + esc(reply.context || '') + '</textarea>' +
        '<button class="ul save-sharing">Share with everyone</button>' +
      '</div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;">' +
        (reply.visibility === 'shared'
          ? '<button class="ul make-private">Make private</button><button class="ul edit-context">Change public context</button>'
          : '<button class="ul make-shared">Share with everyone</button>') +
        '<button class="ul danger-link remove-reply">Remove reply</button>' +
      '</div>' +
      '<p class="small saved-message" aria-live="polite"></p>' +
    '</div>');

    var audio = box.querySelector('.saved-audio');
    if (reply.legacy_audio) {
      audio.appendChild(h('<a class="ul" href="' + esc(reply.legacy_audio) + '" target="_blank" rel="noopener">Listen</a>'));
    } else if (reply.has_audio) {
      var listen = h('<button class="ul">Listen</button>');
      listen.addEventListener('click', function () {
        listen.disabled = true; listen.textContent = 'Opening…';
        var ready = hostAudioUrls[reply.id] ? Promise.resolve(hostAudioUrls[reply.id]) : apiAudio(reply.id).then(function (blob) {
          var url = URL.createObjectURL(blob); hostAudioUrls[reply.id] = url; return url;
        });
        ready.then(function (url) {
          var player = document.createElement('audio');
          player.controls = true; player.preload = 'metadata'; player.src = url;
          player.setAttribute('controlsList', 'nodownload');
          audio.innerHTML = ''; audio.appendChild(player);
        }).catch(function () { listen.disabled = false; listen.textContent = 'Try listening again'; });
      });
      audio.appendChild(listen);
    }

    var sharing = box.querySelector('.reply-sharing');
    var sharingText = sharing.querySelector('textarea');
    var message = box.querySelector('.saved-message');
    function openSharing() { sharing.hidden = false; sharingText.focus(); }
    var makeShared = box.querySelector('.make-shared');
    var editContext = box.querySelector('.edit-context');
    if (makeShared) makeShared.addEventListener('click', openSharing);
    if (editContext) editContext.addEventListener('click', openSharing);
    box.querySelector('.save-sharing').addEventListener('click', function () {
      if (!sharingText.value.trim()) { message.textContent = 'Write the public context first.'; return; }
      this.disabled = true; message.textContent = 'Saving…';
      api('/api/host/reply/visibility', {
        method: 'POST', body: { id: reply.id, visibility: 'shared', context: sharingText.value.trim() }
      }).then(render).catch(function (error) { message.textContent = error.message; });
    });
    var makePrivate = box.querySelector('.make-private');
    if (makePrivate) makePrivate.addEventListener('click', function () {
      this.disabled = true; message.textContent = 'Saving…';
      api('/api/host/reply/visibility', {
        method: 'POST', body: { id: reply.id, visibility: 'private', context: '' }
      }).then(render).catch(function (error) { message.textContent = error.message; });
    });
    box.querySelector('.remove-reply').addEventListener('click', function () {
      if (!confirm('Remove this reply and its recording?')) return;
      this.disabled = true; message.textContent = 'Removing…';
      api('/api/host/reply/remove', { method: 'POST', body: { id: reply.id } })
        .then(render).catch(function (error) { message.textContent = error.message; });
    });
    return box;
  }

  function formatDuration(ms) {
    var seconds = Math.max(0, Math.floor(ms / 1000));
    var minutes = Math.floor(seconds / 60);
    return String(minutes).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }

  // -------------------------------------------------------------------------
  // The mutual yes, made into a link. Creates the row but not the person: they
  // are not one of the ten, not on the roster and cannot sign in until they
  // accept. The link comes back either way, so it can be sent by hand instead.
  function inviteForm() {
    var box = h('<div style="display:grid;gap:10px;">' +
      '<div class="caps">Invite someone</div>' +
      '<input class="field" id="iname" placeholder="Their name" autocomplete="off">' +
      '<input class="field" id="imail" placeholder="Their email" autocomplete="off" inputmode="email">' +
      '<label style="display:flex;align-items:center;gap:10px;" class="small">' +
        '<input type="checkbox" id="isend" checked> Email the invitation from me' +
      '</label>' +
      '<button class="btn" id="isubmit">Send the invitation</button>' +
      '<p class="small" id="imsg" aria-live="polite"></p></div>');

    box.querySelector('#isubmit').addEventListener('click', function () {
      var name = box.querySelector('#iname').value.trim();
      var email = box.querySelector('#imail').value.trim();
      var send = box.querySelector('#isend').checked;
      var msg = box.querySelector('#imsg');

      if (!name || !email) { msg.textContent = 'Both a name and an email.'; return; }
      this.disabled = true;
      msg.textContent = 'Sending…';

      api('/api/host/invite', { method: 'POST', body: { name: name, email: email, send: send } })
        .then(function (r) {
          box.querySelector('#isubmit').disabled = false;
          if (r.full) { msg.textContent = r.message; return; }
          box.querySelector('#iname').value = '';
          box.querySelector('#imail').value = '';
          // Shown whether or not it was emailed — an invitation that bounced
          // is still an invitation, and John can paste it into his own note.
          msg.innerHTML = (r.mailed ? 'Sent. ' : 'Not emailed. ') +
            'Their link: <span style="word-break:break-all;">' + esc(r.url) + '</span>';
          render();
        })
        .catch(function (e) {
          box.querySelector('#isubmit').disabled = false;
          msg.textContent = e.message;
        });
    });
    return box;
  }

  function people() {
    return api('/api/host/people').then(function (d) {
      var wrap = h('<div class="rows" style="flex:1;"></div>');
      wrap.appendChild(h('<div><div class="caps">' + esc(d.run.name) + ' · ' + esc(d.run.mode) + '</div></div>'));
      // The main log has its own public front door. Invitations remain only
      // for old private runs; showing one here would recreate the course-copy
      // model the public log replaced.
      if (!d.run.public_join) wrap.appendChild(inviteForm());

      d.people.forEach(function (p) {
        var bits = [p.email, p.timezone, 'joined ' + p.joined_on];
        if (p.is_host) bits.push('host');
        if (p.left_at) bits.push('left ' + p.left_at);
        if (!p.nudge_on) bits.push('nudges off');
        if (p.message_from && p.message_until) bits.push('John line ' + p.message_from + ' to ' + p.message_until);

        var image = p.profile_image
          ? '<span class="profile-preview"><img src="' + esc(p.profile_image) + '" alt=""></span>'
          : '<span class="profile-preview fallback">' + esc(String(p.name || '').trim().charAt(0).toUpperCase() || '·') + '</span>';
        var row = h('<div class="rowflex"><div style="display:flex;gap:14px;align-items:flex-start;min-width:0;">' +
          image + '<div><b>' + esc(p.name) + '</b>' +
          '<p>' + esc(bits.join(' · ')) + '</p>' +
          (p.line ? '<p>“' + esc(p.line) + '”</p>' : '') +
          '<p>' + p.marks + (p.marks === 1 ? ' day marked' : ' days marked') +
            (p.last_mark ? ' · last ' + esc(p.last_mark) : '') + '</p>' +
          '</div></div><div style="text-align:right;flex:none;">' +
          (p.quiet_days >= 3
            ? '<span class="caps" style="color:var(--you);">quiet ' + p.quiet_days + 'd</span>'
            : '<span class="caps">&nbsp;</span>') +
          '</div></div>');

        // Removing a note. The person's mark stays and they are not told.
        var rm = h('<div style="display:flex;gap:8px;margin-top:10px;align-items:center;">' +
          '<input class="field" style="max-width:11rem;padding:8px 10px;font-size:15px;" placeholder="YYYY-MM-DD">' +
          '<button class="ul">Remove that day’s note</button>' +
          '<span class="small" aria-live="polite"></span></div>');
        var input = rm.querySelector('input');
        var say = rm.querySelector('span');
        rm.querySelector('button').addEventListener('click', function () {
          var date = input.value.trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { say.textContent = 'Wants YYYY-MM-DD.'; return; }
          api('/api/host/note/remove', { method: 'POST', body: { person_id: p.id, date: date } })
            .then(function () { say.textContent = 'Removed. Their mark stays.'; })
            .catch(function (e) { say.textContent = e.message; });
        });
        row.appendChild(rm);

        if (!p.is_host) {
          var access = h('<div style="display:grid;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--hair);">' +
            '<div class="caps">Private line during a course</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
              '<input class="field afrom" type="date" style="max-width:11rem;padding:8px 10px;font-size:15px;" aria-label="Course access starts">' +
              '<span class="small">to</span>' +
              '<input class="field auntil" type="date" style="max-width:11rem;padding:8px 10px;font-size:15px;" aria-label="Course access ends">' +
              '<button class="ul asave">Save access</button>' +
              '<button class="ul aclear">Clear</button>' +
              '<span class="small amsg" aria-live="polite"></span>' +
            '</div></div>');
          var from = access.querySelector('.afrom');
          var until = access.querySelector('.auntil');
          var amsg = access.querySelector('.amsg');
          from.value = p.message_from || '';
          until.value = p.message_until || '';

          access.querySelector('.asave').addEventListener('click', function () {
            if (!from.value || !until.value) { amsg.textContent = 'Both dates.'; return; }
            this.disabled = true;
            api('/api/host/message-access', {
              method: 'POST', body: { person_id: p.id, from: from.value, until: until.value }
            }).then(function () { amsg.textContent = 'Saved.'; render(); })
              .catch(function (e) { amsg.textContent = e.message; });
          });
          access.querySelector('.aclear').addEventListener('click', function () {
            this.disabled = true;
            api('/api/host/message-access', {
              method: 'POST', body: { person_id: p.id, from: null, until: null }
            }).then(function () { amsg.textContent = 'Cleared.'; render(); })
              .catch(function (e) { amsg.textContent = e.message; });
          });
          row.appendChild(access);
        }
        wrap.appendChild(row);
      });

      shell(wrap);
    });
  }

  render();
})();
