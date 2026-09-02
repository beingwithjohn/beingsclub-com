-- The host is notified only after a member finishes the first-entry welcome,
-- not when an address is added or a login code is requested. Existing joined
-- members predate this workflow and must never trigger a retrospective notice.

ALTER TABLE member ADD COLUMN onboarding_completed_at INTEGER;
ALTER TABLE member ADD COLUMN host_join_notice_sent_at INTEGER;
ALTER TABLE member ADD COLUMN host_join_notice_last_attempt_at INTEGER;
ALTER TABLE member ADD COLUMN host_join_notice_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE member ADD COLUMN host_join_notice_last_error TEXT;

UPDATE member
   SET onboarding_completed_at = COALESCE(joined_at, updated_at),
       host_join_notice_sent_at = COALESCE(joined_at, updated_at)
 WHERE joined_at IS NOT NULL;
