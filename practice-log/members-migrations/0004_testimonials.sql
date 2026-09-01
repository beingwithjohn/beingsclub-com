-- A quiet, discoverable offering on the member Giving page. There are no
-- emails or notifications: members may offer one testimonial per Club month.

CREATE TABLE member_testimonial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  attribution_name TEXT NOT NULL,
  body TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'used', 'passed', 'withdrawn')),
  submitted_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by INTEGER REFERENCES member(id),
  UNIQUE (member_id, month_key)
);

CREATE INDEX member_testimonial_queue
  ON member_testimonial(status, submitted_at);
