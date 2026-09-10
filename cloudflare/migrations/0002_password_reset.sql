ALTER TABLE accounts ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE password_resets (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  auth_version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE auth_rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
