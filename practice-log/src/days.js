// Days.
//
// A day rolls at the participant's own midnight: a sit at 1am counts for the
// night they were awake. So every date in this system is a local calendar date
// in the person's own timezone, written 'YYYY-MM-DD', and never a timestamp.
//
// Calendar arithmetic is done on UTC epoch-days, which makes it immune to
// daylight saving — adding one day to '2026-10-24' is '2026-10-25' whether or
// not the clocks moved that night.

const DAY_MS = 86400000;

// ---------------------------------------------------------------------------
// reading a local clock
// ---------------------------------------------------------------------------

// 'en-CA' formats as YYYY-MM-DD, which is the whole reason it is used here.
const dateFmt = new Map();
function dateFormatter(tz) {
  let f = dateFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    dateFmt.set(tz, f);
  }
  return f;
}

const timeFmt = new Map();
function timeFormatter(tz) {
  let f = timeFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    });
    timeFmt.set(tz, f);
  }
  return f;
}

// Unknown or malformed zones would otherwise throw deep inside a cron sweep and
// take the whole tick down with them. One bad row must not stop everyone's mail.
export function validTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try { dateFormatter(tz).format(0); return true; } catch { return false; }
}

/** The local calendar date at `at` (ms) in `tz`. */
export function localDate(at, tz) {
  return dateFormatter(tz).format(new Date(at));
}

/** Local wall-clock time at `at` (ms) in `tz`, as 'HH:MM'. */
export function localTime(at, tz) {
  // en-GB hour12:false renders midnight as '24:00' in some ICU versions.
  return timeFormatter(tz).format(new Date(at)).replace(/^24:/, '00:');
}

// ---------------------------------------------------------------------------
// calendar arithmetic on 'YYYY-MM-DD'
// ---------------------------------------------------------------------------

// Date.UTC rolls out-of-range parts over rather than refusing them — month 13
// becomes next January, 30 February becomes 2 March — so shape and range are
// checked by converting back and requiring the same string.
export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const n = epochDay(s);
  return Number.isFinite(n) && fromEpochDay(n) === s;
}

/** Days since the epoch for a 'YYYY-MM-DD'. */
export function epochDay(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function fromEpochDay(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(s, n) {
  return fromEpochDay(epochDay(s) + n);
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function diffDays(a, b) {
  return epochDay(b) - epochDay(a);
}

/** 0 = Sunday, matching Date#getUTCDay. */
export function weekday(s) {
  return new Date(epochDay(s) * DAY_MS).getUTCDay();
}

// ---------------------------------------------------------------------------
// where a day sits in a run
// ---------------------------------------------------------------------------

// The one difference between the two run shapes.
//
// A fixed run counts from its own start, so everyone in the cohort is on the
// same day number and "day 18" means the same thing to all of them. An
// evergreen run counts from the day this person joined, so someone who arrives
// in March is on their own day 18 in April, while the person beside them is on
// day 400. Weeks turn on the anchor's weekday in both cases.
export function anchorOf(run, person) {
  return run.mode === 'fixed' ? run.starts_on : person.joined_on;
}

/** 0-based. Negative before the run starts. */
export function dayIndex(date, anchor) {
  return diffDays(anchor, date);
}

export function weekIndex(date, anchor) {
  return Math.floor(dayIndex(date, anchor) / 7);
}

export function weekStart(date, anchor) {
  return addDays(anchor, weekIndex(date, anchor) * 7);
}

/** The seven dates of the week `date` falls in. */
export function weekDates(date, anchor) {
  const start = weekStart(date, anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * A fixed run has a last day and then freezes. An evergreen run has neither,
 * so this is always false for one — there is no day it stops being today.
 */
export function isClosed(run, date) {
  if (run.mode !== 'fixed') return false;
  return diffDays(run.starts_on, date) >= run.length_days;
}

export function lastDay(run) {
  return run.mode === 'fixed' ? addDays(run.starts_on, run.length_days - 1) : null;
}

/** Before a fixed run opens there is nothing to mark. */
export function notYetOpen(run, date) {
  return run.mode === 'fixed' && diffDays(run.starts_on, date) < 0;
}

/**
 * Which dates this person may mark, given their local today.
 *
 * Today, plus yesterday until the following midnight — once, and the API will
 * not take a note on it. Enough for a late sit, not enough to rebuild a
 * fortnight. Neither can fall outside the run.
 */
export function markableDates(run, today) {
  const out = [];
  for (const d of [today, addDays(today, -1)]) {
    if (notYetOpen(run, d)) continue;
    if (run.mode === 'fixed' && diffDays(run.starts_on, d) >= run.length_days) continue;
    out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// the daily send
// ---------------------------------------------------------------------------

/**
 * Is this person's chosen hour inside the window that just passed?
 *
 * The cron ticks every 30 minutes on the half hour, so instead of asking for an
 * exact match — which would never fire for a zone offset by :45, and would fire
 * twice for one offset by :15 — it asks whether their local nudge time fell in
 * the window ending now.
 *
 * Returns the local date the send belongs to, or null. The date matters near
 * midnight: a 23:50 nudge delivered at 00:05 is still yesterday's email.
 */
export function nudgeDue(person, at, windowMinutes = 30) {
  if (!person.nudge_on) return null;
  if (!validTimezone(person.timezone)) return null;

  const target = minutesOf(person.nudge_hour);
  if (target == null) return null;

  const now = minutesOf(localTime(at, person.timezone));
  const since = (now - target + 1440) % 1440;
  if (since >= windowMinutes) return null;

  // If the target is later in the day than the clock now reads, the window we
  // are inside opened before local midnight, so it belongs to yesterday.
  const date = localDate(at, person.timezone);
  return now < target ? addDays(date, -1) : date;
}

export function minutesOf(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Consecutive days ending yesterday with no mark. Today is deliberately not
 * counted — the day is still open, and nobody is chased for a day they might
 * still be about to practise.
 */
export function quietDays(markedDates, today, since) {
  const marked = markedDates instanceof Set ? markedDates : new Set(markedDates);
  let n = 0;
  let d = addDays(today, -1);
  while (diffDays(since, d) >= 0) {
    if (marked.has(d)) break;
    n++;
    d = addDays(d, -1);
  }
  return n;
}
