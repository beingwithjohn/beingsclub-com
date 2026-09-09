-- Pausing is the reversible way to stop all Club mail and disappear from the
-- member experience without leaving Beings Club or losing history.

ALTER TABLE member ADD COLUMN paused_at INTEGER;

CREATE INDEX member_paused ON member(paused_at);

-- The post-Salon Field Note invitation is essential for active members.
-- Keep the legacy preference column true for compatibility with old clients.
UPDATE member_email_pref SET field_notes = 1 WHERE field_notes != 1;
