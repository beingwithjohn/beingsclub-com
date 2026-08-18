-- The log is one general, evergreen tool. Courses grant a temporary private
-- line to John; they do not need their own copy of the log.

ALTER TABLE run ADD COLUMN public_join INTEGER NOT NULL DEFAULT 0
  CHECK (public_join IN (0, 1));

ALTER TABLE person ADD COLUMN message_from TEXT;
ALTER TABLE person ADD COLUMN message_until TEXT;

-- There must be one unambiguous front door. A partial unique index allows all
-- other (historic or private) runs to remain closed to self-service entry.
CREATE UNIQUE INDEX IF NOT EXISTS one_public_run ON run (public_join)
  WHERE public_join = 1;

-- The existing evergreen log is the public tool. Fixed runs remain readable,
-- but a course no longer needs a separate run in order to grant John access.
UPDATE run SET public_join = 1 WHERE slug = 'practice' AND mode = 'evergreen';

