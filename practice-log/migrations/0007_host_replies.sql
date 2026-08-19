-- Replies from John, private or shared.
--
-- The source person is retained only so their own log can put a shared reply
-- under "For you" as well as "Shared", and so account deletion can remove
-- every reply and recording connected to them. Participant endpoints never
-- return the original private message or practice note.

CREATE TABLE host_reply (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_person_id   INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  source_message_id     INTEGER REFERENCES private_message(id) ON DELETE CASCADE,
  source_note_date      TEXT,

  visibility            TEXT NOT NULL DEFAULT 'private'
                          CHECK (visibility IN ('private', 'shared')),
  public_context        TEXT CHECK (public_context IS NULL OR length(public_context) <= 500),
  body                  TEXT CHECK (body IS NULL OR length(body) <= 4000),

  -- New recordings are private R2 objects. `legacy_audio_url` preserves any
  -- replies made before the in-app recorder existed without making new audio
  -- public by URL.
  audio_object          TEXT UNIQUE,
  audio_mime            TEXT,
  audio_ms              INTEGER,
  legacy_audio_url      TEXT,

  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch()),

  CHECK ((source_message_id IS NOT NULL) != (source_note_date IS NOT NULL)),
  CHECK (body IS NOT NULL OR audio_object IS NOT NULL OR legacy_audio_url IS NOT NULL),
  CHECK (visibility = 'private' OR (public_context IS NOT NULL AND length(trim(public_context)) > 0)),
  CHECK (audio_ms IS NULL OR (audio_ms > 0 AND audio_ms <= 1200000))
);

CREATE UNIQUE INDEX one_reply_per_message ON host_reply (source_message_id)
  WHERE source_message_id IS NOT NULL;

CREATE UNIQUE INDEX one_reply_per_note ON host_reply (recipient_person_id, source_note_date)
  WHERE source_message_id IS NULL AND source_note_date IS NOT NULL;

CREATE INDEX host_reply_for_person ON host_reply (recipient_person_id, created_at DESC);
CREATE INDEX host_reply_shared ON host_reply (created_at DESC) WHERE visibility = 'shared';

-- Preserve any answers already sent through the former URL-based reply form.
INSERT INTO host_reply
  (recipient_person_id, source_message_id, visibility, body, legacy_audio_url,
   created_at, updated_at)
SELECT person_id, id, 'private', answer_body, answer_url, answered_at, answered_at
  FROM private_message
 WHERE answered_at IS NOT NULL
   AND (answer_body IS NOT NULL OR answer_url IS NOT NULL);
