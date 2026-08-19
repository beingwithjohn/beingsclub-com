-- An optional Sunday digest of replies John has chosen to share.
--
-- `shared_at` records when a reply first became public. `updated_at` cannot do
-- that job because changing John's public context should not notify everybody
-- a second time.

ALTER TABLE person ADD COLUMN reply_digest_on INTEGER NOT NULL DEFAULT 0;

ALTER TABLE host_reply ADD COLUMN shared_at INTEGER;

UPDATE host_reply
   SET shared_at = created_at
 WHERE visibility = 'shared' AND shared_at IS NULL;

CREATE INDEX host_reply_shared_at ON host_reply (shared_at DESC)
  WHERE visibility = 'shared';
