# Projektkontext

**Senast verifierad:** 2026-09-23

## Ansvar

Produkter består av ett Cloudflare-baserat control/state plane och en separat browser-renderingsyta.

Cloudflare äger canonical application state, köer och API. Browser rendering är medvetet flyttad till en stateless extern Playwright-fetcher för att hålla Browser Run utanför Produkters produktionstopologi.

## Runtime

### App

`cloudflare/app/wrangler.jsonc`:

- Worker: `produkter`
- entrypoint: `src/access-worker.ts`
- domain: `produkter.denied.se`
- static assets: `public/`
- Service Binding: `ENGINE -> produkter-motor`
- D1: `DB -> produkter`
- R2: `UPLOADS -> produkter-uppladdningar`
- KV: `SESSIONS`
- Queue producer: `JOB_QUEUE -> produkter-jobb`

### Engine

`cloudflare/engine/wrangler.jsonc`:

- Worker: `produkter-motor`
- entrypoint: `src/worker.ts`
- domain: `motor.denied.se`
- D1: `produkter`
- Workers AI binding: `AI`
- cron: var femte minut
- ingen Browser binding

### Processor

`cloudflare/processor/wrangler.jsonc`:

- Worker: `produkter-bearbetare`
- D1: `produkter`
- R2: `produkter-uppladdningar`
- consumer + producer på `produkter-jobb`
- consumer concurrency är begränsad i Wrangler-konfigurationen

### Extern fetcher

`scraper/fetcher/fetcher.py` är en stateless Playwright-worker. Den:

1. leasar jobb från engine via `POST /jobs/lease`,
2. renderar `list`- eller `detail`-jobb lokalt,
3. postar resultat till `POST /jobs/:id/result`.

Den behöver `ENGINE_URL` och befintlig `INGEST_API_KEY`. Den exponerar ingen inbound application port och håller ingen canonical state.

## State- och failuremodell

D1 är canonical durable state. Förlorad extern renderhost pausar rendering, men lease-expiry gör att engine kan återvinna jobb när fetchern återkommer.

R2 används för uploads/objekt; KV för sessionsstate. Queue separerar producers från bearbetning.

## Free-first invariant

Cloudflare Browser Run ska inte återintroduceras i Produkter utan ett separat arkitekturbeslut. Lägg inte till Wrangler `browser` binding eller Browser Run `/crawl`-anrop i engine som lokal bekvämlighetsfix.

Jobb är Avkroken-workloaden som behåller Browser Run.

## Observability

Samtliga tre Workers har Cloudflare observability aktiverat med begränsad sampling och query-string-redaction. Persistenta logs/traces ska fortsatt följa central Cloudflare free-first-policy.

## CI

Produkter omfattas av centrala Node-, Cloudflare-, Python- och Docker-profiler enligt Avkrokens engineering-context. Repo-lokal post-merge/scheduled container scanning kan fortsätta där den har annan trigger/roll än central PR-gating.

## Uppdateringskontrakt

Uppdatera dokumentationen när Worker-topologi, bindings, kökontrakt, D1/R2/KV-ansvar, fetcher-kontrakt eller Browser Run-gräns ändras.
