-- Keep a prospective member's own reason for approaching the Club beside the
-- first-conversation record so the host can read it before they meet.

ALTER TABLE prospect ADD COLUMN joining_reason TEXT;
ALTER TABLE prospect ADD COLUMN joining_reason_at INTEGER;
