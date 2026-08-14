# scraper — Claude Code Guide

A web scraper with a REST API and web UI. Scrapes product data and exposes it for consumption by other services (e.g. product-describer).

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
  `report_error_to_github()` (`github_report.py`, copied into each
  process's own working directory since supervisord runs each from a
  different one) — best-effort, opens a `@claude`-tagged GitHub issue with
  secrets/emails/paths redacted if `GITHUB_ERROR_REPORT_TOKEN` is set,
  no-ops otherwise