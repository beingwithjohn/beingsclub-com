-- Host broadcasts are delivered as separate one-to-one messages. The unique
-- request key and per-member index make a retried click safe.

CREATE TABLE member_message_broadcast (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_key TEXT NOT NULL UNIQUE,
  sender_member_id INTEGER NOT NULL REFERENCES member(id),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

ALTER TABLE member_message
  ADD COLUMN broadcast_id INTEGER REFERENCES member_message_broadcast(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX member_message_broadcast_recipient
  ON member_message(broadcast_id, member_id)
  WHERE broadcast_id IS NOT NULL;
