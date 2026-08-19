-- Giving is independent of Practice Log identity. Stripe remains the billing
-- authority; these tables provide an idempotent record without joining a gift
-- to a participant, a practice history, or a place in a Sit.

CREATE TABLE IF NOT EXISTS gift (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  amount                     INTEGER NOT NULL,
  currency                   TEXT NOT NULL,
  cadence                    TEXT NOT NULL CHECK (cadence IN ('once', 'monthly')),
  stripe_ref                 TEXT NOT NULL UNIQUE,
  stripe_customer_ref        TEXT NOT NULL DEFAULT '',
  stripe_subscription_ref    TEXT NOT NULL DEFAULT '',
  created_at                 INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS giving_subscription (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_customer_ref        TEXT NOT NULL,
  stripe_subscription_ref    TEXT NOT NULL UNIQUE,
  amount                     INTEGER NOT NULL,
  currency                   TEXT NOT NULL,
  status                     TEXT NOT NULL,
  cancel_at_period_end       INTEGER NOT NULL DEFAULT 0,
  event_created              INTEGER NOT NULL DEFAULT 0,
  created_at                 INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at                 INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS giving_subscription_by_customer
  ON giving_subscription (stripe_customer_ref, updated_at DESC);
