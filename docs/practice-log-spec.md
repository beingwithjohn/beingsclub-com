# Practice Log — build spec

For whoever builds the Practice Log as a separate piece of work, then hands it back to be
hooked into beingsclub.com.

Everything in **§1–§3** was verified against the live site and repo on 31 July 2026, not
recalled. Where something is an assumption or a decision still open, it says so.

---

## 0. What this is

A daily check-in tool for the ten people in a Beings Club **Sit**. For thirty-five days it
asks one question a day — *did you practise?* — and, once answered, shows the others who
answered it too.

It is the **only surface on beingsclub.com that needs a backend**. Everything else is
static HTML.

Design sources (authoritative, do not paraphrase the copy):
- `build/src/beyond-belief/Practice Log.dc.html` — 140KB, 12 phone frames + 4 desktop
- `build/src/beyond-belief/Practice Log - build notes.md` — 6KB, the product rules

A working **front-end prototype already exists** at `/log/` (see §4). It is single-user and
local-only. It is a reference for look and flow, not a foundation to preserve.

---

## 1. The infrastructure that exists — verified

### 1.1 Hosting

| Fact | Value |
|---|---|
| Repo | `github.com/beingwithjohn/beingsclub-com` |
| Branch served | `main`, path `/` (root) |
| Host | GitHub Pages, `build_type: legacy` (no Jekyll build step in use) |
| Custom domain | `beingsclub.com` via `CNAME` file at repo root |
| HTTPS | enforced (`https_enforced: true`) |
| Deploy | `git push origin main` → Pages build → live. Typically 20–60s, plus Fastly cache lag |
| Deploy check | `gh api repos/beingwithjohn/beingsclub-com/pages/builds/latest --jq .status` → `built` |

**Consequences that constrain the build:**
- **No server.** No Node runtime, no SSR, no server-side env vars, no request-time redirects.
- **No build step runs on the host.** Whatever is committed is what is served, byte for byte.
- **No secrets can live in the repo.** Anything committed is public.
- A path only resolves if a real file exists there — `/foo/` needs `foo/index.html`.
- 404s are served by `/404.html` with a genuine 404 status (verified).

### 1.2 Repo shape (tracked files, archives excluded)

```
index.html                      about/index.html        salons/index.html
sits/index.html                 beyondbelief/index.html join/index.html
404.html   CNAME   .gitignore
build/build_shell.py            ← generator for the six above
log/index.html                  ← the existing prototype
practice-map/index.html         beyondbelief/companion/{index,print/index}.html
assets/…                        ← 18MB total; images, opart, favicons, logo SVG
docs/practice-log-spec.md       ← this file
```

### 1.3 Conventions in force

- Plain HTML with **inline styles**; a single `<style>` block per page for what inline can't do.
- **Trailing-slash URLs** (`/salons/`). Links are written with the slash to avoid a redirect hop.
- Fonts: **Host Grotesk** from Google Fonts, weights 300–800, `display=swap`, preloaded.
- **Border radius 0 everywhere. No shadows.** Hairlines are `rgba(38,34,26,0.10)`.
- Images: JPEG, ≤ ~420KB, ≤1500px wide, on a `#F0EEE8` ground so a late decode doesn't flash.
- Form posts go to **Formspree** `https://formspree.io/f/xpqkbpyv` (public by design; it is a
  write-only form endpoint, not a credential).

### 1.4 Design tokens

| Token | Hex | Use |
|---|---|---|
| Paper | `#FDFCF9` | page ground |
| Stone | `#F0EEE8` | body ground behind the column, logistics bands |
| Warm off-white | `#F8F6F1` | footer strips |
| Cream | `#FFF7EE` | The Door's letter panel |
| Lilac | `#F2ECFF` | pull-quote bands, selection |
| Ink | `#171916` | text, buttons, borders |
| Body | `#43403A` | body copy |
| Muted | `#75726A` | eyebrows, captions |
| Violet | `#5A4B7C` | accent, step numbers, link hover |

The Practice Log's own palette differs and takes precedence for that surface: ground
`#f4f4f2`, amber `#FFAD54` (the mark), cream `#fff7ee` (note rows), ink `#171916` (John-only
surfaces). See the design file.

---

## 2. The app shell — how it actually works

`/`, `/about/`, `/salons/`, `/sits/`, `/beyondbelief/`, `/join/` are **six copies of one
document**. Each contains all six screens as absolutely-positioned layers; only one is
active. Navigation swaps layers, so it never re-parses the document or refetches fonts.

### 2.1 Generation — important

The six files are **generated, never hand-edited**:

```bash
python3 build/build_shell.py       # rewrites all six from the design sources
```

Verified: re-running it produces **byte-identical** files (idempotent). If you hand-edit a
slug file, the next run silently reverts you.

⚠️ It currently reads the design bundle from `build/src/`
(`SRC` at the top of the script). That path is a local absolute — **if the Log becomes a
seventh screen, the bundle needs to move into the repo** or `SRC` must be parameterised.
Flag this rather than working around it.

### 2.2 Routing contract

```js
ROUTES = {"/":"home", "/about/":"about", "/salons/":"salons",
          "/sits/":"sits", "/beyondbelief/":"beyondbelief", "/join/":"join"}
```

- `<html data-screen="…">` declares which layer boots active; each layer is
  `<div class="bc-layer" id="s-{key}" data-screen="{key}">`, the active one carrying
  `data-active="1"`.
- **Boot** reads `location.pathname` (not the hash) and paints that screen first.
- **On navigation** the shell swaps `data-active`, resets `scrollTop`, `pushState`s the real
  path, and updates `document.title`, `meta[name=description]`, `link[rel=canonical]` and
  `og:url`/`og:title`.
- **Interception bails** (letting the browser navigate normally) when any of these hold:
  `e.button !== 0`, any of meta/ctrl/shift/alt, `target="_blank"`, `[download]`,
  a non-http(s) scheme, a different origin, or **a path not in `ROUTES`**.
- `popstate` handled; back/forward verified working.
- Transitions: entering `opacity 1100ms cubic-bezier(.22,1,.36,1) 120ms`; leaving
  `opacity 700ms cubic-bezier(.33,0,.67,1)` then `visibility` at 700ms.

**The single most useful fact for this build:** because interception only claims paths in
`ROUTES`, **`/log/` is already left alone** — a link to it performs a normal page load
today, with no change needed to the shell.

### 2.3 Other shell behaviour

- **First-visit intro** on Home only: the wordmark's rings draw themselves
  (`stroke-dasharray`, 1700ms, 150ms stagger), then the mark glides onto the landing page's
  mark. Once per session (`sessionStorage['bc-intro-seen']`), skipped under
  `prefers-reduced-motion`, hard-capped ~2.6s.
- **Scroll reveal:** `[data-reveal]` → `data-reveal="in"` via IntersectionObserver, with an
  8s failsafe and a `beforeprint` hook.
- **Idle warming:** images in inactive layers are `loading="lazy"`, flipped to `eager` on
  `requestIdleCallback` after `load`.
- Shell weight: **~79KB HTML** per slug before gzip.

---

## 3. What already exists for the Log

### 3.1 The prototype at `/log/`

~42KB single file, no dependencies. **Single-user, local-only.**

- `localStorage` key **`bc_practice_log_v2`**, shape:
  ```js
  { start: <ms at local midnight of day 1>, name, hour, nudgeOn, notesOn,
    days: { "<0-34>": { sat:true, at:<ms>, note:"" } },
    questions: [ { day, at, text } ],
    cohort: []            // the other nine — empty, so copy degrades honestly
    seen, token }
  ```
- `TOTAL = 35`; `PRINCIPLES = [Curiosity, Care, Responsibility, Play, Rest]`;
  `HOURS = ['6:30am','7:00am','12:00pm','9:00pm']`.
- `EMAIL_CTA = 'Log Your Practice'` — John's wording for the button in every outgoing email.
- **Already implements the email-link safety rule** (§6.4): a `?t=` token is read, stored,
  and stripped from the URL via `history.replaceState`; it never writes a mark.
- Screens built: log surface, tap sequence, note, week dots, all-35 grid, day view, private
  channel to John, settings, yesterday grace, return-after-gap, offline, day 35 closing.

**Treat it as a reference, not a base.** It encodes the look and the interaction timings
correctly; its data layer is a stand-in.

### 3.2 The four product rules (from John's build notes — do not break)

1. **Nothing before the tap.** No cohort, counts or notes until the person has recorded the day.
2. **One tap, everything else optional.** The note is offered once; the private line to John is always available and never in the path.
3. **No streaks, ever.** The word does not appear. Nothing counts forward, so nothing can be lost. Missed days are never addressed.
4. **White is shared, black is John.** Colour carries the privacy model; anything on ink is seen by John alone.

Copy rules: the verb is **practised**. Twenty minutes is standard, stated before the
flexibility, never the flexibility alone. Banned vocabulary: streak · in a row · you missed ·
don't break it · 6/10 · 60% · average · session · progress · community · members · users ·
well done · congratulations.

---

## 4. Scope of this build

**In:** the participant-facing Log for one cohort of ten, its backend, its scheduled email,
and a minimal host view for John.

**Out (explicitly):** partners as a feature, cohorts beyond ten, anything social beyond a
note, and a full inbox UI for John — a plain list is enough for ten people.

---

## 5. Integration contract

Three ways to attach it. **Recommendation: A.**

### A. Standalone page at `/log/` — recommended
- Already works with the shell untouched (§2.2): `/log/` isn't in `ROUTES`, so links to it
  navigate normally.
- Keeps the app's JS, state and auth entirely out of the marketing shell — a bug in the Log
  cannot break the site.
- The Log is a **tool used daily by ten people**, not a page to be browsed; it wants its own
  document, its own `<title>`, and `noindex`.
- Costs a page load when entering from the site. Irrelevant: people arrive from an email.

### B. A seventh shell screen at `/log/`
- Gets the crossfade, at the price of shipping the Log's JS to every visitor of every page
  and adding an authenticated surface to a public shell.
- Requires editing `build/build_shell.py` (§2.1), not the slug files.
- Only worth it if the Log must feel continuous with the marketing site. It doesn't.

### C. Separate host (e.g. Cloudflare Pages at `log.beingsclub.com`)
- Cleanest isolation, and puts the app on the same origin as its API (no CORS).
- Costs a subdomain and a second deploy path.

**If A is chosen, the contract with the existing site is exactly this:**
1. The Log owns `/log/**`. Nothing outside it changes.
2. Add a link to `/log/` wherever John wants it (currently nothing links to it).
3. `<meta name="robots" content="noindex">` must stay.
4. Do not add `/log/` to `ROUTES` in `build/build_shell.py`.

---

## 6. Backend requirements

### 6.1 Why one is needed

Three things static hosting cannot do: hold shared state, know who the visitor is, and send
mail on a schedule.

### 6.2 Proposed stack (all free at ten people; confirm before building)

| Need | Service | Free-tier headroom |
|---|---|---|
| API + secret custody | Cloudflare Worker | 100k req/day |
| Shared state | Cloudflare D1 (SQLite) | 5GB, 5M row-reads/day |
| Scheduled send | Cloudflare Cron Trigger | 5 triggers |
| Email delivery | Resend | 3,000/mo, 100/day |

Ten people logging once daily is a rounding error against every one of those.

### 6.3 Data model — four tables, per John's notes

```sql
person(id, name, email UNIQUE, timezone, nudge_hour, nudge_on, notes_on,
       token, token_expires, is_host, created_at, left_at NULL)
day_mark(person_id, day INTEGER, marked_at)      -- PK(person_id, day). Nothing else is stored about a practice.
note(person_id, day, body, created_at)           -- ≤100 chars. Never notifies anyone.
private_message(person_id, day, body, created_at, answered_at NULL)  -- John-only for the run
```

`day` is an integer 0–34 against a fixed cohort start date, **not** a timestamp — the day
rolls at the participant's own midnight, so a 1am sit counts for the night they were awake.

### 6.4 Email safety — non-negotiable

**A link in an email must never write anything.** Mail scanners, link-preview bots and
"safe links" services follow every GET they see; a one-tap URL that records a practice would
log practices nobody did.

The tokenised link **identifies the person and opens the log surface primed**. The mark is
written by a tap on the page (a POST). The prototype already implements the client half.

Also: strip the token from the address bar on arrival (`history.replaceState`).

### 6.5 Auth

Long-lived magic link, revocable from Settings. No passwords anywhere. The token identifies;
the server authorises. Secrets go in via `wrangler secret put`, never into the repo (§1.1).

### 6.6 Sends

Seven emails (E1–E7 in the design file). Every one carries a one-tap link labelled
**"Log Your Practice"**. None carries cohort news, counts, or any reference to missed days.
600px, single column, plain-text fallback, no image dependency — op-art marks must degrade
to nothing. Daily send is bucketed by timezone so 7:00am means 7:00am *there*.

### 6.7 States the build must handle

| Situation | Behaviour |
|---|---|
| Already logged today | Opens straight to the cohort view; the tap square is gone, not disabled |
| Midnight | Day rolls in the participant's timezone |
| Yesterday | Addable until the following midnight, once, no note, no "late" marker |
| Cohort < ten | Real size rendered; copy says "five others", never "5/10" |
| Someone leaves | Past marks and notes stay, their column stops, nobody is told |
| Nobody yet | "You're the first one in." Never "0 of 10" |
| Unkind note | John can remove any note; the person's mark stays. No reporting UI |
| Offline | Mark written locally and queued; the tap always succeeds |
| After day 35 | Log freezes, stays readable at the same link. No emails, no new taps, no upsell |

---

## 7. Verification — how to prove it works

Each item is a check someone else can run, not a claim.

**Integration**
1. `curl -o /dev/null -w '%{http_code}' https://beingsclub.com/log/` → `200`.
2. From `/sits/`, click a link to `/log/`: the document changes (a full navigation), and the shell does not intercept.
3. `curl -s https://beingsclub.com/ | grep -c '"/log/"'` inside `ROUTES` → `0`.
4. Re-run `python3 build/build_shell.py`; `git diff --name-only` → empty. The Log must not make the generator dirty.

**Product rules**
5. Fresh account, before tapping: page contains no cohort dots, no counts, no notes. (Rule 1)
6. `grep -ci 'streak\|in a row\|you missed\|average\|congratulations'` across the built app → `0`. (Rule 3)
7. Private message submitted by A is absent from B's DOM and from B's API responses. (Rule 4)

**Email safety**
8. `curl` the tokenised email link (a bare GET, as a scanner would): responds 200, and `day_mark` gains **no** row. Then POST from the page: exactly one row.
9. After following the link, `location.search` contains no token.

**Backend**
10. Two accounts, two browsers: A taps → B reloads → B sees A in today's dots and the count increments.
11. Fire the cron manually: a member who hasn't logged receives one email; a member who has receives none.
12. Timezone: two members with the same chosen hour in different zones receive at their own local hour.
13. Day rollover: a mark at 01:00 local counts for the previous day.

**Safety**
14. View source of the deployed app: no API keys, no tokens, no secrets.
15. Day 36: the log renders read-only, no tap target, no email sent.

---

## 8. Open decisions — need John

1. **Cohort start date.** The prototype starts a personal 35 days on first open so it can be
   used solo. The real cohort begins **Wed 16 September 2026**. Which governs?
2. **Integration option** A / B / C (§5). Recommendation: A.
3. **Stack** (§6.2) — confirm Cloudflare + Resend before accounts are created. Requires
   John's own accounts; secrets never touch the repo.
4. **Sending domain.** `beingsclub.com` currently publishes `v=spf1 -all` (deny-all) and has
   **no MX**, so it cannot receive replies. Sending as `practice@beingsclub.com` needs the
   root SPF changed; replies need a reply-to of `john@spacetobe.xyz`. DNS is at **Squarespace
   Domains** (NS1 nameservers). Verified.
5. **Is the Log linked from the site at all**, or reached only by email link?
6. **`beings-logo-outline.svg` is 64KB** and fetched at runtime for the wordmark. If the Log
   uses it, consider inlining or a smaller mark.

---

## 9. Handing it back

When the build is ready, what's needed to hook it in:
- The built files, targeting `/log/**` only.
- The Worker/API deployed, with its origin.
- Confirmation that checks 1–15 in §7 pass, or a note on which don't and why.
- Any new secrets set via `wrangler secret put` by John — not shared in chat, not committed.
