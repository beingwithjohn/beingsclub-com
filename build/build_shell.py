# Build the simplified Beings Club site from the design bundle.
#
# One shell containing all six screens as layers (instant crossfade, no page loads),
# emitted to six real slugs so each URL keeps its own title/description/social card.
# The slug copies are GENERATED — never hand-edited — so they cannot drift.
import re, io, os, json, shutil

SRC  = "/Users/john/Downloads/design_handoff_beings_club 3"
SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root

# key, source file, slug (trailing-slash convention), title, description
SCREENS = [
    ("home", "Home",
     "/", "Beings Club — a realisationhouse for the curious",
     "Beings Club is a realisationhouse for the curious, hosting monthly Salons where curious people meet, and Sits for meditation. For the benefit of all beings."),
    ("about", "About",
     "/about/", "About — why Beings Club exists · Beings Club",
     "Two principles hold the room, and everything else is free to change. Where Beings Club came from, and why it matters."),
    ("salons", "Salons",
     "/salons/", "Salons — where curiosity connects · Beings Club",
     "A monthly gathering online. Meditation, then conversation in randomly assorted pairs and threes. Nothing to prepare."),
    ("sits", "Sits",
     "/sits/", "Sits — for making meditation yours · Beings Club",
     "Learn to meditate in company. A small group, a daily practice, and a few weeks of shared commitment."),
    ("beyondbelief", "BeyondBelief",
     "/beyondbelief/", "Beyond Belief: the art of trusting yourself · Beings Club",
     "A Sit for ten people, beginning 16 September. Thirty-five days, six Wednesday evenings, online. Pay what you can."),
    ("join", "Join",
     "/join/", "The Door — leave us a note · Beings Club",
     "Register your interest in Beings Club. John writes back himself. No obligation, nothing automated."),
]
BY_FILE = {f: (k, slug) for k, f, slug, _, _ in SCREENS}
ORIGIN  = "https://beingsclub.com"

hover_rules, hover_seen = [], {}

def convert(body, key):
    """Turn one screen's design markup into shell-ready markup."""
    # style-hover="…" -> a data-vh hook plus a collected :hover rule
    def hov(m):
        decls = m.group(1)
        if decls not in hover_seen:
            hover_seen[decls] = len(hover_seen)
            hover_rules.append('[data-vh="%d"]:hover{%s}' % (hover_seen[decls], decls))
        return 'data-vh="%d"' % hover_seen[decls]
    body = re.sub(r'style-hover="([^"]*)"', hov, body)
    body = re.sub(r'\s*style-focus="[^"]*"', '', body)  # focus handled in CSS

    # assets live at the site root — including inside style attributes, or the nav
    # wordmark resolves to /salons/assets/… and 404s on every inner screen
    body = body.replace('src="assets/', 'src="/assets/').replace('href="assets/', 'href="/assets/')
    body = body.replace("url('assets/", "url('/assets/").replace('url("assets/', 'url("/assets/')

    # design-file links become genuine paths, so the site works with JS off
    def link(m):
        f = m.group(1)
        if f not in BY_FILE: return m.group(0)
        return 'href="%s"' % BY_FILE[f][1]
    body = re.sub(r'href="([A-Za-z]+)\.dc\.html"', link, body)

    # imagery in non-active layers must not block the first paint
    body = re.sub(r'<img (?![^>]*loading=)', '<img loading="lazy" decoding="async" ', body)
    if key == 'home':   # …except the wordmark, which is the first thing seen
        body = body.replace('<img loading="lazy" decoding="async" src="/assets/beings-logo-outline.svg"',
                            '<img src="/assets/beings-logo-outline.svg"')

    if key == 'home':
        body = body.replace('ref="{{ logoRef }}"', 'id="bc-logo"')
        # "The Door" is the longest label and wraps the door row to two lines on a
        # phone; the article is dropped there so the four cells sit level.
        body = body.replace('>The Door</a>', '><span class="bc-the">The </span>Door</a>')
        body = body.replace('background:#F8F6F1;">', 'background:#F8F6F1;" data-homefoot="1">')
        body = body.replace(';">{{ line }}</div>', ';" id="bc-line">For the benefit of all beings</div>')
        body = body.replace('onMouseLeave="{{ leave }}"', 'data-doors="1"')
        for k in ('salons', 'sits', 'about', 'door'):
            body = body.replace('onMouseEnter="{{ enter_%s }}"' % k, 'data-door="%s"' % k)

    if key == 'beyondbelief':
        # The cohort may not fill, so the lead no longer promises a headcount.
        old_lead = 'and nine other people doing it with you'
        assert old_lead in body, 'BB lead not found'
        body = body.replace(old_lead, 'and a group of other people doing it with you', 1)

    if key == 'salons':
        # John removed this line; the design source still carries it, so drop it on
        # every regeneration rather than editing the built file.
        cameras = ' Cameras on, nothing recorded.'
        assert cameras in body, 'cameras line not found in Salons'
        body = body.replace(cameras, '', 1)

    if key == 'about':
        # The glossary trigger, per MERGE.md §1. All values are the design's; the tip
        # is lifted OUT of the <h1> and positioned by script, so the page's main
        # heading stays "Beings Club is a realisationhouse for the curious."
        body = body.replace('ref="{{ rhRef }}"', 'id="bc-rh"')
        for hole, attr in [('rhOn','data-rh-on'), ('rhOff','data-rh-off'),
                           ('rhToggle','data-rh-toggle'), ('rhKey','data-rh-key')]:
            body = re.sub(r'on[A-Za-z]+="\{\{ ' + hole + r' \}\}"', attr + '="1"', body)
        m = re.search(r'<span style="\{\{ rhTipStyle \}\}">(.*?)</span></span>', body, re.S)
        assert m, 'rh tip not found'
        tip_inner = m.group(1)
        body = body[:m.start()] + '</span>' + body[m.end():]
        tip = '<span class="bc-rh-tip" id="bc-rh-tip" role="tooltip">' + tip_inner + '</span>'
        body = body.replace('</header>', tip + '\n  </header>', 1)

    if key == 'join':
        body = body.replace('onSubmit="{{ submit }}"', 'id="bc-form" novalidate')
        body = body.replace('onInput="{{ onName }}"', 'data-begin="1"')
        body = body.replace('onInput="{{ onEmail }}"', 'data-begin="1"')
        body = body.replace('style="{{ restStyle }}"', 'id="bc-rest"')
        body = body.replace('onClick="{{ toggleSalons }}"', 'data-chip="salons"')
        body = body.replace('onClick="{{ toggleSits }}"', 'data-chip="sits"')
        body = body.replace('style="{{ salonsStyle }}"', 'class="bc-chip"')
        body = body.replace('style="{{ sitsStyle }}"', 'class="bc-chip"')
        body = body.replace('style="{{ andStyle }}"', 'id="bc-and"')
        body = body.replace('style="{{ sendStyle }}"', 'id="bc-send"')
        body = re.sub(r'(<p role="status"[^>]*)>\{\{ status \}\}<', r'\1 id="bc-status"><', body)

    assert '{{' not in body, (key, re.findall(r'\{\{[^}]*\}\}', body)[:4])
    return body.strip()

layers = []
for key, f, slug, _, _ in SCREENS:
    raw = io.open(os.path.join(SRC, f + '.dc.html'), encoding='utf-8').read()
    body = re.search(r'(?s)</helmet>(.*?)</x-dc>', raw).group(1)
    layers.append('<div class="bc-layer" id="s-%s" data-screen="%s">\n%s\n</div>' % (key, key, convert(body, key)))

CSS = """
  *{box-sizing:border-box;}
  html,body{height:100%;}
  body{margin:0;overflow:hidden;background:#F0EEE8;font-family:'Host Grotesk',system-ui,-apple-system,sans-serif;color:#171916;line-height:1.5;-webkit-font-smoothing:antialiased;}
  img{display:block;max-width:100%;}
  a{color:#171916;text-decoration:none;}
  a:hover{color:#5A4B7C;}
  input,textarea,select,button{font-family:inherit;}
  ::selection{background:#F2ECFF;color:#171916;}

  /* the six layers */
  .bc-shell{position:relative;height:100svh;overflow:hidden;background:#F0EEE8;}
  .bc-layer{position:absolute;inset:0;overflow-y:hidden;overflow-x:hidden;-webkit-overflow-scrolling:touch;
    scrollbar-width:none;opacity:0;visibility:hidden;pointer-events:none;
    transition:opacity 700ms cubic-bezier(.33,0,.67,1),visibility 0s linear 700ms;}
  .bc-layer::-webkit-scrollbar{width:0;height:0;}
  .bc-layer[data-active="1"]{opacity:1;visibility:visible;pointer-events:auto;overflow-y:auto;
    transition:opacity 1100ms cubic-bezier(.22,1,.36,1) 120ms;}

  /* The landing page suppresses the violet link hover — but NOT on the doors,
     which carry their own hover (paper on violet). Without :not([data-vh]) this
     rule outranks the door rule on specificity and the label goes dark on violet. */
  #s-home a:not([data-vh]):hover{color:#171916;}
  #bc-tagline{white-space:nowrap;max-width:100%;}
  @media (max-width:640px){#bc-tagline{white-space:normal;max-width:30ch;}}

  @media (max-width:44rem){
    [data-sidefig]{width:100%!important;max-width:100%!important;flex:0 0 auto!important;align-self:stretch!important;height:clamp(190px,32vh,260px)!important;}
    [data-sidefig] img{width:100%!important;height:100%!important;object-fit:cover!important;}
    [data-splitcopy]{padding:32px 24px!important;}
    #bc-door{height:auto!important;min-height:100svh;overflow:visible!important;}
    #bc-door form{overflow:visible!important;grid-template-rows:auto auto auto!important;padding:28px 24px 32px!important;}
    #bc-door [data-next]{border-left:0!important;border-top:1px solid rgba(38,34,26,0.10)!important;flex-basis:100%!important;}
  }

  /* the realisationhouse card: hover or focus on a pointer, one tap on touch */
  .bc-def{position:relative;cursor:help;border-bottom:1px dashed rgba(38,34,26,0.35);}
  .bc-def:focus-visible{outline:2px solid #5A4B7C;outline-offset:3px;}
  #s-about header{position:relative;}
  /* realisationhouse gloss — values per MERGE.md §1 / README § About.
     The outlined word filling to solid ink IS the affordance; no underline. */
  #bc-rh{position:relative;display:inline-block;cursor:help;color:transparent;
    -webkit-text-stroke:1.4px #171916;transition:color 180ms ease;outline:none;}
  #bc-rh:hover,#bc-rh:focus,#bc-rh[aria-expanded="true"]{color:#171916;}
  #bc-rh:focus-visible{outline:2px solid #5A4B7C;outline-offset:4px;}
  .bc-rh-tip{
    position:absolute;left:0;top:0;z-index:30;
    width:min(23rem,80vw);padding:18px 20px;
    background:#F2ECFF;border:1px solid rgba(38,34,26,0.10);
    color:#171916;-webkit-text-stroke:0;
    font-size:16px;font-weight:400;line-height:1.6;letter-spacing:normal;
    text-transform:none;text-align:left;white-space:normal;text-wrap:pretty;
    pointer-events:none;opacity:0;visibility:hidden;transform:translateY(5px);
    transition:opacity 180ms ease,transform 180ms ease,visibility 0s 180ms;
  }
  .bc-rh-tip[data-open="1"]{
    pointer-events:auto;opacity:1;visibility:visible;transform:translateY(0);
    transition:opacity 180ms ease,transform 180ms ease;
  }

  /* landing page on a phone: doors on one line, footer on one row */
  @media (max-width:36rem){
    .bc-the{display:none;}
    [data-door]{padding:20px 8px!important;font-size:11px!important;letter-spacing:0.12em!important;}
    [data-homefoot="1"]{padding:12px 20px!important;gap:10px!important;}
    [data-homefoot="1"] span,[data-homefoot="1"] a{font-size:10px!important;letter-spacing:0.1em!important;white-space:nowrap;}
    [data-homefoot="1"] > div{gap:12px!important;}
  }

  /* The Door */
  .bc-chip{font-size:0.68em;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;
    border:1px solid #171916;padding:7px 14px;cursor:pointer;background:transparent;color:#171916;}
  .bc-chip[aria-pressed="true"]{background:#171916;color:#FFF7EE;}
  #bc-and{font-size:0.9em;color:#43403A;max-width:0;opacity:0;overflow:hidden;white-space:nowrap;
    transition:opacity .4s ease,max-width .4s cubic-bezier(.22,1,.36,1);}
  #bc-and[data-on="1"]{max-width:4em;opacity:1;}
  #bc-rest{display:grid;gap:clamp(6px,1.4vh,14px);opacity:0;transform:translateY(8px);pointer-events:none;
    transition:opacity 1.8s cubic-bezier(.22,1,.36,1) .25s,transform 1.8s cubic-bezier(.22,1,.36,1) .25s;}
  #bc-rest[data-on="1"]{opacity:1;transform:none;pointer-events:auto;}
  #bc-send{display:inline-flex;align-items:center;gap:12px;font-weight:700;font-size:min(12px,1.9vh);
    letter-spacing:0.16em;text-transform:uppercase;padding:clamp(12px,2.2vh,15px) 28px;background:#171916;
    color:#FFF7EE;border:1px solid #171916;cursor:pointer;opacity:0.35;transition:opacity .35s ease;}
  #bc-rest[data-on="1"] #bc-send,#bc-send[data-on="1"]{opacity:1;}

  /* first-visit intro */
  #bc-intro{position:absolute;inset:0;z-index:30;background:#FDFCF9;display:flex;align-items:center;
    justify-content:center;cursor:pointer;opacity:1;visibility:visible;
    transition:opacity 550ms cubic-bezier(.22,1,.36,1),visibility 0s linear 550ms;}
  #bc-intro[data-off="1"]{opacity:0;visibility:hidden;pointer-events:none;}

  /* scroll reveal on inner screens */
  [data-reveal]{opacity:0;transform:translateY(12px);
    transition:opacity .6s cubic-bezier(.22,1,.36,1),transform .6s cubic-bezier(.22,1,.36,1);}
  [data-reveal="in"]{opacity:1;transform:none;}
  @media (prefers-reduced-motion:reduce){
    [data-reveal]{opacity:1!important;transform:none!important;}
    .bc-layer,#bc-intro{transition:none!important;}
  }
""" + '\n  '.join([''] + hover_rules) + '\n'

JS = r"""
(function () {
  var ROUTES = %ROUTES%;                        // path -> screen key
  var TITLES = %TITLES%;                        // key -> {t,d}
  var byKey = {}; Object.keys(ROUTES).forEach(function (p) { byKey[ROUTES[p]] = p; });
  var shell = document.getElementById('bc-shell');
  var layers = {};
  [].forEach.call(document.querySelectorAll('.bc-layer'), function (l) { layers[l.getAttribute('data-screen')] = l; });

  function norm(p) { if (p.length > 1 && p.charAt(p.length - 1) !== '/') p += '/'; return p; }
  function keyFor(path) { return ROUTES[norm(path)] || null; }

  var current = document.documentElement.getAttribute('data-screen') || 'home';

  function show(key, push, path) {
    if (!layers[key]) return;
    if (key !== current) {
      Object.keys(layers).forEach(function (k) { layers[k].removeAttribute('data-active'); });
      layers[key].setAttribute('data-active', '1');
      layers[key].scrollTop = 0;
      current = key;
      var meta = TITLES[key];
      if (meta) {
        document.title = meta.t;
        var d = document.querySelector('meta[name="description"]'); if (d) d.content = meta.d;
        var c = document.querySelector('link[rel="canonical"]'); if (c) c.href = location.origin + byKey[key];
        var ou = document.querySelector('meta[property="og:url"]'); if (ou) ou.content = location.origin + byKey[key];
        var ot = document.querySelector('meta[property="og:title"]'); if (ot) ot.content = meta.t;
      }
      reveal(layers[key]);
    }
    if (push) history.pushState({ screen: key }, '', path || byKey[key]);
  }

  // ---- link interception: only same-origin, plain clicks, on paths we own ----
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || /^[a-z]+:/i.test(href) && !/^https?:/i.test(href)) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin !== location.origin) return;              // external host: let it go
    var key = keyFor(u.pathname);
    if (!key) return;                                       // /log/, /practice-map/, companion…
    e.preventDefault();
    show(key, true, u.pathname + u.search);
  }, true);

  addEventListener('popstate', function () {
    var k = keyFor(location.pathname);
    if (k) show(k, false);
  });

  // ---- scroll reveal ----
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (en) { if (en.isIntersecting) { en.target.setAttribute('data-reveal', 'in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px' }) : null;
  function reveal(root) {
    var els = root.querySelectorAll('[data-reveal]:not([data-reveal="in"])');
    if (!io) { [].forEach.call(els, function (el) { el.setAttribute('data-reveal', 'in'); }); return; }
    [].forEach.call(els, function (el) { io.observe(el); });
  }
  setTimeout(function () {
    [].forEach.call(document.querySelectorAll('[data-reveal]'), function (el) { el.setAttribute('data-reveal', 'in'); });
  }, 8000);
  addEventListener('beforeprint', function () {
    [].forEach.call(document.querySelectorAll('[data-reveal]'), function (el) { el.setAttribute('data-reveal', 'in'); });
  });

  // ---- the wordmark: inline the SVG so the rings can be animated ----
  var logoSvg = null;
  function inlineLogo(host, cb) {
    fetch('/assets/beings-logo-outline.svg').then(function (r) { return r.text(); }).then(function (txt) {
      var w = document.createElement('div'); w.innerHTML = txt;
      var svg = w.querySelector('svg'); if (!svg) return;
      svg.removeAttribute('width'); svg.removeAttribute('height');
      svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.maxHeight = '100%'; svg.style.display = 'block';
      var img = host.querySelector('img'); if (img) img.style.display = 'none';
      host.appendChild(svg);
      var rings = [].slice.call(host.querySelectorAll('[data-ring]'));
      if (rings.length) {
        rings.forEach(function (p) {
          p.style.transition = 'stroke-width .3s cubic-bezier(.22,1,.36,1)';
          p.style.pointerEvents = 'none';
          p.dataset.baseWidth = p.getAttribute('stroke-width') || '';
        });
        var outer = rings.reduce(function (a, b) { return (+b.getAttribute('data-ring') > +a.getAttribute('data-ring')) ? b : a; });
        outer.style.pointerEvents = 'fill';
        outer.addEventListener('mouseenter', function () { rings.forEach(function (p) { p.style.strokeWidth = '6.5'; }); });
        outer.addEventListener('mouseleave', function () { rings.forEach(function (p) { p.style.strokeWidth = p.dataset.baseWidth || ''; }); });
      }
      if (cb) cb(svg, rings);
    }).catch(function () {});
  }
  var logoHost = document.getElementById('bc-logo');
  if (logoHost) inlineLogo(logoHost);

  // The nav wordmark on inner screens: a CSS background until the SVG arrives (so
  // nothing shifts), then inlined so the outlines can thicken 9 -> 12 on hover.
  var marks = document.querySelectorAll('[data-navmark]');
  if (marks.length) {
    fetch('/assets/beings-logo-outline.svg').then(function (r) { return r.text(); }).then(function (txt) {
      [].forEach.call(marks, function (host) {
        var w = document.createElement('div'); w.innerHTML = txt;
        var svg = w.querySelector('svg'); if (!svg) return;
        svg.removeAttribute('width'); svg.removeAttribute('height');
        svg.style.width = '100%'; svg.style.height = '100%'; svg.style.display = 'block';
        host.style.backgroundImage = 'none';
        host.appendChild(svg);
        var rings = [].slice.call(svg.querySelectorAll('[data-ring]'));
        if (!rings.length) return;
        rings.forEach(function (p) {
          p.style.transition = 'stroke-width .25s cubic-bezier(.22,1,.36,1)';
          p.style.strokeWidth = '9';
        });
        var hit = host.closest('a') || host;
        hit.addEventListener('mouseenter', function () { rings.forEach(function (p) { p.style.strokeWidth = '12'; }); });
        hit.addEventListener('mouseleave', function () { rings.forEach(function (p) { p.style.strokeWidth = '9'; }); });
      });
    }).catch(function () {});
  }

  // ---- the doors change the info line ----
  var line = document.getElementById('bc-line');
  var DOOR = { salons: 'Where curiosity connects', sits: 'For making meditation yours',
               about: 'Why Beings Club exists', door: 'Join the club' };
  var REST = 'For the benefit of all beings';
  [].forEach.call(document.querySelectorAll('[data-door]'), function (a) {
    a.addEventListener('mouseenter', function () { if (line) line.textContent = DOOR[a.getAttribute('data-door')] || REST; });
  });
  var doors = document.querySelector('[data-doors]');
  if (doors) doors.addEventListener('mouseleave', function () { if (line) line.textContent = REST; });

  // ---- realisationhouse gloss: hover/focus, tap, keyboard ----
  var rh = document.getElementById('bc-rh'), rhTip = document.getElementById('bc-rh-tip');
  if (rh && rhTip) {
    var rhHost = rhTip.offsetParent || rhTip.parentElement, rhHold = null;
    function rhPlace() {                       // the word sits mid-line
      var r = rh.getBoundingClientRect(), h0 = rhHost.getBoundingClientRect(), m = 12;
      var w = Math.min(23 * 16, innerWidth * 0.8);
      var left = 0, over = (r.left + w) - (innerWidth - m);
      if (over > 0) left = -over;
      if (r.left + left < m) left = m - r.left;
      rhTip.style.left = Math.round((r.left - h0.left) + left) + 'px';
      rhTip.style.top  = Math.round(r.bottom - h0.top + 10) + 'px';
    }
    function rhOpen(on) {
      clearTimeout(rhHold);
      if (on) rhPlace();
      rhTip.setAttribute('data-open', on ? '1' : '0');
      rh.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    // The tip is a sibling, not a child, so the heading text stays clean; these
    // handlers give it the same no-flicker, selectable behaviour a child would have.
    rh.addEventListener('mouseenter', function () { rhOpen(true); });
    rh.addEventListener('mouseleave', function () { rhHold = setTimeout(function () { rhOpen(false); }, 140); });
    rhTip.addEventListener('mouseenter', function () { clearTimeout(rhHold); });
    rhTip.addEventListener('mouseleave', function () { rhOpen(false); });
    rh.addEventListener('focus', function () { rhOpen(true); });
    rh.addEventListener('blur', function () { rhOpen(false); });
    rh.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      rhOpen(rhTip.getAttribute('data-open') !== '1');
    });
    rh.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rhOpen(rhTip.getAttribute('data-open') !== '1'); }
      else if (e.key === 'Escape') { rhOpen(false); rh.blur && rh.blur(); }
    });
    rhTip.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { rhOpen(false); });
    addEventListener('resize', function () { if (rhTip.getAttribute('data-open') === '1') rhPlace(); });
  }

  // ---- The Door: chips, progressive reveal, Formspree ----
  var form = document.getElementById('bc-form');
  if (form) {
    var state = { salons: false, sits: false, sending: false };
    var rest = document.getElementById('bc-rest'), and = document.getElementById('bc-and'),
        send = document.getElementById('bc-send'), status = document.getElementById('bc-status');
    [].forEach.call(form.querySelectorAll('[data-chip]'), function (b) {
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-chip');
        state[k] = !state[k];
        b.setAttribute('aria-pressed', state[k] ? 'true' : 'false');
        if (and) and.setAttribute('data-on', (state.salons && state.sits) ? '1' : '0');
      });
    });
    [].forEach.call(form.querySelectorAll('[data-begin]'), function (i) {
      i.addEventListener('input', function () {
        if (i.value.trim() && rest && rest.getAttribute('data-on') !== '1') {
          rest.setAttribute('data-on', '1');
          if (send) send.setAttribute('data-on', '1');
        }
      });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.sending) return;
      var v = function (n) { var f = form.querySelector('[name="' + n + '"]'); return f ? f.value.trim() : ''; };
      var name = v('name'), email = v('email');
      function say(m) { if (status) status.textContent = m; }
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say('A name and a valid email, please.');
      var interest = [];
      if (state.salons) interest.push('Salons');
      if (state.sits) interest.push('Sits');
      if (!interest.length) return say('Salons, Sits, or both — pick at least one.');
      state.sending = true; say('Sending…');
      fetch('https://formspree.io/f/xpqkbpyv', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'take part as a participant', interest: interest.join(', '),
          name: name, email: email, drawn: v('drawn'), found: v('found') || 'Not said' })
      }).then(function (r) {
        if (r.ok) say('Received, with thanks. We’ll be in touch — until then, stay curious.');
        else { state.sending = false; say('That didn’t send. Try again, or email john@spacetobe.xyz.'); }
      }).catch(function () { state.sending = false; say('That didn’t send. Try again, or email john@spacetobe.xyz.'); });
    });
  }

  // ---- first-visit intro: the wordmark draws itself, then lands on the page ----
  var intro = document.getElementById('bc-intro');
  function endIntro(delay) {
    setTimeout(function () { if (intro) intro.setAttribute('data-off', '1'); }, Math.min(delay, 2600));
  }
  var reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  if (intro) {
    var seen = false;
    try { seen = sessionStorage.getItem('bc-intro-seen') === '1'; } catch (e) {}
    if (seen || reduced || current !== 'home') { intro.setAttribute('data-off', '1'); }
    else {
      try { sessionStorage.setItem('bc-intro-seen', '1'); } catch (e) {}
      intro.addEventListener('click', function () { intro.setAttribute('data-off', '1'); });
      var host = document.getElementById('bc-intro-mark');
      inlineLogo(host, function (svg, rings) {
        var sorted = rings.slice().sort(function (a, b) { return (+a.getAttribute('data-ring')) - (+b.getAttribute('data-ring')); });
        var DUR = 1700, STEP = 150;
        var anims = sorted.map(function (p, i) {
          var len = 4000; try { len = p.getTotalLength() || 4000; } catch (e) {}
          p.style.strokeDasharray = len + ' ' + len; p.style.strokeDashoffset = len;
          return p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
            { duration: DUR, delay: i * STEP, easing: 'cubic-bezier(.32,.72,.3,1)', fill: 'forwards' });
        });
        Promise.all(anims.map(function (a) { return a.finished.catch(function () {}); })).then(function () {
          var target = document.querySelector('#s-home #bc-logo');
          if (!target) return endIntro(320);
          var a = host.getBoundingClientRect(), b = target.getBoundingClientRect();
          if (!a.width || !b.width) return endIntro(320);
          var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
          var dy = (b.top + b.height / 2) - (a.top + a.height / 2);
          host.animate([{ transform: 'none' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + (b.width / a.width) + ')' }],
            { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' })
            .finished.then(function () { endIntro(120); }).catch(function () { endIntro(120); });
        }).catch(function () { endIntro(0); });
        endIntro(DUR + sorted.length * STEP + 2200);
      });
      setTimeout(function () { endIntro(0); }, 2600);
    }
  }

  // ---- warm the other screens' imagery once this one has settled ----
  var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 900); };
  addEventListener('load', function () {
    idle(function () {
      [].forEach.call(document.querySelectorAll('.bc-layer img[loading="lazy"]'), function (img) {
        img.setAttribute('loading', 'eager');
      });
    });
  });

  reveal(layers[current] || document);
})();
"""

ROUTES = {slug: key for key, _, slug, _, _ in SCREENS}
TITLES = {key: {"t": t, "d": d} for key, _, _, t, d in SCREENS}
JS = JS.replace('%ROUTES%', json.dumps(ROUTES)).replace('%TITLES%', json.dumps(TITLES))

BODY = ('<div class="bc-shell" id="bc-shell">\n'
        + '\n'.join(layers) + '\n'
        + '<div id="bc-intro"><div id="bc-intro-mark" role="img" aria-label="Beings Club" '
          'style="width:min(760px,88vw);max-height:70vh;line-height:0;"></div></div>\n'
        + '</div>')

def page(key, slug, title, desc):
    esc = lambda s: s.replace('&', '&amp;').replace('"', '&quot;')
    head = """<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{t}</title>
<meta name="description" content="{d}">
<link rel="canonical" href="{o}{s}">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="512x512" href="/assets/favicon-512.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon-180.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Beings Club">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:url" content="{o}{s}">
<meta property="og:image" content="{o}/assets/social-preview.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{o}/assets/social-preview.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Host+Grotesk:ital,wght@0,300..800;1,300..800&display=swap">
<link href="https://fonts.googleapis.com/css2?family=Host+Grotesk:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet">""".format(
        t=esc(title), d=esc(desc), o=ORIGIN, s=slug)

    body = BODY.replace('<div class="bc-layer" id="s-%s"' % key,
                        '<div class="bc-layer" data-active="1" id="s-%s"' % key)
    return ('<!DOCTYPE html>\n<html lang="en" data-screen="%s">\n<head>\n%s\n<style>%s</style>\n</head>\n<body>\n%s\n<script>%s</script>\n</body>\n</html>\n'
            % (key, head, CSS, body, JS))

written = []
for key, _, slug, title, desc in SCREENS:
    out = os.path.join(SITE, 'index.html' if slug == '/' else slug.strip('/') + '/index.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    html = page(key, slug, title, desc)
    io.open(out, 'w', encoding='utf-8').write(html)
    written.append((slug, out, len(html)))

for slug, out, n in written:
    print('%-16s -> %-58s %6.1f KB' % (slug, out.replace(SITE + '/', ''), n / 1024.0))
print('\nhover rules collected:', len(hover_rules))
