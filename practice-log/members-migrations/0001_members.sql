-- Beings Club membership and access. This database is separate from all
-- meditation/practice data even while both APIs share one Worker.

CREATE TABLE member (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  website TEXT,
  profile_line TEXT,
  profile_image TEXT,
  is_host INTEGER NOT NULL DEFAULT 0 CHECK (is_host IN (0, 1)),
  invited_at INTEGER NOT NULL,
  joined_at INTEGER,
  disabled_at INTEGER,
  left_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE auth_challenge (
  id TEXT PRIMARY KEY,
  member_id INTEGER REFERENCES member(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX auth_challenge_expiry ON auth_challenge(expires_at);

CREATE TABLE auth_request (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX auth_request_email_time ON auth_request(email_hash, created_at);
CREATE INDEX auth_request_ip_time ON auth_request(ip_hash, created_at);

CREATE TABLE member_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX member_session_member ON member_session(member_id);
CREATE INDEX member_session_expiry ON member_session(expires_at);

-- The first approved address and the first host. John still signs in through
-- exactly the same email-code flow as every future member.
INSERT INTO member (
  email, display_name, is_host, invited_at, created_at, updated_at
) VALUES (
  'john@spacetobe.xyz', 'John', 1,
  unixepoch(), unixepoch(), unixepoch()
);
