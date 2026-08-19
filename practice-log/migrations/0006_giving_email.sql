-- Remember the email Stripe collected for a monthly giver. This does not link
-- giving to a Practice Log person: there is no person_id or foreign key. It
-- only lets somebody holding the private Practice Log link for the same email
-- ask Stripe for its secure management page.

ALTER TABLE giving_subscription ADD COLUMN email TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS giving_subscription_by_email
  ON giving_subscription (email, updated_at DESC)
  WHERE email <> '';
