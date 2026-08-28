# Scraper on Cloudflare Containers

This Worker runs the existing `scraper/` image as one Cloudflare Container instance.

## Before first deploy

The scraper still uses PostgreSQL. Point `DB_HOST` at a PostgreSQL endpoint that remains available when the old server is offline, then set the required Worker secrets:

```bash
npx wrangler secret put DB_HOST
npx wrangler secret put DB_PASSWORD
npx wrangler secret put API_KEY
```

Optional error reporting:

```bash
npx wrangler secret put GITHUB_ERROR_REPORT_TOKEN
```

`DB_NAME=scraper`, `DB_USER=scraper`, and `TZ=Europe/Stockholm` are non-secret vars in `wrangler.jsonc`.

## Deploy

Docker must be running because Wrangler builds `../../scraper/Dockerfile` and uploads the image during deployment.

```bash
npm install
docker info
npx wrangler deploy
```

The Worker routes normal requests to the FastAPI service on port `8765`. Requests below `/ui` are forwarded to the WebUI on port `3000`, with the `/ui` prefix removed before forwarding.

A five-minute Cron Trigger sends `/health` to the singleton `primary` instance. The scraper itself is a long-running Supervisor process, so this keeps the container active even when nobody calls its HTTP API.

## Cutover

Do not stop the old scraper/PostgreSQL deployment until:

1. the PostgreSQL data has been moved to a managed/reachable PostgreSQL service;
2. `/health` through the Worker reports a connected database;
3. authenticated `/products` requests work with the configured `API_KEY`;
4. scraper logs show successful Playwright runs; and
5. the consumer has been switched to the new Worker URL.
