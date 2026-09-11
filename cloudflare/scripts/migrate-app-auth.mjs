// Additive, repeatable preparation for both old and freshly initialized databases.
export async function ensureAuthSchema(query) {
  const columns = await query("PRAGMA table_info(accounts)");
  if (!columns.length) throw new Error("Kontotabellen saknas. Avbryter publiceringen.");
  if (!columns.some(column => column.name === "auth_version")) {
    await query("ALTER TABLE accounts ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0");
  }
  await query(`CREATE TABLE IF NOT EXISTS password_resets (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, auth_version INTEGER NOT NULL, expires_at INTEGER NOT NULL
  ); CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS password_resets_expires_at ON password_resets(expires_at);
  CREATE INDEX IF NOT EXISTS auth_rate_limits_expires_at ON auth_rate_limits(expires_at);`);
}
