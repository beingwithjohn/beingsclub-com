(function () {
  var OUT = 300;
  addEventListener('unhandledrejection', function (e) {
    if (e && e.reason && /Transition was skipped/i.test(String(e.reason))) e.preventDefault();
  });
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  var NATIVE = false; // we own the fade; native cross-document transitions are off
  ready(function () {
    var SHELL = !!window.__BC_SHELL; // the shell owns transitions, not the wordmark
    var body = document.body;
    document.documentElement.style.background = getComputedStyle(body).backgroundColor || '#FDFCF9';

    // 1 + 2: the page is hidden by CSS from first paint; reveal once fonts and
    // above-the-fold images are ready so nothing shifts mid-fade.
    if (SHELL) { body.style.animation = 'none'; body.style.opacity = '1'; }
    function reveal() {
      body.style.animation = 'none';
      body.style.transition = 'opacity 420ms cubic-bezier(.22,1,.36,1)';
      body.style.opacity = '1';
    }
    var waits = [];
    if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready);
    Array.prototype.slice.call(document.images).forEach(function (img) {
      if (img.getBoundingClientRect().top > innerHeight * 1.1) return;
      if (img.complete) return;
      waits.push(new Promise(function (res) {
        img.addEventListener('load', res, { once: true });
        img.addEventListener('error', res, { once: true });
      }));
    });
    if (NATIVE) { body.style.animation = 'none'; body.style.opacity = '1'; }
    var revealed = SHELL;
    var once = function () { if (!revealed) { revealed = true; reveal(); } };
    if (!NATIVE) { Promise.all(waits).then(once).catch(once); setTimeout(once, 1200); }

    // 3: prefetch the pages this one links to
    var seen = {};
    Array.prototype.slice.call(document.querySelectorAll('a[href$=".dc.html"]')).forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || seen[href]) return;
      seen[href] = 1;
      var l = document.createElement('link');
      l.rel = 'prefetch';
      l.href = href;
      document.head.appendChild(l);
    });

    // NAVMARK — inline the wordmark so its strokes can thicken on hover
    (function () {
      function boldify(host, txt) {
        if (!host || host.dataset.inlined === '1') return;
        host.dataset.inlined = '1';
        var wrap = document.createElement('div');
        wrap.innerHTML = txt;
        var svg = wrap.querySelector('svg');
        if (!svg) return;
        svg.removeAttribute('width'); svg.removeAttribute('height');
        svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.display = 'block';
        host.style.background = 'none';
        host.style.aspectRatio = 'auto';
        host.appendChild(svg);
        var rings = Array.prototype.slice.call(svg.querySelectorAll('[data-ring]'));
        if (!rings.length) return;
        rings.forEach(function (r) {
          r.style.transition = 'stroke-width .25s cubic-bezier(.22,1,.36,1)';
          r.setAttribute('stroke-width', '9');
        });
        var link = host.closest('a') || host;
        link.addEventListener('mouseenter', function () { rings.forEach(function (r) { r.setAttribute('stroke-width', '12'); }); });
        link.addEventListener('mouseleave', function () { rings.forEach(function (r) { r.setAttribute('stroke-width', '9'); }); });
      }
      if (!document.querySelector('[data-navmark]') && !SHELL) return;
      fetch('assets/beings-logo-outline.svg').then(function (r) { return r.text(); }).then(function (txt) {
        var sweep = function () {
          Array.prototype.slice.call(document.querySelectorAll('[data-navmark]')).forEach(function (h) { boldify(h, txt); });
        };
        sweep();
        // inner screens mount later in the shell — keep watching for their marks
        var mo = new MutationObserver(sweep);
        mo.observe(document.body, { childList: true, subtree: true });
        setTimeout(function () { mo.disconnect(); sweep(); }, 12000);
      }).catch(function () {});
    })();

    // IMAGE_PRELOAD — warm the cache for the other pages' imagery
    var warm = [
      'assets/beings-logo-outline.svg',
      'assets/img/salons-rainbow-circle.jpg',
      'assets/img/bb-leap.jpg',
      'assets/img/bb-trust.jpg',
      'assets/img/sits-shapes.jpg',
      'assets/img/bb-glass.jpg',
      'assets/img/about-aura.jpg',
      'assets/img/beyond-belief-cover-sm.jpg',
      'assets/img/field-rings.jpg',
      'assets/opart/interdependence.png',
      'assets/opart/stillness.png'
    ];
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 600); };
    idle(function () { warm.forEach(function (src) { var i = new Image(); i.src = src; }); });

    // exit fade
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!/\.dc\.html(\?|#|$)/.test(href)) return;
      if (NATIVE) return; // the browser crossfades the navigation itself
      e.preventDefault();
      body.style.transition = 'opacity ' + OUT + 'ms cubic-bezier(.33,0,.67,1)';
      body.style.opacity = '0';
      setTimeout(function () { location.href = href; }, OUT);
    });

    window.addEventListener('pageshow', function (ev) { if (ev.persisted) reveal(); });

    if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;

    setTimeout(function () {
      var blocks = [];
      function show(el) { el.style.opacity = '1'; el.style.transform = 'none'; }
      function showAll() { blocks.forEach(show); }
      try {
        blocks = Array.prototype.slice.call(document.querySelectorAll('header, section, figure'))
          .filter(function (el) {
            return !el.closest('nav') && !el.querySelector('header, section') &&
              el.getBoundingClientRect().top > innerHeight * 0.9;
          });
        if (!blocks.length) return;
        blocks.forEach(function (el) {
          el.style.opacity = '0';
          el.style.transform = 'translateY(12px)';
          el.style.transition = 'opacity .6s cubic-bezier(.22,1,.36,1), transform .6s cubic-bezier(.22,1,.36,1)';
        });
        var pending = blocks.slice();
        var tick = function () {
          pending = pending.filter(function (el) {
            if (el.getBoundingClientRect().top < innerHeight * 0.92) { show(el); return false; }
            return true;
          });
          if (!pending.length) { removeEventListener('scroll', tick); removeEventListener('resize', tick); }
        };
        addEventListener('scroll', tick, { passive: true });
        addEventListener('resize', tick);
        tick();
        addEventListener('beforeprint', showAll);
        setTimeout(showAll, 8000);
      } catch (err) {
        showAll();
      }
    }, 80);
  });
})();
