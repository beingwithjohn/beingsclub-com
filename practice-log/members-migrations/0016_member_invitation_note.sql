-- A host invitation may carry a short personal note. Keep it on the member so
-- an explicit resend preserves John's words rather than silently dropping them.

ALTER TABLE member ADD COLUMN invitation_note TEXT;
