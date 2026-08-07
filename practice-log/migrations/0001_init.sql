-- The Practice Log.
--
-- Two shapes of run share one set of tables:
--
--   evergreen  joinable any day, year round, no end. Each person's day one is
--              the day they joined, so "day 18" means eighteen days for them.
--   fixed      a cohort with a start date and a length. Everyone is on the same
--              day number. Beyond Belief is one of these: 2026-09-16, 35 days.
--
-- Everything below is written so the only difference between them is the
-- anchor a day index counts from, and whether there is a last day.
--
-- A mark is a person, a local calendar date and a timestamp. Nothing else is
-- stored about a practice — not a duration, not a quality, not a kind.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- run
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS run (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('evergreen', 'fixed')),

  -- fixed runs only; NULL on evergreen
  starts_on     TEXT,                 -- 'YYYY-MM-DD', the shared day zero
  length_days   INTEGER,              -- 35 for Beyond Belief

  -- Optional names for the weeks, as a JSON array. Beyond Belief uses the five
  -- principles; an evergreen run has none and the weeks are dated instead.
  week_labels   TEXT,

  -- One line under the log's title. No cohort news, no counts.
  standfirst    TEXT,

  -- ---- the room ---------------------------------------------------------
  --
  -- A fixed run has a third phase before the two above: the stretch between
  -- the first invitation and day one, while people are taking their places.
  -- It needs no dates of its own — it is simply "before starts_on" — but it
  -- does need to know how many places there are, and what people are joining.

  places        INTEGER,              -- ten, for a Sit. NULL means no limit.

  -- What a Sit is, shown on the threshold before anyone has committed.
  blurb         TEXT,
  -- "Wednesdays, 6:30–7:45pm UK" — a Sit meets live once a week.
  meets         TEXT,

  -- Money is never a gate here. This is only what the contribution page
  -- suggests, in the smallest currency unit; NULL suggests nothing at all.
  suggested_amount INTEGER,
  currency         TEXT NOT NULL DEFAULT 'gbp',

  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),

  CHECK (mode = 'evergreen' OR (starts_on IS NOT NULL AND length_days IS NOT NULL))
);

-- ---------------------------------------------------------------------------
-- person
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS person (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL REFERENCES run(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,      -- what the others see on their notes
  email           TEXT NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'Europe/London',  -- IANA; the day rolls here

  nudge_hour      TEXT NOT NULL DEFAULT '07:00',  -- 'HH:MM', 24h, their local time
  nudge_on        INTEGER NOT NULL DEFAULT 1,
  notes_on        INTEGER NOT NULL DEFAULT 1,

  -- The magic link is the session.
  --
  -- Unlike a password, this has to be reproducible: every email carries the
  -- link, so the sender must be able to rebuild it. A hash alone cannot do
  -- that, and plain text would make a copy of this table a set of live logins.
  -- So both — the hash is what a request is looked up by, and the sealed copy
  -- is what the mailer opens, using a key that lives in the Worker's secrets
  -- and never in the database.
  token_hash      TEXT NOT NULL UNIQUE,
  token_enc       TEXT NOT NULL,
  token_issued_at INTEGER NOT NULL DEFAULT (unixepoch()),

  is_host         INTEGER NOT NULL DEFAULT 0,

  -- Personal day zero on an evergreen run. Local date, set at signup.
  joined_on       TEXT NOT NULL,
  left_at         TEXT,               -- local date they stopped; marks stay, column stops

  -- First run is shown once, on the server's say-so rather than the device's,
  -- so opening the link on a second phone does not ask them to set up again.
  setup_at        INTEGER,

  -- ---- taking a place -----------------------------------------------------
  --
  -- Joining takes a conversation and a mutual yes. The yes is John sending an
  -- invite; the place is theirs once they accept it. Until then the row exists
  -- but is not one of the ten, is not on the roster, and cannot sign in.
  --
  -- The invite is one-time and separate from the session token: it is handed
  -- out before there is anyone to be, and is spent on the way in.
  invite_hash     TEXT UNIQUE,
  invite_sent_at  INTEGER,
  took_place_at   INTEGER,            -- NULL until they accept

  -- One line, written once at joining. Why you're here. Shown beside your name
  -- to the others who have taken a place, and to nobody else. Capped like a
  -- note, so nobody freezes in front of a blank page.
  line            TEXT CHECK (line IS NULL OR length(line) <= 100),

  last_seen_at    INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),

  UNIQUE (run_id, email)
);

CREATE INDEX IF NOT EXISTS person_by_run ON person (run_id) WHERE left_at IS NULL;

-- ---------------------------------------------------------------------------
-- day_mark — the whole point of the thing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS day_mark (
  person_id  INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  on_date    TEXT NOT NULL,           -- 'YYYY-MM-DD' in the person's own timezone
  marked_at  INTEGER NOT NULL DEFAULT (unixepoch()),

  -- Added the next day under the one-day grace. Kept only so the API can refuse
  -- a note on it. It is never shown, never counted separately, never exported.
  late       INTEGER NOT NULL DEFAULT 0,

  PRIMARY KEY (person_id, on_date)
);

CREATE INDEX IF NOT EXISTS mark_by_date ON day_mark (on_date);

-- ---------------------------------------------------------------------------
-- note — a line for the others, capped at 100 characters, notifies nobody
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS note (
  person_id   INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  on_date     TEXT NOT NULL,
  body        TEXT NOT NULL CHECK (length(body) <= 100),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),

  -- John can remove any note. The person's mark stays; they are not told.
  removed_at  INTEGER,

  PRIMARY KEY (person_id, on_date),
  FOREIGN KEY (person_id, on_date) REFERENCES day_mark(person_id, on_date) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS note_by_date ON note (on_date) WHERE removed_at IS NULL;

-- ---------------------------------------------------------------------------
-- private_message — black is John. Never leaves this table for anyone else.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private_message (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id    INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  on_date      TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),

  answer_body  TEXT,
  answer_url   TEXT,                  -- John answers by voice; a link to the audio
  answered_at  INTEGER
);

CREATE INDEX IF NOT EXISTS message_unanswered ON private_message (created_at) WHERE answered_at IS NULL;

-- ---------------------------------------------------------------------------
-- send_log — what has gone out, so nothing goes out twice
-- ---------------------------------------------------------------------------
-- scope is the local date for a daily send, or the literal 'run' for the ones
-- capped at one per person for the whole run (E1, E6, E7).
-- ---------------------------------------------------------------------------
-- contribution — never a gate, only ever a thank you
-- ---------------------------------------------------------------------------
-- A place is not bought. Money is decoupled from access entirely: someone can
-- take their place, practise all thirty-five days and contribute nothing, and
-- nothing in the product will treat them differently or mention it. This table
-- exists so John can see what came in, and so a person can see their own.
--
-- Repeatable on purpose — "a first contribution" implies there may be others.
CREATE TABLE IF NOT EXISTS contribution (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id     INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,

  amount        INTEGER NOT NULL,     -- smallest currency unit, as Stripe sends it
  currency      TEXT NOT NULL,

  -- Stripe's own id, so a webhook delivered twice records one contribution.
  stripe_ref    TEXT NOT NULL UNIQUE,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS contribution_by_person ON contribution (person_id);

-- ---------------------------------------------------------------------------
-- send_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS send_log (
  person_id  INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,           -- 'welcome'|'day_one'|'daily'|'week'|'answer'|'still_here'|'last_day'
  scope      TEXT NOT NULL,
  sent_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (person_id, kind, scope)
);
