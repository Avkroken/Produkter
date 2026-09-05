# REPO.md

This is the repository governance document for `Avkroken/Produkter`. Binding AI coding-agent policy is defined only in `Avkroken/.github/AGENTS.md`. This document records repository-specific technical contracts, invariants, validation requirements, and operational context required by that policy; it must not define, supplement, narrow, or override agent policy.

## Repository

The repository contains three parts of the same product:

- repository root: Python/Flask, provider failover and file processing;
- `cloudflare/`: Workers packages `app`, `engine` and `processor`;
- `scraper/`: Python/Playwright product-data collection.

Account-scoped data must preserve `account_id` isolation. Credentials, provider keys and other secrets must never be hardcoded or committed.

## GitHub Actions and Cloudflare

- `.github/workflows/ci.yml` owns the `CI / required` context and verifies the Python code plus all three Worker packages.
- Node CI must type-check each Worker, run Wrangler dry-run validation and test the shared production verifier.
- `.github/workflows/docker.yml` owns the `docker` context, builds both images and runs Trivy.
- `.github/workflows/dependency-review.yml` owns the `dependency-review` context.
- CodeQL is provided through GitHub Code Scanning/default setup; verify its live ruleset integration when changing security configuration.
- Cloudflare Workers Builds owns normal production deployment from `main`; GitHub Actions must not duplicate the production control plane.
- Each production Worker uses its own Workers Builds production trigger with branch `main`, its Worker root as root directory, an empty build command and non-production branch builds disabled.
- `cloudflare/app`: deploy command `npm run deploy && npm run verify:production`.
- `cloudflare/engine`: deploy command `npm run deploy && npm run verify:production`.
- `cloudflare/processor`: deploy command `npm run deploy`; do not add an artificial public health route solely for deployment verification.
- `deploy` in all three Worker packages is direct `wrangler deploy --strict`.
- `cloudflare/scripts/verify-production.mjs` may verify only real public application surfaces: the app's main domain and the engine's `/health` endpoint. It must not deploy Workers or interpret Workers Builds metadata.
- `wrangler.jsonc` is the source of truth for Worker bindings, routes, cron and other versioned Worker configuration.
- Build watch paths are `cloudflare/app/**`, `cloudflare/shared/**` and the app verifier for app; `cloudflare/engine/**`, `cloudflare/shared/**` and the engine verifier for engine; and `cloudflare/processor/**` plus `cloudflare/shared/**` for processor.
- D1 database `produkter` is shared by multiple Workers. The repository currently has no canonical Wrangler `migrations/` chain, so separate Workers Builds must not independently apply `cloudflare/infra/*.sql`. Establish one unambiguous migration owner and an idempotent migration chain before adding production schema migration to deploys.

Pin third-party GitHub Actions to full commit SHAs when used.

## `scraper/`

The scraper collects product data and exposes it to the describer chain used by the root application and `cloudflare/`.

### Tech stack

- Python 3
- Flask and FastAPI
- Gunicorn / Uvicorn
- Playwright with headless Chromium
- PostgreSQL through `psycopg2`
- Docker / Supervisor

### Development commands

```bash
pip install -r requirements.txt
playwright install chromium
uvicorn api.api:app --reload
flask --app webui.app run
```

Docker development:

```bash
docker compose up -d
```

### Structure

```text
scraper/        # scraper modules
api/            # FastAPI REST API
webui/          # Flask web UI
alerts/         # alert logic
entrypoint.sh   # sets secure permissions, starts supervisord
supervisord.conf
```

### Scraper conventions

- `entrypoint.sh` sets restrictive permissions on the scraper credentials directory at every startup.
- Never bake scraper credentials into the container image.
- Preserve existing shell conventions unless the task requires a change. Existing Bash entrypoints use `set -e`; do not globally tighten shell flags only for style. If error handling changes, flags must be supported by the declared runtime shell; do not use `pipefail` in `#!/bin/sh` without verified support.
- Unexpected exceptions in api/webui/scraper/alerts use the existing `report_error_to_github()` mechanism best-effort when `GITHUB_ERROR_REPORT_TOKEN` is configured. Preserve its existing redaction behavior and verify that behavior before changing reported data.
