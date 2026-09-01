-- Publishing can create a fresh Zoom meeting. This short-lived claim prevents
-- an ordinary double-click or retry from creating two meetings at once.

ALTER TABLE salon ADD COLUMN zoom_provisioning_at INTEGER;
