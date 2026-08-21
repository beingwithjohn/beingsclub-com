# beingsclub.com — how this repo works

Read this before changing anything. Most of it is here because something broke.

## The one rule

**The six slug files are generated. Never hand-edit them.**

`index.html`, `about/`, `salons/`, `sits/`, `beyondbelief/`, `join/` are six copies of one
document, produced by `build/build_shell.py` from design sources vendored in
`build/src/*.dc.html`. Edit the generator, run it, commit
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
| `index.html`, `about/`, `salons/`, `sits/`, `beyondbelief/`, `join/` | **yes** | six copies of the app shell, one per route |
| `404.html` | no | hand-maintained, must match the shell's nav/footer |
| `practice-map/` | no | hand-maintained standalone page |
| `giving/` | no | hand-maintained public giving page; payment API lives in `practice-log/` |
| `beyondbelief/companion/`, `.../print/` | no | hand-maintained standalone pages |
| `log/` | no | Practice Log prototype, not linked from the site |
| `practice-log/` | no | a separate agent's build; `node_modules` is gitignored |
| `build/` | — | the generator, the verifier, the deploy script |
| `assets/navmark.js` | no | shared logo-hover behaviour for standalone pages |

Hosting is GitHub Pages from `main` on `beingwithjohn/beingsclub-com`, CNAME
`beingsclub.com`, HTTPS enforced. No server, no build step on the host, no secrets in the repo.

## How the app shell works

All six screens are inlined into every page as `.bc-layer` divs. Exactly one carries
`data-active="1"`; navigation crossfades between them and pushes real paths via the History
API. Each of the six files is generated with its own `<title>`, description, canonical and
`og:url`, so deep links and social previews are correct even though the markup is shared.

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

`404.html` and `practice-map/` are hand-maintained but must wear the same header and footer
as the shell, byte for byte — `verify.py` compares them. If you change the shell's nav or
footer in the generator, run the build and copy the new markup into both, or the build fails.

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
- Never promise a headcount for Beyond Belief — "ten people max", "a group of other people".
- The Sits CTA points at `/beyondbelief`, never straight to Luma.

## Open threads

- **The practice map wants restructuring.** A reader's feedback: the document calls itself a
  map and behaves like an essay — a linear scroll where the relationships between
  body/heart/mind × cultivate/rest/reveals are never shown as relationships. The proposal
  John was considering: put an actual grid near the top, move the "if overwhelmed / if angry
  / if scattered" entry points up with it, cut nothing. Applies to `practice-map/`,
  `beyondbelief/companion/` and the Space to Be copy.
- **Beyond Belief's day has moved twice.** It is currently **Tuesdays from 15 September 2026**.
  Note that the weekday and the dates are coupled: 16 September 2026 was a Wednesday, so any
  change of day re-derives all six meeting dates, the 35-day range and the advertised run.
  The dates live in the `key == 'beyondbelief'` block of the generator, in the `sits` block,
  and in both companions (hand-maintained).
- **The Practice Log** is one public evergreen tool. Courses grant the private line to John
  for a date window; they do not need separate runs. Stripe's one-off and monthly paths are
  built; the account secrets, webhook events and customer portal still need connecting. The
  other operational work is a D1 backup habit and tightening DMARC after aligned delivery.
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
