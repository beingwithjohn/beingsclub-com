-- Complete the member-controlled Salon reminder set from the original member
-- design. New members still default to announcement, week and day; month and
-- hour are available but opt-in.

ALTER TABLE member_email_pref ADD COLUMN salon_month INTEGER NOT NULL DEFAULT 0
  CHECK (salon_month IN (0, 1));

ALTER TABLE member_email_pref ADD COLUMN salon_hour INTEGER NOT NULL DEFAULT 0
  CHECK (salon_hour IN (0, 1));
