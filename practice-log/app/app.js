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
 *                                remembers being dismissed. During a course,
 *                                the line to John is available but in the path
 *                                of none.
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
  var INV = null;            // the threshold, read with an invitation
  var root = document.getElementById('root');

  // -------------------------------------------------------------------------
  // the token
  // -------------------------------------------------------------------------
  // A link in an email must never write anything. Mail scanners, link-preview
  // bots and "safe links" services follow every GET they see; a one-tap URL
  // that recorded a practice would log practices nobody did. The token only
  // says who this is. The mark is a POST, made by a tap on this page.
  (function () {
    var t = location.search.match(/[?&]t=([^&#]+)/);
    if (t) L.token = decodeURIComponent(t[1]);

    // The invitation is a second, weaker credential and lives in ?i=. Same
    // rule applies to it: following it takes no place. A tap does that.
    var i = location.search.match(/[?&]i=([^&#]+)/);
    if (i) L.invite = decodeURIComponent(i[1]);

    // Coming back from a contribution. Nothing is granted by it; the page says
    // thank you once and then never mentions it again.
    if (/[?&]thanks=1/.test(location.search)) L.thanks = true;

    if (t || i || L.thanks) {
      save();
      // Keep it out of the address bar, the history and any shared screenshot.
      try { history.replaceState({}, '', location.pathname); } catch (e) {}
    }
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
    var headers = opts.public
      ? {}
      : opts.invite
      ? { authorization: 'Invite ' + (L.invite || '') }
      : { authorization: 'Bearer ' + (L.token || '') };
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

  // The threshold. Read with the invitation, before there is a session.
  function pullInvite() {
    return api('/api/invite', { invite: true }).then(function (d) {
      INV = d;
      // Clicking the link a second time should let them straight back in
      // rather than showing them a door they have already walked through.
      if (d.taken) return takePlace(null, true);
      render();
    }).catch(function () {
      L.invite = null; save(); unreachable = !L.token; render();
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
  var TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  // Counts are said in words, never as figures — a figure invites comparison
  // and this product never compares anybody. The list above stops at
  // thirty-five because a run does; a countdown to day one can run further.
  function word(n) {
    if (WORDS[n] !== undefined) return WORDS[n];
    if (n > 35 && n < 100) {
      var t = TENS[Math.floor(n / 10)], u = n % 10;
      return u ? t + '-' + WORDS[u] : t;
    }
    return String(n);
  }
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
    // Invited but not yet in: the threshold is the whole of it.
    if (!L.token && L.invite) return INV ? viewThreshold() : viewLoading();
    if (!L.token) return viewNoLink();
    if (!S) return unreachable ? viewUnreachable() : viewLoading();
    if (!S.person.setup_at) return viewFirstRun();

    if (view === 'contribute') return viewContribute();
    if (view === 'room') return viewRoom();

    // Before day one there is nothing to practise. The room is who is in it.
    if (S.run.phase === 'room' && view !== 'settings' && view !== 'john') {
      return viewRoom();
    }

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

    // The menu rides on every screen except the ones there is nowhere to go
    // from — the threshold, and a log nobody has signed into.
    var withMenu = S && S.person && !opts.noMenu;

    var bar = h('<div class="bar">' +
      (opts.left || '<span class="brand">Beings Club</span>') +
      '<span style="display:flex;align-items:center;gap:16px;">' +
        (opts.right || '') +
        (withMenu ? '<button class="menu-btn" id="menu" aria-label="Menu" ' +
          'aria-haspopup="dialog"><span></span><span></span><span></span></button>' : '') +
      '</span></div>');
    app.appendChild(bar);

    var main = h('<main></main>');
    if (opts.above) main.appendChild(opts.above);
    main.appendChild(inner);
    app.appendChild(main);
    if (opts.foot) app.appendChild(opts.foot);
    root.appendChild(app);

    var btn = document.getElementById('menu');
    if (btn) btn.addEventListener('click', openMenu);
  }

  // -------------------------------------------------------------------------
  // the menu
  // -------------------------------------------------------------------------
  // Everywhere you can go, in one place. What is *not* here matters as much:
  // the room only appears once there is a room to see, so the drawer cannot
  // become the way around the rule that you tap before you look.
  function openMenu() {
    closeMenu();

    var items = [];
    var phase = S.run.phase;

    if (phase === 'running' || phase === 'closed') {
      items.push({ id: 'today', label: 'Today', sub: todaySub(), view: null });
    }
    if (S.roster) {
      items.push({
        id: 'room',
        label: 'The room',
        sub: phase === 'room' ? 'Who has taken a place' : 'The people sitting the same days as you',
        view: 'room'
      });
    }
    items.push({ id: 'settings', label: 'Settings', sub: 'Your hour, your timezone, your line', view: 'settings' });

    // The host practises like everyone else — his own marks, his own grid,
    // and he is deliberately not one of the ten, so he never shows in their
    // counts or on the roster. The other chair is a page, not a second login.
    if (S.person.is_host) {
      items.push({ id: 'host', label: 'Hosting', sub: 'What people asked, and who is in', href: 'host/' });
    }
    items.push({
      id: 'contribute',
      label: 'Contribute',
      sub: (S.contributions || []).length ? 'You have, thank you' : 'Pay what you want, whenever',
      view: 'contribute'
    });

    var drawer = h('<div class="drawer" role="dialog" aria-modal="true" aria-label="Menu">' +
      '<div class="head"><span class="brand">' + esc(S.run.name) + '</span>' +
        '<button class="barlink" id="mclose">Close</button></div>' +
      items.map(function (it) {
        return '<button class="item" id="m-' + it.id + '"' +
          (sameView(it.view) ? ' aria-current="page"' : '') + '>' +
          esc(it.label) + '<small>' + esc(it.sub) + '</small></button>';
      }).join('') +
      // Set apart and on ink, because it is the one thing nobody else reads.
      (S.person.message_access && S.person.message_access.active
        ? '<button class="item ink" id="m-john">Something just for John' +
          '<small>Private, and open while your course is running</small></button>'
        : '') +
      '<div class="tail"><p class="small">Nothing here is scored. ' +
      'Nothing counts forward, so nothing can be lost.</p></div>' +
    '</div>');

    var scrim = h('<div class="scrim"></div>');
    document.body.appendChild(scrim);
    document.body.appendChild(drawer);
    requestAnimationFrame(function () { scrim.classList.add('in'); drawer.classList.add('in'); });

    scrim.addEventListener('click', closeMenu);
    drawer.querySelector('#mclose').addEventListener('click', closeMenu);
    items.forEach(function (it) {
      drawer.querySelector('#m-' + it.id).addEventListener('click', function () {
        closeMenu();
        if (it.href) { location.href = it.href; return; }
        go(it.view);
      });
    });
    var john = drawer.querySelector('#m-john');
    if (john) john.addEventListener('click', function () { closeMenu(); go('john'); });

    document.addEventListener('keydown', onMenuKey);
    try { drawer.querySelector('.item').focus(); } catch (e) {}
  }

  function sameView(v) {
    if (v === null) return view === null || view === 'cohort';
    return view === v;
  }

  function todaySub() {
    if (!S.today) return '';
    if (S.today.marked) return 'You practised';
    return 'Not yet';
  }

  function onMenuKey(e) { if (e.key === 'Escape') closeMenu(); }

  function closeMenu() {
    document.removeEventListener('keydown', onMenuKey);
    [].forEach.call(document.querySelectorAll('.drawer, .scrim'), function (el) {
      el.classList.remove('in');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, reduced ? 0 : 300);
    });
    var btn = document.getElementById('menu');
    if (btn) { try { btn.focus(); } catch (e) {} }
  }

  // -------------------------------------------------------------------------
  // no link / loading
  // -------------------------------------------------------------------------
  // No link, and the public front door. A first request creates a place in the
  // evergreen log; a later one sends the same long-lived link back. Neither
  // returns a credential to the browser.
  function viewNoLink() {
    var inner = h('<div class="centre">' +
      '<div class="eyebrow">Practice log</div>' +
      '<h1 class="h1" style="max-width:16ch;">A simple record of showing up.</h1>' +
      '<p class="body" style="max-width:38ch;">The log is open to anyone. Give it an email address ' +
      'and it will send your private link. There is no password.</p>' +
      '<div style="display:grid;gap:10px;width:100%;max-width:22rem;">' +
        '<input class="field" id="jn" autocomplete="name" aria-label="Your name" placeholder="Your name">' +
        '<input class="field" id="em" type="email" autocomplete="email" ' +
          'aria-label="Your email address" placeholder="you@example.com">' +
        '<button class="btn" id="send">Begin or open my log</button>' +
        '<p class="small" id="msg" aria-live="polite"></p>' +
      '</div></div>');

    shell(inner, { right: '<span class="barlab">Practice log</span>', noMenu: true });

    var em = inner.querySelector('#em');
    var jn = inner.querySelector('#jn');
    var msg = inner.querySelector('#msg');

    inner.querySelector('#send').addEventListener('click', function () {
      var v = em.value.trim();
      if (!v) { msg.textContent = 'An email address first.'; return; }
      this.disabled = true;
      msg.textContent = 'Sending…';
      api('/api/join', { method: 'POST', public: true, body: { name: jn.value.trim(), email: v, timezone: tz() } })
        .then(function () {
          msg.textContent = 'The link is on its way. If you already had a log, it is the same link as before.';
        })
        .catch(function () {
          inner.querySelector('#send').disabled = false;
          msg.textContent = 'That did not go through. Try again in a moment.';
        });
    });
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
  // the threshold — what a Sit is, and taking your place in one
  // -------------------------------------------------------------------------
  // Nothing of the room is here. Names and lines belong to the people who have
  // already committed, and this is the page where you have not yet.
  function viewThreshold() {
    var r = INV.run;
    var zone = tz();
    var chosen = '07:00';

    if (INV.full) {
      return shell(h('<div class="centre">' +
        '<div class="eyebrow">' + esc(r.name) + '</div>' +
        '<h1 class="h1" style="max-width:16ch;">Every place is taken.</h1>' +
        '<p class="body" style="max-width:34ch;">This one filled up. Write to John and he will ' +
        'tell you when the next Sit opens.</p></div>'), { right: '<span class="barlab">Full</span>' });
    }

    var when = r.starts_on
      ? cap(word(r.length_days)) + ' days from ' + fmt(r.starts_on)
      : 'For as long as you want it';

    var inner = h('<div class="pad narrow" style="flex:1;display:flex;flex-direction:column;' +
      'justify-content:center;gap:24px;max-width:38rem;">' +
      '<div class="eyebrow">A place is yours if you want it</div>' +
      '<h1 class="h1" style="max-width:17ch;">' + esc(INV.person.name ? firstOf(INV.person.name) : 'You') +
        ' — there’s a place for you.</h1>' +
      '<p class="lead">' + esc(r.name) + '. ' + esc(when) + '.</p>' +
      (r.blurb ? r.blurb.split(/\n{2,}/).map(function (p) {
        return '<p class="body">' + esc(p) + '</p>';
      }).join('') : '') +
      (r.meets ? '<div class="frame"><span class="caps">We meet</span>' +
        '<p class="body">' + esc(r.meets) + '</p></div>' : '') +
      // The one human thing asked at the door, and the first field for that
      // reason. Still optional — leading someone to say why is different from
      // making them.
      '<div><div class="caps" style="margin-bottom:12px;">Why are you here?</div>' +
        '<p class="body" style="margin-bottom:12px;">One line, in your own words. ' +
        'The others who take a place will see it, and you will see theirs.</p>' +
        '<textarea class="field" id="ln" rows="2" maxlength="100" ' +
          'aria-label="One line, why you are here" ' +
          'placeholder="Sceptical, but I keep coming back to it."></textarea>' +
        '<div style="display:flex;justify-content:space-between;margin-top:8px;">' +
          '<span class="small">You can change it later, or leave it blank.</span>' +
          '<span class="count" id="left">100 left</span></div></div>' +
      timeFields(zone) +
      '<button class="btn" id="take">Take my place</button>' +
      '<p class="small">' + placesLine(r.places_left) +
        ' Nothing is charged to be here.</p>' +
    '</div>');

    shell(inner, { right: '<span class="barlab">' + esc(r.name) + '</span>' });

    var readTime = wireTimeFields(inner, zone || 'Europe/London', '07:00');

    var ta = inner.querySelector('#ln'), left = inner.querySelector('#left');
    ta.addEventListener('input', function () { left.textContent = (100 - ta.value.length) + ' left'; });

    inner.querySelector('#take').addEventListener('click', function () {
      var when = readTime();
      this.disabled = true;
      this.textContent = 'Taking it…';
      takePlace({
        name: INV.person.name,
        line: ta.value.trim(),
        timezone: when.timezone,
        nudge_hour: when.nudge_hour
      });
    });
  }

  function firstOf(n) { return String(n || '').trim().split(/\s+/)[0]; }

  // -------------------------------------------------------------------------
  // where you are, and when to be nudged
  // -------------------------------------------------------------------------
  // Both are chosen rather than guessed. A detected timezone is right most of
  // the time and silently wrong for anyone travelling, or whose laptop
  // disagrees with their life — and this is the setting that decides when a
  // day turns, so being quietly wrong about it moves someone's whole practice
  // to the wrong date.
  function timeFields(zone) {
    return '<div style="display:grid;gap:22px;">' +
      '<div><div class="caps" style="margin-bottom:12px;">Where you are</div>' +
        '<div class="combo">' +
          '<input class="field" id="tz" role="combobox" aria-expanded="false" ' +
            'aria-autocomplete="list" aria-label="Your timezone" autocomplete="off" ' +
            'placeholder="A city, or UTC, GMT, EST…">' +
          '<ul class="combo-list" id="tzlist" role="listbox" hidden></ul>' +
        '</div>' +
        '<p class="small" style="margin-top:8px;">Your day turns at your own midnight, ' +
        'so a late sit counts for the night you were awake.</p></div>' +
      '<div><div class="caps" style="margin-bottom:12px;">Send the daily email at</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;" id="hrs"></div>' +
        '<input class="field" type="time" id="hh" step="1800" style="max-width:11rem;" ' +
          'aria-label="What time to send the daily email">' +
        '<p class="small" style="margin-top:8px;">Any time you like, on the hour or the half hour.</p>' +
      '</div></div>';
  }

  /** Fill the two fields in and wire the shortcuts. Returns a reader. */
  function wireTimeFields(root, zone, hour) {
    var chosen = wireZone(root, zone);

    var input = root.querySelector('#hh');
    input.value = hour || '07:00';

    var box = root.querySelector('#hrs');
    HOURS.forEach(function (pair) {
      var b = h('<button class="chip">' + pair[1] + '</button>');
      b.addEventListener('click', function () { input.value = pair[0]; mark(); });
      box.appendChild(b);
    });

    function mark() {
      [].forEach.call(box.children, function (c, i) {
        c.classList.toggle('sel', HOURS[i][0] === input.value);
      });
    }
    input.addEventListener('input', mark);
    mark();

    return function () {
      return { timezone: sel.value, nudge_hour: roundToHalf(input.value) };
    };
  }

  // The cron ticks on the hour and the half hour, so anything between would be
  // delivered late by up to thirty minutes. Rounding is honest about that
  // rather than promising a time it cannot keep.
  function roundToHalf(v) {
    var p = String(v || '07:00').split(':');
    var hh = Math.min(23, Math.max(0, parseInt(p[0], 10) || 0));
    var mm = Math.min(59, Math.max(0, parseInt(p[1], 10) || 0));
    if (mm >= 45) { hh = (hh + 1) % 24; mm = 0; } else if (mm >= 15) { mm = 30; } else { mm = 0; }
    return (hh < 10 ? '0' : '') + hh + ':' + (mm ? '30' : '00');
  }

  // The timezone field, searchable.
  //
  // Searchable because the label is the one thing people are least sure of.
  // Most know their offset, or the three letters the clock on their wall says,
  // so the index carries the city, the region, the abbreviation and the offset
  // written both ways — GMT+05:30 and UTC+05:30 — and any of them will find it.
  var ZONES = null;

  function zoneIndex() {
    if (ZONES) return ZONES;
    var now = new Date();

    function part(z, style, when, loc) {
      try {
        var p = new Intl.DateTimeFormat(loc || 'en-GB', { timeZone: z, timeZoneName: style })
          .formatToParts(when || now);
        for (var i = 0; i < p.length; i++) if (p[i].type === 'timeZoneName') return p[i].value;
      } catch (e) {}
      return '';
    }

    // Both halves of the year. The browser reports whichever abbreviation is
    // current, so in August "EST" would find nothing and in January "BST"
    // would — and people think in these letters all year round.
    var jan = new Date(Date.UTC(now.getUTCFullYear(), 0, 15));
    var jul = new Date(Date.UTC(now.getUTCFullYear(), 6, 15));

    ZONES = zoneList().map(function (z) {
      var abbr = part(z, 'short');            // BST, EDT, or GMT+5:30
      var off = part(z, 'longOffset') || '';  // GMT+05:30
      var utc = off.replace(/^GMT/, 'UTC');
      var label = z.replace(/_/g, ' ');
      var city = label.split('/').pop();
      var named = abbr && !/^GMT|^UTC/.test(abbr);

      // Words, not a blob. Matching a substring anywhere once made "EST" find
      // America/Creston, which is the sort of thing nobody reports and
      // everybody quietly distrusts.
      var words = z.toLowerCase().split(/[/_]/);
      (ALIASES[z] || []).forEach(function (a) {
        words = words.concat(a.toLowerCase().split(/\s+/));
      });

      // Both seasons and both locales. en-GB knows BST but calls New York
      // "GMT-5"; en-US knows EST and EDT but calls London "GMT+1". Between
      // them they cover the letters people actually type.
      var abbrs = [
        abbr,
        part(z, 'short', jan), part(z, 'short', jul),
        part(z, 'short', jan, 'en-US'), part(z, 'short', jul, 'en-US')
      ]
        .concat(offsetMinutes(off) === 0 ? ['UTC', 'GMT'] : [])
        .map(function (a) { return (a || '').toLowerCase(); })
        // "gmt+5:30" is an offset, not an abbreviation, and the offset search
        // already answers it. Left in, it would make every zone match "gmt".
        .filter(function (a) { return a && !/^(gmt|utc)[+-]/.test(a); })
        .filter(function (a, i, arr) { return arr.indexOf(a) === i; });

      return {
        zone: z,
        label: label,
        city: city,
        note: (named ? abbr + ' · ' : '') + (utc || 'UTC'),
        mins: offsetMinutes(off),
        words: words,
        abbrs: abbrs,
        // UTC is the canonical answer to both "UTC" and "GMT", and would
        // otherwise lose alphabetically to Africa/Abidjan, which is also on it.
        // A nudge for the zones people actually mean. "EST" is true of Cancun
        // and of New York; only one of them is what was meant.
        boost: (z === 'UTC' ? 15 : 0) + (ALIASES[z] ? 5 : 0),
        offsets: (off + ' ' + utc).toLowerCase()
      };
    }).sort(function (a, b) {
      return a.mins - b.mins || a.label.localeCompare(b.label);
    });

    return ZONES;
  }

  // The browser reports canonical names, so someone in Kolkata is offered
  // "Asia/Calcutta" and finds nothing when they type where they live. These are
  // the renames and the everyday words people actually reach for. Not a
  // geography database — just the ones that would otherwise fail silently.
  var ALIASES = {
    'Asia/Calcutta': ['Kolkata', 'India', 'Delhi', 'Mumbai', 'Bombay'],
    'Asia/Kolkata': ['Calcutta', 'India', 'Delhi', 'Mumbai', 'Bombay'],
    'Europe/Kiev': ['Kyiv', 'Ukraine'],
    'Europe/Kyiv': ['Kiev', 'Ukraine'],
    'Asia/Saigon': ['Ho Chi Minh', 'Vietnam'],
    'Asia/Ho_Chi_Minh': ['Saigon', 'Vietnam'],
    'Asia/Rangoon': ['Yangon', 'Myanmar', 'Burma'],
    'Asia/Yangon': ['Rangoon', 'Myanmar', 'Burma'],
    'Europe/London': ['UK', 'Britain', 'England', 'Scotland', 'Wales', 'GB'],
    'Europe/Dublin': ['Ireland', 'Eire'],
    'Europe/Lisbon': ['Portugal'],
    'Europe/Madrid': ['Spain'],
    'Europe/Paris': ['France'],
    'Europe/Berlin': ['Germany'],
    'Europe/Rome': ['Italy'],
    'Europe/Amsterdam': ['Netherlands', 'Holland'],
    'Europe/Athens': ['Greece'],
    'Europe/Istanbul': ['Turkey', 'Turkiye'],
    'America/New_York': ['USA', 'US', 'East Coast', 'Eastern'],
    'America/Chicago': ['USA', 'US', 'Central'],
    'America/Denver': ['USA', 'US', 'Mountain'],
    'America/Los_Angeles': ['USA', 'US', 'California', 'West Coast', 'Pacific'],
    'America/Toronto': ['Canada'],
    'America/Sao_Paulo': ['Brazil', 'Brasil'],
    'America/Mexico_City': ['Mexico'],
    'Asia/Shanghai': ['China', 'Beijing', 'Peking'],
    'Asia/Tokyo': ['Japan'],
    'Asia/Seoul': ['Korea'],
    'Asia/Dubai': ['UAE', 'Emirates'],
    'Asia/Jerusalem': ['Israel'],
    'Asia/Karachi': ['Pakistan'],
    'Asia/Dhaka': ['Bangladesh'],
    'Asia/Bangkok': ['Thailand'],
    'Asia/Jakarta': ['Indonesia'],
    'Asia/Manila': ['Philippines'],
    'Australia/Sydney': ['Australia', 'NSW'],
    'Australia/Melbourne': ['Australia', 'Victoria'],
    'Australia/Perth': ['Australia'],
    'Pacific/Auckland': ['New Zealand', 'NZ', 'Aotearoa'],
    'Africa/Johannesburg': ['South Africa'],
    'Africa/Lagos': ['Nigeria'],
    'Africa/Nairobi': ['Kenya'],
    'Africa/Cairo': ['Egypt'],
    UTC: ['GMT', 'Zulu', 'Universal']
  };

  /**
   * How well a zone answers what was typed. Zero means it does not.
   *
   * A needle with a digit or a sign is about an offset; anything else is about
   * a name or an abbreviation. That split is what lets "UTC" mean the zone
   * rather than every zone on earth, since all of them carry "UTC+…".
   */
  function scoreZone(z, needle) {
    if (/[\d+\-:]/.test(needle)) return z.offsets.indexOf(needle) > -1 ? 50 : 0;

    // "new york" and "south africa" are two words about one place, so every
    // term has to land somewhere — otherwise a space means no match at all.
    var terms = needle.split(/\s+/).filter(Boolean);
    if (!terms.length) return 0;

    var total = 0;
    for (var t = 0; t < terms.length; t++) {
      var term = terms[t];
      var best = 0;

      if (z.zone.toLowerCase() === term) best = 110;

      for (var a = 0; a < z.abbrs.length; a++) {
        if (z.abbrs[a] === term) best = Math.max(best, 100);
        else if (z.abbrs[a].indexOf(term) === 0) best = Math.max(best, 80);
      }

      for (var i = 0; i < z.words.length; i++) {
        var w = z.words[i];
        if (w === term) best = Math.max(best, 90);
        else if (w.indexOf(term) === 0) best = Math.max(best, 70);
      }

      if (!best) return 0;
      total += best;
    }

    return Math.round(total / terms.length) + z.boost;
  }

  function offsetMinutes(off) {
    var m = /([+-])(\d{2}):(\d{2})/.exec(off || '');
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  }

  function wireZone(root, zone) {
    var input = root.querySelector('#tz');
    var list = root.querySelector('#tzlist');
    var all = zoneIndex();
    var chosen = zone;
    var active = -1;

    var current = all.filter(function (z) { return z.zone === zone; })[0];
    input.value = current ? current.label : (zone || '');

    function close() {
      list.hidden = true; list.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
      active = -1;
      // Typing something unrecognised and walking away should not silently
      // change where you are.
      var c = all.filter(function (z) { return z.zone === chosen; })[0];
      input.value = c ? c.label : chosen;
    }

    function choose(z) { chosen = z.zone; input.value = z.label; close(); }

    function open(q) {
      var needle = String(q || '').toLowerCase().replace(/[_/]/g, ' ').trim();
      var hits;
      if (!needle) {
        hits = all.slice();
      } else {
        hits = all.map(function (z) { return { z: z, s: scoreZone(z, needle) }; })
          .filter(function (r) { return r.s > 0; })
          .sort(function (a, b) { return b.s - a.s || a.z.mins - b.z.mins; })
          .map(function (r) { return r.z; });
      }

      list.innerHTML = '';
      if (!hits.length) {
        list.appendChild(h('<li class="none">Nothing matches that.</li>'));
      } else {
        hits.slice(0, 60).forEach(function (z, i) {
          var li = h('<li role="option"><span>' + esc(z.label) + '</span>' +
            '<em>' + esc(z.note) + '</em></li>');
          if (z.zone === chosen) li.setAttribute('aria-selected', 'true');
          li.addEventListener('mousedown', function (e) { e.preventDefault(); choose(z); });
          list.appendChild(li);
        });
      }
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      active = -1;
    }

    input.addEventListener('focus', function () { input.select(); open(''); });
    input.addEventListener('input', function () { open(input.value); });
    input.addEventListener('blur', function () { setTimeout(close, 120); });

    input.addEventListener('keydown', function (e) {
      var items = list.querySelectorAll('li[role="option"]');
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (list.hidden) { open(input.value); return; }
        e.preventDefault();
        active += e.key === 'ArrowDown' ? 1 : -1;
        if (active < 0) active = items.length - 1;
        if (active >= items.length) active = 0;
        [].forEach.call(items, function (li, i) {
          li.setAttribute('aria-selected', i === active ? 'true' : 'false');
          if (i === active) li.scrollIntoView({ block: 'nearest' });
        });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        // No arrow keys used: take the single best match, so typing "UTC" and
        // pressing enter does the obvious thing.
        var pick = active > -1 ? active : (items.length ? 0 : -1);
        if (pick > -1) items[pick].dispatchEvent(new MouseEvent('mousedown'));
      }
    });

    return function () { return chosen; };
  }

  function zoneList() {
    try {
      if (typeof Intl.supportedValuesOf === 'function') {
        var l = Intl.supportedValuesOf('timeZone');
        // Not every runtime lists UTC itself, and it is the one people type.
        return l.indexOf('UTC') > -1 ? l : ['UTC'].concat(l);
      }
    } catch (e) {}
    // Older browsers get a short list rather than nothing. Anyone missing can
    // still be set by hand from the host side.
    return ['UTC', 'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid',
      'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Athens', 'Europe/Istanbul',
      'Africa/Lagos', 'Africa/Nairobi', 'Africa/Johannesburg', 'Asia/Jerusalem',
      'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Bangkok',
      'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Australia/Perth',
      'Australia/Sydney', 'Pacific/Auckland', 'America/Sao_Paulo', 'America/New_York',
      'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage'];
  }

  function placesLine(left) {
    if (left == null) return '';
    if (left <= 0) return 'This was the last place.';
    return cap(word(left)) + (left === 1 ? ' place left.' : ' places left.');
  }

  function takePlace(body, quiet) {
    return api('/api/place', { method: 'POST', invite: true, body: body || {} })
      .then(function (r) {
        L.token = r.token;
        L.invite = null;      // spent
        save();
        return pull();
      })
      .catch(function () {
        if (!quiet) {
          var b = document.getElementById('take');
          if (b) { b.disabled = false; b.textContent = 'Take my place'; }
        }
        L.invite = null; save(); unreachable = !L.token; render();
      });
  }

  // -------------------------------------------------------------------------
  // the room — after taking a place, before day one
  // -------------------------------------------------------------------------
  function viewRoom() {
    var r = S.run, ros = S.roster || { people: [], places_left: null };
    var before = r.phase === 'room';
    var inner = h('<div style="flex:1;display:flex;flex-direction:column;"></div>');

    // Before day one the band counts down. Once the run is going it says what
    // this room is, since the countdown has nothing left to count.
    inner.appendChild(h('<div class="band">' +
      '<div class="caps" style="margin-bottom:8px;">' +
        (before ? 'Your place is held' : 'The room') + '</div>' +
      '<p>' + esc(before ? startsLine() : 'The people sitting the same days as you.') + '</p></div>'));

    var body = h('<div class="pad" style="display:grid;gap:26px;"></div>');

    if (L.thanks) {
      body.appendChild(h('<div class="frame"><span class="caps">Thank you</span>' +
        '<p class="body">That came through. It is not recorded anywhere anyone else can see.</p></div>'));
      L.thanks = false; save();
    }

    // Who is here. The point of the room.
    // Places left matters while people are still arriving. Once the run has
    // begun it is just an empty chair being counted, so it goes.
    var list = h('<div style="display:grid;gap:16px;"><div class="caps">Who’s here' +
      (before && ros.places_left != null
        ? ' · ' + esc(placesLine(ros.places_left).replace(/\.$/, '')) : '') + '</div>' +
      '<div class="notes"></div></div>');
    var notes = list.querySelector('.notes');
    if (!ros.people.length) {
      notes.appendChild(h('<p class="body">You’re the first one in.</p>'));
    }
    ros.people.forEach(function (p) {
      notes.appendChild(h('<div class="noterow"><b>' + esc(p.name) + '</b>' +
        (p.line ? '<p>' + esc(p.line) + '</p>' : '<p style="color:var(--muted);">—</p>') + '</div>'));
    });
    body.appendChild(list);

    if (r.meets) {
      body.appendChild(h('<div class="frame"><span class="caps">We meet</span>' +
        '<p class="body">' + esc(r.meets) + '</p></div>'));
    }

    // The invitation to contribute. Never a gate, never a nag, and skipping it
    // is not a lesser answer.
    body.appendChild(contributeBlock());

    inner.appendChild(body);

    shell(inner, {
      // During the run the room is somewhere you went, so it needs a way back.
      left: before
        ? '<span class="brand">Beings Club</span>'
        : '<button class="barlink" id="back">← Today</button>',
      right: '<span class="barlab">' + esc(before ? r.name : 'The room') + '</span>',
      above: answerStrip()
    });
    var back = document.getElementById('back');
    if (back) back.addEventListener('click', function () { go('cohort'); });
  }

  function startsLine() {
    var n = S.run.days_until;
    if (n === 0) return 'We begin today.';
    if (n === 1) return 'We begin tomorrow.';
    return 'We begin in ' + word(n) + ' days, on ' + fmt(S.run.starts_on) + '.';
  }

  function contributeBlock() {
    var given = (S.contributions || []).length;
    var box = h('<div class="frame">' +
      '<span class="caps">' + (given ? 'You’ve contributed' : 'Pay what you want') + '</span>' +
      '<p class="body">' + (given
        ? 'Thank you. You can add to it whenever you like, and never need to.'
        : 'Your place does not depend on this and never will. John’s work costs something, ' +
          'and if you want to meet some of that, you can — now, later, or not at all.') + '</p>' +
      '<div style="display:grid;gap:10px;margin-top:6px;">' +
        '<button class="btn" id="give">' + (given ? 'Contribute again' : 'Contribute') + '</button>' +
        (given ? '' : '<button class="quiet" id="later">Skip for now</button>') +
      '</div><p class="small" id="gmsg" aria-live="polite"></p></div>');

    box.querySelector('#give').addEventListener('click', function () { go('contribute'); });
    var later = box.querySelector('#later');
    if (later) later.addEventListener('click', function () {
      box.querySelector('#gmsg').textContent = 'Of course. It won’t be asked again.';
      L.dismissed['contribute'] = 1; save();
    });
    return box;
  }

  // -------------------------------------------------------------------------
  // contributing
  // -------------------------------------------------------------------------
  function viewContribute() {
    var lo = S.run.suggest_low, hi = S.run.suggest_high;
    var cur = (S.run.currency || 'gbp').toUpperCase();
    var sym = cur === 'GBP' ? '£' : cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '';
    var money = function (n) { return sym + (n / 100).toFixed(0); };

    var inner = h('<div class="pad narrow" style="flex:1;display:flex;flex-direction:column;' +
      'justify-content:center;gap:22px;max-width:36rem;">' +
      '<h2 class="h2" style="max-width:18ch;">Pay what you want.</h2>' +
      '<p class="body">Not what it’s worth, and not what someone else paid. What you want to give, ' +
      'if you want to give anything.</p>' +
      '<p class="body">Your place is yours either way. Nobody is told what anyone contributed, ' +
      'and nothing in the log changes because of it.</p>' +
      // The range is offered, never shown. A figure on screen is an expectation
      // however gently it is worded, so it waits behind a question and only
      // arrives for someone who asked it.
      (lo && hi ? '<div><button class="ul" id="ask">Need a suggestion?</button>' +
        '<p class="body" id="range" hidden style="margin-top:12px;">' +
        money(lo) + ' to ' + money(hi) + '. Anything is welcome, and so is nothing.</p></div>' : '') +
      '<div style="display:grid;gap:10px;">' +
        '<button class="btn" id="go">Continue</button>' +
        '<button class="quiet" id="back">Not now</button></div>' +
      '<p class="small" id="msg" aria-live="polite"></p>' +
    '</div>');

    shell(inner, {
      left: '<button class="barlink" id="close">← Back</button>',
      right: '<span class="barlab">Contribute</span>'
    });

    document.getElementById('close').addEventListener('click', function () { go(null); });
    inner.querySelector('#back').addEventListener('click', function () { go(null); });

    var ask = inner.querySelector('#ask');
    if (ask) ask.addEventListener('click', function () {
      inner.querySelector('#range').hidden = false;
      ask.remove();          // asked and answered; it does not need asking twice
    });

    inner.querySelector('#go').addEventListener('click', function () {
      var msg = inner.querySelector('#msg');
      this.disabled = true;
      msg.textContent = 'Opening…';
      api('/api/contribution', { method: 'POST', body: {} }).then(function (r) {
        location.href = r.url;
      }).catch(function (e) {
        inner.querySelector('#go').disabled = false;
        msg.textContent = e.status === 503
          ? 'Contributions aren’t switched on yet. Nothing is owed in the meantime.'
          : 'That didn’t open. Try again in a moment.';
      });
    });
  }

  // -------------------------------------------------------------------------
  // M1 · first run
  // -------------------------------------------------------------------------
  // Three sentences of contract, one decision, one button. No tour.
  function viewFirstRun() {
    var zone = tz() || S.person.timezone;
    var inner = h('<div class="pad narrow" style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:26px;max-width:38rem;">' +
      '<div class="eyebrow">' + esc(S.run.name) + '</div>' +
      '<h1 class="h1" style="max-width:16ch;">Welcome, ' + esc(firstName()) + '.</h1>' +
      '<p class="lead">' + esc(S.run.standfirst ||
        'This is the practice log. This is where you can log your practice and see who’s sitting with you.') + '</p>' +
      '<div style="display:grid;gap:14px;">' +
        '<p class="body"><b style="color:var(--you);font-weight:700;">1</b>&nbsp;&nbsp;One tap a day. That is the whole tool.</p>' +
        '<p class="body"><b style="color:var(--you);font-weight:700;">2</b>&nbsp;&nbsp;You see the others only after you have tapped.</p>' +
        '<p class="body"><b style="color:var(--you);font-weight:700;">3</b>&nbsp;&nbsp;Twenty minutes is standard, and sitting daily matters far more than sitting long. Nothing counts forward, so nothing can be lost.</p>' +
      '</div>' +
      '<div><div class="caps" style="margin-bottom:12px;">The name on your notes</div>' +
        '<input class="field" id="nm" autocomplete="given-name"></div>' +
      '<div><div class="caps" style="margin-bottom:12px;">Why are you here?</div>' +
        '<p class="body" style="margin-bottom:12px;">One line, in your own words. ' +
        'The others will see it, and you will see theirs.</p>' +
        '<textarea class="field" id="ln" rows="2" maxlength="100" ' +
          'aria-label="One line, why you are here" ' +
          'placeholder="Sceptical, but I keep coming back to it."></textarea>' +
        '<div style="display:flex;justify-content:space-between;margin-top:8px;">' +
          '<span class="small">You can change it later, or leave it blank.</span>' +
          '<span class="count" id="left">100 left</span></div></div>' +
      timeFields(zone) +
      '<button class="btn" id="begin">Begin</button>' +
    '</div>');

    shell(inner, { right: '<span class="barlab">Set up</span>', noMenu: true });

    var readTime = wireTimeFields(inner, zone, S.person.nudge_hour);

    var ta = inner.querySelector('#ln'), left = inner.querySelector('#left');
    ta.value = S.person.line || '';
    left.textContent = (100 - ta.value.length) + ' left';
    ta.addEventListener('input', function () { left.textContent = (100 - ta.value.length) + ' left'; });

    var nm = inner.querySelector('#nm');
    nm.value = S.person.name || '';
    inner.querySelector('#begin').addEventListener('click', function () {
      var when = readTime();
      var body = {
        setup: true,
        nudge_hour: when.nudge_hour,
        timezone: when.timezone,
        line: ta.value.trim()
      };
      var name = (nm.value || '').trim();
      if (name) body.name = name;
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
    foot.appendChild(h('<span></span>'));

    shell(inner, {
      right: '<span class="barlab">' + esc(dayLabel()) + '</span>',
      above: answerStrip(),
      foot: foot
    });

    tap.addEventListener('click', function () { doTap(tap); });
    var y = document.getElementById('yday');
    if (y) y.addEventListener('click', function () { go('yesterday'); });
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
      var label = document.querySelector('.barlab');
      if (label) {
        label.textContent = offline ? 'Logged · offline' : 'Logged';
        label.classList.add('on');
      }
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

  // How many people other than you practised today.
  //
  // The host is not one of the ten and is not in these counts, so subtracting
  // yourself is right for a participant and wrong for him — his own mark was
  // never in the total to begin with.
  function othersToday() {
    if (!S.shared) return 0;
    return S.shared.today_count - (S.person.is_host ? 0 : 1);
  }

  /** True when there is no cohort at all — a log being kept alone. */
  function alone() { return !S.shared || S.shared.size === 0; }

  function revealLine() {
    if (offline || !S.shared) return 'Your day is in.';
    if (alone()) return 'Your day is in.';
    var others = othersToday();
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

    if (!reduced) inner.classList.add('rise');
    shell(inner, { right: '<span class="barlab on">Logged</span>' });
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

    shell(inner, {
      right: '<span class="barlab on">' + (offline ? 'Logged · offline' : 'Logged') + '</span>',
      above: answerStrip()
    });

    document.getElementById('tw').addEventListener('click', function () { tab = 'week'; render(); });
    document.getElementById('ta').addEventListener('click', function () { tab = 'all'; render(); });

  }

  function allTabLabel() {
    return S.run.mode === 'fixed' ? 'All ' + S.run.length_days + ' days' : 'All your days';
  }

  function weekSubtitle() {
    var p = principleOf(S.today.week_index);
    return fmt(S.today.date) + (p ? ' · ' + p.toLowerCase() : '');
  }

  function todayLine() {
    // A log kept alone says so, rather than inventing a room to be first in.
    if (alone()) return 'You practised today.';
    var others = othersToday();
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
        '<span><span style="width:11px;height:11px;background:rgba(23,25,22,.55);position:relative;display:inline-block;">' +
          '<span style="position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--you-edge);"></span></span>You practised</span>' +
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
    if (!S.person.message_access || !S.person.message_access.active) {
      var unavailable = h('<div class="centre"><h1 class="h1" style="max-width:17ch;">This line opens during a course.</h1>' +
        '<p class="body" style="max-width:38ch;">The practice log itself remains yours before and after. ' +
        'When you are taking a course with John, you can write to him here and receive a private reply.</p>' +
        '<button class="btn" id="back">Back to the log</button></div>');
      shell(unavailable, {});
      unavailable.querySelector('#back').addEventListener('click', function () { go(null); });
      return;
    }
    var inner = h('<div class="pad narrow" style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:22px;max-width:38rem;">' +
      '<h2 class="h2">Nobody else sees this.</h2>' +
      '<p class="body">Not the cohort, not your partner. Ask anything, or say how it is actually going.</p>' +
      '<textarea class="field" id="q" aria-label="What you want to say to John, privately" rows="5" placeholder="I have sat every day this week and felt nothing. ' +
        'Am I doing it wrong, or is that the point?"></textarea>' +
      '<div style="display:flex;align-items:center;gap:8px;" class="small">' +
        '<span style="width:6px;height:6px;border-radius:50%;background:var(--lilac);"></span>' +
        '<span>Private, while your course is running</span></div>' +
      '<button class="btn on-ink" id="send">Send to John</button>' +
      '<p class="small" id="msg" aria-live="polite">He answers by voice, usually within a day or two. ' +
      'If an answer would help others, he will re-ask it anonymously — never your words, never your name.</p>' +
    '</div>');

    // A full-page takeover, so none of the usual furniture — including the
    // menu. The door shuts behind you.
    shell(inner, {
      dark: true, noMenu: true,
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

    // Both changeable, and both saved together — moving timezone without
    // moving the hour is how someone ends up nudged at four in the morning.
    var when = h('<div>' + timeFields(S.person.timezone) +
      '<button class="btn" id="savewhen" style="margin-top:18px;">Save</button>' +
      '<p class="small" id="whenmsg" aria-live="polite" style="margin-top:10px;"></p></div>');
    inner.appendChild(when);

    inner.appendChild(toggle('Notes', 'Offer a line after logging', 'notes_on'));

    inner.appendChild(nameRow());
    inner.appendChild(lineRow());
    inner.appendChild(contributeRow());

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

    var readTime = wireTimeFields(inner, S.person.timezone, S.person.nudge_hour);
    inner.querySelector('#savewhen').addEventListener('click', function () {
      var v = readTime();
      var msg = inner.querySelector('#whenmsg');
      msg.textContent = 'Saving…';
      api('/api/settings', { method: 'PATCH', body: v }).then(function (state) {
        adopt(state);
        // render() has replaced the node this handler is attached to, so
        // find the fresh one rather than the captured one.
        var m = document.getElementById('whenmsg');
        if (m) m.textContent = 'Saved. ' + hourLabel(v.nudge_hour) + ', ' + v.timezone.replace(/_/g, ' ') + '.';
      }).catch(function () { msg.textContent = 'That did not save. Try again in a moment.'; });
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

  function lineRow() {
    var r = h('<div class="rowflex"><div><b>Why you’re here</b>' +
      '<p>' + esc(S.person.line || 'Nothing written') + '</p></div>' +
      '<button class="ul" id="ln" style="flex:none;">Change</button></div>');
    r.querySelector('#ln').addEventListener('click', function () {
      var v = prompt('One line. The others see it.', S.person.line || '');
      if (v !== null) patch({ line: v.trim().slice(0, NOTE_MAX) });
    });
    return r;
  }

  function contributeRow() {
    var given = (S.contributions || []).length;
    var r = h('<div class="rowflex"><div><b>Contribute</b>' +
      '<p>' + (given
        ? 'You have. Thank you. You can again whenever you like.'
        : 'Pay what you want, whenever you want. Your place never depends on it.') +
      '</p></div><button class="ul" id="cg" style="flex:none;">' +
      (given ? 'Again' : 'Open') + '</button></div>');
    r.querySelector('#cg').addEventListener('click', function () { go('contribute'); });
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

    // Never invent a room. A run of one says so; a run of ten counts them in
    // words, as everywhere else.
    var size = S.shared ? S.shared.size : 1;
    var opening = size > 1
      ? cap(word(size)) + ' people practised, mostly apart, mostly unseen. Here is the whole of it.'
      : 'You practised, mostly unseen. Here is the whole of it.';

    var inner = h('<div class="pad narrow" style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:22px;max-width:40rem;">' +
      '<h1 class="h1" style="max-width:16ch;">That is ' + esc(word(total)) + ' days.</h1>' +
      '<p class="body">' + esc(opening) + '</p>' +
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
  else if (L.invite) pullInvite();
})();
