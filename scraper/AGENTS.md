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

- `entrypoint.sh` sets restrictive permissions on the scraper credentials directory at every startup.
- Do not bake scraper credentials into the container image.
- Bash-skript ska använda `set -euo pipefail`. POSIX `sh`-skript ska i stället använda de felhanteringsflaggor som faktiskt stöds av den deklarerade shellen; lägg inte till `pipefail` i ett `#!/bin/sh`-skript utan att först verifiera att runtime-shellen stöder det.
- Unexpected exceptions in api/webui/scraper/alerts use the repository's existing `report_error_to_github()` mechanism best-effort when `GITHUB_ERROR_REPORT_TOKEN` is configured. Preserve the implementation's existing redaction behavior and verify that behavior before changing what data is reported.
