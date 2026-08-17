/* John's side. A plain list, on purpose.
 *
 * Ten people do not need an inbox with features: what is here is what only he
 * can do — read what people asked privately, answer it, see who has gone quiet,
 * and remove a note. Nothing here is shown to anybody else, and the quiet-day
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
    [['inbox', 'Asked'], ['people', 'People']].forEach(function (p, i) {
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
    (tab === 'inbox' ? inbox() : people()).catch(function (e) {
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
          (m.answered ? ' · answered' : '') + '</div>'));
        row.appendChild(h('<p class="body">' + esc(m.body) + '</p>'));

        if (m.answered) {
          row.appendChild(h('<p class="small">Answered: ' + esc(m.answer || '') +
            (m.audio ? ' · <a href="' + esc(m.audio) + '">audio</a>' : '') + '</p>'));
        } else {
          var form = h('<div style="display:grid;gap:10px;">' +
            '<textarea class="field" rows="3" placeholder="A line back, or leave blank and just send the audio."></textarea>' +
            '<input class="field" placeholder="https://… voice note (optional)">' +
            '<button class="btn">Send the answer</button>' +
            '<p class="small" aria-live="polite"></p></div>');
          var ta = form.querySelector('textarea');
          var url = form.querySelector('input');
          var msg = form.querySelector('p');
          form.querySelector('button').addEventListener('click', function () {
            var body = ta.value.trim(), audio = url.value.trim();
            if (!body && !audio) { msg.textContent = 'Nothing to send.'; return; }
            this.disabled = true;
            msg.textContent = 'Sending…';
            api('/api/host/answer', { method: 'POST', body: { id: m.id, body: body, audio: audio || null } })
              .then(function (r) { msg.textContent = r.mailed ? 'Sent, and emailed.' : 'Saved. The email did not go.'; render(); })
              .catch(function (e) { msg.textContent = e.message; });
          });
          row.appendChild(form);
        }
        wrap.appendChild(row);
      });

      shell(wrap);
    });
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
      wrap.appendChild(inviteForm());

      d.people.forEach(function (p) {
        var bits = [p.email, p.timezone, 'joined ' + p.joined_on];
        if (p.is_host) bits.push('host');
        if (p.left_at) bits.push('left ' + p.left_at);
        if (!p.nudge_on) bits.push('nudges off');

        var row = h('<div class="rowflex"><div>' +
          '<b>' + esc(p.name) + '</b>' +
          '<p>' + esc(bits.join(' · ')) + '</p>' +
          '<p>' + p.marks + (p.marks === 1 ? ' day marked' : ' days marked') +
            (p.last_mark ? ' · last ' + esc(p.last_mark) : '') + '</p>' +
          '</div><div style="text-align:right;flex:none;">' +
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
        wrap.appendChild(row);
      });

      shell(wrap);
    });
  }

  render();
})();
