# Practice Log — build notes

Companion to `Practice Log.dc.html`. Shared tokens, type and voice live in the bundle `README.md`; this file covers only what the log adds.

## What it is

A one-page web app, opened from an email link and optionally added to the home screen. No app store, no passwords. For thirty-five days it asks one question a day and, once answered, shows the nine other people answering it.

Run: **Wednesday 16 September – Tuesday 20 October 2026**, closing gathering **Wednesday 21 October**. Weeks turn on Wednesdays, gathering to gathering, and so does the grid.

## Four rules the build must not break

1. **Nothing before the tap.** No cohort, no counts, no notes until the person has recorded their day.
2. **One tap, everything else optional.** A note is offered once; the private line to John is always available and never in the path.
3. **No streaks, ever.** The word does not appear. Nothing counts forward, so nothing can be lost. Missed days are never addressed.
4. **White is shared, black is John.** Colour carries the privacy model. Anything on ink is seen by John alone.

## Surfaces

### Email (7)
| Id | Email | When |
|---|---|---|
| E1 | You're in | At purchase |
| E2 | Day one | Morning of day 1 |
| E3 | The daily email | Days 2–35, at the participant's chosen hour, local time |
| E4 | The week turns | Wednesday mornings, from John, before that evening's gathering |
| E5 | John answered you | On reply to a private question (the one dark email) |
| E6 | Still here | Once per run, at five consecutive quiet days, never twice |
| E7 | Day 35 | Morning of day 35 |

Every email carries a one-tap log link. None carries cohort news, counts, or any reference to missed days. 600px, single column, no image dependency — op-art marks are decorative and must degrade to nothing.

### Mobile (16, at 390pt)
M1 first run · M2 keep it to hand · M3 day one empty · M4 log surface before · M5 the reveal · M6 add a note · M7 cohort this week · M8 all thirty-five days · M9 one day opened · M10 ask John · M11 John answered · M12 four days away · M13 yesterday added late · M14 settings · M15 day 35 closing · M16 offline.

### Desktop (4, at 1152px)
D1 log surface before · D2 after logging (week + whole run + notes rail) · D3 ask John (full-page takeover, never a modal over the grid) · D4 day 35 closing.

One breakpoint, at **48rem**. Below: single column, tabs for *This week* / *All 35 days*. Above: side by side, no tabs, content capped at 64rem and centred. Desktop adds no features.

## The grid

Days across, one dot per person, per day. Amber is you; ink is another person who practised; 12% ink is not yet. Future days dim to 30%. There is no row per person — nobody can be compared to anybody.

*All 35 days* renders one square per day, grouped into the five principle weeks. Darkness = how many of us practised; a 3px amber left edge = you; a 2px ink outline = today. No totals, no percentages, no averages.

## Motion — the anatomy of one tap

| Time | What |
|---|---|
| 0ms | Square dips to 98% over 90ms, one soft haptic. Nothing else moves. |
| 120ms | Fill crosses to amber, "You practised." set inside it. Committed, online or not. |
| 400–1400ms | A second of your own day. The count of others fades in at 700ms. |
| 1400ms | Grid fades up over 600ms, dots in day order 40ms apart. No bounce. |
| 2000ms | The note prompt rises from the bottom over 300ms. Dismissed, it does not return that day. |

Everything eases out; nothing eases in and out. No spring, no scale-up, no celebration. Under `prefers-reduced-motion` the whole sequence becomes a 200ms crossfade with zero delays.

## States

| Situation | Behaviour |
|---|---|
| Already logged today | Opens straight to the cohort view; the tap square is gone, not disabled |
| Midnight | The day rolls in the participant's own timezone; a 1am sit counts for the night they were awake |
| Yesterday | Addable until the following midnight, once, with no note and no "late" marker |
| Cohort smaller than ten | Dot columns render the real size; copy says "five others", never "5/10" |
| Someone leaves mid-run | Past marks and notes stay, their column stops, nobody is told |
| Nobody has practised yet | "You're the first one in." Never "0 of 10" |
| An unkind note | John can remove any note; the person's mark stays. No reporting UI in Phase 1 |
| Offline | The mark is written locally and queued; the tap always succeeds |
| After day 35 | The log freezes and stays readable at the same link. No emails, no new taps, no upsell |

## Data & services

Four tables: **person**, **day-mark**, **note**, **private-message**. A day-mark is a person, a date and a timestamp — nothing else is stored about a practice. Notes cap at 100 characters and never notify anyone. Private messages are John-only for the run.

Sends: one scheduled daily email per timezone bucket, one Wednesday letter, transactional replies from John. Auth is a long-lived magic link, revocable from Settings.

Client is local-first: write, queue, sync. No realtime — the grid is fresh on load, and that is honest.

Out of Phase 1: partners, cohorts beyond ten, anything social beyond a note, and John's own inbox (a plain list is enough for ten people).

## Copy rules

**Twenty minutes is standard, with compassionate flexibility.** Always in that order — the standard first, the flexibility second. Never the flexibility alone, or the standard quietly disappears. House wording: *"Twenty minutes is standard, and sitting daily matters far more than sitting long. Five minutes on a hard day is a real practice, not a failed one."*

The verb is **practised**. "I practised", "You practised.", "Did you practise today?", legend "Practised". Participants' own notes and questions keep their own words.

Never used: streak · day 6 in a row · you missed · don't break it · 6/10 · 60% · average · session · minutes · progress · community · members · users · well done · congratulations. The product states what happened; it does not praise.
