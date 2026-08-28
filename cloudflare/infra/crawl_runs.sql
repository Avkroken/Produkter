-- Tillstånd för Cloudflare Browser Run /crawl.
-- Workern skapar samma tabell med CREATE TABLE IF NOT EXISTS vid körning så
-- en vanlig Worker-deploy inte är beroende av en separat migrationskörning.
CREATE TABLE IF NOT EXISTS crawl_runs (
  site_id INTEGER PRIMARY KEY,
  crawl_id TEXT NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'static',
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT
);
