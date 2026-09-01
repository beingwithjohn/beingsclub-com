-- Member-controlled Club email and a reversible record of how somebody chose
-- to leave. Access codes are essential service mail and intentionally do not
-- live in these preferences.

CREATE TABLE member_email_pref (
  member_id INTEGER PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
  salon_announced INTEGER NOT NULL DEFAULT 1 CHECK (salon_announced IN (0, 1)),
  salon_week INTEGER NOT NULL DEFAULT 1 CHECK (salon_week IN (0, 1)),
  salon_day INTEGER NOT NULL DEFAULT 1 CHECK (salon_day IN (0, 1)),
  field_notes INTEGER NOT NULL DEFAULT 1 CHECK (field_notes IN (0, 1)),
  quiet INTEGER NOT NULL DEFAULT 0 CHECK (quiet IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- A claim is written before sending. A retry may miss one email after an
-- upstream failure, but can never send the same Club email twice.
CREATE TABLE club_send_log (
  member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, kind, scope)
);

ALTER TABLE member ADD COLUMN leave_note_policy TEXT
  CHECK (leave_note_policy IN ('keep_signed', 'anonymise', 'remove'));

