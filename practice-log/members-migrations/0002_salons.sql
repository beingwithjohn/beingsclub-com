-- A Salon is drafted privately, then deliberately published to members.
-- Announcement email is a separate, deliberate action after publication.

CREATE TABLE salon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  host_note TEXT,
  starts_at INTEGER,
  timezone TEXT NOT NULL DEFAULT 'Europe/London',
  duration_minutes INTEGER NOT NULL DEFAULT 90
    CHECK (duration_minutes BETWEEN 30 AND 240),
  zoom_join_url TEXT,
  zoom_meeting_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'closed', 'cancelled')),
  published_at INTEGER,
  announcement_sent_at INTEGER,
  created_by INTEGER NOT NULL REFERENCES member(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX salon_status_start ON salon(status, starts_at);

CREATE TABLE salon_rsvp (
  salon_id INTEGER NOT NULL REFERENCES salon(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('in', 'not_this_time')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (salon_id, member_id)
);

CREATE INDEX salon_rsvp_status ON salon_rsvp(salon_id, status);
