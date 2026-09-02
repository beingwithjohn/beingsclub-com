# Practice Log — handover

For an agent picking this up to build something onto it. Written for the Notion
case specifically, but the constraints hold for any integration.

**Read §4 before writing any code.** Four rules shape this product, two of them
are enforced in the API rather than the interface, and the most natural thing to
build — "mirror it all into a database" — breaks three of them at once.

---

## 1. What it is

A daily check-in anyone can begin. It asks one question a day — *did you
practise?* — and, once answered, shows the others who answered it too. A group
does not get a separate instance: John can grant a participant the private line
to him for a host-set date window.

Live now:

| | |
|---|---|
| App | `https://beingsclub.com/log/` and `/log/host/` — static, from GitHub Pages |
| API | `https://practice-log.beingsclub.workers.dev` — Cloudflare Worker |
| Database | Cloudflare D1 `practice-log`, `8cf3af32-666c-48fb-a943-9c38c393d24c`, WEUR |
| Cron | `0,30 * * * *` — the timezone-bucketed daily send |
| Mail | Resend, from `practice@beingsclub.com`, reply-to `john@spacetobe.xyz` |
| Payments | Stripe code ready; account secrets and dashboard setup remain |
| Source | `practice-log/` in `github.com/beingwithjohn/beingsclub-com`, branch `main` |

Secrets are in Cloudflare (`wrangler secret list`): `LINK_KEY`, `RESEND_API_KEY`.
Stripe's two are unset. **Nothing secret is in the repo and nothing may be put
there** — it is public and GitHub Pages serves it byte for byte. `test/checks.js`
fails the build if that changes.

### Beings Club members access

The same Worker now also routes `/api/club/**`, but membership lives in its own
D1 database, `beings-club-members` (`c82c1c04-9378-4642-874f-0c8eb3be3f55`).
It shares this Worker only to use the existing Resend and `LINK_KEY` secrets;
there are no foreign keys or queries across the two databases. The static
client is generated from `members-app/app/` to `/members/`, and its private host
page is `/members/host/`.

Authentication is approved-email plus a six-digit code. Codes are keyed hashes,
last ten minutes, allow five attempts, and can be used once. The request response
does not reveal whether the email is approved. Sessions are random bearer tokens,
stored only as hashes server-side, expire after 30 days, and are revoked when a
member is removed. Every host route checks `is_host` in D1 on every request.
The post-conversation welcome is the one deliberate exception to the extra code
round trip: it carries a seven-day, one-use token in the URL fragment. The static
GET writes nothing; the member client removes the fragment and exchanges it by
POST for the same ordinary member session before showing onboarding.
`john@spacetobe.xyz` is seeded as the first approved member and host by
`members-migrations/0001_members.sql`.

Deploy: `npx wrangler deploy` from `practice-log/`. The client is built with
`node app/build.js` and committed; pushing `main` publishes it.

## 2. Two shapes of run

One set of tables serves both. The only difference is what a day index counts
from, and whether there is a last day — see `anchorOf` in `src/days.js`.

- **evergreen** — joinable any day, no end. Day one is the day *you* joined.
- **fixed** — a start date and a length. Everyone shares a day number and it
  freezes on the last day. A fixed run has three phases: `room` (before day
  one), `running`, `closed`.

Beyond Belief is a fixed run: 2026-09-16, 35 days, 10 places.

## 3. Data model

The numbered migrations are the full schema history and are commented. In brief:

```
  run              slug, name, mode, public_join, starts_on, length_days, week_labels,
                 places, blurb, meets, suggest_low, suggest_high, currency
person           run_id, name, email, timezone, nudge_hour, nudge_on, notes_on,
                 reply_digest_on,
                 token_hash, token_enc, invite_hash, is_host, joined_on,
                 took_place_at, setup_at, line, left_at, message_from, message_until
day_mark         (person_id, on_date) PK, marked_at, late
note             (person_id, on_date) PK, body ≤100, removed_at
private_message  person_id, on_date, body, answer_body, answer_url, answered_at
host_reply       recipient, one source message or note, private/shared,
                 John's public context, text, private R2 audio key, duration
gift             amount, currency, cadence, Stripe refs; no Practice Log person
giving_subscription  Stripe customer/subscription refs, email, amount, status; no person FK
contribution / contribution_subscription  legacy unused tables from the earlier attached model
send_log         (person_id, kind, scope) PK — idempotence for every email
```

Two things to understand before touching it:

**`on_date` is a local calendar date, never a timestamp.** A day turns at the
participant's own midnight, so a 1am sit counts for the night they were awake.
All date arithmetic is on UTC epoch-days, which makes it immune to DST. Never
derive a date from `marked_at`.

**`token_hash` and `token_enc` are the same token twice.** The hash is what a
request is looked up by; the sealed copy (AES-GCM under `LINK_KEY`) is what the
mailer opens to rebuild the link. A hash alone cannot be emailed; plain text
would make a copy of the table a set of live logins.

## 4. The four rules — read this before designing anything

These are the product. Breaking one is not a bug to fix later, it is the thing
itself failing.

**1 · Nothing before the tap.** No cohort, no counts, no notes until the person
has recorded today. Enforced in `api.js`: `state.shared` is *omitted*, not
hidden, until `markedToday`; `GET /api/day` 404s. The public evergreen log has
no participant roster at all. This now applies to fixed runs too: only the host
endpoint may list accounts. Its shared surface is equal practice dots and the
daily notes people chose to write. Name is required; picture and introduction
are optional. Those identity fields reach another participant only through a
day that person marked, never from account creation. This is practice made
social, not an account network.

**2 · One tap, everything else optional.** The note is offered only on a
stable, hidden selection of two to six days in each person's anchored week;
someone practising fewer days may encounter fewer invitations. The selection
does not respond to their practice or sharing history. The
timer offers five, ten, twenty, or a custom one-to-180-minute length; it is an
aid and never records practice. While it runs, its low-light page requests a
screen wake lock and reports whether that succeeded. The bell is a short
HTML-media clip primed on Start (so a foreground iPhone can use the media
channel even with its silent switch on), not a full-sit audio track. An ordinary
browser cannot guarantee a bell after a manual screen lock. Start first opens
an optional “Set an intention?” pause. Not today starts immediately; Yes opens
a blank field and Begin. The typed text lives only in that DOM field and is
discarded before the countdown, never saved or shown during the sit. After its
optional bell the same tap remains. The private line to John appears only inside an
active host-set window and is in the path of none.

**3 · No streaks, ever.** Nothing counts forward, so nothing can be lost. Days
that were not marked are drawn exactly like days that have not arrived, and are
never named. Banned vocabulary, checked automatically against the built app:
*streak · in a row · you missed · don't break it · 6/10 · 60% · average ·
session · minutes · progress · community · members · users · well done ·
congratulations*. Prose counts are said in words and never as a denominator.
The seven-day shape has no visible numbers: every mark is an equal dot and only
the viewer's own dot is differentiated.

**4 · White is shared, black is John.** Colour carries the privacy model.
Anything on ink is read by John alone. `private_message`, and the original note
behind a reply, are read by no handler a participant can reach. Replies live in
a separate `host_reply` record. A shared reply contains John's own public
question or context, never the source person's words or identity. Private
replies are returned only to their recipient. Shared replies prompted by other
people open only after today's tap; your own reply always opens from its email.

Voice replies are stored in the private `practice-log-audio` R2 bucket and
streamed through an authenticated Worker route. There is no public R2 URL. The
browser and Worker both cap a recording at twenty minutes. Account deletion
removes the person's R2 objects before D1 cascades their rows.

The public-reply digest is explicitly opt-in. On Sunday at the person's chosen
email time, `digest.js` collects replies first made public in the preceding
seven days. It excludes replies prompted by that same person, who already got
the immediate notification. No new public reply means no digest; a sent digest
stands in for Sunday's daily nudge so two scheduled emails do not arrive
together. Changing public context does not re-notify; `shared_at` changes only
when a private reply becomes shared.

**And one consequence that is easy to undo by accident:** identity is derived
from marks, never accounts. `sharedView` may correlate somebody's practice
within the single visible week, but a person enters that response only by
having marked one of those days. It never
returns an account roster or account total. Pictures stay behind hover, focus or
tap; they are never the main-page visual.

## 5. API

Base `https://practice-log.beingsclub.workers.dev`. JSON throughout.
CORS is locked to `APP_ORIGIN`; other origins get 403.

Auth is `Authorization: Bearer <token>` — a long-lived magic link, revocable
from Settings. Someone invited but not yet accepted has a row and a token but
**cannot sign in**; their way in is `Authorization: Invite <token>`, which
reaches exactly two endpoints.

```
GET    /api/health
POST   /api/join        {name?, email, timezone?}  public evergreen entry; emails the link
POST   /api/login       {email}    unauthenticated; posts the link back
GET    /api/state                  everything the app renders
GET    /api/day?date=YYYY-MM-DD    one day, gated on today being marked
GET    /api/replies                own replies + shared replies after today's tap
GET    /api/replies/:id/audio      authenticated private R2 stream
POST   /api/mark        {date?}    the only thing that records a practice
POST   /api/note        {date?, body}
POST   /api/message     {body}     private to John
PATCH  /api/settings    {name?, line?, timezone?, nudge_hour?, nudge_on?,
                         notes_on?, reply_digest_on?, setup?}
POST   /api/settings/revoke        new link, emailed, never returned
POST   /api/settings/delete        {confirmation:"DELETE"}; cascades all person-linked data
POST   /api/giving                 public, site-Origin only → {url} Stripe Checkout
POST   /api/giving/manage          authenticated email match → {url} Stripe customer portal
POST   /api/stripe/webhook         signature-verified, unauthenticated

GET    /api/invite                 Invite auth. The threshold. Writes nothing.
POST   /api/place       {name?, line?, timezone?, nudge_hour?}  → {token}

GET    /api/host/inbox             is_host only; 404 otherwise, never 403
GET    /api/host/notes             practice notes the host may reply to
GET    /api/host/people
POST   /api/host/invite  {name, email, send?, force?}
POST   /api/host/message-access {person_id, from, until}  dates or both null
POST   /api/host/reply             multipart: source, private/shared, context,
                                   body and/or recording (twenty-minute max)
POST   /api/host/reply/visibility  make a reply private/shared; context required shared
POST   /api/host/reply/remove      remove reply and its recording
POST   /api/host/answer            compatibility for the retired URL form
POST   /api/host/note/remove {person_id, date}
POST   /api/host/week    {confirm:true, week_number, ...}
```

### `POST /api/login` — three properties, all load-bearing

The one endpoint anybody on the internet can call. It grants nothing new: it
posts the *same* long-lived link back to the address it already belongs to.
That is what makes it safer than a password reset — no new credential exists,
so there is nothing an attacker gains by triggering it. Keep it that way. If
you find yourself minting a token here, stop.

1. **It answers identically whether or not the address is anybody's.** Always
   `{ok:true}`, 200, for a member, a stranger and a malformed string alike.
   Otherwise it becomes a way to ask "is this person in the Sit?", which is a
   question about ten named people that nobody outside is owed an answer to.
   Do not add "no account found" however helpful it feels.
2. **One send per person per hour**, claimed through `send_log`. Without it,
   anyone could use it to fill somebody else's inbox.
3. **One email however many runs they are in.** Asking once should not produce
   three messages.

**Every write is a POST or PATCH, and this is load-bearing.** A link in an email
must never write: mail scanners, link-preview bots and "safe links" services
follow every GET they see, and a one-tap URL that recorded a practice would log
practices nobody did. The tokenised link only *identifies*; the mark is a POST
from the page. Do not add a GET that writes, ever.

## 6. Connecting Notion

Nothing here forbids it. These are the places it fits and the places it does not.

**Start from this:** identity never needs Notion. Everything required to know
who somebody is and to let them back in — the address, the sealed token, the
run they belong to — is already in D1, and `POST /api/login` rebuilds the link
from it. Notion can be a mirror of what happened. It must not become the place
the system looks to decide who someone is, or an outage at Notion becomes a
locked door here.

### Safe to mirror

- **`run`** — configuration. Fine in both directions if you want Notion to be
  where a Sit is defined.
- **`day_mark`** — a person, a local date, a timestamp. The whole practice
  record. Read-only into Notion is safe.
- **`gift`** — amounts and dates, with no Practice Log person attached.
- **`person`** minus the token columns — name, email, timezone, nudge hour,
  joined, left.

### Do not mirror

- **`person.token_hash`, `token_enc`, `invite_hash`.** These are credentials.
  A Notion database is shared, searchable and exportable; a magic link in one is
  a login sitting in a document.
- **`private_message`.** Rule 4. These were written on the understanding that
  one person reads them. A Notion database has collaborators, integrations and
  a share menu. If John wants them somewhere else, that is his call to make
  explicitly, not an integration's to assume.
- **`note`** — think hard. Notes are shared *with the nine others, on the day*.
  That is not the same as durable, searchable, exportable. If you sync them,
  sync them where only John can see, and never with the author's name beside a
  timeline of their practice.

### The shape to prefer

Push, don't pull. Add a Notion write at the points where something already
happens — after `postMark`, after `postContribution`'s webhook, after
`postPlace` — rather than a job that reads the database wholesale. It keeps the
host-only account registry intact and means Notion never becomes a second
participant directory.

If you need a scheduled sync, the cron already exists in `src/index.js`
(`scheduled`). Add to it rather than creating a second trigger; the free plan
allows five, and the sweep is already timezone-aware.

### Things that will bite

- **Rate limits.** Notion is roughly three requests a second. Ten people
  marking a day is nothing; a large historical backfill is not.
- **`ON CONFLICT DO NOTHING` everywhere.** Marks and gifts are
  idempotent by design because webhooks and queued offline marks arrive twice.
  Anything you add should be too.
- **The offline queue.** The client writes locally and syncs later, so a mark
  can arrive hours after the day it belongs to. Key on `on_date`, never on
  arrival time.
- **`is_host`.** John practises like everyone else and appears as one equal dot
  when he marks. Host privilege changes access to the host page, not whether a
  practice counts in the shared week.

## 7. Verifying you have not broken it

```bash
cd practice-log
npm test              # unit tests: days, access, replies, Stripe and CORS
node test/checks.js   # product checks against the built app
```

`checks.js` is the one that matters for a change like this. It fails the build
if the banned vocabulary reaches the interface, if `shared` stops being gated,
if a participant query starts reading source messages or notes, if protected
recordings become public or lose their cap, if a write becomes
reachable by GET, if a token appears in a URL, or if anything secret is tracked
by git. Run it before every deploy. If you add a rule, add a check.

There is no staging environment. `wrangler dev --local` with a local D1 is the
safe place to work; `seed/bootstrap.sh` creates runs and prints the magic links.

## 8. Open

- Stripe is unconnected — the one-off and monthly paths, signed webhooks and
  Settings manage/cancel route are built, but the two Worker secrets, webhook event
  destination and customer-portal cancellation still need John's Stripe account.
- DMARC is at `p=none` while sending is proven. Confirm SPF, DKIM and DMARC
  alignment from a real received message, then tighten deliberately through
  `quarantine` before `reject`. The member-mail style and delivery contract is
  recorded in `EMAILS.md`.
- `COPY.md` records the completed public-evergreen copy pass. Fixed invitation
  copy remains there only as legacy reference.
- The public evergreen log is now the course-independent home. Both fixed runs
  are retired; their records and the code path remain for historical reference.
