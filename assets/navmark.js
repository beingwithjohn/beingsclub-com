/* The nav wordmark, for pages outside the app shell (/practice-map/, /404).
 *
 * The shell carries this same behaviour inline; standalone pages load it here so
 * the logo behaves identically everywhere: a CSS background until the SVG
 * arrives — so nothing shifts on load — then inlined, so the outlines can
 * thicken 9 -> 12 on hover. Keep the two in step: the source of truth for the
 * shell copy is build/build_shell.py.
 *
 * Deliberately external rather than inline: a syntax error here degrades one
 * page's logo hover instead of taking a page down.
 */
(function () {
  var marks = document.querySelectorAll('[data-navmark]');
  if (!marks.length) return;
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
})();
