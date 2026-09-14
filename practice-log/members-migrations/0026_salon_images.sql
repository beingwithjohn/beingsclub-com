-- Each planned Salon can carry its own optional image. The object itself lives
-- in the private member-media bucket; only its scoped key is stored here.

ALTER TABLE salon ADD COLUMN image_key TEXT;
ALTER TABLE salon ADD COLUMN image_alt TEXT;
