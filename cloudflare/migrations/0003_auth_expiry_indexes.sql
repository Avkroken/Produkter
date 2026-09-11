CREATE INDEX IF NOT EXISTS password_resets_expires_at ON password_resets(expires_at);
CREATE INDEX IF NOT EXISTS auth_rate_limits_expires_at ON auth_rate_limits(expires_at);
