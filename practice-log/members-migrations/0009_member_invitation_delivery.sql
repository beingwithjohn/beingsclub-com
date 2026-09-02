-- Adding somebody through the host tools now sends a personal invitation.
-- Keep delivery state beside the membership so John can see whether the
-- invitation arrived at Resend and deliberately retry a failed delivery.

ALTER TABLE member ADD COLUMN invitation_sent_at INTEGER;
ALTER TABLE member ADD COLUMN invitation_last_attempt_at INTEGER;
ALTER TABLE member ADD COLUMN invitation_last_error TEXT;
