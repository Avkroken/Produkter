# External render fetcher

The Products control plane remains on Cloudflare. Browser rendering does not.

`fetcher.py` is the stateless Playwright worker for render jobs. It can run on
mp100 or any other Linux host with outbound HTTPS and Chromium support.

## Contract

The fetcher only needs:

- `ENGINE_URL` — the public engine endpoint, currently `https://motor.denied.se`
- `INGEST_API_KEY` — the existing operator secret used as `X-API-Key`
- optional concurrency/timing environment variables already documented in `fetcher.py`

It then loops:

1. `POST /jobs/lease`
2. render the leased `list` or `detail` job locally with Playwright
3. `POST /jobs/:id/result`

All durable data remains in Cloudflare D1. The render host keeps no canonical
state and exposes no inbound application port. Losing the host pauses rendering;
expired leases are recovered by the engine and can be picked up after the
fetcher returns.

## Free-first boundary

Cloudflare Browser Run is intentionally not part of the Products production
topology. Do not add a Wrangler `browser` binding or call the Browser Run
`/crawl` API from the engine.

Jobb is the Avkroken workload that retains Cloudflare Browser Run.

## Operations

Provision `ENGINE_URL` and `INGEST_API_KEY` outside the repository. Never
commit their values. Run the fetcher under the host's normal supervised service
mechanism and restart it on failure/reboot.

Before switching a production host, verify:

- `GET /health` on the engine succeeds from the host
- a lease can be obtained with the configured credential
- one test render result is accepted by the engine
- the old render process is stopped before increasing concurrency on the new host
