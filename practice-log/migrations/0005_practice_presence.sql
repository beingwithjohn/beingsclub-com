-- A small, browser-cropped picture used only when this person has a mark on
-- the day being viewed. It is never part of an account roster for participants.
-- The client makes a 192px JPEG; the ceiling also permits an existing PNG or
-- WebP of comparable size without turning D1 into an image store.
ALTER TABLE person ADD COLUMN profile_image TEXT
  CHECK (profile_image IS NULL OR length(profile_image) <= 70000);
