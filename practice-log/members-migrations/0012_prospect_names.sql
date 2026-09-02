-- A prospective member shares a name before entering the calendar so the
-- private threshold can greet them personally and carry it into membership.

ALTER TABLE prospect ADD COLUMN display_name TEXT;
