-- A Salon announcement may carry a small, deliberately chosen selection of
-- Field Notes from an earlier Salon. The ordered JSON array contains only
-- source type + id pairs; the live note remains the source of the words.

ALTER TABLE salon ADD COLUMN roundup_items TEXT;
