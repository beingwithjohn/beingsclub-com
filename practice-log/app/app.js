/* The Practice Log — client.
 *
 * One page. Local-first: write, queue, sync. No realtime — the grid is fresh on
 * load, and that is honest.
 *
 * The four rules, and where each one lives here:
 *
 *   1  Nothing before the tap.   The server sends no `shared` block until today
 *                                is marked, so there is nothing to leak. This
 *                                file could not show the cohort early if it
 *                                tried.
 *   2  One tap, everything else optional. The note is offered once a day and
 *                                remembers being dismissed. The line to John is
 *                                on every screen and in the path of none.
 *   3  No streaks, ever.         Nothing counts forward. Days that were not
 *                                marked are drawn the same as days not yet
 *                                arrived, and are never named.
 *   4  White is shared, black is John. `.dark` is the private channel and the
 *                                answers to it. Nothing else is ever on ink.
 */
(function () {
  'use strict';

  var API = '__API_ORIGIN__';
  var KEY = 'bc_practice_log_v3';
  var NOTE_MAX = 100;

  // The hours offered at setup. Anything else is reachable from Settings.
  var HOURS = [['06:30', '6:30am'], ['07:00', '7:00am'], ['12:00', '12:00pm'], ['21:00', '9:00pm']];

  var reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  var L = load();
  var S = L.cache || null;       // the last state the server sent
  var view = null;
  var tab = 'week';
  var openDate = null;
  var busy = false;
  var offline = false;
  var unreachable = false;   // reached the end of the road with nothing cached
  var root = document.getElementById('root');

  // -------------------------------------------------------------------------
  // the token
  // -------------------------------------------------------------------------
  // A link in an email must never write anything. Mail scanners, link-preview
  // bots and "safe links" services follow every GET they see; a one-tap URL
  // that recorded a practice would log practices nobody did. The token only
  // says who this is. The mark is a POST, made by a tap on this page.
  (function () {
    var m = location.search.match(/[?&]t=([^&#]+)/);
    if (!m) return;
    L.token = decodeURIComponent(m[1]);
    save();
    // Keep it out of the address bar, the history and any shared screenshot.
    try { history.replaceState({}, '', location.pathname); } catch (e) {}
  })();

  function load() {
    var d = {};
    try { d = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
    if (!d.queue) d.queue = [];
    if (!d.dismissed) d.dismissed = {};
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) {} }

  // -------------------------------------------------------------------------
  // talking to the server
  // -------------------------------------------------------------------------
  function api(path, opts) {
    opts = opts || {};
    var headers = { authorization: 'Bearer ' + (L.token || '') };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then(function (r) {
      if (r.status === 401) { L.token = null; save(); throw new Error('unauthorised'); }
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
        var e = new Error(j.error || ('http ' + r.status)); e.status = r.status; throw e;
      });
      return r.json();
    });
  }

  function pull() {
    return api('/api/state').then(adopt).catch(function (err) {
      if (err.message === 'unauthorised') { S = null; unreachable = false; render(); return; }
      offline = true;
      // With a cache there is still a log to show. Without one there is
      // nothing, and sitting on "Opening your log…" for ever is a lie about
      // what is happening.
      unreachable = !S;
      render();
    });
  }

  function adopt(state) {
    S = state;
    L.cache = state;
    offline = false;
    unreachable = false;
    save();
    render();
    return state;
  }

  // -------------------------------------------------------------------------
  // the queue
  // -------------------------------------------------------------------------
  // The tap always succeeds. If the network is not there the mark is written
  // here and goes up on its own; nothing anyone does is ever lost to a network.
  function enqueue(op) {
    L.queue.push(op);
    save();
    flush();
  }

  function flush() {
    if (busy || !L.queue.length) return Promise.resolve();
    if (navigator.onLine === false) return Promise.resolve();
    busy = true;
    var op = L.queue[0];
    return api(op.path, { method: op.method || 'POST', body: op.body })
      .then(function (state) {
        L.queue.shift();
        busy = false;
        if (state && state.today) adopt(state); else save();
        return flush();
      })
      .catch(function (err) {
        busy = false;
        // A refusal will never succeed on a retry — drop it rather than
        // blocking every later mark behind it forever.
        if (err.status >= 400 && err.status < 500 && err.status !== 401) {
          L.queue.shift(); save(); return flush();
        }
        offline = true;
        render();
      });
  }

  // The one breakpoint changes the shape of the room — tabs below, side by
  // side above — so crossing it has to redraw. Rotating a tablet or narrowing
  // a window would otherwise leave both blocks stacked and unpadded.
  var wide = matchMedia('(min-width:48rem)');
  if (wide.addEventListener) wide.addEventListener('change', function () { render(); });
  else if (wide.addListener) wide.addListener(function () { render(); });

  addEventListener('online', function () { offline = false; flush().then(pull); });
  addEventListener('offline', function () { offline = true; render(); });
  addEventListener('visibilitychange', function () {
    if (!document.hidden && L.token) flush().then(pull);
  });

  // -------------------------------------------------------------------------
  // words and dates
  // -------------------------------------------------------------------------
  var WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
    'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five',
    'twenty-six', 'twenty-seven', 'twenty-eight', 'twenty-nine', 'thirty', 'thirty-one',
    'thirty-two', 'thirty-three', 'thirty-four', 'thirty-five'];
  function word(n) { return WORDS[n] !== undefined ? WORDS[n] : String(n); }
  function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function h(html) { var d = document.createElement('div'); d.innerHTML = String(html).trim(); return d.firstChild; }

  // Midday keeps the date the date, whatever the timezone does around it.
  function asDate(s) { return new Date(s + 'T12:00:00'); }
  function fmt(s, opt) {
    return asDate(s).toLocaleDateString('en-GB', opt || { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } }
  function hourLabel(v) {
    for (var i = 0; i < HOURS.length; i++) if (HOURS[i][0] === v) return HOURS[i][1];
    var p = String(v).split(':'), hh = +p[0];
    return ((hh % 12) || 12) + (p[1] === '00' ? '' : ':' + p[1]) + (hh < 12 ? 'am' : 'pm');
  }

  // A fixed run puts everyone on the same day number and has a last day. An
  // evergreen one counts from the day you joined and simply carries on.
  function dayLabel() {
    var n = S.today.day_index + 1;
    if (S.run.mode !== 'fixed') return 'Day ' + n;
    if (n === S.run.length_days) return 'Day ' + n + ' · last';
    return 'Day ' + n + ' of ' + S.run.length_days;
  }

  function principleOf(weekIdx) {
    var l = S.run.week_labels;
    if (!l || !l.length || weekIdx < 0) return null;
    return l[Math.min(weekIdx, l.length - 1)];
  }

  function go(v) { view = v; render(); window.scrollTo(0, 0); }

  // -------------------------------------------------------------------------
  // render
  // -------------------------------------------------------------------------
  function render() {
    if (!L.token) return viewNoLink();
    if (!S) return unreachable ? viewUnreachable() : viewLoading();
    if (!S.person.setup_at) return viewFirstRun();

    if (view === 'john') return viewJohn();
    if (view === 'settings') return viewSettings();
    if (view === 'yesterday') return viewYesterday();
    if (view === 'day') return viewDay();
    if (view === 'note') return viewNote();

    if (S.run.closed) return viewClosing();
    if (S.run.not_yet_open) return viewBeforeStart();

    if (view === 'cohort') return viewCohort();
    if (S.today.marked) return viewCohort();
    return viewLog();
  }

  function shell(inner, opts) {
    opts = opts || {};
    root.innerHTML = '';
    var app = h('<div class="' + (opts.dark ? 'dark' : 'app') + '"></div>');
    app.appendChild(h('<div class="bar">' +
      (opts.left || '<span class="brand">Beings Club</span>') +
      (opts.right || '') + '</div>'));
    var main = h('<main></main>');
    if (opts.above) main.appendChild(opts.above);
    main.appendChild(inner);
    app.appendChild(main);
    if (opts.foot) app.appendChild(opts.foot);
    root.appendChild(app);
  }

  // -------------------------------------------------------------------------
  // no link / loading
  // -------------------------------------------------------------------------
  function viewNoLink() {
    shell(h('<div class="centre">' +
      '<div class="eyebrow">Practice log</div>' +
      '<h1 class="h1" style="max-width:16ch;">This opens from your email.</h1>' +
      '<p class="body" style="max-width:38ch;">Every email carries the link, and the link is the way in. ' +
      'There is no password to remember and nothing to sign into.</p>' +
      '<p class="small" style="max-width:38ch;">Lost it? Reply to any email from us and John will send another.</p>' +
      '</div>'), { right: '<span class="barlab">Practice log</span>' });
  }

  function viewLoading() {
    shell(h('<div class="centre"><p class="small">Opening your log…</p></div>'), {});
  }

  // Nothing cached and nothing reachable. Says what is true and offers the one
  // thing that might help, rather than spinning.
  function viewUnreachable() {
    var inner = h('<div class="centre">' +
      '<h1 class="h1" style="max-width:16ch;">The log cannot be reached.</h1>' +
      '<p class="body" style="max-width:36ch;">Your day is safe either way — nothing here is ' +
      'lost by waiting. If you have practised, come back when you have signal and it will go in.</p>' +
      '<button class="btn" id="retry" style="max-width:20rem;">Try again</button>' +
      '</div>');
    shell(inner, { right: '<span class="barlab">Offline</span>' });
    inner.querySelector('#retry').addEventListener('click', function () {
      this.disabled = true;
      unreachable = false;
      render();
      pull();
    });
  }

  // -------------------------------------------------------------------------
  // M1 · first run
  // -------------------------------------------------------------------------
  // Three sentences of contract, one decision, one button. No tour.
  function viewFirstRun() {
    var zone = tz();
    var chosen = S.person.nudge_hour;
    var inner = h('<div class="pad narrow" style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:26px;max-width:38rem;">' +
      '<div class="eyebrow">' + esc(S.run.name) + '</div>' +
      '<h1 class="h1" style="max-width:16ch;">Welcome, ' + esc(firstName()) + '.</h1>' +
      '<p class="lead">' + esc(S.run.standfirst ||
        'This is where you say you practised, and see the others who did.') + '</p>' +
      '<div style="display:grid;gap:14px;">' +
        '<p class="body"><b style="color:var(--you);font-weight:700;">1</b>&nbsp;&nbsp;One tap a day. That is the whole tool.</p>' +
        '<p class="body"><b style="color:var(--you);font-weight:700;">2</b>&nbsp;&nbsp;You see the others only after you have tapped.</p>' +
        '<p class="body"><b style="color:var(--you);font-weight:700;">3</b>&nbsp;&nbsp;Twenty minutes is standard, and sitting daily matters far more than sitting long. Nothing counts forward, so nothing can be lost.</p>' +
      '</div>' +
      '<div><div class="caps" style="margin-bottom:12px;">When shall I nudge you?</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;" id="hrs"></div>' +
        (zone ? '<p class="small" style="margin-top:12px;">Your local time — ' + esc(zone) + '</p>' : '') +
      '</div>' +
      '<div><div class="caps" style="margin-bottom:12px;">The name on your notes</div>' +
        '<input class="field" id="nm" autocomplete="given-name"></div>' +
      '<button class="btn" id="begin">Begin</button>' +
    '</div>');

    shell(inner, { right: '<span class="barlab">Set up</span>' });

    var hrs = inner.querySelector('#hrs');
    HOURS.forEach(function (pair) {
      var b = h('<button class="chip' + (pair[0] === chosen ? ' sel' : '') + '">' + pair[1] + '</button>');
      b.addEventListener('click', function () {
        chosen = pair[0];
        [].forEach.call(hrs.children, function (c) { c.classList.remove('sel'); });
        b.classList.add('sel');
      });
      hrs.appendChild(b);
    });

    var nm = inner.querySelector('#nm');
    nm.value = S.person.name || '';
    inner.querySelector('#begin').addEventListener('click', function () {
      var body = { nudge_hour: chosen, setup: true };
      var name = (nm.value || '').trim();
      if (name) body.name = name;
      if (zone && zone !== S.person.timezone) body.timezone = zone;
      this.disabled = true;
      api('/api/settings', { method: 'PATCH', body: body }).then(adopt).catch(function () {
        inner.querySelector('#begin').disabled = false;
      });
    });
  }

  function firstName() {
    return String(S.person.name || '').trim().split(/\s+/)[0] || 'friend';
  }

  // -------------------------------------------------------------------------
  // before a fixed run opens
  // -------------------------------------------------------------------------
  function viewBeforeStart() {
    shell(h('<div class="centre">' +
      '<div class="eyebrow">' + esc(S.run.name) + '</div>' +
      '<h1 class="h1" style="max-width:16ch;">We begin on ' + esc(fmt(S.run.anchor, { weekday: 'long', day: 'numeric', month: 'long' })) + '.</h1>' +
      '<p class="body" style="max-width:36ch;">The log opens that morning, and the first email comes with it. ' +
      'Nothing to do until then.</p></div>'), { right: '<span class="barlab">Soon</span>' });
  }

  // -------------------------------------------------------------------------
  // M4 · the log surface, before the tap
  // -------------------------------------------------------------------------
  // Nothing before the tap: no cohort, no counts, no notes on this screen.
  function viewLog() {
    var away = quietArrival();
    var inner = h('<div class="centre"></div>');

    if (away) {
      // The gap is never mentioned and never counted.
      inner.appendChild(h('<h1 class="h1" style="max-width:14ch;">Good to see you.</h1>'));
      inner.appendChild(h('<p class="body" style="max-width:34ch;">Nothing has been kept. ' +
        'Nothing needs explaining. There is just today, the same as it was.</p>'));
    } else {
      inner.appendChild(h('<div class="eyebrow">' + esc(fmt(S.today.date)) + '</div>'));
      inner.appendChild(h('<h1 class="ask">Did you practise today?</h1>'));
    }

    var tap = h('<button class="tap" id="tap"><b>I practised</b><i>tap anywhere here</i></button>');
    inner.appendChild(tap);

    inner.appendChild(h('<p class="small" style="max-width:34ch;">' + (away
      ? 'Beginning again is not the failure. It <em>is</em> the practice.'
      : 'Twenty minutes is standard, and sitting daily matters far more than sitting long. ' +
        'Five minutes on a hard day is a real practice, not a failed one.') + '</p>'));

    var foot = h('<div class="foot"></div>');
    foot.appendChild(S.yesterday.markable
      ? h('<span>Practised yesterday? <button class="ul" id="yday">Add it</button></span>')
      : h('<span></span>'));
    foot.appendChild(h('<button class="ul" id="setl">Settings</button>'));

    shell(inner, {
      right: '<span class="barlab">' + esc(dayLabel()) + '</span>',
      above: answerStrip(),
      foot: foot
    });

    tap.addEventListener('click', function () { doTap(tap); });
    var y = document.getElementById('yday');
    if (y) y.addEventListener('click', function () { go('yesterday'); });
    document.getElementById('setl').addEventListener('click', function () { go('settings'); });
  }

  // Someone arriving after a stretch away. Read from their own marks, never
  // shown as a number, never mentioned again.
  function quietArrival() {
    if (!L.lastSeen || L.lastSeen === S.today.date) { L.lastSeen = S.today.date; save(); return false; }
    var gap = Math.round((asDate(S.today.date) - asDate(L.lastSeen)) / 86400000);
    L.lastSeen = S.today.date; save();
    return gap >= 3;
  }

  // M11 · an answer from John, above the log. Still black, and it never blocks
  // the tap — you are never made to read before you can log.
  function answerStrip() {
    var a = (S.answers || [])[0];
    if (!a || L.dismissed['answer:' + a.id]) return null;
    var el = h('<div class="answer">' +
      '<div class="caps">John replied · just to you</div>' +
      (a.answer ? '<p>“' + esc(a.answer) + '”</p>' : '') +
      (a.audio ? '<p><a href="' + esc(a.audio) + '" target="_blank" rel="noopener">Listen</a></p>' : '') +
      '<button class="caps" id="dismiss-answer" style="justify-self:start;">Close</button>' +
    '</div>');
    el.querySelector('#dismiss-answer').addEventListener('click', function () {
      L.dismissed['answer:' + a.id] = 1; save(); render();
    });
    return el;
  }

  // -------------------------------------------------------------------------
  // the anatomy of one tap
  // -------------------------------------------------------------------------
  // 0ms dip and a haptic · 120ms commit to the mark · a second alone ·
  // 700ms the count · 1400ms the grid · 2000ms the note. Reduced motion
  // collapses the whole thing to a crossfade with no delays.
  function doTap(tap) {
    var date = S.today.date;
    if (S.today.marked) return;

    // Committed here, online or not.
    S.today.marked = true;
    L.cache = S;
    save();
    enqueue({ path: '/api/mark', body: { date: date } });

    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
    if (reduced) { afterTap(); return; }

    tap.classList.add('dip');
    setTimeout(function () { tap.classList.remove('dip'); }, 90);

    setTimeout(function () {
      tap.classList.add('done');
      tap.querySelector('b').textContent = 'You practised.';
      tap.querySelector('i').textContent = dayLabel().split(' ·')[0];
      var lab = document.querySelector('.barlab');
      if (lab) { lab.textContent = offline ? 'Logged · offline' : 'Logged'; lab.classList.add('on'); }
      // The rest of the screen steps back so the square is alone.
      [].forEach.call(document.querySelectorAll('.centre > *'), function (el) {
        if (el !== tap) { el.style.transition = 'opacity .4s ease-out'; el.style.opacity = '0'; }
      });
    }, 120);

    setTimeout(function () {
      var line = h('<p class="body fade" style="max-width:28ch;">' + revealLine() + '</p>');
      if (tap.parentNode) {
        tap.parentNode.appendChild(line);
        requestAnimationFrame(function () { line.classList.add('in'); });
      }
    }, 700);

    setTimeout(function () { go('cohort'); }, 1400);
    setTimeout(afterTap, 2000);
  }

  function revealLine() {
    if (offline) return 'Your day is in.';
    if (!S.shared) return 'Your day is in.';
    var others = S.shared.today_count - 1;
    if (others <= 0) return 'You’re the first one in.';
    return cap(word(others)) + ' other' + (others === 1 ? '' : 's') +
      (others === 1 ? ' has' : ' have') + ' practised so far today.';
  }

  function afterTap() {
    var key = 'note:' + S.today.date;
    if (S.person.notes_on && !L.dismissed[key] && !S.today.note) {
      L.dismissed[key] = 1; save(); go('note');
    } else if (view !== 'cohort') { go('cohort'); }
  }

  // -------------------------------------------------------------------------
  // M6 · the note, offered once
  // -------------------------------------------------------------------------
  function viewNote() {
    var size = S.shared ? S.shared.size - 1 : 0;
    var seenBy = size > 0
      ? 'The ' + word(size) + ' others will see this'
      : 'Kept with your day';

    var inner = h('<div class="pad narrow" style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:22px;max-width:36rem;">' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
        '<span class="dot me" style="width:10px;height:10px;"></span>' +
        '<span class="caps">' + esc(dayLabel().split(' ·')[0]) + ' · you practised</span></div>' +
      '<h2 class="h2" style="max-width:15ch;">Add a note?</h2>' +
      '<p class="body">A line for the others. What it was like, or nothing at all.</p>' +
      '<div><textarea class="field" id="nt" aria-label="A note for the others, up to 100 characters" rows="3" maxlength="' + NOTE_MAX + '" ' +
        'placeholder="Restless the whole way through. Sat anyway."></textarea>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:8px;">' +
        '<span class="count" id="left">' + NOTE_MAX + ' left</span></div></div>' +
      '<div style="display:flex;align-items:center;gap:8px;" class="small">' +
        '<span style="width:6px;height:6px;border-radius:50%;background:var(--muted);"></span>' +
        '<span>' + esc(seenBy) + '</span></div>' +
      '<div style="display:grid;gap:10px;">' +
        '<button class="btn" id="addit">Add it</button>' +
        '<button class="quiet" id="skip">Skip — no note today</button></div>' +
    '</div>');

    var foot = h('<div class="foot" style="justify-content:center;">' +
      '<span>Something just for John? <button class="ul" id="jl">Ask privately</button></span></div>');

    if (!reduced) inner.classList.add('rise');
    shell(inner, { right: '<span class="barlab on">Logged</span>', foot: foot });
    requestAnimationFrame(function () { inner.classList.add('in'); });

    var ta = inner.querySelector('#nt'), left = inner.querySelector('#left');
    ta.addEventListener('input', function () { left.textContent = (NOTE_MAX - ta.value.length) + ' left'; });
    try { ta.focus(); } catch (e) {}

    inner.querySelector('#addit').addEventListener('click', function () {
      var v = ta.value.trim();
      if (v) {
        S.today.note = v;
        if (S.shared) S.shared.notes = (S.shared.notes || []).concat([{ who: 'You', body: v, mine: true }]);
        save();
        enqueue({ path: '/api/note', body: { date: S.today.date, body: v } });
      }
      go('cohort');
    });
    inner.querySelector('#skip').addEventListener('click', function () { go('cohort'); });
    document.getElementById('jl').addEventListener('click', function () { go('john'); });
  }

  // -------------------------------------------------------------------------
  // M7 / M8 · the room
  // -------------------------------------------------------------------------
  function viewCohort() {
    var inner = h('<div style="flex:1;display:flex;flex-direction:column;"></div>');

    inner.appendChild(h('<div class="band"><div class="caps" style="margin-bottom:8px;">Today</div>' +
      '<p>' + todayLine() + '</p></div>'));

    inner.appendChild(h('<div class="tabs" role="tablist">' +
      '<button id="tw" role="tab" aria-selected="' + (tab === 'week') + '" class="' +
        (tab === 'week' ? 'sel' : '') + '">This week</button>' +
      '<button id="ta" role="tab" aria-selected="' + (tab === 'all') + '" class="' +
        (tab === 'all' ? 'sel' : '') + '">' + esc(allTabLabel()) + '</button></div>'));

    var wk = weekBlock(), all = allBlock(), notes = notesBlock();
    var body;

    if (window.matchMedia('(min-width:48rem)').matches) {
      body = h('<div class="split"></div>');
      var col = h('<div class="main"></div>');
      var w1 = h('<div></div>');
      w1.appendChild(h('<div class="dtitle"><b>This week</b><span>' + esc(weekSubtitle()) + '</span></div>'));
      w1.appendChild(wk);
      var w2 = h('<div></div>');
      w2.appendChild(h('<div class="dtitle"><b>' + esc(allTabLabel()) + '</b><span>Click a day to open it</span></div>'));
      w2.appendChild(all);
      col.appendChild(w1); col.appendChild(w2);
      body.appendChild(col);
      body.appendChild(notes || h('<div></div>'));
    } else {
      body = h('<div class="pad" style="display:grid;gap:26px;"></div>');
      body.appendChild(tab === 'week' ? wk : all);
      if (tab === 'week' && notes) body.appendChild(notes);
    }

    if (offline) {
      body.appendChild(h('<div class="frame">' +
        '<span class="caps">Saved on this device</span>' +
        '<p class="small">No signal, so the others are not here yet. ' +
        'Your day is kept and will go up on its own.</p></div>'));
    }
    inner.appendChild(body);

    var foot = h('<div class="foot"><button class="ul" id="setl">Settings</button>' +
      '<span>Something just for John? <button class="ul" id="jl">Ask privately</button></span></div>');

    shell(inner, {
      right: '<span class="barlab on">' + (offline ? 'Logged · offline' : 'Logged') + '</span>',
      above: answerStrip(),
      foot: foot
    });

    document.getElementById('tw').addEventListener('click', function () { tab = 'week'; render(); });
    document.getElementById('ta').addEventListener('click', function () { tab = 'all'; render(); });
    document.getElementById('setl').addEventListener('click', function () { go('settings'); });
    document.getElementById('jl').addEventListener('click', function () { go('john'); });
  }

  function allTabLabel() {
    return S.run.mode === 'fixed' ? 'All ' + S.run.length_days + ' days' : 'All your days';
  }

  function weekSubtitle() {
    var p = principleOf(S.today.week_index);
    return fmt(S.today.date) + (p ? ' · ' + p.toLowerCase() : '');
  }

  function todayLine() {
    if (!S.shared) return 'You practised today.';
    var others = S.shared.today_count - 1;
    if (others <= 0) return 'You’re the first one in.';
    return 'You and ' + word(others) + ' other' + (others === 1 ? '' : 's') + ' have practised.';
  }

  function dayFor(date) {
    if (!S.shared) return null;
    for (var i = S.shared.days.length - 1; i >= 0; i--) {
      if (S.shared.days[i].date === date) return S.shared.days[i];
    }
    return null;
  }

  // Days across, one dot per person. Amber-free by design: your mark is the
  // site's violet, ringed in lilac so it reads at seven pixels.
  function weekBlock() {
    var box = h('<div style="display:grid;gap:22px;align-content:start;"></div>');
    var row = h('<div class="week"></div>');
    var size = S.shared ? S.shared.size : 1;
    var big = size > 12;   // past a dozen, dots stop being countable

    S.today.week.forEach(function (date) {
      var d = dayFor(date);
      var future = date > S.today.date;
      var col = h('<div class="daycol' + (future ? ' future' : '') + '"></div>');

      if (big) {
        var frac = d && d.count ? d.count / size : 0;
        var sq = h('<div style="width:100%;aspect-ratio:1;background:' +
          (frac ? 'rgba(23,25,22,' + (0.28 + frac * 0.54).toFixed(2) + ')' : 'var(--dim)') + ';"></div>');
        if (d && d.mine) sq.appendChild(h('<span class="mine" style="position:absolute;"></span>'));
        col.appendChild(sq);
      } else {
        var dots = h('<div class="dots" style="grid-template-columns:repeat(' +
          Math.min(2, Math.max(1, size)) + ',7px);"></div>');
        var mine = !!(d && d.mine);
        var others = Math.max(0, (d ? d.count : 0) - (mine ? 1 : 0));
        // Yours first, then one ink dot per other person who practised, then
        // the rest empty. Counts only — there is no order to follow.
        dots.appendChild(h('<div class="dot' + (mine ? ' me' : '') + '"></div>'));
        for (var k = 1; k < size; k++) {
          dots.appendChild(h('<div class="dot' + (k <= others ? ' did' : '') + '"></div>'));
        }
        col.appendChild(dots);
      }

      col.appendChild(h('<span class="dlab' + (date === S.today.date ? ' today' : '') + '" aria-hidden="true">' +
        esc(fmt(date, { weekday: 'narrow' })) + '</span>'));

      // The dots are a picture of a number. Say the number, and let the dots
      // themselves be decoration rather than a list of nothing.
      col.setAttribute('aria-hidden', 'false');
      col.setAttribute('role', 'img');
      col.setAttribute('aria-label', dayReading(date, d, future));
      row.appendChild(col);
    });

    box.appendChild(row);
    box.appendChild(h('<div class="legend">' +
      '<span><span class="key" style="background:var(--you);box-shadow:0 0 0 2px var(--you-ring);"></span>You</span>' +
      '<span><span class="key" style="background:var(--ink);"></span>Practised</span>' +
      '<span><span class="key" style="background:var(--dim);"></span>Not yet</span></div>'));
    return box;
  }

  // A day is one square: darkness is how many of us practised, the violet edge
  // is you. No totals, no percentages, no averages.
  function allBlock() {
    var box = h('<div style="display:grid;gap:18px;align-content:start;"></div>');
    if (!S.shared) return box;

    var size = S.shared.size;
    var days = S.shared.days;
    var weeks = [];
    days.forEach(function (d) {
      var w = Math.floor(d.day_index / 7);
      if (!weeks.length || weeks[weeks.length - 1].w !== w) weeks.push({ w: w, days: [] });
      weeks[weeks.length - 1].days.push(d);
    });

    // A fixed run draws its whole shape, including the days still to come.
    if (S.run.mode === 'fixed') {
      var total = Math.ceil(S.run.length_days / 7);
      while (weeks.length < total) weeks.push({ w: weeks.length, days: [] });
    }

    weeks.forEach(function (wk) {
      var blk = h('<div style="display:grid;gap:8px;"></div>');
      var label = principleOf(wk.w);
      var isNow = wk.w === S.today.week_index;
      var head = h('<div class="wkhead"><b>' + esc(label || ('Week ' + (wk.w + 1))) + '</b></div>');
      head.appendChild(h('<span class="' + (isNow ? 'now' : '') + '">' + (isNow ? 'This week'
        : (wk.days[0] ? esc(fmt(wk.days[0].date, { day: 'numeric', month: 'short' })) : '')) + '</span>'));
      blk.appendChild(head);

      var row = h('<div class="wkrow"></div>');
      for (var i = 0; i < 7; i++) {
        var d = wk.days[i];
        if (!d) { row.appendChild(h('<div class="sq" style="opacity:.45;"></div>')); continue; }
        var frac = d.count / Math.max(size, d.count, 1);
        var bg = d.count === 0 ? 'var(--dim)' : 'rgba(23,25,22,' + (0.28 + frac * 0.54).toFixed(2) + ')';
        var sq = h('<button class="sq' + (d.date === S.today.date ? ' today' : '') +
          '" style="background:' + bg + ';" aria-label="' + esc(dayReading(d.date, d, false)) + '"></button>');
        if (d.mine) sq.appendChild(h('<span class="mine"></span>'));
        (function (date) {
          sq.addEventListener('click', function () { openDate = date; go('day'); });
        })(d.date);
        row.appendChild(sq);
      }
      blk.appendChild(row);
      box.appendChild(blk);
    });

    box.appendChild(h('<div style="border-top:1px solid var(--hair);padding-top:16px;display:grid;gap:10px;">' +
      '<div class="legend">' +
        '<span><span style="width:11px;height:11px;background:var(--dim);position:relative;display:inline-block;">' +
          '<span style="position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--you);"></span></span>You practised</span>' +
        '<span><span style="width:11px;height:11px;background:rgba(23,25,22,.75);display:inline-block;"></span>Darker, more of us</span>' +
        '<span><span style="width:11px;height:11px;background:rgba(23,25,22,.3);outline:1.5px solid var(--ink);outline-offset:1.5px;display:inline-block;"></span>Today</span>' +
      '</div>' +
      '<p class="small">Tap any day to see who practised and what they wrote.</p></div>'));
    return box;
  }

  // One day, said out loud. Counts in words, the same as everywhere else, and
  // never a denominator.
  function dayReading(date, d, future) {
    var when = fmt(date);
    if (future) return when + ', not yet';
    var count = d ? d.count : 0;
    var mine = !!(d && d.mine);
    if (!count) return when + ', nobody practised';
    if (count === 1) return when + ', ' + (mine ? 'you practised' : 'one of us practised');
    return when + ', ' + word(count) + ' of us practised' + (mine ? ', including you' : '');
  }

  function notesBlock() {
    var notes = (S.shared && S.shared.notes) || [];
    if (!notes.length) return null;
    var nb = h('<div style="display:grid;gap:14px;"><div class="caps">Notes today</div>' +
      '<div class="notes"></div></div>');
    var list = nb.querySelector('.notes');
    notes.forEach(function (n) {
      list.appendChild(h('<div class="noterow"><b>' + esc(n.who) + '</b><p>' + esc(n.body) + '</p></div>'));
    });
    return nb;
  }

  // -------------------------------------------------------------------------
  // M9 · one day, opened
  // -------------------------------------------------------------------------
  function viewDay() {
    var date = openDate;
    var inner = h('<div style="flex:1;display:flex;flex-direction:column;"></div>');
    inner.appendChild(h('<div class="pad"><p class="small">Opening…</p></div>'));
    shell(inner, {
      left: '<button class="barlink" id="back">← ' + esc(allTabLabel()) + '</button>',
      right: '<span class="barlab">' + esc(fmt(date, { day: 'numeric', month: 'short' })) + '</span>'
    });
    document.getElementById('back').addEventListener('click', function () { tab = 'all'; go('cohort'); });

    api('/api/day?date=' + encodeURIComponent(date)).then(function (d) {
      var p = principleOf(Math.floor(d.day_index / 7));
      var line = d.count === 0 ? 'Nobody practised.'
        : (d.count === 1 && d.mine ? 'You practised.'
          : cap(word(d.count)) + ' of us practised.');

      inner.innerHTML = '';
      inner.appendChild(h('<div class="pad" style="border-bottom:1px solid var(--hair);display:grid;gap:12px;">' +
        '<div class="eyebrow">' + esc(fmt(date)) + (p ? ' · ' + esc(p.toLowerCase()) : '') + '</div>' +
        '<p class="h2">' + esc(line) + '</p></div>'));

      var nb = h('<div class="pad" style="flex:1;display:grid;gap:18px;align-content:start;">' +
        '<div class="caps">What people wrote</div></div>');
      if (d.notes.length) {
        d.notes.forEach(function (n) {
          nb.appendChild(h('<div class="noterow"><b>' + esc(n.who) + '</b><p>' + esc(n.body) + '</p></div>'));
        });
      } else {
        nb.appendChild(h('<p class="body">Nothing was written on this day.</p>'));
      }
      nb.appendChild(h('<p class="small" style="border-top:1px solid var(--hair);padding-top:16px;">' +
        'Who did not practise is not shown. Only what people chose to say.</p>'));
      inner.appendChild(nb);
    }).catch(function () {
      inner.innerHTML = '';
      inner.appendChild(h('<div class="pad"><p class="small">That day could not be opened just now.</p></div>'));
    });
  }

  // -------------------------------------------------------------------------
  // M13 · yesterday, added late
  // -------------------------------------------------------------------------
  function viewYesterday() {
    var date = S.yesterday.date;
    var inner = h('<div class="pad narrow" style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:22px;max-width:36rem;">' +
      '<h2 class="h2">Did you practise on ' + esc(fmt(date, { weekday: 'long' })) + '?</h2>' +
      '<p class="body">Only yesterday can be added, and only until midnight tonight. ' +
      'After that a day is what it was.</p>' +
      '<div style="display:grid;gap:10px;">' +
        '<button id="yes" style="border:1px solid var(--ink);background:var(--warm);padding:18px;' +
          'display:flex;justify-content:space-between;align-items:center;gap:16px;">' +
          '<span style="font-size:17px;font-weight:600;color:var(--ink);">Yes, I practised</span>' +
          '<span class="small">' + esc(fmt(date, { weekday: 'short', day: 'numeric', month: 'short' })) + '</span></button>' +
        '<button class="quiet" id="no">No — leave it as it is</button></div>' +
      '<div style="background:var(--lilac);padding:18px 20px;"><p class="small" style="color:var(--body);">' +
        'It joins the grid without a mark saying it was late. ' +
        'Nobody is told the difference, because there is not one.</p></div>' +
    '</div>');

    var foot = h('<div class="foot" style="justify-content:center;">' +
      '<span>No notes on a late day — the moment has passed</span></div>');

    shell(inner, {
      left: '<button class="barlink" id="back">← Today</button>',
      right: '<span class="barlab">Yesterday</span>', foot: foot
    });

    document.getElementById('back').addEventListener('click', function () { go(null); });
    inner.querySelector('#no').addEventListener('click', function () { go(null); });
    inner.querySelector('#yes').addEventListener('click', function () {
      S.yesterday.marked = true; S.yesterday.markable = false;
      save();
      enqueue({ path: '/api/mark', body: { date: date } });
      go(null);
    });
  }

  // -------------------------------------------------------------------------
  // M10 · black is John
  // -------------------------------------------------------------------------
  // A full-page takeover, never a modal over the grid — the cohort should not
  // be visible behind the private door.
  function viewJohn() {
    var inner = h('<div class="pad narrow" style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:22px;max-width:38rem;">' +
      '<h2 class="h2">Nobody else sees this.</h2>' +
      '<p class="body">Not the cohort, not your partner. Ask anything, or say how it is actually going.</p>' +
      '<textarea class="field" id="q" aria-label="What you want to say to John, privately" rows="5" placeholder="I have sat every day this week and felt nothing. ' +
        'Am I doing it wrong, or is that the point?"></textarea>' +
      '<div style="display:flex;align-items:center;gap:8px;" class="small">' +
        '<span style="width:6px;height:6px;border-radius:50%;background:var(--lilac);"></span>' +
        '<span>Private, for as long as this log exists</span></div>' +
      '<button class="btn on-ink" id="send">Send to John</button>' +
      '<p class="small" id="msg" aria-live="polite">He answers by voice, usually within a day or two. ' +
      'If an answer would help others, he will re-ask it anonymously — never your words, never your name.</p>' +
    '</div>');

    shell(inner, {
      dark: true,
      left: '<span class="brand">Just to John</span>',
      right: '<button class="barlink" id="close">Close</button>'
    });

    document.getElementById('close').addEventListener('click', function () { go(null); });
    var q = inner.querySelector('#q');
    try { q.focus(); } catch (e) {}
    inner.querySelector('#send').addEventListener('click', function () {
      var v = q.value.trim();
      if (!v) return;
      this.disabled = true;
      enqueue({ path: '/api/message', body: { body: v } });
      q.value = '';
      inner.querySelector('#msg').textContent = 'Sent. He answers by voice, usually within a day or two.';
    });
  }

  // -------------------------------------------------------------------------
  // M14 · settings
  // -------------------------------------------------------------------------
  // Five things, one of them a name. Nothing here can turn the log into a tracker.
  function viewSettings() {
    var inner = h('<div class="rows" style="flex:1;"></div>');

    inner.appendChild(toggle('Daily nudge', 'One email, no cohort news in it', 'nudge_on'));

    var hrs = h('<div><div class="rowflex" style="margin-bottom:12px;"><div><b>Send it at</b></div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;" id="hrs"></div>' +
      '<p class="small" style="margin-top:12px;">Your local time — ' + esc(S.person.timezone) + '</p></div>');
    inner.appendChild(hrs);

    inner.appendChild(toggle('Notes', 'Offer a line after logging', 'notes_on'));

    inner.appendChild(nameRow());

    inner.appendChild(h('<div><b style="font-size:17px;font-weight:600;color:var(--ink);">' +
      esc(S.person.name) + '</b>' +
      '<p class="small">' + esc(S.person.email) + ' · ' + esc(S.run.name) + '</p></div>'));

    var link = h('<div><div class="rowflex"><div><b>This link</b>' +
      '<p>Long-lived, and yours. Replace it if the device it lives on is not.</p></div>' +
      '<button class="ul" id="revoke" style="flex:none;">Replace</button></div>' +
      '<p class="small" id="revoked" style="margin-top:10px;"></p></div>');
    inner.appendChild(link);

    inner.appendChild(h('<div style="border-bottom:none;"><p class="small">' +
      'Nothing here is scored. Nothing counts forward, so nothing can be lost.</p></div>'));

    shell(inner, {
      left: '<span class="brand">Settings</span>',
      right: '<button class="barlink" id="done">Done</button>'
    });

    document.getElementById('done').addEventListener('click', function () { go(null); });

    var box = inner.querySelector('#hrs');
    HOURS.forEach(function (pair) {
      var b = h('<button class="chip' + (pair[0] === S.person.nudge_hour ? ' sel' : '') + '">' + pair[1] + '</button>');
      b.addEventListener('click', function () { patch({ nudge_hour: pair[0] }); });
      box.appendChild(b);
    });

    inner.querySelector('#revoke').addEventListener('click', function () {
      var note = inner.querySelector('#revoked');
      note.textContent = 'Sending…';
      api('/api/settings/revoke', { method: 'POST', body: {} }).then(function (r) {
        note.textContent = 'A new link is on its way to ' + r.sent_to + '. This one has stopped working.';
        L.token = null; save();
      }).catch(function () { note.textContent = 'That did not go through. Try again in a moment.'; });
    });
  }

  function toggle(title, sub, key) {
    var r = h('<div class="rowflex"><div><b>' + esc(title) + '</b><p>' + esc(sub) + '</p></div>' +
      '<button class="sw' + (S.person[key] ? ' on' : '') + '" aria-label="' + esc(title) + '"><i></i></button></div>');
    r.querySelector('.sw').addEventListener('click', function () {
      var body = {}; body[key] = !S.person[key];
      patch(body);
    });
    return r;
  }

  function nameRow() {
    var r = h('<div class="rowflex"><div><b>Show me in the cohort as</b>' +
      '<p>The name on your notes</p></div>' +
      '<button class="ul" id="nm" style="flex:none;">' + esc(S.person.name) + '</button></div>');
    r.querySelector('#nm').addEventListener('click', function () {
      var v = prompt('The name on your notes', S.person.name || '');
      if (v && v.trim()) patch({ name: v.trim() });
    });
    return r;
  }

  function patch(body) {
    // Optimistic, so a toggle never lags behind the finger.
    Object.keys(body).forEach(function (k) { S.person[k] = body[k]; });
    save(); render();
    api('/api/settings', { method: 'PATCH', body: body }).then(adopt).catch(function () {
      offline = true; render();
    });
  }

  // -------------------------------------------------------------------------
  // M15 · the last day, and after
  // -------------------------------------------------------------------------
  // The run becomes an object you can look at. The total and the unmarked days
  // are shown together, once, at the only moment they cannot be chased.
  function viewClosing() {
    var days = (S.shared && S.shared.days) || [];
    var marked = 0;
    days.forEach(function (d) { if (d.mine) marked++; });
    var total = S.run.length_days || days.length;
    var unmarked = Math.max(0, total - marked);

    var inner = h('<div class="pad narrow" style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:22px;max-width:40rem;">' +
      '<h1 class="h1" style="max-width:16ch;">That is ' + esc(word(total)) + ' days.</h1>' +
      '<p class="body">People practised, mostly apart, mostly unseen. Here is the whole of it.</p>' +
    '</div>');

    var grid = h('<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;"></div>');
    var size = S.shared ? S.shared.size : 1;
    days.forEach(function (d) {
      var frac = d.count / Math.max(size, d.count, 1);
      var sq = h('<div class="sq" style="background:' +
        (d.count === 0 ? 'var(--dim)' : 'rgba(23,25,22,' + (0.28 + frac * 0.54).toFixed(2) + ')') + ';"></div>');
      if (d.mine) sq.appendChild(h('<span class="mine"></span>'));
      grid.appendChild(sq);
    });
    inner.appendChild(grid);

    inner.appendChild(h('<div style="background:var(--lilac);padding:20px;display:grid;gap:6px;">' +
      '<p style="font-size:19px;font-weight:600;letter-spacing:-0.02em;color:var(--ink);">' +
        'You marked ' + esc(word(marked)) + ' of them.</p>' +
      '<p class="small" style="color:var(--body);">And did not mark ' + esc(word(unmarked)) +
        '. Both are part of the run.</p></div>'));

    inner.appendChild(h('<p class="body">The log stays here, unchanged, as long as you want it — ' +
      'what happens next is yours.</p>'));

    var foot = h('<div class="foot" style="justify-content:center;">' +
      '<span>Say something to John before we close? <button class="ul" id="jl">Write privately</button></span></div>');

    shell(inner, { right: '<span class="barlab on">' + esc(word(total)) + ' days</span>', foot: foot });
    document.getElementById('jl').addEventListener('click', function () { go('john'); });
  }

  // -------------------------------------------------------------------------
  render();
  if (L.token) flush().then(pull);
})();
