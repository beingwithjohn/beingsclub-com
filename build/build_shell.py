# Build the simplified Beings Club site from the design bundle.
#
# One shell containing all six screens as layers (instant crossfade, no page loads),
# emitted to six real slugs so each URL keeps its own title/description/social card.
# The slug copies are GENERATED — never hand-edited — so they cannot drift.
import re, io, os, json, shutil

# Vendored into the repo: a path into ~/Downloads meant one cleared folder
# would have made these six pages impossible to regenerate, ever.
SRC  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
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
     "/sits/", "Sits — meditation for the curious · Beings Club",
     "Learn to meditate in company. A small group, a daily practice, and a few weeks of shared commitment."),
    ("beyondbelief", "BeyondBelief",
     "/beyondbelief/", "Beyond Belief: the art of trusting yourself · Beings Club",
     "A small group meditation class for making meditation your own. Thirty-five days, six Tuesday meetings, online from 15 September. Pay what you can."),
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
            # !important, because the design keeps its resting styles INLINE, and an
            # inline declaration beats any ordinary stylesheet rule. Without it, a
            # button that sets color:#5A4B7C inline keeps that colour while the
            # hover rule paints the background violet — violet text on violet.
            hover_rules.append('[data-vh="%d"]:hover{%s}' % (
                hover_seen[decls],
                ';'.join(d.strip() + ' !important' for d in decls.rstrip(';').split(';') if d.strip())))
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

    # ---- John's copy pass ----------------------------------------------
    # "practice" is the spelling everywhere, noun and verb alike.
    body = body.replace('Practised this way', 'Practiced this way')
    # one testimonial carried a curly apostrophe; the site's convention is straight
    body = body.replace('timelines wouldn\u2019t typically', "timelines wouldn't typically")

    if key == 'sits':
        # "lab partner" is the term site-wide — the experiment framing is the point,
        # and the pairing is named by what it is for rather than by its frequency.
        pair = 'a different fellow sitter each week'
        assert pair in body, 'Sits lab-partner line not found'
        body = body.replace(pair, 'a different lab partner to share the exploration with each week', 1)
        # A principle is carried into the days, not endured for a week.
        lens = 'as a lens to sit through, not an idea to believe'
        assert lens in body, 'Sits lens line not found'
        body = body.replace(lens, 'as a lens to bring into practice, not an idea to believe', 1)
        body = body.replace('>Ten<', '>Ten max<')

    if key == 'beyondbelief':
        # The cohort may not fill, so nothing promises a headcount: the lead says
        # "a group", the eyebrow says "max", and the closing band drops the count.
        for old, new, what in [
            ('and nine other people doing it with you',
             'and a group of other people doing it with you', 'lead'),
            ('six Wednesday evenings, and a group',
             'six Tuesday meetings, and a group', 'lead — meetings'),
            ('>Six Wednesdays<', '>Six Tuesdays<', 'stat'),
            ('Pay what you can, online, 16 September \u2013 21 October.',
             'Pay what you can, online, 15 September \u2013 20 October.', 'price line'),
            ('>16 Sep<', '>15 Sep<', 'week 1'),
            ('>23 Sep<', '>22 Sep<', 'week 2'),
            ('>30 Sep<', '>29 Sep<', 'week 3'),
            ('>7 Oct<',  '>6 Oct<',  'week 4'),
            ('>14 Oct<', '>13 Oct<', 'week 5'),
            ('>21 Oct<', '>20 Oct<', 'week 6'),
            ('A Sit · ten people · begins 16 September',
             'A Sit · ten people max · begins 15 September', 'eyebrow'),
            ('>Ten people. Thirty-five days. One practice.<',
             '>Thirty-five days. One practice.<', 'closing band'),
            ('>10 people<', '>10 people max<', 'stat trio'),
            ('>Ten<', '>Ten max<', 'places chip'),
            ('Pausing every striving, and recognising space uncontrived, and open.',
             'Pausing every striving, and recognising space uncontrived and open.', 'rest row'),
        ]:
            assert old in body, 'BB %s not found' % what
            body = body.replace(old, new, 1)

    if key == 'sits':
        assert 'For making meditation yours' in body, 'Sits line not found'
        body = body.replace('For making meditation yours', 'Meditation for the curious')

        assert '16 Sep \u2013 21 Oct' in body, 'Sits run not found'
        body = body.replace('16 Sep \u2013 21 Oct', '15 Sep \u2013 20 Oct', 1)

        # The intro opens on the Sit itself rather than on Salons, and the voice
        # settles on John \u2014 he hosts and teaches, so it is his claim to make.
        for old, new, what in [
            ('Salons begin with meditation; Sits are for going deeper. A Sit runs',
             'A Sit runs', 'lead \u2014 opening clause'),
            ('knowing the others are sitting', 'knowing that others are sitting',
             'lead \u2014 the others'),
            # split before "won't" so no apostrophe, straight or curly, is matched
            ('John hosts and introduces each one. The practices come out of contemplative traditions and we ',
             'John hosts and teaches. The practices are rooted in contemplative traditions and he ',
             'hosting line'),
            ('No certification, nothing asked of you as belief.',
             'Nothing asked of you as belief.', 'belief line'),
            ('>Sceptics welcome.<', '>Sceptics welcome, but stay curious.<', 'sceptics line'),
        ]:
            assert old in body, 'Sits %s not found' % what
            body = body.replace(old, new, 1)

    if key == 'salons':
        # John removed this line; the design source still carries it, so drop it on
        # every regeneration rather than editing the built file.
        cameras = ' Cameras on, nothing recorded.'
        assert cameras in body, 'cameras line not found in Salons'
        body = body.replace(cameras, '', 1)
        # "either 1:1 or" reads as scheduling shorthand and sets the two formats
        # against each other. Both happen; the sentence should say so plainly.
        pairs = 'members meet either 1:1 or in groups of three'
        assert pairs in body, 'salons pairing line not found'
        body = body.replace(pairs, 'members meet one-to-one and in groups of three', 1)
        # Step 01 ends on the shared field. Sits already carries the belief
        # disclaimer ("nothing asked of you as belief") and says it better.
        belief = ' Nothing has to be believed.'
        assert belief in body, 'salons step 01 belief line not found'
        body = body.replace(belief, '', 1)
        # Step 02 says the same thing as the lead, so it says it the same way.
        rooms = 'Randomly allocated, 1:1 or in threes.'
        assert rooms in body, 'salons step 02 allocation line not found'
        body = body.replace(rooms, 'Randomly allocated, one-to-one and in threes.', 1)
        # All three steps now open "We —": sit, explore, close. The middle one
        # named a place while the others named an act.
        heading = '>Conversation rooms</h3>'
        assert heading in body, 'salons step 02 heading not found'
        body = body.replace(heading, '>We explore together</h3>', 1)
        # The Salon ends as a group, not as people leaving one at a time.
        close = 'and leave gently.'
        assert close in body, 'salons step 03 closing line not found'
        body = body.replace(close, 'and close the space together.', 1)
        # The rhythm is monthly. Individual dates stay in the last week without
        # promising one weekday forever.
        time = '>5:30pm UK<'
        assert time in body, 'salons time line not found'
        body = body.replace(time, '>7pm UK<', 1)
        # September is a deliberate Wednesday. The script below keeps this date
        # current, then falls back to the flexible monthly rhythm once it has passed.
        stale = 'The next one is Sunday 27 September, 5:30pm UK.'
        assert stale in body, 'salons next-date line not found'
        next_salon = 'The next Salon is Wednesday, September 30th, 7pm UK.'
        body = body.replace(stale, '<span id="bc-next-salon">' + next_salon + '</span>', 1)

    if key == 'about':
        # John's wording for the origin story.
        for old, new, what in [
            ('Beings Club exists because of a tea house at Plum Village, where I found myself '
             'in conversations over tea that expanded my sense of what is possible — free of any prescribed topic.',
             'Beings Club exists because of a tea house at Plum Village, where I found myself '
             'in conversations over tea that expanded my sense of what is possible.', 'origin paragraph'),
            ('This is in the lineage of that atmosphere:',
             'Beings Club is in the lineage of that atmosphere:', 'lineage line'),
        ]:
            assert old in body, 'About %s not found' % what
            body = body.replace(old, new, 1)

    if key == 'about':
        # The three doors at the foot of About carry the same info lines the
        # home doors reveal on hover — one phrase per destination, site-wide.
        for old, new, what in [
            ('>Monthly · last Sunday · 5:30pm UK<', '>Where curiosity connects<', 'salons door'),
            ('>Beyond Belief · from 16 September<', '>Meditation for the curious<', 'sits door'),
            ('>Join us · John writes back himself<', '>Join the club<', 'the door'),
        ]:
            assert old in body, 'About %s line not found' % what
            body = body.replace(old, new, 1)

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
        for old, new, what in [
            ("You send a few lines about what's drawing you.",
             'You send a few lines about yourself.', 'step 01'),
            ('John replies himself, usually within a few days, and suggests a conversation.',
             'John replies, usually within a few days, and suggests a conversation.', 'step 02'),
            ("If there's a mutual yes during the call, you'll start receiving the relevant invitations.",
             "If it's a mutual yes, John sends you invitations when what you're interested in is happening.",
             'step 03'),
        ]:
            assert old in body, 'join %s not found' % what
            body = body.replace(old, new, 1)
        body = body.replace('onSubmit="{{ submit }}"', 'id="bc-form" novalidate')
        body = body.replace('onInput="{{ onName }}"', 'data-begin="1"')
        body = body.replace('onInput="{{ onEmail }}"', 'data-begin="1"')
        body = body.replace('style="{{ restStyle }}"', 'id="bc-rest"')
        body = body.replace('onClick="{{ toggleSalons }}"', 'data-chip="salons"')
        body = body.replace('onClick="{{ toggleSits }}"', 'data-chip="sits"')
        body = body.replace('style="{{ salonsStyle }}"', 'class="bc-chip"')
        body = body.replace('style="{{ sitsStyle }}"', 'class="bc-chip"')
        body = body.replace('style="{{ andStyle }}"', 'id="bc-and"')
        # Choosing Sits opens one more question: which Sit. Not required — leaving
        # both unpressed simply means "Sits in general", which is what most people
        # will mean. Appears the way "and" does, once Sits is on.
        anchor = '<button type="button" data-chip="sits" class="bc-chip">Sits</button></span>.</p>'
        assert anchor in body, 'the Sits chip is not where the sit-detail clause hangs'
        body = body.replace(anchor,
            '<button type="button" data-chip="sits" class="bc-chip">Sits</button></span>'
            # plain inline, not inline-flex: a flex box is unbreakable, so on a phone
            # it filled the line and orphaned the full stop onto the next one
            '<span id="bc-sitmore" data-on="0"> \u2014 '
            '<button type="button" data-chip="bb" class="bc-chip">Beyond Belief</button> '
            '<span style="font-size:0.9em;color:#43403A;">or</span> '
            '<button type="button" data-chip="next" class="bc-chip">whatever comes next</button>'
            '</span>.</p>', 1)
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
  /* The sit-detail clause is long enough to need to wrap, so it fades in where
     "and" slides — a max-width slide would force it onto one line and overflow. */
  #bc-sitmore{display:none;}
  #bc-sitmore[data-on="1"]{display:inline;animation:bc-sitmore-in 420ms cubic-bezier(.22,1,.36,1);}
  @keyframes bc-sitmore-in{from{opacity:0}to{opacity:1}}
  @media (prefers-reduced-motion:reduce){#bc-sitmore[data-on="1"]{animation:none;}}
  #bc-rest{display:grid;gap:clamp(6px,1.4vh,14px);opacity:0;transform:translateY(8px);pointer-events:none;
    transition:opacity 1.8s cubic-bezier(.22,1,.36,1) .25s,transform 1.8s cubic-bezier(.22,1,.36,1) .25s;}
  #bc-rest[data-on="1"]{opacity:1;transform:none;pointer-events:auto;}
  #bc-send{display:inline-flex;align-items:center;gap:12px;font-weight:700;font-size:min(12px,1.9vh);
    letter-spacing:0.16em;text-transform:uppercase;padding:clamp(12px,2.2vh,15px) 28px;background:#171916;
    color:#FFF7EE;border:1px solid #171916;cursor:pointer;opacity:0.35;transition:opacity .35s ease;}
  #bc-rest[data-on="1"] #bc-send,#bc-send[data-on="1"]{opacity:1;}

  /* First-visit intro. Whether to show it is decided by the small script in
     <head>, BEFORE first paint — arming it from the body script meant the page
     painted and the overlay then dropped over it, which read as a flash.
     Two independent guarantees that it can never strand the site:
       · default is dismissed, so a script that never runs shows the page;
       · when armed, bc-intro-guard fades it out on its own after 6s, so a
         script that dies part-way through the animation shows it too. */
  #bc-intro{position:absolute;inset:0;z-index:30;background:#FDFCF9;display:flex;align-items:center;
    justify-content:center;cursor:pointer;opacity:0;visibility:hidden;pointer-events:none;
    transition:opacity 550ms cubic-bezier(.22,1,.36,1),visibility 0s linear 550ms;}
  html[data-intro="1"] #bc-intro{opacity:1;visibility:visible;pointer-events:auto;
    animation:bc-intro-guard 6.5s linear forwards;}
  /* Explicit keyframes from 0, rather than a delayed fade: a delayed animation
     with fill:forwards does not reliably hold the un-animated value during its
     delay, and the overlay never appeared at all. */
  @keyframes bc-intro-guard{
    0%,92%{opacity:1;visibility:visible;pointer-events:auto;}
    100%{opacity:0;visibility:hidden;pointer-events:none;}}

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
  var DOOR = { salons: 'Where curiosity connects', sits: 'Meditation for the curious',
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


  // ---- the next Salon: last week of the month; September is a Wednesday ----
  var nextEl = document.getElementById('bc-next-salon');
  if (nextEl) {
    function londonOffset(ts) {
      var p = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .formatToParts(new Date(ts)).forEach(function (x) { p[x.type] = x.value; });
      var hh = p.hour === '24' ? 0 : +p.hour;
      return Date.UTC(+p.year, +p.month - 1, +p.day, hh, +p.minute) - ts;
    }
    function ukToUTC(y, m, d, hh, mm) {
      var g = Date.UTC(y, m, d, hh, mm);
      for (var i = 0; i < 3; i++) g = Date.UTC(y, m, d, hh, mm) - londonOffset(g);
      return g;
    }
    var septemberSalon = ukToUTC(2026, 8, 30, 19, 0);
    if (Date.now() < septemberSalon) {
      nextEl.textContent = 'The next Salon is Wednesday, September 30th, 7pm UK.';
    } else {
      nextEl.textContent = 'The next Salon will be in the last week of the month — date to be announced.';
    }
  }

  // ---- The Door: chips, progressive reveal, Formspree ----
  var form = document.getElementById('bc-form');
  if (form) {
    var state = { salons: false, sits: false, bb: false, next: false, sending: false };
    var rest = document.getElementById('bc-rest'), and = document.getElementById('bc-and'),
        send = document.getElementById('bc-send'), status = document.getElementById('bc-status'),
        sitmore = document.getElementById('bc-sitmore');
    [].forEach.call(form.querySelectorAll('[data-chip]'), function (b) {
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-chip');
        state[k] = !state[k];
        // 'Beyond Belief' and 'whatever comes next' are alternatives, not a pair
        if (state[k] && (k === 'bb' || k === 'next')) state[k === 'bb' ? 'next' : 'bb'] = false;
        // dropping Sits takes its follow-up question with it
        if (k === 'sits' && !state.sits) { state.bb = false; state.next = false; }
        [].forEach.call(form.querySelectorAll('[data-chip]'), function (c) {
          c.setAttribute('aria-pressed', state[c.getAttribute('data-chip')] ? 'true' : 'false');
        });
        if (and) and.setAttribute('data-on', (state.salons && state.sits) ? '1' : '0');
        if (sitmore) sitmore.setAttribute('data-on', state.sits ? '1' : '0');
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
          sit: state.sits ? (state.bb ? 'Beyond Belief' : state.next ? 'Whatever comes next' : 'No preference given')
                          : 'n/a',
          name: name, email: email, drawn: v('drawn'), found: v('found') || 'Not said' })
      }).then(function (r) {
        if (r.ok) say("Received, with thanks. We'll be in touch — until then, stay curious.");
        else { state.sending = false; say("That didn't send. Try again, or email john@spacetobe.xyz."); }
      }).catch(function () { state.sending = false; say("That didn't send. Try again, or email john@spacetobe.xyz."); });
    });
  }

  // ---- first-visit intro: the wordmark draws itself, then lands on the page ----
  // Armed in <head> before first paint; this only runs it and takes it down.
  var intro = document.getElementById('bc-intro');
  var root = document.documentElement;
  function endIntro(delay) {
    setTimeout(function () { root.removeAttribute('data-intro'); }, Math.min(delay, 2600));
  }
  if (intro) {
    if (root.getAttribute('data-intro') !== '1') { /* not a first visit here */ }
    else {
      try { sessionStorage.setItem('bc-intro-seen', '1'); } catch (e) {}
      intro.addEventListener('click', function () { root.removeAttribute('data-intro'); });
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

# The emitted script must parse. A stray apostrophe inside a single-quoted JS
# string once broke the whole shell silently; never again.
import subprocess, tempfile
_probe = tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8')
_probe.write(JS); _probe.close()
_check = subprocess.run(['node', '--check', _probe.name], capture_output=True, text=True)
os.unlink(_probe.name)
if _check.returncode != 0:
    raise SystemExit('BUILD FAILED — emitted JavaScript does not parse:\n' + _check.stderr)
print('js syntax: OK')

BODY = ('<div class="bc-shell" id="bc-shell">\n'
        + '\n'.join(layers) + '\n'
        + '<div id="bc-intro"><div id="bc-intro-mark" role="img" aria-label="Beings Club" '
          'style="width:min(760px,88vw);max-height:70vh;line-height:0;"></div></div>\n'
        + '</div>')

# Runs before anything paints, so the page is never shown and then covered.
ARM_INTRO = ('<script>/* Decide the first-visit intro before anything paints. If this fails,\n   the intro simply never shows and the page is visible — which is the safe way round. */\ntry{var d=document.documentElement;if(d.getAttribute("data-screen")==="home"&&!sessionStorage.getItem("bc-intro-seen")&&!matchMedia("(prefers-reduced-motion:reduce)").matches){d.setAttribute("data-intro","1");}}catch(e){}</script>\n')

# Screens that share better with their own artwork than with the house card.
# 1200x630, because both cards here are summary_large_image and anything squarer
# gets centre-cropped to that ratio by every platform anyway.
SOCIAL = {
    'beyondbelief': ('/assets/img/beyond-belief-social.jpg',
                     'Beyond Belief — a face in profile, saturated and rippling'),
}
SOCIAL_DEFAULT = ('/assets/social-preview.png', 'Beings Club')

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
<meta property="og:image" content="{o}{img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{alt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{o}{img}">
<meta name="twitter:image:alt" content="{alt}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Host+Grotesk:ital,wght@0,300..800;1,300..800&display=swap">
<link href="https://fonts.googleapis.com/css2?family=Host+Grotesk:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet">""".format(
        t=esc(title), d=esc(desc), o=ORIGIN, s=slug,
        img=SOCIAL.get(key, SOCIAL_DEFAULT)[0], alt=esc(SOCIAL.get(key, SOCIAL_DEFAULT)[1]))
    head = head.replace('<title>', ARM_INTRO + '<title>', 1)

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
