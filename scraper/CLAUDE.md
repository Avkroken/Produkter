# scraper/ — Claude Code Guide

The part of product-describer that produces the product data. Repo-wide rules
live in the root `CLAUDE.md`; this document covers `scraper/` and every path
below is relative to it.

A web scraper with a REST API and web UI. Scrapes product data and exposes it for consumption by the describer (the root Python app and `cloudflare/`).

## Tech Stack

- Python 3, Flask + FastAPI, Gunicorn / Uvicorn
- Playwright (headless browser scraping)
- PostgreSQL (via psycopg2)
- Docker / Supervisor

## Dev Commands

```bash
pip install -r requirements.txt
playwright install chromium

# Start API server
uvicorn api.api:app --reload

# Start web UI
flask --app webui.app run
```

## Docker

```bash
docker compose up -d
```

## Project Structure

```
scraper/        # Scraper modules
api/            # FastAPI REST API
webui/          # Flask web UI
alerts/         # Alert logic
entrypoint.sh   # Sets secure permissions, starts supervisord
supervisord.conf
```

## Conventions

- `entrypoint.sh` sets restrictive permissions on the credentials directory at every startup
- All secrets (DB credentials, API keys) via environment variables
- Never store credentials in the image or commit them
- `set -euo pipefail` at the top of all shell scripts
- Unexpected exceptions in api/webui/scraper/alerts call
  `report_error_to_github()` — best-effort, opens a `@claude`-tagged GitHub
  issue with secrets/emails/paths redacted if `GITHUB_ERROR_REPORT_TOKEN` is
  set, no-ops otherwise. It lives in a single `github_report.py` at the image
  root; supervisord starts each process from a different directory, so the
  Dockerfile sets `PYTHONPATH=/app` to make the shared module importable
  rather than keeping a copy beside every entrypoint