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
    m = re.search(r"(?s)<script>(.*?)</script>\s*</body>", html)
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
    # a dead script must never be able to hide the page
    ok(label + ": intro starts dismissed", 'id="bc-intro" data-off="1"' in html)
    # the page must render its own screen without javascript
    ok(label + ": a layer is pre-activated", 'class="bc-layer" data-active="1"' in html)
    ok(label + ": no unresolved template holes", "{{" not in html)
    ok(label + ": no relative asset paths", 'url(\'assets/' not in html and 'src="assets/' not in html)

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

# Pages outside the app shell (404, the Practice Map) wear the same header and
# footer. They are hand-maintained, so nothing but this check keeps them in step.
STANDALONE = ["404.html", "practice-map/index.html"]

def chrome(html, tag):
    m = re.search(r"(?s)<%s.*?</%s>" % (tag, tag), html)
    return re.sub(r"\s+", " ", m.group(0)) if m else ""

shell = io.open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
navjs = os.path.join(ROOT, "assets", "navmark.js")
good, err = js_parses(io.open(navjs, encoding="utf-8").read()) if os.path.exists(navjs) else (False, "missing")
ok("assets/navmark.js parses", good, err)

for p in STANDALONE:
    path = os.path.join(ROOT, p)
    if not os.path.exists(path):
        ok(p + ": exists", False); continue
    html = io.open(path, encoding="utf-8").read()
    ok(p + ": header matches the shell", chrome(html, "nav") == chrome(shell, "nav"))
    ok(p + ": footer matches the shell", chrome(html, "footer") == chrome(shell, "footer"))
    ok(p + ": wordmark hover wired up",
       'data-navmark' in html and '/assets/navmark.js' in html)
    ok(p + ": no relative asset paths",
       'url(\'assets/' not in html and 'src="assets/' not in html)

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
