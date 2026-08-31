#!/usr/bin/env python3
"""Verify the site — locally, and optionally what is actually being served.

    python3 build/verify.py            # check the built files in this repo
    python3 build/verify.py --live     # also check https://beingsclub.com

Exists because a broken build once shipped: a syntax error in the emitted script
took every page down, and the deploy looked successful because nobody checked
that the commit Pages built was the commit we pushed.
"""
import io, os, re, sys, json, subprocess, tempfile, urllib.request

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = "https://beingsclub.com"
PAGES  = ["index.html", "about/index.html", "salons/index.html",
          "sits/index.html", "beyondbelief/index.html", "join/index.html"]
ROUTES = ["/", "/about/", "/salons/", "/sits/", "/beyondbelief/", "/join/"]

fails, checks = [], 0

def ok(name, cond, detail=""):
    global checks
    checks += 1
    if not cond:
        fails.append(name + (" — " + detail if detail else ""))
    print(("  ok   " if cond else "  FAIL ") + name + (("  " + detail) if detail and not cond else ""))

def script_of(html):
    # greedy prefix: there is also a small <script> in <head> now, and a lazy
    # match from the first one swallows the markup between them
    m = re.search(r"(?s).*<script>(.*?)</script>\s*</body>", html)
    return m.group(1) if m else ""

def head_script_of(html):
    m = re.search(r"(?s)<head>.*?<script>(.*?)</script>", html)
    return m.group(1) if m else ""

def js_parses(js):
    """The failure that took the site down. node is the only real arbiter."""
    if not js.strip():
        return False, "no script found"
    f = tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8")
    f.write(js); f.close()
    r = subprocess.run(["node", "--check", f.name], capture_output=True, text=True)
    os.unlink(f.name)
    return r.returncode == 0, r.stderr.strip().splitlines()[-1] if r.returncode else ""

def audit(html, label):
    js = script_of(html)
    good, err = js_parses(js)
    ok(label + ": script parses", good, err)
    # a dead script must never be able to hide the page. Two guarantees:
    # the overlay is shut by default, and even armed it times itself out in CSS.
    ok(label + ": intro is shut by default",
       '#bc-intro{' in html and 'opacity:0;visibility:hidden;pointer-events:none;' in html)
    ok(label + ": intro times itself out without JS",
       '@keyframes bc-intro-guard' in html and 'animation:bc-intro-guard' in html)
    # and it must be decided before first paint, or the page flashes then covers
    hgood, herr = js_parses(head_script_of(html))
    ok(label + ": intro decided in <head>",
       0 <= html.find('d.setAttribute("data-intro"') < html.find('<body>'))
    ok(label + ": the <head> script parses", hgood, herr)
    # the page must render its own screen without javascript
    ok(label + ": a layer is pre-activated", 'class="bc-layer" data-active="1"' in html)
    ok(label + ": no unresolved template holes", "{{" not in html)
    ok(label + ": no relative asset paths", 'url(\'assets/' not in html and 'src="assets/' not in html)
    ok(label + ": index previews are open",
       '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">' in html)
    ok(label + ": Google ownership marker is present",
       '<meta name="google-site-verification" content="R9A-mzN2zV4y6kUaLWKVq6W0wVo7KhnF9uYZFrnF-60">' in html)
    structured = re.search(r'(?s)<script type="application/ld\+json">(.*?)</script>', html)
    try:
        data = json.loads(structured.group(1)) if structured else None
        graph = data.get('@graph', []) if isinstance(data, dict) else []
        structured_ok = data.get('@context') == 'https://schema.org' and bool(graph)
    except Exception:
        structured_ok = False
    ok(label + ": structured data parses", structured_ok)
    node_types = {node.get('@type') for node in graph if isinstance(node, dict)}
    expected_types = {
        'index.html': {'WebSite', 'Organization', 'Person', 'WebPage'},
        'about/index.html': {'AboutPage', 'Person'},
        'salons/index.html': {'WebPage', 'Service'},
        'sits/index.html': {'WebPage', 'Service'},
        'beyondbelief/index.html': {'WebPage', 'Person', 'Course'},
        'join/index.html': {'ContactPage'},
    }
    ok(label + ": structured data names the page's real entities",
       expected_types.get(label, set()).issubset(node_types),
       "found: " + ", ".join(sorted(t for t in node_types if isinstance(t, str))))
    if label == 'beyondbelief/index.html':
        course = next((node for node in graph if isinstance(node, dict) and node.get('@type') == 'Course'), {})
        instance = course.get('hasCourseInstance', {})
        ok(label + ": course dates, format and free offer are machine-readable",
           instance.get('@type') == 'CourseInstance' and
           instance.get('courseMode') == 'online' and
           instance.get('startDate') == '2026-09-15' and
           instance.get('endDate') == '2026-10-20' and
           course.get('provider', {}).get('name') == 'Beings Club' and
           instance.get('offers', {}).get('price') == '0')
    if label == 'sits/index.html':
        ok(label + ": search description answers preference-led queries",
           'Small online meditation groups for curious people and sceptics' in html and
           'nothing asked as belief' in html)
    ok(label + ": inactive screens cannot become the Google snippet",
       html.count('class="bc-layer" data-nosnippet') == 5)
    active = re.search(r'(?s)<div class="bc-layer" data-active="1".*?(?=<div class="bc-layer"|<div id="bc-intro")', html)
    ok(label + ": active screen has one primary heading",
       bool(active) and active.group(0).count('<h1') == 1)
    if label == 'index.html':
        home = active.group(0) if active else ''
        ok(label + ": public threshold has the two intended actions",
           'data-leave-note="1"' in home and '>Leave a note</a>' in home and
           'data-member-login="1"' in home and '>Member login</a>' in home)
        ok(label + ": leave-a-note form is simple and connected",
           'data-threshold-form="1"' in home and
           all(('name="%s"' % field) in home for field in ('name', 'email', 'note')) and
           "fetch('https://formspree.io/f/xpqkbpyv'" in js)
        ok(label + ": member access is honestly held closed",
           'data-member-panel="1"' in home and
           'Member access is opening soon.' in home and
           'secure, invite-only access is built' in home and
           'type="password"' not in home)
        ok(label + ": public threshold does not expose the old programme map",
           all(('href="%s"' % route) not in home for route in ('/about/', '/salons/', '/sits/')))
    ok(label + ": retired overall care framing is absent",
       "We hold each other as precious" not in html and
       "When people hold each other as precious" not in html)
    ok(label + ": curiosity framing keeps the realisation wordplay",
       "things of value can be realised in reality" in html)
    ok(label + ": the definition leads into the two movements",
       "At Beings Club we define curiosity as" in html and
       'data-curiosity-lead="1"' in html and
       "Together, we explore two principles in curiosity." in html and
       "Curiosity holds the room" not in html)
    ok(label + ": curiosity has the two chosen movements",
       ">Curiosity connects</h2>" in html and ">Stay curious</h2>" in html)
    ok(label + ": curiosity movements use the chosen order",
       html.index(">Stay curious</h2>") < html.index(">Curiosity connects</h2>"))
    ok(label + ": discovery language is exact",
       "what is important reveals itself and curiosity itself can deepen" in html and
       "each other, fresh ideas and new futures" in html)
    ok(label + ": content navigation keeps the whole map visible",
       html.count('class="bc-nav-link"') == 20 and
       all(('href="%s"' % route) in html for route in ['/about/', '/salons/', '/sits/', '/join/']))
    ok(label + ": The Door is complete on arrival",
       '#bc-rest{display:grid' in html and 'opacity:1;transform:none;pointer-events:auto' in html and
       '#bc-send{display:inline-flex' in html and 'cursor:pointer;opacity:1' in html and
       'data-begin=' not in html)
    ok(label + ": timely details appear before the lower fact strips",
       html.count('data-next-salon="1"') == 2 and
       '15 Sept – 20 Oct · Tuesdays at 6:30pm UK' in html)
    ok(label + ": About includes supported host context",
       'class="bc-host-note"' in html and
       'John hosts every Salon and teaches every Sit' in html and
       'His work brings contemplative practice into curious, non-doctrinal spaces' in html and
       'He replies to every note himself' in html)
    ok(label + ": secondary links have a touch affordance",
       html.count('class="bc-secondary-link"') == 3)

print("LOCAL BUILD")
for p in PAGES:
    path = os.path.join(ROOT, p)
    if not os.path.exists(path):
        ok(p + ": exists", False); continue
    audit(io.open(path, encoding="utf-8").read(), p)

# the slug copies are generated; they must not have been hand-edited
before = {p: io.open(os.path.join(ROOT, p), encoding="utf-8").read() for p in PAGES if os.path.exists(os.path.join(ROOT, p))}
r = subprocess.run([sys.executable, os.path.join(ROOT, "build", "build_shell.py")],
                   capture_output=True, text=True, cwd=ROOT)
ok("generator runs clean", r.returncode == 0, r.stderr.strip()[-200:])
after = {p: io.open(os.path.join(ROOT, p), encoding="utf-8").read() for p in before}
drifted = [p for p in before if before[p] != after[p]]
ok("built files match the generator", not drifted, "hand-edited: " + ", ".join(drifted))

robots_path = os.path.join(ROOT, "robots.txt")
sitemap_path = os.path.join(ROOT, "sitemap.xml")
robots = io.open(robots_path, encoding="utf-8").read() if os.path.exists(robots_path) else ""
sitemap = io.open(sitemap_path, encoding="utf-8").read() if os.path.exists(sitemap_path) else ""
ok("robots.txt allows OAI search discovery",
   "User-agent: OAI-SearchBot\nAllow: /" in robots)
ok("robots.txt advertises the sitemap",
   "Sitemap: https://beingsclub.com/sitemap.xml" in robots)
indexnow_key = "7791d2e130943508e1eea9169ea2b217"
indexnow_path = os.path.join(ROOT, indexnow_key + ".txt")
indexnow_script = os.path.join(ROOT, "build", "notify_indexnow.py")
indexnow_source = io.open(indexnow_script, encoding="utf-8").read() if os.path.exists(indexnow_script) else ""
try:
    compile(indexnow_source, indexnow_script, "exec")
    indexnow_parses = bool(indexnow_source)
except Exception:
    indexnow_parses = False
ok("IndexNow ownership key is public and exact",
   os.path.exists(indexnow_path) and
   io.open(indexnow_path, encoding="utf-8").read().strip() == indexnow_key)
ok("IndexNow notifier parses and uses the public key",
   indexnow_parses and ('KEY = "' + indexnow_key + '"') in indexnow_source)
deploy_source = io.open(os.path.join(ROOT, "build", "deploy.sh"), encoding="utf-8").read()
ok("verified deploys notify participating search engines",
   'python3 build/notify_indexnow.py "${HEAD_SHA}^" "$HEAD_SHA"' in deploy_source)
public_urls = {ORIGIN + route for route in ROUTES + ["/practice-map/", "/giving/", "/beyondbelief/companion/"]}
listed_urls = set(re.findall(r"<loc>(https://[^<]+)</loc>", sitemap))
ok("sitemap lists every public canonical page", listed_urls == public_urls,
   "missing or extra: " + ", ".join(sorted(public_urls ^ listed_urls)))
dated_urls = dict(re.findall(r"<url><loc>(https://[^<]+)</loc><lastmod>(\d{4}-\d{2}-\d{2})</lastmod></url>", sitemap))
ok("sitemap gives every public page an accurate freshness signal",
   set(dated_urls) == public_urls and all(date <= '2026-08-25' for date in dated_urls.values()))
for archive in ["archive-refined.html", "archive-v4-dark-plates.html"]:
    archive_html = io.open(os.path.join(ROOT, archive), encoding="utf-8").read()
    ok(archive + ": excluded from search", '<meta name="robots" content="noindex,follow">' in archive_html)
companion = io.open(os.path.join(ROOT, "beyondbelief/companion/index.html"), encoding="utf-8").read()
companion_print = io.open(os.path.join(ROOT, "beyondbelief/companion/print/index.html"), encoding="utf-8").read()
ok("Beyond Belief companion has a canonical URL",
   '<link rel="canonical" href="https://beingsclub.com/beyondbelief/companion/">' in companion)
ok("Beyond Belief print view consolidates into its companion",
   '<meta name="robots" content="noindex,follow">' in companion_print and
   '<link rel="canonical" href="https://beingsclub.com/beyondbelief/companion/">' in companion_print)

# Pages outside the app shell (404, the Practice Map, Giving) wear the same header and
# footer. They are hand-maintained, so nothing but this check keeps them in step. Their
# complete nav has no current-page mark because none represents one of the four main doors.
STANDALONE = ["404.html", "practice-map/index.html", "giving/index.html"]

def chrome(html, tag):
    m = re.search(r"(?s)<%s.*?</%s>" % (tag, tag), html)
    return re.sub(r"\s+", " ", m.group(0)) if m else ""

def nav_chrome(html):
    return re.sub(r' aria-current="[^"]+"', '', chrome(html, "nav"))

shell = io.open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
navjs = os.path.join(ROOT, "assets", "navmark.js")
good, err = js_parses(io.open(navjs, encoding="utf-8").read()) if os.path.exists(navjs) else (False, "missing")
ok("assets/navmark.js parses", good, err)

for p in STANDALONE:
    path = os.path.join(ROOT, p)
    if not os.path.exists(path):
        ok(p + ": exists", False); continue
    html = io.open(path, encoding="utf-8").read()
    ok(p + ": header matches the shell", nav_chrome(html) == nav_chrome(shell))
    ok(p + ": footer matches the shell", chrome(html, "footer") == chrome(shell, "footer"))
    ok(p + ": wordmark hover wired up",
       'data-navmark' in html and '/assets/navmark.js' in html)
    ok(p + ": no relative asset paths",
       'url(\'assets/' not in html and 'src="assets/' not in html)
    if p != "404.html":
        ok(p + ": index previews are open",
           '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">' in html)
        structured = re.search(r'(?s)<script type="application/ld\+json">(.*?)</script>', html)
        try:
            structured_ok = bool(structured) and json.loads(structured.group(1)).get('@context') == 'https://schema.org'
        except Exception:
            structured_ok = False
        ok(p + ": structured data parses", structured_ok)

# The design keeps resting styles INLINE, and an inline declaration beats any
# ordinary stylesheet rule. A hover rule that sets a property the element also
# sets inline therefore does nothing — which is how a violet button came to have
# violet text on a violet background. Every such property must be !important.
def hover_conflicts(html):
    rules = {m.group(1): m.group(2) for m in re.finditer(r'\[data-vh="(\d)"\]:hover\{([^}]*)\}', html)}
    out = []
    for m in re.finditer(r'<[a-z]+\b[^>]*data-vh="(\d)"[^>]*>', html):
        tag, vh = m.group(0), m.group(1)
        st = re.search(r'style="([^"]*)"', tag)
        if not st:
            continue
        inline = {d.split(":")[0].strip() for d in st.group(1).split(";") if ":" in d}
        for decl in rules.get(vh, "").split(";"):
            if ":" not in decl:
                continue
            prop = decl.split(":")[0].strip()
            if prop in inline and "!important" not in decl:
                out.append("%s on data-vh=%s" % (prop, vh))
    return sorted(set(out))

for p_ in PAGES + STANDALONE:
    path = os.path.join(ROOT, p_)
    if not os.path.exists(path):
        continue
    c = hover_conflicts(io.open(path, encoding="utf-8").read())
    ok(p_ + ": hover always beats the inline style", not c, "; ".join(c))

if "--live" in sys.argv:
    print("\nLIVE — " + ORIGIN)
    head = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    branch = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    ok("on the branch Pages serves (main)", branch == "main", "on '%s'" % branch)
    ok("working tree committed", not subprocess.run(["git", "status", "--porcelain"],
       capture_output=True, text=True, cwd=ROOT).stdout.strip(), "uncommitted changes")

    # Do NOT ask the Pages API which commit is live: pages/builds is legacy, and it
    # has reported a stale commit for a deploy that was demonstrably already
    # serving. Compare the bytes instead — that is the thing we actually care about.
    def live(route):
        with urllib.request.urlopen(ORIGIN + route) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")

    for route, local in list(zip(ROUTES, PAGES)) + [("/practice-map/", "practice-map/index.html"),
                                                    ("/giving/", "giving/index.html"),
                                                    ("/" + indexnow_key + ".txt", indexnow_key + ".txt"),
                                                    ("/robots.txt", "robots.txt"),
                                                    ("/sitemap.xml", "sitemap.xml"),
                                                    ("/404.html", "404.html")]:
        try:
            status, body = live(route)
            ok("GET " + route, status == 200, str(status))
            want = io.open(os.path.join(ROOT, local), encoding="utf-8").read()
            ok(route + " serves the current build", body == want,
               "live differs from " + local)
            if route == "/":
                audit(body, "live /")
        except Exception as e:
            ok("GET " + route, False, str(e))
    try:
        urllib.request.urlopen(ORIGIN + "/no-such-page-xyz")
        ok("404 returns 404", False, "got 200")
    except urllib.error.HTTPError as e:
        ok("404 returns 404", e.code == 404, str(e.code))

print("\n%d checks, %d failed" % (checks, len(fails)))
if fails:
    print("\nFAILURES:")
    for f in fails: print("  · " + f)
    sys.exit(1)
print("all good")
