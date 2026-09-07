-- First-conversation pauses keep people out of the booking calendar without
-- losing who invited them or turning Notion into an identity authority.

CREATE TABLE club_admissions_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  paused_at INTEGER,
  paused_by INTEGER REFERENCES member(id),
  reopened_at INTEGER,
  updated_at INTEGER NOT NULL
);

INSERT INTO club_admissions_state (id, updated_at) VALUES (1, unixepoch());

ALTER TABLE prospect ADD COLUMN invited_by_member_id INTEGER REFERENCES member(id);
ALTER TABLE prospect ADD COLUMN waitlist_joined_at INTEGER;
ALTER TABLE prospect ADD COLUMN waitlist_status TEXT;
ALTER TABLE prospect ADD COLUMN waitlist_offered_at INTEGER;
ALTER TABLE prospect ADD COLUMN waitlist_removed_at INTEGER;
ALTER TABLE prospect ADD COLUMN waitlist_host_note TEXT;

CREATE INDEX idx_prospect_waitlist_active
  ON prospect(waitlist_status, waitlist_removed_at, waitlist_joined_at);

CREATE TABLE prospect_booking_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id INTEGER NOT NULL REFERENCES prospect(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX idx_prospect_booking_link_prospect
  ON prospect_booking_link(prospect_id, revoked_at);

CREATE TABLE prospect_waitlist_notion_sync (
  prospect_id INTEGER PRIMARY KEY REFERENCES prospect(id) ON DELETE CASCADE,
  notion_page_id TEXT,
  pending_at INTEGER NOT NULL,
  last_attempt_at INTEGER,
  synced_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX idx_prospect_waitlist_notion_pending
  ON prospect_waitlist_notion_sync(synced_at, last_attempt_at, attempts);
