# Copy — the public Practice Log

Copy pass completed 18 August 2026 when the product moved from one log per
course to one public evergreen log. The implemented source remains
`app/app.js` and `src/mail/templates.js`; this file records the decisions.

The fixed-run invitation, threshold and room copy is retained below as legacy
reference. It is not part of the public entry path and both live fixed runs are
retired.

**What's *not* here, on purpose:** the log screens themselves — the tap, the
note, the week grid, the whole-run grid, the private channel, day thirty-five.
That copy is yours already, transcribed from the design bundle. It's in
`app/app.js` if you want it, but it's been through your hands once.

---

## 0. The public path — current

**Opening `/log/` without a working link**
> PRACTICE LOG
>
> A simple record of showing up.
>
> The log is open to anyone. Give it an email address and it will send your
> private link. There is no password.
>
> Your name / you@example.com
>
> BEGIN OR OPEN MY LOG

**The email sent to someone new**
> Subject: Your practice log is ready.
>
> Welcome
>
> John — your log is ready.
>
> The Practice Log has no start date and no end. People join on the day they
> arrive, practise as they can, and see how many others did.
>
> 1. Choose the name that appears beside anything you write.
> 2. Pick your hour. One email a day, at that hour.
> 3. Find a place to sit and a time you can keep.
>
> OPEN MY LOG

**First opening**
> Welcome, John.
>
> This is where you record your practice and, once you have, see how many
> others practised that day.

The three-rule contract, name, timezone and email hour follow. The public log
has no persistent roster and does not ask why someone is here. Names appear
only beside a daily note someone chooses to write. The scheduled email
behaviour and wording remain unchanged.

After recording today, the week shows one aggregate column per day and says
the number of other people who practised. That is the intended sense of shared
movement: enough to see participation wax and wane, never a person-by-person
history.

Before recording, “I want to practise now” opens an optional timer: five, ten,
or twenty minutes, with twenty marked standard. A gentle end bell is on by
default and can be turned off. The timer never records a practice; the ordinary
“I practised” tap remains after it ends.

The public interface never calls the people using it a “cohort.” Settings says
“The name beside your notes,” and the daily-email setting says only that it
contains nothing about anyone else’s practice.

**Course access**

The private line to John is absent by default. John grants it for an inclusive
date range from the host page. During those dates the menu says:

> Something just for John
> Private, and open while your course is running

After the final date the door closes; replies already received remain theirs.

**Contributions**

The neutral phrase is “Using the log does not depend on this” and “The log is
yours either way.” “Your place” belongs only to a fixed invitation.

---

**Two rules I've been holding to**, so you know what the constraints were:
counts are said in words in prose, never as denominators ("seven places left",
never "3/10"). The seven-day aggregate uses a small numeral so its shape can
be read at a glance. The other standing rule is that
the banned list is *streak · in a row · you missed · don't break it · 6/10 ·
60% · average · session · minutes · progress · community · members · users ·
well done · congratulations*. If you want to break either, say so — they're
your rules, not laws.

---

## 1. Legacy fixed run — the invitation email

The highest-stakes text here. Ten people read it once, and it can't be recalled.
Comes from your name, not the club's.

**Subject**
> A place for you on Beyond Belief

**Eyebrow**
> A PLACE IS YOURS IF YOU WANT IT

**Heading**
> John — there's a place for you.

**Body**
> **Beyond Belief** runs for thirty-five days from Wednesday 16 September.

> A Sit runs as a shared experiment over a set stretch of days. We each sit in
> our own lives, knowing that others are sitting the same days, and meet live
> once a week — Wednesdays, 6:30–7:45pm UK.

> John hosts and teaches. The practices are rooted in contemplative traditions
> and he won't pretend otherwise — but this is a lineage of feeling, not a body
> of doctrine. Nothing is asked of you as belief.

**Lilac band**
> Take your place, and you'll see who else is here.

**Button**
> TAKE MY PLACE

**Under the button**
> One link, no password. Nothing is charged, now or ever, to be here — there's
> a way to contribute if and when you want to, and skipping it changes nothing.

**Footer**
> Beings Club · reply to this and John reads it

*Note: paragraphs two and three are your words verbatim. Paragraph one and
everything after is mine.*

---

## 2. Legacy fixed run — the invitation threshold

No names, no lines, nothing of the room. They haven't committed yet.

**Eyebrow**
> A PLACE IS YOURS IF YOU WANT IT

**Heading**
> John — there's a place for you.

**Lead**
> Beyond Belief. Thirty-five days from Wednesday 16 September.

**Then the blurb** — the same two paragraphs as the email. This is stored on the
run itself, so changing it means re-seeding or an update; tell me and I'll
handle it.

**A framed box**
> WE MEET
> Wednesdays, 6:30–7:45pm UK

**The line they write**
> WHY YOU'RE HERE
> *placeholder:* One line. The others will see it.
> Optional. You can change it later.        100 left

**The hour**
> A DAILY NUDGE AT     [6:30am] [7:00am] [12:00pm] [9:00pm]
> Your local time — Europe/London

**Button**
> TAKE MY PLACE

**Under it**
> Nine places left. Nothing is charged to be here.

### If every place is gone

**Heading**
> Every place is taken.

**Body**
> This one filled up. Write to John and he will tell you when the next Sit opens.

---

## 3. Legacy fixed run — the room before day one

**Band eyebrow**
> YOUR PLACE IS HELD

**Band**
> We begin in forty days, on Wednesday 16 September.
> *(or "We begin tomorrow." / "We begin today.")*

**Section**
> WHO'S HERE · SEVEN PLACES LEFT

then each person's name and their line. Someone who wrote nothing shows an em
dash. If you're first:

> You're the first one in.

**Framed box**
> WE MEET
> Wednesdays, 6:30–7:45pm UK

**Footer**
> Settings · The room        Something just for John? Ask privately

---

## 4. Legacy fixed run — the room during the run

Reached from the log after the day is marked.

**Band eyebrow**
> THE ROOM

**Band**
> The people sitting the same days as you.

Same roster below. The places-left count disappears once the run has started.

---

## 5. Giving

Giving is not a Practice Log screen. The log's menu has one link to the public
page at `/giving/`; the room and Settings contain no request, gift history or
billing controls.

**Heading**
> This work is freely given.

**Body**
> Beings Club offers practices, gatherings and the Practice Log without a fee
> or expected amount. I do this to protect the work from the ways money can
> distort how we meet one another.

> If you want to help sustain the work, you can make a one-off or monthly gift.
> What you give changes nothing about your access or place here. Giving nothing
> creates no debt.

The amount field starts blank, one-off is selected first, and both one-off and
monthly gifts have a £1 minimum. Stripe handles payment and sends the giver the
way to manage or end monthly giving.

---

## 6. Three states you'll rarely see

**Opened with no link at all** — see the current public path in §0.

**Nothing cached and nothing reachable**
> The log cannot be reached.
> Your day is safe either way — nothing here is lost by waiting. If you have
> practised, come back when you have signal and it will go in.
> TRY AGAIN

**A fixed run that hasn't opened yet**
> We begin on Wednesday 16 September.
> The log opens that morning, and the first email comes with it. Nothing to do
> until then.

---

## 7. Settings — the rows I added

**Why you're here**
> Change    *(shows the current line, or "Nothing written")*

**This link**
> Long-lived, and yours. Replace it if the device it lives on is not.
> Replace
> *after:* A new link is on its way to you@example.com. This one has stopped working.

---

## 8. Your host page

Only you see this. Plainer than the rest on purpose.

**Invite someone — legacy private runs only**
> Their name / Their email
> ☑ Email the invitation from me
> SEND THE INVITATION
> *after:* Sent. Their link: https://…

The public evergreen host page does not show this form. People enter through
`/log/`; the host page is for messages, course-access dates and records.

**The roster** shows each person's email, timezone, when they joined, how many
days they've marked, and a violet **QUIET 5D** flag after three or more quiet
days. That flag exists so you can notice someone has gone quiet and reach out
as a person — it is never shown to them, never counted in their interface,
never emailed.

**Removing a note**
> Remove that day's note
> *after:* Removed. Their mark stays.

---

## 9. The other emails

Rendered to files you can open in a browser:

```bash
node practice-log/dev/emails.js practice-log/email-preview
```

Then open `practice-log/email-preview/index.html`. Ten of them: the invitation,
you're in, day one, the daily, the Wednesday letter, John answered you, still
here, day thirty-five, and a replacement link.

The daily one is the one they'll see thirty-four times, so it's worth more of
your attention than its length suggests:

**Subject**
> Day 18 · a quiet minute counts

**Body**
> Good morning, John.
> This week we're with *responsibility*.
> Whenever you practise today, long or short, come and say so.
> LOG YOUR PRACTICE
> Haven't yet? This will keep until you have.
