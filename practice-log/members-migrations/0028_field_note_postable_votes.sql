-- Members may quietly mark a Field Note as suitable for sharing beyond the Club.
-- Votes are deliberately private; only the aggregate is returned to host tools.

CREATE TABLE field_note_postable_vote (
  field_note_id INTEGER NOT NULL REFERENCES field_note(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (field_note_id, member_id)
);

CREATE INDEX field_note_postable_vote_note
  ON field_note_postable_vote(field_note_id, created_at);
