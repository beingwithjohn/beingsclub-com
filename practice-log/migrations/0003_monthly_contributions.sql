-- Optional monthly contributions. They never grant or change access.
--
-- The amount is chosen by the person before Stripe Checkout opens because
-- Stripe's own custom-amount control is available only for one-off payments.
-- Stripe remains the authority for billing; this table holds only enough to
-- show the person their current arrangement and open Stripe's manage page.

CREATE TABLE IF NOT EXISTS contribution_subscription (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id                  INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  stripe_customer_ref        TEXT NOT NULL,
  stripe_subscription_ref    TEXT NOT NULL UNIQUE,
  amount                     INTEGER NOT NULL,
  currency                   TEXT NOT NULL,
  status                     TEXT NOT NULL,
  cancel_at_period_end       INTEGER NOT NULL DEFAULT 0,
  -- Stripe does not promise webhook ordering. An older status event must not
  -- arrive late and reopen something that a newer event already ended.
  event_created              INTEGER NOT NULL DEFAULT 0,
  created_at                 INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at                 INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS contribution_subscription_by_person
  ON contribution_subscription (person_id, updated_at DESC);
