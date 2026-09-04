#!/usr/bin/env python3
"""Verify the site — locally, and optionally what is actually being served.

    python3 build/verify.py            # check the built files in this repo
    python3 build/verify.py --live     # also check https://beingsclub.com

Exists because a broken build once shipped: a syntax error in the emitted script
took every page down, and the deploy looked successful because nobody checked
that the commit Pages built was the commit we pushed.
"""
import io, os, re, sys, json, struct, subprocess, tempfile, urllib.request

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = "https://beingsclub.com"
PAGES = ["index.html"]
EVENT_PAGE = "events/index.html"
REDIRECT_PAGES = {
    "about/index.html": "https://beingsclub.com/#about",
    "salons/index.html": "https://beingsclub.com/#salon",
    "join/index.html": "https://beingsclub.com/#membership",
    "sits/index.html": "https://spacetobe.xyz/beyond-belief/",
    "beyondbelief/index.html": "https://spacetobe.xyz/beyond-belief/",
    "beyondbelief/companion/index.html": "https://spacetobe.xyz/beyond-belief/companion/",
    "beyondbelief/companion/print/index.html": "https://spacetobe.xyz/beyond-belief/companion/print/",
    "practice-map/index.html": "https://spacetobe.xyz/practice-map/",
}
GENERATED_PAGES = PAGES + [EVENT_PAGE] + list(REDIRECT_PAGES)
ROUTES = ["/", "/events/"]

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
    ok(label + ": warm intro paper matches the revealed page",
       bool(re.search(r'#bc-intro\{[^}]*background:#FDFCF9;', html)) and
       'body{margin:0;overflow:hidden;background:#FDFCF9;' in html and
       '.bc-shell{position:relative;height:100svh;overflow:hidden;background:#FDFCF9;}' in html and
       'id="bc-app-public-scroll" style="position:absolute;inset:0;overflow-y:auto;background:#FDFCF9;' in html and
       'background:#FFFFFF' not in html)
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
    expected_types = {'index.html': {'WebSite', 'Organization', 'Person', 'WebPage'}}
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
    ok(label + ": Salons name the opening as guided curiosity practice",
       "guided curiosity practice" in html and
       "Every Salon begins with meditation" not in html and
       "starts with meditation" not in html and
       "guided meditation practice" not in html and
       "I've never meditated" not in html)
    if label == 'index.html':
        home = active.group(0) if active else ''
        ok(label + ": the Beings Club logo has no information hover",
           'data-public-logo' not in home and 'data-logo-pop' not in home)
        ok(label + ": public threshold matches the supplied app actions",
           'href="/members/"' in home and '>login</a>' in home and
           'href="/members/?join=1"' in home and '>join</a>' in home and
           'href="/events/"' in home and '>public events ↗</a>' in home)
        ok(label + ": the closing invitation repeats all three public actions",
           'data-note-actions="foot"' in home and
           home.count('>login</a>') >= 2 and home.count('>join</a>') >= 2 and
           home.count('>public events ↗</a>') >= 2)
        ok(label + ": supplied leave-a-note forms are connected",
           'data-note-form="top"' in home and 'data-note-form="foot"' in home and
           all(('name="%s"' % field) in home for field in ('name', 'email', 'note')) and
           "fetch('https://formspree.io/f/xpqkbpyv'" in js)
        ok(label + ": member access uses the private email-code entrance",
           'href="/members/"' in home and 'href="/members/?join=1"' in home and
           'data-login-panel="1"' not in home and
           'type="password"' not in home)
        ok(label + ": public threshold does not expose the old programme map",
           all(('href="%s"' % route) not in home for route in ('/about/', '/salons/', '/sits/')))
        ok(label + ": John is present in his own words before the closing invitation",
           'id="john" class="bc-john-letter"' in home and
           'src="/assets/img/john-letter.jpeg"' in home and
           'John · host of Beings Club' in home and
           'I’ve been hosting Beings Club since January 2025' in home and
           'href="https://spacetobe.xyz"' in home and
           'href="https://j-hn.info"' in home and
           'href="https://x.com/beingwithjohn"' in home and
           'href="https://instagram.com/beingwithjohn"' in home and
           'href="https://wonderfool.substack.com"' in home and
           home.find('id="john"') < home.find('data-note-actions="foot"'))
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
    if label == "index.html":
        ok(label + ": public introduction defines curiosity",
           'data-home-curiosity-definition="1"' in html and
           "Beings Club defines curiosity as an orientation to experience that is open to discovery." in html)
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
before = {p: io.open(os.path.join(ROOT, p), encoding="utf-8").read() for p in GENERATED_PAGES if os.path.exists(os.path.join(ROOT, p))}
r = subprocess.run([sys.executable, os.path.join(ROOT, "build", "build_shell.py")],
                   capture_output=True, text=True, cwd=ROOT)
ok("generator runs clean", r.returncode == 0, r.stderr.strip()[-200:])
after = {p: io.open(os.path.join(ROOT, p), encoding="utf-8").read()
         for p in GENERATED_PAGES if os.path.exists(os.path.join(ROOT, p))}
drifted = [p for p in before if before[p] != after[p]]
ok("built files match the generator", not drifted, "hand-edited: " + ", ".join(drifted))
ok("generator emits every public and compatibility page",
   set(after) == set(GENERATED_PAGES),
   "missing: " + ", ".join(sorted(set(GENERATED_PAGES) - set(after))))
home_html = after.get("index.html", "")
social_preview = os.path.join(ROOT, "assets", "social-preview.png")
try:
    with open(social_preview, "rb") as image_file:
        signature = image_file.read(24)
    social_preview_size = struct.unpack(">II", signature[16:24]) if signature[:8] == b"\x89PNG\r\n\x1a\n" else None
except (OSError, struct.error):
    social_preview_size = None
ok("the homepage shares as a complete large social card",
   '<link rel="canonical" href="https://beingsclub.com/">' in home_html and
   '<meta property="og:title" content="Beings Club — a realisationhouse for the curious">' in home_html and
   '<meta property="og:url" content="https://beingsclub.com/">' in home_html and
   '<meta property="og:image" content="https://beingsclub.com/assets/social-preview.png">' in home_html and
   '<meta property="og:image:width" content="1200">' in home_html and
   '<meta property="og:image:height" content="630">' in home_html and
   '<meta name="twitter:card" content="summary_large_image">' in home_html and
   '<meta name="twitter:image" content="https://beingsclub.com/assets/social-preview.png">' in home_html and
   social_preview_size == (1200, 630))
ok("the Club social identities are consistent across links and structured data",
   home_html.count('https://instagram.com/beings_club') >= 1 and
   home_html.count('https://x.com/beings_club') >= 1 and
   'https://instagram.com/beingwithjohn' in home_html and
   'https://x.com/beingwithjohn' in home_html and
   'https://wonderfool.substack.com' in home_html)
ok("public controls keep visible focus and mobile-sized primary actions",
   ':where(a,button,input,textarea,select):focus-visible{outline:2px solid #5A4B7C' in after.get("index.html", "") and
   '#s-home [data-m="btnrow"] a,#bc-door button[type="submit"]{min-height:44px' in after.get("index.html", "") and
   '#A5A198' not in after.get("index.html", ""))
events_html = after.get(EVENT_PAGE, "")
ok("public events page wraps the live Coliven list in Beings Club chrome",
   '<link rel="canonical" href="https://beingsclub.com/events/">' in events_html and
   '<h1>Public <strong>events</strong>.</h1>' in events_html and
   'src="https://coliven.com/embed/community/beingsclub?layout=list&amp;theme=light"' in events_html and
   '<script src="https://coliven.com/embed.js" async></script>' in events_html and
   'frame-src https://coliven.com' in events_html and
   'data-navmark="1"' in events_html and
   '<script src="/assets/navmark.js?v=' in events_html and ' defer></script>' in events_html)

for path, destination in REDIRECT_PAGES.items():
    html = after.get(path, "")
    ok(path + ": preserves the retired address with a safe move",
       '<meta name="robots" content="noindex,follow">' in html and
       ('<link rel="canonical" href="' + destination + '">') in html and
       'location.replace(' in html and
       ('href="' + destination + '"') in html)

# The members area is intentionally absent from the public sitemap, but its
# static client still needs the same generated-source and parse guarantees.
MEMBER_FILES = ["members/index.html", "members/host/index.html",
                "members/app.css", "members/app.js", "members/host.js"]
members_before = {
    p: io.open(os.path.join(ROOT, p), encoding="utf-8").read()
    for p in MEMBER_FILES if os.path.exists(os.path.join(ROOT, p))
}
member_build = subprocess.run(["node", os.path.join(ROOT, "members-app", "app", "build.js")],
                              capture_output=True, text=True, cwd=ROOT)
ok("members app generator runs clean", member_build.returncode == 0,
   member_build.stderr.strip()[-200:])
members_after = {
    p: io.open(os.path.join(ROOT, p), encoding="utf-8").read()
    for p in MEMBER_FILES if os.path.exists(os.path.join(ROOT, p))
}
ok("members app has every generated file", set(members_after) == set(MEMBER_FILES))
ok("members files match the generator", members_before == members_after,
   "run node members-app/app/build.js")
for member_page in ["members/index.html", "members/host/index.html"]:
    html = members_after.get(member_page, "")
    ok(member_page + ": kept out of search", 'name="robots" content="noindex,nofollow,noarchive"' in html)
    ok(member_page + ": only approved API is connectable",
       "connect-src https://practice-log.beingsclub.workers.dev" in html)
    ok(member_page + ": has no inline executable script", "window.BC_MEMBERS_API" not in html)
    ok(member_page + ": carries the Beings Club browser and home-screen icons",
       'rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png"' in html and
       'rel="icon" type="image/png" sizes="512x512" href="/assets/favicon-512.png"' in html and
       'rel="apple-touch-icon" sizes="180x180" href="/assets/favicon-180.png"' in html)
for member_script in ["members/app.js", "members/host.js"]:
    good, err = js_parses(members_after.get(member_script, ""))
    ok(member_script + ": parses", good, err)
host_html = members_after.get("members/host/index.html", "")
ok("private host page keeps the supplied Host tools design",
   "Host <strong>tools</strong>." in host_html and ">members</h2>" in host_html and
   "Only hosts see this page" in host_html and "add + invite" in host_html)
ok("adding a member sends one visible, retryable invitation",
   "sends one personal invitation from Beings Club" in host_html and
   "state === 'on_list' ? 'on list' : state" in members_after.get("members/host.js", "") and
   "resend invite" in members_after.get("members/host.js", ""))
ok("Notion invitations are reviewed, personalised and sent one person at a time",
   'id="notion-invite-check"' in host_html and
   'id="notion-invite-send"' not in host_html and
   "confirmation: 'INVITE NOTION MEMBER'" in members_after.get("members/host.js", "") and
   "invitationNote: note.value" in members_after.get("members/host.js", "") and
   "sessionStorage.setItem(key, value)" in members_after.get("members/host.js", "") and
   "Reboot Invite Sent?" in open(
       os.path.join(ROOT, "practice-log/src/club/notion-members.js"), encoding="utf-8"
   ).read())
ok("individual member invitations can preserve a personal note from John",
   'id="invite-note"' in host_html and
   'invitationNote: note.value' in members_after.get("members/host.js", "") and
   'personalInvitationNote' in open(
       os.path.join(ROOT, "practice-log/src/mail/send.js"), encoding="utf-8"
   ).read() and
   'invitation_note' in open(
       os.path.join(ROOT, "practice-log/src/club/index.js"), encoding="utf-8"
   ).read())
ok("host can name an invitee and preview the exact invitation without sending",
   'id="invite-name"' in host_html and
   'id="invite-preview"' in host_html and
   'id="invitation-preview"' in host_html and
   "/api/club/host/members/invitation-preview" in members_after.get("members/host.js", "") and
   "clubInvitationEmail({\n    name,\n    personalNote,\n    actionUrl:" in open(
       os.path.join(ROOT, "practice-log/src/club/index.js"), encoding="utf-8"
   ).read())
ok("first-conversation cards show the collected name above the email",
   "prospect.name || prospect.email" in members_after.get("members/host.js", "") and
   "if (prospect.name) main.append(text('span', '', prospect.email))" in members_after.get("members/host.js", ""))
prospect_archive_migration = open(
    os.path.join(ROOT, "practice-log", "members-migrations", "0017_prospect_archive.sql"),
    encoding="utf-8",
).read()
ok("first conversations leave the working queue when cancelled, granted or dismissed",
   "p.granted_at IS NULL AND p.archived_at IS NULL" in open(
       os.path.join(ROOT, "practice-log", "src", "club", "prospects.js"), encoding="utf-8"
   ).read() and
   "p.booking_status IS NULL OR p.booking_status != 'cancelled'" in open(
       os.path.join(ROOT, "practice-log", "src", "club", "prospects.js"), encoding="utf-8"
   ).read() and
   "ALTER TABLE prospect ADD COLUMN archived_at" in prospect_archive_migration and
   "remove from queue" in members_after.get("members/host.js", "") and
   "/prospects/${prospect.id}/dismiss" in members_after.get("members/host.js", ""))
ok("host controls keep drafting, publishing and email as separate actions",
   'id="salon-plan-list"' in host_html and 'id="add-salon"' in host_html and
   "saveSalonEditor" in members_after.get("members/host.js", "") and
   "publishSalonEditor" in members_after.get("members/host.js", "") and
   "announceSalonEditor" in members_after.get("members/host.js", "") and
   "salon.status !== 'published'" in members_after.get("members/host.js", ""))
ok("host can safely delete an upcoming Salon or announce it to later members",
   "deleteSalonEditor" in members_after.get("members/host.js", "") and
   "announceSalonEditor" in members_after.get("members/host.js", "") and
   "call('/api/club/host/salon/delete'" in members_after.get("members/host.js", "") and
   'Each person receives this announcement once.' in members_after.get("members/host.js", "") and
   '@media(max-width:720px)' in members_after.get("members/app.css", "") and
   '.clock{display:none}' in members_after.get("members/app.css", ""))
ok("host publishing offers automatic Zoom creation with a manual fallback",
   'Zoom join link · optional fallback' in members_after.get("members/host.js", "") and
   'Leave this blank for a fresh Zoom meeting' in members_after.get("members/host.js", "") and
   "zoom.type = 'url'" in members_after.get("members/host.js", "") and
   "zoom.placeholder = autoZoom ? 'Created automatically when you publish'" in members_after.get("members/host.js", ""))
ok("host can plan several Salons ahead while retaining completed gatherings",
   'Prepare several Salons in advance' in host_html and 'plan another Salon' in host_html and
   'closeSalonEditor' in members_after.get("members/host.js", "") and
   'The completed Salon is kept with its RSVPs and Field Notes.' in members_after.get("members/host.js", ""))
ok("host can open attendee-only Field Note invitations and moderate the archive",
   'id="attendance-list"' in host_html and 'id="open-field-note-invitations"' in host_html and
   'id="host-field-note-archive"' in host_html and
   'email arrives once where enabled' in host_html)
ok("host testimonial queue is editorial and never auto-publishes",
   'id="testimonial-queue"' in host_html and 'Copy what you want to use' in host_html and
   'Nothing here generates a notification' in host_html)
login_html = members_after.get("members/index.html", "")
ok("member login distinguishes access and hands non-members to joining",
   'autocomplete="one-time-code"' in login_html and 'type="password"' not in login_html and
   "A six-digit code is on its way to <span id=\"email-shown\"></span>" in login_html and
   "That email isn’t on the member list." in members_after.get("members/app.js", "") and
   "preview === 'login-error'" in members_after.get("members/app.js", "") and
   "sessionStorage.setItem(JOIN_EMAIL_KEY, emailAddress)" in members_after.get("members/app.js", "") and
       '<a href="/members/?join=1">Membership begins with a conversation</a>' in login_html)
ok("prospective members see a native Beings Club calendar rather than an embed",
   'id="prospect-timezone-search"' in login_html and 'id="prospect-days"' in login_html and
   'id="prospect-time-list"' in login_html and 'id="prospect-booking-form"' in login_html and
   login_html.count('<iframe') == 1 and 'app.cal.com' not in login_html and
   'frame-src https://coliven.com' in login_html and
   "prospectCall(`/api/club/prospect/slots?${query}`)" in members_after.get("members/app.js", "") and
   "prospectCall('/api/club/prospect/booking'" in members_after.get("members/app.js", ""))
ok("the mobile first-conversation page remains vertically scrollable",
   ".prospect-page{position:absolute;inset:0;overflow-y:auto" in members_after.get("members/app.css", "") and
   ".prospect-page{position:relative;inset:auto" not in members_after.get("members/app.css", ""))
ok("timezone search understands place names and seasonal acronyms",
   'role="combobox"' in login_html and 'id="prospect-timezone-results" role="listbox"' in login_html and
   "timezoneAbbreviation(zone, new Date(Date.UTC(year, 0, 15, 12)))" in members_after.get("members/app.js", "") and
   "timezoneAbbreviation(zone, new Date(Date.UTC(year, 6, 15, 12)))" in members_after.get("members/app.js", "") and
   "aliases.includes(query)" in members_after.get("members/app.js", ""))
ok("member surfaces keep one uninterrupted warm paper",
   "--paper:#FDFCF9" in members_after.get("members/app.css", "") and
   "--soft:#75726A" in members_after.get("members/app.css", "") and
   "background:#FFF" not in members_after.get("members/app.css", "") and
   "background:#FFFFFF" not in members_after.get("members/app.css", ""))
ok("member mobile controls keep the viewport and keyboard focus usable",
   "height:100dvh" in members_after.get("members/app.css", "") and
   ":focus-visible{outline:2px solid var(--violet)" in members_after.get("members/app.css", "") and
   'aria-controls="mobile-menu"' in login_html and 'aria-controls="mobile-menu"' in host_html and
   'aria-label="Members area"' in login_html and 'aria-label="Members area"' in host_html and
   "menuClose.focus()" in members_after.get("members/app.js", "") and
   "event.key === 'Escape'" in members_after.get("members/app.js", "") and
   "event.key === 'Escape'" in members_after.get("members/host.js", ""))
ok("member and host greeting names stay lowercase",
   "toLocaleLowerCase('en-GB')" in members_after.get("members/app.js", "") and
   "`good ${greeting}, john`" in members_after.get("members/host.js", "") and
   "good evening, john" in host_html)
ok("quiet email mode is conveyed to keyboard and screen-reader users",
   "salonOptions.setAttribute('aria-disabled', String(quiet))" in members_after.get("members/app.js", "") and
   "fieldNoteRow.setAttribute('aria-disabled', String(quiet))" in members_after.get("members/app.js", "") and
   "document.getElementById(id).disabled = quiet" in members_after.get("members/app.js", ""))
ok("first entry carries a concise, versioned member agreement",
   'id="welcome-page"' in login_html and 'id="agreement-form"' in login_html and
   'data-welcome-step="3"' in login_html and
   'Bring your curiosity.' in login_html and
   'Curiosity is an orientation to experience that is open to discovery.' in login_html and
   'Keep people’s confidence.' in login_html and
   'Let connection stay free.' in login_html and
   'You can leave at any time.' in login_html and
   'id="agreement-check" name="agreement" type="checkbox" required' in login_html and
   'I agree to these principles.' in login_html and
   'id="agreement-version" type="hidden" value="2026-09-01"' in login_html)
ok("the required principles, profile and Salon email choices sit inside the eight-part welcome",
   'id="welcome-page"' in login_html and login_html.count('data-welcome-step=') == 8 and
   'Curiosity</strong> connects.' in login_html and
   'Curiosity connects us to ourselves, to each other, and to what is possible.' in login_html and
   'The <strong>Salon</strong> is the heart of it.' in login_html and
   'guided curiosity practice' in login_html and
   'data-welcome-step="4"' in login_html and
   'id="welcome-profile-image-input"' in login_html and
   'id="welcome-profile-line"' in login_html and
   'id="welcome-profile-website"' in login_html and
   'id="welcome-profile-later"' in login_html and
   login_html.rfind('</section>') < login_html.find('<dialog class="profile-cropper"') and
   'data-welcome-step="5"' in login_html and
   'id="welcome-salon-heading"' in login_html and
   'data-welcome-step="6"' in login_html and
   'id="welcome-email-form"' in login_html and
   'By default, everyone receives the announcement and a note one week before.' in login_html and
   'only sent after you say I’m in' in login_html and
   'Freely <strong>offered</strong>.' in login_html and
   "await enter(data.member, { welcomeStep: 4 })" in members_after.get("members/app.js", "") and
   "submitWelcomeProfile" in members_after.get("members/app.js", "") and
   "showWelcome(5)" in members_after.get("members/app.js", "") and
   "if (!member?.agreementAccepted && welcomeStep < 3)" in members_after.get("members/app.js", ""))
ok("member landing is Salon-first in the supplied dashboard language",
   'class="member-nav"' in login_html and 'a note from John' in login_html and
   'guided curiosity practice' in login_html and 'data-rsvp="in"' in login_html and
   'data-rsvp="not_this_time"' in login_html and 'id="calendar-link"' in login_html and
   'id="member-host-link"' in login_html)
ok("next Salon time explicitly switches between local and UK time",
   'id="time-local"' in login_html and '>your local time</button>' in login_html and
   'id="time-uk"' in login_html and '>UK time</button>' in login_html and
   "localButton.classList.toggle('is-active', !showClubTime)" in members_after.get("members/app.js", "") and
   "ukButton.classList.toggle('is-active', showClubTime)" in members_after.get("members/app.js", ""))
ok("Field Notes are grouped by Salon and cannot become a response feed",
   'id="field-note-archive"' in login_html and 'id="field-note-composer"' in login_html and
   'data-member-view="field-notes"' in login_html and
   'There are no responses, reactions or comments' in login_html and
   'Nobody can respond.' in login_html)
ok("member Giving integrates financial support and one quiet testimonial each month",
   'data-member-view="giving"' in login_html and 'id="testimonial-form"' in login_html and
   'id="financial-giving-form"' in login_html and 'id="member-give"' in login_html and
   'id="member-giving-manage"' in login_html and 'href="/giving/"' not in login_html and
   'id="member-monthly-giving"' in login_html and 'Monthly giving is active.' in login_html and
   'Thank you for helping keep Beings Club freely offered.' in login_html and
   'Thank you. Your gift has been received.' in login_html and
   "call('/api/club/giving/checkout'" in members_after.get("members/app.js", "") and
   "monthlyGiving?.active === true" in members_after.get("members/app.js", "") and
   'once each calendar month' in login_html and
   'we won’t notify or remind you' in login_html and
   'on its website, emails and social channels' in login_html and
   'lightly edited or excerpted without changing their meaning' in login_html and
   'href="https://instagram.com/beings_club"' in login_html and
   'href="https://x.com/beings_club"' in login_html and
   'Following and sharing Beings Club is another way to support.' in login_html and
   'id="testimonial-edit"' in login_html and 'id="testimonial-withdraw"' in login_html)
ok("test-mode monthly gifts cannot masquerade as live subscriptions",
   "status NOT IN ('canceled', 'incomplete_expired', 'test_mode')" in open(
       os.path.join(ROOT, "practice-log/src/giving.js"), encoding="utf-8"
   ).read() and
   "status = 'test_mode'" in open(
       os.path.join(ROOT, "practice-log/src/giving.js"), encoding="utf-8"
   ).read() and
   'created in Stripe test mode' in members_after.get("members/app.js", ""))
ok("the next Salon uses a direct RSVP action",
   'class="rsvp-button" data-rsvp="in" type="button">RSVP</button>' in login_html)
ok("sharing a Field Note ends with a quiet route into giving",
   'id="field-note-thanks"' in login_html and
   'Help keep the door open.' in login_html and
   'If the Salon was valuable' in login_html and
   'href="#giving" data-member-view="giving">support Beings Club</a>' in login_html and
   'fieldNoteThanks = !wasEditing' in members_after.get("members/app.js", ""))
ok("member directory is contextual rather than social infrastructure",
   'data-member-view="members"' in login_html and 'id="directory-grid"' in login_html and
   'Members mostly meet each other through Salons. This page offers a little more context.' in login_html and
   'member count' not in login_html.lower())
ok("member directory opens randomly and reshuffles with bounded motion",
   "function shuffledDirectoryOrder(people, moveFirst = false)" in members_after.get("members/app.js", "") and
   "const directoryOpening = directory && directoryPage.hidden" in members_after.get("members/app.js", "") and
   "directoryOrder = shuffledDirectoryOrder(orderedDirectoryMembers())" in members_after.get("members/app.js", "") and
   "card.dataset.memberId = String(person.id)" in members_after.get("members/app.js", "") and
   "card.animate([" in members_after.get("members/app.js", "") and
   "((index * 37) % 11) * 16" in members_after.get("members/app.js", "") and
   "prefers-reduced-motion: reduce" in members_after.get("members/app.js", "") and
   ".directory-name-row" in members_after.get("members/app.css", "") and
   "nameRow.append(makeText('span', 'directory-you', 'you'))" in members_after.get("members/app.js", ""))
ok("the original ambient member drawer complements the full directory",
   'id="directory-randomise"' in login_html and 'randomise order ↻' in login_html and
   'id="members-drawer"' in login_html and 'id="members-drawer-minimise"' in login_html and
   'id="members-drawer-resize"' in login_html and 'open the members page →' in login_html and
   "function randomiseDirectory()" in members_after.get("members/app.js", "") and
   "const drawerVisible = name === 'salon';" in members_after.get("members/app.js", "") and
   "let membersDrawerMode = 'minimised'" in members_after.get("members/app.js", "") and
   'class="members-drawer is-minimised"' in login_html and
   "button.addEventListener('mouseenter', show); button.addEventListener('focus', show);" in members_after.get("members/app.js", ""))
ok("member profile requires only a chosen name",
   'data-member-view="profile"' in login_html and 'id="profile-form"' in login_html and
   'id="profile-name"' in login_html and 'required' in login_html and
   'Nothing links back to you unless you put it there' in login_html and
   'This is never shown to other members' in login_html and
   'id="profile-cropper"' in login_html and 'id="profile-crop-canvas"' in login_html and
   "toDataURL('image/jpeg', 0.9)" in members_after.get("members/app.js", ""))
ok("in-person navigation opens an honest page backed by host publishing",
   'data-member-view="in-person"' in login_html and 'id="in-person-page"' in login_html and
   'In-person <strong>happenings</strong>.' in login_html and
   'id="in-person-events"' in login_html and 'id="in-person-event-host"' in host_html and
   "call('/api/club/in-person')" in members_after.get("members/app.js", "") and
   "call('/api/club/host/in-person')" in members_after.get("members/host.js", "") and
   'The next in-person happening will appear here when it is ready.' in login_html and
   login_html.count('href="#public" data-member-view="public"') >= 2 and
   host_html.count('href="/members/#public"') >= 2)
ok("public events have a separate member-area page while the public route stays open",
   'id="public-events-page"' in login_html and
   '<h1>Public <strong>events</strong>.</h1>' in login_html and
   'src="https://coliven.com/embed/community/beingsclub?layout=list&amp;theme=light"' in login_html and
   'sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"' in login_html and
   'frame-src https://coliven.com' in login_html and
   "'#public': 'public'" in members_after.get("members/app.js", "") and
   "document.getElementById('public-events-page').hidden = !publicEvents" in members_after.get("members/app.js", "") and
   '.public-events-content' in members_after.get("members/app.css", ""))
ok("member Settings carries every Salon timing, welcome replay and quiet-email language",
   'data-member-view="settings"' in login_html and 'id="settings-page"' in login_html and
   'id="email-salon-announced"' in login_html and 'id="email-salon-month"' in login_html and
   'id="email-salon-week"' in login_html and 'id="email-salon-day"' in login_html and
   'id="email-salon-hour"' in login_html and 'id="email-field-notes"' in login_html and
   'id="onboarding-replay"' in login_html and
   'Quiet, for now' in login_html and 'Access codes still arrive when you ask for one' in login_html)
ok("leaving lets members decide what happens to existing Field Notes",
   'value="keep_signed"' in login_html and 'value="anonymise"' in login_html and
   'value="remove"' in login_html and 'Any testimonial awaiting consideration is withdrawn' in login_html and
   'id="leave-confirm"' in login_html)
field_notes_api = io.open(os.path.join(ROOT, "practice-log", "src", "club", "field-notes.js"),
                          encoding="utf-8").read()
ok("anonymous Field Notes remain attributable only through host tools",
   'anonymous && !host ? null' in field_notes_api and
   'anonymousToMembers: anonymous && host' in field_notes_api and
   'member_id = ?2' in field_notes_api)
testimonial_api = io.open(os.path.join(ROOT, "practice-log", "src", "club", "testimonials.js"),
                          encoding="utf-8").read()
ok("testimonials create no notification or automatic public placement",
   'sendClub' not in testimonial_api and 'sendField' not in testimonial_api and
   "status = 'pending'" in testimonial_api and 'public-any-channel-light-edit-v1' in testimonial_api)
profiles_api = io.open(os.path.join(ROOT, "practice-log", "src", "club", "profiles.js"),
                       encoding="utf-8").read()
ok("directory includes only active members with a chosen name",
   'joined_at IS NOT NULL' in profiles_api and 'disabled_at IS NULL' in profiles_api and
   'left_at IS NULL' in profiles_api and "TRIM(display_name) <> ''" in profiles_api)
directory_shape = profiles_api.split('function shapeDirectoryMember', 1)[1]
ok("directory never exposes another member email or image storage key",
   'email:' not in directory_shape and 'profile_image:' not in directory_shape and
   'hasImage:' in directory_shape)
settings_api = io.open(os.path.join(ROOT, "practice-log", "src", "club", "settings.js"),
                       encoding="utf-8").read()
mailer_api = io.open(os.path.join(ROOT, "practice-log", "src", "club", "mailer.js"),
                     encoding="utf-8").read()
zoom_api = io.open(os.path.join(ROOT, "practice-log", "src", "club", "zoom.js"),
                   encoding="utf-8").read()
agreement_api = io.open(os.path.join(ROOT, "practice-log", "src", "club", "agreement.js"),
                        encoding="utf-8").read()
club_router = io.open(os.path.join(ROOT, "practice-log", "src", "club", "index.js"),
                      encoding="utf-8").read()
prospects_api = io.open(os.path.join(ROOT, "practice-log", "src", "club", "prospects.js"),
                        encoding="utf-8").read()
mail_api = io.open(os.path.join(ROOT, "practice-log", "src", "mail", "send.js"),
                   encoding="utf-8").read()
salons_api = io.open(os.path.join(ROOT, "practice-log", "src", "club", "salons.js"),
                     encoding="utf-8").read()
ok("native calendar availability and booking stay behind the prospective-member session",
   "path === '/api/club/prospect/slots'" in club_router and
   "path === '/api/club/prospect/booking'" in club_router and
   "https://api.cal.com${path}" in prospects_api and
   "Never trust a start supplied by the browser" in prospects_api and
   "bookingUidToReschedule" in prospects_api and
   "CAL_SLOTS_API_VERSION = '2024-09-04'" in prospects_api and
   "CAL_BOOKINGS_API_VERSION = '2026-02-25'" in prospects_api and
   "authorization: `Bearer ${env.CAL_API_KEY}`" in prospects_api)
ok("member invitation delivery is recorded and retryable server-side",
   "sendClubInvitation" in club_router and
   "issueMemberWelcomeLink" in club_router and
   "private link that logs you into your account" in mail_api and
   "/members\\/(\\d+)\\/invite" in club_router and
   "invitation_sent_at" in club_router and
   "idempotencyKey: `club-member-${id}-${invitationVersion}`" in club_router)
ok("member-facing email buttons use private one-use entrances",
   "issueMemberAccessLink" in open(
       os.path.join(ROOT, "practice-log/src/club/field-notes.js"), encoding="utf-8"
   ).read() and
   "actionUrl" in open(
       os.path.join(ROOT, "practice-log/src/club/field-notes.js"), encoding="utf-8"
   ).read() and
   "issueMemberAccessLink" in open(
       os.path.join(ROOT, "practice-log/src/club/mailer.js"), encoding="utf-8"
   ).read())
ok("granting a prospective member sends one retry-safe welcome",
   "sendClubWelcome" in prospects_api and
   "idempotencyKey: `club-prospect-${id}-${timestamp}`" in prospects_api and
   "subject = 'Welcome to Beings Club'" in mail_api and
   "The link below is your private entrance." in mail_api and
   "Your welcome is waiting." not in mail_api and
   "Beings Club is made by those who participate" not in mail_api)
ok("host can deliberately resend a welcome before onboarding is complete",
   "/prospects\\/(\\d+)\\/welcome" in club_router and
   "resendProspectWelcome" in prospects_api and
   "idempotencyKey: `club-prospect-welcome-${id}-${timestamp}`" in prospects_api and
   "resend welcome" in members_after.get("members/host.js", ""))
welcome_migration = io.open(os.path.join(
    ROOT, "practice-log", "members-migrations", "0013_member_welcome_links.sql"
), encoding="utf-8").read()
member_links_api = io.open(os.path.join(
    ROOT, "practice-log", "src", "club", "member-links.js"
), encoding="utf-8").read()
ok("welcome email enters onboarding without another email-code round trip",
   "CREATE TABLE member_welcome_link" in welcome_migration and
   "path === '/api/club/auth/welcome'" in club_router and
   "enterMemberWelcome" in prospects_api and
   "location.hash.replace" in members_after.get("members/app.js", "") and
   "history.replaceState" in members_after.get("members/app.js", "") and
   "#welcome=${encodeURIComponent(token)}" in member_links_api)
onboarding_api = io.open(os.path.join(ROOT, "practice-log", "src", "club", "onboarding.js"),
                         encoding="utf-8").read()
ok("finishing the first-entry welcome sends one retry-safe host notice",
   "path === '/api/club/onboarding/complete'" in club_router and
   "onboarding_completed_at" in onboarding_api and
   "host_join_notice_sent_at" in onboarding_api and
   "idempotencyKey: `club-joined-${member.id}-${member.onboarding_completed_at}`" in onboarding_api and
   "retryHostJoinNotices" in mailer_api and
   "!replay && !previewMode && !member?.onboardingCompleted" in members_after.get("members/app.js", ""))
ok("removing somebody revokes access and removes future gathering state",
   "DELETE FROM salon_rsvp WHERE member_id" in club_router and
   "DELETE FROM salon_attendance WHERE member_id" in club_router and
   'active_member.disabled_at IS NULL' in salons_api and
   'active_member.left_at IS NULL' in salons_api)
ok("Club email settings do not silence requested access codes",
   'sendClubCode' not in settings_api and 'salonAnnounced: true' in settings_api and
   'fieldNotes: true' in settings_api)
ok("leaving revokes access and honours each Field Note archive choice",
   "'keep_signed', 'anonymise', 'remove'" in settings_api and
   "SET is_anonymous = 1" in settings_api and
   "DELETE FROM field_note WHERE member_id" in settings_api and
   "UPDATE member_session SET revoked_at" in settings_api)
ok("Salon announcement and reminder mail is member-controlled and at-most-once",
   'club_send_log' in mailer_api and "COALESCE(p.quiet, 0) = 0" in mailer_api and
   'salon_announced' in mailer_api and 'salon_month' in mailer_api and
   'salon_week' in mailer_api and 'salon_day' in mailer_api and 'salon_hour' in mailer_api and
   'announcement already sent' not in mailer_api and 'announcement_recipient_count' in salons_api)
ok("only the month, day and hour Salon reminders require an RSVP",
   "reminder.kind === 'salon_week' ? null : salon.id" in mailer_api and
   'FROM salon_rsvp r' in mailer_api and "r.status = 'in'" in mailer_api)
ok("Salon publishing creates a locked-down Zoom meeting without storing the host URL",
   'account_credentials' in zoom_api and "method: 'POST'" in zoom_api and
   'mute_upon_entry: true' in zoom_api and 'waiting_room: true' in zoom_api and
   'join_before_host: false' in zoom_api and "auto_recording: 'none'" in zoom_api and
   'data?.start_url' not in zoom_api)
ok("deleting an upcoming Salon removes its automatically created Zoom meeting",
   "path === '/api/club/host/salon/delete'" in club_router and
   'deleteZoomMeeting' in salons_api and "method: 'DELETE'" in zoom_api and
   "DELETE FROM salon WHERE id" in salons_api)
ok("completed Salons are retained and several future Salons can coexist",
   "path === '/api/club/host/salon/close'" in club_router and
   "status = 'closed'" in salons_api and 'hasEnded: salonHasEnded' in salons_api and
   "status IN ('draft', 'published')" in salons_api and
   'const rows = await env.MEMBERS.prepare' in salons_api and
   'const salons = await Promise.all' in salons_api and 'active salon exists' not in salons_api)
ok("the member agreement gates every private surface server-side",
   "MEMBER_AGREEMENT_VERSION = '2026-09-01'" in agreement_api and
   "path === '/api/club/agreement'" in club_router and
   "if (!agreementAccepted(who)) return bad(403, 'agreement required')" in club_router and
   club_router.index("path === '/api/club/agreement'") <
   club_router.index("if (!agreementAccepted(who))") <
   club_router.index("path === '/api/club/salon'"))
ok("public Salons use the complete practice-and-conversation framing",
   'We begin with a guided curiosity practice' in
   io.open(os.path.join(ROOT, "index.html"), encoding="utf-8").read() and
   'a space for practice and conversation' in
   io.open(os.path.join(ROOT, "index.html"), encoding="utf-8").read())

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
public_urls = {ORIGIN + route for route in ROUTES}
listed_urls = set(re.findall(r"<loc>(https://[^<]+)</loc>", sitemap))
ok("sitemap lists every public canonical page", listed_urls == public_urls,
   "missing or extra: " + ", ".join(sorted(public_urls ^ listed_urls)))
dated_urls = dict(re.findall(r"<url><loc>(https://[^<]+)</loc><lastmod>(\d{4}-\d{2}-\d{2})</lastmod></url>", sitemap))
ok("sitemap gives every public page an accurate freshness signal",
   set(dated_urls) == public_urls and all(date <= '2026-09-03' for date in dated_urls.values()))
for archive in ["archive-refined.html", "archive-v4-dark-plates.html"]:
    archive_html = io.open(os.path.join(ROOT, archive), encoding="utf-8").read()
    ok(archive + ": excluded from search", '<meta name="robots" content="noindex,follow">' in archive_html)
# The only hand-maintained public utility keeps the simplified Home / Members map.
STANDALONE = ["404.html"]

def chrome(html, tag):
    m = re.search(r"(?s)<%s.*?</%s>" % (tag, tag), html)
    return re.sub(r"\s+", " ", m.group(0)) if m else ""

def nav_chrome(html):
    return re.sub(r' aria-current="[^"]+"', '', chrome(html, "nav"))

navjs = os.path.join(ROOT, "assets", "navmark.js")
good, err = js_parses(io.open(navjs, encoding="utf-8").read()) if os.path.exists(navjs) else (False, "missing")
ok("assets/navmark.js parses", good, err)

for p in STANDALONE:
    path = os.path.join(ROOT, p)
    if not os.path.exists(path):
        ok(p + ": exists", False); continue
    html = io.open(path, encoding="utf-8").read()
    ok(p + ": header keeps the simplified public map",
       'href="/">Home</a>' in html and 'href="/members/">' in html and
       all(('href="%s"' % route) not in nav_chrome(html)
           for route in ('/about/', '/salons/', '/sits/', '/join/')))
    ok(p + ": wordmark hover wired up",
       'data-navmark' in html and '/assets/navmark.js' in html)
    ok(p + ": no relative asset paths",
       'url(\'assets/' not in html and 'src="assets/' not in html)

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

    for route, local in [("/", "index.html"), ("/events/", EVENT_PAGE),
                                                    ("/members/", "members/index.html"),
                                                    ("/members/host/", "members/host/index.html"),
                                                    ("/practice-map/", "practice-map/index.html"),
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
