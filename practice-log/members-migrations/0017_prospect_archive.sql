-- Keep first-conversation history while letting the host resolve the working queue.

ALTER TABLE prospect ADD COLUMN archived_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_prospect_active_queue
  ON prospect(archived_at, granted_at, booking_status, updated_at);
