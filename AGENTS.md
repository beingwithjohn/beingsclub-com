# beingsclub.com — how this repo works

Read this before changing anything. Most of it is here because something broke.

## The one rule

**The public landing, public events page and retired route files are generated. Never hand-edit them.**

`index.html` is the public landing and `events/` is the public Coliven-backed events page. The retired `about/`, `salons/`, `join/`,
`sits/`, `beyondbelief/` and `practice-map/` addresses are move pages produced
by `build/build_shell.py`; the meditation routes point to Space to Be. The old
design sources remain vendored in `build/src/*.dc.html` so the landing can
retain the full club context. Edit the generator, run it, commit
the result. If you edit a built file directly, the next build silently discards your work —
and `verify.py` will fail with "built files match the generator" before that can ship.

```bash
python3 build/build_shell.py    # regenerate
python3 build/verify.py         # 67 local checks
./build/deploy.sh "message"     # regenerate, verify, commit, push, confirm live
```

**Deploy only through `build/deploy.sh`.** Never `git push` by hand. See "Why deploy.sh
exists" below.

## Layout

| Path | Generated? | Notes |
|---|---|---|
| `index.html` | **yes** | members-first public landing |
| `events/` | **yes** | bespoke public events page containing the Coliven list |
| `about/`, `salons/`, `sits/`, `beyondbelief/`, `join/`, `practice-map/` | **yes** | retired addresses with noindex move pages |
| `404.html` | no | hand-maintained utility with the simplified public map |
| `giving/` | no | hand-maintained public giving page; payment API lives in `practice-log/` |
| `beyondbelief/companion/`, `.../print/` | **yes** | move pages to the Space to Be companion |
| `log/` | no | Practice Log prototype, not linked from the site |
| `practice-log/` | no | a separate agent's build; `node_modules` is gitignored |
| `build/` | — | the generator, the verifier, the deploy script |
| `assets/navmark.js` | no | shared logo-hover behaviour for standalone pages |

Hosting is GitHub Pages from `main` on `beingwithjohn/beingsclub-com`, CNAME
`beingsclub.com`, HTTPS enforced. No server, no build step on the host, no secrets in the repo.

## How the public shell works

The historical six screens remain inlined into `index.html` as `.bc-layer` divs so the landing
retains its complete source material and design history. Only the home layer is active and the
others are `data-nosnippet`. Old paths are generated move pages, not alternative public maps.

Consequences worth knowing:
- A change to any screen lands in **all six files**. That is why you regenerate rather than edit.
- Every entry point downloads all six screens' assets. Accepted trade-off; don't "fix" it by splitting the files.
- Pages render without JavaScript: a layer is pre-activated at build time.

## Things that have broken, and the invariants that now prevent it

Each of these is enforced by `build/verify.py`. **Do not delete a check to make a build
pass** — the check is the only thing standing between you and the outage that created it.

**1. A syntax error in the emitted JS took the whole site down.**
Normalising apostrophes put a straight `'` inside a single-quoted JS string. A parse error
kills the entire script, and with the script dead the intro overlay never dismissed — every
page was a blank paper screen. The build now runs `node --check` on the emitted script and
refuses to write. Keep JS string literals double-quoted when the text contains apostrophes.

**2. The deploy reported success while pushing to the wrong branch.**
`git push origin main` said "Everything up-to-date" while HEAD was on another branch.
`deploy.sh` now refuses to run from anywhere but `main`.

**3. "Pages built successfully" is not the same as "the site serves your commit".**
The legacy `repos/:owner/:repo/pages/builds` API has reported a stale commit for a deploy
that was demonstrably already live. **Do not trust it.** `deploy.sh` and `verify.py --live`
compare the served bytes against the local file instead. That is the only honest check.

**4. `git add -A` swept in 133MB of `node_modules`** (including an 82MB binary) from the
neighbouring Practice Log build. `deploy.sh` now refuses any staged file over 5MB or under
`node_modules`/`.wrangler`/`dist`. That blob is still in git history — untracked going
forward, never removed. Removing it means a history rewrite and force-push; it is John's call.

**5. Hover styles silently did nothing on some buttons.**
The design keeps every resting style **inline**, and an inline declaration beats any ordinary
stylesheet rule. `[data-vh="0"]:hover{color:#FDFCF9}` was a no-op on any button with
`color:#5A4B7C` inline — the background went violet and the text stayed violet. Every hover
declaration is now emitted with `!important`, and `verify.py` cross-references each
`[data-vh]` element's inline properties against its hover rule. This bug appeared twice
before it was understood; if you add a hover token, keep the `!important`.

**6. The intro overlay flashed, then hid the page.**
Two competing requirements. It must not flash (so the decision is made by a small
synchronous script in `<head>`, before first paint), and a dead script must never be able to
hide the site. So there are two independent guarantees:
- the overlay is **shut by default** — only the head script opens it;
- even when open, `@keyframes bc-intro-guard` closes it after 6.5s with **no JavaScript at all**.

Note that CSS animations are frozen in background tabs, so the guard only counts down while
someone is looking. That is intended.

## Standalone pages

`404.html` and `giving/` are hand-maintained utilities. Their public map is deliberately only
Home and Members; `verify.py` enforces that they do not recreate the retired public navigation.

They also need `data-navmark="1"` on the logo span and `<script src="/assets/navmark.js" defer>`,
which gives the wordmark the same stroke-weight hover the shell has.

## Copy conventions

John's standing copy decisions live in `build/build_shell.py` as replacements with asserts,
grouped by screen (`if key == 'beyondbelief':` and so on). The assert is deliberate: if a
design source changes underneath a rule, the build fails loudly rather than silently
shipping stale text. **Add new copy decisions the same way — never by editing a built file.**

- British spellings. "practice" as both noun and verb.
- "realisationhouse" is **one word**. It was split to two and reverted; leave it.
- Overall Beings Club framing is led by curiosity; do not restore the retired
  precious-or-cherished care principle. Beyond Belief still has its five principles,
  including care, unchanged.
- The overall framing says "Together, we explore two principles in curiosity":
  "Curiosity connects" and "Stay curious".
- "realise things of value" is John's chosen conceptual phrase. Its current public form is
  "things of value can be realised in reality"; keep the realisation wordplay.
- Beyond Belief now belongs to Space to Be. Beings Club's former course, companion,
  practice-map and Sits addresses are compatibility redirects; do not restore their offers here.

## Search discovery invariants

- The landing owns its title, description, canonical URL, social card and JSON-LD graph.
  Keep its inactive historical layers `data-nosnippet`; compatibility routes stay noindex.
- The public Search Console URL-prefix property is verified by the
  `google-site-verification` marker emitted by `build/build_shell.py`; do not remove it.
- John is identified publicly as `John`, matching the visible membership copy. Do not add a surname
  or external identity links to `Person` structured data without John's explicit approval.
- The landing owns the public `WebSite`, `Organization`, `Person` and `WebPage` graph.
  Beyond Belief's `Course` data now lives at Space to Be.
- `sitemap.xml` lists public canonical pages, not noindex member utilities or compatibility
  redirects. Give each listed URL an honest `lastmod` only after a significant change.
- `build/deploy.sh` notifies IndexNow only after live verification. Keep the public key file
  and `build/notify_indexnow.py` together; notification failure is a warning, never a reason
  to misreport a healthy deployment as failed.

## Open threads

- **The Space to Be practice map wants restructuring.** A reader's feedback: the document calls itself a
  map and behaves like an essay — a linear scroll where the relationships between
  body/heart/mind × cultivate/rest/reveals are never shown as relationships. The proposal
  John was considering: put an actual grid near the top, move the "if overwhelmed / if angry
  / if scattered" entry points up with it, cut nothing. Work on the canonical files in the
  Space to Be repo, not these redirects.
- **Beyond Belief's canonical dates and course data now live in Space to Be.** Keep the
  compatibility redirects here stable; update the Space to Be page, structured data,
  companion and sitemap together when a run changes.
- **The Practice Log** is one public evergreen tool. Courses grant the private line to John
  for a date window; they do not need separate runs. Stripe's one-off and monthly paths are
  built; the account secrets, webhook events and customer portal still need connecting. The
  production D1 databases have Time Travel active; verify a current bookmark before migrations.
  Tightening DMARC waits until aligned delivery has been observed.
- **The 82MB blob in git history** (see #4).

## Security constraints John has set

- **No secrets in the repo, ever.** John runs `wrangler secret put` himself so no agent sees keys.
- **Email links must never write anything.** Mail scanners follow GET links. A token in a link
  may only prime a page; the actual mark is a POST, and the token is stripped from the address bar.

## Where the design sources live

`build/src/` — vendored, not in Downloads. `build_shell.py` reads the seven `.dc.html`
prototypes there; `MERGE.md` and `README.md` are the design bundle's own notes and are the
authority for values like the realisationhouse gloss. `build/src/beyond-belief/` holds the
Beyond Belief bundle (course page, both companions, the practice map, the Practice Log).

Their `assets/` folders are deliberately **not** vendored: every file in them is already
byte-identical to what `assets/` serves, so copying them would duplicate 2.2MB for nothing.
The one exception is `course-cover.png` (7.9MB), which ships as the converted
`assets/course-cover.jpg` instead.
