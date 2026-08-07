// The API.
//
// Two of the four rules are enforced here rather than in the client, because a
// rule that lives only in the interface is not a rule:
//
//   Nothing before the tap.  `shared` is null, and every cohort endpoint 404s,
//                            until this person has marked today. The counts are
//                            not sent and hidden — they are not sent.
//   Black is John.           private_message is never read by any handler a
//                            participant can reach.

import {
  localDate, isDate, addDays, diffDays, validTimezone,
  anchorOf, dayIndex, weekIndex, weekDates, weekStart,
  isClosed, lastDay, notYetOpen, markableDates, minutesOf,
  phaseOf, daysUntil,
} from './days.js';
import { mintToken, logUrl, unseal } from './auth.js';
import { sendWelcomeBack } from './mail/send.js';

const NOTE_MAX = 100;
const LINE_MAX = 100;
const MESSAGE_MAX = 4000;
const NAME_MAX = 40;

// An evergreen log that has been running for years should not send its whole
// history on every load. Two years of squares is already more than anyone reads.
const WINDOW_DAYS = 731;

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

export const bad = (status, message) => json({ error: message }, status);

// ---------------------------------------------------------------------------
// GET /api/state
// ---------------------------------------------------------------------------
export async function getState(env, { person, run }) {
  const today = localDate(Date.now(), person.timezone);
  const anchor = anchorOf(run, person);
  const closed = isClosed(run, today);

  const mine = await minePastYear(env, person, anchor, today);
  const markedToday = mine.marks.has(today);

  const markable = markableDates(run, today).filter((d) => !mine.marks.has(d));

  const state = {
    person: {
      name: person.name,
      email: person.email,
      timezone: person.timezone,
      nudge_hour: person.nudge_hour,
      nudge_on: person.nudge_on,
      notes_on: person.notes_on,
      is_host: person.is_host,
      joined_on: person.joined_on,
      setup_at: person.setup_at,
      line: person.line,
    },
    run: {
      slug: run.slug,
      name: run.name,
      mode: run.mode,
      week_labels: run.week_labels,
      standfirst: run.standfirst,
      blurb: run.blurb,
      meets: run.meets,
      anchor,
      starts_on: run.starts_on,
      length_days: run.mode === 'fixed' ? run.length_days : null,
      last_day: lastDay(run),
      closed,
      not_yet_open: notYetOpen(run, today),
      phase: phaseOf(run, today),
      days_until: daysUntil(run, today),
      suggested_amount: run.suggested_amount,
      currency: run.currency,
    },
    today: {
      date: today,
      day_index: dayIndex(today, anchor),
      week_index: weekIndex(today, anchor),
      week: weekDates(today, anchor),
      week_start: weekStart(today, anchor),
      marked: markedToday,
      note: mine.notes.get(today) || null,
      markable: markable.includes(today),
    },
    yesterday: {
      date: addDays(today, -1),
      marked: mine.marks.has(addDays(today, -1)),
      markable: markable.includes(addDays(today, -1)),
    },
    // Your own private thread. Available before the tap, because it is yours
    // and it is not the cohort — but it never blocks the tap.
    answers: await answersFor(env, person.id),
    shared: null,
    roster: null,
    // Your own contributions, so the page can say thank you and offer another.
    // Nobody else's are ever visible, and nothing anywhere is ranked by them.
    contributions: await contributionsFor(env, person.id),
  };

  // Nothing before the tap.
  //
  // Once a run has closed there is no today left to tap, so that gate would
  // hold the log shut for ever and the closing view would render an empty
  // grid. The trade the rule protects — commit your own day before you look at
  // anyone else's — has already been made by then, so what stands in for it is
  // having been in the run at all. Someone who marked nothing still sees no
  // cohort, which is the same answer the rule would have given them all along.
  const canSeeShared = markedToday || (closed && mine.marks.size > 0);
  if (canSeeShared) {
    state.shared = await sharedView(env, { person, run }, anchor, today, mine);
  }

  // The roster — who has taken a place, and the line they wrote.
  //
  // Before day one this is the whole surface: there is nothing to practise
  // yet, and seeing the others arrive is the point of the gathering. Once the
  // run starts it goes behind the tap with everything else, because from then
  // on the room is something you earn each day rather than something you look
  // at. Same rule, moved to the right threshold.
  if (state.run.phase === 'gathering' || canSeeShared) {
    state.roster = await roster(env, run, person);
  }

  return json(state);
}

/**
 * Who is in. Names and lines only — never a mark, never a count of days, and
 * never who has contributed. The order is the order people arrived, which is
 * the one ordering that ranks nobody.
 */
async function roster(env, run, person) {
  const rows = await env.DB.prepare(
    `SELECT id, name, line, took_place_at FROM person
      WHERE run_id = ?1 AND is_host = 0 AND took_place_at IS NOT NULL AND left_at IS NULL
      ORDER BY took_place_at`,
  ).bind(run.id).all();

  const people = (rows.results || []).map((r) => ({
    name: r.id === person.id ? 'You' : r.name,
    line: r.line,
    mine: r.id === person.id,
  }));

  return {
    people,
    places: run.places,
    // "Four places left", never "six of ten".
    places_left: run.places ? Math.max(0, run.places - people.length) : null,
  };
}

async function contributionsFor(env, personId) {
  const rows = await env.DB.prepare(
    `SELECT amount, currency, created_at FROM contribution
      WHERE person_id = ?1 ORDER BY created_at DESC`,
  ).bind(personId).all();
  return rows.results || [];
}

/** This person's own marks and notes across the window. */
async function minePastYear(env, person, anchor, today) {
  const from = windowStart(anchor, today);
  const [marks, notes] = await Promise.all([
    env.DB.prepare(
      `SELECT on_date FROM day_mark WHERE person_id = ?1 AND on_date >= ?2 AND on_date <= ?3`,
    ).bind(person.id, from, today).all(),
    env.DB.prepare(
      `SELECT on_date, body FROM note
        WHERE person_id = ?1 AND removed_at IS NULL AND on_date >= ?2 AND on_date <= ?3`,
    ).bind(person.id, from, today).all(),
  ]);
  return {
    from,
    marks: new Set((marks.results || []).map((r) => r.on_date)),
    notes: new Map((notes.results || []).map((r) => [r.on_date, r.body])),
  };
}

function windowStart(anchor, today) {
  const earliest = addDays(today, -(WINDOW_DAYS - 1));
  return diffDays(anchor, earliest) > 0 ? earliest : anchor;
}

/**
 * The cohort, as counts only.
 *
 * Deliberately not a per-person array. A stable list of who-practised-when,
 * even without names, is a row per person by another route: two days of it and
 * you can follow one dot down the grid. Counts cannot be correlated, which is
 * what "nobody can be compared to anybody" has to mean once it is data.
 */
async function sharedView(env, { person, run }, anchor, today, mine) {
  const from = mine.from;
  // A closed run stops at its last day. Counting on to today would append a
  // tail of empty squares for every day since it ended.
  const until = isClosed(run, today) ? lastDay(run) : today;

  const [sizeRow, counts, notes] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM person WHERE run_id = ?1 AND left_at IS NULL AND is_host = 0`,
    ).bind(run.id).first(),
    env.DB.prepare(
      `SELECT dm.on_date AS d, COUNT(*) AS n
         FROM day_mark dm JOIN person p ON p.id = dm.person_id
        WHERE p.run_id = ?1 AND p.is_host = 0 AND dm.on_date >= ?2 AND dm.on_date <= ?3
        GROUP BY dm.on_date`,
    ).bind(run.id, from, until).all(),
    env.DB.prepare(
      `SELECT p.name AS who, n.body AS body, n.person_id AS pid
         FROM note n JOIN person p ON p.id = n.person_id
        WHERE p.run_id = ?1 AND n.on_date = ?2 AND n.removed_at IS NULL
        ORDER BY n.created_at`,
    ).bind(run.id, today).all(),
  ]);

  const byDate = new Map((counts.results || []).map((r) => [r.d, r.n]));

  const days = [];
  for (let d = from; diffDays(d, until) >= 0; d = addDays(d, 1)) {
    days.push({
      date: d,
      day_index: dayIndex(d, anchor),
      count: byDate.get(d) || 0,
      mine: mine.marks.has(d),
    });
  }

  return {
    size: sizeRow?.n || 1,
    from,
    today_count: byDate.get(today) || 0,
    days,
    notes: (notes.results || []).map((r) => ({
      who: r.pid === person.id ? 'You' : r.who,
      body: r.body,
      mine: r.pid === person.id,
    })),
  };
}

async function answersFor(env, personId) {
  const rows = await env.DB.prepare(
    `SELECT id, on_date, body, answer_body, answer_url, answered_at
       FROM private_message
      WHERE person_id = ?1 AND answered_at IS NOT NULL
      ORDER BY answered_at DESC LIMIT 10`,
  ).bind(personId).all();
  return (rows.results || []).map((r) => ({
    id: r.id, on_date: r.on_date, question: r.body,
    answer: r.answer_body, audio: r.answer_url, answered_at: r.answered_at,
  }));
}

// ---------------------------------------------------------------------------
// GET /api/invite  —  what the threshold shows before anyone has committed
// ---------------------------------------------------------------------------
// A GET, and it writes nothing: following the link from an email must never
// take a place on someone's behalf. The names and the lines are not here,
// because they belong to the people who have already committed.
export async function getInvite(env, { person, run }) {
  const today = localDate(Date.now(), person.timezone);

  const taken = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM person
      WHERE run_id = ?1 AND is_host = 0 AND took_place_at IS NOT NULL AND left_at IS NULL`,
  ).bind(run.id).first();

  const count = taken?.n || 0;

  return json({
    run: {
      name: run.name,
      blurb: run.blurb,
      meets: run.meets,
      standfirst: run.standfirst,
      starts_on: run.starts_on,
      length_days: run.length_days,
      week_labels: run.week_labels,
      days_until: daysUntil(run, today),
      places: run.places,
      places_left: run.places ? Math.max(0, run.places - count) : null,
      suggested_amount: run.suggested_amount,
      currency: run.currency,
    },
    person: { name: person.name, email: person.email, line: person.line },
    // Clicking the link a second time should simply let them back in.
    taken: person.took_place_at != null,
    full: run.places ? count >= run.places && person.took_place_at == null : false,
  });
}

// ---------------------------------------------------------------------------
// POST /api/place  —  taking it. The one write the invite can perform.
// ---------------------------------------------------------------------------
export async function postPlace(env, { person, run }, body) {
  // Already in: hand back the session they already have rather than making a
  // second click look like a failure.
  if (person.took_place_at != null) {
    const row = await env.DB.prepare(`SELECT token_enc FROM person WHERE id = ?1`)
      .bind(person.id).first();
    return json({ token: await unseal(env, row.token_enc), already: true });
  }

  if (run.places) {
    const taken = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM person
        WHERE run_id = ?1 AND is_host = 0 AND took_place_at IS NOT NULL AND left_at IS NULL`,
    ).bind(run.id).first();
    if ((taken?.n || 0) >= run.places) return bad(409, 'full');
  }

  const name = String(body?.name ?? person.name).trim().slice(0, NAME_MAX);
  if (!name) return bad(400, 'name');

  const line = String(body?.line ?? '').trim().slice(0, LINE_MAX) || null;

  const timezone = typeof body?.timezone === 'string' && validTimezone(body.timezone)
    ? body.timezone : person.timezone;
  const nudgeHour = typeof body?.nudge_hour === 'string' && minutesOf(body.nudge_hour) != null
    ? body.nudge_hour : person.nudge_hour;

  // A fresh session, so the invite is genuinely spent rather than doubling as
  // a login for ever.
  const { token, token_hash, token_enc } = await mintToken(env);
  const joinedOn = localDate(Date.now(), timezone);

  await env.DB.prepare(
    `UPDATE person
        SET took_place_at = unixepoch(), setup_at = unixepoch(),
            name = ?1, line = ?2, timezone = ?3, nudge_hour = ?4,
            joined_on = CASE WHEN ?5 = 'fixed' THEN joined_on ELSE ?6 END,
            token_hash = ?7, token_enc = ?8, token_issued_at = unixepoch()
      WHERE id = ?9`,
  ).bind(name, line, timezone, nudgeHour, run.mode, joinedOn, token_hash, token_enc, person.id).run();

  return json({ token, already: false });
}

// ---------------------------------------------------------------------------
// GET /api/day?date=YYYY-MM-DD
// ---------------------------------------------------------------------------
export async function getDay(env, { person, run }, url) {
  const date = url.searchParams.get('date');
  if (!isDate(date)) return bad(400, 'bad date');

  const today = localDate(Date.now(), person.timezone);
  if (diffDays(date, today) < 0) return bad(400, 'not yet');

  // Nothing before the tap — including a past day. After a run closes, the
  // same substitution as in getState: having been in it stands in for today.
  const marked = await env.DB.prepare(
    `SELECT 1 FROM day_mark WHERE person_id = ?1 AND on_date = ?2`,
  ).bind(person.id, today).first();

  if (!marked) {
    const ever = isClosed(run, today) && await env.DB.prepare(
      `SELECT 1 FROM day_mark WHERE person_id = ?1 LIMIT 1`,
    ).bind(person.id).first();
    if (!ever) return bad(404, 'not yet');
  }

  const anchor = anchorOf(run, person);
  const [count, notes, mineRow] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM day_mark dm JOIN person p ON p.id = dm.person_id
        WHERE p.run_id = ?1 AND p.is_host = 0 AND dm.on_date = ?2`,
    ).bind(run.id, date).first(),
    env.DB.prepare(
      `SELECT p.name AS who, n.body AS body, n.person_id AS pid
         FROM note n JOIN person p ON p.id = n.person_id
        WHERE p.run_id = ?1 AND n.on_date = ?2 AND n.removed_at IS NULL
        ORDER BY n.created_at`,
    ).bind(run.id, date).all(),
    env.DB.prepare(
      `SELECT 1 AS m FROM day_mark WHERE person_id = ?1 AND on_date = ?2`,
    ).bind(person.id, date).first(),
  ]);

  return json({
    date,
    day_index: dayIndex(date, anchor),
    count: count?.n || 0,
    mine: !!mineRow,
    notes: (notes.results || []).map((r) => ({
      who: r.pid === person.id ? 'You' : r.who, body: r.body, mine: r.pid === person.id,
    })),
  });
}

// ---------------------------------------------------------------------------
// POST /api/mark  — the only thing that writes a practice, and only on a POST
// ---------------------------------------------------------------------------
export async function postMark(env, { person, run }, body) {
  const today = localDate(Date.now(), person.timezone);
  const date = body?.date || today;
  if (!isDate(date)) return bad(400, 'bad date');

  const allowed = markableDates(run, today);
  if (!allowed.includes(date)) return bad(409, 'not markable');

  const late = date !== today ? 1 : 0;

  // Idempotent: tapping twice, or a queued offline mark arriving after the
  // online one, must not be an error. The tap always succeeds.
  await env.DB.prepare(
    `INSERT INTO day_mark (person_id, on_date, late) VALUES (?1, ?2, ?3)
     ON CONFLICT (person_id, on_date) DO NOTHING`,
  ).bind(person.id, date, late).run();

  return getState(env, { person, run });
}

// ---------------------------------------------------------------------------
// POST /api/note
// ---------------------------------------------------------------------------
export async function postNote(env, { person, run }, body) {
  const today = localDate(Date.now(), person.timezone);
  const date = body?.date || today;
  if (!isDate(date)) return bad(400, 'bad date');

  // No notes on a late day — the moment has passed.
  if (date !== today) return bad(409, 'today only');

  const text = String(body?.body ?? '').trim();
  if (!text) return bad(400, 'empty');
  if (text.length > NOTE_MAX) return bad(400, 'too long');

  const marked = await env.DB.prepare(
    `SELECT 1 FROM day_mark WHERE person_id = ?1 AND on_date = ?2`,
  ).bind(person.id, date).first();
  if (!marked) return bad(409, 'mark first');

  await env.DB.prepare(
    `INSERT INTO note (person_id, on_date, body) VALUES (?1, ?2, ?3)
     ON CONFLICT (person_id, on_date) DO UPDATE SET body = ?3, removed_at = NULL`,
  ).bind(person.id, date, text).run();

  return getState(env, { person, run });
}

// ---------------------------------------------------------------------------
// POST /api/message — black is John
// ---------------------------------------------------------------------------
export async function postMessage(env, { person, run }, body) {
  const text = String(body?.body ?? '').trim();
  if (!text) return bad(400, 'empty');
  if (text.length > MESSAGE_MAX) return bad(400, 'too long');

  const today = localDate(Date.now(), person.timezone);
  await env.DB.prepare(
    `INSERT INTO private_message (person_id, on_date, body) VALUES (?1, ?2, ?3)`,
  ).bind(person.id, today, text).run();

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// PATCH /api/settings
// ---------------------------------------------------------------------------
export async function patchSettings(env, ctx, body) {
  const { person, run } = ctx;
  const sets = [];
  const binds = [];

  if (typeof body?.name === 'string') {
    const name = body.name.trim().slice(0, NAME_MAX);
    if (!name) return bad(400, 'name');
    sets.push(`name = ?${sets.length + 1}`); binds.push(name);
  }
  if (typeof body?.timezone === 'string') {
    if (!validTimezone(body.timezone)) return bad(400, 'timezone');
    sets.push(`timezone = ?${sets.length + 1}`); binds.push(body.timezone);
  }
  // Why you're here. Written once at joining, changeable after — people arrive
  // meaning one thing and find they meant another.
  if (typeof body?.line === 'string') {
    const line = body.line.trim().slice(0, LINE_MAX);
    sets.push(`line = ?${sets.length + 1}`); binds.push(line || null);
  }
  if (typeof body?.nudge_hour === 'string') {
    if (minutesOf(body.nudge_hour) == null) return bad(400, 'nudge_hour');
    sets.push(`nudge_hour = ?${sets.length + 1}`); binds.push(body.nudge_hour);
  }
  for (const flag of ['nudge_on', 'notes_on']) {
    if (typeof body?.[flag] === 'boolean') {
      sets.push(`${flag} = ?${sets.length + 1}`); binds.push(body[flag] ? 1 : 0);
    }
  }
  // First run is finished on the server's say-so, so a second device does not
  // ask them to set up again.
  if (body?.setup === true) sets.push('setup_at = unixepoch()');

  if (!sets.length) return bad(400, 'nothing to change');

  binds.push(person.id);
  await env.DB.prepare(
    `UPDATE person SET ${sets.join(', ')} WHERE id = ?${binds.length}`,
  ).bind(...binds).run();

  const fresh = await env.DB.prepare(`SELECT * FROM person WHERE id = ?1`).bind(person.id).first();
  return getState(env, {
    run,
    person: {
      ...person,
      name: fresh.name, timezone: fresh.timezone, nudge_hour: fresh.nudge_hour,
      nudge_on: !!fresh.nudge_on, notes_on: !!fresh.notes_on, setup_at: fresh.setup_at,
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/settings/revoke — the link is the session, so this is "log out
// everywhere". The new one is emailed, never returned in the response.
// ---------------------------------------------------------------------------
export async function postRevoke(env, { person }) {
  const { token, token_hash, token_enc } = await mintToken(env);
  await env.DB.prepare(
    `UPDATE person SET token_hash = ?1, token_enc = ?2, token_issued_at = unixepoch() WHERE id = ?3`,
  ).bind(token_hash, token_enc, person.id).run();

  await sendWelcomeBack(env, person, logUrl(env, token));
  return json({ ok: true, sent_to: person.email });
}
