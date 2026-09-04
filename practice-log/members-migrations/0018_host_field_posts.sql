-- Hosts can place announcements and their own Field Notes above the
-- Salon-grouped member archive. These posts are independent of a Salon and
-- remain visible until a host deliberately removes them.

CREATE TABLE host_field_post (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  salon_id INTEGER REFERENCES salon(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('announcement', 'field_note')),
  title TEXT,
  body TEXT,
  link_url TEXT,
  image_key TEXT,
  image_type TEXT,
  image_alt TEXT,
  published_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX host_field_post_published ON host_field_post(published_at DESC, id DESC);
CREATE INDEX host_field_post_salon ON host_field_post(salon_id);
