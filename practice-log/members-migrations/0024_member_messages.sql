-- One private, continuous conversation between each member and John.
-- Messages remain attached to the member record and are never visible to
-- another member.

CREATE TABLE member_message (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('member', 'host')),
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  source_page TEXT,
  created_at INTEGER NOT NULL,
  member_read_at INTEGER,
  host_read_at INTEGER
);

CREATE INDEX member_message_thread
  ON member_message(member_id, created_at, id);

CREATE INDEX member_message_host_unread
  ON member_message(host_read_at, member_id)
  WHERE sender_role = 'member';

CREATE INDEX member_message_member_unread
  ON member_message(member_read_at, member_id)
  WHERE sender_role = 'host';
