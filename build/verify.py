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

if "--live" in sys.argv:
    print("\nLIVE — " + ORIGIN)
    head = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    branch = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    ok("on the branch Pages serves (main)", branch == "main", "on '%s'" % branch)
    try:
        built = json.load(urllib.request.urlopen(
            "https://api.github.com/repos/beingwithjohn/beingsclub-com/pages/builds/latest"))
        ok("Pages built the current commit", built.get("commit") == head,
           "serving %s, local %s" % (str(built.get("commit"))[:7], head[:7]))
    except Exception as e:
        ok("Pages build status readable", False, str(e))

    for route in ROUTES:
        try:
            with urllib.request.urlopen(ORIGIN + route) as resp:
                body = resp.read().decode("utf-8", "replace")
                ok("GET " + route, resp.status == 200, str(resp.status))
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
