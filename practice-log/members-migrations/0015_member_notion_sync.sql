-- Notion is a host-facing mirror of the membership list, never the authority
-- for access. A durable outbox lets a membership grant succeed even when
-- Notion is unavailable; the half-hourly Worker schedule retries pending rows.

CREATE TABLE member_notion_sync (
  member_id INTEGER PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
  notion_page_id TEXT,
  pending_at INTEGER NOT NULL,
  last_attempt_at INTEGER,
  synced_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX member_notion_sync_pending
  ON member_notion_sync(synced_at, last_attempt_at, attempts);
