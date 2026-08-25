# Copy — the public Practice Log

Copy pass completed 19 August 2026 when the product moved from one log per
course to one public evergreen log. The implemented source remains
`app/app.js` and `src/mail/templates.js`; this file records the decisions.

The fixed-run invitation, threshold and room copy is retained below as legacy
reference. It is not part of the public entry path and both live fixed runs are
retired.

**What's *not* here, on purpose:** the log screens themselves — the tap, the
note, the week grid, the private channel, day thirty-five.
That copy is yours already, transcribed from the design bundle. It's in
`app/app.js` if you want it, but it's been through your hands once.

---

## 0. The public path — current

**Opening `/log/` without a working link**
> PRACTICE LOG
>
> A simple record of showing up.
>
> Come sit with us. Enter your name and email to begin. We’ll send you a
> private link — no password needed.
>
> Your name / you@example.com
>
> OPEN MY LOG
>
> HOW IT WORKS
>
> 1. Choose a time for the log to email each day and ask: **Did you practise?**
> 2. Sit in meditation, however you sit. Use the timer if you like. When you’re done, tap **I practised** to record it.
> 3. Share a line if you feel like it. See who else is practising with you this week, and what it has been like for them.

**The email sent to someone new**
> Subject: Ready to practise?
>
> Welcome
>
> Your log is ready.
>
> A simple record of sitting in meditation. It emails at a time you choose,
> and shows you who is practising with you across the week.
>
> 1. Choose a time for the log to email each day and ask: **Did you practise?**
> 2. Sit in meditation, however you sit. Use the timer if you like. When you’re done, tap **I practised** to record it.
> 3. Share a line if you feel like it. See who else is practising with you this week, and what it has been like for them.
>
> OPEN MY LOG
>
> If you ever want to change the time or stop the daily emails, you can do that
> in [Settings].
>
> One link, no password. It’s yours and it doesn’t expire.
>
> Beings Club · reply to this and John reads it

**First opening**
> Welcome, John.
>
> This is where you record your practice and, once you have, see who else is
> practising with you across the week.

The two-rule contract, required name, optional picture and optional one-line
introduction, timezone and email hour follow. Picture and introduction can be
skipped and all three identity fields can be changed later in Settings. The
public log has no persistent roster. Settings can also permanently delete the
account and every person-linked practice record.

> 1. When you’ve practised, tap **I practised** to record it.
> 2. You see who else practised this week only after you have tapped.

After recording today, the week shows one equal ink dot per person who
practised. The viewer's own dot alone is violet and ringed. Hovering, focusing
or tapping a dot opens the person's name, optional picture and optional
introduction; the picture is never used as the main-page mark. Day details and
the people in them remain visible only for the current week.

Before recording, “I want to practise now” opens an optional timer: five, ten,
or twenty minutes, plus a clearly selected custom length from one to 180
minutes. A gentle end bell is on by default and can be turned off. The timer
never records a practice; the ordinary “I practised” tap remains after it ends.
While running, it shifts to a low-light screen and asks the browser to keep the
screen awake. When that succeeds it says “This screen will stay awake while the
timer runs.” Otherwise it says “Keep this screen open and awake to hear the
bell.” The bell is a short media clip primed by the Start tap, not a silent
audio track spanning the sit. A normal browser cannot guarantee the bell after
the phone is manually locked.

Tapping Start first opens a separate pause before any countdown begins:

> Set an intention?

**Not today** begins the timer immediately. **Yes** opens a blank field with no
placeholder and a **Begin** button. The intention is not saved anywhere and
disappears completely when Begin starts the timer; it is not shown during or
after practice.

The public interface never calls the people using it a “cohort.” Settings
describes the daily nudge as “One email a day, at the time you choose,” and
describes the private link as the passwordless sign-in credential it is.

The existing post-practice note invitation is unchanged when it appears, but
it does not appear after every practice. Each person has a hidden selection of
two to six invitation days per anchored week. Someone practising fewer days
may encounter fewer than two. The choice is stable across reloads and devices
and does not respond to how often they practise or whether they shared before.

The menu also opens into the wider Beings Club work through benefit-led doors.
The Sits door reads:

> Build a meditation practice through shared commitment
> Sits · weekly live sessions

The Practice Map door reads:

> Find another way into your practice
> Practice map · body, heart and mind

After practice has been recorded, the shared week ends with one quiet giving
line. It never appears before the tap or in an email:

> If you want to help sustain Beings Club, you can give here.

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
never "3/10"). The seven-day shape uses one equal dot for each person who
practised, with only your own dot differentiated. The other standing rule is that
the banned list is *streak · in a row · you missed · don't break it · 6/10 ·
60% · average · session · minutes · progress · community · members · users ·
well done · congratulations*. If you want to break either, say so — they're
your rules, not laws. “Weekly live sessions” in the Sits door is the deliberate
exception: it describes a separate live offering, not a unit of logged practice.

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

## 3. Practice presence and account privacy

Only the host can see who has created an account. There is no participant
directory, roster, people search, or public profile URL. A picture or
introduction is returned to another participant only as part of a day the
person marked; creating an account alone never makes someone visible. This is
not social media. It makes practice social.

---

## 4. Giving

Giving is not a Practice Log screen. The log's menu links to the public page at
`/giving/`, and one small invitation appears beneath the shared week after a
practice is recorded. It does not appear before practice or in an email.
Settings contains no request or gift history: it has only a route into Stripe
for somebody who wants to manage or end an existing monthly gift.

**Heading**
> This work is freely given.

**Body**
> Beings Club offers Salons, Sits and the [Practice Log](/log/) without a fee
> or expected amount. I do this to protect the work from the ways money can
> distort how we meet one another.

> If you want to help sustain the work, you can make a one-off or monthly gift.
> What you give changes nothing about your access or place here. Giving nothing
> creates no debt.

The amount field starts blank, one-off is selected first, and the giver chooses
GBP or USD. Both one-off and monthly gifts have a minimum of one whole unit
in the chosen currency. Stripe handles payment and sends the giver the way to
manage or end monthly giving.

---

## 6. Three states you'll rarely see

**Opened with no link at all** — see the current public path in §0.

**Nothing cached and nothing reachable**
> Wait a second…
> We can’t reach your log just now. You can record your practice when you’re
> able to connect.
> TRY AGAIN

**A fixed run that hasn't opened yet**
> We begin on Wednesday 16 September.
> The log opens that morning, and the first email comes with it. Nothing to do
> until then.

---

## 7. Settings — the rows I added

**A line about being here**
> Change    *(shows the current line, or “Nothing written”)*

**Your private link**
> It signs you in without a password. Replace it if you think someone else has access.
> Replace
> *confirmation:* Replace your private link? This will sign you out everywhere.
> A new link will be emailed to you@example.com.
> *after:* A new link is on its way to you@example.com. This one has stopped working.

**Manage monthly giving**
> Change or end your monthly gift securely through Stripe
> Manage

**Delete my Practice Log**
> Permanently remove your profile, circles, notes and private messages
> Delete
>
> This cannot be undone. Type DELETE to confirm.

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

**The private account list** shows each person's picture, introduction, email,
timezone, when they joined, how many days they've marked, and a violet
**QUIET 5D** flag after three or more quiet
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

Then open `practice-log/email-preview/index.html`. The preview includes the
fixed and evergreen variants: the invitation, you're in, day one, the daily,
the Wednesday letter, a reply from John, the optional Sunday reply digest,
still here, day thirty-five, and a replacement link.

The daily one is the one they'll see thirty-four times, so it's worth more of
your attention than its length suggests:

**Subject**
> Did you practise?

**Body**
> This week we're with *responsibility*.
> Whenever you practise today, long or short, come and say so.
> LOG YOUR PRACTICE
> You can come back later if you need to.

After three complete quiet days, the fourth day’s email changes once. The
ordinary daily note resumes the following day.

**Subject**
> Still here whenever you are

**Body**
> Nothing to explain.
>
> Life has its own rhythms. You can always begin again; showing up again is how
> the practice deepens.
>
> PRACTISE TODAY
>
> If you’d rather stop these notes, you can do that in Settings.
