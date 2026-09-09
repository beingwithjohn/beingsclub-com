-- The first announcement of every Salon is essential Club mail. Preserve the
-- old column for compatibility, but retire any earlier opt-out values.

UPDATE member_email_pref SET salon_announced = 1 WHERE salon_announced != 1;
