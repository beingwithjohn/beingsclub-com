import test from 'node:test';
import assert from 'node:assert/strict';
import {
  localDate, localTime, addDays, diffDays, weekday, isDate,
  anchorOf, dayIndex, weekIndex, weekStart, weekDates,
  isClosed, lastDay, notYetOpen, markableDates, phaseOf, daysUntil,
  nudgeDue, minutesOf, quietDays, validTimezone,
} from '../src/days.js';

const EVERGREEN = { mode: 'evergreen', starts_on: null, length_days: null };
const BEYOND = { mode: 'fixed', starts_on: '2026-09-16', length_days: 35 };

// ---------------------------------------------------------------------------
test('a local date is the date where the person is, not where the server is', () => {
  // 2026-07-31 23:30 UTC. Already tomorrow in Auckland, still today in London,
  // still yesterday evening in Los Angeles.
  const at = Date.parse('2026-07-31T23:30:00Z');
  assert.equal(localDate(at, 'Pacific/Auckland'), '2026-08-01');
  assert.equal(localDate(at, 'Europe/London'), '2026-08-01'); // BST, so 00:30
  assert.equal(localDate(at, 'America/Los_Angeles'), '2026-07-31');
});

test('a 1am sit counts for the night they were awake', () => {
  // The rule from the notes: the day rolls at their own midnight, so 01:00
  // local is a new day — the sit belongs to the date the clock now shows.
  const at = Date.parse('2026-10-03T00:00:00Z'); // 01:00 in London (BST)
  assert.equal(localTime(at, 'Europe/London'), '01:00');
  assert.equal(localDate(at, 'Europe/London'), '2026-10-03');
});

test('midnight reads as 00:00, never 24:00', () => {
  const at = Date.parse('2026-01-15T00:00:00Z');
  assert.equal(localTime(at, 'UTC'), '00:00');
});

test('calendar arithmetic survives the clocks going back', () => {
  // UK clocks go back on 2026-10-25. That night is 25 hours long.
  assert.equal(addDays('2026-10-24', 1), '2026-10-25');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(diffDays('2026-10-24', '2026-10-26'), 2);
});

test('calendar arithmetic survives leap days and year ends', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2028-02-29', 1), '2028-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(diffDays('2026-01-01', '2027-01-01'), 365);
  assert.equal(addDays('2026-03-15', -20), '2026-02-23');
});

test('dates are validated before they reach the database', () => {
  assert.ok(isDate('2026-09-16'));
  assert.ok(!isDate('2026-9-16'));
  assert.ok(!isDate('16/09/2026'));
  assert.ok(!isDate('2026-13-01'));
  assert.ok(!isDate('2026-02-30'));
  assert.ok(!isDate('2027-02-29')); // not a leap year
  assert.ok(isDate('2028-02-29'));  // this one is
  assert.ok(!isDate(''));
  assert.ok(!isDate(null));
  assert.ok(!isDate("2026-09-16'; DROP TABLE day_mark--"));
});

test('unknown timezones are rejected rather than thrown', () => {
  assert.ok(validTimezone('Europe/London'));
  assert.ok(validTimezone('Asia/Kathmandu'));
  assert.ok(!validTimezone('Middle/Earth'));
  assert.ok(!validTimezone(''));
  assert.ok(!validTimezone(null));
});

// ---------------------------------------------------------------------------
// the one difference between the two run shapes
// ---------------------------------------------------------------------------
test('a fixed run puts everyone on the same day number', () => {
  const early = { joined_on: '2026-09-16' };
  const late = { joined_on: '2026-09-30' };
  assert.equal(anchorOf(BEYOND, early), '2026-09-16');
  assert.equal(anchorOf(BEYOND, late), '2026-09-16');

  // 3 October is day 18 for both of them, which is what makes the cohort view
  // legible as one shared run.
  assert.equal(dayIndex('2026-10-03', anchorOf(BEYOND, early)), 17); // 0-based
  assert.equal(dayIndex('2026-10-03', anchorOf(BEYOND, late)), 17);
});

test('an evergreen run gives each person their own day one', () => {
  const march = { joined_on: '2026-03-01' };
  const july = { joined_on: '2026-07-20' };
  assert.equal(anchorOf(EVERGREEN, march), '2026-03-01');
  assert.equal(anchorOf(EVERGREEN, july), '2026-07-20');

  assert.equal(dayIndex('2026-08-01', '2026-03-01'), 153);
  assert.equal(dayIndex('2026-08-01', '2026-07-20'), 12);
});

test('weeks turn on the anchor weekday', () => {
  // Beyond Belief starts on a Wednesday, so its weeks turn on Wednesdays.
  assert.equal(weekday('2026-09-16'), 3); // Wednesday
  assert.equal(weekStart('2026-09-16', '2026-09-16'), '2026-09-16');
  assert.equal(weekStart('2026-09-22', '2026-09-16'), '2026-09-16'); // Tuesday, week one
  assert.equal(weekStart('2026-09-23', '2026-09-16'), '2026-09-23'); // Wednesday, week two
  assert.equal(weekIndex('2026-10-03', '2026-09-16'), 2);            // week three

  const week = weekDates('2026-10-03', '2026-09-16');
  assert.equal(week.length, 7);
  assert.equal(week[0], '2026-09-30');
  assert.equal(week[6], '2026-10-06');
  assert.equal(weekday(week[0]), 3);
});

test('an evergreen week turns on the day you joined', () => {
  const anchor = '2026-07-20'; // a Monday
  assert.equal(weekday(anchor), 1);
  assert.equal(weekStart('2026-07-26', anchor), '2026-07-20');
  assert.equal(weekStart('2026-07-27', anchor), '2026-07-27');
});

// ---------------------------------------------------------------------------
// closing
// ---------------------------------------------------------------------------
test('a fixed run freezes after its last day', () => {
  assert.equal(lastDay(BEYOND), '2026-10-20');
  assert.ok(!isClosed(BEYOND, '2026-10-20')); // day 35 is still a day you can log
  assert.ok(isClosed(BEYOND, '2026-10-21'));
  assert.ok(isClosed(BEYOND, '2027-01-01'));
});

test('an evergreen run never closes', () => {
  assert.equal(lastDay(EVERGREEN), null);
  assert.ok(!isClosed(EVERGREEN, '2026-08-01'));
  assert.ok(!isClosed(EVERGREEN, '2099-01-01'));
});

// ---------------------------------------------------------------------------
// the three phases
// ---------------------------------------------------------------------------
test('a Sit gathers, runs, then closes', () => {
  assert.equal(phaseOf(BEYOND, '2026-08-01'), 'room');  // invites are out
  assert.equal(phaseOf(BEYOND, '2026-09-15'), 'room');  // the night before
  assert.equal(phaseOf(BEYOND, '2026-09-16'), 'running');    // day one
  assert.equal(phaseOf(BEYOND, '2026-10-20'), 'running');    // day thirty-five
  assert.equal(phaseOf(BEYOND, '2026-10-21'), 'closed');
});

test('an evergreen run is only ever running', () => {
  // Nothing to assemble and no start to wait for: the day you join is day one.
  assert.equal(phaseOf(EVERGREEN, '2020-01-01'), 'running');
  assert.equal(phaseOf(EVERGREEN, '2099-01-01'), 'running');
});

test('the countdown to day one', () => {
  assert.equal(daysUntil(BEYOND, '2026-09-15'), 1);
  assert.equal(daysUntil(BEYOND, '2026-09-09'), 7);
  assert.equal(daysUntil(BEYOND, '2026-09-16'), 0);
  assert.equal(daysUntil(BEYOND, '2026-10-01'), 0);   // never counts backwards
  assert.equal(daysUntil(EVERGREEN, '2026-09-16'), null);
});

test('nothing can be marked before a fixed run opens', () => {
  assert.ok(notYetOpen(BEYOND, '2026-09-15'));
  assert.ok(!notYetOpen(BEYOND, '2026-09-16'));
  assert.ok(!notYetOpen(EVERGREEN, '2020-01-01'));
  assert.deepEqual(markableDates(BEYOND, '2026-09-16'), ['2026-09-16']); // no yesterday yet
});

test('yesterday is markable, the day before is not', () => {
  assert.deepEqual(markableDates(EVERGREEN, '2026-08-01'), ['2026-08-01', '2026-07-31']);
  assert.deepEqual(markableDates(BEYOND, '2026-10-03'), ['2026-10-03', '2026-10-02']);
});

test('the day after a fixed run ends, only the last day is still addable', () => {
  // 21 October: the run is closed, but yesterday was day 35 and the grace holds.
  assert.deepEqual(markableDates(BEYOND, '2026-10-21'), ['2026-10-20']);
  assert.deepEqual(markableDates(BEYOND, '2026-10-22'), []);
});

// ---------------------------------------------------------------------------
// the daily send
// ---------------------------------------------------------------------------
test('7:00am means 7:00am there', () => {
  const person = (tz) => ({ nudge_on: 1, nudge_hour: '07:00', timezone: tz });

  // 06:00 UTC on 3 October 2026: 07:00 in London (BST), 08:00 in Berlin.
  const at = Date.parse('2026-10-03T06:00:00Z');
  assert.equal(nudgeDue(person('Europe/London'), at), '2026-10-03');
  assert.equal(nudgeDue(person('Europe/Berlin'), at), null);

  // Berlin's 07:00 is an hour earlier in UTC.
  const earlier = Date.parse('2026-10-03T05:00:00Z');
  assert.equal(nudgeDue(person('Europe/Berlin'), earlier), '2026-10-03');
  assert.equal(nudgeDue(person('Europe/London'), earlier), null);
});

test('a half-hour zone still gets its hour', () => {
  // Kolkata is UTC+5:30, so 07:00 local is 01:30 UTC — a cron tick.
  const at = Date.parse('2026-10-03T01:30:00Z');
  assert.equal(nudgeDue({ nudge_on: 1, nudge_hour: '07:00', timezone: 'Asia/Kolkata' }, at), '2026-10-03');
});

test('a quarter-hour zone is caught by the window rather than missed', () => {
  // Kathmandu is UTC+5:45. Its 07:00 local is 01:15 UTC, which is not a tick.
  // The 01:30 tick looks back 30 minutes and finds it.
  const at = Date.parse('2026-10-03T01:30:00Z');
  assert.equal(nudgeDue({ nudge_on: 1, nudge_hour: '07:00', timezone: 'Asia/Kathmandu' }, at), '2026-10-03');
});

test('the window never fires the same hour twice', () => {
  const p = { nudge_on: 1, nudge_hour: '07:00', timezone: 'UTC' };
  const fired = [];
  // Every tick across a whole day.
  for (let i = 0; i < 48; i++) {
    const at = Date.parse('2026-10-03T00:00:00Z') + i * 30 * 60000;
    const d = nudgeDue(p, at);
    if (d) fired.push(localTime(at, 'UTC'));
  }
  assert.deepEqual(fired, ['07:00']);
});

test('a 6:30am nudge lands on the half-hour tick', () => {
  const at = Date.parse('2026-10-03T06:30:00Z');
  assert.equal(nudgeDue({ nudge_on: 1, nudge_hour: '06:30', timezone: 'UTC' }, at), '2026-10-03');
});

test('a nudge just after local midnight belongs to the day before', () => {
  // 23:50 target, delivered on the 00:00 tick. The email is yesterday's.
  const at = Date.parse('2026-10-03T00:00:00Z');
  assert.equal(nudgeDue({ nudge_on: 1, nudge_hour: '23:50', timezone: 'UTC' }, at), '2026-10-02');
});

test('nudges off means no send, and a broken row cannot stop the sweep', () => {
  const at = Date.parse('2026-10-03T06:00:00Z');
  assert.equal(nudgeDue({ nudge_on: 0, nudge_hour: '07:00', timezone: 'Europe/London' }, at), null);
  assert.equal(nudgeDue({ nudge_on: 1, nudge_hour: 'seven', timezone: 'Europe/London' }, at), null);
  assert.equal(nudgeDue({ nudge_on: 1, nudge_hour: '07:00', timezone: 'Middle/Earth' }, at), null);
  assert.equal(minutesOf('25:00'), null);
  assert.equal(minutesOf('07:60'), null);
  assert.equal(minutesOf('6:30'), 390);
});

// ---------------------------------------------------------------------------
// quiet days — counted only to trigger one gentle email, never shown to anyone
// ---------------------------------------------------------------------------
test('quiet days count back from yesterday, never including today', () => {
  const marked = new Set(['2026-09-25']);
  // Today is 1 Oct; 26–30 Sep are quiet. Today is still open, so it is not counted.
  assert.equal(quietDays(marked, '2026-10-01', '2026-09-16'), 5);
});

test('a mark yesterday means no quiet days at all', () => {
  const marked = new Set(['2026-09-30']);
  assert.equal(quietDays(marked, '2026-10-01', '2026-09-16'), 1 - 1);
});

test('quiet days stop at the start of the run, not before it', () => {
  // Joined 16 Sep, marked nothing. On 19 Sep that is 16, 17, 18 — three days.
  assert.equal(quietDays(new Set(), '2026-09-19', '2026-09-16'), 3);
});
