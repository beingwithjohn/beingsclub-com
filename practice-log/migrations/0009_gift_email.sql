-- Keep donation prompts considerate by remembering the email Stripe collected.
-- This is matched only at request time; gifts remain independent of membership
-- and do not gain a member_id or any access benefit.

ALTER TABLE gift ADD COLUMN email TEXT NOT NULL DEFAULT '';

-- Recover the address for earlier gifts when Stripe linked them to a known
-- monthly-giving customer or subscription.
UPDATE gift
   SET email = COALESCE((
     SELECT giving_subscription.email
       FROM giving_subscription
      WHERE giving_subscription.email <> ''
        AND (
          giving_subscription.stripe_subscription_ref = gift.stripe_subscription_ref
          OR (
            gift.stripe_customer_ref <> ''
            AND giving_subscription.stripe_customer_ref = gift.stripe_customer_ref
          )
        )
      ORDER BY giving_subscription.updated_at DESC
      LIMIT 1
   ), '')
 WHERE email = '';

CREATE INDEX IF NOT EXISTS gift_by_email
  ON gift (email, created_at DESC)
  WHERE email <> '';
