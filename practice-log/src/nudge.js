// The daily send.
//
// One cron, every half hour. Each tick asks every person whether their own
// chosen hour has just passed where they are, which is how 7:00am means 7:00am
// in Lisbon and in Auckland without a trigger per timezone.
//
// What is never sent: anything about the cohort, any count, any reference to a
// day that was not marked. If someone has already practised today they get
// nothing at all — the email is an invitation, and the invitation is spent.

import {
  localDate, addDays, diffDays, dayIndex, weekIndex,
  anchorOf, isClosed, notYetOpen, lastDay, nudgeDue, quietDays,
} from './days.js';
import { unseal, logUrl } from './auth.js';
import { claim, sendDaily, sendDayOne, sendStillHere, sendLastDay } from './mail/send.js';

// Three complete quiet days: the fourth day's note changes tone. Once per run,
// never twice, and the email itself never names the number.
const QUIET_BEFORE_STILL_HERE = 3;

export async function runNudges(env, at) {
  const people = await env.DB.prepare(
    `SELECT p.*, r.slug AS run_slug, r.name AS run_name, r.mode, r.starts_on,
            r.length_days, r.week_labels
       FROM person p JOIN run r ON r.id = p.run_id
      -- The host is not excluded. He practises like everyone else and gets the
      -- same invitation to say so; what makes him the host is that he is not
      -- one of the ten, not on the roster, and not in their counts. If he does
      -- not want the daily he turns it off in Settings, the same as anyone.
      WHERE p.left_at IS NULL AND p.nudge_on = 1`,
  ).all();

  let sent = 0;
  let considered = 0;

  for (const row of people.results || []) {
    considered++;
    try {
      if (await nudgeOne(env, row, at)) sent++;
    } catch (err) {
      // One bad row must not stop everyone else's mail.
      console.error('nudge failed for person', row.id, err?.stack || err);
    }
  }

  console.log(`nudge tick: ${sent} sent of ${considered} considered`);
  return { considered, sent };
}

async function nudgeOne(env, row, at) {
  const person = row;
  const run = {
    id: row.run_id, name: row.run_name, mode: row.mode, starts_on: row.starts_on,
    length_days: row.length_days,
    week_labels: row.week_labels ? JSON.parse(row.week_labels) : null,
  };

  // Is their hour inside the window that just closed?
  const date = nudgeDue(person, at);
  if (!date) return false;

  // Nothing before a fixed run opens, and nothing after it ends.
  if (notYetOpen(run, date) || isClosed(run, date)) return false;

  const anchor = anchorOf(run, person);
  const day = dayIndex(date, anchor);
  if (day < 0) return false;

  // Already practised: the day is theirs, and there is nothing to invite.
  const marked = await env.DB.prepare(
    `SELECT 1 FROM day_mark WHERE person_id = ?1 AND on_date = ?2`,
  ).bind(person.id, date).first();
  if (marked) return false;

  const url = logUrl(env, await unseal(env, person.token_enc));
  const principle = principleFor(run, date, anchor);

  // ---- the gentle one, on the fourth day ----------------------------------
  //
  // Sent in place of that day's daily rather than alongside it. Two emails
  // arriving in the same minute from something that promises one a day is a
  // broken promise; the daily stream resumes tomorrow either way.
  if (await shouldSayStillHere(env, person, run, date, anchor)) {
    if (await claim(env, person.id, 'still_here', 'run')) {
      return sendStillHere(env, person, url);
    }
  }

  // ---- day one ------------------------------------------------------------
  if (day === 0) {
    if (!(await claim(env, person.id, 'day_one', date))) return false;
    return sendDayOne(env, person, run, url, principle);
  }

  // ---- the last day of a fixed run ---------------------------------------
  if (run.mode === 'fixed' && date === lastDay(run)) {
    if (!(await claim(env, person.id, 'last_day', 'run'))) return false;
    const marks = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM day_mark WHERE person_id = ?1 AND on_date >= ?2 AND on_date <= ?3`,
    ).bind(person.id, run.starts_on, date).first();
    return sendLastDay(env, person, run, url, marks?.n || 0);
  }

  // ---- every other day ----------------------------------------------------
  if (!(await claim(env, person.id, 'daily', date))) return false;
  return sendDaily(env, person, run, url, day + 1, principle);
}

async function shouldSayStillHere(env, person, run, today, anchor) {
  // Cheap guard first: if it has already gone out, nothing else needs asking.
  const already = await env.DB.prepare(
    `SELECT 1 FROM send_log WHERE person_id = ?1 AND kind = 'still_here' AND scope = 'run'`,
  ).bind(person.id).first();
  if (already) return false;

  const since = diffDays(anchor, addDays(today, -QUIET_BEFORE_STILL_HERE)) > 0
    ? addDays(today, -QUIET_BEFORE_STILL_HERE)
    : anchor;

  const rows = await env.DB.prepare(
    `SELECT on_date FROM day_mark WHERE person_id = ?1 AND on_date >= ?2 AND on_date < ?3`,
  ).bind(person.id, since, today).all();

  const marked = new Set((rows.results || []).map((r) => r.on_date));
  return quietDays(marked, today, since) >= QUIET_BEFORE_STILL_HERE;
}

/**
 * The week's principle, where a run names its weeks. An evergreen run has no
 * labels, and the daily email simply carries one line fewer.
 */
export function principleFor(run, date, anchor) {
  const labels = run.week_labels;
  if (!Array.isArray(labels) || !labels.length) return null;
  const w = weekIndex(date, anchor);
  if (w < 0) return null;
  return labels[Math.min(w, labels.length - 1)];
}
