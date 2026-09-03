-- Host-managed in-person happenings. Drafts remain private until deliberately
-- published; images stay in the existing private member-media bucket.

CREATE TABLE in_person_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/London',
  location TEXT NOT NULL,
  booking_url TEXT NOT NULL,
  image_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  published_at INTEGER,
  created_by INTEGER NOT NULL REFERENCES member(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (ends_at > starts_at)
);

CREATE INDEX in_person_event_status_start
  ON in_person_event(status, starts_at);
