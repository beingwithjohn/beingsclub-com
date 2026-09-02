-- A verified email can enter the membership threshold without becoming a
-- member. Member data remains behind the existing member and agreement gates.

CREATE TABLE prospect (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  booking_uid TEXT UNIQUE,
  booking_reschedule_uid TEXT,
  booking_title TEXT,
  booking_start_at INTEGER,
  booking_end_at INTEGER,
  booking_timezone TEXT,
  booking_status TEXT,
  booking_join_url TEXT,
  booking_updated_at INTEGER,
  alternate_time_note TEXT,
  alternate_time_note_at INTEGER,
  granted_at INTEGER,
  granted_by INTEGER REFERENCES member(id),
  member_id INTEGER REFERENCES member(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX prospect_booking_status ON prospect(booking_status, booking_start_at);
CREATE INDEX prospect_granted ON prospect(granted_at);

CREATE TABLE prospect_auth_challenge (
  id TEXT PRIMARY KEY,
  prospect_id INTEGER NOT NULL REFERENCES prospect(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX prospect_auth_challenge_expiry ON prospect_auth_challenge(expires_at);

CREATE TABLE prospect_auth_request (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX prospect_auth_request_email_time ON prospect_auth_request(email_hash, created_at);
CREATE INDEX prospect_auth_request_ip_time ON prospect_auth_request(ip_hash, created_at);

CREATE TABLE prospect_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id INTEGER NOT NULL REFERENCES prospect(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX prospect_session_prospect ON prospect_session(prospect_id);
CREATE INDEX prospect_session_expiry ON prospect_session(expires_at);
