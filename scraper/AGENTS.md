# Scraper-specifika agentinstruktioner

Repositoryövergripande policy finns i `/AGENTS.md` och gäller även här. Den här filen lägger endast till instruktioner för `scraper/`; alla paths nedan är relativa till den katalogen.

En web scraper med REST API och web UI. Scrapar produktdata och exponerar den för describer-kedjan i root-appen och `cloudflare/`.

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

```text
scraper/        # Scraper modules
api/            # FastAPI REST API
webui/          # Flask web UI
alerts/         # Alert logic
entrypoint.sh   # Sets secure permissions, starts supervisord
supervisord.conf
```

## Conventions

- `entrypoint.sh` sets restrictive permissions on the credentials directory at every startup.
- All secrets (DB credentials, API keys) come from environment variables.
- Never store credentials in the image or commit them.
- Use `set -euo pipefail` at the top of shell scripts.
- Unexpected exceptions in api/webui/scraper/alerts call `report_error_to_github()` best-effort when `GITHUB_ERROR_REPORT_TOKEN` is configured; secrets, emails and paths must be redacted. The shared module lives as one `github_report.py` at image root and the Dockerfile sets `PYTHONPATH=/app` so supervisord processes can import it.
