-- Host-authored Field Notes use the same quiet postable signal as member notes.
-- Field Reports are deliberately excluded in the application layer.

CREATE TABLE host_field_post_postable_vote (
  host_field_post_id INTEGER NOT NULL REFERENCES host_field_post(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (host_field_post_id, member_id)
);

CREATE INDEX host_field_post_postable_vote_post
  ON host_field_post_postable_vote(host_field_post_id, created_at);
