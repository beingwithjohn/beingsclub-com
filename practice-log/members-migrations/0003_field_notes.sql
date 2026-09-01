-- Field Notes belong to a Salon. John opens the invitation only for people
-- who attended; the invitation then remains until they share or dismiss it.

CREATE TABLE salon_attendance (
  salon_id INTEGER NOT NULL REFERENCES salon(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  marked_by INTEGER NOT NULL REFERENCES member(id),
  prompted_at INTEGER NOT NULL,
  email_sent_at INTEGER,
  dismissed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (salon_id, member_id)
);

CREATE INDEX salon_attendance_member ON salon_attendance(member_id, prompted_at);

CREATE TABLE field_note (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salon_id INTEGER NOT NULL REFERENCES salon(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  body TEXT,
  link_url TEXT,
  image_key TEXT,
  image_type TEXT,
  image_alt TEXT,
  is_anonymous INTEGER NOT NULL DEFAULT 0 CHECK (is_anonymous IN (0, 1)),
  published_at INTEGER NOT NULL,
  edited_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (salon_id, member_id)
);

CREATE INDEX field_note_salon_time ON field_note(salon_id, published_at);
