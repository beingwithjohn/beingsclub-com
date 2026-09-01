-- The member agreement is a first-entry gate, not a passive page. Versioning
-- lets a future material change ask for a fresh affirmative agreement.
ALTER TABLE member ADD COLUMN agreement_version TEXT;
ALTER TABLE member ADD COLUMN agreement_accepted_at INTEGER;
