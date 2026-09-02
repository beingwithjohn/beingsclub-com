-- A granted prospective member receives a one-use private entrance in the
-- welcome email. Only the token hash is stored; opening the email link itself
-- remains a read-only static GET, and the member app exchanges it by POST.

CREATE TABLE member_welcome_link (
  token_hash TEXT PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX member_welcome_link_member ON member_welcome_link(member_id);
CREATE INDEX member_welcome_link_expiry ON member_welcome_link(expires_at);
