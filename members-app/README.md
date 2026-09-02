# Beings Club members entrance

The private foundation and first complete member slice:

- an approved email asks for a six-digit, ten-minute, single-use code;
- the public response is identical whether or not the address is approved;
- a successful code creates a revocable 30-day bearer session;
- only a host session can read or change the approved-address list;
- adding an address sends one personal invitation from John; delivery is
  recorded, failures remain visible, and an unjoined person can be deliberately
  invited again without creating another membership;
- John receives one email after that person completes the first-entry welcome
  and agrees to the member principles; delivery is idempotent and failed notices
  are retried by the existing half-hour Worker schedule;
- before onboarding is complete, the host can deliberately resend the welcome
  email to a granted prospective member without granting access a second time;
- the host page is static, but no member data is in it — the private API
  returns that only after checking the session and host role;
- every approved person, including a host, lands in the same member dashboard;
- a host can prepare a Salon privately, with a note, London-anchored date/time
  and fallback Zoom link, then publish it to members deliberately;
- publishing never sends an email — the announcement action remains visibly
  separate, becomes available only after publication and can be sent once;
- members see the Salon in their own local time, can toggle Beings Club time,
  RSVP “in” or “not this time”, clear their response, and download a calendar
  event that points back to the private member page;
- RSVP presence is anonymous to members and attributable to the host;
- the Zoom URL is withheld by the API until ten minutes before the Salon,
  regardless of RSVP state.
- after a completed Salon, the host marks attendees and opens a Field Note
  invitation for those people only;
- that invitation appears in the member area and is sent once by email, then
  remains until the member shares or dismisses it;
- a Field Note can hold text, a secure link, a private image, or any
  combination, and appears immediately either signed or anonymous;
- members can edit or remove their own note, but cannot respond, react or
  comment on anybody's;
- the archive is grouped by Salon/month and kept indefinitely;
- anonymous notes remain unattributed in the member archive while the host can
  see their author and remove any note where necessary.
- Giving keeps financial giving inside the member page, opens Stripe only for
  secure checkout or monthly-gift management, and includes a quiet testimonial
  opportunity alongside it:
  one offering per member per Beings Club calendar month, never promoted by an
  email, notification or reminder;
- testimonial submission explicitly permits public use with the chosen name
  across any Beings Club channel, including light editing or excerpting that
  does not change the meaning;
- testimonials enter a private host queue rather than appearing publicly;
  while pending, their author can edit or withdraw them, and the host can copy,
  mark used or pass.
- every active member appears in the private directory by their chosen name;
  a square, member-cropped photograph, one contextual line and an HTTPS website
  are optional;
- the directory exposes no email address, contact details, activity, presence,
  ranking or member-to-member messaging, and profile images remain private;
- a member without a chosen name is taken to Profile before the rest of the
  member area, so signed Field Notes and testimonials have a deliberate identity.
- Settings offers announcement, one-month, one-week, one-day and one-hour Salon
  email choices, plus the one-off Field Note invitation; announcement, week,
  day and Field Notes default on, while month and hour are opt-in;
- “Quiet, for now” silences optional Club mail without affecting requested
  six-digit access codes, and every Club email links back to Settings;
- members can replay the complete welcome from Settings without changing their
  existing agreement, and the visible in-person navigation opens an honest
  coming-soon page rather than a dead label;
- members can revoke every session and can leave the Club immediately, choosing
  whether their existing Field Notes remain signed, become anonymous or are
  permanently removed; a last remaining host cannot accidentally leave;
- publishing a Salon and emailing its announcement are separate host actions;
  week/day reminders use the existing half-hour Worker schedule and an
  at-most-once send claim.
- once a Salon has ended, the host can retain it as a completed gathering and
  start a fresh draft; its RSVPs, attendance and Field Notes remain attached
  to the completed Salon, while the next publication receives a fresh Zoom meeting.

The static source is in `members-app/app/` and builds to `/members/`:

```sh
node members-app/app/build.js
```

Production uses `https://practice-log.beingsclub.workers.dev`. For local work:

```sh
node members-app/app/build.js --api http://localhost:8787
```

Membership data is in the separate Cloudflare D1 database
`beings-club-members`. The current Worker shares the already-configured Beings
Club mail sender; it does not share Practice Log tables. Its migration is
`practice-log/members-migrations/0001_members.sql`, which seeds
`john@spacetobe.xyz` as the first approved address and host. Salon and RSVP
state is added by `0002_salons.sql`.
Field Note attendance, invitations and archive state are added by
`0003_field_notes.sql`. Images are held in the private
`beings-club-member-media` R2 bucket and are served only through an
authenticated member request.
The private monthly testimonial queue is added by `0004_testimonials.sql`.
Member email choices, at-most-once Club send claims and the leaving policy are
added by `0005_member_settings.sql`.
The later Salon timing choices are added by `0008_salon_email_timings.sql`, and
member invitation delivery state by `0009_member_invitation_delivery.sql`.
First-entry completion and the one-time host notice are added by
`0010_onboarding_completion_notice.sql`.
Profile fields are part of the original member table, so the directory needs no
additional migration. Profile photographs share the authenticated private R2
media path used by Field Notes.

Apply migrations before deploying the Worker:

```sh
cd practice-log
npx wrangler d1 migrations apply beings-club-members --remote
npm test
npx wrangler deploy
```

Then publish the static client with the normal site wrapper from the repo root:

```sh
./build/deploy.sh "Open private member access"
```

Never put a code, session token, `LINK_KEY`, or `RESEND_API_KEY` in this repo.

## Host control from Codex chat

Codex should operate the same host-only interface John uses, through the
authenticated in-app browser session at `/members/host/`. Do not add a second
admin token, public automation endpoint or credential to the repository.

Read-only requests such as listing members, checking RSVPs or reviewing the
current Salon can be carried out directly. A chat request may also prepare a
Salon draft. Actions with consequences remain explicit: adding a member sends
their invitation, publishing makes a Salon visible and may create its Zoom
meeting, announcing sends real email, and removal changes member data. Codex
must state the action and its consequence before performing one of those
operations, and must never infer permission to announce or remove from a
request merely to inspect or draft.
