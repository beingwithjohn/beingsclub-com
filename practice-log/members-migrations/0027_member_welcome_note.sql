-- A welcome sent after a first conversation may carry its own personal note.
-- Keep it separate from the note used for a host-authored initial invitation.

ALTER TABLE member ADD COLUMN welcome_note TEXT;
